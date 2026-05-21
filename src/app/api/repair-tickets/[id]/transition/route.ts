import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { calcRepairTotals, genApprovalToken } from "@/lib/repair";
import { restoreRepairPart } from "@/lib/repair-inventory";
import { learnDiagnosisPartSet } from "@/lib/repair-diagnosis-usage";
import { rebalanceCustomerLedger } from "@/lib/customer-ledger";
import type {
  RepairApprovalMethod,
  OrderPaymentMethod,
  RepairCancelReason,
  QuoteRejectReason,
} from "@prisma/client";

type Action =
  | "diagnose"
  | "quote"
  | "approve"
  | "request-approval"
  | "start"
  | "ready"
  | "pickup"
  | "reject_after_quote"
  | "cancel";

// 부속·공임 합계 → 수리 보증 만료 = 픽업 시점 + repairWarrantyMonths
function addMonths(d: Date, months: number) {
  const r = new Date(d);
  r.setMonth(r.getMonth() + months);
  return r;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = (request.nextUrl.searchParams.get("action") || body?.action) as Action;
  if (!action) return NextResponse.json({ error: "action 필수" }, { status: 400 });

  const ticket = await prisma.repairTicket.findUnique({
    where: { id },
    include: { parts: true, labors: true },
  });
  if (!ticket) return NextResponse.json({ error: "찾을 수 없음" }, { status: 404 });

  try {
    if (action === "diagnose") {
      // RECEIVED → DIAGNOSING (DROP_OFF만 의미. ON_SITE는 보통 스킵)
      if (ticket.status !== "RECEIVED") {
        return NextResponse.json(
          { error: "접수 상태에서만 진단 시작 가능합니다" },
          { status: 400 },
        );
      }
      const updated = await prisma.repairTicket.update({
        where: { id },
        data: { status: "DIAGNOSING" },
      });
      return NextResponse.json(updated);
    }

    if (action === "quote") {
      // 견적 확정: USED 부속만 합산, 공임 합산 → QUOTED
      if (!["RECEIVED", "DIAGNOSING", "QUOTED"].includes(ticket.status)) {
        return NextResponse.json(
          { error: "견적 확정 가능한 상태가 아닙니다" },
          { status: 400 },
        );
      }
      const partsAmount = ticket.parts
        .filter((p) => p.status === "USED")
        .reduce((s, p) => s + Number(p.totalPrice), 0);
      const laborAmount = ticket.labors.reduce((s, l) => s + Number(l.totalPrice), 0);
      const updated = await prisma.repairTicket.update({
        where: { id },
        data: {
          status: "QUOTED",
          quotedPartsAmount: partsAmount,
          quotedLaborAmount: laborAmount,
          quotedTotalAmount: partsAmount + laborAmount,
          quotedAt: new Date(),
        },
      });
      return NextResponse.json(updated);
    }

    if (action === "request-approval") {
      // 견적 확정된 티켓에 대해서만 원격 승인 토큰 발급
      if (ticket.status !== "QUOTED") {
        return NextResponse.json(
          { error: "견적 확정 후에만 승인 링크를 발급할 수 있습니다" },
          { status: 400 },
        );
      }
      const token = genApprovalToken();
      const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
      const updated = await prisma.repairTicket.update({
        where: { id },
        data: {
          approvalMethod: "REMOTE" as RepairApprovalMethod,
          approvalToken: token,
          approvalTokenExpiresAt: expires,
        },
      });
      return NextResponse.json({
        ticketNo: updated.ticketNo,
        approvalToken: token,
        approvalUrl: `${request.nextUrl.origin}/repair/approve/${token}`,
      });
    }

    if (action === "approve") {
      const { approvedByName } = body ?? {};
      if (!["QUOTED", "RECEIVED", "DIAGNOSING"].includes(ticket.status)) {
        return NextResponse.json({ error: "견적 승인 단계가 아닙니다" }, { status: 400 });
      }
      // 현장 승인 시 발급돼 있던 원격 승인 토큰은 더 이상 유효하지 않으므로 무효화
      const updated = await prisma.repairTicket.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvalMethod: "ON_SITE" as RepairApprovalMethod,
          approvedAt: new Date(),
          approvedByName: approvedByName?.trim() || null,
          approvalToken: null,
          approvalTokenExpiresAt: null,
        },
      });
      return NextResponse.json(updated);
    }

    if (action === "start") {
      // 수리 착수 — 부속은 추가 시점에 이미 차감됐으니 여기선 상태만 전환
      if (!["APPROVED", "RECEIVED", "DIAGNOSING"].includes(ticket.status)) {
        return NextResponse.json({ error: "수리 시작 가능한 상태가 아닙니다" }, { status: 400 });
      }
      const updated = await prisma.repairTicket.update({
        where: { id },
        data: { status: "REPAIRING", startedAt: ticket.startedAt ?? new Date() },
      });
      return NextResponse.json(updated);
    }

    if (action === "ready") {
      if (!["REPAIRING", "APPROVED"].includes(ticket.status)) {
        return NextResponse.json({ error: "수리 중이 아닙니다" }, { status: 400 });
      }
      const updated = await prisma.repairTicket.update({
        where: { id },
        data: { status: "READY", readyAt: new Date() },
      });
      return NextResponse.json(updated);
    }

    if (action === "pickup") {
      // 픽업 + 결제 — finalAmount는 항상 서버에서 calcRepairTotals 로 재계산 (클라이언트 입력 신뢰 안 함).
      // 클라이언트에 보낸 값은 사용 안 하지만, 호출 측이 표시용으로 보내는 건 허용.
      const { paymentMethod } = body ?? {};
      if (!["READY", "REPAIRING"].includes(ticket.status)) {
        return NextResponse.json({ error: "픽업 단계가 아닙니다" }, { status: 400 });
      }
      const totals = calcRepairTotals({
        parts: ticket.parts,
        labors: ticket.labors,
        diagnosisFee: ticket.diagnosisFee,
        totalDiscount: ticket.totalDiscount,
      });
      const finalAmt = totals.finalTotal; // calcRepairTotals 가 이미 Math.max(0, ...) 적용

      // 보증 만료 계산 — repairWarrantyMonths가 설정돼 있을 때만
      const pickupAt = new Date();
      const warrantyEnds =
        ticket.repairWarrantyMonths != null && ticket.repairWarrantyMonths > 0
          ? addMonths(pickupAt, ticket.repairWarrantyMonths)
          : null;

      const updated = await prisma.repairTicket.update({
        where: { id },
        data: {
          status: "PICKED_UP",
          pickedUpAt: pickupAt,
          finalAmount: finalAmt,
          paymentMethod: (paymentMethod as OrderPaymentMethod) ?? null,
          repairWarrantyEnds: warrantyEnds,
          // 픽업 후 원격 승인 토큰은 더 이상 의미 없음 — 일회용 보장
          approvalToken: null,
          approvalTokenExpiresAt: null,
        },
      });

      // 세트 학습 — 확정된 케이스의 (진단, 부속 묶음, 공임 묶음) 통계 누적.
      // 실패해도 픽업/결제 자체엔 영향 없게 silent.
      try {
        await prisma.$transaction(async (tx) => {
          await learnDiagnosisPartSet(tx, id);
        });
      } catch {
        /* 통계 실패는 무시 */
      }

      if (paymentMethod === "UNPAID" && ticket.customerId) {
        // date 는 pickedUpAt 으로 명시 (현재 픽업 처리 시각). RECEIPT(자정) 와 정렬 일관성 보장.
        const customerId = ticket.customerId;
        await prisma.$transaction(async (tx) => {
          const last = await tx.customerLedger.findFirst({
            where: { customerId },
            orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          });
          const prevBalance = last ? Number(last.balance) : 0;
          // 거절·진단비 케이스 라벨 분기 — 원장에서 정상 수리 매출과 구분 (사후 분석/정산 시 명확)
          const description = ticket.quoteRejectedAt
            ? `수리 ${ticket.ticketNo} (거절·진단비)`
            : `수리 ${ticket.ticketNo}`;
          await tx.customerLedger.create({
            data: {
              customerId,
              date: pickupAt,
              type: "SALE",
              description,
              debitAmount: finalAmt,
              creditAmount: 0,
              balance: prevBalance + finalAmt,
              referenceId: ticket.id,
              referenceType: "REPAIR_TICKET",
            },
          });
          await rebalanceCustomerLedger(tx, customerId);
        });
      }
      return NextResponse.json(updated);
    }

    if (action === "reject_after_quote") {
      // 손님이 수리를 거절 — 진단비만 청구하고 인계대기로 직행.
      // 허용 상태:
      //   - DROP_OFF: DIAGNOSING, QUOTED (승인 전 단계)
      //   - ON_SITE: REPAIRING (새수리 드로워가 바로 REPAIRING 진입시킴 — 이 단계가 거절 가능 지점)
      // → READY 로 직행 (APPROVED/완료 건너뜀). 픽업/결제 시 calcRepairTotals 의 effectiveDiagnosisFee 가 진단비만 청구.
      // 부속·공임이 등록돼 있으면 차감된 재고가 남아있는 상태에서 결제만 빠지므로 차단
      // (이 경우엔 cancel 액션 + CUSTOMER_DECLINED 사용 — 재고 복원 수행).
      const allowed =
        ticket.status === "DIAGNOSING" ||
        ticket.status === "QUOTED" ||
        (ticket.status === "REPAIRING" && ticket.type === "ON_SITE");
      if (!allowed) {
        return NextResponse.json(
          {
            error:
              "거절 가능한 단계가 아닙니다 (맡김 수리는 진단/견적 단계, 즉시 수리는 수리 진행 단계에서만 가능)",
          },
          { status: 400 },
        );
      }
      const hasUsedParts = ticket.parts.some((p) => p.status === "USED");
      const hasLabors = ticket.labors.length > 0;
      if (hasUsedParts || hasLabors) {
        return NextResponse.json(
          {
            error:
              "부속·공임이 등록된 견적은 그냥 거절할 수 없습니다. 부속·공임을 모두 제거하거나 수리 취소를 사용하세요",
          },
          { status: 400 },
        );
      }

      const quoteRejectReason = (body?.quoteRejectReason as
        | QuoteRejectReason
        | undefined) ?? null;
      const quoteRejectMemo =
        (body?.quoteRejectMemo as string | undefined)?.trim() || null;

      const updated = await prisma.repairTicket.update({
        where: { id },
        data: {
          status: "READY",
          readyAt: new Date(),
          quoteRejectReason,
          quoteRejectMemo,
          quoteRejectedAt: new Date(),
          // 픽업 후 원격 승인 토큰은 더 이상 의미 없음
          approvalToken: null,
          approvalTokenExpiresAt: null,
        },
      });
      return NextResponse.json(updated);
    }

    if (action === "cancel") {
      // 취소 불가 상태 — 데이터 무결성 보호
      if (ticket.status === "PICKED_UP") {
        return NextResponse.json(
          { error: "이미 픽업/결제가 완료된 수리는 취소할 수 없습니다" },
          { status: 400 },
        );
      }
      if (ticket.status === "CANCELLED") {
        return NextResponse.json(
          { error: "이미 취소된 수리입니다" },
          { status: 400 },
        );
      }
      if (ticket.status === "READY") {
        return NextResponse.json(
          { error: "인계대기 상태는 취소할 수 없습니다. 픽업/결제로 마무리하세요" },
          { status: 400 },
        );
      }

      const cancelReason = (body?.cancelReason as RepairCancelReason | undefined) ?? null;
      const cancelMemo = (body?.cancelMemo as string | undefined)?.trim() || null;

      // 보존 가치 판단 — 다음 중 하나라도 해당하면 데이터 보존(soft delete = CANCELLED)
      //   1. 등록 고객 (분쟁/통계 대응)
      //   2. 시리얼 라벨 부착됨 (기기 단위 평생 추적 — 다음 수리 시 SerialHistoryCard)
      //   3. LOST 부속 있음 (회계상 매출원가 손실 기록)
      //   4. 진단비 청구됨 (세무상 매출 5년 보존)
      //   5. PICKED_UP 이력 — cancel 자체가 차단되어 이 분기 안 옴
      //   6. 사유 = SOLD_AS_PRODUCT (상품 구매로 전환 — 마케팅/통계 가치 큼)
      // 위 모두 미해당 → 추적 의미 0 → 자동 hard delete.
      const hasLostParts = ticket.parts.some((p) => p.status === "LOST");
      const hasArchivalValue =
        !!ticket.customerId ||
        !!ticket.serialItemId ||
        hasLostParts ||
        Number(ticket.diagnosisFee) > 0 ||
        cancelReason === "SOLD_AS_PRODUCT";
      const autoHardDelete = !hasArchivalValue;

      // 취소 — USED 부속만 재고 복원. LOST 는 이미 손실 처리된 부속이므로 그대로 남김
      // (다시 차감되면 손실 추적이 어긋남). cancel 은 결제 흐름을 안 거치므로 청구 0 —
      // 진단비를 청구하려면 cancel 이 아니라 reject_after_quote(진단비만 청구) 를 쓴다.
      await prisma.$transaction(async (tx) => {
        for (const part of ticket.parts) {
          if (part.status !== "USED") continue;
          if (!part.consumedAt) continue;
          await restoreRepairPart(tx, part.id, {
            ticketId: ticket.id,
            ticketNo: ticket.ticketNo,
            productId: part.productId,
            productName: "수리 부속",
            quantity: Number(part.quantity),
            reason: "수리 취소",
          });
          await tx.repairPart.update({
            where: { id: part.id },
            data: { consumedAt: null, unitCostSnapshot: null },
          });
        }

        if (autoHardDelete) {
          // RepairPart 는 onDelete: Cascade 라 자동 삭제됨
          await tx.repairTicket.delete({ where: { id } });
        } else {
          await tx.repairTicket.update({
            where: { id },
            data: {
              status: "CANCELLED",
              cancelReason: cancelReason ?? null,
              cancelMemo,
              cancelledAt: new Date(),
              approvalToken: null,
              approvalTokenExpiresAt: null,
            },
          });
        }
      });
      return NextResponse.json({
        success: true,
        hardDeleted: autoHardDelete,
      });
    }

    return NextResponse.json({ error: "알 수 없는 action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "오류" },
      { status: 400 },
    );
  }
}
