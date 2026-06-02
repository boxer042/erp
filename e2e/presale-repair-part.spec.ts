import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Phase C — 수리 자유부속 → 선판매(/presale) 정산 검증.
 *
 * 자유부속(productId=null, presaleKind="used")이 결제완료(PICKED_UP) 티켓에서
 * /api/presale 에 sourceType="repair" 로 노출되고, POST 로 UsedItem 생성 +
 * RepairPart.unitCostSnapshot 보정 + repairPartId link 가 되는지 백엔드 검증.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient({ adapter });

test.describe("Phase C — 수리 자유부속 선판매 정산", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("자유부속 → /presale(repair) 노출 + 정산 시 UsedItem+원가보정+link", async ({ page }) => {
    const ts = Date.now();
    const user = await prisma.user.findFirst({ select: { id: true } });
    expect(user).toBeTruthy();

    // 1) 결제완료 티켓 + 자유부속(productId=null, presaleKind=used) 직접 생성
    const ticket = await prisma.repairTicket.create({
      data: {
        ticketNo: `RTPC-${String(ts).slice(-8)}`,
        type: "ON_SITE",
        status: "PICKED_UP",
        receivedAt: new Date(),
        pickedUpAt: new Date(),
        createdById: user!.id,
        parts: {
          create: [
            {
              productId: null,
              name: `중고기화기${ts}`,
              spec: "SD225R",
              presaleKind: "used",
              quantity: "1",
              unitPrice: "15000",
              totalPrice: "15000",
              status: "USED",
            },
          ],
        },
      },
      include: { parts: true },
    });
    const part = ticket.parts[0];
    expect(part.productId).toBeNull();

    try {
      // 2) /api/presale GET — 자유부속이 sourceType=repair 로 노출
      const res = await page.request.get("/api/presale");
      expect(res.ok()).toBeTruthy();
      const rows = (await res.json()) as Array<{
        id: string;
        sourceType: string;
        name: string;
        spec: string | null;
        presaleKind: string | null;
      }>;
      const got = rows.find((r) => r.id === part.id);
      expect(got, "자유부속이 선판매 목록에 노출돼야 함").toBeTruthy();
      expect(got!.sourceType).toBe("repair");
      expect(got!.spec).toBe("SD225R");
      expect(got!.presaleKind).toBe("used");

      // 3) POST 정산 — UsedItem 생성 + 원가 보정 + link
      const post = await page.request.post("/api/presale", {
        data: {
          sourceType: "repair",
          lineId: part.id,
          displayName: `중고기화기${ts}`,
          acquiredCost: "8000",
        },
      });
      expect(post.ok(), `정산 실패: ${await post.text()}`).toBeTruthy();
      const usedItem = (await post.json()) as { id: string; repairPartId: string | null; status: string };

      // 4) 검증 — UsedItem.repairPartId link + status SOLD
      expect(usedItem.repairPartId).toBe(part.id);
      expect(usedItem.status).toBe("SOLD");

      // 5) RepairPart.unitCostSnapshot 보정 (8000 / 1)
      const updatedPart = await prisma.repairPart.findUnique({
        where: { id: part.id },
        select: { unitCostSnapshot: true },
      });
      expect(Number(updatedPart!.unitCostSnapshot)).toBe(8000);

      // 6) 정산된 부속은 더 이상 /presale 에 안 뜸 (soldUsedItem 필터)
      const res2 = await page.request.get("/api/presale");
      const rows2 = (await res2.json()) as Array<{ id: string }>;
      expect(rows2.find((r) => r.id === part.id)).toBeUndefined();

      // cleanup — UsedItem 먼저 (FK)
      await prisma.usedItem.delete({ where: { id: usedItem.id } });
    } finally {
      await prisma.repairTicket.delete({ where: { id: ticket.id } });
    }
  });
});
