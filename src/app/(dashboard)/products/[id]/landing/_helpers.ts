import type { LandingBlock } from "@/lib/validators/landing-block";

export async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/products/upload", { method: "POST", body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "업로드 실패");
  }
  const { url } = (await res.json()) as { url: string };
  return url;
}

export async function uploadHtml(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/products/upload-html", { method: "POST", body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "업로드 실패");
  }
  const { url } = (await res.json()) as { url: string };
  return url;
}

export function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `b-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function duplicateAt<T extends { id: string }>(
  arr: T[],
  idx: number,
  newId: string,
): { next: T[]; insertedId: string } {
  if (idx < 0 || idx >= arr.length) return { next: arr, insertedId: "" };
  const original = arr[idx];
  const clone = { ...JSON.parse(JSON.stringify(original)), id: newId } as T;
  const next = arr.slice();
  next.splice(idx + 1, 0, clone);
  return { next, insertedId: newId };
}

export function blockTitle(block: LandingBlock): string {
  switch (block.type) {
    case "hero":
      return block.headline || "히어로 (제목 없음)";
    case "image":
      return block.alt || "이미지";
    case "text":
      return block.heading || (block.body ? block.body.slice(0, 24) : "텍스트");
    case "video":
      return block.caption || (block.value ? `비디오 — ${block.value.slice(0, 24)}` : "비디오");
    case "gallery":
      return `갤러리 (${block.images.length}장)`;
    case "scrolly-hero":
      return block.headline || "스크롤 히어로";
    case "sticky-feature":
      return block.heading || `스티키 피처 (${block.panels.length}패널)`;
    case "parallax":
      return block.headline || "패럴럭스";
    case "spec-table":
      return block.title || "스펙표 (자동)";
    case "ambient-video":
      return block.headline || "분위기 영상";
    case "table":
      return block.caption || `표 (${block.rows.length}행 × ${block.headers.length}열)`;
    case "chart":
      return block.title || `차트 — ${block.chartType} (${block.data.length}개)`;
    case "stats-grid":
      return block.heading
        ? block.heading.replace(/\n/g, " ").slice(0, 24)
        : `스탯 (${block.items.length}개)`;
    case "callout":
      return block.label || (block.body ? block.body.slice(0, 24) : "강조 박스");
    case "info-grid":
      return `정보 그리드 (${block.sections.length}섹션)`;
    case "product-info":
      return block.title || "상품정보 고시 (자동)";
    case "html-embed":
      return block.htmlUrl
        ? `HTML 임베드 (${block.displayMode}, ${block.heightPx}px)`
        : "HTML 임베드 (파일 없음)";
  }
}
