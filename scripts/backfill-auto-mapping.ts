/**
 * 자동 매핑 백필 — 매핑 없는 SupplierProduct에 자동 Product/Mapping 생성.
 *
 * 사용:
 *   npx tsx --env-file=.env.local scripts/backfill-auto-mapping.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-auto-mapping.ts
 *
 * 동작:
 *   1. productMappings.length === 0 인 active SupplierProduct 조회
 *   2. --dry-run: 카운트 + 샘플 10건 출력 후 종료
 *   3. 본실행: SP 1건 단위 트랜잭션
 *      - createAutoMappedProductForSupplierProduct
 *      - productMapping.create(conversionRate=1)
 *      - reconcileOrphanLotsForMapping (해당 SP의 orphan lot 흡수 + Inventory 보정)
 *   4. 진행 10건마다 console.log. 1건 실패 시 그 SP만 skip(전체 롤백 X)
 */
import { prisma } from "../src/lib/prisma";
import {
  createAutoMappedProductForSupplierProduct,
  reconcileOrphanLotsForMapping,
} from "../src/lib/mapping-helpers";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const targets = await prisma.supplierProduct.findMany({
    where: {
      isActive: true,
      productMappings: { none: {} },
    },
    select: {
      id: true,
      name: true,
      spec: true,
      unitOfMeasure: true,
      listPrice: true,
      supplier: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`매핑 없는 active SupplierProduct: ${targets.length}건`);
  if (targets.length === 0) {
    console.log("처리할 항목 없음");
    return;
  }

  console.log("샘플 10건:");
  for (const sp of targets.slice(0, 10)) {
    console.log(`  - [${sp.supplier?.name ?? "?"}] ${sp.name}`);
  }

  if (dryRun) {
    console.log("\n--dry-run: 변경 없이 종료. 본실행은 --dry-run 빼고 다시 실행.");
    return;
  }

  console.log("\n본실행 시작...");
  let success = 0;
  let failed = 0;
  for (let i = 0; i < targets.length; i++) {
    const sp = targets[i];
    try {
      await prisma.$transaction(async (tx) => {
        const { productId } = await createAutoMappedProductForSupplierProduct(tx, sp);
        const mapping = await tx.productMapping.create({
          data: { supplierProductId: sp.id, productId, conversionRate: 1 },
          select: { id: true },
        });
        await reconcileOrphanLotsForMapping(tx, {
          supplierProductId: sp.id,
          productId,
          conversionRate: 1,
          referenceId: mapping.id,
        });
      }, { timeout: 30000, maxWait: 10000 });
      success++;
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  실패 [${sp.id}] ${sp.name}: ${msg}`);
    }
    if ((i + 1) % 10 === 0) {
      console.log(`  진행 ${i + 1}/${targets.length} (성공 ${success}, 실패 ${failed})`);
    }
  }

  console.log(`\n완료: 성공 ${success}, 실패 ${failed} / 전체 ${targets.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
