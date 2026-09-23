"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
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
  JmInput,
  JmSearchInput,
  JmSelect,
  JmSkeleton,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
  JmTableToolbar,
  JmTableToolbarActions,
  JmTableToolbarFilters,
  JmTableToolbarSearch,
  JmTabs,
  JmTabsList,
  JmTabsPanel,
  JmTabsTrigger,
  JmCombobox,
} from "@/jm";

interface Template {
  id: string;
  text: string;
  categoryId: string | null;
  usageCount: number;
}

interface Category {
  id: string;
  name: string;
}

type Kind = "symptom" | "diagnosis" | "device";

function TemplatesSkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <JmTableRow key={i}>
          <JmTableCell>
            <JmSkeleton className="h-4 w-48" />
          </JmTableCell>
          <JmTableCell>
            <JmSkeleton className="h-5 w-16 rounded-md" />
          </JmTableCell>
          <JmTableCell className="text-right">
            <div className="flex justify-end">
              <JmSkeleton className="h-4 w-8" />
            </div>
          </JmTableCell>
          <JmTableCell>
            <div className="flex justify-end gap-1">
              <JmSkeleton className="h-8 w-8 rounded-md" />
              <JmSkeleton className="h-8 w-8 rounded-md" />
            </div>
          </JmTableCell>
        </JmTableRow>
      ))}
    </>
  );
}

