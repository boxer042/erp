"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Loader2, Plus, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { focusCaretEnd } from "@/jm/lib/focus";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";
import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { replaceSetComponents } from "@/lib/product-mutations";
import {
  JmBadge,
  JmButton,
  JmDialog,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmDrawer,
  JmDrawerContent,
  JmDrawerDescription,
  JmDrawerHeader,
  JmDrawerTitle,
  JmIconButton,
  JmInput,
} from "@/jm";
import type { ProductDetail } from "../types";

interface ProductSetComponentsEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductDetail;
}

interface RowState {
  rowId: string;
  product: ProductOption | null;
  quantity: string;
  label: string;
  /** 연결된 슬롯 id (있으면 프리셋 저장 가능). 신규 행은 null. */
  slotId: string | null;
  /** 슬롯 라벨 마스터 id */
  slotLabelId: string | null;
}

const newRow = (): RowState => ({
  rowId: Math.random().toString(36).slice(2),
  product: null,
  quantity: "1",
  label: "",
  slotId: null,
  slotLabelId: null,
});

export function ProductSetComponentsEditSheet(props: ProductSetComponentsEditSheetProps) {
  return (
    <JmDrawer open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <ProductSetComponentsEditSheetContent {...props} />}
    </JmDrawer>
  );
}

