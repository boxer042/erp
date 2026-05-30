"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  FolderTree,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  JmButton,
  JmCard,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmDrawer,
  JmDrawerBody,
  JmDrawerContent,
  JmDrawerFooter,
  JmDrawerHeader,
  JmDrawerTitle,
  JmEmpty,
  JmFormField,
  JmIconButton,
  JmInput,
  JmSearchInput,
  JmSelect,
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
  JmTooltip,
  JmTooltipProvider,
} from "@/jm";
import { ImageInput } from "@/components/image-input";
import { focusCaretEnd } from "@/jm/lib/focus";
import { ProductsThemeScope } from "../_theme-scope";

interface CategoryChild {
  id: string;
  name: string;
  parentId: string;
  order: number;
  imageUrl?: string | null;
  imagePath?: string | null;
  isActive: boolean;
  _count: { products: number };
}

interface Category {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  imageUrl?: string | null;
  imagePath?: string | null;
  isActive: boolean;
  children: CategoryChild[];
  _count: { products: number };
}

type EditTarget = { type: "root" } | { type: "child"; parentId: string };

interface FormState {
  name: string;
  order: string;
  parentId: string | null;
  imageUrl: string | null;
  imagePath: string | null;
}

const emptyForm = (): FormState => ({
  name: "",
  order: "0",
  parentId: null,
  imageUrl: null,
  imagePath: null,
});

function CategorySkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <JmTableRow key={i} className="hover:bg-transparent">
          <JmTableCell className="w-8">
            <JmSkeleton className="h-4 w-4" />
          </JmTableCell>
          <JmTableCell className="w-12">
            <JmSkeleton className="h-8 w-8 rounded-md" />
          </JmTableCell>
          <JmTableCell>
            <JmSkeleton className="h-4 w-36" />
          </JmTableCell>
          <JmTableCell>
            <div className="flex justify-end">
              <JmSkeleton className="h-4 w-10" />
            </div>
          </JmTableCell>
          <JmTableCell>
            <div className="flex justify-end">
              <JmSkeleton className="h-4 w-10" />
            </div>
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

