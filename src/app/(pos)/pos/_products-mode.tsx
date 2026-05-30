"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { apiGet } from "@/lib/api-client";
import { useSessions, type CartSession } from "@/components/pos/sessions-context";
import { calcCartTotals } from "@/components/pos/cart-helpers";
import type { ProductLite } from "@/app/(pos)/pos/_types";
import { CategoryChips } from "./_components/category-chips";
import { ProductGridCard } from "./_components/product-grid-card";
import { PriceInputDialog } from "./_components/price-input-dialog";
import { VariantSelectSheet } from "./_variant-select-sheet";

interface CategoryRoot {
  id: string;
  name: string;
  imageUrl: string | null;
}

interface Props {
  session: CartSession;
  /** 상품 카드 우상단 i 클릭 — 부모(customer page) 가 detail 진입 처리 */
  onProductDetail?: (productId: string) => void;
  /** 헤더의 검색 인풋과 연결된 실시간 필터 — 비어있으면 카테고리 기반 그리드, 값이 있으면 전체에서 검색 */
  searchQuery: string;
  /** 미니 카트바 클릭 — 부모가 카트 시트 열기 (CartSheet 는 페이지 레벨에서 모드 무관하게 mount) */
  onOpenCart: () => void;
  /** 미니 카트바의 [결제] 버튼 — 부모가 결제 시트 열기 */
  onOpenPayment: () => void;
}

/**
 * 상품 모드 v2 — 그리드 우선 UX.
 * - 상단: 검색 트리거 + 카테고리 칩
 * - 본문: 큰 상품 그리드 (탭 시 카트 추가)
 * - 하단: 미니 카트 바 (sticky, 차 있을 때만) — 누르면 카트/결제 시트 (시트 자체는 페이지 레벨)
 * - autoMapped + 0원이면 가격 다이얼로그 자동 띄움
 */
