/**
 * 네이버 커머스 API 어댑터 — 스마트스토어 가입 + 커머스API 신청 후 활성화.
 *
 * 환경변수:
 *   NAVER_CLIENT_ID     = "..."  — 네이버 커머스API client ID
 *   NAVER_CLIENT_SECRET = "..."  — 클라이언트 시크릿
 *   NAVER_TOKEN_URL     = "..."  — 기본 https://api.commerce.naver.com/external/v1/oauth2/token
 *
 * 인증 (OAuth2 Client Credentials):
 *   1) POST {tokenUrl} 로 access_token 발급 (grant_type=client_credentials, type=SELF, client_secret_sign 헤더)
 *   2) 발급받은 access_token 을 Authorization: Bearer 로 모든 호출에 부여
 *   3) 만료 시간(보통 3시간) 도달 전 재발급
 *
 * Phase 2 단계별:
 *   1) 스마트스토어 입점 + 커머스API 신청 → Client ID/Secret 수령
 *   2) 신규주문 fetch:
 *        GET /external/v1/pay-order/seller/product-orders?lastChangedFrom=...&lastChangedType=PAYED
 *      응답을 RawChannelOrder[] 로 매핑
 *   3) 송장 push:
 *        POST /external/v1/pay-order/seller/product-orders/dispatch
 *        body: { dispatchProductOrders: [{ productOrderId, deliveryMethod, deliveryCompanyCode, trackingNumber, dispatchDate }] }
 *   4) 반품 ack:
 *        POST .../product-orders/{productOrderId}/return-approve
 *        POST .../product-orders/{productOrderId}/return-reject
 *   5) 재고 push:
 *        PUT  /external/v2/products/origin-products/{originProductNo}/stock-quantity
 *        body: { stockQuantity }
 *
 * 본 파일은 OAuth + 호출 framework stub. 가입 후 endpoint 별 구현 채움.
 */
import type { ChannelAdapter, RawChannelOrder } from "./types";

const NAVER_BASE_URL = "https://api.commerce.naver.com";

class NaverAdapter implements ChannelAdapter {
  readonly code = "NAVER";
  readonly displayName = "네이버 스마트스토어";

  private clientId: string;
  private clientSecret: string;
  private tokenUrl: string;

  // 메모리 토큰 캐시 — 만료 전엔 재사용
  private cachedToken: { accessToken: string; expiresAt: number } | null = null;

  constructor(opts: {
    clientId: string;
    clientSecret: string;
    tokenUrl?: string;
  }) {
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
    this.tokenUrl =
      opts.tokenUrl ?? `${NAVER_BASE_URL}/external/v1/oauth2/token`;
  }

  async fetchNewOrders(_since: Date): Promise<RawChannelOrder[]> {
    // TODO: 가입 후 실 endpoint 연결.
    // 1) await this.ensureToken()
    // 2) GET /external/v1/pay-order/seller/product-orders?lastChangedFrom=since.iso&lastChangedType=PAYED
    // 3) data[] 의 productOrderId → channelOrderNo, productOption → channelSku, quantity, totalPaymentAmount → unitPrice
    console.warn("[naver] fetchNewOrders — stub. 가입 후 endpoint 연결 필요");
    return [];
  }

  async pushTrackingNumber(
    channelOrderNo: string,
    carrier: string,
    trackingNumber: string,
  ): Promise<void> {
    // TODO: POST /external/v1/pay-order/seller/product-orders/dispatch
    // body: { dispatchProductOrders: [{ productOrderId: channelOrderNo, deliveryCompanyCode: mapToNaverCarrierCode(carrier), trackingNumber, dispatchDate: nowIso }] }
    void channelOrderNo;
    void carrier;
    void trackingNumber;
    throw new Error("naver.pushTrackingNumber not yet implemented");
  }

  async acceptReturn(channelOrderNo: string): Promise<void> {
    // TODO: POST .../product-orders/{channelOrderNo}/return-approve
    void channelOrderNo;
    throw new Error("naver.acceptReturn not yet implemented");
  }

  async rejectReturn(channelOrderNo: string, reason: string): Promise<void> {
    // TODO: POST .../product-orders/{channelOrderNo}/return-reject  body: { reason }
    void channelOrderNo;
    void reason;
    throw new Error("naver.rejectReturn not yet implemented");
  }

  async pushStock(
    items: Array<{ channelSku: string; availableQty: number }>,
  ): Promise<void> {
    // TODO: 매핑된 channelSku 별 PUT /external/v2/products/origin-products/{originProductNo}/stock-quantity
    // channelSku 는 ChannelProductMapping 에 보관된 originProductNo 사용
    void items;
    throw new Error("naver.pushStock not yet implemented");
  }

  /**
   * OAuth2 Client Credentials 토큰 발급. 캐싱 + 만료 전 재사용.
   * 네이버 커머스는 client_secret_sign 방식 — bcrypt(clientSecret + timestamp) HMAC.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-private-class-members
  private async ensureToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 60_000) {
      return this.cachedToken.accessToken;
    }
    const timestamp = String(now);
    const sign = bcryptSign(this.clientSecret, timestamp);
    const body = new URLSearchParams({
      client_id: this.clientId,
      timestamp,
      client_secret_sign: sign,
      grant_type: "client_credentials",
      type: "SELF",
    });
    const res = await fetch(this.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`naver token issuance failed: ${res.status} ${err.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.cachedToken = {
      accessToken: json.access_token,
      expiresAt: now + json.expires_in * 1000,
    };
    return this.cachedToken.accessToken;
  }
}

/**
 * bcrypt(clientSecret + "_" + timestamp, 12 rounds) 후 base64.
 * 네이버 커머스가 요구하는 client_secret_sign 형식.
 *
 * Note: 본 함수는 stub — 실제 구현은 bcrypt 패키지 추가 후. Phase 2 가입 후
 * `bcryptjs` 또는 `bcrypt` npm 패키지로 교체.
 */
function bcryptSign(secret: string, timestamp: string): string {
  void secret;
  void timestamp;
  throw new Error(
    "naver bcryptSign not yet implemented — Phase 2 가입 후 bcryptjs 패키지 추가 필요",
  );
}

export function buildNaverAdapterFromEnv(): NaverAdapter | null {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return new NaverAdapter({
    clientId,
    clientSecret,
    tokenUrl: process.env.NAVER_TOKEN_URL,
  });
}
