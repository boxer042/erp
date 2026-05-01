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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChipToggle } from "@/components/ui/chip-toggle";

import { BrandCombobox, type BrandOption } from "@/components/brand-combobox";
import { QuickBrandSheet } from "@/components/quick-register-sheets";
import { ApiError, apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { UNITS_OF_MEASURE } from "@/lib/constants";
import {
  updateProductFields,
  type ProductFieldsInput,
} from "@/lib/product-mutations";
import type { ProductDetail } from "../types";

interface CategoryOption {
  id: string;
  name: string;
  parentId: string | null;
  children: { id: string; name: string }[];
}

interface ProductInfoEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductDetail;
}

export function ProductInfoEditSheet(props: ProductInfoEditSheetProps) {
  // open=false 일 때 inner 를 언마운트해서, 열 때마다 form state 가 product 로 초기화되도록.
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <ProductInfoEditSheetContent {...props} />}
    </Sheet>
  );
}

function ProductInfoEditSheetContent({
  onOpenChange,
  product,
}: ProductInfoEditSheetProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: product.name,
    brandId: product.brandId ?? "",
    brandName: product.brandRef?.name ?? product.brand ?? "",
    categoryId: product.categoryId ?? "",
    modelName: product.modelName ?? "",
    spec: product.spec ?? "",
    unitOfMeasure: product.unitOfMeasure,
    taxType: product.taxType as "TAXABLE" | "TAX_FREE" | "ZERO_RATE",
  });

  const brandsQuery = useQuery({
    queryKey: ["brands", "list"],
    queryFn: () => apiGet<BrandOption[]>("/api/brands"),
  });

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories.list(),
    queryFn: () => apiGet<CategoryOption[]>("/api/categories"),
  });

  const [quickBrandOpen, setQuickBrandOpen] = useState(false);
  const [quickBrandDefaultName, setQuickBrandDefaultName] = useState("");

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!form.name.trim()) {
        throw new Error("상품명을 입력해주세요");
      }
      const fields: ProductFieldsInput = {
        name: form.name.trim(),
        sku: product.sku,
        brand: form.brandName || product.brand || null,
        brandId: form.brandId || null,
        modelName: form.modelName || null,
        spec: form.spec || null,
        description: product.description ?? null,
        unitOfMeasure: form.unitOfMeasure,
        productType: product.productType as ProductFieldsInput["productType"],
        taxType: form.taxType,
        taxRate: product.taxRate ?? "0.1",
        listPrice: product.listPrice ?? product.sellingPrice,
        sellingPrice: product.sellingPrice,
        isSet: product.isSet,
        isBulk: product.isBulk,
        containerSize: product.containerSize ?? null,
        bulkProductId: product.bulkProductId ?? null,
        imageUrl: product.imageUrl ?? null,
        memo: product.memo ?? null,
        categoryId: form.categoryId || null,
      };
      return updateProductFields(product.id, fields);
    },
    onSuccess: () => {
      toast.success("기본 정보가 저장되었습니다");
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장에 실패했습니다"),
  });

  // 카테고리: 부모/자식 평탄화 (간단히 트리 표시 — 깊이 1로 가정)
  const categoryItems: { id: string; label: string }[] = [];
  for (const cat of categoriesQuery.data ?? []) {
    categoryItems.push({ id: cat.id, label: cat.name });
    for (const child of cat.children) {
      categoryItems.push({ id: child.id, label: `${cat.name} › ${child.name}` });
    }
  }

  return (
    <>
      <SheetContent side="bottom" className="h-[90vh] p-0 flex flex-col">
          <SheetHeader className="border-b border-border px-5 py-4 flex-shrink-0">
            <SheetTitle>기본 정보 수정</SheetTitle>
            <SheetDescription className="text-xs">
              상품명·SKU·판매가는 상세에서 인라인 편집 가능. 여기는 분류·표시 정보를 수정합니다.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <Field label="상품명">
                <Input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="상품명"
                  className="h-9"
                  autoFocus
                />
              </Field>

              <Field label="브랜드">
                <BrandCombobox
                  brands={brandsQuery.data ?? []}
                  value={form.brandId}
                  onChange={(id, name) =>
                    setForm((p) => ({ ...p, brandId: id, brandName: name }))
                  }
                  onCreateNew={(name) => {
                    setQuickBrandDefaultName(name);
                    setQuickBrandOpen(true);
                  }}
                />
              </Field>

              <Field label="카테고리">
                <Select
                  value={form.categoryId || "__none"}
                  onValueChange={(v) =>
                    setForm((p) => ({ ...p, categoryId: !v || v === "__none" ? "" : v }))
                  }
                >
                  <SelectTrigger className="!h-9 w-full">
                    <SelectValue placeholder="카테고리 선택..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">없음</SelectItem>
                    {categoryItems.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="모델명">
                <Input
                  value={form.modelName}
                  onChange={(e) => setForm((p) => ({ ...p, modelName: e.target.value }))}
                  placeholder="모델명 (선택)"
                  className="h-9"
                />
              </Field>

              <Field label="규격">
                <Input
                  value={form.spec}
                  onChange={(e) => setForm((p) => ({ ...p, spec: e.target.value }))}
                  placeholder="예: B-55, 3HP (선택)"
                  className="h-9"
                />
              </Field>

              <Field label="단위">
                <Select
                  value={form.unitOfMeasure}
                  onValueChange={(v) => setForm((p) => ({ ...p, unitOfMeasure: v ?? p.unitOfMeasure }))}
                >
                  <SelectTrigger className="!h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS_OF_MEASURE.map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label} ({u.value})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="세금유형">
                <ChipToggle<"TAXABLE" | "TAX_FREE" | "ZERO_RATE">
                  value={form.taxType}
                  onChange={(v) => setForm((p) => ({ ...p, taxType: v }))}
                  options={[
                    { value: "TAXABLE", label: "과세" },
                    { value: "ZERO_RATE", label: "과세, 영세율" },
                    { value: "TAX_FREE", label: "면세" },
                  ]}
                />
              </Field>
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

      <QuickBrandSheet
        open={quickBrandOpen}
        onOpenChange={setQuickBrandOpen}
        defaultName={quickBrandDefaultName}
        onCreated={(brand) => {
          setForm((p) => ({ ...p, brandId: brand.id, brandName: brand.name }));
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
