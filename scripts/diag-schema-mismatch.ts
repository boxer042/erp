import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  // 사용 가능한 스키마 + Incoming 비슷한 이름 탐색
  const schemas = await prisma.$queryRawUnsafe<Array<{ table_schema: string; table_name: string }>>(
    `SELECT table_schema, table_name FROM information_schema.tables
     WHERE table_name ILIKE '%incoming%' OR table_name ILIKE '%supplier%'
     ORDER BY table_schema, table_name`,
  );
  console.log("=== Tables matching incoming/supplier ===");
  for (const r of schemas) console.log(`  ${r.table_schema}.${r.table_name}`);

  if (schemas.length === 0) {
    console.log("(no matching tables — DB may be empty or schema mismatch is deeper)");
    return;
  }

  // 첫 매칭 스키마 추정
  const schema = schemas[0].table_schema;
  const tables = ["incomings", "incoming_items", "supplier_ledgers", "suppliers"];
  for (const t of tables) {
    const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string; data_type: string }>>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      schema,
      t,
    );
    console.log(`\n=== ${schema}.${t} (${cols.length} cols) ===`);
    for (const c of cols) {
      console.log(`  ${c.column_name.padEnd(30)} ${c.data_type}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
