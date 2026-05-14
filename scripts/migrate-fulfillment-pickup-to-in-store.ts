import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { prisma } from "../src/lib/prisma";

async function main() {
  const before = await prisma.order.count({ where: { fulfillmentType: "PICKUP" } });
  console.log(`PICKUP rows before migration: ${before}`);
  const result = await prisma.order.updateMany({
    where: { fulfillmentType: "PICKUP" },
    data: { fulfillmentType: "IN_STORE" },
  });
  console.log(`Updated to IN_STORE: ${result.count}`);
  const after = await prisma.order.count({ where: { fulfillmentType: "PICKUP" } });
  console.log(`PICKUP rows after migration: ${after}`);
  const inStore = await prisma.order.count({ where: { fulfillmentType: "IN_STORE" } });
  console.log(`IN_STORE rows total: ${inStore}`);
}
main().then(() => prisma.$disconnect());
