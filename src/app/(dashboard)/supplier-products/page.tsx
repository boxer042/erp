"use client";

import { useEffect, useState, useCallback } from "react";
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
import { MappingSheet, IncomingCostSheet } from "@/components/mapping-sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  const [items, setItems] = useState<SupplierProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState("all");
  const [mappingFilter, setMappingFilter] = useState<"all" | "mapped" | "unmapped">("all");

  // 매핑 선택 다이얼로그
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [choiceTarget, setChoiceTarget] = useState<{ id: string; supplierId: string; name: string; unit: string } | null>(null);

  // 매핑 시트
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTarget, setDialogTarget] = useState<{ id: string; name: string; unit: string } | null>(null);
  const [defaultProductId, setDefaultProductId] = useState("");

  // 입고 비용 시트
  const [costOpen, setCostOpen] = useState(false);
  const [costTarget, setCostTarget] = useState<{ id: string; name: string } | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedSupplier !== "all") params.set("supplierId", selectedSupplier);
    if (searchQuery) params.set("search", searchQuery);
    const res = await fetch(`/api/supplier-products?${params}`);
    setItems(await res.json());
    setLoading(false);
  }, [selectedSupplier, searchQuery]);

  const fetchSuppliers = useCallback(async () => {
    const res = await fetch("/api/suppliers");
    setSuppliers(await res.json());
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

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

  const openCost = (sp: SupplierProduct) => {
    setCostTarget({ id: sp.id, name: sp.name });
    setCostOpen(true);
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
          onRefresh={fetchItems}
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
                <TableHead className="text-right">입고가</TableHead>
                <TableHead className="text-right">입고 비용</TableHead>
                <TableHead>매핑 상태</TableHead>
                <TableHead className="text-right">입고 횟수</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">로딩 중...</TableCell>
                </TableRow>
              ) : filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">거래처 상품이 없습니다</TableCell>
                </TableRow>
              ) : (
                filteredItems.map((sp) => (
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
                    <TableCell className="text-right tabular-nums">
                      {sp._count.incomingItems > 0
                        ? (() => {
                            const displayPrice = `₩${Math.round(parseFloat(sp.unitPrice) * (sp.isTaxable ? 1.1 : 1)).toLocaleString("ko-KR")}`;
                            const latest = sp.priceHistory[0];
                            const priceDir = latest
                              ? parseFloat(latest.newPrice) > parseFloat(latest.oldPrice) ? "up"
                              : parseFloat(latest.newPrice) < parseFloat(latest.oldPrice) ? "down"
                              : null
                              : null;
                            return (
                              <span className="inline-flex items-center gap-1">
                                {displayPrice}
                                {priceDir === "up" && <span className="text-red-500">↑</span>}
                                {priceDir === "down" && <span className="text-blue-500">↓</span>}
                              </span>
                            );
                          })()
                        : sp.source === "INITIAL"
                          ? (
                            <span className="text-muted-foreground">
                              ₩{Math.round(parseFloat(sp.unitPrice) * (sp.isTaxable ? 1.1 : 1)).toLocaleString("ko-KR")}
                              <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0 text-muted-foreground border-muted-foreground/30">기초</Badge>
                            </span>
                          )
                          : <span className="text-muted-foreground">-</span>
                      }
                    </TableCell>
                    <TableCell
                      className="text-right cursor-pointer hover:text-foreground transition-colors"
                      onClick={() => openCost(sp)}
                    >
                      {(() => {
                        const fixedTotal = sp.incomingCosts
                          .filter((c) => c.costType === "FIXED")
                          .reduce((sum, c) => sum + parseFloat(c.value), 0);
                        const fixedSupply = sp.incomingCosts
                          .filter((c) => c.costType === "FIXED")
                          .reduce((sum, c) => sum + (c.isTaxable ? parseFloat(c.value) / 1.1 : parseFloat(c.value)), 0);
                        const pctTotal = sp.incomingCosts
                          .filter((c) => c.costType === "PERCENTAGE")
                          .reduce((sum, c) => sum + parseFloat(c.value), 0);
                        const hasTaxable = sp.incomingCosts.some((c) => c.costType === "FIXED" && c.isTaxable);
                        const avgShipping = sp.avgShippingCost;
                        if (sp.incomingCosts.length === 0 && avgShipping === null) {
                          return <span className="text-muted-foreground text-xs">미등록</span>;
                        }
                        return (
                          <div className="flex flex-col items-end gap-0.5">
                            {sp.incomingCosts.length > 0 && (
                              <>
                                <span className="tabular-nums">
                                  ₩{fixedTotal.toLocaleString("ko-KR")}
                                  {pctTotal > 0 && ` +${pctTotal}%`}
                                </span>
                                {hasTaxable && (
                                  <span className="text-xs text-muted-foreground tabular-nums">
                                    공급가 ₩{Math.round(fixedSupply).toLocaleString("ko-KR")}
                                  </span>
                                )}
                              </>
                            )}
                            {avgShipping !== null && (
                              <span className={`tabular-nums ${sp.incomingCosts.length > 0 ? "text-xs text-muted-foreground" : ""}`}>
                                ₩{Math.round(avgShipping).toLocaleString("ko-KR")}
                              </span>
                            )}
                          </div>
                        );
                      })()}
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
                ))
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
          onMappingChange={fetchItems}
        />
      )}

      {costTarget && (
        <IncomingCostSheet
          open={costOpen}
          onOpenChange={setCostOpen}
          supplierProductId={costTarget.id}
          supplierProductName={costTarget.name}
          onCostChange={fetchItems}
        />
      )}
    </>
  );
}
