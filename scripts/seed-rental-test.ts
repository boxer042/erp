// 임대관리 테스트 데이터 생성 — 고객 5명 + RentalAsset 5대 + 다양한 상태 Rental 7건.
// 시나리오:
//   - ACTIVE 2건 (정상 진행, 정상 진행 곧 만료)
//   - OVERDUE 1건 (반납일 지남)
//   - RESERVED 오늘 픽업 1건 (오늘 픽업 예약 섹션)
//   - RESERVED 다음주 픽업 2건 (점유 검사 시각화 + 충돌 테스트용)
//   - RETURNED 1건 (대시보드 안 나타남, 점유 검사 무시되는지 확인용)
//
// 실행: npx tsx scripts/seed-rental-test.ts
// 옵션: --wipe — 기존 테스트 데이터 (rentalNo prefix RNTSEED-, customerName prefix "테스트:") 먼저 삭제
//
// 멱등성: 같은 자산명/고객명 prefix 검사로 중복 방지. 여러 번 실행해도 안전.

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as dotenv } from "dotenv";

dotenv({ path: ".env.local" });
dotenv({ path: ".env" });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const SEED_TAG = "테스트:";
const ASSET_TAG = "[테스트]";
const RENTAL_NO_PREFIX = "RNTSEED-";

const wipe = process.argv.includes("--wipe");

function daysFromNow(d: number): Date {
  const x = new Date();
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() + d);
  return x;
}

function rentalNo(suffix: string): string {
  return `${RENTAL_NO_PREFIX}${suffix}`;
}

async function ensureUser() {
  // 기존 어떤 user 든 하나 잡아 createdById 로 사용
  const u = await prisma.user.findFirst({ select: { id: true, email: true } });
  if (!u) throw new Error("유저가 없음 — 먼저 로그인해 첫 user 생성 필요");
  return u;
}

async function wipeOld() {
  console.log("[wipe] 기존 테스트 데이터 삭제 중...");

  // Rental — RNTSEED- prefix
  const seedRentals = await prisma.rental.findMany({
    where: { rentalNo: { startsWith: RENTAL_NO_PREFIX } },
    select: { id: true, assetId: true },
  });
  const rentalIds = seedRentals.map((r) => r.id);
  const usedAssetIds = Array.from(new Set(seedRentals.map((r) => r.assetId)));

  await prisma.customerLedger.deleteMany({
    where: { referenceType: "RENTAL", referenceId: { in: rentalIds } },
  });
  await prisma.rental.deleteMany({ where: { id: { in: rentalIds } } });
  // 자산 status 복구 (사용중이었다면 AVAILABLE 로)
  if (usedAssetIds.length > 0) {
    await prisma.rentalAsset.updateMany({
      where: { id: { in: usedAssetIds } },
      data: { status: "AVAILABLE" },
    });
  }

  // RentalAsset — [테스트] prefix
  await prisma.rentalAsset.deleteMany({
    where: { name: { startsWith: ASSET_TAG } },
  });

  // Customer — 테스트: prefix
  await prisma.customer.deleteMany({
    where: { name: { startsWith: SEED_TAG } },
  });

  console.log("[wipe] 완료");
}

async function seedCustomers() {
  const data = [
    { name: `${SEED_TAG} 김민준`, phone: "010-1111-0001" },
    { name: `${SEED_TAG} 이서연`, phone: "010-1111-0002" },
    { name: `${SEED_TAG} 박지훈`, phone: "010-1111-0003" },
    { name: `${SEED_TAG} 최수아`, phone: "010-1111-0004" },
    { name: `${SEED_TAG} 정도현`, phone: "010-1111-0005" },
  ];
  const customers: { id: string; name: string }[] = [];
  for (const d of data) {
    const existing = await prisma.customer.findFirst({
      where: { name: d.name },
      select: { id: true, name: true },
    });
    if (existing) {
      customers.push(existing);
    } else {
      const c = await prisma.customer.create({
        data: { ...d, isActive: true },
        select: { id: true, name: true },
      });
      customers.push(c);
      console.log(`[customer] ${c.name} 생성`);
    }
  }
  return customers;
}

async function seedAssets() {
  const data = [
    { name: `${ASSET_TAG} 콤프레서 A`, dailyRate: 30000, depositAmount: 100000 },
    { name: `${ASSET_TAG} 콤프레서 B`, dailyRate: 30000, depositAmount: 100000 },
    { name: `${ASSET_TAG} 고압세척기`, dailyRate: 25000, depositAmount: 80000 },
    { name: `${ASSET_TAG} 발전기 5kW`, dailyRate: 50000, depositAmount: 200000 },
    { name: `${ASSET_TAG} 진공청소기`, dailyRate: 15000, depositAmount: 50000 },
  ];
  const assets: {
    id: string;
    assetNo: string;
    name: string;
    dailyRate: string;
    depositAmount: string;
  }[] = [];
  for (const d of data) {
    const existing = await prisma.rentalAsset.findFirst({
      where: { name: d.name },
      select: {
        id: true,
        assetNo: true,
        name: true,
        dailyRate: true,
        depositAmount: true,
      },
    });
    if (existing) {
      assets.push({
        id: existing.id,
        assetNo: existing.assetNo,
        name: existing.name,
        dailyRate: String(existing.dailyRate),
        depositAmount: String(existing.depositAmount),
      });
    } else {
      const r = Math.random().toString(36).substring(2, 8).toUpperCase();
      const a = await prisma.rentalAsset.create({
        data: {
          assetNo: `RA-SEED-${r}`,
          name: d.name,
          dailyRate: d.dailyRate,
          monthlyRate: d.dailyRate * 25,
          depositAmount: d.depositAmount,
          status: "AVAILABLE",
          isActive: true,
        },
        select: {
          id: true,
          assetNo: true,
          name: true,
          dailyRate: true,
          depositAmount: true,
        },
      });
      assets.push({
        id: a.id,
        assetNo: a.assetNo,
        name: a.name,
        dailyRate: String(a.dailyRate),
        depositAmount: String(a.depositAmount),
      });
      console.log(`[asset] ${a.name} 생성 (${a.assetNo})`);
    }
  }
  return assets;
}

