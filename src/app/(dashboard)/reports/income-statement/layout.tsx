import "@/jm/tokens.css";
import { IncomeStatementThemeScope } from "./_theme-scope";

export default function IncomeStatementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <IncomeStatementThemeScope>{children}</IncomeStatementThemeScope>;
}
