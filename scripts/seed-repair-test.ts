// 테스트용 수리 데이터 생성 — 고객 "이재우"에 상품 "영남30A모터고압분무기" SerialItem + 수리 내역 4건
// 실행 전 기존 테스트 데이터 삭제. 환자 차트(이 기기의 수리 내역) 검증용.
// 실행: npx tsx scripts/seed-repair-test.ts

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as dotenv } from "dotenv";
import { generateRepairTicketNo } from "../src/lib/document-no";
import { nextSerialItemCode } from "../src/lib/serial-item-code";

dotenv({ path: ".env.local" });
dotenv({ path: ".env" });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  // 1. 고객
  let customer = await prisma.customer.findFirst({ where: { name: "이재우" } });
  if (!customer) {
    customer = await prisma.customer.create({
      data: { name: "이재우", phone: "010-0000-0000" },
    });
  }
  console.log(`✓ 고객: ${customer.name} (${customer.id})`);

  // 2. 상품
  let product = await prisma.product.findFirst({
    where: { name: { contains: "영남30A모터고압분무기" } },
  });
  if (!product) {
    product = await prisma.product.create({
      data: {
        name: "영남30A모터고압분무기",
        sku: `YN-30A-${Date.now().toString(36).toUpperCase()}`,
        sellingPrice: 350000,
        listPrice: 350000,
        productType: "FINISHED",
        unitOfMeasure: "EA",
        taxType: "TAXABLE",
        trackable: true,
        warrantyMonths: 12,
        inventory: { create: { quantity: 0, safetyStock: 1 } },
      },
    });
  }
  console.log(`✓ 상품: ${product.name} (${product.sku})`);

  const user = await prisma.user.findFirst({ where: { isActive: true } });
  if (!user) throw new Error("활성 사용자 없음");

  // 3. 기존 테스트 수리 정리 (이재우의 모든 수리, SerialItem 포함)
  const existingTickets = await prisma.repairTicket.findMany({
    where: { customerId: customer.id },
    select: { id: true },
  });
  if (existingTickets.length > 0) {
    const ids = existingTickets.map((t) => t.id);
    await prisma.repairLabor.deleteMany({ where: { repairTicketId: { in: ids } } });
    await prisma.repairPart.deleteMany({ where: { repairTicketId: { in: ids } } });
    await prisma.repairTicket.deleteMany({ where: { id: { in: ids } } });
    console.log(`✓ 기존 수리 ${existingTickets.length}건 삭제`);
  }
  // 기존 테스트 SerialItem 정리
  const existingSerials = await prisma.serialItem.findMany({
    where: { customerId: customer.id, productId: product.id },
    select: { id: true },
  });
  if (existingSerials.length > 0) {
    await prisma.serialItem.deleteMany({
      where: { id: { in: existingSerials.map((s) => s.id) } },
    });
    console.log(`✓ 기존 SerialItem ${existingSerials.length}건 삭제`);
  }

  // 4. SerialItem 1건 — 그 기기에 시리얼 라벨 발번 + 보증 1년
  const soldAt = new Date();
  soldAt.setMonth(soldAt.getMonth() - 8); // 8개월 전 구매
  const warrantyEnds = new Date(soldAt);
  warrantyEnds.setMonth(warrantyEnds.getMonth() + 12);

  const serialItem = await prisma.$transaction(async (tx) => {
    const code = await nextSerialItemCode(tx, soldAt);
    return tx.serialItem.create({
      data: {
        code,
        productId: product.id,
        customerId: customer.id,
        soldAt,
        warrantyEnds,
        status: "ACTIVE",
      },
    });
  });
  console.log(`✓ SerialItem: ${serialItem.code} (구매일 ${soldAt.toISOString().slice(0, 10)})`);

  // 5. 과거 수리 3건 (PICKED_UP) — 모두 같은 SerialItem 연결
  const pastRepairs = [
    {
      symptom: "분무 압력 약함, 모터 회전 느림",
      diagnosis: "모터 베어링 마모, 윤활유 부족",
      repairNotes: "베어링 교체 + 윤활유 보충",
      laborAmount: 80000,
      partsAmount: 35000,
      receivedDaysAgo: 120,
      pickupDaysAgo: 118,
    },
    {
      symptom: "노즐에서 누수",
      diagnosis: "패킹 노후, O링 마모",
      repairNotes: "패킹 + O링 세트 교체",
      laborAmount: 30000,
      partsAmount: 8000,
      receivedDaysAgo: 60,
      pickupDaysAgo: 60,
    },
    {
      symptom: "스위치 작동 불량",
      diagnosis: "스위치 접점 산화",
      repairNotes: "스위치 교체",
      laborAmount: 25000,
      partsAmount: 12000,
      receivedDaysAgo: 14,
      pickupDaysAgo: 12,
    },
  ];

  for (const r of pastRepairs) {
    const receivedAt = new Date(Date.now() - r.receivedDaysAgo * 86400000);
    const pickupAt = new Date(Date.now() - r.pickupDaysAgo * 86400000);
    const finalAmount = r.laborAmount + r.partsAmount;
    const ticket = await prisma.repairTicket.create({
      data: {
        ticketNo: generateRepairTicketNo(receivedAt),
        type: "DROP_OFF",
        customerId: customer.id,
        serialItemId: serialItem.id,
        status: "PICKED_UP",
        receivedAt,
        startedAt: receivedAt,
        readyAt: pickupAt,
        pickedUpAt: pickupAt,
        symptom: r.symptom,
        diagnosis: r.diagnosis,
        repairNotes: r.repairNotes,
        finalAmount,
        quotedLaborAmount: r.laborAmount,
        quotedPartsAmount: r.partsAmount,
        quotedTotalAmount: finalAmount,
        quotedAt: receivedAt,
        paymentMethod: "CASH",
        repairWarrantyMonths: 1,
        repairWarrantyEnds: new Date(pickupAt.getTime() + 30 * 86400000),
        createdById: user.id,
        labors: {
          create: [
            { name: r.repairNotes, hours: 1, unitRate: r.laborAmount, totalPrice: r.laborAmount },
          ],
        },
      },
    });
    console.log(`✓ 완료 수리: ${ticket.ticketNo} — ${r.symptom}`);
  }

  // 6. 진행중 수리 1건 (REPAIRING) — 같은 SerialItem 연결
  const activeTicket = await prisma.repairTicket.create({
    data: {
      ticketNo: generateRepairTicketNo(),
      type: "DROP_OFF",
      customerId: customer.id,
      serialItemId: serialItem.id,
      status: "REPAIRING",
      receivedAt: new Date(),
      startedAt: new Date(),
      symptom: "물이 안 나옴",
      diagnosis: "유량 점검 중",
      repairWarrantyMonths: 1,
      createdById: user.id,
    },
  });
  console.log(`✓ 진행중 수리: ${activeTicket.ticketNo} (REPAIRING)`);

  console.log(`\n✅ 완료
  - SerialItem ${serialItem.code} 1건
  - 완료 수리 3건 + 진행중 1건
  - /pos에서 이재우 → 수리 모드 → 진행중 탭 → 작업 화면에서
    "이 기기의 수리 내역 (3건)" 섹션이 활성됩니다`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