interface RentalSeed {
  no: string;
  status: "ACTIVE" | "RESERVED" | "OVERDUE" | "RETURNED";
  assetIdx: number;
  customerIdx: number;
  startOffset: number;
  endOffset: number;
  desc: string;
}

async function seedRentals(
  customers: { id: string; name: string }[],
  assets: {
    id: string;
    assetNo: string;
    name: string;
    dailyRate: string;
    depositAmount: string;
  }[],
  userId: string,
) {
  const plan: RentalSeed[] = [
    {
      no: rentalNo("ACT01"),
      status: "ACTIVE",
      assetIdx: 0,
      customerIdx: 0,
      startOffset: -3,
      endOffset: 4,
      desc: "정상 진행 (3일 전 시작, 4일 남음)",
    },
    {
      no: rentalNo("ACT02"),
      status: "ACTIVE",
      assetIdx: 1,
      customerIdx: 1,
      startOffset: -1,
      endOffset: 1,
      desc: "내일 반납 예정",
    },
    {
      no: rentalNo("OVD01"),
      status: "OVERDUE",
      assetIdx: 2,
      customerIdx: 2,
      startOffset: -10,
      endOffset: -2,
      desc: "2일 연체",
    },
    {
      no: rentalNo("RES01"),
      status: "RESERVED",
      assetIdx: 3,
      customerIdx: 3,
      startOffset: 0,
      endOffset: 3,
      desc: "오늘 픽업 예약",
    },
    {
      no: rentalNo("RES02"),
      status: "RESERVED",
      assetIdx: 4,
      customerIdx: 4,
      startOffset: 7,
      endOffset: 10,
      desc: "다음주 예약 (점유 검사 시각화)",
    },
    {
      no: rentalNo("RES03"),
      status: "RESERVED",
      assetIdx: 4,
      customerIdx: 0,
      startOffset: 14,
      endOffset: 17,
      desc: "같은 자산 2주 후 예약 (멀티 점유 검사)",
    },
    {
      no: rentalNo("RTN01"),
      status: "RETURNED",
      assetIdx: 0,
      customerIdx: 1,
      startOffset: -30,
      endOffset: -25,
      desc: "한 달 전 반납 — 점유 검사 무시 확인용",
    },
  ];

  for (const p of plan) {
    const existing = await prisma.rental.findUnique({
      where: { rentalNo: p.no },
      select: { id: true },
    });
    if (existing) {
      console.log(`[rental] ${p.no} 이미 존재 — skip`);
      continue;
    }

    const asset = assets[p.assetIdx];
    const customer = customers[p.customerIdx];
    const start = daysFromNow(p.startOffset);
    const end = daysFromNow(p.endOffset);
    const totalDays = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / 86400000),
    );
    const dailyRate = parseFloat(asset.dailyRate);
    const rentalAmount = dailyRate * totalDays;
    const depositAmount = parseFloat(asset.depositAmount);

    await prisma.rental.create({
      data: {
        rentalNo: p.no,
        assetId: asset.id,
        customerId: customer.id,
        status: p.status,
        startDate: start,
        endDate: end,
        rateType: "DAILY",
        unitRate: dailyRate,
        totalUnits: totalDays,
        rentalAmount,
        depositAmount,
        depositReturned: p.status === "RETURNED",
        overdueAmount: 0,
        finalAmount: rentalAmount,
        actualReturnedAt: p.status === "RETURNED" ? end : null,
        memo: p.desc,
        createdById: userId,
      },
    });

    // ACTIVE/OVERDUE 자산은 RENTED 로 마킹
    if (p.status === "ACTIVE" || p.status === "OVERDUE") {
      await prisma.rentalAsset.update({
        where: { id: asset.id },
        data: { status: "RENTED" },
      });
    }

    console.log(
      `[rental] ${p.no} 생성 — ${p.status} · ${asset.name} · ${customer.name} · ${p.desc}`,
    );
  }
}

async function main() {
  if (wipe) await wipeOld();

  const user = await ensureUser();
  console.log(`[user] createdById = ${user.email} (${user.id})`);

  const customers = await seedCustomers();
  const assets = await seedAssets();
  await seedRentals(customers, assets, user.id);

  // 요약
  const counts = await Promise.all([
    prisma.customer.count({ where: { name: { startsWith: SEED_TAG } } }),
    prisma.rentalAsset.count({ where: { name: { startsWith: ASSET_TAG } } }),
    prisma.rental.count({ where: { rentalNo: { startsWith: RENTAL_NO_PREFIX } } }),
  ]);
  console.log("\n=== 시드 완료 ===");
  console.log(`테스트 고객: ${counts[0]}`);
  console.log(`테스트 자산: ${counts[1]}`);
  console.log(`테스트 임대: ${counts[2]}`);
  console.log("\n메뉴 → 임대관리 페이지에서 확인:");
  console.log("  - 현재 임대 나감: ACT01, ACT02, OVD01 (3건)");
  console.log("  - 오늘 픽업 예약: RES01 (1건)");
  console.log("  - 임대 가능: 진공청소기 (RES02, RES03 가 점유 칩으로 보임)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
