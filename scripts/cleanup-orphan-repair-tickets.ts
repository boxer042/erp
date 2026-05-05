/**
 * 1회성 정리 — 보존 가치 없는 RepairTicket 삭제.
 * 5가지 보존 조건 모두 미해당 + 종료 상태(CANCELLED 또는 빈 RECEIVED) 만 대상:
 *   1. 등록 고객 X (customerId == null)
 *   2. 시리얼 라벨 X (serialItemId == null)
 *   3. LOST 부속 X
 *   4. 진단비 0 또는 null
 *   5. status: CANCELLED, 또는 RECEIVED + parts/labors 0건
 *
 * 실행:
 *   npx tsx scripts/cleanup-orphan-repair-tickets.ts          (dry-run)
 *   npx tsx scripts/cleanup-orphan-repair-tickets.ts --apply  (실제 삭제)
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
  const tickets = await prisma.repairTicket.findMany({
    where: {
      customerId: null,
      serialItemId: null,
      OR: [
        { status: "CANCELLED" },
        { status: "RECEIVED" },
      ],
    },
    select: {
      id: true,
      ticketNo: true,
      status: true,
      diagnosisFee: true,
      cancelReason: true,
      cancelMemo: true,
      receivedAt: true,
      _count: { select: { parts: true, labors: true } },
      parts: { select: { status: true } },
    },
  });

  const targets = tickets.filter((t) => {
    const hasLost = t.parts.some((p) => p.status === "LOST");
    const hasFee = Number(t.diagnosisFee) > 0;
    const hasParts = t._count.parts > 0;
    const hasLabors = t._count.labors > 0;

    if (hasLost || hasFee) return false;
    // CANCELLED — 부속/공임 있어도 모두 USED 면 정리 가능 (재고는 이미 복원됨)
    if (t.status === "CANCELLED") return true;
    // RECEIVED — 부속·공임 0건일 때만 (작업 시작 안 한 빈 티켓)
    if (t.status === "RECEIVED" && !hasParts && !hasLabors) return true;
    return false;
  });

  console.log(`전체 후보 (미등록 + 시리얼X + 종료상태): ${tickets.length}건`);
  console.log(`삭제 대상: ${targets.length}건\n`);

  for (const t of targets) {
    console.log(
      `  - ${t.ticketNo} | ${t.status} | parts=${t._count.parts} labors=${t._count.labors} | ` +
        `received=${t.receivedAt.toISOString().slice(0, 10)}` +
        (t.cancelReason ? ` | reason=${t.cancelReason}` : ""),
    );
  }

  if (targets.length === 0) {
    console.log("정리할 티켓 없음.");
    return;
  }

  if (!APPLY) {
    console.log(`\n미리보기 모드 (dry-run). 실제 삭제하려면 --apply 추가.`);
    return;
  }

  // RepairPart, RepairLabor 는 onDelete: Cascade — RepairTicket 삭제 시 자동
  const result = await prisma.repairTicket.deleteMany({
    where: { id: { in: targets.map((t) => t.id) } },
  });
  console.log(`\n✓ ${result.count}건 영구 삭제 완료`);
}

main()
  .catch((e) => {
    console.error("ERR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
