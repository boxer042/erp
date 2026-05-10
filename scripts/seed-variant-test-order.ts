/**
 * 변형상품(variant) 미확정 흐름 검증용 시드.
 *
 * 외부 채널이 canonical(대표상품) SKU 로 주문을 보낸 케이스를 재현 — 매장 직원이
 * 출고대기로 이행할 때 [출고 SKU 선택] 다이얼로그로 실제 변형(수냉/공냉) 을 골라야
 * 재고가 차감되는 흐름.
 *
 * 실행:
 *   npx tsx --env-file=.env.local scripts/seed-variant-test-order.ts
 *   npx tsx --env-file=.env.local scripts/seed-variant-test-order.ts --reset
 *
 * 검증 시나리오:
 *   1) /orders 워크보드에서 "[VARIANT-TEST]" 주문 행에 노란 "변형 미확정" 배지 확인
 *   2) [출고대기] 버튼 클릭 → 자동으로 변형 선택 다이얼로그 열림 → 수냉/공냉 중 하나 선택 → 확정
 *   3) prepare 자동 재시도 → 재고 차감 + status=PREPARING 전이
 *   4) 또는 행 클릭 → 상세 시트에서 [출고 SKU 선택] 버튼으로 라인별 해결도 가능
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const RESET = process.argv.includes("--reset");
const SKU_CANONICAL = "SEED-VARIANT-DT";
const SKU_WC = "SEED-VARIANT-DT-WC";
const SKU_AC = "SEED-VARIANT-DT-AC";
const CHANNEL_SKU = "SEED-VARIANT-CH-DT";
const CHANNEL_ORDER_NO = "SEED-VARIANT-CH-ORD-001";
const CUSTOMER_NAME = "SEED-변형테스트 손님";

async function main() {
  console.log("[seed-variant] 시작");

  if (RESET) {
    console.log("  → 기존 SEED-VARIANT 데이터 삭제");
    await prisma.orderItem.deleteMany({
      where: { order: { channelOrderNo: CHANNEL_ORDER_NO } },
    });
    await prisma.order.deleteMany({
      where: { channelOrderNo: CHANNEL_ORDER_NO },
    });
    await prisma.channelProductMapping.deleteMany({
      where: { channelSku: CHANNEL_SKU },
    });
    await prisma.inventory.deleteMany({
      where: { product: { sku: { in: [SKU_CANONICAL, SKU_WC, SKU_AC] } } },
    });
    // 변형 상품 먼저 (canonicalProductId FK SetNull 이지만 깔끔하게)
    await prisma.product.deleteMany({
      where: { sku: { in: [SKU_WC, SKU_AC] } },
    });
    await prisma.product.deleteMany({
      where: { sku: SKU_CANONICAL },
    });
    await prisma.customer.deleteMany({ where: { name: CUSTOMER_NAME } });
    console.log("  ✓ 삭제 완료");
  }

  // 1) ADMIN
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) {
    console.error("  ✗ ADMIN 사용자가 없습니다 — 회원가입 + role=ADMIN 후 재시도");
    process.exit(1);
  }
  console.log(`  ✓ ADMIN: ${admin.email}`);

  // 2) MOCK 채널 ensure
  const channel = await prisma.salesChannel.upsert({
    where: { code: "MOCK" },
    update: { isActive: true },
    create: {
      code: "MOCK",
      name: "Mock 채널 (테스트)",
      commissionRate: 0.05,
      isActive: true,
    },
  });
  console.log(`  ✓ 채널: ${channel.name}`);

  // 3) Canonical(대표상품) — 카탈로그 진입점, 자체 재고 X (변형 부모)
  const canonical = await prisma.product.upsert({
    where: { sku: SKU_CANONICAL },
    update: {
      name: "테스트 조립 데스크톱(대표)",
      sellingPrice: 1500000,
      listPrice: 1500000,
      isActive: true,
      isCanonical: true,
      productType: "ASSEMBLED",
    },
    create: {
      sku: SKU_CANONICAL,
      name: "테스트 조립 데스크톱(대표)",
      sellingPrice: 1500000,
      listPrice: 1500000,
      taxType: "TAXABLE",
      taxRate: 0.1,
      isActive: true,
      isCanonical: true,
      productType: "ASSEMBLED",
    },
  });

  // 4) Variants — 실제 출고 SKU. 각자 inventory 보유
  const wc = await prisma.product.upsert({
    where: { sku: SKU_WC },
    update: {
      name: "테스트 조립 데스크톱-수냉",
      sellingPrice: 1700000,
      listPrice: 1700000,
      isActive: true,
      isCanonical: false,
      canonicalProductId: canonical.id,
      productType: "ASSEMBLED",
    },
    create: {
      sku: SKU_WC,
      name: "테스트 조립 데스크톱-수냉",
      sellingPrice: 1700000,
      listPrice: 1700000,
      taxType: "TAXABLE",
      taxRate: 0.1,
      isActive: true,
      isCanonical: false,
      canonicalProductId: canonical.id,
      productType: "ASSEMBLED",
    },
  });
  const ac = await prisma.product.upsert({
    where: { sku: SKU_AC },
    update: {
      name: "테스트 조립 데스크톱-공냉",
      sellingPrice: 1500000,
      listPrice: 1500000,
      isActive: true,
      isCanonical: false,
      canonicalProductId: canonical.id,
      productType: "ASSEMBLED",
    },
    create: {
      sku: SKU_AC,
      name: "테스트 조립 데스크톱-공냉",
      sellingPrice: 1500000,
      listPrice: 1500000,
      taxType: "TAXABLE",
      taxRate: 0.1,
      isActive: true,
      isCanonical: false,
      canonicalProductId: canonical.id,
      productType: "ASSEMBLED",
    },
  });
  await prisma.inventory.upsert({
    where: { productId: wc.id },
    update: { quantity: 5 },
    create: { productId: wc.id, quantity: 5, safetyStock: 0 },
  });
  await prisma.inventory.upsert({
    where: { productId: ac.id },
    update: { quantity: 8 },
    create: { productId: ac.id, quantity: 8, safetyStock: 0 },
  });
  console.log(
    `  ✓ 상품 — 대표 ${canonical.sku} + 변형 2개(수냉 재고 5, 공냉 재고 8)`,
  );

  // 5) 채널 SKU 매핑 — 채널 SKU 가 canonical 을 가리킴 (외부 채널 가입 전 운영 가정)
  await prisma.channelProductMapping.upsert({
    where: {
      channelId_channelSku: { channelId: channel.id, channelSku: CHANNEL_SKU },
    },
    update: { productId: canonical.id, channelName: "테스트 조립 데스크톱" },
    create: {
      channelId: channel.id,
      channelSku: CHANNEL_SKU,
      channelName: "테스트 조립 데스크톱",
      productId: canonical.id,
    },
  });
  console.log(`  ✓ 채널 SKU 매핑: ${CHANNEL_SKU} → ${canonical.sku}`);

  // 6) 손님 — name+phone 으로 중복 방지 (phone 은 unique 가 아니라 findFirst 패턴)
  let customer = await prisma.customer.findFirst({
    where: { name: CUSTOMER_NAME },
  });
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        type: "INDIVIDUAL",
        name: CUSTOMER_NAME,
        phone: "010-9999-0001",
        address: "서울시 강남구 테스트로 123",
      },
    });
  }

  // 7) PENDING 주문 — canonical 상품 1개. 외부 채널이 보낸 raw order 가 import 된 상태와 동일.
  //    재고 차감 X, status=PENDING. 매장 직원이 출고대기로 이행 시 변형 선택 강제.
  const subtotal = Number(canonical.sellingPrice);
  const tax = Math.round(subtotal * 0.1);
  const total = subtotal + tax;
  const order = await prisma.order.create({
    data: {
      orderNo: `SEED-VARIANT-${Date.now().toString(36).slice(-6).toUpperCase()}`,
      status: "PENDING",
      paymentStatus: "PAID",
      paymentMethod: "TRANSFER",
      fulfillmentType: "SHIPPING",
      expectedShipDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      orderDate: new Date(),
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      recipientName: customer.name,
      recipientPhone: customer.phone,
      shippingAddress: customer.address,
      channelId: channel.id,
      channelOrderNo: CHANNEL_ORDER_NO,
      subtotalAmount: subtotal,
      discountAmount: 0,
      shippingFee: 0,
      taxAmount: tax,
      totalAmount: total,
      commissionAmount: Math.round(subtotal * Number(channel.commissionRate)),
      shippingPaymentType: "PREPAID",
      memo: "[VARIANT-TEST] 외부 채널이 대표상품 SKU 로 주문 — 출고대기 진입 시 변형 선택 강제",
      createdById: admin.id,
      items: {
        create: [
          {
            productId: canonical.id,
            quantity: 1,
            unitPrice: subtotal,
            totalPrice: subtotal,
          },
        ],
      },
    },
  });
  console.log(`  ✓ 주문 ${order.orderNo} — PENDING, canonical 라인 1건`);

  console.log("");
  console.log("[검증]");
  console.log("  1. /orders 워크보드 → 노란 '변형 미확정' 배지 확인");
  console.log("  2. [출고대기] 버튼 클릭 → 변형 선택 다이얼로그 자동 오픈");
  console.log("  3. 수냉(₩1,700,000) 또는 공냉(₩1,500,000) 선택 → '확정 후 출고대기 재시도'");
  console.log("  4. 자동 prepare 재시도 → status=PREPARING + 재고 차감");
  console.log("");
  console.log("  또는 주문 행 클릭 → 상세 시트 → 라인 옆 [출고 SKU 선택] 버튼으로도 가능");
  console.log("");
  console.log("[seed-variant] 완료");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
