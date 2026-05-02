import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "product-images";

// 우리 Supabase 버킷 URL에서 storage path 추출. 외부 URL이면 null.
function extractStoragePath(url: string): string | null {
  const marker = `/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { type, url, title, sortOrder } = body ?? {};
  const media = await prisma.productMedia.update({
    where: { id },
    data: {
      ...(type ? { type } : {}),
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

  // 같은 URL이 다른 미디어 row 또는 다른 Product.imageUrl에서 여전히 참조되는지 확인
  if (media.type === "IMAGE") {
    const [stillInMedia, stillInProduct] = await Promise.all([
      prisma.productMedia.count({ where: { url: media.url } }),
      prisma.product.count({ where: { imageUrl: media.url } }),
    ]);
    if (stillInMedia === 0 && stillInProduct === 0) {
      const path = extractStoragePath(media.url);
      if (path) {
        const supabase = await createClient();
        const { error } = await supabase.storage.from(BUCKET).remove([path]);
        if (error) {
          // Storage 실패는 silent — DB는 이미 정리됐음. 모니터링 로그만 남김
          console.error("[product-media DELETE] storage remove error", error, "path:", path);
        }
      }
    }
  }

  return NextResponse.json({ success: true });
}
