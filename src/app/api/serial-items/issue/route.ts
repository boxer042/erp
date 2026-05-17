import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma, SerialItemSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { nextSerialItemCode } from "@/lib/serial-item-code";
import { generateAccessToken } from "@/lib/serial-token";

/**
 * POS 카트의 라벨 발번. 두 종류를 한 번에 처리:
 *   - product items: trackable=true 인 상품을 quantity 만큼 SerialItem 발번 (source=SALE)
 *   - repair items: RepairTicket 별로 1장.
 *       · serialItemId 이미 있음 → 발번 안 하고 기존 코드 반환 (재출력 후보)
 *       · repairProductId 있음 → 그 productId 로 신규 발번 + 티켓에 연결 (source=REPAIR)
 *       · repairProductText 만 있음 → productId=null + displayName=text 로 발번 + 티켓에 연결
 *       · 셋 다 없음 → 발번 후보 아님 (skip)
 *
 * Response: 항목별 결과를 그대로 반환 (UI 다이얼로그가 재출력/신규/스킵 분류에 사용).
 */
const bodySchema = z.object({
  customerId: z.string().optional().nullable(),
  productItems: z
    .array(
      z.object({
        productId: z.string(),
        quantity: z.number().int().positive(),
      })
    )
    .default([]),
  repairTicketIds: z.array(z.string()).default([]),
  /** 사용자가 "건너뛰기" 선택한 수리 티켓 ID — 기존 라벨도 재출력 안 함 */
  skipRepairTicketIds: z.array(z.string()).default([]),
  /** 분석만 하고 실제 발번은 안 함. 다이얼로그 미리보기용. */
  dryRun: z.boolean().default(false),
});

interface IssuedLabel {
  code: string;
  productId: string | null;
  displayName: string;
  source: SerialItemSource;
  repairTicketId: string | null;
  /** 이번 호출에서 새로 발번됐는지 (false 면 기존 라벨 — 재출력 후보) */
  newlyIssued: boolean;
}

