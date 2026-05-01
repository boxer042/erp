import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  action: z.enum(["copy_from_parent", "percent", "delta"]),
  /** percent: -100 ~ +100 (예: 10 = +10%, -5 = -5%) */
  percent: z.number().optional(),
  /** delta: 더하거나 뺄 절대값 (음수 가능) */
  delta: z.number().optional(),
  /** 적용 대상 — sellingPrice / listPrice 둘 다 또는 한쪽 */
  applyTo: z.array(z.enum(["sellingPrice", "listPrice"])).min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const parent = await prisma.product.findUnique({
    where: { id },
    select: { id: true, isCanonical: true, sellingPrice: true, listPrice: true },
  });
  if (!parent) return NextResponse.json({ error: "상품을 찾을 수 없습니다" }, { status: 404 });
  if (!parent.isCanonical) {
    return NextResponse.json({ error: "대표 상품만 변형 일괄 수정이 가능합니다" }, { status: 400 });
  }

  const variants = await prisma.product.findMany({
    where: { canonicalProductId: id, isActive: true },
    select: { id: true, sellingPrice: true, listPrice: true },
  });
  if (variants.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  const ops: Promise<unknown>[] = [];
  for (const v of variants) {
    const updateData: { sellingPrice?: number; listPrice?: number } = {};
    for (const field of data.applyTo) {
      const current = field === "sellingPrice" ? Number(v.sellingPrice) : Number(v.listPrice);
      let next = current;
      if (data.action === "copy_from_parent") {
        next = field === "sellingPrice" ? Number(parent.sellingPrice) : Number(parent.listPrice);
      } else if (data.action === "percent" && data.percent !== undefined) {
        next = current * (1 + data.percent / 100);
      } else if (data.action === "delta" && data.delta !== undefined) {
        next = current + data.delta;
      }
      next = Math.max(0, Math.round(next));
      updateData[field] = next;
    }
    if (Object.keys(updateData).length > 0) {
      ops.push(prisma.product.update({ where: { id: v.id }, data: updateData }));
    }
  }
  await Promise.all(ops);
  return NextResponse.json({ updated: ops.length });
}
