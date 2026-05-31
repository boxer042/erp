import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * 거래처 직출고 처리 (③b) — 택배 발송분(B)을 거래처 직송으로 확정:
 * 직송 입고 자동 생성·확정(거래처 매입·원가, 재고 0) + B 원가·발송·링크.
 * 거래처상품 미등록(첫 매입) 엣지케이스 — 임시 거래처상품 + 매핑 자동 생성 검증.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient({ adapter });

test.describe("거래처 직출고 처리", () => {
  const ids: { supplier?: string; order?: string; incoming?: string } = {};

  test.afterAll(async () => {
    await prisma.orderItem.deleteMany({ where: { orderId: ids.order } }).catch(() => {});
    await prisma.order.delete({ where: { id: ids.order } }).catch(() => {});
    if (ids.incoming) {
      await prisma.supplierLedger
        .deleteMany({ where: { referenceId: ids.incoming } })
        .catch(() => {});
      await prisma.incoming.delete({ where: { id: ids.incoming } }).catch(() => {}); // cascades items
    }
    // 임시 거래처상품(매핑 cascade) → 거래처
    await prisma.supplierProduct
      .deleteMany({ where: { supplierId: ids.supplier } })
      .catch(() => {});
    await prisma.supplier.delete({ where: { id: ids.supplier } }).catch(() => {});
    await prisma.$disconnect();
  });

  test("직출고 처리 → 직송 입고·거래처 매입·B원가·발송·임시 거래처상품 자동", async ({
    page,
  }) => {
    const ts = Date.now();
    const productsRes = await page.request.get("/api/products");
    const products = (await productsRes.json()) as Array<{
      id: string;
      sellingPrice: string;
      isCanonical?: boolean;
      productType?: string;
    }>;
    const p = Array.isArray(products)
      ? products.find(
          (x) =>
            Number(x.sellingPrice) > 0 &&
            !x.isCanonical &&
            x.productType !== "OPTION_PARENT" &&
            x.id,
        )
      : null;
    test.skip(!p, "테스트용 상품 없음");

    // 매핑 없는 새 거래처 (provisional 생성 경로 검증)
    const supplier = await prisma.supplier.create({
      data: { name: `직출고테스트거래처${ts}` },
    });
    ids.supplier = supplier.id;

    // 택배 발송 주문 (SHIPPING → PENDING)
    const orderRes = await page.request.post("/api/orders", {
      data: {
        orderDate: new Date().toISOString().slice(0, 10),
        fulfillmentType: "SHIPPING",
        paymentMethod: "CARD",
        items: [
          { quantity: "1", unitPrice: "20000", productId: (p as { id: string }).id, optionValueIds: [] },
        ],
      },
    });
    expect(orderRes.ok()).toBeTruthy();
    const order = (await orderRes.json()) as { id: string };
    ids.order = order.id;
    const items = await prisma.orderItem.findMany({
      where: { orderId: order.id },
      select: { id: true },
    });
    const orderItemId = items[0].id;

    // 거래처 직출고 처리 — 매입가 12,000
    const dsRes = await page.request.put(`/api/orders/${order.id}`, {
      data: {
        action: "process-dropship",
        supplierId: supplier.id,
        lines: [{ orderItemId, unitPrice: 12000 }],
      },
    });
    expect(dsRes.ok()).toBeTruthy();
    const ds = (await dsRes.json()) as { incomingId: string };
    ids.incoming = ds.incomingId;

    // 주문 — SHIPPED + DROPSHIP + 링크
    const orderAfter = await prisma.order.findUnique({
      where: { id: order.id },
      select: { status: true, procurementMode: true, dropshipIncomingId: true },
    });
    expect(orderAfter?.status).toBe("SHIPPED");
    expect(orderAfter?.procurementMode).toBe("DROPSHIP");
    expect(orderAfter?.dropshipIncomingId).toBe(ds.incomingId);

    // B 원가 = 매입단가
    const orderItemAfter = await prisma.orderItem.findUnique({ where: { id: orderItemId } });
    expect(Number(orderItemAfter?.unitCostSnapshot)).toBe(12000);

    // 직송 입고 — CONFIRMED·isDropship·재고 0
    const incoming = await prisma.incoming.findUnique({ where: { id: ds.incomingId } });
    expect(incoming?.isDropship).toBe(true);
    expect(incoming?.status).toBe("CONFIRMED");
    const lots = await prisma.inventoryLot.count({
      where: { incomingItem: { incomingId: ds.incomingId } },
    });
    expect(lots).toBe(0);

    // 거래처원장 매입 (VAT 포함)
    const ledger = await prisma.supplierLedger.findFirst({
      where: { referenceId: ds.incomingId, type: "PURCHASE" },
    });
    expect(ledger).not.toBeNull();
    expect(Number(ledger?.debitAmount)).toBe(13200); // 12000 + 10% VAT

    // 임시 거래처상품 + 매핑 자동 생성 (첫 매입 엣지케이스)
    const sp = await prisma.supplierProduct.findFirst({
      where: { supplierId: supplier.id, isProvisional: true },
    });
    expect(sp).not.toBeNull();
    const mapping = await prisma.productMapping.findFirst({
      where: { productId: (p as { id: string }).id, supplierProductId: sp?.id },
    });
    expect(mapping).not.toBeNull();
  });
});
