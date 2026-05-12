"use client";

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
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" />
            <path
              d="M7 6v3.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <circle cx="7" cy="3.8" r="0.7" fill="currentColor" />
          </svg>
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
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 7l9-4 9 4v10l-9 4-9-4V7zM12 3v18M3 7l9 5 9-5"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
        {/* 면세/영세율 배지 */}
        {(taxFree || product.zeroRateEligible) && (
          <span className="absolute left-2 top-2 inline-flex items-center rounded-full bg-[var(--jm-surface)]/95 px-2 py-0.5 text-[10px] font-medium text-[var(--jm-text)] backdrop-blur">
            {taxFree ? "면세" : "영세"}
          </span>
        )}
      </div>

      {/* 본문 */}
      <div className="flex flex-1 flex-col gap-0.5 p-2.5 sm:p-3">
        {/* 상품명 + 규격 — 한 묶음. 같은 상품명은 규격으로 구분. */}
        <span className="line-clamp-2 text-[12px] font-semibold leading-tight text-[var(--jm-text)] sm:text-[13px]">
          {product.name}
        </span>
        {product.spec && (
          <span className="line-clamp-1 text-[11px] font-medium text-[var(--jm-text)]">
            {product.spec}
          </span>
        )}
        <span className="mt-auto pt-1 font-mono text-[10px] text-[var(--jm-text-subtle)]">
          {product.sku}
        </span>
        <span className="text-[14px] font-bold tabular-nums text-[var(--jm-text)] sm:text-[15px]">
          {autoNoPrice ? (
            <span className="text-[12px] font-semibold text-[var(--jm-warning-fg)]">
              담당자 문의
            </span>
          ) : (
            <>
              ₩{displayPrice.toLocaleString("ko-KR")}
              {isOptionParent && (
                <span className="ml-0.5 text-[var(--jm-text-muted)]">~</span>
              )}
              {!taxFree && (
                <span className="ml-1 text-[10px] font-normal text-[var(--jm-text-subtle)]">
                  VAT 포함
                </span>
              )}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
