"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Pencil } from "lucide-react";
import { format } from "date-fns";

import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatComma, parseComma } from "@/lib/utils";
import { focusCaretEnd } from "@/jm/lib/focus";
import {
  JmBadge,
  JmButton,
  JmCard,
  JmCardContent,
  JmCardHeader,
  JmCardTitle,
  JmCheckbox,
  JmDatePicker,
  JmFormField,
  JmIconButton,
  JmInput,
  JmSelect,
} from "@/jm";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";

import {
  totalUsedItemCost,
  usedItemName,
  type UsedItemListRow,
} from "./_types";
import { UsedItemImageUpload } from "./used-item-image-upload";
import { AssemblyTemplateQuickSheet } from "./assembly-template-quick-sheet";

// 통일 구성품 1행 — 중고 또는 신품
export interface ComponentRow {
  slotLabel: string | null; // 템플릿 슬롯 출신이면 라벨, 자유 행이면 null
  categoryId: string | null; // 카테고리 제약 (슬롯)
  isVariable: boolean; // 고정 슬롯이면 false (콤보 비활성)
  fromTemplate: boolean; // 템플릿 슬롯 출신 (행 제거 불가)
  kind: "none" | "used" | "part";
  usedItemId: string | null;
  componentId: string | null;
  pickName: string;
  pickUnitCost: number; // 신품 추정 단가 또는 중고 누적원가
  quantity: string; // 신품 수량 (중고는 "1")
}

const emptyRow = (): ComponentRow => ({
  slotLabel: null,
  categoryId: null,
  isVariable: true,
  fromTemplate: false,
  kind: "none",
  usedItemId: null,
  componentId: null,
  pickName: "",
  pickUnitCost: 0,
  quantity: "1",
});

export interface UsedItemBuildValue {
  displayName: string;
  productId: string | null;
  spec: string;
  builtAt: string;
  laborCost: string;
  issueSerial: boolean;
  warrantyMonths: number;
  imageUrls: string[];
  memo: string;
  assemblyTemplateId: string | null;
  components: ComponentRow[];
}

export const EMPTY_BUILD: UsedItemBuildValue = {
  displayName: "",
  productId: null,
  spec: "",
  builtAt: format(new Date(), "yyyy-MM-dd"),
  laborCost: "",
  issueSerial: false,
  warrantyMonths: 0,
  imageUrls: [],
  memo: "",
  assemblyTemplateId: null,
  components: [emptyRow()],
};

interface TemplateLite {
  id: string;
  name: string;
}
interface TemplateDetail {
  id: string;
  name: string;
  slots: Array<{
    id: string;
    label: string;
    isVariable: boolean;
    defaultProductId: string | null;
    defaultQuantity: string;
    defaultProduct: { id: string; name: string; sku: string } | null;
    slotLabel: { name: string; categoryId: string | null } | null;
  }>;
}

interface Props {
  value: UsedItemBuildValue;
  onChange: (next: UsedItemBuildValue) => void;
}

