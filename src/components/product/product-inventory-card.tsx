import Link from "next/link";
import { JmButton } from "@/jm";
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
  // 음수 재고 — 재고 없이 판매(오버셀) 됐다는 뜻. 적자 로트가 생성된 상태.
  // CompanyInfo.allowNegativeStock 가 ON 일 때 발생. 실사보정으로 정산 필요.
  const isNegative = qty < 0;
  // 결품 — 정확히 0. "부족" 보다 더 강한 경고.
  const isOutOfStock = qty === 0;
  const isLow = !isNegative && !isOutOfStock && safety > 0 && qty < safety;
  // 상태 라벨 우선순위: 음수 > 결품 > 부족 > 정상
  const statusLabel = isNegative
    ? "음수재고"
    : isOutOfStock
      ? "결품"
      : isLow
        ? "부족"
        : "정상";
  const statusTone: "good" | "bad" | "neutral" =
    isNegative || isOutOfStock || isLow ? "bad" : "good";
  const qtyTone: "neutral" | "bad" = isNegative || isOutOfStock || isLow ? "bad" : "neutral";

  return (
    <ProductSection
      title="재고"
      actions={
        <Link href={`/inventory/stocktake?productId=${product.id}`}>
          <JmButton size="sm" variant={isNegative ? "cta" : "outline"}>
            실사보정
          </JmButton>
        </Link>
      }
    >
      {/* 음수 재고 경고 배너 — 재고 없이 N개 출고된 적자 상태. 실사보정 권장. */}
      {isNegative && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-[var(--jm-danger-border)] bg-[var(--jm-danger-bg)] px-3 py-2 text-jm-sm text-[var(--jm-danger-fg)]">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="mt-0.5 shrink-0"
          >
            <path
              d="M8 1.5L1 14h14L8 1.5z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M8 6v4M8 11.5v.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold">
              재고 없이 {fmtNumber(Math.abs(qty))} {product.unitOfMeasure} 판매됨 (적자 출고)
            </span>
            <span className="text-jm-xs opacity-90">
              현재 시스템상 재고가 음수입니다. 실제 재고와 맞추려면 [실사보정] 으로 정산하세요.
            </span>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-3">
        <Stat
          label="현재 수량"
          value={`${fmtNumber(qty)} ${product.unitOfMeasure}`}
          tone={qtyTone}
        />
        <Stat
          label="안전재고"
          value={safety > 0 ? `${fmtNumber(safety)} ${product.unitOfMeasure}` : "—"}
        />
        {inv?.avgCost ? (
          <Stat
            label="평균원가 (참고)"
            value={`₩${fmtNumber(inv.avgCost)}`}
            sub="캐시값 — FIFO 미반영. 실제 원가는 로트 단가"
          />
        ) : (
          <Stat label="평균원가" value="—" sub="로트(FIFO) 기준" />
        )}
        <Stat label="상태" value={statusLabel} tone={statusTone} />
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
      <div className="text-jm-2xs font-medium text-[var(--jm-text-muted)]">{label}</div>
      <div
        className={`text-jm-base font-semibold tabular-nums ${
          tone === "bad"
            ? "text-[var(--jm-danger-fg)]"
            : tone === "good"
              ? "text-[var(--jm-success-fg)]"
              : "text-[var(--jm-text)]"
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-jm-2xs text-[var(--jm-text-muted)]">{sub}</div>}
    </div>
  );
}
