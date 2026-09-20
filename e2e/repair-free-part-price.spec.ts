import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
});

/**
 * 수리 [직접추가] 모달이 선판매와 동일하게 PriceInputDialog 를 재사용하는지 검증.
 * VAT 포함가로 입력해도 DB 에는 세전(공급가액)으로 저장돼야 함.
 */
test.describe("수리 자유부속 — 가격 다이얼로그 재사용", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("[직접추가] → 금액 버튼 → PriceInputDialog(VAT 포함 입력) → 세전 저장", async ({ page }) => {
    const ts = Date.now();
    const user = await prisma.user.findFirst({ select: { id: true } });
    const ticket = await prisma.repairTicket.create({
      data: {
        ticketNo: `RTFP-${String(ts).slice(-7)}`,
        type: "ON_SITE",
        status: "REPAIRING",
        receivedAt: new Date(),
        createdById: user!.id,
      },
    });

    try {
      await page.goto(`/pos/repairs/${ticket.id}`);

      // 부속 카드의 [직접추가] (공임 카드에도 있으므로 첫 번째 = 부속)
      const addBtn = page.getByRole("button", { name: "직접추가" }).first();
      await addBtn.waitFor({ timeout: 30_000 });
      await addBtn.click();

      // 모달 — 부속명 입력
      await page.getByPlaceholder(/부속명/).fill(`중고 기화기 ${ts}`);

      // 금액 버튼 → PriceInputDialog 열림 (공급가액 필드 존재 = 재사용 확인)
      await page.getByRole("button", { name: /^금액/ }).click();
      await expect(page.getByText("공급가액 (세전)")).toBeVisible();

      // VAT 포함 11,000 입력 → 세전 10,000 로 환산돼야 함
      const grossField = page.locator('input[inputmode="numeric"]').last();
      await grossField.fill("11000");
      await page.getByRole("button", { name: "저장" }).click();

      // 모달의 금액 표시는 VAT 포함(11,000)
      await expect(page.getByRole("button", { name: /11,000/ })).toBeVisible();

      // 추가
      await page.getByRole("button", { name: "추가", exact: true }).click();

      // DB 검증 — 세전 10,000 저장 + 자유부속 마커
      await expect
        .poll(
          async () =>
            prisma.repairPart.findFirst({
              where: { repairTicketId: ticket.id },
              select: { unitPrice: true, productId: true, presaleKind: true, name: true },
            }),
          { timeout: 15_000 },
        )
        .not.toBeNull();

      const part = await prisma.repairPart.findFirst({
        where: { repairTicketId: ticket.id },
        select: { unitPrice: true, productId: true, presaleKind: true, name: true },
      });
      expect(Number(part!.unitPrice), "VAT 포함 11,000 → 세전 10,000 저장").toBe(10000);
      expect(part!.productId).toBeNull();
      expect(part!.presaleKind).toBe("used");
    } finally {
      await prisma.repairTicket.delete({ where: { id: ticket.id } });
    }
  });
});
