import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * 거래처 직송 입고 — 확정 시 재고(InventoryLot/Movement/Inventory)는 안 만들고
 * 거래처원장 매입(채무) + 원가 스냅샷은 정상 기록. 일반 입고(직송 X)는 기존대로 로트 생성(무regression).
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient({ adapter });

test.describe("거래처 직송 입고", () => {
  const ids: { supplier?: string; sp?: string; incomings: string[] } = { incomings: [] };

  test.afterAll(async () => {
    for (const inc of ids.incomings) {
      const items = await prisma.incomingItem.findMany({
        where: { incomingId: inc },
        select: { id: true },
      });
      const itemIds = items.map((i) => i.id);
      await prisma.inventoryLot
        .deleteMany({ where: { incomingItemId: { in: itemIds } } })
        .catch(() => {});
      await prisma.inventoryMovement
        .deleteMany({ where: { referenceId: inc } })
        .catch(() => {});
      await prisma.supplierLedger.deleteMany({ where: { referenceId: inc } }).catch(() => {});
      await prisma.incoming.delete({ where: { id: inc } }).catch(() => {}); // cascades items
    }
    await prisma.supplierProductPriceHistory
      .deleteMany({ where: { supplierProductId: ids.sp } })
      .catch(() => {});
    await prisma.supplierProduct.delete({ where: { id: ids.sp } }).catch(() => {});
    await prisma.supplier.delete({ where: { id: ids.supplier } }).catch(() => {});
    await prisma.$disconnect();
  });

  async function makeIncoming(isDropship: boolean, ts: number, userId: string) {
    const incoming = await prisma.incoming.create({
      data: {
        incomingNo: `IN-DS-${isDropship ? "D" : "N"}-${ts}`,
        supplierId: ids.supplier!,
        incomingDate: new Date(),
        status: "PENDING",
        createdById: userId,
        isDropship,
      },
    });
    ids.incomings.push(incoming.id);
    const item = await prisma.incomingItem.create({
      data: {
        incomingId: incoming.id,
        supplierProductId: ids.sp!,
        quantity: "2",
        unitPrice: "5000",
        totalPrice: "10000",
      },
    });
    return { incoming, item };
  }

  test("직송 확정 → 재고 0 + 거래처원장 매입 O / 일반 확정 → 로트 O", async ({ page }) => {
    const ts = Date.now();
    const user = await prisma.user.findFirst({ select: { id: true } });
    test.skip(!user, "테스트용 사용자 없음");
    const supplier = await prisma.supplier.create({ data: { name: `직송테스트${ts}` } });
    ids.supplier = supplier.id;
    const sp = await prisma.supplierProduct.create({
      data: { supplierId: supplier.id, name: `직송상품${ts}`, unitPrice: "5000", isTaxable: true },
    });
    ids.sp = sp.id;

    // ── 직송 입고 확정 ──
    const ds = await makeIncoming(true, ts, user!.id);
    const dsRes = await page.request.put(`/api/incoming/${ds.incoming.id}`, {
      data: { action: "confirm" },
    });
    expect(dsRes.ok()).toBeTruthy();

    const dsLots = await prisma.inventoryLot.count({
      where: { incomingItemId: ds.item.id },
    });
    expect(dsLots).toBe(0); // 직송 — 재고 미생성
    const dsMoves = await prisma.inventoryMovement.count({
      where: { referenceId: ds.incoming.id },
    });
    expect(dsMoves).toBe(0); // 직송 — 재고 변동 없음
    const dsLedger = await prisma.supplierLedger.findFirst({
      where: { referenceId: ds.incoming.id, type: "PURCHASE" },
    });
    expect(dsLedger).not.toBeNull(); // 거래처원장 매입(채무) O
    expect(Number(dsLedger?.debitAmount)).toBe(11000); // 10000 + 10% VAT
    const dsItem = await prisma.incomingItem.findUnique({ where: { id: ds.item.id } });
    expect(dsItem?.unitCostSnapshot).not.toBeNull(); // 원가 스냅샷 O (B 마진용)

    // ── 일반 입고 확정 (무regression — 로트 생성) ──
    const nm = await makeIncoming(false, ts, user!.id);
    const nmRes = await page.request.put(`/api/incoming/${nm.incoming.id}`, {
      data: { action: "confirm" },
    });
    expect(nmRes.ok()).toBeTruthy();
    const nmLots = await prisma.inventoryLot.count({
      where: { incomingItemId: nm.item.id },
    });
    expect(nmLots).toBe(1); // 일반 — 오르판 로트 생성 (기존 동작 유지)
  });
});
