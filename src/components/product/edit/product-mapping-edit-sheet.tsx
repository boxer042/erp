"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { SupplierCombobox } from "@/components/supplier-combobox";
import { SupplierProductCombobox } from "@/components/supplier-product-combobox";
import {
  QuickSupplierSheet,
  QuickSupplierProductSheet,
} from "@/components/quick-register-sheets";
import { ApiError, apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  diffProductMappings,
  type ExistingProductMapping,
  type ProductMappingRow,
} from "@/lib/product-mutations";
import type { ProductDetail } from "../types";

interface SupplierLite {
  id: string;
  name: string;
  businessNumber?: string | null;
}

interface SupplierProductLite {
  id: string;
  name: string;
  spec: string | null;
  supplierCode: string | null;
  unitPrice: string;
  unitOfMeasure: string;
}

interface ProductMappingEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductDetail;
}

export function ProductMappingEditSheet(props: ProductMappingEditSheetProps) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <ProductMappingEditSheetContent {...props} />}
    </Sheet>
  );
}

interface RowState {
  rowId: string;
  /** null = 신규 행 */
  mappingId: string | null;
  supplierId: string;
  supplierName: string;
  supplierProductId: string;
  supplierProductName: string;
  conversionRate: string;
}

const newRow = (): RowState => ({
  rowId: Math.random().toString(36).slice(2),
  mappingId: null,
  supplierId: "",
  supplierName: "",
  supplierProductId: "",
  supplierProductName: "",
  conversionRate: "1",
});

function ProductMappingEditSheetContent({
  onOpenChange,
  product,
}: ProductMappingEditSheetProps) {
  const queryClient = useQueryClient();

  // 초기 행: 기존 매핑 모두 표시
  const [rows, setRows] = useState<RowState[]>(() => {
    const existing = product.productMappings ?? [];
    if (existing.length === 0) return [newRow()];
    return existing.map((m) => ({
      rowId: Math.random().toString(36).slice(2),
      mappingId: m.id,
      supplierId: m.supplierProduct.supplier.id ?? "",
      supplierName: m.supplierProduct.supplier.name ?? "",
      supplierProductId: m.supplierProduct.id,
      supplierProductName: m.supplierProduct.name,
      conversionRate: m.conversionRate,
    }));
  });

  const suppliersQuery = useQuery({
    queryKey: queryKeys.suppliers.list({}),
    queryFn: () => apiGet<SupplierLite[]>("/api/suppliers"),
  });

  const update = (rowId: string, patch: Partial<RowState>) =>
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));

  const remove = (rowId: string) =>
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));

  const addRow = () => setRows((prev) => [...prev, newRow()]);

  // QuickSheet 상태 — 어느 행 컨텍스트인지 추적
  const [quickSupplierFor, setQuickSupplierFor] = useState<string | null>(null);
  const [quickSupplierName, setQuickSupplierName] = useState("");
  const [quickSpFor, setQuickSpFor] = useState<string | null>(null);
  const [quickSpName, setQuickSpName] = useState("");

  const saveMutation = useMutation({
    mutationFn: async () => {
      // 검증: SP 미선택 행 제거, 같은 SP 중복 차단
      const filled = rows.filter((r) => r.supplierProductId);
      const seen = new Set<string>();
      for (const r of filled) {
        if (seen.has(r.supplierProductId)) {
          throw new Error("같은 공급상품이 중복 매핑되어 있습니다");
        }
        seen.add(r.supplierProductId);
      }

      const prev: ExistingProductMapping[] = (product.productMappings ?? []).map(
        (m) => ({
          mappingId: m.id,
          supplierProductId: m.supplierProduct.id,
          conversionRate: m.conversionRate,
        }),
      );
      const next: ProductMappingRow[] = filled.map((r) => ({
        mappingId: r.mappingId,
        supplierProductId: r.supplierProductId,
        conversionRate: r.conversionRate || "1",
      }));

      const result = await diffProductMappings(product.id, prev, next);
      if (result.failed.length > 0) {
        throw new Error(`일부 항목 실패: ${result.failed.join(", ")}`);
      }
    },
    onSuccess: () => {
      toast.success("매핑이 저장되었습니다");
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : err.message || "저장에 실패했습니다"),
  });

  return (
    <>
      <SheetContent side="right" className="w-full sm:max-w-3xl p-0 flex flex-col">
        <SheetHeader className="border-b border-border px-5 py-4 flex-shrink-0">
          <SheetTitle>공급자 매핑 편집</SheetTitle>
          <SheetDescription className="text-xs">
            이 판매상품을 어느 거래처의 어떤 공급상품으로 환산할지 지정합니다. 한 상품에 여러 공급자 매핑을 둘 수 있습니다. 입고비용은 거래처 상품 상세에서 별도로 관리.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {rows.map((row) => (
              <MappingRow
                key={row.rowId}
                row={row}
                suppliers={suppliersQuery.data ?? []}
                onUpdate={(patch) => update(row.rowId, patch)}
                onRemove={() => remove(row.rowId)}
                onCreateSupplier={(name) => {
                  setQuickSupplierFor(row.rowId);
                  setQuickSupplierName(name);
                }}
                onCreateSp={(name) => {
                  setQuickSpFor(row.rowId);
                  setQuickSpName(name);
                }}
              />
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-full"
              onClick={addRow}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              매핑 추가
            </Button>
          </div>

          <div className="border-t border-border px-5 py-4 flex justify-end gap-2 bg-background flex-shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saveMutation.isPending}
            >
              취소
            </Button>
            <Button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              저장
            </Button>
          </div>
        </div>
      </SheetContent>

      <QuickSupplierSheet
        open={quickSupplierFor !== null}
        onOpenChange={(o) => {
          if (!o) setQuickSupplierFor(null);
        }}
        defaultName={quickSupplierName}
        onCreated={(supplier) => {
          if (quickSupplierFor) {
            update(quickSupplierFor, {
              supplierId: supplier.id,
              supplierName: supplier.name,
              supplierProductId: "",
              supplierProductName: "",
            });
          }
          queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.list({}) });
        }}
      />
      <QuickSupplierProductSheet
        open={quickSpFor !== null}
        onOpenChange={(o) => {
          if (!o) setQuickSpFor(null);
        }}
        defaultName={quickSpName}
        supplierId={
          quickSpFor ? rows.find((r) => r.rowId === quickSpFor)?.supplierId ?? "" : ""
        }
        supplierName={
          quickSpFor ? rows.find((r) => r.rowId === quickSpFor)?.supplierName ?? "" : ""
        }
        onCreated={(sp) => {
          if (quickSpFor) {
            const supId = rows.find((r) => r.rowId === quickSpFor)?.supplierId;
            update(quickSpFor, {
              supplierProductId: sp.id,
              supplierProductName: sp.name,
            });
            if (supId) {
              queryClient.invalidateQueries({
                queryKey: queryKeys.supplierProducts.list({ supplierId: supId }),
              });
            }
          }
        }}
      />
    </>
  );
}

