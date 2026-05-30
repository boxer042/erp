"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  ChevronDown,
  FileText,
  Loader2,
  Package,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { calcRepairTotals } from "@/lib/repair";
import {
  JmButton,
  JmCard,
  JmComboboxDrawer,
  JmIconButton,
  JmInput,
  JmNumberInput,
  JmSearchInput,
  JmSkeleton,
} from "@/jm";
import {
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
import { cancelReasonLabel, HardDeleteButton } from "./_cancel-sheet";
import { DetailSkeleton } from "./_detail-skeleton";
import { RejectSheet, quoteRejectReasonLabel } from "./_reject-sheet";
import { RepairTicketActionMenu } from "./_repair-action-menu";
import { SymptomCard, DiagnosisCard, NotesCard } from "./_notes-cards";
import { PackagesCard, ReferenceInfoSection } from "./_reference-cards";
import { ReceivedAtEditor } from "./_received-at-editor";
import { Card, Field } from "./_shared";
import { PriceInputDialog } from "@/app/(pos)/pos/_components/price-input-dialog";
import { QuickCustomerSheet } from "@/app/(pos)/pos/_quick-customer-sheet";

/** 라우트 진입점 — params 받아 RepairDetail 에 위임. 미등록 고객 클릭 시 QuickCustomerSheet 띄움. */
export default function RepairDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <StandaloneRepairDetail ticketId={id} />;
}

