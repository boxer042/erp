/**
 * Order.repairTicketId / rentalId @unique 제약 추가 전 중복 검사.
 *
 * 같은 RepairTicket 또는 Rental 을 가리키는 Order 가 2건 이상이면 출력.
 *
 * 실행: npx tsx scripts/check-order-rt-rental-duplicates.ts
 */

import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });
dotenv({ path: ".env" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const dupRt = await prisma.$queryRaw<Array<{ repair_ticket_id: string; cnt: bigint }>>`
    SELECT repair_ticket_id, COUNT(*) AS cnt
    FROM orders
    WHERE repair_ticket_id IS NOT NULL
    GROUP BY repair_ticket_id
    HAVING COUNT(*) > 1
  `;
  const dupRental = await prisma.$queryRaw<Array<{ rental_id: string; cnt: bigint }>>`
    SELECT rental_id, COUNT(*) AS cnt
    FROM orders
    WHERE rental_id IS NOT NULL
    GROUP BY rental_id
    HAVING COUNT(*) > 1
  `;

  console.log("\n=== Order @unique 사전 검사 ===\n");
  console.log(`repairTicketId 중복: ${dupRt.length}건`);
  for (const r of dupRt) console.log(`  - repairTicketId=${r.repair_ticket_id} (Order ${r.cnt}건)`);
  console.log(`rentalId 중복:        ${dupRental.length}건`);
  for (const r of dupRental) console.log(`  - rentalId=${r.rental_id} (Order ${r.cnt}건)`);

  if (dupRt.length === 0 && dupRental.length === 0) {
    console.log("\n중복 없음 — @unique 제약 안전하게 추가 가능");
  } else {
    console.log("\n중복 발견 — 제약 추가 전에 정리 필요");
    process.exit(1);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
