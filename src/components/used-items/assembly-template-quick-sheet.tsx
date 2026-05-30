"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import {
  jmToast as toast,
  JmButton,
  JmCheckbox,
  JmDrawer,
  JmDrawerBody,
  JmDrawerContent,
  JmDrawerFooter,
  JmDrawerHeader,
  JmDrawerTitle,
  JmFormField,
  JmIconButton,
  JmInput,
  JmSelect,
} from "@/jm";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";

interface SlotLabelOption {
  id: string;
  name: string;
  category: { id: string; name: string } | null;
}
interface CategoryOption {
  id: string;
  name: string;
}

interface SlotForm {
  label: string;
  slotLabelId: string | null;
  categoryId: string | null; // slotLabel 의 카테고리 (표시·제약용)
  isVariable: boolean;
  defaultProductId: string | null;
  defaultProductName: string;
  defaultQuantity: string;
}

const emptySlot = (): SlotForm => ({
  label: "",
  slotLabelId: null,
  categoryId: null,
  isVariable: true,
  defaultProductId: null,
  defaultProductName: "",
  defaultQuantity: "1",
});

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 수정 모드 — 템플릿 id. null 이면 신규 */
  editId: string | null;
  /** 저장 성공 시 — 생성/수정된 템플릿 id 전달 */
  onSaved: (templateId: string) => void;
}

