import { endOfMonth, format, startOfDay, startOfMonth, subMonths } from "date-fns";
import type { DatePreset, LedgerEntry } from "./_types";

export function formatAmount(n: number | string) {
  const v = typeof n === "string" ? parseFloat(n) : n;
  return Math.round(v).toLocaleString("ko-KR");
}

/** 프리셋 → from/to 계산 */
export function applyDatePreset(preset: DatePreset, now: Date) {
  if (preset === "thisMonth") return { from: startOfMonth(now), to: endOfMonth(now) };
  if (preset === "lastMonth") {
    const last = subMonths(now, 1);
    return { from: startOfMonth(last), to: endOfMonth(last) };
  }
  if (preset === "last3")
    return { from: startOfDay(subMonths(now, 3)), to: endOfMonth(now) };
  return { from: undefined, to: undefined };
}

/** from/to → 프리셋 라벨 reverse lookup */
export function getCurrentPresetLabel(
  from: Date | undefined,
  to: Date | undefined,
  now: Date,
): "이번달" | "지난달" | "최근3개월" | "전체" | "커스텀" {
  if (!from && !to) return "전체";
  if (from && to) {
    const thisF = startOfMonth(now).getTime();
    const thisT = endOfMonth(now).getTime();
    if (from.getTime() === thisF && to.getTime() === thisT) return "이번달";
    const last = subMonths(now, 1);
    if (
      from.getTime() === startOfMonth(last).getTime() &&
      to.getTime() === endOfMonth(last).getTime()
    )
      return "지난달";
    if (
      from.getTime() === startOfDay(subMonths(now, 3)).getTime() &&
      to.getTime() === endOfMonth(now).getTime()
    )
      return "최근3개월";
  }
  return "커스텀";
}

/** 원장 뷰 — 날짜별 그룹핑 */
export function buildLedgerDateGroups(
  entries: LedgerEntry[],
): Array<[string, LedgerEntry[]]> {
  const map = new Map<string, LedgerEntry[]>();
  entries.forEach((e) => {
    const key = format(new Date(e.date), "yyyy-MM-dd");
    const arr = map.get(key) || [];
    arr.push(e);
    map.set(key, arr);
  });
  return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
}
