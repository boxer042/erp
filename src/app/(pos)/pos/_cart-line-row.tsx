"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Package } from "lucide-react";
import { useSessions, type CartItem } from "@/components/pos/sessions-context";
import { PosLineItemRow } from "@/components/pos/line-item-row";
import { PriceInputDialog } from "./_components/price-input-dialog";
import { VariantSelectSheet } from "./_variant-select-sheet";
import { AddonRecommendSheet, type AddonSelection } from "./_addon-recommend-sheet";

interface Props {
  item: CartItem;
  sessionId: string;
  /** 표시 모드 — net=세전, gross=VAT 포함 (하단 합계 카드에서 토글) */
  display?: "net" | "gross";
}

/**
 * 카트 라인 행 — 모바일 친화 큰 ± 버튼, 단가 클릭으로 가격 다이얼로그.
 * shadcn 0개. 상품/임대/수리 라인 모두 처리 가능 (itemType 별 사소한 분기).
 *
 * 변형/옵션 트리거: isCanonical(변형 미확정) 또는 hasProductOptions(옵션 슬롯 보유)일 때.
 * 클릭 시 VariantSelectSheet 가 두 케이스 모두 처리 (variant 섹션 + 옵션 슬롯 섹션).
 */
export function CartLineRow({ item, sessionId, display = "gross" }: Props) {
  const { remove, updateQty, updateUnitPrice, applySelections, toggleZeroRate, add } = useSessions();
  const [priceOpen, setPriceOpen] = useState(false);
  const [totalOpen, setTotalOpen] = useState(false);
  const [variantOpen, setVariantOpen] = useState(false);
  const [addonOpen, setAddonOpen] = useState(false);
  // 추가구매 버튼은 메인 product 라인만 (ADDON 자식 라인은 자기 자식 가질 수 없음, 서비스 라인은 무관)
  const showAddonTrigger =
    !item.isAddon && item.itemType === "product" && !!item.productId;

  const optionSummary =
    item.optionSnapshot && Object.keys(item.optionSnapshot).length > 0
      ? Object.values(item.optionSnapshot).join(" · ")
      : null;
  const showSelectTrigger =
    !!item.productId &&
    (item.isCanonical || item.isOptionParent || !!item.hasProductOptions);
  const triggerLabel = item.isCanonical
    ? "변형 선택"
    : item.isOptionParent
      ? "옵션 선택 필수"
      : optionSummary
        ? "옵션 변경"
        : "옵션 선택";
  const triggerWarn = item.isCanonical || item.isOptionParent;

  const isBulk = !!item.isBulk;
  const taxType = item.taxType ?? "TAXABLE";
  const taxApplies = taxType === "TAXABLE" && !item.isZeroRate;

  const unitNet = item.unitPrice;
  const unitGross = taxApplies ? Math.round(unitNet * 1.1) : unitNet;
  const unitDisplay = display === "net" ? unitNet : unitGross;

  const lineNet = unitNet * item.quantity;
  const lineGross = taxApplies ? Math.round(lineNet * 1.1) : lineNet;
  const lineDisplay = display === "net" ? lineNet : lineGross;

  // 정가 비교 — 옵션 가산을 제외한 메인 base 가격으로 비교 (옵션 추가가 할인처럼 보이는 사고 방지).
  // 할인(정가보다 싸게)일 때만 표시. 인상(정가보다 비싸게)은 손님과 함께 보는 화면이라 노출 안 함.
  const optionAdd = item.optionAddPriceSum ?? 0;
  const baseUnitNet = Math.max(0, unitNet - optionAdd);
  const listNet = item.listPrice && item.listPrice > 0 ? item.listPrice : null;
  const showListDiff = listNet !== null && baseUnitNet < (listNet as number);
  const listDiff = showListDiff ? baseUnitNet - (listNet as number) : 0;
  const listDiffPercent = showListDiff && listNet
    ? Math.round(((baseUnitNet - listNet) / listNet) * 1000) / 10
    : 0;
  const listDisplay =
    showListDiff && listNet !== null
      ? display === "net"
        ? listNet
        : taxApplies
          ? Math.round(listNet * 1.1)
          : listNet
      : 0;

  const setQty = (next: number) => {
    const min = isBulk ? 0.0001 : 1;
    updateQty(item.cartItemId, Math.max(min, next), sessionId);
  };

  return (
    <>
      <PosLineItemRow
        className={
          item.isAddon
            ? "ml-6 border-l-2 border-l-[var(--jm-border-strong)] pl-3 pr-4 bg-[var(--jm-bg)]"
            : undefined
        }
        image={
          item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt={item.name}
              className="size-12 shrink-0 rounded-xl bg-[var(--jm-surface-muted)] object-cover"
            />
          ) : (
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[var(--jm-surface-muted)] text-[var(--jm-text-subtle)]">
              <Package className="size-5" />
            </div>
          )
        }
        name={item.name}
        sku={item.sku}
        headerBelow={
          <>
            {/* 옵션 표시 — 옵션 변경 버튼 바로 위 별도 줄 (상품명 부속 텍스트보다 가독성 높음) */}
            {optionSummary && (
              <span className="mt-0.5 line-clamp-1 text-jm-2xs text-[var(--jm-text-muted)]">
                옵션: <span className="font-medium text-[var(--jm-text)]">{optionSummary}</span>
              </span>
            )}
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              {item.isAddon && (
                <span className="inline-flex items-center rounded-full bg-[var(--jm-surface)] px-2 py-0.5 text-jm-3xs font-semibold text-[var(--jm-text-muted)] border border-[var(--jm-border)]">
                  추가구매
                </span>
              )}
              {item.itemType === "service" && (
                <span className="inline-flex items-center rounded-full bg-[var(--jm-surface-muted)] px-2 py-0.5 text-jm-3xs font-semibold text-[var(--jm-text-muted)]">
                  기술료
                </span>
              )}
              {/* 서비스로 지급 — 0원 무상 제공 (영수증/명세표에서도 동일 배지) */}
              {item.isService && (
                <span className="inline-flex items-center rounded-full bg-[var(--jm-success-bg)] px-2 py-0.5 text-jm-3xs font-semibold text-[var(--jm-success-fg)]">
                  서비스
                </span>
              )}
              {taxType === "TAX_FREE" && (
                <span className="inline-flex items-center rounded-full bg-[var(--jm-surface-muted)] px-2 py-0.5 text-jm-3xs font-medium text-[var(--jm-text-muted)]">
                  면세
                </span>
              )}
              {/* 영세율 토글 — zeroRateEligible 상품만 노출 */}
              {item.zeroRateEligible && (
                <button
                  type="button"
                  onClick={() => toggleZeroRate(item.cartItemId, sessionId)}
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-jm-3xs font-medium transition-colors ${
                    item.isZeroRate
                      ? "bg-[var(--jm-success-bg)] text-[var(--jm-success-fg)]"
                      : "bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] hover:bg-[var(--jm-border)]"
                  }`}
                >
                  영세율 {item.isZeroRate ? "ON" : "OFF"}
                </button>
              )}
              {showSelectTrigger && (
                <button
                  type="button"
                  onClick={() => setVariantOpen(true)}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-jm-3xs font-bold transition-colors ${
                    triggerWarn
                      ? "bg-[var(--jm-warning-bg)] text-[var(--jm-warning-fg)] hover:bg-[var(--jm-warning-solid)]/20"
                      : "bg-[var(--jm-surface-muted)] text-[var(--jm-text)] hover:bg-[var(--jm-border)]"
                  }`}
                >
                  {triggerWarn && <span>⚠</span>}
                  <span>{triggerLabel}</span>
                </button>
              )}
              {showAddonTrigger && (
                <button
                  type="button"
                  onClick={() => setAddonOpen(true)}
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--jm-surface-muted)] px-2 py-0.5 text-jm-3xs font-bold text-[var(--jm-text)] transition-colors hover:bg-[var(--jm-border)]"
                  title="이 상품과 함께 사면 좋은 추가구매 추천"
                >
                  <span>+</span>
                  <span>추가구매</span>
                </button>
              )}
            </div>
          </>
        }
        onDelete={() => remove(item.cartItemId, sessionId)}
        unitPriceLabel={`단가 ${display === "net" ? "(세전)" : "(VAT 포함)"}`}
        unitPrice={
          <>
            <div className="flex items-baseline gap-1.5">
              {showListDiff && (
                <span className="text-jm-2xs tabular-nums text-[var(--jm-text-subtle)] line-through">
                  ₩{listDisplay.toLocaleString("ko-KR")}
                </span>
              )}
              <span>₩{unitDisplay.toLocaleString("ko-KR")}</span>
            </div>
            {showListDiff && (
              <span className="text-jm-3xs font-semibold tabular-nums text-[var(--jm-success-fg)]">
                −₩{Math.abs(listDiff).toLocaleString("ko-KR")} ({Math.abs(listDiffPercent).toFixed(1)}% 할인)
              </span>
            )}
          </>
        }
        onUnitPriceClick={() => setPriceOpen(true)}
        quantity={{
          value: item.quantity,
          onChange: setQty,
          min: isBulk ? 0.0001 : 1,
          step: isBulk ? 0.5 : 1,
          decimal: isBulk,
        }}
        total={`₩${lineDisplay.toLocaleString("ko-KR")}`}
        onTotalClick={() => setTotalOpen(true)}
      >
        {/* 매핑 옵션 자식 행 — 별도 상품으로 추가 구매되는 옵션 (예: 메모리, 필터) */}
        {item.optionRefs && item.optionRefs.length > 0 && (
          <div className="ml-4 flex flex-col gap-1.5 border-l-2 border-[var(--jm-border)] pl-3">
            {item.optionRefs.map((ref) => {
              const refTaxApplies =
                (ref.taxType ?? "TAXABLE") === "TAXABLE" && !ref.isZeroRate;
              const refUnitGross = refTaxApplies
                ? Math.round(ref.addPrice * 1.1)
                : ref.addPrice;
              const refUnitDisplay = display === "net" ? ref.addPrice : refUnitGross;
              const refLineDisplay = refUnitDisplay * item.quantity;
              return (
                <div
                  key={ref.optionValueId}
                  className="flex items-center justify-between gap-2 rounded-lg bg-[var(--jm-surface-muted)] px-3 py-1.5"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="inline-flex shrink-0 items-center rounded-full bg-[var(--jm-surface)] px-1.5 py-0.5 text-jm-4xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
                      옵션
                    </span>
                    <span className="line-clamp-1 text-jm-xs font-medium text-[var(--jm-text)]">
                      {ref.name}
                    </span>
                    {ref.sku && (
                      <span className="font-mono text-jm-3xs text-[var(--jm-text-subtle)]">
                        {ref.sku}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-baseline gap-2 text-jm-xs tabular-nums">
                    <span className="text-[var(--jm-text-muted)]">
                      ×{item.quantity} · ₩{refUnitDisplay.toLocaleString("ko-KR")}
                    </span>
                    <span className="font-semibold text-[var(--jm-text)]">
                      ₩{refLineDisplay.toLocaleString("ko-KR")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PosLineItemRow>

      {/* 가격 다이얼로그 */}
      <PriceInputDialog
        open={priceOpen}
        onOpenChange={setPriceOpen}
        title={item.name}
        initialNet={unitNet}
        taxType={taxType}
        isZeroRate={item.isZeroRate}
        originalPrice={item.listPrice}
        initialIsService={item.isService}
        // 수리/임대 라인은 자체 청구 흐름이 있어 서비스 토글 부적합
        allowService={item.itemType === "product"}
        onSubmit={(net, isService) =>
          updateUnitPrice(item.cartItemId, net, sessionId, isService)
        }
      />

      {/* 라인 합계 다이얼로그 — 합계 입력 → 수량으로 나눠 단가 자동 환산 */}
      <PriceInputDialog
        open={totalOpen}
        onOpenChange={setTotalOpen}
        title={`${item.name} — 라인 합계`}
        initialNet={unitNet * item.quantity}
        taxType={taxType}
        isZeroRate={item.isZeroRate}
        allowService={false}
        onSubmit={(netTotal) => {
          const q = Math.max(isBulk ? 0.0001 : 1, item.quantity);
          const newUnit = Math.round(netTotal / q);
          updateUnitPrice(item.cartItemId, newUnit, sessionId);
        }}
      />

      {/* 변형/옵션 선택 시트 — canonical 또는 옵션 보유 상품 */}
      {showSelectTrigger && item.productId && (
        <VariantSelectSheet
          open={variantOpen}
          onOpenChange={setVariantOpen}
          productId={item.productId}
          needsVariant={!!item.isCanonical}
          initialOptionValueIds={item.optionValueIds}
          onConfirm={(sel) =>
            applySelections(
              item.cartItemId,
              {
                variant: sel.variant
                  ? {
                      productId: sel.variant.id,
                      name: sel.variant.name,
                      sku: sel.variant.sku,
                      unitPrice: sel.variant.unitPrice,
                    }
                  : undefined,
                swap: sel.swap,
                optionValueIds: sel.optionValueIds,
                optionSnapshot: sel.optionSnapshot,
                nonMappedAddPriceSum: sel.nonMappedAddPriceSum,
                optionRefs: sel.optionRefs,
              },
              sessionId,
            )
          }
        />
      )}

      {/* 추가구매 추천 시트 — 카트 라인의 [추가구매] 버튼 트리거 */}
      {showAddonTrigger && item.productId && (
        <AddonRecommendSheet
          open={addonOpen}
          onOpenChange={setAddonOpen}
          mainProductId={item.productId}
          mainProductName={item.name}
          onConfirm={(selections: AddonSelection[]) => {
            for (const sel of selections) {
              add(
                {
                  productId: sel.productId,
                  itemType: "product",
                  name: sel.name,
                  sku: sel.sku,
                  imageUrl: null,
                  unitPrice: sel.unitPrice,
                  quantity: sel.quantity,
                  taxType: sel.taxType,
                  parentCartItemId: item.cartItemId,
                  isAddon: true,
                  bundleId: sel.bundleId,
                },
                { sessionId },
              );
            }
            if (selections.length > 0) {
              toast.success(`추가구매 ${selections.length}건 함께 담음`, {
                duration: 1500,
              });
            }
          }}
        />
      )}
    </>
  );
}
