import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { z } from "zod";

const patchSchema = z.object({
  /** 표시 원문 수정 */
  text: z.string().min(1).optional(),
  /** 카탈로그 상품 매핑 — null 이면 해제 (D11 Option B) */
  productId: z.string().nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await guardUser();
  if (deny) return deny;
  const { id } = await params;

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  if (d.productId) {
    const p = await prisma.product.findUnique({ where: { id: d.productId }, select: { id: true } });
    if (!p) return NextResponse.json({ error: "상품을 찾을 수 없습니다" }, { status: 404 });
  }

  try {
    const updated = await prisma.repairDeviceTemplate.update({
      where: { id },
      data: {
        ...(d.text !== undefined ? { text: d.text.trim() } : {}),
        ...(d.productId !== undefined ? { productId: d.productId } : {}),
      },
      select: {
        id: true, text: true, usageCount: true, productId: true,
        product: { select: { id: true, name: true, sku: true } },
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "수정 실패" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await guardUser();
  if (deny) return deny;
  const { id } = await params;
  try {
    // 티켓 연결은 SetNull — 본문 텍스트(repairProductText)는 보존된다
    await prisma.repairDeviceTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "삭제 실패" },
      { status: 400 },
    );
  }
}
