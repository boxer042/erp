/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 1회성 — 현재 DB의 모든 상품에 대해 trackable 자동 재판정 + 미발번 시리얼 backfill.
 *
 * 판정 기준 (seed.ts isTrackable 와 동일):
 *  - PARTS / SET 은 발번 안 함 (조립 결과물 ASSEMBLED 는 발번)
 *  - 카테고리 "소모품" / "사무용품" / "필기·문구" 제외
 *  - 판매가 ≥ 300,000원 OR 보증 ≥ 12개월
 *
 * 실행: npx tsx scripts/update-trackable-and-serials.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const url = process.env.DATABASE_URL!;
if (url.includes("eflvrygympn") || url.includes("ap-northeast-2")) {
  console.error("⛔ prod 호스트 — 중단");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({ adapter });

const EXCLUDED_CATEGORIES = ["소모품", "사무용품", "필기·문구"];

function isTrackableP(p: {
  sellingPrice: number;
  warrantyMonths: number | null;
  productType: "FINISHED" | "PARTS" | "SET" | "ASSEMBLED";
  categoryName: string | null;
}): boolean {
  if (p.productType === "PARTS" || p.productType === "SET") return false;
  if (EXCLUDED_CATEGORIES.includes(p.categoryName ?? "")) return false;
  return p.sellingPrice >= 300_000 || (p.warrantyMonths ?? 0) >= 12;
}

async function main() {
  console.log("[1] 모든 상품 trackable 재판정...");
  const products = await prisma.product.findMany({
    select: {
      id: true,
      sku: true,
      name: true,
      sellingPrice: true,
      warrantyMonths: true,
      productType: true,
      trackable: true,
      category: { select: { name: true } },
    },
  });

  let updatedCount = 0;
  const nowTrackable: typeof products = [];
  for (const p of products) {
    const should = isTrackableP({
      sellingPrice: Number(p.sellingPrice),
      warrantyMonths: p.warrantyMonths,
      productType: p.productType,
      categoryName: p.category?.name ?? null,
    });
    if (should !== p.trackable) {
      await prisma.product.update({
        where: { id: p.id },
        data: { trackable: should },
      });
      updatedCount++;
      console.log(`  ${p.trackable ? "▼" : "▲"} ${p.sku} ${p.name} → trackable=${should}`);
    }
    if (should) nowTrackable.push(p);
  }
  console.log(`   ✓ ${updatedCount}개 상품 trackable 변경 / 총 trackable=true: ${nowTrackable.length}개\n`);

  console.log("[2] 미발번 시리얼 backfill...");
  // 모든 trackable 상품의 OrderItem 중 SerialItem 이 없는 것에 대해 시리얼 발번
  const eligibleStatuses = ["COMPLETED", "SHIPPED", "PREPARING"] as const;
  const orders = await prisma.order.findMany({
    where: { status: { in: eligibleStatuses as any }, items: { some: { product: { trackable: true } } } },
    select: {
      id: true,
      orderNo: true,
      orderDate: true,
      customerId: true,
      items: {
        where: { product: { trackable: true } },
        select: {
          id: true,
          productId: true,
          product: { select: { id: true, name: true, warrantyMonths: true } },
          serialItems: { select: { id: true } },
        },
      },
    },
  });

  let createdSerials = 0;
  for (const o of orders) {
    for (const oi of o.items) {
      if (!oi.product || !oi.productId) continue;
      if (oi.serialItems.length > 0) continue; // 이미 발번됨
      const yy = String(o.orderDate.getFullYear() % 100).padStart(2, "0");
      const mm = String(o.orderDate.getMonth() + 1).padStart(2, "0");
      const dd = String(o.orderDate.getDate()).padStart(2, "0");
      const prefix = `${yy}${mm}${dd}`;
      const cnt = await prisma.serialItem.count({ where: { code: { startsWith: `${prefix}-` } } });
      const code = `${prefix}-${String(cnt + 1).padStart(4, "0")}`;
      const warrantyEnds = oi.product.warrantyMonths
        ? new Date(o.orderDate.getTime() + oi.product.warrantyMonths * 30 * 24 * 60 * 60 * 1000)
        : null;
      await prisma.serialItem.create({
        data: {
          code,
          product: { connect: { id: oi.productId } },
          source: "SALE",
          orderItem: { connect: { id: oi.id } },
          ...(o.customerId ? { customer: { connect: { id: o.customerId } } } : {}),
          soldAt: o.orderDate,
          warrantyEnds,
          status: "ACTIVE",
        },
      });
      createdSerials++;
      console.log(`  + ${code} ${oi.product.name} (${o.orderNo})`);
    }
  }
  console.log(`   ✓ ${createdSerials}개 시리얼 발번\n`);

  console.log("=== 완료 ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
