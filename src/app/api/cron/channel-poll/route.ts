/**
 * GET /api/cron/channel-poll
 *
 * 모든 활성 채널의 어댑터에 대해 fetchNewOrders + import 자동 수행.
 * Vercel cron 또는 외부 스케줄러(예: Supabase pg_cron, GitHub Actions, cron-job.org)에서 호출.
 *
 * 인증: header `Authorization: Bearer <CRON_SECRET>` 또는 query `?secret=<CRON_SECRET>`.
 *  CRON_SECRET 환경변수 미설정 시 거부 (안전 default).
 *
 * Phase 1: Mock 어댑터로 검증 가능.
 *   curl -H "Authorization: Bearer ${CRON_SECRET}" https://.../api/cron/channel-poll
 *
 * Phase 2 후: registry 에 실 채널 어댑터 추가 → 자동 import 활성화.
 *
 * Vercel cron 등록 (vercel.json):
 *   { "crons": [{ "path": "/api/cron/channel-poll", "schedule": "*∕10 * * * *" }] }
 *   Vercel cron 은 Authorization 헤더에 자동으로 CRON_SECRET 을 실어줌.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getChannelAdapter } from "@/lib/channels/registry";
import { importChannelOrders } from "@/lib/channels/import";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications/dispatch";

export async function GET(request: NextRequest) {
  // 인증
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET 환경변수가 설정되지 않았습니다" },
      { status: 503 },
    );
  }
  const authHeader = request.headers.get("authorization") ?? "";
  const queryToken = new URL(request.url).searchParams.get("secret") ?? "";
  const provided =
    authHeader.startsWith("Bearer ") ? authHeader.slice(7) : queryToken;
  if (provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Cron 실행자 — system user 가 없으면 첫 ADMIN 사용. 없으면 실패.
  const systemUser = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!systemUser) {
    return NextResponse.json(
      { error: "ADMIN 사용자가 없어 import 를 실행할 수 없습니다" },
      { status: 503 },
    );
  }

  const channels = await prisma.salesChannel.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
  });

  const since = new Date(Date.now() - 30 * 60 * 1000); // 최근 30분
  const summary: Array<{
    channelId: string;
    channelCode: string;
    channelName: string;
    skipped?: string;
    ordersCreated?: number;
    pendingCreated?: number;
    duplicates?: number;
    failed?: number;
  }> = [];

  for (const channel of channels) {
    const adapter = getChannelAdapter(channel.code);
    if (!adapter) {
      summary.push({
        channelId: channel.id,
        channelCode: channel.code,
        channelName: channel.name,
        skipped: "어댑터 미등록",
      });
      continue;
    }
    try {
      const rawOrders = await adapter.fetchNewOrders(since);
      const result = await importChannelOrders(prisma, channel.id, rawOrders, {
        importedById: systemUser.id,
      });
      summary.push({
        channelId: channel.id,
        channelCode: channel.code,
        channelName: channel.name,
        ordersCreated: result.ordersCreated,
        pendingCreated: result.pendingCreated,
        duplicates: result.duplicates,
        failed: result.failed,
      });
    } catch (e) {
      summary.push({
        channelId: channel.id,
        channelCode: channel.code,
        channelName: channel.name,
        skipped: e instanceof Error ? e.message : "어댑터 호출 실패",
      });
    }
  }

  await recordAudit(prisma, {
    userId: systemUser.id,
    entity: "SalesChannel",
    entityId: null,
    action: "IMPORT",
    meta: { trigger: "cron", since: since.toISOString(), summary },
  });

  // 보류 큐 임계값 알림 — 채널별 config.pendingThreshold 초과 시 매장에 알림
  await checkPendingThresholdAlerts(systemUser.id);

  return NextResponse.json({ ok: true, since: since.toISOString(), summary });
}

/**
 * 활성 채널마다 보류 큐 누적이 config.pendingThreshold 초과인지 검사.
 * 초과 채널은 ADMIN 사용자에게 알림 (best-effort).
 */
async function checkPendingThresholdAlerts(triggerUserId: string) {
  const channels = await prisma.salesChannel.findMany({
    where: { isActive: true },
    select: { id: true, name: true, code: true, config: true },
  });
  const overThreshold: Array<{ name: string; count: number; threshold: number }> = [];
  for (const c of channels) {
    const cfg = (c.config as Record<string, unknown> | null) ?? {};
    const threshold = typeof cfg.pendingThreshold === "number" ? cfg.pendingThreshold : null;
    if (threshold === null || threshold <= 0) continue;
    const count = await prisma.pendingChannelOrder.count({
      where: { channelId: c.id, status: "UNMAPPED_SKU" },
    });
    if (count >= threshold) {
      overThreshold.push({ name: c.name, count, threshold });
    }
  }
  if (overThreshold.length === 0) return;

  // 알림 받을 ADMIN 들 — 일단 트리거 사용자만. 향후 알림 대상자 설정 페이지 추가 시 확장.
  const admin = await prisma.user.findUnique({
    where: { id: triggerUserId },
    select: { id: true, name: true, email: true },
  });
  if (!admin) return;

  const body = overThreshold
    .map((c) => `${c.name}: 보류 ${c.count}건 (임계값 ${c.threshold})`)
    .join("\n");
  await notify(
    { id: admin.id, email: admin.email, name: admin.name },
    {
      kind: "PENDING_QUEUE_THRESHOLD",
      subject: "[ERP 알림] 채널 보류 큐 임계값 초과",
      body: `다음 채널의 SKU 매핑 누락 보류가 임계값을 초과했습니다.\n\n${body}\n\n매핑 페이지에서 정리해주세요.`,
      meta: { channels: overThreshold },
    },
    "email",
  );
}
