import { z } from "zod";

export const heroBlockSchema = z.object({
  id: z.string(),
  type: z.literal("hero"),
  imageUrl: z.string().url().or(z.literal("")),
  headline: z.string().default(""),
  subheadline: z.string().default(""),
  textAlign: z.enum(["left", "center", "right"]).default("center"),
  textColor: z.enum(["light", "dark"]).default("light"),
  height: z.enum(["sm", "md", "lg", "screen"]).default("md"),
});

export const imageBlockSchema = z.object({
  id: z.string(),
  type: z.literal("image"),
  imageUrl: z.string().url().or(z.literal("")),
  alt: z.string().default(""),
  caption: z.string().default(""),
  fullWidth: z.boolean().default(true),
});

export const textBlockSchema = z.object({
  id: z.string(),
  type: z.literal("text"),
  heading: z.string().default(""),
  body: z.string().default(""),
  align: z.enum(["left", "center", "right"]).default("left"),
  background: z.enum(["none", "muted"]).default("none"),
});

export const videoBlockSchema = z.object({
  id: z.string(),
  type: z.literal("video"),
  // YouTube ID 또는 직접 mp4 URL
  source: z.enum(["youtube", "url"]).default("youtube"),
  value: z.string().default(""),
  caption: z.string().default(""),
  autoplay: z.boolean().default(false),
});

export const galleryBlockSchema = z.object({
  id: z.string(),
  type: z.literal("gallery"),
  images: z
    .array(
      z.object({
        url: z.string().url().or(z.literal("")),
        alt: z.string().default(""),
      }),
    )
    .default([]),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
});

// 스크롤 진입 시 fade-in + 위로 슬라이드 — 애플 첫 화면 같은 진입 효과
export const scrollyHeroBlockSchema = z.object({
  id: z.string(),
  type: z.literal("scrolly-hero"),
  imageUrl: z.string().url().or(z.literal("")),
  headline: z.string().default(""),
  subheadline: z.string().default(""),
  textColor: z.enum(["light", "dark"]).default("light"),
  height: z.enum(["md", "lg", "screen"]).default("lg"),
});

// 좌측 sticky 텍스트 + 우측 스크롤 이미지 (애플 feature 섹션)
export const stickyFeatureBlockSchema = z.object({
  id: z.string(),
  type: z.literal("sticky-feature"),
  heading: z.string().default(""),
  body: z.string().default(""),
  panels: z
    .array(
      z.object({
        imageUrl: z.string().url().or(z.literal("")),
        alt: z.string().default(""),
      }),
    )
    .default([]),
  textPosition: z.enum(["left", "right"]).default("left"),
});

// 패럴럭스 배경 (배경 고정, 콘텐츠 스크롤)
export const parallaxBlockSchema = z.object({
  id: z.string(),
  type: z.literal("parallax"),
  imageUrl: z.string().url().or(z.literal("")),
  headline: z.string().default(""),
  subheadline: z.string().default(""),
  textColor: z.enum(["light", "dark"]).default("light"),
  height: z.enum(["md", "lg"]).default("lg"),
});

// 반정형 — 상품 스펙 자동 표시 (Product.specValues 자동 참조)
export const specTableBlockSchema = z.object({
  id: z.string(),
  type: z.literal("spec-table"),
  title: z.string().default("상품 스펙"),
});

// 컨트롤 없는 자동 재생 분위기 비디오 (autoplay + muted + loop)
export const ambientVideoBlockSchema = z.object({
  id: z.string(),
  type: z.literal("ambient-video"),
  videoUrl: z.string().url().or(z.literal("")),
  posterUrl: z.string().url().or(z.literal("")),
  headline: z.string().default(""),
  subheadline: z.string().default(""),
  textColor: z.enum(["light", "dark"]).default("light"),
  height: z.enum(["md", "lg", "screen"]).default("lg"),
});

// 표 — 행/열 직접 입력
export const tableBlockSchema = z.object({
  id: z.string(),
  type: z.literal("table"),
  caption: z.string().default(""),
  headers: z.array(z.string()).default([]),
  rows: z.array(z.array(z.string())).default([]),
});

