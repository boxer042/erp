// Product.manualBlocks 에 저장되는 사용법·관리 매뉴얼 블록 정의.
// 손님 시리얼 페이지의 "사용법" + 상품 상세의 매뉴얼 에디터가 공유.

export type ManualBlock =
  | { id: string; type: "heading"; level: 2 | 3; text: string }
  | { id: string; type: "paragraph"; text: string }
  | { id: string; type: "image"; url: string; caption?: string }
  | { id: string; type: "gallery"; items: { url: string; caption?: string }[] }
  | {
      id: string;
      type: "video";
      provider: "youtube" | "vimeo" | "self";
      url: string;
    }
  | {
      id: string;
      type: "steps";
      items: { title: string; body: string; imageUrl?: string }[];
    }
  | { id: string; type: "spec"; rows: { label: string; value: string }[] }
  | {
      id: string;
      type: "callout";
      variant: "info" | "warning" | "danger";
      title?: string;
      body: string;
    }
  | { id: string; type: "faq"; items: { q: string; a: string }[] }
  | { id: string; type: "pdf"; url: string; label: string };

export type ManualBlockType = ManualBlock["type"];

export const MANUAL_BLOCK_LABELS: Record<ManualBlockType, string> = {
  heading: "제목",
  paragraph: "단락",
  image: "이미지",
  gallery: "갤러리",
  video: "동영상",
  steps: "단계 안내",
  spec: "사양 표",
  callout: "주의 박스",
  faq: "자주 묻는 질문",
  pdf: "PDF 첨부",
};

// JSON(unknown) → ManualBlock[] 안전 파싱. 손상된 데이터는 빈 배열.
export function parseManualBlocks(raw: unknown): ManualBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (b): b is ManualBlock =>
      !!b &&
      typeof b === "object" &&
      typeof (b as { id?: unknown }).id === "string" &&
      typeof (b as { type?: unknown }).type === "string" &&
      (b as { type: string }).type in MANUAL_BLOCK_LABELS,
  );
}

// 새 블록 팩토리 — 에디터에서 블록 추가 시 사용.
export function createManualBlock(type: ManualBlockType): ManualBlock {
  const id = `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  switch (type) {
    case "heading":
      return { id, type, level: 2, text: "" };
    case "paragraph":
      return { id, type, text: "" };
    case "image":
      return { id, type, url: "" };
    case "gallery":
      return { id, type, items: [] };
    case "video":
      return { id, type, provider: "youtube", url: "" };
    case "steps":
      return { id, type, items: [{ title: "", body: "" }] };
    case "spec":
      return { id, type, rows: [{ label: "", value: "" }] };
    case "callout":
      return { id, type, variant: "info", body: "" };
    case "faq":
      return { id, type, items: [{ q: "", a: "" }] };
    case "pdf":
      return { id, type, url: "", label: "사용설명서" };
  }
}

// YouTube/Vimeo URL → 임베드 URL.
export function toEmbedUrl(
  provider: "youtube" | "vimeo" | "self",
  url: string,
): string {
  if (provider === "self") return url;
  if (provider === "youtube") {
    const m = url.match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/,
    );
    return m ? `https://www.youtube.com/embed/${m[1]}` : url;
  }
  // vimeo
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? `https://player.vimeo.com/video/${m[1]}` : url;
}
