"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, apiMutate } from "@/lib/api-client";
import { useSessions, type CartSession } from "@/components/pos/sessions-context";
import { calcCartTotals } from "@/components/pos/cart-helpers";
import { submitCheckout } from "@/components/pos/checkout-submit";
import { BottomSheet } from "./_components/bottom-sheet";

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
  /** 결제 후 라벨 인쇄 모달 띄움 — 부모가 받아서 처리 */
  onPrintLabels: (codes: string[]) => void;
}

/**
 * 결제 시트 — 다크 합계 + 결제수단 + checkout API 호출 + 라벨 자동 발번.
 */
export function PaymentSheet({
  open,
  onOpenChange,
  session,
  onPrintLabels,
}: Props) {
  if (!open) return null;
  return (
    <Body
      onOpenChange={onOpenChange}
      session={session}
      onPrintLabels={onPrintLabels}
    />
  );
}

function Body({
  onOpenChange,
  session,
  onPrintLabels,
}: Omit<Props, "open">) {
  const router = useRouter();
  const { setSessionLabels, clear } = useSessions();
  const [method, setMethod] = useState<PaymentMethod>("CARD");

  // 결제 대상 = 상품 + 임대 + 수리(미연결: repairTicketId 없는 즉석 수리). 수리는 자체 픽업 흐름이 별도라
  // RepairTicket 픽업은 RepairV2Detail 의 PickupSheet 에서 처리. 여기선 카트 라인만.
  const productItems = session.items.filter((i) => i.itemType === "product");
  const rentalItems = session.items.filter((i) => i.itemType === "rental");
  const repairItems = session.items.filter((i) => i.itemType === "repair");
  const allItems = [...productItems, ...rentalItems, ...repairItems];
  const totals = calcCartTotals({ ...session, items: allItems });

  const hasRentalOrRepair = rentalItems.length > 0 || repairItems.length > 0;
  const requiresCustomer = hasRentalOrRepair && !session.customerId;
  const requiresCustomerForUnpaid = method === "UNPAID" && !session.customerId;

  const checkoutMutation = useMutation<
    { id: string; no: string; labelCodes: string[] },
    Error
  >({
    mutationFn: async () => {
      if (requiresCustomer) {
        throw new Error("임대/수리는 고객 연결이 필요합니다");
      }
      if (method === "UNPAID" && !session.customerId) {
        throw new Error("외상은 고객 연결이 필요합니다");
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
      });
      return { ...result, labelCodes };
    },
    onSuccess: (data) => {
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
      // 라벨 있으면 인쇄 모달 띄움 (영수증과 별도)
      if (data.labelCodes.length > 0) {
        onPrintLabels(data.labelCodes);
      }
      // 카트 클리어 + 손님 그리드로 이동
      clear(session.id);
      onOpenChange(false);
      // 라벨 인쇄 모달이 떠 있으면 닫힐 때 v2 홈으로 이동
      if (data.labelCodes.length === 0) {
        router.push("/pos/v2");
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
      footer={
        <button
          type="button"
          onClick={() => checkoutMutation.mutate()}
          disabled={
            checkoutMutation.isPending ||
            allItems.length === 0 ||
            requiresCustomer ||
            requiresCustomerForUnpaid
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

        {requiresCustomer && (
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-[12px] text-amber-900">
            임대/수리는 고객 연결이 필요합니다 — 손님 그리드에서 고객을 연결하세요
          </div>
        )}

        {method === "UNPAID" && !session.customerId && (
          <div className="rounded-xl bg-rose-50 px-4 py-3 text-[12px] text-rose-900">
            외상은 고객 연결이 필요합니다 — 미수금 추적용
          </div>
        )}

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
