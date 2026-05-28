import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ensureBulkStock, fifoConsume, isOversellAllowed } from "@/lib/inventory/fifo";
import { learnDiagnosisPartSet } from "@/lib/repair-diagnosis-usage";
import { calcRepairTotals } from "@/lib/repair";
import { rebalanceCustomerLedger } from "@/lib/customer-ledger";

type Action = "order" | "quotation" | "statement";

interface CheckoutItem {
  productId?: string;      // 상품 항목만 있음, 서비스 항목(수리/임대/기술료)은 없음
  /** 카트 라인 종류 — "repair" 만 RepairTicket 으로 처리. "service"(기술료) 는 일반 OrderItem 서비스 라인. */
  itemType?: "product" | "repair" | "rental" | "service";
  quantity: number;
  unitPrice: number;       // 할인 전 단가(세전) — 메인 base 가격, optionValueIds addPrice 미포함
  /**
   * 정가(상품 마스터 listPrice, 세전) — null 이면 unitPrice 와 동일로 간주.
   * unitPrice 가 가격 다이얼로그로 깎였더라도 정가는 보존돼야 통합 판매내역 상세에서 정가/할인 비교가 표시됨.
   */
  listPrice?: number | null;
  discountPerUnit: number; // 개당 할인액 (세전)
  name: string;
  sku?: string;
  taxType?: string;
  isZeroRate?: boolean;
  /**
   * 고객이 선택한 ProductOptionValue ID들. mappedProductId 가 있는 옵션값은 OPTION_REF 자식 라인으로 자동 분리.
   * 그 외 (단순 텍스트 / mappedVariantId) 는 메인 라인 unitPrice 에 addPrice 가산 + optionSnapshot 보존.
   * mappedVariantId 는 Phase 3 (자동 Assembly) — 현재는 단순 텍스트 와 동일하게 처리.
   */
  optionValueIds?: string[];
  /**
   * 진입 경로 SKU — 자사몰/외부 채널만 사용. POS 는 직원 입력이라 null 권장.
   * SWAP 옵션 적용으로 productId 가 swap 된 후에도 손님이 본 카탈로그 SKU 보존용.
   * checkout API 가 받으면 OrderItem.entryProductId 에 그대로 저장.
   */
  entryProductId?: string | null;
  /** 카트 라인 ID (cartItemId) — ADDON 자식의 parentCartItemId 매칭용. 서버는 stagedItem index 매핑에만 사용 */
  cartItemId?: string;
  /** ADDON 자식 라인 — true 면 lineRole=ADDON, parentItemId=메인 으로 OrderItem 생성 (BundleProduct 추천 결과) */
  isAddon?: boolean;
  /** 메인 카트 라인의 cartItemId — ADDON 만 의미 있음. 서버가 stagedItem index 매핑 */
  parentCartItemId?: string;
  /** 수리 라인 — 라인별 매핑된 RepairTicket id. 라인별로 ticket finalize 분기. */
  repairTicketId?: string | null;
  /** 서비스로 지급 — true 면 OrderItem.isService=true 저장. 영수증/명세표에서 배지 노출. */
  isService?: boolean;
}

interface RepairTicketData {
  symptom?: string;
  deviceBrand?: string;
  deviceModel?: string;
  serialItemId?: string | null;
  labors: { name: string; unitRate: number }[];
}

interface RentalRecord {
  assetId: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  unitRate: number;
  rentalAmount: number;
  depositAmount?: number;
  /** ISO timestamp — 카트에서 임대 추가한 순간 (시간대별 임대 분석용). 없으면 서버 now() */
  checkoutAt?: string;
}

interface CheckoutBody {
  action: Action;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  paymentMethod?: "CASH" | "CASH_RECEIPT" | "CARD" | "TRANSFER" | "MIXED" | "UNPAID" | null;
  /**
   * 부분 결제 — 즉시 결제 금액 (VAT 포함, 정수). null 또는 totalAmount 와 같으면 전액 결제.
   * 0 < paidAmount < totalAmount 면 PARTIAL_PAID + 잔금 customerLedger SALE.
   * UNPAID 결제 또는 미지정 결제일 땐 무시됨.
   */
  paidAmount?: number | null;
  /** 부분 결제 구분 — DEPOSIT(계약금) / PARTIAL(부분결제). 영수증 라벨 분기용 */
  partialPaymentKind?: "DEPOSIT" | "PARTIAL" | null;
  taxInvoiceRequested?: boolean;
  memo?: string | null;
  items: CheckoutItem[];
  /** DEPRECATED — 라인별 item.repairTicketId 로 이관. 호환 위해 read 만 허용 (안 받음) */
  rentalId?: string | null;
  repairTicketData?: RepairTicketData | null;
  rentalRecords?: RentalRecord[] | null;
  /** 결제 직전 발번된 SerialItem 코드들 — 서버에서 OrderItem 과 매칭해 orderItemId 연결 */
  labelCodes?: string[];
  /**
   * 출고 방식 — POS 결제 시 매장즉시판매/픽업대기/배달/택배 선택.
   * 미지정 시 IN_STORE (매장 즉시 인도, 즉시 종결).
   * PICKUP/DELIVERY/SHIPPING 은 ERP 워크보드로 진입.
   */
  fulfillmentType?: "IN_STORE" | "PICKUP" | "DELIVERY" | "QUICK" | "SHIPPING";
  /** DELIVERY/SHIPPING 일 때 받는 사람·연락처·주소 (받는사람 이름은 customerName 재활용) */
  shippingRecipientName?: string | null;
  shippingRecipientPhone?: string | null;
  shippingAddress?: string | null;
  /** 출고 예정일 (YYYY-MM-DD). 미지정 시 주문일 + 1 영업일 자동 계산 */
  expectedShipDate?: string | null;
  /**
   * 배송비 결제 방식 — PREPAID(선불)/COD(착불)/STORE_BURDEN(매장 부담).
   * IN_STORE/PICKUP fulfillmentType 은 의미 없음 (default PREPAID 두되 무시).
   */
  shippingPaymentType?: "PREPAID" | "COD" | "STORE_BURDEN";
  /** 배송 원가(매장 지불) — 우리가 낸 퀵비·택배비. 마진에서만 차감, 손님 청구 무관 */
  shippingCostBorne?: number;
}

