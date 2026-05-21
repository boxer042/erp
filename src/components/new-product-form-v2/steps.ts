import type { ProductType } from "../new-product-form/types";

/**
 * 상품 등록 마법사 스텝 정의.
 * productType 에 따라 필요한 스텝만 동적으로 구성된다.
 */
export type StepId =
  | "type" // 상품 유형 선택
  | "basic" // 기본 정보 (이름·SKU·브랜드·카테고리·세금 등)
  | "supplier" // 거래처 연결 (완제품·부속)
  | "components" // 구성 상품 (세트·조립)
  | "parents" // 상위 상품 연결 (부속)
  | "options" // 옵션 구성 (옵션 대표)
  | "pricing" // 가격·비용
  | "channels" // 채널별 가격
  | "review"; // 확인·요약

export const STEP_LABEL: Record<StepId, string> = {
  type: "유형 선택",
  basic: "기본 정보",
  supplier: "거래처 연결",
  components: "구성 상품",
  parents: "상위 상품",
  options: "옵션 구성",
  pricing: "가격·비용",
  channels: "채널 가격",
  review: "확인",
};

/**
 * 상품 유형 + 채널 보유 여부에 따라 스텝 흐름을 만든다.
 * - OPTION_PARENT: 자체 가격·재고가 없어 가격/채널 스텝 제외, 옵션 구성 대신 들어감
 * - FINISHED/PARTS: 거래처상품을 먼저 골라 기본 정보를 자동 채우기 — supplier → basic 순서
 * - SET/ASSEMBLED: 거래처 스텝이 없어 basic 먼저
 * - 채널이 없으면 channels 스텝 생략
 */
export function buildSteps(
  productType: ProductType,
  hasChannels: boolean,
): StepId[] {
  if (productType === "OPTION_PARENT") {
    return ["type", "basic", "options", "review"];
  }

  if (productType === "FINISHED" || productType === "PARTS") {
    const steps: StepId[] = ["type", "supplier", "basic"];
    if (productType === "PARTS") steps.push("parents");
    steps.push("pricing");
    if (hasChannels) steps.push("channels");
    steps.push("review");
    return steps;
  }

  // SET / ASSEMBLED
  const steps: StepId[] = ["type", "basic", "components", "pricing"];
  if (hasChannels) steps.push("channels");
  steps.push("review");
  return steps;
}
