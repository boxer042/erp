import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });
dotenv({ path: ".env" });

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const tickets = await p.repairTicket.findMany({
    select: {
      id: true,
      ticketNo: true,
      status: true,
      type: true,
      customerId: true,
      customer: { select: { name: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  console.log(`Tickets: ${tickets.length}`);
  for (const t of tickets) {
    console.log(
      `  - ${t.ticketNo} [${t.status}] ${t.type} customer=${t.customer?.name ?? `(미등록 customerId=${t.customerId ?? "null"})`} created=${t.createdAt.toISOString()}`,
    );
  }

  console.log("\n=== Sessions ===");
  const ss = await p.posSession.findMany({
    select: {
      id: true,
      customerName: true,
      customerId: true,
      repairTicketIds: true,
      updatedAt: true,
    },
  });
  for (const s of ss) {
    console.log(
      `  - ${s.id.slice(-8)} customer=${s.customerName ?? "미등록"} (customerId=${s.customerId ?? "null"}) repairTicketIds=${JSON.stringify(s.repairTicketIds)}`,
    );
  }
}

main().finally(() => p.$disconnect());
