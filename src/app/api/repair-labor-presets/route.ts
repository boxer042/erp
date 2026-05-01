import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const search = new URL(request.url).searchParams.get("search") ?? "";
  const presets = await prisma.repairLaborPreset.findMany({
    where: {
      isActive: true,
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(presets);
}

export async function POST(request: NextRequest) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const body = await request.json();
  const { name, description, unitRate, memo } = body ?? {};
  if (!name?.trim() || unitRate === undefined) {
    return NextResponse.json({ error: "이름과 단가는 필수입니다" }, { status: 400 });
  }
  const preset = await prisma.repairLaborPreset.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      unitRate: parseFloat(String(unitRate)) || 0,
      memo: memo?.trim() || null,
    },
  });
  return NextResponse.json(preset, { status: 201 });
}
