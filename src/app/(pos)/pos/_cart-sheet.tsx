"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, apiMutate } from "@/lib/api-client";
import { useSessions, type CartSession } from "@/components/pos/sessions-context";
import { calcCartTotals } from "@/components/pos/cart-helpers";
import { CartEmptyState } from "@/components/pos/cart-empty-state";
import { BottomSheet } from "./_components/bottom-sheet";
import { CartLineRow } from "./_cart-line-row";
import { issueQuotation, openPrintTab, calcCartFingerprint } from "./_issue-document";
import { PriceInputDialog } from "./_components/price-input-dialog";
import { DiscountInputDialog } from "./_components/discount-input-dialog";
import { QuotationLoadSheet } from "./_quotation-load-sheet";
import { ServiceFeeSheet } from "./_service-fee-sheet";
import {
  ReprintPickerModal,
  type ReprintCandidate,
} from "./_components/reprint-picker-modal";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  session: CartSession;
  /** 결제 버튼 누름 — 부모가 결제 시트 열기 */
  onCheckout: () => void;
  /**
   * 시리얼 라벨 발번 — 부모(customer page) 가 라벨 미리보기 모달 띄움.
   * 카트의 시리얼출력은 결제 전이므로 옵션 미전달 (모달 닫아도 페이지 유지).
   */
  onPrintLabels?: (codes: string[], options?: { afterPayment?: boolean }) => void;
}

/**
 * 카트 시트 — 라인 풀 편집. 미니 카트바 클릭으로 진입.
 * 상품·수리·임대 모든 itemType 라인을 표시. 카트 badge 는 전체를 카운트하므로
 * 여기서 itemType 으로 필터링하면 사용자가 카트를 비어있다고 오해함.
 *
 * 합계 영역 아래 1x5 액션 버튼: [할인][배송비][시리얼확인][시리얼출력][견적서]
 *  - 할인/배송비: 다이얼로그로 입력 (인라인 input 제거)
 *  - 시리얼확인: dryRun 으로 발번 예상 라벨 미리보기 (DB write 없음)
 *  - 시리얼출력: 실제 발번 + 부모 onPrintLabels(codes) 호출 (라벨 미리보기 모달)
 *  - 견적서: quotation 발행 + 새 탭 PDF
 *
 * 거래명세표는 결제 완료(PaymentSheet onSuccess)에서 자동 발행 — 영수증 성격.
 */
