import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const qi = await prisma.quotationItem.findMany({ where: { listPrice: 0 }, select: { id: true, unitPrice: true } });
  for (const it of qi) {
    await prisma.quotationItem.update({ where: { id: it.id }, data: { listPrice: it.unitPrice } });
  }
  console.log(`QuotationItem backfilled: ${qi.length}`);

  const si = await prisma.statementItem.findMany({ where: { listPrice: 0 }, select: { id: true, unitPrice: true } });
  for (const it of si) {
    await prisma.statementItem.update({ where: { id: it.id }, data: { listPrice: it.unitPrice } });
  }
  console.log(`StatementItem backfilled: ${si.length}`);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
