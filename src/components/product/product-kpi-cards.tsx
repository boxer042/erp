import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { computeAvgInboundUnitCost, fmtPrice } from "./helpers";
import type { ProductDetail } from "./types";

interface ProductKpiCardsProps {
  product: ProductDetail;
  cardFeeRate?: number;
}

export function ProductKpiCards({ product, cardFeeRate = 0 }: ProductKpiCardsProps) {
  const isTaxable = product.taxType !== "TAX_FREE";
  const taxRate = isTaxable ? parseFloat(product.taxRate ?? "0.1") : 0;

  // 판매가 (DB는 세전)
  const sellingNet = parseFloat(product.sellingPrice || "0");
  const sellingTax = Math.round(sellingNet * taxRate);
  const sellingTotal = Math.round(sellingNet + sellingTax);

  // 입고가/평균 원가 (잔여 로트 가중평균)
  // canonical 인 경우: 자기 lot 가 없으므로 자식 변형들의 가중평균을 사용
  const ownInboundNet = computeAvgInboundUnitCost(product);
  const inboundNet = product.isCanonical && (product.canonicalAggregatedUnitCost ?? 0) > 0
    ? Number(product.canonicalAggregatedUnitCost)
    : ownInboundNet;
  const inboundTax = Math.round(inboundNet * taxRate);
  const inboundTotal = Math.round(inboundNet + inboundTax);

  // 전사 공통 판매비용 (channelId IS NULL) — 오프라인 마진에 반영
  const sellingCostTotal = (product.sellingCosts ?? [])
    .filter((sc) => sc.channelId == null)
    .reduce((sum, sc) => {
      const v = parseFloat(sc.value);
      if (sc.costType === "FIXED") return sum + (sc.isTaxable ? v / 1.1 : v);
      return sum + sellingNet * (v / 100);
    }, 0);

  // 카드수수료 (오프라인) — 판매가(VAT포함) × 카드수수료율
  const cardFeeAmount = sellingTotal * cardFeeRate;

  // 마진 (실측, 오프라인): 판매가 - 입고가 - 판매비용 - 카드수수료
  const marginAmount = Math.round(sellingNet - inboundNet - sellingCostTotal - cardFeeAmount);
  const marginRate = sellingNet > 0 ? (marginAmount / sellingNet) * 100 : 0;

  // 재고 — canonical 은 자식 변형들의 합
  const qty = product.isCanonical
    ? Number(product.canonicalAggregatedQty ?? 0)
    : product.inventory
      ? parseFloat(product.inventory.quantity)
      : 0;
  const safety = product.inventory ? parseFloat(product.inventory.safetyStock) : 0;
  const isLow = safety > 0 && qty < safety;

  // 조립/세트 여부 + 예상값
  const isComposite = product.productType === "ASSEMBLED" || !!product.isSet;
  const estUnitCost = product.estimatedUnitCost ?? null;
  const estMargin = product.estimatedMargin ?? null;
  const estMarginRate = product.estimatedMarginRate ?? null;
  const missingCount = product.missingCostCount ?? 0;
  const missingNames = (product.estimatedCostBreakdown ?? [])
    .filter((b) => b.costSource === "NONE")
    .map((b) => b.componentName);

  // 분기 정책:
  // - 일반 상품: 입고가 + 마진(오프라인)
  // - 조립/세트:
  //   · 실측 데이터 있음 (inboundNet > 0) → 평균 원가 + 평균 마진
  //   · 실측 데이터 없음 → 예상 원가 + 예상 마진
  const hasActuals = inboundNet > 0;
  const showAverageForComposite = isComposite && hasActuals;
  const showEstimateForComposite = isComposite && !hasActuals && estUnitCost !== null;
  const showInboundLegacy = !isComposite; // 일반 상품에만 노출

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
      {/* 판매가 */}
      <KpiCard
        label="판매가"
        description="오프라인 기준 대표 판매가 (공급가액 + 세액)"
      >
        <Line label="공급가액" value={`₩${fmtPrice(sellingNet)}`} />
        <Line label="세액" value={`₩${fmtPrice(sellingTax)}`} />
        <Line label="판매가" value={`₩${fmtPrice(sellingTotal)}`} emphasis />
      </KpiCard>

      {/* 일반 상품: 입고가 */}
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

      {/* 일반 상품: 마진(오프라인) */}
      {showInboundLegacy && (
        <KpiCard
          label="마진 (오프라인)"
          description="판매가 − 입고가 − 판매비용 − 카드수수료"
        >
          <Line label="마진금액" value={`₩${fmtPrice(marginAmount)}`} emphasis tone={marginAmount < 0 ? "bad" : "good"} />
          <Line label="마진율" value={`${marginRate.toFixed(1)}%`} tone={marginAmount < 0 ? "bad" : "good"} />
        </KpiCard>
      )}

      {/* 조립/세트 — 실측: 평균 입고가 (lot 가중평균; 구성품 공급단가+배송비+부대비용 누적) */}
      {showAverageForComposite && (
        <KpiCard
          label="평균 입고가"
          description="조립실적 lot 가중평균 (구성품의 공급단가+배송비+부대비용 누적)"
        >
          <Line label="공급가액" value={`₩${fmtPrice(inboundNet)}`} />
          <Line label="세액" value={`₩${fmtPrice(inboundTax)}`} />
          <Line label="입고가" value={`₩${fmtPrice(inboundTotal)}`} emphasis />
        </KpiCard>
      )}

      {/* 조립/세트 — 실측: 평균 마진 */}
      {showAverageForComposite && (
        <KpiCard
          label="평균 마진"
          description="판매가 − 평균 입고가 − 판매비용 − 카드수수료"
        >
          <Line label="마진금액" value={`₩${fmtPrice(marginAmount)}`} emphasis tone={marginAmount < 0 ? "bad" : "good"} />
          <Line label="마진율" value={`${marginRate.toFixed(1)}%`} tone={marginAmount < 0 ? "bad" : "good"} />
        </KpiCard>
      )}

      {/* 조립/세트 — 예측: 예상 원가 */}
      {showEstimateForComposite && (
        <KpiCard
          label="예상 원가"
          description="구성품 잔여 로트·매입 단가 + 조립비 (조립실적 전 미리보기)"
        >
          <Line label="단위 원가" value={`₩${fmtPrice(Math.round(estUnitCost ?? 0))}`} emphasis />
          {missingCount > 0 && (
            <p className="text-[10px] text-destructive leading-snug">
              ⚠️ {missingCount}개 부품 단가 미설정
              {missingNames.length > 0 && (
                <span className="block text-muted-foreground mt-0.5">
                  {missingNames.join(", ")}
                </span>
              )}
            </p>
          )}
        </KpiCard>
      )}

      {/* 조립/세트 — 예측: 예상 마진 */}
      {showEstimateForComposite && (
        <KpiCard
          label="예상 마진"
          description="판매가 − 예상 원가 − 판매비용"
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

      {/* 재고 */}
      <KpiCard
        label="재고"
        description="현재 보유 수량 (안전재고 미달 시 강조)"
      >
        <div className={`text-xl font-bold tabular-nums ${isLow ? "text-destructive" : ""}`}>
          {qty.toLocaleString("ko-KR")}
        </div>
        {safety > 0 && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
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
    <Card>
      <CardHeader className="pb-2 pt-4 px-4 space-y-0.5">
        <CardDescription className="text-xs">{label}</CardDescription>
        {description && (
          <p className="text-[10px] text-muted-foreground/80 leading-snug">
            {description}
          </p>
        )}
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-1">{children}</CardContent>
    </Card>
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
    tone === "bad" ? "text-destructive" : tone === "good" ? "text-green-600" : "";
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px] text-muted-foreground shrink-0">{label}</span>
      <span
        className={`tabular-nums ${
          emphasis ? "text-base font-bold" : "text-sm"
        } ${toneCls}`}
      >
        {value}
      </span>
    </div>
  );
}
