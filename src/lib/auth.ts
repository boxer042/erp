import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

// 환경변수: 콤마로 구분된 허용 이메일 목록
// 예) ALLOWED_EMAILS="boss@company.com,staff1@company.com"
// 비어 있으면 첫 사용자(부트스트랩) 외에는 신규 가입 전부 차단
function getAllowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  // 기존 사용자면 그대로 반환 (역할 절대 덮어쓰지 않음)
  const existing = await prisma.user.findUnique({
    where: { supabaseId: authUser.id },
  });
  if (existing) {
    // 비활성화된 계정은 거부
    if (!existing.isActive) return null;
    if (existing.email !== authUser.email) {
      return prisma.user.update({
        where: { id: existing.id },
        data: { email: authUser.email! },
      });
    }
    return existing;
  }

  // 신규 사용자: 부트스트랩(DB 빈 상태)이거나 ALLOWED_EMAILS에 등록된 경우만 허용
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    const allowed = getAllowedEmails();
    const email = authUser.email?.toLowerCase() ?? "";
    if (!allowed.includes(email)) {
      // 허용되지 않은 가입자 — User row 생성 거부
      return null;
    }
  }

  return prisma.user.create({
    data: {
      supabaseId: authUser.id,
      email: authUser.email!,
      name: authUser.user_metadata?.name || authUser.email!,
      role: userCount === 0 ? "ADMIN" : "STAFF",
    },
  });
}

/**
 * Supabase 세션과 ERP User row의 존재 여부를 분리해 판단한다.
 * - 세션 자체가 없음 → /login
 * - 세션은 있지만 ERP가 거부 (allowlist 위반/비활성) → /access-denied
 */
export async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  const user = await getCurrentUser();
  if (!user) redirect("/access-denied");
  return user;
}
