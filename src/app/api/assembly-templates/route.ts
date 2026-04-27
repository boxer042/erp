import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assemblyTemplateSchema } from "@/lib/validators/assembly-template";

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
          order: s.order ?? idx,
          defaultProductId: s.defaultProductId || null,
          defaultQuantity: parseFloat(s.defaultQuantity),
        })),
      },
    },
    include: { slots: { orderBy: { order: "asc" } } },
  });

  return NextResponse.json(template, { status: 201 });
}
