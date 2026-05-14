"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  ArrowRightLeft,
  ChevronDown,
  Clock,
  FileText,
  Loader2,
  MoreVertical,
  Package,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { calcRepairTotals } from "@/lib/repair";
import {
  JmBadge,
  JmButton,
  JmCard,
  JmComboboxDrawer,
  JmDrawer,
  JmDrawerBody,
  JmDrawerContent,
  JmDrawerFooter,
  JmDrawerHeader,
  JmDrawerTitle,
  JmDropdownMenu,
  JmDropdownMenuContent,
  JmDropdownMenuItem,
  JmDropdownMenuSeparator,
  JmDropdownMenuTrigger,
  JmIconButton,
  JmInput,
  JmNumberInput,
  JmSearchInput,
  JmSkeleton,
  JmTextarea,
} from "@/jm";
import {
  STATUS_META,
  type RepairTicketDetail,
  type RepairPart,
  type RepairLabor,
  type RepairTicketRow,
} from "../_types";
import { calcFinal, nextActions, fmtKRW, fmtKRWInc, fmtKRWTax } from "../_helpers";
import { PartsSection } from "../_parts-section";
import { LaborsSection } from "../_labors-section";
import { PickupSheet } from "../_pickup-sheet";
import { SetRecommendations } from "../_set-recommendations";
import { ProductLinkCard } from "./_product-link-card";
import {
  CancelSheet,
  cancelReasonLabel,
  HardDeleteButton,
} from "./_cancel-sheet";
import { DetailSkeleton } from "./_detail-skeleton";
import { SymptomCard, DiagnosisCard, NotesCard } from "./_notes-cards";
import { PackagesCard, ReferenceInfoSection } from "./_reference-cards";
import { Card, Field } from "./_shared";
import { PriceInputDialog } from "@/app/(pos)/pos/_components/price-input-dialog";

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
   * v2 고객 페이지(수리 탭) 가 이 prop 으로 카트에 라인 추가 + 카트 시트 열기.
   */
  onAddToCart?: (ticket: RepairTicketDetail, finalAmount: number) => void;
  /** v2 고객 페이지에서 임베드할 때 — 부모가 자체 헤더(뒤로 + ticketNo + 상태)를 그리므로 자체 헤더 숨김 */
  hideHeader?: boolean;
  /** 고객 카드 클릭 — 부모(customer page) 가 고객 액션 시트(CustomerActionSheet) 열기 */
  onCustomerClick?: () => void;
}

