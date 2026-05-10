/**
 * Solapi 알림 어댑터 — SMS / 카카오 알림톡.
 *
 * 가입 후 환경변수 설정:
 *   SOLAPI_API_KEY      = "..."
 *   SOLAPI_API_SECRET   = "..."
 *   SOLAPI_SENDER_PHONE = "01012345678"  (사전 등록된 발신번호)
 *   SOLAPI_KAKAO_PFID   = "..."  (카카오 비즈 채널 ID, 알림톡 사용 시)
 *
 * 활성화는 `getNotificationAdapter()` (registry) 가 환경변수 존재 시 자동 선택.
 * 환경변수 없으면 mock 어댑터 폴백 (개발 환경에선 console 출력만).
 *
 * 인증: HMAC-SHA256 으로 Authorization 헤더 구성.
 *   Authorization: HMAC-SHA256 apiKey={key},date={iso},salt={uuid},signature={hex}
 *   signature = hmac_sha256(secret, date + salt) → hex
 *
 * Phase 1: 스캐폴드 (구조 + 인증 + endpoint URL 만 정확하게). 실제 send 호출은
 * 환경변수 + 발신번호 등록 + 실제 전송 동의 후 활성화.
 */
import type {
  NotificationAdapter,
  NotificationChannel,
  NotificationPayload,
  NotificationRecipient,
} from "./types";

const SOLAPI_BASE_URL = "https://api.solapi.com";

/**
 * 카카오 알림톡 템플릿 ID 매핑 — kind → env 변수의 templateId.
 * 카카오 비즈 채널에서 템플릿 사전 승인 후 환경변수 등록:
 *   SOLAPI_KAKAO_TPL_ORDER_DELIVERED      = "TPL01"
 *   SOLAPI_KAKAO_TPL_RETURN_ACCEPTED      = "TPL02"
 *   SOLAPI_KAKAO_TPL_RETURN_REJECTED      = "TPL03"
 *   SOLAPI_KAKAO_TPL_EXCHANGE_DIFFERENT_PAYMENT = "TPL04"
 *   SOLAPI_KAKAO_TPL_PENDING_QUEUE_THRESHOLD     = "TPL05"
 *   SOLAPI_KAKAO_TPL_MAPPING_MISSING_TOP         = "TPL06"
 *   SOLAPI_KAKAO_TPL_OTHER                       = "TPL_GENERIC"
 *
 * 미설정인 kind 는 SMS 폴백.
 */
const KAKAO_TEMPLATE_BY_KIND: Record<string, string | undefined> = {
  ORDER_DELIVERED: process.env.SOLAPI_KAKAO_TPL_ORDER_DELIVERED,
  RETURN_ACCEPTED: process.env.SOLAPI_KAKAO_TPL_RETURN_ACCEPTED,
  RETURN_REJECTED: process.env.SOLAPI_KAKAO_TPL_RETURN_REJECTED,
  EXCHANGE_DIFFERENT_PAYMENT:
    process.env.SOLAPI_KAKAO_TPL_EXCHANGE_DIFFERENT_PAYMENT,
  PENDING_QUEUE_THRESHOLD: process.env.SOLAPI_KAKAO_TPL_PENDING_QUEUE_THRESHOLD,
  MAPPING_MISSING_TOP: process.env.SOLAPI_KAKAO_TPL_MAPPING_MISSING_TOP,
  OTHER: process.env.SOLAPI_KAKAO_TPL_OTHER,
};

class SolapiAdapter implements NotificationAdapter {
  readonly code = "SOLAPI";
  readonly displayName = "Solapi (SMS · 카카오 알림톡)";
  readonly supportedChannels: NotificationChannel[] = ["sms", "kakao"];

  private apiKey: string;
  private apiSecret: string;
  private senderPhone: string;
  private kakaoPfId: string | null;

