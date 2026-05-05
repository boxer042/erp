/**
 * 테스트 데이터 wiping (B 범위) — POS 세션 + 수리 + 판매 데이터 삭제.
 * 재고(Inventory/InventoryLot) 는 건드리지 않음.
 *
 * 삭제 대상:
 *   - PosSession (모든 카트 세션)
 *   - RepairTicket + RepairPart + RepairLabor (CASCADE)
 *   - Order + OrderItem + LotConsumption (CASCADE 또는 명시 삭제)
 *
 * 주의: LotConsumption 삭제 시 InventoryLot.remainingQty 복원하지 않음.
 *       (재고를 그대로 두기로 했으니 재고 수량과 로트 잔량이 어긋남 — 신경 안 써도 됨)
 *
 * 실행: npx tsx scripts/wipe-pos-data.ts --yes
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as dotenv } from "dotenv";

dotenv({ path: ".env.local" });
dotenv({ path: ".env" });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  if (!process.argv.includes("--yes")) {
    console.log("실행 전 현재 카운트 확인:\n");
  }

  const before = {
    posSession: await prisma.posSession.count(),
    repairTicket: await prisma.repairTicket.count(),
    repairPart: await prisma.repairPart.count(),
    repairLabor: await prisma.repairLabor.count(),
    order: await prisma.order.count(),
    orderItem: await prisma.orderItem.count(),
    lotConsumption: await prisma.lotConsumption.count(),
  };
  console.log("[BEFORE]");
  for (const [k, v] of Object.entries(before)) console.log(`  ${k}: ${v}`);

  if (!process.argv.includes("--yes")) {
    console.log("\n--yes 플래그 없으면 dry-run 으로 종료. 실제 삭제하려면:");
    console.log("  npx tsx scripts/wipe-pos-data.ts --yes\n");
    return;
  }

  console.log("\n[WIPE] 삭제 시작...");

  await prisma.$transaction(async (tx) => {
    // 1) PosSession 전체
    await tx.posSession.deleteMany({});

    // 2) Order → OrderItem 은 cascade. LotConsumption 은 별도 (orderItem 참조)
    //    LotConsumption 먼저 삭제 (외래키 제약 회피)
    await tx.lotConsumption.deleteMany({});
    await tx.orderItem.deleteMany({});
    await tx.order.deleteMany({});

    // 3) RepairTicket → RepairPart, RepairLabor 는 cascade.
    //    RepairTicket.orders 는 cascade 아니지만 위에서 Order 다 지웠음.
    //    parentRepairTicketId self-relation 은 onDelete: SetNull 이라 안전.
    await tx.repairPart.deleteMany({});
    await tx.repairLabor.deleteMany({});
    await tx.repairTicket.deleteMany({});
  });

  const after = {
    posSession: await prisma.posSession.count(),
    repairTicket: await prisma.repairTicket.count(),
    repairPart: await prisma.repairPart.count(),
    repairLabor: await prisma.repairLabor.count(),
    order: await prisma.order.count(),
    orderItem: await prisma.orderItem.count(),
    lotConsumption: await prisma.lotConsumption.count(),
  };
  console.log("\n[AFTER]");
  for (const [k, v] of Object.entries(after)) console.log(`  ${k}: ${v}`);
  console.log("\n완료.");
  console.log("\n⚠️  중요: 각 브라우저/기기에서 sessionStorage 도 비워야 함");
  console.log("    (안 그러면 옛 카트가 첫 sync 때 서버에 다시 push 되어 부활)");
  console.log("    F12 → Console → sessionStorage.clear() → 새로고침\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