export function UsedItemBuildForm({ value, onChange }: Props) {
  const [matchCatalog, setMatchCatalog] = useState(!!value.productId);
  const [templateSheetOpen, setTemplateSheetOpen] = useState(false);
  const [templateEditId, setTemplateEditId] = useState<string | null>(null);

  const patch = (p: Partial<UsedItemBuildValue>) => onChange({ ...value, ...p });

  const usedItemsQuery = useQuery<UsedItemListRow[]>({
    queryKey: queryKeys.usedItems.list({ for: "build-source" }),
    queryFn: () =>
      apiGet<UsedItemListRow[]>(
        "/api/used-items?status=IN_STOCK&includeCosts=true&limit=500",
      ),
    staleTime: 1000 * 60,
  });
  const productsQuery = useQuery<ProductOption[]>({
    queryKey: queryKeys.products.list({ for: "build-part" }),
    queryFn: () => apiGet<ProductOption[]>("/api/products?excludeVariants=true"),
    staleTime: 1000 * 60 * 5,
  });
  const templatesQuery = useQuery<TemplateLite[]>({
    queryKey: ["assembly-templates", "list"],
    queryFn: () => apiGet<TemplateLite[]>("/api/assembly-templates"),
    staleTime: 1000 * 60 * 5,
  });
  const templateDetailQuery = useQuery<TemplateDetail>({
    queryKey: ["assembly-templates", "detail", value.assemblyTemplateId],
    queryFn: () => apiGet<TemplateDetail>(`/api/assembly-templates/${value.assemblyTemplateId}`),
    enabled: !!value.assemblyTemplateId,
  });

  const usedItems = usedItemsQuery.data ?? [];
  const products = productsQuery.data ?? [];

  // 템플릿 선택 → 슬롯을 구성품 행으로 prefill (자유 행은 뒤에 유지)
  const applyTemplate = (templateId: string, detail: TemplateDetail) => {
    const slotRows: ComponentRow[] = detail.slots.map((s) => {
      const fixedDefault = !s.isVariable && s.defaultProduct;
      return {
        slotLabel: s.slotLabel?.name ?? s.label,
        categoryId: s.slotLabel?.categoryId ?? null,
        isVariable: s.isVariable,
        fromTemplate: true,
        kind: fixedDefault ? "part" : "none",
        usedItemId: null,
        componentId: fixedDefault ? s.defaultProduct!.id : null,
        pickName: fixedDefault ? s.defaultProduct!.name : "",
        pickUnitCost: 0,
        quantity: String(s.defaultQuantity ?? "1"),
      };
    });
    // 기존 자유 행(템플릿 외)은 유지
    const freeRows = value.components.filter((c) => !c.fromTemplate);
    onChange({ ...value, assemblyTemplateId: templateId, components: [...slotRows, ...freeRows] });
  };

  // 템플릿 상세 로드되면 자동 적용 (선택 직후)
  useEffect(() => {
    const detail = templateDetailQuery.data;
    if (!detail || !value.assemblyTemplateId) return;
    const hasSlotRows = value.components.some((c) => c.fromTemplate);
    if (hasSlotRows) return; // 이미 적용됨
    applyTemplate(value.assemblyTemplateId, detail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateDetailQuery.data, value.assemblyTemplateId]);

  // 카테고리 제약 옵션 (신품 + 중고 통합)
  const optionsForCategory = useMemo(() => {
    return (categoryId: string | null): ProductOption[] => {
      const newParts = products.filter((p) => !categoryId || p.categoryId === categoryId);
      const usedOpts: ProductOption[] = usedItems
        .filter((u) => !categoryId || u.product?.categoryId === categoryId)
        .map((u) => ({
          id: u.id,
          name: `${usedItemName(u)} (중고)`,
          sku: u.internalCode,
          sellingPrice: "0",
          unitCost: String(totalUsedItemCost(u)),
          unitOfMeasure: "EA",
          isSet: false,
          usedItemId: u.id,
        }));
      return [...newParts, ...usedOpts];
    };
  }, [products, usedItems]);

  const updateRow = (idx: number, p: Partial<ComponentRow>) =>
    patch({ components: value.components.map((c, i) => (i === idx ? { ...c, ...p } : c)) });
  const addRow = () => patch({ components: [...value.components, emptyRow()] });
  const removeRow = (idx: number) =>
    patch({ components: value.components.filter((_, i) => i !== idx) });

  const onPick = (idx: number, p: ProductOption) => {
    if (p.usedItemId) {
      updateRow(idx, {
        kind: "used",
        usedItemId: p.usedItemId,
        componentId: null,
        pickName: p.name,
        pickUnitCost: p.unitCost ? parseFloat(p.unitCost) : 0,
        quantity: "1",
      });
    } else {
      updateRow(idx, {
        kind: "part",
        usedItemId: null,
        componentId: p.id || null,
        pickName: p.name,
        pickUnitCost: p.unitCost ? parseFloat(p.unitCost) : 0,
      });
    }
  };

  // 누적원가 미리보기
  const estCost = useMemo(() => {
    const compSum = value.components.reduce((s, c) => {
      if (c.kind === "used") return s + c.pickUnitCost;
      if (c.kind === "part") return s + c.pickUnitCost * (parseFloat(c.quantity) || 0);
      return s;
    }, 0);
    const labor = parseFloat(parseComma(value.laborCost)) || 0;
    return compSum + labor;
  }, [value.components, value.laborCost]);

  const isMatched = matchCatalog && !!value.productId;

  return (
    <div className="space-y-4">
      {/* 구성품 (템플릿 + 자유 통합) */}
      <JmCard>
        <JmCardHeader className="flex-row items-center justify-between gap-2">
          <JmCardTitle>구성품</JmCardTitle>
          <div className="flex items-center gap-1.5">
            <div className="w-48">
              <JmSelect
                value={value.assemblyTemplateId ?? ""}
                onChange={(v) => {
                  if (!v) {
                    // 템플릿 해제 — 슬롯 행 제거, 자유 행만 유지
                    patch({
                      assemblyTemplateId: null,
                      components: value.components.filter((c) => !c.fromTemplate),
                    });
                  } else {
                    patch({ assemblyTemplateId: v, components: value.components.filter((c) => !c.fromTemplate) });
                  }
                }}
                options={[
                  { value: "", label: "템플릿 없음" },
                  ...(templatesQuery.data ?? []).map((t) => ({ value: t.id, label: t.name })),
                ]}
              />
            </div>
            <JmButton
              variant="ghost"
              size="sm"
              onClick={() => {
                setTemplateEditId(null);
                setTemplateSheetOpen(true);
              }}
            >
              <Plus className="size-3.5" />
              새 템플릿
            </JmButton>
            {value.assemblyTemplateId && (
              <JmIconButton
                variant="ghost"
                size="sm"
                aria-label="템플릿 수정"
                onClick={() => {
                  setTemplateEditId(value.assemblyTemplateId);
                  setTemplateSheetOpen(true);
                }}
              >
                <Pencil className="size-3.5" />
              </JmIconButton>
            )}
          </div>
        </JmCardHeader>
        <JmCardContent className="space-y-2">
          {templateDetailQuery.isPending && value.assemblyTemplateId ? (
            <p className="text-jm-sm text-[var(--jm-text-muted)]">슬롯 불러오는 중…</p>
          ) : (
            value.components.map((row, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] p-3"
              >
                {/* 슬롯 라벨 (템플릿 행) */}
                {row.fromTemplate && (
                  <div className="mb-2 flex items-center gap-2">
                    <span className="font-medium text-[var(--jm-text)]">{row.slotLabel}</span>
                    {row.isVariable ? (
                      <JmBadge variant="info" size="sm" shape="square">가변</JmBadge>
                    ) : (
                      <JmBadge variant="default" size="sm" shape="square">고정</JmBadge>
                    )}
                    {row.categoryId && (
                      <span className="text-jm-2xs text-[var(--jm-text-muted)]">카테고리 제약</span>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <ProductCombobox
                      products={optionsForCategory(row.categoryId)}
                      value={row.usedItemId ?? row.componentId ?? ""}
                      disabled={row.fromTemplate && !row.isVariable && row.kind === "part"}
                      onChange={(p) => onPick(idx, p)}
                      placeholder="중고/신품 선택..."
                    />
                  </div>
                  {row.kind === "part" && (
                    <div className="flex w-24 items-center gap-1">
                      <JmInput
                        type="text"
                        inputMode="decimal"
                        value={row.quantity}
                        onChange={(e) => updateRow(idx, { quantity: e.target.value })}
                        className="text-right"
                      />
                      <span className="shrink-0 text-jm-xs text-[var(--jm-text-muted)]">개</span>
                    </div>
                  )}
                  {/* 자유 행만 제거 가능 */}
                  {!row.fromTemplate && (
                    <JmIconButton size="sm" aria-label="제거" onClick={() => removeRow(idx)}>
                      <Trash2 className="size-3.5" />
                    </JmIconButton>
                  )}
                </div>
                {/* 선택된 항목 종류 표시 */}
                {row.kind !== "none" && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-jm-xs text-[var(--jm-text-muted)]">
                    <JmBadge
                      variant={row.kind === "used" ? "info" : "default"}
                      size="sm"
                      shape="square"
                    >
                      {row.kind === "used" ? "중고" : "신품"}
                    </JmBadge>
                    <span>
                      ₩
                      {Math.round(
                        row.kind === "used"
                          ? row.pickUnitCost
                          : row.pickUnitCost * (parseFloat(row.quantity) || 0),
                      ).toLocaleString("ko-KR")}
                    </span>
                  </div>
                )}
              </div>
            ))
          )}
          <JmButton variant="outline" size="sm" onClick={addRow} className="w-full">
            <Plus className="size-3.5" />
            구성품 추가
          </JmButton>
        </JmCardContent>
      </JmCard>

      {/* 결과물 */}
      <JmCard>
        <JmCardHeader>
          <JmCardTitle>결과물</JmCardTitle>
        </JmCardHeader>
        <JmCardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <JmFormField
              label="품명"
              required
              hint={isMatched ? "카탈로그 매칭 — 카탈로그 상품명 자동 사용" : undefined}
            >
              <JmInput
                value={value.displayName}
                onChange={(e) => patch({ displayName: e.target.value })}
                placeholder="예: 리퍼비시 고압분무기"
                readOnly={isMatched}
                className={isMatched ? "opacity-70" : undefined}
              />
            </JmFormField>
            <JmFormField label="규격">
              <JmInput
                value={value.spec}
                onChange={(e) => patch({ spec: e.target.value })}
                placeholder="(선택)"
              />
            </JmFormField>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-jm-sm">
            <JmCheckbox
              checked={matchCatalog}
              onCheckedChange={(c) => {
                setMatchCatalog(c === true);
                if (c !== true) patch({ productId: null });
              }}
            />
            <span>매장 카탈로그 상품과 매칭</span>
          </label>
          {matchCatalog && (
            <ProductCombobox
              products={products}
              value={value.productId ?? ""}
              onChange={(p) =>
                patch({ productId: p.id || null, displayName: p.id ? p.name : value.displayName })
              }
              placeholder="카탈로그에서 상품 선택..."
            />
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <JmFormField label="조립일" required>
              <JmDatePicker
                value={value.builtAt ? new Date(value.builtAt + "T00:00:00") : undefined}
                onChange={(d) => patch({ builtAt: d ? format(d, "yyyy-MM-dd") : "" })}
              />
            </JmFormField>
            <JmFormField label="공임">
              <div className="flex items-center gap-2">
                <JmInput
                  type="text"
                  inputMode="numeric"
                  value={formatComma(value.laborCost)}
                  onChange={(e) => patch({ laborCost: parseComma(e.target.value) })}
                  onFocus={focusCaretEnd}
                  placeholder="0"
                />
                <span className="shrink-0 text-jm-sm text-[var(--jm-text-muted)]">원</span>
              </div>
            </JmFormField>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-jm-sm">
            <JmCheckbox
              checked={value.issueSerial}
              onCheckedChange={(c) => patch({ issueSerial: c === true })}
            />
            <span>시리얼 라벨 발번</span>
            <span className="text-jm-xs text-[var(--jm-text-muted)]">— 단품 판매 예정이면</span>
          </label>
          {value.issueSerial && (
            <JmFormField label="보증 기간 (개월)" hint="0 = 보증 없음">
              <div className="flex items-center gap-2">
                <JmInput
                  type="number"
                  min={0}
                  max={120}
                  value={String(value.warrantyMonths)}
                  onChange={(e) =>
                    patch({
                      warrantyMonths: Math.max(0, Math.min(120, parseInt(e.target.value, 10) || 0)),
                    })
                  }
                  className="w-32"
                />
                <span className="text-jm-sm text-[var(--jm-text-muted)]">개월</span>
              </div>
            </JmFormField>
          )}

          <JmFormField label="사진">
            <UsedItemImageUpload
              value={value.imageUrls}
              onChange={(urls) => patch({ imageUrls: urls })}
            />
          </JmFormField>
        </JmCardContent>
      </JmCard>

      {/* 누적원가 미리보기 */}
      <div className="flex items-baseline justify-between rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] px-4 py-3">
        <span className="text-jm-sm text-[var(--jm-text-muted)]">예상 누적원가 (구성품 + 공임)</span>
        <span className="text-jm-lg font-bold tabular-nums">
          ₩{Math.round(estCost).toLocaleString("ko-KR")}
        </span>
      </div>

      {/* 인라인 템플릿 생성/수정 */}
      <AssemblyTemplateQuickSheet
        open={templateSheetOpen}
        onOpenChange={setTemplateSheetOpen}
        editId={templateEditId}
        onSaved={(templateId) => {
          // 생성/수정된 템플릿 선택 + 슬롯 재적용 위해 슬롯 행 비움
          patch({
            assemblyTemplateId: templateId,
            components: value.components.filter((c) => !c.fromTemplate),
          });
        }}
      />
    </div>
  );
}
