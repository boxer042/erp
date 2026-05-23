/**
 * 기존 상품 일괄 ack — acknowledgedUnitCost = 현재 computed unitCost.
 *
 * 마이그레이션 직후 모든 상품에 원가 변동 배지가 한 번에 뜨는 걸 방지 (= "지금까지의 변동은 다 인지한 것으로 간주").
 *
 * 사용:
 *   npx tsx scripts/backfill-acknowledged-unit-cost.ts
 */
import { prisma } from "@/lib/prisma";
import { computeCurrentUnitCostForId } from "@/lib/product-cost";

async function main() {
  const products = await prisma.product.findMany({
    where: { isActive: true, acknowledgedUnitCost: null },
    select: { id: true, name: true, sku: true },
  });

  console.log(`총 ${products.length} 건 처리 시작`);

  let updated = 0;
  let skipped = 0;
  const now = new Date();

  for (const p of products) {
    const cost = await computeCurrentUnitCostForId(prisma, p.id);
    if (cost === null) {
      skipped += 1;
      continue;
    }
    await prisma.product.update({
      where: { id: p.id },
      data: { acknowledgedUnitCost: cost, acknowledgedAt: now },
    });
    updated += 1;
    if (updated % 50 === 0) console.log(`  ... ${updated} 건 처리됨`);
  }

  console.log(`완료 — 적용 ${updated} 건, 매핑 없음/스킵 ${skipped} 건`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
