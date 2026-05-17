"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import {
  JmButton,
  JmDrawer,
  JmDrawerBody,
  JmDrawerContent,
  JmDrawerFooter,
  JmDrawerHeader,
  JmDrawerTitle,
  JmTextarea,
} from "@/jm";

// ──── 손님 견적 거절 사유 시트 ────
// reject_after_quote 액션 — 손님이 수리를 포기하지만 진단비는 청구하는 케이스.
// 사유는 마진/가격 정책 피드백용. 진단비 0 인 티켓에도 학습을 위해 받음.

export type QuoteRejectReason =
  | "TOO_EXPENSIVE"
  | "NOT_WORTH_IT"
  | "WILL_SHOP_AROUND"
  | "CHANGED_MIND"
  | "PARTS_UNAVAILABLE"
  | "SHOP_DECLINED"
  | "OTHER";

interface RejectReasonOption {
  value: QuoteRejectReason;
  label: string;
  desc: string;
}

const CUSTOMER_REASONS: RejectReasonOption[] = [
  { value: "TOO_EXPENSIVE", label: "가격 부담", desc: "수리비 자체가 비싸서" },
  { value: "NOT_WORTH_IT", label: "가성비 문제", desc: "새 제품 사는 게 낫다고 판단" },
  { value: "WILL_SHOP_AROUND", label: "다른 매장 비교", desc: "타 매장 견적 받아본 후 결정" },
  { value: "CHANGED_MIND", label: "단순 변심", desc: "특별한 이유 없이 마음 바뀜" },
];

const SHOP_REASONS: RejectReasonOption[] = [
  { value: "PARTS_UNAVAILABLE", label: "부속 수급 불가", desc: "진단까지 했는데 부속을 못 구함" },
  { value: "SHOP_DECLINED", label: "매장 포기", desc: "장비·시간·복잡도 부족으로 매장에서 못 함" },
];

const OTHER_REASON: RejectReasonOption = {
  value: "OTHER",
  label: "기타",
  desc: "메모로 사유 기록",
};

const ALL_REASONS: RejectReasonOption[] = [
  ...CUSTOMER_REASONS,
  ...SHOP_REASONS,
  OTHER_REASON,
];

export function quoteRejectReasonLabel(reason: QuoteRejectReason | string): string {
  return ALL_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

export function RejectSheet({
  open,
  onOpenChange,
  diagnosisFee,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 청구될 진단비 (세전, 표시는 부가세 포함으로 별도 처리) */
  diagnosisFee: number;
  onConfirm: (reason: QuoteRejectReason, memo: string) => void;
  loading?: boolean;
}) {
  const [reason, setReason] = useState<QuoteRejectReason>("TOO_EXPENSIVE");
  const [memo, setMemo] = useState("");
  const grossFee = Math.round(diagnosisFee * 1.1);

  return (
    <JmDrawer open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <JmDrawerContent side="bottom" size="lg" dragHandle>
        <JmDrawerHeader>
          <JmDrawerTitle>진단비만 청구</JmDrawerTitle>
        </JmDrawerHeader>

        <JmDrawerBody>
          <div className="flex flex-col gap-4 pt-2">
            <div className="rounded-xl border-2 border-[var(--jm-action)] bg-[var(--jm-bg)] px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
                  청구 예정 진단비
                </span>
                <span className="tabular-nums text-jm-lg font-bold text-[var(--jm-text)]">
                  ₩{grossFee.toLocaleString("ko-KR")}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[var(--jm-text-muted)]">
                인계대기로 이동 후 [픽업/결제] 단계에서 진단비만 청구됩니다.
                {diagnosisFee === 0 && (
                  <span className="block mt-0.5 text-[var(--jm-warning-fg)]">
                    ⚠ 진단비가 0 으로 설정되어 있습니다. 위 진단비 카드에서 금액을 먼저 입력하세요.
                  </span>
                )}
              </p>
            </div>

            <ReasonGroup
              title="손님 사유"
              reasons={CUSTOMER_REASONS}
              selected={reason}
              onSelect={setReason}
            />
            <ReasonGroup
              title="매장 사유"
              reasons={SHOP_REASONS}
              selected={reason}
              onSelect={setReason}
            />
            <ReasonGroup
              title="기타"
              reasons={[OTHER_REASON]}
              selected={reason}
              onSelect={setReason}
            />

            <div className="flex flex-col gap-1.5">
              <span className="text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
                메모 {reason === "OTHER" && <span className="text-[var(--jm-danger-fg)]">(필수)</span>}
              </span>
              <JmTextarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="추가 설명 (선택)"
                rows={2}
              />
            </div>
          </div>
        </JmDrawerBody>

        <JmDrawerFooter>
          <JmButton
            variant="cta"
            size="lg"
            onClick={() => onConfirm(reason, memo)}
            disabled={loading || (reason === "OTHER" && !memo.trim())}
            className="w-full"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            진단비 청구로 진행
          </JmButton>
        </JmDrawerFooter>
      </JmDrawerContent>
    </JmDrawer>
  );
}

function ReasonGroup({
  title,
  reasons,
  selected,
  onSelect,
}: {
  title: string;
  reasons: RejectReasonOption[];
  selected: QuoteRejectReason;
  onSelect: (v: QuoteRejectReason) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
        {title}
      </span>
      <div className="flex flex-col gap-1.5">
        {reasons.map((r) => {
          const active = selected === r.value;
          return (
            <button
              key={r.value}
              type="button"
              onClick={() => onSelect(r.value)}
              className={`flex flex-col gap-0.5 rounded-2xl border-2 p-3 text-left transition-colors ${
                active
                  ? "border-[var(--jm-action)] bg-[var(--jm-bg)]"
                  : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)]"
              }`}
            >
              <span className="text-jm-sm font-semibold text-[var(--jm-text)]">
                {r.label}
              </span>
              <span className="text-[11px] text-[var(--jm-text-muted)]">{r.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
