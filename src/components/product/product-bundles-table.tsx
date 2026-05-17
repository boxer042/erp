import {
  JmBadge,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
} from "@/jm";
import type { BundleProductItem } from "./types";

interface Props {
  bundles: BundleProductItem[];
}

/**
 * 추가구매 추천 표시 — 메인 상품 페이지에 함께 노출되는 단독 카탈로그 상품들.
 * 편집은 별도 Sheet.
 */
export function ProductBundlesTable({ bundles }: Props) {
  if (bundles.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-jm-sm text-[var(--jm-text-muted)]">
        등록된 추가구매가 없습니다 — 함께 사면 좋은 단독 상품을 추천으로 등록해보세요
      </div>
    );
  }

  return (
    <JmTable>
      <JmTableHeader>
        <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
            추천 상품
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-[120px]">
            SKU
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-[80px] text-right">
            기본 수량
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-[110px] text-right">
            정가
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-[110px] text-right">
            번들 할인
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-[110px] text-right">
            최종가
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
            추천 카피
          </JmTableHead>
        </JmTableRow>
      </JmTableHeader>
      <JmTableBody>
        {bundles.map((b) => {
          const sellingPrice = Number(b.bundleProduct.sellingPrice ?? 0);
          const discount = Number(b.discountAmount ?? 0);
          const finalPrice = Math.max(0, sellingPrice - discount);
          return (
            <JmTableRow key={b.id}>
              <JmTableCell className="px-3 py-2 text-jm-sm">
                <span className="font-medium text-[var(--jm-text)]">
                  {b.bundleProduct.name}
                </span>
              </JmTableCell>
              <JmTableCell className="px-3 py-2 font-[family-name:var(--jm-font-mono)] text-jm-xs text-[var(--jm-text-muted)]">
                {b.bundleProduct.sku}
              </JmTableCell>
              <JmTableCell className="px-3 py-2 text-jm-sm tabular-nums text-right text-[var(--jm-text)]">
                {Number(b.defaultQuantity).toLocaleString("ko-KR")}
              </JmTableCell>
              <JmTableCell className="px-3 py-2 text-jm-sm tabular-nums text-right text-[var(--jm-text)]">
                ₩{sellingPrice.toLocaleString("ko-KR")}
              </JmTableCell>
              <JmTableCell className="px-3 py-2 text-jm-sm tabular-nums text-right">
                {discount > 0 ? (
                  <JmBadge variant="default" size="sm" shape="square" className="text-jm-2xs">
                    −₩{discount.toLocaleString("ko-KR")}
                  </JmBadge>
                ) : (
                  <span className="text-[var(--jm-text-muted)]">—</span>
                )}
              </JmTableCell>
              <JmTableCell className="px-3 py-2 text-jm-sm tabular-nums text-right font-semibold text-[var(--jm-text)]">
                ₩{finalPrice.toLocaleString("ko-KR")}
              </JmTableCell>
              <JmTableCell className="px-3 py-2 text-jm-xs text-[var(--jm-text-muted)]">
                {b.recommendMessage ?? "—"}
              </JmTableCell>
            </JmTableRow>
          );
        })}
      </JmTableBody>
    </JmTable>
  );
}
