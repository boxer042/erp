import "@/jm/tokens.css";
import { SalesHistoryThemeScope } from "./_theme-scope";

export default function SalesHistoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SalesHistoryThemeScope>{children}</SalesHistoryThemeScope>;
}
