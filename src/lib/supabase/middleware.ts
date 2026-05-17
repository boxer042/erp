import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (err) {
    // refresh token이 이미 사용되었거나 만료된 경우 등 — 세션을 비우고 비로그인 상태로 처리
    // (Supabase가 던지는 AuthApiError는 ignore-listed라 콘솔에 노이즈로만 남음)
    if (err && typeof err === "object" && "__isAuthError" in err) {
      for (const cookie of request.cookies.getAll()) {
        if (cookie.name.startsWith("sb-")) {
          supabaseResponse.cookies.delete(cookie.name);
        }
      }
    } else {
      throw err;
    }
  }

  // 로그인 페이지가 아닌 곳에서 인증되지 않은 경우 리다이렉트
  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth") &&
    !request.nextUrl.pathname.startsWith("/access-denied") &&
    !request.nextUrl.pathname.startsWith("/repair/approve") &&
    !request.nextUrl.pathname.startsWith("/s/") &&
    !request.nextUrl.pathname.startsWith("/r/") &&
    !request.nextUrl.pathname.startsWith("/api/public") &&
    !request.nextUrl.pathname.startsWith("/external/po") &&
    !request.nextUrl.pathname.startsWith("/jm")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // 이미 로그인한 사용자가 로그인 페이지에 접근하면 대시보드로
  if (user && request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
