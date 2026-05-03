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
  }
}
