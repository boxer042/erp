import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

/**
 * 손님 카드 부활 — 수리관리·저장된상담 등에서 "이 손님 카드 열기" 시 호출.
 *
 * 입력 분기:
 *   - { posSessionId }   미등록 손님: 그 세션의 deletedAt/parkedAt 을 null 로 풀어 그리드 합류.
 *                                    같은 sessionId 유지 → RepairTicket.posSessionId 매칭 보존.
 *   - { customerId }     등록 고객: 활성 세션 있으면 그 id 반환, 없으면 새로 생성.
 *
 * 둘 다 있으면 posSessionId 우선 (가장 정확한 추적).
 */
export async function POST(request: NextRequest) {
  const [user, deny] = await guardUser();
  if (deny) return deny;

  const body = (await request.json()) as {
    posSessionId?: string;
    customerId?: string;
  };

  if (body.posSessionId) {
    const existing = await prisma.posSession.findFirst({
      where: { id: body.posSessionId, userId: user.id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "세션을 찾을 수 없습니다" },
        { status: 404 },
      );
    }
    const updated = await prisma.posSession.update({
      where: { id: existing.id },
      data: { deletedAt: null, parkedAt: null, updatedAt: new Date() },
    });
    return NextResponse.json({
      sessionId: updated.id,
      customerId: updated.customerId,
      customerName: updated.customerName,
      customerPhone: updated.customerPhone,
    });
  }

  if (body.customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: body.customerId },
      select: { id: true, name: true, phone: true },
    });
    if (!customer) {
      return NextResponse.json(
        { error: "고객을 찾을 수 없습니다" },
        { status: 404 },
      );
    }
    const active = await prisma.posSession.findFirst({
      where: {
        userId: user.id,
        customerId: customer.id,
        deletedAt: null,
        parkedAt: null,
      },
      orderBy: { updatedAt: "desc" },
    });
    if (active) {
      return NextResponse.json({
        sessionId: active.id,
        customerId: active.customerId,
        customerName: active.customerName,
        customerPhone: active.customerPhone,
      });
    }
    // 새 세션 — id 는 server 발번 (cuid)
    const created = await prisma.posSession.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        items: [],
      },
    });
    return NextResponse.json({
      sessionId: created.id,
      customerId: created.customerId,
      customerName: created.customerName,
      customerPhone: created.customerPhone,
    });
  }

  return NextResponse.json(
    { error: "posSessionId 또는 customerId 가 필요합니다" },
    { status: 400 },
  );
}