export default function RepairTemplatesPage() {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<Kind>("symptom");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [editing, setEditing] = useState<Template | null>(null);
  const [confirming, setConfirming] = useState<Template | null>(null);
  // 병합 — 다중 선택 후 대표 지정
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<string>("");

  const categoriesQuery = useQuery<Category[]>({
    queryKey: ["product-categories"],
    queryFn: () => apiGet<Category[]>("/api/categories"),
    staleTime: 1000 * 60 * 5,
  });

  const templatesQuery = useQuery<Template[]>({
    queryKey: ["repair-templates", kind],
    queryFn: () =>
      apiGet<Template[]>(
        kind === "symptom"
          ? "/api/repair-symptom-templates"
          : "/api/repair-diagnosis-templates",
      ),
    staleTime: 1000 * 30,
  });

  const mergeMutation = useMutation({
    mutationFn: () =>
      apiMutate("/api/repair-templates/merge", "POST", {
        kind,
        targetId: mergeTargetId,
        sourceIds: Array.from(selectedIds).filter((id) => id !== mergeTargetId),
      }),
    onSuccess: () => {
      toast.success("병합되었습니다");
      setSelectedIds(new Set());
      setMergeOpen(false);
      setMergeTargetId("");
      queryClient.invalidateQueries({ queryKey: ["repair-templates"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "병합 실패"),
  });

  const templates = templatesQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates
      .filter((t) => {
        if (categoryFilter === "all") return true;
        if (categoryFilter === "uncategorized") return t.categoryId === null;
        return t.categoryId === categoryFilter;
      })
      .filter((t) => (q ? t.text.toLowerCase().includes(q) : true));
  }, [templates, categoryFilter, search]);

  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="flex w-full flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-jm-xl font-bold text-[var(--jm-text)]">
            수리 템플릿 관리
          </h1>
          <p className="text-jm-sm text-[var(--jm-text-muted)]">
            자유 입력으로 쌓인 증상·진단 마스터를 정리. 텍스트 수정 시 연결된
            티켓의 본문도 같이 갱신됩니다. 삭제 시 티켓의 본문 텍스트는 그대로
            보존되고 마스터 link 만 해제 (이력 유지).
          </p>
        </div>

        <JmTabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
          <JmTabsList>
            <JmTabsTrigger value="symptom">증상</JmTabsTrigger>
            <JmTabsTrigger value="diagnosis">원인</JmTabsTrigger>
            <JmTabsTrigger value="device">기기</JmTabsTrigger>
          </JmTabsList>

          {/* 기기 — 정규화로 중복이 자동 흡수되므로 병합 대신 카탈로그 매핑이 핵심 (D11) */}
          <JmTabsPanel value="device">
            <DevicePanel />
          </JmTabsPanel>

          {(["symptom", "diagnosis"] as const).map((k) => (
            <JmTabsPanel key={k} value={k}>
              <JmCard className="overflow-hidden p-0">
                <JmTableToolbar>
                  <JmTableToolbarSearch>
                    <JmSearchInput
                      size="sm"
                      placeholder={
                        k === "symptom"
                          ? "증상 텍스트 검색"
                          : "진단 텍스트 검색"
                      }
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onClear={() => setSearch("")}
                    />
                  </JmTableToolbarSearch>
                  <JmTableToolbarActions>
                    <span className="text-jm-2xs text-[var(--jm-text-subtle)]">
                      {filtered.length} / {templates.length} 개
                    </span>
                  </JmTableToolbarActions>
                  <JmTableToolbarFilters>
                    <JmSelect
                      value={categoryFilter}
                      onChange={setCategoryFilter}
                      size="sm"
                      className="w-auto min-w-44"
                      options={[
                        { value: "all", label: "전체 카테고리" },
                        { value: "uncategorized", label: "미지정 (공통)" },
                        ...categories.map((c) => ({
                          value: c.id,
                          label: c.name,
                        })),
                      ]}
                    />
                  </JmTableToolbarFilters>
                </JmTableToolbar>

                {/* 병합 바 — 2개 이상 선택 시 노출 (D5) */}
                {selectedIds.size > 0 && (
                  <div className="mb-2 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--jm-action)] bg-[var(--jm-bg)] px-3 py-2">
                    <span className="text-jm-sm font-medium text-[var(--jm-text)]">
                      {selectedIds.size}개 선택됨
                    </span>
                    <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                      같은 뜻으로 갈라진 항목을 하나로 합칩니다 — 사용 횟수·추천 학습이 대표로 모입니다
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      <JmButton variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                        선택 해제
                      </JmButton>
                      <JmButton
                        variant="cta"
                        size="sm"
                        disabled={selectedIds.size < 2}
                        onClick={() => {
                          // 기본 대표 = 사용 횟수가 가장 많은 항목
                          const chosen = filtered
                            .filter((t) => selectedIds.has(t.id))
                            .sort((a, b) => b.usageCount - a.usageCount)[0];
                          setMergeTargetId(chosen?.id ?? "");
                          setMergeOpen(true);
                        }}
                      >
                        병합
                      </JmButton>
                    </div>
                  </div>
                )}

                <JmTable>
                  <JmTableHeader>
                    <JmTableRow>
                      <JmTableHead className="w-[44px]">
                        <input
                          type="checkbox"
                          aria-label="전체 선택"
                          className="size-4 accent-[var(--jm-action)]"
                          checked={filtered.length > 0 && filtered.every((t) => selectedIds.has(t.id))}
                          onChange={(e) =>
                            setSelectedIds(
                              e.target.checked ? new Set(filtered.map((t) => t.id)) : new Set(),
                            )
                          }
                        />
                      </JmTableHead>
                      <JmTableHead>텍스트</JmTableHead>
                      <JmTableHead>카테고리</JmTableHead>
                      <JmTableHead className="text-right">사용 횟수</JmTableHead>
                      <JmTableHead className="w-[120px]"></JmTableHead>
                    </JmTableRow>
                  </JmTableHeader>
                  <JmTableBody>
                    {templatesQuery.isPending ? (
                      <TemplatesSkeletonRows />
                    ) : filtered.length === 0 ? (
                      <JmTableRow>
                        <JmTableCell
                          colSpan={5}
                          className="py-8 text-center text-jm-sm text-[var(--jm-text-subtle)]"
                        >
                          {search || categoryFilter !== "all"
                            ? "조건에 맞는 템플릿이 없습니다"
                            : "등록된 템플릿이 없습니다 — 수리 작성 시 자동 생성"}
                        </JmTableCell>
                      </JmTableRow>
                    ) : (
                      filtered.map((t) => (
                        <JmTableRow key={t.id}>
                          <JmTableCell>
                            <input
                              type="checkbox"
                              aria-label={`${t.text} 선택`}
                              className="size-4 accent-[var(--jm-action)]"
                              checked={selectedIds.has(t.id)}
                              onChange={(e) => {
                                const next = new Set(selectedIds);
                                if (e.target.checked) next.add(t.id);
                                else next.delete(t.id);
                                setSelectedIds(next);
                              }}
                            />
                          </JmTableCell>
                          <JmTableCell className="font-medium text-[var(--jm-text)]">
                            {t.text}
                          </JmTableCell>
                          <JmTableCell>
                            {t.categoryId ? (
                              <JmBadge variant="default" size="sm">
                                {categoryById.get(t.categoryId) ?? "—"}
                              </JmBadge>
                            ) : (
                              <span className="text-jm-2xs text-[var(--jm-text-subtle)]">
                                공통
                              </span>
                            )}
                          </JmTableCell>
                          <JmTableCell className="text-right tabular-nums text-[var(--jm-text)]">
                            {t.usageCount}
                          </JmTableCell>
                          <JmTableCell>
                            <div className="flex items-center justify-end gap-1">
                              <JmButton
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditing(t)}
                                aria-label="수정"
                              >
                                <Pencil className="size-3.5" />
                              </JmButton>
                              <JmButton
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirming(t)}
                                aria-label="삭제"
                              >
                                <Trash2 className="size-3.5 text-[var(--jm-danger-fg)]" />
                              </JmButton>
                            </div>
                          </JmTableCell>
                        </JmTableRow>
                      ))
                    )}
                  </JmTableBody>
                </JmTable>
              </JmCard>
            </JmTabsPanel>
          ))}
        </JmTabs>
      </div>

      {/* 수정 다이얼로그 */}
      {editing && (
        <EditDialog
          kind={kind}
          template={editing}
          onClose={() => setEditing(null)}
        />
      )}

      {/* 삭제 확인 다이얼로그 */}
      {confirming && (
        <DeleteDialog
          kind={kind}
          template={confirming}
          onClose={() => setConfirming(null)}
        />
      )}

      {/* 병합 다이얼로그 — 대표 선택 (D5) */}
      <JmDialog open={mergeOpen} onOpenChange={(v) => !v && setMergeOpen(false)}>
        <JmDialogContent>
          <JmDialogHeader>
            <JmDialogTitle>
              {kind === "symptom" ? "증상" : "원인"} 병합
            </JmDialogTitle>
          </JmDialogHeader>
          <JmDialogBody>
            <p className="mb-3 text-jm-sm text-[var(--jm-text-muted)]">
              대표로 남길 항목을 고르세요. 나머지는 삭제되고, 연결된 티켓·사용 횟수·부속/공임
              추천 학습이 모두 대표로 합쳐집니다.
            </p>
            <div className="flex flex-col gap-1.5">
              {filtered
                .filter((t) => selectedIds.has(t.id))
                .sort((a, b) => b.usageCount - a.usageCount)
                .map((t) => (
                  <label
                    key={t.id}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-2.5 transition-colors ${
                      mergeTargetId === t.id
                        ? "border-[var(--jm-action)] bg-[var(--jm-bg)]"
                        : "border-[var(--jm-border)] bg-[var(--jm-surface)]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="merge-target"
                      className="size-4 accent-[var(--jm-action)]"
                      checked={mergeTargetId === t.id}
                      onChange={() => setMergeTargetId(t.id)}
                    />
                    <span className="min-w-0 flex-1 truncate text-jm-sm text-[var(--jm-text)]">
                      {t.text}
                    </span>
                    <span className="shrink-0 text-jm-2xs text-[var(--jm-text-muted)]">
                      {t.usageCount}회
                    </span>
                    {mergeTargetId === t.id && (
                      <JmBadge variant="accent" size="sm">
                        대표
                      </JmBadge>
                    )}
                  </label>
                ))}
            </div>
          </JmDialogBody>
          <JmDialogFooter>
            <JmButton variant="ghost" onClick={() => setMergeOpen(false)}>
              취소
            </JmButton>
            <JmButton
              variant="cta"
              disabled={!mergeTargetId || mergeMutation.isPending}
              onClick={() => mergeMutation.mutate()}
            >
              {mergeMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              {selectedIds.size - 1}개 흡수
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>
    </div>
  );
}


