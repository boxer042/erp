/**
 * 일회성 — orders.repair_ticket_id (legacy 1:1) → repair_tickets.order_id (N:1) 데이터 이전.
 *
 * 실행 시점: schema 에 RepairTicket.orderId 추가하고 db push 한 직후, legacy 컬럼 드롭 전.
 * 멱등성: 이미 orderId 가 채워진 ticket 은 건드리지 않음.
 */
import dotenv from "dotenv";
dotenv.config({ path: process.env.PRISMA_ENV_FILE ?? ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  // legacy 관계로 연결된 ticket 들 찾기 (legacyOrder!=null 이거나 orderId is null AND legacy 관계 존재)
  const ordersWithRepair = await prisma.order.findMany({
    where: { repairTicketId: { not: null } },
    select: { id: true, repairTicketId: true, orderNo: true },
  });

  console.log(`찾은 legacy link: ${ordersWithRepair.length} 건`);
  if (ordersWithRepair.length === 0) {
    console.log("이전할 데이터 없음. 종료.");
    return;
  }

  let migrated = 0;
  let skipped = 0;
  for (const o of ordersWithRepair) {
    if (!o.repairTicketId) continue;
    const ticket = await prisma.repairTicket.findUnique({
      where: { id: o.repairTicketId },
      select: { id: true, orderId: true, ticketNo: true },
    });
    if (!ticket) {
      console.warn(`  ⚠️  Order ${o.orderNo} → ticket ${o.repairTicketId} 없음 (orphan)`);
      continue;
    }
    if (ticket.orderId) {
      if (ticket.orderId === o.id) {
        skipped++;
        continue;
      }
      console.warn(
        `  ⚠️  ticket ${ticket.ticketNo}: 이미 orderId=${ticket.orderId} 인데 legacy=${o.id} 와 불일치. legacy 무시.`,
      );
      skipped++;
      continue;
    }
    await prisma.repairTicket.update({
      where: { id: ticket.id },
      data: { orderId: o.id },
    });
    migrated++;
    if (migrated % 50 === 0) console.log(`  진행: ${migrated} / ${ordersWithRepair.length}`);
  }

  console.log(`\n결과: 이전 ${migrated} 건 / 스킵(이미 채워짐) ${skipped} 건`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
