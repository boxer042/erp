"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";

import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { calcRepairTotals } from "@/lib/repair";
import {
  STATUS_META,
  type RepairTicketDetail,
  type RepairPart,
  type RepairLabor,
  type RepairTicketRow,
} from "../_types";
import { calcFinal, nextActions, fmtKRW } from "../_helpers";
import { PartsSection } from "../_parts-section";
import { LaborsSection } from "../_labors-section";
import { PickupSheet } from "../_pickup-sheet";
import { PriceInputDialog } from "@/app/(pos)/pos/_components/price-input-dialog";
import { BottomSheet } from "@/app/(pos)/pos/_components/bottom-sheet";

/** 라우트 진입점 — params 받아 RepairDetail 에 위임. */
export default function RepairDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <RepairDetail ticketId={id} />;
}

interface RepairDetailProps {
  ticketId: string;
  /** ← 버튼 클릭 — 미제공이면 router.push("/pos/repairs") 로 fallback */
  onBack?: () => void;
  /**
   * READY 상태에서 "카트에 추가" 버튼을 누르면 호출.
   * 미제공이면 자체 PickupSheet 가 결제 처리 (repairs standalone 호환).
   * v2 손님 페이지(수리 탭) 가 이 prop 으로 카트에 라인 추가 + 카트 시트 열기.
   */
  onAddToCart?: (ticket: RepairTicketDetail, finalAmount: number) => void;
  /** v2 손님 페이지에서 임베드할 때 — 부모가 자체 헤더(뒤로 + ticketNo + 상태)를 그리므로 자체 헤더 숨김 */
  hideHeader?: boolean;
  /** 고객 카드 클릭 — 부모(customer page) 가 손님 액션 시트(CustomerActionSheet) 열기 */
  onCustomerClick?: () => void;
}

/**
 * 수리 v2 작업 화면 — repairs 라우트와 v2 손님 페이지(수리 탭) 가 공유.
 * shadcn 0개. 부속·공임·진단비·할인 입력 + (onAddToCart 있으면 카트 통합 결제, 없으면 자체 픽업).
 */
