import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Info, Store } from "lucide-react";

import {
  JmBadge,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
} from "@/jm";
import { computeCostSum, fmtPrice, summarizeCosts, toVatPrice } from "./helpers";
import { ProductSellingCostsTable } from "./product-selling-costs-table";
import { InlineTextEdit } from "./edit/inline-text-edit";
import type { ChannelPricingItem, SellingCostItem } from "./types";

interface ProductChannelPricingTableProps {
  taxType: string;
  productType: string;
  baseCost: number;
  globalCostTotal: number;
  pricings: ChannelPricingItem[];
  costsByChannel: Record<string, SellingCostItem[]>;
  baseSellingPrice: number;
  baseInboundCost: number;
  listPriceVat: number | null;
  sellingPriceVat: number;
  discount: number;
  onSaveListPriceFromVat: (next: string) => Promise<void>;
  onSaveSellingPriceFromVat: (next: string) => Promise<void>;
  productId: string;
  cardFeeRate?: number;
}

export function ProductChannelPricingTable({
  taxType,
  productType,
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
  const offlineCardFee = sellingPriceVat * cardFeeRate;
  // 오프라인 마진은 "실제 입고/생산된 로트 가중평균(baseInboundCost)" 기준.
  // 데이터가 없으면 0 으로 차감되어 100% 같은 오해를 부르므로 별도 표시.
  const hasInboundData = baseInboundCost > 0;
  const offlineMargin = Math.round(
    baseSellingPrice - baseInboundCost - globalCostTotal - offlineCardFee,
  );
  const offlineMarginRate =
    baseSellingPrice > 0 ? (offlineMargin / baseSellingPrice) * 100 : null;
  const offlineEmptyLabel =
    productType === "ASSEMBLED" ? "조립실적 없음" : "입고 이력 없음";

  return (
    <div>
      <div className="px-3 py-2 text-jm-xs text-[var(--jm-text-muted)] border-b border-[var(--jm-border)] bg-[var(--jm-surface-muted)]/30 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1">
          정가
          <span className="text-[var(--jm-text)] font-medium">
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
          할인{" "}
          <span className="text-[var(--jm-text)] font-medium">
            {discount > 0 ? `${discount}%` : "—"}
          </span>
        </span>
        <span>·</span>
        <span>
          원가{" "}
          <span className="text-[var(--jm-text)] font-medium">₩{fmtPrice(baseCost)}</span>
        </span>
        <span>·</span>
        <span>
          전사 공통비용{" "}
          <span className="text-[var(--jm-text)] font-medium">
            ₩{fmtPrice(globalCostTotal)}
          </span>
        </span>
      </div>
      <JmTable className="min-w-[820px]">
        <JmTableHeader>
          <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
              채널
            </JmTableHead>
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
              판매가 (VAT 포함)
            </JmTableHead>
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
              채널 비용 요약
            </JmTableHead>
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
              예상 마진
            </JmTableHead>
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 w-10"></JmTableHead>
          </JmTableRow>
        </JmTableHeader>
        <JmTableBody>
          {/* 오프라인 (베이스라인) 가상 행 */}
          <JmTableRow className="bg-[var(--jm-surface-muted)]/30">
            <JmTableCell className="px-3 py-2">
              <div className="flex items-center gap-2">
                <ChannelThumb logoUrl={null} alt="오프라인" />
                <span className="font-medium text-[var(--jm-text)]">오프라인</span>
                <JmBadge
                  variant="default"
                  size="sm"
                  shape="square"
                  className="text-jm-2xs"
                >
                  기본
                </JmBadge>
              </div>
            </JmTableCell>
            <JmTableCell className="px-3 py-2 text-right tabular-nums font-medium text-[var(--jm-text)]">
              ₩
              <InlineTextEdit
                value={String(sellingPriceVat)}
                productId={productId}
                onSave={onSaveSellingPriceFromVat}
                inputMode="numeric"
                commaFormat
              />
            </JmTableCell>
            <JmTableCell className="px-3 py-2 text-jm-xs text-[var(--jm-text-muted)]">
              {cardFeeRate > 0
                ? `카드수수료 ₩${fmtPrice(Math.round(offlineCardFee))} (${(cardFeeRate * 100).toFixed(2)}%)`
                : "—"}
            </JmTableCell>
            <JmTableCell className="px-3 py-2 text-right">
              {hasInboundData ? (
                <>
                  <div
                    className={`tabular-nums font-medium ${
                      offlineMargin < 0
                        ? "text-[var(--jm-danger-fg)]"
                        : "text-[var(--jm-success-fg)]"
                    }`}
                  >
                    ₩{fmtPrice(offlineMargin)}
                  </div>
                  <div className="text-jm-2xs text-[var(--jm-text-muted)] tabular-nums">
                    {offlineMarginRate != null
                      ? `${offlineMarginRate.toFixed(1)}%`
                      : "—"}
                  </div>
                </>
              ) : (
                <div className="text-jm-xs text-[var(--jm-text-muted)] font-normal">
                  {offlineEmptyLabel}
                </div>
              )}
            </JmTableCell>
            <JmTableCell className="px-3 py-2"></JmTableCell>
          </JmTableRow>

          {/* 외부 채널별 행 */}
          {pricings.length === 0 ? (
            <JmTableRow className="hover:bg-transparent">
              <JmTableCell
                colSpan={5}
                className="text-center py-6 text-[var(--jm-text-muted)] text-jm-sm"
              >
                외부 채널별 가격이 설정되지 않았습니다
              </JmTableCell>
            </JmTableRow>
          ) : (
            pricings.map((cp) => {
              const chCosts = costsByChannel[cp.channelId] ?? [];
              const chPrice = parseFloat(cp.sellingPrice);
              const chCostSum = computeCostSum(chCosts, chPrice);
              const totalCostSum = globalCostTotal + chCostSum;
              const margin = chPrice - baseCost - totalCostSum;
              const marginRate = chPrice > 0 ? (margin / chPrice) * 100 : null;
              return (
                <JmTableRow key={cp.id}>
                  <JmTableCell className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <ChannelThumb
                        logoUrl={cp.channel.logoUrl ?? null}
                        alt={cp.channel.name}
                      />
                      <span className="font-medium text-[var(--jm-text)]">
                        {cp.channel.name}
                      </span>
                      <JmBadge
                        variant="outline"
                        size="sm"
                        shape="square"
                        className="text-jm-2xs"
                      >
                        {cp.channel.code}
                      </JmBadge>
                    </div>
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2 text-right tabular-nums font-medium text-[var(--jm-text)]">
                    ₩{fmtPrice(toVatPrice(cp.sellingPrice, taxType))}
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2 text-jm-xs text-[var(--jm-text-muted)]">
                    {summarizeCosts(chCosts)}
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2 text-right">
                    <div
                      className={`tabular-nums font-medium ${
                        margin < 0
                          ? "text-[var(--jm-danger-fg)]"
                          : "text-[var(--jm-success-fg)]"
                      }`}
                    >
                      ₩{fmtPrice(margin)}
                    </div>
                    <div className="text-jm-2xs text-[var(--jm-text-muted)] tabular-nums">
                      {marginRate != null ? `${marginRate.toFixed(1)}%` : "—"}
                    </div>
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2">
                    {chCosts.length > 0 && (
                      <PopoverPrimitive.Root>
                        <PopoverPrimitive.Trigger
                          aria-label="채널 비용 상세"
                          className="inline-flex size-7 items-center justify-center rounded-md text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface-muted)] hover:text-[var(--jm-text)] transition-colors"
                        >
                          <Info className="size-3.5" />
                        </PopoverPrimitive.Trigger>
                        <PopoverPrimitive.Portal>
                          <PopoverPrimitive.Positioner
                            align="end"
                            sideOffset={4}
                            className="isolate z-50"
                          >
                            <PopoverPrimitive.Popup
                              data-jm-scope
                              className="z-50 w-[460px] rounded-xl bg-[var(--jm-surface)] p-3 ring-1 ring-[var(--jm-border)] shadow-[var(--jm-shadow-lg)] outline-none font-[family-name:var(--jm-font-sans)]"
                            >
                              <div className="text-jm-xs text-[var(--jm-text-muted)] mb-2">
                                {cp.channel.name} 채널 전용 비용
                              </div>
                              <ProductSellingCostsTable costs={chCosts} compact />
                            </PopoverPrimitive.Popup>
                          </PopoverPrimitive.Positioner>
                        </PopoverPrimitive.Portal>
                      </PopoverPrimitive.Root>
                    )}
                  </JmTableCell>
                </JmTableRow>
              );
            })
          )}
        </JmTableBody>
      </JmTable>
    </div>
  );
}

function ChannelThumb({ logoUrl, alt }: { logoUrl: string | null; alt: string }) {
  const cls =
    "h-6 w-6 shrink-0 rounded-sm border border-[var(--jm-border)] object-contain bg-[var(--jm-surface-muted)]";
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt={alt} className={cls} />;
  }
  return (
    <div className={`${cls} flex items-center justify-center`}>
      <Store className="size-3.5 text-[var(--jm-text-muted)]" />
    </div>
  );
}
