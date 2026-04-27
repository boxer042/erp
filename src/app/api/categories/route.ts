import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const categorySchema = z.object({
  name: z.string().min(1, "카테고리명을 입력해주세요"),
  parentId: z.string().nullable().optional(),
  order: z.number().int().default(0),
  imageUrl: z.string().nullable().optional(),
  imagePath: z.string().nullable().optional(),
});

export async function GET() {
  const categories = await prisma.productCategory.findMany({
    where: { isActive: true },
    include: {
      children: {
        where: { isActive: true },
        orderBy: [{ order: "asc" }, { name: "asc" }],
      },
      _count: { select: { products: true } },
    },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });

  // 대분류만 반환 (children 포함)
  const roots = categories.filter((c) => c.parentId === null);
  return NextResponse.json(roots);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = categorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const category = await prisma.productCategory.create({
    data: {
      name: data.name,
      parentId: data.parentId || null,
      order: data.order,
      imageUrl: data.imageUrl || null,
      imagePath: data.imagePath || null,
    },
  });

  return NextResponse.json(category, { status: 201 });
}