function StandaloneRepairDetail({ ticketId }: { ticketId: string }) {
  const qc = useQueryClient();
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);

  // 같은 queryKey 라 RepairDetail 의 ticketQuery 와 cache 공유 — 추가 fetch 없음
  const ticketQuery = useQuery({
    queryKey: ["repairs", "detail", ticketId],
    queryFn: () => apiGet<RepairTicketDetail>(`/api/repair-tickets/${ticketId}`),
  });
  const isUnregistered = !ticketQuery.data?.customer;

  const linkCustomer = useMutation({
    mutationFn: (customerId: string) =>
      apiMutate(`/api/repair-tickets/${ticketId}`, "PUT", { customerId }),
    onSuccess: () => {
      toast.success("고객 연결됨");
      qc.invalidateQueries({ queryKey: ["repairs", "detail", ticketId] });
      qc.invalidateQueries({ queryKey: ["repairs"] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "연결 실패"),
  });

  return (
    <>
      <RepairDetail
        ticketId={ticketId}
        // 미등록일 때만 카드를 클릭 가능하게. 등록 고객은 변경 흐름 미정의 → 비활성.
        onCustomerClick={
          isUnregistered ? () => setQuickCustomerOpen(true) : undefined
        }
      />
      <QuickCustomerSheet
        open={quickCustomerOpen}
        onOpenChange={setQuickCustomerOpen}
        onCreated={(c) => {
          linkCustomer.mutate(c.id);
          setQuickCustomerOpen(false);
        }}
      />
    </>
  );
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
  const [rejectOpen, setRejectOpen] = useState(false);
  // cancelOpen 은 RepairTicketActionMenu (_repair-action-menu.tsx) 가 자체 관리.

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

  // 즉시↔맡김 변경 + 수리 취소는 RepairTicketActionMenu (_repair-action-menu.tsx) 가 자체 mutation 처리.

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
        reject_after_quote: "진단비만 청구로 진행합니다",
      };
      // cancel 액션은 RepairTicketActionMenu 가 자체 처리. 여기는 출고·결제 단계만.
      toast.success(labels[vars.action] ?? "처리되었습니다");
      setPickupOpen(false);
      setRejectOpen(false);
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
    if (action === "reject_after_quote") {
      setRejectOpen(true);
      return;
    }
    if (action === "cart") {
      // 카트에 라인 추가 — 부모(v2 고객 페이지) 가 처리
      onAddToCart?.(t, finalAmount);
      return;
    }
    // cancel 은 헤더 kebab 메뉴에서 처리 (nextActions 에 더 이상 안 포함)
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
                <RepairTicketActionMenu ticketId={t.id} onChanged={invalidate} />
                <span className="font-mono text-jm-2xs text-[var(--jm-text-subtle)]">
                  {t.ticketNo}
                </span>
                {t.workKind === "CUSTOM_BUILD" && (
                  <span
                    className="rounded bg-[var(--jm-accent-bg)] px-1.5 py-0.5 text-jm-3xs font-bold tracking-wider text-[var(--jm-accent-fg)]"
                    title="리빌드 — 손님 부품 + 부속 조합"
                  >
                    리빌드
                  </span>
                )}
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
          </div>
        </header>
      )}

      {/* 본문 */}
      <main className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 p-4 sm:p-6">
          {/* 고객 / 기기 */}
          <CustomerDeviceCard
            ticket={t}
            onCustomerClick={onCustomerClick}
            onChanged={invalidate}
          />

          {/* 가져온 기기 — 시리얼/구매내역/상품명/직접입력 4모드 */}
          <ProductLinkCard ticket={t} readonly={readonly} onChanged={invalidate} />

          {/* 기본 진단비 + 보증 — 운영 흐름상 가져온 기기 바로 아래. 수리 안 했을 때만 진단비 청구 */}
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

          {/* 거절 사유 배지 — READY(post-reject) / PICKED_UP(post-reject) 양쪽 표시.
              왜 부속/공임 없이 진단비만 청구됐는지 직원이 한눈에 알 수 있도록. */}
          {t.quoteRejectReason && (
            <div className="rounded-2xl border-2 border-[var(--jm-warning-bg)] bg-[var(--jm-warning-bg)] px-4 py-3 text-jm-sm text-[var(--jm-warning-fg)]">
              <div className="flex items-baseline gap-1.5">
                <span className="text-jm-2xs font-bold uppercase tracking-wider">
                  거절
                </span>
                <span className="font-semibold">
                  {quoteRejectReasonLabel(t.quoteRejectReason)}
                </span>
              </div>
              {t.quoteRejectMemo && (
                <p className="mt-0.5 text-jm-xs opacity-80">{t.quoteRejectMemo}</p>
              )}
              {t.quoteRejectedAt && (
                <p className="mt-0.5 text-jm-2xs opacity-60">
                  {format(new Date(t.quoteRejectedAt), "yyyy-MM-dd HH:mm")}
                </p>
              )}
            </div>
          )}

          {/* 종료 상태 메시지 */}
          {readonly && (
            <div className="flex flex-col gap-2">
              <div
                className={`rounded-2xl border px-4 py-3 text-jm-sm ${
                  t.status === "PICKED_UP"
                    ? t.quoteRejectReason
                      ? "border-[var(--jm-warning-bg)] bg-[var(--jm-warning-bg)] text-[var(--jm-warning-fg)]"
                      : "border-[var(--jm-success-bg)] bg-[var(--jm-success-bg)] text-[var(--jm-success-fg)]"
                    : "border-[var(--jm-danger-bg)] bg-[var(--jm-danger-bg)] text-[var(--jm-danger-fg)]"
                }`}
              >
                {t.status === "PICKED_UP"
                  ? `${t.quoteRejectReason ? "거절·진단비 청구" : "수리 완료"} — ${fmtKRWInc(t.finalAmount)}${
                      t.repairWarrantyEnds && !t.quoteRejectReason
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
          {/* 요약 카드 — 할인 흐름을 한눈에 보이도록 명시적 3행 노출.
              할인 있을 때: 원래 금액 → 할인 → 청구 금액 (계산 결과)
              할인 없을 때: 청구 금액만 (불필요한 0원 표시 피함) */}
          <div className="mb-2.5 flex flex-col gap-1 rounded-xl bg-[var(--jm-bg)] px-3 py-2.5">
            {totals.discountAmount > 0 && (
              <>
                <div className="flex items-baseline justify-between text-jm-sm">
                  <span className="text-[var(--jm-text-muted)]">원래 금액</span>
                  <span className="tabular-nums text-[var(--jm-text)]">
                    {fmtKRWInc(totals.subtotal)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between text-jm-sm text-[var(--jm-danger-fg)]">
                  <span>할인</span>
                  <span className="tabular-nums">
                    -{fmtKRWInc(totals.discountAmount)}
                  </span>
                </div>
                <div className="h-px bg-[var(--jm-border)]" />
              </>
            )}
            <div className="flex items-baseline justify-between">
              <span className="text-jm-sm font-semibold text-[var(--jm-text)]">
                청구 금액
              </span>
              <span className="text-jm-lg font-bold tabular-nums text-[var(--jm-text)]">
                {fmtKRWInc(finalAmount)}
              </span>
            </div>
            {/* 공급가액 / 부가세 분해 — 작은 보조 정보 */}
            <div className="mt-0.5 flex items-baseline justify-between text-jm-2xs text-[var(--jm-text-subtle)]">
              <span>공급가액 {fmtKRW(finalAmount)}</span>
              <span>부가세 (10%) {fmtKRWTax(finalAmount)}</span>
            </div>
          </div>

          {/* 항목 breakdown — 부속·공임·진단비 (VAT 포함 기준).
              진단비는 수리 안 했을 때만 청구 (effectiveDiagnosisFee 사용).
              수리 진행되면 입력된 진단비가 있어도 면제됨 — 회색 strike 로 시각화. */}
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
              {totals.effectiveDiagnosisFee > 0 && (
                <span>
                  진단{" "}
                  <span className="tabular-nums text-[var(--jm-text-muted)]">
                    {fmtKRWInc(totals.effectiveDiagnosisFee)}
                  </span>
                </span>
              )}
              {totals.diagnosisFee > 0 && totals.effectiveDiagnosisFee === 0 && (
                <span className="text-[var(--jm-text-disabled)] line-through">
                  진단{" "}
                  <span className="tabular-nums">
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
      {/* 손님 거절 — 진단비만 청구 시트 */}
      <RejectSheet
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        diagnosisFee={Number(t.diagnosisFee) || 0}
        onConfirm={(quoteRejectReason, quoteRejectMemo) =>
          transitionMutation.mutate({
            action: "reject_after_quote",
            payload: { quoteRejectReason, quoteRejectMemo },
          })
        }
        loading={transitionMutation.isPending}
      />
      {/* 취소 사유 시트는 RepairTicketActionMenu 내부로 이동 */}
    </div>
  );
}

// ──── 고객 / 담당 / 접수 (기기는 별도 ProductLinkCard) ────
function CustomerDeviceCard({
  ticket,
  onCustomerClick,
  onChanged,
}: {
  ticket: RepairTicketDetail;
  onCustomerClick?: () => void;
  onChanged?: () => void;
}) {
  // onCustomerClick 있으면 고객 영역만 클릭 가능 — 헤더 고객 썸네일과 동일한 시트 트리거
  const customerContent = ticket.customer ? (
    <div className="flex min-w-0 flex-col">
      <span className="line-clamp-1 text-jm-md font-semibold text-[var(--jm-text)]">
        {ticket.customer.name}
      </span>
      {ticket.customer.phone && (
        <span className="font-mono text-jm-xs text-[var(--jm-text-muted)]">
          {ticket.customer.phone}
        </span>
      )}
    </div>
  ) : (
    <span className="text-jm-base text-[var(--jm-text-subtle)]">미등록</span>
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
              <ChevronDown
                className="size-3.5 shrink-0 text-[var(--jm-text-subtle)]"
                aria-hidden
              />
            </button>
          ) : (
            customerContent
          )}
        </Field>
        <Field label="담당">
          <span className="text-jm-base text-[var(--jm-text)]">
            {ticket.assignedTo?.name ?? (
              <span className="text-[var(--jm-text-subtle)]">미지정</span>
            )}
          </span>
        </Field>
        <Field label="접수">
          <ReceivedAtEditor
            ticketId={ticket.id}
            receivedAt={ticket.receivedAt}
            readonly={ticket.status === "CANCELLED"}
            onSaved={onChanged}
          />
        </Field>
      </div>
    </Card>
  );
}




// ──── 기본 진단비 + 수리 보증 카드 — 가져온 기기 바로 아래 배치 (운영 흐름) ────
// 진단비 정책: 수리 진행(부속·공임 있음) 시 면제. 수리 안 했을 때(거절·포기) 만 청구.
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
  // 수리가 진행 중이면 진단비 면제 — 부속·공임 합계로 판단
  const hasRepairWork =
    ticket.parts.some((p) => p.status === "USED" || (p.status === "LOST" && p.billLost)) ||
    ticket.labors.length > 0;
  const isWaived = hasRepairWork && currentFee > 0;

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
        {/* 기본 진단비 섹션 — 수리 안 했을 때만 청구되는 비용 */}
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-jm-xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
              기본 진단비
            </span>
            <span className="text-jm-3xs text-[var(--jm-text-subtle)]">VAT 포함</span>
          </div>
          <button
            type="button"
            onClick={() => !readonly && setFeeOpen(true)}
            disabled={readonly}
            className={`flex h-12 items-center justify-end rounded-xl border border-[var(--jm-border)] bg-[var(--jm-bg)] px-4 text-right text-jm-lg font-semibold tabular-nums transition-colors hover:bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)] disabled:opacity-70 ${
              isWaived
                ? "text-[var(--jm-text-disabled)] line-through"
                : "text-[var(--jm-text)]"
            }`}
          >
            {currentFee > 0 ? fmtKRWInc(currentFee) : (
              <span className="text-[var(--jm-text-subtle)]">탭하여 입력</span>
            )}
          </button>
          <p className="text-jm-2xs text-[var(--jm-text-subtle)]">
            {isWaived
              ? "수리 진행 — 진단비 면제 (수리비에 흡수)"
              : hasRepairWork
                ? "수리 진행 시 청구 안 됨"
                : "수리 안 함(거절·포기) 시 청구. 수리 진행되면 자동 면제됩니다."}
          </p>
        </div>

        {/* 수리 보증 섹션 — 픽업 시점부터 시작. 회사 기본값에서 prefill. */}
        <div className="flex flex-col gap-2 border-t border-[var(--jm-border)] pt-3">
          <div className="flex items-baseline justify-between">
            <span className="text-jm-xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
              수리 보증
            </span>
            <span className="text-jm-3xs text-[var(--jm-text-subtle)]">
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
        title="기본 진단비"
        initialNet={currentFee}
        taxType="TAXABLE"
        onSubmit={(net) => saveFee.mutate(net)}
      />
    </Card>
  );
}

// ──── 참조 정보 섹션 — 시리얼 이력 + 재수리. 보조 정보라 접힘 기본 ────

// ──── 상태 진행률 — 헤더에 표시. 단계 dot + 라벨 + 현재 위치 (n/m) ────
// ON_SITE: RECEIVED → REPAIRING → READY → PICKED_UP (4단계, 진단/견적/승인 생략)
// DROP_OFF: RECEIVED → DIAGNOSING → QUOTED → APPROVED → REPAIRING → READY → PICKED_UP (7단계)
const STEPPER_LABELS: Record<string, string> = {
  RECEIVED: "접수",
  DIAGNOSING: "진단",
  QUOTED: "견적",
  APPROVED: "승인",
  REPAIRING: "수리중",
  READY: "완료",
  PICKED_UP: "픽업",
};

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
  const activeIdx = Math.max(0, currentIndex);
  const currentLabel = STEPPER_LABELS[status] ?? status;

  return (
    <div className="mt-1.5 flex flex-col gap-1">
      {/* 점 + 연결선 — 각 단계별로 dot 표시. 현재 단계는 강조 (큰 원 + 보라) */}
      <div className="flex items-center">
        {steps.map((s, i) => {
          const done = i < activeIdx;
          const active = i === activeIdx;
          const isLast = i === steps.length - 1;
          return (
            <div
              key={s}
              className={isLast ? "flex shrink-0 items-center" : "flex flex-1 items-center"}
            >
              {/* dot */}
              <span
                aria-label={s}
                className={`shrink-0 rounded-full transition-all ${
                  active
                    ? "size-2.5 bg-[var(--jm-action)] ring-2 ring-[var(--jm-action)]/30"
                    : done
                      ? "size-2 bg-[var(--jm-action)]"
                      : "size-2 bg-[var(--jm-border)]"
                }`}
              />
              {/* 연결선 (마지막 단계 제외) */}
              {!isLast && (
                <span
                  className={`h-0.5 flex-1 transition-colors ${
                    done || active ? "bg-[var(--jm-action)]" : "bg-[var(--jm-border)]"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
      {/* 현재 단계 라벨 + 진행률 (n/m) */}
      <div className="flex items-baseline justify-between gap-2 text-jm-2xs">
        <span className="font-medium text-[var(--jm-action)]">
          {currentLabel}
        </span>
        <span className="text-[var(--jm-text-subtle)]">
          {activeIdx + 1}/{steps.length}
        </span>
      </div>
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
