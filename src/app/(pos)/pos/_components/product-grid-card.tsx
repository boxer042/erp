"use client";

import { Info, Package } from "lucide-react";
import type { ProductLite } from "@/app/(pos)/pos/_types";

interface Props {
  product: ProductLite;
  onClick: () => void;
  /** ℹ️ 상세 버튼 클릭 — 부모가 라우팅 처리 */
  onDetail?: () => void;
}

/**
 * v2 상품 그리드 카드 — 모바일/태블릿 최적화. shadcn 0개.
 * - 큰 이미지 + 이름 + 가격(VAT 포함, 고객 청구 기준)
 * - 카드 탭 = 카트 추가
 * - 우상단 ℹ️ 탭 = 상세 진입
 *
 * 외부 wrapper 는 div(role=button) 로 두고 안의 ℹ️ 만 button — nested button 회피.
 */
export function ProductGridCard({ product, onClick, onDetail }: Props) {
  const taxFree = product.taxType === "TAX_FREE";
  const autoNoPrice =
    product.autoMapped && (parseFloat(product.sellingPrice) || 0) === 0;
  const isOptionParent = product.productType === "OPTION_PARENT";

  // 카탈로그 표시는 VAT 포함 (POS 사장님이 고객에게 청구할 금액 기준).
  // OPTION_PARENT 는 자체 sellingPrice 가 0 placeholder 라 옵션 SWAP 최저가 사용.
  const sellingNet = isOptionParent
    ? Number(product.minOptionPrice ?? 0)
    : parseFloat(product.sellingPrice) || 0;
  const displayPrice = taxFree ? sellingNet : Math.round(sellingNet * 1.1);

  // 정가 비교 — 할인(정가보다 싸게)일 때만 표시. 인상은 손님과 함께 보는 화면이라 노출 안 함 (카트 라인과 동일 패턴).
  // OPTION_PARENT 는 minOptionPrice 가 표시 기준이라 정가 비교 의미 없음 → 미적용.
  const listNet = !isOptionParent && product.listPrice
    ? parseFloat(product.listPrice) || 0
    : 0;
  const showListDiff = listNet > 0 && sellingNet < listNet;
  const listDisplay = showListDiff ? (taxFree ? listNet : Math.round(listNet * 1.1)) : 0;
  const listDiff = showListDiff ? sellingNet - listNet : 0;
  const listDiffPercent = showListDiff && listNet
    ? Math.round(((sellingNet - listNet) / listNet) * 1000) / 10
    : 0;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onKey}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-[var(--jm-surface)] text-left border border-[var(--jm-border)] transition-all active:scale-[0.98] sm:hover:ring-[var(--jm-border-strong)]"
    >
      {/* ℹ️ 상세 버튼 — 우상단 */}
      {onDetail && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDetail();
          }}
          className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--jm-surface)]/95 text-[var(--jm-text)] shadow border border-[var(--jm-border)] backdrop-blur active:scale-95 sm:hover:bg-[var(--jm-surface)]"
          aria-label="상세 보기"
        >
          <Info className="size-[13px]" strokeWidth={1.5} />
        </button>
      )}

      {/* 이미지 */}
      <div className="relative aspect-square w-full overflow-hidden bg-[var(--jm-bg)]">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.name}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-[var(--jm-text-disabled)]">
            <Package className="size-10" strokeWidth={1} />
          </div>
        )}
        {/* 면세/영세율 배지 */}
        {(taxFree || product.zeroRateEligible) && (
          <span className="absolute left-2 top-2 inline-flex items-center rounded-full bg-[var(--jm-surface)]/95 px-2 py-0.5 text-jm-3xs font-medium text-[var(--jm-text)] backdrop-blur">
            {taxFree ? "면세" : "영세"}
          </span>
        )}
      </div>

      {/* 본문 */}
      <div className="flex flex-1 flex-col gap-0.5 p-2.5 sm:p-3">
        {/* 상품명 + 규격 — 한 묶음. 같은 상품명은 규격으로 구분. */}
        <span className="line-clamp-2 text-jm-xs font-semibold leading-tight text-[var(--jm-text)] sm:text-jm-sm">
          {product.name}
        </span>
        {product.spec && (
          <span className="line-clamp-1 text-jm-2xs font-medium text-[var(--jm-text)]">
            {product.spec}
          </span>
        )}
        <span className="mt-auto pt-1 font-mono text-jm-3xs text-[var(--jm-text-subtle)]">
          {product.sku}
        </span>
        {autoNoPrice ? (
          <span className="text-jm-xs font-semibold text-[var(--jm-warning-fg)]">
            담당자 문의
          </span>
        ) : (
          <div className="flex flex-col">
            <div className="flex items-baseline gap-1.5">
              {showListDiff && (
                <span className="text-jm-2xs tabular-nums text-[var(--jm-text-subtle)] line-through">
                  ₩{listDisplay.toLocaleString("ko-KR")}
                </span>
              )}
              <span className="text-jm-base font-bold tabular-nums text-[var(--jm-text)] sm:text-jm-md">
                ₩{displayPrice.toLocaleString("ko-KR")}
                {isOptionParent && (
                  <span className="ml-0.5 text-[var(--jm-text-muted)]">~</span>
                )}
              </span>
              {!taxFree && (
                <span className="text-jm-3xs font-normal text-[var(--jm-text-subtle)]">
                  VAT 포함
                </span>
              )}
            </div>
            {showListDiff && (
              <span className="text-jm-3xs font-semibold tabular-nums text-[var(--jm-success-fg)]">
                −₩{Math.abs(listDiff).toLocaleString("ko-KR")} ({Math.abs(listDiffPercent).toFixed(1)}% 할인)
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
