/**
 * 시리얼번호 조회 시스템 검증용 시드.
 *
 * 손님 공개 페이지(/s/[token])·매장 상세(/serial-items/[code])·매뉴얼·라벨을
 * 실제 데이터로 확인하기 위한 테스트 데이터. 모든 레코드는 "SEED-SERIAL" 마커를
 * 가져 --clean 으로 한 번에 제거된다.
 *
 * 실행:
 *   npx tsx --env-file=.env.local scripts/seed-serial-test.ts          # 시드 (재실행 시 기존 SEED 정리 후 재생성)
 *   npx tsx --env-file=.env.local scripts/seed-serial-test.ts --clean  # 테스트 데이터 삭제만
 *
 * 검증 시나리오 (시드 후 출력되는 URL 사용):
 *   - SALE  손님 페이지 : 1단계 마스킹 → "내 정보 자세히 보기" → 이름 "SEED-SERIAL 김시리얼" + 전화 끝4 "7766"
 *   - SALE  보증만료    : 보증 ring 이 "만료" 표시
 *   - REPAIR 외부기기   : 구매정보 없음, 수리이력만
 *   - RENTAL 임대       : 사용법(매뉴얼)만 노출
 *   - 매장 상세         : /serial-items/SEED-SERIAL-S1
 *   - 매뉴얼 에디터     : /products/<productId>/manual
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const CLEAN = process.argv.includes("--clean");
const MARK = "SEED-SERIAL";

// 고정 토큰 — 테스트 URL 을 예측 가능하게 (실제 발급은 랜덤).
const TOKENS = {
  sale: "SEEDserialSALE01",
  expired: "SEEDserialSALE02",
  repair: "SEEDserialRPR001",
  rental: "SEEDserialRENT01",
};

const manualBlocks = [
  { id: "blk_seed_1", type: "heading", level: 2, text: "사용 시작하기" },
  {
    id: "blk_seed_2",
    type: "paragraph",
    text: "제품을 처음 사용하기 전에 구성품을 확인하고 아래 순서를 따라주세요.",
  },
  {
    id: "blk_seed_3",
    type: "steps",
    items: [
      { title: "전원 연결", body: "어댑터를 콘센트에 연결합니다." },
      { title: "전원 켜기", body: "본체 전원 버튼을 3초간 길게 누릅니다." },
      { title: "초기 설정", body: "화면 안내에 따라 언어와 시간을 설정합니다." },
    ],
  },
  {
    id: "blk_seed_4",
    type: "callout",
    variant: "warning",
    title: "안전 주의",
    body: "제품을 물기가 있는 곳에 두거나 분해하지 마세요.",
  },
  {
    id: "blk_seed_5",
    type: "faq",
    items: [
      {
        q: "전원이 켜지지 않아요",
        a: "어댑터 연결 상태와 콘센트를 먼저 확인해주세요. 그래도 안 되면 매장으로 문의하세요.",
      },
    ],
  },
];

async function clean() {
  console.log(`[seed-serial] "${MARK}" 마커 데이터 삭제`);
  // RepairTicket 이 SerialItem·Customer 를 참조 → 먼저 삭제 (parts/labors 는 cascade)
  const rt = await prisma.repairTicket.deleteMany({
    where: { ticketNo: { startsWith: MARK } },
  });
  // SerialItem — SerialAccessLog 는 cascade
  const si = await prisma.serialItem.deleteMany({
    where: { code: { startsWith: MARK } },
  });
  // Order — OrderItem 은 cascade
  const ord = await prisma.order.deleteMany({
    where: { orderNo: { startsWith: MARK } },
  });
  const ra = await prisma.rentalAsset.deleteMany({
    where: { assetNo: { startsWith: MARK } },
  });
  const inv = await prisma.inventory.deleteMany({
    where: { product: { sku: { startsWith: MARK } } },
  });
  const prod = await prisma.product.deleteMany({
    where: { sku: { startsWith: MARK } },
  });
  const cust = await prisma.customer.deleteMany({
    where: { name: { startsWith: MARK } },
  });
  console.log(
    `  삭제 — 수리 ${rt.count} / 시리얼 ${si.count} / 주문 ${ord.count} / 임대자산 ${ra.count} / 재고 ${inv.count} / 상품 ${prod.count} / 고객 ${cust.count}`,
  );
}

async function seed() {
  await clean();
  console.log("[seed-serial] 테스트 데이터 생성");

  const user = await prisma.user.findFirst();
  if (!user) throw new Error("User 가 없습니다 — 먼저 사용자를 등록하세요");

  const now = new Date();
  const plusDays = (d: number) =>
    new Date(now.getTime() + d * 86_400_000);

  // 1) 상품 — trackable + 매뉴얼
  const product = await prisma.product.create({
    data: {
      name: `${MARK} 테스트 제품`,
      modelName: "ST-2026",
      sku: `${MARK}-PROD-1`,
      unitOfMeasure: "EA",
      sellingPrice: 250000,
      listPrice: 280000,
      trackable: true,
      warrantyMonths: 12,
      hasManual: true,
      manualBlocks,
      imageUrl: "https://placehold.co/640x400/png?text=SEED-SERIAL",
    },
  });

  // 2) 임대 자산
  const rentalAsset = await prisma.rentalAsset.create({
    data: {
      assetNo: `${MARK}-RA-1`,
      name: `${MARK} 임대 자산`,
      productId: product.id,
      dailyRate: 10000,
      monthlyRate: 200000,
    },
  });

  // 3) 고객 — 동의 / 미동의
  const consented = await prisma.customer.create({
    data: {
      name: `${MARK} 김시리얼`,
      phone: "01099887766",
      serialServiceConsent: true,
      consentedAt: now,
      consentVersion: "v1.0",
    },
  });
  const notConsented = await prisma.customer.create({
    data: {
      name: `${MARK} 박미동의`,
      phone: "01055554444",
      serialServiceConsent: false,
    },
  });

  // 4) 주문 — SALE 시리얼의 구매정보
  const order = await prisma.order.create({
    data: {
      orderNo: `${MARK}-ORD-1`,
      orderDate: plusDays(-30),
      status: "COMPLETED",
      paymentStatus: "PAID",
      customerId: consented.id,
      createdById: user.id,
      subtotalAmount: 250000,
      totalAmount: 275000,
      items: {
        create: {
          productId: product.id,
          quantity: 1,
          unitPrice: 250000,
          totalPrice: 250000,
        },
      },
    },
    include: { items: true },
  });

  // 5) 시리얼 — SALE / 보증만료 / REPAIR / RENTAL / 미동의
  const saleSerial = await prisma.serialItem.create({
    data: {
      code: `${MARK}-S1`,
      accessToken: TOKENS.sale,
      productId: product.id,
      customerId: consented.id,
      orderItemId: order.items[0].id,
      source: "SALE",
      soldAt: plusDays(-30),
      warrantyEnds: plusDays(335),
      memo: `${MARK} 정상 판매 케이스`,
    },
  });

  await prisma.serialItem.create({
    data: {
      code: `${MARK}-S2`,
      accessToken: TOKENS.expired,
      productId: product.id,
      customerId: consented.id,
      source: "SALE",
      soldAt: plusDays(-400),
      warrantyEnds: plusDays(-10),
      memo: `${MARK} 보증 만료 케이스`,
    },
  });

  await prisma.serialItem.create({
    data: {
      code: `${MARK}-R1`,
      accessToken: TOKENS.repair,
      displayName: "외부 카메라 (SEED 테스트)",
      customerId: consented.id,
      source: "REPAIR",
      soldAt: plusDays(-15),
      memo: `${MARK} 외부 기기 수리 라벨`,
    },
  });

  await prisma.serialItem.create({
    data: {
      code: `${MARK}-RT1`,
      accessToken: TOKENS.rental,
      productId: product.id,
      rentalAssetId: rentalAsset.id,
      source: "RENTAL",
      soldAt: plusDays(-5),
      memo: `${MARK} 임대 자산 라벨`,
    },
  });

  await prisma.serialItem.create({
    data: {
      code: `${MARK}-S3`,
      accessToken: null, // 미동의 손님 — QR 미발급
      productId: product.id,
      customerId: notConsented.id,
      source: "SALE",
      soldAt: plusDays(-3),
      warrantyEnds: plusDays(362),
      memo: `${MARK} 미동의 — 토큰 없음`,
    },
  });

  // 6) 수리이력 — SALE 시리얼에 연결
  await prisma.repairTicket.create({
    data: {
      ticketNo: `${MARK}-RT-1`,
      type: "DROP_OFF",
      customerId: consented.id,
      serialItemId: saleSerial.id,
      status: "PICKED_UP",
      receivedAt: plusDays(-20),
      readyAt: plusDays(-18),
      pickedUpAt: plusDays(-17),
      symptom: "전원이 간헐적으로 꺼짐",
      diagnosis: "메인보드 전원부 불량",
      finalAmount: 85000,
      repairWarrantyMonths: 3,
      repairWarrantyEnds: plusDays(73),
      createdById: user.id,
      parts: {
        create: {
          productId: product.id,
          quantity: 1,
          unitPrice: 50000,
          totalPrice: 50000,
        },
      },
      labors: {
        create: { name: "전원부 교체 공임", hours: 1, unitRate: 35000, totalPrice: 35000 },
      },
    },
  });

  const base = process.env.NEXT_PUBLIC_QR_BASE_URL ?? "http://localhost:3000";
  console.log("\n[seed-serial] 완료 — 검증 URL\n");
  console.log(`  손님 SALE     : ${base}/s/${TOKENS.sale}`);
  console.log(`    └ 본인확인: 이름 "${MARK} 김시리얼" / 전화 끝4 "7766"`);
  console.log(`  손님 보증만료 : ${base}/s/${TOKENS.expired}`);
  console.log(`  손님 REPAIR   : ${base}/s/${TOKENS.repair}`);
  console.log(`  손님 RENTAL   : ${base}/s/${TOKENS.rental}  (사용법만)`);
  console.log(`  매장 상세     : ${base}/serial-items/${MARK}-S1`);
  console.log(`  매뉴얼 에디터 : ${base}/products/${product.id}/manual`);
  console.log(`  미동의 시리얼 : ${MARK}-S3 (토큰 없음 — 매장 상세에서 [토큰 재발급] 테스트)`);
  console.log(`\n  삭제: npx tsx --env-file=.env.local scripts/seed-serial-test.ts --clean\n`);
}

async function main() {
  if (CLEAN) {
    await clean();
  } else {
    await seed();
  }
}

main()
  .catch((e) => {
    console.error("[seed-serial] 실패:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
