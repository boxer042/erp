import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { specSlotSchema } from "@/lib/validators/spec-slot";
import { guardAdmin } from "@/lib/api-auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const { id } = await params;
  const body = await request.json();
  const parsed = specSlotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  if (data.type === "ENUM" && data.options.length === 0) {
    return NextResponse.json(
      { error: "ENUM 타입은 옵션을 1개 이상 입력해야 합니다" },
      { status: 400 },
    );
  }

  try {
    const slot = await prisma.productSpecSlot.update({
      where: { id },
      data: {
        name: data.name,
        type: data.type,
        unit: data.type === "NUMBER" ? data.unit ?? null : null,
        options: data.type === "ENUM" ? data.options : [],
        order: data.order,
        isActive: data.isActive,
      },
    });
    return NextResponse.json(slot);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "이미 등록된 슬롯명입니다" },
        { status: 409 },
      );
    }
    const msg = e instanceof Error ? e.message : "슬롯 수정 실패";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const { id } = await params;

  const inUse = await prisma.productSpecValue.count({ where: { slotId: id } });
  if (inUse > 0) {
    return NextResponse.json(
      { error: `사용 중인 슬롯입니다 (${inUse}개 상품)` },
      { status: 400 },
    );
  }

  await prisma.productSpecSlot.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
