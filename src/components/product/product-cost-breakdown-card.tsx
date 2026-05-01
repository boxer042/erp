"use client";

import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProductSection } from "./product-section";
import type { ProductDetail } from "./types";
import { fmtPrice } from "./helpers";

const SOURCE_LABEL: Record<string, { label: string; tone: "default" | "secondary" | "destructive" }> = {
  LOT: { label: "재고 평균", tone: "default" },
  SUPPLIER: { label: "매입 단가", tone: "secondary" },
  BULK_PARENT: { label: "벌크 부모", tone: "secondary" },
  NONE: { label: "미설정", tone: "destructive" },
};

interface Props {
  product: ProductDetail;
  onEdit?: () => void;
}

export function ProductCostBreakdownCard({ product, onEdit }: Props) {
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
        onEdit ? (
          <Button size="sm" variant="outline" className="h-7" onClick={onEdit}>
            <Pencil className="h-3 w-3 mr-1" />편집
          </Button>
        ) : undefined
      }
    >
      <Table className="min-w-[920px]">
        <TableHeader>
          <TableRow>
            <TableHead className="h-9 px-3 text-xs w-28">슬롯</TableHead>
            <TableHead className="h-9 px-3 text-xs">구성품</TableHead>
            <TableHead className="h-9 px-3 text-xs text-right w-16">수량</TableHead>
            <TableHead className="h-9 px-3 text-xs text-right">공급단가</TableHead>
            <TableHead className="h-9 px-3 text-xs text-right">배송비</TableHead>
            <TableHead className="h-9 px-3 text-xs text-right">부대비용</TableHead>
            <TableHead className="h-9 px-3 text-xs text-right">단가 합</TableHead>
            <TableHead className="h-9 px-3 text-xs text-right">소계</TableHead>
            <TableHead className="h-9 px-3 text-xs text-center w-20">출처</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
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
                    <TableRow key={`${b.componentId}-${b.label ?? ""}-${idx}`}>
                      <TableCell className="px-3 py-2.5 text-xs text-muted-foreground">
                        {b.label?.trim() ? b.label : "-"}
                      </TableCell>
                      <TableCell className="px-3 py-2.5">
                        <div className="flex flex-col">
                          <span>{b.componentName}</span>
                          <span className="text-xs text-muted-foreground">{b.componentSku}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-right tabular-nums">
                        {b.quantity.toLocaleString("ko-KR")}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-right tabular-nums">
                        ₩{fmtPrice(Math.round(b.supplierUnitPrice ?? 0))}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {(b.shippingPerUnit ?? 0) > 0
                          ? `₩${fmtPrice(Math.round(b.shippingPerUnit ?? 0))}`
                          : "-"}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {(b.incomingCostPerUnit ?? 0) > 0
                          ? `₩${fmtPrice(Math.round(b.incomingCostPerUnit ?? 0))}`
                          : "-"}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-right tabular-nums">
                        ₩{fmtPrice(Math.round(b.unitCost))}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-right tabular-nums">
                        <div className="flex flex-col items-end">
                          <span className={b.costSource === "NONE" ? "text-destructive" : ""}>
                            ₩{fmtPrice(Math.round(b.subtotal))}
                          </span>
                          {total > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              {ratio.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-center">
                        <Badge variant={src.tone === "default" ? "default" : src.tone === "destructive" ? "destructive" : "secondary"}>
                          {src.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="bg-muted/30">
                  <TableCell className="px-3 py-2.5 font-semibold" colSpan={3}>
                    구성품 합계
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-right tabular-nums">
                    ₩{fmtPrice(Math.round(sumSupplier))}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-right tabular-nums">
                    ₩{fmtPrice(Math.round(sumShipping))}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-right tabular-nums">
                    ₩{fmtPrice(Math.round(sumIncoming))}
                  </TableCell>
                  <TableCell />
                  <TableCell className="px-3 py-2.5 text-right tabular-nums font-semibold">
                    ₩{fmtPrice(Math.round(total))}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </>
            );
          })()}
        </TableBody>
      </Table>
    </ProductSection>
  );
}
