import "@/jm/tokens.css";
import { ManualThemeScope } from "./_theme-scope";

export default function ManualEditLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ManualThemeScope>{children}</ManualThemeScope>;
}
