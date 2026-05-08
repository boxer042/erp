/**
 * 주문 시스템 종합 시나리오 시드 — 워크보드의 모든 흐름을 시각으로 확인할 수 있게
 * 다양한 상태의 주문 데이터를 생성한다.
 *
 * 실행:
 *   npx tsx --env-file=.env.local scripts/seed-test-scenarios.ts
 *   npx tsx --env-file=.env.local scripts/seed-test-scenarios.ts --reset  (기존 SEED- 데이터 삭제 후 재생성)
 *
 * 생성 데이터 (SEED- prefix 로 식별):
 *  - 채널 1개 (MOCK), SKU 매핑 (단일 + 다중)
 *  - 상품 5개 (재고 충분)
 *  - 고객 2명 (개인·기업)
 *  - 주문 시나리오 12개 — PENDING / PREPARING / PREPARING_PACKED / SHIPPED /
 *    COMPLETED / RETURN_REQUESTED / RETURN_ACCEPTED / RETURN_COLLECTED /
 *    RETURN_INSPECTED / RETURNED / EXCHANGED + 새 주문 -EX
 *  - 부분 출고/반품/외상 시나리오 포함
 *  - 보류 큐 1건 (UNMAPPED_SKU) — 매핑 추천 dialog 검증용
 *
 * LotConsumption 은 FIFO 시뮬이 복잡해 생략 — 시각 확인용 데이터만.
 * 실제 prepare/ship 액션을 거치지 않아도 되는 상태 데이터를 직접 set.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const RESET = process.argv.includes("--reset");
const PREFIX = "SEED-";

async function main() {
  console.log("[seed-scenarios] 시작");

  if (RESET) {
    console.log("  → 기존 SEED- 데이터 삭제");
    await prisma.orderItem.deleteMany({
      where: { order: { orderNo: { startsWith: PREFIX } } },
    });
    await prisma.order.deleteMany({
      where: { orderNo: { startsWith: PREFIX } },
    });
    await prisma.pendingChannelOrder.deleteMany({
      where: { channelOrderNo: { startsWith: PREFIX } },
    });
    await prisma.channelProductMappingComponent.deleteMany({
      where: { mapping: { channelSku: { startsWith: PREFIX } } },
    });
    await prisma.channelProductMapping.deleteMany({
      where: { channelSku: { startsWith: PREFIX } },
    });
    await prisma.product.deleteMany({
      where: { sku: { startsWith: PREFIX } },
    });
    await prisma.customer.deleteMany({
      where: { name: { startsWith: PREFIX } },
    });
    console.log("  ✓ 삭제 완료");
  }

  // 1) ADMIN 사용자 (이미 있어야)
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) {
    console.error("  ✗ ADMIN 사용자가 없습니다. 먼저 회원가입 + role=ADMIN 설정");
    process.exit(1);
  }
  console.log(`  ✓ ADMIN: ${admin.email}`);

  // 2) Mock 채널 ensure
  const channel = await prisma.salesChannel.upsert({
    where: { code: "MOCK" },
    update: { isActive: true },
    create: {
      code: "MOCK",
      name: "Mock 채널 (테스트)",
      commissionRate: 0.05,
      isActive: true,
      memo: "시드 스크립트가 생성한 검증용 채널",
    },
  });
  console.log(`  ✓ 채널: ${channel.name}`);

  // 3) 테스트 상품 5개
  const productSpecs = [
    { sku: `${PREFIX}P001`, name: "테스트 가습기", sellingPrice: 50000, qty: 100 },
    { sku: `${PREFIX}P002`, name: "테스트 가습기 필터", sellingPrice: 12000, qty: 200 },
    { sku: `${PREFIX}P003`, name: "테스트 핸드크림", sellingPrice: 18000, qty: 150 },
    { sku: `${PREFIX}P004`, name: "테스트 마스크팩 10매", sellingPrice: 25000, qty: 80 },
    { sku: `${PREFIX}P005`, name: "테스트 보습세트", sellingPrice: 80000, qty: 30 },
  ];
  const products = await Promise.all(
    productSpecs.map(async (p) => {
      const created = await prisma.product.upsert({
        where: { sku: p.sku },
        update: {
          name: p.name,
          sellingPrice: p.sellingPrice,
          listPrice: p.sellingPrice,
          isActive: true,
        },
        create: {
          sku: p.sku,
          name: p.name,
          sellingPrice: p.sellingPrice,
          listPrice: p.sellingPrice,
          taxType: "TAXABLE",
          taxRate: 0.1,
          isActive: true,
        },
      });
      // Inventory ensure
      await prisma.inventory.upsert({
        where: { productId: created.id },
        update: { quantity: p.qty },
        create: { productId: created.id, quantity: p.qty, safetyStock: 0 },
      });
      return created;
    }),
  );
  console.log(`  ✓ 상품 ${products.length}개 + inventory`);

  // 4) SKU 매핑
  // 단일 매핑: P001 ↔ ERP P001
  // 다중 매핑 (선물세트): SET-A ↔ [P001 × 1 + P002 × 2 + P003 × 1]
  const singleMappingSku = `${PREFIX}MAP001`;
  const multiMappingSku = `${PREFIX}MAP-SET-A`;
  await prisma.channelProductMapping.upsert({
    where: {
      channelId_channelSku: { channelId: channel.id, channelSku: singleMappingSku },
    },
    update: { productId: products[0].id, channelName: "테스트 가습기 (단일)" },
    create: {
      channelId: channel.id,
      channelSku: singleMappingSku,
      channelName: "테스트 가습기 (단일)",
      productId: products[0].id,
    },
  });

  // 다중 매핑은 나누어 처리 — 기존 components 삭제 후 재생성
  const multiMapping = await prisma.channelProductMapping.upsert({
    where: {
      channelId_channelSku: { channelId: channel.id, channelSku: multiMappingSku },
    },
    update: { productId: null, channelName: "테스트 보습세트 (다중)" },
    create: {
      channelId: channel.id,
      channelSku: multiMappingSku,
      channelName: "테스트 보습세트 (다중)",
      productId: null,
    },
  });
  await prisma.channelProductMappingComponent.deleteMany({
    where: { mappingId: multiMapping.id },
  });
  await prisma.channelProductMappingComponent.createMany({
    data: [
      { mappingId: multiMapping.id, productId: products[0].id, quantity: 1 },
      { mappingId: multiMapping.id, productId: products[1].id, quantity: 2 },
      { mappingId: multiMapping.id, productId: products[2].id, quantity: 1 },
    ],
  });
  console.log(`  ✓ 매핑 2개 (단일 + 다중)`);

  // 5) 고객 2명 (개인·기업)
  const customerIndiv = await prisma.customer.upsert({
    where: { id: `${PREFIX}-CUST-INDIV` }, // 가짜 id 검색 — 없으면 create
    update: {},
    create: {
      id: `${PREFIX}-CUST-INDIV`,
      name: `${PREFIX}홍길동`,
      type: "INDIVIDUAL",
      phone: "010-1111-1111",
      address: "서울시 종로구 테스트로 1",
      isActive: true,
    },
  }).catch(async () => {
    // 이미 다른 id 로 존재할 수도 — name 으로 fallback
    return prisma.customer.findFirstOrThrow({
      where: { name: `${PREFIX}홍길동` },
    });
  });
  const customerCorp = await prisma.customer
    .upsert({
      where: { id: `${PREFIX}-CUST-CORP` },
      update: {},
      create: {
        id: `${PREFIX}-CUST-CORP`,
        name: `${PREFIX}㈜테스트상회`,
        type: "BUSINESS",
        businessNumber: "123-45-67890",
        phone: "02-1234-5678",
        address: "서울시 강남구 테스트로 100",
        isActive: true,
      },
    })
    .catch(async () =>
      prisma.customer.findFirstOrThrow({
        where: { name: `${PREFIX}㈜테스트상회` },
      }),
    );
  console.log(`  ✓ 고객 2명 (개인·기업)`);

  // 6) 주문 시나리오 — 다양한 상태
  const today = new Date();
  const dayOffset = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d;
  };

  let seq = 1;
  const newOrderNo = () => `${PREFIX}${String(seq++).padStart(3, "0")}`;

  // 공통 헬퍼 — items 1개 만들기
  type ItemSpec = {
    productId: string;
    quantity: number;
    unitPrice: number;
    shippedQty?: number;
    returnedQty?: number;
    refundedAmount?: number;
  };
  async function createOrder(spec: {
    label: string;
    status: string;
    paymentStatus: string;
    paymentMethod?: string | null;
    fulfillmentType?: string;
    expectedShipDate?: Date | null;
    items: ItemSpec[];
    customerId?: string;
    channelId?: string;
    channelOrderNo?: string;
    claimType?: string | null;
    claimReason?: string | null;
    returnReason?: string | null;
    trackingCarrier?: string | null;
    trackingNumber?: string | null;
    returnRequestedAt?: Date | null;
    returnAcceptedAt?: Date | null;
    returnRejectedAt?: Date | null;
    exchangedAt?: Date | null;
    exchangeOrderId?: string | null;
    memo?: string;
  }) {
    const subtotal = spec.items.reduce(
      (s, i) => s + i.quantity * i.unitPrice,
      0,
    );
    const tax = Math.round(subtotal * 0.1);
    const total = subtotal + tax;
    const orderNo = newOrderNo();
    const o = await prisma.order.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: {
        orderNo,
        status: spec.status as never,
        paymentStatus: spec.paymentStatus as never,
        paymentMethod: spec.paymentMethod
          ? (spec.paymentMethod as never)
          : null,
        fulfillmentType: (spec.fulfillmentType ?? "SHIPPING") as never,
        expectedShipDate: spec.expectedShipDate ?? null,
        customerId: spec.customerId ?? null,
        customerName: spec.customerId
          ? spec.customerId === customerIndiv.id
            ? customerIndiv.name
            : customerCorp.name
          : null,
        customerPhone: spec.customerId
          ? spec.customerId === customerIndiv.id
            ? customerIndiv.phone
            : customerCorp.phone
          : null,
        recipientName: spec.customerId
          ? spec.customerId === customerIndiv.id
            ? customerIndiv.name
            : customerCorp.name
          : null,
        recipientPhone: spec.customerId
          ? spec.customerId === customerIndiv.id
            ? customerIndiv.phone
            : customerCorp.phone
          : null,
        shippingAddress: spec.customerId
          ? spec.customerId === customerIndiv.id
            ? customerIndiv.address
            : customerCorp.address
          : null,
        channelId: spec.channelId ?? null,
        channelOrderNo: spec.channelOrderNo ?? null,
        orderDate: today,
        subtotalAmount: subtotal,
        discountAmount: 0,
        shippingFee: 0,
        taxAmount: tax,
        totalAmount: total,
        commissionAmount: 0,
        claimType: (spec.claimType ?? null) as never,
        claimReason: (spec.claimReason ?? null) as never,
        returnReason: spec.returnReason ?? null,
        trackingCarrier: spec.trackingCarrier ?? null,
        trackingNumber: spec.trackingNumber ?? null,
        returnRequestedAt: spec.returnRequestedAt ?? null,
        returnAcceptedAt: spec.returnAcceptedAt ?? null,
        returnRejectedAt: spec.returnRejectedAt ?? null,
        exchangedAt: spec.exchangedAt ?? null,
        exchangeOrderId: spec.exchangeOrderId ?? null,
        memo: spec.memo ?? `[${spec.label}]`,
        createdById: admin.id,
        items: {
          create: spec.items.map((it) => ({
            productId: it.productId,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            totalPrice: it.quantity * it.unitPrice,
            shippedQty: it.shippedQty ?? 0,
            returnedQty: it.returnedQty ?? 0,
            refundedAmount: it.refundedAmount ?? 0,
          })),
        },
      },
    });
    console.log(`    + ${orderNo} ${spec.label}`);
    return o;
  }

  console.log(`  → 시나리오 주문 생성`);

  // 시나리오 1: PENDING (외상, 매장 직접 등록)
  await createOrder({
    label: "PENDING 외상 — 출고대기 진입 전",
    status: "PENDING",
    paymentStatus: "UNPAID",
    paymentMethod: "UNPAID",
    customerId: customerIndiv.id,
    expectedShipDate: dayOffset(2),
    items: [{ productId: products[0].id, quantity: 2, unitPrice: 50000 }],
  });

  // 시나리오 2: PENDING (외부 채널 import)
  await createOrder({
    label: "PENDING 외부채널",
    status: "PENDING",
    paymentStatus: "PAID",
    paymentMethod: "CARD",
    channelId: channel.id,
    channelOrderNo: `${PREFIX}CH-001`,
    customerId: customerIndiv.id,
    expectedShipDate: dayOffset(1),
    items: [{ productId: products[1].id, quantity: 3, unitPrice: 12000 }],
  });

  // 시나리오 3: PREPARING 출고대기
  await createOrder({
    label: "PREPARING 출고대기",
    status: "PREPARING",
    paymentStatus: "PAID",
    paymentMethod: "CARD",
    customerId: customerIndiv.id,
    expectedShipDate: today,
    items: [{ productId: products[2].id, quantity: 1, unitPrice: 18000 }],
  });

  // 시나리오 4: PREPARING_PACKED 출고확정 + 부분 발송
  // shippedQty=1, quantity=3 → 잔여 2개
  await createOrder({
    label: "PREPARING_PACKED 출고확정 + 부분 발송 (1/3)",
    status: "PREPARING_PACKED",
    paymentStatus: "PAID",
    paymentMethod: "CARD",
    customerId: customerCorp.id,
    expectedShipDate: dayOffset(-1), // 지연
    trackingCarrier: "CJ대한통운",
    trackingNumber: "1234567890",
    items: [
      {
        productId: products[3].id,
        quantity: 3,
        unitPrice: 25000,
        shippedQty: 1,
      },
    ],
  });

  // 시나리오 5: SHIPPED 배송중
  await createOrder({
    label: "SHIPPED 배송중",
    status: "SHIPPED",
    paymentStatus: "PAID",
    paymentMethod: "CARD",
    customerId: customerCorp.id,
    expectedShipDate: dayOffset(-2),
    trackingCarrier: "CJ대한통운",
    trackingNumber: "9999000011",
    items: [
      {
        productId: products[0].id,
        quantity: 2,
        unitPrice: 50000,
        shippedQty: 2,
      },
    ],
  });

  // 시나리오 6: COMPLETED 배송완료
  await createOrder({
    label: "COMPLETED 배송완료",
    status: "COMPLETED",
    paymentStatus: "PAID",
    paymentMethod: "CASH",
    customerId: customerIndiv.id,
    items: [
      {
        productId: products[2].id,
        quantity: 5,
        unitPrice: 18000,
        shippedQty: 5,
      },
    ],
  });

  // 시나리오 7: COMPLETED + 부분 반품 (5개 중 1개 반품)
  await createOrder({
    label: "COMPLETED + 부분 반품 (1/5)",
    status: "COMPLETED",
    paymentStatus: "PARTIAL_REFUND",
    paymentMethod: "CARD",
    customerId: customerIndiv.id,
    items: [
      {
        productId: products[3].id,
        quantity: 5,
        unitPrice: 25000,
        shippedQty: 5,
        returnedQty: 1,
        refundedAmount: 25000,
      },
    ],
  });

  // 시나리오 8: RETURN_REQUESTED 반품 요청
  await createOrder({
    label: "RETURN_REQUESTED 반품요청 — 매장 결정 대기",
    status: "RETURN_REQUESTED",
    paymentStatus: "PAID",
    paymentMethod: "CARD",
    customerId: customerIndiv.id,
    claimType: "REFUND",
    claimReason: "DEFECTIVE",
    returnReason: "포장 뜯었더니 작동 안 함",
    returnRequestedAt: dayOffset(-1),
    items: [
      {
        productId: products[0].id,
        quantity: 1,
        unitPrice: 50000,
        shippedQty: 1,
      },
    ],
  });

  // 시나리오 9: RETURN_ACCEPTED 회수 대기
  await createOrder({
    label: "RETURN_ACCEPTED 회수대기",
    status: "RETURN_ACCEPTED",
    paymentStatus: "PAID",
    paymentMethod: "CARD",
    channelId: channel.id,
    channelOrderNo: `${PREFIX}CH-002`,
    customerId: customerCorp.id,
    claimType: "REFUND",
    claimReason: "DAMAGED_IN_TRANSIT",
    returnRequestedAt: dayOffset(-3),
    returnAcceptedAt: dayOffset(-2),
    items: [
      {
        productId: products[1].id,
        quantity: 2,
        unitPrice: 12000,
        shippedQty: 2,
      },
    ],
  });

  // 시나리오 10: RETURN_INSPECTED + REFUND_PENDING
  await createOrder({
    label: "RETURN_INSPECTED 검수완료 + 환불진행",
    status: "RETURN_INSPECTED",
    paymentStatus: "REFUND_PENDING",
    paymentMethod: "CARD",
    customerId: customerIndiv.id,
    claimType: "REFUND",
    claimReason: "CHANGE_MIND",
    returnRequestedAt: dayOffset(-5),
    returnAcceptedAt: dayOffset(-4),
    items: [
      {
        productId: products[2].id,
        quantity: 1,
        unitPrice: 18000,
        shippedQty: 1,
      },
    ],
  });

  // 시나리오 11: 외상 반품 종결 → SALES_CANCELLED
  await createOrder({
    label: "RETURNED 외상 매출취소",
    status: "RETURNED",
    paymentStatus: "SALES_CANCELLED",
    paymentMethod: "UNPAID",
    customerId: customerIndiv.id,
    claimType: "REFUND",
    claimReason: "WRONG_ITEM",
    returnRequestedAt: dayOffset(-6),
    items: [
      {
        productId: products[3].id,
        quantity: 2,
        unitPrice: 25000,
        shippedQty: 2,
        returnedQty: 2,
        refundedAmount: 50000,
      },
    ],
  });

  // 시나리오 12: EXCHANGED + 새 -EX 주문
  // 원본 주문 먼저, 그 다음 -EX 주문, 그리고 원본의 exchangeOrderId 갱신
  const exOriginal = await createOrder({
    label: "EXCHANGED 교환완료 — 원본",
    status: "EXCHANGED",
    paymentStatus: "PAID",
    paymentMethod: "CARD",
    customerId: customerIndiv.id,
    claimType: "EXCHANGE_SAME",
    claimReason: "DEFECTIVE",
    returnRequestedAt: dayOffset(-3),
    returnAcceptedAt: dayOffset(-2),
    exchangedAt: dayOffset(-1),
    items: [
      {
        productId: products[0].id,
        quantity: 1,
        unitPrice: 50000,
        shippedQty: 1,
        returnedQty: 1,
      },
    ],
  });
  const exNew = await prisma.order.create({
    data: {
      orderNo: `${exOriginal.orderNo}-EX`,
      status: "PENDING",
      paymentStatus: "PAID",
      paymentMethod: "CARD",
      fulfillmentType: "SHIPPING",
      expectedShipDate: dayOffset(2),
      customerId: customerIndiv.id,
      customerName: customerIndiv.name,
      customerPhone: customerIndiv.phone,
      recipientName: customerIndiv.name,
      recipientPhone: customerIndiv.phone,
      shippingAddress: customerIndiv.address,
      orderDate: today,
      subtotalAmount: 50000,
      discountAmount: 0,
      shippingFee: 0,
      taxAmount: 5000,
      totalAmount: 55000,
      commissionAmount: 0,
      memo: `교환 발송 — 원본 ${exOriginal.orderNo} (같은 상품)`,
      createdById: admin.id,
      items: {
        create: [
          {
            productId: products[0].id,
            quantity: 1,
            unitPrice: 50000,
            totalPrice: 50000,
          },
        ],
      },
    },
  });
  // 양방향 link
  await prisma.order.update({
    where: { id: exOriginal.id },
    data: { exchangeOrderId: exNew.id },
  });
  console.log(`    + ${exNew.orderNo} EXCHANGED 새 주문 (-EX) 자동 생성됨`);

  // 시나리오 13: CANCELLED
  await createOrder({
    label: "CANCELLED 취소",
    status: "CANCELLED",
    paymentStatus: "REFUNDED",
    paymentMethod: "CARD",
    customerId: customerIndiv.id,
    items: [{ productId: products[1].id, quantity: 2, unitPrice: 12000 }],
  });

  // 7) 보류 큐 1건 — 매핑 안 된 SKU
  await prisma.pendingChannelOrder.upsert({
    where: {
      channelId_channelOrderNo: {
        channelId: channel.id,
        channelOrderNo: `${PREFIX}PENDING-001`,
      },
    },
    update: {},
    create: {
      channelId: channel.id,
      channelOrderNo: `${PREFIX}PENDING-001`,
      status: "UNMAPPED_SKU",
      reason: "매핑 누락 SKU: NEW-PRODUCT-XYZ",
      rawPayload: {
        channelOrderNo: `${PREFIX}PENDING-001`,
        orderedAt: today.toISOString(),
        buyer: { name: "테스트 손님", phone: "010-9999-0000" },
        recipient: { name: "테스트 손님", address: "서울시 어딘가" },
        items: [
          {
            channelSku: "NEW-PRODUCT-XYZ",
            channelProductName: "신규 상품 X",
            quantity: 1,
            unitPrice: 30000,
          },
        ],
      },
    },
  });
  console.log(`  ✓ 보류 큐 1건 (UNMAPPED_SKU)`);

  console.log("\n[seed-scenarios] 완료. 브라우저에서 확인:");
  console.log("  - /orders        워크보드 (KPI 5개 + 그룹 필터 + 상태별 시나리오)");
  console.log("  - /orders/help   도움말 페이지");
  console.log("  - /channels/imports  채널 import / 매핑 / 보류 큐");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
