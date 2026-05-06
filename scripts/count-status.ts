import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const counts = await prisma.$queryRawUnsafe<Array<{ status: string; cnt: bigint }>>(
    `SELECT status::text, COUNT(*)::bigint AS cnt FROM orders
     WHERE status IN ('CONFIRMED', 'DELIVERED')
     GROUP BY status`,
  );
  console.log("deprecated status rows:", counts);

  const all = await prisma.$queryRawUnsafe<Array<{ status: string; cnt: bigint }>>(
    `SELECT status::text, COUNT(*)::bigint AS cnt FROM orders GROUP BY status ORDER BY status`,
  );
  console.log("all status:", all);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
