import Link from "next/link";
import { Button } from "@/components/ui/button";
import { fmtNumber } from "./helpers";
import { ProductSection } from "./product-section";
import type { ProductDetail } from "./types";

interface ProductInventoryCardProps {
  product: Pick<ProductDetail, "id" | "inventory" | "unitOfMeasure">;
}

export function ProductInventoryCard({ product }: ProductInventoryCardProps) {
  const inv = product.inventory;
  const qty = inv ? parseFloat(inv.quantity) : 0;
  const safety = inv ? parseFloat(inv.safetyStock) : 0;
  const isLow = safety > 0 && qty < safety;

  return (
    <ProductSection
      title="재고"
      actions={
        <Link href={`/inventory/stocktake?productId=${product.id}`}>
          <Button size="sm" variant="outline" className="h-8">
            실사보정
          </Button>
        </Link>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-3">
        <Stat label="현재 수량" value={`${fmtNumber(qty)} ${product.unitOfMeasure}`} tone={isLow ? "bad" : "neutral"} />
        <Stat label="안전재고" value={safety > 0 ? `${fmtNumber(safety)} ${product.unitOfMeasure}` : "—"} />
        {inv?.avgCost ? (
          <Stat
            label="평균원가 (deprecated)"
            value={`₩${fmtNumber(inv.avgCost)}`}
            sub="실제 원가는 로트 기준"
          />
        ) : (
          <Stat label="평균원가" value="—" sub="로트 기반 계산" />
        )}
        <Stat label="상태" value={isLow ? "부족" : "정상"} tone={isLow ? "bad" : "good"} />
      </div>
    </ProductSection>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "neutral" | "good" | "bad";
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div
        className={`text-base font-semibold tabular-nums ${
          tone === "bad" ? "text-destructive" : tone === "good" ? "text-green-600" : ""
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
