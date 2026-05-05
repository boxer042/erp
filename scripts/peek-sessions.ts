import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });
dotenv({ path: ".env" });

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const ss = await p.posSession.findMany({
    select: { id: true, customerName: true, customerId: true, userId: true, updatedAt: true, items: true },
    orderBy: { updatedAt: "desc" },
  });
  console.log(`PosSession: ${ss.length} 건`);
  for (const s of ss) {
    const items = (s.items as unknown as Array<{ itemType?: string }>) ?? [];
    console.log(
      `  - ${s.id.slice(-8)} user=${s.userId.slice(-8)} customer=${s.customerName ?? "미등록"} items=${items.length} updated=${s.updatedAt.toISOString()}`,
    );
  }
}

main().finally(() => p.$disconnect());
