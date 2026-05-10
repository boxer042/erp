/**
 * 자동 만료 / 노쇼 처리 cron 엔드포인트.
 *
 * 두 가지 정책을 한 번에 실행:
 *  1) RESERVED 임대 노쇼 → CANCELLED (startDate 가 지났는데 픽업 없음)
 *  2) 진단 대기 (RECEIVED·DIAGNOSING DROP_OFF) N일 경과 알림 → ADMIN 들에게 SMS
 *
 * 등록: 외부 스케줄러(EasyCron 등) 가 매일 1회 호출.
 * 인증: ?token=<CRON_TOKEN> 또는 Authorization: Bearer <CRON_TOKEN>.
 *
 * 파라미터 (query):
 *   noshowDays   기본 1   — 임대 startDate 가 N일 이전이면 CANCELLED
 *   diagnoseDays 기본 3   — DROP_OFF 진단 대기 N일 경과 알림 (한 번만)
 *   dry=1                — 실제 변경 안 하고 시뮬만
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications/dispatch";

function authorize(request: NextRequest): boolean {
  const expected = process.env.CRON_TOKEN;
  if (!expected) return true; // dev — 토큰 미설정이면 허용
  const url = new URL(request.url);
  if (url.searchParams.get("token") === expected) return true;
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${expected}`) return true;
  return false;
}

export async function POST(request: NextRequest) {
  return run(request);
}
export async function GET(request: NextRequest) {
  return run(request);
}

async function run(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const noshowDays = Math.max(
    0,
    parseInt(url.searchParams.get("noshowDays") ?? "1", 10) || 1,
  );
  const diagnoseDays = Math.max(
    1,
    parseInt(url.searchParams.get("diagnoseDays") ?? "3", 10) || 3,
  );
  const dry = url.searchParams.get("dry") === "1";

  const now = new Date();
  const noshowCutoff = new Date(now.getTime() - noshowDays * 86400000);
  const diagnoseCutoff = new Date(now.getTime() - diagnoseDays * 86400000);

  // 1) RESERVED 임대 노쇼 — startDate 가 noshowCutoff 이전인데 ACTIVE 안 됨
  const noshowCandidates = await prisma.rental.findMany({
    where: {
      status: "RESERVED",
      startDate: { lt: noshowCutoff },
    },
    select: {
      id: true,
      rentalNo: true,
      startDate: true,
    },
  });

  let cancelledCount = 0;
  if (noshowCandidates.length > 0 && !dry) {
    const result = await prisma.rental.updateMany({
      where: { id: { in: noshowCandidates.map((r) => r.id) } },
      data: { status: "CANCELLED" },
    });
    cancelledCount = result.count;
  }

  // 2) DROP_OFF 진단 대기 N일 경과 — RECEIVED/DIAGNOSING 그대로
  //    매장 ADMIN 에게 한 묶음 알림 (top 5 ticket no 만 본문에)
  const stuckTickets = await prisma.repairTicket.findMany({
    where: {
      type: "DROP_OFF",
      status: { in: ["RECEIVED", "DIAGNOSING"] },
      receivedAt: { lt: diagnoseCutoff },
    },
    select: {
      id: true,
      ticketNo: true,
      receivedAt: true,
      symptom: true,
      customer: { select: { name: true } },
    },
    orderBy: { receivedAt: "asc" },
    take: 50,
  });

  let alertedAdmins = 0;
  if (stuckTickets.length > 0 && !dry) {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true, name: true, email: true },
    });
    const top = stuckTickets.slice(0, 5);
    const body = `진단 대기 ${diagnoseDays}일 경과 ${stuckTickets.length}건 — ${top
      .map(
        (t) =>
          `${t.ticketNo}(${t.customer?.name ?? "미등록"})`,
      )
      .join(", ")}${stuckTickets.length > 5 ? " 외" : ""}. /pos/repairs 에서 처리 필요.`;
    for (const a of admins) {
      if (!a.email) continue;
      await notify(
        { id: a.id, email: a.email, name: a.name },
        {
          kind: "OTHER",
          subject: `[진단 대기 알림] ${stuckTickets.length}건`,
          body,
          meta: { stuckTicketIds: stuckTickets.map((t) => t.id) },
        },
        "email",
      );
      alertedAdmins++;
    }
  }

  return NextResponse.json({
    ok: true,
    dry,
    noshowDays,
    diagnoseDays,
    rentals: {
      candidates: noshowCandidates.length,
      cancelled: cancelledCount,
      sampleRentalNos: noshowCandidates.slice(0, 5).map((r) => r.rentalNo),
    },
    repairs: {
      stuck: stuckTickets.length,
      alertedAdmins,
      sampleTicketNos: stuckTickets.slice(0, 5).map((t) => t.ticketNo),
    },
  });
}
