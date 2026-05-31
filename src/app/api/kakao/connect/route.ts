import { NextResponse } from "next/server";
import { guardUser } from "@/lib/api-auth";
import { isKakaoConfigured, kakaoAuthorizeUrl } from "@/lib/notifications/kakao-memo";

// 카카오 로그인 인가 시작 — 로그인한 사용자를 카카오 동의 화면으로 보냄.
export async function GET() {
  const [, deny] = await guardUser();
  if (deny) return deny;
  if (!isKakaoConfigured()) {
    return NextResponse.json(
      { error: "카카오 앱이 설정되지 않았습니다 (KAKAO_REST_API_KEY / NEXT_PUBLIC_APP_URL)" },
      { status: 503 },
    );
  }
  return NextResponse.redirect(kakaoAuthorizeUrl());
}
