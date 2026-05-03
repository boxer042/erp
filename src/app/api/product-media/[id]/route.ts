import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { type, kind, url, title, sortOrder } = body ?? {};
  const media = await prisma.productMedia.update({
    where: { id },
    data: {
      ...(type ? { type } : {}),
      ...(kind === "THUMBNAIL" || kind === "DETAIL" ? { kind } : {}),
      ...(url !== undefined ? { url: String(url).trim() } : {}),
      ...(title !== undefined ? { title: title?.trim() || null } : {}),
      ...(typeof sortOrder === "number" ? { sortOrder } : {}),
    },
  });
  return NextResponse.json(media);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const media = await prisma.productMedia.findUnique({ where: { id } });
  if (!media) return NextResponse.json({ success: true });

  await prisma.$transaction(async (tx) => {
    await tx.productMedia.delete({ where: { id } });
    // 이 미디어가 대표 이미지였다면 Product.imageUrl도 정리
    if (media.type === "IMAGE") {
      await tx.product.updateMany({
        where: { id: media.productId, imageUrl: media.url },
        data: { imageUrl: null },
      });
    }
  });

  // 스토리지 삭제는 /settings/media 에서 일괄 관리.
  // 여기서는 DB 분리만 — 다른 상품/미디어에서 재사용하거나 실수 복구가 가능하도록.
  return NextResponse.json({ success: true });
}
