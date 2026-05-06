/**
 * 임대 자동 OVERDUE 전환 — endDate 가 오늘 이전인 ACTIVE 임대를 OVERDUE 로 전환.
 * 실행: npx tsx scripts/cron-rental-overdue.ts
 *
 * 권장: 매일 00:30 cron 으로 실행
 *   30 0 * * * cd /path/to/erp && npx tsx scripts/cron-rental-overdue.ts >> /var/log/rental-overdue.log 2>&1
 *
 * 안전: dry-run 옵션 — 환경변수 DRY=1
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as dotenv } from "dotenv";

dotenv({ path: ".env.local" });
dotenv({ path: ".env" });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const DRY = process.env.DRY === "1";

async function main() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const candidates = await prisma.rental.findMany({
    where: {
      status: "ACTIVE",
      endDate: { lt: todayStart },
    },
    select: {
      id: true,
      rentalNo: true,
      endDate: true,
      customer: { select: { name: true } },
    },
  });

  if (candidates.length === 0) {
    console.log(`✓ ${now.toISOString()} — 전환 대상 없음`);
    return;
  }

  console.log(`${DRY ? "[DRY] " : ""}전환 대상 ${candidates.length}건:`);
  for (const r of candidates) {
    const days = Math.floor(
      (todayStart.getTime() - r.endDate.getTime()) / 86400000,
    );
    console.log(`  ${r.rentalNo} (${r.customer?.name ?? "?"}) — 만기 ${days}일 경과`);
  }

  if (DRY) {
    console.log("DRY=1 → 실제 전환 안 함");
    return;
  }

  const result = await prisma.rental.updateMany({
    where: { id: { in: candidates.map((r) => r.id) } },
    data: { status: "OVERDUE" },
  });

  console.log(`✓ ${result.count}건 OVERDUE 로 전환됨`);
}

main()
  .catch((e) => {
    console.error("❌ rental-overdue 실패:", e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
