"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, apiMutate } from "@/lib/api-client";
import { useSessions, type CartSession } from "@/components/pos/sessions-context";
import { calcCartTotals } from "@/components/pos/cart-helpers";
import { BottomSheet } from "./_components/bottom-sheet";
import { CartLineRow } from "./_cart-line-row";
import { issueQuotation, openPrintTab, calcCartFingerprint } from "./_issue-document";
import { PriceInputDialog } from "./_components/price-input-dialog";
import { DiscountInputDialog } from "./_components/discount-input-dialog";

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
  const { setSessionDiscount, setSessionShipping, setSessionQuotation, setSessionLabels, forceSync } =
    useSessions();
  const items = session.items;
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
  const hasTrackableCandidates = trackableCandidates.length > 0;

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

  const serialIssueMutation = useMutation<{ labels: { code: string }[] }>({
    mutationFn: () =>
      apiMutate<{ labels: { code: string }[] }>(
        "/api/serial-items/issue",
        "POST",
        {
          customerId: session.customerId ?? null,
          productItems: trackableCandidates,
          repairTicketIds: [],
        },
      ),
    onMutate: () => setIssuingKind("serial"),
    onSuccess: (res) => {
      const codes = res.labels.map((l) => l.code);
      if (codes.length === 0) {
        toast.info("발번 가능한 trackable 상품이 없습니다");
        return;
      }
      setSessionLabels(codes, session.id, session.id);
      toast.success(`라벨 ${codes.length}장 발번 완료`);
      onPrintLabels?.(codes);
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : err.message),
    onSettled: () => setIssuingKind(null),
  });

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
            <div className="px-5 py-12 text-center text-[13px] text-[var(--jm-text-subtle)]">
              카트가 비어 있습니다
            </div>
          ) : (
            items.map((it) => (
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

        {/* 액션 — [할인][배송비][시리얼출력][장바구니저장][견적서] */}
        {items.length > 0 && (
          <div className="mt-3 grid grid-cols-5 gap-1.5">
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
            {cartChangedSinceQuotation && (
              <p className="col-span-5 -mb-1 mt-1 px-1 text-[11px] text-[var(--jm-warning-fg)]">
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
          : "bg-[var(--jm-surface)] ring-1 ring-[var(--jm-border)] active:bg-[var(--jm-bg)]"
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