export function ProductsMode({
  session,
  onProductDetail,
  searchQuery,
  onOpenCart,
  onOpenPayment,
}: Props) {
  const deferredSearch = useDeferredValue(searchQuery.trim());
  const isSearching = deferredSearch.length > 0;
  const { add } = useSessions();
  const [categoryId, setCategoryId] = useState("");
  const [priceProduct, setPriceProduct] = useState<ProductLite | null>(null);
  // 옵션 미리 선택 모달 — OPTION_PARENT 클릭 시 카트 추가 전 띄움
  const [optionPickProduct, setOptionPickProduct] = useState<ProductLite | null>(null);

  const categoriesQuery = useQuery<CategoryRoot[]>({
    queryKey: ["pos-v2", "categories"],
    queryFn: () => apiGet<CategoryRoot[]>("/api/categories"),
    staleTime: 1000 * 60 * 5,
  });

  // 카테고리 그리드 — 검색 미사용 시 사용
  const productsQuery = useQuery<ProductLite[]>({
    queryKey: ["pos-v2", "products-grid", { categoryId }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (categoryId) params.set("categoryId", categoryId);
      params.set("excludeVariants", "true");
      params.set("isBulk", "all");
      return apiGet<ProductLite[]>(`/api/products?${params}`);
    },
    staleTime: 1000 * 60,
    enabled: !isSearching,
  });

  // 검색용 전체 카탈로그 — 검색 시작 시 lazy fetch (5분 캐시) → 이후 키스트로크는 메모리 필터로 즉시 반응
  const allProductsQuery = useQuery<ProductLite[]>({
    queryKey: ["pos-v2", "products-all"],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("excludeVariants", "true");
      params.set("isBulk", "all");
      return apiGet<ProductLite[]>(`/api/products?${params}`);
    },
    staleTime: 1000 * 60 * 5,
    enabled: isSearching,
  });

  // 중고 단품 (IN_STOCK) — 검색 시 같은 그리드에 통합 노출. 라벨은 "(중고)" 자동 prefix.
  // 정책: 신품 우선 정렬 (concat 순서로 자연 정렬)
  const usedItemsQuery = useQuery<
    Array<{
      id: string;
      internalCode: string;
      displayName: string;
      acquiredCost: string;
      productId: string | null;
      product?: { name: string } | null;
    }>
  >({
    queryKey: ["pos-v2", "used-items-in-stock"],
    queryFn: () =>
      apiGet<
        Array<{
          id: string;
          internalCode: string;
          displayName: string;
          acquiredCost: string;
          productId: string | null;
          product?: { name: string } | null;
        }>
      >("/api/used-items?status=IN_STOCK&limit=500"),
    staleTime: 1000 * 60 * 5,
    enabled: isSearching,
  });

  // 자주 쓰는 상품 — "전체" 카테고리 + 검색 미사용 시에만 상단에 표시
  const popularQuery = useQuery<ProductLite[]>({
    queryKey: ["pos-v2", "products-popular"],
    queryFn: () => apiGet<ProductLite[]>("/api/products/popular?limit=8"),
    staleTime: 1000 * 60 * 5,
    enabled: categoryId === "" && !isSearching,
  });

  const products = useMemo(() => {
    if (isSearching) {
      const q = deferredSearch.toLowerCase();
      const matched = (allProductsQuery.data ?? []).filter(
        (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
      );

      // 중고도 같은 검색어로 필터 — 카탈로그 매칭이면 live product.name, 아니면 displayName.
      // sellingPrice 0 → 카트 추가 시 가격 다이얼로그 자동
      const usedMatched: ProductLite[] = (usedItemsQuery.data ?? [])
        .map((u) => ({ u, label: u.product?.name ?? u.displayName }))
        .filter(
          ({ u, label }) =>
            label.toLowerCase().includes(q) ||
            u.internalCode.toLowerCase().includes(q),
        )
        .map(({ u, label }) => ({
          id: u.id,
          name: `${label} (중고)`,
          sku: u.internalCode,
          brand: null,
          spec: null,
          sellingPrice: "0",
          imageUrl: null,
          taxType: "TAXABLE",
          usedItemId: u.id,
        }));

      // 신품 우선 정렬: 신품 먼저, 중고 뒤
      return [...matched, ...usedMatched];
    }
    return productsQuery.data ?? [];
  }, [
    isSearching,
    deferredSearch,
    allProductsQuery.data,
    usedItemsQuery.data,
    productsQuery.data,
  ]);
  const isProductsPending = isSearching
    ? allProductsQuery.isPending || usedItemsQuery.isPending
    : productsQuery.isPending;
  // 미니카트 합계는 전체 카트 (상품+임대+수리) — 결제는 전체 항목 결제
  const totals = useMemo(
    () => calcCartTotals(session),
    [session],
  );
  const cartCount = session.items.length;
  const productCount = session.items.filter((i) => i.itemType === "product").length;
  const repairCount = session.items.filter((i) => i.itemType === "repair").length;
  const rentalCount = session.items.filter((i) => i.itemType === "rental").length;

  const addToCart = (p: ProductLite, unitPrice: number) => {
    // 비교 기준선 — listPrice 우선, 없으면 sellingPrice 사용 (= 카트 추가 시점에 보이던 판매가)
    const list = p.listPrice ? parseFloat(p.listPrice) : 0;
    const selling = parseFloat(p.sellingPrice) || 0;
    const baseline = list > 0 ? list : selling;
    add(
      {
        // UsedItem 단품은 카탈로그 productId 가 아니라 usedItemId 로 추적. productId 는 카탈로그 매칭일 때만 보존.
        productId: p.usedItemId ? undefined : p.id,
        itemType: "product",
        name: p.name,
        sku: p.sku,
        imageUrl: p.imageUrl,
        unitPrice,
        listPrice: baseline > 0 ? baseline : undefined,
        taxType: p.taxType === "TAX_FREE" ? "TAX_FREE" : "TAXABLE",
        zeroRateEligible: p.zeroRateEligible,
        isBulk: p.isBulk,
        unitOfMeasure: p.unitOfMeasure,
        isCanonical: p.isCanonical,
        isOptionParent: p.productType === "OPTION_PARENT",
        hasProductOptions: p.hasProductOptions,
        usedItemId: p.usedItemId,
      },
      { sessionId: session.id },
    );
    toast.success(`${p.name} 추가`, { duration: 1500 });
    // 추가구매 추천은 카트 라인의 [추가구매] 버튼 트리거로 — 자동 노출 없음
  };

  const handleProductTap = (p: ProductLite) => {
    // 옵션 모달 분기는 OPTION_PARENT 만 — 자체 재고/가격 없어서 옵션 SWAP 으로만 결제 가능한 placeholder.
    // 일반 상품(FINISHED)은 옵션 슬롯이 있어도 즉시 카트 추가 (옵션 변경은 카트 라인의 "옵션 선택" 트리거로).
    if (p.productType === "OPTION_PARENT") {
      setOptionPickProduct(p);
      return;
    }
    // 가격이 0원인 모든 상품은 가격 입력 강제 (0원 결제 사고 방지)
    if (Number(p.sellingPrice) === 0) {
      setPriceProduct(p);
      return;
    }
    addToCart(p, parseFloat(p.sellingPrice) || 0);
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {/* 상단 — 카테고리 썸네일 (검색은 글로벌 헤더로 이동) */}
      <header className="shrink-0 overflow-hidden border-b border-[var(--jm-border)] bg-[var(--jm-surface)]">
        <div className="px-4 sm:px-6">
          <CategoryChips
            categories={categoriesQuery.data ?? []}
            selectedId={categoryId}
            onSelect={setCategoryId}
            loading={categoriesQuery.isPending}
          />
        </div>
      </header>

      {/* 본문 — 그리드 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-3 py-3 sm:px-4 sm:py-4">
          {/* 자주 쓰는 상품 — 전체 카테고리 + 검색 미사용 시에만 */}
          {!isSearching && categoryId === "" && (popularQuery.data?.length ?? 0) > 0 && (
            <section className="mb-4 flex flex-col gap-2">
              <div className="flex items-baseline gap-2 px-1">
                <span className="text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
                  자주 쓰는 상품
                </span>
                <span className="text-jm-3xs text-[var(--jm-text-subtle)]">최근 30일 기준</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4">
                {(popularQuery.data ?? []).map((p) => (
                  <ProductGridCard
                    key={`pop-${p.id}`}
                    product={p}
                    onClick={() => handleProductTap(p)}
                    onDetail={() => onProductDetail?.(p.id)}
                  />
                ))}
              </div>
              <div className="my-2 h-px bg-[var(--jm-surface-muted)]" />
            </section>
          )}

          {isProductsPending ? (
            <GridSkeleton />
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <span className="text-jm-base text-[var(--jm-text-muted)]">
                {isSearching
                  ? `"${deferredSearch}" 검색 결과가 없습니다`
                  : "해당 카테고리에 상품이 없습니다"}
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4">
              {products.map((p) => (
                <ProductGridCard
                  key={p.id}
                  product={p}
                  onClick={() => handleProductTap(p)}
                  onDetail={() => onProductDetail?.(p.id)}
                />
              ))}
            </div>
          )}
        </div>
        {/* 미니 카트바 보호 여백 */}
        {cartCount > 0 && <div className="h-20" />}
      </div>

      {/* 하단 — 미니 카트바 (sticky) */}
      {cartCount > 0 && (
        <div className="shrink-0 border-t border-[var(--jm-border)] bg-[var(--jm-surface)]">
          <div className="flex items-stretch gap-2 px-4 py-2.5 sm:px-6">
            <button
              type="button"
              onClick={onOpenCart}
              className="flex flex-1 items-center gap-2 rounded-2xl bg-[var(--jm-surface-muted)] px-4 py-3 text-left transition-colors active:bg-[var(--jm-border)]"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--jm-surface)]">
                <ShoppingBag className="size-[18px]" />
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="text-jm-2xs tabular-nums text-[var(--jm-text-muted)]">
                  상품 {productCount}
                  <span className="mx-1.5 text-[var(--jm-text-disabled)]">·</span>
                  수리 {repairCount}
                  <span className="mx-1.5 text-[var(--jm-text-disabled)]">·</span>
                  임대 {rentalCount}
                </span>
                <span className="text-jm-md font-bold tabular-nums text-[var(--jm-text)]">
                  ₩{totals.total.toLocaleString("ko-KR")}
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={onOpenPayment}
              className="rounded-2xl bg-[var(--jm-action)] px-5 text-jm-base font-semibold text-white transition-transform active:scale-[0.99]"
            >
              결제
            </button>
          </div>
        </div>
      )}

      {/* CartSheet · PaymentSheet 는 페이지 레벨에서 모드 무관하게 mount — ProductsMode 미마운트 시에도 카트 열림 */}

      {priceProduct && (
        <PriceInputDialog
          open
          onOpenChange={(o) => !o && setPriceProduct(null)}
          title={priceProduct.name}
          initialNet={parseFloat(priceProduct.sellingPrice) || 0}
          taxType={priceProduct.taxType === "TAX_FREE" ? "TAX_FREE" : "TAXABLE"}
          isZeroRate={false}
          originalPrice={(() => {
            // listPrice 우선, 없으면 sellingPrice 를 비교 기준선으로
            const list = priceProduct.listPrice
              ? parseFloat(priceProduct.listPrice)
              : 0;
            const selling = parseFloat(priceProduct.sellingPrice) || 0;
            const baseline = list > 0 ? list : selling;
            return baseline > 0 ? baseline : undefined;
          })()}
          onSubmit={(net) => {
            addToCart(priceProduct, net);
            setPriceProduct(null);
          }}
        />
      )}

      {/* 옵션 미리 선택 모달 — 옵션 보유 상품/OPTION_PARENT 클릭 시. confirm 후 카트 추가 */}
      {optionPickProduct && (
        <VariantSelectSheet
          open
          onOpenChange={(o) => !o && setOptionPickProduct(null)}
          productId={optionPickProduct.id}
          needsVariant={!!optionPickProduct.isCanonical}
          onConfirm={(sel) => {
            const p = optionPickProduct;
            // SWAP 적용 시 메인 라인의 productId/이름/sku/단가/정가/세금 모두 swap
            const isSwap = !!sel.swap;
            const finalProductId = isSwap ? sel.swap!.productId : p.id;
            const finalName = isSwap ? sel.swap!.name : p.name;
            const finalSku = isSwap ? sel.swap!.sku ?? p.sku : p.sku;
            const baseSellingPrice = isSwap
              ? sel.swap!.sellingPrice
              : parseFloat(p.sellingPrice) || 0;
            const finalUnitPrice = baseSellingPrice + sel.nonMappedAddPriceSum;
            const listForCompare = isSwap
              ? sel.swap!.listPrice ?? baseSellingPrice
              : parseFloat(p.listPrice ?? p.sellingPrice) || 0;
            const taxType: "TAXABLE" | "TAX_FREE" = isSwap
              ? sel.swap!.taxType ?? "TAXABLE"
              : p.taxType === "TAX_FREE"
                ? "TAX_FREE"
                : "TAXABLE";
            add(
              {
                productId: finalProductId,
                itemType: "product",
                name: finalName,
                sku: finalSku,
                imageUrl: p.imageUrl,
                unitPrice: finalUnitPrice,
                listPrice: listForCompare > 0 ? listForCompare : undefined,
                taxType,
                zeroRateEligible: p.zeroRateEligible,
                isBulk: p.isBulk,
                unitOfMeasure: p.unitOfMeasure,
                // SWAP 적용 → OPTION_PARENT/canonical 해제 (이미 실제 SKU 결정됨)
                isCanonical: false,
                isOptionParent: false,
                hasProductOptions: p.hasProductOptions,
                optionValueIds:
                  sel.optionValueIds.length > 0 ? sel.optionValueIds : undefined,
                optionSnapshot:
                  Object.keys(sel.optionSnapshot).length > 0
                    ? sel.optionSnapshot
                    : undefined,
                optionAddPriceSum:
                  sel.nonMappedAddPriceSum > 0
                    ? sel.nonMappedAddPriceSum
                    : undefined,
                optionRefs: sel.optionRefs.length > 0 ? sel.optionRefs : undefined,
              },
              { sessionId: session.id },
            );
            toast.success(`${finalName} 추가`, { duration: 1500 });
            setOptionPickProduct(null);
          }}
        />
      )}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col overflow-hidden rounded-2xl bg-[var(--jm-surface)] border border-[var(--jm-border)]"
        >
          <div className="aspect-square w-full animate-pulse bg-[var(--jm-surface-muted)]" />
          <div className="flex flex-col gap-1.5 p-2.5">
            <div className="h-3.5 w-full animate-pulse rounded bg-[var(--jm-surface-muted)]" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
          </div>
        </div>
      ))}
    </div>
  );
}