export function AssemblyTemplateQuickSheet({
  open,
  onOpenChange,
  editId,
  onSaved,
}: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slots, setSlots] = useState<SlotForm[]>([emptySlot()]);
  const [saving, setSaving] = useState(false);

  const slotLabelsQuery = useQuery<SlotLabelOption[]>({
    queryKey: ["assembly-slot-labels", "list"],
    queryFn: () => apiGet<SlotLabelOption[]>("/api/assembly-slot-labels"),
    enabled: open,
  });
  const categoriesQuery = useQuery<CategoryOption[]>({
    queryKey: ["categories", "flat"],
    queryFn: () => apiGet<CategoryOption[]>("/api/categories"),
    enabled: open,
  });
  const productsQuery = useQuery<ProductOption[]>({
    queryKey: ["products", "for-template-slot"],
    queryFn: () => apiGet<ProductOption[]>("/api/products?excludeVariants=true"),
    enabled: open,
    staleTime: 1000 * 60 * 5,
  });

  // 수정 모드 — 기존 템플릿 로드
  useEffect(() => {
    if (!open) return;
    if (!editId) {
      setName("");
      setSlots([emptySlot()]);
      return;
    }
    (async () => {
      try {
        const t = await apiGet<{
          name: string;
          slots: Array<{
            label: string;
            slotLabelId: string | null;
            isVariable: boolean;
            defaultProductId: string | null;
            defaultProduct: { name: string } | null;
            defaultQuantity: string;
            slotLabel: { categoryId: string | null } | null;
          }>;
        }>(`/api/assembly-templates/${editId}`);
        setName(t.name);
        setSlots(
          t.slots.map((s) => ({
            label: s.label,
            slotLabelId: s.slotLabelId,
            categoryId: s.slotLabel?.categoryId ?? null,
            isVariable: s.isVariable,
            defaultProductId: s.defaultProductId,
            defaultProductName: s.defaultProduct?.name ?? "",
            defaultQuantity: String(s.defaultQuantity ?? "1"),
          })),
        );
      } catch {
        toast.error("템플릿을 불러오지 못했습니다");
      }
    })();
  }, [open, editId]);

  const slotLabels = slotLabelsQuery.data ?? [];

  const updateSlot = (idx: number, p: Partial<SlotForm>) =>
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...p } : s)));
  const addSlot = () => setSlots((prev) => [...prev, emptySlot()]);
  const removeSlot = (idx: number) =>
    setSlots((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));

  // 슬롯 라벨 선택 → 카테고리 자동 채움
  const pickSlotLabel = (idx: number, labelId: string) => {
    const lbl = slotLabels.find((l) => l.id === labelId);
    updateSlot(idx, {
      slotLabelId: labelId || null,
      categoryId: lbl?.category?.id ?? null,
      // 슬롯 이름이 비어있으면 라벨명으로 채움
      label: slots[idx].label || (lbl?.name ?? ""),
    });
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("템플릿명을 입력해주세요");
      return;
    }
    const valid = slots.filter((s) => s.label.trim());
    if (valid.length === 0) {
      toast.error("슬롯을 1개 이상 입력해주세요");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        slots: valid.map((s, idx) => ({
          label: s.label.trim(),
          slotLabelId: s.slotLabelId,
          order: idx,
          defaultProductId: s.defaultProductId,
          defaultQuantity: s.defaultQuantity || "1",
          isVariable: s.isVariable,
        })),
      };
      const saved = editId
        ? await apiMutate<{ id: string }>(`/api/assembly-templates/${editId}`, "PUT", body)
        : await apiMutate<{ id: string }>("/api/assembly-templates", "POST", body);
      toast.success(editId ? "템플릿이 수정되었습니다" : "템플릿이 생성되었습니다");
      queryClient.invalidateQueries({ queryKey: ["assembly-templates"] });
      onSaved(saved.id);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "저장에 실패했습니다");
    } finally {
      setSaving(false);
    }
  };

  return (
    <JmDrawer open={open} onOpenChange={onOpenChange}>
      <JmDrawerContent side="bottom" size="xl">
        <JmDrawerHeader>
          <JmDrawerTitle>{editId ? "조립 템플릿 수정" : "조립 템플릿 만들기"}</JmDrawerTitle>
        </JmDrawerHeader>
        <JmDrawerBody>
          <div className="space-y-4">
            <JmFormField label="템플릿명" required>
              <JmInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 고압분무기 SD220R"
              />
            </JmFormField>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-jm-sm font-medium text-[var(--jm-text)]">슬롯 *</span>
                <JmButton variant="outline" size="xs" onClick={addSlot}>
                  <Plus className="size-3.5" />
                  슬롯 추가
                </JmButton>
              </div>
              {slots.map((slot, idx) => (
                <div
                  key={idx}
                  className="space-y-2 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] p-3"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-2 shrink-0 text-jm-2xs text-[var(--jm-text-muted)]">
                      #{idx + 1}
                    </span>
                    <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                      <JmFormField label="슬롯 이름">
                        <JmInput
                          size="sm"
                          value={slot.label}
                          onChange={(e) => updateSlot(idx, { label: e.target.value })}
                          placeholder="예: 엔진 슬롯"
                        />
                      </JmFormField>
                      <JmFormField label="재사용 라벨 (카테고리 제약)">
                        <JmSelect
                          value={slot.slotLabelId ?? ""}
                          onChange={(v) => pickSlotLabel(idx, v)}
                          options={[
                            { value: "", label: "없음" },
                            ...slotLabels.map((l) => ({
                              value: l.id,
                              label: l.category ? `${l.name} · ${l.category.name}` : l.name,
                            })),
                          ]}
                        />
                      </JmFormField>
                    </div>
                    <JmIconButton size="sm" aria-label="슬롯 삭제" onClick={() => removeSlot(idx)}>
                      <Trash2 className="size-3.5" />
                    </JmIconButton>
                  </div>
                  <div className="grid grid-cols-1 gap-2 pl-5 sm:grid-cols-[1fr_auto_auto]">
                    <ProductCombobox
                      products={productsQuery.data ?? []}
                      value={slot.defaultProductId ?? ""}
                      onChange={(p) =>
                        updateSlot(idx, {
                          defaultProductId: p.id || null,
                          defaultProductName: p.name,
                        })
                      }
                      filterType="component"
                      placeholder="기본 상품 (선택)..."
                    />
                    <div className="flex w-24 items-center gap-1">
                      <JmInput
                        size="sm"
                        type="text"
                        inputMode="decimal"
                        value={slot.defaultQuantity}
                        onChange={(e) => updateSlot(idx, { defaultQuantity: e.target.value })}
                        className="text-right"
                      />
                      <span className="shrink-0 text-jm-xs text-[var(--jm-text-muted)]">개</span>
                    </div>
                    <label className="flex h-9 cursor-pointer items-center gap-1.5 text-jm-sm">
                      <JmCheckbox
                        checked={slot.isVariable}
                        onCheckedChange={(c) => updateSlot(idx, { isVariable: c === true })}
                      />
                      <span>가변</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
            {categoriesQuery.data && (
              <p className="text-jm-xs text-[var(--jm-text-muted)]">
                카테고리 제약이 필요한 슬롯은 카테고리가 지정된 재사용 라벨을 선택하세요.
                새 라벨은 상품 → 스펙 슬롯 / 조립 템플릿 관리에서 만들 수 있습니다.
              </p>
            )}
          </div>
        </JmDrawerBody>
        <JmDrawerFooter>
          <JmButton variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </JmButton>
          <JmButton variant="cta" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            {editId ? "수정" : "생성"}
          </JmButton>
        </JmDrawerFooter>
      </JmDrawerContent>
    </JmDrawer>
  );
}
