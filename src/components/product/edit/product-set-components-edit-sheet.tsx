"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Loader2, Plus, X, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { ProductCombobox, type ProductOption } from "@/components/product-combobox";
import { AssemblySlotLabelCombobox } from "@/components/assembly-slot-label-combobox";
import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { replaceSetComponents } from "@/lib/product-mutations";
import {
  JmBadge,
  JmButton,
  JmCheckbox,
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
  const isAssembled = product.productType === "ASSEMBLED";

  const productsQuery = useQuery({
    queryKey: queryKeys.products.list({ scope: "components", excludeId: product.id }),
    // isBulk=all — 벌크 SKU(엔진오일 벌크 등)도 BOM 후보에 포함. 기본값은 벌크 제외라
    // 이 옵션 없으면 기존 구성에 벌크가 들어있어도 콤보박스에서 이름이 안 뜨고 재선택 불가.
    // isSet 필터 없음 — ASSEMBLED·SET 도 sub-assembly 로 BOM 구성품이 될 수 있음
    // (예: "범양80A고압분무기" → "범양80A3HP 모터고압분무기" 의 "고압분무기" 슬롯).
    // ProductCombobox 의 filterType="component" 도 OPTION_PARENT 만 제외하도록 정합.
    queryFn: () => apiGet<ProductOption[]>("/api/products?isBulk=all"),
    select: (data) => data.filter((p) => p.id !== product.id),
  });

  // 슬롯라벨 마스터 — 콤보박스 후보 + 카테고리 필터 lookup. ASSEMBLED 일 때만.
  type SlotLabelData = {
    id: string;
    name: string;
    isActive: boolean;
    categoryId: string | null;
  };
  const slotLabelsQuery = useQuery({
    queryKey: queryKeys.assemblySlotLabels.list(),
    queryFn: () => apiGet<SlotLabelData[]>("/api/assembly-slot-labels"),
    enabled: isAssembled,
  });
  const slotLabels = useMemo(
    () => (slotLabelsQuery.data ?? []).filter((l) => l.isActive),
    [slotLabelsQuery.data],
  );
  const slotLabelCategoryById = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const l of slotLabels) map.set(l.id, l.categoryId);
    return map;
  }, [slotLabels]);

  // 신규 슬롯라벨 인라인 등록 — 등록 페이지와 동일 패턴
  const createSlotLabelMutation = useMutation({
    mutationFn: (payload: { name: string; rowId: string }) =>
      apiMutate<{ id: string; name: string }>(
        "/api/assembly-slot-labels",
        "POST",
        { name: payload.name },
      ).then((label) => ({ label, rowId: payload.rowId })),
    onSuccess: ({ label, rowId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.assemblySlotLabels.all });
      setRows((prev) =>
        prev.map((r) =>
          r.rowId === rowId ? { ...r, slotLabelId: label.id, label: label.name } : r,
        ),
      );
    },
    onError: () => toast.error("라벨 생성 실패"),
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
    if (existing.length > 0) return existing;
    // 구성품 비어있고 템플릿 연결돼 있으면 슬롯 골격으로 자동 prefill — 사용자는 부속만 채우면 됨.
    // 등록 실패로 구성품이 0 개인 상품을 빠르게 복구하는 경로.
    const slots = product.assemblyTemplate?.slots ?? [];
    if (slots.length > 0) {
      return [...slots]
        .sort((a, b) => a.order - b.order)
        .map((s) => ({
          rowId: Math.random().toString(36).slice(2),
          product: null,
          quantity: "1",
          label: s.slotLabel?.name ?? s.label,
          slotId: s.id,
          slotLabelId: s.slotLabel?.id ?? null,
        }));
    }
    return [newRow()];
  });

  // 템플릿/프리셋 저장 다이얼로그 상태
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [saveTemplateSubmitting, setSaveTemplateSubmitting] = useState(false);
  // 슬롯별 가변(isVariable) 마킹 — row.rowId 키
  const [variableSlotIds, setVariableSlotIds] = useState<Set<string>>(() => new Set());
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
      // 슬롯이 다르면 같은 상품도 OK — (슬롯키, productId) 조합으로만 중복 판정.
      const seen = new Set<string>();
      for (const r of filled) {
        const slotKey = r.slotId
          ? `SID:${r.slotId}`
          : r.slotLabelId
            ? `LID:${r.slotLabelId}`
            : r.label.trim()
              ? `LBL:${r.label.trim()}`
              : "";
        const key = `${slotKey}|${r.product!.id}`;
        if (seen.has(key)) {
          throw new Error("같은 슬롯에 같은 구성품이 중복됩니다");
        }
        seen.add(key);
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

          {rows.map((row) => {
            // 슬롯라벨에 카테고리가 지정돼 있으면 그 카테고리의 상품만 노출.
            // 미지정이면 전체. 현재 선택된 상품은 카테고리 불일치여도 보존.
            const slotCategoryId = row.slotLabelId
              ? slotLabelCategoryById.get(row.slotLabelId) ?? null
              : null;
            const productsForRow = slotCategoryId
              ? products.filter(
                  (p) =>
                    p.categoryId === slotCategoryId || p.id === row.product?.id,
                )
              : products;
            // 템플릿 슬롯과 미연결인 경우 안내 (프리셋 저장 대상 아님)
            const showSlotWarning = row.slotLabelId && !row.slotId;
            return (
              <div
                key={row.rowId}
                className="space-y-2 rounded-md border border-[var(--jm-border)] bg-[var(--jm-bg)] p-2.5"
              >
                {isAssembled && (
                  <AssemblySlotLabelCombobox
                    labels={slotLabels.map((l) => ({ id: l.id, name: l.name }))}
                    value={row.slotLabelId ?? ""}
                    onChange={(id, name) =>
                      update(row.rowId, {
                        slotLabelId: id || null,
                        label: name,
                      })
                    }
                    onCreateNew={(name) =>
                      createSlotLabelMutation.mutate({ name, rowId: row.rowId })
                    }
                    placeholder={
                      row.label && !row.slotLabelId
                        ? `${row.label} (재선택 필요)`
                        : "라벨 선택..."
                    }
                  />
                )}
                <ProductCombobox
                  products={productsForRow}
                  value={row.product?.id ?? ""}
                  onChange={(p) => update(row.rowId, { product: p })}
                  filterType="component"
                  placeholder={
                    slotCategoryId
                      ? "카테고리 내 구성 상품 선택..."
                      : "구성 상품 선택..."
                  }
                />
                {!isAssembled && (
                  <JmInput
                    size="sm"
                    value={row.label}
                    onChange={(e) => update(row.rowId, { label: e.target.value })}
                    placeholder="라벨 (선택) — 메인, 보너스 등"
                  />
                )}
                <div className="flex items-center gap-2">
                  <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                    수량
                  </span>
                  <JmInput
                    size="sm"
                    type="text"
                    inputMode="decimal"
                    value={row.quantity}
                    onChange={(e) => {
                      const v = e.target.value;
                      // 음수 허용 — "-1" 같은 회수 부속 표현
                      if (v === "" || v === "-" || /^-?[0-9]*\.?[0-9]*$/.test(v)) {
                        update(row.rowId, { quantity: v });
                      }
                    }}
                    className="h-9 w-20 text-right"
                  />
                  {parseFloat(row.quantity) < 0 && (
                    <JmBadge variant="warning" size="sm" shape="square">
                      회수
                    </JmBadge>
                  )}
                  {showSlotWarning ? (
                    <JmBadge variant="default" size="sm" shape="square" className="ml-auto">
                      슬롯 미연결
                    </JmBadge>
                  ) : row.slotId ? (
                    <JmBadge variant="info" size="sm" shape="square" className="ml-auto">
                      슬롯 연결됨
                    </JmBadge>
                  ) : (
                    <span className="ml-auto" />
                  )}
                  {rows.length > 1 && (
                    <JmIconButton
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label="구성품 삭제"
                      className="text-[var(--jm-danger-fg)]"
                      onClick={() => remove(row.rowId)}
                    >
                      <X />
                    </JmIconButton>
                  )}
                </div>
              </div>
            );
          })}

          <JmButton
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={addRow}
          >
            <Plus />
            <span>구성 상품 추가</span>
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
                    setVariableSlotIds(new Set());
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
              <ul className="space-y-1 text-jm-xs text-[var(--jm-text)]">
                {filledRows.map((r, i) => (
                  <li key={r.rowId} className="flex items-center gap-1.5">
                    <span className="text-[var(--jm-text-muted)]">{i + 1}.</span>
                    <span className="font-medium min-w-0 truncate">
                      {r.label || "(이름 없음)"}
                    </span>
                    <span className="text-[var(--jm-text-muted)] shrink-0">×</span>
                    <span className="shrink-0">{r.quantity || "1"}</span>
                    {r.product && (
                      <span className="ml-1 text-[var(--jm-text-muted)] truncate">
                        ({r.product.name})
                      </span>
                    )}
                    <label className="ml-auto flex items-center gap-1 text-jm-2xs text-[var(--jm-text-muted)] cursor-pointer whitespace-nowrap shrink-0">
                      <JmCheckbox
                        checked={variableSlotIds.has(r.rowId)}
                        onCheckedChange={(v) => {
                          setVariableSlotIds((prev) => {
                            const next = new Set(prev);
                            if (v === true) next.add(r.rowId);
                            else next.delete(r.rowId);
                            return next;
                          });
                        }}
                      />
                      가변
                    </label>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-jm-2xs text-[var(--jm-text-muted)]">
                가변 슬롯 — 같은 템플릿으로 부속만 다른 변형 상품을 만들 때 표시.
              </p>
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
                        isVariable: variableSlotIds.has(r.rowId),
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
