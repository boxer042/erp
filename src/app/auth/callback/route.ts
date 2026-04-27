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
      // Prisma User 동기화
      await prisma.user.upsert({
        where: { supabaseId: data.user.id },
        update: {
          email: data.user.email!,
          name: data.user.user_metadata?.name || data.user.email!,
        },
        create: {
          supabaseId: data.user.id,
          email: data.user.email!,
          name: data.user.user_metadata?.name || data.user.email!,
          role: "STAFF",
        },
      });

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
