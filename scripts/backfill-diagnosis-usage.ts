/**
 * 진단↔부속·공임 frequency 매핑 backfill — 1회성.
 *
 * Phase 3 도입 전에 만들어진 RepairTicket 은 부속·공임이 진단에 link 안 되어 있어
 * 추천 기능에 안 잡힘. 이 스크립트로 기존 데이터를 한 번에 backfill.
 *
 * 동작:
 *   1. diagnosisTemplateId 가 있는 모든 RepairTicket 순회
 *   2. 각 티켓의 (USED 상태) 부속 → DiagnosisPartUsage upsert (티켓당 productId 한 번만 카운트)
 *   3. 각 티켓의 공임 → DiagnosisLaborUsage upsert (티켓당 name 한 번만, 마지막 unitRate)
 *
 * 사용:
 *   npx tsx --env-file=.env.local scripts/backfill-diagnosis-usage.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-diagnosis-usage.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { prisma } from "../src/lib/prisma";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const tickets = await prisma.repairTicket.findMany({
    where: { diagnosisTemplateId: { not: null } },
    select: {
      id: true,
      ticketNo: true,
      diagnosisTemplateId: true,
      parts: {
        where: { status: "USED" },
        select: { productId: true },
      },
      labors: { select: { name: true, unitRate: true } },
    },
  });

  console.log(`[backfill] 진단 연결된 RepairTicket ${tickets.length}건`);

  // 집계: (diagnosisId, productId) → 등장 티켓 수
  const partCounts = new Map<
    string,
    { diagnosisId: string; productId: string; count: number }
  >();
  // 집계: (diagnosisId, laborName) → { count, lastUnitRate }
  const laborCounts = new Map<
    string,
    {
      diagnosisId: string;
      laborName: string;
      count: number;
      lastUnitRate: number;
    }
  >();

  for (const t of tickets) {
    const diagnosisId = t.diagnosisTemplateId!;

    // 부속 — 같은 productId 가 한 티켓에 여러 행이면 한 번만
    const uniqueProductIds = Array.from(
      new Set(t.parts.map((p) => p.productId)),
    );
    for (const productId of uniqueProductIds) {
      const key = `${diagnosisId}::${productId}`;
      const cur = partCounts.get(key);
      if (cur) cur.count++;
      else partCounts.set(key, { diagnosisId, productId, count: 1 });
    }

    // 공임 — 같은 name 한 번만
    const uniqueLabors = new Map<string, number>();
    for (const l of t.labors) {
      uniqueLabors.set(l.name, Number(l.unitRate));
    }
    for (const [laborName, unitRate] of uniqueLabors) {
      const key = `${diagnosisId}::${laborName}`;
      const cur = laborCounts.get(key);
      if (cur) {
        cur.count++;
        cur.lastUnitRate = unitRate; // 마지막 값으로 갱신
      } else {
        laborCounts.set(key, {
          diagnosisId,
          laborName,
          count: 1,
          lastUnitRate: unitRate,
        });
      }
    }
  }

  console.log(
    `[backfill] DiagnosisPartUsage upsert 대상: ${partCounts.size}건`,
  );
  console.log(
    `[backfill] DiagnosisLaborUsage upsert 대상: ${laborCounts.size}건`,
  );

  if (DRY_RUN) {
    console.log("[backfill] dry-run 모드 — 실제 쓰기 안 함");
    console.log("\n[부속 sample]");
    Array.from(partCounts.values())
      .slice(0, 5)
      .forEach((v) =>
        console.log(`  diag=${v.diagnosisId} product=${v.productId} count=${v.count}`),
      );
    console.log("\n[공임 sample]");
    Array.from(laborCounts.values())
      .slice(0, 5)
      .forEach((v) =>
        console.log(
          `  diag=${v.diagnosisId} labor=${v.laborName} rate=${v.lastUnitRate} count=${v.count}`,
        ),
      );
    return;
  }

  // 정책: 기존 DiagnosisPartUsage/LaborUsage 모두 삭제 후 재구축 (멱등 보장)
  // 새 hook 으로 이미 누적된 데이터가 있더라도 깨끗하게 정리.
  console.log("[backfill] 기존 usage 데이터 삭제…");
  await prisma.diagnosisPartUsage.deleteMany();
  await prisma.diagnosisLaborUsage.deleteMany();

  console.log("[backfill] DiagnosisPartUsage 재구축…");
  let partWritten = 0;
  for (const v of partCounts.values()) {
    await prisma.diagnosisPartUsage.create({
      data: {
        diagnosisId: v.diagnosisId,
        productId: v.productId,
        occurrenceCount: v.count,
      },
    });
    partWritten++;
  }
  console.log(`  → ${partWritten}건 작성`);

  console.log("[backfill] DiagnosisLaborUsage 재구축…");
  let laborWritten = 0;
  for (const v of laborCounts.values()) {
    await prisma.diagnosisLaborUsage.create({
      data: {
        diagnosisId: v.diagnosisId,
        laborName: v.laborName,
        unitRate: v.lastUnitRate,
        occurrenceCount: v.count,
      },
    });
    laborWritten++;
  }
  console.log(`  → ${laborWritten}건 작성`);

  console.log("[backfill] 완료");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