export function RepairDetail({
  ticketId,
  onBack,
  onAddToCart,
  hideHeader,
  onCustomerClick,
}: RepairDetailProps) {
  const id = ticketId;
  const router = useRouter();
  const qc = useQueryClient();
  const [pickupOpen, setPickupOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const ticketQuery = useQuery({
    queryKey: ["repairs", "detail", id],
    queryFn: () => apiGet<RepairTicketDetail>(`/api/repair-tickets/${id}`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["repairs", "detail", id] });
    qc.invalidateQueries({ queryKey: ["repairs", "list"] });
    // POS v2 손님 페이지의 수리 리스트 (useRepairSync) — 새로고침 없이 즉시 반영
    qc.invalidateQueries({ queryKey: ["pos-v2", "repairs"] });
    // 어드민/POS 기존 페이지도 함께
    qc.invalidateQueries({ queryKey: ["repairs"] });
  };

  const goBack = onBack ?? (() => router.push("/pos/repairs"));

  const transitionMutation = useMutation<
    { success: boolean; hardDeleted?: boolean },
    Error,
    { action: string; payload?: Record<string, unknown> }
  >({
    mutationFn: (vars) =>
      apiMutate(`/api/repair-tickets/${id}/transition`, "POST", {
        action: vars.action,
        ...(vars.payload ?? {}),
      }),
    onSuccess: (data, vars) => {
      const labels: Record<string, string> = {
        diagnose: "진단 시작",
        quote: "견적 확정",
        approve: "승인 완료",
        start: "수리 시작",
        ready: "수리 완료",
        pickup: "픽업/결제 완료",
        cancel: "취소 처리됨",
      };
      // 미등록 + MISTAKE 자동 hard delete 시 — 목록으로 복귀
      if (vars.action === "cancel" && data.hardDeleted) {
        toast.success("티켓이 영구 삭제됨");
        setCancelOpen(false);
        invalidate();
        goBack();
        return;
      }
      toast.success(labels[vars.action] ?? "처리되었습니다");
      setPickupOpen(false);
      setCancelOpen(false);
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "처리 실패"),
  });

  if (ticketQuery.isPending) {
    return <DetailSkeleton onBack={goBack} hideHeader={hideHeader} />;
  }
  if (ticketQuery.isError || !ticketQuery.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--jm-bg)] p-6 text-center">
        <span className="text-[15px] font-semibold text-[var(--jm-text)]">
          수리 티켓을 찾을 수 없습니다
        </span>
        <button
          type="button"
          onClick={goBack}
          className="h-10 rounded-full bg-[var(--jm-action)] px-5 text-[13px] font-semibold text-white"
        >
          뒤로
        </button>
      </div>
    );
  }

  const t = ticketQuery.data;
  const meta = STATUS_META[t.status];
  const readonly = t.status === "PICKED_UP" || t.status === "CANCELLED";
  const actions = nextActions(t.status, t.type, !!onAddToCart);
  const finalAmount = calcFinal(t);
  const totals = calcRepairTotals({
    parts: t.parts,
    labors: t.labors,
    diagnosisFee: t.diagnosisFee,
    totalDiscount: t.totalDiscount,
  });

  const triggerAction = (action: string) => {
    if (action === "pickup") {
      setPickupOpen(true);
      return;
    }
    if (action === "cart") {
      // 카트에 라인 추가 — 부모(v2 손님 페이지) 가 처리
      onAddToCart?.(t, finalAmount);
      return;
    }
    if (action === "cancel") {
      setCancelOpen(true);
      return;
    }
    transitionMutation.mutate({ action });
  };

  return (
    <div className="flex h-full flex-col bg-[var(--jm-bg)]">
      {/* 상단 — 뒤로 + 티켓번호 + 상태. v2 손님 페이지 임베드 시엔 부모가 그림 (hideHeader). */}
      {!hideHeader && (
        <header className="shrink-0 border-b border-[var(--jm-border)] bg-[var(--jm-surface)]">
          <div className="flex items-center gap-2 px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={goBack}
              className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)] active:bg-[var(--jm-border)]"
              aria-label="뒤로"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M12 4l-6 6 6 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-1.5">
                <span className={`size-2 rounded-full ${meta.dot}`} />
                <span className="text-[12px] font-semibold text-[var(--jm-text)]">
                  {meta.label}
                </span>
                {t.type === "ON_SITE" && (
                  <span className="rounded bg-[var(--jm-action)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                    즉시
                  </span>
                )}
              </div>
              <span className="font-mono text-[13px] text-[var(--jm-text-muted)]">
                {t.ticketNo}
              </span>
            </div>
            <button
              type="button"
              onClick={() => window.open(`/repairs/${t.id}/print`, "_blank")}
              className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface-muted)] active:bg-[var(--jm-border)]"
              aria-label="내역서"
              title="내역서 출력"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path
                  d="M5 4h10v4H5zM5 12h10v4H5zM3 8h14v4H3z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </header>
      )}

      {/* 본문 */}
      <main className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 p-4 sm:p-6">
          {/* 시리얼 기준 수리 이력 — 같은 시리얼의 다른 RepairTicket 들 */}
          {t.serialItem && (
            <SerialHistoryCard
              serialItemId={t.serialItem.id}
              serialCode={t.serialItem.code}
              currentTicketId={t.id}
              onClickTicket={(id) => router.push(`/pos/repairs/${id}`)}
            />
          )}

          {/* 재수리 (parent/revisits) — 시리얼 무관한 직접 재수리 관계만 */}
          {(t.parentRepairTicket || t.revisits.length > 0) && (
            <RevisitCard
              parent={t.parentRepairTicket}
              revisits={t.revisits}
              onClickTicket={(id) => router.push(`/pos/repairs/${id}`)}
            />
          )}

          {/* 합계 카드 — 가장 위로 */}
          <SummaryCard
            usedPartsTotal={totals.usedPartsTotal}
            laborTotal={totals.laborTotal}
            diagnosisFee={totals.diagnosisFee}
            discountAmount={totals.discountAmount}
            finalTotal={finalAmount}
            partsCount={t.parts.length}
            laborsCount={t.labors.length}
          />

          {/* 고객 / 기기 */}
          <CustomerDeviceCard ticket={t} onCustomerClick={onCustomerClick} />

          {/* 가져온 기기 — 시리얼/검색/직접입력 3모드 */}
          <ProductLinkCard ticket={t} readonly={readonly} onChanged={invalidate} />

          {/* 증상 / 진단 / 메모 */}
          <NotesCard ticket={t} readonly={readonly} onSaved={invalidate} />

          {/* 패키지 빠른 추가 */}
          {!readonly && <PackagesCard ticketId={t.id} onApplied={invalidate} />}

          {/* 부속 */}
          <PartsSection
            ticketId={t.id}
            parts={t.parts}
            readonly={readonly}
            onChanged={invalidate}
          />

          {/* 공임 */}
          <LaborsSection
            ticketId={t.id}
            labors={t.labors}
            readonly={readonly}
            onChanged={invalidate}
          />

          {/* 진단비 / 할인 */}
          <FeesAndDiscountCard
            ticket={t}
            readonly={readonly}
            onSaved={invalidate}
          />

          {/* 종료 상태 메시지 */}
          {readonly && (
            <div className="flex flex-col gap-2">
              <div
                className={`rounded-2xl border px-4 py-3 text-[13px] ${
                  t.status === "PICKED_UP"
                    ? "border-[var(--jm-success-bg)] bg-[var(--jm-success-bg)] text-emerald-900"
                    : "border-[var(--jm-danger-bg)] bg-[var(--jm-danger-bg)] text-[var(--jm-danger-fg)]"
                }`}
              >
                {t.status === "PICKED_UP"
                  ? `수리 완료 — ${fmtKRW(t.finalAmount)}${
                      t.repairWarrantyEnds
                        ? ` · 보증 ~${format(
                            new Date(t.repairWarrantyEnds),
                            "yyyy-MM-dd",
                          )}`
                        : ""
                    }`
                  : `취소된 수리${t.cancelReason ? ` — ${cancelReasonLabel(t.cancelReason)}` : ""}${t.cancelMemo ? ` (${t.cancelMemo})` : ""}`}
              </div>
              {/* CANCELLED 상태에서만 영구 삭제 가능 (PICKED_UP 은 매출 기록이라 보존) */}
              {t.status === "CANCELLED" && (
                <HardDeleteButton ticketId={t.id} ticketNo={t.ticketNo} onDeleted={goBack} />
              )}
            </div>
          )}

          {/* FAB 보호 */}
          <div className="h-24" />
        </div>
      </main>

      {/* 하단 액션 바 — sticky */}
      {actions.length > 0 && (
        <div className="shrink-0 border-t border-[var(--jm-border)] bg-[var(--jm-surface)] px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 sm:px-6">
          <div className="flex items-stretch gap-2">
            {actions.map((a) => (
              <button
                key={a.action}
                type="button"
                disabled={transitionMutation.isPending}
                onClick={() => triggerAction(a.action)}
                className={`h-13 flex-1 rounded-2xl text-[15px] font-semibold transition-transform active:scale-[0.99] disabled:opacity-60 ${
                  a.primary
                    ? "bg-[var(--jm-action)] text-white"
                    : a.destructive
                      ? "border border-[var(--jm-danger-bg)] bg-[var(--jm-surface)] text-[var(--jm-danger-fg)] hover:bg-[var(--jm-danger-bg)]"
                      : "border border-[var(--jm-border)] bg-[var(--jm-surface)] text-[var(--jm-text)] hover:bg-[var(--jm-bg)]"
                } ${a.primary ? "py-4" : "py-3.5"}`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 픽업 결제 시트 */}
      <PickupSheet
        open={pickupOpen}
        onOpenChange={setPickupOpen}
        finalAmount={finalAmount}
        warrantyMonths={t.repairWarrantyMonths}
        onConfirm={(paymentMethod) =>
          transitionMutation.mutate({
            action: "pickup",
            payload: { paymentMethod },
          })
        }
        loading={transitionMutation.isPending}
      />

      {/* 취소 사유 시트 */}
      <CancelSheet
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        isUnregistered={!t.customer}
        hasArchivalValue={
          !!t.customer ||
          !!t.serialItem ||
          t.parts.some((p) => p.status === "LOST") ||
          Number(t.diagnosisFee) > 0
        }
        parts={t.parts.map((p) => ({
          id: p.id,
          name: p.product.name,
          status: p.status,
        }))}
        onConfirm={(reason, memo) =>
          transitionMutation.mutate({
            action: "cancel",
            payload: { cancelReason: reason, cancelMemo: memo },
          })
        }
        loading={transitionMutation.isPending}
      />
    </div>
  );
}

// ──── 합계 카드 ────
function SummaryCard({
  usedPartsTotal,
  laborTotal,
  diagnosisFee,
  discountAmount,
  finalTotal,
  partsCount,
  laborsCount,
}: {
  usedPartsTotal: number;
  laborTotal: number;
  diagnosisFee: number;
  discountAmount: number;
  finalTotal: number;
  partsCount: number;
  laborsCount: number;
}) {
  return (
    <div className="rounded-2xl bg-[var(--jm-action)] p-5 text-white">
      <div className="text-[12px] font-semibold uppercase tracking-wider text-white/60">
        최종 청구
      </div>
      <div className="mt-1 text-[36px] font-bold tabular-nums leading-none">
        {fmtKRW(finalTotal)}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
        <Pill label="부속" value={fmtKRW(usedPartsTotal)} hint={`${partsCount}건`} />
        <Pill label="공임" value={fmtKRW(laborTotal)} hint={`${laborsCount}건`} />
        {diagnosisFee > 0 && (
          <Pill label="진단비" value={fmtKRW(diagnosisFee)} />
        )}
        {discountAmount > 0 && (
          <Pill
            label="할인"
            value={`−${fmtKRW(discountAmount)}`}
            tone="warn"
          />
        )}
      </div>
    </div>
  );
}

function Pill({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "warn";
}) {
  return (
    <div
      className={`flex flex-col rounded-xl px-3 py-2 ${
        tone === "warn" ? "bg-[var(--jm-warning-bg)]0/20" : "bg-[var(--jm-surface)]/10"
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider text-white/60">
        {label}
        {hint && <span className="ml-1 text-white/40">· {hint}</span>}
      </div>
      <div className="mt-0.5 text-[13px] font-semibold tabular-nums">
        {value}
      </div>
    </div>
  );
}

// ──── 고객 / 담당 / 접수 (기기는 별도 ProductLinkCard) ────
function CustomerDeviceCard({
  ticket,
  onCustomerClick,
}: {
  ticket: RepairTicketDetail;
  onCustomerClick?: () => void;
}) {
  // onCustomerClick 있으면 고객 영역만 클릭 가능 — 헤더 손님 썸네일과 동일한 시트 트리거
  const customerContent = ticket.customer ? (
    <div className="flex min-w-0 flex-col">
      <span className="line-clamp-1 text-[15px] font-semibold text-[var(--jm-text)]">
        {ticket.customer.name}
      </span>
      {ticket.customer.phone && (
        <span className="font-mono text-[12px] text-[var(--jm-text-muted)]">
          {ticket.customer.phone}
        </span>
      )}
    </div>
  ) : (
    <span className="text-[14px] text-[var(--jm-text-subtle)]">미등록</span>
  );

  return (
    <Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="고객">
          {onCustomerClick ? (
            <button
              type="button"
              onClick={onCustomerClick}
              className="-mx-2 -my-1 flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-[var(--jm-surface-muted)] active:bg-[var(--jm-border)]"
            >
              {customerContent}
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                className="shrink-0 text-[var(--jm-text-subtle)]"
                aria-hidden
              >
                <path
                  d="M3.5 5.5l3.5 3.5 3.5-3.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : (
            customerContent
          )}
        </Field>
        <Field label="담당">
          <span className="text-[14px] text-[var(--jm-text)]">
            {ticket.assignedTo?.name ?? (
              <span className="text-[var(--jm-text-subtle)]">미지정</span>
            )}
          </span>
        </Field>
        <Field label="접수">
          <span className="text-[14px] text-[var(--jm-text)]">
            {format(new Date(ticket.receivedAt), "yyyy-MM-dd HH:mm")}
          </span>
        </Field>
      </div>
    </Card>
  );
}

// ──── 가져온 기기 — 시리얼/검색/직접입력 ────
type DeviceMode = "SERIAL" | "CATEGORY" | "SEARCH" | "TEXT";

interface SerialItemSearchResult {
  id: string;
  code: string;
  source: "SALE" | "REPAIR";
  displayName: string | null;
  soldAt: string;
  warrantyEnds: string | null;
  product: { id: string; name: string; sku: string } | null;
  customer: { id: string; name: string; phone: string | null } | null;
}

interface ProductSearchResult {
  id: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  warrantyMonths: number | null;
}

function ProductLinkCard({
  ticket,
  readonly,
  onChanged,
}: {
  ticket: RepairTicketDetail;
  readonly: boolean;
  onChanged: () => void;
}) {
  const initialMode: DeviceMode = ticket.serialItem
    ? "SERIAL"
    : ticket.repairProduct
      ? "SEARCH"
      : ticket.repairProductText
        ? "TEXT"
        : "SERIAL";
  const [mode, setMode] = useState<DeviceMode>(initialMode);

  const hasLink =
    !!ticket.serialItem || !!ticket.repairProduct || !!ticket.repairProductText;
  // 카테고리 모드는 등록 고객일 때만 활성 — 미등록 고객은 누르지 못함
  const categoryEnabled = !!ticket.customer;

  const update = useMutation({
    mutationFn: (data: {
      serialItemId?: string | null;
      repairProductId?: string | null;
      repairProductText?: string | null;
    }) => apiMutate(`/api/repair-tickets/${ticket.id}`, "PUT", data),
    onSuccess: () => {
      toast.success("기기 정보 저장됨");
      onChanged();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  const clearLink = () => {
    update.mutate({
      serialItemId: null,
      repairProductId: null,
      repairProductText: null,
    });
  };

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
            가져온 기기
          </span>
          {!readonly && hasLink && (
            <button
              type="button"
              onClick={clearLink}
              disabled={update.isPending}
              className="text-[11px] font-medium text-[var(--jm-text-muted)] underline-offset-2 hover:underline"
            >
              초기화
            </button>
          )}
        </div>

        {/* 연결된 기기 표시 (있을 때만) */}
        {ticket.serialItem ? (
          <SerialDisplay item={ticket.serialItem} />
        ) : ticket.repairProduct ? (
          <SearchProductDisplay product={ticket.repairProduct} />
        ) : ticket.repairProductText ? (
          <TextDisplay text={ticket.repairProductText} />
        ) : null}

        {/* 검색/입력 영역 — 항상 표시 (readonly 가 아니면) */}
        {!readonly && (
          <div className="flex flex-col gap-3 rounded-xl border border-[var(--jm-border)] bg-[var(--jm-bg)] p-3">
            {/* 모드 토글 — 시리얼 / 카테고리 / 상품명 / 직접입력 */}
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { v: "SERIAL", label: "시리얼", enabled: true },
                  { v: "CATEGORY", label: "카테고리", enabled: categoryEnabled },
                  { v: "SEARCH", label: "상품명", enabled: true },
                  { v: "TEXT", label: "직접입력", enabled: true },
                ] as const
              ).map((b) => {
                const disabled = !b.enabled;
                return (
                  <button
                    key={b.v}
                    type="button"
                    onClick={() => !disabled && setMode(b.v)}
                    disabled={disabled}
                    title={disabled ? "등록 고객만 사용 가능" : undefined}
                    className={`flex h-9 items-center justify-center rounded-lg text-[12px] font-semibold transition-colors ${
                      mode === b.v
                        ? "bg-[var(--jm-action)] text-white"
                        : disabled
                          ? "bg-[var(--jm-surface-muted)] text-[var(--jm-text-disabled)]"
                          : "bg-[var(--jm-surface)] text-[var(--jm-text-muted)] ring-1 ring-[var(--jm-border)] hover:bg-[var(--jm-surface-muted)]"
                    }`}
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>

            {mode === "SERIAL" && (
              <SerialModeForm ticketId={ticket.id} onSaved={onChanged} />
            )}
            {mode === "CATEGORY" && categoryEnabled && (
              <CategoryModeForm
                ticketId={ticket.id}
                customerId={ticket.customer!.id}
                categoryId={ticket.repairCategory?.id ?? null}
                categoryName={ticket.repairCategory?.name ?? "기타"}
                onSaved={onChanged}
              />
            )}
            {mode === "SEARCH" && (
              <SearchModeForm ticketId={ticket.id} onSaved={onChanged} />
            )}
            {mode === "TEXT" && (
              <TextModeForm
                ticketId={ticket.id}
                initialValue={ticket.repairProductText ?? ""}
                onSaved={onChanged}
              />
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// 카테고리 모드 — 등록 고객의 구매/수리 이력 + 그 카테고리 카탈로그 검색
// repairCategoryId=null (기타) 이면 전체 카탈로그 검색
function CategoryModeForm({
  ticketId,
  customerId,
  categoryId,
  categoryName,
  onSaved,
}: {
  ticketId: string;
  customerId: string;
  categoryId: string | null;
  categoryName: string;
  onSaved: () => void;
}) {
  const [query, setQuery] = useState("");
  const trimmed = query.trim();

  // 등록 고객의 구매·수리 이력 (이 카테고리 내)
  const historyQuery = useQuery<
    Array<{ id: string; name: string; sku: string }>
  >({
    queryKey: ["repairs", "category-history", customerId, categoryId ?? "all"],
    queryFn: () =>
      apiGet<Array<{ id: string; name: string; sku: string }>>(
        `/api/customers/${customerId}/repair-devices${
          categoryId ? `?categoryId=${categoryId}` : ""
        }`,
      ),
    staleTime: 1000 * 60,
  });

  // 카테고리 안 카탈로그 검색 (또는 전체)
  const productsQuery = useQuery<
    Array<{ id: string; name: string; sku: string; imageUrl: string | null }>
  >({
    queryKey: ["repairs", "category-search", categoryId ?? "all", trimmed],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (categoryId) sp.set("categoryId", categoryId);
      if (trimmed) sp.set("search", trimmed);
      sp.set("limit", "15");
      sp.set("excludeVariants", "true");
      return apiGet(`/api/products?${sp.toString()}`);
    },
    staleTime: 1000 * 30,
  });

  const save = useMutation({
    mutationFn: (productId: string) =>
      apiMutate(`/api/repair-tickets/${ticketId}`, "PUT", {
        repairProductId: productId,
        repairProductText: null,
        serialItemId: null,
      }),
    onSuccess: () => {
      toast.success("기기 연결됨");
      onSaved();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  const history = historyQuery.data ?? [];
  const products = productsQuery.data ?? [];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 px-1 text-[11px] text-[var(--jm-text-muted)]">
        <span className="rounded-full bg-[var(--jm-border)] px-2 py-0.5 font-semibold text-[var(--jm-text)]">
          {categoryName}
        </span>
        <span>안에서 이 고객의 이력 + 카탈로그 검색</span>
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="상품명·SKU 검색"
        className="h-11 w-full rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 text-[14px] outline-none focus:border-[var(--jm-border-strong)]"
      />
      {/* 이 고객 이력 — 검색 전 우선 표시 */}
      {history.length > 0 && trimmed.length === 0 && (
        <div className="flex flex-col gap-1">
          <span className="px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--jm-text-subtle)]">
            이 고객의 이력
          </span>
          {history.map((p) => (
            <button
              key={`h-${p.id}`}
              type="button"
              onClick={() => save.mutate(p.id)}
              disabled={save.isPending}
              className="flex items-center gap-2 rounded-lg bg-[var(--jm-surface)] px-3 py-2.5 text-left ring-1 ring-[var(--jm-border)] hover:bg-[var(--jm-surface-muted)] active:bg-[var(--jm-border)] disabled:opacity-50"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="line-clamp-1 text-[13px] font-medium text-[var(--jm-text)]">
                  {p.name}
                </span>
                <span className="font-mono text-[11px] text-[var(--jm-text-muted)]">
                  {p.sku}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
      {/* 카탈로그 검색 결과 */}
      {(trimmed.length > 0 || history.length === 0) && (
        <div className="flex flex-col gap-1">
          {trimmed.length > 0 && (
            <span className="px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--jm-text-subtle)]">
              검색 결과
            </span>
          )}
          {productsQuery.isPending ? (
            <span className="px-1 py-3 text-center text-[12px] text-[var(--jm-text-subtle)]">
              검색 중…
            </span>
          ) : products.length === 0 ? (
            <span className="px-1 py-3 text-center text-[12px] text-[var(--jm-text-subtle)]">
              {trimmed ? "결과 없음" : "검색해주세요"}
            </span>
          ) : (
            products.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => save.mutate(p.id)}
                disabled={save.isPending}
                className="flex items-center gap-2 rounded-lg bg-[var(--jm-surface)] px-3 py-2.5 text-left ring-1 ring-[var(--jm-border)] hover:bg-[var(--jm-surface-muted)] active:bg-[var(--jm-border)] disabled:opacity-50"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="line-clamp-1 text-[13px] font-medium text-[var(--jm-text)]">
                    {p.name}
                  </span>
                  <span className="font-mono text-[11px] text-[var(--jm-text-muted)]">
                    {p.sku}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// 시리얼 표시 — 우리 판매 (SALE) / 수리 라벨 (REPAIR) 구분
function SerialDisplay({
  item,
}: {
  item: NonNullable<RepairTicketDetail["serialItem"]>;
}) {
  const displayName = item.product?.name ?? item.displayName ?? "(미상)";
  const isRepairLabel = item.source === "REPAIR";
  const warrantyActive =
    item.warrantyEnds && new Date(item.warrantyEnds) > new Date();
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-[var(--jm-action)] p-3 text-white">
      <div className="flex items-center gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[var(--jm-surface)]/10">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" />
            <rect x="6" y="6" width="3" height="3" fill="currentColor" />
            <rect x="11" y="6" width="3" height="3" fill="currentColor" />
            <rect x="6" y="11" width="3" height="3" fill="currentColor" />
            <rect x="11" y="11" width="3" height="3" fill="currentColor" />
          </svg>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-mono text-[11px] font-semibold tracking-wider text-white/60">
            {item.code}
          </span>
          <span className="line-clamp-1 text-[14px] font-semibold">{displayName}</span>
        </div>
        <span className="rounded-full bg-[var(--jm-surface)]/15 px-2 py-0.5 text-[10px] font-bold">
          {isRepairLabel ? "수리 라벨" : "우리 판매"}
        </span>
      </div>
      <div className="flex flex-wrap gap-3 border-t border-white/15 pt-2 text-[11px]">
        <div>
          <span className="text-white/50">{isRepairLabel ? "접수일" : "구매일"} </span>
          <span className="font-medium">
            {format(new Date(item.soldAt), "yyyy-MM-dd")}
          </span>
        </div>
        {item.warrantyEnds && (
          <div>
            <span className="text-white/50">보증 </span>
            <span className={warrantyActive ? "text-emerald-300" : "text-rose-300"}>
              ~{format(new Date(item.warrantyEnds), "yyyy-MM-dd")}
              {warrantyActive ? " (유효)" : " (만료)"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function SearchProductDisplay({
  product,
}: {
  product: NonNullable<RepairTicketDetail["repairProduct"]>;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-[var(--jm-bg)] p-3">
      {product.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.imageUrl}
          alt={product.name}
          className="size-12 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-[var(--jm-surface)] text-[var(--jm-text-subtle)]">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path
              d="M3 6l7-4 7 4v8l-7 4-7-4V6z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="line-clamp-1 text-[14px] font-semibold text-[var(--jm-text)]">
          {product.name}
        </span>
        <span className="font-mono text-[11px] text-[var(--jm-text-muted)]">{product.sku}</span>
      </div>
      <span className="rounded-full bg-[var(--jm-border)] px-2 py-0.5 text-[10px] font-medium text-[var(--jm-text)]">
        카탈로그
      </span>
    </div>
  );
}

function TextDisplay({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-[var(--jm-bg)] p-3">
      <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-[var(--jm-surface)] text-[var(--jm-text-subtle)]">
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <path
            d="M4 5h12M4 10h12M4 15h8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <span className="line-clamp-2 flex-1 text-[14px] font-medium text-[var(--jm-text)]">
        {text}
      </span>
      <span className="rounded-full bg-[var(--jm-border)] px-2 py-0.5 text-[10px] font-medium text-[var(--jm-text)]">
        외부 기기
      </span>
    </div>
  );
}

// ──── 모드별 폼 ────
function SerialModeForm({
  ticketId,
  onSaved,
}: {
  ticketId: string;
  onSaved: () => void;
}) {
  const [code, setCode] = useState("");
  const lookup = useMutation({
    mutationFn: async () => {
      const list = await apiGet<SerialItemSearchResult[]>(
        `/api/serial-items?search=${encodeURIComponent(code.trim())}`,
      );
      const exact = list.find((i) => i.code === code.trim());
      if (!exact) throw new Error("해당 시리얼을 찾을 수 없습니다");
      await apiMutate(`/api/repair-tickets/${ticketId}`, "PUT", {
        serialItemId: exact.id,
        repairProductId: null,
        repairProductText: null,
      });
      return exact;
    },
    onSuccess: (item) => {
      toast.success(`${item.code} 연결됨`);
      onSaved();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "조회 실패"),
  });

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="예: 250903-0001"
        className="h-11 flex-1 rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 font-mono text-[14px] outline-none focus:border-[var(--jm-border-strong)]"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing && code.trim()) {
            lookup.mutate();
          }
        }}
      />
      <button
        type="button"
        onClick={() => lookup.mutate()}
        disabled={!code.trim() || lookup.isPending}
        className="h-11 rounded-xl bg-[var(--jm-action)] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
      >
        {lookup.isPending ? "조회…" : "조회·연결"}
      </button>
    </div>
  );
}

function SearchModeForm({
  ticketId,
  onSaved,
}: {
  ticketId: string;
  onSaved: () => void;
}) {
  const [query, setQuery] = useState("");
  const productsQuery = useQuery<ProductSearchResult[]>({
    queryKey: ["repairs", "device-product-search", query],
    queryFn: () =>
      apiGet<ProductSearchResult[]>(
        `/api/products?search=${encodeURIComponent(query)}&excludeVariants=true`,
      ),
    enabled: query.trim().length > 0,
    staleTime: 1000 * 30,
  });

  const link = useMutation({
    mutationFn: (productId: string) =>
      apiMutate(`/api/repair-tickets/${ticketId}`, "PUT", {
        serialItemId: null,
        repairProductId: productId,
        repairProductText: null,
      }),
    onSuccess: () => {
      toast.success("상품 연결됨");
      onSaved();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="상품명 또는 SKU 검색"
        className="h-11 w-full rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 text-[14px] outline-none focus:border-[var(--jm-border-strong)]"
      />
      {query.trim().length > 0 && (
        <div className="flex max-h-60 flex-col gap-1 overflow-y-auto rounded-xl bg-[var(--jm-surface)] ring-1 ring-[var(--jm-border)]">
          {productsQuery.isPending ? (
            <div className="px-3 py-3 text-[13px] text-[var(--jm-text-subtle)]">검색 중…</div>
          ) : (productsQuery.data ?? []).length === 0 ? (
            <div className="px-3 py-3 text-[13px] text-[var(--jm-text-muted)]">결과 없음</div>
          ) : (
            (productsQuery.data ?? []).slice(0, 30).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => link.mutate(p.id)}
                disabled={link.isPending}
                className="flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--jm-bg)] active:bg-[var(--jm-surface-muted)] disabled:opacity-50"
              >
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imageUrl}
                    alt={p.name}
                    className="size-9 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--jm-surface-muted)] text-[var(--jm-text-subtle)]">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                      <path
                        d="M3 6l7-4 7 4v8l-7 4-7-4V6z"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="line-clamp-1 text-[13px] font-medium text-[var(--jm-text)]">
                    {p.name}
                  </span>
                  <span className="font-mono text-[10px] text-[var(--jm-text-muted)]">
                    {p.sku}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function TextModeForm({
  ticketId,
  initialValue,
  onSaved,
}: {
  ticketId: string;
  initialValue: string;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const save = useMutation({
    mutationFn: () =>
      apiMutate(`/api/repair-tickets/${ticketId}`, "PUT", {
        serialItemId: null,
        repairProductId: null,
        repairProductText: value.trim() || null,
      }),
    onSuccess: () => {
      toast.success("저장됨");
      onSaved();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });
  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="예: Sony A7M4 Black"
        className="h-11 w-full rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 text-[14px] outline-none focus:border-[var(--jm-border-strong)]"
      />
      <button
        type="button"
        onClick={() => save.mutate()}
        disabled={!value.trim() || save.isPending}
        className="h-11 rounded-xl bg-[var(--jm-action)] text-[13px] font-semibold text-white disabled:opacity-50"
      >
        {save.isPending ? "저장…" : "저장"}
      </button>
    </div>
  );
}

// ──── 시리얼 기준 수리 이력 ────
// 같은 SerialItem 의 모든 과거 수리 티켓을 시간순으로 표시 — 수리 작업 시 참고용.
function SerialHistoryCard({
  serialItemId,
  serialCode,
  currentTicketId,
  onClickTicket,
}: {
  serialItemId: string;
  serialCode: string;
  currentTicketId: string;
  onClickTicket: (id: string) => void;
}) {
  const historyQuery = useQuery<RepairTicketRow[]>({
    queryKey: ["repairs", "serial-history", serialItemId, currentTicketId],
    queryFn: () =>
      apiGet<RepairTicketRow[]>(
        `/api/repair-tickets?serialItemId=${serialItemId}&excludeId=${currentTicketId}`,
      ),
    staleTime: 1000 * 60,
  });

  const history = historyQuery.data ?? [];
  if (historyQuery.isPending) {
    return (
      <div className="rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-4">
        <div className="mb-2 h-4 w-32 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
        <div className="h-12 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
      </div>
    );
  }
  if (history.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-4">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
            이 기기 수리 이력
          </span>
          <span className="font-mono text-[10px] text-[var(--jm-text-subtle)]">{serialCode}</span>
        </div>
        <span className="text-[12px] text-[var(--jm-text-subtle)]">이전 수리 이력 없음</span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-4">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
          이 기기 수리 이력 ({history.length})
        </span>
        <span className="font-mono text-[10px] text-[var(--jm-text-subtle)]">{serialCode}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {history.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => onClickTicket(h.id)}
            className="flex items-start justify-between gap-3 rounded-xl bg-[var(--jm-bg)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--jm-surface-muted)] active:bg-[var(--jm-border)]"
          >
            <div className="flex min-w-0 flex-col">
              <div className="flex items-center gap-1.5">
                <span className={`size-1.5 rounded-full ${STATUS_META[h.status].dot}`} />
                <span className="text-[11px] font-semibold text-[var(--jm-text)]">
                  {STATUS_META[h.status].label}
                </span>
                <span className="font-mono text-[11px] text-[var(--jm-text-subtle)]">
                  {h.ticketNo}
                </span>
              </div>
              {h.symptom && (
                <span className="line-clamp-1 mt-0.5 text-[12px] text-[var(--jm-text-muted)]">
                  {h.symptom}
                </span>
              )}
            </div>
            <div className="shrink-0 text-right text-[10px] text-[var(--jm-text-subtle)]">
              {format(new Date(h.receivedAt), "yyyy-MM-dd")}
              {h.pickedUpAt && (
                <div className="text-[var(--jm-text-disabled)]">
                  완료 {format(new Date(h.pickedUpAt), "MM-dd")}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ──── 재수리 (parent / revisits) ────
function RevisitCard({
  parent,
  revisits,
  onClickTicket,
}: {
  parent: RepairTicketDetail["parentRepairTicket"];
  revisits: RepairTicketDetail["revisits"];
  onClickTicket: (id: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--jm-warning-bg)] bg-[var(--jm-warning-bg)] p-4">
      <div className="flex flex-col gap-2">
        {parent && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--jm-warning-fg)]">
              재수리 — 원본 티켓
            </span>
            <button
              type="button"
              onClick={() => onClickTicket(parent.id)}
              className="flex items-center justify-between rounded-xl bg-[var(--jm-surface)] px-3 py-2 text-left transition-colors hover:bg-[var(--jm-warning-bg)]/50"
            >
              <div className="flex items-center gap-2">
                <span className={`size-1.5 rounded-full ${STATUS_META[parent.status].dot}`} />
                <span className="font-mono text-[12px] font-semibold text-[var(--jm-text)]">
                  {parent.ticketNo}
                </span>
                <span className="text-[11px] text-[var(--jm-text-muted)]">
                  {STATUS_META[parent.status].label}
                </span>
              </div>
              {parent.repairWarrantyEnds && (
                <span className="text-[11px] text-[var(--jm-text-muted)]">
                  보증 ~{format(new Date(parent.repairWarrantyEnds), "yyyy-MM-dd")}
                </span>
              )}
            </button>
          </div>
        )}
        {revisits.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--jm-warning-fg)]">
              연관 재수리 {revisits.length}
            </span>
            <div className="flex flex-col gap-1">
              {revisits.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onClickTicket(r.id)}
                  className="flex items-center justify-between rounded-xl bg-[var(--jm-surface)] px-3 py-2 text-left transition-colors hover:bg-[var(--jm-warning-bg)]/50"
                >
                  <div className="flex items-center gap-2">
                    <span className={`size-1.5 rounded-full ${STATUS_META[r.status].dot}`} />
                    <span className="font-mono text-[12px] font-semibold text-[var(--jm-text)]">
                      {r.ticketNo}
                    </span>
                    <span className="text-[11px] text-[var(--jm-text-muted)]">
                      {STATUS_META[r.status].label}
                    </span>
                  </div>
                  <span className="text-[11px] text-[var(--jm-text-muted)]">
                    {format(new Date(r.receivedAt), "MM-dd HH:mm")}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ──── 수리 패키지 빠른 추가 ────
interface RepairPackageRow {
  id: string;
  name: string;
  description: string | null;
  parts: Array<{ id: string; quantity: string; unitPrice: string }>;
  labors: Array<{ id: string; name: string; unitRate: string }>;
}

function PackagesCard({
  ticketId,
  onApplied,
}: {
  ticketId: string;
  onApplied: () => void;
}) {
  const packagesQuery = useQuery<RepairPackageRow[]>({
    queryKey: ["repairs", "packages"],
    queryFn: () => apiGet<RepairPackageRow[]>("/api/repair-packages"),
    staleTime: 1000 * 60 * 5,
  });
  const apply = useMutation({
    mutationFn: (packageId: string) =>
      apiMutate(`/api/repair-tickets/${ticketId}/apply-package`, "POST", {
        packageId,
      }),
    onSuccess: (_, packageId) => {
      const pkg = packagesQuery.data?.find((p) => p.id === packageId);
      toast.success(`${pkg?.name ?? "패키지"} 적용`);
      onApplied();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "패키지 적용 실패"),
  });

  const packages = packagesQuery.data ?? [];
  if (packagesQuery.isPending) {
    return (
      <Card>
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
            패키지
          </span>
          <div className="flex gap-1.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-9 w-24 animate-pulse rounded-full bg-[var(--jm-surface-muted)]"
              />
            ))}
          </div>
        </div>
      </Card>
    );
  }
  if (packages.length === 0) return null;

  return (
    <Card>
      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
          패키지 빠른 추가
        </span>
        <div className="flex flex-wrap gap-1.5">
          {packages.map((p) => {
            const partsCount = p.parts.length;
            const laborsCount = p.labors.length;
            return (
              <button
                key={p.id}
                type="button"
                disabled={apply.isPending}
                onClick={() => apply.mutate(p.id)}
                className="flex h-10 items-center gap-1.5 rounded-full border border-[var(--jm-border)] bg-[var(--jm-surface)] px-4 text-[12px] transition-colors hover:border-[var(--jm-action)] hover:bg-[var(--jm-bg)] active:scale-[0.98] disabled:opacity-50"
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                  <path d="M7 3v8M3 7h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <span className="font-semibold text-[var(--jm-text)]">{p.name}</span>
                <span className="text-[var(--jm-text-muted)]">
                  ({partsCount > 0 && `부속 ${partsCount}`}
                  {partsCount > 0 && laborsCount > 0 && " · "}
                  {laborsCount > 0 && `공임 ${laborsCount}`})
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--jm-text-subtle)]">
        {label}
      </span>
      {children}
    </div>
  );
}

// ──── 증상 / 진단 / 메모 ────
function NotesCard({
  ticket,
  readonly,
  onSaved,
}: {
  ticket: RepairTicketDetail;
  readonly: boolean;
  onSaved: () => void;
}) {
  const [symptom, setSymptom] = useState(ticket.symptom ?? "");
  const [diagnosis, setDiagnosis] = useState(ticket.diagnosis ?? "");
  const [repairNotes, setRepairNotes] = useState(ticket.repairNotes ?? "");
  // "저장됨" 인디케이터 — saveMutation 성공 후 잠시 노출
  const [savedFlash, setSavedFlash] = useState(false);

  const isDirty = () =>
    symptom !== (ticket.symptom ?? "") ||
    diagnosis !== (ticket.diagnosis ?? "") ||
    repairNotes !== (ticket.repairNotes ?? "");

  const saveMutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/repair-tickets/${ticket.id}`, "PUT", {
        symptom,
        diagnosis,
        repairNotes,
      }),
    onSuccess: () => {
      setSavedFlash(true);
      // 3초 후 사라짐 — toast 안 띄움 (조용한 자동 저장)
      window.setTimeout(() => setSavedFlash(false), 3000);
      onSaved();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  // onBlur 시 dirty 면 저장. 다른 필드로 focus 이동해도 동일 mutation 한번만 발화 (mutationFn 내부에서 최신 state 사용).
  const handleBlur = () => {
    if (readonly) return;
    if (saveMutation.isPending) return;
    if (!isDirty()) return;
    saveMutation.mutate();
  };

  // 상단 인디케이터 상태
  const status: "idle" | "saving" | "saved" | "dirty" = saveMutation.isPending
    ? "saving"
    : savedFlash
      ? "saved"
      : isDirty()
        ? "dirty"
        : "idle";

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <NotesField
          label="증상"
          hint="고객 호소"
          value={symptom}
          onChange={setSymptom}
          onBlur={handleBlur}
          readonly={readonly}
          placeholder="예: 누수 발생, 호스 연결부 새는 듯"
        />
        <NotesField
          label="진단"
          hint="직원 확인"
          value={diagnosis}
          onChange={setDiagnosis}
          onBlur={handleBlur}
          readonly={readonly}
          placeholder="예: 체크밸브 마모"
        />
        <NotesField
          label="수리 메모"
          hint="내부"
          value={repairNotes}
          onChange={setRepairNotes}
          onBlur={handleBlur}
          readonly={readonly}
          placeholder="작업 메모"
        />
        {/* 하단 인디케이터 — 항상 자리 차지 (idle 일 땐 빈 공간) 해서 입력 필드 위치 안 흔들림 */}
        {!readonly && (
          <div className="flex h-4 items-center justify-end">
            {status !== "idle" && <SaveStatus status={status} />}
          </div>
        )}
      </div>
    </Card>
  );
}

function SaveStatus({
  status,
}: {
  status: "saving" | "saved" | "dirty";
}) {
  if (status === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-[var(--jm-text-muted)]">
        <span className="size-1.5 animate-pulse rounded-full bg-[var(--jm-text-subtle)]" />
        저장 중…
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-[var(--jm-success-fg)]">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M2.5 6l2.5 2.5L9.5 3.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        저장됨
      </span>
    );
  }
  // dirty
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-[var(--jm-warning-fg)]">
      <span className="size-1.5 rounded-full bg-[var(--jm-warning-bg)]0" />
      입력 후 다른 곳을 누르면 저장됩니다
    </span>
  );
}

function NotesField({
  label,
  hint,
  value,
  onChange,
  onBlur,
  readonly,
  placeholder,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  readonly: boolean;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
          {label}
        </span>
        <span className="text-[10px] text-[var(--jm-text-subtle)]">{hint}</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={readonly}
        placeholder={placeholder}
        rows={2}
        className="w-full resize-none rounded-xl border border-[var(--jm-border)] bg-[var(--jm-bg)] p-3 text-[14px] outline-none placeholder:text-[var(--jm-text-subtle)] focus:border-[var(--jm-border-strong)] focus:bg-[var(--jm-surface)] disabled:opacity-70"
      />
    </div>
  );
}

// ──── 진단비 / 할인 ────
function FeesAndDiscountCard({
  ticket,
  readonly,
  onSaved,
}: {
  ticket: RepairTicketDetail;
  readonly: boolean;
  onSaved: () => void;
}) {
  const [feeOpen, setFeeOpen] = useState(false);
  const [totalDiscount, setTotalDiscount] = useState(
    ticket.totalDiscount === "0" ? "" : ticket.totalDiscount,
  );
  const currentFee = Number(ticket.diagnosisFee) || 0;
  const dirty =
    totalDiscount !== (ticket.totalDiscount === "0" ? "" : ticket.totalDiscount);

  const saveDiscount = useMutation({
    mutationFn: () =>
      apiMutate(`/api/repair-tickets/${ticket.id}`, "PUT", {
        totalDiscount: totalDiscount.trim() || "0",
      }),
    onSuccess: () => {
      toast.success("저장됨");
      onSaved();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  const saveFee = useMutation({
    mutationFn: (net: number) =>
      apiMutate(`/api/repair-tickets/${ticket.id}`, "PUT", {
        diagnosisFee: net,
      }),
    onSuccess: () => {
      toast.success("진단비 저장됨");
      onSaved();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
              진단비
            </span>
            <button
              type="button"
              onClick={() => !readonly && setFeeOpen(true)}
              disabled={readonly}
              className="flex h-12 items-center justify-end rounded-xl border border-[var(--jm-border)] bg-[var(--jm-bg)] px-4 text-right text-[16px] font-semibold tabular-nums text-[var(--jm-text)] transition-colors hover:bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)] disabled:opacity-70"
            >
              {currentFee > 0 ? fmtKRW(currentFee) : (
                <span className="text-[var(--jm-text-subtle)]">탭하여 입력</span>
              )}
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
              전체 할인
            </span>
            <input
              type="text"
              value={totalDiscount}
              onChange={(e) => setTotalDiscount(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              disabled={readonly}
              placeholder="5000 또는 10%"
              className="h-12 rounded-xl border border-[var(--jm-border)] bg-[var(--jm-bg)] px-4 text-right text-[16px] outline-none focus:border-[var(--jm-border-strong)] focus:bg-[var(--jm-surface)] disabled:opacity-70"
            />
          </div>
        </div>
        {!readonly && dirty && (
          <button
            type="button"
            onClick={() => saveDiscount.mutate()}
            disabled={saveDiscount.isPending}
            className="self-end rounded-full bg-[var(--jm-action)] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {saveDiscount.isPending ? "저장 중…" : "저장"}
          </button>
        )}
      </div>

      <PriceInputDialog
        open={feeOpen}
        onOpenChange={setFeeOpen}
        title="진단비"
        initialNet={currentFee}
        taxType="TAXABLE"
        onSubmit={(net) => saveFee.mutate(net)}
      />
    </Card>
  );
}

// ──── 카드 컨테이너 (raw) ────
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-4 sm:p-5">
      {children}
    </div>
  );
}

function DetailSkeleton({
  onBack,
  hideHeader,
}: {
  onBack: () => void;
  hideHeader?: boolean;
}) {
  return (
    <div className="flex h-full flex-col bg-[var(--jm-bg)]">
      {/* 자체 헤더 — v2 customer page 임베드 시엔 부모가 그림 (hideHeader). */}
      {!hideHeader && (
        <header className="shrink-0 border-b border-[var(--jm-border)] bg-[var(--jm-surface)]">
          <div className="flex items-center gap-2 px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={onBack}
              className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--jm-text)]"
              aria-label="뒤로"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M12 4l-6 6 6 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <div className="flex flex-1 flex-col gap-1">
              <div className="h-3 w-20 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
              <div className="h-3 w-32 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
            </div>
          </div>
        </header>
      )}
      <main className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 p-4 sm:p-6">
          {/* SummaryCard 골격 — 합계 영역 */}
          <div className="flex flex-col gap-2 rounded-2xl bg-[var(--jm-surface)] p-4 ring-1 ring-[var(--jm-border)]">
            <div className="flex items-center justify-between">
              <div className="h-3 w-12 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
              <div className="h-4 w-20 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
            </div>
            <div className="flex items-center justify-between">
              <div className="h-3 w-16 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
              <div className="h-4 w-16 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
            </div>
            <div className="mt-1 flex items-center justify-between border-t border-[var(--jm-border)] pt-2">
              <div className="h-4 w-16 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
              <div className="h-5 w-24 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
            </div>
          </div>
          {/* 손님/기기 카드 */}
          <div className="flex flex-col gap-2 rounded-2xl bg-[var(--jm-surface)] p-4 ring-1 ring-[var(--jm-border)]">
            <div className="h-3 w-16 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
          </div>
          {/* 부속 / 공임 섹션 */}
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-2xl bg-[var(--jm-surface)] p-4 ring-1 ring-[var(--jm-border)]"
            >
              <div className="flex items-center justify-between">
                <div className="h-4 w-12 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
                <div className="h-7 w-16 animate-pulse rounded-full bg-[var(--jm-surface-muted)]" />
              </div>
              <div className="h-3 w-full animate-pulse rounded bg-[var(--jm-surface-muted)]" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

// ──── 취소 사유 시트 ────
type CancelReason =
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
  { value: "CUSTOMER_DECLINED", label: "손님 거절", desc: "견적 본 후 진행 거부" },
  { value: "CUSTOMER_NO_SHOW", label: "손님 미반환", desc: "맡겼는데 안 찾으러 옴" },
  { value: "SHOP_GAVE_UP", label: "매장 포기", desc: "수리 불가 판정" },
  { value: "PARTS_UNAVAILABLE", label: "부속 수급 불가", desc: "부속을 구할 수 없음" },
  { value: "OTHER", label: "기타", desc: "메모로 사유 기록" },
];

function cancelReasonLabel(reason: CancelReason | string): string {
  return CANCEL_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

// ──── 영구 삭제 버튼 (CANCELLED 상태에서만) ────
function HardDeleteButton({
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
      // 호출 측 caches 모두 무효화 — RepairMode 의 useRepairSync, repairs list, 어드민 repairs
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
        <span className="text-[12px] text-[var(--jm-danger-fg)]">
          {ticketNo} 영구 삭제 — 되돌릴 수 없습니다
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={del.isPending}
            className="rounded-full bg-[var(--jm-surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--jm-text)] ring-1 ring-[var(--jm-border)]"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => del.mutate()}
            disabled={del.isPending}
            className="rounded-full bg-[var(--jm-danger-solid)] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
          >
            {del.isPending ? "삭제…" : "확인"}
          </button>
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="flex h-10 items-center justify-center gap-1.5 rounded-2xl border border-[var(--jm-danger-bg)] bg-[var(--jm-surface)] text-[13px] font-medium text-[var(--jm-danger-fg)] hover:bg-[var(--jm-danger-bg)]"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path
          d="M3 4h8M5 4V3h4v1M4 4v8h6V4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      영구 삭제
    </button>
  );
}

interface CancelPart {
  id: string;
  name: string;
  status: "USED" | "LOST";
}

function CancelSheet({
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
  hasArchivalValue: boolean;
  parts: CancelPart[];
  onConfirm: (reason: CancelReason, memo: string) => void;
  loading?: boolean;
}) {
  if (!open) return null;
  return (
    <CancelSheetBody
      onOpenChange={onOpenChange}
      isUnregistered={isUnregistered}
      hasArchivalValue={hasArchivalValue}
      parts={parts}
      onConfirm={onConfirm}
      loading={loading}
    />
  );
}

function CancelSheetBody({
  onOpenChange,
  isUnregistered,
  hasArchivalValue,
  parts,
  onConfirm,
  loading,
}: {
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
  // 사유에 따라 동적 — SOLD_AS_PRODUCT 는 사유 자체가 보존 가치 있어 hard delete 안 됨
  const willHardDelete = !hasArchivalValue && reason !== "SOLD_AS_PRODUCT";

  return (
    <BottomSheet
      open
      onOpenChange={(o) => !loading && onOpenChange(o)}
      title="수리 취소"
      locked={loading}
      footer={
        <button
          type="button"
          onClick={() => onConfirm(reason, memo)}
          disabled={loading}
          className={`flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-60 ${
            willHardDelete ? "bg-[var(--jm-danger-solid)]" : "bg-[var(--jm-action)]"
          }`}
        >
          {loading && (
            <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          )}
          {willHardDelete ? "영구 삭제" : "취소 처리 (기록 보존)"}
        </button>
      }
    >
      <div className="flex flex-col gap-4 pt-2">
        {/* 부속 확인 — 부속 등록되어 있을 때만 (USED/LOST 상태 한번 더 점검) */}
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
              <span className="text-[12px] font-semibold text-[var(--jm-warning-fg)]">
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
                  <span
                    className={`h-5 shrink-0 rounded-full px-2 text-[10px] font-bold ${
                      p.status === "LOST"
                        ? "bg-[var(--jm-danger-bg)] text-[var(--jm-danger-fg)]"
                        : "bg-[var(--jm-success-bg)] text-[var(--jm-success-fg)]"
                    }`}
                  >
                    {p.status}
                  </span>
                  <span className="line-clamp-1 text-[12px] text-[var(--jm-text)]">
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

        {/* 안내 — 사유에 따라 동적 */}
        <div
          className={`rounded-xl px-4 py-3 text-[12px] ${
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

        {/* 사유 선택 */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
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
                  <span
                    className={`text-[14px] font-semibold ${
                      active ? "text-[var(--jm-text)]" : "text-[var(--jm-text)]"
                    }`}
                  >
                    {r.label}
                  </span>
                  <span className="text-[11px] text-[var(--jm-text-muted)]">{r.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 메모 */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
            메모 {reason === "OTHER" && <span className="text-[var(--jm-danger-fg)]">(필수)</span>}
          </span>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="추가 설명 (선택)"
            rows={2}
            className="w-full resize-none rounded-xl border border-[var(--jm-border)] bg-[var(--jm-bg)] p-3 text-[13px] outline-none focus:border-[var(--jm-border-strong)] focus:bg-[var(--jm-surface)]"
          />
        </div>
      </div>
    </BottomSheet>
  );
}

// 미사용 import 정리 — 파일 외부에서 참조될 수 있도록 export 만 한 줄
export type { RepairPart, RepairLabor };
