"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { focusCaretEnd } from "@/jm/lib/focus";
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
import {
  JmButton,
  JmCheckbox,
  JmDrawer,
  JmDrawerContent,
  JmDrawerDescription,
  JmDrawerHeader,
  JmDrawerTitle,
  JmInput,
  JmSelect,
} from "@/jm";
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
  return (
    <JmDrawer open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <ProductInfoEditSheetContent {...props} />}
    </JmDrawer>
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
    taxType: product.taxType as "TAXABLE" | "TAX_FREE",
    zeroRateEligible: product.zeroRateEligible,
    trackable: product.trackable ?? false,
    warrantyMonths:
      product.warrantyMonths != null ? String(product.warrantyMonths) : "",
    countryOfOrigin: product.countryOfOrigin ?? "",
    manufacturer: product.manufacturer ?? "",
    importer: product.importer ?? "",
    certifications: product.certifications ?? "",
    manufactureDate: product.manufactureDate ?? "",
    warrantyPolicy: product.warrantyPolicy ?? "",
    asResponsible: product.asResponsible ?? "",
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
        assemblyTemplateId: product.assemblyTemplateId ?? null,
        zeroRateEligible: form.zeroRateEligible,
        trackable: form.trackable,
        warrantyMonths: form.warrantyMonths ? parseInt(form.warrantyMonths, 10) : null,
        countryOfOrigin: form.countryOfOrigin || null,
        manufacturer: form.manufacturer || null,
        importer: form.importer || null,
        certifications: form.certifications || null,
        manufactureDate: form.manufactureDate || null,
        warrantyPolicy: form.warrantyPolicy || null,
        asResponsible: form.asResponsible || null,
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

  // 카테고리 옵션 (부모/자식 평탄화)
  const categoryOptions: { value: string; label: string }[] = [
    { value: "__none", label: "없음" },
  ];
  for (const cat of categoriesQuery.data ?? []) {
    categoryOptions.push({ value: cat.id, label: cat.name });
    for (const child of cat.children) {
      categoryOptions.push({
        value: child.id,
        label: `${cat.name} › ${child.name}`,
      });
    }
  }

  const unitOptions = UNITS_OF_MEASURE.map((u) => ({
    value: u.value,
    label: `${u.label} (${u.value})`,
  }));

  return (
    <>
      <JmDrawerContent
        side="bottom"
        size="xl"
        className="flex flex-col p-0"
        dragHandle={false}
      >
        <JmDrawerHeader className="border-b border-[var(--jm-border)] px-5 py-4 flex-shrink-0">
          <JmDrawerTitle>기본 정보 수정</JmDrawerTitle>
          <JmDrawerDescription className="text-jm-xs">
            상품명·SKU·판매가는 상세에서 인라인 편집 가능. 여기는 분류·표시 정보를
            수정합니다.
          </JmDrawerDescription>
        </JmDrawerHeader>

        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <Field label="상품명">
              <JmInput
                size="sm"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                onFocus={focusCaretEnd}
                placeholder="상품명"
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
              <JmSelect
                size="sm"
                options={categoryOptions}
                value={form.categoryId || "__none"}
                onChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    categoryId: !v || v === "__none" ? "" : v,
                  }))
                }
                placeholder="카테고리 선택..."
              />
            </Field>

            <Field label="모델명">
              <JmInput
                size="sm"
                value={form.modelName}
                onChange={(e) =>
                  setForm((p) => ({ ...p, modelName: e.target.value }))
                }
                onFocus={focusCaretEnd}
                placeholder="모델명 (선택)"
              />
            </Field>

            <Field label="규격">
              <JmInput
                size="sm"
                value={form.spec}
                onChange={(e) => setForm((p) => ({ ...p, spec: e.target.value }))}
                onFocus={focusCaretEnd}
                placeholder="예: B-55, 3HP (선택)"
              />
            </Field>

            <Field label="단위">
              <JmSelect
                size="sm"
                options={unitOptions}
                value={form.unitOfMeasure}
                onChange={(v) =>
                  setForm((p) => ({ ...p, unitOfMeasure: v ?? p.unitOfMeasure }))
                }
              />
            </Field>

            <Field label="세금유형">
              <ChipToggle<"TAXABLE" | "TAX_FREE">
                value={form.taxType}
                onChange={(v) => setForm((p) => ({ ...p, taxType: v }))}
                options={[
                  { value: "TAXABLE", label: "과세" },
                  { value: "TAX_FREE", label: "면세" },
                ]}
              />
            </Field>

            <Field label="영세율 적용 가능">
              <label className="flex items-center gap-2 text-jm-sm cursor-pointer">
                <JmCheckbox
                  checked={form.zeroRateEligible}
                  onCheckedChange={(c) =>
                    setForm((p) => ({ ...p, zeroRateEligible: c === true }))
                  }
                />
                <span className="text-[var(--jm-text-muted)]">
                  체크 시 판매·견적·거래명세표에서 라인별 영세율 적용 토글이
                  노출됩니다 (예: 수출 거래)
                </span>
              </label>
            </Field>

            <Field label="개별추적">
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-jm-sm cursor-pointer">
                  <JmCheckbox
                    checked={form.trackable}
                    onCheckedChange={(c) =>
                      setForm((p) => ({ ...p, trackable: c === true }))
                    }
                  />
                  <span className="text-[var(--jm-text-muted)]">
                    체크 시 POS 결제 시 시리얼 라벨이 발번됩니다 (큰 상품·내구재)
                  </span>
                </label>
                {form.trackable && (
                  <div className="flex items-center gap-2 pl-6">
                    <label
                      className="text-jm-sm text-[var(--jm-text-muted)]"
                      htmlFor="warrantyMonths"
                    >
                      보증기간
                    </label>
                    <JmInput
                      id="warrantyMonths"
                      size="sm"
                      type="text"
                      inputMode="numeric"
                      value={form.warrantyMonths}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          warrantyMonths: e.target.value.replace(/\D/g, ""),
                        }))
                      }
                      onFocus={focusCaretEnd}
                      placeholder="0"
                      className="w-20 text-right tabular-nums"
                    />
                    <span className="text-jm-sm text-[var(--jm-text-muted)]">
                      개월
                    </span>
                  </div>
                )}
              </div>
            </Field>

            <div className="rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface-muted)]/40 px-3 py-3 space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <h4 className="text-jm-sm font-semibold text-[var(--jm-text)]">
                  상품정보 고시
                </h4>
                <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                  전자상거래법 표시 의무 — 빈 칸은 페이지에 표시 안 됨
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="제조국">
                  <JmInput
                    size="sm"
                    value={form.countryOfOrigin}
                    placeholder="예: 한국, 독일, 중국"
                    onChange={(e) =>
                      setForm((p) => ({ ...p, countryOfOrigin: e.target.value }))
                    }
                    onFocus={focusCaretEnd}
                  />
                </Field>
                <Field label="제조자">
                  <JmInput
                    size="sm"
                    value={form.manufacturer}
                    placeholder="예: STIHL AG"
                    onChange={(e) =>
                      setForm((p) => ({ ...p, manufacturer: e.target.value }))
                    }
                    onFocus={focusCaretEnd}
                  />
                </Field>
                <Field label="수입자 (해외 제품)">
                  <JmInput
                    size="sm"
                    value={form.importer}
                    placeholder="국내 제품이면 비워두세요"
                    onChange={(e) =>
                      setForm((p) => ({ ...p, importer: e.target.value }))
                    }
                    onFocus={focusCaretEnd}
                  />
                </Field>
                <Field label="제조 연월">
                  <JmInput
                    size="sm"
                    value={form.manufactureDate}
                    placeholder="예: 2024-03 또는 본체 라벨 별도 표기"
                    onChange={(e) =>
                      setForm((p) => ({ ...p, manufactureDate: e.target.value }))
                    }
                    onFocus={focusCaretEnd}
                  />
                </Field>
                <div className="md:col-span-2">
                  <Field label="인증·허가 사항">
                    <JmInput
                      size="sm"
                      value={form.certifications}
                      placeholder="예: 안전인증 KC-2024-0000 / 관련 안전 인증 취득 완료"
                      onChange={(e) =>
                        setForm((p) => ({ ...p, certifications: e.target.value }))
                      }
                      onFocus={focusCaretEnd}
                    />
                  </Field>
                </div>
                <Field label="품질보증기준">
                  <JmInput
                    size="sm"
                    value={form.warrantyPolicy}
                    placeholder="비우면 '소비자분쟁해결기준 준용' 자동 표시"
                    onChange={(e) =>
                      setForm((p) => ({ ...p, warrantyPolicy: e.target.value }))
                    }
                    onFocus={focusCaretEnd}
                  />
                </Field>
                <Field label="A/S 책임자">
                  <JmInput
                    size="sm"
                    value={form.asResponsible}
                    placeholder="비우면 사업자 정보 자동 표시"
                    onChange={(e) =>
                      setForm((p) => ({ ...p, asResponsible: e.target.value }))
                    }
                    onFocus={focusCaretEnd}
                  />
                </Field>
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--jm-border)] px-5 py-4 flex justify-end gap-2 bg-[var(--jm-bg)] flex-shrink-0">
            <JmButton
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saveMutation.isPending}
            >
              취소
            </JmButton>
            <JmButton
              type="button"
              variant="cta"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              <span>저장</span>
            </JmButton>
          </div>
        </div>
      </JmDrawerContent>

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-jm-xs text-[var(--jm-text-muted)]">{label}</label>
      {children}
    </div>
  );
}