export default function CategoriesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget>({ type: "root" });
  const [form, setForm] = useState<FormState>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories.list(),
    queryFn: () => apiGet<Category[]>("/api/categories"),
  });

  const allCategories = categoriesQuery.data ?? [];

  const filtered = useMemo(() => {
    if (!appliedSearch) return allCategories;
    const q = appliedSearch.toLowerCase();
    return allCategories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.children.some((ch) => ch.name.toLowerCase().includes(q)),
    );
  }, [allCategories, appliedSearch]);

  // KPI
  const stats = useMemo(() => {
    const rootCount = allCategories.length;
    const childCount = allCategories.reduce((s, c) => s + c.children.length, 0);
    let totalProducts = 0;
    let emptyCount = 0;
    for (const cat of allCategories) {
      const catProducts = cat._count.products + cat.children.reduce((s, c) => s + c._count.products, 0);
      totalProducts += catProducts;
      if (cat._count.products === 0 && cat.children.length === 0) emptyCount += 1;
      if (cat._count.products === 0 && cat.children.length > 0) {
        // 대분류 자체에 상품 없고 소분류만 있는 경우 — 대분류는 empty 아님
      }
      for (const ch of cat.children) {
        if (ch._count.products === 0) emptyCount += 1;
      }
    }
    return { rootCount, childCount, totalProducts, emptyCount };
  }, [allCategories]);

  const saveMutation = useMutation({
    mutationFn: (payload: FormState) =>
      editId
        ? apiMutate(`/api/categories/${editId}`, "PUT", {
            name: payload.name,
            parentId: payload.parentId ?? null,
            order: parseInt(payload.order ?? "0") || 0,
            imageUrl: payload.imageUrl,
            imagePath: payload.imagePath,
          })
        : apiMutate("/api/categories", "POST", {
            name: payload.name,
            parentId: payload.parentId ?? null,
            order: parseInt(payload.order ?? "0") || 0,
            imageUrl: payload.imageUrl,
            imagePath: payload.imagePath,
          }),
    onSuccess: () => {
      toast.success(editId ? "카테고리가 수정되었습니다" : "카테고리가 등록되었습니다");
      qc.invalidateQueries({ queryKey: queryKeys.categories.all });
      setDrawerOpen(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/categories/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("카테고리가 삭제되었습니다");
      qc.invalidateQueries({ queryKey: queryKeys.categories.all });
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "삭제 실패");
      setDeleteTarget(null);
    },
  });

  const openCreate = (target: EditTarget) => {
    setEditId(null);
    setEditTarget(target);
    setForm({
      ...emptyForm(),
      parentId: target.type === "child" ? target.parentId : null,
    });
    setDrawerOpen(true);
  };

  const openEdit = (cat: Category | CategoryChild, parentId: string | null) => {
    setEditId(cat.id);
    setEditTarget(parentId ? { type: "child", parentId } : { type: "root" });
    setForm({
      name: cat.name,
      order: String(cat.order),
      parentId: cat.parentId ?? null,
      imageUrl: cat.imageUrl ?? null,
      imagePath: cat.imagePath ?? null,
    });
    setDrawerOpen(true);
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const drawerTitle = editId
    ? "카테고리 수정"
    : editTarget.type === "child"
      ? "소분류 등록"
      : "대분류 등록";

  // JmSelect options — 상위 카테고리 선택 (대분류 편집 시)
  const parentOptions = useMemo(
    () => [
      { value: "__none__", label: "없음 (대분류)" },
      ...allCategories.map((c) => ({ value: c.id, label: c.name })),
    ],
    [allCategories],
  );

  return (
    <ProductsThemeScope>
      <JmTooltipProvider>
        <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
          <div className="flex w-full flex-col gap-6 p-4">
            {/* KPI */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <JmStat
                label="대분류"
                value={
                  categoriesQuery.isPending
                    ? "—"
                    : stats.rootCount.toLocaleString("ko-KR")
                }
                icon={<FolderTree className="size-4" />}
                hint={categoriesQuery.isPending ? "" : "최상위 카테고리"}
                size="sm"
              />
              <JmStat
                label="소분류"
                value={
                  categoriesQuery.isPending
                    ? "—"
                    : stats.childCount.toLocaleString("ko-KR")
                }
                icon={<FolderOpen className="size-4" />}
                hint={categoriesQuery.isPending ? "" : "하위 카테고리 합계"}
                size="sm"
              />
              <JmStat
                label="연결 상품"
                value={
                  categoriesQuery.isPending
                    ? "—"
                    : stats.totalProducts.toLocaleString("ko-KR")
                }
                icon={<FolderTree className="size-4" />}
                hint={categoriesQuery.isPending ? "" : "카테고리 연결 상품 수"}
                size="sm"
              />
              <JmStat
                label="빈 카테고리"
                value={
                  categoriesQuery.isPending
                    ? "—"
                    : stats.emptyCount.toLocaleString("ko-KR")
                }
                icon={<FolderTree className="size-4" />}
                hint={categoriesQuery.isPending ? "" : "연결 상품 없는 카테고리"}
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
                    placeholder="카테고리명 검색..."
                  />
                </JmTableToolbarSearch>
                <JmTableToolbarActions>
                  <JmIconButton
                    variant="ghost"
                    size="sm"
                    aria-label="새로고침"
                    onClick={() => qc.invalidateQueries({ queryKey: queryKeys.categories.all })}
                    disabled={categoriesQuery.isFetching}
                  >
                    {categoriesQuery.isFetching ? (
                      <JmSpinner size="sm" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                  </JmIconButton>
                  <JmButton size="sm" onClick={() => openCreate({ type: "root" })}>
                    <Plus className="size-4" />
                    대분류 등록
                  </JmButton>
                </JmTableToolbarActions>
              </JmTableToolbar>

              <JmTable className="min-w-[600px]">
                <JmTableHeader>
                  <JmTableRow>
                    <JmTableHead className="w-8" />
                    <JmTableHead className="w-12">이미지</JmTableHead>
                    <JmTableHead>카테고리명</JmTableHead>
                    <JmTableHead className="w-20 text-right">소분류</JmTableHead>
                    <JmTableHead className="w-20 text-right">상품 수</JmTableHead>
                    <JmTableHead className="w-28 text-right">관리</JmTableHead>
                  </JmTableRow>
                </JmTableHeader>
                <JmTableBody>
                  {categoriesQuery.isPending ? (
                    <CategorySkeletonRows />
                  ) : categoriesQuery.isError ? (
                    <JmTableRow className="hover:bg-transparent">
                      <JmTableCell
                        colSpan={6}
                        className="py-10 text-center text-jm-sm text-[var(--jm-danger-fg)]"
                      >
                        카테고리 목록을 불러오지 못했습니다
                      </JmTableCell>
                    </JmTableRow>
                  ) : filtered.length === 0 ? (
                    <JmTableRow className="hover:bg-transparent">
                      <JmTableCell colSpan={6} className="py-12">
                        <JmEmpty
                          icon={<FolderTree className="size-8" />}
                          title={
                            appliedSearch
                              ? "조건에 맞는 카테고리가 없습니다"
                              : "등록된 카테고리가 없습니다"
                          }
                          description={
                            appliedSearch
                              ? "검색어를 바꿔보세요"
                              : "대분류를 먼저 등록하고 소분류를 추가하세요"
                          }
                          action={
                            !appliedSearch ? (
                              <JmButton
                                size="sm"
                                onClick={() => openCreate({ type: "root" })}
                              >
                                <Plus className="size-4" />
                                대분류 등록
                              </JmButton>
                            ) : null
                          }
                        />
                      </JmTableCell>
                    </JmTableRow>
                  ) : (
                    filtered.map((cat) => (
                      <React.Fragment key={cat.id}>
                        {/* 대분류 행 */}
                        <JmTableRow>
                          <JmTableCell className="w-8">
                            {cat.children.length > 0 ? (
                              <button
                                onClick={() => toggleExpand(cat.id)}
                                className="text-[var(--jm-text-muted)] hover:text-[var(--jm-text)] transition-colors"
                              >
                                {expanded.has(cat.id) ? (
                                  <ChevronDown className="size-4" />
                                ) : (
                                  <ChevronRight className="size-4" />
                                )}
                              </button>
                            ) : null}
                          </JmTableCell>
                          <JmTableCell className="w-12">
                            {cat.imageUrl ? (
                              <img
                                src={cat.imageUrl}
                                alt={cat.name}
                                className="size-8 rounded-md object-cover"
                              />
                            ) : (
                              <div className="size-8 rounded-md bg-[var(--jm-surface-muted)] flex items-center justify-center">
                                <FolderTree className="size-4 text-[var(--jm-text-subtle)]" />
                              </div>
                            )}
                          </JmTableCell>
                          <JmTableCell className="font-medium text-[var(--jm-text)]">
                            {cat.name}
                          </JmTableCell>
                          <JmTableCell className="text-right text-jm-sm text-[var(--jm-text-muted)]">
                            {cat.children.length}
                          </JmTableCell>
                          <JmTableCell className="text-right text-jm-sm text-[var(--jm-text-muted)]">
                            {cat._count.products +
                              cat.children.reduce((s, c) => s + c._count.products, 0)}
                          </JmTableCell>
                          <JmTableCell>
                            <div className="flex items-center justify-end gap-1">
                              <JmTooltip content="소분류 추가">
                                <JmIconButton
                                  variant="ghost"
                                  size="sm"
                                  aria-label="소분류 추가"
                                  onClick={() =>
                                    openCreate({ type: "child", parentId: cat.id })
                                  }
                                >
                                  <Plus className="size-3.5" />
                                </JmIconButton>
                              </JmTooltip>
                              <JmTooltip content="수정">
                                <JmIconButton
                                  variant="ghost"
                                  size="sm"
                                  aria-label="수정"
                                  onClick={() => openEdit(cat, null)}
                                >
                                  <Pencil className="size-3.5" />
                                </JmIconButton>
                              </JmTooltip>
                              <JmTooltip content="삭제">
                                <JmIconButton
                                  variant="ghost"
                                  size="sm"
                                  aria-label="삭제"
                                  onClick={() =>
                                    setDeleteTarget({ id: cat.id, name: cat.name })
                                  }
                                >
                                  <Trash2 className="size-3.5" />
                                </JmIconButton>
                              </JmTooltip>
                            </div>
                          </JmTableCell>
                        </JmTableRow>

                        {/* 소분류 행들 */}
                        {expanded.has(cat.id) &&
                          cat.children.map((child) => (
                            <JmTableRow
                              key={child.id}
                              className="bg-[var(--jm-surface-muted)]"
                            >
                              <JmTableCell />
                              <JmTableCell className="pl-8">
                                {child.imageUrl ? (
                                  <img
                                    src={child.imageUrl}
                                    alt={child.name}
                                    className="size-7 rounded-md object-cover"
                                  />
                                ) : (
                                  <div className="size-7 rounded-md bg-[var(--jm-bg)] flex items-center justify-center">
                                    <FolderTree className="size-3.5 text-[var(--jm-text-subtle)]" />
                                  </div>
                                )}
                              </JmTableCell>
                              <JmTableCell className="pl-8 text-jm-sm text-[var(--jm-text-muted)]">
                                {child.name}
                              </JmTableCell>
                              <JmTableCell />
                              <JmTableCell className="text-right text-jm-sm text-[var(--jm-text-muted)]">
                                {child._count.products}
                              </JmTableCell>
                              <JmTableCell>
                                <div className="flex items-center justify-end gap-1">
                                  <JmTooltip content="수정">
                                    <JmIconButton
                                      variant="ghost"
                                      size="sm"
                                      aria-label="수정"
                                      onClick={() => openEdit(child, cat.id)}
                                    >
                                      <Pencil className="size-3.5" />
                                    </JmIconButton>
                                  </JmTooltip>
                                  <JmTooltip content="삭제">
                                    <JmIconButton
                                      variant="ghost"
                                      size="sm"
                                      aria-label="삭제"
                                      onClick={() =>
                                        setDeleteTarget({ id: child.id, name: child.name })
                                      }
                                    >
                                      <Trash2 className="size-3.5" />
                                    </JmIconButton>
                                  </JmTooltip>
                                </div>
                              </JmTableCell>
                            </JmTableRow>
                          ))}
                      </React.Fragment>
                    ))
                  )}
                </JmTableBody>
              </JmTable>
            </JmCard>
          </div>
        </div>

        {/* 등록/수정 Drawer */}
        <JmDrawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <JmDrawerContent side="right" size="md">
            <JmDrawerHeader>
              <JmDrawerTitle>{drawerTitle}</JmDrawerTitle>
            </JmDrawerHeader>

            <JmDrawerBody className="flex flex-col gap-5">
              <JmFormField label="카테고리명" required>
                <JmInput
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={
                    editTarget.type === "child" ? "예: 전기형, 엔진형" : "예: 고압분무기"
                  }
                />
              </JmFormField>

              {editTarget.type === "root" && (
                <JmFormField label="상위 카테고리" hint="소분류로 등록 시 선택">
                  <JmSelect
                    value={form.parentId ?? "__none__"}
                    onChange={(v) =>
                      setForm((f) => ({ ...f, parentId: v === "__none__" ? null : v }))
                    }
                    options={parentOptions}
                  />
                </JmFormField>
              )}

              <JmFormField label="순서">
                <JmInput
                  type="text"
                  inputMode="numeric"
                  value={form.order}
                  onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))}
                  placeholder="0"
                  onFocus={(e) => focusCaretEnd(e)}
                />
              </JmFormField>

              <JmFormField label="이미지">
                <ImageInput
                  value={form.imageUrl ?? null}
                  onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))}
                  onPathChange={(path) => setForm((f) => ({ ...f, imagePath: path }))}
                  context="category"
                  allowFree={false}
                  allowSvgRaw
                />
              </JmFormField>
            </JmDrawerBody>

            <JmDrawerFooter>
              <JmButton
                variant="ghost"
                onClick={() => setDrawerOpen(false)}
                disabled={saveMutation.isPending}
              >
                취소
              </JmButton>
              <JmButton
                variant="cta"
                onClick={() => saveMutation.mutate(form)}
                disabled={saveMutation.isPending || !form.name.trim()}
              >
                {saveMutation.isPending && <JmSpinner size="sm" tone="inverted" />}
                {editId ? "수정" : "등록"}
              </JmButton>
            </JmDrawerFooter>
          </JmDrawerContent>
        </JmDrawer>

        {/* 삭제 확인 Dialog */}
        <JmDialog
          open={!!deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
        >
          <JmDialogContent size="sm">
            <JmDialogHeader>
              <JmDialogTitle>카테고리 삭제</JmDialogTitle>
            </JmDialogHeader>
            <JmDialogBody>
              <p className="text-jm-sm text-[var(--jm-text)]">
                <span className="font-semibold">{deleteTarget?.name}</span> 카테고리를
                삭제하시겠습니까?
              </p>
              <p className="mt-2 text-jm-xs text-[var(--jm-text-muted)]">
                하위 카테고리나 연결된 상품이 있으면 삭제할 수 없습니다.
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
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending && <JmSpinner size="sm" tone="inverted" />}
                삭제
              </JmButton>
            </JmDialogFooter>
          </JmDialogContent>
        </JmDialog>

      </JmTooltipProvider>
    </ProductsThemeScope>
  );
}
