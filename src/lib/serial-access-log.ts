import type { SerialAccessFailReason, SerialAccessStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clientIpFromHeaders, hashIp } from "@/lib/serial-token";

// 손님 공개 페이지 접근 1건 기록 — PIPA 접근기록 보관 의무.
export async function logSerialAccess(args: {
  serialItemId: string;
  accessToken: string;
  stage: SerialAccessStage;
  failReason?: SerialAccessFailReason;
  headers: Headers;
}): Promise<void> {
  const ip = clientIpFromHeaders(args.headers);
  await prisma.serialAccessLog.create({
    data: {
      serialItemId: args.serialItemId,
      accessToken: args.accessToken,
      stage: args.stage,
      failReason: args.failReason ?? null,
      ipHash: ip ? hashIp(ip) : null,
      userAgent: args.headers.get("user-agent")?.slice(0, 300) ?? null,
    },
  });
}

// 본인확인 무차별 시도 차단 — 최근 10분 AUTH_FAIL 5회 이상이면 잠금.
export const SERIAL_AUTH_MAX_FAILS = 5;
export const SERIAL_AUTH_WINDOW_MS = 10 * 60_000;

export async function countRecentAuthFails(serialItemId: string): Promise<number> {
  return prisma.serialAccessLog.count({
    where: {
      serialItemId,
      stage: "AUTH_FAIL",
      accessedAt: { gte: new Date(Date.now() - SERIAL_AUTH_WINDOW_MS) },
    },
  });
}
