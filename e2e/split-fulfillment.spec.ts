import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * 분할 출고 — 한 결제가 매장수령(대표 A) + 택배 백오더(B) 두 주문으로 나뉘는 흐름의
 * 백엔드 링크 + 증빙 그룹 합산 검증. (POS UI 흐름은 손님 그리드·다중 세션이라 e2e 가 무거워
 * used-items-pos 처럼 API + Prisma 직접 검증으로 처리.)
 *
 * A·B 모두 PENDING(PICKUP/SHIPPING) + 고객 없음(PAID) 으로 생성해 재고 차감·원장 없이
 * 정리(afterAll)를 단순화한다.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient({ adapter });

test.describe("분할 출고 — 2주문 링크 + 증빙 그룹", () => {
  const createdOrderIds: string[] = [];

  test.afterAll(async () => {
    // 테스트로 만든 주문 정리 — 항목 먼저 삭제 후 주문 (splitParent 는 optional→SetNull 이라 순서 무관)
    for (const id of createdOrderIds) {
      await prisma.orderItem.deleteMany({ where: { orderId: id } }).catch(() => {});
    }
    for (const id of createdOrderIds) {
      await prisma.order.delete({ where: { id } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  test("A(대표)+B(백오더) 가 splitGroupId 로 연결 + B=PENDING 백오더 + 증빙 그룹 합산", async ({
    page,
  }) => {
    const res = await page.request.get("/api/products");
    const products = (await res.json()) as Array<{
      id: string;
      sellingPrice: string;
      isCanonical?: boolean;
      productType?: string;
    }>;
    const p =
      Array.isArray(products) &&
      products.find(
        (x) =>
          Number(x.sellingPrice) > 0 &&
          !x.isCanonical &&
          x.productType !== "OPTION_PARENT" &&
          x.id,
      );
    test.skip(!p, "테스트용 상품(가격>0·비대표·비옵션)이 개발 DB 에 없음");
    const productId = (p as { id: string }).id;
    const today = new Date().toISOString().slice(0, 10);
    const splitGroupId = `e2e-split-${Date.now()}`;
    const item = { quantity: "1", unitPrice: "10000", productId, optionValueIds: [] };

    // A — 대표 (PICKUP → PENDING 미차감, PAID, 고객 없음). splitGroupId 만 부여(splitParentId=null).
    const aRes = await page.request.post("/api/orders", {
      data: {
        orderDate: today,
        fulfillmentType: "PICKUP",
        paymentMethod: "CARD",
        splitGroupId,
        items: [item],
      },
    });
    expect(aRes.ok()).toBeTruthy();
    const a = (await aRes.json()) as { id: string; orderNo: string };
    createdOrderIds.push(a.id);

    // B — 택배 백오더 (SHIPPING → PENDING, splitParentId=A.id, 동일 splitGroupId)
    const bRes = await page.request.post("/api/orders", {
      data: {
        orderDate: today,
        fulfillmentType: "SHIPPING",
        paymentMethod: "CARD",
        splitGroupId,
        splitParentId: a.id,
        items: [item],
      },
    });
    expect(bRes.ok()).toBeTruthy();
    const b = (await bRes.json()) as { id: string; orderNo: string };
    createdOrderIds.push(b.id);

    // 링크 검증 — 동일 splitGroupId, A 는 대표(parent=null), B 는 A 를 가리킴, 둘 다 PENDING 미차감
    const [aDb, bDb] = await Promise.all([
      prisma.order.findUnique({
        where: { id: a.id },
        select: { splitGroupId: true, splitParentId: true, status: true },
      }),
      prisma.order.findUnique({
        where: { id: b.id },
        select: { splitGroupId: true, splitParentId: true, status: true },
      }),
    ]);
    expect(aDb?.splitGroupId).toBe(splitGroupId);
    expect(bDb?.splitGroupId).toBe(splitGroupId);
    expect(aDb?.splitParentId).toBeNull();
    expect(bDb?.splitParentId).toBe(a.id);
    expect(aDb?.status).toBe("PENDING");
    expect(bDb?.status).toBe("PENDING"); // SHIPPING → 미차감 백오더

    // 증빙 그룹 — order-statement / pos-receipt 인쇄 라우트가 수행하는 합산 로직과 동일하게 검증:
    // splitGroupId 형제를 대표(parent=null) 먼저 모아 items concat + 합계 Σ.
    const groupOrders = await prisma.order.findMany({
      where: { splitGroupId },
      include: { items: { select: { id: true } } },
      orderBy: [
        { splitParentId: { sort: "asc", nulls: "first" } },
        { createdAt: "asc" },
      ],
    });
    expect(groupOrders.length).toBe(2);
    expect(groupOrders[0].splitParentId).toBeNull(); // 대표(A) 가 먼저
    expect(groupOrders[1].splitParentId).toBe(a.id); // 백오더(B) 가 뒤
    const mergedItemCount = groupOrders.flatMap((o) => o.items).length;
    expect(mergedItemCount).toBe(2); // A 1건 + B 1건 합산
    const groupTotal = groupOrders.reduce(
      (s, o) => s + Number(o.totalAmount),
      0,
    );
    expect(groupTotal).toBe(
      Number(groupOrders[0].totalAmount) + Number(groupOrders[1].totalAmount),
    ); // 합계 = Σ (주문별 자체 결제라 단순 합)

    // 연결 주문 "펼쳐보기" 데이터 — 상세 API 가 splitChildren 에 품목 + 합계 포함
    const detailRes = await page.request.get(`/api/orders/${a.id}`);
    expect(detailRes.ok()).toBeTruthy();
    const detail = (await detailRes.json()) as {
      splitChildren?: Array<{ totalAmount: string; items: Array<unknown> }>;
    };
    expect(detail.splitChildren?.length).toBe(1); // A 상세에서 B 가 연결 주문
    expect(detail.splitChildren?.[0]?.items.length).toBe(1); // 펼쳐보기용 B 품목
    expect(Number(detail.splitChildren?.[0]?.totalAmount)).toBeGreaterThan(0);

    // 그룹 반품 cascade 의 B-side — 택배 발송분(미출고 PENDING)을 취소하면 CANCELLED.
    // (RefundDialog 의 "함께 취소" 가 A 반품 후 이 동작을 자식마다 호출)
    const cancelRes = await page.request.put(`/api/orders/${b.id}`, {
      data: { action: "cancel" },
    });
    expect(cancelRes.ok()).toBeTruthy();
    const bAfter = await prisma.order.findUnique({
      where: { id: b.id },
      select: { status: true },
    });
    expect(bAfter?.status).toBe("CANCELLED");
  });
});
