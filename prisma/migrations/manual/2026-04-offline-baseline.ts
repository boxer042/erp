/**
 * 일회성 마이그레이션 — 오프라인을 베이스라인(channelId IS NULL)으로 격상
 *
 * 적용 대상:
 *   1. SalesChannel 에서 code = "OFFLINE" row 조회
 *   2. Order.channelId = OFFLINE_ID 인 모든 row → channelId = NULL
 *   3. (검증) 다른 모델(ChannelPricing, SellingCost, ChannelFee, ChannelCategoryMapping)에서 OFFLINE 참조 없음 확인
 *   4. SalesChannel OFFLINE row 삭제
 *
 * 사용법:
 *   - dry-run (영향 범위 확인): npx tsx prisma/migrations/manual/2026-04-offline-baseline.ts
 *   - 실제 실행: npx tsx prisma/migrations/manual/2026-04-offline-baseline.ts --apply
 *
 * 사전 조건:
 *   - prisma/schema.prisma 의 Order.channelId 가 nullable (String?) 로 이미 변경되어 있어야 함
 *   - prisma db push 또는 migrate dev 로 스키마 반영 후 실행
 *
 * 주의: 운영 DB 적용 전 백업 필수.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`\n=== 오프라인 베이스라인 마이그레이션 ${apply ? "(APPLY)" : "(DRY-RUN)"} ===\n`);

  // 1. OFFLINE 채널 조회
  const offline = await prisma.salesChannel.findFirst({
    where: { code: "OFFLINE" },
  });

  if (!offline) {
    console.log("✓ OFFLINE 채널이 이미 없습니다. 마이그레이션 불필요.");
    return;
  }

  console.log(`OFFLINE 채널 발견: id=${offline.id} name=${offline.name}`);

  // 2. 영향받을 Order 수 확인
  const orderCount = await prisma.order.count({
    where: { channelId: offline.id },
  });
  console.log(`  → 영향받을 Order: ${orderCount}건`);

  // 3. 다른 모델에서 OFFLINE 참조 검증
  const cpCount = await prisma.channelPricing.count({
    where: { channelId: offline.id },
  });
  const scCount = await prisma.sellingCost.count({
    where: { channelId: offline.id },
  });
  const cfCount = await prisma.channelFee.count({
    where: { channelId: offline.id },
  });
  const ccmCount = await prisma.channelCategoryMapping.count({
    where: { channelId: offline.id },
  });
  console.log(`  → ChannelPricing 참조: ${cpCount}`);
  console.log(`  → SellingCost 참조: ${scCount}`);
  console.log(`  → ChannelFee 참조: ${cfCount}`);
  console.log(`  → ChannelCategoryMapping 참조: ${ccmCount}`);

  if (cpCount + scCount + cfCount + ccmCount > 0) {
    console.error(
      "\n❌ 오프라인 채널을 참조하는 다른 row 가 있습니다. " +
        "이들은 외부 채널 전용이라 OFFLINE 참조면 데이터 오류일 가능성. 수동 확인 필요.",
    );
    return;
  }

  if (!apply) {
    console.log("\n[DRY-RUN] 실제 적용하려면 --apply 플래그를 추가하세요.");
    return;
  }

  // 4. 실제 적용
  console.log("\n적용 중...");

  await prisma.$transaction(async (tx) => {
    if (orderCount > 0) {
      const updated = await tx.order.updateMany({
        where: { channelId: offline.id },
        data: { channelId: null },
      });
      console.log(`  ✓ Order ${updated.count}건 channelId NULL 처리`);
    }

    await tx.salesChannel.delete({ where: { id: offline.id } });
    console.log(`  ✓ SalesChannel OFFLINE row 삭제`);
  });

  console.log("\n✓ 마이그레이션 완료\n");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
