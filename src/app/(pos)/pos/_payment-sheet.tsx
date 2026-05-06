"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";
import { ApiError, apiMutate } from "@/lib/api-client";
import { useSessions, type CartSession } from "@/components/pos/sessions-context";
import { calcCartTotals } from "@/components/pos/cart-helpers";
import { submitCheckout } from "@/components/pos/checkout-submit";
import {
  deriveTempCode,
  deriveTempColor,
} from "@/components/pos/temp-customer";
import { BottomSheet } from "./_components/bottom-sheet";
import { issueStatement, openPrintTab } from "./_issue-document";

type PaymentMethod = "CASH" | "CARD" | "TRANSFER" | "UNPAID";
const METHODS: { value: PaymentMethod; label: string; sub?: string }[] = [
  { value: "CARD", label: "카드", sub: "POS 결제" },
  { value: "CASH", label: "현금" },
  { value: "TRANSFER", label: "계좌이체" },
  { value: "UNPAID", label: "외상", sub: "고객 미수금" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  session: CartSession;
  /** 결제 후 라벨 인쇄 모달 띄움 — 부모가 받아서 처리. afterPayment=true 로 호출 (닫으면 손님 그리드 이동). */
  onPrintLabels: (codes: string[], options?: { afterPayment?: boolean }) => void;
  /** 손님 썸네일 카드 클릭 — 부모가 CustomerActionSheet 띄우도록 (재사용) */
  onCustomerClick?: () => void;
  /** 좌상단 뒤로가기 — 부모가 카트 시트로 복귀시킴 */
  onBack?: () => void;
}

/**
 * 결제 시트의 고객 카드 — 임대 시트 CustomerCard 와 동일한 시각 패턴.
 * 미등록: temp palette + #코드 / 등록: 첫글자 + 이름/전화.
 * required=true 면 미등록일 때 "연결 필요" amber 보조 문구 노출.
 */
function CustomerCard({
  session,
  onClick,
  required,
}: {
  session: CartSession;
  onClick?: () => void;
  required?: boolean;
}) {
  const isRegistered = !!session.customerId;
  const code = deriveTempCode(session.id);
  const palette = deriveTempColor(session.id);

  const inner = (
    <>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        고객
      </span>
      <div className="flex min-w-0 items-center gap-2.5">
        {isRegistered ? (
          session.customerType === "BUSINESS" ? (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M3 21V7l9-4 9 4v14M9 21V11h6v10"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          ) : (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[15px] font-bold text-zinc-700">
              {(session.customerName ?? "?").charAt(0)}
            </div>
          )
        ) : (
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-full text-white ${palette.bg}`}
          >
            <span className="font-mono text-[12px] font-bold tracking-wider">
              {code}
            </span>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          {isRegistered ? (
            <>
              <div className="flex items-center gap-1">
                {session.customerType === "BUSINESS" && (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0 text-[9px] font-semibold text-amber-800">
                    기업
                  </span>
                )}
                <span className="line-clamp-1 text-[14px] font-semibold text-zinc-900">
                  {session.customerName}
                </span>
              </div>
              {session.customerType === "BUSINESS" &&
              session.customerBusinessNumber ? (
                <span className="line-clamp-1 font-mono text-[11px] text-zinc-500">
                  {session.customerBusinessNumber}
                </span>
              ) : session.customerPhone ? (
                <span className="line-clamp-1 font-mono text-[11px] text-zinc-500">
                  {session.customerPhone}
                </span>
              ) : null}
            </>
          ) : (
            <>
              <span className="line-clamp-1 text-[14px] font-semibold text-zinc-900">
                미등록 손님
              </span>
              <span className="font-mono text-[11px] text-zinc-500">#{code}</span>
              {required && (
                <span className="line-clamp-1 text-[11px] text-amber-700">
                  연결 필요
                </span>
              )}
            </>
          )}
        </div>
        {onClick && (
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className="shrink-0 text-zinc-300"
            aria-hidden
          >
            <path
              d="M5 3l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    </>
  );

  if (!onClick) {
    return (
      <div className="flex flex-col gap-1.5 rounded-2xl bg-zinc-50 px-4 py-3">
        {inner}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-1.5 rounded-2xl bg-zinc-50 px-4 py-3 text-left transition-colors active:bg-zinc-100 sm:hover:bg-zinc-100"
    >
      {inner}
    </button>
  );
}

/**
 * 결제시간 카드 — 결제 시트가 열린 순간의 시각.
 * 시간대별 매출 트래픽 분석을 위해 Order.orderDate 로 자동 기록되는 값을 시각적으로도 명시.
 */
function CheckoutAtCard({ at }: { at: Date }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl bg-zinc-50 px-4 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        결제시간
      </span>
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-600">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
            <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M10 6v4l2.5 2"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[14px] font-semibold tabular-nums text-zinc-900">
            {format(at, "HH:mm")}
          </span>
          <span className="font-mono text-[11px] text-zinc-500">
            {format(at, "M월 d일 (eee)", { locale: ko })}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * 결제 시트 — 다크 합계 + 결제수단 + checkout API 호출 + 라벨 자동 발번.
 *
 * 손님 등록 강제: 임대/수리 라인이 있거나 외상 결제 시 고객 연결 필수 (통계/추적).
 * Skip 옵션: 정말 등록하기 싫은 손님 케이스를 위해 "등록 없이 진행" 작은 링크 노출.
 */
export function PaymentSheet({
  open,
  onOpenChange,
  session,
  onPrintLabels,
  onCustomerClick,
  onBack,
}: Props) {
  if (!open) return null;
  return (
    <Body
      onOpenChange={onOpenChange}
      session={session}
      onPrintLabels={onPrintLabels}
      onCustomerClick={onCustomerClick}
      onBack={onBack}
    />
  );
}

function Body({
  onOpenChange,
  session,
  onPrintLabels,
  onCustomerClick,
  onBack,
}: Omit<Props, "open">) {
  const router = useRouter();
  const { setSessionLabels, clear } = useSessions();
  const [method, setMethod] = useState<PaymentMethod>("CARD");
  // 손님 등록 우회 — "이 손님은 등록 없이 진행" 클릭 시 true. 통계 데이터 안 쌓이는 단점 있음.
  const [skipCustomerLink, setSkipCustomerLink] = useState(false);
  // 세금계산서 발행 요청 — Order.taxInvoiceRequested 로 저장 (사장님이 추후 발행)
  const [taxInvoiceRequested, setTaxInvoiceRequested] = useState(false);
  // 결제시간 — 시트가 열린 순간 고정. Body 가 마운트될 때마다 새로 계산.
  const [paymentAt] = useState(() => new Date());

  // 결제 대상 = 상품 + 임대 + 수리(미연결: repairTicketId 없는 즉석 수리). 수리는 자체 픽업 흐름이 별도라
  // RepairTicket 픽업은 RepairV2Detail 의 PickupSheet 에서 처리. 여기선 카트 라인만.
  const productItems = session.items.filter((i) => i.itemType === "product");
  const rentalItems = session.items.filter((i) => i.itemType === "rental");
  const repairItems = session.items.filter((i) => i.itemType === "repair");
  const allItems = [...productItems, ...rentalItems, ...repairItems];
  const totals = calcCartTotals({ ...session, items: allItems });

  const hasRentalOrRepair = rentalItems.length > 0 || repairItems.length > 0;
  // 모든 결제는 고객 등록을 권장 (통계/추적). skip 활성화 시 우회.
  const needsCustomer = !session.customerId && !skipCustomerLink;
  const requiresCustomer = hasRentalOrRepair && needsCustomer;
  const requiresCustomerForUnpaid =
    method === "UNPAID" && !session.customerId && !skipCustomerLink;
  // 변형 미확정 라인 — canonical 그대로 결제 불가 (사용자 정책)
  const unresolvedVariants = session.items.filter(
    (i) => i.isCanonical && i.productId,
  );
  const hasUnresolvedVariant = unresolvedVariants.length > 0;

  const checkoutMutation = useMutation<
    { id: string; no: string; labelCodes: string[] },
    Error
  >({
    mutationFn: async () => {
      if (requiresCustomer) {
        throw new Error("임대/수리는 고객 연결이 필요합니다");
      }
      if (method === "UNPAID" && !session.customerId && !skipCustomerLink) {
        throw new Error("외상은 고객 연결이 필요합니다");
      }
      if (hasUnresolvedVariant) {
        throw new Error(
          `변형 미확정 라인 ${unresolvedVariants.length}건 — 카트에서 먼저 변형을 선택하세요`,
        );
      }

      // 1) 라벨 자동 발번 (trackable 상품에 한해)
      let labelCodes: string[] = [];
      const trackableCandidates = productItems
        .filter((i) => i.productId)
        .map((i) => ({ productId: i.productId!, quantity: Math.max(1, Math.round(i.quantity)) }));

      if (trackableCandidates.length > 0) {
        try {
          const res = await apiMutate<{ labels: { code: string }[] }>(
            "/api/serial-items/issue",
            "POST",
            {
              customerId: session.customerId ?? null,
              productItems: trackableCandidates,
              repairTicketIds: [],
            },
          );
          labelCodes = res.labels.map((l) => l.code);
          if (labelCodes.length > 0) {
            setSessionLabels(labelCodes, session.id, session.id);
          }
        } catch {
          // 라벨 실패해도 결제는 진행
        }
      }

      // 2) 결제 — submitCheckout 가 product/rental/repair 모두 처리 (이미 buildCheckoutPayload 가 분기됨)
      const sessionForCheckout: CartSession = labelCodes.length
        ? { ...session, labelCodes, items: allItems }
        : { ...session, items: allItems };
      const result = await submitCheckout(sessionForCheckout, {
        action: "order",
        paymentMethod: method,
        taxInvoiceRequested,
      });
      return { ...result, labelCodes };
    },
    onSuccess: async (data) => {
      // 외상 결제는 미수금 자동 등록됐다는 명시적 안내
      if (method === "UNPAID") {
        toast.success(`외상 등록 — ${data.no}`, {
          description: session.customerName
            ? `${session.customerName} 님 미수금에 추가됐습니다`
            : "미수금에 추가됐습니다",
          duration: 5000,
        });
      } else {
        toast.success(`결제 완료 — ${data.no}`);
      }
      // 영수증 — 새창으로 자동 인쇄 (auto=1)
      try {
        window.open(`/pos-receipt/${data.id}/print?auto=1`, "_blank");
      } catch {
        /* 팝업 차단 — silent */
      }
      // 거래명세표 자동 발행 — 등록 고객일 때만 (사업자/B2B 증빙용)
      // 미등록 손님은 영수증으로 충분하므로 발행 생략 (스팸 방지)
      if (session.customerId) {
        try {
          const stmt = await issueStatement({ ...session, items: allItems });
          openPrintTab("statements", stmt.id);
        } catch {
          /* 거래명세표 실패해도 결제는 완료됨 — silent */
        }
      }
      // 라벨 있으면 인쇄 모달 띄움 (영수증과 별도) — 결제 직후 → afterPayment=true
      if (data.labelCodes.length > 0) {
        onPrintLabels(data.labelCodes, { afterPayment: true });
      }
      // 카트 클리어 + 손님 그리드로 이동
      clear(session.id);
      onOpenChange(false);
      // 라벨 인쇄 모달이 떠 있으면 닫힐 때 v2 홈으로 이동
      if (data.labelCodes.length === 0) {
        router.push("/pos");
      }
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : err.message || "결제 실패"),
  });

  return (
    <BottomSheet
      open
      onOpenChange={(o) => !checkoutMutation.isPending && onOpenChange(o)}
      title="결제"
      locked={checkoutMutation.isPending}
      onBack={onBack}
      footer={
        <button
          type="button"
          onClick={() => checkoutMutation.mutate()}
          disabled={
            checkoutMutation.isPending ||
            allItems.length === 0 ||
            requiresCustomer ||
            requiresCustomerForUnpaid ||
            hasUnresolvedVariant
          }
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-zinc-900 text-[16px] font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-60"
        >
          {checkoutMutation.isPending && <Spinner />}₩
          {totals.total.toLocaleString("ko-KR")} 결제
        </button>
      }
    >
      <div className="flex flex-col gap-5 pt-2">
        {/* 다크 합계 카드 */}
        <div className="rounded-2xl bg-zinc-900 p-5 text-white">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-white/60">
            결제 금액
          </div>
          <div className="mt-1 text-[40px] font-bold tabular-nums leading-none">
            ₩{totals.total.toLocaleString("ko-KR")}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
            <Pill label="공급가액" value={totals.net} />
            <Pill label="세액" value={totals.vat} />
            {totals.sessionDiscountAmount > 0 ? (
              <Pill
                label="할인"
                value={-totals.sessionDiscountAmount}
                tone="warn"
              />
            ) : (
              <Pill label="건수" value={allItems.length} suffix="건" />
            )}
          </div>
          {/* 항목 구성 */}
          {(rentalItems.length > 0 || repairItems.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
              {productItems.length > 0 && (
                <span className="rounded-full bg-white/10 px-2.5 py-1">
                  상품 {productItems.length}
                </span>
              )}
              {rentalItems.length > 0 && (
                <span className="rounded-full bg-white/10 px-2.5 py-1">
                  임대 {rentalItems.length}
                </span>
              )}
              {repairItems.length > 0 && (
                <span className="rounded-full bg-white/10 px-2.5 py-1">
                  수리 {repairItems.length}
                </span>
              )}
            </div>
          )}
        </div>

        {/* 고객 + 결제시간 — 임대 시트와 동일 2-grid 패턴. 향후 시간대별 매출 트래픽 분석. */}
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2.5">
            <CustomerCard
              session={session}
              onClick={onCustomerClick}
              required={
                !session.customerId &&
                !skipCustomerLink &&
                (hasRentalOrRepair || method === "UNPAID")
              }
            />
            <CheckoutAtCard at={paymentAt} />
          </div>

          {/* 등록 권장 / 필수 안내 — 미등록 + (임대·수리 또는 외상) */}
          {!session.customerId &&
            !skipCustomerLink &&
            (hasRentalOrRepair || method === "UNPAID") && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                <span className="text-[11px] text-amber-800">
                  {hasRentalOrRepair
                    ? "임대/수리 기록 추적을 위해 고객 연결을 권장합니다"
                    : "외상은 미수금 추적을 위해 고객 연결이 필요합니다"}
                </span>
                {/* 외상은 skip 불가 — 미수금 추적 필수 */}
                {method !== "UNPAID" && (
                  <button
                    type="button"
                    onClick={() => setSkipCustomerLink(true)}
                    className="shrink-0 text-[11px] font-medium text-amber-900 underline-offset-2 hover:underline"
                  >
                    등록 없이 진행
                  </button>
                )}
              </div>
            )}

          {/* skip 활성 시 안내 */}
          {skipCustomerLink && (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-zinc-50 px-3 py-2.5">
              <span className="text-[11px] text-zinc-500">
                등록 없이 결제 — 통계/이력 추적 안 됨
              </span>
              <button
                type="button"
                onClick={() => setSkipCustomerLink(false)}
                className="shrink-0 text-[11px] font-medium text-zinc-700 underline-offset-2 hover:underline"
              >
                취소
              </button>
            </div>
          )}

          {!session.customerId &&
            !hasRentalOrRepair &&
            method !== "UNPAID" &&
            !skipCustomerLink && (
              <p className="px-1 text-[11px] text-zinc-400">
                고객 등록 시 구매 이력·통계가 자동 누적됩니다
              </p>
            )}

          {/* 변형 미확정 — 결제 차단 안내 */}
          {hasUnresolvedVariant && (
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-[12px] text-amber-900">
              ⚠ 변형 미확정 <strong>{unresolvedVariants.length}건</strong> — 카트로 돌아가 변형을 선택해주세요
            </div>
          )}

          {/* 세금계산서 요청 토글 — 등록 고객일 때만 (사업자번호 등 기록 필요) */}
          {session.customerId && (
            <button
              type="button"
              onClick={() => setTaxInvoiceRequested((v) => !v)}
              className={`flex items-center justify-between rounded-xl px-4 py-3 text-left transition-colors ${
                taxInvoiceRequested
                  ? "bg-emerald-50 ring-1 ring-emerald-300"
                  : "bg-zinc-50 hover:bg-zinc-100"
              }`}
            >
              <div className="flex flex-col">
                <span className="text-[13px] font-semibold text-zinc-900">
                  세금계산서 발행 요청
                </span>
                <span className="text-[11px] text-zinc-500">
                  결제 후 사장님이 별도 발행
                </span>
              </div>
              <span
                className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${
                  taxInvoiceRequested ? "bg-emerald-500" : "bg-zinc-300"
                }`}
              >
                <span
                  className={`size-5 rounded-full bg-white shadow transition-transform ${
                    taxInvoiceRequested ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </span>
            </button>
          )}
        </div>

        {method === "UNPAID" && session.customerId && (
          <div className="flex items-center gap-2 rounded-xl bg-zinc-50 px-4 py-3 text-[12px] text-zinc-700">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3" />
              <path d="M7 4v3.5M7 9.5v0.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            결제 시 <span className="font-semibold">{session.customerName}</span> 님 미수금에 자동 등록됩니다
          </div>
        )}

        {/* 결제수단 */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
            결제수단
          </span>
          <div className="grid grid-cols-2 gap-2">
            {METHODS.map((m) => {
              const active = method === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  className={`flex flex-col gap-0.5 rounded-2xl border-2 p-4 text-left transition-colors ${
                    active
                      ? "border-zinc-900 bg-zinc-50"
                      : "border-zinc-200 bg-white hover:border-zinc-300"
                  }`}
                >
                  <span
                    className={`text-[16px] font-semibold ${
                      active ? "text-zinc-900" : "text-zinc-700"
                    }`}
                  >
                    {m.label}
                  </span>
                  {m.sub && (
                    <span className="text-[11px] text-zinc-500">{m.sub}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 고객 정보 */}
        {session.customerName && (
          <div className="rounded-2xl bg-zinc-50 px-4 py-3 text-[13px]">
            <span className="text-zinc-500">고객 </span>
            <span className="font-semibold text-zinc-900">
              {session.customerName}
            </span>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

function Pill({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: number;
  suffix?: string;
  tone?: "warn";
}) {
  return (
    <div
      className={`flex flex-col rounded-xl px-3 py-2 ${
        tone === "warn" ? "bg-amber-500/20" : "bg-white/10"
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider text-white/60">
        {label}
      </div>
      <div className="mt-0.5 text-[12px] font-semibold tabular-nums">
        {suffix
          ? `${value.toLocaleString("ko-KR")}${suffix}`
          : `${value < 0 ? "−" : ""}₩${Math.abs(value).toLocaleString("ko-KR")}`}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="size-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.25"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
