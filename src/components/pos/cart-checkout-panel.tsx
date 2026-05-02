"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import {
  formatDiscountDisplay,
  normalizeDiscountInput,
  cn,
} from "@/lib/utils";
import { ApiError } from "@/lib/api-client";
import { useSessions, type CartSession } from "@/components/pos/sessions-context";
import { CartLineRow } from "@/components/pos/cart-line-row";
import { calcCartTotals } from "@/components/pos/cart-helpers";
import { submitCheckout } from "@/components/pos/checkout-submit";

interface Props {
  session: CartSession;
  onSwitchToProducts?: () => void;
}

export function CartCheckoutPanel({ session, onSwitchToProducts }: Props) {
  const router = useRouter();
  const { setSessionDiscount, clear } = useSessions();
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "TRANSFER" | "UNPAID">("CARD");
  const sessionId = session.id;

  const checkoutMutation = useMutation({
    mutationFn: () => {
      if (session.items.length === 0) throw new Error("카트가 비어있습니다");
      const hasUnsetRentalDates = session.items.some(
        (i) => i.itemType === "rental" && (!i.rentalMeta?.startDate || !i.rentalMeta?.endDate)
      );
      if (hasUnsetRentalDates) throw new Error("임대 항목의 날짜를 설정해주세요");
      const hasRepairOrRental = session.items.some(
        (i) => i.itemType === "repair" || i.itemType === "rental"
      );
      if (hasRepairOrRental && !session.customerId) {
        throw new Error("수리/임대는 손님 연결이 필요합니다");
      }
      return submitCheckout(session, { action: "order", paymentMethod });
    },
    onSuccess: (data) => {
      toast.success(`결제 완료 — ${data.no}`);
      clear(sessionId);
      router.push("/pos");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : err.message || "결제 실패"),
  });

  const totals = calcCartTotals(session);

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col">
      {/* 라인 리스트 */}
      <div className="flex-1 overflow-y-auto">
        {session.items.length === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShoppingCart />
              </EmptyMedia>
              <EmptyTitle>비어있는 장바구니</EmptyTitle>
              <EmptyDescription>좌측에서 상품/수리/임대를 추가해주세요.</EmptyDescription>
            </EmptyHeader>
            {onSwitchToProducts && (
              <Button onClick={onSwitchToProducts} className="mt-4">
                상품 보기
              </Button>
            )}
          </Empty>
        ) : (
          session.items.map((item) => (
            <CartLineRow key={item.cartItemId} item={item} sessionId={sessionId} />
          ))
        )}
      </div>

      {/* 합계 + 결제 */}
      <div className="shrink-0 border-t border-border bg-background">
        <div className="flex flex-col gap-2 px-3 py-3 sm:px-4">
          {/* 전체 할인 */}
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-medium" htmlFor="session-discount">
              전체 할인
            </label>
            <Input
              id="session-discount"
              type="text"
              inputMode={session.totalDiscount.trim().endsWith("%") ? "decimal" : "numeric"}
              value={formatDiscountDisplay(session.totalDiscount)}
              onChange={(e) =>
                setSessionDiscount(normalizeDiscountInput(e.target.value), sessionId)
              }
              onFocus={(e) => e.currentTarget.select()}
              placeholder="0 또는 10%"
              className="h-9 max-w-[140px] text-right tabular-nums"
            />
          </div>

          {/* 합계 */}
          <div className="flex flex-col gap-1 rounded-lg bg-muted/50 p-3 text-sm">
            <Row label="공급가액" value={totals.net} />
            <Row label="세액 (VAT)" value={totals.vat} />
            {totals.sessionDiscountAmount > 0 && (
              <Row
                label="전체 할인"
                value={-totals.sessionDiscountAmount}
                className="text-destructive"
              />
            )}
            <div className="my-1 border-t border-border" />
            <div className="flex items-baseline justify-between">
              <span className="text-base font-semibold">판매액</span>
              <span className="text-xl font-bold tabular-nums">
                ₩{totals.total.toLocaleString("ko-KR")}
              </span>
            </div>
          </div>

          {/* 결제수단 */}
          <div className="grid grid-cols-4 gap-1.5">
            {(["CASH", "CARD", "TRANSFER", "UNPAID"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setPaymentMethod(m)}
                className={cn(
                  "flex h-10 items-center justify-center rounded-md border text-sm font-medium transition-colors",
                  paymentMethod === m
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                {m === "CASH" ? "현금" : m === "CARD" ? "카드" : m === "TRANSFER" ? "계좌" : "외상"}
              </button>
            ))}
          </div>

          <Button
            size="lg"
            className="h-14 text-base font-semibold"
            onClick={() => checkoutMutation.mutate()}
            disabled={checkoutMutation.isPending || session.items.length === 0}
          >
            {checkoutMutation.isPending
              ? "처리 중..."
              : `결제하기 · ₩${totals.total.toLocaleString("ko-KR")}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between", className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">₩{value.toLocaleString("ko-KR")}</span>
    </div>
  );
}
