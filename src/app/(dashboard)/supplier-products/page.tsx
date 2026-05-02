"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Link2, Plus } from "lucide-react";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { MappingSheet } from "@/components/mapping-sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

function SupplierProductsSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><div className="flex justify-end"><Skeleton className="h-4 w-16" /></div></TableCell>
          <TableCell><div className="flex justify-end"><Skeleton className="h-4 w-16" /></div></TableCell>
          <TableCell><div className="flex justify-end"><Skeleton className="h-4 w-16" /></div></TableCell>
          <TableCell><Skeleton className="h-5 w-16 rounded-md" /></TableCell>
          <TableCell><div className="flex justify-end"><Skeleton className="h-4 w-12" /></div></TableCell>
        </TableRow>
      ))}
    </>
  );
}

interface MappingInfo {
  id: string;
  conversionRate: string;
  product: { id: string; name: string; sku: string; sellingPrice: string };
}

interface IncomingCostSummary {
  costType: "FIXED" | "PERCENTAGE";
  value: string;
  isTaxable: boolean;
}

interface SupplierProduct {
  id: string;
  supplierId: string;
  name: string;
  spec: string | null;
  supplierCode: string | null;
  unitPrice: string;
  isTaxable: boolean;
  isProvisional: boolean;
  unitOfMeasure: string;
  source: string;
  supplier: { name: string };
  productMappings: MappingInfo[];
  _count: { incomingItems: number };
  incomingCosts: IncomingCostSummary[];
  avgShippingCost: number | null;
  priceHistory: { oldPrice: string; newPrice: string }[];
}

interface Supplier {
  id: string;
  name: string;
}

