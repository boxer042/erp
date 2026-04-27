import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { TAX_TYPE_LABELS, fmtPrice, toVatPrice, computeCostSum } from "./helpers";
import type { ProductDetail } from "./types";

interface ProductKpiCardsProps {
  product: ProductDetail;
}

export function ProductKpiCards({ product }: ProductKpiCardsProps) {
  const mappings = product.productMappings ?? [];
  const costs = product.sellingCosts ?? [];
  const globalCosts = costs.filter((c) => c.channelId == null);
  const baseCost = mappings[0]
    ? parseFloat(mappings[0].supplierProduct.unitPrice) /
      parseFloat(mappings[0].conversionRate || "1")
    : 0;
  const globalCostTotal = computeCostSum(globalCosts, parseFloat(product.sellingPrice));
  const margin = parseFloat(product.sellingPrice) - baseCost - globalCostTotal;
  const displayVat = toVatPrice(product.sellingPrice, product.taxType);

  const items: { label: string; value: React.ReactNode; sub?: string; tone?: "neutral" | "good" | "bad" }[] = [
    {
      label: "판매가",
      value: `₩${fmtPrice(displayVat)}`,
      sub: `${TAX_TYPE_LABELS[product.taxType] ?? product.taxType}${
        product.taxType === "TAXABLE" ? " 포함" : ""
      }`,
    },
    {
      label: "원가 (공급자)",
      value: `₩${fmtPrice(baseCost)}`,
    },
    {
      label: "판매비용 (전사)",
      value: `₩${fmtPrice(globalCostTotal)}`,
    },
    {
      label: "마진 (세전)",
      value: `₩${fmtPrice(margin)}`,
      tone: margin < 0 ? "bad" : "good",
    },
    {
      label: "재고",
      value: product.inventory
        ? parseFloat(product.inventory.quantity).toLocaleString("ko-KR")
        : "0",
      sub:
        product.inventory && parseFloat(product.inventory.safetyStock) > 0
          ? `안전재고 ${parseFloat(product.inventory.safetyStock).toLocaleString("ko-KR")}`
          : undefined,
    },
  ];

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="text-xs">{item.label}</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div
              className={`text-xl font-bold tabular-nums ${
                item.tone === "bad"
                  ? "text-destructive"
                  : item.tone === "good"
                  ? "text-green-600"
                  : ""
              }`}
            >
              {item.value}
            </div>
            {item.sub ? (
              <p className="text-[11px] text-muted-foreground mt-0.5">{item.sub}</p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
