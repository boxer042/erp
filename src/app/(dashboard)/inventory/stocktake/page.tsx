"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { STOCKTAKE_REASONS, STOCKTAKE_REASON_LABELS } from "@/lib/validators/stocktake";

interface MappingOption {
  id: string;
  supplierProductId: string;
  supplierProductName: string;
  supplierName: string;
}

interface InventoryItem {
  id: string;
  productId: string;
  quantity: string;
  safetyStock: string;
  product: {
    id: string;
    name: string;
    sku: string;
    unitOfMeasure: string;
    isSet: boolean;
  };
  mappings: MappingOption[];
}

type Reason = (typeof STOCKTAKE_REASONS)[number];

interface StocktakeRow {
  productId: string;
  productName: string;
  sku: string;
  unitOfMeasure: string;
  isSet: boolean;
  systemQty: number;
  actualQty: string;
  reason: Reason;
  supplierProductId: string;
  mappings: MappingOption[];
  memo: string;
}

export default function StocktakePage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<StocktakeRow[]>([]);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showDiffOnly, setShowDiffOnly] = useState(false);

  const fetchInventories = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/inventory/stocktake");
    if (res.ok) {
      const data: InventoryItem[] = await res.json();
      setRows(
        data.map((inv) => ({
          productId: inv.productId,
          productName: inv.product.name,
          sku: inv.product.sku,
          unitOfMeasure: inv.product.unitOfMeasure,
          isSet: inv.product.isSet,
          systemQty: Number(inv.quantity),
          actualQty: Number(inv.quantity).toString(),
          reason: "PHYSICAL_COUNT" as Reason,
          supplierProductId: inv.mappings[0]?.supplierProductId || "",
          mappings: inv.mappings,
          memo: "",
        }))
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchInventories(); }, [fetchInventories]);

  const updateRow = (index: number, updates: Partial<StocktakeRow>) => {
    setRows((prev) => prev.map((r, i) => i === index ? { ...r, ...updates } : r));
  };

  const filteredRows = rows.filter((r) => {
    const matchSearch = !search ||
      r.productName.toLowerCase().includes(search.toLowerCase()) ||
      r.sku.toLowerCase().includes(search.toLowerCase());
    const diff = parseFloat(r.actualQty) - r.systemQty;
    const matchDiff = !showDiffOnly || Math.abs(diff) >= 0.0001;
    return matchSearch && matchDiff;
  });

  const changedRows = rows.filter((r) => {
    const diff = parseFloat(r.actualQty) - r.systemQty;
    return Math.abs(diff) >= 0.0001;
  });

  const handleSubmit = async () => {
    // 증가 행인데 supplierProductId가 없는 경우 검증
    const missingSupplier = changedRows.filter((r) => {
      const diff = parseFloat(r.actualQty) - r.systemQty;
      return diff > 0 && !r.supplierProductId;
    });
    if (missingSupplier.length > 0) {
      toast.error(`재고 증가 행은 공급상품 선택 필수: ${missingSupplier.map((r) => r.productName).join(", ")}`);
      return;
    }

    setSubmitting(true);
    try {
      const items = changedRows.map((r) => {
        const diff = parseFloat(r.actualQty) - r.systemQty;
        return {
          productId: r.productId,
          actualQuantity: r.actualQty,
          reason: r.reason,
          supplierProductId: diff > 0 ? r.supplierProductId : undefined,
          memo: r.memo || undefined,
        };
      });

      if (items.length === 0) {
        toast.error("보정할 항목이 없습니다");
        return;
      }

      const res = await fetch("/api/inventory/stocktake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(
          (typeof err.error === "string" ? err.error : err.error?.formErrors?.[0]) || "보정 실패",
        );
        return;
      }

      const result = await res.json();
      toast.success(`${result.count}개 항목 실사 보정 완료`);
      setConfirmOpen(false);
      fetchInventories();
    } catch {
      toast.error("오류가 발생했습니다");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="flex h-full flex-col">
        <DataTableToolbar
          search={{
            value: search,
            onChange: setSearch,
            onSearch: () => {},
            placeholder: "상품명 또는 SKU 검색",
          }}
          onRefresh={fetchInventories}
          loading={loading}
          filters={
            <div className="flex items-center gap-1.5">
              <Button
                variant={showDiffOnly ? "default" : "outline"}
                size="sm"
                className="h-[30px] text-[13px]"
                onClick={() => setShowDiffOnly(!showDiffOnly)}
              >
                차이만
              </Button>
              {changedRows.length > 0 && (
                <span className="text-xs text-muted-foreground">{changedRows.length}건 변경</span>
              )}
              <Button
                size="sm"
                className="h-[30px] text-[13px]"
                disabled={changedRows.length === 0}
                onClick={() => setConfirmOpen(true)}
              >
                보정 적용
              </Button>
            </div>
          }
        />

        <ScrollArea className="flex-1 min-h-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>상품명</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>단위</TableHead>
                <TableHead className="text-right">시스템 재고</TableHead>
                <TableHead className="text-right w-[120px]">실사 수량</TableHead>
                <TableHead className="text-right w-[90px]">차이</TableHead>
                <TableHead className="w-[130px]">보정 사유</TableHead>
                <TableHead className="w-[160px]">공급상품 (증가 시)</TableHead>
                <TableHead className="w-[140px]">메모</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8">로딩 중...</TableCell></TableRow>
              ) : filteredRows.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8">재고 데이터가 없습니다</TableCell></TableRow>
              ) : (
                filteredRows.map((row) => {
                  const rowIndex = rows.findIndex((r) => r.productId === row.productId);
                  const diff = parseFloat(row.actualQty) - row.systemQty;
                  const hasDiff = Math.abs(diff) >= 0.0001;
                  const isIncrease = diff > 0;

                  return (
                    <TableRow key={row.productId}>
                      <TableCell className="font-medium">
                        {row.productName}
                        {row.isSet && <Badge className="ml-2" variant="secondary">세트</Badge>}
                      </TableCell>
                      <TableCell><Badge variant="outline">{row.sku}</Badge></TableCell>
                      <TableCell>{row.unitOfMeasure}</TableCell>
                      <TableCell className="text-right">{row.systemQty.toLocaleString("ko-KR")}</TableCell>
                      <TableCell className="p-1">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.actualQty}
                          onChange={(e) => updateRow(rowIndex, { actualQty: e.target.value })}
                          className={`h-8 text-right text-[13px] ${hasDiff ? "border-yellow-500/50" : ""}`}
                        />
                      </TableCell>
                      <TableCell className={`text-right font-medium ${
                        !hasDiff ? "text-muted-foreground" : diff > 0 ? "text-green-500" : "text-red-500"
                      }`}>
                        {!hasDiff ? "0" : `${diff > 0 ? "+" : ""}${diff.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}`}
                      </TableCell>
                      <TableCell className="p-1">
                        <Select
                          value={row.reason}
                          onValueChange={(v) => updateRow(rowIndex, { reason: (v ?? "PHYSICAL_COUNT") as Reason })}
                        >
                          <SelectTrigger className="h-8 text-[13px]" disabled={!hasDiff}>
                            <SelectValue>
                              {(v: unknown) =>
                                typeof v === "string" && v in STOCKTAKE_REASON_LABELS
                                  ? STOCKTAKE_REASON_LABELS[v as Reason]
                                  : ""
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {STOCKTAKE_REASONS.map((r) => (
                              <SelectItem key={r} value={r}>{STOCKTAKE_REASON_LABELS[r]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="p-1">
                        {isIncrease ? (
                          row.mappings.length === 0 ? (
                            <span className="text-xs text-red-500">매핑 없음</span>
                          ) : (
                            <Select
                              value={row.supplierProductId}
                              onValueChange={(v) => updateRow(rowIndex, { supplierProductId: v ?? "" })}
                            >
                              <SelectTrigger className="h-8 text-[13px]">
                                <SelectValue placeholder="선택">
                                  {(v: unknown) => {
                                    const found = row.mappings.find((m) => m.supplierProductId === v);
                                    return found ? `${found.supplierProductName} (${found.supplierName})` : "선택";
                                  }}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {row.mappings.map((m) => (
                                  <SelectItem key={m.id} value={m.supplierProductId}>
                                    {m.supplierProductName} ({m.supplierName})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="p-1">
                        <Input
                          value={row.memo}
                          onChange={(e) => updateRow(rowIndex, { memo: e.target.value })}
                          className="h-8 text-[13px]"
                          placeholder="메모"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>실사 보정 확인</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              <strong>{changedRows.length}건</strong>의 재고를 보정합니다.
            </p>
            <ScrollArea className="max-h-[300px] rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">상품</TableHead>
                    <TableHead className="text-xs text-right">현재</TableHead>
                    <TableHead className="text-xs text-right">실사</TableHead>
                    <TableHead className="text-xs text-right">차이</TableHead>
                    <TableHead className="text-xs">사유</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {changedRows.map((row) => {
                    const diff = parseFloat(row.actualQty) - row.systemQty;
                    return (
                      <TableRow key={row.productId}>
                        <TableCell className="text-xs">{row.productName}</TableCell>
                        <TableCell className="text-xs text-right">{row.systemQty.toLocaleString("ko-KR")}</TableCell>
                        <TableCell className="text-xs text-right">{parseFloat(row.actualQty).toLocaleString("ko-KR")}</TableCell>
                        <TableCell className={`text-xs text-right font-medium ${diff > 0 ? "text-green-500" : "text-red-500"}`}>
                          {diff > 0 ? "+" : ""}{diff.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}
                        </TableCell>
                        <TableCell className="text-xs">{STOCKTAKE_REASON_LABELS[row.reason]}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>취소</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              보정 적용
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
