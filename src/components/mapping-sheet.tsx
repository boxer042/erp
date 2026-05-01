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
import { ResponsiveCombobox } from "@/components/ui/responsive-combobox";
import { Trash2, Loader2, Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { formatComma, parseComma } from "@/lib/utils";

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

// ─── ProductCombobox ──────────────────────────────────────────────────────────

interface MappingItem { id: string; label: string; sub: string }

function ProductCombobox({
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
  const isSupplierMode = mode === "supplier-to-product";

  const allItems: MappingItem[] = isSupplierMode
    ? products.map((p) => ({ id: p.id, label: `${p.name} (${p.sku})`, sub: p.sku }))
    : supplierProducts.map((sp) => ({
        id: sp.id,
        label: `${sp.name}${sp.supplierCode ? ` (${sp.supplierCode})` : ""}`,
        sub: sp.supplier.name,
      }));

  const selected = allItems.find((i) => i.id === selectedId);
  const placeholder = isSupplierMode ? "판매 상품 선택..." : "거래처 상품 선택...";
  const searchPlaceholder = isSupplierMode ? "판매 상품 검색..." : "거래처 상품 검색...";

  return (
    <ResponsiveCombobox<MappingItem>
      items={allItems}
      value={selectedId}
      getItemId={(i) => i.id}
      matches={(i, q) => {
        const lower = q.toLowerCase();
        return i.label.toLowerCase().includes(lower) || i.sub.toLowerCase().includes(lower);
      }}
      onSelect={(i) => onSelect(i.id)}
      selectedLabel={selected?.label}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      mobileTitle={placeholder}
      renderItem={(item) => (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {!isSupplierMode && (
            <span className="text-xs text-muted-foreground shrink-0">{item.sub}</span>
          )}
        </>
      )}
    />
  );
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

  const fetchMappings = useCallback(async () => {
    if (!fixedId) return;
    setLoading(true);
    const param = mode === "supplier-to-product" ? `supplierProductId=${fixedId}` : `productId=${fixedId}`;
    const res = await fetch(`/api/products/mapping?${param}`);
    setMappings(await res.json());
    setLoading(false);
  }, [fixedId, mode]);

  const fetchOptions = useCallback(async () => {
    if (mode === "supplier-to-product") {
      setProducts(await fetch("/api/products").then((r) => r.json()));
    } else {
      setSupplierProducts(await fetch("/api/supplier-products").then((r) => r.json()));
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

    setPendingMappings((prev) => [...prev, { tempId: crypto.randomUUID(), targetId: selectedId, targetLabel: label, targetSub: sub, conversionRate }]);
    setSelectedId("");
    setConversionRate("1");
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      for (const id of deletedIds) {
        await fetch(`/api/products/mapping?id=${id}`, { method: "DELETE" });
      }
      for (const pending of pendingMappings) {
        const body = mode === "supplier-to-product"
          ? { supplierProductId: fixedId, productId: pending.targetId, conversionRate: pending.conversionRate }
          : { supplierProductId: pending.targetId, productId: fixedId, conversionRate: pending.conversionRate };

        const res = await fetch("/api/products/mapping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json();
          toast.error(typeof err.error === "string" ? err.error : `매핑 추가 실패: ${pending.targetLabel}`);
          continue;
        }
        const created = await res.json();
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[70vh] p-0 flex flex-col">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle>매핑 관리</SheetTitle>
          <SheetDescription>{fixedName}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          {/* 새 매핑 추가 폼 */}
          <div className="px-5 py-4 space-y-3 border-b border-border">
            <p className="text-xs font-medium text-muted-foreground">새 매핑 추가</p>
            <ProductCombobox
              mode={mode}
              products={products}
              supplierProducts={supplierProducts}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            <div className="flex items-center gap-2 text-[13px]">
              <span className="text-muted-foreground shrink-0">거래처 1</span>
              <span className="font-medium shrink-0">{supplierUnit || "?"}</span>
              <span className="text-muted-foreground shrink-0">→ 내 상품</span>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={conversionRate}
                onChange={(e) => setConversionRate(e.target.value)}
                className="w-20 h-8 text-center text-[13px]"
              />
              <span className="font-medium shrink-0">{productUnit || "?"}</span>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={handleAdd}>
                <Plus className="size-3.5" />
                추가
              </Button>
            </div>
          </div>

          {/* 매핑 목록 */}
          <div className="px-5 pt-4 pb-2">
            <p className="text-xs font-medium text-muted-foreground">
              매핑 목록 ({mappings.length - deletedIds.length + pendingMappings.length})
            </p>
          </div>

          {loading ? (
            <div className="space-y-2 px-5 py-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : mappings.length === 0 && pendingMappings.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">매핑된 항목이 없습니다</p>
          ) : (
            <div className="-mx-0 border-y border-border">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-muted text-muted-foreground text-xs">
                    {mode === "supplier-to-product" ? (
                      <>
                        <th className="py-2 px-3 text-left font-medium">상품명</th>
                        <th className="py-2 px-3 text-left font-medium">SKU</th>
                      </>
                    ) : (
                      <>
                        <th className="py-2 px-3 text-left font-medium">거래처</th>
                        <th className="py-2 px-3 text-left font-medium">상품명</th>
                      </>
                    )}
                    <th className="py-2 px-3 text-right font-medium w-[60px]">비율</th>
                    <th className="py-2 w-[40px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {pendingMappings.map((p) => (
                    <tr key={p.tempId} className="border-t border-border bg-brand/5">
                      {mode === "supplier-to-product" ? (
                        <>
                          <td className="px-3 py-2 font-medium">
                            <span className="text-brand">+ </span>
                            {products.find((pr) => pr.id === p.targetId)?.name ?? p.targetLabel}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="outline">{products.find((pr) => pr.id === p.targetId)?.sku ?? ""}</Badge>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 text-muted-foreground"><span className="text-brand">+ </span>{p.targetSub}</td>
                          <td className="px-3 py-2 font-medium">{p.targetLabel}</td>
                        </>
                      )}
                      <td className="px-3 py-2 text-right tabular-nums">×{p.conversionRate}</td>
                      <td className="py-2 text-center">
                        <Button variant="ghost" size="icon-xs" onClick={() => setPendingMappings((prev) => prev.filter((x) => x.tempId !== p.tempId))}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {mappings.map((m) => {
                    const isDeleted = deletedIds.includes(m.id);
                    return (
                      <tr key={m.id} className={`border-t border-border ${isDeleted ? "opacity-30 line-through" : "hover:bg-muted/50"}`}>
                        {mode === "supplier-to-product" ? (
                          <>
                            <td className="px-3 py-2 font-medium">{m.product.name}</td>
                            <td className="px-3 py-2"><Badge variant="outline">{m.product.sku}</Badge></td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 text-muted-foreground">{m.supplierProduct.supplier.name}</td>
                            <td className="px-3 py-2 font-medium">
                              <span className="flex items-center gap-1.5">
                                {m.supplierProduct.name}
                                {m.supplierProduct.isProvisional && (
                                  <Badge variant="warning" className="text-[10px] px-1 py-0">임시</Badge>
                                )}
                              </span>
                            </td>
                          </>
                        )}
                        <td className="px-3 py-2 text-right tabular-nums">×{m.conversionRate}</td>
                        <td className="py-2 text-center">
                          {isDeleted ? (
                            <Button variant="ghost" size="icon-xs" onClick={() => setDeletedIds((prev) => prev.filter((d) => d !== m.id))}>
                              <span className="text-xs text-brand">복원</span>
                            </Button>
                          ) : (
                            <Button variant="ghost" size="icon-xs" onClick={() => setDeletedIds((prev) => [...prev, m.id])}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </ScrollArea>

        <div className="border-t border-border px-5 py-3 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>취소</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!hasChanges || submitting}>
            {submitting && <Loader2 className="size-3.5 animate-spin" />}
            저장
          </Button>
        </div>
      </SheetContent>
    </Sheet>
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
    const res = await fetch(`/api/supplier-products/${supplierProductId}/costs`);
    setCosts(await res.json());
    setLoading(false);
  }, [supplierProductId]);

  const fetchAvgShipping = useCallback(async () => {
    const res = await fetch(`/api/supplier-products/${supplierProductId}/avg-shipping`);
    const data = await res.json();
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
      const res = await fetch(`/api/supplier-products/${supplierProductId}/costs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), costType, value, perUnit, isTaxable }),
      });
      if (!res.ok) { toast.error("비용 추가에 실패했습니다"); return; }
      setName("");
      setValue("");
      setCostType("FIXED");
      setPerUnit(true);
      setIsTaxable(true);
      await fetchCosts();
      onCostChange?.();
      toast.success("비용이 추가되었습니다");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (costId: string) => {
    await fetch(`/api/supplier-products/${supplierProductId}/costs?costId=${costId}`, { method: "DELETE" });
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
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
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
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
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