function genNo(prefix: string) {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const r = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${y}${m}${d}-${r}`;
}

// 오프라인 매출은 channelId IS NULL 로 표현 (베이스라인). 별도 SalesChannel row 불필요.

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const body = (await request.json()) as CheckoutBody;
  if (!body.action || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "action과 items는 필수입니다" }, { status: 400 });
  }

  // 옵션값 일괄 조회 — 처리 모드별 분기:
  //   mappedMode=SWAP: 메인 라인의 productId/이름/단가를 mappedProduct 로 교체. 옵션 1개당 1회만 적용 가능.
  //   mappedMode=ADDON: OPTION_REF 자식 라인 추가 (메인 + 별도 OrderItem)
  //   mappedProductId 없음: 단순 텍스트 — 메인 라인 unitPrice 에 addPrice 가산 + optionSnapshot 보존
  const allOptionValueIds = Array.from(
    new Set(body.items.flatMap((i) => i.optionValueIds ?? [])),
  );
  const optionValues = allOptionValueIds.length
    ? await prisma.productOptionValue.findMany({
        where: { id: { in: allOptionValueIds } },
        include: {
          option: { select: { name: true } },
          mappedProduct: {
            select: { id: true, name: true, sku: true, taxType: true, sellingPrice: true },
          },
        },
      })
    : [];
  const optionValueMap = new Map(optionValues.map((v) => [v.id, v]));

  // 메인 + OPTION_REF + ADDON 자식 라인 평탄화. parentItemIndex 로 부모 link.
  type StagedItem = {
    productId: string | null;
    name: string;
    sku?: string;
    quantity: number;
    unitPrice: number;
    /** 정가(상품 마스터 listPrice) — null 이면 unitPrice 와 동일로 간주 */
    listPrice: number | null;
    discountPerUnit: number;
    netUnitPrice: number;
    lineSubtotal: number;
    taxType?: string;
    isZeroRate: boolean;
    lineRole: "MAIN" | "OPTION_REF" | "ADDON";
    parentItemIndex: number | null;
    optionSnapshot: Record<string, string> | null;
    entryProductId: string | null;
    isService: boolean;
  };

  const stagedItems: StagedItem[] = [];
  // 메인 라인의 cartItemId → stagedItems index 매핑 (ADDON 자식의 parentItemIndex 결정용)
  const cartItemIdToMainStagedIdx = new Map<string, number>();
  for (const it of body.items) {
    // ADDON 자식 라인 — 단독 상품, 옵션 처리 없음. parentItemIndex 로 메인 link.
    if (it.isAddon) {
      const parentIdx = it.parentCartItemId
        ? cartItemIdToMainStagedIdx.get(it.parentCartItemId)
        : undefined;
      const addonNet = Math.max(0, it.unitPrice - (it.discountPerUnit ?? 0));
      stagedItems.push({
        productId: it.productId ?? null,
        name: it.name,
        sku: it.sku,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        listPrice: it.listPrice ?? null,
        discountPerUnit: it.discountPerUnit ?? 0,
        netUnitPrice: addonNet,
        lineSubtotal: addonNet * it.quantity,
        taxType: it.taxType,
        isZeroRate: it.isZeroRate ?? false,
        lineRole: "ADDON",
        parentItemIndex: parentIdx ?? null,
        optionSnapshot: null,
        entryProductId: null, // ADDON 도 funnel 분석 대상 아님 (메인의 부산물)
        isService: !!it.isService,
      });
      continue;
    }

    let nonMappedAdd = 0;
    const snapshot: Record<string, string> = {};
    const refs: Array<{
      productId: string;
      name: string;
      sku?: string;
      taxType?: string;
      addPrice: number;
    }> = [];
    // SWAP 적용 — 한 라인에 SWAP 옵션값 여러 개면 마지막이 우선 (보통 슬롯 1개당 1선택이라 1회만)
    let swap: {
      productId: string;
      name: string;
      sku?: string;
      taxType?: string;
      sellingPrice: number;
    } | null = null;
    for (const optId of it.optionValueIds ?? []) {
      const ov = optionValueMap.get(optId);
      if (!ov) continue;
      snapshot[ov.option.name] = ov.label;
      if (ov.mappedProductId && ov.mappedProduct) {
        if (ov.mappedMode === "SWAP") {
          swap = {
            productId: ov.mappedProduct.id,
            name: ov.mappedProduct.name,
            sku: ov.mappedProduct.sku,
            taxType: ov.mappedProduct.taxType ?? "TAXABLE",
            sellingPrice: Number(ov.mappedProduct.sellingPrice ?? 0),
          };
        } else {
          // ADDON — 별도 자식 라인
          const refUnit =
            Number(ov.addPrice) > 0
              ? Number(ov.addPrice)
              : Number(ov.mappedProduct.sellingPrice ?? 0);
          refs.push({
            productId: ov.mappedProduct.id,
            name: ov.mappedProduct.name,
            sku: ov.mappedProduct.sku,
            taxType: ov.mappedProduct.taxType ?? "TAXABLE",
            addPrice: refUnit,
          });
        }
      } else {
        // 단순 텍스트 / mappedVariantId — 메인 라인 가산
        nonMappedAdd += Number(ov.addPrice) || 0;
      }
    }

    // SWAP 적용 시 메인 productId/이름/sku/세금/단가 모두 swap 된 SKU 기준
    // base 단가 결정: swap 됐으면 swap 의 sellingPrice (클라이언트 unitPrice 무시 — placeholder 일 수 있음).
    //   단, 클라이언트가 sellingPrice 아닌 다른 가격(할인 등)을 명시했으면 그대로 존중하기 위해
    //   클라이언트 unitPrice 가 0 이거나 swap 의 sellingPrice 와 다르지 않으면 swap 가격 채택.
    const mainProductId = swap ? swap.productId : (it.productId ?? null);
    const mainName = swap ? swap.name : it.name;
    const mainSku = swap ? swap.sku : it.sku;
    const mainTaxType = swap ? swap.taxType : it.taxType;
    const baseUnit = swap
      ? (it.unitPrice > 0 ? it.unitPrice : swap.sellingPrice)
      : it.unitPrice;
    const mainBase = baseUnit + nonMappedAdd;
    const mainNet = Math.max(0, mainBase - (it.discountPerUnit ?? 0));
    const mainIdx = stagedItems.length;
    // ADDON 자식이 이 메인을 parentCartItemId 로 가리킬 수 있게 매핑 보존
    if (it.cartItemId) cartItemIdToMainStagedIdx.set(it.cartItemId, mainIdx);
    stagedItems.push({
      productId: mainProductId,
      name: mainName,
      sku: mainSku,
      quantity: it.quantity,
      unitPrice: mainBase,
      listPrice: it.listPrice ?? null,
      discountPerUnit: it.discountPerUnit ?? 0,
      netUnitPrice: mainNet,
      lineSubtotal: mainNet * it.quantity,
      taxType: mainTaxType,
      isZeroRate: it.isZeroRate ?? false,
      lineRole: "MAIN",
      parentItemIndex: null,
      optionSnapshot: Object.keys(snapshot).length > 0 ? snapshot : null,
      // POS 결제는 직원 입력이라 entryProductId 항상 null. 자사몰/채널 import 시에만 채움.
      entryProductId: it.entryProductId ?? null,
      isService: !!it.isService,
    });
    for (const ref of refs) {
      stagedItems.push({
        productId: ref.productId,
        name: ref.name,
        sku: ref.sku,
        quantity: it.quantity,
        unitPrice: ref.addPrice,
        listPrice: null,
        discountPerUnit: 0,
        netUnitPrice: ref.addPrice,
        lineSubtotal: ref.addPrice * it.quantity,
        taxType: ref.taxType,
        isZeroRate: false,
        lineRole: "OPTION_REF",
        parentItemIndex: mainIdx,
        optionSnapshot: null,
        entryProductId: null, // OPTION_REF 자식 라인은 funnel 분석 대상 아님
        isService: false, // OPTION_REF 는 메인의 옵션 추가구매 — 별도 서비스 분류 안 함
      });
    }
  }

  const subtotal = stagedItems.reduce((s, i) => s + i.lineSubtotal, 0);
  const taxableSubtotal = stagedItems
    .filter((i) => !(i.isZeroRate || i.taxType === "TAX_FREE"))
    .reduce((s, i) => s + i.lineSubtotal, 0);
  const taxAmount = Math.round(taxableSubtotal * 0.1);
  const totalAmount = subtotal + taxAmount;

  // 부분 결제 (PARTIAL_PAID) 판정 — paidAmount 입력 + 0 < paidAmount < totalAmount
  //   UNPAID 결제는 전액 외상이라 paidAmount 무시
  const isUnpaid = !body.paymentMethod || body.paymentMethod === "UNPAID";
  const paidAmountInput =
    typeof body.paidAmount === "number" && body.paidAmount > 0
      ? Math.max(0, Math.round(body.paidAmount))
      : null;
  const isPartialPaid =
    !isUnpaid &&
    paidAmountInput !== null &&
    paidAmountInput > 0 &&
    paidAmountInput < totalAmount;
  // 외상 잔금 = UNPAID(전액) 또는 PARTIAL_PAID(부분) — customerLedger SALE 등록 대상
  const outstandingAmount = isUnpaid
    ? totalAmount
    : isPartialPaid
      ? totalAmount - paidAmountInput!
      : 0;
  const partialPaymentKind: "DEPOSIT" | "PARTIAL" | null = isPartialPaid
    ? body.partialPaymentKind ?? "PARTIAL"
    : null;

  if (body.action === "quotation") {
    const q = await prisma.quotation.create({
      data: {
        quotationNo: genNo("QUO"),
        type: "SALES",
        status: "DRAFT",
        issueDate: new Date(),
        customerId: body.customerId || null,
        subtotalAmount: subtotal,
        taxAmount,
        totalAmount,
        memo: body.memo || null,
        createdById: user.id,
        items: {
          create: stagedItems.map((it, idx) => ({
            productId: it.productId,
            name: it.name,
            quantity: it.quantity,
            listPrice: it.unitPrice,
            discountAmount: it.discountPerUnit,
            unitPrice: it.netUnitPrice,
            totalPrice: it.lineSubtotal,
            sortOrder: idx,
          })),
        },
      },
    });
    return NextResponse.json({ kind: "quotation", id: q.id, no: q.quotationNo }, { status: 201 });
  }

  if (body.action === "statement") {
    const customer = body.customerId
      ? await prisma.customer.findUnique({ where: { id: body.customerId } })
      : null;
    const s = await prisma.statement.create({
      data: {
        statementNo: genNo("STM"),
        status: "ISSUED",
        issueDate: new Date(),
        customerId: body.customerId || null,
        customerNameSnapshot: customer?.name ?? body.customerName ?? null,
        customerPhoneSnapshot: customer?.phone ?? body.customerPhone ?? null,
        customerAddressSnapshot: customer?.address ?? null,
        customerBusinessNumberSnapshot: customer?.businessNumber ?? null,
        subtotalAmount: subtotal,
        taxAmount,
        totalAmount,
        memo: body.memo || null,
        createdById: user.id,
        items: {
          create: stagedItems.map((it, idx) => ({
            productId: it.productId,
            name: it.name,
            quantity: it.quantity,
            listPrice: it.unitPrice,
            discountAmount: it.discountPerUnit,
            unitPrice: it.netUnitPrice,
            totalPrice: it.lineSubtotal,
            sortOrder: idx,
          })),
        },
      },
    });
    return NextResponse.json({ kind: "statement", id: s.id, no: s.statementNo }, { status: 201 });
  }

  // action === "order" — 주문 확정 + FIFO 소진 (오프라인 매출이라 channelId 는 null)
  // OPTION_REF 자식 라인의 productId 도 productMap 에 포함시켜야 FIFO 소진 가능.
  const productIds = Array.from(
    new Set(stagedItems.map((i) => i.productId).filter((id): id is string => !!id)),
  );
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: {
      setComponents: { include: { component: { select: { id: true, name: true } } } },
    },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  // 중복 픽업/반납 idempotency — 카트 안 각 수리 라인의 ticket 이 이미 non-CANCELLED Order 와
  // 연결돼 있으면 차단. 한 카트에 수리 여러 건 가능하므로 라인별로 검사.
  const cartRepairTicketIds = Array.from(
    new Set(
      body.items
        .filter((i) => i.itemType === "repair" && i.repairTicketId)
        .map((i) => i.repairTicketId as string),
    ),
  );
  if (cartRepairTicketIds.length > 0) {
    const existing = await prisma.repairTicket.findFirst({
      where: {
        id: { in: cartRepairTicketIds },
        orderId: { not: null },
        order: { status: { not: "CANCELLED" } },
      },
      select: {
        ticketNo: true,
        order: { select: { id: true, orderNo: true } },
      },
    });
    if (existing) {
      return NextResponse.json(
        {
          error: `이 수리는 이미 결제됐습니다 (${existing.order?.orderNo})`,
          existing: { ticketNo: existing.ticketNo, order: existing.order },
        },
        { status: 409 },
      );
    }
  }
  if (body.rentalId) {
    const existingOrder = await prisma.order.findFirst({
      where: {
        rentalId: body.rentalId,
        status: { not: "CANCELLED" },
      },
      select: { id: true, orderNo: true },
    });
    if (existingOrder) {
      return NextResponse.json(
        {
          error: `이 임대는 이미 결제됐습니다 (${existingOrder.orderNo})`,
          existing: existingOrder,
        },
        { status: 409 },
      );
    }
  }

  // 출고 방식 결정 — 임대만 IN_STORE 강제 (자산 인계가 매장 필수).
  // 수리는 사용자 선택 허용 (수리 완료된 기기를 배송으로 받는 케이스 종종 발생).
  const fulfillmentType:
    | "IN_STORE"
    | "PICKUP"
    | "DELIVERY"
    | "QUICK"
    | "SHIPPING" =
    body.rentalRecords && body.rentalRecords.length > 0
      ? "IN_STORE"
      : (body.fulfillmentType ?? "IN_STORE");

  // IN_STORE 만 즉시 종결(COMPLETED), 나머지(PICKUP/DELIVERY/SHIPPING)는 워크보드 진입(PREPARING)
  const orderStatus: "COMPLETED" | "PREPARING" =
    fulfillmentType === "IN_STORE" ? "COMPLETED" : "PREPARING";

  // 매장 인도(IN_STORE/PICKUP)는 배송정보 무관 — 주소·수령인 null
  const isInStore = fulfillmentType === "IN_STORE" || fulfillmentType === "PICKUP";

  // 출고 예정일 — 명시 없으면 주문일 + 1일 (배송/택배일 때만). 매장 인도는 null
  const expectedShipDate =
    isInStore
      ? null
      : body.expectedShipDate
        ? new Date(body.expectedShipDate)
        : (() => {
            const d = new Date();
            d.setDate(d.getDate() + 1);
            return d;
          })();

  const allowOversell = await isOversellAllowed();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const orderHeader = await tx.order.create({
        data: {
          orderNo: genNo("ORD"),
          channelId: null,
          status: orderStatus,
          fulfillmentType,
          expectedShipDate,
          customerId: body.customerId || null,
          // 등록 고객 스냅샷은 항상 등록 고객 정보로 보존 (받는 사람과 분리)
          customerName: body.customerName || null,
          customerPhone: body.customerPhone || null,
          // 받는 사람은 별도 컬럼. 미입력 시 등록 고객 정보를 fallback 으로 채움
          recipientName:
            isInStore
              ? null
              : body.shippingRecipientName || body.customerName || null,
          recipientPhone:
            isInStore
              ? null
              : body.shippingRecipientPhone || body.customerPhone || null,
          shippingAddress: body.shippingAddress || null,
          orderDate: new Date(),
          subtotalAmount: subtotal,
          discountAmount: 0,
          shippingFee: 0,
          shippingPaymentType: body.shippingPaymentType ?? "PREPAID",
          // 배송 원가(매장 지불) — 우리가 낸 퀵비·택배비. 마진에서만 차감.
          shippingCostBorne: body.shippingCostBorne ?? 0,
          taxAmount,
          totalAmount,
          commissionAmount: 0,
          paymentMethod: body.paymentMethod ?? null,
          // 결제 축 — UNPAID(외상) / PARTIAL_PAID(일부결제+잔금미수) / PAID(전액)
          paymentStatus: isUnpaid
            ? "UNPAID"
            : isPartialPaid
              ? "PARTIAL_PAID"
              : "PAID",
          // 부분 결제 메타 — 전액 결제 시 null (영수증 라벨 분기 안 함)
          paidAmount: isPartialPaid ? paidAmountInput : null,
          partialPaymentKind,
          taxInvoiceRequested: !!body.taxInvoiceRequested,
          memo: body.memo || null,
          // RepairTicket link 는 N:1 (RepairTicket.orderId) — finalize 블록에서 별도 update.
          rentalId: body.rentalId || null,
          createdById: user.id,
        },
      });

      // OrderItem 순차 생성 — parentItemIndex → parentItemId 매핑 보장 (옵션 OPTION_REF 트리)
      const createdIds: string[] = [];
      const createdItems: Array<{
        id: string;
        productId: string | null;
        quantity: number;
        lineRole: "MAIN" | "OPTION_REF" | "ADDON";
      }> = [];
      for (const stage of stagedItems) {
        const parentId =
          stage.parentItemIndex !== null ? createdIds[stage.parentItemIndex] : null;
        // listPrice 결정 — 카트가 보낸 상품 마스터 정가가 우선.
        // 없으면 mainBase(stage.unitPrice) 폴백 — 정가/할인 비교는 안 됨.
        // 가격 다이얼로그로 단가만 깎인 케이스를 정확히 표시하려면 카트 listPrice 가 핵심.
        const finalListPrice =
          stage.listPrice !== null && stage.listPrice > 0
            ? stage.listPrice
            : stage.unitPrice;
        // discountAmount = 정가 - 결제가 (per unit, 양수). 명시 할인이 없어도 단가가 정가보다 낮으면 차이를 할인으로 표기.
        const finalDiscountPerUnit = Math.max(0, finalListPrice - stage.netUnitPrice);
        const oi = await tx.orderItem.create({
          data: {
            orderId: orderHeader.id,
            productId: stage.productId,
            serviceName: stage.productId ? null : stage.name,
            quantity: stage.quantity,
            // 할인 추적 — listPrice(정가) + discountAmount(개당) + unitPrice(실제 결제가).
            // 통합 판매내역 상세에서 정가 취소선 + 할인 배지 표시에 사용.
            listPrice: finalListPrice,
            discountAmount: finalDiscountPerUnit,
            unitPrice: stage.netUnitPrice,
            totalPrice: stage.lineSubtotal,
            lineRole: stage.lineRole as never,
            parentItemId: parentId,
            optionSnapshot: stage.optionSnapshot ?? undefined,
            entryProductId: stage.entryProductId,
            isService: stage.isService,
          },
        });
        createdIds.push(oi.id);
        createdItems.push({
          id: oi.id,
          productId: oi.productId,
          quantity: Number(oi.quantity),
          lineRole: stage.lineRole,
        });
      }
      // 이후 로직(FIFO/labelCodes 매칭/RepairTicket 등)이 사용하는 order 객체 — 기존 구조 유지
      const order = { ...orderHeader, items: createdItems };

      // 공용 FIFO 헬퍼 위임 — 재고 부족 시 allowOversell 이면 적자 로트로 처리.
      const consumeForOrderItem = async (
        productId: string,
        orderItemId: string,
        qty: number,
        name: string,
      ) => {
        await ensureBulkStock(tx, productId, qty, name, allowOversell);
        const { consumptions, unitCostAvg } = await fifoConsume(
          tx,
          productId,
          qty,
          name,
          allowOversell,
        );
        if (consumptions.length > 0) {
          await tx.lotConsumption.createMany({
            data: consumptions.map((c) => ({
              orderItemId,
              lotId: c.lotId,
              quantity: c.quantity,
              unitCost: c.unitCost,
            })),
          });
        }
        return unitCostAvg;
      };

      for (const item of order.items) {
        // 서비스 항목(productId 없음)은 재고 소진 스킵
        if (!item.productId) continue;

        const product = productMap.get(item.productId)!;
        let unitCostSnapshot: number | null = null;

        if (product.isSet && product.setComponents.length > 0) {
          let setUnitCost = 0;
          for (const comp of product.setComponents) {
            const deductQty = Number(item.quantity) * Number(comp.quantity);
            const cuc = await consumeForOrderItem(comp.componentId, item.id, deductQty, `세트 ${comp.component.name}`);
            setUnitCost += cuc * Number(comp.quantity);
            const inv = await tx.inventory.update({
              where: { productId: comp.componentId },
              data: { quantity: { decrement: deductQty } },
            });
            await tx.inventoryMovement.create({
              data: {
                inventoryId: inv.id,
                type: "SET_CONSUME",
                quantity: deductQty,
                balanceAfter: inv.quantity,
                referenceId: order.id,
                referenceType: "ORDER",
                memo: `POS 주문 ${order.orderNo}`,
              },
            });
          }
          unitCostSnapshot = setUnitCost;
        } else {
          unitCostSnapshot = await consumeForOrderItem(product.id, item.id, Number(item.quantity), product.name);
          const inv = await tx.inventory.update({
            where: { productId: product.id },
            data: { quantity: { decrement: Number(item.quantity) } },
          });
          await tx.inventoryMovement.create({
            data: {
              inventoryId: inv.id,
              type: "OUTGOING",
              quantity: Number(item.quantity),
              balanceAfter: inv.quantity,
              referenceId: order.id,
              referenceType: "ORDER",
              memo: `POS 주문 ${order.orderNo}`,
            },
          });
        }

        await tx.orderItem.update({
          where: { id: item.id },
          data: { unitCostSnapshot },
        });
      }

      // 발번된 SerialItem 들을 OrderItem 과 매칭 — 결제 직전 발번된 라벨에 orderItemId 채움.
      // 같은 productId 의 SerialItem 들을 수량만큼 OrderItem 1개에 묶음 (단순화: 1 productId → 1 OrderItem).
      if (body.labelCodes && body.labelCodes.length > 0) {
        const serials = await tx.serialItem.findMany({
          where: { code: { in: body.labelCodes }, orderItemId: null },
          select: { id: true, productId: true },
        });
        const orderItemByProductId = new Map<string, string>();
        for (const oi of order.items) {
          if (oi.productId && !orderItemByProductId.has(oi.productId)) {
            orderItemByProductId.set(oi.productId, oi.id);
          }
        }
        const updates: Promise<unknown>[] = [];
        for (const s of serials) {
          if (!s.productId) continue; // 외부 기기 라벨 (수리) 은 OrderItem 매칭 대상 아님
          const orderItemId = orderItemByProductId.get(s.productId);
          if (!orderItemId) continue;
          updates.push(
            tx.serialItem.update({
              where: { id: s.id },
              data: {
                orderItemId,
                customerId: body.customerId ?? undefined,
              },
            }),
          );
        }
        if (updates.length > 0) await Promise.all(updates);
      }

      // 기존 RepairTicket 픽업/결제 — 카트에 수리 라인 N건이면 각자 ticket 별로 finalize.
      // 라인별 합계 = 그 ticket 의 finalAmount. 라인별 inferredDiscount = subtotal - 라인 net.
      // 분기:
      //  - IN_STORE: 결제 즉시 PICKED_UP + 보증 시작 (손님 손에 들어감)
      //  - PICKUP/DELIVERY/SHIPPING: READY 에 머무름 — 보증은 Order COMPLETED 시점부터 시작
      if (!body.repairTicketData) {
        // 라인 → ticket 그룹화 (한 ticket 에 여러 라인 있을 수 있음. 일반적으론 1:1)
        const linesByTicket = new Map<string, typeof body.items>();
        for (const it of body.items) {
          if (it.itemType !== "repair" || !it.repairTicketId) continue;
          const arr = linesByTicket.get(it.repairTicketId) ?? [];
          arr.push(it);
          linesByTicket.set(it.repairTicketId, arr);
        }

        for (const [ticketId, lines] of linesByTicket) {
          const existing = await tx.repairTicket.findUnique({
            where: { id: ticketId },
            select: {
              id: true,
              status: true,
              repairWarrantyMonths: true,
              customerId: true,
              ticketNo: true,
              diagnosisFee: true,
              parts: {
                select: {
                  totalPrice: true,
                  status: true,
                  billLost: true,
                },
              },
              labors: { select: { totalPrice: true } },
            },
          });
          if (
            !existing ||
            existing.status === "PICKED_UP" ||
            existing.status === "CANCELLED"
          ) {
            continue;
          }

          // 이 ticket 의 라인들 net 합 = 그 ticket 의 finalAmount
          const repairTotal = lines.reduce(
            (s, i) =>
              s +
              Math.max(0, i.unitPrice - (i.discountPerUnit || 0)) * i.quantity,
            0,
          );
          // 카트에서 가격을 깎아 결제한 경우 → 그 차액을 RepairTicket.totalDiscount 로 역기록.
          const ticketSubtotal = calcRepairTotals({
            parts: existing.parts.map((p) => ({
              totalPrice: p.totalPrice,
              status: p.status,
              billLost: p.billLost,
            })),
            labors: existing.labors.map((l) => ({ totalPrice: l.totalPrice })),
            diagnosisFee: existing.diagnosisFee,
            totalDiscount: "0",
          }).subtotal;
          const inferredDiscount = Math.max(0, ticketSubtotal - repairTotal);
          const customerPatch =
            existing.customerId == null && body.customerId
              ? { customerId: body.customerId }
              : {};

          if (fulfillmentType === "IN_STORE") {
            const pickupAt = new Date();
            const warrantyEnds =
              existing.repairWarrantyMonths != null &&
              existing.repairWarrantyMonths > 0
                ? new Date(
                    pickupAt.getFullYear(),
                    pickupAt.getMonth() + existing.repairWarrantyMonths,
                    pickupAt.getDate(),
                  )
                : null;
            await tx.repairTicket.update({
              where: { id: existing.id },
              data: {
                status: "PICKED_UP",
                pickedUpAt: pickupAt,
                finalAmount: repairTotal,
                totalDiscount: String(inferredDiscount),
                paymentMethod: body.paymentMethod ?? null,
                repairWarrantyEnds: warrantyEnds,
                orderId: orderHeader.id,
                ...customerPatch,
              },
            });
            // Phase 4 세트 학습 — IN_STORE 즉시 픽업
            await learnDiagnosisPartSet(tx, existing.id);
          } else {
            // 결제는 완료됐지만 매장에 기기 보관 / 배송 대기 — 보증은 인도 후 시작
            await tx.repairTicket.update({
              where: { id: existing.id },
              data: {
                // READY 미만 단계였다면 READY 로 끌어올림 (결제 = 수리 완료 가정)
                status: "READY",
                readyAt: new Date(),
                finalAmount: repairTotal,
                totalDiscount: String(inferredDiscount),
                paymentMethod: body.paymentMethod ?? null,
                orderId: orderHeader.id,
                ...customerPatch,
              },
            });
          }
        }
      }

      // RepairTicket 생성 (수리 항목 + 고객 있을 때) — POS는 즉시수리(ON_SITE)
      // 분기:
      //  - IN_STORE: 결제 즉시 PICKED_UP + 보증 시작
      //  - PICKUP/DELIVERY/SHIPPING: READY 까지만 진행 — 보증은 Order COMPLETED 시점에 시작
      if (body.repairTicketData && body.customerId) {
        const rd = body.repairTicketData;
        const symptomParts = [rd.deviceBrand, rd.deviceModel].filter(Boolean).join(" ");
        const symptomFull = [symptomParts, rd.symptom].filter(Boolean).join(" — ") || null;

        // 보증 기본값
        const company = await tx.companyInfo.findUnique({
          where: { id: "singleton" },
          select: { defaultRepairWarrantyMonths: true },
        });
        const warrantyMonths = company?.defaultRepairWarrantyMonths ?? null;

        const now = new Date();
        const isInStorePickup = fulfillmentType === "IN_STORE";
        const warrantyEnds =
          isInStorePickup && warrantyMonths != null && warrantyMonths > 0
            ? new Date(now.getFullYear(), now.getMonth() + warrantyMonths, now.getDate())
            : null;

        const laborTotal = rd.labors.reduce((s, l) => s + (l.unitRate || 0), 0);

        const ticket = await tx.repairTicket.create({
          data: {
            ticketNo: genNo("R"),
            type: "ON_SITE",
            customerId: body.customerId,
            serialItemId: rd.serialItemId || null,
            symptom: symptomFull,
            status: isInStorePickup ? "PICKED_UP" : "READY",
            receivedAt: now,
            startedAt: now,
            readyAt: now,
            pickedUpAt: isInStorePickup ? now : null,
            paymentMethod: body.paymentMethod ?? null,
            finalAmount: laborTotal,
            quotedLaborAmount: laborTotal,
            quotedTotalAmount: laborTotal,
            quotedAt: now,
            repairWarrantyMonths: warrantyMonths,
            repairWarrantyEnds: warrantyEnds,
            // 결제 Order link — N:1 (orderId)
            orderId: order.id,
            createdById: user.id,
            labors: {
              create: rd.labors.map((l) => ({
                name: l.name,
                hours: 1,
                unitRate: l.unitRate,
                totalPrice: l.unitRate,
              })),
            },
          },
        });
        // Phase 4 세트 학습 — IN_STORE 즉시 픽업 케이스만 (PICKED_UP 진입)
        if (isInStorePickup) {
          await learnDiagnosisPartSet(tx, ticket.id);
        }
      }

      // Rental 생성 (임대 항목 + 고객 있을 때)
      if (body.rentalRecords && body.rentalRecords.length > 0 && body.customerId) {
        let firstRentalId: string | null = null;
        for (const r of body.rentalRecords) {
          const start = new Date(r.startDate);
          const end = new Date(r.endDate);

          // 같은 자산 행 잠금 — 동시 결제·예약 race 방지
          await tx.rentalAsset.update({
            where: { id: r.assetId },
            data: { updatedAt: new Date() },
          });

          // 점유 중복 검사 — ACTIVE/OVERDUE/RESERVED 와 겹치면 차단
          const conflict = await tx.rental.findFirst({
            where: {
              assetId: r.assetId,
              status: { in: ["ACTIVE", "OVERDUE", "RESERVED"] },
              startDate: { lte: end },
              endDate: { gte: start },
            },
            select: { rentalNo: true, startDate: true, endDate: true },
          });
          if (conflict) {
            const e = new Error("RENTAL_OVERLAP");
            (
              e as Error & {
                conflict?: typeof conflict & { assetId: string };
              }
            ).conflict = { ...conflict, assetId: r.assetId };
            throw e;
          }

          const rental = await tx.rental.create({
            data: {
              rentalNo: genNo("RNT"),
              assetId: r.assetId,
              customerId: body.customerId,
              status: "ACTIVE",
              startDate: start,
              endDate: end,
              rateType: "DAILY",
              unitRate: r.unitRate,
              totalUnits: r.totalDays,
              rentalAmount: r.rentalAmount,
              depositAmount: r.depositAmount ?? 0,
              depositReturned: false,
              overdueAmount: 0,
              finalAmount: r.rentalAmount,
              paymentMethod: body.paymentMethod ?? null,
              checkoutAt: r.checkoutAt ? new Date(r.checkoutAt) : new Date(),
              createdById: user.id,
            },
          });
          if (!firstRentalId) {
            firstRentalId = rental.id;
            await tx.order.update({ where: { id: order.id }, data: { rentalId: rental.id } });
          }
          await tx.rentalAsset.update({ where: { id: r.assetId }, data: { status: "RENTED" } });
        }
      }

      // CustomerLedger — 모든 거래를 SALE/RECEIPT 쌍으로 기록 (audit trail).
      //   PAID:        SALE(totalAmount) + RECEIPT(totalAmount) → balance 변화 0
      //   UNPAID:      SALE(totalAmount) — RECEIPT 없음 → balance +totalAmount (미수금)
      //   PARTIAL_PAID: SALE(totalAmount) + RECEIPT(paidAmount) → balance +outstandingAmount
      // 매장에서 모든 거래 흐름을 원장 한 곳에서 확인할 수 있게 함.
      // date 는 order.orderDate 로 명시 — RECEIPT(자정) 와 정렬 일관성 보장.
      if (body.customerId) {
        const total = totalAmount;
        const paid = isUnpaid
          ? 0
          : isPartialPaid
            ? paidAmountInput ?? 0
            : total;
        const saleDesc = `POS 주문 ${order.orderNo}`;
        const receiptDesc = isPartialPaid
          ? partialPaymentKind === "DEPOSIT"
            ? `POS 주문 ${order.orderNo} 계약금`
            : `POS 주문 ${order.orderNo} 일부결제`
          : `POS 주문 ${order.orderNo} 결제`;
        const last = await tx.customerLedger.findFirst({
          where: { customerId: body.customerId },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        });
        let runningBalance = last ? Number(last.balance) : 0;
        await tx.customerLedger.create({
          data: {
            customerId: body.customerId,
            date: order.orderDate,
            type: "SALE",
            description: saleDesc,
            debitAmount: total,
            creditAmount: 0,
            balance: runningBalance + total,
            referenceId: order.id,
            referenceType: "ORDER",
          },
        });
        runningBalance += total;
        if (paid > 0) {
          await tx.customerLedger.create({
            data: {
              customerId: body.customerId,
              date: order.orderDate,
              type: "RECEIPT",
              description: receiptDesc,
              debitAmount: 0,
              creditAmount: paid,
              balance: runningBalance - paid,
              referenceId: order.id,
              referenceType: "ORDER",
            },
          });
        }
        await rebalanceCustomerLedger(tx, body.customerId);
      }

      return order;
    }, { timeout: 30000, maxWait: 10000 });

    return NextResponse.json({ kind: "order", id: result.id, no: result.orderNo }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "RENTAL_OVERLAP") {
      const conflict = (e as Error & {
        conflict?: {
          assetId: string;
          rentalNo: string;
          startDate: Date;
          endDate: Date;
        };
      }).conflict;
      return NextResponse.json(
        { error: "선택한 임대 기간이 기존 임대와 겹칩니다", conflict },
        { status: 409 },
      );
    }
    const msg = e instanceof Error ? e.message : "주문 확정 실패";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
