"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { Skeleton } from "@/components/ui/skeleton";

function ProductsSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
          <TableCell><Skeleton className="h-5 w-20 rounded-md" /></TableCell>
          <TableCell><Skeleton className="h-4 w-8" /></TableCell>
          <TableCell className="text-right"><div className="flex justify-end"><Skeleton className="h-4 w-16" /></div></TableCell>
          <TableCell className="text-right"><div className="flex justify-end"><Skeleton className="h-4 w-12" /></div></TableCell>
          <TableCell className="text-right"><div className="flex justify-end"><Skeleton className="h-4 w-20" /></div></TableCell>
          <TableCell className="text-right"><div className="flex justify-end"><Skeleton className="h-4 w-10" /></div></TableCell>
          <TableCell className="text-right"><div className="flex justify-end"><Skeleton className="h-4 w-10" /></div></TableCell>
          <TableCell><Skeleton className="h-5 w-12 rounded-full" /></TableCell>
          <TableCell><Skeleton className="h-4 w-6" /></TableCell>
          <TableCell><Skeleton className="h-8 w-8 rounded-md" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { MappingSheet } from "@/components/mapping-sheet";

interface CategoryOption {
  id: string;
  name: string;
  parentId: string | null;
  children: { id: string; name: string }[];
}

interface ProductMapping {
  id: string;
  conversionRate: string;
  supplierProduct: {
    id: string;
    name: string;
    unitPrice: string;
    isProvisional: boolean;
    supplier: { name: string };
  };
}

interface Product {
  id: string;
  name: string;
  brand: string | null;
  sku: string;
  unitOfMeasure: string;
  productType: string;
  listPrice: string;
  sellingPrice: string;
  taxType: string;
  taxRate: string;
  isSet: boolean;
  isBulk?: boolean;
  isCanonical: boolean;
  canonicalProductId: string | null;
  canonicalProduct: { id: string; name: string; sku: string } | null;
  variants: Array<{
    id: string;
    name: string;
    sku: string;
    inventory: { quantity: string } | null;
  }>;
  isActive: boolean;
  unitCost: number | null;
  inventory: { quantity: string; safetyStock: string } | null;
  productMappings: ProductMapping[];
}

function productTypeBadge(type: string) {
  switch (type) {
    case "FINISHED": return <Badge variant="secondary">완제품</Badge>;
    case "PARTS": return <Badge variant="outline">부속</Badge>;
    case "SET": return <Badge>세트</Badge>;
    case "ASSEMBLED": return <Badge variant="default">조립</Badge>;
    default: return <Badge variant="secondary">완제품</Badge>;
  }
}

function calcBreakdown(netPrice: number, taxRate: number, taxType: string) {
  if (taxType !== "TAXABLE" || taxRate === 0) {
    return { supply: netPrice, tax: 0, total: netPrice };
  }
  // 정수 단가는 반올림, 소수 단가(벌크)는 정확한 값 유지
  const rawTax = netPrice * taxRate;
  const tax = Number.isInteger(netPrice) ? Math.round(rawTax) : rawTax;
  return { supply: netPrice, tax, total: netPrice + tax };
}