// 차트 — recharts 기반
export const chartBlockSchema = z.object({
  id: z.string(),
  type: z.literal("chart"),
  chartType: z.enum(["bar", "line", "pie"]).default("bar"),
  title: z.string().default(""),
  data: z
    .array(
      z.object({
        label: z.string().default(""),
        value: z.number().default(0),
      }),
    )
    .default([]),
});

export const landingBlockSchema = z.discriminatedUnion("type", [
  heroBlockSchema,
  imageBlockSchema,
  textBlockSchema,
  videoBlockSchema,
  galleryBlockSchema,
  scrollyHeroBlockSchema,
  stickyFeatureBlockSchema,
  parallaxBlockSchema,
  specTableBlockSchema,
  ambientVideoBlockSchema,
  tableBlockSchema,
  chartBlockSchema,
]);

export const landingBlocksSchema = z.array(landingBlockSchema);

export type HeroBlock = z.infer<typeof heroBlockSchema>;
export type ImageBlock = z.infer<typeof imageBlockSchema>;
export type TextBlock = z.infer<typeof textBlockSchema>;
export type VideoBlock = z.infer<typeof videoBlockSchema>;
export type GalleryBlock = z.infer<typeof galleryBlockSchema>;
export type ScrollyHeroBlock = z.infer<typeof scrollyHeroBlockSchema>;
export type StickyFeatureBlock = z.infer<typeof stickyFeatureBlockSchema>;
export type ParallaxBlock = z.infer<typeof parallaxBlockSchema>;
export type SpecTableBlock = z.infer<typeof specTableBlockSchema>;
export type AmbientVideoBlock = z.infer<typeof ambientVideoBlockSchema>;
export type TableBlock = z.infer<typeof tableBlockSchema>;
export type ChartBlock = z.infer<typeof chartBlockSchema>;
export type LandingBlock = z.infer<typeof landingBlockSchema>;

export type BlockType = LandingBlock["type"];

export const BLOCK_LABELS: Record<BlockType, string> = {
  hero: "히어로",
  image: "이미지",
  text: "텍스트",
  video: "비디오",
  gallery: "갤러리",
  "scrolly-hero": "스크롤 히어로",
  "sticky-feature": "스티키 피처",
  parallax: "패럴럭스",
  "spec-table": "스펙표 (자동)",
  "ambient-video": "분위기 영상",
  table: "표",
  chart: "차트",
};

