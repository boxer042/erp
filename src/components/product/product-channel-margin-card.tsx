"use client";

import {
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
} from "@/jm";
import { ProductSection } from "./product-section";
import type { ProductDetail } from "./types";
import { fmtPrice } from "./helpers";

interface Props {
  product: ProductDetail;
}

export function ProductChannelMarginCard({ product }: Props) {
  const rows = product.estimatedMarginByChannel ?? [];
  if (product.productType !== "ASSEMBLED" || rows.length === 0) return null;
  if (product.estimatedUnitCost === null || product.estimatedUnitCost === undefined)
    return null;

  const cost = Number(product.estimatedUnitCost);

  return (
    <ProductSection
      title="채널별 예상 마진"
      description="채널 가격 × 채널 수수료 + 전사 공통 판매비용 반영"
      noPadding
    >
      <JmTable className="min-w-[640px]">
        <JmTableHeader>
          <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
              채널
            </JmTableHead>
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
              판매가
            </JmTableHead>
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
              예상 원가
            </JmTableHead>
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
              채널 수수료
            </JmTableHead>
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
              마진
            </JmTableHead>
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
              마진율
            </JmTableHead>
          </JmTableRow>
        </JmTableHeader>
        <JmTableBody>
          {rows.map((r) => {
            const negative = r.estimatedMargin < 0;
            return (
              <JmTableRow key={r.channelId}>
                <JmTableCell className="px-3 py-2">
                  <div className="flex flex-col">
                    <span className="text-[var(--jm-text)]">{r.channelName}</span>
                    <span className="text-jm-xs text-[var(--jm-text-muted)]">
                      {r.channelCode}
                    </span>
                  </div>
                </JmTableCell>
                <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
                  ₩{fmtPrice(Math.round(r.channelSellingPrice))}
                </JmTableCell>
                <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text-muted)]">
                  ₩{fmtPrice(Math.round(cost))}
                </JmTableCell>
                <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text-muted)]">
                  ₩{fmtPrice(Math.round(r.channelFeeTotal))}
                </JmTableCell>
                <JmTableCell
                  className={`px-3 py-2 text-right tabular-nums font-semibold ${
                    negative
                      ? "text-[var(--jm-danger-fg)]"
                      : "text-[var(--jm-success-fg)]"
                  }`}
                >
                  ₩{fmtPrice(Math.round(r.estimatedMargin))}
                </JmTableCell>
                <JmTableCell
                  className={`px-3 py-2 text-right tabular-nums ${
                    negative
                      ? "text-[var(--jm-danger-fg)]"
                      : "text-[var(--jm-success-fg)]"
                  }`}
                >
                  {r.estimatedMarginRate !== null
                    ? `${r.estimatedMarginRate.toFixed(1)}%`
                    : "-"}
                </JmTableCell>
              </JmTableRow>
            );
          })}
        </JmTableBody>
      </JmTable>
    </ProductSection>
  );
}
