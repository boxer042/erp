import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assemblyTemplateSchema } from "@/lib/validators/assembly-template";
import { guardAdmin } from "@/lib/api-auth";

export async function GET() {
  const templates = await prisma.assemblyTemplate.findMany({
    include: {
      slots: { orderBy: { order: "asc" } },
      _count: { select: { slots: true, presets: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(templates);
}

export async function POST(request: NextRequest) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const body = await request.json();
  const parsed = assemblyTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const template = await prisma.assemblyTemplate.create({
    data: {
      name: data.name,
      description: data.description,
      defaultLaborCost: data.defaultLaborCost ? parseFloat(data.defaultLaborCost) : null,
      isActive: data.isActive ?? true,
      slots: {
        create: data.slots.map((s, idx) => ({
          label: s.label,
          slotLabelId: s.slotLabelId || null,
          order: s.order ?? idx,
          defaultProductId: s.defaultProductId || null,
          defaultQuantity: parseFloat(s.defaultQuantity),
          isVariable: s.isVariable ?? false,
        })),
      },
    },
    // GET 응답과 동일한 형태로 — 클라이언트는 templates 상태에 그대로 spread 하므로
    // presets 가 누락되면 .length 접근에서 런타임 에러 발생.
    include: {
      slots: { orderBy: { order: "asc" } },
      presets: { where: { isActive: true } },
    },
  });

  return NextResponse.json(template, { status: 201 });
}
