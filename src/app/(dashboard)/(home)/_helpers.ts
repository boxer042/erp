export const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR");

export const fmtCompact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (abs >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  return fmt(n);
};

/** 이전 대비 변화율 (%) — base 0 이면 null (의미 없음) */
export function delta(curr: number, base: number): number | null {
  if (base === 0) return null;
  return ((curr - base) / base) * 100;
}

export type DashboardPeriod =
  | "today"
  | "this-week"
  | "this-month"
  | "last-month"
  | "custom";

export const DASHBOARD_PERIODS: DashboardPeriod[] = [
  "today",
  "this-week",
  "this-month",
  "last-month",
  "custom",
];

/** YYYY-MM-DD → Date (UTC 자정 아닌 로컬 자정 기준) */
export function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DAY = 24 * 60 * 60 * 1000;

export interface PeriodRange {
  /** 현재 기간 시작 (inclusive) */
  from: Date;
  /** 현재 기간 끝 (exclusive) */
  to: Date;
  /** 같은 길이의 직전 기간 시작 (delta 비교용) */
  prevFrom: Date;
  /** 같은 길이의 직전 기간 끝 */
  prevTo: Date;
  /** "이번 달", "오늘" 등 짧은 라벨 */
  label: string;
  /** "지난 달 대비", "어제 대비" 등 비교 라벨 */
  compareLabel: string;
}

export function periodRange(
  period: DashboardPeriod,
  now: Date,
  custom?: { from: Date; to: Date },
): PeriodRange {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === "custom" && custom) {
    // to 는 inclusive 로 사용자가 선택 — 쿼리 비교는 lt: to+1d 가 필요
    const fromMidnight = new Date(
      custom.from.getFullYear(),
      custom.from.getMonth(),
      custom.from.getDate(),
    );
    const toMidnightExclusive = new Date(
      custom.to.getFullYear(),
      custom.to.getMonth(),
      custom.to.getDate() + 1,
    );
    const len = toMidnightExclusive.getTime() - fromMidnight.getTime();
    const sameDay =
      fromMidnight.getTime() ===
      new Date(toMidnightExclusive.getTime() - DAY).getTime();
    const label = sameDay
      ? `${fromMidnight.getMonth() + 1}/${fromMidnight.getDate()}`
      : `${fromMidnight.getMonth() + 1}/${fromMidnight.getDate()}~${custom.to.getMonth() + 1}/${custom.to.getDate()}`;
    return {
      from: fromMidnight,
      to: toMidnightExclusive,
      prevFrom: new Date(fromMidnight.getTime() - len),
      prevTo: fromMidnight,
      label,
      compareLabel: "직전 기간 대비",
    };
  }

  if (period === "today") {
    return {
      from: startOfToday,
      to: new Date(startOfToday.getTime() + DAY),
      prevFrom: new Date(startOfToday.getTime() - DAY),
      prevTo: startOfToday,
      label: "오늘",
      compareLabel: "어제 대비",
    };
  }

  if (period === "this-week") {
    // 월요일을 주 시작으로 (ISO). getDay(): 일=0 → 7 로 보정
    const day = now.getDay() === 0 ? 7 : now.getDay();
    const monday = new Date(startOfToday.getTime() - (day - 1) * DAY);
    return {
      from: monday,
      to: new Date(monday.getTime() + 7 * DAY),
      prevFrom: new Date(monday.getTime() - 7 * DAY),
      prevTo: monday,
      label: "이번 주",
      compareLabel: "지난 주 대비",
    };
  }

  if (period === "last-month") {
    const startLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const startThis = new Date(now.getFullYear(), now.getMonth(), 1);
    const startPrev = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return {
      from: startLast,
      to: startThis,
      prevFrom: startPrev,
      prevTo: startLast,
      label: `${startLast.getMonth() + 1}월`,
      compareLabel: `${startPrev.getMonth() + 1}월 대비`,
    };
  }

  // this-month
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startNext = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const startLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return {
    from: startMonth,
    to: startNext,
    prevFrom: startLast,
    prevTo: startMonth,
    label: `${now.getMonth() + 1}월`,
    compareLabel: `${startLast.getMonth() + 1}월 대비`,
  };
}
