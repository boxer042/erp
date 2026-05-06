/**
 * 통합 테스트 데이터 시드 — 모든 항목명에 [T] prefix 부여하여 cleanup 가능.
 * 실행: npx tsx scripts/_test-audit/seed-test-data.ts
 *
 * 생성:
 *  - 채널 4종 활성화 (쿠팡/네이버/자사몰/오프라인)
 *  - 카테고리 5종 [T]
 *  - 고객 15명 [T]
 *  - 주문 20건 [T] (다양 상태/채널/결제수단)
 *  - 수리티켓 20건 [T] (모든 상태 포함, ON_SITE/DROP_OFF 혼합)
 *  - 임대자산 5종 + 임대 15건 [T]
 *  - 시리얼아이템 10건 [T]
 *  - 견적서 5건 + 거래명세표 3건 [T]
 *  - 미수금 ledger 일부
 *
 * 기존 상품(99개)/거래처(17개) 는 그대로 사용 (테스트 추가 X — 충돌 방지).
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as dotenv } from "dotenv";
import {
  generateRepairTicketNo,
  generateQuotationNo,
  generateStatementNo,
  generateDocumentNo,
} from "../../src/lib/document-no";

dotenv({ path: ".env.local" });
dotenv({ path: ".env" });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const T = "[T]"; // 마커

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pickN<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length > 0) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}
function rint(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function daysAgo(d: number) {
  const r = new Date();
  r.setDate(r.getDate() - d);
  return r;
}
function pad2(n: number) {
  return String(n).padStart(2, "0");
}

const PHONES = Array.from({ length: 50 }, () =>
  `010-${pad2(rint(1000, 9999)).slice(0, 4)}-${pad2(rint(1000, 9999)).slice(0, 4)}`,
);
const FIRST = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임"];
const LAST = ["민수", "지영", "현우", "수진", "재민", "아람", "선영", "동현", "유진", "준호"];
const ADDRESSES = [
  "서울 강남구 테헤란로 1",
  "부산 해운대구 센텀로 50",
  "대전 유성구 대학로 99",
  "광주 북구 첨단과기로 123",
  "경기 성남시 분당구 정자동 123",
  "인천 연수구 송도과학로 1",
];

const CHANNELS_DATA = [
  { name: "쿠팡", code: "COUPANG", commissionRate: 0.108 },
  { name: "네이버", code: "NAVER", commissionRate: 0.04 },
  { name: "자사몰", code: "OWN", commissionRate: 0 },
  { name: "오프라인", code: "OFFLINE", commissionRate: 0 },
];

async function main() {
  const user = await prisma.user.findFirst({ where: { isActive: true } });
  if (!user) throw new Error("활성 사용자 없음");
  console.log(`✓ 사용자: ${user.name} (${user.id})`);

  // ── 1. 채널 4종 활성 보장 ──────────────────────────────────────────
  const channelIds: Record<string, string> = {};
  for (const c of CHANNELS_DATA) {
    const ch = await prisma.salesChannel.upsert({
      where: { code: c.code },
      update: { isActive: true, name: c.name, commissionRate: c.commissionRate },
      create: { ...c, isActive: true },
    });
    channelIds[c.code] = ch.id;
  }
  console.log(`✓ 채널 4종 활성`);

  // ── 2. 카테고리 5종 [T] ────────────────────────────────────────────
  const catNames = ["일반", "분무기", "엔진", "호스/부속", "기타"];
  const categories: { id: string; name: string }[] = [];
  for (let i = 0; i < catNames.length; i++) {
    const name = `${T} ${catNames[i]}`;
    const existing = await prisma.productCategory.findFirst({ where: { name } });
    const cat = existing
      ? existing
      : await prisma.productCategory.create({
          data: { name, order: 100 + i },
        });
    categories.push({ id: cat.id, name: cat.name });
  }
  console.log(`✓ 카테고리 ${categories.length}종`);

  // ── 3. 고객 15명 [T] ───────────────────────────────────────────────
  const customers: { id: string; name: string; phone: string }[] = [];
  for (let i = 0; i < 15; i++) {
    const name = `${T} ${pick(FIRST)}${pick(LAST)}${i + 1}`;
    const phone = PHONES[i];
    const c = await prisma.customer.create({
      data: {
        name,
        phone,
        email: i % 3 === 0 ? `t${i}@example.com` : null,
        address: i % 2 === 0 ? pick(ADDRESSES) : null,
        businessNumber: i % 4 === 0 ? `${100 + i}-${10 + i}-${10000 + i}` : null,
        ceo: i % 4 === 0 ? `${T} 대표${i}` : null,
      },
    });
    customers.push({ id: c.id, name: c.name, phone: c.phone });
  }
  console.log(`✓ 고객 ${customers.length}명`);

  // ── 4. 기존 활성 상품에서 표본 추출 — 가격 있는 것만 ─────────────
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      isCanonical: false,
      isBulk: false,
      sellingPrice: { gt: 0 },
    },
    take: 30,
    orderBy: { sellingPrice: "desc" },
    select: {
      id: true,
      name: true,
      sku: true,
      sellingPrice: true,
      taxType: true,
    },
  });
  if (products.length === 0) {
    throw new Error("활성 상품이 없어 주문 시드 불가");
  }
  console.log(`✓ 상품 풀: ${products.length}개 (기존)`);

  // ── 5. 주문 20건 [T] — 다양 상태/채널/결제 ──────────────────────────
  const STATUSES: ("PENDING" | "PREPARING" | "COMPLETED" | "CANCELLED")[] = [
    "PENDING",
    "PREPARING",
    "COMPLETED",
    "CANCELLED",
  ];
  const PAYMENTS: ("CASH" | "CARD" | "TRANSFER" | "UNPAID")[] = [
    "CASH",
    "CARD",
    "TRANSFER",
    "UNPAID",
  ];
  const channelCodes = Object.keys(channelIds);

  const orders: { id: string; orderNo: string }[] = [];
  for (let i = 0; i < 20; i++) {
    const orderDate = daysAgo(rint(0, 60));
    const orderNo = generateDocumentNo("ORD", orderDate);
    const items = pickN(products, rint(1, 3));
    const lines = items.map((p) => {
      const qty = rint(1, 5);
      const unitPrice = Math.round(Number(p.sellingPrice));
      return {
        productId: p.id,
        quantity: qty,
        unitPrice,
        totalPrice: unitPrice * qty,
      };
    });
    const subtotal = lines.reduce((s, l) => s + l.totalPrice, 0);
    const taxAmount = Math.round(subtotal * 0.1);
    const total = subtotal + taxAmount;
    const customer = pick(customers);
    const channelCode = pick(channelCodes);
    const status = pick(STATUSES);
    const paymentMethod = pick(PAYMENTS);

    const order = await prisma.order.create({
      data: {
        orderNo,
        channelId: channelIds[channelCode],
        status,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        orderDate,
        subtotalAmount: subtotal,
        taxAmount,
        totalAmount: total,
        commissionAmount: 0,
        paymentMethod,
        memo: `${T} 테스트 주문 ${i + 1}`,
        createdById: user.id,
        items: { create: lines },
      },
    });
    orders.push({ id: order.id, orderNo: order.orderNo });

    // UNPAID 면 customer ledger 추가
    if (paymentMethod === "UNPAID" && status !== "CANCELLED") {
      const last = await prisma.customerLedger.findFirst({
        where: { customerId: customer.id },
        orderBy: { date: "desc" },
      });
      const prev = last ? Number(last.balance) : 0;
      await prisma.customerLedger.create({
        data: {
          customerId: customer.id,
          type: "SALE",
          description: `${T} 주문 ${orderNo}`,
          debitAmount: total,
          creditAmount: 0,
          balance: prev + total,
          referenceId: order.id,
          referenceType: "ORDER",
          date: orderDate,
        },
      });
    }
  }
  console.log(`✓ 주문 ${orders.length}건`);

  // ── 6. 수리티켓 20건 [T] — 모든 상태 ────────────────────────────────
  const REPAIR_STATUSES: (
    | "RECEIVED"
    | "DIAGNOSING"
    | "QUOTED"
    | "APPROVED"
    | "REPAIRING"
    | "READY"
    | "PICKED_UP"
    | "CANCELLED"
  )[] = [
    "RECEIVED",
    "DIAGNOSING",
    "QUOTED",
    "APPROVED",
    "REPAIRING",
    "READY",
    "PICKED_UP",
    "PICKED_UP",
    "PICKED_UP",
    "CANCELLED",
  ];
  const CANCEL_REASONS = [
    "CUSTOMER_DECLINED",
    "CUSTOMER_NO_SHOW",
    "SHOP_GAVE_UP",
    "PARTS_UNAVAILABLE",
    "SOLD_AS_PRODUCT",
  ] as const;

  const tickets: string[] = [];
  for (let i = 0; i < 20; i++) {
    const receivedAt = daysAgo(rint(0, 90));
    const status = REPAIR_STATUSES[i % REPAIR_STATUSES.length];
    const type = i % 3 === 0 ? "ON_SITE" : "DROP_OFF";
    const customer = pick(customers);
    const repairCategory = pick(categories);
    const ticketNo = generateRepairTicketNo(receivedAt);
    const finalAmount =
      status === "PICKED_UP" ? rint(20000, 350000) : 0;
    const diagnosisFee = rint(0, 2) === 0 ? 0 : rint(10000, 30000);
    const pickedUpAt =
      status === "PICKED_UP"
        ? new Date(receivedAt.getTime() + rint(1, 14) * 86400000)
        : null;
    const cancelledAt = status === "CANCELLED" ? new Date() : null;

    const ticket = await prisma.repairTicket.create({
      data: {
        ticketNo,
        type,
        status,
        customerId: customer.id,
        repairCategoryId: repairCategory.id,
        createdById: user.id,
        symptom: `${T} 증상 ${i + 1}: 작동 불량`,
        diagnosis:
          status !== "RECEIVED" && status !== "CANCELLED"
            ? `${T} 진단 ${i + 1}: 부속 교체 필요`
            : null,
        memo: `${T} 메모 ${i + 1}`,
        diagnosisFee,
        totalDiscount: "0",
        finalAmount,
        repairProductText: `${T} 영남 ${i + 1}호 분무기`,
        receivedAt,
        startedAt:
          ["REPAIRING", "READY", "PICKED_UP"].includes(status)
            ? new Date(receivedAt.getTime() + 86400000)
            : null,
        readyAt:
          ["READY", "PICKED_UP"].includes(status)
            ? new Date(receivedAt.getTime() + 2 * 86400000)
            : null,
        pickedUpAt,
        cancelledAt,
        cancelReason: status === "CANCELLED" ? pick([...CANCEL_REASONS]) : null,
        cancelMemo: status === "CANCELLED" ? `${T} 취소 사유 메모` : null,
        paymentMethod:
          status === "PICKED_UP"
            ? pick(["CARD", "CASH", "UNPAID"] as const)
            : null,
        assignedToId: user.id,
      },
    });
    tickets.push(ticket.id);

    // PICKED_UP 일부에 부속/공임 추가
    if (status === "PICKED_UP" && i % 2 === 0) {
      const partProduct = pick(products);
      const partQty = rint(1, 3);
      const partUnit = Math.round(Number(partProduct.sellingPrice));
      await prisma.repairPart.create({
        data: {
          repairTicketId: ticket.id,
          productId: partProduct.id,
          quantity: partQty,
          unitPrice: partUnit,
          totalPrice: partUnit * partQty,
          status: "USED",
          consumedAt: receivedAt,
        },
      });
    }
    // 일부 LOST 부속 (회사 손실) — PICKED_UP 인 경우 30% 확률
    if (status === "PICKED_UP" && Math.random() < 0.3) {
      const partProduct = pick(products);
      await prisma.repairPart.create({
        data: {
          repairTicketId: ticket.id,
          productId: partProduct.id,
          quantity: 1,
          unitPrice: Math.round(Number(partProduct.sellingPrice)),
          totalPrice: Math.round(Number(partProduct.sellingPrice)),
          status: "LOST",
          billLost: false, // 회사 손실
          consumedAt: receivedAt,
        },
      });
    }
    // 공임
    if (
      ["REPAIRING", "READY", "PICKED_UP"].includes(status) &&
      i % 2 === 1
    ) {
      const labor = rint(20000, 80000);
      await prisma.repairLabor.create({
        data: {
          repairTicketId: ticket.id,
          name: `${T} 작업 ${i + 1}`,
          unitRate: labor,
          totalPrice: labor,
        },
      });
    }
  }
  console.log(`✓ 수리티켓 ${tickets.length}건`);

  // ── 7. 임대자산 5종 [T] ────────────────────────────────────────────
  const rentalAssets: { id: string; name: string }[] = [];
  for (let i = 0; i < 5; i++) {
    const name = `${T} 임대장비 ${i + 1}호`;
    const asset = await prisma.rentalAsset.create({
      data: {
        assetNo: `T-RA-${pad2(i + 1)}-${Date.now().toString(36).slice(-3).toUpperCase()}`,
        name,
        dailyRate: rint(10000, 50000),
        monthlyRate: rint(200000, 800000),
        depositAmount: rint(50000, 200000),
        memo: `${T} 시드 임대자산`,
      },
    });
    rentalAssets.push({ id: asset.id, name: asset.name });
  }
  console.log(`✓ 임대자산 ${rentalAssets.length}종`);

  // ── 8. 임대 15건 [T] ───────────────────────────────────────────────
  const RENTAL_STATUSES: ("RESERVED" | "ACTIVE" | "RETURNED" | "OVERDUE")[] = [
    "RESERVED",
    "ACTIVE",
    "RETURNED",
    "RETURNED",
    "RETURNED",
    "OVERDUE",
  ];
  const rentals: string[] = [];
  for (let i = 0; i < 15; i++) {
    const startDate = daysAgo(rint(0, 60));
    const days = rint(3, 30);
    const endDate = new Date(startDate.getTime() + days * 86400000);
    const status = RENTAL_STATUSES[i % RENTAL_STATUSES.length];
    const customer = pick(customers);
    const asset = pick(rentalAssets);
    const rentalNo = generateDocumentNo("REN", startDate);
    const unitRate = rint(10000, 50000);
    const rentalAmount = unitRate * days;
    const overdueAmount = status === "OVERDUE" ? rint(5000, 50000) : 0;
    const finalAmount =
      status === "RETURNED" ? rentalAmount + overdueAmount : 0;
    const actualReturnedAt =
      status === "RETURNED"
        ? new Date(endDate.getTime() - rint(0, 3) * 86400000)
        : null;

    const rental = await prisma.rental.create({
      data: {
        rentalNo,
        assetId: asset.id,
        customerId: customer.id,
        status,
        startDate,
        endDate,
        actualReturnedAt,
        rateType: "DAILY",
        unitRate,
        totalUnits: days,
        rentalAmount,
        depositAmount: rint(50000, 200000),
        depositReturned: status === "RETURNED",
        overdueAmount,
        finalAmount,
        paymentMethod:
          status === "RETURNED"
            ? pick(["CARD", "CASH", "TRANSFER"] as const)
            : null,
        memo: `${T} 시드 임대 ${i + 1}`,
        checkoutAt:
          status !== "RESERVED"
            ? new Date(startDate.getTime() + rint(0, 4) * 3600 * 1000)
            : null,
        createdById: user.id,
      },
    });
    rentals.push(rental.id);
  }
  console.log(`✓ 임대 ${rentals.length}건`);

  // ── 9. 시리얼아이템 10건 [T] ────────────────────────────────────────
  const serialProducts = products.filter((_, i) => i < 5);
  const serials: string[] = [];
  for (let i = 0; i < 10; i++) {
    const customer = pick(customers);
    const product = pick(serialProducts);
    const code = `T${pad2(i)}-${Date.now().toString(36).slice(-4).toUpperCase()}-${rint(100, 999)}`;
    const serial = await prisma.serialItem.create({
      data: {
        code,
        productId: product.id,
        customerId: customer.id,
        source: i % 3 === 0 ? "REPAIR" : "SALE",
        soldAt: daysAgo(rint(10, 200)),
        warrantyEnds: daysAgo(rint(-365, -10)), // 미래
        status: "ACTIVE",
      },
    });
    serials.push(serial.id);
  }
  console.log(`✓ 시리얼라벨 ${serials.length}건`);

  // ── 10. 견적서 5건 [T] ─────────────────────────────────────────────
  const quotations: string[] = [];
  for (let i = 0; i < 5; i++) {
    const customer = pick(customers);
    const items = pickN(products, rint(2, 4));
    const issueDate = daysAgo(rint(0, 30));
    const lines = items.map((p, idx) => {
      const qty = rint(1, 5);
      const unit = Math.round(Number(p.sellingPrice));
      return {
        productId: p.id,
        name: p.name,
        unitOfMeasure: "EA",
        quantity: qty,
        listPrice: unit,
        discountAmount: 0,
        unitPrice: unit,
        totalPrice: unit * qty,
        isTaxable: true,
        sortOrder: idx,
      };
    });
    const subtotal = lines.reduce((s, l) => s + l.totalPrice, 0);
    const tax = Math.round(subtotal * 0.1);

    const q = await prisma.quotation.create({
      data: {
        quotationNo: generateQuotationNo(issueDate),
        type: "SALES",
        status: i < 2 ? "DRAFT" : i < 4 ? "SENT" : "ACCEPTED",
        issueDate,
        validUntil: new Date(issueDate.getTime() + 30 * 86400000),
        customerId: customer.id,
        title: `${T} 견적 ${i + 1}`,
        subtotalAmount: subtotal,
        taxAmount: tax,
        totalAmount: subtotal + tax,
        createdById: user.id,
        items: { create: lines },
      },
    });
    quotations.push(q.id);
  }
  console.log(`✓ 견적서 ${quotations.length}건`);

  // ── 11. 거래명세표 3건 [T] ─────────────────────────────────────────
  const statements: string[] = [];
  for (let i = 0; i < 3; i++) {
    const customer = pick(customers);
    const items = pickN(products, rint(2, 3));
    const issueDate = daysAgo(rint(0, 14));
    const lines = items.map((p, idx) => {
      const qty = rint(1, 3);
      const unit = Math.round(Number(p.sellingPrice));
      return {
        productId: p.id,
        name: p.name,
        unitOfMeasure: "EA",
        quantity: qty,
        listPrice: unit,
        discountAmount: 0,
        unitPrice: unit,
        totalPrice: unit * qty,
        isTaxable: true,
        sortOrder: idx,
      };
    });
    const subtotal = lines.reduce((s, l) => s + l.totalPrice, 0);
    const tax = Math.round(subtotal * 0.1);

    const s = await prisma.statement.create({
      data: {
        statementNo: generateStatementNo(issueDate),
        status: "ISSUED",
        issueDate,
        customerId: customer.id,
        customerNameSnapshot: customer.name,
        customerPhoneSnapshot: customer.phone,
        subtotalAmount: subtotal,
        taxAmount: tax,
        totalAmount: subtotal + tax,
        createdById: user.id,
        items: { create: lines },
      },
    });
    statements.push(s.id);
  }
  console.log(`✓ 거래명세표 ${statements.length}건`);

  console.log("\n✅ 시드 완료. 모든 항목 [T] prefix 로 식별 가능.");
  console.log("정리: npx tsx scripts/_test-audit/cleanup-test-data.ts");
}

main()
  .catch((e) => {
    console.error("❌ 시드 실패:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
