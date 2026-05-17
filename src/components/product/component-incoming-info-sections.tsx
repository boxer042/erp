"use client";

import {
  JmBadge,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
} from "@/jm";
import { ProductSection } from "./product-section";
import { fmtPrice } from "./helpers";

export interface ComponentIncomingInfoRow {
  componentId: string;
  componentName: string;
  componentSku: string;
  label?: string | null;
  quantity: number;
  shippingPerUnit?: number;
  incomingCostPerUnit?: number;
  supplierName?: string | null;
  supplierProductName?: string | null;
  incomingCostList?: Array<{
    name: string;
    costType: string;
    value: number;
    isTaxable: boolean;
  }>;
}

interface Props {
  rows: ComponentIncomingInfoRow[];
}

/**
 * 조립/세트 상품의 구성품별 "입고 배송비" + "입고 부대비용" 정보 섹션 두 개.
 */
export function ComponentIncomingInfoSections({ rows }: Props) {
  if (rows.length === 0) return null;

  const shippingRows = rows.filter((r) => Number(r.shippingPerUnit ?? 0) > 0);
  const incomingCostRows = rows.filter(
    (r) => (r.incomingCostList?.length ?? 0) > 0 || Number(r.incomingCostPerUnit ?? 0) > 0,
  );

  return (
    <>
      <ProductSection
        title="구성품 입고 배송비"
        description="구성품마다 매핑된 거래처상품의 과거 입고 평균 배송비"
        noPadding
      >
        <JmTable className="min-w-[640px]">
          <JmTableHeader>
            <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
              <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-28">
                슬롯
              </JmTableHead>
              <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
                구성품
              </JmTableHead>
              <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
                거래처상품
              </JmTableHead>
              <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
                평균 배송비 (개당)
              </JmTableHead>
              <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
                수량
              </JmTableHead>
              <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
                소계
              </JmTableHead>
            </JmTableRow>
          </JmTableHeader>
          <JmTableBody>
            {shippingRows.length === 0 && (
              <JmTableRow className="hover:bg-transparent">
                <JmTableCell
                  colSpan={6}
                  className="text-center py-6 text-[var(--jm-text-muted)] text-jm-sm"
                >
                  발생한 배송비가 없습니다
                </JmTableCell>
              </JmTableRow>
            )}
            {shippingRows.map((r, idx) => {
              const ship = Number(r.shippingPerUnit ?? 0);
              const subtotal = ship * r.quantity;
              return (
                <JmTableRow key={`${r.componentId}-${r.label ?? ""}-${idx}`}>
                  <JmTableCell className="px-3 py-2 text-jm-xs text-[var(--jm-text-muted)]">
                    {r.label?.trim() ? r.label : "-"}
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2">
                    <div className="flex flex-col">
                      <span className="text-[var(--jm-text)]">{r.componentName}</span>
                      <span className="text-jm-xs text-[var(--jm-text-muted)]">
                        {r.componentSku}
                      </span>
                    </div>
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2 text-jm-xs">
                    {r.supplierName && r.supplierProductName ? (
                      <div className="flex flex-col">
                        <span className="text-[var(--jm-text)]">{r.supplierProductName}</span>
                        <span className="text-[var(--jm-text-muted)]">{r.supplierName}</span>
                      </div>
                    ) : (
                      <span className="text-[var(--jm-text-muted)]">매핑 없음</span>
                    )}
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
                    {ship > 0 ? (
                      `₩${fmtPrice(Math.round(ship))}`
                    ) : (
                      <span className="text-[var(--jm-text-muted)]">-</span>
                    )}
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
                    {r.quantity.toLocaleString("ko-KR")}
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
                    {subtotal > 0 ? (
                      `₩${fmtPrice(Math.round(subtotal))}`
                    ) : (
                      <span className="text-[var(--jm-text-muted)]">-</span>
                    )}
                  </JmTableCell>
                </JmTableRow>
              );
            })}
          </JmTableBody>
        </JmTable>
      </ProductSection>

      <ProductSection
        title="구성품 입고 부대비용"
        description="구성품마다 매핑된 거래처상품에 등록된 부대비용"
        noPadding
      >
        <JmTable className="min-w-[640px]">
          <JmTableHeader>
            <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
              <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-28">
                슬롯
              </JmTableHead>
              <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
                구성품
              </JmTableHead>
              <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
                거래처상품
              </JmTableHead>
              <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
                부대비용 항목
              </JmTableHead>
              <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
                개당 합 (세전)
              </JmTableHead>
            </JmTableRow>
          </JmTableHeader>
          <JmTableBody>
            {incomingCostRows.length === 0 && (
              <JmTableRow className="hover:bg-transparent">
                <JmTableCell
                  colSpan={5}
                  className="text-center py-6 text-[var(--jm-text-muted)] text-jm-sm"
                >
                  발생한 부대비용이 없습니다
                </JmTableCell>
              </JmTableRow>
            )}
            {incomingCostRows.map((r, idx) => {
              const list = r.incomingCostList ?? [];
              return (
                <JmTableRow key={`${r.componentId}-${r.label ?? ""}-${idx}`}>
                  <JmTableCell className="px-3 py-2 text-jm-xs text-[var(--jm-text-muted)]">
                    {r.label?.trim() ? r.label : "-"}
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2">
                    <div className="flex flex-col">
                      <span className="text-[var(--jm-text)]">{r.componentName}</span>
                      <span className="text-jm-xs text-[var(--jm-text-muted)]">
                        {r.componentSku}
                      </span>
                    </div>
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2 text-jm-xs">
                    {r.supplierName && r.supplierProductName ? (
                      <div className="flex flex-col">
                        <span className="text-[var(--jm-text)]">{r.supplierProductName}</span>
                        <span className="text-[var(--jm-text-muted)]">{r.supplierName}</span>
                      </div>
                    ) : (
                      <span className="text-[var(--jm-text-muted)]">매핑 없음</span>
                    )}
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2 text-jm-xs">
                    {list.length === 0 ? (
                      <span className="text-[var(--jm-text-muted)]">없음</span>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {list.map((c, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <JmBadge variant="outline" size="sm" shape="square" className="text-jm-2xs">
                              {c.costType === "FIXED" ? "고정" : "%"}
                            </JmBadge>
                            <span className="text-[var(--jm-text)]">
                              {c.name || "(이름 없음)"}
                            </span>
                            <span className="text-[var(--jm-text-muted)]">
                              {c.costType === "FIXED"
                                ? `₩${fmtPrice(c.value)}`
                                : `${c.value}%`}
                            </span>
                            {!c.isTaxable && (
                              <JmBadge variant="default" size="sm" shape="square" className="text-jm-2xs">
                                면세
                              </JmBadge>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
                    {(r.incomingCostPerUnit ?? 0) > 0 ? (
                      `₩${fmtPrice(Math.round(r.incomingCostPerUnit ?? 0))}`
                    ) : (
                      <span className="text-[var(--jm-text-muted)]">-</span>
                    )}
                  </JmTableCell>
                </JmTableRow>
              );
            })}
          </JmTableBody>
        </JmTable>
      </ProductSection>
    </>
  );
}
