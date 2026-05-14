import { endOfMonth, format, startOfDay, startOfMonth, subMonths } from "date-fns";
import type {
  DatePreset,
  ItemViewRow,
  LedgerEntry,
  LedgerItem,
} from "./_types";

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

/**
 * 품목별 뷰 — 날짜별 그룹핑.
 * 매입 품목 + 결제/조정/환급을 원장뷰와 동일한 순서로 섞어 평탄화한 결과 반환.
 */
export function buildItemDateGroups(
  items: LedgerItem[],
  paymentsInItems: LedgerEntry[],
  purchasesInItems: LedgerEntry[],
): Array<[string, ItemViewRow[]]> {
  // referenceId(incomingId) → PURCHASE ledger entry
  const purchaseEntryByIncoming = new Map<string, LedgerEntry>();
  purchasesInItems.forEach((p) => {
    if (p.referenceId) purchaseEntryByIncoming.set(p.referenceId, p);
  });

  // incoming별 items 묶음
  const itemsByIncoming = new Map<string, LedgerItem[]>();
  items.forEach((it) => {
    const arr = itemsByIncoming.get(it.incomingId) || [];
    arr.push(it);
    itemsByIncoming.set(it.incomingId, arr);
  });

  // 날짜 → 그룹(rows + 정렬키) 리스트
  type Group = { sortKey: number; rows: ItemViewRow[] };
  const dayMap = new Map<string, Group[]>();

  // 1) 각 incoming을 한 그룹으로 추가
  itemsByIncoming.forEach((its, incomingId) => {
    const purchaseEntry = purchaseEntryByIncoming.get(incomingId);
    const dateBasis = purchaseEntry ? purchaseEntry.date : its[0].incomingDate;
    const sortKey = purchaseEntry
      ? new Date(purchaseEntry.createdAt).getTime()
      : new Date(its[0].incomingDate).getTime();
    const dayKey = format(new Date(dateBasis), "yyyy-MM-dd");
    const balance = purchaseEntry ? Number(purchaseEntry.balance) : null;
    const rows: ItemViewRow[] = its.map((it, idx) => ({
      kind: "item",
      data: it,
      isLastInGroup: idx === its.length - 1,
      balance: idx === its.length - 1 ? balance : null,
    }));
    const groups = dayMap.get(dayKey) || [];
    groups.push({ sortKey, rows });
    dayMap.set(dayKey, groups);
  });

  // 2) 결제/조정/환급은 각자 한 행 그룹
  paymentsInItems.forEach((p) => {
    const dayKey = format(new Date(p.date), "yyyy-MM-dd");
    const sortKey = new Date(p.createdAt).getTime();
    const groups = dayMap.get(dayKey) || [];
    groups.push({ sortKey, rows: [{ kind: "payment", data: p }] });
    dayMap.set(dayKey, groups);
  });

  // 3) 같은 날짜 안에서 createdAt desc 정렬 후 평탄화
  const flattened = new Map<string, ItemViewRow[]>();
  dayMap.forEach((groups, day) => {
    groups.sort((a, b) => b.sortKey - a.sortKey);
    flattened.set(day, groups.flatMap((g) => g.rows));
  });

  return Array.from(flattened.entries()).sort((a, b) => b[0].localeCompare(a[0]));
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
