import "@/jm/tokens.css";
import { LandingThemeScope } from "./_theme-scope";

/**
 * 상품 랜딩 편집 라우트 — jm 디자인 시스템 적용.
 * tokens.css 로드 + LandingThemeScope (client) 가 next-themes 와 동기화해 JmScope 적용.
 */
export default function LandingEditLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <LandingThemeScope>{children}</LandingThemeScope>;
}
