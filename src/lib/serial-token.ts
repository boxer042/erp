import { randomBytes, createHash } from "node:crypto";

// 손님 공개 페이지(/s/[token]) 출입증 토큰. 시리얼 코드와 분리된 추측 불가능한 값.
// base62 16자 = 62^16 ≈ 4.7×10^28 — 무차별 추측 불가능.
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function generateAccessToken(length = 16): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % 62];
  }
  return out;
}

// IP 원본 저장 금지(PIPA 가명처리 권고) — SHA-256 해시로만 보관.
export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

// 요청에서 클라이언트 IP 추출 (프록시 헤더 우선).
export function clientIpFromHeaders(headers: Headers): string | null {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip");
}

// 손님 이름 마스킹 — "홍길동" → "홍○○", "김철" → "김○", 1글자는 그대로.
export function maskName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 1) return trimmed;
  return trimmed[0] + "○".repeat(trimmed.length - 1);
}

// 전화번호 마스킹 — 가운데 4자리 가림. "010-1234-5678" → "010-****-5678".
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return phone;
  const head = digits.slice(0, 3);
  const tail = digits.slice(-4);
  return `${head}-****-${tail}`;
}

// 본인확인 — 이름 완전일치(공백·대소문자 무시) + 전화 끝 4자리 일치.
export function verifyIdentity(
  input: { name: string; phoneLast4: string },
  customer: { name: string; phone: string },
): { ok: true } | { ok: false; reason: "WRONG_NAME" | "WRONG_PHONE" } {
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  if (norm(input.name) !== norm(customer.name)) {
    return { ok: false, reason: "WRONG_NAME" };
  }
  const last4 = customer.phone.replace(/\D/g, "").slice(-4);
  if (input.phoneLast4.replace(/\D/g, "") !== last4) {
    return { ok: false, reason: "WRONG_PHONE" };
  }
  return { ok: true };
}
