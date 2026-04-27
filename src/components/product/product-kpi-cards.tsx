import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { computeAvgInboundUnitCost, fmtPrice } from "./helpers";
import type { ProductDetail } from "./types";

interface ProductKpiCardsProps {
  product: ProductDetail;
}

export function ProductKpiCards({ product }: ProductKpiCardsProps) {
  const isTaxable = product.taxType === "TAXABLE" || product.taxType === "ZERO_RATE";
  const taxRate = isTaxable ? parseFloat(product.taxRate ?? "0.1") : 0;

  // 판매가 (DB는 세전)
  const sellingNet = parseFloat(product.sellingPrice || "0");
  const sellingTax = Math.round(sellingNet * taxRate);
  const sellingTotal = Math.round(sellingNet + sellingTax);

  // 입고가 (배송비·입고비용 포함된 unitCost — 잔여 로트 가중평균, 세전 기준)
  const inboundNet = computeAvgInboundUnitCost(product);
  const inboundTax = Math.round(inboundNet * taxRate);
  const inboundTotal = Math.round(inboundNet + inboundTax);

  // 마진 — 오프라인 가정 (카드수수료/판매비용 미반영).
  // 판매 공급가액 − 입고 공급가액. 매입/매출 부가세 동일 세율이면 cash 차이와 일치.
  const marginAmount = Math.round(sellingNet - inboundNet);
  const marginRate = sellingNet > 0 ? (marginAmount / sellingNet) * 100 : 0;

  // 재고
  const qty = product.inventory ? parseFloat(product.inventory.quantity) : 0;
  const safety = product.inventory ? parseFloat(product.inventory.safetyStock) : 0;
  const isLow = safety > 0 && qty < safety;

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

      {/* 입고가 */}
      <KpiCard
        label="입고가"
        description="매입가 + 배송비 + 입고비용 (잔여 재고 로트 가중평균)"
      >
        <Line label="공급가액" value={`₩${fmtPrice(inboundNet)}`} />
        <Line label="세액" value={`₩${fmtPrice(inboundTax)}`} />
        <Line label="입고가" value={`₩${fmtPrice(inboundTotal)}`} emphasis />
      </KpiCard>

      {/* 마진 */}
      <KpiCard
        label="마진 (오프라인)"
        description="판매가 − 입고가. 카드수수료·판매비용 미반영"
      >
        <Line label="마진금액" value={`₩${fmtPrice(marginAmount)}`} emphasis tone={marginAmount < 0 ? "bad" : "good"} />
        <Line label="마진율" value={`${marginRate.toFixed(1)}%`} tone={marginAmount < 0 ? "bad" : "good"} />
      </KpiCard>

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
