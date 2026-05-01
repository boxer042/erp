/**
 * 잔존 반품 교환 입고 + 원장 항목 정리 스크립트 (1회성)
 *
 * 배경: SupplierReturn이 reset-sales-data.ts로 삭제된 뒤, 그 반품의 교환
 *       입고로 만들어진 Incoming(IN260427-W5Y8)과 SupplierLedger의 REFUND
 *       항목이 잔존. 사용자가 반품을 재입력하기 전에 정리한다.
 *
 * 동작:
 *   1) Incoming "IN260427-W5Y8" 삭제 (items 비어있고 재고 영향 없음)
 *   2) referenceType="SUPPLIER_RETURN"이면서 referenceId가 더 이상 존재하지
 *      않는 SupplierLedger 항목(orphan REFUND) 전부 삭제
 *   3) 모든 supplier의 SupplierLedger를 date asc, createdAt asc 순으로 다시
 *      읽어 누적 잔액(balance)을 처음부터 재기록
 *
 * 실행: npx tsx --env-file=.env.local scripts/cleanup-orphan-return-data.ts [--dry-run] [--yes]
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@prisma/client";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const args = new Set(process.argv.slice(2));
const AUTO_YES = args.has("--yes");
const DRY_RUN = args.has("--dry-run");

const TARGET_INCOMING_NO = "IN260427-W5Y8";

function ensureNotProduction() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("production 환경에서는 실행할 수 없습니다.");
  }
  const url = (process.env.DATABASE_URL ?? "").toLowerCase();
  if (["prod", "production"].some((h) => url.includes(h))) {
    throw new Error("DATABASE_URL이 production처럼 보입니다.");
  }
}

async function confirmPrompt(): Promise<boolean> {
  if (AUTO_YES || DRY_RUN) return true;
  const rl = readline.createInterface({ input, output });
  const ans = await rl.question(
    "\n위 데이터를 삭제하고 거래처원장 잔액을 재계산합니다. 계속하려면 'yes' 입력: "
  );
  rl.close();
  return ans.trim().toLowerCase() === "yes";
}

async function printPreview() {
  const incoming = await prisma.incoming.findUnique({
    where: { incomingNo: TARGET_INCOMING_NO },
    include: { items: true },
  });

  const orphanLedgers = await prisma.$queryRaw<
    { id: string; supplier_id: string; description: string; reference_id: string }[]
  >(Prisma.sql`
    SELECT sl.id, sl.supplier_id, sl.description, sl.reference_id
    FROM supplier_ledgers sl
    WHERE sl.reference_type = 'SUPPLIER_RETURN'
      AND sl.reference_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM supplier_returns sr WHERE sr.id = sl.reference_id
      )
  `);

  const supplierCount = await prisma.supplier.count();

  console.log("\n=== 정리 대상 ===");
  console.log(`  Incoming(${TARGET_INCOMING_NO})         ${incoming ? "있음" : "없음"}`);
  if (incoming) {
    console.log(`    items                               ${incoming.items.length}`);
    console.log(`    memo                                ${incoming.memo ?? ""}`);
  }
  console.log(`  Orphan SupplierLedger(SUPPLIER_RETURN) ${orphanLedgers.length}`);
  for (const l of orphanLedgers) {
    console.log(`    - ${l.description}  (sup=${l.supplier_id.slice(0, 8)}…)`);
  }
  console.log(`  잔액 재계산 대상 supplier               ${supplierCount}`);

  return { incoming, orphanLedgers };
}

async function recalcAllBalances(tx: Prisma.TransactionClient) {
  const suppliers = await tx.supplier.findMany({ select: { id: true } });
  let totalEntries = 0;
  let touchedSuppliers = 0;

  for (const { id: supplierId } of suppliers) {
    const entries = await tx.supplierLedger.findMany({
      where: { supplierId },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        debitAmount: true,
        creditAmount: true,
        balance: true,
      },
    });
    if (entries.length === 0) continue;

    let running = new Prisma.Decimal(0);
    const updates: Promise<unknown>[] = [];
    let changed = 0;
    for (const e of entries) {
      const next = running.plus(e.debitAmount).minus(e.creditAmount);
      if (!new Prisma.Decimal(e.balance).equals(next)) {
        changed++;
        updates.push(
          tx.supplierLedger.update({
            where: { id: e.id },
            data: { balance: next },
          })
        );
      }
      running = next;
    }
    if (updates.length) {
      await Promise.all(updates);
      touchedSuppliers++;
      totalEntries += changed;
    }
  }

  return { totalEntries, touchedSuppliers };
}

async function run() {
  ensureNotProduction();
  console.log(`모드: ${DRY_RUN ? "DRY-RUN" : "실행"}  자동승인: ${AUTO_YES}`);

  const { incoming, orphanLedgers } = await printPreview();

  if (!incoming && orphanLedgers.length === 0) {
    console.log("\n정리할 항목이 없습니다. 종료.");
    return;
  }

  if (!(await confirmPrompt())) {
    console.log("취소되었습니다.");
    return;
  }

  if (DRY_RUN) {
    console.log("\n[DRY-RUN] 실제 변경은 수행하지 않습니다.");
    return;
  }

  const result = await prisma.$transaction(
    async (tx) => {
      let deletedIncoming = 0;
      if (incoming) {
        await tx.incoming.delete({ where: { id: incoming.id } });
        deletedIncoming = 1;
      }

      const orphanIds = orphanLedgers.map((l) => l.id);
      const deletedLedgers = orphanIds.length
        ? (
            await tx.supplierLedger.deleteMany({
              where: { id: { in: orphanIds } },
            })
          ).count
        : 0;

      const { totalEntries, touchedSuppliers } = await recalcAllBalances(tx);

      return { deletedIncoming, deletedLedgers, totalEntries, touchedSuppliers };
    },
    { timeout: 120_000 }
  );

  console.log("\n=== 정리 완료 ===");
  console.log(`  삭제된 Incoming                        ${result.deletedIncoming}`);
  console.log(`  삭제된 orphan SupplierLedger           ${result.deletedLedgers}`);
  console.log(`  잔액 보정된 SupplierLedger row         ${result.totalEntries}`);
  console.log(`  잔액 재계산된 supplier 수              ${result.touchedSuppliers}`);
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
