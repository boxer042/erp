"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  JmButton,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmSpinner,
} from "@/jm";

/**
 * 변형/옵션 미확정 OrderItem 들을 일괄 해결하는 다이얼로그.
 *
 * 두 가지 케이스 통합 처리:
 *  - canonical(대표상품) → variant 선택
 *  - OPTION_PARENT → SWAP 옵션값의 mappedProduct 선택
 *
 * 사용처:
 *  1) 주문 상세 시트 — 라인 옆 [출고 SKU 선택] 버튼 (단일)
 *  2) 워크보드 — [출고대기] 누를 때 prepare 가드 에러 응답으로 일괄 해결
 *
 * 결과:
 *  - 각 항목별 PUT /api/orders/{orderId}/items/{itemId} { variantProductId }
 *  - 모두 성공 시 onResolved 콜백 (호출 측이 prepare 재시도 또는 데이터 갱신)
 */
interface UnresolvedItem {
  itemId: string;
  /** 현재 productId — 대표/OPTION_PARENT */
  productId: string;
  /** 현재 productName — 다이얼로그 헤더 표시용 */
  productName: string;
  /** "canonical" | "option_parent" — 라벨 분기 */
  kind: "canonical" | "option_parent";
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string;
  items: UnresolvedItem[];
  /** 모든 항목 해결 완료 시 호출. 호출 측이 prepare 재시도하거나 detail invalidate */
  onResolved?: () => void;
  /** 모두 해결됐을 때 footer 의 "확인 후 출고대기 재시도" 라벨 */
  retryLabel?: string;
}

interface VariantOptionRow {
  /** 실제 출고 SKU productId */
  productId: string;
  /** UI 라벨 — "수냉 데스크톱 (DT-COOL)" 또는 "화이트 (가습기-화이트)" */
  label: string;
  /** 부속 — SKU + 가격 */
  sku: string;
  price: number;
  /** 옵션 라벨 (OPTION_PARENT 의 경우 옵션 슬롯 + 값 라벨) — variant 케이스는 비어있음 */
  optionMeta?: string;
}

interface ProductDetailLite {
  id: string;
  name: string;
  isCanonical: boolean;
  productType:
    | "FINISHED"
    | "PARTS"
    | "SET"
    | "ASSEMBLED"
    | "OPTION_PARENT";
  variants: Array<{
    id: string;
    name: string;
    sku: string;
    sellingPrice: string | number;
  }>;
  productOptions: Array<{
    id: string;
    name: string;
    values: Array<{
      id: string;
      label: string;
      mappedMode: "SWAP" | "ADDON";
      mappedProduct: {
        id: string;
        name: string;
        sku: string;
        sellingPrice?: string | number;
      } | null;
    }>;
  }>;
}

function deriveOptions(
  product: ProductDetailLite,
  kind: "canonical" | "option_parent",
): VariantOptionRow[] {
  if (kind === "canonical") {
    return product.variants.map((v) => ({
      productId: v.id,
      label: v.name,
      sku: v.sku,
      price: Number(v.sellingPrice) || 0,
    }));
  }
  // OPTION_PARENT — 모든 옵션 슬롯 안의 SWAP + mappedProduct 값을 뽑아 평탄화
  const out: VariantOptionRow[] = [];
  for (const opt of product.productOptions) {
    for (const v of opt.values) {
      if (v.mappedMode !== "SWAP" || !v.mappedProduct) continue;
      out.push({
        productId: v.mappedProduct.id,
        label: v.mappedProduct.name,
        sku: v.mappedProduct.sku,
        price: Number(v.mappedProduct.sellingPrice ?? 0) || 0,
        optionMeta: `${opt.name} · ${v.label}`,
      });
    }
  }
  return out;
}

