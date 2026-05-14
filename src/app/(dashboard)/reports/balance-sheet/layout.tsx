import "@/jm/tokens.css";
import { BalanceSheetThemeScope } from "./_theme-scope";

export default function BalanceSheetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <BalanceSheetThemeScope>{children}</BalanceSheetThemeScope>;
}
