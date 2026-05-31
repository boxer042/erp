import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * 선판매 영속화 (A-1) — OrderItem.presaleKind 가 결제 후에도 보존되고,
 * 사후 정리(reconcile) API 가 선판매 중고를 기술료 자유 라인과 구별 + 우선 노출하는지 검증.
 *
 * UI 흐름(presale-line.spec.ts)은 카트까지만 — 여기선 백엔드 영속/구별을 Prisma 직접 + API 로 검증.
 */

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? "",
});
const prisma = new PrismaClient({ adapter });

test.describe("선판매 영속화 — presaleKind + reconcile 구별", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("presaleKind='used' 가 reconcile 에서 기술료와 구별 + 우선 노출", async ({
    page,
  }) => {
    const ts = Date.now();
    const orderNo = `ORDTEST-PS${String(ts).slice(-7)}`;

    // Order.createdBy 필수 — 기존 유저 연결 (auth.setup 로 최소 1명 존재)
    const user = await prisma.user.findFirst({ select: { id: true } });
    expect(user, "개발 DB 에 유저가 있어야 함").toBeTruthy();

    // 1) 주문 + 2 자유 라인 직접 생성 (선판매 중고 / 기술료)
    const order = await prisma.order.create({
      data: {
        orderNo,
        orderDate: new Date(),
        status: "PENDING",
        createdById: user!.id,
        items: {
          create: [
            {
              serviceName: `기술료테스트${ts}`,
              presaleKind: null,
              quantity: "1",
              unitPrice: "10000",
              totalPrice: "10000",
            },
            {
              serviceName: `선판매중고테스트${ts}`,
              presaleKind: "used",
              quantity: "1",
              unitPrice: "50000",
              totalPrice: "50000",
            },
          ],
        },
      },
      include: { items: true },
    });
    const presaleItem = order.items.find((i) => i.presaleKind === "used");
    const laborItem = order.items.find((i) => i.presaleKind === null);
    expect(presaleItem, "선판매 라인이 presaleKind='used' 로 저장돼야 함").toBeTruthy();
    expect(laborItem).toBeTruthy();

    try {
      // 2) 사후 정리 API
      const res = await page.request.get("/api/used-items/reconcile");
      expect(res.ok()).toBeTruthy();
      const items = (await res.json()) as Array<{
        id: string;
        serviceName: string;
        presaleKind: string | null;
      }>;

      // 3) 선판매 라인은 presaleKind='used', 기술료 라인은 null 로 반환
      const gotPresale = items.find((i) => i.id === presaleItem!.id);
      const gotLabor = items.find((i) => i.id === laborItem!.id);
      expect(gotPresale, "선판매 라인이 reconcile 후보에 노출돼야 함").toBeTruthy();
      expect(gotPresale!.presaleKind).toBe("used");
      expect(gotLabor!.presaleKind).toBeNull();

      // 4) 우선 정렬 — 선판매(used)가 기술료(null)보다 앞
      const idxPresale = items.findIndex((i) => i.id === presaleItem!.id);
      const idxLabor = items.findIndex((i) => i.id === laborItem!.id);
      expect(idxPresale).toBeGreaterThanOrEqual(0);
      expect(idxLabor).toBeGreaterThanOrEqual(0);
      expect(idxPresale).toBeLessThan(idxLabor);
    } finally {
      // 5) 정리 — 주문 삭제 (OrderItem cascade)
      await prisma.order.delete({ where: { id: order.id } });
    }
  });
});
