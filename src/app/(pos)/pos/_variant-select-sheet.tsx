"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { BottomSheet } from "./_components/bottom-sheet";

interface VariantOption {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
  imageUrl: string | null;
  variableComponents?: { slotLabel: string; componentName: string }[];
}

interface ProductDetailResponse {
  id: string;
  name: string;
  isCanonical: boolean;
  variants: VariantOption[];
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 카트 라인의 현재 (canonical) productId — 변형 옵션 fetch 기준 */
  canonicalProductId: string;
  /** variant 선택 후 부모에게 알림 — sessions-context.assignVariant 호출 */
  onSelect: (variant: {
    id: string;
    name: string;
    sku: string;
    unitPrice: number;
  }) => void;
}

/**
 * 변형(variant) 선택 시트 — canonical 카트 라인의 우측 "선택" 버튼으로 진입.
 * 결제 전에 반드시 variant 확정 필요 (canonical 그대로 결제 차단).
 */
export function VariantSelectSheet({
  open,
  onOpenChange,
  canonicalProductId,
  onSelect,
}: Props) {
  if (!open) return null;
  return (
    <Body
      onOpenChange={onOpenChange}
      canonicalProductId={canonicalProductId}
      onSelect={onSelect}
    />
  );
}

function Body({
  onOpenChange,
  canonicalProductId,
  onSelect,
}: Omit<Props, "open">) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const productQuery = useQuery<ProductDetailResponse>({
    queryKey: ["pos", "variants", canonicalProductId],
    queryFn: () => apiGet<ProductDetailResponse>(`/api/products/${canonicalProductId}`),
  });

  const product = productQuery.data;
  const variants = product?.variants ?? [];

  const confirm = () => {
    const v = variants.find((x) => x.id === selectedId);
    if (!v) return;
    onSelect({
      id: v.id,
      name: v.name,
      sku: v.sku,
      unitPrice: parseFloat(v.sellingPrice) || 0,
    });
    onOpenChange(false);
  };

  return (
    <BottomSheet
      open
      onOpenChange={onOpenChange}
      title={`변형 선택 — ${product?.name ?? ""}`}
      footer={
        <button
          type="button"
          onClick={confirm}
          disabled={!selectedId}
          className="flex h-14 w-full items-center justify-center rounded-2xl bg-[var(--jm-action)] text-[16px] font-semibold text-white disabled:opacity-40"
        >
          확정
        </button>
      }
    >
      <div className="flex flex-col gap-2 pt-2">
        {productQuery.isPending ? (
          <div className="py-8 text-center text-[12px] text-[var(--jm-text-subtle)]">
            불러오는 중…
          </div>
        ) : variants.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-[var(--jm-text-subtle)]">
            등록된 변형이 없습니다 — 상품 페이지에서 추가
          </div>
        ) : (
          variants.map((v) => {
            const active = selectedId === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedId(v.id)}
                className={`flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors ${
                  active
                    ? "border-[var(--jm-action)] bg-[var(--jm-bg)]"
                    : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)]"
                }`}
              >
                {v.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={v.imageUrl}
                    alt={v.name}
                    className="size-12 shrink-0 rounded-xl bg-[var(--jm-surface-muted)] object-cover"
                  />
                ) : (
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[var(--jm-surface-muted)] text-[var(--jm-text-subtle)]">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
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
                    {v.name}
                  </span>
                  <span className="font-mono text-[11px] text-[var(--jm-text-muted)]">
                    {v.sku}
                  </span>
                  {v.variableComponents && v.variableComponents.length > 0 && (
                    <span className="line-clamp-1 mt-0.5 text-[11px] text-[var(--jm-text-muted)]">
                      {v.variableComponents
                        .map((c) => `${c.slotLabel}: ${c.componentName}`)
                        .join(" · ")}
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-[14px] font-semibold tabular-nums text-[var(--jm-text)]">
                  ₩{(parseFloat(v.sellingPrice) || 0).toLocaleString("ko-KR")}
                </span>
              </button>
            );
          })
        )}
      </div>
    </BottomSheet>
  );
}
