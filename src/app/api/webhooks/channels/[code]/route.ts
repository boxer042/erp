/**
 * Inbound 채널 webhook 라우트 — 채널이 ERP 로 push 하는 이벤트 진입점.
 *
 * URL: POST /api/webhooks/channels/{code}
 *   (예: /api/webhooks/channels/COUPANG, /api/webhooks/channels/NAVER)
 *
 * 처리 흐름:
 *   1) 채널 code → SalesChannel + Adapter lookup. 미등록이면 404.
 *   2) Adapter 의 verifyWebhookSignature 로 서명 검증 (어댑터마다 다른 방식 — HMAC, OAuth, etc).
 *   3) Adapter 의 parseWebhookEvent 로 channel-specific payload → 표준 ChannelInboundEvent 변환.
 *   4) 이벤트 종류별 처리:
 *        - ORDER_CREATED      → import 로 정식 Order 생성 또는 보류 큐
 *        - RETURN_REQUESTED   → 기존 Order 의 status RETURN_REQUESTED 자동 전이 + claim 정보 갱신
 *        - PAYMENT_SETTLED    → paymentStatus PAID 자동 갱신
 *        - INVENTORY_DELTA    → 재고 sync 트리거 (반대 방향 outbound)
 *        - 그 외              → audit log 만, 운영자 검토용
 *
 * Phase 2 의존:
 *   - ChannelAdapter 인터페이스에 verifyWebhookSignature/parseWebhookEvent 메서드 추가 필요
 *   - Coupang/Naver 어댑터에 실제 서명 검증 로직 구현 필요
 *
 * 본 파일은 framework 만 갖춘 스캐폴드. 어댑터 메서드 채워지면 자동 활성화.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getChannelAdapter } from "@/lib/channels/registry";
import { recordAudit } from "@/lib/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  // 1) Channel + Adapter lookup
  const channel = await prisma.salesChannel.findUnique({
    where: { code },
    select: { id: true, code: true, isActive: true },
  });
  if (!channel) {
    return NextResponse.json({ error: "channel not found" }, { status: 404 });
  }
  if (!channel.isActive) {
    return NextResponse.json({ error: "channel inactive" }, { status: 410 });
  }

  const adapter = getChannelAdapter(channel.code);
  if (!adapter) {
    return NextResponse.json(
      { error: "adapter not registered (가입·환경변수 미설정)" },
      { status: 503 },
    );
  }

  // 2) Read raw body + headers — 서명 검증을 위해 raw 형태 보존 필요
  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });

  // 3) 서명 검증 — 어댑터에 메서드 있으면 호출 (Phase 2 도입)
  const adapterAny = adapter as unknown as {
    verifyWebhookSignature?: (
      headers: Record<string, string>,
      rawBody: string,
    ) => boolean | Promise<boolean>;
    parseWebhookEvent?: (
      headers: Record<string, string>,
      rawBody: string,
    ) => Promise<ChannelInboundEvent | null>;
  };

  if (adapterAny.verifyWebhookSignature) {
    const ok = await adapterAny.verifyWebhookSignature(headers, rawBody);
    if (!ok) {
      await recordAudit(prisma, {
        userId: null,
        entity: "Order",
        entityId: channel.id,
        action: "STATUS_CHANGE",
        meta: {
          inbound: "WEBHOOK_REJECTED",
          channel: channel.code,
          reason: "signature mismatch",
        },
      });
      return NextResponse.json(
        { error: "signature verification failed" },
        { status: 401 },
      );
    }
  } else {
    // 어댑터가 검증 미구현 — 보안상 reject. Phase 2 도입 후 활성화.
    return NextResponse.json(
      {
        error:
          "webhook signature verification not implemented for this adapter (Phase 2 가입 후 활성화)",
      },
      { status: 501 },
    );
  }

  // 4) Event parse + dispatch
  if (!adapterAny.parseWebhookEvent) {
    return NextResponse.json(
      {
        error:
          "webhook event parser not implemented for this adapter",
      },
      { status: 501 },
    );
  }
  const event = await adapterAny.parseWebhookEvent(headers, rawBody);
  if (!event) {
    // 어댑터가 무시 결정 — 200 으로 ack (재시도 방지)
    return NextResponse.json({ ok: true, ignored: true });
  }

  await recordAudit(prisma, {
    userId: null,
    entity: "Order",
    entityId: channel.id,
    action: "STATUS_CHANGE",
    meta: {
      inbound: event.kind,
      channel: channel.code,
      channelOrderNo: event.channelOrderNo ?? null,
    },
  });

  // TODO: kind 별 실제 처리 로직 — Phase 5 (Inbound 자동화) 단계에서 구현
  //   - ORDER_CREATED:    importChannelOrders 호출 (raw 데이터 변환 후)
  //   - RETURN_REQUESTED: order.status 가 COMPLETED 면 자동 RETURN_REQUESTED 전이
  //   - PAYMENT_SETTLED:  order.paymentStatus = PAID 갱신
  //   - INVENTORY_DELTA:  dispatchPushStock 으로 정정값 재푸시
  // 현재는 audit log 만 남기고 ack — 실제 mutation 은 어댑터 docs 확인 후 추가.

  return NextResponse.json({ ok: true, kind: event.kind });
}

/**
 * 표준 inbound 이벤트 형식 — 모든 채널 공통.
 * 어댑터의 parseWebhookEvent 가 channel-specific payload 를 이걸로 변환.
 */
export interface ChannelInboundEvent {
  kind:
    | "ORDER_CREATED"
    | "RETURN_REQUESTED"
    | "PAYMENT_SETTLED"
    | "INVENTORY_DELTA"
    | "OTHER";
  channelOrderNo?: string;
  /** kind 별 raw payload — 처리 로직이 cast 해서 사용 */
  data?: unknown;
}
