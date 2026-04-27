import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assemblyPresetSchema } from "@/lib/validators/assembly-template";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; presetId: string }> },
) {
  const { presetId } = await params;
  const body = await request.json();
  const parsed = assemblyPresetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  try {
    const preset = await prisma.$transaction(async (tx) => {
      await tx.assemblyPreset.update({
        where: { id: presetId },
        data: {
          name: data.name,
          description: data.description,
          isActive: data.isActive ?? true,
        },
      });
      // 아이템 전면 재구성
      await tx.assemblyPresetItem.deleteMany({ where: { presetId } });
      await tx.assemblyPresetItem.createMany({
        data: data.items.map((it) => ({
          presetId,
          slotId: it.slotId,
          productId: it.productId,
          quantity: parseFloat(it.quantity),
        })),
      });
      return tx.assemblyPreset.findUnique({
        where: { id: presetId },
        include: {
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true } },
              slot: { select: { id: true, label: true, order: true } },
            },
          },
        },
      });
    });
    return NextResponse.json(preset);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "프리셋 수정 실패";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; presetId: string }> },
) {
  const { presetId } = await params;
  try {
    await prisma.assemblyPreset.delete({ where: { id: presetId } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "삭제 실패" }, { status: 400 });
  }
}
