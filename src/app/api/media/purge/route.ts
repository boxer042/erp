import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

/**
 * DELETE /api/media/purge
 * Body: { bucket: string, path: string }
 *
 * DB 어디에서도 참조되지 않는 경우에만 스토리지에서 삭제.
 * 참조 발견 시 409 + 사용처 반환.
 */

const ALLOWED_BUCKETS = [
  "brand-logos",
  "category-images",
  "channel-logos",
  "product-images",
] as const;
type BucketName = (typeof ALLOWED_BUCKETS)[number];

interface RefInfo {
  kind: "brand" | "category" | "channel" | "product" | "product-media";
  id: string;
  name: string;
}

function extractPath(url: string, bucket: string): string | null {
  const marker = `/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

async function findRefs(bucket: BucketName, path: string): Promise<RefInfo[]> {
  const refs: RefInfo[] = [];

  if (bucket === "brand-logos") {
    const rows = await prisma.brand.findMany({
      where: { logoPath: path },
      select: { id: true, name: true },
    });
    rows.forEach((r) => refs.push({ kind: "brand", id: r.id, name: r.name }));
  } else if (bucket === "category-images") {
    const rows = await prisma.productCategory.findMany({
      where: { imagePath: path },
      select: { id: true, name: true },
    });
    rows.forEach((r) => refs.push({ kind: "category", id: r.id, name: r.name }));
  } else if (bucket === "channel-logos") {
    const rows = await prisma.salesChannel.findMany({
      where: { logoPath: path },
      select: { id: true, name: true },
    });
    rows.forEach((r) => refs.push({ kind: "channel", id: r.id, name: r.name }));
  } else if (bucket === "product-images") {
    // URL 기반 — 모든 product / productMedia 검사 (path가 URL 끝에 들어있어야 함)
    const products = await prisma.product.findMany({
      where: { imageUrl: { not: null } },
      select: { id: true, name: true, imageUrl: true },
    });
    products.forEach((p) => {
      const ePath = p.imageUrl ? extractPath(p.imageUrl, bucket) : null;
      if (ePath === path) refs.push({ kind: "product", id: p.id, name: p.name });
    });
    const media = await prisma.productMedia.findMany({
      where: { type: "IMAGE" },
      select: { id: true, url: true, product: { select: { name: true } } },
    });
    media.forEach((m) => {
      const ePath = extractPath(m.url, bucket);
      if (ePath === path) refs.push({ kind: "product-media", id: m.id, name: m.product.name });
    });
  }

  return refs;
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const body = (await request.json()) as { bucket?: string; path?: string };
  const bucket = body.bucket as BucketName | undefined;
  const path = body.path;

  if (!bucket || !ALLOWED_BUCKETS.includes(bucket)) {
    return NextResponse.json({ error: "유효하지 않은 bucket" }, { status: 400 });
  }
  if (!path) return NextResponse.json({ error: "path 누락" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return NextResponse.json({ error: "세션 인증 실패" }, { status: 401 });

  // 보안: 본인 폴더의 파일만 삭제 가능
  if (!path.startsWith(`${authUser.id}/`)) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  // 참조 검사
  const refs = await findRefs(bucket, path);
  if (refs.length > 0) {
    return NextResponse.json(
      { error: "사용 중인 이미지입니다", refs },
      { status: 409 },
    );
  }

  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) {
    console.error("[media/purge] supabase remove error", error);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
