/**
 * 주문 시스템 종합 시나리오 시드 — 워크보드의 모든 흐름을 시각으로 확인할 수 있게
 * 다양한 상태의 주문 데이터를 생성한다.
 *
 * 실행:
 *   npx tsx --env-file=.env.local scripts/seed-test-scenarios.ts
 *   npx tsx --env-file=.env.local scripts/seed-test-scenarios.ts --reset  (기존 SEED- 데이터 삭제 후 재생성)
 *
 * 생성 데이터 (SEED- prefix 로 식별):
 *  - 채널 1개 (MOCK), SKU 매핑 (단일 + 다중)
 *  - 상품 5개 (재고 충분)
 *  - 고객 2명 (개인·기업)
 *  - 주문 시나리오 12개 — PENDING / PREPARING / PREPARING_PACKED / SHIPPED /
 *    COMPLETED / RETURN_REQUESTED / RETURN_ACCEPTED / RETURN_COLLECTED /
 *    RETURN_INSPECTED / RETURNED / EXCHANGED + 새 주문 -EX
 *  - 부분 출고/반품/외상 시나리오 포함
 *  - 보류 큐 1건 (UNMAPPED_SKU) — 매핑 추천 dialog 검증용
 *
 * LotConsumption 은 FIFO 시뮬이 복잡해 생략 — 시각 확인용 데이터만.
 * 실제 prepare/ship 액션을 거치지 않아도 되는 상태 데이터를 직접 set.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const RESET = process.argv.includes("--reset");
const PREFIX = "SEED-";

async function main() {
  console.log("[seed-scenarios] 시작");

  if (RESET) {
    console.log("  → 기존 SEED- 데이터 삭제");
    // Shipment / ShipmentItem 은 Order CASCADE 로 자동 삭제됨 — 별도 처리 불필요
    await prisma.orderItem.deleteMany({
      where: { order: { orderNo: { startsWith: PREFIX } } },
    });
    await prisma.order.deleteMany({
      where: { orderNo: { startsWith: PREFIX } },
    });
    await prisma.pendingChannelOrder.deleteMany({
      where: { channelOrderNo: { startsWith: PREFIX } },
    });
    await prisma.channelProductMappingComponent.deleteMany({
      where: { mapping: { channelSku: { startsWith: PREFIX } } },
    });
    await prisma.channelProductMapping.deleteMany({
      where: { channelSku: { startsWith: PREFIX } },
    });
    // 인벤토리·로트는 product 보다 먼저 삭제 (FK 제약)
    await prisma.inventory.deleteMany({
      where: { product: { sku: { startsWith: PREFIX } } },
    });
    await prisma.inventoryLot.deleteMany({
      where: { product: { sku: { startsWith: PREFIX } } },
    });
    // BundleProduct 도 product 삭제 전 정리 — bundleProduct 측이 onDelete=Restrict 라 직접 삭제 필요
    await prisma.bundleProduct.deleteMany({
      where: {
        OR: [
          { mainProduct: { sku: { startsWith: PREFIX } } },
          { bundleProduct: { sku: { startsWith: PREFIX } } },
        ],
      },
    });
    await prisma.product.deleteMany({
      where: { sku: { startsWith: PREFIX } },
    });
    await prisma.customer.deleteMany({
      where: { name: { startsWith: PREFIX } },
    });
    console.log("  ✓ 삭제 완료");
  }

  // 1) ADMIN 사용자 (이미 있어야)
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) {
    console.error("  ✗ ADMIN 사용자가 없습니다. 먼저 회원가입 + role=ADMIN 설정");
    process.exit(1);
  }
  console.log(`  ✓ ADMIN: ${admin.email}`);

  // 2) Mock 채널 ensure
  const channel = await prisma.salesChannel.upsert({
    where: { code: "MOCK" },
    update: { isActive: true },
    create: {
      code: "MOCK",
      name: "Mock 채널 (테스트)",
      commissionRate: 0.05,
      isActive: true,
      memo: "시드 스크립트가 생성한 검증용 채널",
    },
  });
  console.log(`  ✓ 채널: ${channel.name}`);

  // 3) 테스트 상품 5개 (P001 = 가습기-화이트로 의미 좁힘. cross-sell 색상 옵션 부착됨)
  const productSpecs = [
    { sku: `${PREFIX}P001`, name: "테스트 가습기-화이트", sellingPrice: 50000, qty: 100 },
    { sku: `${PREFIX}P002`, name: "테스트 가습기 필터", sellingPrice: 12000, qty: 200 },
    { sku: `${PREFIX}P003`, name: "테스트 핸드크림", sellingPrice: 18000, qty: 150 },
    { sku: `${PREFIX}P004`, name: "테스트 마스크팩 10매", sellingPrice: 25000, qty: 80 },
    { sku: `${PREFIX}P005`, name: "테스트 보습세트", sellingPrice: 80000, qty: 30 },
  ];
  const products = await Promise.all(
    productSpecs.map(async (p) => {
      const created = await prisma.product.upsert({
        where: { sku: p.sku },
        update: {
          name: p.name,
          sellingPrice: p.sellingPrice,
          listPrice: p.sellingPrice,
          isActive: true,
          productType: "FINISHED",
          catalogHidden: false,
        },
        create: {
          sku: p.sku,
          name: p.name,
          sellingPrice: p.sellingPrice,
          listPrice: p.sellingPrice,
          taxType: "TAXABLE",
          taxRate: 0.1,
          isActive: true,
        },
      });
      // Inventory ensure
      await prisma.inventory.upsert({
        where: { productId: created.id },
        update: { quantity: p.qty },
        create: { productId: created.id, quantity: p.qty, safetyStock: 0 },
      });
      return created;
    }),
  );
  console.log(`  ✓ 상품 ${products.length}개 + inventory`);

  // 3-b) 가습기 패밀리 — SWAP 옵션 시연용
  //   P006 = 가습기-블랙 (FINISHED, catalogHidden=true, 단독 노출 X — 옵션 swap 으로만 도달)
  //   P007 = (대표) 가습기 (OPTION_PARENT, 카탈로그 노출, 옵션 색상 SWAP → P001 또는 P006)
  // 시나리오 모델:
  //   방식 A — 대표 P007 카탈로그 진입 → 색상 옵션으로 P001 (화이트) 또는 P006 (블랙) 결정
  //   방식 B — P001 (화이트) 카탈로그 진입 → 색상 옵션으로 블랙 선택 시 P006 swap (cross-sell)
  const productBlack = await prisma.product.upsert({
    where: { sku: `${PREFIX}P006` },
    update: {
      name: "테스트 가습기-블랙",
      sellingPrice: 51000,
      listPrice: 51000,
      isActive: true,
      productType: "FINISHED",
      catalogHidden: true,
    },
    create: {
      sku: `${PREFIX}P006`,
      name: "테스트 가습기-블랙",
      sellingPrice: 51000,
      listPrice: 51000,
      taxType: "TAXABLE",
      taxRate: 0.1,
      isActive: true,
      productType: "FINISHED",
      catalogHidden: true,
    },
  });
  await prisma.inventory.upsert({
    where: { productId: productBlack.id },
    update: { quantity: 80 },
    create: { productId: productBlack.id, quantity: 80, safetyStock: 0 },
  });

  const productParent = await prisma.product.upsert({
    where: { sku: `${PREFIX}P007` },
    update: {
      name: "테스트 가습기",
      sellingPrice: 0, // OPTION_PARENT 는 placeholder, swap SKU 가격이 우선
      listPrice: 0,
      isActive: true,
      productType: "OPTION_PARENT",
      catalogHidden: false,
    },
    create: {
      sku: `${PREFIX}P007`,
      name: "테스트 가습기",
      sellingPrice: 0,
      listPrice: 0,
      taxType: "TAXABLE",
      taxRate: 0.1,
      isActive: true,
      productType: "OPTION_PARENT",
      catalogHidden: false,
    },
  });
  console.log(`  ✓ 가습기 패밀리 — P001(화이트) + P006(블랙·hidden) + P007(대표·OPTION_PARENT)`);

  // 4) SKU 매핑
  // 단일 매핑: P001 ↔ ERP P001
  // 다중 매핑 (선물세트): SET-A ↔ [P001 × 1 + P002 × 2 + P003 × 1]
  const singleMappingSku = `${PREFIX}MAP001`;
  const multiMappingSku = `${PREFIX}MAP-SET-A`;
  await prisma.channelProductMapping.upsert({
    where: {
      channelId_channelSku: { channelId: channel.id, channelSku: singleMappingSku },
    },
    update: { productId: products[0].id, channelName: "테스트 가습기 (단일)" },
    create: {
      channelId: channel.id,
      channelSku: singleMappingSku,
      channelName: "테스트 가습기 (단일)",
      productId: products[0].id,
    },
  });

  // 다중 매핑은 나누어 처리 — 기존 components 삭제 후 재생성
  const multiMapping = await prisma.channelProductMapping.upsert({
    where: {
      channelId_channelSku: { channelId: channel.id, channelSku: multiMappingSku },
    },
    update: { productId: null, channelName: "테스트 보습세트 (다중)" },
    create: {
      channelId: channel.id,
      channelSku: multiMappingSku,
      channelName: "테스트 보습세트 (다중)",
      productId: null,
    },
  });
  await prisma.channelProductMappingComponent.deleteMany({
    where: { mappingId: multiMapping.id },
  });
  await prisma.channelProductMappingComponent.createMany({
    data: [
      { mappingId: multiMapping.id, productId: products[0].id, quantity: 1 },
      { mappingId: multiMapping.id, productId: products[1].id, quantity: 2 },
      { mappingId: multiMapping.id, productId: products[2].id, quantity: 1 },
    ],
  });
  console.log(`  ✓ 매핑 2개 (단일 + 다중)`);

  // 4-b) 고객 옵션 (ProductOption) — SWAP 모드 시연
  //   기존 옵션 (색상 단순 텍스트 + 필터 ADDON) 모두 cleanup — 잘못된 도메인 예시였음:
  //     • 색상은 재고 통합이 아니라 SKU 분리(SWAP) 가 자연스러움
  //     • 필터는 ADDON(BundleProduct) 도메인이라 옵션 안에 넣을 게 아님 (§3.3)
  //   새 등록:
  //     • P007 (대표) 색상 슬롯 SWAP — 화이트 → P001, 블랙 → P006
  //     • P001 (화이트) cross-sell 색상 슬롯 SWAP — 화이트=self(단순 텍스트), 블랙 → P006
  await prisma.productOption.deleteMany({
    where: { productId: { in: [products[0].id, productParent.id, productBlack.id] } },
  });

  // (방식 A) 대표 가습기 — 색상 옵션 필수, SWAP 으로 실제 SKU 결정
  await prisma.productOption.create({
    data: {
      productId: productParent.id,
      name: "색상",
      required: true,
      sortOrder: 0,
      isActive: true,
      values: {
        create: [
          {
            label: "화이트",
            addPrice: 0,
            sortOrder: 0,
            isActive: true,
            mappedProductId: products[0].id, // P001
            mappedMode: "SWAP",
          },
          {
            label: "블랙",
            addPrice: 0,
            sortOrder: 1,
            isActive: true,
            mappedProductId: productBlack.id, // P006
            mappedMode: "SWAP",
          },
        ],
      },
    },
  });

  // (방식 B) 화이트 페이지 — 자기 자신 default + 블랙 cross-sell SWAP
  await prisma.productOption.create({
    data: {
      productId: products[0].id, // P001 (화이트)
      name: "색상",
      required: false, // 미선택 = 화이트(self) 그대로
      sortOrder: 0,
      isActive: true,
      values: {
        create: [
          // self 옵션값은 단순 텍스트 — swap 안 일어나고 P001 그대로
          { label: "화이트", addPrice: 0, sortOrder: 0, isActive: true },
          {
            label: "블랙",
            addPrice: 0,
            sortOrder: 1,
            isActive: true,
            mappedProductId: productBlack.id,
            mappedMode: "SWAP",
          },
        ],
      },
    },
  });
  console.log(`  ✓ 옵션 — P007(대표) 색상 SWAP 필수 / P001(화이트) cross-sell 색상`);

  // 4-c) 추가구매 추천 (BundleProduct)
  //   가습기 패밀리 — P001(화이트) / P007(대표) 모두 P002(필터) 를 추가구매로 추천
  //   필터는 단독 카탈로그 상품 + 가습기 사면 함께 권유되는 ADDON 도메인 (옵션 슬롯 X)
  await prisma.bundleProduct.deleteMany({
    where: {
      mainProductId: { in: [products[0].id, productParent.id] },
    },
  });
  for (const mainId of [products[0].id, productParent.id]) {
    await prisma.bundleProduct.create({
      data: {
        mainProductId: mainId,
        bundleProductId: products[1].id, // 가습기 필터 P002
        defaultQuantity: 1,
        discountAmount: 1000, // 번들 구매 시 ₩1,000 할인 (정가 12,000 → 11,000)
        recommendMessage: "가습기와 함께 쓰면 좋아요 — 6개월 교체 권장",
        sortOrder: 0,
        isActive: true,
      },
    });
  }
  console.log(`  ✓ 추가구매 추천 — P001/P007 → P002(필터) ₩1,000 할인`);

  // 5) 고객 2명 (개인·기업)
  const customerIndiv = await prisma.customer.upsert({
    where: { id: `${PREFIX}-CUST-INDIV` }, // 가짜 id 검색 — 없으면 create
    update: {},
    create: {
      id: `${PREFIX}-CUST-INDIV`,
      name: `${PREFIX}홍길동`,
      type: "INDIVIDUAL",
      phone: "010-1111-1111",
      address: "서울시 종로구 테스트로 1",
      isActive: true,
    },
  }).catch(async () => {
    // 이미 다른 id 로 존재할 수도 — name 으로 fallback
    return prisma.customer.findFirstOrThrow({
      where: { name: `${PREFIX}홍길동` },
    });
  });
  const customerCorp = await prisma.customer
    .upsert({
      where: { id: `${PREFIX}-CUST-CORP` },
      update: {},
      create: {
        id: `${PREFIX}-CUST-CORP`,
        name: `${PREFIX}㈜테스트상회`,
        type: "BUSINESS",
        businessNumber: "123-45-67890",
        phone: "02-1234-5678",
        address: "서울시 강남구 테스트로 100",
        isActive: true,
      },
    })
    .catch(async () =>
      prisma.customer.findFirstOrThrow({
        where: { name: `${PREFIX}㈜테스트상회` },
      }),
    );
  console.log(`  ✓ 고객 2명 (개인·기업)`);

  // 6) 주문 시나리오 — 다양한 상태
  const today = new Date();
  const dayOffset = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d;
  };

  let seq = 1;
  const newOrderNo = () => `${PREFIX}${String(seq++).padStart(3, "0")}`;

  // 공통 헬퍼 — items 1개 만들기
  type ItemSpec = {
    productId: string;
    quantity: number;
    unitPrice: number;
    shippedQty?: number;
    returnedQty?: number;
    refundedAmount?: number;
    /** 라인 역할 — 기본 MAIN. OPTION_REF 는 메인의 옵션 매핑, ADDON 은 추가구매 */
    lineRole?: "MAIN" | "OPTION_REF" | "ADDON";
    /** 부모 라인의 인덱스 (같은 spec.items 안에서) — 0=첫 라인 */
    parentItemIndex?: number;
    /** 주문 시점 옵션값 스냅샷 — { "메모리": "32GB" } */
    optionSnapshot?: Record<string, string>;
    /** 진입 경로 SKU (자사몰/외부 채널 한정 funnel 분석용). POS 시드는 null */
    entryProductId?: string;
  };
  async function createOrder(spec: {
    label: string;
    status: string;
    paymentStatus: string;
    paymentMethod?: string | null;
    fulfillmentType?: string;
    expectedShipDate?: Date | null;
    items: ItemSpec[];
    customerId?: string;
    channelId?: string;
    channelOrderNo?: string;
    claimType?: string | null;
    claimReason?: string | null;
    returnReason?: string | null;
    trackingCarrier?: string | null;
    trackingNumber?: string | null;
    returnRequestedAt?: Date | null;
    returnAcceptedAt?: Date | null;
    returnRejectedAt?: Date | null;
    exchangedAt?: Date | null;
    exchangeOrderId?: string | null;
    shipmentCount?: number;
    /** 배송비 결제 방식 — PREPAID(기본)/COD(착불)/STORE_BURDEN(매장 부담) */
    shippingPaymentType?: "PREPAID" | "COD" | "STORE_BURDEN";
    /** 배송비 금액 (세전) — 기본 0 */
    shippingFee?: number;
    memo?: string;
  }) {
    const subtotal = spec.items.reduce(
      (s, i) => s + i.quantity * i.unitPrice,
      0,
    );
    const tax = Math.round(subtotal * 0.1);
    const total = subtotal + tax;
    const orderNo = newOrderNo();
    const o = await prisma.order.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: {
        orderNo,
        status: spec.status as never,
        paymentStatus: spec.paymentStatus as never,
        paymentMethod: spec.paymentMethod
          ? (spec.paymentMethod as never)
          : null,
        fulfillmentType: (spec.fulfillmentType ?? "SHIPPING") as never,
        expectedShipDate: spec.expectedShipDate ?? null,
        customerId: spec.customerId ?? null,
        customerName: spec.customerId
          ? spec.customerId === customerIndiv.id
            ? customerIndiv.name
            : customerCorp.name
          : null,
        customerPhone: spec.customerId
          ? spec.customerId === customerIndiv.id
            ? customerIndiv.phone
            : customerCorp.phone
          : null,
        recipientName: spec.customerId
          ? spec.customerId === customerIndiv.id
            ? customerIndiv.name
            : customerCorp.name
          : null,
        recipientPhone: spec.customerId
          ? spec.customerId === customerIndiv.id
            ? customerIndiv.phone
            : customerCorp.phone
          : null,
        shippingAddress: spec.customerId
          ? spec.customerId === customerIndiv.id
            ? customerIndiv.address
            : customerCorp.address
          : null,
        channelId: spec.channelId ?? null,
        channelOrderNo: spec.channelOrderNo ?? null,
        orderDate: today,
        subtotalAmount: subtotal,
        discountAmount: 0,
        shippingFee: 0,
        taxAmount: tax,
        totalAmount: total,
        commissionAmount: 0,
        claimType: (spec.claimType ?? null) as never,
        claimReason: (spec.claimReason ?? null) as never,
        returnReason: spec.returnReason ?? null,
        trackingCarrier: spec.trackingCarrier ?? null,
        trackingNumber: spec.trackingNumber ?? null,
        returnRequestedAt: spec.returnRequestedAt ?? null,
        returnAcceptedAt: spec.returnAcceptedAt ?? null,
        returnRejectedAt: spec.returnRejectedAt ?? null,
        exchangedAt: spec.exchangedAt ?? null,
        exchangeOrderId: spec.exchangeOrderId ?? null,
        shipmentCount: spec.shipmentCount ?? 0,
        shippingFee: spec.shippingFee ?? 0,
        shippingPaymentType: spec.shippingPaymentType ?? "PREPAID",
        memo: spec.memo ?? `[${spec.label}]`,
        createdById: admin.id,
        // items 는 아래에서 순차 생성 (parentItemId 매핑 보장 위해)
      },
    });

    // OrderItem 순차 생성 — index 기반 parentItemId 매핑
    const createdItemIds: string[] = [];
    for (let i = 0; i < spec.items.length; i++) {
      const it = spec.items[i];
      const parentId =
        typeof it.parentItemIndex === "number"
          ? createdItemIds[it.parentItemIndex] ?? null
          : null;
      const created = await prisma.orderItem.create({
        data: {
          orderId: o.id,
          productId: it.productId,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          totalPrice: it.quantity * it.unitPrice,
          shippedQty: it.shippedQty ?? 0,
          returnedQty: it.returnedQty ?? 0,
          refundedAmount: it.refundedAmount ?? 0,
          lineRole: (it.lineRole ?? "MAIN") as never,
          parentItemId: parentId,
          optionSnapshot: it.optionSnapshot ?? null,
          entryProductId: it.entryProductId ?? null,
        },
      });
      createdItemIds.push(created.id);
    }

    console.log(`    + ${orderNo} ${spec.label}`);
    return o;
  }

  console.log(`  → 시나리오 주문 생성 (체계적 그룹: A 출고전 / B 출고진행 / C 부분분할 / D 반품흐름 / E 부분반품 / F 교환 / G 취소 / H 옵션·SWAP·ADDON)`);

  // ─────────────────────────────────────────────
  // A. 출고 전 흐름 (PENDING — 출고 워크보드 진입 전)
  // ─────────────────────────────────────────────

  await createOrder({
    label: "[A1] PENDING 외상 — 매장 직접 등록 (출고대기 진입 전)",
    status: "PENDING",
    paymentStatus: "UNPAID",
    paymentMethod: "UNPAID",
    customerId: customerIndiv.id,
    expectedShipDate: dayOffset(2),
    shippingFee: 3000,
    shippingPaymentType: "PREPAID",
    items: [{ productId: products[0].id, quantity: 2, unitPrice: 50000 }],
  });

  await createOrder({
    label: "[A2] PENDING 외부 채널 import",
    status: "PENDING",
    paymentStatus: "PAID",
    paymentMethod: "CARD",
    channelId: channel.id,
    channelOrderNo: `${PREFIX}CH-001`,
    customerId: customerIndiv.id,
    expectedShipDate: dayOffset(1),
    shippingFee: 3000,
    shippingPaymentType: "PREPAID",
    items: [{ productId: products[1].id, quantity: 3, unitPrice: 12000 }],
  });

  // ─────────────────────────────────────────────
  // B. 출고 진행 단계
  // ─────────────────────────────────────────────

  await createOrder({
    label: "[B1] PREPARING 출고 대기",
    status: "PREPARING",
    paymentStatus: "PAID",
    paymentMethod: "CARD",
    customerId: customerIndiv.id,
    expectedShipDate: today,
    shippingFee: 3000,
    shippingPaymentType: "PREPAID",
    items: [{ productId: products[2].id, quantity: 1, unitPrice: 18000 }],
  });

  await createOrder({
    label: "[B2] PREPARING_PACKED 출고 확정 (발송 대기)",
    status: "PREPARING_PACKED",
    paymentStatus: "PAID",
    paymentMethod: "CARD",
    customerId: customerCorp.id,
    expectedShipDate: today,
    trackingCarrier: "CJ대한통운",
    trackingNumber: "0000000001",
    shipmentCount: 0,
    shippingFee: 3000,
    shippingPaymentType: "PREPAID",
    items: [{ productId: products[3].id, quantity: 2, unitPrice: 25000 }],
  });

  await createOrder({
    label: "[B3] SHIPPED 배송중 (단일 발송)",
    status: "SHIPPED",
    paymentStatus: "PAID",
    paymentMethod: "CARD",
    customerId: customerIndiv.id,
    expectedShipDate: dayOffset(-1),
    trackingCarrier: "CJ대한통운",
    trackingNumber: "0000000002",
    shipmentCount: 1,
    shippingFee: 3000,
    shippingPaymentType: "PREPAID",
    items: [
      {
        productId: products[2].id,
        quantity: 1,
        unitPrice: 18000,
        shippedQty: 1,
      },
    ],
  });

  await createOrder({
    label: "[B4] COMPLETED 배송 완료 (착불)",
    status: "COMPLETED",
    paymentStatus: "PAID",
    paymentMethod: "CASH",
    customerId: customerIndiv.id,
    shippingFee: 5000,
    shippingPaymentType: "COD",
    items: [
      {
        productId: products[2].id,
        quantity: 5,
        unitPrice: 18000,
        shippedQty: 5,
      },
    ],
  });

  // ─────────────────────────────────────────────
  // C. 부분/분할 출고
  // ─────────────────────────────────────────────

  await createOrder({
    label: "[C1] 부분 발송 1/3 — PREPARING_PACKED, 1차 partial_ship",
    status: "PREPARING_PACKED",
    paymentStatus: "PAID",
    paymentMethod: "CARD",
    customerId: customerCorp.id,
    expectedShipDate: dayOffset(-1),
    trackingCarrier: "CJ대한통운",
    trackingNumber: "1234567890",
    shipmentCount: 1,
    shippingFee: 3000,
    shippingPaymentType: "PREPAID",
    items: [
      {
        productId: products[3].id,
        quantity: 3,
        unitPrice: 25000,
        shippedQty: 1,
      },
    ],
  });

  const seedSplit = await createOrder({
    label: "[C2] 분할 2회 발송 완료 — 송장 따로 (SHIPPED)",
    status: "SHIPPED",
    paymentStatus: "PAID",
    paymentMethod: "CARD",
    customerId: customerIndiv.id,
    expectedShipDate: dayOffset(-1),
    trackingCarrier: "한진택배",
    trackingNumber: "5566778899",
    shipmentCount: 2,
    shippingFee: 3000,
    shippingPaymentType: "PREPAID",
    items: [
      {
        productId: products[1].id,
        quantity: 4,
        unitPrice: 12000,
        shippedQty: 4,
      },
    ],
  });
  // C2 의 1차/2차 Shipment 레코드 생성 — 각 회차마다 다른 송장번호로
  const seedSplitItem = await prisma.orderItem.findFirst({
    where: { orderId: seedSplit.id },
  });
  if (seedSplitItem) {
    const sh1 = await prisma.shipment.create({
      data: {
        orderId: seedSplit.id,
        shipmentNo: 1,
        trackingCarrier: "CJ대한통운",
        trackingNumber: "1111222233",
        shippedAt: dayOffset(-3),
        memo: "재고 있던 2개 먼저 발송",
        items: { create: [{ orderItemId: seedSplitItem.id, quantity: 2 }] },
      },
    });
    const sh2 = await prisma.shipment.create({
      data: {
        orderId: seedSplit.id,
        shipmentNo: 2,
        trackingCarrier: "한진택배",
        trackingNumber: "5566778899",
        shippedAt: dayOffset(-1),
        memo: "재입고 후 잔여 2개 발송",
        items: { create: [{ orderItemId: seedSplitItem.id, quantity: 2 }] },
      },
    });
    void sh1; void sh2;
  }

  await createOrder({
    label: "[C3] 다중 품목 — A:전량 / B:대기 / C:부분 (다른 진행률)",
    status: "PREPARING_PACKED",
    paymentStatus: "PAID",
    paymentMethod: "CARD",
    customerId: customerCorp.id,
    expectedShipDate: today,
    trackingCarrier: "롯데택배",
    trackingNumber: "AB-1234-5678",
    shipmentCount: 2,
    shippingFee: 5000,
    shippingPaymentType: "PREPAID",
    items: [
      { productId: products[0].id, quantity: 1, unitPrice: 50000, shippedQty: 1 },
      { productId: products[2].id, quantity: 3, unitPrice: 18000, shippedQty: 0 },
      { productId: products[3].id, quantity: 4, unitPrice: 25000, shippedQty: 2 },
    ],
  });

  // ─────────────────────────────────────────────
  // D. 반품 흐름 (단계별 모두)
  // ─────────────────────────────────────────────

  await createOrder({
    label: "[D1] RETURN_REQUESTED 반품 요청 — 매장 결정 대기",
    status: "RETURN_REQUESTED",
    paymentStatus: "PAID",
    paymentMethod: "CARD",
    customerId: customerIndiv.id,
    claimType: "REFUND",
    claimReason: "DEFECTIVE",
    returnReason: "포장 뜯었더니 작동 안 함",
    returnRequestedAt: dayOffset(-1),
    shippingFee: 3000,
    shippingPaymentType: "PREPAID",
    items: [
      { productId: products[0].id, quantity: 1, unitPrice: 50000, shippedQty: 1 },
    ],
  });

  await createOrder({
    label: "[D2] RETURN_ACCEPTED 회수 대기",
    status: "RETURN_ACCEPTED",
    paymentStatus: "PAID",
    paymentMethod: "CARD",
    channelId: channel.id,
    channelOrderNo: `${PREFIX}CH-002`,
    customerId: customerCorp.id,
    claimType: "REFUND",
    claimReason: "DAMAGED_IN_TRANSIT",
    returnRequestedAt: dayOffset(-3),
    returnAcceptedAt: dayOffset(-2),
    shippingFee: 3000,
    shippingPaymentType: "PREPAID",
    items: [
      { productId: products[1].id, quantity: 2, unitPrice: 12000, shippedQty: 2 },
    ],
  });

  await createOrder({
    label: "[D3] RETURN_COLLECTED 회수 완료 — 검수 대기",
    status: "RETURN_COLLECTED",
    paymentStatus: "PAID",
    paymentMethod: "CARD",
    customerId: customerIndiv.id,
    claimType: "REFUND",
    claimReason: "DEFECTIVE",
    returnRequestedAt: dayOffset(-4),
    returnAcceptedAt: dayOffset(-3),
    shippingFee: 3000,
    shippingPaymentType: "PREPAID",
    items: [
      { productId: products[3].id, quantity: 1, unitPrice: 25000, shippedQty: 1 },
    ],
  });

  await createOrder({
    label: "[D4] RETURN_INSPECTED 검수 완료 — 환불 진행",
    status: "RETURN_INSPECTED",
    paymentStatus: "REFUND_PENDING",
    paymentMethod: "CARD",
    customerId: customerIndiv.id,
    claimType: "REFUND",
    claimReason: "CHANGE_MIND",
    returnRequestedAt: dayOffset(-5),
    returnAcceptedAt: dayOffset(-4),
    shippingFee: 3000,
    shippingPaymentType: "PREPAID",
    items: [
      { productId: products[2].id, quantity: 1, unitPrice: 18000, shippedQty: 1 },
    ],
  });

  await createOrder({
    label: "[D5] RETURNED 반품 종결 — 외상 매출 취소",
    status: "RETURNED",
    paymentStatus: "SALES_CANCELLED",
    paymentMethod: "UNPAID",
    customerId: customerIndiv.id,
    claimType: "REFUND",
    claimReason: "WRONG_ITEM",
    returnRequestedAt: dayOffset(-6),
    shippingFee: 3000,
    shippingPaymentType: "PREPAID",
    items: [
      {
        productId: products[3].id,
        quantity: 2,
        unitPrice: 25000,
        shippedQty: 2,
        returnedQty: 2,
        refundedAmount: 50000,
      },
    ],
  });

  // ─────────────────────────────────────────────
  // E. 부분 반품 (전체 출고 후 일부 라인만)
  // ─────────────────────────────────────────────

  await createOrder({
    label: "[E1] COMPLETED + 부분 반품 1/5 (단일 라인 일부)",
    status: "COMPLETED",
    paymentStatus: "PARTIAL_REFUND",
    paymentMethod: "CARD",
    customerId: customerIndiv.id,
    shippingFee: 3000,
    shippingPaymentType: "PREPAID",
    items: [
      {
        productId: products[3].id,
        quantity: 5,
        unitPrice: 25000,
        shippedQty: 5,
        returnedQty: 1,
        refundedAmount: 25000,
      },
    ],
  });

  await createOrder({
    label: "[E2] COMPLETED + 다중 품목 부분 반품 (B 라인만)",
    status: "COMPLETED",
    paymentStatus: "PARTIAL_REFUND",
    paymentMethod: "CARD",
    customerId: customerIndiv.id,
    shippingFee: 5000,
    shippingPaymentType: "PREPAID",
    items: [
      { productId: products[1].id, quantity: 5, unitPrice: 12000, shippedQty: 5 },
      {
        productId: products[3].id,
        quantity: 2,
        unitPrice: 25000,
        shippedQty: 2,
        returnedQty: 1,
        refundedAmount: 25000,
      },
    ],
  });

  // ─────────────────────────────────────────────
  // F. 교환 (원본 + 새 -EX 자동 생성)
  // ─────────────────────────────────────────────

  const exOriginal = await createOrder({
    label: "[F1] EXCHANGED 교환 완료 — 원본",
    status: "EXCHANGED",
    paymentStatus: "PAID",
    paymentMethod: "CARD",
    customerId: customerIndiv.id,
    claimType: "EXCHANGE_SAME",
    claimReason: "DEFECTIVE",
    returnRequestedAt: dayOffset(-3),
    returnAcceptedAt: dayOffset(-2),
    exchangedAt: dayOffset(-1),
    shippingFee: 3000,
    shippingPaymentType: "PREPAID",
    items: [
      {
        productId: products[0].id,
        quantity: 1,
        unitPrice: 50000,
        shippedQty: 1,
        returnedQty: 1,
      },
    ],
  });
  const exNew = await prisma.order.create({
    data: {
      orderNo: `${exOriginal.orderNo}-EX`,
      status: "PENDING",
      paymentStatus: "PAID",
      paymentMethod: "CARD",
      fulfillmentType: "SHIPPING",
      expectedShipDate: dayOffset(2),
      customerId: customerIndiv.id,
      customerName: customerIndiv.name,
      customerPhone: customerIndiv.phone,
      recipientName: customerIndiv.name,
      recipientPhone: customerIndiv.phone,
      shippingAddress: customerIndiv.address,
      orderDate: today,
      subtotalAmount: 50000,
      discountAmount: 0,
      shippingFee: 0,
      shippingPaymentType: "STORE_BURDEN",
      taxAmount: 5000,
      totalAmount: 55000,
      commissionAmount: 0,
      memo: `교환 발송 — 원본 ${exOriginal.orderNo} (같은 상품, 매장 부담)`,
      createdById: admin.id,
      items: {
        create: [
          {
            productId: products[0].id,
            quantity: 1,
            unitPrice: 50000,
            totalPrice: 50000,
          },
        ],
      },
    },
  });
  await prisma.order.update({
    where: { id: exOriginal.id },
    data: { exchangeOrderId: exNew.id },
  });
  console.log(`    + ${exNew.orderNo} [F2] EXCHANGED -EX 새 주문 자동 생성`);

  // ─────────────────────────────────────────────
  // G. 취소
  // ─────────────────────────────────────────────

  await createOrder({
    label: "[G1] CANCELLED 취소 — 결제 환불 완료",
    status: "CANCELLED",
    paymentStatus: "REFUNDED",
    paymentMethod: "CARD",
    customerId: customerIndiv.id,
    shippingFee: 0,
    shippingPaymentType: "PREPAID",
    items: [{ productId: products[1].id, quantity: 2, unitPrice: 12000 }],
  });

  // ─────────────────────────────────────────────
  // H. 옵션 / SWAP / ADDON 케이스
  // ─────────────────────────────────────────────

  // H1: OPTION_PARENT 진입 → 화이트 swap (자사몰 funnel)
  await createOrder({
    label: "[H1] SWAP — 대표 가습기 진입 → 화이트 결제 (자사몰)",
    status: "PREPARING",
    paymentStatus: "PAID",
    paymentMethod: "CARD",
    channelId: channel.id,
    channelOrderNo: `${PREFIX}CH-SWAP-W`,
    customerId: customerIndiv.id,
    expectedShipDate: dayOffset(1),
    shippingFee: 3000,
    shippingPaymentType: "PREPAID",
    items: [
      {
        productId: products[0].id, // 화이트 P001
        quantity: 1,
        unitPrice: 50000,
        lineRole: "MAIN",
        optionSnapshot: { 색상: "화이트" },
        entryProductId: productParent.id,
      },
    ],
  });

  // H2: OPTION_PARENT 진입 → 블랙 swap (배송비 매장 부담)
  await createOrder({
    label: "[H2] SWAP — 대표 가습기 진입 → 블랙 결제 (자사몰, 무료배송)",
    status: "PREPARING",
    paymentStatus: "PAID",
    paymentMethod: "CARD",
    channelId: channel.id,
    channelOrderNo: `${PREFIX}CH-SWAP-B`,
    customerId: customerIndiv.id,
    expectedShipDate: dayOffset(1),
    shippingFee: 0,
    shippingPaymentType: "STORE_BURDEN",
    items: [
      {
        productId: productBlack.id, // 블랙 P006
        quantity: 1,
        unitPrice: 51000,
        lineRole: "MAIN",
        optionSnapshot: { 색상: "블랙" },
        entryProductId: productParent.id,
      },
    ],
  });

  // H3: cross-sell — 화이트 페이지 진입 → 블랙 swap
  await createOrder({
    label: "[H3] cross-sell — 가습기-화이트 진입 → 블랙 swap",
    status: "PREPARING",
    paymentStatus: "PAID",
    paymentMethod: "CARD",
    channelId: channel.id,
    channelOrderNo: `${PREFIX}CH-CROSS-B`,
    customerId: customerCorp.id,
    expectedShipDate: dayOffset(1),
    shippingFee: 3000,
    shippingPaymentType: "PREPAID",
    items: [
      {
        productId: productBlack.id, // P006 swap 결과
        quantity: 1,
        unitPrice: 51000,
        lineRole: "MAIN",
        optionSnapshot: { 색상: "블랙" },
        entryProductId: products[0].id, // 진입은 화이트 P001
      },
    ],
  });

  // H4: ADDON — 메인 + 추가구매 자식
  await createOrder({
    label: "[H4] ADDON — 가습기 + 필터 추가구매 자식 라인",
    status: "PREPARING",
    paymentStatus: "PAID",
    paymentMethod: "CARD",
    customerId: customerIndiv.id,
    expectedShipDate: dayOffset(1),
    shippingFee: 3000,
    shippingPaymentType: "PREPAID",
    items: [
      {
        productId: products[0].id,
        quantity: 1,
        unitPrice: 50000,
        lineRole: "MAIN",
      },
      {
        productId: products[1].id,
        quantity: 1,
        unitPrice: 11000,
        lineRole: "ADDON",
        parentItemIndex: 0,
      },
    ],
  });

  // H5: OPTION_REF — 옵션값에 mappedProduct 매핑된 케이스
  await createOrder({
    label: "[H5] OPTION_REF — 메인 + 옵션 매핑 자식 라인",
    status: "PREPARING",
    paymentStatus: "PAID",
    paymentMethod: "CARD",
    customerId: customerCorp.id,
    expectedShipDate: dayOffset(1),
    shippingFee: 3000,
    shippingPaymentType: "PREPAID",
    items: [
      {
        productId: products[0].id,
        quantity: 1,
        unitPrice: 50000,
        lineRole: "MAIN",
        optionSnapshot: { 색상: "화이트" },
      },
      {
        productId: products[1].id,
        quantity: 1,
        unitPrice: 12000,
        lineRole: "OPTION_REF",
        parentItemIndex: 0,
      },
    ],
  });


  // 7) 보류 큐 1건 — 매핑 안 된 SKU
  await prisma.pendingChannelOrder.upsert({
    where: {
      channelId_channelOrderNo: {
        channelId: channel.id,
        channelOrderNo: `${PREFIX}PENDING-001`,
      },
    },
    update: {},
    create: {
      channelId: channel.id,
      channelOrderNo: `${PREFIX}PENDING-001`,
      status: "UNMAPPED_SKU",
      reason: "매핑 누락 SKU: NEW-PRODUCT-XYZ",
      rawPayload: {
        channelOrderNo: `${PREFIX}PENDING-001`,
        orderedAt: today.toISOString(),
        buyer: { name: "테스트 손님", phone: "010-9999-0000" },
        recipient: { name: "테스트 손님", address: "서울시 어딘가" },
        items: [
          {
            channelSku: "NEW-PRODUCT-XYZ",
            channelProductName: "신규 상품 X",
            quantity: 1,
            unitPrice: 30000,
          },
        ],
      },
    },
  });
  console.log(`  ✓ 보류 큐 1건 (UNMAPPED_SKU)`);

  console.log("\n[seed-scenarios] 완료. 브라우저에서 확인:");
  console.log("  - /orders        워크보드 (KPI 5개 + 그룹 필터 + 상태별 시나리오)");
  console.log("  - /orders/help   도움말 페이지");
  console.log("  - /channels/imports  채널 import / 매핑 / 보류 큐");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
