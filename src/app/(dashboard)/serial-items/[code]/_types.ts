import type { SerialProfile } from "@/lib/serial-profile";

export interface SerialAccessLogRow {
  id: string;
  stage: "PAGE_VIEW" | "AUTH_SUCCESS" | "AUTH_FAIL";
  failReason: "WRONG_NAME" | "WRONG_PHONE" | "RATE_LIMITED" | null;
  ipHash: string | null;
  userAgent: string | null;
  accessedAt: string;
}

// GET /api/serial-items/[code] 응답.
export type SerialDetail = SerialProfile & {
  id: string;
  memo: string | null;
  accessToken: string | null;
  accessTokenRevokedAt: string | null;
  accessLogs: SerialAccessLogRow[];
};

export const ACCESS_STAGE_LABEL: Record<SerialAccessLogRow["stage"], string> = {
  PAGE_VIEW: "페이지 진입",
  AUTH_SUCCESS: "본인확인 성공",
  AUTH_FAIL: "본인확인 실패",
};

export const ACCESS_FAIL_LABEL: Record<
  NonNullable<SerialAccessLogRow["failReason"]>,
  string
> = {
  WRONG_NAME: "이름 불일치",
  WRONG_PHONE: "전화 불일치",
  RATE_LIMITED: "시도횟수 초과",
};

export const SERIAL_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "활성",
  RETURNED: "반품",
  SCRAPPED: "폐기",
};

export const SERIAL_SOURCE_LABEL: Record<string, string> = {
  SALE: "판매",
  REPAIR: "수리",
};

export const REPAIR_STATUS_LABEL: Record<string, string> = {
  RECEIVED: "접수",
  DIAGNOSING: "진단중",
  QUOTED: "견적완료",
  APPROVED: "승인됨",
  REPAIRING: "수리중",
  READY: "수리완료",
  PICKED_UP: "수령완료",
  CANCELLED: "취소",
};
