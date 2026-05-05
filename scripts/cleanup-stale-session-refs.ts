/**
 * PosSession.repairTicketIds 에서 이미 삭제된 ticketId 제거.
 * (cleanup-orphan-repair-tickets 실행 후 dangling ref 정리용)
 *
 * 실행: npx tsx scripts/cleanup-stale-session-refs.ts [--apply]
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
  const sessions = await prisma.posSession.findMany();

  // 모든 session 의 repairTicketIds 합집합
  const allTicketIds = new Set<string>();
  for (const s of sessions) {
    const ids = (s.repairTicketIds as unknown as string[] | null) ?? [];
    for (const id of ids) allTicketIds.add(id);
  }

  if (allTicketIds.size === 0) {
    console.log("PosSession.repairTicketIds 가 비어있음. 정리 불필요.");
    return;
  }

  // 실제 존재하는 ticket
  const existing = await prisma.repairTicket.findMany({
    where: { id: { in: Array.from(allTicketIds) } },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((t) => t.id));

  // 각 session 별로 dangling 정리
  let updated = 0;
  for (const s of sessions) {
    const ids = (s.repairTicketIds as unknown as string[] | null) ?? [];
    const filtered = ids.filter((id) => existingIds.has(id));
    if (filtered.length === ids.length) continue;
    const removed = ids.length - filtered.length;
    console.log(
      `  - ${s.id.slice(-8)} (label=${s.label}) | dangling ${removed}개 제거 (${ids.length} → ${filtered.length})`,
    );
    if (APPLY) {
      await prisma.posSession.update({
        where: { id: s.id },
        data: {
          repairTicketIds: filtered.length > 0 ? filtered : [],
        },
      });
    }
    updated++;
  }

  if (updated === 0) {
    console.log("정리할 dangling ref 없음.");
    return;
  }
  console.log(
    `\n${APPLY ? "✓ 삭제 완료" : "미리보기 모드 — --apply 로 적용"}: ${updated}개 session`,
  );
}

main()
  .catch((e) => {
    console.error("ERR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
