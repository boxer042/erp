/**
 * 카카오톡 "나에게 보내기"(memo) 클라이언트 — 업무 노트 리마인더 발송용 (Phase 3).
 *
 * 알림톡(Solapi, 고객 외부알림)과 별개. 사장 본인에게 보내는 1:1 자기 알림.
 * 무료·사전 승인 템플릿 불필요·비즈앱 불필요. 카카오 로그인 OAuth(talk_message) 1회 + refresh token 보관.
 *
 * env (미설정 시 전 경로 no-op):
 *   KAKAO_REST_API_KEY     카카오 개발자 앱 REST API 키 (client_id)
 *   KAKAO_CLIENT_SECRET    (선택) 보안 강화 시
 *   NEXT_PUBLIC_APP_URL    redirect_uri 베이스 — 카카오 앱에 등록한 도메인
 *
 * 설계: docs/NOTES_SYSTEM.md §7.
 */
import { prisma } from "@/lib/prisma";

const KAUTH = "https://kauth.kakao.com";
const KAPI = "https://kapi.kakao.com";
const DEFAULT_REFRESH_TTL_SEC = 60 * 24 * 60 * 60; // 60일

/** 카카오 연동에 필요한 env 가 모두 있는지. 없으면 모든 발송·연결 경로가 비활성. */
export function isKakaoConfigured(): boolean {
  return Boolean(process.env.KAKAO_REST_API_KEY && process.env.NEXT_PUBLIC_APP_URL);
}

export function kakaoRedirectUri(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/kakao/callback`;
}

export function kakaoAuthorizeUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.KAKAO_REST_API_KEY ?? "",
    redirect_uri: kakaoRedirectUri(),
    response_type: "code",
    scope: "talk_message",
  });
  return `${KAUTH}/oauth/authorize?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  refresh_token_expires_in?: number;
}

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  if (process.env.KAKAO_CLIENT_SECRET) body.set("client_secret", process.env.KAKAO_CLIENT_SECRET);
  const res = await fetch(`${KAUTH}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body,
  });
  if (!res.ok) throw new Error(`kakao token ${res.status}: ${await res.text()}`);
  return (await res.json()) as TokenResponse;
}

export async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  return postToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.KAKAO_REST_API_KEY ?? "",
      redirect_uri: kakaoRedirectUri(),
      code,
    }),
  );
}

/** 토큰 응답을 KakaoConnection 으로 upsert. refresh token 이 새로 오면 회전 저장. */
export async function saveConnection(userId: string, t: TokenResponse): Promise<void> {
  const now = Date.now();
  const accessTokenExpiresAt = new Date(now + t.expires_in * 1000);
  const refreshTokenExpiresAt = new Date(
    now + (t.refresh_token_expires_in ?? DEFAULT_REFRESH_TTL_SEC) * 1000,
  );
  await prisma.kakaoConnection.upsert({
    where: { userId },
    create: {
      userId,
      accessToken: t.access_token,
      refreshToken: t.refresh_token ?? "",
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    },
    update: {
      accessToken: t.access_token,
      accessTokenExpiresAt,
      // refresh token 은 새로 내려올 때만 교체(회전). 안 오면 기존 유지.
      ...(t.refresh_token ? { refreshToken: t.refresh_token, refreshTokenExpiresAt } : {}),
    },
  });
}

/**
 * 유효한 access token 확보. 만료 임박이면 refresh + 회전 저장.
 * 미연결 / refresh token 만료(재로그인 필요) 시 null.
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const conn = await prisma.kakaoConnection.findUnique({ where: { userId } });
  if (!conn) return null;
  const now = Date.now();
  if (conn.accessTokenExpiresAt.getTime() - now > 60_000) return conn.accessToken;
  if (conn.refreshTokenExpiresAt.getTime() <= now) return null; // 재연결 필요
  try {
    const t = await postToken(
      new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.KAKAO_REST_API_KEY ?? "",
        refresh_token: conn.refreshToken,
      }),
    );
    await saveConnection(userId, t);
    return t.access_token;
  } catch {
    return null;
  }
}

export interface MemoLink {
  web_url?: string;
  mobile_web_url?: string;
}

/** "나에게 보내기" 기본 텍스트 템플릿 발송. 성공 여부 반환. */
export async function sendMemoText(
  accessToken: string,
  text: string,
  link?: MemoLink,
): Promise<boolean> {
  const templateObject = {
    object_type: "text",
    text: text.slice(0, 200),
    link: link ?? {},
  };
  const res = await fetch(`${KAPI}/v2/api/talk/memo/default/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: new URLSearchParams({ template_object: JSON.stringify(templateObject) }),
  });
  return res.ok;
}