export default function SupplierProductsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState("all");
  const [mappingFilter, setMappingFilter] = useState<"all" | "mapped" | "unmapped">("all");

  // 매핑 선택 다이얼로그
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [choiceTarget, setChoiceTarget] = useState<{ id: string; supplierId: string; name: string; unit: string } | null>(null);

  // 매핑 시트
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTarget, setDialogTarget] = useState<{ id: string; name: string; unit: string } | null>(null);
  const [defaultProductId, setDefaultProductId] = useState("");

  const itemsQuery = useQuery({
    queryKey: queryKeys.supplierProducts.list({ supplierId: selectedSupplier, search: searchQuery }),
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedSupplier !== "all") params.set("supplierId", selectedSupplier);
      if (searchQuery) params.set("search", searchQuery);
      return apiGet<SupplierProduct[]>(`/api/supplier-products?${params}`);
    },
  });
  const items = itemsQuery.data ?? [];
  const loading = itemsQuery.isPending;
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.supplierProducts.all });

  const suppliersQuery = useQuery({
    queryKey: queryKeys.suppliers.list(),
    queryFn: () => apiGet<Supplier[]>("/api/suppliers"),
  });
  const suppliers = suppliersQuery.data ?? [];

  const filteredItems = items.filter((item) => {
    if (mappingFilter === "mapped") return item.productMappings.length > 0;
    if (mappingFilter === "unmapped") return item.productMappings.length === 0;
    return true;
  });

  const unmappedCount = items.filter((i) => i.productMappings.length === 0).length;

  const openMappingChoice = (sp: SupplierProduct) => {
    setChoiceTarget({ id: sp.id, supplierId: sp.supplierId, name: sp.name, unit: sp.unitOfMeasure });
    setChoiceOpen(true);
  };

  const openMapping = (sp?: { id: string; supplierId: string; name: string; unit: string }, productId = "") => {
    const target = sp ?? choiceTarget;
    if (!target) return;
    setDialogTarget(target);
    setDefaultProductId(productId);
    setChoiceOpen(false);
    setDialogOpen(true);
  };

  return (
    <>
      <div className="flex h-full flex-col">
        <DataTableToolbar
          search={{
            value: search,
            onChange: setSearch,
            onSearch: () => setSearchQuery(search),
            placeholder: "품명 / 품번 검색...",
          }}
          onRefresh={refresh}
          loading={loading}
          filters={
            <div className="flex items-center gap-1.5">
              <Select value={selectedSupplier} onValueChange={(v) => setSelectedSupplier(v ?? "all")}>
                <SelectTrigger className="h-[30px] w-[140px] text-[13px] bg-card border-border">
                  <span className="truncate">
                    {selectedSupplier === "all" ? "전체 거래처" : suppliers.find((s) => s.id === selectedSupplier)?.name ?? "전체 거래처"}
                  </span>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectItem value="all">전체 거래처</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={mappingFilter} onValueChange={(v) => setMappingFilter((v ?? "all") as "all" | "mapped" | "unmapped")}>
                <SelectTrigger className="h-[30px] w-[120px] text-[13px] bg-card border-border">
                  <span className="truncate">
                    {{ all: "전체 상태", mapped: "매핑됨", unmapped: "미매핑" }[mappingFilter]}
                  </span>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectItem value="all">전체 상태</SelectItem>
                  <SelectItem value="mapped">매핑됨</SelectItem>
                  <SelectItem value="unmapped">미매핑</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        />

        {unmappedCount > 0 && (
          <div className="flex items-center gap-2 bg-yellow-500/10 border-b border-yellow-500/20 px-5 py-2 text-sm text-yellow-400">
            <AlertTriangle className="size-4 shrink-0" />
            미매핑 상품 {unmappedCount}건 — 입고 확정 시 재고에 반영되지 않습니다
          </div>
        )}

        <ScrollArea className="flex-1 min-h-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>거래처</TableHead>
                <TableHead>품명</TableHead>
                <TableHead>규격</TableHead>
                <TableHead>품번</TableHead>
                <TableHead className="text-right">원가</TableHead>
                <TableHead className="text-right">입고비용</TableHead>
                <TableHead className="text-right">입고가</TableHead>
                <TableHead>매핑 상태</TableHead>
                <TableHead className="text-right">입고 횟수</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <SupplierProductsSkeletonRows />
              ) : filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">거래처 상품이 없습니다</TableCell>
                </TableRow>
              ) : (
                filteredItems.map((sp) => {
                  const unit = parseFloat(sp.unitPrice) || 0;
                  const baseCost = unit * (sp.isTaxable ? 1.1 : 1); // 원가 (개당, VAT포함)

                  // 입고비용 (개당, VAT포함 합계) = 부대비용 환산 + 평균 배송비
                  const fixedSum = sp.incomingCosts
                    .filter((c) => c.costType === "FIXED")
                    .reduce((sum, c) => sum + parseFloat(c.value), 0);
                  const pctSum = sp.incomingCosts
                    .filter((c) => c.costType === "PERCENTAGE")
                    .reduce((sum, c) => {
                      const amount = (unit * parseFloat(c.value)) / 100;
                      return sum + (c.isTaxable ? amount * 1.1 : amount);
                    }, 0);
                  const shipping = sp.avgShippingCost ?? 0;
                  const incomingCost = fixedSum + pctSum + shipping;
                  const hasIncomingCost =
                    sp.incomingCosts.length > 0 || sp.avgShippingCost !== null;

                  const totalIncomingPrice = baseCost + incomingCost;
                  const hasBase = sp._count.incomingItems > 0 || sp.source === "INITIAL";

                  const latest = sp.priceHistory[0];
                  const priceDir = latest
                    ? parseFloat(latest.newPrice) > parseFloat(latest.oldPrice)
                      ? "up"
                      : parseFloat(latest.newPrice) < parseFloat(latest.oldPrice)
                        ? "down"
                        : null
                    : null;

                  return (
                  <TableRow key={sp.id}>
                    <TableCell>{sp.supplier.name}</TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        <Link href={`/supplier-products/${sp.id}`} className="hover:text-primary transition-colors">
                          {sp.name}
                        </Link>
                        {sp.isProvisional && (
                          <Badge variant="warning" className="text-[10px] px-1 py-0">임시</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{sp.spec || "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{sp.supplierCode || "-"}</TableCell>

                    {/* 원가 */}
                    <TableCell className="text-right tabular-nums">
                      {hasBase ? (
                        <span className="inline-flex items-center gap-1">
                          ₩{Math.round(baseCost).toLocaleString("ko-KR")}
                          {sp._count.incomingItems > 0 && priceDir === "up" && <span className="text-red-500">↑</span>}
                          {sp._count.incomingItems > 0 && priceDir === "down" && <span className="text-blue-500">↓</span>}
                          {sp._count.incomingItems === 0 && sp.source === "INITIAL" && (
                            <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0 text-muted-foreground border-muted-foreground/30">기초</Badge>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>

                    {/* 입고비용 */}
                    <TableCell className="text-right tabular-nums">
                      {hasIncomingCost && incomingCost > 0 ? (
                        <span>₩{Math.round(incomingCost).toLocaleString("ko-KR")}</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">미등록</span>
                      )}
                    </TableCell>

                    {/* 입고가 */}
                    <TableCell className="text-right tabular-nums">
                      {hasBase && totalIncomingPrice > 0 ? (
                        <span className="font-medium">₩{Math.round(totalIncomingPrice).toLocaleString("ko-KR")}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>

                    <TableCell
                      className="cursor-pointer hover:text-foreground transition-colors"
                      onClick={() => sp.productMappings.length > 0 ? openMapping({ id: sp.id, supplierId: sp.supplierId, name: sp.name, unit: sp.unitOfMeasure }) : openMappingChoice(sp)}
                    >
                      {sp.productMappings.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {sp.productMappings.map((m) => {
                            const noPrice = parseFloat(m.product.sellingPrice) === 0;
                            return (
                              <Badge key={m.id} variant="outline" className={`text-xs ${noPrice ? "text-yellow-400 border-yellow-400/30" : ""}`}>
                                {m.product.name}
                                {noPrice && <span className="ml-1">가격 미설정</span>}
                              </Badge>
                            );
                          })}
                        </div>
                      ) : (
                        <Badge variant="warning">
                          <AlertTriangle className="size-3 mr-1" />
                          미매핑
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {sp._count.incomingItems}
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      {/* 매핑 방법 선택 다이얼로그 */}
      <Dialog open={choiceOpen} onOpenChange={setChoiceOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>매핑 방법 선택</DialogTitle>
            <DialogDescription className="text-[13px]">
              {choiceTarget?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-start gap-1 text-left"
              onClick={() => openMapping()}
            >
              <span className="flex items-center gap-2 font-medium">
                <Link2 className="size-4" />
                기존 상품으로 매핑
              </span>
              <span className="text-xs text-muted-foreground font-normal">
                이미 등록된 판매 상품과 연결합니다
              </span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-start gap-1 text-left"
              onClick={() => {
                setChoiceOpen(false);
                const params = new URLSearchParams();
                if (choiceTarget) {
                  params.set("supplierId", choiceTarget.supplierId);
                  params.set("supplierProductId", choiceTarget.id);
                }
                router.push(`/products/new?${params}`);
              }}
            >
              <span className="flex items-center gap-2 font-medium">
                <Plus className="size-4" />
                새 상품 등록
              </span>
              <span className="text-xs text-muted-foreground font-normal">
                상품 등록 페이지로 이동합니다
              </span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {dialogTarget && (
        <MappingSheet
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          mode="supplier-to-product"
          supplierProductId={dialogTarget.id}
          supplierProductName={dialogTarget.name}
          supplierProductUnit={dialogTarget.unit}
          defaultProductId={defaultProductId}
          onMappingChange={refresh}
        />
      )}

    </>
  );
}
