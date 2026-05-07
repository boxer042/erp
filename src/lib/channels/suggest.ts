/**
 * SKU 자동 매핑 추천 — 보류 큐 항목의 채널 SKU 와 ERP Product 의 유사도 매칭.
 *
 * Phase 1 의 단순 알고리즘:
 *  1. SKU 일치 (channel SKU 와 ERP Product.sku 가 같음) — 최고 점수
 *  2. SKU 부분 일치 (substring) — 높은 점수
 *  3. 채널 상품명 ↔ ERP 상품명 토큰 일치 (공백·하이픈 split, 소문자 정규화)
 *
 * 추천은 점수순 상위 N개. 사용자가 1클릭으로 매핑 등록.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

export interface MappingSuggestion {
  productId: string;
  productName: string;
  productSku: string;
  /** 0~100 점수 (높을수록 추천) */
  score: number;
  /** 사람이 읽을 매칭 사유 */
  reason: string;
}

interface ProductCandidate {
  id: string;
  name: string;
  sku: string;
  isCanonical: boolean;
}

const TOP_N = 5;
const MIN_SCORE = 20; // 너무 낮은 추천은 노이즈라 제외

/**
 * 한 채널 SKU 에 대한 ERP 상품 추천.
 * @param channelSku 매핑하려는 채널 SKU
 * @param channelProductName 채널이 보내준 상품명 (있으면 매칭에 활용)
 */
export async function suggestMappings(
  prisma: Tx,
  channelSku: string,
  channelProductName?: string,
): Promise<MappingSuggestion[]> {
  // 활성 + non-canonical 상품만 (canonical 은 변형 미확정으로 prepare 차단)
  const products = await prisma.product.findMany({
    where: { isActive: true, isCanonical: false },
    select: { id: true, name: true, sku: true, isCanonical: true },
    take: 5000, // 안전 상한
  });

  const skuLower = channelSku.toLowerCase();
  const nameTokens = channelProductName
    ? tokenize(channelProductName)
    : tokenize(channelSku);

  const scored: MappingSuggestion[] = products
    .map((p) => scoreProduct(p, skuLower, nameTokens))
    .filter((s): s is MappingSuggestion => s !== null && s.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, TOP_N);
}

function scoreProduct(
  product: ProductCandidate,
  channelSkuLower: string,
  channelNameTokens: string[],
): MappingSuggestion | null {
  const productSkuLower = product.sku.toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  // 1) SKU 정확 일치 — 거의 확실
  if (productSkuLower === channelSkuLower) {
    score += 80;
    reasons.push("SKU 일치");
  } else if (
    productSkuLower.includes(channelSkuLower) ||
    channelSkuLower.includes(productSkuLower)
  ) {
    // 부분 일치 — 길이 비례 점수
    const overlap = Math.min(productSkuLower.length, channelSkuLower.length);
    const total = Math.max(productSkuLower.length, channelSkuLower.length);
    const ratio = overlap / total;
    score += Math.round(50 * ratio);
    reasons.push("SKU 부분 일치");
  }

  // 2) 상품명 토큰 일치
  if (channelNameTokens.length > 0) {
    const productTokens = tokenize(product.name);
    const matched = channelNameTokens.filter((t) =>
      productTokens.some((pt) => pt === t || pt.includes(t) || t.includes(pt)),
    ).length;
    if (matched > 0) {
      const ratio = matched / channelNameTokens.length;
      score += Math.round(40 * ratio);
      reasons.push(`상품명 토큰 ${matched}개 일치`);
    }
  }

  if (score === 0) return null;
  return {
    productId: product.id,
    productName: product.name,
    productSku: product.sku,
    score: Math.min(100, score),
    reason: reasons.join(" · "),
  };
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[\s\-_/(),.]+/)
    .filter((t) => t.length >= 2); // 1글자 토큰은 노이즈
}
