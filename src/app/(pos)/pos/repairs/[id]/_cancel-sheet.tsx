"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ApiError, apiMutate } from "@/lib/api-client";
import {
  JmBadge,
  JmButton,
  JmDrawer,
  JmDrawerBody,
  JmDrawerContent,
  JmDrawerFooter,
  JmDrawerHeader,
  JmDrawerTitle,
  JmTextarea,
} from "@/jm";

// ──── 취소 사유 시트 ────
export type CancelReason =
  | "CUSTOMER_DECLINED"
  | "CUSTOMER_NO_SHOW"
  | "SHOP_GAVE_UP"
  | "PARTS_UNAVAILABLE"
  | "SOLD_AS_PRODUCT"
  | "MISTAKE"
  | "OTHER";

const CANCEL_REASONS: { value: CancelReason; label: string; desc: string }[] = [
  { value: "MISTAKE", label: "잘못 생성", desc: "실수로 만든 티켓 — 미등록 고객은 자동 영구 삭제" },
  { value: "SOLD_AS_PRODUCT", label: "상품 구매로 전환", desc: "수리 대신 같은/다른 제품 구매 — 통계 보존" },
  {
    value: "CUSTOMER_DECLINED",
    label: "손님 거절 (진단비도 면제)",
    desc: "진단비를 청구하려면 견적 화면의 [진단비만] 을 사용하세요 (손님/매장 사유 모두 OK)",
  },
  { value: "CUSTOMER_NO_SHOW", label: "고객 미반환", desc: "맡겼는데 안 찾으러 옴" },
  { value: "SHOP_GAVE_UP", label: "매장 포기", desc: "수리 불가 판정" },
  { value: "PARTS_UNAVAILABLE", label: "부속 수급 불가", desc: "부속을 구할 수 없음" },
  { value: "OTHER", label: "기타", desc: "메모로 사유 기록" },
];

export function cancelReasonLabel(reason: CancelReason | string): string {
  return CANCEL_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

// ──── 영구 삭제 버튼 (CANCELLED 상태에서만) ────
export function HardDeleteButton({
  ticketId,
  ticketNo,
  onDeleted,
}: {
  ticketId: string;
  ticketNo: string;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => apiMutate(`/api/repair-tickets/${ticketId}`, "DELETE"),
    onSuccess: () => {
      toast.success("영구 삭제됨");
      qc.invalidateQueries({ queryKey: ["pos-v2", "repairs"] });
      qc.invalidateQueries({ queryKey: ["repairs", "list"] });
      qc.invalidateQueries({ queryKey: ["repairs", "detail", ticketId] });
      qc.invalidateQueries({ queryKey: ["repairs"] });
      onDeleted();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "삭제 실패"),
  });

  if (confirming) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-[var(--jm-danger-bg)] bg-[var(--jm-danger-bg)] p-3">
        <span className="text-jm-2xs text-[var(--jm-danger-fg)]">
          {ticketNo} 영구 삭제 — 되돌릴 수 없습니다
        </span>
        <div className="flex gap-2">
          <JmButton
            variant="outline"
            size="sm"
            onClick={() => setConfirming(false)}
            disabled={del.isPending}
          >
            취소
          </JmButton>
          <JmButton
            variant="danger"
            size="sm"
            onClick={() => del.mutate()}
            disabled={del.isPending}
          >
            {del.isPending ? "삭제…" : "확인"}
          </JmButton>
        </div>
      </div>
    );
  }
  return (
    <JmButton
      variant="outline"
      onClick={() => setConfirming(true)}
      className="border-[var(--jm-danger-bg)] text-[var(--jm-danger-fg)] hover:bg-[var(--jm-danger-bg)]"
    >
      <Trash2 className="size-4" />
      영구 삭제
    </JmButton>
  );
}

export interface CancelPart {
  id: string;
  name: string;
  status: "USED" | "LOST";
}