export function VariantResolveDialog({
  open,
  onOpenChange,
  orderId,
  items,
  onResolved,
  retryLabel,
}: Props) {
  const qc = useQueryClient();
  // itemId → 선택된 productId
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // 다이얼로그 닫힐 때 선택 초기화
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 의도된 동기화/리셋 이펙트 (서버데이터→편집폼 seed / 닫힐때 리셋 / URL prefill 등). 파생값 아님
      setSelections({});
      setSubmitting(false);
    }
  }, [open]);

  // 각 미확정 라인의 product 디테일을 병렬 fetch
  const productQueries = useQueries({
    queries: items.map((it) => ({
      queryKey: ["order-variant-resolve", it.productId],
      queryFn: () => apiGet<ProductDetailLite>(`/api/products/${it.productId}`),
      enabled: open,
      staleTime: 1000 * 60,
    })),
  });

  const allLoaded = productQueries.every((q) => !q.isPending);
  const anyError = productQueries.some((q) => q.isError);

  const lines = useMemo(() => {
    return items.map((it, idx) => {
      const q = productQueries[idx];
      const product = q.data;
      const options = product ? deriveOptions(product, it.kind) : [];
      return { item: it, product, options, loading: q.isPending };
    });
  }, [items, productQueries]);

  const allSelected = items.every((it) => !!selections[it.itemId]);

  const submit = async () => {
    if (!allSelected) return;
    setSubmitting(true);
    try {
      // 항목별 순차 PUT — 동시 update 시 prisma 락 충돌 회피
      for (const it of items) {
        await apiMutate(`/api/orders/${orderId}/items/${it.itemId}`, "PUT", {
          variantProductId: selections[it.itemId],
        });
      }
      toast.success(
        items.length === 1
          ? "출고 SKU 가 확정됐습니다"
          : `${items.length}개 항목의 출고 SKU 가 확정됐습니다`,
      );
      qc.invalidateQueries({ queryKey: queryKeys.orders.all });
      onResolved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "출고 SKU 확정에 실패했습니다",
      );
      setSubmitting(false);
    }
  };

  return (
    <JmDialog open={open} onOpenChange={onOpenChange}>
      <JmDialogContent size="xl">
        <JmDialogHeader>
          <JmDialogTitle>
            출고 SKU 선택
            {items.length > 1 ? ` (${items.length}건)` : ""}
          </JmDialogTitle>
          <p className="text-jm-xs text-[var(--jm-text-muted)]">
            출고대기 진입 전 실제 출고할 변형/옵션을 선택해주세요. POS 의 변형
            선택과 동일한 흐름입니다.
          </p>
        </JmDialogHeader>

        <JmDialogBody className="flex flex-col gap-4">
          {!allLoaded ? (
            <div className="flex items-center justify-center gap-2 py-10 text-[var(--jm-text-muted)]">
              <JmSpinner />
              <span className="text-jm-sm">상품 정보 불러오는 중…</span>
            </div>
          ) : anyError ? (
            <div className="rounded-lg bg-[var(--jm-danger-bg)] px-3 py-3 text-jm-sm text-[var(--jm-danger-fg)]">
              상품 정보를 불러오지 못했습니다 — 다시 시도해주세요
            </div>
          ) : (
            lines.map((line) => (
              <ItemBlock
                key={line.item.itemId}
                item={line.item}
                options={line.options}
                selected={selections[line.item.itemId] ?? ""}
                onSelect={(productId) =>
                  setSelections((prev) => ({
                    ...prev,
                    [line.item.itemId]: productId,
                  }))
                }
              />
            ))
          )}
        </JmDialogBody>

        <JmDialogFooter>
          <JmButton
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            닫기
          </JmButton>
          <JmButton
            variant="cta"
            onClick={submit}
            disabled={!allSelected || submitting || !allLoaded}
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {retryLabel ?? "확정"}
          </JmButton>
        </JmDialogFooter>
      </JmDialogContent>
    </JmDialog>
  );
}

function ItemBlock({
  item,
  options,
  selected,
  onSelect,
}: {
  item: UnresolvedItem;
  options: VariantOptionRow[];
  selected: string;
  onSelect: (productId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] p-3">
      <div className="flex items-baseline gap-2">
        <span className="rounded-full bg-[var(--jm-warning-bg)] px-2 py-0.5 text-jm-3xs font-semibold text-[var(--jm-warning-fg)]">
          {item.kind === "canonical" ? "대표상품" : "옵션 placeholder"}
        </span>
        <span className="text-jm-sm font-semibold text-[var(--jm-text)]">
          {item.productName}
        </span>
      </div>
      {options.length === 0 ? (
        <div className="rounded-jm-sm bg-[var(--jm-bg)] px-3 py-2 text-jm-xs text-[var(--jm-text-muted)]">
          {item.kind === "canonical"
            ? "등록된 변형이 없습니다 — 상품 페이지에서 추가하거나 항목 편집으로 다른 SKU 로 교체해주세요"
            : "SWAP 옵션값이 없습니다 — 상품 페이지에서 옵션 슬롯에 mappedProduct(SWAP) 옵션값을 등록해주세요"}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {options.map((opt) => {
            const active = selected === opt.productId;
            return (
              <button
                key={opt.productId}
                type="button"
                onClick={() => onSelect(opt.productId)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                  active
                    ? "border-[var(--jm-action)] bg-[var(--jm-bg)]"
                    : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)]"
                }`}
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="line-clamp-1 text-jm-sm font-semibold text-[var(--jm-text)]">
                    {opt.label}
                  </span>
                  <span className="font-mono text-jm-xs text-[var(--jm-text-muted)]">
                    {opt.sku}
                    {opt.optionMeta ? ` · ${opt.optionMeta}` : ""}
                  </span>
                </div>
                <span className="shrink-0 text-jm-sm font-semibold tabular-nums text-[var(--jm-text)]">
                  ₩{opt.price.toLocaleString("ko-KR")}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
