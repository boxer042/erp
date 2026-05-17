import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 클라이언트 임시 ID 생성 — crypto.randomUUID 가 secure context (HTTPS/localhost) 에서만
 * 동작하는 문제 회피용. LAN dev 서버 (http://192.168.x.x) 에선 undefined 라 fallback 필수.
 * DB 저장용 ID 가 아닌 카트 라인·임시 매핑 등 클라이언트측 고유 식별자에만 사용.
 */
export function genClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      /* falls through */
    }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─── 전화번호/사업자번호 포맷팅 ───

/** 숫자만 추출 (저장용) */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** 사업자번호 표시: 1234567890 → 123-45-67890 */
export function formatBusinessNumber(value: string): string {
  const d = digitsOnly(value);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5, 10)}`;
}

/**
 * 사업자번호 체크섬 검증 (국세청 알고리즘).
 * - 10자리 입력만 검증. 길이 다르면 false.
 * - 가중치 [1,3,7,1,3,7,1,3,5] 와 자릿수 곱 합산 + 8번째 자리 × 5 의 십의자리값 추가
 * - 마지막 자리(체크 디지트)와 (10 - sum % 10) % 10 비교
 *
 * 참고: https://www.nts.go.kr 사업자등록번호 체계
 */
export function isValidBusinessNumber(value: string): boolean {
  const d = digitsOnly(value);
  if (d.length !== 10) return false;
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i], 10) * weights[i];
  // 8번째 자리 × 5 의 10의자리값을 추가
  sum += Math.floor((parseInt(d[8], 10) * 5) / 10);
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(d[9], 10);
}

/** 전화번호 표시: 01012345678 → 010-1234-5678, 0212345678 → 02-1234-5678, 15880000 → 1588-0000 */
export function formatPhone(value: string): string {
  const d = digitsOnly(value);
  // 02 지역번호
  if (d.startsWith("02")) {
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`;
    if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`;
  }
  // 8자리 대표번호 — 15XX/16XX/18XX (콜센터/대표번호) → 1588-0000 형식
  if (d.length === 8 && /^(15|16|18)/.test(d)) {
    return `${d.slice(0, 4)}-${d.slice(4)}`;
  }
  // 010, 011, 031 등 3자리
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
}

// 정수 금액 입력용 천 단위 콤마 포맷 (예: "1234567" → "1,234,567")
export const formatComma = (s: string): string => {
  if (!s) return "";
  const digits = s.replace(/[^\d]/g, "");
  if (!digits) return "";
  return parseInt(digits, 10).toLocaleString("ko-KR");
};

// 콤마 제거 후 raw digits 반환 (DB 저장용)
export const parseComma = (s: string): string => s.replace(/[^\d]/g, "");

// 상품 가격 표시: 자동매핑 + 0원이면 "담당자 문의", 그 외엔 ₩ 포맷
export function formatProductPrice(
  price: number | string | { toString(): string } | null | undefined,
  opts: { autoMapped?: boolean } = {}
): string {
  const n = price == null ? 0 : parseFloat(typeof price === "object" ? price.toString() : String(price));
  const safe = Number.isFinite(n) ? n : 0;
  if (opts.autoMapped && safe === 0) return "담당자 문의";
  return `₩${safe.toLocaleString("ko-KR")}`;
}

// 소수점 허용 금액 입력용 천 단위 콤마 포맷 (예: "1234567.89" → "1,234,567.89")
// 입력 중 끝의 "." 도 보존한다 ("1234." → "1,234.")
export const formatCommaDecimal = (s: string): string => {
  if (!s) return "";
  const cleaned = s.replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const dotIdx = cleaned.indexOf(".");
  if (dotIdx === -1) {
    return parseInt(cleaned, 10).toLocaleString("ko-KR");
  }
  const intPart = cleaned.slice(0, dotIdx) || "0";
  const decPart = cleaned.slice(dotIdx + 1).replace(/\./g, "");
  const intFormatted = parseInt(intPart, 10).toLocaleString("ko-KR");
  return `${intFormatted}.${decPart}`;
};

// 콤마 제거 + 소수점 1개만 허용한 raw 문자열 반환 (DB 저장용)
export const parseCommaDecimal = (s: string): string => {
  const cleaned = s.replace(/[^\d.]/g, "");
  const dotIdx = cleaned.indexOf(".");
  if (dotIdx === -1) return cleaned;
  return cleaned.slice(0, dotIdx + 1) + cleaned.slice(dotIdx + 1).replace(/\./g, "");
};

// CSV 셀 이스케이프 (콤마/따옴표/줄바꿈 포함 시 큰따옴표로 감싸기)
function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// 객체 배열을 CSV 문자열로 변환 + UTF-8 BOM (엑셀 호환)
export function toCSV<T>(
  rows: T[],
  columns: { key: keyof T; label: string }[]
): string {
  const header = columns.map((c) => csvEscape(c.label)).join(",");
  const body = rows
    .map((row) => columns.map((c) => csvEscape((row as unknown as Record<string, unknown>)[c.key as string])).join(","))
    .join("\n");
  return "\uFEFF" + header + "\n" + body;
}

// 검색 비교용 정규화 — 소문자 + 모든 공백 제거.
// "고압 분무기" 와 "고압분무기" 가 같은 검색어로 매칭되도록.
export function normalizeSearch(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

// 할인 입력 정규화 — % 붙으면 0~100% 캡, 아니면 콤마 제거한 정수 문자열
export function normalizeDiscountInput(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.endsWith("%")) {
    const numeric = parseComma(trimmed.slice(0, -1)) || "0";
    const n = parseFloat(numeric);
    const capped = Math.min(100, Math.max(0, isNaN(n) ? 0 : n));
    return `${capped}%`;
  }
  return parseComma(trimmed);
}

// 할인 입력 표시 — % 포함이면 그대로, 아니면 천 단위 콤마
export function formatDiscountDisplay(v: string): string {
  return v.trim().endsWith("%") ? v : formatComma(v);
}

// 단가 기준 단위 할인 계산 — "10%" → 단가의 10%, "3000" → 3,000원
export function calcDiscountPerUnit(unitPrice: number, discount: string): number {
  if (!discount || discount === "0") return 0;
  const trimmed = discount.trim();
  if (trimmed.endsWith("%")) {
    const pct = parseFloat(trimmed.replace("%", "")) || 0;
    return Math.round(unitPrice * pct / 100);
  }
  return parseFloat(trimmed) || 0;
}

// YouTube URL에서 videoId 추출. 지원: youtu.be/<id>, youtube.com/watch?v=<id>, youtube.com/shorts/<id>, youtube.com/embed/<id>
export function extractYoutubeId(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      return u.pathname.slice(1).split("/")[0] || null;
    }
    if (host.endsWith("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(shorts|embed|v)\/([^/?]+)/);
      if (m) return m[2];
    }
    return null;
  } catch {
    return null;
  }
}

// 브라우저에서 CSV 다운로드 트리거
export function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