interface DeviceTemplate {
  id: string;
  text: string;
  normalizedText: string;
  usageCount: number;
  productId: string | null;
  product: { id: string; name: string; sku: string } | null;
}

interface ProductOpt {
  id: string;
  name: string;
  sku: string;
}

/**
 * 기기 탭 — 자유 입력으로 쌓인 기기 마스터 (D11).
 * 표기 흔들림은 normalizedText 로 자동 흡수되므로 병합 UI 불필요.
 * 여기선 카탈로그 상품 매핑이 핵심 — 매핑하면 이후 표시는 내상품명을 따라간다.
 */
function DevicePanel() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [mapping, setMapping] = useState<DeviceTemplate | null>(null);
  const [pickedProductId, setPickedProductId] = useState("");

  const devicesQuery = useQuery<DeviceTemplate[]>({
    queryKey: ["repair-device-templates"],
    queryFn: () => apiGet<DeviceTemplate[]>("/api/repair-device-templates"),
    staleTime: 1000 * 30,
  });

  const productsQuery = useQuery<ProductOpt[]>({
    queryKey: ["repair-device-products"],
    queryFn: () => apiGet<ProductOpt[]>("/api/products?isBulk=all&excludeVariants=true"),
    enabled: !!mapping,
    staleTime: 1000 * 60 * 5,
  });

  const saveMapping = useMutation({
    mutationFn: (v: { id: string; productId: string | null }) =>
      apiMutate(`/api/repair-device-templates/${v.id}`, "PATCH", { productId: v.productId }),
    onSuccess: () => {
      toast.success("매핑되었습니다");
      setMapping(null);
      setPickedProductId("");
      queryClient.invalidateQueries({ queryKey: ["repair-device-templates"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "매핑 실패"),
  });

  const rows = (devicesQuery.data ?? []).filter((d) =>
    search.trim() ? d.text.toLowerCase().includes(search.trim().toLowerCase()) : true,
  );

  return (
    <>
      <JmCard className="overflow-hidden p-0">
        <JmTableToolbar>
          <JmTableToolbarSearch>
            <JmSearchInput
              size="sm"
              placeholder="기기명 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClear={() => setSearch("")}
            />
          </JmTableToolbarSearch>
        </JmTableToolbar>

        <JmTable>
          <JmTableHeader>
            <JmTableRow>
              <JmTableHead>기기명</JmTableHead>
              <JmTableHead>카탈로그 매핑</JmTableHead>
              <JmTableHead className="text-right">사용 횟수</JmTableHead>
              <JmTableHead className="w-[120px]"></JmTableHead>
            </JmTableRow>
          </JmTableHeader>
          <JmTableBody>
            {devicesQuery.isPending ? (
              <TemplatesSkeletonRows />
            ) : rows.length === 0 ? (
              <JmTableRow>
                <JmTableCell colSpan={4} className="py-8 text-center text-jm-sm text-[var(--jm-text-subtle)]">
                  {search ? "조건에 맞는 기기가 없습니다" : "등록된 기기가 없습니다 — 수리 접수 시 자동 생성"}
                </JmTableCell>
              </JmTableRow>
            ) : (
              rows.map((d) => (
                <JmTableRow key={d.id}>
                  <JmTableCell className="font-medium text-[var(--jm-text)]">{d.text}</JmTableCell>
                  <JmTableCell>
                    {d.product ? (
                      <span className="flex items-center gap-1.5">
                        <JmBadge variant="accent" size="sm">연결됨</JmBadge>
                        <span className="text-jm-sm text-[var(--jm-text)]">{d.product.name}</span>
                      </span>
                    ) : (
                      <span className="text-jm-2xs text-[var(--jm-text-subtle)]">미연결</span>
                    )}
                  </JmTableCell>
                  <JmTableCell className="text-right tabular-nums text-[var(--jm-text)]">
                    {d.usageCount}
                  </JmTableCell>
                  <JmTableCell>
                    <div className="flex items-center justify-end gap-1">
                      <JmButton
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setMapping(d);
                          setPickedProductId(d.productId ?? "");
                        }}
                      >
                        {d.product ? "매핑 변경" : "상품 연결"}
                      </JmButton>
                    </div>
                  </JmTableCell>
                </JmTableRow>
              ))
            )}
          </JmTableBody>
        </JmTable>
      </JmCard>

      {/* 카탈로그 매핑 다이얼로그 */}
      <JmDialog open={!!mapping} onOpenChange={(v) => !v && setMapping(null)}>
        <JmDialogContent>
          <JmDialogHeader>
            <JmDialogTitle>카탈로그 상품 연결</JmDialogTitle>
          </JmDialogHeader>
          <JmDialogBody>
            <p className="mb-3 text-jm-sm text-[var(--jm-text-muted)]">
              <b>{mapping?.text}</b> 를 내상품과 연결합니다. 연결하면 이 기기의 수리 이력이
              해당 상품으로 모여 추적됩니다.
            </p>
            <JmCombobox
              items={(productsQuery.data ?? []).map((pr) => ({
                id: pr.id,
                label: pr.name,
                description: pr.sku,
              }))}
              value={pickedProductId}
              onChange={(item) => setPickedProductId(item.id)}
              placeholder={productsQuery.isPending ? "상품 불러오는 중…" : "카탈로그에서 상품 선택"}
              searchPlaceholder="상품명 또는 SKU 검색"
              emptyMessage="상품이 없습니다"
              clearable
              onClear={() => setPickedProductId("")}
            />
          </JmDialogBody>
          <JmDialogFooter>
            {mapping?.productId && (
              <JmButton
                variant="ghost"
                onClick={() => mapping && saveMapping.mutate({ id: mapping.id, productId: null })}
                disabled={saveMapping.isPending}
              >
                연결 해제
              </JmButton>
            )}
            <JmButton variant="ghost" onClick={() => setMapping(null)}>
              취소
            </JmButton>
            <JmButton
              variant="cta"
              disabled={!pickedProductId || saveMapping.isPending}
              onClick={() => mapping && saveMapping.mutate({ id: mapping.id, productId: pickedProductId })}
            >
              {saveMapping.isPending && <Loader2 className="size-4 animate-spin" />}
              연결
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>
    </>
  );
}

