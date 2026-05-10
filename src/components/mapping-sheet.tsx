"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, Loader2, Plus, ChevronsUpDown, Undo2, ArrowRight } from "lucide-react";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { formatComma, parseComma, genClientId } from "@/lib/utils";
import { useIsCompactDevice } from "@/hooks/use-mobile";
import {
  JmBadge,
  JmButton,
  JmCard,
  JmCombobox,
  JmComboboxDrawer,
  JmDrawer,
  JmDrawerBody,
  JmDrawerContent,
  JmDrawerDescription,
  JmDrawerFooter,
  JmDrawerHeader,
  JmDrawerTitle,
  JmEmpty,
  JmIconButton,
  JmInput,
  JmSkeleton,
  JmSpinner,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
} from "@/jm";

// ─── 공통 인터페이스 ─────────────────────────────────────────────────────────

interface IncomingCost {
  id: string;
  name: string;
  costType: "FIXED" | "PERCENTAGE";
  value: string;
  perUnit: boolean;
  isTaxable: boolean;
}

interface MappingEntry {
  id: string;
  conversionRate: string;
  product: { id: string; name: string; sku: string };
  supplierProduct: {
    id: string;
    name: string;
    supplierCode: string | null;
    unitPrice: string;
    isProvisional: boolean;
    supplier: { name: string };
  };
}

interface Product { id: string; name: string; sku: string; unitOfMeasure: string }
interface SupplierProduct {
  id: string; name: string; supplierCode: string | null;
  unitOfMeasure: string;
  supplier: { name: string };
}

interface PendingMapping {
  tempId: string;
  targetId: string;
  targetLabel: string;
  targetSub: string;
  conversionRate: string;
}

// ─── ResponsiveProductCombobox ────────────────────────────────────────────────

interface MappingItem { id: string; label: string; sub: string; description?: string }

