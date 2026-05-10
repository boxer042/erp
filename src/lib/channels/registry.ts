/**
 * 채널 어댑터 registry — 코드별 어댑터 인스턴스 제공.
 *
 * Mock 은 항상 등록. 실 채널(Coupang/Naver)은 환경변수 설정 시 자동 등록 (가입 전엔 skip).
 * SalesChannel.code 와 매칭. registry 에 없으면 어댑터 없음으로 처리(skip).
 */
import { MockChannelAdapter } from "./mock";
import { buildCoupangAdapterFromEnv } from "./coupang";
import { buildNaverAdapterFromEnv } from "./naver";
import type { ChannelAdapter } from "./types";

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

// 환경변수 설정된 실 채널 자동 등록 — module 로드 시 1회.
// 미설정 시 null 반환 → registry 에 등록 안 됨 → 해당 SalesChannel 의 outbound·import 는 no-op.
const coupang = buildCoupangAdapterFromEnv();
if (coupang) adapters.set(coupang.code, coupang);

const naver = buildNaverAdapterFromEnv();
if (naver) adapters.set(naver.code, naver);

/** 채널 코드로 어댑터 lookup. 없으면 null */
export function getChannelAdapter(code: string): ChannelAdapter | null {
  return adapters.get(code) ?? null;
}

/** registry 에 등록된 모든 어댑터 */
export function listChannelAdapters(): ChannelAdapter[] {
  return Array.from(adapters.values());
}
