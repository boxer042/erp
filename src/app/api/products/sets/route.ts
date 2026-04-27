import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { productId, components } = body as {
    productId: string;
    components: { componentId: string; quantity: string; label?: string | null }[];
  };

  if (!productId || !components?.length) {
    return NextResponse.json({ error: "상품ID와 구성품이 필요합니다" }, { status: 400 });
  }

  // 기존 구성 삭제 후 재생성
  await prisma.$transaction([
    prisma.setComponent.deleteMany({ where: { setProductId: productId } }),
    ...components.map((c) =>
      prisma.setComponent.create({
        data: {
          setProductId: productId,
          componentId: c.componentId,
          quantity: parseFloat(c.quantity),
          label: c.label?.trim() ? c.label.trim() : null,
        },
      })
    ),
    prisma.product.update({
      where: { id: productId },
      data: { isSet: true },
    }),
  ]);

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      setComponents: {
        include: { component: { select: { name: true, sku: true } } },
      },
    },
  });

  return NextResponse.json(product, { status: 201 });
}
