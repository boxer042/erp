import "@/jm/tokens.css";
import { SettingsLandingThemeScope } from "./_theme-scope";

/**
 * 랜딩 설정 라우트 — jm 디자인 시스템 적용.
 * tokens.css 로드 + SettingsLandingThemeScope (client) 가 next-themes 와 동기화해 JmScope 적용.
 */
export default function SettingsLandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SettingsLandingThemeScope>{children}</SettingsLandingThemeScope>;
}
