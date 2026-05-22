/**
 * 1회성 정리 — 자동 매핑(autoMapped=true) 상품 중 listPrice 가 거래처 매입
 * 정가(=원가) 로 잘못 복사된 데이터 청소.
 *
 * createAutoMappedProductForSupplierProduct (fix: 8298512) 이전엔
 * `listPrice: sp.listPrice` 로 매입 정가를 그대로 복사했음. 이제는 default 0
 * 으로 두지만, 그 이전에 만들어진 상품은 listPrice 가 채워져 있음.
 *
 * 대상: autoMapped=true AND sellingPrice=0 AND listPrice>0
 *   - sellingPrice=0 조건으로 "아직 운영자가 가격 검토 안 한" 상품만 처리
 *   - 검토 완료 후 직접 가격 설정한 케이스(sellingPrice>0)는 건드리지 않음
 *
 * 기본 DRY RUN. 실제 적용은 --apply.
 *
 * 실행:
 *   node --env-file=.env tsx scripts/cleanup-automapped-listprice.ts
 *   node --env-file=.env.prod tsx scripts/cleanup-automapped-listprice.ts --apply
 */
import { prisma } from "@/lib/prisma";

async function main() {
  const apply = process.argv.includes("--apply");
  const where = {
    autoMapped: true,
    sellingPrice: 0,
    listPrice: { gt: 0 },
  } as const;
  const before = await prisma.product.count({ where });
  console.log(`[count] 영향 받는 자동매핑 상품 = ${before}`);
  if (before === 0) {
    console.log("정리할 행 없음");
    return;
  }
  if (!apply) {
    console.log("DRY RUN — 실제 적용은 --apply 플래그 추가");
    const sample = await prisma.product.findMany({
      where,
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        sku: true,
        name: true,
        listPrice: true,
        sellingPrice: true,
        createdAt: true,
      },
    });
    console.log("샘플 (최근 5건):");
    for (const s of sample) {
      console.log(
        `  ${s.createdAt.toISOString()} ${s.sku} "${s.name}" listPrice=${s.listPrice} sellingPrice=${s.sellingPrice}`,
      );
    }
    return;
  }
  const { count } = await prisma.product.updateMany({
    where,
    data: { listPrice: 0 },
  });
  console.log(`[updated] ${count} (listPrice → 0)`);
  const after = await prisma.product.count({ where });
  console.log(`[after] 영향 받는 행 = ${after}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