function EditDialog({
  kind,
  template,
  onClose,
}: {
  kind: Kind;
  template: Template;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState(template.text);
  const dirty = text.trim() !== template.text.trim();

  const update = useMutation({
    mutationFn: () =>
      apiMutate(
        kind === "symptom"
          ? `/api/repair-symptom-templates/${template.id}`
          : `/api/repair-diagnosis-templates/${template.id}`,
        "PATCH",
        { text: text.trim() },
      ),
    onSuccess: () => {
      toast.success("수정됨");
      qc.invalidateQueries({ queryKey: ["repair-templates"] });
      qc.invalidateQueries({ queryKey: ["repairs"] });
      onClose();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "수정 실패"),
  });

  return (
    <JmDialog open onOpenChange={(o) => !o && onClose()}>
      <JmDialogContent>
        <JmDialogHeader>
          <JmDialogTitle>
            {kind === "symptom" ? "증상" : "진단"} 템플릿 수정
          </JmDialogTitle>
        </JmDialogHeader>
        <JmDialogBody>
          <div className="flex flex-col gap-2">
            <span className="text-jm-2xs font-medium text-[var(--jm-text-muted)]">
              텍스트
            </span>
            <JmInput
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
            <p className="text-jm-2xs text-[var(--jm-text-subtle)]">
              연결된 모든 수리 티켓의 본문도 자동 동기화됩니다. 같은 카테고리에
              같은 텍스트가 이미 있으면 거부됩니다.
            </p>
          </div>
        </JmDialogBody>
        <JmDialogFooter>
          <JmButton variant="ghost" onClick={onClose}>
            취소
          </JmButton>
          <JmButton
            variant="cta"
            onClick={() => update.mutate()}
            disabled={!dirty || !text.trim() || update.isPending}
          >
            {update.isPending ? "저장 중..." : "저장"}
          </JmButton>
        </JmDialogFooter>
      </JmDialogContent>
    </JmDialog>
  );
}

function DeleteDialog({
  kind,
  template,
  onClose,
}: {
  kind: Kind;
  template: Template;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () =>
      apiMutate(
        kind === "symptom"
          ? `/api/repair-symptom-templates/${template.id}`
          : `/api/repair-diagnosis-templates/${template.id}`,
        "DELETE",
      ),
    onSuccess: () => {
      toast.success("삭제됨");
      qc.invalidateQueries({ queryKey: ["repair-templates"] });
      qc.invalidateQueries({ queryKey: ["repairs"] });
      onClose();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "삭제 실패"),
  });

  return (
    <JmDialog open onOpenChange={(o) => !o && onClose()}>
      <JmDialogContent>
        <JmDialogHeader>
          <JmDialogTitle>템플릿 삭제</JmDialogTitle>
        </JmDialogHeader>
        <JmDialogBody>
          <p className="text-jm-sm text-[var(--jm-text)]">
            <span className="font-semibold">&ldquo;{template.text}&rdquo;</span>{" "}
            템플릿을 삭제할까요?
          </p>
          <p className="mt-2 text-jm-2xs text-[var(--jm-text-muted)]">
            연결된 {template.usageCount}건의 수리 티켓에서 마스터 link 만 끊기고,
            티켓의 본문 텍스트는 그대로 보존됩니다.{" "}
            {kind === "diagnosis" && (
              <>
                연결된{" "}
                <strong>증상-진단 페어, 부속/공임 빈도, 세트</strong> 통계도
                같이 삭제됩니다.
              </>
            )}
          </p>
        </JmDialogBody>
        <JmDialogFooter>
          <JmButton variant="ghost" onClick={onClose}>
            취소
          </JmButton>
          <JmButton
            variant="danger"
            onClick={() => del.mutate()}
            disabled={del.isPending}
          >
            {del.isPending ? "삭제 중..." : "삭제"}
          </JmButton>
        </JmDialogFooter>
      </JmDialogContent>
    </JmDialog>
  );
}
