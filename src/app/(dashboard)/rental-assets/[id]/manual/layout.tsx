import "@/jm/tokens.css";
import { RentalManualThemeScope } from "./_theme-scope";

export default function RentalManualEditLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RentalManualThemeScope>{children}</RentalManualThemeScope>;
}
