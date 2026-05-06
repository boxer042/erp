"use client";

import { useState } from "react";
import { useSessions, type CartItem } from "@/components/pos/sessions-context";
import { PriceInputDialog } from "./_components/price-input-dialog";
import { VariantSelectSheet } from "./_variant-select-sheet";

interface Props {
  item: CartItem;
  sessionId: string;
  /** 표시 모드 — net=세전, gross=VAT 포함 (하단 합계 카드에서 토글) */
  display?: "net" | "gross";
}

/**
 * 카트 라인 행 — 모바일 친화 큰 ± 버튼, 단가 클릭으로 가격 다이얼로그.
 * shadcn 0개. 상품/임대/수리 라인 모두 처리 가능 (itemType 별 사소한 분기).
 *
 * 변형 상품 (isCanonical=true) 라인은 결제 전 variant 확정 필수.
 * 우측에 "변형 선택" 노란 배지 — 클릭 시 VariantSelectSheet 열림.
 */
export function CartLineRow({ item, sessionId, display = "gross" }: Props) {
  const { remove, updateQty, updateUnitPrice, assignVariant, toggleZeroRate } = useSessions();
  const [priceOpen, setPriceOpen] = useState(false);
  const [variantOpen, setVariantOpen] = useState(false);

  const isBulk = !!item.isBulk;
  const taxType = item.taxType ?? "TAXABLE";
  const taxApplies = taxType === "TAXABLE" && !item.isZeroRate;

  const unitNet = item.unitPrice;
  const unitGross = taxApplies ? Math.round(unitNet * 1.1) : unitNet;
  const unitDisplay = display === "net" ? unitNet : unitGross;

  const lineNet = unitNet * item.quantity;
  const lineGross = taxApplies ? Math.round(lineNet * 1.1) : lineNet;
  const lineDisplay = display === "net" ? lineNet : lineGross;

  // 정가 비교 — listPrice 있고 현재 단가와 다를 때만 표시
  const listNet = item.listPrice && item.listPrice > 0 ? item.listPrice : null;
  const showListDiff = listNet !== null && listNet !== unitNet;
  const listDiff = showListDiff ? unitNet - (listNet as number) : 0;
  const listDiffPercent = showListDiff && listNet
    ? Math.round(((unitNet - listNet) / listNet) * 1000) / 10
    : 0;
  const listDisplay =
    showListDiff && listNet !== null
      ? display === "net"
        ? listNet
        : taxApplies
          ? Math.round(listNet * 1.1)
          : listNet
      : 0;

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
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              {taxType === "TAX_FREE" && (
                <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                  면세
                </span>
              )}
              {/* 영세율 토글 — zeroRateEligible 상품만 노출 */}
              {item.zeroRateEligible && (
                <button
                  type="button"
                  onClick={() => toggleZeroRate(item.cartItemId, sessionId)}
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    item.isZeroRate
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  영세율 {item.isZeroRate ? "ON" : "OFF"}
                </button>
              )}
              {item.isCanonical && item.productId && (
                <button
                  type="button"
                  onClick={() => setVariantOpen(true)}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 hover:bg-amber-200"
                >
                  <span>⚠</span>
                  <span>변형 선택</span>
                </button>
              )}
            </div>
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
            <div className="flex items-baseline gap-1.5">
              {showListDiff && (
                <span className="text-[11px] tabular-nums text-zinc-400 line-through">
                  ₩{listDisplay.toLocaleString("ko-KR")}
                </span>
              )}
              <span className="text-[15px] font-semibold tabular-nums text-zinc-900">
                ₩{unitDisplay.toLocaleString("ko-KR")}
              </span>
            </div>
            {showListDiff && (
              <span
                className={`text-[10px] font-semibold tabular-nums ${
                  listDiff < 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {listDiff < 0
                  ? `−₩${Math.abs(listDiff).toLocaleString("ko-KR")} (${Math.abs(listDiffPercent).toFixed(1)}% 할인)`
                  : `+₩${listDiff.toLocaleString("ko-KR")} (${listDiffPercent.toFixed(1)}% 인상)`}
              </span>
            )}
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
        originalPrice={item.listPrice}
        onSubmit={(net) => updateUnitPrice(item.cartItemId, net, sessionId)}
      />

      {/* 변형 선택 시트 — isCanonical 라인만 */}
      {item.isCanonical && item.productId && (
        <VariantSelectSheet
          open={variantOpen}
          onOpenChange={setVariantOpen}
          canonicalProductId={item.productId}
          onSelect={(v) =>
            assignVariant(
              item.cartItemId,
              { productId: v.id, name: v.name, sku: v.sku, unitPrice: v.unitPrice },
              sessionId,
            )
          }
        />
      )}
    </>
  );
}