function ResponsiveProductCombobox({
  mode,
  products,
  supplierProducts,
  selectedId,
  onSelect,
}: {
  mode: "supplier-to-product" | "product-to-supplier";
  products: Product[];
  supplierProducts: SupplierProduct[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const isCompact = useIsCompactDevice();
  const isSupplierMode = mode === "supplier-to-product";
  const [drawerOpen, setDrawerOpen] = useState(false);

  const allItems: MappingItem[] = isSupplierMode
    ? products.map((p) => ({ id: p.id, label: `${p.name} (${p.sku})`, sub: p.sku, description: p.sku }))
    : supplierProducts.map((sp) => ({
        id: sp.id,
        label: `${sp.name}${sp.supplierCode ? ` (${sp.supplierCode})` : ""}`,
        sub: sp.supplier.name,
        description: sp.supplier.name,
      }));

  const selected = allItems.find((i) => i.id === selectedId);
  const placeholder = isSupplierMode ? "판매 상품 선택..." : "거래처 상품 선택...";
  const searchPlaceholder = isSupplierMode ? "판매 상품 검색..." : "거래처 상품 검색...";

  if (isCompact) {
    return (
      <>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="relative flex h-9 w-full items-center overflow-hidden rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] pl-4 pr-9 text-left text-jm-sm text-[var(--jm-text)] transition-colors hover:border-[var(--jm-border-strong)]"
        >
          <span className={cn("flex-1 truncate", !selected && "text-[var(--jm-text-muted)]")}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronsUpDown className="absolute right-3 size-4 text-[var(--jm-text-muted)]" />
        </button>
        <JmComboboxDrawer<MappingItem>
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          items={allItems}
          getKey={(i) => i.id}
          renderItem={(item) => (
            <div className="flex flex-1 items-center gap-2 overflow-hidden">
              <span className="flex-1 truncate text-jm-base text-[var(--jm-text)]">{item.label}</span>
              {!isSupplierMode && item.sub && (
                <span className="shrink-0 text-jm-xs text-[var(--jm-text-muted)]">{item.sub}</span>
              )}
            </div>
          )}
          onSelect={(item) => onSelect(item.id)}
          filterFn={(i, q) => {
            const lower = q.toLowerCase();
            return i.label.toLowerCase().includes(lower) || i.sub.toLowerCase().includes(lower);
          }}
          title={placeholder}
          placeholder={searchPlaceholder}
          emptyText="결과 없음"
        />
      </>
    );
  }

  return (
    <JmCombobox<MappingItem>
      size="sm"
      items={allItems}
      value={selectedId}
      onChange={(item) => onSelect(item.id)}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      matches={(i, q) => {
        const lower = q.toLowerCase();
        return i.label.toLowerCase().includes(lower) || i.sub.toLowerCase().includes(lower);
      }}
      renderItem={(item) => (
        <div className="flex flex-1 items-center gap-2 overflow-hidden">
          <span className="flex-1 truncate">{item.label}</span>
          {!isSupplierMode && item.sub && (
            <span className="shrink-0 text-jm-xs text-[var(--jm-text-muted)]">{item.sub}</span>
          )}
        </div>
      )}
    />
  );
}

// helper for cn — local since component file
function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

// ─── MappingSheet ─────────────────────────────────────────────────────────────

type MappingSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMappingChange?: () => void;
} & (
  | { mode: "supplier-to-product"; supplierProductId: string; supplierProductName: string; supplierProductUnit: string; defaultProductId?: string; productId?: never; productName?: never; productUnit?: never }
  | { mode: "product-to-supplier"; productId: string; productName: string; productUnit: string; defaultProductId?: never; supplierProductId?: never; supplierProductName?: never; supplierProductUnit?: never }
);

export function MappingSheet(props: MappingSheetProps) {
  const { open, onOpenChange, onMappingChange, mode } = props;
  const defaultProductId = mode === "supplier-to-product" ? (props.defaultProductId ?? "") : "";

  const [mappings, setMappings] = useState<MappingEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [supplierProducts, setSupplierProducts] = useState<SupplierProduct[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [conversionRate, setConversionRate] = useState("1");
  const [pendingMappings, setPendingMappings] = useState<PendingMapping[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const router = useRouter();
  const fixedId = mode === "supplier-to-product" ? props.supplierProductId : props.productId;
  const fixedName = mode === "supplier-to-product" ? props.supplierProductName : props.productName;
  const fixedUnit = mode === "supplier-to-product" ? props.supplierProductUnit : props.productUnit;

  const selectedUnit = (() => {
    if (!selectedId) return "";
    if (mode === "supplier-to-product") return products.find((p) => p.id === selectedId)?.unitOfMeasure ?? "";
    return supplierProducts.find((sp) => sp.id === selectedId)?.unitOfMeasure ?? "";
  })();

  const supplierUnit = mode === "supplier-to-product" ? fixedUnit : selectedUnit;
  const productUnit = mode === "supplier-to-product" ? selectedUnit : fixedUnit;
  const hasChanges = pendingMappings.length > 0 || deletedIds.length > 0;
  const totalCount = mappings.length - deletedIds.length + pendingMappings.length;

  const fetchMappings = useCallback(async () => {
    if (!fixedId) return;
    setLoading(true);
    try {
      const param = mode === "supplier-to-product" ? `supplierProductId=${fixedId}` : `productId=${fixedId}`;
      setMappings(await apiGet<MappingEntry[]>(`/api/products/mapping?${param}`));
    } finally {
      setLoading(false);
    }
  }, [fixedId, mode]);

  const fetchOptions = useCallback(async () => {
    if (mode === "supplier-to-product") {
      setProducts(await apiGet<Product[]>("/api/products"));
    } else {
      setSupplierProducts(await apiGet<SupplierProduct[]>("/api/supplier-products"));
    }
  }, [mode]);

  useEffect(() => {
    if (open) {
      fetchMappings();
      fetchOptions();
      setSelectedId(defaultProductId);
      setConversionRate("1");
      setPendingMappings([]);
      setDeletedIds([]);
    }
  }, [open, fetchMappings, fetchOptions, defaultProductId]);

  const handleAdd = () => {
    if (!selectedId) { toast.error("항목을 선택해주세요"); return; }
    const existsInMappings = mappings.some((m) =>
      mode === "supplier-to-product" ? m.product.id === selectedId : m.supplierProduct.id === selectedId
    );
    if (existsInMappings || pendingMappings.some((p) => p.targetId === selectedId)) {
      toast.error("이미 매핑되어 있습니다"); return;
    }

    const isSupplierMode = mode === "supplier-to-product";
    let label = "", sub = "";
    if (isSupplierMode) {
      const p = products.find((p) => p.id === selectedId);
      label = p ? `${p.name} (${p.sku})` : "";
      sub = p?.sku ?? "";
    } else {
      const sp = supplierProducts.find((sp) => sp.id === selectedId);
      label = sp ? `${sp.name}${sp.supplierCode ? ` (${sp.supplierCode})` : ""}` : "";
      sub = sp?.supplier.name ?? "";
    }

    setPendingMappings((prev) => [...prev, { tempId: genClientId(), targetId: selectedId, targetLabel: label, targetSub: sub, conversionRate }]);
    setSelectedId("");
    setConversionRate("1");
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      for (const id of deletedIds) {
        await apiMutate(`/api/products/mapping?id=${id}`, "DELETE");
      }
      for (const pending of pendingMappings) {
        const body = mode === "supplier-to-product"
          ? { supplierProductId: fixedId, productId: pending.targetId, conversionRate: pending.conversionRate }
          : { supplierProductId: pending.targetId, productId: fixedId, conversionRate: pending.conversionRate };
        let created: { product?: { sellingPrice?: string }; productId?: string };
        try {
          created = await apiMutate<{ product?: { sellingPrice?: string }; productId?: string }>("/api/products/mapping", "POST", body);
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : `매핑 추가 실패: ${pending.targetLabel}`);
          continue;
        }
        if (created.product?.sellingPrice !== undefined && parseFloat(created.product.sellingPrice) === 0) {
          const pid = created.productId || (mode === "product-to-supplier" ? fixedId : pending.targetId);
          toast.warning("판매가가 설정되지 않았습니다", {
            action: { label: "가격 설정하기", onClick: () => router.push(`/products/${pid}`) },
          });
        }
      }
      toast.success("매핑이 저장되었습니다");
      onOpenChange(false);
      onMappingChange?.();
    } finally {
      setSubmitting(false);
    }
  };

  const addedCount = pendingMappings.length;
  const removedCount = deletedIds.length;
  const changeSummary = (() => {
    if (!hasChanges) return "변경사항 없음";
    const parts: string[] = [];
    if (addedCount > 0) parts.push(`추가 ${addedCount}건`);
    if (removedCount > 0) parts.push(`삭제 ${removedCount}건`);
    return `${parts.join(" · ")} · 저장하면 적용됩니다`;
  })();

  return (
    <JmDrawer open={open} onOpenChange={onOpenChange}>
      <JmDrawerContent
        side="bottom"
        className="flex flex-col bg-[var(--jm-bg)]"
        style={{ height: "70vh" }}
      >
        <JmDrawerHeader className="bg-[var(--jm-surface)]">
          <div className="flex items-center justify-between gap-3">
            <JmDrawerTitle>매핑 관리</JmDrawerTitle>
            <div className="flex items-center gap-1.5">
              <JmBadge variant="default" size="sm" shape="pill">
                매핑 {totalCount}건
              </JmBadge>
              {hasChanges && (
                <JmBadge variant="info" size="sm" shape="pill">
                  {addedCount > 0 && `+${addedCount}`}
                  {addedCount > 0 && removedCount > 0 && " "}
                  {removedCount > 0 && `−${removedCount}`}
                </JmBadge>
              )}
            </div>
          </div>
          <JmDrawerDescription>{fixedName}</JmDrawerDescription>
        </JmDrawerHeader>

        <JmDrawerBody className="space-y-4">
          {/* 새 매핑 추가 카드 (흰 카드) */}
          <JmCard className="p-4">
            <div className="space-y-3">
              <p className="text-jm-xs font-medium text-[var(--jm-text-muted)]">새 매핑 추가</p>
              <ResponsiveProductCombobox
                mode={mode}
                products={products}
                supplierProducts={supplierProducts}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
              {/* 변환비율 — 회색 배경 위에 시각적 강조 */}
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[var(--jm-bg)] px-3 py-2.5">
                <div className="flex flex-col items-center text-center">
                  <span className="text-jm-3xs text-[var(--jm-text-muted)]">거래처</span>
                  <span className="text-jm-base font-semibold tabular-nums text-[var(--jm-text)]">
                    1 <span className="text-jm-xs font-normal text-[var(--jm-text-muted)]">{supplierUnit || "?"}</span>
                  </span>
                </div>
                <ArrowRight className="size-4 shrink-0 text-[var(--jm-text-subtle)]" />
                <div className="flex flex-1 items-center gap-2">
                  <span className="text-jm-3xs text-[var(--jm-text-muted)]">내 상품</span>
                  <JmInput
                    size="sm"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={conversionRate}
                    onChange={(e) => setConversionRate(e.target.value)}
                    className="w-24 text-center font-semibold tabular-nums"
                  />
                  <span className="text-jm-xs text-[var(--jm-text-muted)]">{productUnit || "?"}</span>
                </div>
                <JmButton variant="outline" size="sm" onClick={handleAdd}>
                  <Plus className="size-3.5" />
                  추가
                </JmButton>
              </div>
            </div>
          </JmCard>

          {/* 매핑 목록 — 카드 리스트 */}
          <div className="space-y-2">
            <p className="px-1 text-jm-xs font-medium text-[var(--jm-text-muted)]">매핑 목록</p>

            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <JmSkeleton key={i} className="h-16 w-full rounded-2xl" />
                ))}
              </div>
            ) : mappings.length === 0 && pendingMappings.length === 0 ? (
              <JmCard className="p-8">
                <JmEmpty title="매핑된 항목이 없습니다" />
              </JmCard>
            ) : (
              <div className="space-y-2">
                {pendingMappings.map((p) => {
                  const product = mode === "supplier-to-product"
                    ? products.find((pr) => pr.id === p.targetId)
                    : null;
                  return (
                    <JmCard
                      key={p.tempId}
                      className="group relative flex items-center gap-3 overflow-hidden p-3 pl-4"
                    >
                      <div className="absolute inset-y-2 left-0 w-1 rounded-full bg-[var(--jm-success-solid)]" />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        {mode === "supplier-to-product" ? (
                          <>
                            <span className="truncate text-jm-sm font-medium text-[var(--jm-text)]">
                              {product?.name ?? p.targetLabel}
                            </span>
                            <span className="flex items-center gap-1.5">
                              {product && (
                                <JmBadge variant="outline" size="sm" shape="square">{product.sku}</JmBadge>
                              )}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="truncate text-jm-sm font-medium text-[var(--jm-text)]">
                              {p.targetLabel}
                            </span>
                            <span className="truncate text-jm-xs text-[var(--jm-text-muted)]">
                              {p.targetSub}
                            </span>
                          </>
                        )}
                      </div>
                      <span className="shrink-0 text-jm-sm font-semibold tabular-nums text-[var(--jm-text)]">
                        ×{p.conversionRate}
                      </span>
                      <div className="shrink-0 opacity-60 transition-opacity group-hover:opacity-100">
                        <JmIconButton
                          variant="ghost"
                          size="sm"
                          aria-label="제거"
                          onClick={() => setPendingMappings((prev) => prev.filter((x) => x.tempId !== p.tempId))}
                        >
                          <Trash2 className="size-3.5" />
                        </JmIconButton>
                      </div>
                    </JmCard>
                  );
                })}
                {mappings.map((m) => {
                  const isDeleted = deletedIds.includes(m.id);
                  return (
                    <JmCard
                      key={m.id}
                      className={
                        isDeleted
                          ? "group relative flex items-center gap-3 overflow-hidden p-3 pl-4 opacity-50"
                          : "group relative flex items-center gap-3 overflow-hidden p-3 pl-4"
                      }
                    >
                      {isDeleted && (
                        <div className="absolute inset-y-2 left-0 w-1 rounded-full bg-[var(--jm-text-subtle)]" />
                      )}
                      <div className={`flex min-w-0 flex-1 flex-col gap-0.5 ${isDeleted ? "line-through" : ""}`}>
                        {mode === "supplier-to-product" ? (
                          <>
                            <span className="truncate text-jm-sm font-medium text-[var(--jm-text)]">
                              {m.product.name}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <JmBadge variant="outline" size="sm" shape="square">{m.product.sku}</JmBadge>
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="truncate text-jm-sm font-medium text-[var(--jm-text)]">
                              <span className="inline-flex items-center gap-1.5">
                                {m.supplierProduct.name}
                                {m.supplierProduct.isProvisional && (
                                  <JmBadge variant="warning" size="sm" shape="square">임시</JmBadge>
                                )}
                              </span>
                            </span>
                            <span className="truncate text-jm-xs text-[var(--jm-text-muted)]">
                              {m.supplierProduct.supplier.name}
                            </span>
                          </>
                        )}
                      </div>
                      <span className="shrink-0 text-jm-sm font-semibold tabular-nums text-[var(--jm-text)]">
                        ×{m.conversionRate}
                      </span>
                      <div className="shrink-0 opacity-60 transition-opacity group-hover:opacity-100">
                        {isDeleted ? (
                          <JmIconButton
                            variant="ghost"
                            size="sm"
                            aria-label="복원"
                            onClick={() => setDeletedIds((prev) => prev.filter((d) => d !== m.id))}
                          >
                            <Undo2 className="size-3.5" />
                          </JmIconButton>
                        ) : (
                          <JmIconButton
                            variant="ghost"
                            size="sm"
                            aria-label="삭제"
                            onClick={() => setDeletedIds((prev) => [...prev, m.id])}
                          >
                            <Trash2 className="size-3.5" />
                          </JmIconButton>
                        )}
                      </div>
                    </JmCard>
                  );
                })}
              </div>
            )}
          </div>
        </JmDrawerBody>

        <JmDrawerFooter className="justify-between bg-[var(--jm-surface)]">
          <span className="text-jm-xs text-[var(--jm-text-muted)]">{changeSummary}</span>
          <div className="flex items-center gap-2">
            <JmButton variant="outline" onClick={() => onOpenChange(false)}>취소</JmButton>
            <JmButton onClick={handleSubmit} disabled={!hasChanges || submitting}>
              {submitting && <JmSpinner size="sm" tone="inverted" />}
              저장
            </JmButton>
          </div>
        </JmDrawerFooter>
      </JmDrawerContent>
    </JmDrawer>
  );
}

