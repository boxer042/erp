/**
 * 채널 어댑터 registry — 코드별 어댑터 인스턴스 제공.
 *
 * Phase 1: Mock 어댑터만 등록 (가입 전 검증용).
 * Phase 2: 실제 채널 어댑터 (`./coupang.ts`, `./naver.ts` 등) 추가 후 매핑.
 *
 * 채널 코드는 SalesChannel.code 와 매칭. ERP 의 SalesChannel 에 등록된 채널만
 * import 가능 — 그 채널의 code 가 registry 에 없으면 어댑터 없음으로 처리.
 */
import { MockChannelAdapter } from "./mock";
import type { ChannelAdapter } from "./types";

/**
 * Mock 어댑터는 채널 식별만 다르게 여러 개 등록 가능.
 * 실 가입 전 채널 import 흐름을 SalesChannel 별로 dev 검증.
 */
const MOCK_ADAPTERS: ChannelAdapter[] = [
  new MockChannelAdapter({
    code: "MOCK",
    displayName: "Mock 채널 (검증용)",
    knownSkus: ["KNOWN-SKU-001", "KNOWN-SKU-002"],
  }),
];

const adapters: Map<string, ChannelAdapter> = new Map(
  MOCK_ADAPTERS.map((a) => [a.code, a]),
);

/** 채널 코드로 어댑터 lookup. 없으면 null */
export function getChannelAdapter(code: string): ChannelAdapter | null {
  return adapters.get(code) ?? null;
}

/** registry 에 등록된 모든 어댑터 */
export function listChannelAdapters(): ChannelAdapter[] {
  return Array.from(adapters.values());
}
