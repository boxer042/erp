"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProductSection } from "./product-section";
import type { ProductDetail } from "./types";
import { fmtPrice } from "./helpers";

interface Props {
  product: ProductDetail;
}

export function ProductChannelMarginCard({ product }: Props) {
  const rows = product.estimatedMarginByChannel ?? [];
  if (product.productType !== "ASSEMBLED" || rows.length === 0) return null;
  if (product.estimatedUnitCost === null || product.estimatedUnitCost === undefined) return null;

  const cost = Number(product.estimatedUnitCost);

  return (
    <ProductSection
      title="채널별 예상 마진"
      description="채널 가격 × 채널 수수료 + 전사 공통 판매비용 반영"
      noPadding
    >
      <Table className="min-w-[640px]">
        <TableHeader>
          <TableRow>
            <TableHead className="h-9 px-3 text-xs">채널</TableHead>
            <TableHead className="h-9 px-3 text-xs text-right">판매가</TableHead>
            <TableHead className="h-9 px-3 text-xs text-right">예상 원가</TableHead>
            <TableHead className="h-9 px-3 text-xs text-right">채널 수수료</TableHead>
            <TableHead className="h-9 px-3 text-xs text-right">마진</TableHead>
            <TableHead className="h-9 px-3 text-xs text-right">마진율</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const negative = r.estimatedMargin < 0;
            return (
              <TableRow key={r.channelId}>
                <TableCell className="px-3 py-2.5">
                  <div className="flex flex-col">
                    <span>{r.channelName}</span>
                    <span className="text-xs text-muted-foreground">{r.channelCode}</span>
                  </div>
                </TableCell>
                <TableCell className="px-3 py-2.5 text-right tabular-nums">
                  ₩{fmtPrice(Math.round(r.channelSellingPrice))}
                </TableCell>
                <TableCell className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  ₩{fmtPrice(Math.round(cost))}
                </TableCell>
                <TableCell className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  ₩{fmtPrice(Math.round(r.channelFeeTotal))}
                </TableCell>
                <TableCell
                  className={`px-3 py-2.5 text-right tabular-nums font-semibold ${
                    negative ? "text-destructive" : "text-green-600"
                  }`}
                >
                  ₩{fmtPrice(Math.round(r.estimatedMargin))}
                </TableCell>
                <TableCell
                  className={`px-3 py-2.5 text-right tabular-nums ${
                    negative ? "text-destructive" : "text-green-600"
                  }`}
                >
                  {r.estimatedMarginRate !== null
                    ? `${r.estimatedMarginRate.toFixed(1)}%`
                    : "-"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </ProductSection>
  );
}
