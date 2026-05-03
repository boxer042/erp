import { z } from "zod";

export const heroBlockSchema = z.object({
  id: z.string(),
  type: z.literal("hero"),
  imageUrl: z.string().url().or(z.literal("")),
  eyebrow: z.string().default(""),
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
  /** @deprecated maxWidth 사용. true=full / false=md 로 자동 매핑됨 */
  fullWidth: z.boolean().default(true),
  /** 폭 — full(전체), lg(960), md(768), sm(560) */
  maxWidth: z.enum(["full", "lg", "md", "sm"]).default("full"),
  /** 라운드 코너 */
  rounded: z.enum(["none", "sm", "md", "lg", "xl", "full"]).default("none"),
  /** 그림자 */
  shadow: z.enum(["none", "sm", "md", "lg"]).default("none"),
  /** 상하 여백 */
  paddingY: z.enum(["none", "sm", "md", "lg"]).default("none"),
  /** 배경 — 이미지 주변 영역 색 */
  background: z.enum(["none", "muted", "dark"]).default("none"),
});

export const textBlockSchema = z.object({
  id: z.string(),
  type: z.literal("text"),
  /** 제목 위에 붙는 작은 강조 라벨 (예: "AT A GLANCE", "NEW"). 비워두면 안 표시 */
  eyebrow: z.string().default(""),
  heading: z.string().default(""),
  body: z.string().default(""),
  align: z.enum(["left", "center", "right"]).default("left"),
  background: z.enum(["none", "muted", "dark"]).default("none"),
  /** 제목 크기 — sm(소제목) / md(기본 섹션) / lg(큰 섹션) / xl(디스플레이) */
  headingSize: z.enum(["sm", "md", "lg", "xl"]).default("md"),
  /** 제목 굵기 */
  headingWeight: z.enum(["normal", "semibold", "bold"]).default("semibold"),
  /** 본문 크기 */
  bodySize: z.enum(["sm", "md", "lg"]).default("md"),
  /** 텍스트 색 — default(헤딩=fg/본문=muted) / muted(전체 muted) / brand(브랜드 컬러) */
  color: z.enum(["default", "muted", "brand"]).default("default"),
  /** 상하 패딩 */
  paddingY: z.enum(["sm", "md", "lg", "xl"]).default("lg"),
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
  rounded: z.enum(["none", "sm", "md", "lg", "xl", "full"]).default("md"),
  shadow: z.enum(["none", "sm", "md", "lg"]).default("none"),
  gap: z.enum(["none", "sm", "md", "lg"]).default("sm"),
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

// 스탯 그리드 — Apple 스타일의 "큰 숫자 + 단위 + 라벨" N컬럼 표시
export const statsGridBlockSchema = z.object({
  id: z.string(),
  type: z.literal("stats-grid"),
  eyebrow: z.string().default(""),
  heading: z.string().default(""),
  body: z.string().default(""),
  align: z.enum(["left", "center"]).default("left"),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).default(4),
  items: z
    .array(
      z.object({
        value: z.string().default(""),
        unit: z.string().default(""),
        label: z.string().default(""),
      }),
    )
    .default([]),
  dividers: z.boolean().default(true),
  background: z.enum(["none", "muted", "dark"]).default("muted"),
  paddingY: z.enum(["sm", "md", "lg", "xl"]).default("xl"),
  /** 켜면 상품의 specValues 를 자동으로 items 으로 사용 (수동 items 무시) */
  useProductSpecs: z.boolean().default(false),
});

// 강조 박스 (callout) — 좌측 컬러 세로 바 + 라벨 + 본문. 한국 쇼핑몰의 "주의" 박스 패턴
export const calloutBlockSchema = z.object({
  id: z.string(),
  type: z.literal("callout"),
  variant: z.enum(["warning", "info", "success", "danger", "neutral"]).default("warning"),
  /** preset 아이콘 이름 (LANDING_ICON_NAMES 중 하나). 없으면 null */
  icon: z.string().nullable().default(null),
  /** "주의", "TIP", "안내" 등 — 본문 앞에 굵게 표시 */
  label: z.string().default(""),
  /** 본문 — InlineMarkdown 지원 */
  body: z.string().default(""),
  paddingY: z.enum(["sm", "md", "lg"]).default("md"),
});

// 정보 그리드 (info-grid) — 한국 쇼핑몰 표준 footer 패턴
// "— 01 / 배송 안내" 헤더 + key-value <dl> + 추가 불릿 + 선택적 내부 notice
export const infoGridBlockSchema = z.object({
  id: z.string(),
  type: z.literal("info-grid"),
  background: z.enum(["none", "muted"]).default("muted"),
  paddingY: z.enum(["md", "lg", "xl"]).default("xl"),
  sections: z
    .array(
      z.object({
        number: z.string().default(""),
        title: z.string().default(""),
        icon: z.string().nullable().default(null),
        rows: z
          .array(
            z.object({
              key: z.string().default(""),
              value: z.string().default(""),
            }),
          )
          .default([]),
        bullets: z.array(z.string()).default([]),
        notice: z
          .object({
            variant: z.enum(["warning", "info", "success", "danger", "neutral"]),
            label: z.string(),
            body: z.string(),
          })
          .nullable()
          .default(null),
      }),
    )
    .default([]),
});

// 상품 메인 (PDP Hero) — 페이지 최상단 상품 요약 영역
// 좌측 이미지 갤러리 + 우측 상품명/브랜드/가격/CTA. Product 데이터 자동 매핑
export const productHeroBlockSchema = z.object({
  id: z.string(),
  type: z.literal("product-hero"),
  layout: z.enum(["image-left", "image-right", "image-top"]).default("image-left"),
  background: z.enum(["none", "muted"]).default("none"),
  paddingY: z.enum(["md", "lg", "xl"]).default("xl"),
  /** "GAS CHAINSAW · 가솔린 체인톱" 같은 작은 라벨 (자유 입력 — 비우면 카테고리·브랜드에서 자동 채움) */
  eyebrow: z.string().default(""),
  /** 상품명 아래 1~2줄 카피 (자유 입력) */
  subheadline: z.string().default(""),
  /** 가격 표시 on/off (B2B 비공개 케이스) */
  priceVisible: z.boolean().default(true),
  /** 가격을 VAT 포함 금액으로 표시 (taxable 상품만 적용). 기본 true — 소비자 노출용 판매가 */
  vatIncluded: z.boolean().default(true),
  /** 추가 CTA 버튼 (최대 2개 — 장바구니/구매하기와 별도. 예: "대리점 찾기", "견적 문의") */
  ctas: z
    .array(
      z.object({
        label: z.string().default(""),
        href: z.string().default(""),
        variant: z.enum(["primary", "outline"]).default("primary"),
      }),
    )
    .default([]),
  /** 할인이 있을 때 SALE 배지 자동 표시 (끄면 강제 숨김) */
  showSaleBadge: z.boolean().default(true),
  /** 이미지 갤러리 (메인 + 썸네일). 자동 = Product.imageUrl + media. 수동 override 가능 */
  imagesOverride: z
    .array(z.object({ url: z.string(), alt: z.string().default("") }))
    .default([]),
  /** 수량 선택기 표시 — 장바구니·구매하기 버튼이 활성일 때만 의미 있음 */
  quantityVisible: z.boolean().default(true),
  /** 장바구니 버튼 — 클릭 핸들러는 commerceContext 로 주입 (POS/자사몰 분기) */
  addToCart: z
    .object({
      visible: z.boolean().default(true),
      label: z.string().default("장바구니"),
    })
    .default({ visible: true, label: "장바구니" }),
  /** 바로 구매 버튼 — 클릭 핸들러는 commerceContext 로 주입 */
  buyNow: z
    .object({
      visible: z.boolean().default(true),
      label: z.string().default("바로 구매"),
    })
    .default({ visible: true, label: "바로 구매" }),
});

// 상품정보 고시 (전자상거래법 표시 의무) — Product 의 6개 의무 필드 + 선택적 ProductSpec 자동 매핑
// info-grid 1섹션 디자인 재사용
export const productInfoBlockSchema = z.object({
  id: z.string(),
  type: z.literal("product-info"),
  background: z.enum(["none", "muted"]).default("muted"),
  paddingY: z.enum(["md", "lg", "xl"]).default("xl"),
  number: z.string().default("— 04"),
  title: z.string().default("상품정보 고시"),
  /** 켜면 ProductSpec.values 를 "주요 사양" 행으로 자동 추가 */
  useProductSpecs: z.boolean().default(true),
  /** 자동 행 중 빼고 싶은 키 (예: "수입자" 자동 매핑이 필요 없으면) */
  excludeKeys: z.array(z.string()).default([]),
  /** 사용자가 자유롭게 추가하는 행 — 자동 행 뒤에 표시됨 */
  customRows: z
    .array(
      z.object({
        key: z.string().default(""),
        value: z.string().default(""),
      }),
    )
    .default([]),
});

// HTML 임베드 — 사용자가 직접 만든 .html 파일을 업로드해 sandboxed iframe 으로 표시
// htmlUrl 은 절대 URL(외부) 또는 "/api/..." 같은 상대 경로(우리 프록시) 모두 허용
export const htmlEmbedBlockSchema = z.object({
  id: z.string(),
  type: z.literal("html-embed"),
  htmlUrl: z.string(),
  heightPx: z.number().int().positive().default(600),
  displayMode: z.enum(["inline", "cover"]).default("inline"),
  allowForms: z.boolean().default(false),
  /** 자동 높이 — iframe 내부 콘텐츠 높이를 postMessage 로 받아 동적 조절. 끄면 heightPx 고정 */
  autoHeight: z.boolean().default(true),
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
  statsGridBlockSchema,
  calloutBlockSchema,
  infoGridBlockSchema,
  productHeroBlockSchema,
  productInfoBlockSchema,
  htmlEmbedBlockSchema,
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
export type StatsGridBlock = z.infer<typeof statsGridBlockSchema>;
export type CalloutBlock = z.infer<typeof calloutBlockSchema>;
export type InfoGridBlock = z.infer<typeof infoGridBlockSchema>;
export type ProductHeroBlock = z.infer<typeof productHeroBlockSchema>;
export type ProductInfoBlock = z.infer<typeof productInfoBlockSchema>;
export type HtmlEmbedBlock = z.infer<typeof htmlEmbedBlockSchema>;
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
  "stats-grid": "스탯 그리드",
  callout: "강조 박스",
  "info-grid": "정보 그리드",
  "product-hero": "상품 메인",
  "product-info": "상품정보 고시",
  "html-embed": "HTML 임베드",
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
  "stats-grid": {
    title: "스탯 그리드",
    body: "큰 숫자 + 단위 + 라벨 형태로 핵심 사양을 N컬럼으로 표시. Apple 제품 페이지 \"AT A GLANCE\" 섹션 같은 디자인.",
    example: "예) 배기량/출력/마력/가이드바 같은 핵심 스펙 한눈에",
  },
  callout: {
    title: "강조 박스",
    body: "좌측 컬러 세로 바 + 라벨 + 본문 형태의 주의/안내 박스. variant 로 색상(주황 경고 / 녹색 안내 / 빨강 위험 등) 선택.",
    example: "예) \"주의 — 재고 상황에 따라 배송이 지연될 수 있습니다\"",
  },
  "info-grid": {
    title: "정보 그리드",
    body: "한국 쇼핑몰 표준 footer 디자인. 좌측 \"— 01 배송 안내\" 헤더 + 우측 키-값 표 + 추가 불릿 + 선택적 내부 notice. N개 섹션을 세로 스택으로.",
    example: "예) 배송 / 교환·반품 / A/S / 사업자 정보 4섹션 한 번에",
  },
  "product-hero": {
    title: "상품 메인 (PDP Hero)",
    body: "상품 페이지 최상단 요약 영역. 이미지/상품명/브랜드/가격은 Product 데이터 자동 매핑. subheadline·CTA만 상품별로 입력하면 됩니다. 신규 상품 생성 시 자동 추가됨.",
    example: "예) STIHL/쿠팡 같은 PDP 첫 화면 — 보통 페이지 첫 블록으로 사용",
  },
  "product-info": {
    title: "상품정보 고시 (자동)",
    body: "전자상거래법 표시 의무 — 품명/모델명/제조국/제조자/인증·허가/품질보증기준/A/S 등을 Product 데이터에서 자동으로 매핑. 상품 정보 변경 시 자동 반영. 주요 사양은 등록된 Spec 자동 사용 (토글).",
    example: "예) 모든 판매 상품에 의무 표시 — 한 번 추가하면 끝",
  },
  "html-embed": {
    title: "HTML 임베드",
    body: "직접 만든 .html 파일을 업로드해 sandboxed iframe 으로 표시. 본인이 작성한 CSS 애니메이션·커스텀 레이아웃을 그대로 넣을 수 있습니다. 보안상 부모 페이지의 쿠키/세션엔 접근 못 함.",
    example: "예) 1회성 커스텀 디자인 섹션, CSS 모션 위젯, 인터랙티브 데모",
  },
};

export function makeEmptyBlock(type: BlockType, id: string): LandingBlock {
  switch (type) {
    case "hero":
      return {
        id,
        type: "hero",
        imageUrl: "",
        eyebrow: "",
        headline: "",
        subheadline: "",
        textAlign: "center",
        textColor: "light",
        height: "md",
      };
    case "image":
      return {
        id,
        type: "image",
        imageUrl: "",
        alt: "",
        caption: "",
        fullWidth: true,
        maxWidth: "full",
        rounded: "none",
        shadow: "none",
        paddingY: "none",
        background: "none",
      };
    case "text":
      return {
        id,
        type: "text",
        eyebrow: "",
        heading: "",
        body: "",
        align: "left",
        background: "none",
        headingSize: "md",
        headingWeight: "semibold",
        bodySize: "md",
        color: "default",
        paddingY: "lg",
      };
    case "video":
      return { id, type: "video", source: "youtube", value: "", caption: "", autoplay: false };
    case "gallery":
      return {
        id,
        type: "gallery",
        images: [],
        columns: 3,
        rounded: "md",
        shadow: "none",
        gap: "sm",
      };
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
    case "stats-grid":
      return {
        id,
        type: "stats-grid",
        eyebrow: "AT A GLANCE",
        heading: "한눈에 보는\n핵심 사양.",
        body: "",
        align: "left",
        columns: 4,
        items: [
          { value: "", unit: "", label: "" },
          { value: "", unit: "", label: "" },
          { value: "", unit: "", label: "" },
          { value: "", unit: "", label: "" },
        ],
        dividers: true,
        background: "muted",
        paddingY: "xl",
        useProductSpecs: false,
      };
    case "callout":
      return {
        id,
        type: "callout",
        variant: "warning",
        icon: "AlertTriangle",
        label: "주의",
        body: "",
        paddingY: "md",
      };
    case "info-grid":
      return {
        id,
        type: "info-grid",
        background: "muted",
        paddingY: "xl",
        sections: [
          {
            number: "— 01",
            title: "배송 안내",
            icon: "Truck",
            rows: [
              { key: "배송 방법", value: "" },
              { key: "배송 지역", value: "" },
              { key: "배송 비용", value: "" },
            ],
            bullets: [],
            notice: null,
          },
        ],
      };
    case "product-hero":
      return {
        id,
        type: "product-hero",
        layout: "image-left",
        background: "none",
        paddingY: "xl",
        eyebrow: "",
        subheadline: "",
        priceVisible: true,
        vatIncluded: true,
        ctas: [],
        showSaleBadge: true,
        imagesOverride: [],
        quantityVisible: true,
        addToCart: { visible: true, label: "장바구니" },
        buyNow: { visible: true, label: "바로 구매" },
      };
    case "product-info":
      return {
        id,
        type: "product-info",
        background: "muted",
        paddingY: "xl",
        number: "— 04",
        title: "상품정보 고시",
        useProductSpecs: true,
        excludeKeys: [],
        customRows: [],
      };
    case "html-embed":
      return {
        id,
        type: "html-embed",
        htmlUrl: "",
        heightPx: 600,
        displayMode: "inline",
        allowForms: false,
        autoHeight: true,
      };
  }
}
