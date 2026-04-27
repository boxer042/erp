import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  logoUrl: z.string().nullable().optional(),
  logoPath: z.string().nullable().optional(),
  memo: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const brand = await prisma.brand.findUnique({
    where: { id },
    include: {
      _count: { select: { products: true } },
    },
  });
  if (!brand) {
    return NextResponse.json({ error: "브랜드를 찾을 수 없습니다" }, { status: 404 });
  }
  return NextResponse.json(brand);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  try {
    const brand = await prisma.brand.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl } : {}),
        ...(data.logoPath !== undefined ? { logoPath: data.logoPath } : {}),
        ...(data.memo !== undefined ? { memo: data.memo } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
    return NextResponse.json(brand);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Unique")) {
      return NextResponse.json({ error: "이미 등록된 브랜드 이름입니다" }, { status: 409 });
    }
    return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await prisma.brand.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ success: true });
}
