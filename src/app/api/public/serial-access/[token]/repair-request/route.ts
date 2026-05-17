import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyIdentity } from "@/lib/serial-token";
import { generateRepairTicketNo } from "@/lib/document-no";

const schema = z.object({
  name: z.string().min(1),
  phoneLast4: z.string().min(4).max(4),
  symptom: z.string().min(1, "증상을 입력해주세요"),
});

// POST /api/public/serial-access/[token]/repair-request
// 손님이 시리얼 페이지에서 직접 수리 접수를 신청 — 본인확인 재검증 후 RepairTicket 생성.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요" },
      { status: 400 },
    );
  }

  const raw = await prisma.serialItem.findUnique({
    where: { accessToken: token },
    include: { customer: { select: { id: true, name: true, phone: true } } },
  });
  if (!raw || raw.accessTokenRevokedAt || raw.anonymizedAt) {
    return NextResponse.json({ error: "유효하지 않은 접근입니다" }, { status: 404 });
  }
  if (raw.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "이 제품은 반품·폐기 처리되었습니다" },
      { status: 410 },
    );
  }
  if (!raw.customer) {
    return NextResponse.json(
      { error: "본인확인 대상이 아닙니다" },
      { status: 400 },
    );
  }

  // 본인확인 재검증 — verify 와 동일 기준
  const result = verifyIdentity(
    { name: parsed.data.name, phoneLast4: parsed.data.phoneLast4 },
    { name: raw.customer.name, phone: raw.customer.phone },
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: "본인 정보가 일치하지 않습니다" },
      { status: 401 },
    );
  }

  // 중복 신청 차단 — 이 시리얼에 이미 진행 중 수리가 있으면 거부
  const open = await prisma.repairTicket.count({
    where: {
      serialItemId: raw.id,
      status: { in: ["RECEIVED", "DIAGNOSING", "QUOTED", "APPROVED", "REPAIRING"] },
    },
  });
  if (open > 0) {
    return NextResponse.json(
      { error: "이미 진행 중인 수리가 있습니다. 매장으로 문의해주세요." },
      { status: 409 },
    );
  }

  // createdById 는 필수 — 시스템상 첫 사용자 명의로 기록, memo 로 셀프접수 표시
  const user = await prisma.user.findFirst({ select: { id: true } });
  if (!user) {
    return NextResponse.json(
      { error: "접수를 처리할 수 없습니다. 매장으로 문의해주세요." },
      { status: 500 },
    );
  }

  const ticket = await prisma.repairTicket.create({
    data: {
      ticketNo: generateRepairTicketNo(),
      type: "DROP_OFF",
      customerId: raw.customerId,
      serialItemId: raw.id,
      status: "RECEIVED",
      receivedAt: new Date(),
      symptom: parsed.data.symptom.trim(),
      createdById: user.id,
      memo: "손님 QR 셀프 접수",
    },
    select: { ticketNo: true },
  });

  return NextResponse.json({ ok: true, ticketNo: ticket.ticketNo });
}
