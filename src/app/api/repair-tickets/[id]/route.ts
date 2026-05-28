import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, handleAuthError, guardUser } from "@/lib/api-auth";
import { repairTicketUpdateSchema } from "@/lib/validators/repair-ticket";
import { normalizeDiscountInput } from "@/lib/utils";
import {
  applyUsageDelta,
  snapshotTicketUsage,
} from "@/lib/repair-diagnosis-usage";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  const ticket = await prisma.repairTicket.findUnique({
    where: { id },
    include: {
      customer: true,
      customerMachine: true,
      serialItem: {
        include: {
          product: { select: { id: true, name: true, sku: true, imageUrl: true } },
          orderItem: {
            select: {
              id: true,
              order: {
                select: { id: true, orderNo: true, orderDate: true, totalAmount: true },
              },
            },
          },
        },
      },
      repairProduct: { select: { id: true, name: true, sku: true, imageUrl: true } },
      assignedTo: { select: { id: true, name: true } },
      parentRepairTicket: {
        select: { id: true, ticketNo: true, status: true, repairWarrantyEnds: true },
      },
      revisits: {
        select: { id: true, ticketNo: true, status: true, receivedAt: true },
        orderBy: { receivedAt: "desc" },
      },
      parts: {
        include: { product: { select: { id: true, name: true, sku: true } } },
        orderBy: { createdAt: "asc" },
      },
      labors: { orderBy: { createdAt: "asc" } },
      order: {
        select: {
          id: true,
          orderNo: true,
          totalAmount: true,
          paymentMethod: true,
          status: true,
          createdAt: true,
        },
      },
      createdBy: { select: { id: true, name: true } },
      repairCategory: { select: { id: true, name: true } },
    },
  });
  if (!ticket) return NextResponse.json({ error: "찾을 수 없음" }, { status: 404 });
  return NextResponse.json(ticket);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await request.json();
    const parsed = repairTicketUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;

    // serialItem / repairProduct / repairProductText 는 동시에 두 개 이상 set 될 수 없음.
    // UI는 한쪽 set 시 나머지를 null로 보내지만, 외부 호출 보호용 가드.
    const productSourceCount = [
      d.serialItemId,
      d.repairProductId,
      d.repairProductText?.trim(),
    ].filter((v) => v != null && v !== "").length;
    if (productSourceCount > 1) {
      return NextResponse.json(
        {
          error:
            "시리얼·상품·직접입력 중 하나만 설정할 수 있습니다 (다른 항목은 null로 보내세요)",
        },
        { status: 400 },
      );
    }

    // 증상·진단 텍스트 변경 시 template 자동 매칭/생성 + 관계 link upsert.
    // 카테고리(repairCategoryId) 컨텍스트로 template 격리 — 같은 텍스트라도 카테고리별 별개.
    const ticket = await prisma.$transaction(async (tx) => {
      // 현재 카테고리 ID 확보 (변경분에 없으면 기존 값 사용)
      const current = await tx.repairTicket.findUnique({
        where: { id },
        select: {
          repairCategoryId: true,
          symptom: true,
          diagnosis: true,
          symptomTemplateId: true,
          diagnosisTemplateId: true,
        },
      });
      if (!current) throw new Error("RepairTicket not found");

      const nextCategoryId =
        d.repairCategoryId !== undefined
          ? d.repairCategoryId || null
          : current.repairCategoryId;

      // 증상 template resolve — text 변경되었거나 카테고리 변경된 경우 재매칭
      let symptomTemplateIdPatch: { symptomTemplateId: string | null } | null = null;
      if (d.symptom !== undefined) {
        const text = d.symptom?.trim() ?? "";
        if (!text) {
          symptomTemplateIdPatch = { symptomTemplateId: null };
        } else {
          const tpl = await upsertSymptomTemplate(tx, text, nextCategoryId, user.id);
          symptomTemplateIdPatch = { symptomTemplateId: tpl.id };
        }
      }

      // 진단 template resolve — 동일 패턴
      let diagnosisTemplateIdPatch: {
        diagnosisTemplateId: string | null;
      } | null = null;
      if (d.diagnosis !== undefined) {
        const text = d.diagnosis?.trim() ?? "";
        if (!text) {
          diagnosisTemplateIdPatch = { diagnosisTemplateId: null };
        } else {
          const tpl = await upsertDiagnosisTemplate(tx, text, nextCategoryId, user.id);
          diagnosisTemplateIdPatch = { diagnosisTemplateId: tpl.id };
        }
      }

      const updated = await tx.repairTicket.update({
        where: { id },
        data: {
          ...(d.type !== undefined ? { type: d.type } : {}),
          ...(d.workKind !== undefined ? { workKind: d.workKind } : {}),
          ...(d.symptom !== undefined ? { symptom: d.symptom?.trim() || null } : {}),
          ...(d.diagnosis !== undefined ? { diagnosis: d.diagnosis?.trim() || null } : {}),
          ...(d.repairNotes !== undefined ? { repairNotes: d.repairNotes?.trim() || null } : {}),
          ...(d.customerMachineId !== undefined
            ? { customerMachineId: d.customerMachineId || null }
            : {}),
          ...(d.serialItemId !== undefined
            ? { serialItemId: d.serialItemId || null }
            : {}),
          ...(d.repairProductId !== undefined
            ? { repairProductId: d.repairProductId || null }
            : {}),
          ...(d.repairProductText !== undefined
            ? { repairProductText: d.repairProductText?.trim() || null }
            : {}),
          ...(d.diagnosisFee !== undefined ? { diagnosisFee: d.diagnosisFee } : {}),
          ...(d.totalDiscount !== undefined
            ? { totalDiscount: normalizeDiscountInput(d.totalDiscount) }
            : {}),
          ...(d.repairWarrantyMonths !== undefined
            ? { repairWarrantyMonths: d.repairWarrantyMonths }
            : {}),
          ...(d.assignedToId !== undefined
            ? { assignedToId: d.assignedToId || null }
            : {}),
          ...(d.memo !== undefined ? { memo: d.memo?.trim() || null } : {}),
          ...(d.repairCategoryId !== undefined
            ? { repairCategoryId: d.repairCategoryId || null }
            : {}),
          ...(d.receivedAt !== undefined
            ? { receivedAt: new Date(d.receivedAt) }
            : {}),
          ...(symptomTemplateIdPatch ?? {}),
          ...(diagnosisTemplateIdPatch ?? {}),
        },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          serialItem: {
            select: { id: true, code: true, source: true, displayName: true },
          },
          assignedTo: { select: { id: true, name: true } },
          repairCategory: { select: { id: true, name: true } },
        },
      });

      // 증상↔진단 link upsert — 양쪽 template 모두 있을 때만 의미.
      // 자동 추출: RepairTicket 에 둘 다 연결되어 있다 = 매장이 두 페어를 같이 입력한 사례.
      const finalSymptomId =
        symptomTemplateIdPatch?.symptomTemplateId ?? current.symptomTemplateId;
      const finalDiagnosisId =
        diagnosisTemplateIdPatch?.diagnosisTemplateId ?? current.diagnosisTemplateId;
      if (finalSymptomId && finalDiagnosisId) {
        // 양쪽 다 새로 매칭됐거나 그 외 변화가 있었을 때만 increment
        const symptomChanged =
          symptomTemplateIdPatch !== null &&
          symptomTemplateIdPatch.symptomTemplateId !== current.symptomTemplateId;
        const diagnosisChanged =
          diagnosisTemplateIdPatch !== null &&
          diagnosisTemplateIdPatch.diagnosisTemplateId !== current.diagnosisTemplateId;
        if (symptomChanged || diagnosisChanged) {
          await tx.symptomDiagnosisLink.upsert({
            where: {
              symptomId_diagnosisId: {
                symptomId: finalSymptomId,
                diagnosisId: finalDiagnosisId,
              },
            },
            create: {
              symptomId: finalSymptomId,
              diagnosisId: finalDiagnosisId,
              occurrenceCount: 1,
              lastOccurredAt: new Date(),
            },
            update: {
              occurrenceCount: { increment: 1 },
              lastOccurredAt: new Date(),
            },
          });
        }
      }

      // 진단↔부속/공임 sync — 진단 변경 시 set semantics 로 delta 적용.
      // before/after snapshot 이 진단 변경(혹은 null/non-null 전환) 을 자동 감지.
      const diagnosisTouched =
        diagnosisTemplateIdPatch !== null &&
        diagnosisTemplateIdPatch.diagnosisTemplateId !== current.diagnosisTemplateId;
      if (diagnosisTouched) {
        const usageBefore = {
          diagnosisId: current.diagnosisTemplateId,
          partProductIds: new Set(
            (
              await tx.repairPart.findMany({
                where: { repairTicketId: id, status: "USED" },
                select: { productId: true },
              })
            ).map((p) => p.productId),
          ),
          laborNames: new Set(
            (
              await tx.repairLabor.findMany({
                where: { repairTicketId: id },
                select: { name: true },
              })
            ).map((l) => l.name),
          ),
        };
        const usageAfter = await snapshotTicketUsage(tx, id);
        await applyUsageDelta(tx, usageBefore, usageAfter);
      }

      return updated;
    });

    return NextResponse.json(ticket);
  } catch (e) {
    const authResp = handleAuthError(e);
    if (authResp) return authResp;
    throw e;
  }
}

