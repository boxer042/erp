import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { repairPartCreateSchema } from "@/lib/validators/repair-ticket";
import { consumeRepairPart } from "@/lib/repair-inventory";
import { isOversellAllowed } from "@/lib/inventory/fifo";
import { Prisma } from "@prisma/client";
import {
  applyUsageDelta,
  snapshotTicketUsage,
} from "@/lib/repair-diagnosis-usage";

// 수리 티켓에 부속 추가 — 추가 즉시 FIFO 재고 차감
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  const body = await request.json();
  const parsed = repairPartCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const ticket = await prisma.repairTicket.findUnique({
    where: { id },
    select: { id: true, ticketNo: true, status: true, diagnosisTemplateId: true },
  });
  if (!ticket) {
    return NextResponse.json({ error: "수리 티켓을 찾을 수 없습니다" }, { status: 404 });
  }
  if (ticket.status === "PICKED_UP" || ticket.status === "CANCELLED") {
    return NextResponse.json(
      { error: "완료/취소된 수리는 부속을 추가할 수 없습니다" },
      { status: 400 },
    );
  }

  // 자유부속(productId 없음) — 상품 조회·FIFO 차감 없이 이름/규격 직접 저장.
  // 카탈로그 부속은 기존대로 상품 검증 + FIFO.
  const isFreePart = !data.productId;

  const product = isFreePart
    ? null
    : await prisma.product.findUnique({
        where: { id: data.productId! },
        select: { id: true, name: true, sku: true },
      });
  if (!isFreePart && !product) {
    return NextResponse.json({ error: "상품을 찾을 수 없습니다" }, { status: 404 });
  }

  const allowOversell = await isOversellAllowed();

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 진단↔부속 frequency 추천 — 변경 전 snapshot
      const before = await snapshotTicketUsage(tx, id);

      // 자유부속은 합치지 않고 항상 새 행 (이름/규격이 매번 다를 수 있음)
      // 카탈로그 부속만 같은 productId 행 수량 증가 (카트 패턴)
      const existing = isFreePart
        ? null
        : await tx.repairPart.findFirst({
            where: { repairTicketId: id, productId: data.productId, status: data.status },
          });

      let resultPart;
      if (existing) {
        const additionalQty = data.quantity;
        // 추가 분량만큼 FIFO 차감 (existing 은 카탈로그 부속만 — product 보장)
        await consumeRepairPart(tx, existing.id, {
          ticketId: ticket.id,
          ticketNo: ticket.ticketNo,
          productId: product!.id,
          productName: product!.name,
          quantity: additionalQty,
        }, allowOversell);
        // 수량/총액 업데이트 (existing.consumedAt은 consumeRepairPart에서 갱신됨)
        const newQty = new Prisma.Decimal(existing.quantity).plus(additionalQty);
        const newTotal = newQty.times(existing.unitPrice);
        resultPart = await tx.repairPart.update({
          where: { id: existing.id },
          data: {
            quantity: newQty,
            totalPrice: newTotal,
          },
          include: { product: { select: { id: true, name: true, sku: true, imageUrl: true } } },
        });
      } else {
        // 신규 행 — 카탈로그 부속은 productId, 자유부속은 name/spec/presaleKind
        const part = await tx.repairPart.create({
          data: {
            repairTicketId: id,
            productId: data.productId ?? null,
            name: isFreePart ? data.name?.trim() || "부속" : null,
            spec: isFreePart ? data.spec?.trim() || null : null,
            presaleKind: isFreePart ? data.presaleKind ?? null : null,
            quantity: data.quantity,
            unitPrice: data.unitPrice,
            totalPrice: data.quantity * data.unitPrice,
            discount: data.discount,
            status: data.status,
          },
        });

        // 카탈로그 부속만 FIFO 차감. 자유부속은 재고 미차감 → /presale 에서 사후 정산.
        if (!isFreePart) {
          await consumeRepairPart(tx, part.id, {
            ticketId: ticket.id,
            ticketNo: ticket.ticketNo,
            productId: product!.id,
            productName: product!.name,
            quantity: data.quantity,
          }, allowOversell);
        }

        resultPart = await tx.repairPart.findUnique({
          where: { id: part.id },
          include: { product: { select: { id: true, name: true, sku: true, imageUrl: true } } },
        });
      }

      // 변경 후 snapshot → delta 적용 (set semantics, 토글·중복 추가에 robust)
      const after = await snapshotTicketUsage(tx, id);
      await applyUsageDelta(tx, before, after);

      return resultPart;
    }, { timeout: 30000, maxWait: 10000 });

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "부속 추가 실패" },
      { status: 400 },
    );
  }
}
