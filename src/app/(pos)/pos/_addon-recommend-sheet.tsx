"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { BottomSheet } from "./_components/bottom-sheet";

interface BundleData {
  id: string; // BundleProduct.id
  bundleProductId: string;
  defaultQuantity: string;
  discountAmount: string | null;
  recommendMessage: string | null;
  bundleProduct: {
    id: string;
    name: string;
    sku: string;
    sellingPrice: string;
    listPrice?: string;
    imageUrl: string | null;
    taxType: string;
    productType?: string;
  };
}

export interface AddonSelection {
  bundleId: string;
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number; // 세전 — sellingPrice − discountAmount
  taxType: "TAXABLE" | "TAX_FREE";
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 메인 상품 ID — 이 상품의 BundleProduct 추천 fetch */
  mainProductId: string;
  /** 메인 상품 이름 — 헤더 표시용 */
  mainProductName: string;
  /** 고객이 선택한 추가구매 → 부모가 카트에 ADDON 자식 라인 추가 */
  onConfirm: (selections: AddonSelection[]) => void;
  /** 모달 닫고 추가 안 함 — "건너뛰기" */
  onSkip?: () => void;
}

/**
 * 추가구매 추천 시트 — 메인 상품 카트 추가 후 자동 노출.
 * 고객이 추천 상품을 골라 "함께 구매" 클릭 시 카트에 ADDON 자식 라인 추가.
 * 추천이 없으면 자동 onSkip → 메인만 카트에 남음.
 */
export function AddonRecommendSheet({
  open,
  onOpenChange,
  mainProductId,
  mainProductName,
  onConfirm,
  onSkip,
}: Props) {
  if (!open) return null;
  return (
    <Body
      onOpenChange={onOpenChange}
      mainProductId={mainProductId}
      mainProductName={mainProductName}
      onConfirm={onConfirm}
      onSkip={onSkip}
    />
  );
}

function Body({
  onOpenChange,
  mainProductId,
  mainProductName,
  onConfirm,
  onSkip,
}: Omit<Props, "open">) {
  const bundlesQuery = useQuery<BundleData[]>({
    queryKey: ["pos", "bundles", mainProductId],
    queryFn: () => apiGet<BundleData[]>(`/api/products/${mainProductId}/bundles`),
  });

  // 선택 상태 — bundleId → quantity (0 이면 미선택)
  const [picks, setPicks] = useState<Record<string, number>>({});

  const bundles = bundlesQuery.data ?? [];
  const selectedCount = Object.values(picks).filter((q) => q > 0).length;

  const totalAdd = useMemo(() => {
    let sum = 0;
    for (const b of bundles) {
      const qty = picks[b.id] ?? 0;
      if (qty <= 0) continue;
      const unit = Math.max(
        0,
        Number(b.bundleProduct.sellingPrice ?? 0) - Number(b.discountAmount ?? 0),
      );
      const taxApplies = b.bundleProduct.taxType !== "TAX_FREE";
      sum += (taxApplies ? Math.round(unit * 1.1) : unit) * qty;
    }
    return sum;
  }, [bundles, picks]);

  const togglePick = (b: BundleData) => {
    const def = Math.max(1, Math.round(Number(b.defaultQuantity) || 1));
    setPicks((prev) => {
      const cur = prev[b.id] ?? 0;
      return { ...prev, [b.id]: cur > 0 ? 0 : def };
    });
  };

  const confirm = () => {
    const selections: AddonSelection[] = [];
    for (const b of bundles) {
      const qty = picks[b.id] ?? 0;
      if (qty <= 0) continue;
      const unit = Math.max(
        0,
        Number(b.bundleProduct.sellingPrice ?? 0) - Number(b.discountAmount ?? 0),
      );
      selections.push({
        bundleId: b.id,
        productId: b.bundleProduct.id,
        name: b.bundleProduct.name,
        sku: b.bundleProduct.sku,
        quantity: qty,
        unitPrice: unit,
        taxType: b.bundleProduct.taxType === "TAX_FREE" ? "TAX_FREE" : "TAXABLE",
      });
    }
    onConfirm(selections);
    onOpenChange(false);
  };

  return (
    <BottomSheet
      open
      onOpenChange={onOpenChange}
      title={`함께 사면 좋아요 — ${mainProductName}`}
      footer={
        <div className="flex w-full items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onSkip?.();
              onOpenChange(false);
            }}
            className="flex h-14 items-center justify-center rounded-2xl border-2 border-[var(--jm-border)] bg-[var(--jm-surface)] px-5 text-[14px] font-medium text-[var(--jm-text-muted)]"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={selectedCount === 0}
            className="flex h-14 flex-1 items-center justify-center gap-1 rounded-2xl bg-[var(--jm-action)] text-[16px] font-semibold text-white disabled:opacity-40"
          >
            추가
            {totalAdd > 0 && (
              <span className="text-white/80">
                (+₩{totalAdd.toLocaleString("ko-KR")})
              </span>
            )}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-2 pt-2">
        {bundlesQuery.isPending ? (
          <div className="py-8 text-center text-[12px] text-[var(--jm-text-subtle)]">
            추천 불러오는 중…
          </div>
        ) : bundles.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-[var(--jm-text-subtle)]">
            추천 상품이 없습니다
          </div>
        ) : (
          bundles.map((b) => {
            const qty = picks[b.id] ?? 0;
            const active = qty > 0;
            const sellingNet = Number(b.bundleProduct.sellingPrice ?? 0);
            const discount = Number(b.discountAmount ?? 0);
            const finalNet = Math.max(0, sellingNet - discount);
            const taxApplies = b.bundleProduct.taxType !== "TAX_FREE";
            const finalGross = taxApplies
              ? Math.round(finalNet * 1.1)
              : finalNet;
            const sellingGross = taxApplies
              ? Math.round(sellingNet * 1.1)
              : sellingNet;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => togglePick(b)}
                className={`flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors ${
                  active
                    ? "border-[var(--jm-action)] bg-[var(--jm-bg)]"
                    : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)]"
                }`}
              >
                {b.bundleProduct.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={b.bundleProduct.imageUrl}
                    alt={b.bundleProduct.name}
                    className="size-14 shrink-0 rounded-xl bg-[var(--jm-surface-muted)] object-cover"
                  />
                ) : (
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-[var(--jm-surface-muted)] text-[var(--jm-text-subtle)]">
                    <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
                      <path
                        d="M3 6l7-4 7 4v8l-7 4-7-4V6z"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="line-clamp-1 text-[14px] font-semibold text-[var(--jm-text)]">
                    {b.bundleProduct.name}
                  </span>
                  <span className="font-mono text-[11px] text-[var(--jm-text-muted)]">
                    {b.bundleProduct.sku}
                  </span>
                  {b.recommendMessage && (
                    <span className="mt-0.5 line-clamp-1 text-[11px] text-[var(--jm-text-muted)]">
                      {b.recommendMessage}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  {discount > 0 && (
                    <span className="text-[10px] tabular-nums text-[var(--jm-text-subtle)] line-through">
                      ₩{sellingGross.toLocaleString("ko-KR")}
                    </span>
                  )}
                  <span className="text-[14px] font-semibold tabular-nums text-[var(--jm-text)]">
                    ₩{finalGross.toLocaleString("ko-KR")}
                  </span>
                  {active && (
                    <span className="rounded-full bg-[var(--jm-action)] px-2 py-0.5 text-[10px] font-semibold text-white">
                      ×{qty}
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </BottomSheet>
  );
}
