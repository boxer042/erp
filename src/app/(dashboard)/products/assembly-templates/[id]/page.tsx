"use client";

import { use, useState } from "react";
import { focusCaretEnd } from "@/jm/lib/focus";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import {
  JmBadge,
  JmButton,
  JmCard,
  JmCardContent,
  JmCardHeader,
  JmCardTitle,
  JmContainer,
  JmDialog,
  JmDialogContent,
  JmDialogDescription,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmDrawer,
  JmDrawerBody,
  JmDrawerContent,
  JmDrawerFooter,
  JmDrawerHeader,
  JmDrawerTitle,
  JmIconButton,
  JmInput,
  JmSpinner,
  JmStat,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
  JmTextarea,
} from "@/jm";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";
import { ProductsThemeScope } from "../../_theme-scope";
import Loading from "./loading";

interface Slot {
  id: string;
  label: string;
  order: number;
  defaultProductId: string | null;
  defaultProduct: { id: string; name: string; sku: string } | null;
  defaultQuantity: string;
  isVariable: boolean;
}

interface PresetItem {
  id: string;
  slotId: string;
  productId: string;
  quantity: string;
  product: { id: string; name: string; sku: string };
  slot: { id: string; label: string; order: number };
}

interface Preset {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  items: PresetItem[];
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  defaultLaborCost: string | null;
  isActive: boolean;
  slots: Slot[];
  presets: Preset[];
}