// ─── IncomingCostSheet ────────────────────────────────────────────────────────

interface IncomingCostSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierProductId: string;
  supplierProductName: string;
  onCostChange?: () => void;
}

export function IncomingCostSheet({ open, onOpenChange, supplierProductId, supplierProductName, onCostChange }: IncomingCostSheetProps) {
  const [costs, setCosts] = useState<IncomingCost[]>([]);
  const [loading, setLoading] = useState(false);
  const [avgShippingCost, setAvgShippingCost] = useState<number | null>(null);
  const [avgShippingIsTaxable, setAvgShippingIsTaxable] = useState(false);
  const [name, setName] = useState("");
  const [costType, setCostType] = useState<"FIXED" | "PERCENTAGE">("FIXED");
  const [value, setValue] = useState("");
  const [perUnit, setPerUnit] = useState(true);
  const [isTaxable, setIsTaxable] = useState(true);
  const [adding, setAdding] = useState(false);

  const fetchCosts = useCallback(async () => {
    setLoading(true);
    try {
      setCosts(await apiGet<IncomingCost[]>(`/api/supplier-products/${supplierProductId}/costs`));
    } finally {
      setLoading(false);
    }
  }, [supplierProductId]);

  const fetchAvgShipping = useCallback(async () => {
    const data = await apiGet<{ avgShippingCost: number | null; avgShippingIsTaxable: boolean | null }>(
      `/api/supplier-products/${supplierProductId}/avg-shipping`,
    );
    setAvgShippingCost(data.avgShippingCost ?? null);
    setAvgShippingIsTaxable(data.avgShippingIsTaxable ?? false);
  }, [supplierProductId]);

  useEffect(() => {
    if (open) {
      fetchCosts();
      fetchAvgShipping();
      setName("");
      setValue("");
      setCostType("FIXED");
      setPerUnit(true);
      setIsTaxable(true);
    }
  }, [open, fetchCosts, fetchAvgShipping]);

  const handleAdd = async () => {
    if (!name.trim() || !value) { toast.error("이름과 금액을 입력해주세요"); return; }
    setAdding(true);
    try {
      await apiMutate(`/api/supplier-products/${supplierProductId}/costs`, "POST", {
        name: name.trim(),
        costType,
        value,
        perUnit,
        isTaxable,
      });
      setName("");
      setValue("");
      setCostType("FIXED");
      setPerUnit(true);
      setIsTaxable(true);
      await fetchCosts();
      onCostChange?.();
      toast.success("비용이 추가되었습니다");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "비용 추가에 실패했습니다");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (costId: string) => {
    await apiMutate(`/api/supplier-products/${supplierProductId}/costs?costId=${costId}`, "DELETE");
    setCosts((prev) => prev.filter((c) => c.id !== costId));
    onCostChange?.();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[60vh] p-0 flex flex-col">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle>입고 비용</SheetTitle>
          <SheetDescription>{supplierProductName}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          {/* 추가 폼 */}
          <div className="px-5 py-4 border-b border-border space-y-2">
            <p className="text-xs font-medium text-muted-foreground">새 비용 추가</p>
            {/* 라벨 행 */}
            <div className="grid grid-cols-[1fr_110px_96px_96px_80px_64px] gap-2">
              <span className="text-xs text-muted-foreground">비용명</span>
              <span className="text-xs text-muted-foreground">유형</span>
              <span className="text-xs text-muted-foreground">{costType === "FIXED" ? "금액 (₩)" : "비율 (%)"}</span>
              <span className="text-xs text-muted-foreground">적용</span>
              <span className="text-xs text-muted-foreground">부가세</span>
              <span />
            </div>
            {/* 입력 행 */}
            <div className="grid grid-cols-[1fr_110px_96px_96px_80px_64px] gap-2 items-center">
              <Input
                placeholder="예: 택배비"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) handleAdd(); }}
                className="h-8 text-[13px]"
              />
              <Select value={costType} onValueChange={(v) => setCostType((v ?? "FIXED") as "FIXED" | "PERCENTAGE")}>
                <SelectTrigger className="h-8 w-full text-[13px]">
                  <span>{costType === "FIXED" ? "고정금액" : "비율(%)"}</span>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectItem value="FIXED">고정금액</SelectItem>
                  <SelectItem value="PERCENTAGE">비율(%)</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="text"
                inputMode={costType === "FIXED" ? "numeric" : "decimal"}
                placeholder={costType === "FIXED" ? "3,000" : "5"}
                value={costType === "FIXED" ? formatComma(value) : value}
                onChange={(e) => {
                  const v = costType === "FIXED" ? parseComma(e.target.value) : e.target.value;
                  setValue(v);
                }}
                onFocus={(e) => e.currentTarget.select()}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) handleAdd(); }}
                className="h-8 text-[13px]"
              />
              <Select value={perUnit ? "unit" : "incoming"} onValueChange={(v) => setPerUnit(v === "unit")}>
                <SelectTrigger className="h-8 w-full text-[13px]">
                  <span>{perUnit ? "개당" : "입고건당"}</span>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectItem value="unit">개당</SelectItem>
                  <SelectItem value="incoming">입고건당</SelectItem>
                </SelectContent>
              </Select>
              <Select value={isTaxable ? "taxable" : "exempt"} onValueChange={(v) => setIsTaxable(v === "taxable")}>
                <SelectTrigger className="h-8 w-full text-[13px]">
                  <span>{isTaxable ? "과세" : "면세"}</span>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectItem value="taxable">과세</SelectItem>
                  <SelectItem value="exempt">면세</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={handleAdd} disabled={adding} className="w-full">
                {adding ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                추가
              </Button>
            </div>
          </div>

          {/* 비용 목록 */}
          {loading ? (
            <div className="space-y-2 px-5 py-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : costs.length === 0 && avgShippingCost === null ? (
            <p className="text-sm text-muted-foreground py-8 text-center">등록된 비용이 없습니다</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-muted text-muted-foreground text-xs border-b border-border">
                  <th className="py-2 px-3 text-left font-medium">비용명</th>
                  <th className="py-2 px-3 text-left font-medium">유형</th>
                  <th className="py-2 px-3 text-right font-medium">금액</th>
                  <th className="py-2 px-3 text-left font-medium">적용</th>
                  <th className="py-2 px-3 text-left font-medium">부가세</th>
                  <th className="py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {avgShippingCost !== null && (
                  <tr className="border-b border-border">
                    <td className="px-3 py-2.5 font-medium text-primary">
                      평균 배송비
                      <span className="ml-1.5 text-[10px] font-normal text-muted-foreground uppercase tracking-wide">자동</span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">고정</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-primary">
                      ₩{Math.round(avgShippingCost).toLocaleString("ko-KR")}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">개당</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{avgShippingIsTaxable ? "과세" : "면세"}</td>
                    <td className="py-2 text-center text-muted-foreground">—</td>
                  </tr>
                )}
                {costs.map((c) => (
                  <tr key={c.id} className="border-b border-border hover:bg-muted/50">
                    <td className="px-3 py-2.5 font-medium">{c.name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{c.costType === "FIXED" ? "고정" : "비율"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {c.costType === "FIXED"
                        ? `₩${parseFloat(c.value).toLocaleString("ko-KR")}`
                        : `${parseFloat(c.value)}%`}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{c.perUnit ? "개당" : "입고건당"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {c.isTaxable ? (
                        <span className="text-foreground">과세</span>
                      ) : (
                        <span>면세</span>
                      )}
                    </td>
                    <td className="py-2 text-center">
                      <Button variant="ghost" size="icon-xs" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ScrollArea>

        <div className="border-t border-border px-5 py-3 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>닫기</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
