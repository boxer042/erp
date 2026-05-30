// Product.landingBlocks / LandingSettings.headerBlocks·footerBlocks (Json) 안에
// 들어있는 "이미지" URL 만 추출한다. 동영상(videoUrl / video.value)·HTML(htmlUrl)은 제외.
//
// 미디어 사용처 인덱스(src/lib/media-usage.ts)에서 쓰므로 Zod 풀파싱 없이
// 블록 타입별로 알려진 이미지 필드만 얕고 방어적으로 읽는다.
// 필드 위치 권위 출처: src/lib/validators/landing-block.ts

function pushUrl(out: string[], v: unknown) {
  if (typeof v === "string" && v.trim()) out.push(v);
}

function pushArrayField(out: string[], arr: unknown, key: string) {
  if (!Array.isArray(arr)) return;
  for (const item of arr) {
    if (item && typeof item === "object") {
      pushUrl(out, (item as Record<string, unknown>)[key]);
    }
  }
}

/** 랜딩 블록 배열(Json)에서 이미지 URL 목록을 뽑는다. 손상된 데이터는 무시. */
export function extractLandingBlockUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const block of raw) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    switch (b.type) {
      case "hero":
      case "image":
      case "scrolly-hero":
      case "parallax":
        pushUrl(out, b.imageUrl);
        break;
      case "ambient-video":
        // 포스터는 업로드 이미지 — videoUrl(동영상)은 제외
        pushUrl(out, b.posterUrl);
        break;
      case "gallery":
        pushArrayField(out, b.images, "url");
        break;
      case "sticky-feature":
        pushArrayField(out, b.panels, "imageUrl");
        break;
      case "product-hero":
        pushArrayField(out, b.imagesOverride, "url");
        break;
      // text / table / chart / stats-grid / callout / info-grid / spec-table /
      // product-info / video / html-embed: 이미지 필드 없음
    }
  }
  return out;
}
