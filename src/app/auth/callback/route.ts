import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // 첫 가입자만 ADMIN, 이후는 STAFF. 기존 사용자 역할은 절대 덮어쓰지 않음.
      const existing = await prisma.user.findUnique({
        where: { supabaseId: data.user.id },
      });
      if (existing) {
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            email: data.user.email!,
            name: data.user.user_metadata?.name || data.user.email!,
          },
        });
      } else {
        const userCount = await prisma.user.count();
        await prisma.user.create({
          data: {
            supabaseId: data.user.id,
            email: data.user.email!,
            name: data.user.user_metadata?.name || data.user.email!,
            role: userCount === 0 ? "ADMIN" : "STAFF",
          },
        });
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
