"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { SupplierCombobox } from "@/components/supplier-combobox";
import { AlertTriangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";

interface Lot {
  id: string;
  productId: string | null;
  product: { id: string; name: string; sku: string } | null;
  supplierProduct: {
    id: string;
    name: string;
    supplierCode: string | null;
    spec: string | null;
    unitOfMeasure: string;
    supplier: { id: string; name: string };
  };
  receivedQty: string;
  remainingQty: string;
  unitCost: string;
  receivedAt: string;
  source: "INCOMING" | "INITIAL" | "ADJUSTMENT";
  memo: string | null;
}

interface Supplier {
  id: string;
  name: string;
  businessNumber?: string | null;
}

const sourceLabels: Record<string, string> = {
  INCOMING: "입고",
  INITIAL: "기초",
  ADJUSTMENT: "조정",
};

const formatWon = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`;
const formatQty = (v: string | number) => parseFloat(String(v)).toLocaleString("ko-KR");

function LotsSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><div className="flex justify-end"><Skeleton className="h-4 w-12" /></div></TableCell>
          <TableCell><div className="flex justify-end"><Skeleton className="h-4 w-12" /></div></TableCell>
          <TableCell><div className="flex justify-end"><Skeleton className="h-4 w-16" /></div></TableCell>
          <TableCell><div className="flex justify-end"><Skeleton className="h-4 w-20" /></div></TableCell>
          <TableCell><Skeleton className="h-5 w-12 rounded-md" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

export default function InventoryLotsPage() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const [supplierId, setSupplierId] = useState("");
  const [mapped, setMapped] = useState<"all" | "mapped" | "orphan">("all");
  const [source, setSource] = useState<"all" | "INCOMING" | "INITIAL" | "ADJUSTMENT">("all");
  const [hasRemaining, setHasRemaining] = useState(false);

  const fetchLots = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (supplierId) params.set("supplierId", supplierId);
    if (mapped !== "all") params.set("mapped", mapped);
    if (source !== "all") params.set("source", source);
    if (hasRemaining) params.set("hasRemaining", "true");
    const res = await fetch(`/api/inventory/lots?${params}`);
    if (res.ok) setLots(await res.json());
    setLoading(false);
  }, [supplierId, mapped, source, hasRemaining]);

  const fetchSuppliers = useCallback(async () => {
    const res = await fetch("/api/suppliers");
    if (res.ok) setSuppliers(await res.json());
  }, []);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);
  useEffect(() => { fetchLots(); }, [fetchLots]);

  const totalRemainingValue = lots.reduce(
    (sum, l) => sum + parseFloat(l.remainingQty) * parseFloat(l.unitCost),
    0,
  );
  const orphanLots = lots.filter((l) => l.productId === null);
  const orphanRemainingValue = orphanLots.reduce(
    (sum, l) => sum + parseFloat(l.remainingQty) * parseFloat(l.unitCost),
    0,
  );

  return (
    <div className="flex h-full flex-col">
      <DataTableToolbar
        onRefresh={fetchLots}
        loading={loading}
        filters={
          <div className="flex items-center gap-2">
            <div className="w-[200px]">
              <SupplierCombobox
                suppliers={suppliers}
                value={supplierId}
                onChange={(id) => setSupplierId(id)}
                onCreateNew={() => {}}
                clearable
                placeholder="전체 거래처"
              />
            </div>
            <Select value={mapped} onValueChange={(v) => setMapped(v as typeof mapped)}>
              <SelectTrigger className="h-[30px] w-[110px] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="mapped">매핑</SelectItem>
                <SelectItem value="orphan">미매핑</SelectItem>
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
              <SelectTrigger className="h-[30px] w-[110px] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">모든 소스</SelectItem>
                <SelectItem value="INCOMING">입고</SelectItem>
                <SelectItem value="INITIAL">기초</SelectItem>
                <SelectItem value="ADJUSTMENT">조정</SelectItem>
              </SelectContent>
            </Select>
            <label className="flex items-center gap-1.5 text-[13px] text-muted-foreground cursor-pointer">
              <Checkbox
                checked={hasRemaining}
                onCheckedChange={(c) => setHasRemaining(c === true)}
              />
              잔량만
            </label>
          </div>
        }
      />

      {/* 요약 */}
      <div className="flex items-center gap-4 border-b border-border px-5 py-2.5 text-[13px]">
        <div>
          <span className="text-muted-foreground">총 로트: </span>
          <span className="font-medium">{lots.length}건</span>
        </div>
        <div>
          <span className="text-muted-foreground">잔량 원가합계: </span>
          <span className="font-medium">{formatWon(totalRemainingValue)}</span>
        </div>
        {orphanLots.length > 0 && (
          <div>
            <span className="text-muted-foreground">미매핑: </span>
            <span className="font-medium text-warning">
              {orphanLots.length}건 · {formatWon(orphanRemainingValue)}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>수령일</TableHead>
              <TableHead>거래처</TableHead>
              <TableHead>공급상품</TableHead>
              <TableHead>매핑 판매상품</TableHead>
              <TableHead className="text-right">수령</TableHead>
              <TableHead className="text-right">잔량</TableHead>
              <TableHead className="text-right">단가</TableHead>
              <TableHead className="text-right">잔량 원가</TableHead>
              <TableHead>소스</TableHead>
              <TableHead>메모</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <LotsSkeletonRows />
            ) : lots.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">로트가 없습니다</TableCell>
              </TableRow>
            ) : (
              lots.map((lot) => {
                const remainingValue = parseFloat(lot.remainingQty) * parseFloat(lot.unitCost);
                return (
                  <TableRow key={lot.id}>
                    <TableCell className="text-muted-foreground">
                      {new Date(lot.receivedAt).toLocaleDateString("ko-KR")}
                    </TableCell>
                    <TableCell>{lot.supplierProduct.supplier.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{lot.supplierProduct.name}</span>
                        {lot.supplierProduct.supplierCode && (
                          <span className="text-xs text-muted-foreground">
                            {lot.supplierProduct.supplierCode}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {lot.product ? (
                        <div className="flex items-center gap-1.5">
                          <span>{lot.product.name}</span>
                          <span className="text-xs text-muted-foreground">{lot.product.sku}</span>
                        </div>
                      ) : (
                        <Badge variant="warning">
                          <AlertTriangle className="size-3 mr-1" />
                          미매핑
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQty(lot.receivedQty)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQty(lot.remainingQty)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatWon(parseFloat(lot.unitCost))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatWon(remainingValue)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">
                        {sourceLabels[lot.source]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{lot.memo || "-"}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
