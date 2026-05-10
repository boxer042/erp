/**
 * "테스트 가습기-화이트" (SKU SEED-P001) 의 landingBlocks 에
 * 존재하는 모든 블록 타입(18종) 을 한 페이지에 모두 시드.
 *
 * 디자인 가다듬기 목적의 종합 데모 페이지.
 *
 * 사용법:
 *   npx tsx scripts/seed-all-blocks-humidifier.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const cs = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!cs) {
  console.error("❌ DIRECT_URL 또는 DATABASE_URL 환경변수가 필요합니다");
  process.exit(1);
}
const adapter = new PrismaPg({ connectionString: cs });
const prisma = new PrismaClient({ adapter });

const TARGET_SKU = "SEED-P001"; // 테스트 가습기-화이트

// 결정적 picsum (seed 고정 → 매번 같은 이미지)
const img = (seed: string, w = 1600, h = 900) =>
  `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;

const blocks = [
  // ─────────────────────────────────────
  // 0) 상품 메인 (필수 — 항상 첫 블록)
  // ─────────────────────────────────────
  {
    id: "b-product-hero",
    type: "product-hero",
    layout: "image-left",
    background: "none",
    paddingY: "xl",
    eyebrow: "", // 비우면 카테고리·브랜드 자동
    subheadline:
      "조용히 켜두면 거실 공기가 다르게 느껴집니다.\n매일 쓰는 사람을 위한, 가장 단순한 가습기.",
    priceVisible: true,
    vatIncluded: true,
    showSaleBadge: true,
    quantityVisible: true,
    addToCart: { visible: true, label: "장바구니" },
    buyNow: { visible: true, label: "바로 구매" },
    imagesOverride: [], // Product.imageUrl + media 자동
    ctas: [],
  },

  // ─────────────────────────────────────
  // 1) Scrolly Hero — 상단 비주얼 임팩트
  // ─────────────────────────────────────
  {
    id: "b-scrolly-hero",
    type: "scrolly-hero",
    imageUrl: img("humidifier-scrolly", 2000, 1100),
    headline: "공기가 부드러워지는 순간",
    subheadline: "초음파 미세 분무로 거실 한 칸을 30분이면 채웁니다.",
    textColor: "light",
    height: "lg",
  },

  // ─────────────────────────────────────
  // 2) Text — 인트로 단락
  // ─────────────────────────────────────
  {
    id: "b-text-intro",
    type: "text",
    eyebrow: "OUR APPROACH",
    heading: "왜 우리는 이 가습기를 만들었나",
    body:
      "겨울이 길어진 도시. 난방이 켜지면 코가 마르고 목이 칼칼합니다.\n시중 가습기 대부분이 시끄럽거나, 청소가 번거롭거나, 디자인이 거실과 어울리지 않았습니다.\n우리는 세 가지 모두를 동시에 해결하고 싶었고, 18개월의 설계 끝에 이 작은 흰색 원통이 완성됐습니다.",
    align: "left",
    background: "none",
    headingSize: "lg",
    headingWeight: "bold",
    bodySize: "md",
    color: "default",
    paddingY: "lg",
  },

  // ─────────────────────────────────────
  // 3) Sticky Feature — 좌측 sticky + 우측 패널
  // ─────────────────────────────────────
  {
    id: "b-sticky",
    type: "sticky-feature",
    heading: "세 가지 핵심 약속",
    body:
      "조용함, 편한 청소, 거실에 어울리는 디자인. 이 셋이 이 제품의 전부입니다. 우측 패널을 천천히 스크롤하며 직접 확인해 보세요.",
    panels: [
      { imageUrl: img("humidifier-feat-1", 1200, 1200), alt: "20dB — 도서관보다 조용" },
      { imageUrl: img("humidifier-feat-2", 1200, 1200), alt: "분리 세척 가능한 모듈 구조" },
      { imageUrl: img("humidifier-feat-3", 1200, 1200), alt: "어디에도 어울리는 화이트 매트 표면" },
    ],
    textPosition: "left",
  },

  // ─────────────────────────────────────
  // 4) Image — 단일 디테일 컷
  // ─────────────────────────────────────
  {
    id: "b-image-detail",
    type: "image",
    imageUrl: img("humidifier-detail", 1600, 1000),
    alt: "본체 상단 다이얼 디테일",
    caption: "상단 알루미늄 다이얼 — 분무량을 무단계로 조정할 수 있습니다",
    fullWidth: false,
    maxWidth: "lg",
    rounded: "lg",
    shadow: "md",
    paddingY: "lg",
    background: "muted",
  },

  // ─────────────────────────────────────
  // 5) Stats Grid — 핵심 사양 한눈에
  // ─────────────────────────────────────
  {
    id: "b-stats",
    type: "stats-grid",
    eyebrow: "AT A GLANCE",
    heading: "한눈에 보는\n핵심 사양",
    body: "",
    align: "left",
    columns: 4,
    items: [
      { value: "20", unit: "dB", label: "운전 소음" },
      { value: "4.5", unit: "L", label: "탱크 용량" },
      { value: "30", unit: "h", label: "최대 사용 시간" },
      { value: "350", unit: "mL/h", label: "최대 분무량" },
    ],
    dividers: true,
    background: "muted",
    paddingY: "xl",
    useProductSpecs: false,
  },

  // ─────────────────────────────────────
  // 6) Parallax — 무드 전환
  // ─────────────────────────────────────
  {
    id: "b-parallax",
    type: "parallax",
    imageUrl: img("humidifier-mood", 2000, 1100),
    headline: "조용한 아침을 위해",
    subheadline: "켜져 있는지 잊을 만큼 조용합니다.",
    textColor: "light",
    height: "md",
  },

  // ─────────────────────────────────────
  // 7) Hero — 챕터 구분 (작은 사이즈)
  // ─────────────────────────────────────
  {
    id: "b-hero-chapter",
    type: "hero",
    imageUrl: img("humidifier-chapter", 2000, 700),
    eyebrow: "CHAPTER 02",
    headline: "디테일이 다릅니다",
    subheadline: "겉모습이 아닌, 매일 만지는 손끝의 무게.",
    textAlign: "left",
    textColor: "light",
    height: "sm",
  },

  // ─────────────────────────────────────
  // 8) Gallery — 컬러/사용 예시
  // ─────────────────────────────────────
  {
    id: "b-gallery",
    type: "gallery",
    images: [
      { url: img("humidifier-life-1", 800, 800), alt: "거실 사이드 테이블" },
      { url: img("humidifier-life-2", 800, 800), alt: "침실 협탁" },
      { url: img("humidifier-life-3", 800, 800), alt: "사무실 책상" },
      { url: img("humidifier-life-4", 800, 800), alt: "주방 카운터" },
      { url: img("humidifier-life-5", 800, 800), alt: "베이비룸" },
      { url: img("humidifier-life-6", 800, 800), alt: "화장실 옆" },
    ],
    columns: 3,
    rounded: "lg",
    shadow: "sm",
    gap: "md",
  },

  // ─────────────────────────────────────
  // 9) Video — YouTube 시연
  // ─────────────────────────────────────
  {
    id: "b-video",
    type: "video",
    source: "youtube",
    value: "dQw4w9WgXcQ", // 데모용 (실제 영상으로 교체)
    caption: "30초 시연 영상 — 분리 세척 부터 분무까지",
    autoplay: false,
  },

  // ─────────────────────────────────────
  // 10) Ambient Video — autoplay loop 무드 비디오
  // ─────────────────────────────────────
  {
    id: "b-ambient",
    type: "ambient-video",
    videoUrl:
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    posterUrl: img("humidifier-ambient-poster", 2000, 1000),
    headline: "잔잔하게 흐르는 한 컷",
    subheadline: "GIF 처럼 자동으로 재생되는 분위기 영상",
    textColor: "light",
    height: "md",
  },

  // ─────────────────────────────────────
  // 11) Spec Table — 자동 매핑 (specValues 있으면 표시)
  // ─────────────────────────────────────
  {
    id: "b-spec",
    type: "spec-table",
    title: "기술 사양",
  },

  // ─────────────────────────────────────
  // 12) Table — 직접 입력
  // ─────────────────────────────────────
  {
    id: "b-table",
    type: "table",
    caption: "라인업 비교",
    headers: ["", "베이직 (B)", "스탠다드 (S)", "프로 (Pro)"],
    rows: [
      ["탱크", "3.0L", "4.5L", "6.0L"],
      ["최대 분무량", "250mL/h", "350mL/h", "500mL/h"],
      ["사용 시간", "20h", "30h", "40h"],
      ["UV 살균", "—", "기본", "기본+이중"],
      ["가격", "₩39,000", "₩59,000", "₩89,000"],
    ],
  },

  // ─────────────────────────────────────
  // 13) Chart — recharts
  // ─────────────────────────────────────
  {
    id: "b-chart",
    type: "chart",
    chartType: "bar",
    title: "운전 소음 비교 (dB) — 낮을수록 조용",
    data: [
      { label: "우리 가습기", value: 20 },
      { label: "경쟁사 A", value: 32 },
      { label: "경쟁사 B", value: 38 },
      { label: "냉장고", value: 40 },
      { label: "도서관 평균", value: 30 },
    ],
  },

  // ─────────────────────────────────────
  // 14) Callout (warning) — 강조 박스
  // ─────────────────────────────────────
  {
    id: "b-callout-1",
    type: "callout",
    variant: "warning",
    icon: null,
    label: "사용 시 주의",
    body:
      "수돗물이 아닌 **정수된 물**을 사용해 주세요. 미네랄 성분이 백탁 현상을 일으킬 수 있습니다.",
    paddingY: "md",
  },

  // ─────────────────────────────────────
  // 15) Callout (info) — 강조 박스 두 번째 variant
  // ─────────────────────────────────────
  {
    id: "b-callout-2",
    type: "callout",
    variant: "success",
    icon: null,
    label: "TIP",
    body:
      "주 1회 식초·물 1:9 비율로 헹구면 노즐 성능을 더 오래 유지할 수 있습니다.",
    paddingY: "md",
  },

  // ─────────────────────────────────────
  // 16) Text — 마무리 카피
  // ─────────────────────────────────────
  {
    id: "b-text-outro",
    type: "text",
    eyebrow: "WHY US",
    heading: "오래 쓰셔도 후회 없게",
    body:
      "1년 무상 A/S 와 5년 부품 보증을 약속합니다.\n포장에서 꺼내는 순간부터 마지막 청소까지, 사용자가 신경 쓸 일을 줄였습니다.",
    align: "center",
    background: "muted",
    headingSize: "md",
    headingWeight: "semibold",
    bodySize: "md",
    color: "default",
    paddingY: "lg",
  },

  // ─────────────────────────────────────
  // 17) HTML Embed — 데모 (실제 .html 파일 업로드 전 placeholder)
  // ─────────────────────────────────────
  {
    id: "b-html",
    type: "html-embed",
    htmlUrl: "https://example.com/empty.html",
    heightPx: 200,
    displayMode: "inline",
    autoHeight: false,
    allowForms: false,
  },

  // ─────────────────────────────────────
  // 18) Info Grid — 한국 쇼핑몰 표준 footer 4 섹션
  // ─────────────────────────────────────
  {
    id: "b-info-grid",
    type: "info-grid",
    background: "muted",
    paddingY: "xl",
    sections: [
      {
        number: "— 01",
        title: "배송 안내",
        icon: null,
        rows: [
          { key: "배송 방법", value: "택배 배송 (CJ 대한통운)" },
          { key: "배송비", value: "3,000원 (5만원 이상 무료)" },
          { key: "발송", value: "오후 2시 이전 결제 시 **당일 발송**" },
          { key: "도서산간", value: "추가 1~2일 소요 / 별도 배송비 4,000원" },
        ],
        bullets: [
          "주말·공휴일은 익영업일 발송됩니다.",
          "재고 부족 시 개별 안내 후 일정 조정이 가능합니다.",
        ],
        notice: null,
      },
      {
        number: "— 02",
        title: "교환·환불 안내",
        icon: null,
        rows: [
          { key: "단순 변심", value: "수령 후 **7일 이내** · 미사용 / 재판매 가능 상태" },
          { key: "불량/오배송", value: "수령 후 **14일 이내** · 왕복 배송비 면제" },
          { key: "왕복 배송비", value: "단순 변심 6,000원 / 도서산간 +4,000원" },
        ],
        bullets: [],
        notice: {
          variant: "warning",
          label: "교환·환불 제한",
          body:
            "사용감이 있는 제품, 개봉 후 위생상 재판매 불가능한 제품은 교환·환불이 제한됩니다.",
        },
      },
      {
        number: "— 03",
        title: "A/S 안내",
        icon: null,
        rows: [
          { key: "무상 보증", value: "구매일로부터 **1년**" },
          { key: "유상 부품", value: "보증 종료 후 부품 + 공임 별도" },
          { key: "접수", value: "02-0000-0000 / support@example.com" },
        ],
        bullets: [
          "외관 손상·사용자 과실에 의한 파손은 무상 대상에서 제외됩니다.",
          "사전 견적 안내 후 진행되므로 부담 없이 접수해 주세요.",
        ],
        notice: {
          variant: "info",
          label: "무상 A/S",
          body:
            "필터·노즐 등 핵심 부품은 보증 기간 내 무상 교체됩니다.",
        },
      },
      {
        number: "— 04",
        title: "사업자 정보",
        icon: null,
        rows: [
          { key: "상호", value: "(주)예시컴퍼니" },
          { key: "대표", value: "홍길동" },
          { key: "사업자등록번호", value: "000-00-00000" },
          { key: "주소", value: "서울특별시 강남구 테헤란로 000" },
        ],
        bullets: [
          "통신판매업신고 제2026-서울-0000호",
          "고객센터 02-0000-0000 (평일 09:00 ~ 18:00)",
        ],
        notice: null,
      },
    ],
  },

  // ─────────────────────────────────────
  // 19) Product Info — 상품정보 고시 (전자상거래법)
  // ─────────────────────────────────────
  {
    id: "b-product-info",
    type: "product-info",
    background: "muted",
    paddingY: "xl",
    number: "— 05",
    title: "상품정보 고시",
    useProductSpecs: true,
    excludeKeys: [],
    customRows: [
      { key: "품질보증기준", value: "1년 무상 A/S" },
      { key: "A/S 책임자", value: "(주)예시컴퍼니 고객센터 02-0000-0000" },
    ],
  },
] as const;

async function run() {
  const product = await prisma.product.findUnique({
    where: { sku: TARGET_SKU },
    select: { id: true, name: true, sku: true },
  });
  if (!product) {
    console.error(`❌ SKU "${TARGET_SKU}" 인 상품을 찾을 수 없습니다`);
    process.exit(1);
  }

  await prisma.product.update({
    where: { id: product.id },
    data: { landingBlocks: blocks as unknown as object },
  });

  console.log(
    `✅ [${product.sku}] ${product.name} 의 landingBlocks 시드 완료 (${blocks.length}개 블록)`,
  );
  console.log("\n블록 종류:");
  for (const b of blocks) console.log(`  · ${b.type.padEnd(16)} — ${b.id}`);

  console.log("\n🌐 미리보기:");
  console.log(`   http://localhost:3000/products/${product.id}/landing/preview`);
  console.log("\n✏️  편집:");
  console.log(`   http://localhost:3000/products/${product.id}/landing`);
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
