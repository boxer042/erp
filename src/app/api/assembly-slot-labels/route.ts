import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assemblySlotLabelSchema } from "@/lib/validators/assembly-template";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";

  const labels = await prisma.assemblySlotLabel.findMany({
    where: search
      ? { name: { contains: search, mode: "insensitive" } }
      : undefined,
    include: { _count: { select: { slots: true } } },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  return NextResponse.json(labels);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = assemblySlotLabelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  try {
    const label = await prisma.assemblySlotLabel.create({
      data: { name: data.name, isActive: data.isActive ?? true },
    });
    return NextResponse.json(label, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "이미 등록된 라벨명입니다" },
        { status: 409 },
      );
    }
    const msg = e instanceof Error ? e.message : "라벨 등록 실패";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
