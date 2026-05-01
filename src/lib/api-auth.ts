import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import type { User } from "@prisma/client";

export class ApiAuthError extends Error {
  constructor(public response: NextResponse) {
    super("API auth error");
  }
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    throw new ApiAuthError(
      NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 }),
    );
  }
  if (!user.isActive) {
    throw new ApiAuthError(
      NextResponse.json({ error: "비활성화된 계정입니다" }, { status: 403 }),
    );
  }
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    throw new ApiAuthError(
      NextResponse.json({ error: "관리자 권한이 필요합니다" }, { status: 403 }),
    );
  }
  return user;
}

export function handleAuthError(e: unknown): NextResponse | null {
  if (e instanceof ApiAuthError) return e.response;
  return null;
}

/**
 * 가드 함수 — 성공 시 [user, null], 실패 시 [null, NextResponse] 반환.
 * 사용 예:
 *   const [user, deny] = await guardAdmin();
 *   if (deny) return deny;
 */
export async function guardUser(): Promise<[User, null] | [null, NextResponse]> {
  try {
    const u = await requireUser();
    return [u, null];
  } catch (e) {
    if (e instanceof ApiAuthError) return [null, e.response];
    throw e;
  }
}

export async function guardAdmin(): Promise<[User, null] | [null, NextResponse]> {
  try {
    const u = await requireAdmin();
    return [u, null];
  } catch (e) {
    if (e instanceof ApiAuthError) return [null, e.response];
    throw e;
  }
}
