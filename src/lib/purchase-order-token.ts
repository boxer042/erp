import { randomBytes } from "node:crypto";

/**
 * 안전한 외부 접근 토큰 생성 (256bit, URL-safe).
 * - 32 bytes = 256 bit
 * - base64url 인코딩 → 약 43자
 */
export function generateAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * 토큰 만료 기본값: 30일
 */
export const TOKEN_TTL_DAYS = 30;

export function defaultTokenExpiresAt(): Date {
  return new Date(Date.now() + TOKEN_TTL_DAYS * 86400_000);
}