function ProductSetComponentsEditSheetContent({
  onOpenChange,
  product,
}: ProductSetComponentsEditSheetProps) {
  const queryClient = useQueryClient();

  const productsQuery = useQuery({
    queryKey: queryKeys.products.list({ scope: "components", excludeId: product.id }),
    // isBulk=all — 벌크 SKU(엔진오일 벌크 등)도 BOM 후보에 포함. 기본값은 벌크 제외라
    // 이 옵션 없으면 기존 구성에 벌크가 들어있어도 콤보박스에서 이름이 안 뜨고 재선택 불가.
    queryFn: () => apiGet<ProductOption[]>("/api/products?isSet=false&isBulk=all"),
    select: (data) => data.filter((p) => p.id !== product.id),
  });

  const [rows, setRows] = useState<RowState[]>(() => {
    const existing = (product.setComponents ?? []).map((sc) => ({
      rowId: Math.random().toString(36).slice(2),
      product: {
        id: sc.component.id,
        name: sc.component.name,
        sku: sc.component.sku,
        sellingPrice: "0",
        unitCost: null,
        unitOfMeasure: "EA",
        isSet: false,
      } as ProductOption,
      quantity: String(sc.quantity),
      label: sc.label ?? sc.slot?.label ?? sc.slotLabel?.name ?? "",
      slotId: sc.slotId ?? null,
      slotLabelId: sc.slotLabelId ?? null,
    }));
    return existing.length > 0 ? existing : [newRow()];
  });

  // 템플릿/프리셋 저장 다이얼로그 상태
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [saveTemplateSubmitting, setSaveTemplateSubmitting] = useState(false);
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const [savePresetName, setSavePresetName] = useState("");
  const [savePresetSubmitting, setSavePresetSubmitting] = useState(false);

  const update = (rowId: string, patch: Partial<RowState>) =>
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));

  const remove = (rowId: string) =>
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));

  const addRow = () => setRows((prev) => [...prev, newRow()]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const filled = rows.filter((r) => r.product);
      const seen = new Set<string>();
      for (const r of filled) {
        if (seen.has(r.product!.id)) {
          throw new Error("중복된 구성품이 있습니다");
        }
        seen.add(r.product!.id);
      }
      return replaceSetComponents(
        product.id,
        filled.map((r) => ({
          componentId: r.product!.id,
          quantity: r.quantity || "1",
          label: r.label.trim() || null,
          slotLabelId: r.slotLabelId,
          slotId: r.slotId,
        })),
      );
    },
    onSuccess: () => {
      toast.success("구성품이 저장되었습니다");
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : err.message || "저장에 실패했습니다",
      ),
  });

  const products = productsQuery.data ?? [];
  const linkedTemplate = product.assemblyTemplate;
  const hasLinkedTemplate = !!linkedTemplate;
  const filledRows = rows.filter((r) => r.product && r.label.trim());
  // 프리셋 저장 가능: 템플릿 연결됐고 모든 채워진 행에 slotId 가 있고 1개 이상
  const presetSavable =
    hasLinkedTemplate &&
    filledRows.length > 0 &&
    filledRows.every((r) => r.slotId);

  return (
    <JmDrawerContent
      side="bottom"
      size="xl"
      className="flex flex-col p-0"
      dragHandle={false}
    >
      <JmDrawerHeader className="border-b border-[var(--jm-border)] px-5 py-4 flex-shrink-0">
        <JmDrawerTitle>
          {product.productType === "ASSEMBLED" ? "조립" : "세트"} 구성품 편집
        </JmDrawerTitle>
        <JmDrawerDescription className="text-jm-xs">
          구성품을 추가/수정/삭제합니다. 라벨은 표시용 별칭(예:{" "}
          &ldquo;메인&rdquo;, &ldquo;보너스&rdquo;)으로 비워둘 수 있습니다.
        </JmDrawerDescription>
      </JmDrawerHeader>

      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* 연결된 조립 템플릿 정보 */}
          {product.productType === "ASSEMBLED" && (
            <div className="rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] px-3 py-2 text-jm-xs">
              {linkedTemplate ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--jm-text-muted)]">사용 템플릿</span>
                    <span className="font-medium text-[var(--jm-text)]">
                      {linkedTemplate.name}
                    </span>
                    <JmBadge variant="info" size="sm" shape="square">
                      슬롯 {linkedTemplate.slots.length}개
                    </JmBadge>
                  </div>
                  <Link
                    href={`/products/assembly-templates/${linkedTemplate.id}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
                  >
                    템플릿 보기 <ExternalLink className="size-3" />
                  </Link>
                </div>
              ) : (
                <span className="text-[var(--jm-text-muted)]">
                  사용 템플릿 없음 — 현재 구성을 템플릿으로 저장할 수 있습니다.
                </span>
              )}
            </div>
          )}

          {rows.map((row) => (
            <div
              key={row.rowId}
              className="rounded-md border border-[var(--jm-border)] p-3 space-y-2"
            >
              {/* 슬롯 정보 뱃지 — 템플릿 슬롯 또는 슬롯라벨 정보가 있을 때만 */}
              {(row.slotId || row.slotLabelId) && (
                <div className="flex items-center gap-1.5 text-jm-2xs">
                  <span className="text-[var(--jm-text-muted)]">슬롯</span>
                  <JmBadge variant={row.slotId ? "info" : "default"} size="sm" shape="square">
                    {row.label || "(이름 없음)"}
                  </JmBadge>
                  {!row.slotId && (
                    <span className="text-[var(--jm-text-muted)]">
                      (템플릿 슬롯 미연결 — 프리셋 저장 대상 아님)
                    </span>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_140px_auto] gap-2 items-end">
                <FieldSm label="구성품">
                  <ProductCombobox
                    products={products}
                    value={row.product?.id ?? ""}
                    onChange={(p) => update(row.rowId, { product: p })}
                    filterType="component"
                  />
                </FieldSm>
                <FieldSm label="수량 (세트 1개당)">
                  <JmInput
                    size="sm"
                    type="text"
                    inputMode="decimal"
                    value={row.quantity}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^[0-9]*\.?[0-9]*$/.test(v)) {
                        update(row.rowId, { quantity: v });
                      }
                    }}
                    onFocus={focusCaretEnd}
                  />
                </FieldSm>
                <FieldSm label="라벨 (선택)">
                  <JmInput
                    size="sm"
                    value={row.label}
                    onChange={(e) => update(row.rowId, { label: e.target.value })}
                    onFocus={focusCaretEnd}
                    placeholder="메인, 보너스 등"
                  />
                </FieldSm>
                <JmIconButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(row.rowId)}
                  aria-label="행 삭제"
                >
                  <Trash2 />
                </JmIconButton>
              </div>
            </div>
          ))}

          <JmButton
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={addRow}
          >
            <Plus />
            <span>구성품 추가</span>
          </JmButton>
        </div>

        <div className="border-t border-[var(--jm-border)] px-5 py-3 flex flex-wrap items-center justify-between gap-2 bg-[var(--jm-bg)] flex-shrink-0">
          {/* 좌측 — 템플릿/프리셋 저장 */}
          <div className="flex flex-wrap items-center gap-1.5">
            {product.productType === "ASSEMBLED" && (
              <>
                <JmButton
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSaveTemplateName(product.name);
                    setSaveTemplateOpen(true);
                  }}
                  disabled={!filledRows.length}
                >
                  <Plus className="size-3.5" />
                  템플릿으로 저장
                </JmButton>
                {hasLinkedTemplate && (
                  <JmButton
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSavePresetName("");
                      setSavePresetOpen(true);
                    }}
                    disabled={!presetSavable}
                    title={
                      !presetSavable
                        ? "모든 행이 템플릿 슬롯과 연결돼 있어야 프리셋으로 저장 가능"
                        : undefined
                    }
                  >
                    <Plus className="size-3.5" />
                    프리셋으로 저장
                  </JmButton>
                )}
              </>
            )}
          </div>

          {/* 우측 — 취소/저장 */}
          <div className="flex items-center gap-2">
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
      </div>

      {/* 현재 구성을 새 템플릿으로 저장 → Product.assemblyTemplateId 도 자동 연결 */}
      <JmDialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <JmDialogContent>
          <JmDialogHeader>
            <JmDialogTitle>
              {hasLinkedTemplate ? "새 템플릿으로 저장 (현재 연결 교체)" : "현재 구성을 템플릿으로 저장"}
            </JmDialogTitle>
          </JmDialogHeader>
          <div className="flex flex-col gap-3 px-6 py-4">
            <div className="flex flex-col gap-1">
              <label className="text-jm-xs text-[var(--jm-text-muted)]">템플릿명</label>
              <JmInput
                value={saveTemplateName}
                onChange={(e) => setSaveTemplateName(e.target.value)}
                placeholder="예: 3HP 공기압축기"
              />
            </div>
            <div className="rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] p-2.5">
              <div className="mb-1 text-jm-xs font-medium text-[var(--jm-text-muted)]">
                저장될 슬롯 ({filledRows.length}개)
              </div>
              <ul className="space-y-0.5 text-jm-xs text-[var(--jm-text)]">
                {filledRows.map((r, i) => (
                  <li key={r.rowId} className="flex items-center gap-1.5">
                    <span className="text-[var(--jm-text-muted)]">{i + 1}.</span>
                    <span className="font-medium">{r.label || "(이름 없음)"}</span>
                    <span className="text-[var(--jm-text-muted)]">×</span>
                    <span>{r.quantity || "1"}</span>
                    {r.product && (
                      <span className="ml-1 text-[var(--jm-text-muted)] truncate">
                        ({r.product.name})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            {hasLinkedTemplate && (
              <p className="text-jm-2xs text-[var(--jm-text-muted)]">
                현재 연결된 템플릿 &ldquo;{linkedTemplate?.name}&rdquo; 은 그대로 유지되고,
                이 상품의 연결만 새 템플릿으로 바뀝니다.
              </p>
            )}
          </div>
          <JmDialogFooter>
            <JmButton
              variant="outline"
              onClick={() => setSaveTemplateOpen(false)}
              disabled={saveTemplateSubmitting}
            >
              취소
            </JmButton>
            <JmButton
              onClick={async () => {
                const name = saveTemplateName.trim();
                if (!name) {
                  toast.error("템플릿명을 입력해주세요");
                  return;
                }
                if (filledRows.length === 0) {
                  toast.error("저장할 구성품이 없습니다");
                  return;
                }
                setSaveTemplateSubmitting(true);
                try {
                  const created = await apiMutate<{ id: string }>(
                    "/api/assembly-templates",
                    "POST",
                    {
                      name,
                      isActive: true,
                      slots: filledRows.map((r, idx) => ({
                        label: r.label.trim() || `슬롯 ${idx + 1}`,
                        slotLabelId: r.slotLabelId,
                        order: idx,
                        defaultProductId: r.product!.id,
                        defaultQuantity: r.quantity || "1",
                        isVariable: false,
                      })),
                    },
                  );
                  // Product.assemblyTemplateId 갱신
                  await apiMutate(`/api/products/${product.id}`, "PATCH", {
                    assemblyTemplateId: created.id,
                  });
                  toast.success("조립 템플릿이 등록되고 이 상품에 연결되었습니다");
                  setSaveTemplateOpen(false);
                  setSaveTemplateName("");
                  // 상품 상세 재조회
                  queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
                } catch (err) {
                  toast.error(
                    err instanceof ApiError ? err.message : "템플릿 저장 실패",
                  );
                } finally {
                  setSaveTemplateSubmitting(false);
                }
              }}
              disabled={saveTemplateSubmitting}
            >
              {saveTemplateSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
              저장
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>

      {/* 현재 구성을 연결된 템플릿의 프리셋으로 저장 */}
      {hasLinkedTemplate && (
        <JmDialog open={savePresetOpen} onOpenChange={setSavePresetOpen}>
          <JmDialogContent>
            <JmDialogHeader>
              <JmDialogTitle>현재 구성을 프리셋으로 저장</JmDialogTitle>
            </JmDialogHeader>
            <div className="flex flex-col gap-3 px-6 py-4">
              <div className="flex flex-col gap-1">
                <label className="text-jm-xs text-[var(--jm-text-muted)]">프리셋명</label>
                <JmInput
                  value={savePresetName}
                  onChange={(e) => setSavePresetName(e.target.value)}
                  placeholder="예: 3HP 기본형"
                />
              </div>
              <p className="text-jm-xs text-[var(--jm-text-muted)]">
                템플릿 &ldquo;{linkedTemplate?.name}&rdquo; 안에 {filledRows.length}개 항목으로 저장됩니다.
              </p>
            </div>
            <JmDialogFooter>
              <JmButton
                variant="outline"
                onClick={() => setSavePresetOpen(false)}
                disabled={savePresetSubmitting}
              >
                취소
              </JmButton>
              <JmButton
                onClick={async () => {
                  const name = savePresetName.trim();
                  if (!name) {
                    toast.error("프리셋명을 입력해주세요");
                    return;
                  }
                  if (!linkedTemplate || !presetSavable) return;
                  setSavePresetSubmitting(true);
                  try {
                    await apiMutate(
                      `/api/assembly-templates/${linkedTemplate.id}/presets`,
                      "POST",
                      {
                        name,
                        isActive: true,
                        items: filledRows.map((r) => ({
                          slotId: r.slotId!,
                          productId: r.product!.id,
                          quantity: r.quantity || "1",
                        })),
                      },
                    );
                    toast.success("프리셋이 등록되었습니다");
                    setSavePresetOpen(false);
                    setSavePresetName("");
                    queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError ? err.message : "프리셋 저장 실패",
                    );
                  } finally {
                    setSavePresetSubmitting(false);
                  }
                }}
                disabled={savePresetSubmitting}
              >
                {savePresetSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
                저장
              </JmButton>
            </JmDialogFooter>
          </JmDialogContent>
        </JmDialog>
      )}
    </JmDrawerContent>
  );
}

function FieldSm({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-jm-xs text-[var(--jm-text-muted)]">{label}</label>
      {children}
    </div>
  );
}
