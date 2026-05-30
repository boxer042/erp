"use client";

import { JmDatePicker, JmInput, JmSelect } from "@/jm";

interface Props {
  channelOptions: { value: string; label: string }[];
  channelId: string;
  onChannelChange: (v: string) => void;
  orderDate: Date | undefined;
  onOrderDateChange: (d: Date | undefined) => void;
  channelOrderNo: string;
  onChannelOrderNoChange: (v: string) => void;
}

/**
 * 주문 등록 상단 맥락 바 — 채널·거래일(ERP 전용)을 흐름 상단에 항상 노출.
 * 기본값(오프라인/오늘)이면 멈추지 않고 진행, 채널 주문이면 채널 주문번호까지 인라인 노출.
 * POS 에는 이 바를 렌더하지 않아 POS 흐름은 영향 없음(채널=null, 거래일=now).
 *
 * 상태·핸들러·제출 payload 는 부모(orders/new)가 그대로 보유 — 이 컴포넌트는 표시/입력만.
 */
export function OrderContextBar({
  channelOptions,
  channelId,
  onChannelChange,
  orderDate,
  onOrderDateChange,
  channelOrderNo,
  onChannelOrderNoChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--jm-border)] px-4 py-2 sm:px-6">
      <label className="flex items-center gap-2">
        <span className="shrink-0 text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
          채널
        </span>
        <div className="w-[170px]">
          <JmSelect
            options={channelOptions}
            value={channelId}
            onChange={onChannelChange}
            placeholder="오프라인 / 직접"
          />
        </div>
      </label>

      <label className="flex items-center gap-2">
        <span className="shrink-0 text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
          거래일
        </span>
        <div className="w-[150px]">
          <JmDatePicker
            size="sm"
            value={orderDate}
            onChange={onOrderDateChange}
            toDate={new Date()}
          />
        </div>
      </label>

      {channelId && (
        <label className="flex items-center gap-2">
          <span className="shrink-0 text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
            채널 주문번호
          </span>
          <div className="w-[200px]">
            <JmInput
              value={channelOrderNo}
              onChange={(e) => onChannelOrderNoChange(e.target.value)}
              placeholder="외부 채널 주문번호 (선택)"
            />
          </div>
        </label>
      )}
    </div>
  );
}
