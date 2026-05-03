import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as dotenv } from "dotenv";

dotenv({ path: ".env.local" });
dotenv({ path: ".env" });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const customer = await prisma.customer.findFirst({ where: { name: "이재우" } });
  if (!customer) { console.log("이재우 없음"); return; }
  const tickets = await prisma.repairTicket.findMany({
    where: { customerId: customer.id },
    select: {
      ticketNo: true,
      status: true,
      receivedAt: true,
      pickedUpAt: true,
      finalAmount: true,
    },
    orderBy: { receivedAt: "desc" },
  });
  console.table(tickets.map(t => ({
    ticketNo: t.ticketNo,
    status: t.status,
    receivedAt: t.receivedAt.toISOString().slice(0,10),
    pickedUpAt: t.pickedUpAt?.toISOString().slice(0,10) ?? "-",
    finalAmount: Number(t.finalAmount),
  })));
}

main().finally(() => prisma.$disconnect());
