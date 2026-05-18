"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { toast } from "sonner";
import { Layers, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import {
  JmBadge,
  JmButton,
  JmCard,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmEmpty,
  JmFormField,
  JmIconButton,
  JmInput,
  JmSearchInput,
  JmSegmentedControl,
  JmSkeleton,
  JmSpinner,
  JmStat,
  JmSwitch,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
  JmTableToolbar,
  JmTableToolbarActions,
  JmTableToolbarSearch,
  JmTooltip,
  JmTooltipProvider,
} from "@/jm";
import { ProductsThemeScope } from "../_theme-scope";
import type { SpecType } from "@/lib/validators/spec-slot";

interface SpecSlot {
  id: string;
  name: string;
  type: SpecType;
  unit: string | null;
  options: string[];
  order: number;
  isActive: boolean;
  _count: { values: number };
}

const slotsKey = ["spec-slots"] as const;

const TYPE_LABELS: Record<SpecType, string> = {
  TEXT: "텍스트",
  NUMBER: "숫자",
  ENUM: "선택지",
};

interface FormState {
  name: string;
  type: SpecType;
  unit: string;
  options: string[];
  order: string;
  isActive: boolean;
}

const emptyForm: FormState = {
  name: "",
  type: "TEXT",
  unit: "",
  options: [],
  order: "0",
  isActive: true,
};

// ─── 스켈레톤 행 ────────────────────────────────────────
function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <JmTableRow key={i} className="hover:bg-transparent">
          <JmTableCell>
            <JmSkeleton className="h-4 w-32" />
          </JmTableCell>
          <JmTableCell>
            <JmSkeleton className="h-5 w-14 rounded-md" />
          </JmTableCell>
          <JmTableCell>
            <JmSkeleton className="h-4 w-8" />
          </JmTableCell>
          <JmTableCell>
            <JmSkeleton className="h-4 w-40" />
          </JmTableCell>
          <JmTableCell>
            <div className="flex justify-end">
              <JmSkeleton className="h-4 w-6" />
            </div>
          </JmTableCell>
          <JmTableCell>
            <div className="flex justify-end">
              <JmSkeleton className="h-4 w-6" />
            </div>
          </JmTableCell>
          <JmTableCell>
            <JmSkeleton className="h-5 w-12 rounded-md" />
          </JmTableCell>
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

// ─── 메인 페이지 ────────────────────────────────────────
export default function SpecSlotsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SpecSlot | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [optionInput, setOptionInput] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<SpecSlot | null>(null);

  const slotsQuery = useQuery({
    queryKey: slotsKey,
    queryFn: () => apiGet<SpecSlot[]>("/api/spec-slots"),
  });

  const filtered = useMemo(() => {
    const all = slotsQuery.data ?? [];
    if (!appliedSearch) return all;
    const q = appliedSearch.toLowerCase();
    return all.filter((s) => s.name.toLowerCase().includes(q));
  }, [slotsQuery.data, appliedSearch]);

  // KPI
  const stats = useMemo(() => {
    const all = slotsQuery.data ?? [];
    const active = all.filter((s) => s.isActive).length;
    const inUse = all.filter((s) => s._count.values > 0).length;
    return { total: all.length, active, inUse, unused: all.length - inUse };
  }, [slotsQuery.data]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOptionInput("");
    setDialogOpen(true);
  };

  const openEdit = (slot: SpecSlot) => {
    setEditing(slot);
    setForm({
      name: slot.name,
      type: slot.type,
      unit: slot.unit ?? "",
      options: [...slot.options],
      order: String(slot.order),
      isActive: slot.isActive,
    });
    setOptionInput("");
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        type: form.type,
        unit: form.type === "NUMBER" ? form.unit.trim() || null : null,
        options: form.type === "ENUM" ? form.options : [],
        order: parseInt(form.order, 10) || 0,
        isActive: form.isActive,
      };
      if (editing) {
        return apiMutate(`/api/spec-slots/${editing.id}`, "PUT", body);
      }
      return apiMutate("/api/spec-slots", "POST", body);
    },
    onSuccess: () => {
      toast.success(editing ? "슬롯이 수정되었습니다" : "슬롯이 등록되었습니다");
      qc.invalidateQueries({ queryKey: slotsKey });
      closeDialog();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장에 실패했습니다"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/spec-slots/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("슬롯이 삭제되었습니다");
      qc.invalidateQueries({ queryKey: slotsKey });
      setDeleteTarget(null);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "삭제에 실패했습니다"),
  });

  const addOption = () => {
    const v = optionInput.trim();
    if (!v) return;
    if (form.options.includes(v)) {
      toast.error("이미 추가된 옵션입니다");
      return;
    }
    setForm((p) => ({ ...p, options: [...p.options, v] }));
    setOptionInput("");
  };

  const removeOption = (v: string) => {
    setForm((p) => ({ ...p, options: p.options.filter((o) => o !== v) }));
  };

  const isPending = slotsQuery.isPending;
  const isError = slotsQuery.isError;

  return (
    <ProductsThemeScope>
      <JmTooltipProvider>
        <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
          <div className="flex w-full flex-col gap-6 p-4">
            {/* KPI */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <JmStat
                label="전체 슬롯"
                value={isPending ? "—" : stats.total.toLocaleString("ko-KR")}
                icon={<Layers className="size-4" />}
                size="sm"
              />
              <JmStat
                label="활성 슬롯"
                value={isPending ? "—" : stats.active.toLocaleString("ko-KR")}
                icon={<Layers className="size-4" />}
                hint={isPending ? "" : "isActive 기준"}
                size="sm"
              />
              <JmStat
                label="사용 중"
                value={isPending ? "—" : stats.inUse.toLocaleString("ko-KR")}
                icon={<Layers className="size-4" />}
                hint={isPending ? "" : "상품 값이 있는 슬롯"}
                size="sm"
              />
              <JmStat
                label="미사용"
                value={isPending ? "—" : stats.unused.toLocaleString("ko-KR")}
                icon={<Layers className="size-4" />}
                hint={isPending ? "" : "값 없는 슬롯"}
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
                    placeholder="슬롯명 검색"
                  />
                </JmTableToolbarSearch>
                <JmTableToolbarActions>
                  <JmIconButton
                    variant="ghost"
                    size="sm"
                    aria-label="새로고침"
                    onClick={() => qc.invalidateQueries({ queryKey: slotsKey })}
                    disabled={slotsQuery.isFetching}
                  >
                    {slotsQuery.isFetching ? (
                      <JmSpinner size="sm" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                  </JmIconButton>
                  <JmButton size="sm" onClick={openCreate}>
                    <Plus className="size-4" />
                    슬롯 등록
                  </JmButton>
                </JmTableToolbarActions>
              </JmTableToolbar>

              <JmTable className="min-w-[860px]">
                <JmTableHeader>
                  <JmTableRow>
                    <JmTableHead>이름</JmTableHead>
                    <JmTableHead className="w-[90px]">타입</JmTableHead>
                    <JmTableHead className="w-[100px]">단위</JmTableHead>
                    <JmTableHead>옵션</JmTableHead>
                    <JmTableHead className="w-[80px] text-right">사용중</JmTableHead>
                    <JmTableHead className="w-[60px] text-right">순서</JmTableHead>
                    <JmTableHead className="w-[80px]">상태</JmTableHead>
                    <JmTableHead className="w-[100px] text-right">액션</JmTableHead>
                  </JmTableRow>
                </JmTableHeader>
                <JmTableBody>
                  {isPending ? (
                    <SkeletonRows />
                  ) : isError ? (
                    <JmTableRow className="hover:bg-transparent">
                      <JmTableCell
                        colSpan={8}
                        className="py-10 text-center text-[13px] text-[var(--jm-danger-fg)]"
                      >
                        슬롯 목록을 불러오지 못했습니다
                      </JmTableCell>
                    </JmTableRow>
                  ) : filtered.length === 0 ? (
                    <JmTableRow className="hover:bg-transparent">
                      <JmTableCell colSpan={8} className="py-12">
                        <JmEmpty
                          icon={<Layers className="size-8" />}
                          title={
                            appliedSearch
                              ? "조건에 맞는 슬롯이 없습니다"
                              : "등록된 슬롯이 없습니다"
                          }
                          description={
                            appliedSearch
                              ? "검색어를 바꿔보세요"
                              : "첫 스펙 슬롯을 등록해 상품 스펙을 관리하세요"
                          }
                          action={
                            !appliedSearch ? (
                              <JmButton size="sm" onClick={openCreate}>
                                <Plus className="size-4" />
                                슬롯 등록
                              </JmButton>
                            ) : null
                          }
                        />
                      </JmTableCell>
                    </JmTableRow>
                  ) : (
                    filtered.map((slot) => {
                      const inUse = slot._count.values;
                      return (
                        <JmTableRow key={slot.id}>
                          <JmTableCell className="font-medium text-[var(--jm-text)]">
                            {slot.name}
                          </JmTableCell>
                          <JmTableCell>
                            <JmBadge variant="outline" size="sm">
                              {TYPE_LABELS[slot.type]}
                            </JmBadge>
                          </JmTableCell>
                          <JmTableCell className="text-[13px] text-[var(--jm-text-muted)]">
                            {slot.unit ?? "—"}
                          </JmTableCell>
                          <JmTableCell className="text-[13px] text-[var(--jm-text-muted)]">
                            {slot.options.length === 0
                              ? "—"
                              : slot.options.length <= 3
                                ? slot.options.join(", ")
                                : `${slot.options.slice(0, 3).join(", ")} 외 ${slot.options.length - 3}개`}
                          </JmTableCell>
                          <JmTableCell className="text-right tabular-nums text-[var(--jm-text)]">
                            {inUse}
                          </JmTableCell>
                          <JmTableCell className="text-right tabular-nums text-[var(--jm-text-muted)]">
                            {slot.order}
                          </JmTableCell>
                          <JmTableCell>
                            <JmBadge
                              variant={slot.isActive ? "success" : "default"}
                              size="sm"
                            >
                              {slot.isActive ? "활성" : "비활성"}
                            </JmBadge>
                          </JmTableCell>
                          <JmTableCell>
                            <div className="flex justify-end gap-1">
                              <JmTooltip content="수정">
                                <JmIconButton
                                  variant="ghost"
                                  size="sm"
                                  aria-label="수정"
                                  onClick={() => openEdit(slot)}
                                >
                                  <Pencil className="size-3.5" />
                                </JmIconButton>
                              </JmTooltip>
                              <JmTooltip
                                content={
                                  inUse > 0
                                    ? `사용 중 (${inUse}개 상품)`
                                    : "삭제"
                                }
                              >
                                <JmIconButton
                                  variant="ghost"
                                  size="sm"
                                  aria-label="삭제"
                                  disabled={inUse > 0}
                                  onClick={() => setDeleteTarget(slot)}
                                >
                                  <Trash2 className="size-3.5" />
                                </JmIconButton>
                              </JmTooltip>
                            </div>
                          </JmTableCell>
                        </JmTableRow>
                      );
                    })
                  )}
                </JmTableBody>
              </JmTable>
            </JmCard>
          </div>
        </div>

        {/* 등록/수정 Dialog */}
        <JmDialog
          open={dialogOpen}
          onOpenChange={(v) => {
            if (!v) closeDialog();
          }}
        >
          <JmDialogContent size="sm">
            <JmDialogHeader>
              <JmDialogTitle>{editing ? "슬롯 수정" : "슬롯 등록"}</JmDialogTitle>
            </JmDialogHeader>
            <JmDialogBody className="space-y-4">
              <JmFormField label="이름" required>
                <JmInput
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="예: 흡입력, 색상"
                  autoFocus
                />
              </JmFormField>

              <JmFormField label="타입">
                <JmSegmentedControl
                  fullWidth
                  options={[
                    { value: "TEXT", label: "텍스트" },
                    { value: "NUMBER", label: "숫자" },
                    { value: "ENUM", label: "선택지" },
                  ]}
                  value={form.type}
                  onChange={(v) =>
                    setForm((p) => ({ ...p, type: v as SpecType }))
                  }
                />
              </JmFormField>

              {form.type === "NUMBER" && (
                <JmFormField label="단위">
                  <JmInput
                    value={form.unit}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, unit: e.target.value }))
                    }
                    placeholder="예: W, kg, L"
                  />
                </JmFormField>
              )}

              {form.type === "ENUM" && (
                <JmFormField label="옵션">
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <JmInput
                        className="flex-1"
                        value={optionInput}
                        onChange={(e) => setOptionInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            addOption();
                          }
                        }}
                        placeholder="옵션 추가 후 엔터"
                      />
                      <JmButton
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addOption}
                      >
                        <Plus className="size-4" />
                      </JmButton>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {form.options.length === 0 ? (
                        <span className="text-[12px] text-[var(--jm-text-subtle)]">
                          옵션 없음
                        </span>
                      ) : (
                        form.options.map((o) => (
                          <span
                            key={o}
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] px-2 py-0.5 text-[12px] text-[var(--jm-text)]"
                          >
                            {o}
                            <button
                              type="button"
                              onClick={() => removeOption(o)}
                              className="text-[var(--jm-text-muted)] hover:text-[var(--jm-danger-fg)]"
                              aria-label={`${o} 제거`}
                            >
                              <X className="size-3" />
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </JmFormField>
              )}

              <div className="grid grid-cols-2 gap-4">
                <JmFormField label="표시 순서">
                  <JmInput
                    type="text"
                    inputMode="numeric"
                    value={form.order}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        order: e.target.value.replace(/\D/g, ""),
                      }))
                    }
                  />
                </JmFormField>
                <div className="flex flex-col justify-end pb-1">
                  <label className="flex items-center gap-2 text-[13px] text-[var(--jm-text)]">
                    <JmSwitch
                      checked={form.isActive}
                      onCheckedChange={(v) =>
                        setForm((p) => ({ ...p, isActive: v }))
                      }
                      size="sm"
                    />
                    활성
                  </label>
                </div>
              </div>
            </JmDialogBody>
            <JmDialogFooter>
              <JmButton
                variant="ghost"
                onClick={closeDialog}
                disabled={saveMutation.isPending}
              >
                취소
              </JmButton>
              <JmButton
                variant="cta"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !form.name.trim()}
              >
                {saveMutation.isPending && (
                  <JmSpinner size="sm" tone="inverted" />
                )}
                {editing ? "수정" : "등록"}
              </JmButton>
            </JmDialogFooter>
          </JmDialogContent>
        </JmDialog>

        {/* 삭제 확인 Dialog */}
        <JmDialog
          open={!!deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
        >
          <JmDialogContent size="sm">
            <JmDialogHeader>
              <JmDialogTitle>슬롯 삭제</JmDialogTitle>
            </JmDialogHeader>
            <JmDialogBody>
              <p className="text-jm-sm text-[var(--jm-text)]">
                <span className="font-semibold">{deleteTarget?.name}</span>{" "}
                슬롯을 삭제합니다.
              </p>
              <p className="mt-2 text-jm-xs text-[var(--jm-text-muted)]">
                삭제하면 복구할 수 없습니다. 상품에 연결된 스펙 값이 없는 경우에만 삭제 가능합니다.
              </p>
            </JmDialogBody>
            <JmDialogFooter>
              <JmButton
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteMutation.isPending}
              >
                취소
              </JmButton>
              <JmButton
                variant="danger"
                onClick={() =>
                  deleteTarget && deleteMutation.mutate(deleteTarget.id)
                }
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending && (
                  <JmSpinner size="sm" tone="inverted" />
                )}
                삭제
              </JmButton>
            </JmDialogFooter>
          </JmDialogContent>
        </JmDialog>
      </JmTooltipProvider>
    </ProductsThemeScope>
  );
}
