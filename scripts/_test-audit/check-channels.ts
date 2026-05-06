import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" }); dotenv({ path: ".env" });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
async function main() {
  const channels = await prisma.salesChannel.findMany();
  const cats = await prisma.productCategory.findMany({ select: { id: true, name: true, isActive: true }});
  const user = await prisma.user.findFirst();
  console.log("Channels:", channels);
  console.log("Categories:", cats);
  console.log("User:", user?.email, user?.name, user?.id);
}
main().catch(console.error).finally(() => prisma.$disconnect());