export default function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/products/assembly-templates");
    }
  };
  const queryClient = useQueryClient();

  const [presetSheetOpen, setPresetSheetOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<Preset | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [presetName, setPresetName] = useState("");
  const [presetDescription, setPresetDescription] = useState("");
  const [presetItems, setPresetItems] = useState<
    Array<{ slotId: string; productId: string; quantity: string }>
  >([]);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Preset | null>(null);
  const [deleting, setDeleting] = useState(false);

  const templateQuery = useQuery({
    queryKey: queryKeys.assembly.detail(id),
    queryFn: () => apiGet<Template>(`/api/assembly-templates/${id}`),
  });
  const template = templateQuery.data ?? null;
  const loading = templateQuery.isPending;
  const fetchTemplate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.assembly.detail(id) });

  const productsQuery = useQuery({
    queryKey: queryKeys.products.list({ scope: "assembly-templates" }),
    queryFn: async () => {
      const data = await apiGet<
        Array<{
          id: string;
          name: string;
          sku: string;
          spec: string | null;
          sellingPrice: string;
          unitCost: string | null;
          unitOfMeasure: string;
          isSet: boolean;
        }>
      >("/api/products");
      return data.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        spec: p.spec,
        sellingPrice: p.sellingPrice,
        unitCost: p.unitCost,
        unitOfMeasure: p.unitOfMeasure,
        isSet: p.isSet,
      })) as ProductOption[];
    },
  });
  const products = productsQuery.data ?? [];

  const resetPresetForm = () => {
    setEditingPreset(null);
    setPresetName("");
    setPresetDescription("");
    if (template) {
      setPresetItems(
        template.slots.map((s) => ({
          slotId: s.id,
          productId: s.defaultProductId ?? "",
          quantity: s.defaultQuantity.toString(),
        })),
      );
    }
  };

  const openNewPreset = () => {
    resetPresetForm();
    setPresetSheetOpen(true);
  };

  const openEditPreset = (preset: Preset) => {
    setEditingPreset(preset);
    setPresetName(preset.name);
    setPresetDescription(preset.description ?? "");
    setPresetItems(
      template!.slots.map((s) => {
        const item = preset.items.find((i) => i.slotId === s.id);
        return {
          slotId: s.id,
          productId: item?.productId ?? s.defaultProductId ?? "",
          quantity: (item?.quantity ?? s.defaultQuantity).toString(),
        };
      }),
    );
    setPresetSheetOpen(true);
  };

  const openDuplicatePreset = (preset: Preset) => {
    setEditingPreset(null);
    setPresetName(`${preset.name} 복사본`);
    setPresetDescription(preset.description ?? "");
    setPresetItems(
      template!.slots.map((s) => {
        const item = preset.items.find((i) => i.slotId === s.id);
        return {
          slotId: s.id,
          productId: item?.productId ?? s.defaultProductId ?? "",
          quantity: (item?.quantity ?? s.defaultQuantity).toString(),
        };
      }),
    );
    setPresetSheetOpen(true);
  };

  const submitPreset = async () => {
    if (!presetName.trim()) {
      toast.error("프리셋명을 입력해주세요");
      return;
    }
    const validItems = presetItems.filter(
      (i) => i.productId && i.quantity && parseFloat(i.quantity) > 0,
    );
    if (validItems.length === 0) {
      toast.error("최소 1개 슬롯에 상품을 지정해주세요");
      return;
    }

    setSubmitting(true);
    try {
      const url = editingPreset
        ? `/api/assembly-templates/${id}/presets/${editingPreset.id}`
        : `/api/assembly-templates/${id}/presets`;
      const res = await fetch(url, {
        method: editingPreset ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: presetName,
          description: presetDescription || undefined,
          isActive: true,
          items: validItems,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(typeof err.error === "string" ? err.error : "저장 실패");
        return;
      }
      toast.success(editingPreset ? "프리셋이 수정되었습니다" : "프리셋이 등록되었습니다");
      setPresetSheetOpen(false);
      fetchTemplate();
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDeletePreset = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/assembly-templates/${id}/presets/${deleteTarget.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(typeof err.error === "string" ? err.error : "삭제 실패");
        return;
      }
      toast.success("프리셋이 삭제되었습니다");
      setDeleteOpen(false);
      setDeleteTarget(null);
      fetchTemplate();
    } finally {
      setDeleting(false);
    }
  };

  if (loading && !template) return <Loading />;
  if (!template) {
    return (
      <ProductsThemeScope>
        <div className="flex h-full items-center justify-center bg-[var(--jm-bg)] text-jm-sm text-[var(--jm-text-muted)]">
          템플릿을 찾을 수 없습니다
        </div>
      </ProductsThemeScope>
    );
  }

  return (
    <ProductsThemeScope>
      <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
        {/* 스티키 헤더 — 페이지 폭 제한 없이 가로 꽉 채움 */}
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-6 py-3">
          <JmIconButton aria-label="뒤로" onClick={handleBack} size="sm">
            <ArrowLeft />
          </JmIconButton>
          <div className="flex items-center gap-2">
            <span className="text-jm-base font-semibold">{template.name}</span>
            {template.isActive ? (
              <JmBadge variant="success" size="sm">활성</JmBadge>
            ) : (
              <JmBadge variant="default" size="sm">비활성</JmBadge>
            )}
          </div>
        </div>

        <JmContainer width="default" padded={false} className="space-y-6 p-6">
          {/* 설명 (있을 때만) */}
          {template.description && (
            <p className="text-jm-sm text-[var(--jm-text-muted)]">
              {template.description}
            </p>
          )}

          {/* KPI — 기본 조립비 / 슬롯 수 / 프리셋 수 */}
          <div className="grid gap-3 sm:grid-cols-3">
            <JmStat
              label="기본 조립비"
              value={
                template.defaultLaborCost
                  ? `₩${Number(template.defaultLaborCost).toLocaleString("ko-KR")}`
                  : "-"
              }
            />
            <JmStat label="슬롯 수" value={`${template.slots.length}개`} />
            <JmStat label="프리셋 수" value={`${template.presets.length}개`} />
          </div>

          {/* 슬롯 카드 */}
          <JmCard>
              <JmCardHeader>
                <JmCardTitle>슬롯 ({template.slots.length}개)</JmCardTitle>
              </JmCardHeader>
              <JmCardContent className="p-0">
                <div className="max-h-[420px] overflow-y-auto">
                  <JmTable>
                    <JmTableHeader className="sticky top-0 z-10 bg-[var(--jm-surface-muted)]">
                      <JmTableRow>
                        <JmTableHead className="w-12 text-right">순서</JmTableHead>
                        <JmTableHead>라벨</JmTableHead>
                        <JmTableHead className="text-right">기본 수량</JmTableHead>
                        <JmTableHead>기본 상품</JmTableHead>
                        <JmTableHead className="w-16 text-center">가변</JmTableHead>
                      </JmTableRow>
                    </JmTableHeader>
                    <JmTableBody>
                      {template.slots.map((s) => (
                        <JmTableRow key={s.id}>
                          <JmTableCell className="text-right">{s.order + 1}</JmTableCell>
                          <JmTableCell>{s.label}</JmTableCell>
                          <JmTableCell className="text-right">
                            {Number(s.defaultQuantity).toLocaleString("ko-KR")}
                          </JmTableCell>
                          <JmTableCell>
                            {s.defaultProduct ? (
                              <div className="flex flex-col">
                                <span>{s.defaultProduct.name}</span>
                                <span className="text-jm-xs text-[var(--jm-text-muted)]">
                                  {s.defaultProduct.sku}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[var(--jm-text-muted)]">-</span>
                            )}
                          </JmTableCell>
                          <JmTableCell className="text-center">
                            {s.isVariable ? (
                              <JmBadge variant="solid" size="sm">가변</JmBadge>
                            ) : (
                              <span className="text-jm-xs text-[var(--jm-text-muted)]">고정</span>
                            )}
                          </JmTableCell>
                        </JmTableRow>
                      ))}
                    </JmTableBody>
                  </JmTable>
                </div>
              </JmCardContent>
            </JmCard>

            {/* 프리셋 카드 */}
            <JmCard>
              <JmCardHeader className="flex flex-row items-center justify-between">
                <JmCardTitle>프리셋</JmCardTitle>
                <JmButton size="sm" onClick={openNewPreset}>
                  <Plus className="size-3.5" />
                  프리셋 추가
                </JmButton>
              </JmCardHeader>
              <JmCardContent className="p-0">
                {template.presets.length === 0 ? (
                  <p className="py-6 text-center text-jm-sm text-[var(--jm-text-muted)]">
                    등록된 프리셋이 없습니다
                  </p>
                ) : (
                  <JmTable>
                    <JmTableHeader>
                      <JmTableRow>
                        <JmTableHead>프리셋명</JmTableHead>
                        <JmTableHead>구성품 요약</JmTableHead>
                        <JmTableHead>상태</JmTableHead>
                        <JmTableHead className="w-40"></JmTableHead>
                      </JmTableRow>
                    </JmTableHeader>
                    <JmTableBody>
                      {template.presets.map((p) => (
                        <JmTableRow key={p.id}>
                          <JmTableCell>
                            <div className="flex flex-col">
                              <span>{p.name}</span>
                              {p.description && (
                                <span className="text-jm-xs text-[var(--jm-text-muted)]">
                                  {p.description}
                                </span>
                              )}
                            </div>
                          </JmTableCell>
                          <JmTableCell className="text-jm-xs text-[var(--jm-text-muted)] max-w-md truncate">
                            {p.items
                              .map((i) => `${i.slot.label}: ${i.product.name}`)
                              .join(", ")}
                          </JmTableCell>
                          <JmTableCell>
                            {p.isActive ? (
                              <JmBadge variant="success" size="sm">활성</JmBadge>
                            ) : (
                              <JmBadge variant="default" size="sm">비활성</JmBadge>
                            )}
                          </JmTableCell>
                          <JmTableCell>
                            <div className="flex gap-1 justify-end">
                              <JmButton
                                variant="outline"
                                size="xs"
                                onClick={() => openEditPreset(p)}
                              >
                                <Pencil className="size-3" />
                                수정
                              </JmButton>
                              <JmButton
                                variant="outline"
                                size="xs"
                                onClick={() => openDuplicatePreset(p)}
                              >
                                <Copy className="size-3" />
                                복제
                              </JmButton>
                              <JmButton
                                variant="danger"
                                size="xs"
                                onClick={() => {
                                  setDeleteTarget(p);
                                  setDeleteOpen(true);
                                }}
                              >
                                <Trash2 className="size-3" />
                                삭제
                              </JmButton>
                            </div>
                          </JmTableCell>
                        </JmTableRow>
                      ))}
                    </JmTableBody>
                  </JmTable>
                )}
              </JmCardContent>
            </JmCard>
        </JmContainer>
      </div>

      {/* 프리셋 등록/수정 Drawer */}
      <JmDrawer open={presetSheetOpen} onOpenChange={setPresetSheetOpen}>
        <JmDrawerContent side="bottom" size="xl">
          <JmDrawerHeader>
            <JmDrawerTitle>
              {editingPreset ? "프리셋 수정" : "프리셋 등록"}
            </JmDrawerTitle>
          </JmDrawerHeader>

          <JmDrawerBody className="flex flex-col gap-4">
            <div className="grid grid-cols-[120px_1fr] items-center gap-2">
              <label className="text-jm-sm text-right text-[var(--jm-text-muted)]">프리셋명</label>
              <JmInput
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="예: 3HP 기본형"
              />
            </div>
            <div className="grid grid-cols-[120px_1fr] items-start gap-2">
              <label className="text-jm-sm text-right pt-2 text-[var(--jm-text-muted)]">설명</label>
              <JmTextarea
                value={presetDescription}
                onChange={(e) => setPresetDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div className="border-t border-[var(--jm-border)] pt-4">
              <h3 className="text-jm-sm font-semibold mb-2 text-[var(--jm-text)]">슬롯별 상품</h3>
              <div className="-mx-5 border-y border-[var(--jm-border)]">
                <table className="w-full text-jm-sm">
                  <thead>
                    <tr className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-jm-xs">
                      <th className="border-r border-b border-[var(--jm-border)] w-[40px] py-2 text-center font-medium">번호</th>
                      <th className="border-r border-b border-[var(--jm-border)] py-2 px-2 text-left font-medium" style={{ width: "25%" }}>라벨</th>
                      <th className="border-r border-b border-[var(--jm-border)] w-[100px] py-2 text-center font-medium">수량</th>
                      <th className="border-b border-[var(--jm-border)] py-2 px-2 text-left font-medium">상품</th>
                    </tr>
                  </thead>
                  <tbody>
                    {template.slots.map((s, idx) => {
                      const item = presetItems[idx];
                      return (
                        <tr key={s.id} className="border-b border-[var(--jm-border)] hover:bg-[var(--jm-surface-muted)]">
                          <td className="border-r border-[var(--jm-border)] text-center text-[var(--jm-text-muted)] py-1">{idx + 1}</td>
                          <td className="border-r border-[var(--jm-border)] px-2 py-1 text-[var(--jm-text)]">{s.label}</td>
                          <td className="border-r border-[var(--jm-border)] p-0.5">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={item?.quantity ?? "1"}
                              onChange={(e) =>
                                setPresetItems((prev) =>
                                  prev.map((x, i) =>
                                    i === idx ? { ...x, quantity: e.target.value } : x,
                                  ),
                                )
                              }
                              onFocus={focusCaretEnd}
                              className="w-full h-7 bg-transparent text-jm-sm px-2 text-right outline-none focus:bg-[var(--jm-surface-muted)] rounded tabular-nums text-[var(--jm-text)]"
                            />
                          </td>
                          <td className="p-0.5">
                            <ProductCombobox
                              products={products}
                              value={item?.productId ?? ""}
                              onChange={(p) =>
                                setPresetItems((prev) =>
                                  prev.map((x, i) =>
                                    i === idx ? { ...x, productId: p.id } : x,
                                  ),
                                )
                              }
                              filterType="component"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </JmDrawerBody>

          <JmDrawerFooter>
            <JmButton variant="outline" onClick={() => setPresetSheetOpen(false)}>
              취소
            </JmButton>
            <JmButton onClick={submitPreset} disabled={submitting}>
              {submitting && <JmSpinner size="sm" tone="inverted" />}
              {submitting ? "처리 중..." : "저장"}
            </JmButton>
          </JmDrawerFooter>
        </JmDrawerContent>
      </JmDrawer>

      {/* 삭제 확인 Dialog */}
      <JmDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <JmDialogContent size="sm">
          <JmDialogHeader>
            <JmDialogTitle>프리셋 삭제</JmDialogTitle>
            <JmDialogDescription>
              {deleteTarget && (
                <>
                  <span className="block">
                    &quot;{deleteTarget.name}&quot; 프리셋을 삭제하시겠습니까?
                  </span>
                  <span className="block mt-2">
                    삭제된 프리셋은 복구할 수 없으며, 이미 등록된 조립상품에는 영향이 없습니다.
                  </span>
                </>
              )}
            </JmDialogDescription>
          </JmDialogHeader>
          <JmDialogFooter>
            <JmButton
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              취소
            </JmButton>
            <JmButton
              variant="danger"
              onClick={confirmDeletePreset}
              disabled={deleting}
            >
              {deleting && <JmSpinner size="sm" tone="inverted" />}
              삭제
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>
    </ProductsThemeScope>
  );
}
