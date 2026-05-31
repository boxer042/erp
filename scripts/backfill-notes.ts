/**
 * 업무 노트 백필 — 기존 인라인 메모(고객·거래처·입고·결제)를 source 연결 Note 로 복사.
 * 옛 메모를 "업무 노트" 허브(/notes)에서도 보이게 한다 (요구사항 3). 원본 컬럼은 건드리지 않음(추가만).
 * 멱등: 동일 sourceType+sourceId+content 노트가 이미 있으면 건너뜀 → 재실행 안전.
 *
 * 실행:
 *   미리보기(쓰기 안 함): npx tsx --env-file=.env.local scripts/backfill-notes.ts
 *   실제 반영:           npx tsx --env-file=.env.local scripts/backfill-notes.ts --commit
 *
 * 설계: docs/NOTES_SYSTEM.md (Phase 1).
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const COMMIT = process.argv.includes("--commit");

type SourceType = "CUSTOMER" | "SUPPLIER" | "INCOMING" | "PAYMENT";
interface Pending {
  sourceType: SourceType;
  sourceId: string;
  sourceLabel: string;
  content: string;
  createdById: string;
  createdAt?: Date;
}

function clean(s: string | null | undefined): string | null {
  const t = (s ?? "").trim();
  return t.length > 0 ? t : null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  console.log(`[backfill-notes] ${COMMIT ? "COMMIT" : "DRY RUN"}`);

  const fallback =
    (await prisma.user.findFirst({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    })) ?? (await prisma.user.findFirst({ select: { id: true } }));
  if (!fallback) throw new Error("사용자가 없습니다 — createdById 폴백 불가");

  const pending: Pending[] = [];
  const counts: Record<string, number> = {};
  const add = (p: Pending) => {
    pending.push(p);
    counts[p.sourceType] = (counts[p.sourceType] ?? 0) + 1;
  };

  // 고객 (createdBy 없음 → 폴백 ADMIN)
  for (const c of await prisma.customer.findMany({
    where: { isActive: true, memo: { not: null } },
    select: { id: true, name: true, memo: true },
  })) {
    const content = clean(c.memo);
    if (content)
      add({ sourceType: "CUSTOMER", sourceId: c.id, sourceLabel: c.name, content, createdById: fallback.id });
  }

  // 거래처 (createdBy 없음 → 폴백 ADMIN)
  for (const s of await prisma.supplier.findMany({
    where: { isActive: true, memo: { not: null } },
    select: { id: true, name: true, memo: true },
  })) {
    const content = clean(s.memo);
    if (content)
      add({ sourceType: "SUPPLIER", sourceId: s.id, sourceLabel: s.name, content, createdById: fallback.id });
  }

  // 입고
  for (const i of await prisma.incoming.findMany({
    where: { memo: { not: null } },
    select: { id: true, incomingNo: true, memo: true, createdById: true },
  })) {
    const content = clean(i.memo);
    if (content)
      add({ sourceType: "INCOMING", sourceId: i.id, sourceLabel: i.incomingNo, content, createdById: i.createdById });
  }

  // 공급사 결제
  for (const p of await prisma.supplierPayment.findMany({
    where: { memo: { not: null } },
    select: { id: true, memo: true, createdById: true, supplier: { select: { name: true } } },
  })) {
    const content = clean(p.memo);
    if (content)
      add({ sourceType: "PAYMENT", sourceId: p.id, sourceLabel: `공급사 결제 · ${p.supplier.name}`, content, createdById: p.createdById });
  }

  // 고객 수금
  for (const p of await prisma.customerPayment.findMany({
    where: { memo: { not: null } },
    select: { id: true, memo: true, createdById: true, customer: { select: { name: true } } },
  })) {
    const content = clean(p.memo);
    if (content)
      add({ sourceType: "PAYMENT", sourceId: p.id, sourceLabel: `수금 · ${p.customer.name}`, content, createdById: p.createdById });
  }

  // 고객 노트 (CustomerNote → Note 흡수, 작성시각·작성자 보존)
  for (const n of await prisma.customerNote.findMany({
    select: {
      customerId: true,
      content: true,
      createdById: true,
      createdAt: true,
      customer: { select: { name: true } },
    },
  })) {
    const content = clean(n.content);
    if (content)
      add({
        sourceType: "CUSTOMER",
        sourceId: n.customerId,
        sourceLabel: n.customer.name,
        content,
        createdById: n.createdById,
        createdAt: n.createdAt,
      });
  }

  // 멱등 — 이미 존재하는 source-linked 노트 제외
  const existing = await prisma.note.findMany({
    where: { sourceType: { not: null } },
    select: { sourceType: true, sourceId: true, content: true },
  });
  const seen = new Set(existing.map((e) => `${e.sourceType}|${e.sourceId}|${e.content}`));
  const toCreate = pending.filter((p) => !seen.has(`${p.sourceType}|${p.sourceId}|${p.content}`));
  const skipped = pending.length - toCreate.length;

  console.log("  도메인별 대상:", counts);
  console.log(`  총 ${pending.length}건 · 신규 ${toCreate.length}건 · 중복 건너뜀 ${skipped}건`);
  for (const p of toCreate.slice(0, 5))
    console.log(`   샘플 [${p.sourceType}] ${p.sourceLabel}: ${p.content.slice(0, 40)}`);

  if (!COMMIT) {
    console.log("DRY RUN — 쓰기 없음. 실제 반영은 --commit 플래그를 붙여 재실행.");
    return;
  }
  if (toCreate.length === 0) {
    console.log("생성할 항목 없음.");
    return;
  }
  // 개별 create 루프(50개씩 병렬) — createMany 와 달리 createdAt(작성시각) override 를 확실히 보존.
  let created = 0;
  for (const batch of chunk(toCreate, 50)) {
    await Promise.all(
      batch.map((p) =>
        prisma.note.create({
          data: {
            kind: "MEMO",
            content: p.content,
            sourceType: p.sourceType,
            sourceId: p.sourceId,
            sourceLabel: p.sourceLabel,
            createdById: p.createdById,
            ...(p.createdAt ? { createdAt: p.createdAt } : {}),
          },
        }),
      ),
    );
    created += batch.length;
  }
  console.log(`  생성 완료: ${created}건`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
