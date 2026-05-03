import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

/**
 * GET /api/media/list?bucket=brand-logos
 * 현재 사용자가 업로드한 파일 목록 + 각 파일의 DB 참조 정보 반환.
 * 참조가 없는 파일은 "고아"로 분류됨.
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

interface MediaItem {
  path: string;
  name: string;
  url: string;
  size: number | null;
  createdAt: string | null;
  refs: RefInfo[];
}

function extractPath(url: string, bucket: string): string | null {
  const marker = `/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

async function getRefsForBucket(bucket: BucketName): Promise<Map<string, RefInfo[]>> {
  const refs = new Map<string, RefInfo[]>();
  const add = (path: string, ref: RefInfo) => {
    const arr = refs.get(path);
    if (arr) arr.push(ref);
    else refs.set(path, [ref]);
  };

  if (bucket === "brand-logos") {
    const rows = await prisma.brand.findMany({
      where: { logoPath: { not: null } },
      select: { id: true, name: true, logoPath: true },
    });
    rows.forEach((r) => r.logoPath && add(r.logoPath, { kind: "brand", id: r.id, name: r.name }));
  } else if (bucket === "category-images") {
    const rows = await prisma.productCategory.findMany({
      where: { imagePath: { not: null } },
      select: { id: true, name: true, imagePath: true },
    });
    rows.forEach((r) => r.imagePath && add(r.imagePath, { kind: "category", id: r.id, name: r.name }));
  } else if (bucket === "channel-logos") {
    const rows = await prisma.salesChannel.findMany({
      where: { logoPath: { not: null } },
      select: { id: true, name: true, logoPath: true },
    });
    rows.forEach((r) => r.logoPath && add(r.logoPath, { kind: "channel", id: r.id, name: r.name }));
  } else if (bucket === "product-images") {
    const products = await prisma.product.findMany({
      where: { imageUrl: { not: null } },
      select: { id: true, name: true, imageUrl: true },
    });
    products.forEach((p) => {
      const path = p.imageUrl ? extractPath(p.imageUrl, bucket) : null;
      if (path) add(path, { kind: "product", id: p.id, name: p.name });
    });
    const media = await prisma.productMedia.findMany({
      where: { type: "IMAGE" },
      select: { id: true, url: true, product: { select: { name: true } } },
    });
    media.forEach((m) => {
      const path = extractPath(m.url, bucket);
      if (path) add(path, { kind: "product-media", id: m.id, name: m.product.name });
    });
  }

  return refs;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const bucket = request.nextUrl.searchParams.get("bucket") as BucketName | null;
  if (!bucket || !ALLOWED_BUCKETS.includes(bucket)) {
    return NextResponse.json({ error: "유효하지 않은 bucket" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return NextResponse.json({ error: "세션 인증 실패" }, { status: 401 });

  const folder = authUser.id;
  const { data: storageItems, error } = await supabase.storage.from(bucket).list(folder, {
    limit: 1000,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error) {
    console.error("[media/list] supabase list error", error);
    return NextResponse.json({ error: "목록 조회 실패" }, { status: 500 });
  }

  const refMap = await getRefsForBucket(bucket);

  const items: MediaItem[] = (storageItems ?? [])
    .filter((it) => it.id !== null) // folders have id=null
    .map((it) => {
      const path = `${folder}/${it.name}`;
      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
      const meta = it.metadata as { size?: number } | null;
      return {
        path,
        name: it.name,
        url: pub.publicUrl,
        size: meta?.size ?? null,
        createdAt: it.created_at ?? null,
        refs: refMap.get(path) ?? [],
      };
    });

  return NextResponse.json({ bucket, items });
}