/**
 * 증상 template 찾거나 생성 + usageCount++ (자유 입력 정규화).
 * (categoryId, text) unique 보장 — 같은 카테고리 안에서 중복 없음.
 */
async function upsertSymptomTemplate(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  text: string,
  categoryId: string | null,
  userId: string,
) {
  // categoryId null 이면 findUnique 의 nullable 합성키 타입 한계 → findFirst 우회.
  const existing = categoryId
    ? await tx.repairSymptomTemplate.findUnique({
        where: { categoryId_text: { categoryId, text } },
      })
    : await tx.repairSymptomTemplate.findFirst({
        where: { categoryId: null, text },
      });
  if (existing) {
    await tx.repairSymptomTemplate.update({
      where: { id: existing.id },
      data: { usageCount: { increment: 1 } },
    });
    return existing;
  }
  return tx.repairSymptomTemplate.create({
    data: {
      text,
      categoryId,
      createdById: userId,
      usageCount: 1,
    },
  });
}

async function upsertDiagnosisTemplate(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  text: string,
  categoryId: string | null,
  userId: string,
) {
  const existing = categoryId
    ? await tx.repairDiagnosisTemplate.findUnique({
        where: { categoryId_text: { categoryId, text } },
      })
    : await tx.repairDiagnosisTemplate.findFirst({
        where: { categoryId: null, text },
      });
  if (existing) {
    await tx.repairDiagnosisTemplate.update({
      where: { id: existing.id },
      data: { usageCount: { increment: 1 } },
    });
    return existing;
  }
  return tx.repairDiagnosisTemplate.create({
    data: {
      text,
      categoryId,
      createdById: userId,
      usageCount: 1,
    },
  });
}

// 삭제 허용 조건:
//   - RECEIVED: 부속/공임 없을 때만 (실수로 만든 빈 티켓)
//   - CANCELLED: 항상 (이미 취소된 티켓이라 재고/매출 영향 없음)
//   - 그 외 상태: 거부 — 먼저 취소(transition cancel) 처리해야 함
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  const ticket = await prisma.repairTicket.findUnique({
    where: { id },
    include: { _count: { select: { parts: true, labors: true } } },
  });
  if (!ticket) return NextResponse.json({ error: "찾을 수 없음" }, { status: 404 });

  if (ticket.status === "RECEIVED") {
    if (ticket._count.parts > 0 || ticket._count.labors > 0) {
      return NextResponse.json(
        { error: "부속/공임이 있는 티켓은 삭제할 수 없습니다. 먼저 행을 비우거나 취소 처리하세요." },
        { status: 400 },
      );
    }
  } else if (ticket.status !== "CANCELLED") {
    return NextResponse.json(
      { error: "진행중 수리는 삭제할 수 없습니다. 먼저 취소 처리하세요." },
      { status: 400 },
    );
  }

  await prisma.repairTicket.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
