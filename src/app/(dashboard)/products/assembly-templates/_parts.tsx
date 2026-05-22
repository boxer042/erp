"use client";

import { useState } from "react";
import { focusCaretEnd } from "@/jm/lib/focus";
import Link from "next/link";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  Hash,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
} from "lucide-react";
import {
  JmBadge,
  JmButton,
  JmCard,
  JmCheckbox,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmDrawer,
  JmDrawerContent,
  JmDrawerFooter,
  JmDrawerHeader,
  JmDrawerTitle,
  JmEmpty,
  JmFormField,
  JmIconButton,
  JmInput,
  JmSearchInput,
  JmSkeleton,
  JmSpinner,
  JmStat,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
  JmTableToolbar,
  JmTableToolbarActions,
  JmTableToolbarSearch,
  JmSelect,
  JmTextarea,
  JmTooltip,
  JmTooltipProvider,
} from "@/jm";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";
import { AssemblySlotLabelCombobox } from "@/components/assembly-slot-label-combobox";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatComma, parseComma } from "@/lib/utils";
import type { CategoryOption, SlotLabelRow, SlotRow, TemplateRow } from "./_types";

// 카테고리 트리를 JmSelect options 로 평탄화. parent 만 있으면 그 자체, child 있으면 child 노출.
function buildCategoryOptions(
  categories: CategoryOption[],
): Array<{ value: string; label: string }> {
  return [
    { value: "__none__", label: "전체 (필터 없음)" },
    ...categories.flatMap((cat) =>
      cat.children.length > 0
        ? cat.children.map((child) => ({
            value: child.id,
            label: `${cat.name} > ${child.name}`,
          }))
        : [{ value: cat.id, label: cat.name }],
    ),
  ];
}

// ============================================================
// 스켈레톤
// ============================================================

function TemplatesSkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <JmTableRow key={i} className="hover:bg-transparent">
          <JmTableCell><JmSkeleton className="h-4 w-32" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-48" /></JmTableCell>
          <JmTableCell><div className="flex justify-end"><JmSkeleton className="h-4 w-12" /></div></JmTableCell>
          <JmTableCell><div className="flex justify-end"><JmSkeleton className="h-4 w-12" /></div></JmTableCell>
          <JmTableCell><div className="flex justify-end"><JmSkeleton className="h-4 w-16" /></div></JmTableCell>
          <JmTableCell><JmSkeleton className="h-5 w-14 rounded-full" /></JmTableCell>
          <JmTableCell>
            <div className="flex justify-end gap-1">
              <JmSkeleton className="h-7 w-7 rounded-md" />
              <JmSkeleton className="h-7 w-7 rounded-md" />
            </div>
          </JmTableCell>
        </JmTableRow>
      ))}
    </>
  );
}

function LabelsSkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <JmTableRow key={i} className="hover:bg-transparent">
          <JmTableCell><JmSkeleton className="h-4 w-32" /></JmTableCell>
          <JmTableCell><div className="flex justify-end"><JmSkeleton className="h-4 w-12" /></div></JmTableCell>
          <JmTableCell><JmSkeleton className="h-5 w-14 rounded-full" /></JmTableCell>
          <JmTableCell>
            <div className="flex justify-end gap-1">
              <JmSkeleton className="h-7 w-7 rounded-md" />
              <JmSkeleton className="h-7 w-7 rounded-md" />
            </div>
          </JmTableCell>
        </JmTableRow>
      ))}
    </>
  );
}

// ============================================================
// 템플릿 관리 뷰
// ============================================================

