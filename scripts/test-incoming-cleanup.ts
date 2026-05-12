// 통합 시나리오 테스트 — dev DB 에 격리된 테스트 데이터로 cleanup/restore 헬퍼 검증
// 실행: source .env.local && npx tsx /tmp/test-incoming-cleanup.ts

import { prisma } from "../src/lib/prisma";
import {
  restorePriceHistoryForIncoming,
  cleanupOrphanedAutoProduct,
  cleanupOrphanedSupplierProduct,
} from "../src/lib/incoming-cleanup";

const TAG = "__TEST_UNCONFIRM__";

let pass = 0;
let fail = 0;

function assert(cond: boolean, label: string) {
  if (cond) {
    console.log(`  ✅ ${label}`);
    pass++;
  } else {
    console.log(`  ❌ ${label}`);
    fail++;
  }
}

async function cleanupTestData() {
  // 태그 prefix 로 만든 테스트 데이터 전체 정리
  // 순서: history → mapping → lot → movement → inventory → product → incoming_item → incoming → sp → supplier → user
  const sps = await prisma.supplierProduct.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  const products = await prisma.product.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  const incomings = await prisma.incoming.findMany({ where: { memo: { startsWith: TAG } }, select: { id: true } });

  const spIds = sps.map((s) => s.id);
  const productIds = products.map((p) => p.id);
  const incomingIds = incomings.map((i) => i.id);

  if (incomingIds.length > 0) {
    await prisma.supplierLedger.deleteMany({ where: { referenceId: { in: incomingIds }, referenceType: "INCOMING" } });
    await prisma.expense.deleteMany({ where: { referenceId: { in: incomingIds }, referenceType: "INCOMING" } });
    await prisma.inventoryMovement.deleteMany({ where: { referenceId: { in: incomingIds } } });
  }
  if (spIds.length > 0) {
    await prisma.inventoryLot.deleteMany({ where: { supplierProductId: { in: spIds } } });
  }
  if (productIds.length > 0) {
    await prisma.inventoryLot.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventory.deleteMany({ where: { productId: { in: productIds } } });
  }
  if (incomingIds.length > 0) {
    await prisma.incomingItem.deleteMany({ where: { incomingId: { in: incomingIds } } });
    await prisma.incoming.deleteMany({ where: { id: { in: incomingIds } } });
  }
  if (spIds.length > 0) {
    await prisma.supplierProduct.deleteMany({ where: { id: { in: spIds } } });
  }
  if (productIds.length > 0) {
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  }
  const suppliers = await prisma.supplier.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  if (suppliers.length > 0) {
    await prisma.supplier.deleteMany({ where: { id: { in: suppliers.map((s) => s.id) } } });
  }
}

async function setupSupplier() {
  return prisma.supplier.create({
    data: { name: `${TAG}_supplier_${Date.now()}`, paymentMethod: "PREPAID" },
  });
}

// =====================================================
// 시나리오 1 — A1: 잘못된 새 SP + 자동 Product 정리
// =====================================================
async function scenarioA1() {
  console.log("\n=== 시나리오 A1: 잘못된 새 SP + 자동 Product 정리 ===");

  const supplier = await setupSupplier();

  // 새 SP 만들기 — 매핑 없음
  const sp = await prisma.supplierProduct.create({
    data: {
      supplierId: supplier.id,
      name: `${TAG}_겹용너트_오타`,
      unitOfMeasure: "EA",
      listPrice: 5000,
      unitPrice: 5000,
    },
  });

  // ensureMapping 흐름 시뮬레이션: 자동 Product + ProductMapping 생성
  const autoProduct = await prisma.product.create({
    data: {
      name: sp.name,
      sku: `AUTO-TEST-${Date.now()}`,
      unitOfMeasure: "EA",
      listPrice: 5000,
      sellingPrice: 0,
      autoMapped: true,
    },
  });
  await prisma.productMapping.create({
    data: { supplierProductId: sp.id, productId: autoProduct.id, conversionRate: 1 },
  });
  // Inventory + price history 도 추가해 입고 확정 상태 모사
  const inventory = await prisma.inventory.create({
    data: { productId: autoProduct.id, quantity: 0 },
  });

  // SP 가 다른 IncomingItem 으로 참조되지 않은 상태 (update 후 미참조)
  const result = await prisma.$transaction(async (tx) => {
    return await cleanupOrphanedSupplierProduct(tx, sp.id);
  });

  assert(result === true, "cleanupOrphanedSupplierProduct returned true");

  const spCheck = await prisma.supplierProduct.findUnique({ where: { id: sp.id } });
  assert(spCheck === null, "잘못된 SupplierProduct hard delete 됨");

  const productCheck = await prisma.product.findUnique({ where: { id: autoProduct.id } });
  assert(productCheck === null, "자동 생성 Product hard delete 됨");

  const invCheck = await prisma.inventory.findUnique({ where: { id: inventory.id } });
  assert(invCheck === null, "Inventory 행 hard delete 됨");
}

