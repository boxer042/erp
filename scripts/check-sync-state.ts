/**
 * sessions 와 RepairTicket 의 정합성 확인 — "수리 1" 잘못 카운트 원인 추적.
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
  const user = await prisma.user.findFirst({ where: { isActive: true } });
  if (!user) return;
  console.log(`user = ${user.name}\n`);

  const sessions = await prisma.posSession.findMany({
    where: { userId: user.id },
    include: {
      customer: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  for (const s of sessions) {
    const items = (s.items as unknown as Array<{ itemType?: string; repairMeta?: { repairTicketId?: string } }>) ?? [];
    const cartRepairLines = items.filter(
      (i) => i.itemType === "repair" && i.repairMeta?.repairTicketId,
    );
    const cartRepairTicketIds = cartRepairLines
      .map((i) => i.repairMeta?.repairTicketId)
      .filter((id): id is string => !!id);
    const trackedIds = (s.repairTicketIds as unknown as string[] | null) ?? [];

    console.log(`session ${s.id.slice(-8)}`);
    console.log(`  customer: ${s.customer ? `🟢 ${s.customer.name}` : `⚪ 미등록 (${s.customerName ?? s.label})`}`);
    console.log(`  items 총 ${items.length}건, 그중 repair 라인 ${cartRepairLines.length}건`);
    console.log(`  repairTicketIds (sessions): [${trackedIds.join(", ")}]`);
    console.log(`  cart repair ticketIds: [${cartRepairTicketIds.join(", ")}]`);
    console.log(`  서버 저장 openRepairCount = ${s.openRepairCount}`);

    // 실제 진행중 RepairTicket
    let actualOpen: number;
    if (s.customerId) {
      actualOpen = await prisma.repairTicket.count({
        where: {
          customerId: s.customerId,
          status: { notIn: ["PICKED_UP", "CANCELLED"] },
          id: { notIn: cartRepairTicketIds },
        },
      });
    } else if (trackedIds.length > 0) {
      actualOpen = await prisma.repairTicket.count({
        where: {
          id: { in: trackedIds, notIn: cartRepairTicketIds },
          status: { notIn: ["PICKED_UP", "CANCELLED"] },
        },
      });
    } else {
      actualOpen = 0;
    }
    console.log(`  실제 진행중 (카트 제외) = ${actualOpen}`);
    if (s.openRepairCount !== actualOpen) {
      console.log(`  ⚠️ MISMATCH — 서버 저장값 != 실제값`);
    }

    // 진행중 티켓 상세
    if (s.customerId) {
      const tickets = await prisma.repairTicket.findMany({
        where: {
          customerId: s.customerId,
          status: { notIn: ["PICKED_UP", "CANCELLED"] },
        },
        select: { id: true, ticketNo: true, status: true },
      });
      for (const t of tickets) {
        const inCart = cartRepairTicketIds.includes(t.id);
        console.log(`    - ${t.ticketNo} [${t.status}]${inCart ? " (카트 안에 있음)" : ""}`);
      }
    } else if (trackedIds.length > 0) {
      const tickets = await prisma.repairTicket.findMany({
        where: { id: { in: trackedIds } },
        select: { id: true, ticketNo: true, status: true },
      });
      for (const t of tickets) {
        const inCart = cartRepairTicketIds.includes(t.id);
        console.log(`    - ${t.ticketNo} [${t.status}]${inCart ? " (카트 안에 있음)" : ""}`);
      }
    }
    console.log();
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
