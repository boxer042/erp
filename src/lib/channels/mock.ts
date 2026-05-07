/**
 * Mock 채널 어댑터 — Phase 1 검증용.
 *
 * 실제 채널 가입 전에 dev 환경에서 import 흐름을 end-to-end 검증.
 * 호출 시 fake RawChannelOrder 를 반환. 사용자가 채널 페이지에서 [import 시뮬레이션] 버튼으로 트리거.
 */
import type { ChannelAdapter, RawChannelOrder } from "./types";

/**
 * MockChannelAdapter — 매번 호출 시 새 fake 주문 1~3건 반환.
 * channelOrderNo 는 timestamp 기반으로 unique 보장.
 *
 * channelSku 는 두 종류 섞어 매핑 누락도 검증 가능:
 *  - "KNOWN-SKU-*" : 사용자가 미리 매핑해둔 SKU (정상 import)
 *  - "UNKNOWN-SKU-*" : 매핑 안 된 SKU (보류 큐로 격리)
 */
export class MockChannelAdapter implements ChannelAdapter {
  readonly code: string;
  readonly displayName: string;
  private knownSkus: string[];

  constructor(opts: {
    code: string;
    displayName: string;
    /** 정상 import 가능한 SKU 후보 — 사용자가 매핑 등록한 것과 매칭 */
    knownSkus?: string[];
  }) {
    this.code = opts.code;
    this.displayName = opts.displayName;
    this.knownSkus = opts.knownSkus ?? ["KNOWN-SKU-001", "KNOWN-SKU-002"];
  }

  async fetchNewOrders(_since: Date): Promise<RawChannelOrder[]> {
    const now = Date.now();
    const count = Math.floor(Math.random() * 3) + 1;
    const orders: RawChannelOrder[] = [];
    for (let i = 0; i < count; i++) {
      const orderTimestamp = now + i;
      const useKnown = Math.random() > 0.3; // 70% 정상, 30% 매핑 누락
      const sku = useKnown
        ? this.knownSkus[Math.floor(Math.random() * this.knownSkus.length)]
        : `UNKNOWN-SKU-${orderTimestamp}`;
      const qty = Math.floor(Math.random() * 3) + 1;
      orders.push({
        channelOrderNo: `MOCK-${this.code}-${orderTimestamp}`,
        orderedAt: new Date(orderTimestamp).toISOString(),
        buyer: {
          name: `Mock 손님 ${i + 1}`,
          phone: "010-0000-0000",
        },
        recipient: {
          name: `Mock 손님 ${i + 1}`,
          phone: "010-0000-0000",
          address: "서울시 어딘가 1-1",
        },
        items: [
          {
            channelSku: sku,
            channelProductName: useKnown ? "테스트 정상 상품" : "테스트 미매핑 상품",
            quantity: qty,
            unitPrice: 10000 + Math.floor(Math.random() * 50000),
          },
        ],
        fulfillmentType: "SHIPPING",
        // 채널이 D+1 정책이라 가정
        expectedShipDate: (() => {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          return d.toISOString().slice(0, 10);
        })(),
        prepaid: true,
        memo: useKnown ? undefined : "테스트 메모: 빠른 발송 부탁드려요",
        raw: { source: "mock", generatedAt: new Date().toISOString() },
      });
    }
    return orders;
  }

  async pushTrackingNumber(): Promise<void> {
    // Mock — no-op. Phase 2 에서 채널 API 로 송신.
  }

  async acceptReturn(): Promise<void> {
    // Mock — no-op.
  }

  async rejectReturn(): Promise<void> {
    // Mock — no-op.
  }
}
