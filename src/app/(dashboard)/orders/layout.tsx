import "@/jm/tokens.css";
import { OrdersThemeScope } from "./_theme-scope";

/**
 * orders 라우트 — jm 디자인 시스템 적용 영역.
 * tokens.css 로드 + OrdersThemeScope (client) 가 next-themes 와 동기화해 JmScope 적용.
 */
export default function OrdersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <OrdersThemeScope>{children}</OrdersThemeScope>;
}