/**
 * 수리 v2 작업 화면 — repairs 라우트와 v2 고객 페이지(수리 탭) 가 공유.
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
    // POS v2 고객 페이지의 수리 리스트 (useRepairSync) — 새로고침 없이 즉시 반영
    qc.invalidateQueries({ queryKey: ["pos-v2", "repairs"] });
    // 어드민/POS 기존 페이지도 함께
    qc.invalidateQueries({ queryKey: ["repairs"] });
  };

  const goBack = onBack ?? (() => router.push("/pos/repairs"));

  // 즉시↔맡김 타입 변경 — 운영 중 종종 발생 (즉시 시작했지만 부속 필요 → 맡김 전환 등)
  const typeMutation = useMutation<
    unknown,
    Error,
    "ON_SITE" | "DROP_OFF"
  >({
    mutationFn: (nextType) =>
      apiMutate(`/api/repair-tickets/${id}`, "PUT", { type: nextType }),
    onSuccess: (_, nextType) => {
      toast.success(nextType === "ON_SITE" ? "즉시 수리로 변경됨" : "맡김 수리로 변경됨");
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "변경 실패"),
  });

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
        <span className="text-jm-base font-semibold text-[var(--jm-text)]">
          수리 티켓을 찾을 수 없습니다
        </span>
        <JmButton variant="cta" onClick={goBack}>
          뒤로
        </JmButton>
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
      // 카트에 라인 추가 — 부모(v2 고객 페이지) 가 처리
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
      {/* 상단 — 뒤로 + 티켓번호 + 상태 + 손님·기기. v2 고객 페이지 임베드 시엔 부모가 그림 (hideHeader). */}
      {!hideHeader && (
        <header className="shrink-0 border-b border-[var(--jm-border)] bg-[var(--jm-surface)]">
          <div className="flex items-center gap-2 px-4 py-3 sm:px-6">
            <JmIconButton size="md" variant="ghost" onClick={goBack} aria-label="뒤로">
              <ArrowLeft className="size-5" />
            </JmIconButton>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-1.5">
                <span className={`size-2 rounded-full ${meta.dot}`} />
                <span className="text-jm-2xs font-semibold text-[var(--jm-text)]">
                  {meta.label}
                </span>
                {t.type === "ON_SITE" && (
                  <JmBadge variant="solid" size="sm" shape="square">
                    즉시
                  </JmBadge>
                )}
                <span className="font-mono text-jm-2xs text-[var(--jm-text-subtle)]">
                  {t.ticketNo}
                </span>
              </div>
              {/* 손님 · 기기 — 한 줄에 정체성 즉시 표시 (스크롤 없이 누구의 무슨 작업인지) */}
              <HeaderIdentitySubtitle ticket={t} />
              {/* 진행률 stepper — 현재 단계 시각화 */}
              {t.status !== "CANCELLED" && (
                <StatusStepperBar status={t.status} type={t.type} />
              )}
            </div>
            <JmIconButton
              size="md"
              variant="ghost"
              onClick={() => window.open(`/repairs/${t.id}/print`, "_blank")}
              aria-label="내역서"
              title="내역서 출력"
            >
              <FileText className="size-4" />
            </JmIconButton>
            {!readonly && (
              <JmDropdownMenu>
                <JmDropdownMenuTrigger
                  render={
                    <JmIconButton
                      size="md"
                      variant="ghost"
                      aria-label="메뉴"
                    >
                      <MoreVertical className="size-4" />
                    </JmIconButton>
                  }
                />
                <JmDropdownMenuContent align="end" sideOffset={8}>
                  {t.type === "ON_SITE" ? (
                    <JmDropdownMenuItem
                      onClick={() => typeMutation.mutate("DROP_OFF")}
                      disabled={typeMutation.isPending}
                    >
                      <Clock className="size-4" />
                      맡김 수리로 변경
                    </JmDropdownMenuItem>
                  ) : (
                    <JmDropdownMenuItem
                      onClick={() => typeMutation.mutate("ON_SITE")}
                      disabled={typeMutation.isPending}
                    >
                      <ArrowRightLeft className="size-4" />
                      즉시 수리로 변경
                    </JmDropdownMenuItem>
                  )}
                  <JmDropdownMenuSeparator />
                  <JmDropdownMenuItem
                    danger
                    onClick={() => setCancelOpen(true)}
                  >
                    <X className="size-4" />
                    수리 취소
                  </JmDropdownMenuItem>
                </JmDropdownMenuContent>
              </JmDropdownMenu>
            )}
          </div>
        </header>
      )}

      {/* 본문 */}
      <main className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 p-4 sm:p-6">
          {/* 고객 / 기기 */}
          <CustomerDeviceCard ticket={t} onCustomerClick={onCustomerClick} />

          {/* 가져온 기기 — 시리얼/구매내역/상품명/직접입력 4모드 */}
          <ProductLinkCard ticket={t} readonly={readonly} onChanged={invalidate} />

          {/* 기본 점검비 — 운영 흐름상 가져온 기기 바로 아래 */}
          <DiagnosisFeeCard ticket={t} readonly={readonly} onSaved={invalidate} />

          {/* 증상 — 콤보박스 (기존 템플릿 + 새 입력) */}
          <SymptomCard ticket={t} readonly={readonly} onSaved={invalidate} />

          {/* 진단 — 증상에 자주 매칭된 항목 우선 추천 */}
          <DiagnosisCard ticket={t} readonly={readonly} onSaved={invalidate} />

          {/* 수리 메모 — 자유 텍스트 (체계화 대상 아님) */}
          <NotesCard ticket={t} readonly={readonly} onSaved={invalidate} />

          {/* 패키지 빠른 추가 */}
          {!readonly && <PackagesCard ticketId={t.id} onApplied={invalidate} />}

          {/* Phase 4 — 자주 함께 사용된 세트 추천 (진단 선택되어 있을 때만) */}
          <SetRecommendations
            ticketId={t.id}
            diagnosisTemplateId={t.diagnosisTemplateId}
            readonly={readonly}
            parts={t.parts}
            labors={t.labors}
            onApplied={invalidate}
          />

          {/* 부속 — 진단 선택되어 있으면 자주 쓰인 부속 추천 노출 */}
          <PartsSection
            ticketId={t.id}
            parts={t.parts}
            readonly={readonly}
            onChanged={invalidate}
            diagnosisTemplateId={t.diagnosisTemplateId}
          />

          {/* 공임 — 동일 패턴 */}
          <LaborsSection
            ticketId={t.id}
            labors={t.labors}
            readonly={readonly}
            onChanged={invalidate}
            diagnosisTemplateId={t.diagnosisTemplateId}
          />

          {/* 참조 정보 (시리얼 이력 + 재수리) — 보조 정보, 접힘 기본 */}
          {(t.serialItem ||
            t.parentRepairTicket ||
            t.revisits.length > 0) && (
            <ReferenceInfoSection
              ticket={t}
              onClickTicket={(id) => router.push(`/pos/repairs/${id}`)}
            />
          )}

          {/* 종료 상태 메시지 */}
          {readonly && (
            <div className="flex flex-col gap-2">
              <div
                className={`rounded-2xl border px-4 py-3 text-jm-sm ${
                  t.status === "PICKED_UP"
                    ? "border-[var(--jm-success-bg)] bg-[var(--jm-success-bg)] text-[var(--jm-success-fg)]"
                    : "border-[var(--jm-danger-bg)] bg-[var(--jm-danger-bg)] text-[var(--jm-danger-fg)]"
                }`}
              >
                {t.status === "PICKED_UP"
                  ? `수리 완료 — ${fmtKRWInc(t.finalAmount)}${
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

      {/* 하단 sticky — 합계 + 다음 액션. 부속·공임 추가하며 작업할 때 합계가 항상 보임 */}
      {(actions.length > 0 || !readonly) && (
        <div className="shrink-0 border-t border-[var(--jm-border)] bg-[var(--jm-surface)] px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 sm:px-6">
          {/* 공급가액 / 부가세 / 청구 합계 3분할 — DB 저장값은 세전, 표시만 분해 */}
          <div className="mb-2.5 flex flex-col gap-0.5 rounded-xl bg-[var(--jm-bg)] px-3 py-2">
            <div className="flex items-baseline justify-between text-jm-2xs">
              <span className="text-[var(--jm-text-muted)]">공급가액</span>
              <span className="tabular-nums text-[var(--jm-text)]">
                {fmtKRW(finalAmount)}
              </span>
            </div>
            <div className="flex items-baseline justify-between text-jm-2xs">
              <span className="text-[var(--jm-text-muted)]">부가세 (10%)</span>
              <span className="tabular-nums text-[var(--jm-text)]">
                {fmtKRWTax(finalAmount)}
              </span>
            </div>
            <div className="mt-0.5 flex items-baseline justify-between border-t border-[var(--jm-border)] pt-1">
              <span className="text-jm-2xs font-semibold text-[var(--jm-text)]">
                청구 합계
              </span>
              <span className="text-jm-lg font-bold tabular-nums text-[var(--jm-text)]">
                {fmtKRWInc(finalAmount)}
              </span>
            </div>
          </div>

          {/* 항목 breakdown — 부속·공임·점검 (VAT 포함 기준) */}
          {(totals.usedPartsTotal > 0 ||
            totals.laborTotal > 0 ||
            totals.diagnosisFee > 0) && (
            <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1 text-jm-2xs text-[var(--jm-text-subtle)]">
              {totals.usedPartsTotal > 0 && (
                <span>
                  부속{" "}
                  <span className="tabular-nums text-[var(--jm-text-muted)]">
                    {fmtKRWInc(totals.usedPartsTotal)}
                  </span>
                </span>
              )}
              {totals.laborTotal > 0 && (
                <span>
                  공임{" "}
                  <span className="tabular-nums text-[var(--jm-text-muted)]">
                    {fmtKRWInc(totals.laborTotal)}
                  </span>
                </span>
              )}
              {totals.diagnosisFee > 0 && (
                <span>
                  점검{" "}
                  <span className="tabular-nums text-[var(--jm-text-muted)]">
                    {fmtKRWInc(totals.diagnosisFee)}
                  </span>
                </span>
              )}
            </div>
          )}
          {actions.length > 0 && (
            <div className="flex items-stretch gap-2">
              {actions.map((a) => (
                <JmButton
                  key={a.action}
                  variant={a.primary ? "cta" : a.destructive ? "danger" : "outline"}
                  size="lg"
                  disabled={transitionMutation.isPending}
                  onClick={() => triggerAction(a.action)}
                  className="flex-1"
                >
                  {a.label}
                </JmButton>
              ))}
            </div>
          )}
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

// ──── 고객 / 담당 / 접수 (기기는 별도 ProductLinkCard) ────
function CustomerDeviceCard({
  ticket,
  onCustomerClick,
}: {
  ticket: RepairTicketDetail;
  onCustomerClick?: () => void;
}) {
  // onCustomerClick 있으면 고객 영역만 클릭 가능 — 헤더 고객 썸네일과 동일한 시트 트리거
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




// ──── 기본점검비 + 수리 보증 카드 — 가져온 기기 바로 아래 배치 (운영 흐름) ────
// 전체할인은 제거 — 할인은 POS 카트의 라인 단위 할인 또는 결제 시트에서 처리.
// 보증 개월: PICKED_UP 시점부터 N개월. 회사 기본값(CompanyInfo.defaultRepairWarrantyMonths) 으로 prefill.
function DiagnosisFeeCard({
  ticket,
  readonly,
  onSaved,
}: {
  ticket: RepairTicketDetail;
  readonly: boolean;
  onSaved: () => void;
}) {
  const [feeOpen, setFeeOpen] = useState(false);
  const currentFee = Number(ticket.diagnosisFee) || 0;
  const currentWarranty = ticket.repairWarrantyMonths;

  const saveFee = useMutation({
    mutationFn: (net: number) =>
      apiMutate(`/api/repair-tickets/${ticket.id}`, "PUT", {
        diagnosisFee: net,
      }),
    onSuccess: () => {
      toast.success("점검비 저장됨");
      onSaved();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  const saveWarranty = useMutation({
    mutationFn: (months: number | null) =>
      apiMutate(`/api/repair-tickets/${ticket.id}`, "PUT", {
        repairWarrantyMonths: months,
      }),
    onSuccess: () => {
      toast.success("보증 변경됨");
      onSaved();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  // 자주 쓰는 보증 옵션 — 0 (보증 없음) / 1 / 3 / 6 / 12
  const WARRANTY_PRESETS = [0, 1, 3, 6, 12];

  return (
    <Card>
      <div className="flex flex-col gap-4">
        {/* 기본 점검비 섹션 */}
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
              기본 점검비
            </span>
            <span className="text-[10px] text-[var(--jm-text-subtle)]">VAT 포함</span>
          </div>
          <button
            type="button"
            onClick={() => !readonly && setFeeOpen(true)}
            disabled={readonly}
            className="flex h-12 items-center justify-end rounded-xl border border-[var(--jm-border)] bg-[var(--jm-bg)] px-4 text-right text-[16px] font-semibold tabular-nums text-[var(--jm-text)] transition-colors hover:bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)] disabled:opacity-70"
          >
            {currentFee > 0 ? fmtKRWInc(currentFee) : (
              <span className="text-[var(--jm-text-subtle)]">탭하여 입력</span>
            )}
          </button>
        </div>

        {/* 수리 보증 섹션 — 픽업 시점부터 시작. 회사 기본값에서 prefill. */}
        <div className="flex flex-col gap-2 border-t border-[var(--jm-border)] pt-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
              수리 보증
            </span>
            <span className="text-[10px] text-[var(--jm-text-subtle)]">
              픽업 시점부터 시작
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {WARRANTY_PRESETS.map((m) => {
              const active = currentWarranty === m || (m === 0 && currentWarranty === null);
              return (
                <button
                  key={m}
                  type="button"
                  disabled={readonly || saveWarranty.isPending}
                  onClick={() => saveWarranty.mutate(m === 0 ? null : m)}
                  className={`flex h-9 items-center rounded-full px-4 text-jm-sm font-semibold transition-colors disabled:opacity-50 ${
                    active
                      ? "bg-[var(--jm-action)] text-white"
                      : "bg-[var(--jm-surface-muted)] text-[var(--jm-text)] hover:bg-[var(--jm-border)]"
                  }`}
                >
                  {m === 0 ? "없음" : `${m}개월`}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <PriceInputDialog
        open={feeOpen}
        onOpenChange={setFeeOpen}
        title="기본 점검비"
        initialNet={currentFee}
        taxType="TAXABLE"
        onSubmit={(net) => saveFee.mutate(net)}
      />
    </Card>
  );
}

// ──── 참조 정보 섹션 — 시리얼 이력 + 재수리. 보조 정보라 접힘 기본 ────

// ──── 상태 진행률 — 헤더에 표시 ────
// ON_SITE 는 RECEIVED → REPAIRING → READY → PICKED_UP (4단계, 진단/견적/승인 생략)
// DROP_OFF 는 RECEIVED → DIAGNOSING → QUOTED → APPROVED → REPAIRING → READY → PICKED_UP (7단계)
function StatusStepperBar({
  status,
  type,
}: {
  status: RepairTicketDetail["status"];
  type: RepairTicketDetail["type"];
}) {
  const steps: string[] =
    type === "ON_SITE"
      ? ["RECEIVED", "REPAIRING", "READY", "PICKED_UP"]
      : [
          "RECEIVED",
          "DIAGNOSING",
          "QUOTED",
          "APPROVED",
          "REPAIRING",
          "READY",
          "PICKED_UP",
        ];

  const currentIndex = steps.indexOf(status);
  // PICKED_UP 은 마지막 단계
  const lastIndex = steps.length - 1;
  const activeIdx = Math.max(0, currentIndex);

  return (
    <div className="mt-1.5 flex items-center gap-0.5">
      {steps.map((s, i) => {
        const done = i < activeIdx;
        const active = i === activeIdx;
        return (
          <div key={s} className="flex flex-1 items-center gap-0.5">
            <div
              className={`h-1 flex-1 rounded-full transition-colors ${
                done
                  ? "bg-[var(--jm-action)]"
                  : active
                  ? "bg-[var(--jm-action)]"
                  : "bg-[var(--jm-border)]"
              }`}
              aria-label={s}
            />
            {i === lastIndex && active && (
              <span className="ml-1 size-1.5 rounded-full bg-[var(--jm-action)]" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ──── 헤더 보조 줄 — 손님 · 기기 한 줄로 정체성 표시 ────
function HeaderIdentitySubtitle({ ticket }: { ticket: RepairTicketDetail }) {
  const customerName = ticket.customer?.name ?? "미등록 손님";
  const deviceName =
    ticket.serialItem?.product?.name ??
    ticket.serialItem?.displayName ??
    ticket.repairProduct?.name ??
    ticket.repairProductText ??
    null;
  return (
    <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-jm-xs text-[var(--jm-text-muted)]">
      <span className="line-clamp-1 font-medium text-[var(--jm-text)]">
        {customerName}
      </span>
      {deviceName && (
        <>
          <span className="text-[var(--jm-text-disabled)]">·</span>
          <span className="line-clamp-1">{deviceName}</span>
        </>
      )}
    </div>
  );
}

// 미사용 import 정리 — 파일 외부에서 참조될 수 있도록 export 만 한 줄
export type { RepairPart, RepairLabor };
