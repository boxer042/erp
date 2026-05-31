"use client";

import { X } from "lucide-react";
import { JmDatePicker, JmInput, JmSelect } from "@/jm";

interface Props {
  // 고객 — ERP 주문은 결제 전 미리 선택 (POS 는 결제 시점). 헤더 맥락 바에 노출.
  customerName: string | null;
  customerType: "INDIVIDUAL" | "BUSINESS";
  hasCustomer: boolean;
  onCustomerClick: () => void;
  onCustomerClear?: () => void;

  channelOptions: { value: string; label: string }[];
  channelId: string;
  onChannelChange: (v: string) => void;
  orderDate: Date | undefined;
  onOrderDateChange: (d: Date | undefined) => void;
  channelOrderNo: string;
  onChannelOrderNoChange: (v: string) => void;
}

/**
 * 주문 등록 상단 맥락 바 — 고객·채널·거래일(ERP 전용)을 흐름 상단에 항상 노출.
 * ERP 는 결제 전에 고객을 미리 선택해야 하므로(POS 와 다른 점) 여기서 고객도 고른다.
 * 기본값(오프라인/오늘)이면 멈추지 않고 진행, 채널 주문이면 채널 주문번호까지 인라인 노출.
 * POS 에는 이 바를 렌더하지 않아 POS 흐름은 영향 없음.
 *
 * 상태·핸들러·제출 payload 는 부모(orders/new)가 그대로 보유 — 이 컴포넌트는 표시/입력만.
 */
export function OrderContextBar({
  customerName,
  customerType,
  hasCustomer,
  onCustomerClick,
  onCustomerClear,
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
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
          고객
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onCustomerClick}
            className="flex h-9 min-w-[150px] max-w-[220px] items-center gap-1.5 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 text-left text-jm-sm transition-colors hover:border-[var(--jm-border-strong)]"
          >
            {hasCustomer ? (
              <>
                {customerType === "BUSINESS" && (
                  <span className="shrink-0 rounded-full bg-[var(--jm-warning-bg)] px-1.5 py-0 text-jm-4xs font-semibold text-[var(--jm-warning-fg)]">
                    기업
                  </span>
                )}
                <span className="truncate text-[var(--jm-text)]">
                  {customerName || "고객"}
                </span>
              </>
            ) : (
              <span className="text-[var(--jm-text-muted)]">고객 선택</span>
            )}
          </button>
          {hasCustomer && onCustomerClear && (
            <button
              type="button"
              onClick={onCustomerClear}
              aria-label="고객 해제"
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface-muted)] hover:text-[var(--jm-text)]"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

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
