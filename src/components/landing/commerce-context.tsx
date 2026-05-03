"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * 상품 페이지의 "장바구니" / "바로 구매" 버튼이 호출할 핸들러.
 *
 * 진입 환경마다 달라야 하므로 (POS / 자사몰 / 외부 채널 export 등) Context 로 주입.
 * - POS 진입: customer-bound cart 에 추가, 결제 페이지 이동
 * - 자사몰 진입: 익명 세션 cart, 체크아웃 페이지 이동
 * - 미주입(편집기 미리보기, 외부 채널 export 등): 기본값으로 "지원 예정" 토스트
 */
export interface CommerceContextValue {
  onAddToCart?: (productId: string, quantity: number) => void | Promise<void>;
  onBuyNow?: (productId: string, quantity: number) => void | Promise<void>;
  /** 진입 환경 식별자 — 향후 분기 디버깅이나 분석용 */
  environment?: "pos" | "shop" | "preview" | "export";
}

const CommerceContext = createContext<CommerceContextValue>({
  environment: "preview",
});

export function CommerceProvider({
  value,
  children,
}: {
  value: CommerceContextValue;
  children: ReactNode;
}) {
  return <CommerceContext.Provider value={value}>{children}</CommerceContext.Provider>;
}

export function useCommerce(): CommerceContextValue {
  return useContext(CommerceContext);
}
