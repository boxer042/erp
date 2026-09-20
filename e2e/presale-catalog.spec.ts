import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
});

/**
 * 내상품(catalog) 선판매 정산 — 카탈로그 상품 연결 + 원가 보정 (+ 선택적 재고 차감).
 *  A) trackStock=false → 상품 연결 + 원가만. 재고 불변
 *  B) trackStock=true  → 상품 연결 + 원가 + FIFO 차감 (재고 없으면 적자)
 */
test.describe("내상품 선판매 정산", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  async function makeOrderLine(ts: number, userId: string) {
    return prisma.order.create({
      data: {
        orderNo: `ORDCAT-${String(ts).slice(-7)}`,
        orderDate: new Date(),
        status: "COMPLETED",
        customerName: "카탈로그테스트",
        createdById: userId,
        items: {
          create: [
            {
              serviceName: "미등록 신품 부품",
              presaleKind: "catalog",
              quantity: "2",
              unitPrice: "10000",
              totalPrice: "20000",
            },
          ],
        },
      },
      include: { items: true },
    });
  }

  test("A) 일회성(trackStock=false) — 상품 연결 + 원가만, 재고 불변", async ({ page }) => {
    const ts = Date.now();
    const user = await prisma.user.findFirst({ select: { id: true } });
    const product = await prisma.product.findFirst({ select: { id: true, name: true } });
    expect(product, "테스트용 상품이 최소 1개 필요").toBeTruthy();

    const before = await prisma.inventory.findUnique({
      where: { productId: product!.id },
      select: { quantity: true },
    });
    const order = await makeOrderLine(ts, user!.id);
    const line = order.items[0];

    try {
      // 목록 노출 확인
      const res = await page.request.get("/api/presale");
      const rows = (await res.json()) as Array<{ id: string; presaleKind: string }>;
      expect(rows.find((r) => r.id === line.id)?.presaleKind).toBe("catalog");

      // 정산 — 재고 미관리
      const post = await page.request.post("/api/presale", {
        data: {
          sourceType: "order",
          lineId: line.id,
          displayName: "미등록 신품 부품",
          acquiredCost: "12000",
          productId: product!.id,
          trackStock: false,
        },
      });
      expect(post.ok(), `정산 실패: ${await post.text()}`).toBeTruthy();

      // OrderItem 에 상품 연결 + 원가 보정 (12000 / 2 = 6000)
      const updated = await prisma.orderItem.findUnique({
        where: { id: line.id },
        select: { productId: true, unitCostSnapshot: true },
      });
      expect(updated!.productId).toBe(product!.id);
      expect(Number(updated!.unitCostSnapshot)).toBe(6000);

      // 재고 불변
      const after = await prisma.inventory.findUnique({
        where: { productId: product!.id },
        select: { quantity: true },
      });
      expect(Number(after?.quantity ?? 0)).toBe(Number(before?.quantity ?? 0));

      // 정산 후 목록에서 제외 (productId 채워짐)
      const res2 = await page.request.get("/api/presale");
      const rows2 = (await res2.json()) as Array<{ id: string }>;
      expect(rows2.find((r) => r.id === line.id)).toBeUndefined();
    } finally {
      await prisma.order.delete({ where: { id: order.id } });
    }
  });

  test("B) 재고관리(trackStock=true) — FIFO 차감 + LotConsumption", async ({ page }) => {
    const ts = Date.now() + 1;
    const user = await prisma.user.findFirst({ select: { id: true } });
    const product = await prisma.product.findFirst({ select: { id: true } });

    const before = await prisma.inventory.findUnique({
      where: { productId: product!.id },
      select: { quantity: true },
    });
    const order = await makeOrderLine(ts, user!.id);
    const line = order.items[0];

    try {
      const post = await page.request.post("/api/presale", {
        data: {
          sourceType: "order",
          lineId: line.id,
          displayName: "미등록 신품 부품",
          acquiredCost: "12000",
          productId: product!.id,
          trackStock: true,
        },
      });
      expect(post.ok(), `정산 실패: ${await post.text()}`).toBeTruthy();

      // 재고 2 감소 (적자 허용)
      const after = await prisma.inventory.findUnique({
        where: { productId: product!.id },
        select: { quantity: true },
      });
      expect(Number(after!.quantity)).toBe(Number(before?.quantity ?? 0) - 2);

      // LotConsumption 생성 (orderItemId 연결)
      const cons = await prisma.lotConsumption.count({ where: { orderItemId: line.id } });
      expect(cons, "FIFO 소비 기록이 있어야 함").toBeGreaterThan(0);
    } finally {
      // 재고 원복 + 주문 삭제 (LotConsumption 은 Cascade)
      await prisma.order.delete({ where: { id: order.id } });
      if (before) {
        await prisma.inventory.update({
          where: { productId: product!.id },
          data: { quantity: before.quantity },
        });
      }
    }
  });
});
