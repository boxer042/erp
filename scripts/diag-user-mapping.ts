import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  // 1. public.users 의 모든 row
  console.log("=== public.users (현재 dev DB) ===");
  const users = await prisma.user.findMany({
    select: {
      id: true,
      supabaseId: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
    },
  });
  for (const u of users) {
    console.log(
      `  ${u.email.padEnd(30)} role=${u.role} active=${u.isActive} supabaseId=${u.supabaseId}`,
    );
  }

  // 2. dev supabase 의 auth.users — restore 안 건드림. uid 확인용
  console.log("\n=== auth.users (dev supabase 실제 인증 계정) ===");
  const authUsers = await prisma.$queryRawUnsafe<
    Array<{ id: string; email: string; created_at: Date }>
  >(`SELECT id, email, created_at FROM auth.users ORDER BY created_at DESC`);
  for (const a of authUsers) {
    console.log(
      `  ${(a.email || "(no email)").padEnd(30)} uid=${a.id} createdAt=${a.created_at?.toISOString?.().slice(0, 10) ?? a.created_at}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
