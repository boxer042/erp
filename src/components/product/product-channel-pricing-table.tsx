import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Info } from "lucide-react";
import { computeCostSum, fmtPrice, summarizeCosts, toVatPrice } from "./helpers";
import { ProductSellingCostsTable } from "./product-selling-costs-table";
import type { ChannelPricingItem, SellingCostItem } from "./types";

interface ProductChannelPricingTableProps {
  taxType: string;
  baseCost: number;
  globalCostTotal: number;
  pricings: ChannelPricingItem[];
  costsByChannel: Record<string, SellingCostItem[]>;
}

export function ProductChannelPricingTable({
  taxType,
  baseCost,
  globalCostTotal,
  pricings,
  costsByChannel,
}: ProductChannelPricingTableProps) {
  if (pricings.length === 0) {
    return (
      <p className="text-center py-8 text-muted-foreground text-sm">
        채널별 가격이 설정되지 않았습니다
      </p>
    );
  }

  return (
    <Table className="min-w-[820px]">
      <TableHeader>
        <TableRow>
          <TableHead className="h-9 px-3 text-xs">채널</TableHead>
          <TableHead className="h-9 px-3 text-xs text-right">판매가 (VAT 포함)</TableHead>
          <TableHead className="h-9 px-3 text-xs">채널 비용 요약</TableHead>
          <TableHead className="h-9 px-3 text-xs text-right">예상 마진 (세전)</TableHead>
          <TableHead className="h-9 px-3 w-10"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pricings.map((cp) => {
          const chCosts = costsByChannel[cp.channelId] ?? [];
          const chPrice = parseFloat(cp.sellingPrice);
          const chCostSum = computeCostSum(chCosts, chPrice);
          const totalCostSum = globalCostTotal + chCostSum;
          const margin = chPrice - baseCost - totalCostSum;
          return (
            <TableRow key={cp.id}>
              <TableCell className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{cp.channel.name}</span>
                  <Badge variant="outline" className="text-[10px]">{cp.channel.code}</Badge>
                </div>
              </TableCell>
              <TableCell className="px-3 py-2.5 text-right tabular-nums font-medium">
                ₩{fmtPrice(toVatPrice(cp.sellingPrice, taxType))}
              </TableCell>
              <TableCell className="px-3 py-2.5 text-xs text-muted-foreground">
                {summarizeCosts(chCosts)}
              </TableCell>
              <TableCell
                className={`px-3 py-2.5 text-right tabular-nums font-medium ${
                  margin < 0 ? "text-destructive" : "text-green-600"
                }`}
              >
                ₩{fmtPrice(margin)}
              </TableCell>
              <TableCell className="px-3 py-2.5">
                {chCosts.length > 0 && (
                  <Popover>
                    <PopoverTrigger
                      aria-label="채널 비용 상세"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-[460px] p-3">
                      <div className="text-xs text-muted-foreground mb-2">
                        {cp.channel.name} 채널 전용 비용
                      </div>
                      <ProductSellingCostsTable costs={chCosts} compact />
                    </PopoverContent>
                  </Popover>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