// =====================================================
// 시나리오 2 — SP 가 다른 곳에서 참조 중일 때 cleanup 거부
// =====================================================
async function scenarioGuardSP() {
  console.log("\n=== 시나리오 가드: SP 가 IncomingItem 참조 중이면 cleanup 거부 ===");

  const supplier = await setupSupplier();
  const sp = await prisma.supplierProduct.create({
    data: {
      supplierId: supplier.id,
      name: `${TAG}_정상SP`,
      unitOfMeasure: "EA",
      listPrice: 1000,
      unitPrice: 1000,
    },
  });
  const incoming = await prisma.incoming.create({
    data: {
      incomingNo: `IN-TEST-${Date.now()}`,
      supplierId: supplier.id,
      incomingDate: new Date(),
      memo: TAG,
      createdById: (await prisma.user.findFirst())?.id ?? "",
    },
  });
  await prisma.incomingItem.create({
    data: {
      incomingId: incoming.id,
      supplierProductId: sp.id,
      quantity: 1,
      unitPrice: 1000,
      totalPrice: 1000,
    },
  });

  const result = await prisma.$transaction(async (tx) => {
    return await cleanupOrphanedSupplierProduct(tx, sp.id);
  });

  assert(result === false, "IncomingItem 참조 중일 때 cleanup 거부 (false 반환)");

  const spCheck = await prisma.supplierProduct.findUnique({ where: { id: sp.id } });
  assert(spCheck !== null, "참조 중인 SP 는 유지됨");
}

// =====================================================
// 시나리오 3 — autoMapped=false Product 는 cleanup 안 함
// =====================================================
async function scenarioGuardAutoMapped() {
  console.log("\n=== 시나리오 가드: autoMapped=false Product 는 cleanup 거부 ===");

  const normalProduct = await prisma.product.create({
    data: {
      name: `${TAG}_정상Product`,
      sku: `NORMAL-TEST-${Date.now()}`,
      unitOfMeasure: "EA",
      listPrice: 1000,
      sellingPrice: 1500,
      autoMapped: false,
    },
  });

  const result = await prisma.$transaction(async (tx) => {
    return await cleanupOrphanedAutoProduct(tx, normalProduct.id);
  });

  assert(result === false, "autoMapped=false 면 cleanup 거부 (false 반환)");

  const check = await prisma.product.findUnique({ where: { id: normalProduct.id } });
  assert(check !== null, "정상 Product 는 유지됨");
}

// =====================================================
// 시나리오 4 — B2: 기존 SP 가격 변경 → 원복
// =====================================================
async function scenarioB2_PriceRestore() {
  console.log("\n=== 시나리오 B2: 기존 SP 가격 변경 → unconfirm 시 원복 ===");

  const supplier = await setupSupplier();

  // SP 초기값 — listPrice=10000, unitPrice=10000
  const sp = await prisma.supplierProduct.create({
    data: {
      supplierId: supplier.id,
      name: `${TAG}_기존SP_B2`,
      unitOfMeasure: "EA",
      listPrice: 10000,
      unitPrice: 10000,
    },
  });

  // 첫 정상 입고 시뮬레이션 — listPrice=10000 → 11000, unitPrice=10000 → 11000
  const incoming1 = await prisma.incoming.create({
    data: {
      incomingNo: `IN-TEST-1-${Date.now()}`,
      supplierId: supplier.id,
      incomingDate: new Date("2026-01-01"),
      memo: TAG,
      createdById: (await prisma.user.findFirst())?.id ?? "",
      status: "CONFIRMED",
    },
  });
  await prisma.supplierProductPriceHistory.create({
    data: {
      supplierProductId: sp.id,
      oldPrice: 10000,
      newPrice: 11000,
      changeAmount: 1000,
      changePercent: 10,
      originalPrice: 11000, // 첫 변경에서 listPrice 도 11000 으로 갱신됐다고 가정
      incomingId: incoming1.id,
      createdAt: new Date("2026-01-01T10:00:00"),
    },
  });
  await prisma.supplierProduct.update({
    where: { id: sp.id },
    data: { unitPrice: 11000, listPrice: 11000 },
  });

  // 두 번째 입고 (잘못된 가격) — unitPrice=11000 → 99000, listPrice=11000 → 99000
  const incoming2 = await prisma.incoming.create({
    data: {
      incomingNo: `IN-TEST-2-${Date.now()}`,
      supplierId: supplier.id,
      incomingDate: new Date("2026-02-01"),
      memo: TAG,
      createdById: (await prisma.user.findFirst())?.id ?? "",
      status: "CONFIRMED",
    },
  });
  await prisma.supplierProductPriceHistory.create({
    data: {
      supplierProductId: sp.id,
      oldPrice: 11000,
      newPrice: 99000,
      changeAmount: 88000,
      changePercent: 800,
      originalPrice: 99000, // 잘못된 listPrice
      incomingId: incoming2.id,
      createdAt: new Date("2026-02-01T10:00:00"),
    },
  });
  await prisma.supplierProduct.update({
    where: { id: sp.id },
    data: { unitPrice: 99000, listPrice: 99000 },
  });

  // unconfirm 잘못된 입고2 의 가격 원복
  await prisma.$transaction(async (tx) => {
    await restorePriceHistoryForIncoming(tx, incoming2.id);
  });

  const spAfter = await prisma.supplierProduct.findUnique({ where: { id: sp.id } });
  assert(Number(spAfter?.unitPrice) === 11000, `unitPrice 가 입고1 값(11000)으로 원복됨 (현재: ${spAfter?.unitPrice})`);
  assert(Number(spAfter?.listPrice) === 11000, `listPrice 가 입고1 값(11000)으로 원복됨 (현재: ${spAfter?.listPrice})`);

  const historyRemain = await prisma.supplierProductPriceHistory.findMany({
    where: { supplierProductId: sp.id },
  });
  assert(historyRemain.length === 1, "이 입고의 history 행만 삭제, 이전 history 는 유지");
  assert(historyRemain[0].incomingId === incoming1.id, "남은 history 는 입고1 의 것");
}

