// 미등록 고객 식별용 — 세션 UUID 에서 짧은 코드 + 색상 추출.
// 한 세션에 한 번 부여되고 영구 보존(localStorage). 카트/수리/임대 어디서나 같은 색·코드로 표시.

const PALETTE: { color: string; bg: string; ring: string }[] = [
  { color: "rose", bg: "bg-rose-500", ring: "ring-rose-300" },
  { color: "amber", bg: "bg-amber-500", ring: "ring-amber-300" },
  { color: "emerald", bg: "bg-emerald-500", ring: "ring-emerald-300" },
  { color: "teal", bg: "bg-teal-500", ring: "ring-teal-300" },
  { color: "sky", bg: "bg-sky-500", ring: "ring-sky-300" },
  { color: "indigo", bg: "bg-indigo-500", ring: "ring-indigo-300" },
  { color: "fuchsia", bg: "bg-fuchsia-500", ring: "ring-fuchsia-300" },
  { color: "violet", bg: "bg-violet-500", ring: "ring-violet-300" },
];

// 세션 UUID 에서 결정론적으로 코드 추출 — 영문/숫자만 남기고 뒤 3글자 대문자.
// 앞부분은 timestamp 라 같은 시간대 세션끼리 구분 안 됨 → 뒤(random) 영역 사용.
export function deriveTempCode(sessionId: string): string {
  const cleaned = sessionId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (cleaned.length === 0) return "???";
  if (cleaned.length <= 3) return cleaned.padStart(3, "0");
  return cleaned.slice(-3);
}

// 세션 UUID 해시 → 8색 중 하나 (한 세션엔 항상 같은 색)
export function deriveTempColor(sessionId: string): {
  bg: string;
  ring: string;
  color: string;
} {
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = (hash * 31 + sessionId.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

// 화면 표시용 — "#A2K" 형식
export function formatTempLabel(sessionId: string): string {
  return `#${deriveTempCode(sessionId)}`;
}
