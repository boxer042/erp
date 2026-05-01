"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  incomingCostList?: Array<{ name: string; costType: string; value: number; isTaxable: boolean }>;
}

interface Props {
  rows: ComponentIncomingInfoRow[];
}

/**
 * 조립/세트 상품의 구성품별 "입고 배송비" + "입고 부대비용" 정보 섹션 두 개.
 * - 분해표와 별도로 사용자가 어디서 비용이 오는지 한눈에 보기 위함
 * - 데이터는 estimatedCostBreakdown 의 supplier 정보에서 끌어옴
 */
export function ComponentIncomingInfoSections({ rows }: Props) {
  if (rows.length === 0) return null;

  // 섹션은 항상 노출, 안의 행은 실제 비용이 발생한 것만
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
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead className="h-9 px-3 text-xs w-28">슬롯</TableHead>
              <TableHead className="h-9 px-3 text-xs">구성품</TableHead>
              <TableHead className="h-9 px-3 text-xs">거래처상품</TableHead>
              <TableHead className="h-9 px-3 text-xs text-right">평균 배송비 (개당)</TableHead>
              <TableHead className="h-9 px-3 text-xs text-right">수량</TableHead>
              <TableHead className="h-9 px-3 text-xs text-right">소계</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shippingRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-sm">
                  발생한 배송비가 없습니다
                </TableCell>
              </TableRow>
            )}
            {shippingRows.map((r, idx) => {
              const ship = Number(r.shippingPerUnit ?? 0);
              const subtotal = ship * r.quantity;
              return (
                <TableRow key={`${r.componentId}-${r.label ?? ""}-${idx}`}>
                  <TableCell className="px-3 py-2.5 text-xs text-muted-foreground">
                    {r.label?.trim() ? r.label : "-"}
                  </TableCell>
                  <TableCell className="px-3 py-2.5">
                    <div className="flex flex-col">
                      <span>{r.componentName}</span>
                      <span className="text-xs text-muted-foreground">{r.componentSku}</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-xs">
                    {r.supplierName && r.supplierProductName ? (
                      <div className="flex flex-col">
                        <span>{r.supplierProductName}</span>
                        <span className="text-muted-foreground">{r.supplierName}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">매핑 없음</span>
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-right tabular-nums">
                    {ship > 0 ? `₩${fmtPrice(Math.round(ship))}` : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-right tabular-nums">
                    {r.quantity.toLocaleString("ko-KR")}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-right tabular-nums">
                    {subtotal > 0 ? `₩${fmtPrice(Math.round(subtotal))}` : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ProductSection>

      <ProductSection
          title="구성품 입고 부대비용"
          description="구성품마다 매핑된 거래처상품에 등록된 부대비용"
          noPadding
        >
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead className="h-9 px-3 text-xs w-28">슬롯</TableHead>
              <TableHead className="h-9 px-3 text-xs">구성품</TableHead>
              <TableHead className="h-9 px-3 text-xs">거래처상품</TableHead>
              <TableHead className="h-9 px-3 text-xs">부대비용 항목</TableHead>
              <TableHead className="h-9 px-3 text-xs text-right">개당 합 (세전)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {incomingCostRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-sm">
                  발생한 부대비용이 없습니다
                </TableCell>
              </TableRow>
            )}
            {incomingCostRows.map((r, idx) => {
              const list = r.incomingCostList ?? [];
              return (
                <TableRow key={`${r.componentId}-${r.label ?? ""}-${idx}`}>
                  <TableCell className="px-3 py-2.5 text-xs text-muted-foreground">
                    {r.label?.trim() ? r.label : "-"}
                  </TableCell>
                  <TableCell className="px-3 py-2.5">
                    <div className="flex flex-col">
                      <span>{r.componentName}</span>
                      <span className="text-xs text-muted-foreground">{r.componentSku}</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-xs">
                    {r.supplierName && r.supplierProductName ? (
                      <div className="flex flex-col">
                        <span>{r.supplierProductName}</span>
                        <span className="text-muted-foreground">{r.supplierName}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">매핑 없음</span>
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-xs">
                    {list.length === 0 ? (
                      <span className="text-muted-foreground">없음</span>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {list.map((c, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-[10px]">
                              {c.costType === "FIXED" ? "고정" : "%"}
                            </Badge>
                            <span>{c.name || "(이름 없음)"}</span>
                            <span className="text-muted-foreground">
                              {c.costType === "FIXED"
                                ? `₩${fmtPrice(c.value)}`
                                : `${c.value}%`}
                            </span>
                            {!c.isTaxable && (
                              <Badge variant="secondary" className="text-[10px]">면세</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-right tabular-nums">
                    {(r.incomingCostPerUnit ?? 0) > 0
                      ? `₩${fmtPrice(Math.round(r.incomingCostPerUnit ?? 0))}`
                      : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ProductSection>
    </>
  );
}
