/**
 * 기존 taxType=ZERO_RATE 상품을 신모델로 마이그레이션:
 *   taxType=ZERO_RATE → taxType=TAXABLE + zeroRateEligible=true
 *
 * 이유: "모든 상품이 과세, 일부만 조건부 영세율 가능"이라는 운영 모델에 맞춰
 *      ZERO_RATE 카테고리를 boolean 자격 플래그로 분리했음.
 *
 * 사용법:
 *   npx tsx --env-file=.env.local    scripts/migrate-zero-rate-to-eligible.ts          (scan)
 *   npx tsx --env-file=.env.local    scripts/migrate-zero-rate-to-eligible.ts --fix    (apply)
 *   npx tsx --env-file=.env.prod.tmp scripts/migrate-zero-rate-to-eligible.ts          (prod scan)
 *   npx tsx --env-file=.env.prod.tmp scripts/migrate-zero-rate-to-eligible.ts --fix    (prod apply)
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--fix");

async function main() {
  // 1. zero_rate_eligible 컬럼이 없으면 추가 (운영에 컬럼이 아직 없을 수 있음)
  const colCheck = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'products' AND column_name = 'zero_rate_eligible'
    ) as exists
  `;
  const colExists = colCheck[0]?.exists ?? false;
  if (!colExists) {
    if (!APPLY) {
      console.log("[scan] zero_rate_eligible 컬럼 없음 — --fix 시 자동 추가됩니다.");
    } else {
      console.log("zero_rate_eligible 컬럼 추가 중...");
      await prisma.$executeRawUnsafe(
        `ALTER TABLE products ADD COLUMN zero_rate_eligible BOOLEAN NOT NULL DEFAULT false`,
      );
      console.log("  ✓ 컬럼 추가 완료");
    }
  }

  // 2. ZERO_RATE 행 조회 (raw query — enum 정의는 그대로 두고 텍스트 캐스트로 안전 조회)
  const selectColumns = colExists
    ? `id, sku, name, tax_type::text as tax_type, zero_rate_eligible`
    : `id, sku, name, tax_type::text as tax_type, false::boolean as zero_rate_eligible`;
  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; sku: string; name: string; tax_type: string; zero_rate_eligible: boolean }>
  >(`SELECT ${selectColumns} FROM products WHERE tax_type::text = 'ZERO_RATE'`);

  console.log(`\n=== ZERO_RATE 상품: ${rows.length} 건 ===\n`);
  for (const r of rows) {
    console.log(
      `  ${r.sku.padEnd(20)} ${r.name.slice(0, 40).padEnd(40)} (zeroRateEligible=${r.zero_rate_eligible})`,
    );
  }

  if (rows.length === 0) {
    console.log("\n  마이그레이션 대상 없음.\n");
    return;
  }

  if (!APPLY) {
    console.log("\n[scan only] --fix 플래그로 실제 적용\n");
    return;
  }

  console.log(`\n=== 적용 (${rows.length} 건) ===\n`);
  // 단일 트랜잭션으로 일괄 업데이트
  const result = await prisma.$executeRaw`
    UPDATE products
    SET tax_type = 'TAXABLE'::"TaxType",
        zero_rate_eligible = true
    WHERE tax_type::text = 'ZERO_RATE'
  `;
  console.log(`  적용된 행: ${result}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
