import {
  endOfMonth,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
} from "date-fns";
import type { RangePreset } from "./_types";

export function presetToRange(preset: RangePreset): {
  from: string;
  to: string;
} {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  if (preset === "TODAY") return { from: todayStr, to: todayStr };
  if (preset === "THIS_WEEK") {
    return {
      from: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      to: todayStr,
    };
  }
  if (preset === "THIS_MONTH") {
    return { from: format(startOfMonth(today), "yyyy-MM-dd"), to: todayStr };
  }
  if (preset === "LAST_MONTH") {
    const lastMonth = subMonths(today, 1);
    return {
      from: format(startOfMonth(lastMonth), "yyyy-MM-dd"),
      to: format(endOfMonth(lastMonth), "yyyy-MM-dd"),
    };
  }
  if (preset === "LAST_3M") {
    return {
      from: format(startOfMonth(subMonths(today, 2)), "yyyy-MM-dd"),
      to: todayStr,
    };
  }
  if (preset === "THIS_YEAR") {
    return { from: format(startOfYear(today), "yyyy-MM-dd"), to: todayStr };
  }
  return { from: "", to: "" };
}

export function formatKrw(amount: number): string {
  return `₩${Math.round(amount).toLocaleString("ko-KR")}`;
}

/** 채널 분포 — 비율 + 압축 표시 */
export function formatCompactKrw(amount: number): string {
  if (amount >= 100_000_000)
    return `${(amount / 100_000_000).toFixed(1)}억`;
  if (amount >= 10_000) return `${Math.round(amount / 10_000)}만`;
  return amount.toLocaleString("ko-KR");
}