// =====================================================
// 시나리오 5 — B3: 이후 다른 입고가 또 갱신했으면 가격 그대로
// =====================================================
async function scenarioB3_LaterIncomingExists() {
  console.log("\n=== 시나리오: 이 입고 후 다른 입고가 또 갱신했으면 가격 안 건드림 ===");

  const supplier = await setupSupplier();
  const sp = await prisma.supplierProduct.create({
    data: {
      supplierId: supplier.id,
      name: `${TAG}_SP_B3`,
      unitOfMeasure: "EA",
      listPrice: 10000,
      unitPrice: 10000,
    },
  });

  // 이 (잘못된) 입고
  const wrongIncoming = await prisma.incoming.create({
    data: {
      incomingNo: `IN-W-${Date.now()}`,
      supplierId: supplier.id,
      incomingDate: new Date("2026-01-15"),
      memo: TAG,
      createdById: (await prisma.user.findFirst())?.id ?? "",
      status: "CONFIRMED",
    },
  });
  await prisma.supplierProductPriceHistory.create({
    data: {
      supplierProductId: sp.id,
      oldPrice: 10000,
      newPrice: 50000,
      changeAmount: 40000,
      changePercent: 400,
      incomingId: wrongIncoming.id,
      createdAt: new Date("2026-01-15T10:00:00"),
    },
  });

  // 이후 다른 정상 입고가 또 갱신
  const laterIncoming = await prisma.incoming.create({
    data: {
      incomingNo: `IN-L-${Date.now()}`,
      supplierId: supplier.id,
      incomingDate: new Date("2026-02-01"),
      memo: TAG,
      createdById: (await prisma.user.findFirst())?.id ?? "",
      status: "CONFIRMED",
    },
  });
  await prisma.supplierProductPriceHistory.create({
    data: {
      supplierProductId: sp.id,
      oldPrice: 50000,
      newPrice: 12000,
      changeAmount: -38000,
      changePercent: -76,
      incomingId: laterIncoming.id,
      createdAt: new Date("2026-02-01T10:00:00"),
    },
  });
  await prisma.supplierProduct.update({
    where: { id: sp.id },
    data: { unitPrice: 12000 },
  });

  // wrongIncoming 의 가격 원복 시도 — 이후 입고가 있으므로 가격은 그대로
  await prisma.$transaction(async (tx) => {
    await restorePriceHistoryForIncoming(tx, wrongIncoming.id);
  });

  const spAfter = await prisma.supplierProduct.findUnique({ where: { id: sp.id } });
  assert(Number(spAfter?.unitPrice) === 12000, `unitPrice 는 그대로 12000 (현재: ${spAfter?.unitPrice}) — 이후 입고가 더 최신`);

  const historyRemain = await prisma.supplierProductPriceHistory.findMany({
    where: { supplierProductId: sp.id },
  });
  assert(historyRemain.length === 1, "이 입고 history 만 삭제, 이후 입고 history 는 유지");
  assert(historyRemain[0].incomingId === laterIncoming.id, "남은 history 는 이후 입고의 것");
}

async function main() {
  console.log("===== 통합 시나리오 테스트 시작 =====");
  await cleanupTestData(); // 이전 잔여 데이터 정리

  try {
    await scenarioA1();
    await scenarioGuardSP();
    await scenarioGuardAutoMapped();
    await scenarioB2_PriceRestore();
    await scenarioB3_LaterIncomingExists();
  } finally {
    console.log("\n===== 테스트 데이터 정리 =====");
    await cleanupTestData();
  }

  console.log(`\n===== 결과: ${pass}개 통과, ${fail}개 실패 =====`);
  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("FATAL:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
