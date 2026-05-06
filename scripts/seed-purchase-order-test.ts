/**
 * 발주 페이지 UI 검증용 시드 + 인라인 검증.
 *
 * 7가지 시나리오 (모든 입고는 PENDING 또는 직접 status 설정 — 재고/lot/ledger 영향 없음):
 *   A) DRAFT              — 작성 후 미발송
 *   B) SENT               — 거래처 발송, 수락 대기
 *   C) CONFIRMED          — 수락됨, 입고 안 함
 *   D) PARTIAL            — 부분입고 발생 (CONFIRMED 일부)
 *   E) PARTIAL_RESENT     — 잔량 재요청 발송
 *   F) PARTIAL_REACCEPTED — 재요청 수락, 잔여 입고 대기
 *   G) PARTIAL_COMPLETED  — 부분입고 후 모두 받음 (이력 보존)
 *
 * 실행: npx tsx scripts/seed-purchase-order-test.ts
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

let passed = 0;
let failed = 0;
function check(cond: boolean, msg: string, actual?: unknown, expected?: unknown) {
  if (cond) {
    console.log(`    ${PASS} ${msg}`);
    passed++;
  } else {
    console.log(`    ${FAIL} ${msg}`);
    if (actual !== undefined || expected !== undefined) {
      console.log(`       expected: ${JSON.stringify(expected)}`);
      console.log(`       actual:   ${JSON.stringify(actual)}`);
    }
    failed++;
  }
}

async function cleanupPrevious() {
  const previous = await prisma.purchaseOrder.findMany({
    where: { memo: { startsWith: "[테스트]" } },
    select: { id: true, incomings: { select: { id: true, items: { select: { id: true } } } } },
  });
  if (previous.length === 0) return;
  const incIds = previous.flatMap((p) => p.incomings.map((i) => i.id));
  const incItemIds = previous.flatMap((p) => p.incomings.flatMap((i) => i.items.map((it) => it.id)));
  const lots = await prisma.inventoryLot.findMany({
    where: { incomingItemId: { in: incItemIds } },
    select: { id: true, productId: true },
  });
  if (lots.length > 0) {
    await prisma.lotConsumption.deleteMany({ where: { lotId: { in: lots.map((l) => l.id) } } });
    await prisma.inventoryLot.deleteMany({ where: { id: { in: lots.map((l) => l.id) } } });
  }
  await prisma.inventoryMovement.deleteMany({
    where: { referenceType: "INCOMING", referenceId: { in: incIds } },
  });
  await prisma.supplierLedger.deleteMany({
    where: { referenceType: "INCOMING", referenceId: { in: incIds } },
  });
  await prisma.expense.deleteMany({
    where: { referenceType: "INCOMING", referenceId: { in: incIds } },
  });
  if (incIds.length > 0) await prisma.incoming.deleteMany({ where: { id: { in: incIds } } });
  await prisma.purchaseOrder.deleteMany({ where: { id: { in: previous.map((p) => p.id) } } });
  const affectedPids = Array.from(new Set(lots.map((l) => l.productId).filter((id): id is string => !!id)));
  for (const pid of affectedPids) {
    const agg = await prisma.inventoryLot.aggregate({
      where: { productId: pid },
      _sum: { remainingQty: true },
    });
    await prisma.inventory.update({
      where: { productId: pid },
      data: { quantity: Number(agg._sum.remainingQty ?? 0) },
    });
  }
  console.log(
    `${INFO} 이전 [테스트] 발주 ${previous.length}건 + 입고 ${incIds.length}건 + lot ${lots.length}건 정리\n`
  );
}

async function main() {
  console.log("\n=== 발주 시드 + 검증 (B 옵션 정책) ===\n");

  await cleanupPrevious();

  const user = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!user) throw new Error("ADMIN 사용자 필요");

  const supplier = await prisma.supplier.findFirst({
    where: { isActive: true },
    include: { supplierProducts: { where: { isActive: true }, take: 2 } },
  });
  if (!supplier || supplier.supplierProducts.length < 2) {
    throw new Error("공급상품 2개 이상 보유한 거래처 필요");
  }
  const [sp1] = supplier.supplierProducts;
  console.log(`거래처: ${supplier.name}`);
  console.log(`공급상품: ${sp1.name}\n`);

  // ─── A. DRAFT ─────────────────────────────────────────
  console.log("[A] DRAFT — 작성 후 미발송");
  const poA = await prisma.purchaseOrder.create({
    data: {
      poNo: generatePurchaseOrderNo(),
      supplierId: supplier.id,
      status: "DRAFT",
      orderDate: new Date(),
      totalAmount: 10 * 1000,
      memo: "[테스트] DRAFT — 작성중. '발송' / '취소' / '편집' 버튼 시도 가능.",
      createdById: user.id,
      items: {
        create: [{ supplierProductId: sp1.id, quantity: 10, unitPrice: 1000, totalPrice: 10000, sortOrder: 0 }],
      },
    },
  });
  console.log(`    ${INFO} ${poA.poNo}`);
  check(poA.status === "DRAFT", "status=DRAFT");

  // ─── B. SENT ──────────────────────────────────────────
  console.log("\n[B] SENT — 거래처 발송, 수락 대기");
  const poB = await prisma.purchaseOrder.create({
    data: {
      poNo: generatePurchaseOrderNo(),
      supplierId: supplier.id,
      status: "SENT",
      orderDate: new Date(),
      totalAmount: 10 * 1000,
      memo: "[테스트] SENT — 거래처에 발주 보냄. '수락' 버튼 클릭하면 CONFIRMED 로 전환.",
      createdById: user.id,
      items: {
        create: [{ supplierProductId: sp1.id, quantity: 10, unitPrice: 1000, totalPrice: 10000, sortOrder: 0 }],
      },
    },
  });
  console.log(`    ${INFO} ${poB.poNo}`);
  check(poB.status === "SENT", "status=SENT");

  // ─── C. CONFIRMED ─────────────────────────────────────
  console.log("\n[C] CONFIRMED — 수락됨, 입고 안 함");
  const poC = await prisma.purchaseOrder.create({
    data: {
      poNo: generatePurchaseOrderNo(),
      supplierId: supplier.id,
      status: "CONFIRMED",
      orderDate: new Date(),
      totalAmount: 10 * 1000,
      memo: "[테스트] CONFIRMED — 거래처 수락 완료. '입고 등록' 버튼으로 입고 시작 가능.",
      createdById: user.id,
      items: {
        create: [{ supplierProductId: sp1.id, quantity: 10, unitPrice: 1000, totalPrice: 10000, sortOrder: 0 }],
      },
    },
  });
  console.log(`    ${INFO} ${poC.poNo}`);
  check(poC.status === "CONFIRMED", "status=CONFIRMED");

  // ─── D. PARTIAL ──────────────────────────────────────
  // CONFIRMED 입고 1건 + PENDING 입고 1건 → status=PARTIAL (자동 전환 후 그대로)
  console.log("\n[D] PARTIAL — 부분입고 발생 (CONFIRMED 4 + PENDING 3, 잔량 3)");
  const poD = await prisma.purchaseOrder.create({
    data: {
      poNo: generatePurchaseOrderNo(),
      supplierId: supplier.id,
      status: "CONFIRMED",
      orderDate: new Date(Date.now() - 86400_000),
      totalAmount: 10 * 1000,
      memo: "[테스트] PARTIAL — 부분입고 발생. '잔량 재요청' / '부분입고 종결' / '추가 입고 등록' 액션.",
      createdById: user.id,
      items: {
        create: [{ supplierProductId: sp1.id, quantity: 10, unitPrice: 1000, totalPrice: 10000, sortOrder: 0 }],
      },
    },
    include: { items: true },
  });
  await prisma.$transaction(async (tx) => {
    await tx.incoming.create({
      data: {
        incomingNo: generateDocumentNo(DOC_PREFIX.INCOMING),
        supplierId: supplier.id,
        status: "CONFIRMED",
        incomingDate: new Date(Date.now() - 86400_000),
        totalAmount: 4 * 1000,
        purchaseOrderId: poD.id,
        memo: "[테스트] 발주 D 의 1차 확정 입고 (4)",
        createdById: user.id,
        items: {
          create: [{
            supplierProductId: sp1.id, quantity: 4, unitPrice: 1000, totalPrice: 4000,
            purchaseOrderItemId: poD.items[0].id,
          }],
        },
      },
    });
    await tx.incoming.create({
      data: {
        incomingNo: generateDocumentNo(DOC_PREFIX.INCOMING),
        supplierId: supplier.id,
        status: "PENDING",
        incomingDate: new Date(),
        totalAmount: 3 * 1000,
        purchaseOrderId: poD.id,
        memo: "[테스트] 발주 D 의 2차 PENDING 입고 (3)",
        createdById: user.id,
        items: {
          create: [{
            supplierProductId: sp1.id, quantity: 3, unitPrice: 1000, totalPrice: 3000,
            purchaseOrderItemId: poD.items[0].id,
          }],
        },
      },
    });
    await recalcPurchaseOrderProgress(tx, poD.id);
  });
  const poDAfter = await prisma.purchaseOrder.findUnique({ where: { id: poD.id }, include: { items: true } });
  console.log(`    ${INFO} ${poD.poNo}`);
  check(poDAfter!.status === "PARTIAL", "status=PARTIAL", poDAfter!.status, "PARTIAL");
  check(Number(poDAfter!.items[0].receivedQty) === 4, "receivedQty=4 (CONFIRMED 만)");

  // ─── E. PARTIAL_RESENT ────────────────────────────────
  console.log("\n[E] PARTIAL_RESENT — 잔량 재요청 발송 (사용자 수동 액션)");
  const poE = await prisma.purchaseOrder.create({
    data: {
      poNo: generatePurchaseOrderNo(),
      supplierId: supplier.id,
      status: "CONFIRMED",
      orderDate: new Date(Date.now() - 3 * 86400_000),
      totalAmount: 10 * 1000,
      memo: "[테스트] PARTIAL_RESENT — 부분입고 후 잔량 거래처에 재요청. '재요청 수락' 또는 '부분입고 종결'.",
      createdById: user.id,
      items: {
        create: [{ supplierProductId: sp1.id, quantity: 10, unitPrice: 1000, totalPrice: 10000, sortOrder: 0 }],
      },
    },
    include: { items: true },
  });
  await prisma.$transaction(async (tx) => {
    await tx.incoming.create({
      data: {
        incomingNo: generateDocumentNo(DOC_PREFIX.INCOMING),
        supplierId: supplier.id,
        status: "CONFIRMED",
        incomingDate: new Date(Date.now() - 2 * 86400_000),
        totalAmount: 6 * 1000,
        purchaseOrderId: poE.id,
        memo: "[테스트] 발주 E 의 1차 확정 입고 (6)",
        createdById: user.id,
        items: {
          create: [{
            supplierProductId: sp1.id, quantity: 6, unitPrice: 1000, totalPrice: 6000,
            purchaseOrderItemId: poE.items[0].id,
          }],
        },
      },
    });
    await recalcPurchaseOrderProgress(tx, poE.id);
    // 사용자 수동 액션 시뮬레이션 — PARTIAL_RESENT 로 전환
    await tx.purchaseOrder.update({ where: { id: poE.id }, data: { status: "PARTIAL_RESENT" } });
  });
  const poEAfter = await prisma.purchaseOrder.findUnique({ where: { id: poE.id }, include: { items: true } });
  console.log(`    ${INFO} ${poE.poNo}`);
  check(poEAfter!.status === "PARTIAL_RESENT", "status=PARTIAL_RESENT", poEAfter!.status, "PARTIAL_RESENT");
  check(Number(poEAfter!.items[0].receivedQty) === 6, "receivedQty=6");

  // ─── F. PARTIAL_REACCEPTED ───────────────────────────
  console.log("\n[F] PARTIAL_REACCEPTED — 재요청 수락, 잔여 입고 대기");
  const poF = await prisma.purchaseOrder.create({
    data: {
      poNo: generatePurchaseOrderNo(),
      supplierId: supplier.id,
      status: "CONFIRMED",
      orderDate: new Date(Date.now() - 5 * 86400_000),
      totalAmount: 10 * 1000,
      memo: "[테스트] PARTIAL_REACCEPTED — 거래처가 재요청 수락. 잔량 4 입고 대기. '추가 입고 등록' 가능.",
      createdById: user.id,
      items: {
        create: [{ supplierProductId: sp1.id, quantity: 10, unitPrice: 1000, totalPrice: 10000, sortOrder: 0 }],
      },
    },
    include: { items: true },
  });
  await prisma.$transaction(async (tx) => {
    await tx.incoming.create({
      data: {
        incomingNo: generateDocumentNo(DOC_PREFIX.INCOMING),
        supplierId: supplier.id,
        status: "CONFIRMED",
        incomingDate: new Date(Date.now() - 4 * 86400_000),
        totalAmount: 6 * 1000,
        purchaseOrderId: poF.id,
        memo: "[테스트] 발주 F 의 1차 확정 입고 (6)",
        createdById: user.id,
        items: {
          create: [{
            supplierProductId: sp1.id, quantity: 6, unitPrice: 1000, totalPrice: 6000,
            purchaseOrderItemId: poF.items[0].id,
          }],
        },
      },
    });
    await recalcPurchaseOrderProgress(tx, poF.id);
    await tx.purchaseOrder.update({ where: { id: poF.id }, data: { status: "PARTIAL_REACCEPTED" } });
  });
  const poFAfter = await prisma.purchaseOrder.findUnique({ where: { id: poF.id }, include: { items: true } });
  console.log(`    ${INFO} ${poF.poNo}`);
  check(poFAfter!.status === "PARTIAL_REACCEPTED", "status=PARTIAL_REACCEPTED");

  // ─── G. PARTIAL_COMPLETED ────────────────────────────
  // 부분입고 후 잔여 입고 모두 확정 → 자동으로 PARTIAL_COMPLETED 전환
  console.log("\n[G] PARTIAL_COMPLETED — 부분입고 후 모두 받음 (이력 보존, RECEIVED 대신)");
  const poG = await prisma.purchaseOrder.create({
    data: {
      poNo: generatePurchaseOrderNo(),
      supplierId: supplier.id,
      status: "CONFIRMED",
      orderDate: new Date(Date.now() - 7 * 86400_000),
      totalAmount: 10 * 1000,
      memo: "[테스트] PARTIAL_COMPLETED — 부분입고 발생 후 잔량 모두 받음. 이력 보존용.",
      createdById: user.id,
      items: {
        create: [{ supplierProductId: sp1.id, quantity: 10, unitPrice: 1000, totalPrice: 10000, sortOrder: 0 }],
      },
    },
    include: { items: true },
  });
  await prisma.$transaction(async (tx) => {
    // 1차 확정 (6) → PARTIAL
    await tx.incoming.create({
      data: {
        incomingNo: generateDocumentNo(DOC_PREFIX.INCOMING),
        supplierId: supplier.id,
        status: "CONFIRMED",
        incomingDate: new Date(Date.now() - 6 * 86400_000),
        totalAmount: 6 * 1000,
        purchaseOrderId: poG.id,
        memo: "[테스트] 발주 G 1차",
        createdById: user.id,
        items: {
          create: [{
            supplierProductId: sp1.id, quantity: 6, unitPrice: 1000, totalPrice: 6000,
            purchaseOrderItemId: poG.items[0].id,
          }],
        },
      },
    });
    await recalcPurchaseOrderProgress(tx, poG.id);
    // 2차 확정 (4) → PARTIAL_COMPLETED 자동 전환
    await tx.incoming.create({
      data: {
        incomingNo: generateDocumentNo(DOC_PREFIX.INCOMING),
        supplierId: supplier.id,
        status: "CONFIRMED",
        incomingDate: new Date(Date.now() - 86400_000),
        totalAmount: 4 * 1000,
        purchaseOrderId: poG.id,
        memo: "[테스트] 발주 G 2차 (잔량)",
        createdById: user.id,
        items: {
          create: [{
            supplierProductId: sp1.id, quantity: 4, unitPrice: 1000, totalPrice: 4000,
            purchaseOrderItemId: poG.items[0].id,
          }],
        },
      },
    });
    await recalcPurchaseOrderProgress(tx, poG.id);
  });
  const poGAfter = await prisma.purchaseOrder.findUnique({ where: { id: poG.id }, include: { items: true } });
  console.log(`    ${INFO} ${poG.poNo}`);
  check(poGAfter!.status === "PARTIAL_COMPLETED", "status=PARTIAL_COMPLETED (부분입고 이력 보존)", poGAfter!.status, "PARTIAL_COMPLETED");
  check(Number(poGAfter!.items[0].receivedQty) === 10, "receivedQty=10 (모두 충족)");

  // ─── 결과 ─────────────────────────────────────────────
  console.log("\n=== 검증 결과 ===");
  console.log(`  통과: ${passed}`);
  console.log(`  실패: ${failed}`);
  console.log("\n발주 페이지에서 7건 확인 가능:");
  console.log(`  A) ${poA.poNo} — 작성중`);
  console.log(`  B) ${poB.poNo} — 발송`);
  console.log(`  C) ${poC.poNo} — 수락`);
  console.log(`  D) ${poD.poNo} — 부분입고 발생`);
  console.log(`  E) ${poE.poNo} — 부분입고 재발송`);
  console.log(`  F) ${poF.poNo} — 부분입고 수락`);
  console.log(`  G) ${poG.poNo} — 부분입고 완료`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("시드 에러:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