export function CancelSheet({
  open,
  onOpenChange,
  isUnregistered,
  hasArchivalValue,
  parts,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isUnregistered: boolean;
  /** 보존 가치(시리얼/LOST/진단비/등록고객) 가 하나라도 있으면 true → 항상 soft delete */
  hasArchivalValue: boolean;
  parts: CancelPart[];
  onConfirm: (reason: CancelReason, memo: string) => void;
  loading?: boolean;
}) {
  const [reason, setReason] = useState<CancelReason>(
    isUnregistered ? "MISTAKE" : "CUSTOMER_DECLINED",
  );
  const [memo, setMemo] = useState("");
  const willHardDelete = !hasArchivalValue && reason !== "SOLD_AS_PRODUCT";

  return (
    <JmDrawer open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <JmDrawerContent side="bottom" size="lg" dragHandle>
        <JmDrawerHeader>
          <JmDrawerTitle>수리 취소</JmDrawerTitle>
        </JmDrawerHeader>

        <JmDrawerBody>
          <div className="flex flex-col gap-4 pt-2">
            {parts.length > 0 && (
              <div className="flex flex-col gap-2 rounded-xl border-2 border-[var(--jm-warning-bg)] bg-[var(--jm-warning-bg)] px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[var(--jm-warning-fg)]">
                    <path
                      d="M7 2L1 12h12L7 2z"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinejoin="round"
                    />
                    <path d="M7 6v3M7 10.5v0.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <span className="text-jm-2xs font-semibold text-[var(--jm-warning-fg)]">
                    부속 {parts.length}건 — USED/LOST 상태를 다시 확인하세요
                  </span>
                </div>
                <p className="text-[11px] text-[var(--jm-warning-fg)]">
                  <span className="font-semibold">USED</span> 는 재고로 복원되고,{" "}
                  <span className="font-semibold">LOST</span> 는 손실로 기록됩니다. 잘못된 상태로 취소하면 재고/회계가 어긋날 수 있습니다.
                </p>
                <div className="flex flex-col gap-1">
                  {parts.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 rounded-lg bg-[var(--jm-surface)] px-2.5 py-1.5"
                    >
                      <JmBadge
                        variant={p.status === "LOST" ? "danger" : "success"}
                        size="sm"
                      >
                        {p.status}
                      </JmBadge>
                      <span className="line-clamp-1 text-jm-2xs text-[var(--jm-text)]">
                        {p.name}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => !loading && onOpenChange(false)}
                  disabled={loading}
                  className="self-start text-[11px] font-semibold text-[var(--jm-warning-fg)] underline-offset-2 hover:underline disabled:opacity-50"
                >
                  ← 닫고 부속 카드에서 수정
                </button>
              </div>
            )}

            <div
              className={`rounded-xl px-4 py-3 text-jm-2xs ${
                willHardDelete ? "bg-[var(--jm-danger-bg)] text-[var(--jm-danger-fg)]" : "bg-[var(--jm-bg)] text-[var(--jm-text-muted)]"
              }`}
            >
              {willHardDelete ? (
                <>
                  <span className="font-semibold text-[var(--jm-danger-fg)]">영구 삭제</span> — 미등록 + 시리얼/LOST 부속/진단비 모두 없음. 사유와 무관하게 row 자체를 삭제합니다.
                </>
              ) : reason === "SOLD_AS_PRODUCT" ? (
                <>
                  <span className="font-semibold text-[var(--jm-success-fg)]">기록 보존</span> — &quot;상품 구매로 전환&quot; 은 마케팅·통계 가치가 있어 사유 보존. row 는 CANCELLED 상태로 남습니다.
                </>
              ) : (
                <>USED 부속은 재고 복원, LOST 부속은 손실 유지, 진단비는 기록 보존. 시리얼·등록고객 등 추적 가치가 있어 row 는 CANCELLED 상태로 남습니다.</>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
                사유
              </span>
              <div className="flex flex-col gap-1.5">
                {CANCEL_REASONS.map((r) => {
                  const active = reason === r.value;
                  return (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setReason(r.value)}
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
            variant={willHardDelete ? "danger" : "cta"}
            size="lg"
            onClick={() => onConfirm(reason, memo)}
            disabled={loading}
            className="w-full"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            {willHardDelete ? "영구 삭제" : "취소 처리 (기록 보존)"}
          </JmButton>
        </JmDrawerFooter>
      </JmDrawerContent>
    </JmDrawer>
  );
}