  constructor(opts: {
    apiKey: string;
    apiSecret: string;
    senderPhone: string;
    kakaoPfId?: string | null;
  }) {
    this.apiKey = opts.apiKey;
    this.apiSecret = opts.apiSecret;
    this.senderPhone = opts.senderPhone;
    this.kakaoPfId = opts.kakaoPfId ?? null;
  }

  async send(
    channel: NotificationChannel,
    recipient: NotificationRecipient,
    payload: NotificationPayload,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!recipient.phone) {
      return { ok: false, error: "phone 없음" };
    }
    if (channel === "kakao" && !this.kakaoPfId) {
      // 카카오 알림톡 미설정 — SMS 로 폴백
      channel = "sms";
    }
    if (channel !== "sms" && channel !== "kakao") {
      return { ok: false, error: `channel ${channel} 미지원` };
    }

    try {
      // 카카오 알림톡 템플릿 ID 매핑 — kind 별 환경변수에서 lookup.
      //   SOLAPI_KAKAO_TPL_ORDER_DELIVERED, SOLAPI_KAKAO_TPL_RETURN_ACCEPTED, ...
      // 미설정 시 SMS 폴백.
      const templateId =
        channel === "kakao" ? KAKAO_TEMPLATE_BY_KIND[payload.kind] : null;
      const useKakao = channel === "kakao" && this.kakaoPfId && templateId;

      const message = {
        to: this.normalizePhone(recipient.phone),
        from: this.senderPhone,
        text: payload.body,
        ...(useKakao
          ? {
              type: "ATA",
              kakaoOptions: {
                pfId: this.kakaoPfId,
                templateId,
                // 템플릿 변수가 있는 경우 payload.meta.kakaoVars 에서 전달
                ...(payload.meta &&
                typeof (payload.meta as Record<string, unknown>).kakaoVars ===
                  "object"
                  ? {
                      variables: (payload.meta as { kakaoVars: unknown })
                        .kakaoVars,
                    }
                  : {}),
              },
            }
          : { type: "SMS" }),
      };

      const res = await fetch(`${SOLAPI_BASE_URL}/messages/v4/send`, {
        method: "POST",
        headers: {
          Authorization: this.buildAuthHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const body = await res.text();
        return { ok: false, error: `Solapi ${res.status}: ${body.slice(0, 200)}` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /**
   * Authorization 헤더 — HMAC-SHA256.
   * Solapi 공식 규약: signature = HMAC_SHA256(secret, date + salt) → hex
   */
  private buildAuthHeader(): string {
    const date = new Date().toISOString();
    const salt = crypto.randomUUID();
    const signature = this.hmacSha256Hex(
      this.apiSecret,
      date + salt,
    );
    return `HMAC-SHA256 apiKey=${this.apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
  }

  private hmacSha256Hex(secret: string, payload: string): string {
    // edge runtime 호환을 위해 Web Crypto 사용 — sync wrapper 가 필요해
    // node:crypto 도 시도 가능하지만 edge 호환 위해 dynamic. 운영 환경은 Node.js node:crypto 사용.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("node:crypto");
    const h = nodeCrypto.createHmac("sha256", secret);
    h.update(payload);
    return h.digest("hex");
  }

  /** 010-1234-5678 → 01012345678. Solapi 는 하이픈 허용하지만 정규화. */
  private normalizePhone(phone: string): string {
    return phone.replace(/[^0-9]/g, "");
  }
}

/**
 * 환경변수 기반 인스턴스 팩토리. 미설정이면 null 반환 (mock 폴백 신호).
 */
export function buildSolapiAdapterFromEnv(): SolapiAdapter | null {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const senderPhone = process.env.SOLAPI_SENDER_PHONE;
  if (!apiKey || !apiSecret || !senderPhone) return null;
  return new SolapiAdapter({
    apiKey,
    apiSecret,
    senderPhone,
    kakaoPfId: process.env.SOLAPI_KAKAO_PFID ?? null,
  });
}
