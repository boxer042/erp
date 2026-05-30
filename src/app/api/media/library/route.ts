import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { buildUsageIndex, normalizeMediaUrl, type Usage } from "@/lib/media-usage";

/**
 * GET /api/media/library
 * 현재 사용자가 업로드한 "모든 버킷"의 이미지 + 각 이미지의 사용처(usages) 반환.
 * 버킷 구분 없이 통합 — 라이브러리 선택 / 설정 이미지관리에서 사용.
 * 사용처가 없으면 usages: [] (= 미사용).
 */

const BUCKETS = ["brand-logos", "category-images", "channel-logos", "product-images"] as const;

interface LibraryItem {
  bucket: string;
  path: string;
  name: string;
  url: string;
  size: number | null;
  createdAt: string | null;
  usages: Usage[];
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return NextResponse.json({ error: "세션 인증 실패" }, { status: 401 });

  const folder = authUser.id;

  // 한 버킷의 한 폴더(prefix)를 나열 → raw 아이템 배열
  const listFolder = async (bucket: string, prefix: string) => {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: 1000,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (error) {
      console.error("[media/library] list error", bucket, prefix, error);
      return [] as Omit<LibraryItem, "usages">[];
    }
    return (data ?? [])
      .filter((it) => it.id !== null) // 폴더(id=null) 제외
      .map((it) => {
        const path = `${prefix}/${it.name}`;
        const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
        const meta = it.metadata as { size?: number } | null;
        return {
          bucket,
          path,
          name: it.name,
          url: pub.publicUrl,
          size: meta?.size ?? null,
          createdAt: it.created_at ?? null,
        };
      });
  };

  // 인덱스 + 전 버킷 나열을 병렬로. product-images 는 used-items 하위폴더도 포함.
  const [index, lists] = await Promise.all([
    buildUsageIndex(),
    Promise.all([
      ...BUCKETS.map((b) => listFolder(b, folder)),
      listFolder("product-images", `${folder}/used-items`),
    ]),
  ]);

  const items: LibraryItem[] = lists.flat().map((it) => ({
    ...it,
    usages: index.get(normalizeMediaUrl(it.url)) ?? [],
  }));

  // 최신순 (createdAt desc, null 은 뒤로)
  items.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  return NextResponse.json({ items });
}