interface MappingRowProps {
  row: RowState;
  suppliers: SupplierLite[];
  onUpdate: (patch: Partial<RowState>) => void;
  onRemove: () => void;
  onCreateSupplier: (name: string) => void;
  onCreateSp: (name: string) => void;
}

function MappingRow({
  row,
  suppliers,
  onUpdate,
  onRemove,
  onCreateSupplier,
  onCreateSp,
}: MappingRowProps) {
  // 거래처가 선택돼야 SP 후보 fetch (행마다 독립적으로)
  const spsQuery = useQuery({
    queryKey: queryKeys.supplierProducts.list({ supplierId: row.supplierId }),
    queryFn: () =>
      apiGet<SupplierProductLite[]>(
        `/api/supplier-products?supplierId=${row.supplierId}`,
      ),
    enabled: !!row.supplierId,
  });

  return (
    <div className="rounded-md border border-border p-3 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_120px_auto] gap-2 items-end">
        <FieldSm label="거래처">
          <SupplierCombobox
            suppliers={suppliers}
            value={row.supplierId}
            onChange={(id, name) => {
              onUpdate({
                supplierId: id,
                supplierName: name,
                // 거래처 바뀌면 SP 선택 초기화
                supplierProductId: "",
                supplierProductName: "",
              });
            }}
            onCreateNew={onCreateSupplier}
          />
        </FieldSm>
        <FieldSm label="공급상품">
          <SupplierProductCombobox
            supplierProducts={spsQuery.data ?? []}
            value={row.supplierProductId}
            onChange={(sp) =>
              onUpdate({ supplierProductId: sp.id, supplierProductName: sp.name })
            }
            onCreateNew={onCreateSp}
            disabled={!row.supplierId}
          />
          {!row.supplierId && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              거래처를 먼저 선택
            </p>
          )}
        </FieldSm>
        <FieldSm label="변환비율">
          <Input
            type="text"
            inputMode="decimal"
            value={row.conversionRate}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "" || /^[0-9]*\.?[0-9]*$/.test(v)) {
                onUpdate({ conversionRate: v });
              }
            }}
            onFocus={(e) => e.currentTarget.select()}
            className="h-9"
          />
        </FieldSm>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          aria-label="행 삭제"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function FieldSm({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
