import { makeEmptyBlock, type LandingBlock } from "@/lib/validators/landing-block";

/**
 * 모든 상품 페이지에 product-hero 블록이 항상 첫 번째로 존재하도록 보장.
 *
 * 적용 케이스:
 * - 저장된 blocks 가 비어있음 → product-hero 1개를 prepend
 * - product-hero 가 있지만 0번이 아님 → 0번으로 이동
 * - 이미 0번에 있음 → no-op
 *
 * 서버 측 read 시점 (preview / export / 편집기 GET) 에서 호출하면
 * 사용자가 별도 저장을 하지 않아도 product-hero 가 노출됨.
 */
export function ensureProductHeroFirst(blocks: LandingBlock[]): LandingBlock[] {
  const heroIdx = blocks.findIndex((b) => b.type === "product-hero");

  if (heroIdx === -1) {
    // 없음 → 가상 ID 로 prepend (저장되지 않은 default — 편집기에서 저장 시 실제 ID 부여)
    return [makeEmptyBlock("product-hero", "__default-hero__"), ...blocks];
  }

  if (heroIdx !== 0) {
    return [blocks[heroIdx], ...blocks.slice(0, heroIdx), ...blocks.slice(heroIdx + 1)];
  }

  return blocks;
}
