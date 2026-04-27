import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  // Prisma DB에서 사용자 조회/동기화
  const user = await prisma.user.upsert({
    where: { supabaseId: authUser.id },
    update: {
      email: authUser.email!,
    },
    create: {
      supabaseId: authUser.id,
      email: authUser.email!,
      name: authUser.user_metadata?.name || authUser.email!,
      role: "ADMIN", // 첫 사용자는 ADMIN
    },
  });

  return user;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
