/**
 * GET   /api/channels/[id]/config — 채널 운영 정책 조회
 * PATCH /api/channels/[id]/config — 정책 갱신 (병합 형태)
 *
 * config JSON 구조 (모두 선택):
 *   - pollingMinutes: number      — cron 호출 간격 (default 10)
 *   - shipDateOffsetDays: number   — 출고 예정일 offset (쿠팡=1)
 *   - autoStockSync: boolean       — Inventory 변동 시 채널 push (default false)
 *   - autoTrackingPush: boolean    — [발송] 시 송장 자동 push (default true)
 *   - pendingThreshold: number     — 보류 큐 알림 임계값
 *
 * credentials 는 보안상 별도 envvar 또는 secret manager 사용 권장 — 이 라우트에서 미관리.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";
import { z } from "zod";

const configSchema = z.object({
  pollingMinutes: z.number().int().min(1).max(1440).optional(),
  shipDateOffsetDays: z.number().int().min(0).max(30).optional(),
  autoStockSync: z.boolean().optional(),
  autoTrackingPush: z.boolean().optional(),
  pendingThreshold: z.number().int().min(0).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const channel = await prisma.salesChannel.findUnique({
    where: { id },
    select: { id: true, name: true, code: true, config: true },
  });
  if (!channel) {
    return NextResponse.json(
      { error: "채널을 찾을 수 없습니다" },
      { status: 404 },
    );
  }
  return NextResponse.json(channel);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const { id } = await params;
  const body = await request.json();
  const parsed = configSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const channel = await prisma.salesChannel.findUnique({
    where: { id },
    select: { config: true },
  });
  if (!channel) {
    return NextResponse.json(
      { error: "채널을 찾을 수 없습니다" },
      { status: 404 },
    );
  }
  // 기존 config 와 병합 (사용자가 일부 필드만 갱신해도 다른 필드 보존)
  const merged = {
    ...((channel.config as Record<string, unknown> | null) ?? {}),
    ...parsed.data,
  };

  const updated = await prisma.salesChannel.update({
    where: { id },
    data: { config: merged },
    select: { id: true, config: true },
  });
  return NextResponse.json(updated);
}
