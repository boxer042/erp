"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { useSessions } from "@/components/pos/sessions-context";
import { toast } from "sonner";

interface ProductDetail {
  id: string;
  name: string;
  sku: string;
  brand: string | null;
  brandRef: { name: string; logoUrl: string | null } | null;
  category: { name: string } | null;
  description: string | null;
  sellingPrice: string;
  imageUrl: string | null;
  taxType: string;
  zeroRateEligible?: boolean;
  trackable: boolean;
  warrantyMonths: number | null;
  isBulk: boolean;
  unitOfMeasure: string;
  isCanonical?: boolean;
  isActive: boolean;
  inventory?: { quantity: string; safetyStock: string | null } | null;
}

export default function PosV2ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { add, active } = useSessions();

  const productQuery = useQuery<ProductDetail>({
    queryKey: ["pos-v2", "product-detail", id],
    queryFn: () => apiGet<ProductDetail>(`/api/products/${id}`),
  });

  if (productQuery.isPending) return <DetailSkeleton onBack={() => router.back()} />;
  if (productQuery.isError || !productQuery.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-50 p-6 text-center">
        <span className="text-[15px] font-semibold text-zinc-900">
          상품을 찾을 수 없습니다
        </span>
        <button
          type="button"
          onClick={() => router.back()}
          className="h-10 rounded-full bg-zinc-900 px-5 text-[13px] font-semibold text-white"
        >
          뒤로
        </button>
      </div>
    );
  }

  const p = productQuery.data;
  const taxFree = p.taxType === "TAX_FREE";
  const sellingNet = parseFloat(p.sellingPrice) || 0;
  const displayPrice = taxFree ? sellingNet : Math.round(sellingNet * 1.1);
  const stock = p.inventory ? parseFloat(p.inventory.quantity) : 0;

  const addToCart = () => {
    add(
      {
        productId: p.id,
        itemType: "product",
        name: p.name,
        sku: p.sku,
        imageUrl: p.imageUrl,
        unitPrice: sellingNet,
        taxType: taxFree ? "TAX_FREE" : "TAXABLE",
        zeroRateEligible: p.zeroRateEligible,
        isBulk: p.isBulk,
        unitOfMeasure: p.unitOfMeasure,
        isCanonical: p.isCanonical,
      },
      { sessionId: active?.id },
    );
    toast.success(`${p.name} 카트 추가`, { duration: 1500 });
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-zinc-50">
      {/* 헤더 */}
      <header className="shrink-0 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2.5 sm:px-6">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-100 active:bg-zinc-200"
            aria-label="뒤로"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M12 4l-6 6 6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <span className="flex-1 truncate text-[15px] font-semibold text-zinc-900">
            상품 상세
          </span>
        </div>
      </header>

      {/* 본문 */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 pb-28 pt-4 sm:px-6">
          {/* 이미지 */}
          <div className="mb-4 aspect-square w-full overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200">
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.imageUrl} alt={p.name} className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-zinc-300">
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M3 7l9-4 9 4v10l-9 4-9-4V7zM12 3v18M3 7l9 5 9-5"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}
          </div>

          {/* 이름·카테고리·SKU */}
          <div className="flex flex-col gap-1">
            {(p.category?.name || p.brandRef?.name || p.brand) && (
              <span className="text-[12px] text-zinc-500">
                {[p.category?.name, p.brandRef?.name ?? p.brand].filter(Boolean).join(" · ")}
              </span>
            )}
            <h1 className="text-[20px] font-bold leading-tight text-zinc-900">
              {p.name}
            </h1>
            <span className="font-mono text-[11px] text-zinc-400">{p.sku}</span>
          </div>

          {/* 가격 */}
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-[28px] font-bold tabular-nums text-zinc-900">
              ₩{displayPrice.toLocaleString("ko-KR")}
            </span>
            {!taxFree && (
              <span className="text-[12px] text-zinc-500">VAT 포함</span>
            )}
            {taxFree && (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700">
                면세
              </span>
            )}
          </div>

          {/* 메타 정보 */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Meta label="재고" value={`${stock.toLocaleString("ko-KR")} ${p.unitOfMeasure}`} />
            <Meta label="단위" value={p.unitOfMeasure} />
            {p.warrantyMonths != null && (
              <Meta label="보증" value={`${p.warrantyMonths}개월`} />
            )}
            {p.trackable && <Meta label="개별추적" value="O" />}
          </div>

          {/* 설명 */}
          {p.description && (
            <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                설명
              </span>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-700">
                {p.description}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* 하단 — 카트 추가 버튼 */}
      <div className="shrink-0 border-t border-zinc-200 bg-white px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <button
            type="button"
            onClick={addToCart}
            disabled={!p.isActive}
            className="flex h-13 w-full items-center justify-between rounded-2xl bg-zinc-900 px-5 py-4 text-[15px] font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-50"
          >
            <span>카트에 추가</span>
            <span className="tabular-nums">₩{displayPrice.toLocaleString("ko-KR")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-white p-3 ring-1 ring-zinc-200">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        {label}
      </span>
      <span className="text-[14px] font-semibold tabular-nums text-zinc-900">
        {value}
      </span>
    </div>
  );
}

function DetailSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex h-full flex-col bg-zinc-50">
      <header className="shrink-0 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2.5 sm:px-6">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-700"
            aria-label="뒤로"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M12 4l-6 6 6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className="h-4 w-24 animate-pulse rounded bg-zinc-100" />
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6">
          <div className="aspect-square w-full animate-pulse rounded-2xl bg-zinc-100" />
          <div className="mt-4 h-6 w-2/3 animate-pulse rounded bg-zinc-100" />
          <div className="mt-2 h-8 w-1/3 animate-pulse rounded bg-zinc-100" />
        </div>
      </main>
    </div>
  );
}
