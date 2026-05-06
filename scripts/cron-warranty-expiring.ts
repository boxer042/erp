/**
 * 수리 보증 만료 임박 알림 — D-30/D-7/D-0 / 만료 1주 후까지의 PICKED_UP 티켓 일괄 보고.
 * 실행: npx tsx scripts/cron-warranty-expiring.ts
 *
 * 권장: 매주 월요일 09:00 cron
 *   0 9 * * 1 cd /path/to/erp && npx tsx scripts/cron-warranty-expiring.ts >> /var/log/warranty-expiring.log 2>&1
 *
 * 출력: stdout 으로 JSON-Lines (운영자가 슬랙/이메일 등으로 라우팅 가능).
 * 실제 외부 알림(SMS/카카오) 발송은 별도 통합 필요.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as dotenv } from "dotenv";

dotenv({ path: ".env.local" });
dotenv({ path: ".env" });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // 30일 후까지 임박 + 7일 전부터 만료 (이미 만료지만 알림 가치 있음)
  const horizon = new Date(todayStart.getTime() + 30 * 86400000);
  const expiredFrom = new Date(todayStart.getTime() - 7 * 86400000);

  const tickets = await prisma.repairTicket.findMany({
    where: {
      status: "PICKED_UP",
      repairWarrantyEnds: {
        not: null,
        gte: expiredFrom,
        lte: horizon,
      },
    },
    select: {
      id: true,
      ticketNo: true,
      pickedUpAt: true,
      repairWarrantyEnds: true,
      finalAmount: true,
      customer: {
        select: { id: true, name: true, phone: true, type: true },
      },
      repairProduct: { select: { name: true, sku: true } },
      repairProductText: true,
    },
    orderBy: { repairWarrantyEnds: "asc" },
  });

  if (tickets.length === 0) {
    console.log(JSON.stringify({ at: now.toISOString(), count: 0, items: [] }));
    return;
  }

  const items = tickets.map((t) => {
    const ends = t.repairWarrantyEnds!;
    const diffDays = Math.floor(
      (ends.getTime() - todayStart.getTime()) / 86400000,
    );
    return {
      ticketId: t.id,
      ticketNo: t.ticketNo,
      customerId: t.customer?.id ?? null,
      customerName: t.customer?.name ?? null,
      customerPhone: t.customer?.phone ?? null,
      customerType: t.customer?.type ?? null,
      product: t.repairProduct?.name ?? t.repairProductText ?? null,
      sku: t.repairProduct?.sku ?? null,
      pickedUpAt: t.pickedUpAt?.toISOString() ?? null,
      warrantyEnds: ends.toISOString(),
      daysLeft: diffDays,
      isExpired: diffDays < 0,
      bucket:
        diffDays < 0 ? "EXPIRED" : diffDays <= 7 ? "D7" : diffDays <= 30 ? "D30" : "FUTURE",
      finalAmount: Number(t.finalAmount),
    };
  });

  // 버킷별 카운트 — stdout 첫 줄에 요약
  const summary = {
    at: now.toISOString(),
    total: items.length,
    expired: items.filter((i) => i.bucket === "EXPIRED").length,
    d7: items.filter((i) => i.bucket === "D7").length,
    d30: items.filter((i) => i.bucket === "D30").length,
  };
  console.log(JSON.stringify(summary));

  // JSON-Lines — 한 라인당 한 티켓
  for (const it of items) {
    console.log(JSON.stringify(it));
  }
}

main()
  .catch((e) => {
    console.error("❌ warranty-expiring 실패:", e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
