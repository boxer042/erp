import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { serialDetailInclude, buildSerialProfile } from "@/lib/serial-profile";
import { verifyIdentity } from "@/lib/serial-token";
import {
  logSerialAccess,
  countRecentAuthFails,
  SERIAL_AUTH_MAX_FAILS,
} from "@/lib/serial-access-log";

const verifySchema = z.object({
  name: z.string().min(1),
  phoneLast4: z.string().min(4).max(4),
});

// POST /api/public/serial-access/[token]/verify — 손님 2단계 본인확인 (비인증).
// 이름 + 전화 끝4자리 일치 시 풀공개 프로파일 반환.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = await request.json();
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값을 확인해주세요" }, { status: 400 });
  }

  const raw = await prisma.serialItem.findUnique({
    where: { accessToken: token },
    include: serialDetailInclude,
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

  // 무차별 시도 차단
  const recentFails = await countRecentAuthFails(raw.id);
  if (recentFails >= SERIAL_AUTH_MAX_FAILS) {
    await logSerialAccess({
      serialItemId: raw.id,
      accessToken: token,
      stage: "AUTH_FAIL",
      failReason: "RATE_LIMITED",
      headers: request.headers,
    });
    return NextResponse.json(
      { error: "시도 횟수를 초과했습니다. 10분 후 다시 시도해주세요.", locked: true },
      { status: 429 },
    );
  }

  const result = verifyIdentity(
    { name: parsed.data.name, phoneLast4: parsed.data.phoneLast4 },
    { name: raw.customer.name, phone: raw.customer.phone },
  );
  if (!result.ok) {
    await logSerialAccess({
      serialItemId: raw.id,
      accessToken: token,
      stage: "AUTH_FAIL",
      failReason: result.reason,
      headers: request.headers,
    });
    const remaining = Math.max(0, SERIAL_AUTH_MAX_FAILS - recentFails - 1);
    return NextResponse.json(
      { error: "이름 또는 전화번호가 일치하지 않습니다", remaining },
      { status: 401 },
    );
  }

  await logSerialAccess({
    serialItemId: raw.id,
    accessToken: token,
    stage: "AUTH_SUCCESS",
    headers: request.headers,
  });

  const profile = buildSerialProfile(raw, { masked: false });
  return NextResponse.json({ mode: "full", ...profile });
}
