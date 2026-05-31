import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * 확정 입고 단가 정정 — 마진(로트/소진)·거래처원장(매입 채무)·거래처상품 단가/히스토리(kind)
 * 소급 재계산 검증. 재고 사용 후에도 가능한 게 핵심이라 controlled fixture(Prisma) + API 호출로 검증.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient({ adapter });

test.describe("확정 입고 단가 정정", () => {
  const ids: Record<string, string> = {};

  test.afterAll(async () => {
    await prisma.supplierProductPriceHistory
      .deleteMany({ where: { supplierProductId: ids.sp } })
      .catch(() => {});
    await prisma.inventoryLot.deleteMany({ where: { id: ids.lot } }).catch(() => {});
    await prisma.supplierLedger
      .deleteMany({ where: { referenceId: ids.incoming } })
      .catch(() => {});
    await prisma.incoming.delete({ where: { id: ids.incoming } }).catch(() => {}); // cascades items
    await prisma.supplierProduct.delete({ where: { id: ids.sp } }).catch(() => {});
    await prisma.supplier.delete({ where: { id: ids.supplier } }).catch(() => {});
    await prisma.$disconnect();
  });

  test("정정 → 입고품목·로트·거래처원장·가격히스토리(kind) 소급 갱신", async ({
    page,
  }) => {
    const ts = Date.now();
    const user = await prisma.user.findFirst({ select: { id: true } });
    test.skip(!user, "테스트용 사용자 없음");

    const supplier = await prisma.supplier.create({
      data: { name: `정정테스트거래처${ts}` },
    });
    ids.supplier = supplier.id;
    const sp = await prisma.supplierProduct.create({
      data: {
        supplierId: supplier.id,
        name: `정정상품${ts}`,
        unitPrice: "1000",
        isTaxable: true,
      },
    });
    ids.sp = sp.id;
    const incoming = await prisma.incoming.create({
      data: {
        incomingNo: `IN-CORR-${ts}`,
        supplierId: supplier.id,
        incomingDate: new Date(),
        status: "CONFIRMED",
        createdById: user!.id,
        shippingCost: "0",
        shippingIsTaxable: false,
        shippingDeducted: false,
      },
    });
    ids.incoming = incoming.id;
    const item = await prisma.incomingItem.create({
      data: {
        incomingId: incoming.id,
        supplierProductId: sp.id,
        quantity: "1",
        unitPrice: "1000",
        totalPrice: "1000",
        unitCostSnapshot: "1000",
      },
    });
    ids.item = item.id;
    const lot = await prisma.inventoryLot.create({
      data: {
        supplierProductId: sp.id,
        incomingItemId: item.id,
        receivedQty: "1",
        remainingQty: "1",
        unitCost: "1000",
        receivedAt: new Date(),
        source: "INCOMING",
      },
    });
    ids.lot = lot.id;
    const ledger = await prisma.supplierLedger.create({
      data: {
        supplierId: supplier.id,
        date: new Date(),
        type: "PURCHASE",
        description: `입고 ${incoming.incomingNo}`,
        debitAmount: "1100", // 1000 + 10% VAT
        creditAmount: "0",
        balance: "1100",
        referenceId: incoming.id,
        referenceType: "INCOMING",
      },
    });
    ids.ledger = ledger.id;

    // 단가 1000 → 1200 정정 (CORRECTION = 오류 정정)
    const res = await page.request.put(`/api/incoming/${incoming.id}`, {
      data: {
        action: "correct-prices",
        corrections: [{ id: item.id, unitPrice: 1200, kind: "CORRECTION" }],
      },
    });
    expect(res.ok()).toBeTruthy();

    // 입고 품목 — 단가·합계·원가스냅샷 소급 갱신
    const itemAfter = await prisma.incomingItem.findUnique({ where: { id: item.id } });
    expect(Number(itemAfter?.unitPrice)).toBe(1200);
    expect(Number(itemAfter?.totalPrice)).toBe(1200);
    expect(Number(itemAfter?.unitCostSnapshot)).toBe(1200);

    // 로트 원가 — 마진 재계산의 출처
    const lotAfter = await prisma.inventoryLot.findUnique({ where: { id: lot.id } });
    expect(Number(lotAfter?.unitCost)).toBe(1200);

    // 거래처원장 매입(채무) — 새 totalWithTax (1200 + 120 VAT)
    const ledgerAfter = await prisma.supplierLedger.findUnique({
      where: { id: ledger.id },
    });
    expect(Number(ledgerAfter?.debitAmount)).toBe(1320);

    // 거래처상품 단가 + 가격 히스토리(kind=CORRECTION)
    const spAfter = await prisma.supplierProduct.findUnique({ where: { id: sp.id } });
    expect(Number(spAfter?.unitPrice)).toBe(1200);
    const history = await prisma.supplierProductPriceHistory.findFirst({
      where: { supplierProductId: sp.id, incomingId: incoming.id },
    });
    expect(history?.kind).toBe("CORRECTION"); // 정정 → 추세 분석서 제외 대상
    expect(Number(history?.oldPrice)).toBe(1000);
    expect(Number(history?.newPrice)).toBe(1200);
  });
});
