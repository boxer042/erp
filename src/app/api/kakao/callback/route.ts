import { NextRequest, NextResponse } from "next/server";
import { guardUser } from "@/lib/api-auth";
import {
  exchangeCodeForToken,
  isKakaoConfigured,
  saveConnection,
} from "@/lib/notifications/kakao-memo";

// 카카오 인가 콜백 — code 를 토큰으로 교환하고 현재 사용자의 KakaoConnection 저장.
export async function GET(request: NextRequest) {
  const [user, deny] = await guardUser();
  if (deny) return deny;

  const url = new URL(request.url);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;
  const code = url.searchParams.get("code");

  if (!code || !isKakaoConfigured()) {
    return NextResponse.redirect(`${base}/notes?kakao=error`);
  }
  try {
    const token = await exchangeCodeForToken(code);
    await saveConnection(user.id, token);
    return NextResponse.redirect(`${base}/notes?kakao=connected`);
  } catch {
    return NextResponse.redirect(`${base}/notes?kakao=error`);
  }
}
