"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
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
import { replaceProductMapping } from "@/lib/product-mutations";
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

function ProductMappingEditSheetContent({
  onOpenChange,
  product,
}: ProductMappingEditSheetProps) {
  const queryClient = useQueryClient();

  const existingMapping = product.productMappings?.[0];
  const existingSp = existingMapping?.supplierProduct;
  const initialSupplierId = existingSp?.supplier?.id ?? "";
  const initialSpId = existingSp?.id ?? "";
  const initialConversion = existingMapping?.conversionRate ?? "1";

  const [supplierId, setSupplierId] = useState(initialSupplierId);
  const [supplierName, setSupplierName] = useState(existingSp?.supplier?.name ?? "");
  const [spId, setSpId] = useState(initialSpId);
  const [conversionRate, setConversionRate] = useState(initialConversion);

  const [quickSupplierOpen, setQuickSupplierOpen] = useState(false);
  const [quickSupplierDefaultName, setQuickSupplierDefaultName] = useState("");
  const [quickSpOpen, setQuickSpOpen] = useState(false);
  const [quickSpDefaultName, setQuickSpDefaultName] = useState("");

  const suppliersQuery = useQuery({
    queryKey: queryKeys.suppliers.list({}),
    queryFn: () => apiGet<SupplierLite[]>("/api/suppliers"),
  });

  const spsQuery = useQuery({
    queryKey: queryKeys.supplierProducts.list({ supplierId }),
    queryFn: () =>
      apiGet<SupplierProductLite[]>(
        `/api/supplier-products?supplierId=${supplierId}`,
      ),
    enabled: !!supplierId,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      replaceProductMapping(
        product.id,
        {
          mappingId: existingMapping?.id ?? null,
          supplierProductId: initialSpId || null,
          conversionRate: initialConversion,
        },
        {
          supplierProductId: spId || null,
          conversionRate: conversionRate || "1",
        },
      ),
    onSuccess: () => {
      toast.success("매핑이 저장되었습니다");
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장에 실패했습니다"),
  });

  return (
    <>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="border-b border-border px-5 py-4 flex-shrink-0">
          <SheetTitle>공급자 매핑 수정</SheetTitle>
          <SheetDescription className="text-xs">
            이 판매상품을 어느 거래처의 어떤 공급상품으로 환산할지 지정합니다. 입고비용은 거래처 상품 상세에서 별도로 관리합니다.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <Field label="거래처">
              <SupplierCombobox
                suppliers={suppliersQuery.data ?? []}
                value={supplierId}
                onChange={(id, name) => {
                  setSupplierId(id);
                  setSupplierName(name);
                  // 거래처 변경 시 공급상품 선택 초기화
                  if (id !== initialSupplierId) setSpId("");
                }}
                onCreateNew={(name) => {
                  setQuickSupplierDefaultName(name);
                  setQuickSupplierOpen(true);
                }}
              />
            </Field>

            <Field label="공급상품">
              <SupplierProductCombobox
                supplierProducts={spsQuery.data ?? []}
                value={spId}
                onChange={(sp) => setSpId(sp.id)}
                onCreateNew={(name) => {
                  setQuickSpDefaultName(name);
                  setQuickSpOpen(true);
                }}
              />
              {!supplierId && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  거래처를 먼저 선택해주세요.
                </p>
              )}
            </Field>

            <Field label="변환 비율 (공급자 1단위 = 판매 N단위)">
              <Input
                type="text"
                inputMode="decimal"
                value={conversionRate}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^[0-9]*\.?[0-9]*$/.test(v)) setConversionRate(v);
                }}
                onFocus={(e) => e.currentTarget.select()}
                className="h-9"
              />
            </Field>

            {existingSp && (
              <div className="rounded-md bg-muted px-3 py-2 text-xs space-y-1">
                <div className="text-muted-foreground">현재 매핑</div>
                <div>
                  {existingSp.supplier.name} · {existingSp.name}
                  {existingSp.supplierCode ? ` (${existingSp.supplierCode})` : ""}
                </div>
                <div>
                  단가 ₩{parseFloat(existingSp.unitPrice).toLocaleString("ko-KR")} / 변환 {existingMapping?.conversionRate}
                </div>
              </div>
            )}
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
        open={quickSupplierOpen}
        onOpenChange={setQuickSupplierOpen}
        defaultName={quickSupplierDefaultName}
        onCreated={(supplier) => {
          setSupplierId(supplier.id);
          setSupplierName(supplier.name);
          setSpId("");
          queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.list({}) });
        }}
      />
      <QuickSupplierProductSheet
        open={quickSpOpen}
        onOpenChange={setQuickSpOpen}
        defaultName={quickSpDefaultName}
        supplierId={supplierId}
        supplierName={supplierName}
        onCreated={(sp) => {
          setSpId(sp.id);
          queryClient.invalidateQueries({
            queryKey: queryKeys.supplierProducts.list({ supplierId }),
          });
        }}
      />
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
