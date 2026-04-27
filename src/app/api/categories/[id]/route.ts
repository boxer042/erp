import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  parentId: z.string().nullable().optional(),
  order: z.number().int().optional(),
  imageUrl: z.string().nullable().optional(),
  imagePath: z.string().nullable().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const category = await prisma.productCategory.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.parentId !== undefined && { parentId: data.parentId }),
      ...(data.order !== undefined && { order: data.order }),
      ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
      ...(data.imagePath !== undefined && { imagePath: data.imagePath }),
    },
  });

  return NextResponse.json(category);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [childCount, productCount] = await Promise.all([
    prisma.productCategory.count({ where: { parentId: id, isActive: true } }),
    prisma.product.count({ where: { categoryId: id, isActive: true } }),
  ]);

  if (childCount > 0 || productCount > 0) {
    return NextResponse.json(
      {
        error: `하위 카테고리 ${childCount}개, 연결된 상품 ${productCount}개가 있습니다. 먼저 이동하거나 삭제해주세요.`,
        childCount,
        productCount,
      },
      { status: 409 }
    );
  }

  await prisma.productCategory.update({
    where: { id },
    data: { isActive: false },
  });

  return NextResponse.json({ success: true });
}
