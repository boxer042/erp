import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { findUsagesForUrl } from "@/lib/media-usage";

/**
 * DELETE /api/media/purge
 * Body: { bucket: string, path: string }
 *
 * 앱 어디에서도(버킷 무관, 전체 URL 기준) 참조되지 않는 경우에만 스토리지에서 삭제.
 * 사용처 발견 시 409 + usages 반환.
 */

const ALLOWED_BUCKETS = [
  "brand-logos",
  "category-images",
  "channel-logos",
  "product-images",
] as const;
type BucketName = (typeof ALLOWED_BUCKETS)[number];

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

  // 사용처 검사 — 버킷 무관 전체 public URL 기준 (크로스버킷 재사용 포함)
  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
  const usages = await findUsagesForUrl(pub.publicUrl);
  if (usages.length > 0) {
    return NextResponse.json({ error: "사용 중인 이미지입니다", usages }, { status: 409 });
  }

  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) {
    console.error("[media/purge] supabase remove error", error);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
