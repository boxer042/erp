/**
 * 분할 송장 도입 backfill 스크립트.
 *
 * 기존 데이터 처리:
 *   - SHIPPED/COMPLETED/RETURN_*  주문 중 trackingCarrier 또는 trackingNumber 가 있고
 *     Shipment 가 0건인 주문에 대해
 *   - shipmentNo=1 으로 Shipment 1건 생성
 *   - 발송된 모든 OrderItem 의 shippedQty 만큼 ShipmentItem 생성 (전량 한 박스로 보낸 것으로 간주)
 *
 * 멱등성: 이미 Shipment 가 1건이라도 있으면 skip.
 *
 * 실행:
 *   npx tsx scripts/backfill-shipments.ts          (dry run — 대상만 출력)
 *   npx tsx scripts/backfill-shipments.ts --apply  (실제 생성)
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const SHIPPED_LIKE = [
  "SHIPPED",
  "COMPLETED",
  "RETURN_REQUESTED",
  "RETURN_ACCEPTED",
  "RETURN_COLLECTED",
  "RETURN_INSPECTED",
  "RETURNED",
  "EXCHANGED",
] as const;

async function main() {
  console.log(`[backfill-shipments] ${APPLY ? "APPLY" : "DRY RUN"} 모드`);

  // 발송 이력이 있을 가능성이 있는 주문 조회
  const candidates = await prisma.order.findMany({
    where: {
      status: { in: SHIPPED_LIKE as unknown as string[] as never },
      OR: [
        { trackingCarrier: { not: null } },
        { trackingNumber: { not: null } },
      ],
    },
    select: {
      id: true,
      orderNo: true,
      trackingCarrier: true,
      trackingNumber: true,
      shipmentCount: true,
      updatedAt: true,
      items: { select: { id: true, shippedQty: true, quantity: true } },
      _count: { select: { shipments: true } },
    },
  });

  let willCreate = 0;
  let skipExisting = 0;
  let skipNoShipped = 0;

  for (const o of candidates) {
    if (o._count.shipments > 0) {
      skipExisting += 1;
      continue;
    }
    const shippedItems = o.items.filter((it) => Number(it.shippedQty) > 0);
    if (shippedItems.length === 0) {
      skipNoShipped += 1;
      continue;
    }
    willCreate += 1;
    console.log(
      `  ${o.orderNo} → 1차 발송 (송장: ${o.trackingCarrier ?? "?"} ${
        o.trackingNumber ?? "?"
      }) · ${shippedItems.length} 라인`,
    );
    if (APPLY) {
      await prisma.shipment.create({
        data: {
          orderId: o.id,
          shipmentNo: 1,
          trackingCarrier: o.trackingCarrier,
          trackingNumber: o.trackingNumber,
          shippedAt: o.updatedAt, // 정확한 발송 시점 모름 → updatedAt 으로 근사
          memo: "backfill — 분할 송장 도입 전 기존 발송",
          items: {
            create: shippedItems.map((it) => ({
              orderItemId: it.id,
              quantity: it.shippedQty,
            })),
          },
        },
      });
    }
  }

  console.log(`\n[backfill-shipments] 요약`);
  console.log(`  대상 주문 (스캔): ${candidates.length}`);
  console.log(`  생성 ${APPLY ? "완료" : "예정"}: ${willCreate}`);
  console.log(`  skip (이미 Shipment 있음): ${skipExisting}`);
  console.log(`  skip (shippedQty 모두 0): ${skipNoShipped}`);

  if (!APPLY) {
    console.log(`\n  → 실제 적용: npx tsx scripts/backfill-shipments.ts --apply`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
