"use client";

import { Pencil, Plus } from "lucide-react";
import {
  JmBadge,
  JmButton,
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

const SOURCE_LABEL: Record<
  string,
  { label: string; variant: "info" | "default" | "danger" }
> = {
  LOT: { label: "재고 평균", variant: "info" },
  SUPPLIER: { label: "매입 단가", variant: "default" },
  BULK_PARENT: { label: "벌크 부모", variant: "default" },
  NONE: { label: "미설정", variant: "danger" },
};

interface Props {
  product: ProductDetail;
  onEdit?: () => void;
  /** 조립실적 추가 진입 — ASSEMBLED 일 때만 노출 */
  onAddAssembly?: () => void;
}

export function ProductCostBreakdownCard({ product, onEdit, onAddAssembly }: Props) {
  const breakdown = product.estimatedCostBreakdown ?? [];
  const isComposite = product.productType === "ASSEMBLED" || product.isSet;
  if (!isComposite) return null;
  if (breakdown.length === 0) return null;

  const sorted = [...breakdown].sort((a, b) => b.subtotal - a.subtotal);
  const total = sorted.reduce((s, b) => s + b.subtotal, 0);

  return (
    <ProductSection
      title="구성품 · 예상 원가 분해"
      description={
        product.productType === "ASSEMBLED"
          ? "조립상품 구성 부품 · 단가 · 소계 (비용 큰 항목부터)"
          : "세트 상품 구성품 · 단가 · 소계"
      }
      noPadding
      actions={
        onEdit || onAddAssembly ? (
          <div className="flex gap-1.5">
            {onAddAssembly && (
              <JmButton size="sm" variant="cta" onClick={onAddAssembly}>
                <Plus />
                <span>조립실적 추가</span>
              </JmButton>
            )}
            {onEdit && (
              <JmButton size="sm" variant="outline" onClick={onEdit}>
                <Pencil />
                <span>편집</span>
              </JmButton>
            )}
          </div>
        ) : undefined
      }
    >
      <JmTable className="min-w-[920px]">
        <JmTableHeader>
          <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-28">
              슬롯
            </JmTableHead>
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
              구성품
            </JmTableHead>
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium w-16">
              수량
            </JmTableHead>
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
              공급단가
            </JmTableHead>
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
              배송비
            </JmTableHead>
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
              부대비용
            </JmTableHead>
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
              단가 합
            </JmTableHead>
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
              소계
            </JmTableHead>
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-center font-medium w-20">
              출처
            </JmTableHead>
          </JmTableRow>
        </JmTableHeader>
        <JmTableBody>
          {(() => {
            let sumSupplier = 0;
            let sumShipping = 0;
            let sumIncoming = 0;
            for (const b of sorted) {
              sumSupplier += (b.supplierUnitPrice ?? 0) * b.quantity;
              sumShipping += (b.shippingPerUnit ?? 0) * b.quantity;
              sumIncoming += (b.incomingCostPerUnit ?? 0) * b.quantity;
            }
            return (
              <>
                {sorted.map((b, idx) => {
                  const src = SOURCE_LABEL[b.costSource] ?? SOURCE_LABEL.NONE;
                  const ratio = total > 0 ? (b.subtotal / total) * 100 : 0;
                  return (
                    <JmTableRow key={`${b.componentId}-${b.label ?? ""}-${idx}`}>
                      <JmTableCell className="px-3 py-2 text-jm-xs text-[var(--jm-text-muted)]">
                        {b.label?.trim() ? b.label : "-"}
                      </JmTableCell>
                      <JmTableCell className="px-3 py-2">
                        <div className="flex flex-col">
                          <span className="text-[var(--jm-text)]">{b.componentName}</span>
                          <span className="text-jm-xs text-[var(--jm-text-muted)]">
                            {b.componentSku}
                          </span>
                        </div>
                      </JmTableCell>
                      <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
                        {b.quantity.toLocaleString("ko-KR")}
                      </JmTableCell>
                      <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
                        ₩{fmtPrice(Math.round(b.supplierUnitPrice ?? 0))}
                      </JmTableCell>
                      <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text-muted)]">
                        {(b.shippingPerUnit ?? 0) > 0
                          ? `₩${fmtPrice(Math.round(b.shippingPerUnit ?? 0))}`
                          : "-"}
                      </JmTableCell>
                      <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text-muted)]">
                        {(b.incomingCostPerUnit ?? 0) > 0
                          ? `₩${fmtPrice(Math.round(b.incomingCostPerUnit ?? 0))}`
                          : "-"}
                      </JmTableCell>
                      <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
                        ₩{fmtPrice(Math.round(b.unitCost))}
                      </JmTableCell>
                      <JmTableCell className="px-3 py-2 text-right tabular-nums">
                        <div className="flex flex-col items-end">
                          <span
                            className={
                              b.costSource === "NONE"
                                ? "text-[var(--jm-danger-fg)]"
                                : "text-[var(--jm-text)]"
                            }
                          >
                            ₩{fmtPrice(Math.round(b.subtotal))}
                          </span>
                          {total > 0 && (
                            <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                              {ratio.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </JmTableCell>
                      <JmTableCell className="px-3 py-2 text-center">
                        <JmBadge variant={src.variant} size="sm" shape="square">
                          {src.label}
                        </JmBadge>
                      </JmTableCell>
                    </JmTableRow>
                  );
                })}
                <JmTableRow className="bg-[var(--jm-surface-muted)]/30">
                  <JmTableCell
                    className="px-3 py-2 font-semibold text-[var(--jm-text)]"
                    colSpan={3}
                  >
                    구성품 합계
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
                    ₩{fmtPrice(Math.round(sumSupplier))}
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
                    ₩{fmtPrice(Math.round(sumShipping))}
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
                    ₩{fmtPrice(Math.round(sumIncoming))}
                  </JmTableCell>
                  <JmTableCell />
                  <JmTableCell className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--jm-text)]">
                    ₩{fmtPrice(Math.round(total))}
                  </JmTableCell>
                  <JmTableCell />
                </JmTableRow>
              </>
            );
          })()}
        </JmTableBody>
      </JmTable>
    </ProductSection>
  );
}