export function CartSheet({ open, onOpenChange, session, onCheckout, onPrintLabels }: Props) {
  const router = useRouter();
  const { add, setSessionDiscount, setSessionShipping, setSessionQuotation, setSessionLabels, forceSync } =
    useSessions();
  const items = session.items;
  // 메인-자식 트리 — 메인 라인 후 그 자식 ADDON 라인들 순서로 평탄화 (orphan ADDON 은 마지막에)
  const orderedItems = useMemo(() => {
    const addonsByParent = new Map<string, typeof items>();
    for (const it of items) {
      if (it.isAddon && it.parentCartItemId) {
        const arr = addonsByParent.get(it.parentCartItemId) ?? [];
        arr.push(it);
        addonsByParent.set(it.parentCartItemId, arr);
      }
    }
    const out: typeof items = [];
    const known = new Set(items.map((it) => it.cartItemId));
    for (const it of items) {
      if (it.isAddon) continue;
      out.push(it);
      const children = addonsByParent.get(it.cartItemId) ?? [];
      for (const c of children) out.push(c);
    }
    // 부모 없는 orphan ADDON
    for (const it of items) {
      if (
        it.isAddon &&
        (!it.parentCartItemId || !known.has(it.parentCartItemId))
      ) {
        out.push(it);
      }
    }
    return out;
  }, [items]);
  const totals = calcCartTotals(session);
  const canIssue = !!session.customerId && items.length > 0;

  // 견적서 재발행 가드 — 이전 발행 후 카트 변경 시 재인쇄 시 안내
  const currentFingerprint = canIssue ? calcCartFingerprint(session) : "";
  const hasPriorQuotation = !!session.quotationId;
  const cartChangedSinceQuotation =
    hasPriorQuotation &&
    session.quotationFingerprint !== "" &&
    session.quotationFingerprint !== currentFingerprint;

  const [issuingKind, setIssuingKind] = useState<"quotation" | "serial" | "park" | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [shippingOpen, setShippingOpen] = useState(false);
  const [quotationLoadOpen, setQuotationLoadOpen] = useState(false);
  const [serviceFeeOpen, setServiceFeeOpen] = useState(false);
  // 시리얼 발번 결과 — 기존 라벨 발견 시 picker 모달 분기.
  // pendingNewCodes: 신규 발번된 코드 (이미 DB 에 발급됨, picker 결과와 합쳐 출력).
  // reprintCandidates: 기존 시리얼 보유 ticket — picker 에서 선택.
  const [reprintState, setReprintState] = useState<{
    newCodes: string[];
    candidates: ReprintCandidate[];
  } | null>(null);

  const parkMutation = useMutation({
    mutationFn: () =>
      apiMutate<{ ok: true }>(`/api/pos/sessions/${session.id}/park`, "POST"),
    onMutate: () => setIssuingKind("park"),
    onSuccess: async () => {
      toast.success("장바구니에 저장되었습니다");
      onOpenChange(false);
      await forceSync();
      router.push("/pos");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장에 실패했습니다"),
    onSettled: () => setIssuingKind(null),
  });

  // 트래커블 발번 후보 — 상품 라인 중 productId 있는 것
  const trackableCandidates = items
    .filter((i) => i.itemType === "product" && i.productId)
    .map((i) => ({ productId: i.productId!, quantity: Math.max(1, Math.round(i.quantity)) }));
  // 수리 라인의 ticket id — API 가 미발번 ticket 만 신규 발번, 기존 있으면 재출력 후보로 반환
  const repairTicketIdsForLabels = items
    .filter((i) => i.itemType === "repair" && i.repairMeta?.repairTicketId)
    .map((i) => i.repairMeta!.repairTicketId!);
  const hasTrackableCandidates =
    trackableCandidates.length > 0 || repairTicketIdsForLabels.length > 0;

  const quotationMutation = useMutation({
    mutationFn: () => issueQuotation(session),
    onMutate: () => setIssuingKind("quotation"),
    onSuccess: (q) => {
      toast.success(`견적서 발행 — ${q.quotationNo}`);
      // 발행 시점 fingerprint 저장 → 이후 카트 변경 시 재발행 권장
      setSessionQuotation(q.id, currentFingerprint, session.id);
      openPrintTab("quotations", q.id);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : err.message),
    onSettled: () => setIssuingKind(null),
  });

  /** 견적서 인쇄 — 이미 발행된 견적서 재인쇄. 카트 변경됐으면 안내 후 진행. */
  const reprintQuotation = () => {
    if (!session.quotationId) return;
    if (cartChangedSinceQuotation) {
      const proceed = window.confirm(
        "카트가 발행 후 변경되었습니다.\n예전 견적서를 그대로 인쇄하시려면 [확인], 새로 발행하시려면 [취소] 누르고 견적서 버튼을 다시 눌러주세요.",
      );
      if (!proceed) return;
    }
    openPrintTab("quotations", session.quotationId);
  };

  const serialIssueMutation = useMutation<{
    labels: {
      code: string;
      newlyIssued: boolean;
      ticketNo: string | null;
      displayName: string;
    }[];
    consentMissing: boolean;
  }>({
    mutationFn: () =>
      apiMutate<{
        labels: {
          code: string;
          newlyIssued: boolean;
          ticketNo: string | null;
          displayName: string;
        }[];
        consentMissing: boolean;
      }>(
        "/api/serial-items/issue",
        "POST",
        {
          customerId: session.customerId ?? null,
          productItems: trackableCandidates,
          repairTicketIds: repairTicketIdsForLabels,
        },
      ),
    onMutate: () => setIssuingKind("serial"),
    onSuccess: (res) => {
      const newCodes = res.labels
        .filter((l) => l.newlyIssued)
        .map((l) => l.code);
      const candidates: ReprintCandidate[] = res.labels
        .filter((l) => !l.newlyIssued && l.ticketNo)
        .map((l) => ({
          code: l.code,
          ticketNo: l.ticketNo as string,
          displayName: l.displayName,
        }));

      if (newCodes.length === 0 && candidates.length === 0) {
        toast.info("발번 가능한 항목이 없습니다");
        return;
      }
      if (res.consentMissing) {
        toast.warning(
          "이 손님은 시리얼 조회 서비스 미동의 — QR 없이 발급되었습니다. 동의는 손님 정보에서 설정하세요.",
        );
      }
      if (newCodes.length > 0) {
        setSessionLabels(newCodes, session.id, session.id);
      }

      // 기존 라벨 발견 → picker 모달로 재출력 여부 묻기 (신규는 picker 닫을 때 함께 출력)
      if (candidates.length > 0) {
        setReprintState({ newCodes, candidates });
        return;
      }

      // 신규만 — 바로 출력
      toast.success(`라벨 ${newCodes.length}장 발번 완료`);
      onPrintLabels?.(newCodes);
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : err.message),
    onSettled: () => setIssuingKind(null),
  });

  /** picker 모달에서 사용자가 재출력 선택 완료 — 신규 + 선택 코드 함께 출력 */
  const finishReprint = (reprintCodes: string[]) => {
    if (!reprintState) return;
    const allCodes = [...reprintState.newCodes, ...reprintCodes];
    const parts: string[] = [];
    if (reprintState.newCodes.length > 0)
      parts.push(`신규 ${reprintState.newCodes.length}장`);
    if (reprintCodes.length > 0) parts.push(`재출력 ${reprintCodes.length}장`);
    toast.success(parts.join(" · ") || "출력 진행");
    setReprintState(null);
    if (allCodes.length > 0) onPrintLabels?.(allCodes);
    onOpenChange(false);
  };
  /** picker 닫기 (백드롭/뒤로) — 신규만 출력, 재출력 건너뜀 */
  const skipReprint = () => {
    if (!reprintState) return;
    if (reprintState.newCodes.length > 0) {
      toast.success(
        `신규 ${reprintState.newCodes.length}장 발번 완료 (재출력 건너뜀)`,
      );
      onPrintLabels?.(reprintState.newCodes);
    } else {
      toast.info("재출력 건너뜀");
    }
    setReprintState(null);
    onOpenChange(false);
  };

  return (
    <>
      <BottomSheet
        open={open}
        onOpenChange={onOpenChange}
        title="카트"
        maxHeight="92vh"
        footer={
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onCheckout();
            }}
            disabled={items.length === 0}
            className="flex h-14 w-full items-center justify-between rounded-2xl bg-[var(--jm-action)] px-5 text-[16px] font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-50"
          >
            <span>{items.length}건 결제</span>
            <span className="tabular-nums">
              ₩{totals.total.toLocaleString("ko-KR")}
            </span>
          </button>
        }
      >
        <div className="-mx-5 flex flex-col">
          {items.length === 0 ? (
            <CartEmptyState
              customerId={session.customerId}
              onLoadQuotation={() => setQuotationLoadOpen(true)}
            />
          ) : (
            orderedItems.map((it) => (
              <CartLineRow key={it.cartItemId} item={it} sessionId={session.id} />
            ))
          )}
        </div>


        {items.length > 0 && (
          <div className="mt-4 flex flex-col gap-2.5 rounded-2xl bg-[var(--jm-bg)] p-4">
            <Row label="공급가액" value={totals.net} />
            <Row label="세액 (VAT)" value={totals.vat} />
            {totals.shippingNet > 0 && (
              <Row
                label="배송비 (포함)"
                value={totals.shippingNet + totals.shippingVat}
              />
            )}
            {totals.sessionDiscountAmount > 0 && (
              <Row
                label="할인"
                value={-totals.sessionDiscountAmount}
                tone="warn"
              />
            )}
            <div className="my-1 h-px bg-[var(--jm-border)]" />
            <div className="flex items-baseline justify-between">
              <span className="text-[15px] font-semibold text-[var(--jm-text)]">합계</span>
              <span className="text-[22px] font-bold tabular-nums text-[var(--jm-text)]">
                ₩{totals.total.toLocaleString("ko-KR")}
              </span>
            </div>
          </div>
        )}

        {/* 액션 그리드 (4열): [할인][배송비][기술료][시리얼출력] / [장바구니저장][견적서][불러오기] */}
        {items.length > 0 && (
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            <ActionButton
              label="할인"
              sub={
                session.totalDiscount && session.totalDiscount !== "0"
                  ? session.totalDiscount.endsWith("%")
                    ? session.totalDiscount
                    : `₩${parseInt(session.totalDiscount, 10).toLocaleString("ko-KR")}`
                  : "추가"
              }
              active={!!session.totalDiscount && session.totalDiscount !== "0"}
              onClick={() => setDiscountOpen(true)}
            />
            <ActionButton
              label="배송비"
              sub={
                session.shippingCost && session.shippingCost !== "0"
                  ? `₩${parseInt(session.shippingCost, 10).toLocaleString("ko-KR")}`
                  : "추가"
              }
              active={!!session.shippingCost && session.shippingCost !== "0"}
              onClick={() => setShippingOpen(true)}
            />
            <ActionButton
              label="기술료"
              sub="공임 추가"
              onClick={() => setServiceFeeOpen(true)}
            />
            <ActionButton
              label="시리얼출력"
              sub={hasTrackableCandidates ? "발번+인쇄" : "없음"}
              disabled={
                !hasTrackableCandidates ||
                issuingKind !== null ||
                !onPrintLabels
              }
              onClick={() => serialIssueMutation.mutate()}
              pending={issuingKind === "serial"}
            />
            <ActionButton
              label="장바구니저장"
              sub="저장된 상담"
              disabled={issuingKind !== null}
              onClick={() => {
                const ok = window.confirm(
                  "이 카트를 장바구니로 저장합니다.\n그리드에서 사라지지만 \"저장된 상담\" 페이지에서 다시 불러올 수 있습니다.",
                );
                if (!ok) return;
                parkMutation.mutate();
              }}
              pending={issuingKind === "park"}
            />
            <ActionButton
              label={hasPriorQuotation ? "견적서" : "견적서"}
              sub={
                !canIssue
                  ? "고객 연결"
                  : cartChangedSinceQuotation
                    ? "재발행 필요"
                    : hasPriorQuotation
                      ? "재인쇄"
                      : "발행"
              }
              active={hasPriorQuotation && !cartChangedSinceQuotation}
              disabled={!canIssue || issuingKind !== null}
              onClick={() => {
                if (!canIssue) return;
                if (hasPriorQuotation && !cartChangedSinceQuotation) {
                  // 발행 후 변경 없음 — 그대로 재인쇄
                  reprintQuotation();
                  return;
                }
                // 처음 발행 또는 카트 변경 → 새로 발행
                quotationMutation.mutate();
              }}
              pending={issuingKind === "quotation"}
            />
            <ActionButton
              label="불러오기"
              sub={session.customerId ? "이전 견적서" : "고객 연결"}
              disabled={!session.customerId || issuingKind !== null}
              onClick={() => setQuotationLoadOpen(true)}
            />
            {cartChangedSinceQuotation && (
              <p className="col-span-4 -mb-1 mt-1 px-1 text-[11px] text-[var(--jm-warning-fg)]">
                ⚠ 카트가 발행 후 변경됨 — 견적서 버튼 다시 눌러 재발행
              </p>
            )}
          </div>
        )}
        {items.length > 0 && !session.customerId && (
          <p className="mt-2 px-1 text-[11px] text-[var(--jm-warning-fg)]">
            견적서 발행은 고객 연결이 필요합니다 (결제 시트에서 연결)
          </p>
        )}
      </BottomSheet>

      {/* 할인 입력 — 정액/% 혼용 */}
      <DiscountInputDialog
        open={discountOpen}
        onOpenChange={setDiscountOpen}
        title="전체 할인"
        baseAmount={totals.net + totals.vat}
        initialDiscount={session.totalDiscount}
        onSubmit={(d) => setSessionDiscount(d, session.id)}
      />

      {/* 배송비 입력 — TAXABLE 처리 (cart-helpers 가 합계에 +10% VAT 반영) */}
      <PriceInputDialog
        open={shippingOpen}
        onOpenChange={setShippingOpen}
        title="배송비"
        initialNet={parseInt(session.shippingCost || "0", 10) || 0}
        taxType="TAXABLE"
        onSubmit={(net) => setSessionShipping(String(net), session.id)}
      />

      {/* 기술료/공임 추가 — 프리셋 + 직접 입력. onAdd 콜백으로 POS·ERP 양쪽 카트에 적용 가능 */}
      <ServiceFeeSheet
        open={serviceFeeOpen}
        onOpenChange={setServiceFeeOpen}
        onAdd={(line) =>
          add(
            {
              itemType: "service",
              name: line.name,
              imageUrl: null,
              unitPrice: line.unitPrice,
            },
            { sessionId: session.id },
          )
        }
      />

      {/* 견적서 → 카트 로드 — 고객 연결됐을 때만 진입 가능 */}
      {session.customerId && (
        <QuotationLoadSheet
          open={quotationLoadOpen}
          onOpenChange={setQuotationLoadOpen}
          sessionId={session.id}
          customerId={session.customerId}
          cartItemCount={items.length}
        />
      )}

      {/* 재출력 라벨 선택 모달 — 기존 시리얼 보유 수리 ticket 있을 때만 노출 */}
      {reprintState && (
        <ReprintPickerModal
          candidates={reprintState.candidates}
          onConfirm={finishReprint}
          onBack={skipReprint}
        />
      )}
    </>
  );
}

