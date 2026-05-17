import "@/jm/tokens.css";
import { VatFilingThemeScope } from "./_theme-scope";

export default function VatFilingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <VatFilingThemeScope>{children}</VatFilingThemeScope>;
}
