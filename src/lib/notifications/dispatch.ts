/**
 * 알림 발송 진입점 — 호출자가 직접 어댑터 선택 X.
 *
 * 정책:
 *  - 단일 글로벌 어댑터 (Phase 1: Mock, Phase 2 후 Solapi 등으로 교체)
 *  - 모든 호출은 best-effort. 실패해도 ERP 흐름 영향 X
 *  - 채널 우선순위: kakao > sms > email (Phase 2 에서 정책화)
 *
 * 호출 위치:
 *  - api/orders/[id]/route.ts — complete (배송완료) / accept_return / reject_return / EXCHANGE_DIFFERENT 차액
 *  - api/cron/channel-poll/route.ts — 보류 큐 임계값 초과 시
 */
import { mockNotificationAdapter } from "./mock";
import type {
  NotificationChannel,
  NotificationPayload,
  NotificationRecipient,
} from "./types";

const adapter = mockNotificationAdapter;

/**
 * 알림 발송 시도. 실패해도 throw 안 함 — 호출자가 영향받지 않게.
 */
export async function notify(
  recipient: NotificationRecipient,
  payload: NotificationPayload,
  preferredChannel: NotificationChannel = "sms",
): Promise<void> {
  try {
    if (!recipient.phone && !recipient.email) return;
    const channel: NotificationChannel =
      preferredChannel === "kakao" || preferredChannel === "sms"
        ? recipient.phone
          ? preferredChannel
          : recipient.email
            ? "email"
            : "sms"
        : recipient.email
          ? "email"
          : "sms";
    if (!adapter.supportedChannels.includes(channel)) return;
    await adapter.send(channel, recipient, payload);
  } catch (e) {
    console.error(
      "[notify] 발송 실패",
      e instanceof Error ? e.message : e,
    );
  }
}
