import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Info, Store } from "lucide-react";
import { computeCostSum, fmtPrice, summarizeCosts, toVatPrice } from "./helpers";
import { ProductSellingCostsTable } from "./product-selling-costs-table";
import { InlineTextEdit } from "./edit/inline-text-edit";
import type { ChannelPricingItem, SellingCostItem } from "./types";

interface ProductChannelPricingTableProps {
  taxType: string;
  baseCost: number;
  globalCostTotal: number;
  pricings: ChannelPricingItem[];
  costsByChannel: Record<string, SellingCostItem[]>;
  /** 오프라인 가상 행에 표시할 베이스 판매가 (세전, DB sellingPrice) */
  baseSellingPrice: number;
  /** 오프라인 마진 계산용 입고가 (세전, KPI 입고가와 동일) */
  baseInboundCost: number;
  /** 캡션 — VAT 포함 정가 (없으면 null) */
  listPriceVat: number | null;
  /** 캡션/오프라인 행 — VAT 포함 판매가 */
  sellingPriceVat: number;
  /** 캡션 — 할인율 % (정수) */
  discount: number;
  /** 캡션 정가 인라인 편집 저장 — VAT 포함 입력 문자열 */
  onSaveListPriceFromVat: (next: string) => Promise<void>;
  /** 오프라인 행 판매가 인라인 편집 저장 — VAT 포함 입력 문자열 */
  onSaveSellingPriceFromVat: (next: string) => Promise<void>;
  /** 캐시 invalidate 용 */
  productId: string;
  /** 오프라인 카드수수료율 (예: 0.004) */
  cardFeeRate?: number;
}

export function ProductChannelPricingTable({
  taxType,
  baseCost,
  globalCostTotal,
  pricings,
  costsByChannel,
  baseSellingPrice,
  baseInboundCost,
  listPriceVat,
  sellingPriceVat,
  discount,
  onSaveListPriceFromVat,
  onSaveSellingPriceFromVat,
  productId,
  cardFeeRate = 0,
}: ProductChannelPricingTableProps) {
  // 오프라인 가상 행 — 항상 첫 행. baseSellingPrice 가 0 이면 행도 생략하지 않음 (베이스라인 의미).
  // 카드수수료 = 판매가(VAT포함) × 카드수수료율
  const offlineCardFee = sellingPriceVat * cardFeeRate;
  const offlineMargin = Math.round(
    baseSellingPrice - baseInboundCost - globalCostTotal - offlineCardFee,
  );
  const offlineMarginRate = baseSellingPrice > 0 ? (offlineMargin / baseSellingPrice) * 100 : null;

  return (
    <div>
      <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border bg-muted/30 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1">
          정가
          <span className="text-foreground font-medium">
            ₩
            <InlineTextEdit
              value={listPriceVat != null ? String(listPriceVat) : "0"}
              productId={productId}
              onSave={onSaveListPriceFromVat}
              inputMode="numeric"
              commaFormat
            />
          </span>
        </span>
        <span>·</span>
        <span>
          할인 <span className="text-foreground font-medium">{discount > 0 ? `${discount}%` : "—"}</span>
        </span>
        <span>·</span>
        <span>
          원가 <span className="text-foreground font-medium">₩{fmtPrice(baseCost)}</span>
        </span>
        <span>·</span>
        <span>
          전사 공통비용 <span className="text-foreground font-medium">₩{fmtPrice(globalCostTotal)}</span>
        </span>
      </div>
      <Table className="min-w-[820px]">
        <TableHeader>
          <TableRow>
            <TableHead className="h-9 px-3 text-xs">채널</TableHead>
            <TableHead className="h-9 px-3 text-xs text-right">판매가 (VAT 포함)</TableHead>
            <TableHead className="h-9 px-3 text-xs">채널 비용 요약</TableHead>
            <TableHead className="h-9 px-3 text-xs text-right">예상 마진</TableHead>
            <TableHead className="h-9 px-3 w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* 오프라인 (베이스라인) 가상 행 */}
          <TableRow className="bg-muted/30">
            <TableCell className="px-3 py-2.5">
              <div className="flex items-center gap-2">
                <ChannelThumb logoUrl={null} alt="오프라인" />
                <span className="font-medium">오프라인</span>
                <Badge variant="secondary" className="text-[10px]">기본</Badge>
              </div>
            </TableCell>
            <TableCell className="px-3 py-2.5 text-right tabular-nums font-medium">
              ₩
              <InlineTextEdit
                value={String(sellingPriceVat)}
                productId={productId}
                onSave={onSaveSellingPriceFromVat}
                inputMode="numeric"
                commaFormat
              />
            </TableCell>
            <TableCell className="px-3 py-2.5 text-xs text-muted-foreground">
              {cardFeeRate > 0
                ? `카드수수료 ₩${fmtPrice(Math.round(offlineCardFee))} (${(cardFeeRate * 100).toFixed(2)}%)`
                : "—"}
            </TableCell>
            <TableCell className="px-3 py-2.5 text-right">
              <div
                className={`tabular-nums font-medium ${
                  offlineMargin < 0 ? "text-destructive" : "text-green-600"
                }`}
              >
                ₩{fmtPrice(offlineMargin)}
              </div>
              <div className="text-[10px] text-muted-foreground tabular-nums">
                {offlineMarginRate != null ? `${offlineMarginRate.toFixed(1)}%` : "—"}
              </div>
            </TableCell>
            <TableCell className="px-3 py-2.5"></TableCell>
          </TableRow>

          {/* 외부 채널별 행 */}
          {pricings.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-sm">
                외부 채널별 가격이 설정되지 않았습니다
              </TableCell>
            </TableRow>
          ) : (
            pricings.map((cp) => {
              const chCosts = costsByChannel[cp.channelId] ?? [];
              const chPrice = parseFloat(cp.sellingPrice);
              const chCostSum = computeCostSum(chCosts, chPrice);
              const totalCostSum = globalCostTotal + chCostSum;
              const margin = chPrice - baseCost - totalCostSum;
              const marginRate = chPrice > 0 ? (margin / chPrice) * 100 : null;
              return (
                <TableRow key={cp.id}>
                  <TableCell className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <ChannelThumb logoUrl={cp.channel.logoUrl ?? null} alt={cp.channel.name} />
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
                  <TableCell className="px-3 py-2.5 text-right">
                    <div
                      className={`tabular-nums font-medium ${
                        margin < 0 ? "text-destructive" : "text-green-600"
                      }`}
                    >
                      ₩{fmtPrice(margin)}
                    </div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">
                      {marginRate != null ? `${marginRate.toFixed(1)}%` : "—"}
                    </div>
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
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function ChannelThumb({ logoUrl, alt }: { logoUrl: string | null; alt: string }) {
  const cls = "h-6 w-6 shrink-0 rounded-sm border border-border object-contain bg-muted";
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt={alt} className={cls} />;
  }
  return (
    <div className={`${cls} flex items-center justify-center`}>
      <Store className="h-3.5 w-3.5 text-muted-foreground" />
    </div>
  );
}
