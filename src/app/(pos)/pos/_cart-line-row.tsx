"use client";

import { useState } from "react";
import { useSessions, type CartItem } from "@/components/pos/sessions-context";
import { PriceInputDialog } from "./_components/price-input-dialog";

interface Props {
  item: CartItem;
  sessionId: string;
  /** 표시 모드 — net=세전, gross=VAT 포함 (하단 합계 카드에서 토글) */
  display?: "net" | "gross";
}

/**
 * 카트 라인 행 — 모바일 친화 큰 ± 버튼, 단가 클릭으로 가격 다이얼로그.
 * shadcn 0개. 상품/임대/수리 라인 모두 처리 가능 (itemType 별 사소한 분기).
 */
export function CartLineRow({ item, sessionId, display = "gross" }: Props) {
  const { remove, updateQty, updateUnitPrice } = useSessions();
  const [priceOpen, setPriceOpen] = useState(false);

  const isBulk = !!item.isBulk;
  const taxType = item.taxType ?? "TAXABLE";
  const taxApplies = taxType === "TAXABLE" && !item.isZeroRate;

  const unitNet = item.unitPrice;
  const unitGross = taxApplies ? Math.round(unitNet * 1.1) : unitNet;
  const unitDisplay = display === "net" ? unitNet : unitGross;

  const lineNet = unitNet * item.quantity;
  const lineGross = taxApplies ? Math.round(lineNet * 1.1) : lineNet;
  const lineDisplay = display === "net" ? lineNet : lineGross;

  const setQty = (next: number) => {
    const min = isBulk ? 0.0001 : 1;
    updateQty(item.cartItemId, Math.max(min, next), sessionId);
  };

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-zinc-50 px-4 py-3 last:border-b-0">
        {/* 1행: 이미지 + 이름 + 삭제 */}
        <div className="flex items-start gap-3">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt={item.name}
              className="size-12 shrink-0 rounded-xl bg-zinc-100 object-cover"
            />
          ) : (
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
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
            <span className="line-clamp-1 text-[14px] font-semibold text-zinc-900">
              {item.name}
            </span>
            {item.sku && (
              <span className="font-mono text-[11px] text-zinc-400">
                {item.sku}
              </span>
            )}
            {!taxApplies && (
              <span className="mt-0.5 inline-flex w-fit items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                {taxType === "TAX_FREE" ? "면세" : "영세율"}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => remove(item.cartItemId, sessionId)}
            className="shrink-0 text-zinc-300 hover:text-rose-600"
            aria-label="삭제"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path
                d="M5 6h10M8 6V4h4v2M7 6v10h6V6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* 2행: 단가 (클릭 가능) + 수량 ± + 라인 합계 */}
        <div className="flex items-center justify-between gap-2">
          {/* 단가 클릭 → 가격 다이얼로그 */}
          <button
            type="button"
            onClick={() => setPriceOpen(true)}
            className="flex flex-col items-start rounded-lg px-2 py-1 text-left hover:bg-zinc-50 active:bg-zinc-100"
          >
            <span className="text-[10px] uppercase tracking-wider text-zinc-400">
              단가 {display === "net" ? "(세전)" : "(VAT 포함)"}
            </span>
            <span className="text-[15px] font-semibold tabular-nums text-zinc-900">
              ₩{unitDisplay.toLocaleString("ko-KR")}
            </span>
          </button>

          {/* 수량 ± */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setQty(item.quantity - (isBulk ? 0.5 : 1))}
              disabled={item.quantity <= (isBulk ? 0.0001 : 1)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-[18px] font-semibold text-zinc-700 hover:bg-zinc-200 disabled:opacity-30"
            >
              −
            </button>
            <span className="min-w-[40px] text-center text-[15px] font-semibold tabular-nums text-zinc-900">
              {isBulk ? item.quantity : Math.round(item.quantity)}
            </span>
            <button
              type="button"
              onClick={() => setQty(item.quantity + (isBulk ? 0.5 : 1))}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-[18px] font-semibold text-zinc-700 hover:bg-zinc-200"
            >
              +
            </button>
          </div>

          {/* 라인 합계 */}
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-zinc-400">
              합계
            </div>
            <div className="text-[15px] font-bold tabular-nums text-zinc-900">
              ₩{lineDisplay.toLocaleString("ko-KR")}
            </div>
          </div>
        </div>
      </div>

      {/* 가격 다이얼로그 */}
      <PriceInputDialog
        open={priceOpen}
        onOpenChange={setPriceOpen}
        title={item.name}
        initialNet={unitNet}
        taxType={taxType}
        isZeroRate={item.isZeroRate}
        onSubmit={(net) => updateUnitPrice(item.cartItemId, net, sessionId)}
      />
    </>
  );
}
