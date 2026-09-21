import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
});

/**
 * 수리 본문 4칸 구조 — 증상 / 원인 / 수리내용 / 특이사항.
 * 원인(diagnosis)은 부속·공임 추천의 열쇠라 작업 위, 수리내용·특이사항은 작업 아래.
 */
test.describe("수리 4칸 구조", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("수리내용·특이사항이 각각 제 필드에 저장된다", async ({ page }) => {
    const ts = Date.now();
    const user = await prisma.user.findFirst({ select: { id: true } });
    const ticket = await prisma.repairTicket.create({
      data: {
        ticketNo: `RT4F-${String(ts).slice(-7)}`,
        type: "ON_SITE",
        status: "REPAIRING",
        receivedAt: new Date(),
        createdById: user!.id,
      },
    });

    try {
      await page.goto(`/pos/repairs/${ticket.id}`);

      // 4칸 라벨이 모두 노출 + 순서 확인 (원인이 부속보다 위)
      for (const label of ["증상", "원인", "부속", "공임", "수리내용", "특이사항"]) {
        await expect(page.getByText(label, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
      }

      // 수리내용 입력 → blur 저장
      const content = page.getByPlaceholder(/기화기 세척 후 재조립/);
      await content.fill("기화기 세척 후 재조립");
      await content.blur();

      // 특이사항 입력 → blur 저장
      const notes = page.getByPlaceholder(/정상 범위를 벗어난 점/);
      await notes.fill("고객 상의 후 마무리");
      await notes.blur();

      // DB 검증 — 각각 다른 필드에 저장
      await expect
        .poll(
          async () => {
            const t = await prisma.repairTicket.findUnique({
              where: { id: ticket.id },
              select: { repairContent: true, repairNotes: true },
            });
            return `${t?.repairContent ?? ""}|${t?.repairNotes ?? ""}`;
          },
          { timeout: 15_000 },
        )
        .toBe("기화기 세척 후 재조립|고객 상의 후 마무리");
    } finally {
      await prisma.repairTicket.delete({ where: { id: ticket.id } });
    }
  });
});
