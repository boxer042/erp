"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
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

interface ProductOptionValueData {
  id: string;
  label: string;
  addPrice: string;
  /** SWAP: 메인 라인 productId 교체 / ADDON: 자식 OrderItem 추가 */
  mappedMode: "SWAP" | "ADDON";
  /** mappedProduct — SWAP 시 메인 라인 단가/정가/세금 모두 이걸로 교체. ADDON 시엔 자식 라인 가격 출처 */
  mappedProduct: {
    id: string;
    name: string;
    sku: string;
    sellingPrice?: string;
    listPrice?: string;
    taxType?: "TAXABLE" | "TAX_FREE";
  } | null;
  mappedVariant: { id: string; name: string; sku: string } | null;
}

interface ProductOptionData {
  id: string;
  name: string;
  required: boolean;
  values: ProductOptionValueData[];
}

interface ProductDetailResponse {
  id: string;
  name: string;
  isCanonical: boolean;
  variants: VariantOption[];
  productOptions: ProductOptionData[];
}

export interface VariantOptionSelections {
  /** variant 가 선택됐을 때만 — 카트 라인의 productId/name/sku/baseUnitPrice 갱신 */
  variant?: { id: string; name: string; sku: string; unitPrice: number };
  /** 선택된 옵션값 ID 전체 — 결제 시 서버 source of truth (SWAP/ADDON 분기는 서버가 mappedMode 보고 처리) */
  optionValueIds: string[];
  /** {옵션명: 라벨} — 비매핑 + ADDON + SWAP 모두 보존. 메인 라인 부속 텍스트 표시용 */
  optionSnapshot: Record<string, string>;
  /** 비매핑 옵션값(단순 텍스트 / mappedVariantId) addPrice 합계 — 메인 unitPrice 에 가산 */
  nonMappedAddPriceSum: number;
  /**
   * SWAP 모드 옵션값 — 메인 카트 라인의 productId/이름/단가/정가/세금을 swap 된 SKU 로 교체.
   * 슬롯당 1선택이라 보통 길이 0~1.
   */
  swap?: {
    optionValueId: string;
    productId: string;
    name: string;
    sku?: string;
    sellingPrice: number;
    listPrice?: number;
    taxType?: "TAXABLE" | "TAX_FREE";
  };
  /** ADDON 모드 옵션값(mappedProductId + ADDON) — 카트에서 별도 자식 행으로 표시 */
  optionRefs: Array<{
    optionValueId: string;
    productId: string;
    name: string;
    sku?: string;
    addPrice: number;
    taxType?: "TAXABLE" | "TAX_FREE";
    isZeroRate?: boolean;
  }>;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 카트 라인의 현재 productId — 변형/옵션 fetch 기준. canonical 또는 옵션 보유 상품 */
  productId: string;
  /** 라인이 isCanonical 이면 변형 미확정. 결제 차단 + 시트 변형 섹션 노출 */
  needsVariant: boolean;
  /** 현재 라인의 selectedOptionValueIds — 시트 열 때 selection 복원 */
  initialOptionValueIds?: string[];
  onConfirm: (selections: VariantOptionSelections) => void;
}

/**
 * 변형(variant) + 고객 옵션(ProductOption) 선택 통합 시트.
 *
 * - canonical 상품: variant 섹션 노출 — 결제 전 반드시 선택 (canonical 그대로 결제 차단)
 * - 옵션 등록 상품: 옵션 슬롯별 single-select 노출
 * - 둘 다 있는 상품: variant 섹션 위 + 옵션 섹션 아래
 *
 * confirm 시 부모는 sessions-context.applySelections 호출 → 카트 라인 갱신 + 단가 재계산.
 */
export function VariantSelectSheet({
  open,
  onOpenChange,
  productId,
  needsVariant,
  initialOptionValueIds,
  onConfirm,
}: Props) {
  if (!open) return null;
  return (
    <Body
      onOpenChange={onOpenChange}
      productId={productId}
      needsVariant={needsVariant}
      initialOptionValueIds={initialOptionValueIds}
      onConfirm={onConfirm}
    />
  );
}

