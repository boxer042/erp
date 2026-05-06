/**
 * 발주 → 입고 흐름 검증 스크립트.
 *
 * 시나리오:
 * 1. 발주 1건 생성 (품목 2개)
 * 2. 부분 입고 (PENDING) → status=PARTIAL 자동 전환 + receivedQty 누적 검증
 * 3. 추가 입고 (PENDING, 잔량 모두) → status=RECEIVED 자동 전환 검증
 * 4. 입고 1건을 CANCELLED 로 → receivedQty 복원 + status=PARTIAL 강등 검증
 * 5. 사용자 명시 CLOSED 보호 검증 (재계산 호출 시 변경 안 됨)
 * 6. 데이터 cleanup
 *
 * 사용: npx tsx scripts/verify-purchase-order-flow.ts
 */

import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });
dotenv({ path: ".env" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { recalcPurchaseOrderProgress } from "../src/lib/purchase-order";
import { generatePurchaseOrderNo, generateDocumentNo, DOC_PREFIX } from "../src/lib/document-no";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const PASS = "\x1b[32m✓\x1b[0m";
const FAIL = "\x1b[31m✗\x1b[0m";
const INFO = "\x1b[36mℹ\x1b[0m";

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string, actual?: unknown, expected?: unknown) {
  if (condition) {
    console.log(`  ${PASS} ${message}`);
    testsPassed++;
  } else {
    console.log(`  ${FAIL} ${message}`);
    if (actual !== undefined || expected !== undefined) {
      console.log(`     expected: ${JSON.stringify(expected)}`);
      console.log(`     actual:   ${JSON.stringify(actual)}`);
    }
    testsFailed++;
  }
}

async function main() {
  console.log("\n=== 발주 흐름 검증 시작 ===\n");

  // ─── 0. 사전 조건 ─────────────────────────────────────
  const user = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!user) throw new Error("ADMIN 사용자가 필요합니다");
  console.log(`${INFO} 테스트 사용자: ${user.name} (${user.email})`);

  // 거래처 + 공급상품 2개 이상 보유한 거래처 찾기
  const supplier = await prisma.supplier.findFirst({
    where: { isActive: true },
    include: { supplierProducts: { where: { isActive: true }, take: 2 } },
  });
  if (!supplier || supplier.supplierProducts.length < 2) {
    throw new Error(
      "공급상품을 2개 이상 보유한 거래처가 없습니다. 검증 전에 거래처/공급상품을 등록하세요."
    );
  }
  const [sp1, sp2] = supplier.supplierProducts;
  console.log(`${INFO} 테스트 거래처: ${supplier.name}`);
  console.log(`${INFO} 공급상품 1: ${sp1.name} (${sp1.id})`);
  console.log(`${INFO} 공급상품 2: ${sp2.name} (${sp2.id})\n`);

  let createdPoId: string | null = null;
  const createdIncomingIds: string[] = [];

  try {
    // ─── 1. 발주 생성 ─────────────────────────────────────
    console.log("[1] 발주 생성");
    const po = await prisma.purchaseOrder.create({
      data: {
        poNo: generatePurchaseOrderNo(),
        supplierId: supplier.id,
        status: "CONFIRMED", // 즉시 입고 가능 상태로
        orderDate: new Date(),
        totalAmount: 10 * 1000 + 5 * 2000, // 20,000
        memo: "[검증 스크립트 테스트 데이터 — 자동 정리됨]",
        createdById: user.id,
        items: {
          create: [
            { supplierProductId: sp1.id, quantity: 10, unitPrice: 1000, totalPrice: 10000, sortOrder: 0 },
            { supplierProductId: sp2.id, quantity: 5, unitPrice: 2000, totalPrice: 10000, sortOrder: 1 },
          ],
        },
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    createdPoId = po.id;
    assert(po.poNo.startsWith("PO"), "발주번호 PO 접두사");
    assert(po.status === "CONFIRMED", "초기 상태 CONFIRMED");
    assert(po.items.length === 2, "발주 항목 2건");
    assert(
      po.items.every((it) => Number(it.receivedQty) === 0),
      "초기 receivedQty 모두 0"
    );

    const [poItem1, poItem2] = po.items;

    // ─── 2. 부분 입고 1 ──────────────────────────────────
    console.log("\n[2] 부분 입고 1 (sp1: 4/10, sp2: 2/5)");
    const incoming1 = await prisma.$transaction(async (tx) => {
      const inc = await tx.incoming.create({
        data: {
          incomingNo: generateDocumentNo(DOC_PREFIX.INCOMING),
          supplierId: supplier.id,
          status: "PENDING",
          incomingDate: new Date(),
          totalAmount: 4 * 1000 + 2 * 2000,
          purchaseOrderId: po.id,
          createdById: user.id,
          items: {
            create: [
              {
                supplierProductId: sp1.id,
                quantity: 4,
                unitPrice: 1000,
                totalPrice: 4000,
                purchaseOrderItemId: poItem1.id,
              },
              {
                supplierProductId: sp2.id,
                quantity: 2,
                unitPrice: 2000,
                totalPrice: 4000,
                purchaseOrderItemId: poItem2.id,
              },
            ],
          },
        },
      });
      await recalcPurchaseOrderProgress(tx, po.id);
      return inc;
    });
    createdIncomingIds.push(incoming1.id);

    const poAfter1 = await prisma.purchaseOrder.findUnique({
      where: { id: po.id },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    assert(poAfter1!.status === "PARTIAL", "발주 status=PARTIAL", poAfter1!.status, "PARTIAL");
    assert(
      Number(poAfter1!.items[0].receivedQty) === 4,
      "sp1 receivedQty=4",
      Number(poAfter1!.items[0].receivedQty),
      4
    );
    assert(
      Number(poAfter1!.items[1].receivedQty) === 2,
      "sp2 receivedQty=2",
      Number(poAfter1!.items[1].receivedQty),
      2
    );

    // ─── 3. 추가 입고 (잔량 모두) ─────────────────────────
    console.log("\n[3] 추가 입고 2 (sp1: 6/10, sp2: 3/5 — 잔량 모두)");
    const incoming2 = await prisma.$transaction(async (tx) => {
      const inc = await tx.incoming.create({
        data: {
          incomingNo: generateDocumentNo(DOC_PREFIX.INCOMING),
          supplierId: supplier.id,
          status: "PENDING",
          incomingDate: new Date(),
          totalAmount: 6 * 1000 + 3 * 2000,
          purchaseOrderId: po.id,
          createdById: user.id,
          items: {
            create: [
              {
                supplierProductId: sp1.id,
                quantity: 6,
                unitPrice: 1000,
                totalPrice: 6000,
                purchaseOrderItemId: poItem1.id,
              },
              {
                supplierProductId: sp2.id,
                quantity: 3,
                unitPrice: 2000,
                totalPrice: 6000,
                purchaseOrderItemId: poItem2.id,
              },
            ],
          },
        },
      });
      await recalcPurchaseOrderProgress(tx, po.id);
      return inc;
    });
    createdIncomingIds.push(incoming2.id);

    const poAfter2 = await prisma.purchaseOrder.findUnique({
      where: { id: po.id },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    assert(poAfter2!.status === "RECEIVED", "발주 status=RECEIVED", poAfter2!.status, "RECEIVED");
    assert(
      Number(poAfter2!.items[0].receivedQty) === 10,
      "sp1 receivedQty=10",
      Number(poAfter2!.items[0].receivedQty),
      10
    );
    assert(
      Number(poAfter2!.items[1].receivedQty) === 5,
      "sp2 receivedQty=5",
      Number(poAfter2!.items[1].receivedQty),
      5
    );

    // ─── 4. 입고 1 CANCELLED → receivedQty 복원 ─────────
    console.log("\n[4] 입고 1 취소 (PARTIAL 로 강등)");
    await prisma.$transaction(async (tx) => {
      await tx.incoming.update({
        where: { id: incoming1.id },
        data: { status: "CANCELLED" },
      });
      await recalcPurchaseOrderProgress(tx, po.id);
    });

    const poAfter3 = await prisma.purchaseOrder.findUnique({
      where: { id: po.id },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    assert(poAfter3!.status === "PARTIAL", "발주 status=PARTIAL (강등)", poAfter3!.status, "PARTIAL");
    assert(
      Number(poAfter3!.items[0].receivedQty) === 6,
      "sp1 receivedQty=6 (4 차감 후)",
      Number(poAfter3!.items[0].receivedQty),
      6
    );
    assert(
      Number(poAfter3!.items[1].receivedQty) === 3,
      "sp2 receivedQty=3 (2 차감 후)",
      Number(poAfter3!.items[1].receivedQty),
      3
    );

    // ─── 5. CLOSED 상태 보호 검증 ──────────────────────
    console.log("\n[5] CLOSED 상태에서 재계산 호출 시 변경 안 됨");
    await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: { status: "CLOSED" },
    });
    await prisma.$transaction(async (tx) => {
      await recalcPurchaseOrderProgress(tx, po.id);
    });
    const poAfter4 = await prisma.purchaseOrder.findUnique({
      where: { id: po.id },
    });
    assert(
      poAfter4!.status === "CLOSED",
      "CLOSED 보호: 자동 전환 차단",
      poAfter4!.status,
      "CLOSED"
    );

    // ─── 6. 모두 0인 경우 PARTIAL → CONFIRMED 강등 ──────
    console.log("\n[6] 모든 입고 취소 시 CONFIRMED 로 복원");
    // 다시 PARTIAL 로 설정 후 모든 입고 취소 → CONFIRMED 검증
    await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: { status: "PARTIAL" },
    });
    await prisma.$transaction(async (tx) => {
      await tx.incoming.update({
        where: { id: incoming2.id },
        data: { status: "CANCELLED" },
      });
      await recalcPurchaseOrderProgress(tx, po.id);
    });
    const poAfter5 = await prisma.purchaseOrder.findUnique({
      where: { id: po.id },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    assert(
      poAfter5!.status === "CONFIRMED",
      "모든 입고 취소 후 status=CONFIRMED",
      poAfter5!.status,
      "CONFIRMED"
    );
    assert(
      Number(poAfter5!.items[0].receivedQty) === 0,
      "sp1 receivedQty=0 (모두 복원)",
      Number(poAfter5!.items[0].receivedQty),
      0
    );
    assert(
      Number(poAfter5!.items[1].receivedQty) === 0,
      "sp2 receivedQty=0 (모두 복원)",
      Number(poAfter5!.items[1].receivedQty),
      0
    );

    // ─── 7. low-stock API 매핑 응답 형태 검증 (간이) ─────
    console.log("\n[7] low-stock API 응답에 mappings 키 포함 여부");
    // 직접 raw query 흉내내지 말고 — 그냥 ProductMapping 의 supplier select 형태를 검증
    const sampleMapping = await prisma.productMapping.findFirst({
      include: {
        supplierProduct: {
          select: {
            id: true,
            name: true,
            supplierCode: true,
            unitPrice: true,
            unitOfMeasure: true,
            supplier: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (sampleMapping) {
      assert(
        typeof sampleMapping.supplierProduct.supplier.id === "string",
        "ProductMapping → SupplierProduct → Supplier join 동작",
      );
    } else {
      console.log(`  ${INFO} ProductMapping 데이터 없음 — 스킵`);
    }
  } finally {
    // ─── Cleanup ───────────────────────────────────────
    console.log("\n[cleanup] 테스트 데이터 정리");
    if (createdIncomingIds.length > 0) {
      await prisma.incoming.deleteMany({
        where: { id: { in: createdIncomingIds } },
      });
      console.log(`  ${INFO} 입고 ${createdIncomingIds.length}건 삭제`);
    }
    if (createdPoId) {
      await prisma.purchaseOrder.delete({ where: { id: createdPoId } });
      console.log(`  ${INFO} 발주 1건 삭제`);
    }
  }

  console.log("\n=== 결과 ===");
  console.log(`  통과: ${testsPassed}`);
  console.log(`  실패: ${testsFailed}`);
  if (testsFailed > 0) {
    process.exit(1);
  }
}

main()
  .catch(async (e) => {
    console.error("\n검증 중 에러:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
