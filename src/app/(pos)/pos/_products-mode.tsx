"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet } from "@/lib/api-client";
import { useSessions, type CartSession } from "@/components/pos/sessions-context";
import { calcCartTotals } from "@/components/pos/cart-helpers";
import type { ProductLite } from "@/app/(pos)/pos/_types";
import { CategoryChips } from "./_components/category-chips";
import { ProductGridCard } from "./_components/product-grid-card";
import { PriceInputDialog } from "./_components/price-input-dialog";
import { ProductSearchSheet } from "./_product-search-sheet";
import { CartSheet } from "./_cart-sheet";
import { PaymentSheet } from "./_payment-sheet";

interface CategoryRoot {
  id: string;
  name: string;
  imageUrl: string | null;
}

interface Props {
  session: CartSession;
  /**
   * 라벨 인쇄 모달 트리거 — 부모(customer 페이지)가 처리.
   * options.afterPayment=true 면 결제 직후 발번 (모달 닫을 때 손님 그리드로 이동).
   * 미지정/false 면 카트에서 미리 발번 — 닫아도 손님 페이지에 머무름.
   */
  onPrintLabels: (codes: string[], options?: { afterPayment?: boolean }) => void;
  /** 상품 카드 우상단 i 클릭 — 부모(customer page) 가 detail 진입 처리 */
  onProductDetail?: (productId: string) => void;
  /** BottomTabBar 의 장바구니 탭 클릭 등 외부에서 카트 시트 강제 오픈 — 값이 변할 때마다 카트 열림 */
  openCartTrigger?: number;
  /** 글로벌 헤더의 검색 버튼이 ProductSearchSheet 를 열도록 부모가 제어 */
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  /** PaymentSheet 안 손님 썸네일 카드 클릭 — 부모가 CustomerActionSheet 열기 (재사용) */
  onCustomerClick?: () => void;
}

/**
 * 상품 모드 v2 — 그리드 우선 UX.
 * - 상단: 검색 트리거 + 카테고리 칩
 * - 본문: 큰 상품 그리드 (탭 시 카트 추가)
 * - 하단: 미니 카트 바 (sticky, 차 있을 때만) — 누르면 카트 시트
 * - autoMapped + 0원이면 가격 다이얼로그 자동 띄움
 */
export function ProductsMode({
  session,
  onPrintLabels,
  onProductDetail,
  openCartTrigger,
  searchOpen,
  onSearchOpenChange,
  onCustomerClick,
}: Props) {
  const { add } = useSessions();
  const [categoryId, setCategoryId] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [priceProduct, setPriceProduct] = useState<ProductLite | null>(null);

  // 외부 trigger — 값이 변하면 카트 시트 열기 (BottomTabBar 의 장바구니 탭 등)
  useEffect(() => {
    if (openCartTrigger == null || openCartTrigger === 0) return;
    setCartOpen(true);
  }, [openCartTrigger]);

  const categoriesQuery = useQuery<CategoryRoot[]>({
    queryKey: ["pos-v2", "categories"],
    queryFn: () => apiGet<CategoryRoot[]>("/api/categories"),
    staleTime: 1000 * 60 * 5,
  });

  const productsQuery = useQuery<ProductLite[]>({
    queryKey: ["pos-v2", "products-grid", { categoryId }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (categoryId) params.set("categoryId", categoryId);
      params.set("excludeVariants", "true");
      return apiGet<ProductLite[]>(`/api/products?${params}`);
    },
    staleTime: 1000 * 60,
  });

  // 자주 쓰는 상품 — "전체" 카테고리 일 때만 상단에 표시
  const popularQuery = useQuery<ProductLite[]>({
    queryKey: ["pos-v2", "products-popular"],
    queryFn: () => apiGet<ProductLite[]>("/api/products/popular?limit=8"),
    staleTime: 1000 * 60 * 5,
    enabled: categoryId === "",
  });

  const products = productsQuery.data ?? [];
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
        productId: p.id,
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
      },
      { sessionId: session.id },
    );
    toast.success(`${p.name} 추가`, { duration: 1500 });
  };

  const handleProductTap = (p: ProductLite) => {
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
          {/* 자주 쓰는 상품 — 전체 카테고리 일 때만 */}
          {categoryId === "" && (popularQuery.data?.length ?? 0) > 0 && (
            <section className="mb-4 flex flex-col gap-2">
              <div className="flex items-baseline gap-2 px-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
                  자주 쓰는 상품
                </span>
                <span className="text-[10px] text-[var(--jm-text-subtle)]">최근 30일 기준</span>
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

          {productsQuery.isPending ? (
            <GridSkeleton />
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <span className="text-[14px] text-[var(--jm-text-muted)]">
                해당 카테고리에 상품이 없습니다
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
              onClick={() => setCartOpen(true)}
              className="flex flex-1 items-center gap-2 rounded-2xl bg-[var(--jm-surface-muted)] px-4 py-3 text-left transition-colors active:bg-[var(--jm-border)]"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--jm-surface)]">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M4 7h12l-1.3 9a1.5 1.5 0 0 1-1.5 1.3H6.8a1.5 1.5 0 0 1-1.5-1.3L4 7zM7 7V5a3 3 0 0 1 6 0v2"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="text-[11px] tabular-nums text-[var(--jm-text-muted)]">
                  상품 {productCount}
                  <span className="mx-1.5 text-[var(--jm-text-disabled)]">·</span>
                  수리 {repairCount}
                  <span className="mx-1.5 text-[var(--jm-text-disabled)]">·</span>
                  임대 {rentalCount}
                </span>
                <span className="text-[15px] font-bold tabular-nums text-[var(--jm-text)]">
                  ₩{totals.total.toLocaleString("ko-KR")}
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setPaymentOpen(true)}
              className="rounded-2xl bg-[var(--jm-action)] px-5 text-[14px] font-semibold text-white transition-transform active:scale-[0.99]"
            >
              결제
            </button>
          </div>
        </div>
      )}

      {/* 시트들 */}
      <ProductSearchSheet
        open={searchOpen}
        onOpenChange={onSearchOpenChange}
        onSelect={(p) => {
          // ProductOption 을 ProductLite 로 변환
          const lite: ProductLite = {
            id: p.id,
            name: p.name,
            sku: p.sku,
            brand: null,
            spec: null,
            sellingPrice: p.sellingPrice,
            listPrice: p.listPrice,
            imageUrl: null,
            taxType: p.taxType ?? "TAXABLE",
            zeroRateEligible: p.zeroRateEligible,
            isBulk: false,
            unitOfMeasure: p.unitOfMeasure,
            isCanonical: p.isCanonical,
          };
          handleProductTap(lite);
          onSearchOpenChange(false);
        }}
      />

      <CartSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        session={session}
        onCheckout={() => setPaymentOpen(true)}
        onPrintLabels={onPrintLabels}
      />

      <PaymentSheet
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        session={session}
        onPrintLabels={onPrintLabels}
        onCustomerClick={onCustomerClick}
        onBack={() => {
          setPaymentOpen(false);
          setCartOpen(true);
        }}
      />

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
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col overflow-hidden rounded-2xl bg-[var(--jm-surface)] ring-1 ring-[var(--jm-border)]"
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