export default function ProductsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const [mappingSheetOpen, setMappingSheetOpen] = useState(false);
  const [mappingTarget, setMappingTarget] = useState<{ id: string; name: string; unit: string } | null>(null);

  const [showLowStock, setShowLowStock] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");

  const [safetyOpen, setSafetyOpen] = useState(false);
  const [safetyTarget, setSafetyTarget] = useState<Product | null>(null);
  const [safetyValue, setSafetyValue] = useState("");

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories.list(),
    queryFn: () => apiGet<CategoryOption[]>("/api/categories"),
  });
  const categories = categoriesQuery.data ?? [];

  const productsQuery = useQuery({
    queryKey: queryKeys.products.list({ search: appliedSearch, categoryId: selectedCategoryId, showBulk }),
    queryFn: () => {
      const params = new URLSearchParams({ search: appliedSearch });
      if (selectedCategoryId) params.set("categoryId", selectedCategoryId);
      // 토글 ON: 벌크 SKU만, OFF(기본): 일반 SKU만
      if (showBulk) params.set("isBulk", "true");
      return apiGet<Product[]>(`/api/products?${params.toString()}`);
    },
  });

  const products = productsQuery.data ?? [];
  const loading = productsQuery.isPending;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.products.all });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/products/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("상품이 비활성화되었습니다");
      invalidate();
    },
    onError: () => toast.error("삭제에 실패했습니다"),
  });

  const safetyMutation = useMutation({
    mutationFn: (vars: { productId: string; safetyStock: string }) =>
      apiMutate("/api/inventory/safety", "PUT", vars),
    onSuccess: () => {
      toast.success("안전재고가 설정되었습니다");
      setSafetyOpen(false);
      invalidate();
    },
    onError: () => toast.error("설정 실패"),
  });

  const openCreate = () => router.push("/products/new");

  const handleDelete = (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    deleteMutation.mutate(id);
  };

  const formatPrice = (n: number) => n.toLocaleString("ko-KR");

  return (
    <div className="flex h-full flex-col">
      <DataTableToolbar
        search={{
          value: search,
          onChange: setSearch,
          onSearch: () => setAppliedSearch(search),
          placeholder: "상품명 또는 SKU로 검색",
        }}
        onRefresh={() => setAppliedSearch(search)}
        onAdd={openCreate}
        addLabel="상품 등록"
        loading={loading}
        filters={
          <>
            {categories.length > 0 && (
              <Select
                value={selectedCategoryId || "__all__"}
                onValueChange={(v) => setSelectedCategoryId(!v || v === "__all__" ? "" : v)}
              >
                <SelectTrigger className="h-[30px] text-[13px] w-[150px]">
                  <SelectValue>
                    {(() => {
                      if (!selectedCategoryId) return "전체 카테고리";
                      for (const cat of categories) {
                        if (cat.id === selectedCategoryId) return cat.name;
                        const child = cat.children.find((c) => c.id === selectedCategoryId);
                        if (child) return child.name;
                      }
                      return "전체 카테고리";
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체 카테고리</SelectItem>
                  {categories.map((cat) =>
                    cat.children.length > 0 ? (
                      <SelectGroup key={cat.id}>
                        <SelectLabel>{cat.name}</SelectLabel>
                        {cat.children.map((child) => (
                          <SelectItem key={child.id} value={child.id}>{child.name}</SelectItem>
                        ))}
                      </SelectGroup>
                    ) : (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            )}
            <Button
              variant={showLowStock ? "default" : "outline"}
              size="sm"
              className="h-[30px] text-[13px]"
              onClick={() => setShowLowStock((v) => !v)}
            >
              낮은재고만
            </Button>
            <Badge
              variant={showBulk ? "success" : "outline"}
              className="cursor-pointer select-none h-[22px] px-2.5 text-[12px]"
              onClick={() => setShowBulk((v) => !v)}
            >
              벌크만 보기
            </Badge>
          </>
        }
      />
      <ScrollArea className="flex-1 min-h-0">
        <Table className="min-w-[1100px]">
          <TableHeader>
            <TableRow>
              <TableHead>상품명</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>단위</TableHead>
              <TableHead className="text-right">공급가액</TableHead>
              <TableHead className="text-right">세액</TableHead>
              <TableHead className="text-right">판매가</TableHead>
              <TableHead className="text-right">재고</TableHead>
              <TableHead className="text-right">안전재고</TableHead>
              <TableHead>유형</TableHead>
              <TableHead>매핑</TableHead>
              <TableHead className="w-[120px]">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(() => {
              if (loading) {
                return <ProductsSkeletonRows />;
              }

              // separate variants from top-level (canonical + standalone)
              const variantsByCanonical = new Map<string, Product[]>();
              const topLevel: Product[] = [];
              for (const p of products) {
                if (p.canonicalProductId) {
                  const list = variantsByCanonical.get(p.canonicalProductId) ?? [];
                  list.push(p);
                  variantsByCanonical.set(p.canonicalProductId, list);
                } else {
                  topLevel.push(p);
                }
              }

              const isProductLowStock = (p: Product) => {
                const q = p.inventory ? parseFloat(p.inventory.quantity) : 0;
                const s = p.inventory ? parseFloat(p.inventory.safetyStock) : 0;
                return s > 0 && q < s;
              };

              const filtered = topLevel.filter((p) => {
                if (!showLowStock) return true;
                if (p.isCanonical) {
                  return (variantsByCanonical.get(p.id) ?? []).some(isProductLowStock);
                }
                return isProductLowStock(p);
              });

              if (filtered.length === 0) {
                return (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8">
                      {showLowStock ? "낮은재고 상품이 없습니다" : "등록된 상품이 없습니다"}
                    </TableCell>
                  </TableRow>
                );
              }

              const renderProductRow = (product: Product) => {
                const bd = calcBreakdown(
                  parseFloat(product.sellingPrice),
                  parseFloat(product.taxRate || "0.1"),
                  product.taxType || "TAXABLE"
                );
                const qty = product.inventory ? parseFloat(product.inventory.quantity) : 0;
                const safety = product.inventory ? parseFloat(product.inventory.safetyStock) : 0;
                const isLow = safety > 0 && qty < safety;
                const isCanonical = product.isCanonical;
                const variantList = variantsByCanonical.get(product.id) ?? [];
                const variantStockSum = isCanonical
                  ? variantList.reduce((s, v) => s + (v.inventory ? parseFloat(v.inventory.quantity) : 0), 0)
                  : 0;

                return (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-start gap-1">
                        <div className="flex flex-col min-w-0">
                          <Link
                            href={`/products/${product.id}`}
                            className="hover:underline hover:text-primary inline-flex items-center gap-1.5 flex-wrap"
                          >
                            {product.name}
                            {isCanonical && (
                              <Badge variant="default" className="text-[10px] px-1 py-0">그룹</Badge>
                            )}
                          </Link>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{product.sku}</Badge></TableCell>
                    <TableCell>{product.unitOfMeasure}</TableCell>
                    <TableCell className="text-right text-muted-foreground">₩{formatPrice(bd.supply)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">₩{formatPrice(bd.tax)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {bd.total === 0 ? (
                        <Badge variant="warning">미설정</Badge>
                      ) : (
                        <>₩{formatPrice(bd.total)}</>
                      )}
                    </TableCell>
                    <TableCell className="text-right p-0">
                      {isCanonical ? (
                        <span className="block w-full h-full px-3 py-2 text-right text-muted-foreground" title="변형 재고 합산">
                          {variantStockSum.toLocaleString("ko-KR")}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={`w-full h-full px-3 py-2 text-right hover:bg-muted/50 rounded cursor-pointer ${isLow ? "text-red-400 font-medium" : ""}`}
                          onClick={() => {
                            setSafetyTarget(product);
                            setSafetyValue(product.inventory?.safetyStock ?? "1");
                            setSafetyOpen(true);
                          }}
                          title="안전재고 설정"
                        >
                          {product.inventory ? qty.toLocaleString("ko-KR") : "-"}
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {product.inventory ? safety.toLocaleString("ko-KR") : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {productTypeBadge(product.productType)}
                        {product.isBulk && <Badge variant="secondary" className="text-[10px]">벌크</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <button
                        className="flex items-center gap-1 text-sm hover:underline cursor-pointer"
                        onClick={() => {
                          setMappingTarget({ id: product.id, name: product.name, unit: product.unitOfMeasure });
                          setMappingSheetOpen(true);
                        }}
                      >
                        {product.productMappings.length > 0 ? (
                          <>
                            <span className="text-brand">{product.productMappings.length}</span>
                            {product.productMappings.some((m) => m.supplierProduct.isProvisional) && (
                              <Badge variant="outline" className="text-foreground border-border text-[10px] px-1 py-0">임시</Badge>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </button>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(product.id)}
                        disabled={deleteMutation.isPending && deleteMutation.variables === product.id}
                      >
                        {deleteMutation.isPending && deleteMutation.variables === product.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              };

              return filtered.map((product) => renderProductRow(product));
            })()}
          </TableBody>
        </Table>
      </ScrollArea>

      {/* 매핑 Sheet (테이블 행) */}
      {mappingTarget && (
        <MappingSheet
          open={mappingSheetOpen}
          onOpenChange={setMappingSheetOpen}
          mode="product-to-supplier"
          productId={mappingTarget.id}
          productName={mappingTarget.name}
          productUnit={mappingTarget.unit}
          onMappingChange={invalidate}
        />
      )}

      {/* 안전재고 설정 Dialog */}
      <Dialog open={safetyOpen} onOpenChange={setSafetyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>안전재고 설정</DialogTitle>
          </DialogHeader>
          {safetyTarget && (
            <form
              className="space-y-3 text-sm"
              onSubmit={(e) => {
                e.preventDefault();
                if (!safetyTarget) return;
                safetyMutation.mutate({ productId: safetyTarget.id, safetyStock: safetyValue });
              }}
            >
              <p className="text-muted-foreground">
                <strong>{safetyTarget.name}</strong> (SKU {safetyTarget.sku})
              </p>
              <div className="space-y-1.5">
                <label className="block text-[13px] text-muted-foreground">
                  안전재고 수량<span className="text-red-400 ml-0.5">*</span>
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={safetyValue}
                  onChange={(e) => setSafetyValue(e.target.value)}
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setSafetyOpen(false)} disabled={safetyMutation.isPending}>취소</Button>
                <Button type="submit" disabled={safetyMutation.isPending}>
                  {safetyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  저장
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
