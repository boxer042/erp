import { RepairHelpContent } from "@/components/repair/repair-help-content";

/**
 * 어드민 수리 도움말 — POS `/pos/repairs/help` 와 같은 RepairHelpContent 공유.
 * DashboardShell 이 이미 JmScope + 스크롤 컨테이너를 제공하므로 thin wrapper 로 충분.
 */
export default function DashboardRepairHelpPage() {
  return <RepairHelpContent backHref="/repairs" backLabel="수리관리로" />;
}
