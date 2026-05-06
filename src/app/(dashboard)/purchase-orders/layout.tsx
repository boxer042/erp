import "@/jm/tokens.css";
import { PurchaseOrdersThemeScope } from "./_theme-scope";

/**
 * purchase-orders 라우트 — jm 디자인 시스템 적용 영역.
 * tokens.css 로드 + ThemeScope (client) 가 next-themes 와 동기화해 JmScope 적용.
 */
export default function PurchaseOrdersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PurchaseOrdersThemeScope>{children}</PurchaseOrdersThemeScope>;
}
