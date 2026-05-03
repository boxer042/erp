/**
 * 상품 상세페이지 예시 데이터 삽입.
 *
 * 사용법:
 *   npx tsx scripts/seed-example-landing.ts            # 첫 활성 상품에 적용
 *   npx tsx scripts/seed-example-landing.ts <SKU>      # 특정 SKU 의 상품에 적용
 *   npx tsx scripts/seed-example-landing.ts --footer   # 공통 footer 도 함께 시드
 *
 * 외부 이미지: picsum.photos (랜덤이지만 seed 로 고정), placehold.co (테스트용)
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DIRECT_URL 또는 DATABASE_URL 환경변수가 필요합니다 (.env.local)");
  process.exit(1);
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// 결정적 picsum 이미지 (seed 로 고정 → 매번 같은 이미지)
const img = (seed: string, w = 1600, h = 900) =>
  `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;

const exampleBlocks = [
  // 1) 스크롤 히어로 — 페이지 진입 시 등장 애니메이션
  {
    id: "ex-hero",
    type: "scrolly-hero",
    imageUrl: img("erp-hero", 2000, 1200),
    headline: "장인의 손길로 완성된 한 잔",
    subheadline: "60년 전통의 핸드드립 머신, 다시 새롭게.",
    textColor: "light",
    height: "lg",
  },

  // 2) 텍스트 — 인트로 단락
  {
    id: "ex-intro",
    type: "text",
    heading: "왜 이 제품인가요?",
    body:
      "30년간 같은 자리에서 커피를 내려온 장인이 직접 설계했습니다.\n매 잔마다 일정한 추출 압력, 흔들리지 않는 온도, 그리고 단순한 조작.\n오늘부터 집에서도 매장의 그 한 잔을 내려보세요.",
    align: "center",
    background: "muted",
  },

  // 3) 스티키 피처 — 좌측 텍스트 sticky + 우측 이미지 패널 스크롤
  {
    id: "ex-sticky",
    type: "sticky-feature",
    heading: "세 가지 핵심 기능",
    body:
      "사용자가 가장 많이 묻는 세 가지를 한 화면에 담았습니다. 우측 이미지를 천천히 스크롤하며 확인해 보세요.",
    panels: [
      { imageUrl: img("erp-feature-1"), alt: "정밀 온도 제어" },
      { imageUrl: img("erp-feature-2"), alt: "원터치 추출" },
      { imageUrl: img("erp-feature-3"), alt: "자동 세척 모드" },
    ],
    textPosition: "left",
  },

  // 4) 패럴럭스 — 분위기 컷
  {
    id: "ex-parallax",
    type: "parallax",
    imageUrl: img("erp-parallax", 2000, 1100),
    headline: "느린 아침을 위해",
    subheadline: "조금 더 깊은 향, 조금 더 진한 시간.",
    textColor: "light",
    height: "md",
  },

  // 5) 갤러리 — 컬러/사용 예시
  {
    id: "ex-gallery",
    type: "gallery",
    images: [
      { url: img("erp-color-1", 800, 800), alt: "스페이스 그레이" },
      { url: img("erp-color-2", 800, 800), alt: "베이지" },
      { url: img("erp-color-3", 800, 800), alt: "화이트" },
      { url: img("erp-color-4", 800, 800), alt: "올리브" },
      { url: img("erp-color-5", 800, 800), alt: "네이비" },
      { url: img("erp-color-6", 800, 800), alt: "테라코타" },
    ],
    columns: 3,
  },

  // 6) 일반 히어로 (작은 사이즈) — 챕터 구분
  {
    id: "ex-hero-2",
    type: "hero",
    imageUrl: img("erp-chapter", 2000, 800),
    headline: "디테일이 다릅니다",
    subheadline: "겉모습이 아닌, 매일 만지는 손끝의 무게.",
    textAlign: "left",
    textColor: "light",
    height: "sm",
  },

  // 7) 단일 이미지 — 좁게
  {
    id: "ex-image",
    type: "image",
    imageUrl: img("erp-detail", 1600, 1000),
    alt: "본체 측면 디테일",
    caption: "측면 알루미늄 다이얼은 0.05℃ 단위로 정밀 조정됩니다.",
    fullWidth: false,
  },

  // 8) 텍스트 — 사용 안내
  {
    id: "ex-text-2",
    type: "text",
    heading: "사용은 단순하게",
    body:
      "1. 원두를 넣고 다이얼을 돌립니다.\n2. 추출 버튼 한 번을 누릅니다.\n3. 잔을 들어 향을 맡습니다.\n\n그게 전부입니다.",
    align: "left",
    background: "none",
  },

  // 9) 비디오 — 시연 (예시 YouTube ID)
  {
    id: "ex-video",
    type: "video",
    source: "youtube",
    value: "dQw4w9WgXcQ", // 예시 YouTube ID — 실제 사용 시 교체
    caption: "30초 시연 영상 (예시 ID — 실제 영상으로 교체하세요)",
    autoplay: false,
  },

  // 10) 분위기 영상 (mp4 autoplay loop) — Big Buck Bunny 공개 mp4
  {
    id: "ex-ambient",
    type: "ambient-video",
    videoUrl:
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    posterUrl: img("erp-ambient-poster", 2000, 1000),
    headline: "움직이는 한 컷",
    subheadline: "GIF 처럼 자동 재생되는 분위기 영상",
    textColor: "light",
    height: "md",
  },

  // 11) 스펙표 (자동) — 등록된 specValues 가 있으면 표시됨
  {
    id: "ex-spec",
    type: "spec-table",
    title: "기술 사양",
  },

  // 12) 표 — 직접 입력
  {
    id: "ex-table",
    type: "table",
    caption: "모델별 호환 부품",
    headers: ["부품", "표준형 (S)", "프로형 (Pro)", "리미티드 (LX)"],
    rows: [
      ["체인", "CH-300", "CH-450", "CH-450 Gold"],
      ["가이드바", "16인치", "18인치", "20인치"],
      ["연료 탱크", "0.55L", "0.55L", "0.70L"],
      ["엔진 출력", "2.4kW", "3.5kW", "4.2kW"],
    ],
  },

  // 13) 차트 — 막대 그래프
  {
    id: "ex-chart",
    type: "chart",
    chartType: "bar",
    title: "모델별 출력 비교 (kW)",
    data: [
      { label: "표준 S", value: 2.4 },
      { label: "프로", value: 3.5 },
      { label: "리미티드 LX", value: 4.2 },
      { label: "경쟁사 평균", value: 3.0 },
    ],
  },

  // 14) 스탯 그리드 — Apple 스타일 핵심 사양
  {
    id: "ex-stats",
    type: "stats-grid",
    eyebrow: "AT A GLANCE",
    heading: "한눈에 보는\n핵심 사양.",
    body: "",
    align: "left",
    columns: 4,
    items: [
      { value: "35.8", unit: "cm³", label: "배기량" },
      { value: "1.60", unit: "kW", label: "출력" },
      { value: "2.20", unit: "hp", label: "엔진 마력" },
      { value: "14", unit: "in", label: "가이드바" },
    ],
    dividers: true,
    background: "muted",
    paddingY: "xl",
  },
] as const;

const exampleFooter = [
  {
    id: "fo-shipping",
    type: "text",
    heading: "배송 안내",
    body:
      "오후 2시 이전 결제 시 당일 발송됩니다. (주말·공휴일 제외)\n도서산간 지역은 추가 1~2일 소요될 수 있습니다.\n제주 및 도서산간 지역은 별도 배송비 4,000원이 부과됩니다.",
    align: "left",
    background: "muted",
  },
  {
    id: "fo-refund",
    type: "text",
    heading: "교환·환불 안내",
    body:
      "단순 변심에 의한 교환·환불은 제품 수령 후 7일 이내, 미사용·재판매 가능 상태로 가능합니다.\n불량/오배송은 14일 이내 교환·환불을 받으실 수 있으며 왕복 배송비는 부담하지 않습니다.\n사용감이 있는 제품, 개봉 후 위생상 재판매 불가능한 제품은 교환·환불이 제한됩니다.",
    align: "left",
    background: "none",
  },
  {
    id: "fo-as",
    type: "text",
    heading: "A/S 안내",
    body:
      "구매일로부터 1년간 무상 A/S를 제공합니다. (소모품·외관 손상 제외)\n무상 기간 이후에는 부품·공임 별도 청구되며, 사전 견적 안내 후 진행합니다.\nA/S 접수: 02-0000-0000 / support@example.com",
    align: "left",
    background: "muted",
  },
  {
    id: "fo-info",
    type: "text",
    heading: "사업자 정보",
    body:
      "상호 (주)예시컴퍼니 · 대표 홍길동\n사업자등록번호 000-00-00000 · 통신판매업신고 제2026-서울-0000호\n주소 서울특별시 강남구 테헤란로 000\n고객센터 02-0000-0000 (평일 09:00 ~ 18:00)",
    align: "left",
    background: "none",
  },
] as const;

async function run() {
  const args = process.argv.slice(2);
  const wantFooter = args.includes("--footer");
  const skuArg = args.find((a) => !a.startsWith("--"));

  // 1) 상품 선택
  let product;
  if (skuArg) {
    product = await prisma.product.findUnique({
      where: { sku: skuArg },
      select: { id: true, name: true, sku: true },
    });
    if (!product) {
      console.error(`❌ SKU "${skuArg}" 인 상품을 찾을 수 없습니다`);
      process.exit(1);
    }
  } else {
    product = await prisma.product.findFirst({
      where: { isActive: true, canonicalProductId: null, isBulk: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, sku: true },
    });
    if (!product) {
      console.error("❌ 활성 상품이 없습니다. SKU 인자를 직접 넘겨주세요.");
      process.exit(1);
    }
  }

  // 2) landingBlocks 업데이트
  await prisma.product.update({
    where: { id: product.id },
    data: { landingBlocks: exampleBlocks as unknown as object },
  });
  console.log(`✅ 상품 [${product.sku}] ${product.name} 의 landingBlocks 시드 완료 (${exampleBlocks.length}개 블록)`);

  // 3) (옵션) 공통 footer 시드
  if (wantFooter) {
    await prisma.landingSettings.upsert({
      where: { id: "singleton" },
      update: { footerBlocks: exampleFooter as unknown as object },
      create: { id: "singleton", footerBlocks: exampleFooter as unknown as object },
    });
    console.log(`✅ 공통 footer 시드 완료 (${exampleFooter.length}개 블록)`);
  }

  console.log("\n🌐 미리보기 URL:");
  console.log(`   http://localhost:3000/products/${product.id}/landing/preview`);
  console.log("\n✏️  편집 페이지:");
  console.log(`   http://localhost:3000/products/${product.id}/landing`);
  if (!wantFooter) {
    console.log("\n💡 공통 footer 도 함께 시드하려면:");
    console.log("   npx tsx scripts/seed-example-landing.ts --footer");
  }
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
