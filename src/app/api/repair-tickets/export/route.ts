import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

const STATUS_LABEL: Record<string, string> = {
  RECEIVED: "접수",
  DIAGNOSING: "진단중",
  QUOTED: "견적대기",
  APPROVED: "승인",
  REPAIRING: "수리중",
  READY: "인계대기",
  PICKED_UP: "수리완료",
  CANCELLED: "취소",
};

const CANCEL_REASON_LABEL: Record<string, string> = {
  CUSTOMER_DECLINED: "손님 거절",
  CUSTOMER_NO_SHOW: "손님 미반환",
  SHOP_GAVE_UP: "매장 포기",
  PARTS_UNAVAILABLE: "부속 수급 불가",
  SOLD_AS_PRODUCT: "상품 구매로 전환",
  MISTAKE: "잘못 생성",
  OTHER: "기타",
};

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * 수리 ticket CSV 내보내기 — 통계 페이지 + 목록에서 다운로드.
 * 기간 필터 지원 (?from=&to=).
 */
export async function GET(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: Prisma.RepairTicketWhereInput = {};
  if (from || to) {
    where.receivedAt = {};
    if (from) (where.receivedAt as { gte?: Date }).gte = new Date(`${from}T00:00:00`);
    if (to) (where.receivedAt as { lte?: Date }).lte = new Date(`${to}T23:59:59`);
  }

  const tickets = await prisma.repairTicket.findMany({
    where,
    include: {
      customer: { select: { name: true, phone: true } },
      repairCategory: { select: { name: true } },
      repairProduct: { select: { name: true, sku: true } },
      assignedTo: { select: { name: true } },
    },
    orderBy: { receivedAt: "desc" },
    take: 10000,
  });

  const rows: string[] = [];
  rows.push(
    [
      "수리번호",
      "유형",
      "작업성격",
      "상태",
      "카테고리",
      "고객",
      "전화",
      "기기 (상품명)",
      "기기 SKU",
      "기기 자유입력",
      "증상",
      "진단",
      "담당자",
      "접수일",
      "완료일",
      "최종금액",
      "진단비",
      "취소사유",
      "취소메모",
      "취소일",
    ]
      .map(csvEscape)
      .join(","),
  );

  for (const t of tickets) {
    rows.push(
      [
        t.ticketNo,
        t.type === "ON_SITE" ? "즉시" : "맡김",
        t.workKind === "CUSTOM_BUILD" ? "리빌드" : "일반 수리",
        STATUS_LABEL[t.status] ?? t.status,
        t.repairCategory?.name ?? "기타",
        t.customer?.name ?? "(미등록)",
        t.customer?.phone ?? "",
        t.repairProduct?.name ?? "",
        t.repairProduct?.sku ?? "",
        t.repairProductText ?? "",
        t.symptom ?? "",
        t.diagnosis ?? "",
        t.assignedTo?.name ?? "",
        format(t.receivedAt, "yyyy-MM-dd HH:mm"),
        t.pickedUpAt ? format(t.pickedUpAt, "yyyy-MM-dd HH:mm") : "",
        t.finalAmount.toString(),
        t.diagnosisFee.toString(),
        t.cancelReason ? (CANCEL_REASON_LABEL[t.cancelReason] ?? t.cancelReason) : "",
        t.cancelMemo ?? "",
        t.cancelledAt ? format(t.cancelledAt, "yyyy-MM-dd HH:mm") : "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  // BOM 추가 — Excel 한글 깨짐 방지
  const csv = "﻿" + rows.join("\n");
  const filename = `repair-tickets-${from ?? "all"}-${to ?? "all"}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
