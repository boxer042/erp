"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { AlertTriangle, PackageX, Package, PackagePlus, ExternalLink, ClipboardSignature } from "lucide-react";
import { toast } from "sonner";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { apiGet } from "@/lib/api-client";
import {
  JmCard,
  JmCardContent,
  JmBadge,
  JmButton,
  JmStat,
  JmSearchInput,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
  JmSkeleton,
} from "@/jm";

interface LowStockMapping {
  supplierId: string;
  supplierName: string;
  supplierProductId: string;
  supplierProductName: string;
  supplierCode: string | null;
  unitPrice: string;
  conversionRate: number;
  suggestedQty: number;
}

interface LowStockItem {
  productId: string;
  name: string;
  sku: string;
  brand: string | null;
  spec: string | null;
  quantity: number;
  safetyStock: number;
  shortage: number;
  unitOfMeasure: string;
  categoryId: string | null;
  categoryName: string | null;
  isOut: boolean;
  /** 음수 재고 — 적자 출고 상태 (재고 없이 판매됨). 결품보다 더 강한 경고. */
  isNegative: boolean;
  mappings: LowStockMapping[];
}

interface Response {
  items: LowStockItem[];
  summary: {
    totalCount: number;
    outOfStockCount: number;
    /** 음수 재고 상품 수 — 적자 출고로 시스템상 마이너스 */
    negativeStockCount: number;
    lowStockCount: number;
  };
}