export async function POST(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const body = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { customerId, productItems, repairTicketIds, skipRepairTicketIds, dryRun } =
    parsed.data;
  const skipSet = new Set(skipRepairTicketIds);

  // 시리얼 조회 서비스 동의 확인 — 미동의(또는 미등록) 손님은 accessToken 없이 발급해
  // 라벨에 QR 이 인쇄되지 않게 한다. 손님이 추후 동의하면 [토큰 재발급]으로 활성화.
  let customerConsent = false;
  if (customerId) {
    const c = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { serialServiceConsent: true },
    });
    customerConsent = c?.serialServiceConsent ?? false;
  }
  const newToken = () => (customerConsent ? generateAccessToken() : null);

  // ── 사전 batch 조회 (N+1 회피) ────────────────────────────
  const productIds = Array.from(
    new Set(productItems.map((i) => i.productId)),
  );
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          name: true,
          trackable: true,
          warrantyMonths: true,
        },
      })
    : [];
  const productById = new Map(products.map((p) => [p.id, p]));

  const tickets = repairTicketIds.length
    ? await prisma.repairTicket.findMany({
        where: { id: { in: repairTicketIds } },
        select: {
          id: true,
          ticketNo: true,
          serialItemId: true,
          serialItem: {
            select: {
              id: true,
              code: true,
              productId: true,
              displayName: true,
              source: true,
              product: { select: { id: true, name: true } },
            },
          },
          repairProductId: true,
          repairProduct: {
            select: { id: true, name: true, warrantyMonths: true },
          },
          repairProductText: true,
        },
      })
    : [];
  const ticketById = new Map(tickets.map((t) => [t.id, t]));

  const now = new Date();
  const issued: IssuedLabel[] = [];

  // ── DryRun: 트랜잭션·DB write 없이 분석만 ─────────────
  if (dryRun) {
    for (const item of productItems) {
      const product = productById.get(item.productId);
      if (!product?.trackable) continue;
      for (let i = 0; i < item.quantity; i++) {
        issued.push({
          code: "(미발번)",
          productId: product.id,
          displayName: product.name,
          source: "SALE",
          repairTicketId: null,
          newlyIssued: true,
        });
      }
    }
    for (const ticketId of repairTicketIds) {
      if (skipSet.has(ticketId)) continue;
      const ticket = ticketById.get(ticketId);
      if (!ticket) continue;
      if (ticket.serialItem) {
        issued.push({
          code: ticket.serialItem.code,
          productId: ticket.serialItem.productId,
          displayName:
            ticket.serialItem.product?.name ??
            ticket.serialItem.displayName ??
            "(미상)",
          source: ticket.serialItem.source,
          repairTicketId: ticket.id,
          newlyIssued: false,
        });
        continue;
      }
      const useProduct = ticket.repairProduct;
      const useText = ticket.repairProductText?.trim();
      if (!useProduct && !useText) continue;
      issued.push({
        code: "(미발번)",
        productId: useProduct?.id ?? null,
        displayName: useProduct?.name ?? useText ?? "(미상)",
        source: "REPAIR",
        repairTicketId: ticket.id,
        newlyIssued: true,
      });
    }
    return NextResponse.json({
      labels: issued,
      dryRun: true,
      consentMissing: !!customerId && !customerConsent,
    });
  }

  // ── 실제 발번 ─────────────────────────────────────────
  await prisma.$transaction(async (tx) => {
    // 1) 상품 라벨 — trackable 만 발번. createMany 로 한 번에 적재.
    const productCreates: Prisma.SerialItemCreateManyInput[] = [];
    for (const item of productItems) {
      const product = productById.get(item.productId);
      if (!product?.trackable) continue;
      const warrantyEnds = product.warrantyMonths
        ? new Date(
            now.getFullYear(),
            now.getMonth() + product.warrantyMonths,
            now.getDate(),
          )
        : null;
      for (let i = 0; i < item.quantity; i++) {
        const code = await nextSerialItemCode(tx, now);
        productCreates.push({
          code,
          accessToken: newToken(),
          productId: product.id,
          customerId: customerId ?? null,
          source: "SALE",
          soldAt: now,
          warrantyEnds,
          status: "ACTIVE",
        });
        issued.push({
          code,
          productId: product.id,
          displayName: product.name,
          source: "SALE",
          repairTicketId: null,
          newlyIssued: true,
        });
      }
    }
    if (productCreates.length > 0) {
      await tx.serialItem.createMany({ data: productCreates });
    }

    // 2) 수리 라벨 — 티켓별 1장. skip 된 티켓은 처리 안 함.
    for (const ticketId of repairTicketIds) {
      if (skipSet.has(ticketId)) continue;
      const ticket = ticketById.get(ticketId);
      if (!ticket) continue;

      // 이미 시리얼 연결돼 있으면 신규 발번 없이 기존 코드 반환 (재출력 후보)
      if (ticket.serialItem) {
        issued.push({
          code: ticket.serialItem.code,
          productId: ticket.serialItem.productId,
          displayName:
            ticket.serialItem.product?.name ??
            ticket.serialItem.displayName ??
            "(미상)",
          source: ticket.serialItem.source,
          repairTicketId: ticket.id,
          newlyIssued: false,
        });
        continue;
      }

      // 발번 대상 결정 — repairProduct (자사 카탈로그 매핑) 우선, 없으면 repairProductText
      const useProduct = ticket.repairProduct;
      const useText = ticket.repairProductText?.trim();
      if (!useProduct && !useText) continue;

      const warrantyMonths = useProduct?.warrantyMonths ?? null;
      const warrantyEnds = warrantyMonths
        ? new Date(
            now.getFullYear(),
            now.getMonth() + warrantyMonths,
            now.getDate(),
          )
        : null;

      const code = await nextSerialItemCode(tx, now);
      const created = await tx.serialItem.create({
        data: {
          code,
          accessToken: newToken(),
          productId: useProduct?.id ?? null,
          displayName: useProduct ? null : (useText ?? null),
          customerId: customerId ?? null,
          source: "REPAIR",
          soldAt: now,
          warrantyEnds,
          status: "ACTIVE",
        },
      });
      await tx.repairTicket.update({
        where: { id: ticket.id },
        data: { serialItemId: created.id },
      });

      issued.push({
        code: created.code,
        productId: created.productId,
        displayName: useProduct?.name ?? useText ?? "(미상)",
        source: "REPAIR",
        repairTicketId: ticket.id,
        newlyIssued: true,
      });
    }
  });

  return NextResponse.json(
    { labels: issued, consentMissing: !!customerId && !customerConsent },
    { status: 201 },
  );
}
