/**
 * 업무 노트 할일 리마인더 cron (Phase 3).
 *
 * notify=ON + notifyAt 도래 + 미완료 + 미발송 인 노트를, 작성자의 카카오 "나에게 보내기" 로 발송.
 * keep-alive: 모든 연결의 access token 을 점검해 만료 시 refresh → refresh token 2달 만료 회전 유지.
 *
 * 등록: 외부 스케줄러가 매일(또는 시간별) 1회 호출. 인증: ?token=<CRON_TOKEN> 또는 Bearer.
 * 파라미터: dry=1 (시뮬, 발송·갱신 안 함).
 *
 * env(KAKAO_*) 미설정 시 즉시 no-op 반환.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getValidAccessToken,
  isKakaoConfigured,
  sendMemoText,
} from "@/lib/notifications/kakao-memo";

function authorize(request: NextRequest): boolean {
  const expected = process.env.CRON_TOKEN;
  if (!expected) return true; // dev — 토큰 미설정이면 허용
  const url = new URL(request.url);
  if (url.searchParams.get("token") === expected) return true;
  if (request.headers.get("authorization") === `Bearer ${expected}`) return true;
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
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isKakaoConfigured()) {
    return NextResponse.json({ ok: true, skipped: "kakao 미설정", sent: 0 });
  }

  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";
  const now = new Date();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const due = await prisma.note.findMany({
    where: {
      isActive: true,
      notify: true,
      done: false,
      notifiedAt: null,
      notifyAt: { not: null, lte: now },
    },
    select: { id: true, title: true, content: true, createdById: true },
    take: 200,
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const n of due) {
    const token = await getValidAccessToken(n.createdById);
    if (!token) {
      skipped++; // 미연결 또는 refresh 만료(재로그인 필요)
      continue;
    }
    if (dry) {
      sent++;
      continue;
    }
    const text = `[할 일] ${(n.title || n.content).slice(0, 180)}`;
    const ok = await sendMemoText(token, text, {
      web_url: `${appUrl}/notes`,
      mobile_web_url: `${appUrl}/notes`,
    });
    if (ok) {
      await prisma.note.update({ where: { id: n.id }, data: { notifiedAt: now } });
      sent++;
    } else {
      failed++;
    }
  }

  // keep-alive — access token 이 만료된 연결을 갱신해 refresh token(2달) 회전 유지
  let refreshed = 0;
  if (!dry) {
    const conns = await prisma.kakaoConnection.findMany({ select: { userId: true } });
    for (const c of conns) {
      if (await getValidAccessToken(c.userId)) refreshed++;
    }
  }

  return NextResponse.json({ ok: true, dueCount: due.length, sent, skipped, failed, refreshed, dry });
}
