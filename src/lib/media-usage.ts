// 미디어 사용처 인덱스 — 업로드된 이미지 URL 이 앱 곳곳에서 어디에 쓰이는지 집계한다.
// 키는 "정규화된 전체 public URL"(버킷+path 아님) — 크로스버킷 재사용을 올바로 잡기 위함.
//
// /api/media/library (전체 조회) 와 /api/media/purge (삭제 가드) 가 공유한다.

import { prisma } from "@/lib/prisma";
import { extractLandingBlockUrls } from "@/lib/validators/landing-block-media";
import { extractManualBlockUrls } from "@/lib/manual-blocks";

export type UsageKind =
  | "product-image"
  | "product-thumbnail"
  | "product-detail"
  | "brand-logo"
  | "category-image"
  | "channel-logo"
  | "rental-image"
  | "used-item"
  | "landing-block"
  | "manual-block";

export interface Usage {
  kind: UsageKind;
  /** 연결된 엔티티 id (이동/식별용) */
  id: string;
  /** 엔티티 이름 */
  name: string;
  /** 한글 사용처 라벨 */
  label: string;
}

const LABEL: Record<UsageKind, string> = {
  "product-image": "상품 대표이미지",
  "product-thumbnail": "상품 썸네일",
  "product-detail": "상품 상세이미지",
  "brand-logo": "브랜드 로고",
  "category-image": "카테고리 이미지",
  "channel-logo": "채널 로고",
  "rental-image": "임대자산 사진",
  "used-item": "중고단품 사진",
  "landing-block": "랜딩 블록",
  "manual-block": "사용설명 블록",
};

/** 쿼리스트링/캐시버스터 제거 + 호스트 소문자. path 대소문자는 유지. */
export function normalizeMediaUrl(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    // 절대 URL 이 아니면(상대경로 등) 쿼리만 제거
    return url.split("?")[0].replace(/\/+$/, "");
  }
}

/** 모든 이미지 보유 필드를 스캔해 normalizedUrl → Usage[] 맵을 만든다. */
export async function buildUsageIndex(): Promise<Map<string, Usage[]>> {
  const index = new Map<string, Usage[]>();
  const add = (rawUrl: unknown, u: Usage) => {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) return;
    const key = normalizeMediaUrl(rawUrl);
    if (!key) return;
    const arr = index.get(key);
    if (arr) arr.push(u);
    else index.set(key, [u]);
  };

  const [products, media, brands, categories, channels, rentals, usedItems, landingSettings] =
    await Promise.all([
      prisma.product.findMany({
        select: { id: true, name: true, imageUrl: true, landingBlocks: true, manualBlocks: true },
      }),
      prisma.productMedia.findMany({
        where: { type: "IMAGE" },
        select: { id: true, url: true, kind: true, product: { select: { name: true } } },
      }),
      prisma.brand.findMany({
        where: { logoUrl: { not: null } },
        select: { id: true, name: true, logoUrl: true },
      }),
      prisma.productCategory.findMany({
        where: { imageUrl: { not: null } },
        select: { id: true, name: true, imageUrl: true },
      }),
      prisma.salesChannel.findMany({
        where: { logoUrl: { not: null } },
        select: { id: true, name: true, logoUrl: true },
      }),
      prisma.rentalAsset.findMany({
        select: { id: true, name: true, imageUrl: true, manualBlocks: true },
      }),
      prisma.usedItem.findMany({
        select: { id: true, displayName: true, imageUrls: true },
      }),
      prisma.landingSettings.findMany({
        select: { id: true, headerBlocks: true, footerBlocks: true },
      }),
    ]);

  for (const p of products) {
    add(p.imageUrl, { kind: "product-image", id: p.id, name: p.name, label: LABEL["product-image"] });
    for (const url of extractLandingBlockUrls(p.landingBlocks))
      add(url, { kind: "landing-block", id: p.id, name: p.name, label: LABEL["landing-block"] });
    for (const url of extractManualBlockUrls(p.manualBlocks))
      add(url, { kind: "manual-block", id: p.id, name: p.name, label: LABEL["manual-block"] });
  }
  for (const m of media) {
    const kind: UsageKind = m.kind === "THUMBNAIL" ? "product-thumbnail" : "product-detail";
    add(m.url, { kind, id: m.id, name: m.product.name, label: LABEL[kind] });
  }
  for (const b of brands)
    add(b.logoUrl, { kind: "brand-logo", id: b.id, name: b.name, label: LABEL["brand-logo"] });
  for (const c of categories)
    add(c.imageUrl, { kind: "category-image", id: c.id, name: c.name, label: LABEL["category-image"] });
  for (const c of channels)
    add(c.logoUrl, { kind: "channel-logo", id: c.id, name: c.name, label: LABEL["channel-logo"] });
  for (const r of rentals) {
    add(r.imageUrl, { kind: "rental-image", id: r.id, name: r.name, label: LABEL["rental-image"] });
    for (const url of extractManualBlockUrls(r.manualBlocks))
      add(url, { kind: "manual-block", id: r.id, name: r.name, label: LABEL["manual-block"] });
  }
  for (const u of usedItems) {
    const urls = Array.isArray(u.imageUrls) ? u.imageUrls : [];
    for (const url of urls)
      add(url, { kind: "used-item", id: u.id, name: u.displayName, label: LABEL["used-item"] });
  }
  for (const s of landingSettings) {
    for (const url of extractLandingBlockUrls(s.headerBlocks))
      add(url, { kind: "landing-block", id: s.id, name: "공통 헤더", label: LABEL["landing-block"] });
    for (const url of extractLandingBlockUrls(s.footerBlocks))
      add(url, { kind: "landing-block", id: s.id, name: "공통 푸터", label: LABEL["landing-block"] });
  }

  return index;
}

/** 단일 URL 의 사용처. 인덱스를 미리 만들어 넘기면 재사용. 없으면 새로 빌드. */
export async function findUsagesForUrl(
  url: string,
  index?: Map<string, Usage[]>,
): Promise<Usage[]> {
  const idx = index ?? (await buildUsageIndex());
  return idx.get(normalizeMediaUrl(url)) ?? [];
}
