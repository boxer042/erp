/**
 * 출고 워크보드 — 그룹 분류 + KR 기준 today 헬퍼.
 * api/orders/route.ts (서버), orders/_helpers.ts (클라이언트), 테스트 스크립트가 공유.
 *
 * timezone 정책: expectedShipDate 는 prisma @db.Date 라 UTC 자정 Date 객체로 읽힘.
 * 사용자 관점은 한국(KST). 그래서 today 도 "KST 기준 오늘 날짜"의 UTC 자정 Date 객체로
 * 생성한 뒤, 비교는 모두 UTC 기준으로 수행 — 둘 다 같은 통화에서 비교하므로 일관됨.
 */

export type OrderStatusForBoard =
  | "PENDING"
  | "PREPARING"
  | "SHIPPED"
  | "COMPLETED"
  | "RETURN_REQUESTED"
  | "RETURN_ACCEPTED"
  | "CANCELLED"
  | "RETURNED"
  | "EXCHANGED";

export type BoardGroupKey =
  | "overdue"
  | "today"
  | "unscheduled"
  | "shipped"
  | "thisWeek"
  | "future"
  | "returnPending";

/** "Asia/Seoul" 기준 오늘 날짜의 UTC 자정 Date 객체. KR 사용자 시간대 기준 분류용. */
export function getKrToday(now: Date = new Date()): Date {
  // ISO local date (YYYY-MM-DD) — Asia/Seoul 기준
  const krDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${krDate}T00:00:00Z`);
}

/** UTC 기준 두 Date 의 일수 차이 (정수). 같은 날 = 0, 미래 = 양수, 과거 = 음수 */
export function utcDayDiff(a: Date, b: Date): number {
  const aUtc = Date.UTC(
    a.getUTCFullYear(),
    a.getUTCMonth(),
    a.getUTCDate(),
  );
  const bUtc = Date.UTC(
    b.getUTCFullYear(),
    b.getUTCMonth(),
    b.getUTCDate(),
  );
  return Math.floor((aUtc - bUtc) / 86_400_000);
}

/**
 * 워크보드 섹션 분류:
 *  - SHIPPED: shipped
 *  - RETURN_REQUESTED / RETURN_ACCEPTED: returnPending (매장 결정 또는 회수 대기 — 처리 필요)
 *  - PENDING/PREPARING + expectedShipDate=null: unscheduled (예정일 미정 — 사용자가 채워야 함)
 *  - PENDING/PREPARING + 날짜 있음: 일수 차이로
 *      < 0 → overdue, = 0 → today, ≤ 7 → thisWeek, > 7 → future
 *  - 그 외 (COMPLETED/CANCELLED/RETURNED/EXCHANGED): null (종결 — 워크보드 미노출)
 */
export function classifyBoardGroup(
  status: OrderStatusForBoard,
  expectedShipDate: Date | null,
  today: Date,
): BoardGroupKey | null {
  if (status === "SHIPPED") return "shipped";
  if (status === "RETURN_REQUESTED" || status === "RETURN_ACCEPTED")
    return "returnPending";
  if (status !== "PREPARING" && status !== "PENDING") return null;
  if (!expectedShipDate) return "unscheduled";
  const diffDays = utcDayDiff(expectedShipDate, today);
  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays <= 7) return "thisWeek";
  return "future";
}
