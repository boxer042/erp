/**
 * TaxType enum 에서 ZERO_RATE 값을 제거.
 *
 * 전제: 모든 ZERO_RATE 행이 이미 TAXABLE+zeroRateEligible 로 마이그레이션 완료된 상태.
 *      (migrate-zero-rate-to-eligible.ts --fix 선행)
 *
 * 동작: enum 재생성 — 새 enum 만들고 컬럼 캐스팅 후 옛 enum drop.
 *
 * 사용법:
 *   npx tsx --env-file=.env.prod.tmp scripts/drop-zero-rate-enum.ts          (scan)
 *   npx tsx --env-file=.env.prod.tmp scripts/drop-zero-rate-enum.ts --fix    (apply)
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--fix");

async function main() {
  // 1. 안전 검증: ZERO_RATE 행이 0 이어야 함
  const remain = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint as count FROM products WHERE tax_type::text = 'ZERO_RATE'
  `;
  const cnt = Number(remain[0]?.count ?? 0);
  if (cnt > 0) {
    console.error(
      `❌ ZERO_RATE 데이터 ${cnt} 건 남아있음. 먼저 migrate-zero-rate-to-eligible.ts --fix 실행 필요.`,
    );
    process.exit(1);
  }
  console.log("✓ ZERO_RATE 행 0 건 확인");

  // 2. enum 정의에서 ZERO_RATE 가 아직 살아있는지 확인
  const enumValues = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
    SELECT e.enumlabel
    FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'TaxType'
    ORDER BY e.enumsortorder
  `;
  const labels = enumValues.map((r) => r.enumlabel);
  console.log(`현재 TaxType enum 값: [${labels.join(", ")}]`);

  if (!labels.includes("ZERO_RATE")) {
    console.log("✓ ZERO_RATE 가 이미 enum 에 없음. 정리 작업 불필요.");
    return;
  }

  if (!APPLY) {
    console.log("\n[scan only] --fix 플래그로 enum 재생성 적용");
    return;
  }

  console.log("\n=== enum 재생성 시작 ===");

  // 3. enum 재생성: 옛 → 임시 이름 → 새 enum 생성 → 컬럼 캐스팅 → 옛 drop
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`ALTER TYPE "TaxType" RENAME TO "TaxType_old"`);
    await tx.$executeRawUnsafe(`CREATE TYPE "TaxType" AS ENUM ('TAXABLE', 'TAX_FREE')`);
    await tx.$executeRawUnsafe(
      `ALTER TABLE products ALTER COLUMN tax_type DROP DEFAULT`,
    );
    await tx.$executeRawUnsafe(
      `ALTER TABLE products ALTER COLUMN tax_type TYPE "TaxType" USING tax_type::text::"TaxType"`,
    );
    await tx.$executeRawUnsafe(
      `ALTER TABLE products ALTER COLUMN tax_type SET DEFAULT 'TAXABLE'::"TaxType"`,
    );
    await tx.$executeRawUnsafe(`DROP TYPE "TaxType_old"`);
  });

  console.log("✓ enum 재생성 완료");

  // 4. 검증
  const after = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
    SELECT e.enumlabel
    FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'TaxType'
    ORDER BY e.enumsortorder
  `;
  console.log(`정리 후 TaxType enum 값: [${after.map((r) => r.enumlabel).join(", ")}]`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
