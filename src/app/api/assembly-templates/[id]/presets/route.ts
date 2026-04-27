import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assemblyPresetSchema } from "@/lib/validators/assembly-template";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const presets = await prisma.assemblyPreset.findMany({
    where: { templateId: id },
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true } },
          slot: { select: { id: true, label: true, order: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(presets);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: templateId } = await params;
  const body = await request.json();
  const parsed = assemblyPresetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  try {
    const preset = await prisma.assemblyPreset.create({
      data: {
        templateId,
        name: data.name,
        description: data.description,
        isActive: data.isActive ?? true,
        items: {
          create: data.items.map((it) => ({
            slotId: it.slotId,
            productId: it.productId,
            quantity: parseFloat(it.quantity),
          })),
        },
      },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
            slot: { select: { id: true, label: true, order: true } },
          },
        },
      },
    });
    return NextResponse.json(preset, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "프리셋 생성 실패";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
