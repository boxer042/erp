import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const dep = await prisma.$queryRawUnsafe<Array<{ status: string; cnt: bigint }>>(
    `SELECT status::text AS status, COUNT(*)::bigint AS cnt FROM orders
     WHERE status::text IN ('CONFIRMED', 'DELIVERED')
     GROUP BY status::text`,
  );
  console.log("deprecated rows:", dep);

  const all = await prisma.$queryRawUnsafe<Array<{ status: string; cnt: bigint }>>(
    `SELECT status::text, COUNT(*)::bigint AS cnt FROM orders GROUP BY status ORDER BY status`,
  );
  console.log("status:", all);

  const fulfill = await prisma.$queryRawUnsafe<
    Array<{ fulfillment_type: string; cnt: bigint }>
  >(
    `SELECT fulfillment_type::text, COUNT(*)::bigint AS cnt FROM orders GROUP BY fulfillment_type ORDER BY fulfillment_type`,
  );
  console.log("fulfillmentType:", fulfill);

  // 스키마 자체 검증 — enum 값과 컬럼 존재 확인
  const enumValues = await prisma.$queryRawUnsafe<Array<{ value: string }>>(
    `SELECT unnest(enum_range(NULL::"OrderStatus"))::text AS value`,
  );
  console.log("OrderStatus enum:", enumValues.map((v) => v.value));

  const fulfillValues = await prisma.$queryRawUnsafe<Array<{ value: string }>>(
    `SELECT unnest(enum_range(NULL::"FulfillmentType"))::text AS value`,
  );
  console.log("FulfillmentType enum:", fulfillValues.map((v) => v.value));

  const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'orders' AND column_name IN ('fulfillment_type', 'expected_ship_date')`,
  );
  console.log("orders columns:", cols.map((c) => c.column_name));

  const totalOrders = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*)::bigint AS cnt FROM orders`,
  );
  console.log("total orders:", Number(totalOrders[0].cnt));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
