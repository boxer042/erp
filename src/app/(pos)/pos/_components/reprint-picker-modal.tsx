"use client";

import { useState } from "react";

export interface ReprintCandidate {
  code: string;
  ticketNo: string;
  displayName: string;
}

/**
 * 재출력 라벨 선택 모달 — 기존 시리얼 보유 수리 ticket 리스트에서
 * 어떤 라벨을 재출력할지 체크박스로 선택. 기본 전체 체크.
 *
 * 사용처:
 *   - PostPaymentPrintDialog (결제 후 [재출력 포함] 옵션 선택 시 2단계)
 *   - Cart [시리얼출력] 버튼 — 기존 라벨 발견 시 직접 노출
 */
export function ReprintPickerModal({
  candidates,
  onConfirm,
  onBack,
}: {
  candidates: ReprintCandidate[];
  onConfirm: (codes: string[]) => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(candidates.map((c) => c.code)),
  );
  const toggle = (code: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onBack}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-[var(--jm-surface)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1 pb-3">
          <h3 className="text-[18px] font-bold text-[var(--jm-text)]">
            어떤 라벨 재출력?
          </h3>
          <p className="text-[12px] text-[var(--jm-text-muted)]">
            이미 발번된 라벨이라 신규 발번은 안 하고 재출력만 합니다.
          </p>
        </div>

        <div className="flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto py-1">
          {candidates.map((c) => {
            const checked = selected.has(c.code);
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => toggle(c.code)}
                className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${
                  checked
                    ? "bg-[var(--jm-action)]/10 ring-1 ring-[var(--jm-action)]/40"
                    : "bg-[var(--jm-bg)] hover:bg-[var(--jm-surface-muted)]"
                }`}
              >
                <div className="flex min-w-0 flex-col">
                  <span className="line-clamp-1 text-[14px] font-semibold text-[var(--jm-text)]">
                    {c.displayName}
                  </span>
                  <span className="font-mono text-[11px] text-[var(--jm-text-muted)]">
                    {c.ticketNo} · {c.code}
                  </span>
                </div>
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                    checked
                      ? "border-[var(--jm-action)] bg-[var(--jm-action)] text-white"
                      : "border-[var(--jm-border-strong)] bg-[var(--jm-surface)]"
                  }`}
                >
                  {checked && (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path
                        d="M3 7.5l3 3 5-6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-[var(--jm-surface-muted)] text-[14px] font-semibold text-[var(--jm-text-muted)] transition-colors active:bg-[var(--jm-border)]"
          >
            뒤로
          </button>
          <button
            type="button"
            onClick={() => onConfirm(Array.from(selected))}
            disabled={selected.size === 0}
            className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-[var(--jm-action)] text-[15px] font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-50"
          >
            출력 ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
}
