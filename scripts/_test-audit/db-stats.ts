import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as dotenv } from "dotenv";

dotenv({ path: ".env.local" });
dotenv({ path: ".env" });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const stats = {
    users: await prisma.user.count(),
    customers: await prisma.customer.count(),
    suppliers: await prisma.supplier.count(),
    supplierProducts: await prisma.supplierProduct.count(),
    products: await prisma.product.count({ where: { isActive: true } }),
    inventoryLots: await prisma.inventoryLot.count(),
    channels: await prisma.salesChannel.count({ where: { isActive: true } }),
    orders: await prisma.order.count(),
    orderItems: await prisma.orderItem.count(),
    repairTickets: await prisma.repairTicket.count(),
    rentalAssets: await prisma.rentalAsset.count(),
    rentals: await prisma.rental.count(),
    serialItems: await prisma.serialItem.count(),
    quotations: await prisma.quotation.count(),
    statements: await prisma.statement.count(),
    posSessions: await prisma.posSession.count({ where: { deletedAt: null } }),
    productCategories: await prisma.productCategory.count({ where: { isActive: true } }),
  };
  console.log(JSON.stringify(stats, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