export function TemplatesView() {
  const queryClient = useQueryClient();

  const labelsQuery = useQuery({
    queryKey: queryKeys.assemblySlotLabels.list(),
    queryFn: () => apiGet<SlotLabelRow[]>("/api/assembly-slot-labels"),
  });
  const activeLabels = (labelsQuery.data ?? []).filter((l) => l.isActive);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultLaborCost, setDefaultLaborCost] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [slots, setSlots] = useState<SlotRow[]>([]);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TemplateRow | null>(null);

  const rowsQuery = useQuery({
    queryKey: queryKeys.assembly.templates(),
    queryFn: () => apiGet<TemplateRow[]>("/api/assembly-templates"),
  });
  const rows = rowsQuery.data ?? [];
  const loading = rowsQuery.isPending;
  const fetchRows = () => queryClient.invalidateQueries({ queryKey: queryKeys.assembly.all });

  const productsQuery = useQuery({
    queryKey: queryKeys.products.list({ scope: "assembly-templates-all" }),
    queryFn: async () => {
      const data = await apiGet<Array<{
        id: string; name: string; sku: string; spec: string | null;
        sellingPrice: string; unitCost: string | null;
        unitOfMeasure: string; isSet: boolean;
      }>>("/api/products?isBulk=all");
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

  // KPI
  const stats = {
    total: rows.length,
    active: rows.filter((r) => r.isActive).length,
    totalSlots: rows.reduce((s, r) => s + r._count.slots, 0),
    withPresets: rows.filter((r) => r._count.presets > 0).length,
  };

  const reset = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setDefaultLaborCost("");
    setIsActive(true);
    setSlots([{ label: "", slotLabelId: null, order: 0, defaultProductId: null, defaultQuantity: "1", isVariable: false }]);
  };

  const openCreate = () => {
    reset();
    setDrawerOpen(true);
  };

  const openEdit = async (row: TemplateRow) => {
    type TemplateDetail = {
      id: string;
      name: string;
      description: string | null;
      defaultLaborCost: string | null;
      isActive: boolean;
      slots: Array<{
        id: string;
        label: string;
        slotLabelId: string | null;
        order: number;
        defaultProductId: string | null;
        defaultQuantity: string;
        isVariable: boolean;
      }>;
    };
    let t: TemplateDetail;
    try {
      t = await apiGet<TemplateDetail>(`/api/assembly-templates/${row.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "템플릿을 불러오지 못했습니다");
      return;
    }
    try {
      setEditingId(t.id);
      setName(t.name);
      setDescription(t.description ?? "");
      setDefaultLaborCost(t.defaultLaborCost ?? "");
      setIsActive(t.isActive);
      setSlots(
        t.slots
          .sort((a, b) => a.order - b.order)
          .map((s) => ({
            id: s.id,
            label: s.label,
            slotLabelId: s.slotLabelId ?? null,
            order: s.order,
            defaultProductId: s.defaultProductId,
            defaultQuantity: s.defaultQuantity.toString(),
            isVariable: s.isVariable ?? false,
          })),
      );
      setDrawerOpen(true);
    } catch {
      toast.error("템플릿을 불러오지 못했습니다");
    }
  };

  const addSlot = () =>
    setSlots((prev) => [
      ...prev,
      {
        label: "",
        slotLabelId: null,
        order: prev.length,
        defaultProductId: null,
        defaultQuantity: "1",
        isVariable: false,
      },
    ]);

  const removeSlot = (idx: number) =>
    setSlots((prev) => prev.filter((_, i) => i !== idx));

  const updateSlot = (idx: number, patch: Partial<SlotRow>) =>
    setSlots((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    );

  const moveSlot = (idx: number, direction: -1 | 1) =>
    setSlots((prev) => {
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });

  // 즉석 라벨 등록
  const createLabelMutation = useMutation({
    mutationFn: (payload: { name: string; slotIdx: number }) =>
      apiMutate<SlotLabelRow>("/api/assembly-slot-labels", "POST", { name: payload.name }).then(
        (label) => ({ label, slotIdx: payload.slotIdx }),
      ),
    onSuccess: ({ label, slotIdx }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.assemblySlotLabels.all });
      updateSlot(slotIdx, { slotLabelId: label.id, label: label.name });
      toast.success(`"${label.name}" 라벨이 등록되었습니다`);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "라벨 등록 실패");
    },
  });

  const submit = async () => {
    if (!name.trim()) {
      toast.error("템플릿명을 입력해주세요");
      return;
    }
    if (slots.length === 0 || slots.some((s) => !s.label.trim())) {
      toast.error("슬롯 라벨을 모두 선택해주세요");
      return;
    }
    setSubmitting(true);
    try {
      const url = editingId
        ? `/api/assembly-templates/${editingId}`
        : "/api/assembly-templates";
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || undefined,
          defaultLaborCost: defaultLaborCost || null,
          isActive,
          slots: slots.map((s, idx) => ({
            id: s.id,
            label: s.label,
            slotLabelId: s.slotLabelId,
            order: idx,
            defaultProductId: s.defaultProductId,
            defaultQuantity: s.defaultQuantity,
            isVariable: s.isVariable,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(typeof err.error === "string" ? err.error : "저장 실패");
        return;
      }
      toast.success(
        editingId ? "템플릿이 수정되었습니다" : "템플릿이 등록되었습니다",
      );
      setDrawerOpen(false);
      fetchRows();
    } finally {
      setSubmitting(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!deleteTarget) throw new Error("대상이 없습니다");
      return apiMutate(`/api/assembly-templates/${deleteTarget.id}`, "DELETE");
    },
    onSuccess: () => {
      toast.success("템플릿이 삭제되었습니다");
      setDeleteOpen(false);
      setDeleteTarget(null);
      fetchRows();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "삭제 실패"),
  });
  const deleting = deleteMutation.isPending;
  const confirmDelete = () => deleteMutation.mutate();

  return (
    <JmTooltipProvider>
      <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
        <div className="flex w-full flex-col gap-6 p-4">
          {/* KPI */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <JmStat
              label="전체 템플릿"
              value={loading ? "—" : stats.total.toLocaleString("ko-KR")}
              icon={<Layers className="size-4" />}
              size="sm"
            />
            <JmStat
              label="활성 템플릿"
              value={loading ? "—" : stats.active.toLocaleString("ko-KR")}
              icon={<Boxes className="size-4" />}
              hint={loading ? "" : "활성 상태"}
              size="sm"
            />
            <JmStat
              label="슬롯 총 개수"
              value={loading ? "—" : stats.totalSlots.toLocaleString("ko-KR")}
              icon={<Hash className="size-4" />}
              hint={loading ? "" : "전체 템플릿 합산"}
              size="sm"
            />
            <JmStat
              label="프리셋 보유"
              value={loading ? "—" : stats.withPresets.toLocaleString("ko-KR")}
              icon={<Tag className="size-4" />}
              hint={loading ? "" : "프리셋 1개 이상"}
              size="sm"
            />
          </div>

          {/* 메인 카드 */}
          <JmCard className="overflow-hidden p-0">
            <JmTableToolbar>
              <JmTableToolbarSearch>
                {/* 템플릿 뷰는 서버 검색 없이 전체 로드 — 새로고침만 제공 */}
              </JmTableToolbarSearch>
              <JmTableToolbarActions>
                <JmIconButton
                  variant="ghost"
                  size="sm"
                  aria-label="새로고침"
                  onClick={fetchRows}
                  disabled={rowsQuery.isFetching}
                >
                  {rowsQuery.isFetching ? (
                    <JmSpinner size="sm" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                </JmIconButton>
                <JmButton size="sm" onClick={openCreate}>
                  <Plus className="size-4" />
                  템플릿 등록
                </JmButton>
              </JmTableToolbarActions>
            </JmTableToolbar>

            <JmTable className="min-w-[900px]">
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead>템플릿명</JmTableHead>
                  <JmTableHead>설명</JmTableHead>
                  <JmTableHead className="text-right">슬롯 수</JmTableHead>
                  <JmTableHead className="text-right">프리셋 수</JmTableHead>
                  <JmTableHead className="text-right">기본 조립비</JmTableHead>
                  <JmTableHead>상태</JmTableHead>
                  <JmTableHead className="w-20 text-right">관리</JmTableHead>
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {loading ? (
                  <TemplatesSkeletonRows />
                ) : rowsQuery.isError ? (
                  <JmTableRow className="hover:bg-transparent">
                    <JmTableCell
                      colSpan={7}
                      className="py-10 text-center text-[13px] text-[var(--jm-danger-fg)]"
                    >
                      템플릿 목록을 불러오지 못했습니다
                    </JmTableCell>
                  </JmTableRow>
                ) : rows.length === 0 ? (
                  <JmTableRow className="hover:bg-transparent">
                    <JmTableCell colSpan={7} className="py-12">
                      <JmEmpty
                        icon={<Layers className="size-8" />}
                        title="등록된 템플릿이 없습니다"
                        description="첫 조립 템플릿을 등록하고 슬롯과 프리셋을 구성하세요"
                        action={
                          <JmButton size="sm" onClick={openCreate}>
                            <Plus className="size-4" />
                            템플릿 등록
                          </JmButton>
                        }
                      />
                    </JmTableCell>
                  </JmTableRow>
                ) : (
                  rows.map((r) => (
                    <JmTableRow key={r.id}>
                      <JmTableCell>
                        <Link
                          href={`/products/assembly-templates/${r.id}`}
                          className="font-medium text-[var(--jm-action)] hover:underline"
                        >
                          {r.name}
                        </Link>
                      </JmTableCell>
                      <JmTableCell className="max-w-xs truncate text-[var(--jm-text-muted)]">
                        {r.description ?? "—"}
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums text-[var(--jm-text-muted)]">
                        {r._count.slots}
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums text-[var(--jm-text-muted)]">
                        {r._count.presets}
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums text-[var(--jm-text-muted)]">
                        {r.defaultLaborCost
                          ? `₩${Number(r.defaultLaborCost).toLocaleString("ko-KR")}`
                          : "—"}
                      </JmTableCell>
                      <JmTableCell>
                        {r.isActive ? (
                          <JmBadge variant="success" size="sm">활성</JmBadge>
                        ) : (
                          <JmBadge variant="default" size="sm">비활성</JmBadge>
                        )}
                      </JmTableCell>
                      <JmTableCell>
                        <div className="flex gap-1 justify-end">
                          <JmTooltip content="수정">
                            <JmIconButton
                              variant="ghost"
                              size="sm"
                              aria-label="수정"
                              onClick={() => openEdit(r)}
                            >
                              <Pencil className="size-3.5" />
                            </JmIconButton>
                          </JmTooltip>
                          <JmTooltip content="삭제">
                            <JmIconButton
                              variant="ghost"
                              size="sm"
                              aria-label="삭제"
                              onClick={() => {
                                setDeleteTarget(r);
                                setDeleteOpen(true);
                              }}
                            >
                              <Trash2 className="size-3.5" />
                            </JmIconButton>
                          </JmTooltip>
                        </div>
                      </JmTableCell>
                    </JmTableRow>
                  ))
                )}
              </JmTableBody>
            </JmTable>
          </JmCard>
        </div>
      </div>

      {/* 등록/수정 Drawer — 하단 시트 */}
      <JmDrawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <JmDrawerContent
          side="bottom"
          size="xl"
          className="flex flex-col p-0"
          dragHandle={false}
        >
          <JmDrawerHeader className="flex-shrink-0 border-b border-[var(--jm-border)] px-5 py-4">
            <JmDrawerTitle>
              {editingId ? "조립 템플릿 수정" : "조립 템플릿 등록"}
            </JmDrawerTitle>
          </JmDrawerHeader>

          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="mx-auto flex max-w-5xl flex-col gap-5">
                {/* 기본 정보 — 2열 그리드 */}
                <div className="grid gap-5 md:grid-cols-2">
                  <JmFormField label="템플릿명" required>
                    <JmInput
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="예: 고압분무기 조립"
                    />
                  </JmFormField>

                  <JmFormField label="기본 조립비">
                    <JmInput
                      type="text"
                      inputMode="numeric"
                      value={formatComma(defaultLaborCost)}
                      onChange={(e) => setDefaultLaborCost(parseComma(e.target.value))}
                      onFocus={focusCaretEnd}
                      placeholder="선택"
                    />
                  </JmFormField>
                </div>

                <JmFormField label="설명">
                  <JmTextarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                  />
                </JmFormField>

                <JmFormField label="상태">
                  <label className="flex cursor-pointer items-center gap-2 text-jm-sm">
                    <JmCheckbox
                      checked={isActive}
                      onCheckedChange={(v) => setIsActive(!!v)}
                    />
                    <span className="text-[var(--jm-text)]">
                      활성 (비활성이면 전용 등록 페이지에 표시되지 않습니다)
                    </span>
                  </label>
                </JmFormField>

                {/* 슬롯 편집 테이블 */}
                <div>
                  <p className="mb-2 text-jm-sm font-semibold text-[var(--jm-text)]">
                    슬롯 (구성품 라벨)
                  </p>
                  <div className="overflow-hidden rounded-lg border border-[var(--jm-border)]">
                    <table className="w-full text-jm-sm">
                      <thead>
                        <tr className="bg-[var(--jm-surface-muted)] text-jm-xs text-[var(--jm-text-muted)]">
                          <th className="w-[40px] border-b border-r border-[var(--jm-border)] py-2 text-center font-medium">
                            번호
                          </th>
                          <th className="w-[64px] border-b border-r border-[var(--jm-border)] py-2 text-center font-medium">
                            순서
                          </th>
                          <th
                            className="border-b border-r border-[var(--jm-border)] px-2 py-2 text-left font-medium"
                            style={{ width: "30%" }}
                          >
                            라벨
                          </th>
                          <th className="w-[100px] border-b border-r border-[var(--jm-border)] py-2 text-center font-medium">
                            수량
                          </th>
                          <th className="border-b border-r border-[var(--jm-border)] px-2 py-2 text-left font-medium">
                            기본 상품
                          </th>
                          <th
                            className="w-[60px] border-b border-r border-[var(--jm-border)] py-2 text-center font-medium"
                            title="조립실적에서 부품을 변경할 수 있는 슬롯"
                          >
                            가변
                          </th>
                          <th className="w-[40px] border-b border-[var(--jm-border)]" />
                        </tr>
                      </thead>
                      <tbody>
                        {slots.map((s, idx) => (
                          <tr
                            key={idx}
                            className="group border-b border-[var(--jm-border)] last:border-b-0"
                          >
                            <td className="border-r border-[var(--jm-border)] py-1 text-center text-[var(--jm-text-muted)]">
                              {idx + 1}
                            </td>
                            <td className="border-r border-[var(--jm-border)] p-0.5">
                              <div className="flex items-center justify-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => moveSlot(idx, -1)}
                                  disabled={idx === 0}
                                  className="rounded p-1 text-[var(--jm-text-muted)] transition-colors hover:text-[var(--jm-text)] disabled:cursor-not-allowed disabled:opacity-30"
                                  aria-label="위로 이동"
                                >
                                  <ArrowUp className="size-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveSlot(idx, 1)}
                                  disabled={idx === slots.length - 1}
                                  className="rounded p-1 text-[var(--jm-text-muted)] transition-colors hover:text-[var(--jm-text)] disabled:cursor-not-allowed disabled:opacity-30"
                                  aria-label="아래로 이동"
                                >
                                  <ArrowDown className="size-3.5" />
                                </button>
                              </div>
                            </td>
                            <td className="border-r border-[var(--jm-border)] p-0.5 align-middle">
                              <AssemblySlotLabelCombobox
                                labels={activeLabels.map((l) => ({ id: l.id, name: l.name }))}
                                value={s.slotLabelId ?? ""}
                                onChange={(id, n) => updateSlot(idx, { slotLabelId: id || null, label: n })}
                                onCreateNew={(n) => createLabelMutation.mutate({ name: n, slotIdx: idx })}
                                placeholder={s.label && !s.slotLabelId ? `${s.label} (재선택 필요)` : "라벨 선택..."}
                              />
                            </td>
                            <td className="border-r border-[var(--jm-border)] p-0.5">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={s.defaultQuantity}
                                onChange={(e) => updateSlot(idx, { defaultQuantity: e.target.value })}
                                onFocus={focusCaretEnd}
                                className="h-7 w-full rounded bg-transparent px-2 text-right text-jm-sm tabular-nums text-[var(--jm-text)] outline-none focus:bg-[var(--jm-surface-muted)]"
                              />
                            </td>
                            <td className="border-r border-[var(--jm-border)] p-0.5">
                              <ProductCombobox
                                products={products}
                                value={s.defaultProductId ?? ""}
                                onChange={(p) => updateSlot(idx, { defaultProductId: p.id })}
                                filterType="component"
                                placeholder="기본 상품 (선택)"
                              />
                            </td>
                            <td className="border-r border-[var(--jm-border)] text-center">
                              <JmCheckbox
                                checked={s.isVariable}
                                onCheckedChange={(c) => updateSlot(idx, { isVariable: c === true })}
                                aria-label="가변 슬롯"
                              />
                            </td>
                            <td className="text-center">
                              <button
                                type="button"
                                onClick={() => removeSlot(idx)}
                                className="rounded p-1 text-[var(--jm-text-muted)] opacity-0 transition-opacity hover:text-[var(--jm-danger-fg)] group-hover:opacity-100"
                                aria-label="슬롯 삭제"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                        <tr>
                          <td colSpan={7} className="px-2 py-1.5">
                            <button
                              type="button"
                              onClick={addSlot}
                              className="flex items-center gap-1.5 px-1 py-0.5 text-jm-xs text-[var(--jm-action)] transition-colors hover:underline"
                            >
                              <Plus className="size-3.5" />
                              슬롯 추가
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <JmDrawerFooter>
              <JmButton
                variant="ghost"
                onClick={() => setDrawerOpen(false)}
                disabled={submitting}
              >
                취소
              </JmButton>
              <JmButton
                variant="cta"
                onClick={submit}
                disabled={submitting}
              >
                {submitting && <JmSpinner size="sm" tone="inverted" />}
                {submitting ? "처리 중..." : editingId ? "수정" : "등록"}
              </JmButton>
            </JmDrawerFooter>
          </div>
        </JmDrawerContent>
      </JmDrawer>

      {/* 삭제 확인 Dialog */}
      <JmDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <JmDialogContent size="sm">
          <JmDialogHeader>
            <JmDialogTitle>템플릿 삭제</JmDialogTitle>
          </JmDialogHeader>
          <JmDialogBody>
            {deleteTarget && (
              <>
                <p className="text-jm-sm text-[var(--jm-text)]">
                  <span className="font-semibold">&quot;{deleteTarget.name}&quot;</span> 템플릿을 삭제하시겠습니까?
                </p>
                <p className="mt-2 text-jm-xs text-[var(--jm-text-muted)]">
                  템플릿에 연결된 슬롯과 프리셋({deleteTarget._count.presets}개)이 모두 함께 삭제됩니다.
                  이미 등록된 조립상품에는 영향이 없습니다.
                </p>
              </>
            )}
          </JmDialogBody>
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
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting && <JmSpinner size="sm" tone="inverted" />}
              삭제
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>
    </JmTooltipProvider>
  );
}

// ============================================================
// 슬롯라벨 관리 뷰
// ============================================================

export function LabelsView() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newCategoryId, setNewCategoryId] = useState<string>("__none__");

  const labelsQuery = useQuery({
    queryKey: queryKeys.assemblySlotLabels.list({ search: appliedSearch }),
    queryFn: () =>
      apiGet<SlotLabelRow[]>(
        `/api/assembly-slot-labels${appliedSearch ? `?search=${encodeURIComponent(appliedSearch)}` : ""}`,
      ),
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories", "tree"],
    queryFn: () => apiGet<CategoryOption[]>("/api/categories"),
  });
  const categories = categoriesQuery.data ?? [];
  const categoryOptions = buildCategoryOptions(categories);

  const createMutation = useMutation({
    mutationFn: ({ name, categoryId }: { name: string; categoryId: string | null }) =>
      apiMutate("/api/assembly-slot-labels", "POST", { name, categoryId }),
    onSuccess: () => {
      toast.success("라벨이 등록되었습니다");
      setNewName("");
      setNewCategoryId("__none__");
      queryClient.invalidateQueries({ queryKey: queryKeys.assemblySlotLabels.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "라벨 등록 실패"),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      name,
      isActive,
      categoryId,
    }: {
      id: string;
      name: string;
      isActive: boolean;
      categoryId: string | null;
    }) =>
      apiMutate(`/api/assembly-slot-labels/${id}`, "PUT", {
        name,
        isActive,
        categoryId,
      }),
    onSuccess: () => {
      toast.success("라벨이 수정되었습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.assemblySlotLabels.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "수정 실패"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/assembly-slot-labels/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("라벨이 삭제되었습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.assemblySlotLabels.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "삭제 실패"),
  });

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      toast.error("라벨명을 입력해주세요");
      return;
    }
    createMutation.mutate({
      name: trimmed,
      categoryId: newCategoryId === "__none__" ? null : newCategoryId,
    });
  };

  const labels = labelsQuery.data ?? [];

  // KPI
  const stats = {
    total: labels.length,
    active: labels.filter((l) => l.isActive).length,
    inUse: labels.filter((l) => l._count.slots > 0).length,
  };

  return (
    <JmTooltipProvider>
      <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
        <div className="flex w-full flex-col gap-6 p-4">
          {/* KPI */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <JmStat
              label="전체 라벨"
              value={labelsQuery.isPending ? "—" : stats.total.toLocaleString("ko-KR")}
              icon={<Tag className="size-4" />}
              size="sm"
            />
            <JmStat
              label="활성 라벨"
              value={labelsQuery.isPending ? "—" : stats.active.toLocaleString("ko-KR")}
              icon={<Hash className="size-4" />}
              hint={labelsQuery.isPending ? "" : "활성 상태"}
              size="sm"
            />
            <JmStat
              label="사용 중"
              value={labelsQuery.isPending ? "—" : stats.inUse.toLocaleString("ko-KR")}
              icon={<Layers className="size-4" />}
              hint={labelsQuery.isPending ? "" : "슬롯에 연결된 라벨"}
              size="sm"
            />
            <JmStat
              label="미사용"
              value={labelsQuery.isPending ? "—" : (stats.total - stats.inUse).toLocaleString("ko-KR")}
              icon={<Tag className="size-4" />}
              hint={labelsQuery.isPending ? "" : "슬롯 미연결"}
              positiveIsGood={false}
              size="sm"
            />
          </div>

          {/* 메인 카드 */}
          <JmCard className="overflow-hidden p-0">
            <JmTableToolbar>
              <JmTableToolbarSearch>
                <JmSearchInput
                  size="sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onClear={() => {
                    setSearch("");
                    setAppliedSearch("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      setAppliedSearch(search);
                    }
                  }}
                  placeholder="라벨 검색"
                />
              </JmTableToolbarSearch>
              <JmTableToolbarActions>
                <JmIconButton
                  variant="ghost"
                  size="sm"
                  aria-label="새로고침"
                  onClick={() => labelsQuery.refetch()}
                  disabled={labelsQuery.isFetching}
                >
                  {labelsQuery.isFetching ? (
                    <JmSpinner size="sm" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                </JmIconButton>
              </JmTableToolbarActions>
            </JmTableToolbar>

            {/* 빠른 등록 바 */}
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--jm-border)] px-4 py-2.5">
              <JmInput
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleCreate();
                  }
                }}
                placeholder="새 라벨명 (예: 모터)"
                className="max-w-[280px]"
                size="sm"
              />
              <JmSelect
                size="sm"
                value={newCategoryId}
                onChange={(v) => setNewCategoryId(v || "__none__")}
                options={categoryOptions}
                className="max-w-[240px]"
              />
              <JmButton
                size="sm"
                onClick={handleCreate}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <JmSpinner size="sm" tone="inverted" />
                ) : (
                  <Plus className="size-4" />
                )}
                라벨 추가
              </JmButton>
              <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                카테고리 지정 시 상품등록 콤보박스가 해당 카테고리 상품만 노출
              </span>
            </div>

            <JmTable className="min-w-[720px]">
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead>라벨명</JmTableHead>
                  <JmTableHead>카테고리</JmTableHead>
                  <JmTableHead className="text-right">사용 중 슬롯</JmTableHead>
                  <JmTableHead>상태</JmTableHead>
                  <JmTableHead className="w-32 text-right">관리</JmTableHead>
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {labelsQuery.isPending ? (
                  <LabelsSkeletonRows />
                ) : labelsQuery.isError ? (
                  <JmTableRow className="hover:bg-transparent">
                    <JmTableCell
                      colSpan={5}
                      className="py-10 text-center text-[13px] text-[var(--jm-danger-fg)]"
                    >
                      라벨 목록을 불러오지 못했습니다
                    </JmTableCell>
                  </JmTableRow>
                ) : labels.length === 0 ? (
                  <JmTableRow className="hover:bg-transparent">
                    <JmTableCell colSpan={5} className="py-12">
                      <JmEmpty
                        icon={<Tag className="size-8" />}
                        title={appliedSearch ? "조건에 맞는 라벨이 없습니다" : "등록된 라벨이 없습니다"}
                        description={appliedSearch ? "검색어를 바꿔보세요" : "위 입력창에서 첫 라벨을 빠르게 등록하세요"}
                      />
                    </JmTableCell>
                  </JmTableRow>
                ) : (
                  labels.map((l) => (
                    <LabelRow
                      key={l.id}
                      label={l}
                      categoryOptions={categoryOptions}
                      onUpdate={(name, isActive, categoryId) =>
                        updateMutation.mutate({ id: l.id, name, isActive, categoryId })
                      }
                      onDelete={() => deleteMutation.mutate(l.id)}
                      updating={updateMutation.isPending && updateMutation.variables?.id === l.id}
                      deleting={deleteMutation.isPending && deleteMutation.variables === l.id}
                    />
                  ))
                )}
              </JmTableBody>
            </JmTable>
          </JmCard>
        </div>
      </div>
    </JmTooltipProvider>
  );
}

function LabelRow({
  label,
  categoryOptions,
  onUpdate,
  onDelete,
  updating,
  deleting,
}: {
  label: SlotLabelRow;
  categoryOptions: Array<{ value: string; label: string }>;
  onUpdate: (name: string, isActive: boolean, categoryId: string | null) => void;
  onDelete: () => void;
  updating: boolean;
  deleting: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(label.name);

  const inUse = label._count.slots > 0;

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("라벨명을 입력해주세요");
      return;
    }
    onUpdate(trimmed, label.isActive, label.categoryId);
    setEditing(false);
  };

  return (
    <JmTableRow>
      <JmTableCell>
        {editing ? (
          <JmInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                save();
              } else if (e.key === "Escape") {
                setEditing(false);
                setName(label.name);
              }
            }}
            autoFocus
            size="sm"
            className="max-w-[260px]"
          />
        ) : (
          <span className="text-[var(--jm-text)]">{label.name}</span>
        )}
      </JmTableCell>
      <JmTableCell>
        <JmSelect
          size="sm"
          value={label.categoryId ?? "__none__"}
          onChange={(v) =>
            onUpdate(label.name, label.isActive, !v || v === "__none__" ? null : v)
          }
          options={categoryOptions}
          disabled={updating}
          className="max-w-[220px]"
        />
      </JmTableCell>
      <JmTableCell className="text-right tabular-nums text-[var(--jm-text-muted)]">
        {label._count.slots}
      </JmTableCell>
      <JmTableCell>
        <label className="flex cursor-pointer items-center gap-2 text-jm-sm">
          <JmCheckbox
            checked={label.isActive}
            onCheckedChange={(v) => onUpdate(label.name, !!v, label.categoryId)}
            disabled={updating}
          />
          <span className="text-[var(--jm-text-muted)]">
            {label.isActive ? "활성" : "비활성"}
          </span>
        </label>
      </JmTableCell>
      <JmTableCell>
        <div className="flex gap-1 justify-end">
          {editing ? (
            <JmButton
              variant="outline"
              size="sm"
              onClick={save}
              disabled={updating}
            >
              {updating && <JmSpinner size="sm" />}
              저장
            </JmButton>
          ) : (
            <JmTooltipProvider>
              <JmTooltip content="수정">
                <JmIconButton
                  variant="ghost"
                  size="sm"
                  aria-label="수정"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="size-3.5" />
                </JmIconButton>
              </JmTooltip>
              <JmTooltip content={inUse ? "사용 중인 라벨은 삭제할 수 없습니다" : "삭제"}>
                <JmIconButton
                  variant="ghost"
                  size="sm"
                  aria-label="삭제"
                  onClick={onDelete}
                  disabled={deleting || inUse}
                >
                  {deleting ? (
                    <JmSpinner size="sm" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                </JmIconButton>
              </JmTooltip>
            </JmTooltipProvider>
          )}
        </div>
      </JmTableCell>
    </JmTableRow>
  );
}
