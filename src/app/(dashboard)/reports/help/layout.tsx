import "@/jm/tokens.css";
import { ReportsHelpThemeScope } from "./_theme-scope";

export default function ReportsHelpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ReportsHelpThemeScope>{children}</ReportsHelpThemeScope>;
}
