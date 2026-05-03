import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;
  const productId = request.nextUrl.searchParams.get("productId");
  if (!productId) {
    return NextResponse.json({ error: "productId가 필요합니다" }, { status: 400 });
  }
  const media = await prisma.productMedia.findMany({
    where: { productId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(media);
}

export async function POST(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;
  const body = await request.json();
  const { productId, type, kind, url, title, sortOrder, setPrimary } = body ?? {};
  if (!productId || !type || !url) {
    return NextResponse.json({ error: "productId, type, url 필수" }, { status: 400 });
  }
  if (type !== "IMAGE" && type !== "YOUTUBE") {
    return NextResponse.json({ error: "type은 IMAGE 또는 YOUTUBE" }, { status: 400 });
  }
  const resolvedKind: "THUMBNAIL" | "DETAIL" =
    kind === "DETAIL" ? "DETAIL" : "THUMBNAIL";
  const cleanUrl = String(url).trim();
  const media = await prisma.$transaction(async (tx) => {
    // sortOrder 미지정 시 현재 갯수로 자동 부여 (맨 끝에 추가)
    const resolvedSortOrder =
      typeof sortOrder === "number"
        ? sortOrder
        : await tx.productMedia.count({ where: { productId } });
    const created = await tx.productMedia.create({
      data: {
        productId,
        type,
        kind: resolvedKind,
        url: cleanUrl,
        title: title?.trim() || null,
        sortOrder: resolvedSortOrder,
      },
    });
    if (type === "IMAGE") {
      if (setPrimary === true) {
        // 명시적으로 대표 이미지 지정
        await tx.product.update({
          where: { id: productId },
          data: { imageUrl: cleanUrl },
        });
      } else {
        // 자동 동기화: Product.imageUrl이 비어있을 때만 채움
        const product = await tx.product.findUnique({
          where: { id: productId },
          select: { imageUrl: true },
        });
        if (product && !product.imageUrl) {
          await tx.product.update({
            where: { id: productId },
            data: { imageUrl: cleanUrl },
          });
        }
      }
    }
    return created;
  });
  return NextResponse.json(media, { status: 201 });
}