export default function LowStockPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "negative" | "out" | "low">("all");

  const dataQuery = useQuery<Response>({
    queryKey: ["inventory-low-stock"],
    queryFn: () => apiGet<Response>("/api/inventory/low-stock"),
    staleTime: 1000 * 30,
  });

  const all = dataQuery.data?.items ?? [];
  const summary = dataQuery.data?.summary;

  const items = all.filter((i) => {
    if (filter === "negative" && !i.isNegative) return false;
    if (filter === "out" && (!i.isOut || i.isNegative)) return false;
    if (filter === "low" && (i.isOut || i.isNegative)) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !i.name.toLowerCase().includes(q) &&
        !i.sku.toLowerCase().includes(q) &&
        !(i.brand?.toLowerCase().includes(q) ?? false)
      )
        return false;
    }
    return true;
  });

  return (
    <div className="flex h-full flex-col bg-[var(--jm-bg)]">
      <div className="flex items-center gap-3 border-b border-[var(--jm-border)] px-5 py-3">
        <h1 className="text-jm-lg font-semibold text-[var(--jm-text)]">재고 부족 알림</h1>
        <span className="text-jm-xs text-[var(--jm-text-muted)]">
          안전재고 미달 상품
        </span>
        <div className="ml-auto">
          <JmButton
            variant="outline"
            size="xs"
            className="gap-1.5"
            onClick={() => router.push("/inventory/incoming")}
          >
            <PackagePlus className="size-3.5" />
            입고 등록
          </JmButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <JmStat
            label="전체"
            value={
              dataQuery.isPending ? (
                <JmSkeleton className="h-7 w-12" />
              ) : (
                summary?.totalCount ?? 0
              )
            }
            icon={<AlertTriangle className="size-4" />}
            size="sm"
            interactive
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          {/* 음수 재고 — 적자 출고. 결품보다 더 시급. */}
          <JmStat
            label="음수 (적자)"
            value={
              dataQuery.isPending ? (
                <JmSkeleton className="h-7 w-12" />
              ) : (
                summary?.negativeStockCount ?? 0
              )
            }
            icon={<AlertTriangle className="size-4" />}
            size="sm"
            interactive
            active={filter === "negative"}
            onClick={() => setFilter("negative")}
          />
          <JmStat
            label="결품 (재고 0)"
            value={
              dataQuery.isPending ? (
                <JmSkeleton className="h-7 w-12" />
              ) : (
                summary?.outOfStockCount ?? 0
              )
            }
            icon={<PackageX className="size-4" />}
            size="sm"
            interactive
            active={filter === "out"}
            onClick={() => setFilter("out")}
          />
          <JmStat
            label="부족"
            value={
              dataQuery.isPending ? (
                <JmSkeleton className="h-7 w-12" />
              ) : (
                summary?.lowStockCount ?? 0
              )
            }
            icon={<Package className="size-4" />}
            size="sm"
            interactive
            active={filter === "low"}
            onClick={() => setFilter("low")}
          />
        </div>

        <div className="mb-3 flex items-center gap-2">
          <JmSearchInput
            size="sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch("")}
            placeholder="상품명·SKU·브랜드"
            className="w-[280px]"
          />
        </div>

        <JmCard>
          <JmCardContent className="px-0">
            <JmTable className="min-w-[800px]">
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead className="w-[80px]">상태</JmTableHead>
                  <JmTableHead>상품</JmTableHead>
                  <JmTableHead className="w-[120px]">SKU</JmTableHead>
                  <JmTableHead className="w-[120px]">카테고리</JmTableHead>
                  <JmTableHead className="w-[90px] text-right">현재고</JmTableHead>
                  <JmTableHead className="w-[90px] text-right">안전재고</JmTableHead>
                  <JmTableHead className="w-[90px] text-right">부족분</JmTableHead>
                  <JmTableHead className="w-[160px]">동작</JmTableHead>
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {dataQuery.isPending ? (
                  <SkeletonRows />
                ) : items.length === 0 ? (
                  <JmTableRow>
                    <JmTableCell
                      colSpan={8}
                      className="py-12 text-center text-[var(--jm-text-muted)]"
                    >
                      {search || filter !== "all"
                        ? "조건에 맞는 상품이 없습니다"
                        : "재고가 부족한 상품이 없습니다"}
                    </JmTableCell>
                  </JmTableRow>
                ) : (
                  items.map((it) => (
                    <JmTableRow
                      key={it.productId}
                      className="cursor-pointer"
                      onClick={() => router.push(`/products/${it.productId}`)}
                    >
                      <JmTableCell>
                        {it.isNegative ? (
                          <JmBadge variant="danger">음수재고</JmBadge>
                        ) : it.isOut ? (
                          <JmBadge variant="danger">결품</JmBadge>
                        ) : (
                          <JmBadge variant="warning">부족</JmBadge>
                        )}
                      </JmTableCell>
                      <JmTableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{it.name}</span>
                          {it.spec && (
                            <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                              {it.spec}
                            </span>
                          )}
                        </div>
                      </JmTableCell>
                      <JmTableCell className="font-mono text-jm-xs">
                        {it.sku}
                      </JmTableCell>
                      <JmTableCell className="text-jm-sm text-[var(--jm-text-muted)]">
                        {it.categoryName ?? "-"}
                      </JmTableCell>
                      <JmTableCell
                        className={`text-right tabular-nums font-semibold ${
                          it.isNegative || it.isOut ? "text-[var(--jm-danger-fg)]" : ""
                        }`}
                      >
                        {it.quantity.toLocaleString("ko-KR")} {it.unitOfMeasure}
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums text-[var(--jm-text-muted)]">
                        {it.safetyStock.toLocaleString("ko-KR")}
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums font-semibold text-[var(--jm-danger-fg)]">
                        −{it.shortage.toLocaleString("ko-KR")}
                      </JmTableCell>
                      <JmTableCell>
                        <div className="flex items-center gap-1">
                          <PurchaseOrderButton item={it} router={router} />
                          <JmButton
                            variant="ghost"
                            size="xs"
                            className="h-7 gap-1 px-2 text-jm-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/products/${it.productId}`);
                            }}
                          >
                            <ExternalLink className="size-3" />
                            상세
                          </JmButton>
                        </div>
                      </JmTableCell>
                    </JmTableRow>
                  ))
                )}
              </JmTableBody>
            </JmTable>
          </JmCardContent>
        </JmCard>
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <JmTableRow key={i}>
          <JmTableCell>
            <JmSkeleton className="h-5 w-12 rounded-full" />
          </JmTableCell>
          <JmTableCell>
            <JmSkeleton className="h-4 w-40" />
          </JmTableCell>
          <JmTableCell>
            <JmSkeleton className="h-4 w-24" />
          </JmTableCell>
          <JmTableCell>
            <JmSkeleton className="h-4 w-20" />
          </JmTableCell>
          <JmTableCell className="text-right">
            <div className="flex justify-end">
              <JmSkeleton className="h-4 w-16" />
            </div>
          </JmTableCell>
          <JmTableCell className="text-right">
            <div className="flex justify-end">
              <JmSkeleton className="h-4 w-16" />
            </div>
          </JmTableCell>
          <JmTableCell className="text-right">
            <div className="flex justify-end">
              <JmSkeleton className="h-4 w-16" />
            </div>
          </JmTableCell>
          <JmTableCell>
            <JmSkeleton className="h-7 w-28 rounded-md" />
          </JmTableCell>
        </JmTableRow>
      ))}
    </>
  );
}

