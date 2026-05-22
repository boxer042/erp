/**
 * 1회성 정리 — ProductPriceHistory 에 oldPrice=0 으로 잘못 쌓인 "첫 가격 입력"
 * 이력을 삭제. 자동매핑 상품 등 listPrice/sellingPrice 가 0 인 상태에서 첫
 * 가격을 입력하면 "0 → X 상승" 으로 잡히던 버그(fix: 2e31f07) 의 데이터 청소.
 *
 * 기본은 DRY RUN — 영향 건수만 출력하고 종료. 실제 삭제는 --apply 플래그 명시.
 *
 * 실행 (dry run — count only):
 *   node --env-file=.env tsx scripts/cleanup-price-history-zero.ts
 *   node --env-file=.env.prod tsx scripts/cleanup-price-history-zero.ts
 *
 * 실제 삭제:
 *   node --env-file=.env tsx scripts/cleanup-price-history-zero.ts --apply
 *   node --env-file=.env.prod tsx scripts/cleanup-price-history-zero.ts --apply
 */
import { prisma } from "@/lib/prisma";

async function main() {
  const apply = process.argv.includes("--apply");
  const before = await prisma.productPriceHistory.count({ where: { oldPrice: 0 } });
  console.log(`[count] oldPrice=0 영향 받는 row = ${before}`);
  if (before === 0) {
    console.log("정리할 행 없음");
    return;
  }
  if (!apply) {
    console.log("DRY RUN — 실제 삭제하려면 --apply 플래그 추가");
    // 샘플 5건 미리보기
    const sample = await prisma.productPriceHistory.findMany({
      where: { oldPrice: 0 },
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        productId: true,
        field: true,
        oldPrice: true,
        newPrice: true,
        createdAt: true,
      },
    });
    console.log("샘플 (최근 5건):");
    for (const s of sample) {
      console.log(
        `  ${s.createdAt.toISOString()} ${s.field} ${s.oldPrice} → ${s.newPrice} (product=${s.productId})`,
      );
    }
    return;
  }
  const { count } = await prisma.productPriceHistory.deleteMany({
    where: { oldPrice: 0 },
  });
  console.log(`[deleted] ${count}`);
  const after = await prisma.productPriceHistory.count({ where: { oldPrice: 0 } });
  console.log(`[after] oldPrice=0 row count = ${after}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
