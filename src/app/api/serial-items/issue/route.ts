import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { nextSerialItemCode } from "@/lib/serial-item-code";

/**
 * 카트의 trackable 상품 목록을 받아 SerialItem 발번.
 * 같은 productId를 quantity만큼 발번. 동일 카트 재요청은 클라이언트에서 fingerprint로 차단.
 *
 * Body:
 *   {
 *     customerId?: string,
 *     items: [{ productId: string, quantity: number }]
 *   }
 *
 * Response:
 *   { codes: [{ code, productId, productName }] }
 *
 * 발번된 SerialItem은 이 단계에선 orderItemId=null (장바구니 단계).
 * 결제 확정 시 OrderItem과 연결되도록 별도 처리 필요 (TODO).
 */
const bodySchema = z.object({
  customerId: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.string(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
});

export async function POST(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const body = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { customerId, items } = parsed.data;

  // trackable + warrantyMonths 정보 조회
  const productIds = Array.from(new Set(items.map((i) => i.productId)));
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      name: true,
      trackable: true,
      warrantyMonths: true,
    },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  // trackable이 아닌 상품은 발번 대상에서 제외
  const eligible = items.filter((i) => productById.get(i.productId)?.trackable);
  if (eligible.length === 0) {
    return NextResponse.json(
      { error: "발번 대상 상품(trackable=true)이 없습니다" },
      { status: 400 }
    );
  }

  const now = new Date();

  const created = await prisma.$transaction(async (tx) => {
    const results: Array<{ code: string; productId: string; productName: string }> = [];
    for (const item of eligible) {
      const product = productById.get(item.productId);
      if (!product) continue;

      const warrantyEnds = product.warrantyMonths
        ? new Date(
            now.getFullYear(),
            now.getMonth() + product.warrantyMonths,
            now.getDate()
          )
        : null;

      for (let i = 0; i < item.quantity; i++) {
        const code = await nextSerialItemCode(tx, now);
        await tx.serialItem.create({
          data: {
            code,
            productId: product.id,
            customerId: customerId ?? null,
            soldAt: now,
            warrantyEnds,
            status: "ACTIVE",
          },
        });
        results.push({
          code,
          productId: product.id,
          productName: product.name,
        });
      }
    }
    return results;
  });

  return NextResponse.json({ codes: created }, { status: 201 });
}
