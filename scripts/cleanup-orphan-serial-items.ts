/**
 * 1회성 정리 — 취소·삭제된 주문에 매달려 있던 SerialItem(SALE) 정리.
 *
 * 두 가지 케이스를 잡는다:
 *   1. orderItemId 가 NULL 인 SALE 시리얼 (과거 Order DELETE → onDelete:SetNull 결과 발생한 orphan)
 *   2. orderItemId 는 살아있지만, 연결된 Order.status 가 CANCELLED 인 시리얼
 *
 * REPAIR-source 시리얼(외부 기기 수리 라벨)은 절대 건드리지 않는다 — RepairTicket 에 연결.
 *
 * 실행:
 *   npx tsx scripts/cleanup-orphan-serial-items.ts          (dry-run)
 *   npx tsx scripts/cleanup-orphan-serial-items.ts --apply  (실제 삭제)
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as dotenv } from "dotenv";

dotenv({ path: ".env.local" });
dotenv({ path: ".env" });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const APPLY = process.argv.includes("--apply");

async function main() {
  // 케이스 1: orphan (orderItemId=null) + SALE
  const orphans = await prisma.serialItem.findMany({
    where: { source: "SALE", orderItemId: null },
    select: {
      id: true,
      code: true,
      productId: true,
      customerId: true,
      soldAt: true,
      product: { select: { name: true } },
      customer: { select: { name: true } },
    },
    orderBy: { soldAt: "desc" },
  });

  // 케이스 2: 연결된 Order 가 CANCELLED
  const cancelledLinked = await prisma.serialItem.findMany({
    where: {
      source: "SALE",
      orderItemId: { not: null },
      orderItem: { order: { status: "CANCELLED" } },
    },
    select: {
      id: true,
      code: true,
      productId: true,
      customerId: true,
      soldAt: true,
      product: { select: { name: true } },
      customer: { select: { name: true } },
      orderItem: { select: { order: { select: { orderNo: true } } } },
    },
    orderBy: { soldAt: "desc" },
  });

  console.log(`[케이스 1] orderItemId=NULL SALE 시리얼 (과거 DELETE orphan): ${orphans.length}건`);
  for (const s of orphans) {
    console.log(
      `  - ${s.code} | ${s.product?.name ?? "(상품없음)"} | ${s.customer?.name ?? "(고객없음)"} | ${s.soldAt.toISOString().slice(0, 10)}`,
    );
  }

  console.log(`\n[케이스 2] CANCELLED 주문 연결 SALE 시리얼: ${cancelledLinked.length}건`);
  for (const s of cancelledLinked) {
    console.log(
      `  - ${s.code} | 주문 ${s.orderItem?.order?.orderNo} | ${s.product?.name ?? "(상품없음)"} | ${s.customer?.name ?? "(고객없음)"} | ${s.soldAt.toISOString().slice(0, 10)}`,
    );
  }

  const totalIds = [...orphans.map((s) => s.id), ...cancelledLinked.map((s) => s.id)];
  if (totalIds.length === 0) {
    console.log("\n정리할 시리얼 없음.");
    return;
  }

  if (!APPLY) {
    console.log(`\n총 ${totalIds.length}건. 미리보기 모드 (dry-run). 실제 삭제하려면 --apply 추가.`);
    return;
  }

  // SerialAccessLog 는 onDelete:Cascade — 자동 삭제됨.
  // RepairTicket.serialItemId 는 onDelete:SetNull — 자동 null 처리됨.
  const result = await prisma.serialItem.deleteMany({
    where: { id: { in: totalIds } },
  });
  console.log(`\n✓ ${result.count}건 영구 삭제 완료`);
}

main()
  .catch((e) => {
    console.error("ERR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
