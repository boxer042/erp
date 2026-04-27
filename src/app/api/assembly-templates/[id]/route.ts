import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assemblyTemplateSchema } from "@/lib/validators/assembly-template";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const template = await prisma.assemblyTemplate.findUnique({
    where: { id },
    include: {
      slots: {
        orderBy: { order: "asc" },
        include: {
          defaultProduct: { select: { id: true, name: true, sku: true } },
        },
      },
      presets: {
        orderBy: { createdAt: "desc" },
        include: {
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true } },
              slot: { select: { id: true, label: true, order: true } },
            },
          },
        },
      },
    },
  });
  if (!template) {
    return NextResponse.json({ error: "템플릿을 찾을 수 없습니다" }, { status: 404 });
  }
  return NextResponse.json(template);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = assemblyTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  try {
    const template = await prisma.$transaction(async (tx) => {
      await tx.assemblyTemplate.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          defaultLaborCost: data.defaultLaborCost
            ? parseFloat(data.defaultLaborCost)
            : null,
          isActive: data.isActive ?? true,
        },
      });

      // 슬롯 전면 재구성: 들어오지 않은 id는 삭제, 들어온 id는 업데이트, id 없으면 신규
      const existingSlots = await tx.assemblyTemplateSlot.findMany({
        where: { templateId: id },
        select: { id: true },
      });
      const existingIds = new Set(existingSlots.map((s) => s.id));
      const incomingIds = new Set(
        data.slots.filter((s) => s.id).map((s) => s.id as string),
      );

      // 삭제
      const toDelete = [...existingIds].filter((x) => !incomingIds.has(x));
      if (toDelete.length > 0) {
        await tx.assemblyTemplateSlot.deleteMany({
          where: { id: { in: toDelete } },
        });
      }

      // 업데이트/신규
      for (let idx = 0; idx < data.slots.length; idx++) {
        const s = data.slots[idx];
        const slotData = {
          label: s.label,
          slotLabelId: s.slotLabelId || null,
          order: s.order ?? idx,
          defaultProductId: s.defaultProductId || null,
          defaultQuantity: parseFloat(s.defaultQuantity),
        };
        if (s.id && existingIds.has(s.id)) {
          await tx.assemblyTemplateSlot.update({
            where: { id: s.id },
            data: slotData,
          });
        } else {
          await tx.assemblyTemplateSlot.create({
            data: { templateId: id, ...slotData },
          });
        }
      }

      return tx.assemblyTemplate.findUnique({
        where: { id },
        include: { slots: { orderBy: { order: "asc" } } },
      });
    });

    return NextResponse.json(template);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "템플릿 수정 실패";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await prisma.assemblyTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "삭제 실패 (프리셋이 남아있을 수 있음)" },
      { status: 400 },
    );
  }
}
