import { JmCard, JmCardContent, JmCardHeader } from "@/jm";
import { computeAvgInboundUnitCost, fmtPrice } from "./helpers";
import type { ProductDetail } from "./types";

interface ProductKpiCardsProps {
  product: ProductDetail;
  cardFeeRate?: number;
}

export function ProductKpiCards({ product, cardFeeRate = 0 }: ProductKpiCardsProps) {
  const isTaxable = product.taxType !== "TAX_FREE";
  const taxRate = isTaxable ? parseFloat(product.taxRate ?? "0.1") : 0;

  const sellingNet = parseFloat(product.sellingPrice || "0");
  const sellingTax = Math.round(sellingNet * taxRate);
  const sellingTotal = Math.round(sellingNet + sellingTax);

  const ownInboundNet = computeAvgInboundUnitCost(product);
  const inboundNet =
    product.isCanonical && (product.canonicalAggregatedUnitCost ?? 0) > 0
      ? Number(product.canonicalAggregatedUnitCost)
      : ownInboundNet;
  const inboundTax = Math.round(inboundNet * taxRate);
  const inboundTotal = Math.round(inboundNet + inboundTax);

  const sellingCostTotal = (product.sellingCosts ?? [])
    .filter((sc) => sc.channelId == null)
    .reduce((sum, sc) => {
      const v = parseFloat(sc.value);
      if (sc.costType === "FIXED") return sum + (sc.isTaxable ? v / 1.1 : v);
      return sum + sellingNet * (v / 100);
    }, 0);

  const cardFeeAmount = sellingTotal * cardFeeRate;

  const marginAmount = Math.round(
    sellingNet - inboundNet - sellingCostTotal - cardFeeAmount,
  );
  const marginRate = sellingNet > 0 ? (marginAmount / sellingNet) * 100 : 0;

  const qty = product.isCanonical
    ? Number(product.canonicalAggregatedQty ?? 0)
    : product.inventory
      ? parseFloat(product.inventory.quantity)
      : 0;
  const safety = product.inventory ? parseFloat(product.inventory.safetyStock) : 0;
  const isLow = safety > 0 && qty < safety;

  const isComposite = product.productType === "ASSEMBLED" || !!product.isSet;
  const estUnitCost = product.estimatedUnitCost ?? null;
  const estMargin = product.estimatedMargin ?? null;
  const estMarginRate = product.estimatedMarginRate ?? null;
  const missingCount = product.missingCostCount ?? 0;
  const missingNames = (product.estimatedCostBreakdown ?? [])
    .filter((b) => b.costSource === "NONE")
    .map((b) => b.componentName);

  const hasActuals = inboundNet > 0;
  const showAverageForComposite = isComposite && hasActuals;
  const showEstimateForComposite = isComposite && !hasActuals && estUnitCost !== null;
  const showInboundLegacy = !isComposite;

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
      <KpiCard label="판매가" description="오프라인 기준 대표 판매가 (공급가액 + 세액)">
        <Line label="공급가액" value={`₩${fmtPrice(sellingNet)}`} />
        <Line label="세액" value={`₩${fmtPrice(sellingTax)}`} />
        <Line label="판매가" value={`₩${fmtPrice(sellingTotal)}`} emphasis />
      </KpiCard>

      {showInboundLegacy && (
        <KpiCard
          label="입고가"
          description="매입가 + 배송비 + 입고비용 (잔여 재고 로트 가중평균)"
        >
          <Line label="공급가액" value={`₩${fmtPrice(inboundNet)}`} />
          <Line label="세액" value={`₩${fmtPrice(inboundTax)}`} />
          <Line label="입고가" value={`₩${fmtPrice(inboundTotal)}`} emphasis />
        </KpiCard>
      )}

      {showInboundLegacy && (
        <KpiCard
          label="마진 (오프라인)"
          description="공급가액 − 입고가 − 판매비용 − 카드수수료 (VAT 제외 마진)"
        >
          <Line
            label="마진금액"
            value={`₩${fmtPrice(marginAmount)}`}
            emphasis
            tone={marginAmount < 0 ? "bad" : "good"}
          />
          <Line
            label="마진율"
            value={`${marginRate.toFixed(1)}%`}
            tone={marginAmount < 0 ? "bad" : "good"}
          />
        </KpiCard>
      )}

      {showAverageForComposite && (
        <KpiCard
          label="평균 입고가"
          description="조립 시점에 굳어진 lot 단가의 가중평균 (부속 단가 + 배송비 + 부대비용). 이후 부속 단가가 바뀌어도 변동하지 않음"
        >
          <Line label="공급가액" value={`₩${fmtPrice(inboundNet)}`} />
          <Line label="세액" value={`₩${fmtPrice(inboundTax)}`} />
          <Line label="입고가" value={`₩${fmtPrice(inboundTotal)}`} emphasis />
        </KpiCard>
      )}

      {showAverageForComposite && (
        <KpiCard
          label="평균 마진"
          description="공급가액 − 평균 입고가 − 판매비용 − 카드수수료 (VAT 제외 마진)"
        >
          <Line
            label="마진금액"
            value={`₩${fmtPrice(marginAmount)}`}
            emphasis
            tone={marginAmount < 0 ? "bad" : "good"}
          />
          <Line
            label="마진율"
            value={`${marginRate.toFixed(1)}%`}
            tone={marginAmount < 0 ? "bad" : "good"}
          />
        </KpiCard>
      )}

      {showEstimateForComposite && (
        <KpiCard
          label="예상 원가"
          description="구성품 잔여 로트·매입 단가 + 조립비 (조립실적 전 미리보기)"
        >
          <Line
            label="단위 원가"
            value={`₩${fmtPrice(Math.round(estUnitCost ?? 0))}`}
            emphasis
          />
          {missingCount > 0 && (
            <p className="text-jm-2xs text-[var(--jm-danger-fg)] leading-snug">
              ⚠️ {missingCount}개 부품 단가 미설정
              {missingNames.length > 0 && (
                <span className="block text-[var(--jm-text-muted)] mt-0.5">
                  {missingNames.join(", ")}
                </span>
              )}
            </p>
          )}
        </KpiCard>
      )}

      {showEstimateForComposite && (
        <KpiCard
          label="예상 마진"
          description="공급가액 − 예상 원가 − 판매비용 (VAT 제외 마진)"
        >
          <Line
            label="마진금액"
            value={`₩${fmtPrice(Math.round(estMargin ?? 0))}`}
            emphasis
            tone={(estMargin ?? 0) < 0 ? "bad" : "good"}
          />
          <Line
            label="마진율"
            value={estMarginRate !== null ? `${estMarginRate.toFixed(1)}%` : "-"}
            tone={(estMargin ?? 0) < 0 ? "bad" : "good"}
          />
        </KpiCard>
      )}

      <KpiCard label="재고" description="현재 보유 수량 (안전재고 미달 시 강조)">
        <div
          className={`text-jm-lg font-bold tabular-nums ${
            isLow ? "text-[var(--jm-danger-fg)]" : "text-[var(--jm-text)]"
          }`}
        >
          {qty.toLocaleString("ko-KR")}
        </div>
        {safety > 0 && (
          <p className="text-jm-2xs text-[var(--jm-text-muted)] mt-0.5">
            안전재고 {safety.toLocaleString("ko-KR")}
          </p>
        )}
      </KpiCard>
    </div>
  );
}

function KpiCard({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <JmCard>
      <JmCardHeader className="pb-2 pt-4 px-4 space-y-0.5">
        <span className="text-jm-xs text-[var(--jm-text-muted)]">{label}</span>
        {description && (
          <p className="text-jm-2xs text-[var(--jm-text-muted)]/80 leading-snug">
            {description}
          </p>
        )}
      </JmCardHeader>
      <JmCardContent className="px-4 pb-4 space-y-1">{children}</JmCardContent>
    </JmCard>
  );
}

function Line({
  label,
  value,
  emphasis = false,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  emphasis?: boolean;
  tone?: "neutral" | "good" | "bad";
}) {
  const toneCls =
    tone === "bad"
      ? "text-[var(--jm-danger-fg)]"
      : tone === "good"
        ? "text-[var(--jm-success-fg)]"
        : "text-[var(--jm-text)]";
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-jm-2xs text-[var(--jm-text-muted)] shrink-0">{label}</span>
      <span
        className={`tabular-nums ${
          emphasis ? "text-jm-base font-bold" : "text-jm-sm"
        } ${toneCls}`}
      >
        {value}
      </span>
    </div>
  );
}
