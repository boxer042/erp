import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";

const createSchema = z.object({
  name: z.string().min(1, "이름은 필수입니다"),
  logoUrl: z.string().nullable().optional(),
  logoPath: z.string().nullable().optional(),
  memo: z.string().nullable().optional(),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") || "").trim();
  const includeInactive = searchParams.get("includeInactive") === "true";

  const brands = await prisma.brand.findMany({
    where: {
      ...(includeInactive ? {} : { isActive: true }),
      ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
    },
    include: {
      _count: { select: { products: true } },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(brands);
}

export async function POST(request: NextRequest) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  try {
    const brand = await prisma.brand.create({
      data: {
        name: data.name.trim(),
        logoUrl: data.logoUrl ?? null,
        logoPath: data.logoPath ?? null,
        memo: data.memo ?? null,
      },
    });
    return NextResponse.json(brand, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Unique")) {
      return NextResponse.json({ error: "이미 등록된 브랜드 이름입니다" }, { status: 409 });
    }
    return NextResponse.json({ error: "등록 실패" }, { status: 500 });
  }
}
