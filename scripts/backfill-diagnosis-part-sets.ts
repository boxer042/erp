/**
 * 진단 세트(DiagnosisPartSet) backfill — Phase 4 도입 시 1회성.
 *
 * 동작:
 *   1. PICKED_UP 상태 + diagnosisTemplateId 있는 모든 RepairTicket 순회
 *   2. 각 티켓의 (정렬된 productIds, 정렬된 laborNames) 묶음 정규화
 *   3. learnDiagnosisPartSet 헬퍼로 누적 평균 계산하며 upsert
 *
 * 사용:
 *   npx tsx --env-file=.env.local scripts/backfill-diagnosis-part-sets.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-diagnosis-part-sets.ts
 *
 * 정책: 기존 DiagnosisPartSet 모두 삭제 후 재구축 (멱등 보장).
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { prisma } from "../src/lib/prisma";
import { learnDiagnosisPartSet } from "../src/lib/repair-diagnosis-usage";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const tickets = await prisma.repairTicket.findMany({
    where: {
      status: "PICKED_UP",
      diagnosisTemplateId: { not: null },
    },
    select: {
      id: true,
      ticketNo: true,
      diagnosisTemplateId: true,
      pickedUpAt: true,
      parts: {
        where: { status: "USED" },
        select: { productId: true },
      },
      labors: { select: { name: true } },
    },
    orderBy: { pickedUpAt: "asc" },
  });

  console.log(`[backfill] 종결 + 진단 연결된 RepairTicket ${tickets.length}건`);

  // 미리 분석 — 진단별 세트 통계 추정
  const setKeyByTicket = new Map<string, string>();
  for (const t of tickets) {
    const productIds = Array.from(
      new Set(t.parts.map((p) => p.productId)),
    ).sort();
    const laborNames = Array.from(new Set(t.labors.map((l) => l.name))).sort();
    if (productIds.length === 0 && laborNames.length === 0) continue;
    const key = `${t.diagnosisTemplateId}::${productIds.join(",")}::${laborNames.join(",")}`;
    setKeyByTicket.set(t.id, key);
  }
  const uniqueSetCount = new Set(setKeyByTicket.values()).size;
  console.log(`[backfill] 부속/공임 있는 티켓 ${setKeyByTicket.size}건`);
  console.log(`[backfill] 예상 unique 세트 ${uniqueSetCount}개`);

  if (DRY_RUN) {
    console.log("[backfill] dry-run — 실제 쓰기 안 함");
    return;
  }

  console.log("[backfill] 기존 DiagnosisPartSet 삭제…");
  await prisma.diagnosisPartSet.deleteMany();

  console.log("[backfill] 티켓별 learnDiagnosisPartSet 호출…");
  let processed = 0;
  for (const t of tickets) {
    if (!setKeyByTicket.has(t.id)) continue;
    try {
      await prisma.$transaction(async (tx) => {
        await learnDiagnosisPartSet(tx, t.id);
      });
      processed++;
    } catch (e) {
      console.error(`[backfill] ${t.ticketNo} 처리 실패:`, e);
    }
  }
  console.log(`[backfill] ${processed}건 처리 완료`);

  const finalCount = await prisma.diagnosisPartSet.count();
  console.log(`[backfill] DiagnosisPartSet ${finalCount}건 (집계 후)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
