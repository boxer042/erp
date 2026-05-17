/**
 * 시리얼 개인정보 보존기간 cron — PIPA 보유기간 경과 시 파기·익명화.
 *
 * 두 정책을 한 번에 실행:
 *  1) 보증만료 + N년(기본 3) 경과 SerialItem → 손님 연결 끊고 익명화
 *     (수리이력·기기정보는 보존, 손님 개인정보 연결만 제거)
 *  2) N년(기본 1) 지난 SerialAccessLog 삭제
 *
 * 등록: 외부 스케줄러가 매일 1회 호출.
 * 인증: ?token=<CRON_TOKEN> 또는 Authorization: Bearer <CRON_TOKEN>.
 *
 * 파라미터 (query):
 *   anonymizeYears 기본 3 — 보증만료 후 N년 경과 시 익명화
 *   logYears       기본 1 — 접근로그 N년 보관 후 삭제
 *   dry=1                — 실제 변경 없이 카운트만
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const anonymizeYears = Number(url.searchParams.get("anonymizeYears") ?? "3");
  const logYears = Number(url.searchParams.get("logYears") ?? "1");
  const dry = url.searchParams.get("dry") === "1";

  const now = new Date();
  const warrantyCutoff = new Date(now);
  warrantyCutoff.setFullYear(warrantyCutoff.getFullYear() - anonymizeYears);
  const logCutoff = new Date(now);
  logCutoff.setFullYear(logCutoff.getFullYear() - logYears);

  // 1) 익명화 대상 — 보증만료 + N년 경과, 아직 익명화 안 됨, 손님 연결 있음
  const anonymizeWhere = {
    anonymizedAt: null,
    customerId: { not: null },
    warrantyEnds: { not: null, lt: warrantyCutoff },
  } as const;

  // 2) 삭제 대상 접근로그
  const logWhere = { accessedAt: { lt: logCutoff } } as const;

  if (dry) {
    const [anonymizeCount, logCount] = await Promise.all([
      prisma.serialItem.count({ where: anonymizeWhere }),
      prisma.serialAccessLog.count({ where: logWhere }),
    ]);
    return NextResponse.json({
      dry: true,
      wouldAnonymize: anonymizeCount,
      wouldDeleteLogs: logCount,
    });
  }

  const [anonymized, deletedLogs] = await Promise.all([
    prisma.serialItem.updateMany({
      where: anonymizeWhere,
      data: { customerId: null, anonymizedAt: now },
    }),
    prisma.serialAccessLog.deleteMany({ where: logWhere }),
  ]);

  return NextResponse.json({
    anonymized: anonymized.count,
    deletedLogs: deletedLogs.count,
  });
}
