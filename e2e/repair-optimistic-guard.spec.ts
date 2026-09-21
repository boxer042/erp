import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
});

/**
 * 낙관 추가 직후 즉시 조작해도 tmp id 로 요청이 나가지 않아야 한다.
 * (이전: tmp-xxx 로 PATCH/DELETE → 404)
 */
test.describe("optimistic 행 조작 가드", () => {
  test.afterAll(async () => { await prisma.$disconnect(); });

  test("부속 추가 직후 수량 조작해도 tmp id 요청 404 없음", async ({ page }) => {
    const ts = Date.now();
    const user = await prisma.user.findFirst({ select: { id: true } });
    const product = await prisma.product.findFirst({ select: { id: true, name: true } });
    const ticket = await prisma.repairTicket.create({
      data: {
        ticketNo: `RTOG-${String(ts).slice(-7)}`,
        type: "ON_SITE", status: "REPAIRING",
        receivedAt: new Date(), createdById: user!.id,
      },
    });

    // tmp id 로 나가는 요청을 감시
    const badRequests: string[] = [];
    page.on("request", (r) => {
      if (/\/parts\/tmp-|\/labors\/tmp-/.test(r.url())) badRequests.push(`${r.method()} ${r.url()}`);
    });
    const notFound: string[] = [];
    page.on("response", (r) => {
      if (r.status() === 404 && /\/parts\/|\/labors\//.test(r.url())) notFound.push(r.url());
    });

    try {
      await page.goto(`/pos/repairs/${ticket.id}`);
      await page.getByText("부속", { exact: true }).first().waitFor({ timeout: 30_000 });

      // 검색으로 부속 추가
      await page.getByRole("button", { name: "검색" }).first().click();
      await page.getByPlaceholder(/상품명 또는 SKU/).fill(product!.name.slice(0, 4));
      await page.getByText(product!.name, { exact: true }).first().click();

      // 추가 직후 곧바로 수량 + 를 연타 (서버 응답 전 조작 시도)
      const plus = page.getByRole("button", { name: /증가|\+/ }).last();
      for (let i = 0; i < 3; i++) {
        await plus.click({ timeout: 3000 }).catch(() => {});   // 잠겨 있으면 무시됨
        await page.waitForTimeout(120);
      }
      await page.waitForTimeout(2500);

      expect(badRequests, `tmp id 요청 발생: ${badRequests.join(", ")}`).toHaveLength(0);
      expect(notFound, `404 발생: ${notFound.join(", ")}`).toHaveLength(0);

      // 실제로 부속은 정상 저장돼 있어야 함
      const parts = await prisma.repairPart.findMany({ where: { repairTicketId: ticket.id } });
      expect(parts.length).toBeGreaterThan(0);
      expect(parts[0].id.startsWith("tmp-")).toBe(false);
    } finally {
      // in-flight 요청이 남아 있으면 삭제가 deadlock 나므로 페이지를 먼저 닫고 재시도
      await page.close().catch(() => {});
      for (let i = 0; i < 5; i++) {
        try {
          await prisma.repairTicket.delete({ where: { id: ticket.id } });
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
  });
});
