/**
 * 1회성 정리 — 빈 PosSession 삭제.
 * - items 0건 + repairTicketIds 0건 + customer 미연결
 * - 작업 중일 가능성 0이라 안전하게 삭제 가능
 *
 * 실행: npx tsx scripts/cleanup-empty-pos-sessions.ts [--apply]
 *   (--apply 없으면 dry-run, 미리보기만)
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as dotenv } from "dotenv";

dotenv({ path: ".env.local" });
dotenv({ path: ".env" });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const APPLY = process.argv.includes("--apply");

async function main() {
  const sessions = await prisma.posSession.findMany({
    include: {
      user: { select: { name: true } },
      customer: { select: { name: true } },
    },
  });

  const targets = sessions.filter((s) => {
    const items = (s.items as unknown as unknown[]) ?? [];
    const repairs = (s.repairTicketIds as unknown as string[] | null) ?? [];
    return items.length === 0 && repairs.length === 0 && s.customerId == null;
  });

  console.log(`전체 PosSession: ${sessions.length}건`);
  console.log(`삭제 대상 (빈 미등록): ${targets.length}건\n`);

  for (const s of targets) {
    console.log(
      `  - ${s.id.slice(-8)} | user=${s.user.name} | label=${s.label} | updated=${s.updatedAt.toISOString().slice(0, 19)}`,
    );
  }

  if (targets.length === 0) {
    console.log("\n정리할 세션 없음.");
    return;
  }

  if (!APPLY) {
    console.log(`\n미리보기 모드 (dry-run). 실제 삭제하려면 --apply 추가.`);
    console.log(`  npx tsx scripts/cleanup-empty-pos-sessions.ts --apply`);
    return;
  }

  const result = await prisma.posSession.deleteMany({
    where: { id: { in: targets.map((s) => s.id) } },
  });
  console.log(`\n✓ ${result.count}건 삭제 완료`);
}

main()
  .catch((e) => {
    console.error("ERR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