export const BLOCK_DESCRIPTIONS: Record<BlockType, { title: string; body: string; example: string }> = {
  hero: {
    title: "히어로",
    body: "큰 배경 이미지 위에 제목·소제목을 얹는 기본 표지. 페이지 맨 위 첫 인상으로 사용하세요.",
    example: "예) 신제품 메인 이미지 + \"새로운 시작\" 같은 카피",
  },
  image: {
    title: "이미지",
    body: "단일 이미지 + 선택적 캡션. 폭 옵션(전체/좁게)을 지정할 수 있어 본문 사이에 끼워 넣기 좋습니다.",
    example: "예) 제품 사진 한 장, 매장 사진, 인포그래픽",
  },
  text: {
    title: "텍스트",
    body: "제목 + 본문 단락. 정렬과 배경색을 조절할 수 있고 줄바꿈은 그대로 유지됩니다.",
    example: "예) 제품 설명, 사용법 안내, 브랜드 소개 단락",
  },
  video: {
    title: "비디오",
    body: "YouTube URL/ID 또는 직접 mp4 URL을 임베드. 자동재생 옵션은 음소거+무한루프로 동작합니다.",
    example: "예) 제품 시연 영상, 광고 영상",
  },
  gallery: {
    title: "갤러리",
    body: "여러 이미지를 2/3/4열 그리드로 정사각형 배치. 정사각형 크롭 기준이라 동일 비율 이미지가 가장 깔끔합니다.",
    example: "예) 제품 컬러 변형, 사용 예시 모음",
  },
  "scrolly-hero": {
    title: "스크롤 히어로",
    body: "스크롤로 화면에 들어올 때 텍스트가 위로 슬라이드+이미지가 살짝 줌인 되는 등장 애니메이션이 있는 히어로.",
    example: "예) 페이지 중간의 챕터 구분 / 핵심 메시지 강조",
  },
  "sticky-feature": {
    title: "스티키 피처",
    body: "한쪽에 텍스트가 고정(sticky)되고 반대쪽으로 이미지 패널들이 흐르는 레이아웃. 애플 제품 페이지의 feature 섹션과 같은 구조.",
    example: "예) 한 카피로 여러 사용 장면 보여주기, 기능별 단계 설명",
  },
  parallax: {
    title: "패럴럭스",
    body: "배경 이미지가 화면에 고정되고 그 위로 텍스트가 흐르는 효과. 데스크톱/태블릿에서만 동작 (모바일은 일반 배경).",
    example: "예) 챕터 구분, 분위기/감성 컷",
  },
  "spec-table": {
    title: "스펙표 (자동)",
    body: "이 상품에 등록된 스펙(specValues)을 자동으로 표로 그립니다. 상품 정보가 바뀌면 별도 편집 없이 따라갑니다.",
    example: "예) 엔진톱의 출력/연료/중량, 가구의 사이즈/소재",
  },
  "ambient-video": {
    title: "분위기 영상",
    body: "GIF처럼 자동 재생되는 무한루프 영상. 컨트롤이 없고 음소거 상태로 계속 재생됩니다. 위에 헤드라인 카피를 얹을 수 있습니다.",
    example: "예) 제품 사용 30초 컷, 매장 분위기 영상",
  },
  table: {
    title: "표",
    body: "행/열을 직접 입력하는 일반 표. 가격표·호환 모델 리스트·비교표 등에 사용합니다.",
    example: "예) 모델별 사양 비교, 호환 부품 리스트",
  },
  chart: {
    title: "차트",
    body: "막대/선/원형 그래프. 데이터를 직접 입력합니다. 외부 채널 export 시 스크린샷으로만 변환됨에 유의.",
    example: "예) 연료 효율 비교, 주요 성분 비율, 사용 통계",
  },
};

export function makeEmptyBlock(type: BlockType, id: string): LandingBlock {
  switch (type) {
    case "hero":
      return {
        id,
        type: "hero",
        imageUrl: "",
        headline: "",
        subheadline: "",
        textAlign: "center",
        textColor: "light",
        height: "md",
      };
    case "image":
      return { id, type: "image", imageUrl: "", alt: "", caption: "", fullWidth: true };
    case "text":
      return { id, type: "text", heading: "", body: "", align: "left", background: "none" };
    case "video":
      return { id, type: "video", source: "youtube", value: "", caption: "", autoplay: false };
    case "gallery":
      return { id, type: "gallery", images: [], columns: 3 };
    case "scrolly-hero":
      return {
        id,
        type: "scrolly-hero",
        imageUrl: "",
        headline: "",
        subheadline: "",
        textColor: "light",
        height: "lg",
      };
    case "sticky-feature":
      return {
        id,
        type: "sticky-feature",
        heading: "",
        body: "",
        panels: [],
        textPosition: "left",
      };
    case "parallax":
      return {
        id,
        type: "parallax",
        imageUrl: "",
        headline: "",
        subheadline: "",
        textColor: "light",
        height: "lg",
      };
    case "spec-table":
      return { id, type: "spec-table", title: "상품 스펙" };
    case "ambient-video":
      return {
        id,
        type: "ambient-video",
        videoUrl: "",
        posterUrl: "",
        headline: "",
        subheadline: "",
        textColor: "light",
        height: "lg",
      };
    case "table":
      return {
        id,
        type: "table",
        caption: "",
        headers: ["항목", "내용"],
        rows: [["", ""]],
      };
    case "chart":
      return {
        id,
        type: "chart",
        chartType: "bar",
        title: "",
        data: [
          { label: "A", value: 0 },
          { label: "B", value: 0 },
        ],
      };
  }
}
