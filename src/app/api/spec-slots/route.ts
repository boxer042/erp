import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { specSlotSchema } from "@/lib/validators/spec-slot";
import { guardAdmin } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const activeOnly = searchParams.get("activeOnly") === "1";

  const slots = await prisma.productSpecSlot.findMany({
    where: {
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      ...(activeOnly ? { isActive: true } : {}),
    },
    include: { _count: { select: { values: true } } },
    orderBy: [{ isActive: "desc" }, { order: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(slots);
}

export async function POST(request: NextRequest) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;
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
    const slot = await prisma.productSpecSlot.create({
      data: {
        name: data.name,
        type: data.type,
        unit: data.type === "NUMBER" ? data.unit ?? null : null,
        options: data.type === "ENUM" ? data.options : [],
        order: data.order,
        isActive: data.isActive,
      },
    });
    return NextResponse.json(slot, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "이미 등록된 슬롯명입니다" },
        { status: 409 },
      );
    }
    const msg = e instanceof Error ? e.message : "슬롯 등록 실패";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
