/**
 * 카트 안 ticketId(afdc68f9-...)가 DB에 존재하는지 + R260503-PSUT의 id 비교
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
  const cartTicketId = "afdc68f9-b754-4b01-b1a4-d001a0b3a2a6";
  const t = await prisma.repairTicket.findUnique({
    where: { id: cartTicketId },
    select: { id: true, ticketNo: true, status: true, customerId: true, cancelledAt: true },
  });
  console.log(`카트 안 ticketId 존재? ${t ? "YES" : "NO"}`);
  if (t) console.log(`  ${t.ticketNo} [${t.status}] customer=${t.customerId} cancelled=${t.cancelledAt}`);

  const psut = await prisma.repairTicket.findFirst({
    where: { ticketNo: "R260503-PSUT" },
    select: { id: true, status: true, customerId: true },
  });
  console.log(`\nR260503-PSUT id = ${psut?.id}`);
  console.log(`동일? ${psut?.id === cartTicketId}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
