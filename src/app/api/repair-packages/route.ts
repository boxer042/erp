import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const search = new URL(request.url).searchParams.get("search") ?? "";
  const packages = await prisma.repairPackage.findMany({
    where: {
      isActive: true,
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    },
    include: {
      labors: { include: { laborPreset: true }, orderBy: { sortOrder: "asc" } },
      parts: { include: { product: { select: { id: true, name: true, sku: true, sellingPrice: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(packages);
}

export async function POST(request: NextRequest) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const body = await request.json();
  const { name, description, memo, labors = [], parts = [] } = body ?? {};
  if (!name?.trim()) {
    return NextResponse.json({ error: "이름은 필수입니다" }, { status: 400 });
  }
  const pkg = await prisma.repairPackage.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      memo: memo?.trim() || null,
      labors: {
        create: labors.map((l: { laborPresetId?: string; name: string; unitRate: number; quantity?: number }, idx: number) => ({
          laborPresetId: l.laborPresetId || null,
          name: l.name,
          unitRate: parseFloat(String(l.unitRate)) || 0,
          quantity: l.quantity ?? 1,
          sortOrder: idx,
        })),
      },
      parts: {
        create: parts.map((p: { productId: string; quantity: number; unitPrice: number }) => ({
          productId: p.productId,
          quantity: parseFloat(String(p.quantity)) || 1,
          unitPrice: parseFloat(String(p.unitPrice)) || 0,
        })),
      },
    },
    include: {
      labors: { include: { laborPreset: true } },
      parts: { include: { product: { select: { id: true, name: true, sku: true } } } },
    },
  });
  return NextResponse.json(pkg, { status: 201 });
}
