import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { productSpecsInputSchema } from "@/lib/validators/spec-slot";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const values = await prisma.productSpecValue.findMany({
    where: { productId: id },
    include: { slot: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(values);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: productId } = await params;
  const body = await request.json();
  const parsed = productSpecsInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const inputs = parsed.data.values;

  // 동일 slotId 중복 차단
  const slotIds = inputs.map((i) => i.slotId);
  if (new Set(slotIds).size !== slotIds.length) {
    return NextResponse.json(
      { error: "동일한 슬롯이 중복 입력되었습니다" },
      { status: 400 },
    );
  }

  // 슬롯 데이터 조회 (검증용)
  const slots =
    slotIds.length > 0
      ? await prisma.productSpecSlot.findMany({ where: { id: { in: slotIds } } })
      : [];
  const slotById = new Map(slots.map((s) => [s.id, s]));

  // 입력 검증
  for (const it of inputs) {
    const slot = slotById.get(it.slotId);
    if (!slot) {
      return NextResponse.json(
        { error: `슬롯을 찾을 수 없습니다: ${it.slotId}` },
        { status: 400 },
      );
    }
    if (!it.value.trim()) {
      return NextResponse.json(
        { error: `${slot.name}: 값을 입력해주세요` },
        { status: 400 },
      );
    }
    if (slot.type === "NUMBER") {
      const n = parseFloat(it.value);
      if (isNaN(n)) {
        return NextResponse.json(
          { error: `${slot.name}: 숫자 값이어야 합니다` },
          { status: 400 },
        );
      }
    }
    if (slot.type === "ENUM" && !slot.options.includes(it.value)) {
      return NextResponse.json(
        { error: `${slot.name}: 허용되지 않은 값입니다` },
        { status: 400 },
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.productSpecValue.findMany({ where: { productId } });
    const existingBySlot = new Map(existing.map((v) => [v.slotId, v]));
    const inputBySlot = new Map(inputs.map((i) => [i.slotId, i]));

    // 1) 입력에 없는 기존 row 삭제
    const toDelete = existing.filter((v) => !inputBySlot.has(v.slotId)).map((v) => v.id);
    if (toDelete.length > 0) {
      await tx.productSpecValue.deleteMany({ where: { id: { in: toDelete } } });
    }

    // 2) 변경 update
    const updates: Promise<unknown>[] = [];
    for (const it of inputs) {
      const prev = existingBySlot.get(it.slotId);
      if (prev) {
        if (prev.value !== it.value || prev.order !== it.order) {
          updates.push(
            tx.productSpecValue.update({
              where: { id: prev.id },
              data: { value: it.value, order: it.order },
            }),
          );
        }
      }
    }
    await Promise.all(updates);

    // 3) 신규 createMany
    const toCreate = inputs.filter((i) => !existingBySlot.has(i.slotId));
    if (toCreate.length > 0) {
      await tx.productSpecValue.createMany({
        data: toCreate.map((i) => ({
          productId,
          slotId: i.slotId,
          value: i.value,
          order: i.order,
        })),
      });
    }
  });

  const result = await prisma.productSpecValue.findMany({
    where: { productId },
    include: { slot: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(result);
}
