import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

/**
 * 저장된 상담 (장바구니 저장된 세션) 목록 — "저장된 상담" 페이지용.
 * - deletedAt = null AND parkedAt != null
 * - parkedAt 최신순
 */
export async function GET() {
  const [user, deny] = await guardUser();
  if (deny) return deny;

  const rows = await prisma.posSession.findMany({
    where: {
      userId: user.id,
      deletedAt: null,
      parkedAt: { not: null },
    },
    include: {
      customer: {
        select: { id: true, name: true, phone: true, type: true },
      },
    },
    orderBy: { parkedAt: "desc" },
  });

  const items = rows.map((r) => {
    const itemsArr = (r.items as unknown as Array<{ itemType?: string }>) ?? [];
    return {
      id: r.id,
      customerId: r.customerId,
      customerName: r.customer?.name ?? r.customerName,
      customerPhone: r.customer?.phone ?? r.customerPhone,
      customerType: r.customer?.type ?? null,
      label: r.label,
      itemCount: itemsArr.length,
      parkedAt: r.parkedAt?.toISOString() ?? null,
      updatedAt: r.updatedAt.toISOString(),
    };
  });

  return NextResponse.json(items);
}

export async function DELETE(request: Request) {
  const [user, deny] = await guardUser();
  if (deny) return deny;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id 가 필요합니다" }, { status: 400 });
  }
  const existing = await prisma.posSession.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "세션을 찾을 수 없습니다" }, { status: 404 });
  }
  await prisma.posSession.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
