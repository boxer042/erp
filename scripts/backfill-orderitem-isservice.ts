/**
 * 일회성 백필 — 기존 OrderItem 중 unitPrice=0 + quantity>0 인 라인을 isService=true 로 마킹.
 *
 * 정책: "0원 OrderItem = 서비스 지급" 으로 전제 (운영자 확인). 그 외 (샘플·실수 등) 케이스 없음.
 *
 * 멱등성: 이미 isService=true 면 skip.
 *
 * 실행:
 *   npx tsx scripts/backfill-orderitem-isservice.ts                              # dev
 *   PRISMA_ENV_FILE=.env.prod npx tsx scripts/backfill-orderitem-isservice.ts   # 운영
 */
import dotenv from "dotenv";
dotenv.config({ path: process.env.PRISMA_ENV_FILE ?? ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  // unitPrice=0 AND quantity>0 AND isService=false
  const candidates = await prisma.orderItem.findMany({
    where: {
      unitPrice: 0,
      quantity: { gt: 0 },
      isService: false,
    },
    select: { id: true, orderId: true, productId: true, serviceName: true },
  });
  console.log(`대상 OrderItem: ${candidates.length} 건`);
  if (candidates.length === 0) {
    console.log("백필할 항목 없음. 종료.");
    return;
  }

  const ids = candidates.map((c) => c.id);
  const res = await prisma.orderItem.updateMany({
    where: { id: { in: ids } },
    data: { isService: true },
  });
  console.log(`업데이트 완료: ${res.count} 건`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
