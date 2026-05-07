/**
 * Mock 알림 어댑터 — Phase 1 검증용.
 *
 * 실제 SaaS 가입 전 dev 환경에서 트리거 흐름 검증.
 * 콘솔에 알림 내용 출력 + 메모리에 누적해 audit log 처럼 추적 가능.
 */
import type {
  NotificationAdapter,
  NotificationChannel,
  NotificationPayload,
  NotificationRecipient,
} from "./types";

interface SentRecord {
  at: Date;
  channel: NotificationChannel;
  recipient: NotificationRecipient;
  payload: NotificationPayload;
}

class MockNotificationAdapter implements NotificationAdapter {
  readonly code = "MOCK";
  readonly displayName = "Mock 알림 (dev 검증용)";
  readonly supportedChannels: NotificationChannel[] = ["sms", "email", "kakao"];
  private sent: SentRecord[] = [];

  async send(
    channel: NotificationChannel,
    recipient: NotificationRecipient,
    payload: NotificationPayload,
  ): Promise<{ ok: boolean; error?: string }> {
    const record: SentRecord = { at: new Date(), channel, recipient, payload };
    this.sent.push(record);
    if (this.sent.length > 200) this.sent.shift(); // 메모리 상한
    console.info(
      `[notification/mock] ${channel} → ${recipient.phone ?? recipient.email ?? recipient.id} | ${payload.kind} | ${payload.body.slice(0, 80)}`,
    );
    return { ok: true };
  }

  /** 디버그용 — 최근 보낸 알림 list */
  recent(limit = 50): SentRecord[] {
    return this.sent.slice(-limit).reverse();
  }
}

export const mockNotificationAdapter = new MockNotificationAdapter();
