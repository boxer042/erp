import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

/**
 * 재고 부족 (안전재고 미달) 상품 모음.
 * - quantity < safetyStock → "부족"
 * - quantity === 0 → "결품"
 * 활성 상품만, 재고 = 0 인 결품 상품 우선 정렬.
 */
export async function GET() {
  const [, deny] = await guardUser();
  if (deny) return deny;

  // safetyStock 보다 quantity 가 작은 활성 상품 — Prisma 가 column-to-column 비교 직접
  // 지원 안 해서 raw SQL 로 가져옴.
  const rows = await prisma.$queryRaw<
    {
      product_id: string;
      name: string;
      sku: string;
      brand: string | null;
      spec: string | null;
      quantity: string;
      safety_stock: string;
      unit_of_measure: string;
      category_id: string | null;
      category_name: string | null;
    }[]
  >`
    SELECT p.id AS product_id,
           p.name,
           p.sku,
           p.brand,
           p.spec,
           inv.quantity::text AS quantity,
           inv.safety_stock::text AS safety_stock,
           p.unit_of_measure,
           p.category_id,
           pc.name AS category_name
    FROM products p
    JOIN inventories inv ON inv.product_id = p.id
    LEFT JOIN product_categories pc ON pc.id = p.category_id
    WHERE p.is_active = true
      AND inv.quantity < inv.safety_stock
    ORDER BY (inv.quantity = 0) DESC, inv.quantity ASC, p.name ASC
    LIMIT 500
  `;

  const items = rows.map((r) => ({
    productId: r.product_id,
    name: r.name,
    sku: r.sku,
    brand: r.brand,
    spec: r.spec,
    quantity: Number(r.quantity),
    safetyStock: Number(r.safety_stock),
    shortage: Math.max(0, Number(r.safety_stock) - Number(r.quantity)),
    unitOfMeasure: r.unit_of_measure,
    categoryId: r.category_id,
    categoryName: r.category_name,
    isOut: Number(r.quantity) === 0,
  }));

  const summary = {
    totalCount: items.length,
    outOfStockCount: items.filter((i) => i.isOut).length,
    lowStockCount: items.filter((i) => !i.isOut).length,
  };

  return NextResponse.json({ items, summary });
}
