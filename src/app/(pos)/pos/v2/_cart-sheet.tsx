"use client";

import { useSessions, type CartSession } from "@/components/pos/sessions-context";
import { calcCartTotals } from "@/components/pos/cart-helpers";
import { BottomSheet } from "./_components/bottom-sheet";
import { CartLineRow } from "./_cart-line-row";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  session: CartSession;
  /** 결제 버튼 누름 — 부모가 결제 시트 열기 */
  onCheckout: () => void;
}

/**
 * 카트 시트 — 라인 풀 편집. 미니 카트바 클릭으로 진입.
 * 상품 라인만 표시 (수리/임대는 각자 모드에서 다룸).
 */
export function CartSheet({ open, onOpenChange, session, onCheckout }: Props) {
  const { setSessionDiscount } = useSessions();
  const productItems = session.items.filter((i) => i.itemType === "product");
  const totals = calcCartTotals({ ...session, items: productItems });

  return (
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
          disabled={productItems.length === 0}
          className="flex h-14 w-full items-center justify-between rounded-2xl bg-zinc-900 px-5 text-[16px] font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-50"
        >
          <span>{productItems.length}건 결제</span>
          <span className="tabular-nums">
            ₩{totals.total.toLocaleString("ko-KR")}
          </span>
        </button>
      }
    >
      <div className="-mx-5 flex flex-col">
        {productItems.length === 0 ? (
          <div className="px-5 py-12 text-center text-[13px] text-zinc-400">
            담긴 상품이 없습니다
          </div>
        ) : (
          productItems.map((it) => (
            <CartLineRow key={it.cartItemId} item={it} sessionId={session.id} />
          ))
        )}
      </div>

      {productItems.length > 0 && (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-zinc-50 p-4">
          {/* 전체 할인 */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
              전체 할인
            </span>
            <input
              type="text"
              value={session.totalDiscount === "0" ? "" : session.totalDiscount}
              onChange={(e) => setSessionDiscount(e.target.value, session.id)}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="5000 또는 10%"
              className="h-10 max-w-[140px] rounded-xl border border-zinc-200 bg-white px-3 text-right text-[14px] outline-none focus:border-zinc-400"
            />
          </div>

          <div className="my-1 h-px bg-zinc-200" />

          <Row label="공급가액" value={totals.net} />
          <Row label="세액 (VAT)" value={totals.vat} />
          {totals.sessionDiscountAmount > 0 && (
            <Row
              label="할인"
              value={-totals.sessionDiscountAmount}
              tone="warn"
            />
          )}
          <div className="my-1 h-px bg-zinc-200" />
          <div className="flex items-baseline justify-between">
            <span className="text-[15px] font-semibold text-zinc-900">합계</span>
            <span className="text-[22px] font-bold tabular-nums text-zinc-900">
              ₩{totals.total.toLocaleString("ko-KR")}
            </span>
          </div>
        </div>
      )}
    </BottomSheet>
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
      <span className="text-[13px] text-zinc-600">{label}</span>
      <span
        className={`text-[14px] font-semibold tabular-nums ${
          tone === "warn" ? "text-rose-600" : "text-zinc-900"
        }`}
      >
        {value < 0 ? "−" : ""}₩{Math.abs(value).toLocaleString("ko-KR")}
      </span>
    </div>
  );
}