function Body({
  onOpenChange,
  productId,
  needsVariant,
  initialOptionValueIds,
  onConfirm,
}: Omit<Props, "open">) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  // 옵션 슬롯별 선택 — { optionId: optionValueId | "" }
  const [optionSelection, setOptionSelection] = useState<Record<string, string>>({});
  // product fetch 후 한 번만 initialOptionValueIds 로 selection 복원 — 무한 루프 방지
  const initializedRef = useRef(false);

  const productQuery = useQuery<ProductDetailResponse>({
    queryKey: ["pos", "variant-options", productId],
    queryFn: () =>
      apiGet<ProductDetailResponse>(
        `/api/products/${productId}/variant-picker`,
      ),
    // 슬림 엔드포인트 — variant/option 정보는 결제 한 번에 거의 안 바뀌므로 5분 캐시.
    // 같은 카트 안에서 여러 라인 변형 선택해도 매번 fetch 안 함.
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });

  const product = productQuery.data;
  const variants = product?.variants ?? [];
  const productOptions = product?.productOptions ?? [];

  // 옵션 selection 초기화 — product fetch 완료 직후 1회만.
  // 우선순위:
  //   1) initialOptionValueIds 가 있으면 그대로 복원 (사용자가 이전에 선택한 옵션)
  //   2) 없으면 default 자동 선택:
  //      - productId 와 일치하는 SWAP 옵션값 (이미 swap 된 SKU 가 카트에 있으면 그 옵션값 활성)
  //      - 없으면 슬롯의 첫 번째 옵션값 (운영자가 default 를 첫 값으로 두는 컨벤션)
  useEffect(() => {
    if (!product) return;
    if (initializedRef.current) return;
    initializedRef.current = true;
    const init: Record<string, string> = {};
    if (initialOptionValueIds && initialOptionValueIds.length > 0) {
      for (const opt of product.productOptions) {
        const matched = opt.values.find((v) =>
          initialOptionValueIds.includes(v.id),
        );
        if (matched) init[opt.id] = matched.id;
      }
    } else {
      for (const opt of product.productOptions) {
        // 카트 라인 productId 와 매칭되는 SWAP 옵션값 우선
        const swapMatch = opt.values.find(
          (v) => v.mappedMode === "SWAP" && v.mappedProduct?.id === product.id,
        );
        if (swapMatch) {
          init[opt.id] = swapMatch.id;
        } else if (opt.values.length > 0) {
          // 매칭 없으면 첫 번째 옵션값 (보통 self / 기본 옵션)
          init[opt.id] = opt.values[0].id;
        }
      }
    }
    if (Object.keys(init).length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 의도된 동기화/리셋 이펙트 (서버데이터→편집폼 seed / 닫힐때 리셋 / URL prefill 등). 파생값 아님
      setOptionSelection(init);
    }
  }, [product, initialOptionValueIds]);

  const { nonMappedAdd, swap, mappedRefs, snapshot, valueIds, totalAddDisplay, swapPriceDelta } = useMemo(() => {
    let nonMapped = 0;
    let totalAdd = 0;
    const snap: Record<string, string> = {};
    const ids: string[] = [];
    const refs: VariantOptionSelections["optionRefs"] = [];
    let swapPick: VariantOptionSelections["swap"] | undefined;
    let swapDelta = 0;
    for (const opt of productOptions) {
      const valueId = optionSelection[opt.id];
      if (!valueId) continue;
      const value = opt.values.find((v) => v.id === valueId);
      if (!value) continue;
      ids.push(valueId);
      const addPrice = Number(value.addPrice) || 0;
      // 옵션 라벨은 모드 무관 항상 보존 (메인 부속 텍스트 표시)
      snap[opt.name] = value.label;
      if (value.mappedProduct) {
        if (value.mappedMode === "SWAP") {
          // SWAP — 메인 라인 productId/단가/정가/세금 교체. mappedProduct.sellingPrice 가 우선.
          const sellingPrice = Number(value.mappedProduct.sellingPrice ?? 0);
          const listPrice = value.mappedProduct.listPrice
            ? Number(value.mappedProduct.listPrice)
            : undefined;
          swapPick = {
            optionValueId: value.id,
            productId: value.mappedProduct.id,
            name: value.mappedProduct.name,
            sku: value.mappedProduct.sku,
            sellingPrice,
            listPrice,
            taxType: value.mappedProduct.taxType,
          };
          swapDelta = sellingPrice;
        } else {
          // ADDON — 별도 자식 행으로
          refs.push({
            optionValueId: value.id,
            productId: value.mappedProduct.id,
            name: value.mappedProduct.name,
            sku: value.mappedProduct.sku,
            addPrice,
          });
          totalAdd += addPrice;
        }
      } else {
        // 단순 텍스트 / mappedVariant — 메인 라인 가산
        nonMapped += addPrice;
        totalAdd += addPrice;
      }
    }
    return {
      nonMappedAdd: nonMapped,
      swap: swapPick,
      mappedRefs: refs,
      snapshot: snap,
      valueIds: ids,
      totalAddDisplay: totalAdd,
      swapPriceDelta: swapDelta,
    };
  }, [productOptions, optionSelection]);
  void swapPriceDelta;

  // 필수 옵션 슬롯 미선택이면 confirm 비활성
  const missingRequired = productOptions.some(
    (opt) => opt.required && !optionSelection[opt.id],
  );
  const variantMissing = needsVariant && !selectedVariantId;
  const canConfirm =
    !productQuery.isPending && !variantMissing && !missingRequired;

  const confirm = () => {
    if (!canConfirm) return;
    const variant = selectedVariantId
      ? variants.find((v) => v.id === selectedVariantId)
      : null;
    onConfirm({
      variant: variant
        ? {
            id: variant.id,
            name: variant.name,
            sku: variant.sku,
            unitPrice: parseFloat(variant.sellingPrice) || 0,
          }
        : undefined,
      optionValueIds: valueIds,
      optionSnapshot: snapshot,
      nonMappedAddPriceSum: nonMappedAdd,
      swap,
      optionRefs: mappedRefs,
    });
    onOpenChange(false);
  };

  const showVariants = needsVariant || variants.length > 0;
  const hasContent = showVariants || productOptions.length > 0;

  return (
    <BottomSheet
      open
      onOpenChange={onOpenChange}
      title={
        showVariants && productOptions.length > 0
          ? `변형·옵션 — ${product?.name ?? ""}`
          : showVariants
            ? `변형 선택 — ${product?.name ?? ""}`
            : `옵션 선택 — ${product?.name ?? ""}`
      }
      footer={
        <div className="flex w-full items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-14 items-center justify-center rounded-2xl border-2 border-[var(--jm-border)] bg-[var(--jm-surface)] px-5 text-jm-base font-medium text-[var(--jm-text-muted)]"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!canConfirm}
            className="flex h-14 flex-1 items-center justify-center rounded-2xl bg-[var(--jm-action)] text-jm-lg font-semibold text-white disabled:opacity-40"
          >
            변경
            {totalAddDisplay > 0 && (
              <span className="ml-1 text-white/80">
                (+₩{totalAddDisplay.toLocaleString("ko-KR")})
              </span>
            )}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5 pt-2">
        {productQuery.isPending ? (
          <div className="py-8 text-center text-jm-xs text-[var(--jm-text-subtle)]">
            불러오는 중…
          </div>
        ) : !hasContent ? (
          <div className="py-8 text-center text-jm-xs text-[var(--jm-text-subtle)]">
            선택할 변형/옵션이 없습니다 — 상품 페이지에서 추가
          </div>
        ) : (
          <>
            {/* 변형 섹션 */}
            {showVariants && (
              <section className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between px-1">
                  <span className="text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
                    변형 (variant)
                  </span>
                  {needsVariant && (
                    <span className="text-jm-3xs text-[var(--jm-warning-fg)]">
                      필수
                    </span>
                  )}
                </div>
                {variants.length === 0 ? (
                  <div className="rounded-2xl bg-[var(--jm-surface-muted)] py-6 text-center text-jm-xs text-[var(--jm-text-subtle)]">
                    등록된 변형이 없습니다
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {variants.map((v) => {
                      const active = selectedVariantId === v.id;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setSelectedVariantId(v.id)}
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
                              <Package className="size-5" />
                            </div>
                          )}
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="line-clamp-1 text-jm-base font-semibold text-[var(--jm-text)]">
                              {v.name}
                            </span>
                            <span className="font-mono text-jm-2xs text-[var(--jm-text-muted)]">
                              {v.sku}
                            </span>
                            {v.variableComponents && v.variableComponents.length > 0 && (
                              <span className="line-clamp-1 mt-0.5 text-jm-2xs text-[var(--jm-text-muted)]">
                                {v.variableComponents
                                  .map((c) => `${c.slotLabel}: ${c.componentName}`)
                                  .join(" · ")}
                              </span>
                            )}
                          </div>
                          <span className="shrink-0 text-jm-base font-semibold tabular-nums text-[var(--jm-text)]">
                            ₩{(parseFloat(v.sellingPrice) || 0).toLocaleString("ko-KR")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* 고객 옵션 섹션 */}
            {productOptions.length > 0 && (
              <section className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between px-1">
                  <span className="text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
                    고객 옵션
                  </span>
                </div>
                <div className="flex flex-col gap-3">
                  {productOptions.map((opt) => (
                    <OptionSlot
                      key={opt.id}
                      option={opt}
                      selectedId={optionSelection[opt.id] ?? ""}
                      onSelect={(valueId) =>
                        setOptionSelection((prev) => ({
                          ...prev,
                          [opt.id]: valueId,
                        }))
                      }
                    />
                  ))}
                </div>
                {missingRequired && (
                  <div className="rounded-xl bg-[var(--jm-warning-bg)] px-3 py-2 text-jm-2xs text-[var(--jm-warning-fg)]">
                    ⚠ 필수 옵션 슬롯을 모두 선택해주세요
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  );
}

/** 옵션 슬롯 1개 — 값 chips. mappedProduct 가 있으면 가격 라벨 옆 "→ 상품명" 부속 텍스트. */
function OptionSlot({
  option,
  selectedId,
  onSelect,
}: {
  option: ProductOptionData;
  selectedId: string;
  onSelect: (valueId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-1.5 px-1">
        <span className="text-jm-sm font-semibold text-[var(--jm-text)]">
          {option.name}
        </span>
        {option.required && (
          <span className="text-jm-3xs font-semibold text-[var(--jm-danger-fg)]">
            필수
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {option.values.map((v) => {
          const active = selectedId === v.id;
          const addPrice = Number(v.addPrice) || 0;
          const mapped = v.mappedProduct ?? v.mappedVariant;
          // 가격 표시 우선순위 (결제 처리와는 별개 — 결제는 항상 SWAP 의 mappedProduct.sellingPrice 우선):
          //  - addPrice > 0 → "+₩addPrice" (운영자가 직접 입력한 표시용 차액)
          //  - SWAP + mappedProduct.sellingPrice > 0 → "₩sellingPrice" (절대값, addPrice 0 일 때 폴백)
          //  - 그 외 → 표시 없음
          const isSwap = v.mappedMode === "SWAP" && !!v.mappedProduct;
          const swapPrice = isSwap
            ? Number(v.mappedProduct?.sellingPrice ?? 0)
            : 0;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onSelect(v.id)}
              className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left transition-colors ${
                active
                  ? "border-[var(--jm-action)] bg-[var(--jm-bg)]"
                  : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)]"
              }`}
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="line-clamp-1 text-jm-sm font-semibold text-[var(--jm-text)]">
                  {v.label}
                </span>
                {mapped && (
                  <span className="line-clamp-1 text-jm-2xs text-[var(--jm-text-muted)]">
                    → {mapped.name}
                  </span>
                )}
              </div>
              {addPrice > 0 ? (
                <span className="shrink-0 text-jm-xs font-semibold tabular-nums text-[var(--jm-text)]">
                  +₩{addPrice.toLocaleString("ko-KR")}
                </span>
              ) : isSwap && swapPrice > 0 ? (
                <span className="shrink-0 text-jm-xs font-semibold tabular-nums text-[var(--jm-text)]">
                  ₩{swapPrice.toLocaleString("ko-KR")}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