function PurchaseOrderButton({
  item,
  router,
}: {
  item: LowStockItem;
  router: ReturnType<typeof useRouter>;
}) {
  const [open, setOpen] = useState(false);

  const navigate = (m: LowStockMapping) => {
    const params = new URLSearchParams({
      prefillSupplierId: m.supplierId,
      prefillSupplierName: m.supplierName,
      prefillSpId: m.supplierProductId,
      prefillSpName: m.supplierProductName,
      prefillQty: String(m.suggestedQty),
      prefillUnitPrice: m.unitPrice,
    });
    router.push(`/purchase-orders?${params.toString()}`);
  };

  if (item.mappings.length === 0) {
    return (
      <JmButton
        variant="outline"
        size="xs"
        className="h-7 gap-1 px-2 text-jm-xs"
        onClick={(e) => {
          e.stopPropagation();
          toast.info("매핑된 거래처가 없습니다. 상품 상세에서 매핑을 먼저 등록하세요.");
          router.push(`/products/${item.productId}`);
        }}
      >
        <ClipboardSignature className="size-3" />
        발주
      </JmButton>
    );
  }

  if (item.mappings.length === 1) {
    return (
      <JmButton
        variant="outline"
        size="xs"
        className="h-7 gap-1 px-2 text-jm-xs"
        onClick={(e) => {
          e.stopPropagation();
          navigate(item.mappings[0]);
        }}
      >
        <ClipboardSignature className="size-3" />
        발주
      </JmButton>
    );
  }

  // 매핑 2개+ — popover 로 거래처 선택
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        render={
          <JmButton
            variant="outline"
            size="xs"
            className="h-7 gap-1 px-2 text-jm-xs"
            onClick={(e) => e.stopPropagation()}
          />
        }
      >
        <ClipboardSignature className="size-3" />
        발주
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner align="start" sideOffset={6} className="isolate z-50">
          <PopoverPrimitive.Popup
            data-jm-scope
            onClick={(e) => e.stopPropagation()}
            className="z-50 flex w-[260px] flex-col overflow-hidden rounded-xl bg-[var(--jm-surface)] p-1 ring-1 ring-[var(--jm-border)] shadow-[var(--jm-shadow-lg)] outline-none font-[family-name:var(--jm-font-sans)] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
          >
            <div className="px-2 py-1.5 text-jm-2xs text-[var(--jm-text-muted)]">발주할 거래처 선택</div>
            {item.mappings.map((m, i) => (
              <button
                key={`${m.supplierId}-${m.supplierProductId}-${i}`}
                type="button"
                className="w-full text-left px-2 py-1.5 rounded-md text-jm-sm hover:bg-[var(--jm-surface-muted)] flex items-center justify-between gap-2"
                onClick={() => {
                  setOpen(false);
                  navigate(m);
                }}
              >
                <div className="flex flex-col min-w-0">
                  <span className="truncate font-medium">{m.supplierName}</span>
                  <span className="text-jm-2xs text-[var(--jm-text-muted)] truncate">
                    {m.supplierProductName}{m.supplierCode ? ` · ${m.supplierCode}` : ""}
                  </span>
                </div>
                <span className="text-jm-2xs tabular-nums text-[var(--jm-text-muted)] shrink-0">
                  {m.suggestedQty.toLocaleString("ko-KR")}개
                </span>
              </button>
            ))}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
