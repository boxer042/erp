"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Loader2, UserCircle2, Wrench, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { useSessions } from "@/components/pos/sessions-context";
import { BottomSheet } from "../_components/bottom-sheet";
import { STATUS_META, type RepairTicketRow, type RepairTicketDetail } from "./_types";
import { calcFinal } from "./_helpers";

interface ResurrectResponse {
  sessionId: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
}

/**
 * 수리 행 클릭 시 열리는 액션 드로우.
 * - 이 고객 카드 열기 — 부활 API → 그리드 합류 → 고객 페이지 이동
 * - 수리 상세        — /pos/repairs/[id] 이동
 * - 결제로 이동       — READY 일 때만. 부활(resurrect) → 합계 계산 → 카트 repair 라인 추가 → 고객 페이지 이동
 */
export function RepairActionSheet({
  ticket,
  onClose,
}: {
  ticket: RepairTicketRow | null;
  onClose: () => void;
}) {
  if (!ticket) return null;
  return <Body ticket={ticket} onClose={onClose} />;
}

function Body({
  ticket,
  onClose,
}: {
  ticket: RepairTicketRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const { forceSync, add, getSession } = useSessions();
  const [pending, setPending] = useState<"open" | "detail" | "checkout" | null>(
    null,
  );

  const meta = STATUS_META[ticket.status];
  const customerName =
    ticket.customer?.name ?? `미등록 고객 #${ticket.id.slice(0, 6)}`;

  const resurrectMutation = useMutation({
    mutationFn: (kind: "open" | "checkout") => {
      setPending(kind);
      return apiMutate<ResurrectResponse>(
        "/api/pos/sessions/resurrect",
        "POST",
        ticket.customer
          ? { customerId: ticket.customer.id }
          : { posSessionId: ticket.id }, // 미등록 — RepairTicket.posSessionId 와 PosSession.id 매칭
      );
    },
    onSuccess: async (data, kind) => {
      // "결제로 이동" — READY 티켓 의 합계를 계산해 카트에 repair 라인 추가
      if (kind === "checkout") {
        // 부활된 세션에 같은 repairTicketId 라인이 이미 있으면 재추가 스킵 (sync race 대비)
        await forceSync();
        const resurrected = getSession(data.sessionId);
        const alreadyInCart = resurrected?.items.some(
          (it) => it.repairMeta?.repairTicketId === ticket.id,
        );
        try {
          const detail = await apiGet<RepairTicketDetail>(
            `/api/repair-tickets/${ticket.id}`,
          );
          const finalAmount = calcFinal(detail);
          if (alreadyInCart) {
            toast.info(`이미 카트에 있습니다 — ${detail.ticketNo}`);
          } else if (finalAmount > 0) {
            const deviceModel =
              detail.serialItem?.product?.name ??
              detail.serialItem?.displayName ??
              detail.repairProduct?.name ??
              detail.repairProductText ??
              undefined;
            add(
              {
                itemType: "repair",
                name: `수리 ${detail.ticketNo}`,
                imageUrl: null,
                unitPrice: finalAmount,
                taxType: "TAXABLE",
                repairMeta: {
                  repairTicketId: detail.id,
                  deviceModel,
                  issueDescription: detail.symptom ?? undefined,
                },
              },
              { sessionId: data.sessionId },
            );
            toast.success(`카트에 추가됨 — ${detail.ticketNo}`);
          } else {
            toast.info(
              "청구할 금액이 없어 카트 추가는 건너뜁니다 — 부속/공임을 먼저 등록해주세요",
            );
          }
        } catch (err) {
          // 카트 추가 실패해도 사용자가 수동 추가할 수 있게 페이지는 그대로 진입
          toast.error(
            err instanceof ApiError
              ? err.message
              : "수리 합계를 불러오지 못했습니다 — 수동으로 카트에 추가해주세요",
          );
        }
      }
      await forceSync();
      // 두 케이스 모두 수리 컨텍스트에서 왔으니 수리 탭으로 진입.
      // "결제로 이동" 은 추가로 ?openCart=1 → 도착 후 카트 시트 자동 오픈.
      const target =
        kind === "checkout"
          ? `/pos/customer/${data.sessionId}?mode=repair&openCart=1`
          : `/pos/customer/${data.sessionId}?mode=repair`;
      router.push(target);
      onClose();
    },
    onError: (err) => {
      setPending(null);
      toast.error(err instanceof ApiError ? err.message : "고객 카드를 열지 못했습니다");
    },
  });

  // 미등록 + 원본 PosSession 추적이 끊긴 경우 부활 불가 — 비활성화
  // (현재 schema 로는 RepairTicket.posSessionId 가 nullable 이므로 정확한 가드는 API 에서)
  const canOpenCustomer =
    !!ticket.customer || ticket.id; // 일단 항상 시도, 실패 시 toast

  return (
    <BottomSheet
      open
      onOpenChange={(v) => !v && onClose()}
      title={customerName}
    >
      <div className="flex flex-col gap-3 pb-2">
        {/* 티켓 요약 */}
        <div className="flex items-center justify-between rounded-2xl bg-[var(--jm-bg)] px-4 py-3">
          <div className="flex flex-col">
            <span className="font-mono text-[11px] text-[var(--jm-text-muted)]">
              {ticket.ticketNo}
            </span>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${meta.dot}`} />
              <span className="text-[13px] font-semibold text-[var(--jm-text)]">
                {meta.label}
              </span>
              {ticket.type === "ON_SITE" && (
                <span className="rounded bg-[var(--jm-action)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  즉시
                </span>
              )}
            </div>
          </div>
          {ticket.symptom && (
            <span className="line-clamp-2 max-w-[60%] text-right text-[12px] text-[var(--jm-text-muted)]">
              {ticket.symptom}
            </span>
          )}
        </div>

        {/* 액션 메뉴 */}
        <div className="flex flex-col gap-2">
          {ticket.status === "READY" && (
            <ActionButton
              icon={<CreditCard className="size-5" />}
              label="결제로 이동"
              hint="수리 합계를 카트에 추가하고 고객 페이지로"
              variant="cta"
              onClick={() => resurrectMutation.mutate("checkout")}
              pending={pending === "checkout"}
              disabled={resurrectMutation.isPending}
            />
          )}
          <ActionButton
            icon={<UserCircle2 className="size-5" />}
            label="이 고객 카드 열기"
            hint="그리드에 합류하고 작업 화면으로"
            onClick={() => resurrectMutation.mutate("open")}
            pending={pending === "open"}
            disabled={resurrectMutation.isPending || !canOpenCustomer}
          />
          <ActionButton
            icon={<Wrench className="size-5" />}
            label="수리 상세 보기"
            hint="이 수리 티켓의 상세 페이지로"
            onClick={() => {
              setPending("detail");
              router.push(`/pos/repairs/${ticket.id}`);
              onClose();
            }}
            pending={pending === "detail"}
            disabled={resurrectMutation.isPending}
          />
        </div>
      </div>
    </BottomSheet>
  );
}

function ActionButton({
  icon,
  label,
  hint,
  variant = "default",
  onClick,
  pending,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  variant?: "default" | "cta";
  onClick: () => void;
  pending: boolean;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left ring-1 transition-all active:scale-[0.99] disabled:opacity-50 disabled:active:scale-100 ${
        variant === "cta"
          ? "bg-[var(--jm-action)] text-white ring-[var(--jm-action)]"
          : "bg-[var(--jm-surface)] text-[var(--jm-text)] ring-[var(--jm-border)] sm:hover:ring-[var(--jm-border-strong)]"
      }`}
    >
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
          variant === "cta"
            ? "bg-white/20 text-white"
            : "bg-[var(--jm-surface-muted)] text-[var(--jm-text)]"
        }`}
      >
        {pending ? <Loader2 className="size-5 animate-spin" /> : icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[14px] font-semibold">{label}</span>
        {hint && (
          <span
            className={`text-[11px] ${
              variant === "cta" ? "text-white/70" : "text-[var(--jm-text-muted)]"
            }`}
          >
            {hint}
          </span>
        )}
      </div>
    </button>
  );
}
