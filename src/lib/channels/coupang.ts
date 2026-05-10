/**
 * 쿠팡 WING OPENAPI 어댑터 — 실 가입 + Vendor ID/Access Key 등록 후 활성화.
 *
 * 환경변수:
 *   COUPANG_VENDOR_ID    = "A00..."   — Vendor 식별자
 *   COUPANG_ACCESS_KEY   = "..."       — OPENAPI Access Key
 *   COUPANG_SECRET_KEY   = "..."       — OPENAPI Secret Key (HMAC 서명용)
 *
 * 인증 (HMAC):
 *   Authorization: CEA algorithm=HmacSHA256, access-key={key}, signed-date={yyyyMMdd}T{HHmmss}Z, signature={hex}
 *   signature = hex(hmac_sha256(secret, datePart + httpMethod + path + queryString))
 *
 * Phase 2 단계별:
 *   1) 쿠팡 WING 입점 + Vendor ID 발급 + OPENAPI 신청 → Access/Secret Key 수령
 *   2) 신규주문 fetch endpoint:
 *        GET /v2/providers/openapi/apis/api/v4/vendors/{vendorId}/ordersheets?createdAtFrom=...&createdAtTo=...
 *      응답을 RawChannelOrder[] 로 매핑 (orderId → channelOrderNo, items[].sellerProductItemId → channelSku 등)
 *   3) 송장 push:
 *        PUT /v2/providers/openapi/apis/api/v4/vendors/{vendorId}/orders/{shipmentBoxId}/ordersheets
 *        body: { invoiceNumberUploadList: [{ deliveryCompanyCode, invoiceNumber }] }
 *   4) 반품 ack:
 *        POST .../returnRequests/{cancelId}/approval  (수락)
 *        POST .../returnRequests/{cancelId}/rejection (반려)
 *   5) 재고 push:
 *        PUT  .../products/{vendorItemId}/inventories/{itemId}/quantities/{quantity}
 *
 * 정확한 path/payload 는 쿠팡 OPENAPI 문서 참조 (계정 가입 후 접근 가능).
 * 본 파일은 인증 + 호출 framework 만 갖춰두고, 각 메서드는 가입 후 실 endpoint 로 채울 stub.
 */
import type { ChannelAdapter, RawChannelOrder } from "./types";

const COUPANG_BASE_URL = "https://api-gateway.coupang.com";

class CoupangAdapter implements ChannelAdapter {
  readonly code = "COUPANG";
  readonly displayName = "쿠팡";

  private vendorId: string;
  private accessKey: string;
  private secretKey: string;

  constructor(opts: {
    vendorId: string;
    accessKey: string;
    secretKey: string;
  }) {
    this.vendorId = opts.vendorId;
    this.accessKey = opts.accessKey;
    this.secretKey = opts.secretKey;
  }

  async fetchNewOrders(_since: Date): Promise<RawChannelOrder[]> {
    // TODO: 가입 후 실 endpoint 연결.
    // 1) since → createdAtFrom (yyyy-MM-dd HH:mm:ss KST)
    // 2) GET .../vendors/{vendorId}/ordersheets?status=ACCEPT&createdAtFrom=...&createdAtTo=...
    // 3) 응답 data[].ordersheets[] 를 순회하며 RawChannelOrder 매핑
    console.warn("[coupang] fetchNewOrders — stub. 가입 후 endpoint 연결 필요");
    return [];
  }

  async pushTrackingNumber(
    channelOrderNo: string,
    carrier: string,
    trackingNumber: string,
  ): Promise<void> {
    // TODO: 가입 후 실 endpoint 연결.
    // PUT .../vendors/{vendorId}/orders/{shipmentBoxId}/ordersheets
    // body: { invoiceNumberUploadList: [{ deliveryCompanyCode: mapToCoupangCarrierCode(carrier), invoiceNumber: trackingNumber }] }
    void channelOrderNo;
    void carrier;
    void trackingNumber;
    throw new Error("coupang.pushTrackingNumber not yet implemented");
  }

  async acceptReturn(channelOrderNo: string): Promise<void> {
    // TODO: POST .../returnRequests/{cancelId}/approval
    void channelOrderNo;
    throw new Error("coupang.acceptReturn not yet implemented");
  }

  async rejectReturn(channelOrderNo: string, reason: string): Promise<void> {
    // TODO: POST .../returnRequests/{cancelId}/rejection { reason }
    void channelOrderNo;
    void reason;
    throw new Error("coupang.rejectReturn not yet implemented");
  }

  async pushStock(
    items: Array<{ channelSku: string; availableQty: number }>,
  ): Promise<void> {
    // TODO: 매핑된 channelSku 별 PUT .../products/{vendorItemId}/inventories/{itemId}/quantities/{availableQty}
    // channelSku → vendorItemId 변환은 ChannelProductMapping 측에 보관된 값으로
    void items;
    throw new Error("coupang.pushStock not yet implemented");
  }

  /**
   * HMAC 서명 helper — 가입 후 메서드들이 fetch 호출 시 사용.
   * Authorization 헤더: "CEA algorithm=HmacSHA256, access-key=..., signed-date=..., signature=..."
   */
  private buildAuthHeader(method: string, path: string, query: string): string {
    const now = new Date();
    const datePart = formatCoupangDate(now); // yyMMddTHHmmssZ
    const message = datePart + method.toUpperCase() + path + query;
    const signature = hmacSha256Hex(this.secretKey, message);
    return `CEA algorithm=HmacSHA256, access-key=${this.accessKey}, signed-date=${datePart}, signature=${signature}`;
  }

  /** 향후 fetch wrapper — 메서드들이 공유 */
  // eslint-disable-next-line @typescript-eslint/no-unused-private-class-members
  private async authedFetch(
    method: string,
    path: string,
    query = "",
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: this.buildAuthHeader(method, path, query),
      "X-EXTENDED-Timeout": "90000",
      "Content-Type": "application/json;charset=UTF-8",
    };
    return fetch(`${COUPANG_BASE_URL}${path}${query}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }
}

function formatCoupangDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${yy}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function hmacSha256Hex(secret: string, payload: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require("node:crypto");
  return nodeCrypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function buildCoupangAdapterFromEnv(): CoupangAdapter | null {
  const vendorId = process.env.COUPANG_VENDOR_ID;
  const accessKey = process.env.COUPANG_ACCESS_KEY;
  const secretKey = process.env.COUPANG_SECRET_KEY;
  if (!vendorId || !accessKey || !secretKey) return null;
  return new CoupangAdapter({ vendorId, accessKey, secretKey });
}
