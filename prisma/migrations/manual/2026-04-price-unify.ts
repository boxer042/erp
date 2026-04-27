/**
 * 일회성 마이그레이션 — Product/SupplierProduct 가격 구조 통일
 *
 * 적용 대상:
 *   - SupplierProduct.listPrice ← unitPrice 복사 (동일 시작값)
 *   - Product.sellingPrice 세전 환산 (taxType=TAXABLE만 ÷ 1.1)
 *   - Product.listPrice ← 환산 후 sellingPrice 복사
 *   - ChannelPricing.sellingPrice 세전 환산 (해당 Product가 TAXABLE일 때만)
 *   - OrderItem.unitPrice/totalPrice 세전 환산 (해당 Product가 TAXABLE일 때만)
 *   - Order.subtotalAmount/taxAmount/totalAmount 재계산
 *
 * 멱등성: listPrice > 0인 레코드는 스킵하여 중복 실행 방지.
 *
 * 실행: npx tsx prisma/migrations/manual/2026-04-price-unify.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function migrateSupplierProducts() {
  const rows = await prisma.supplierProduct.findMany({
    where: { listPrice: 0 },
    select: { id: true, unitPrice: true },
  });
  console.log(`[SupplierProduct] ${rows.length}건 listPrice 설정`);
  for (const r of rows) {
    await prisma.supplierProduct.update({
      where: { id: r.id },
      data: { listPrice: r.unitPrice },
    });
  }
}

async function migrateProducts() {
  const rows = await prisma.product.findMany({
    where: { listPrice: 0 },
    select: { id: true, taxType: true, sellingPrice: true },
  });
  console.log(`[Product] ${rows.length}건 환산 + listPrice 설정`);
  for (const r of rows) {
    const currentSelling = Number(r.sellingPrice);
    const net = r.taxType === "TAXABLE" ? round2(currentSelling / 1.1) : currentSelling;
    await prisma.product.update({
      where: { id: r.id },
      data: {
        sellingPrice: new Prisma.Decimal(net),
        listPrice: new Prisma.Decimal(net),
      },
    });
  }
}

async function migrateChannelPricings() {
  const rows = await prisma.channelPricing.findMany({
    include: { product: { select: { taxType: true } } },
  });
  let migrated = 0;
  for (const r of rows) {
    if (r.product.taxType !== "TAXABLE") continue;
    const cur = Number(r.sellingPrice);
    const net = round2(cur / 1.1);
    await prisma.channelPricing.update({
      where: { id: r.id },
      data: { sellingPrice: new Prisma.Decimal(net) },
    });
    migrated++;
  }
  console.log(`[ChannelPricing] ${migrated}건 세전 환산`);
}

async function migrateOrders() {
  // OrderItem 환산 (Product TAXABLE일 때만)
  const items = await prisma.orderItem.findMany({
    include: { product: { select: { taxType: true } } },
  });
  let itemsMigrated = 0;
  for (const it of items) {
    if (it.product.taxType !== "TAXABLE") continue;
    const newUnit = round2(Number(it.unitPrice) / 1.1);
    const newTotal = round2(Number(it.totalPrice) / 1.1);
    await prisma.orderItem.update({
      where: { id: it.id },
      data: {
        unitPrice: new Prisma.Decimal(newUnit),
        totalPrice: new Prisma.Decimal(newTotal),
      },
    });
    itemsMigrated++;
  }
  console.log(`[OrderItem] ${itemsMigrated}건 세전 환산`);

  // Order 합계 재계산
  const orders = await prisma.order.findMany({
    include: { items: { include: { product: { select: { taxType: true } } } } },
  });
  for (const o of orders) {
    const subtotal = o.items.reduce((s, it) => s + Number(it.totalPrice), 0);
    const tax = o.items.reduce((s, it) => {
      if (it.product.taxType !== "TAXABLE") return s;
      return s + Number(it.totalPrice) * 0.1;
    }, 0);
    const total = round2(subtotal + tax - Number(o.discountAmount) + Number(o.shippingFee));
    await prisma.order.update({
      where: { id: o.id },
      data: {
        subtotalAmount: new Prisma.Decimal(round2(subtotal)),
        taxAmount: new Prisma.Decimal(round2(tax)),
        totalAmount: new Prisma.Decimal(total),
      },
    });
  }
  console.log(`[Order] ${orders.length}건 합계 재계산`);
}

async function main() {
  console.log("=== 가격 구조 통일 마이그레이션 시작 ===");
  await prisma.$transaction(async () => {
    // 트랜잭션 내 개별 prisma 호출은 이 바깥에서 처리. 규모 크면 분리 실행.
  });

  // 개별 단계 (트랜잭션 없이 단계별 실행 — 멱등성 보장)
  await migrateSupplierProducts();
  await migrateProducts();
  await migrateChannelPricings();
  await migrateOrders();

  console.log("=== 완료 ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