function ActionButton({
  label,
  sub,
  active,
  disabled,
  pending,
  onClick,
}: {
  label: string;
  sub?: string;
  active?: boolean;
  disabled?: boolean;
  pending?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-center transition-colors ${
        active
          ? "bg-[var(--jm-success-bg)] ring-1 ring-emerald-300"
          : "bg-[var(--jm-surface)] border border-[var(--jm-border)] active:bg-[var(--jm-bg)]"
      } disabled:opacity-40`}
    >
      <span
        className={`text-[11px] font-semibold ${
          active ? "text-[var(--jm-success-fg)]" : "text-[var(--jm-text)]"
        }`}
      >
        {label}
      </span>
      <span
        className={`max-w-full truncate px-1 text-[10px] tabular-nums ${
          active ? "text-[var(--jm-success-fg)]" : "text-[var(--jm-text-muted)]"
        }`}
      >
        {pending ? "진행중…" : sub}
      </span>
    </button>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn";
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[13px] text-[var(--jm-text-muted)]">{label}</span>
      <span
        className={`text-[14px] font-semibold tabular-nums ${
          tone === "warn" ? "text-[var(--jm-danger-fg)]" : "text-[var(--jm-text)]"
        }`}
      >
        {value < 0 ? "−" : ""}₩{Math.abs(value).toLocaleString("ko-KR")}
      </span>
    </div>
  );
}
