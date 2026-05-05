/**
 * 1) 8eq 미등록 손님 — 취소된 수리 티켓이 DB에 남아있는지
 * 2) 이재우 손님 — 카트/수리 표시 정합성 확인
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

  console.log("===== (1) 8eq 미등록 손님 — sessions 와 ticket 잔존 확인 =====\n");

  const sessions = await prisma.posSession.findMany({
    where: { userId: user.id },
    include: { customer: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
  });

  const eq8 = sessions.find((s) => s.id.endsWith("8eq"));
  if (eq8) {
    console.log(`session 8eq 존재: customer=${eq8.customer?.name ?? "미등록"}`);
    const tracked = (eq8.repairTicketIds as unknown as string[] | null) ?? [];
    console.log(`  trackedIds: [${tracked.join(", ")}]`);
    if (tracked.length > 0) {
      const tickets = await prisma.repairTicket.findMany({
        where: { id: { in: tracked } },
        select: { id: true, ticketNo: true, status: true, cancelledAt: true, customerId: true },
      });
      for (const t of tickets) {
        console.log(`  - ${t.ticketNo} [${t.status}] cancelled=${t.cancelledAt} customer=${t.customerId ?? "미등록"}`);
      }
      const missing = tracked.filter((id) => !tickets.some((t) => t.id === id));
      if (missing.length > 0) console.log(`  ⚠️ DB 에서 사라진 ticketId: [${missing.join(", ")}]`);
    }
  } else {
    console.log("session 8eq 가 sessions 에서 사라짐");
  }

  console.log("\n===== (2) 이재우 — 카트/수리 표시 정합성 =====\n");

  const jaewoo = await prisma.customer.findFirst({
    where: { name: "이재우" },
    select: { id: true, name: true, phone: true },
  });
  if (!jaewoo) {
    console.log("이재우 고객 없음");
    return;
  }
  console.log(`customer: ${jaewoo.name} (${jaewoo.id}) ${jaewoo.phone ?? ""}\n`);

  const jaewooSessions = sessions.filter((s) => s.customerId === jaewoo.id);
  console.log(`이재우 연결된 세션: ${jaewooSessions.length} 건\n`);
  for (const s of jaewooSessions) {
    const items = (s.items as unknown as Array<{
      itemType?: string;
      productName?: string;
      unitPrice?: string;
      quantity?: number;
      repairMeta?: { repairTicketId?: string };
    }>) ?? [];
    console.log(`session ${s.id.slice(-8)} (updatedAt=${s.updatedAt.toISOString()})`);
    console.log(`  items 총 ${items.length} 건`);
    for (const it of items) {
      console.log(`    - [${it.itemType}] ${it.productName} x${it.quantity} @${it.unitPrice}${it.repairMeta?.repairTicketId ? ` (ticketId=${it.repairMeta.repairTicketId})` : ""}`);
    }
    console.log(`  trackedIds: ${JSON.stringify(s.repairTicketIds)}`);
    console.log(`  서버저장 openRepairCount = ${s.openRepairCount}`);
    console.log();
  }

  // 이재우 모든 수리 티켓
  const jaewooTickets = await prisma.repairTicket.findMany({
    where: { customerId: jaewoo.id },
    select: { id: true, ticketNo: true, status: true, quotedTotalAmount: true, finalAmount: true, diagnosisFee: true, createdAt: true, cancelledAt: true, pickedUpAt: true },
    orderBy: { createdAt: "desc" },
  });
  console.log(`이재우 전체 수리 티켓: ${jaewooTickets.length} 건`);
  for (const t of jaewooTickets) {
    console.log(`  - ${t.ticketNo} [${t.status}] quoted=${t.quotedTotalAmount} final=${t.finalAmount} diag=${t.diagnosisFee} created=${t.createdAt.toISOString()} cancelled=${t.cancelledAt?.toISOString() ?? "—"}`);
  }

  // 이재우 진행중 (PICKED_UP/CANCELLED 제외)
  const open = jaewooTickets.filter((t) => t.status !== "PICKED_UP" && t.status !== "CANCELLED");
  console.log(`\n  진행중 (PICKED_UP/CANCELLED 제외): ${open.length} 건`);
  for (const t of open) console.log(`    - ${t.ticketNo} [${t.status}]`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
