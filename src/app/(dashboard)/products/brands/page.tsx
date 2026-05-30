"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { toast } from "sonner";
import { Pencil, Tag, Trash2 } from "lucide-react";
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
import { ImageInput } from "@/components/image-input";
import { ProductsThemeScope } from "../_theme-scope";

interface Brand {
  id: string;
  name: string;
  logoUrl?: string | null;
  logoPath?: string | null;
  memo?: string | null;
  isActive: boolean;
  _count: { products: number };
}

const brandsKey = ["brands"] as const;

// ─────────────────────────────────────────────
// 스켈레톤 행
// ─────────────────────────────────────────────
function BrandSkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <JmTableRow key={i} className="hover:bg-transparent">
          <JmTableCell>
            <JmSkeleton className="h-8 w-8 rounded" />
          </JmTableCell>
          <JmTableCell>
            <JmSkeleton className="h-4 w-32" />
          </JmTableCell>
          <JmTableCell>
            <div className="flex justify-end">
              <JmSkeleton className="h-4 w-8" />
            </div>
          </JmTableCell>
          <JmTableCell>
            <JmSkeleton className="h-5 w-14 rounded-full" />
          </JmTableCell>
          <JmTableCell>
            <div className="flex justify-end">
              <JmSkeleton className="h-7 w-7 rounded-md" />
            </div>
          </JmTableCell>
        </JmTableRow>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────
// 메인 페이지
// ─────────────────────────────────────────────
export default function BrandsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [editing, setEditing] = useState<Brand | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const brandsQuery = useQuery({
    queryKey: brandsKey,
    queryFn: () => apiGet<Brand[]>("/api/brands?includeInactive=true"),
  });

  const brands = useMemo(() => brandsQuery.data ?? [], [brandsQuery.data]);

  const filtered = useMemo(() => {
    if (!appliedSearch) return brands;
    const q = appliedSearch.toLowerCase();
    return brands.filter((b) => b.name.toLowerCase().includes(q));
  }, [brands, appliedSearch]);

  // KPI (로드된 데이터 기준)
  const stats = useMemo(() => {
    const total = brands.length;
    const active = brands.filter((b) => b.isActive).length;
    const linkedProducts = brands.reduce((s, b) => s + b._count.products, 0);
    const noLogo = brands.filter((b) => !b.logoUrl).length;
    return { total, active, linkedProducts, noLogo };
  }, [brands]);

  const isPending = brandsQuery.isPending;
  const isError = brandsQuery.isError;

  return (
    <ProductsThemeScope>
      <JmTooltipProvider>
        <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
          <div className="flex w-full flex-col gap-6 p-4">
            {/* KPI */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <JmStat
                label="전체 브랜드"
                value={isPending ? "—" : stats.total.toLocaleString("ko-KR")}
                icon={<Tag className="size-4" />}
                size="sm"
              />
              <JmStat
                label="활성 브랜드"
                value={isPending ? "—" : stats.active.toLocaleString("ko-KR")}
                icon={<Tag className="size-4" />}
                size="sm"
              />
              <JmStat
                label="연결 상품 수"
                value={
                  isPending
                    ? "—"
                    : stats.linkedProducts.toLocaleString("ko-KR")
                }
                icon={<Tag className="size-4" />}
                size="sm"
              />
              <JmStat
                label="로고 미등록"
                value={isPending ? "—" : stats.noLogo.toLocaleString("ko-KR")}
                icon={<Tag className="size-4" />}
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
                    placeholder="브랜드명 검색..."
                  />
                </JmTableToolbarSearch>
                <JmTableToolbarActions>
                  <JmButton size="sm" onClick={() => setCreateOpen(true)}>
                    브랜드 등록
                  </JmButton>
                </JmTableToolbarActions>
              </JmTableToolbar>

              <JmTable className="min-w-[520px]">
                <JmTableHeader>
                  <JmTableRow>
                    <JmTableHead className="w-[60px]">로고</JmTableHead>
                    <JmTableHead>이름</JmTableHead>
                    <JmTableHead className="w-[90px] text-right">
                      상품 수
                    </JmTableHead>
                    <JmTableHead className="w-[90px]">상태</JmTableHead>
                    <JmTableHead className="w-[64px] text-right">
                      관리
                    </JmTableHead>
                  </JmTableRow>
                </JmTableHeader>
                <JmTableBody>
                  {isPending ? (
                    <BrandSkeletonRows />
                  ) : isError ? (
                    <JmTableRow className="hover:bg-transparent">
                      <JmTableCell
                        colSpan={5}
                        className="py-10 text-center text-[13px] text-[var(--jm-danger-fg)]"
                      >
                        브랜드 목록을 불러오지 못했습니다
                      </JmTableCell>
                    </JmTableRow>
                  ) : filtered.length === 0 ? (
                    <JmTableRow className="hover:bg-transparent">
                      <JmTableCell colSpan={5} className="py-12">
                        <JmEmpty
                          icon={<Tag className="size-8" />}
                          title={
                            appliedSearch
                              ? "검색 결과가 없습니다"
                              : "등록된 브랜드가 없습니다"
                          }
                          description={
                            appliedSearch
                              ? "다른 검색어를 입력해보세요"
                              : "첫 브랜드를 등록해 상품에 연결하세요"
                          }
                          action={
                            !appliedSearch ? (
                              <JmButton
                                size="sm"
                                onClick={() => setCreateOpen(true)}
                              >
                                브랜드 등록
                              </JmButton>
                            ) : null
                          }
                        />
                      </JmTableCell>
                    </JmTableRow>
                  ) : (
                    filtered.map((b) => (
                      <JmTableRow
                        key={b.id}
                        className="cursor-pointer"
                        onClick={() => setEditing(b)}
                      >
                        <JmTableCell>
                          {b.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={b.logoUrl}
                              alt=""
                              className="h-8 w-8 rounded object-contain bg-[var(--jm-surface)] border border-[var(--jm-border)]"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded bg-[var(--jm-bg-subtle)]" />
                          )}
                        </JmTableCell>
                        <JmTableCell className="font-medium text-[var(--jm-text)]">
                          {b.name}
                        </JmTableCell>
                        <JmTableCell className="text-right tabular-nums text-[var(--jm-text-muted)]">
                          {b._count.products}
                        </JmTableCell>
                        <JmTableCell>
                          <JmBadge
                            variant={b.isActive ? "success" : "default"}
                            size="sm"
                          >
                            {b.isActive ? "활성" : "비활성"}
                          </JmBadge>
                        </JmTableCell>
                        <JmTableCell>
                          <div className="flex justify-end">
                            <JmTooltip content="수정">
                              <JmIconButton
                                variant="ghost"
                                size="sm"
                                aria-label="수정"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditing(b);
                                }}
                              >
                                <Pencil className="size-3.5" />
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

        <BrandCreateDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={() => qc.invalidateQueries({ queryKey: brandsKey })}
        />
        <BrandEditSheet
          brand={editing}
          onClose={() => setEditing(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: brandsKey })}
        />
      </JmTooltipProvider>
    </ProductsThemeScope>
  );
}

// ============================================================
// 신규 브랜드 등록 Dialog
// ============================================================

function BrandCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [memo, setMemo] = useState("");

  const createMutation = useMutation({
    mutationFn: (body: { name: string; memo: string }) =>
      apiMutate("/api/brands", "POST", body),
    onSuccess: () => {
      toast.success("브랜드가 등록되었습니다");
      onCreated();
      setName("");
      setMemo("");
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "등록 실패"),
  });

  const handleSubmit = () => {
    if (!name.trim()) return;
    createMutation.mutate({ name: name.trim(), memo: memo.trim() });
  };

  return (
    <JmDialog open={open} onOpenChange={onOpenChange}>
      <JmDialogContent size="sm">
        <JmDialogHeader>
          <JmDialogTitle>브랜드 등록</JmDialogTitle>
        </JmDialogHeader>
        <JmDialogBody className="space-y-3">
          <JmFormField label="브랜드명" required>
            <JmInput
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.nativeEvent.isComposing &&
                  name.trim()
                ) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="브랜드명 입력"
            />
          </JmFormField>
          <JmFormField label="메모">
            <JmInput
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="메모 (선택)"
            />
          </JmFormField>
          <p className="text-[11px] text-[var(--jm-text-subtle)]">
            로고는 등록 후 수정 화면에서 업로드합니다
          </p>
        </JmDialogBody>
        <JmDialogFooter>
          <JmButton
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
          >
            취소
          </JmButton>
          <JmButton
            variant="cta"
            onClick={handleSubmit}
            disabled={!name.trim() || createMutation.isPending}
          >
            {createMutation.isPending && (
              <JmSpinner size="sm" tone="inverted" />
            )}
            등록
          </JmButton>
        </JmDialogFooter>
      </JmDialogContent>
    </JmDialog>
  );
}

// ============================================================
// 브랜드 수정 Drawer (로고 + 정보 관리)
// ============================================================

function BrandEditSheet({
  brand,
  onClose,
  onSaved,
}: {
  brand: Brand | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [memo, setMemo] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false);

  const open = brand !== null;

  // 시트 열릴 때 form 초기화 (의도된 렌더 중 setState 패턴)
  if (brand && name === "" && brand.name) {
    setName(brand.name);
    setMemo(brand.memo ?? "");
    setLogoUrl(brand.logoUrl ?? null);
    setLogoPath(brand.logoPath ?? null);
    setIsActive(brand.isActive);
  }

  const updateMutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/brands/${brand!.id}`, "PUT", {
        name: name.trim(),
        memo: memo.trim() || null,
        logoUrl,
        logoPath,
        isActive,
      }),
    onSuccess: () => {
      toast.success("저장되었습니다");
      onSaved();
      handleClose();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  const deactivateMutation = useMutation({
    mutationFn: () => apiMutate(`/api/brands/${brand!.id}`, "DELETE"),
    onSuccess: () => {
      toast.success("브랜드가 비활성화되었습니다");
      onSaved();
      setDeactivateConfirmOpen(false);
      handleClose();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "비활성화 실패"),
  });

  const handleClose = () => {
    setName("");
    setMemo("");
    setLogoUrl(null);
    setLogoPath(null);
    setIsActive(true);
    onClose();
  };

  return (
    <>
      <JmDrawer open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <JmDrawerContent side="right" size="md">
          <JmDrawerHeader>
            <JmDrawerTitle>브랜드 수정</JmDrawerTitle>
          </JmDrawerHeader>
          <JmDrawerBody className="space-y-5">
            {/* 로고 */}
            <div className="space-y-2">
              <p className="text-jm-sm font-medium text-[var(--jm-text)]">
                로고
              </p>
              <ImageInput
                value={logoUrl}
                onChange={setLogoUrl}
                onPathChange={setLogoPath}
                context="brand"
                allowSvgRaw
                size={80}
              />
              <p className="text-[11px] text-[var(--jm-text-subtle)]">
                JPG / PNG / WebP / SVG · 최대 5MB
              </p>
            </div>

            <JmFormField label="브랜드명" required>
              <JmInput
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </JmFormField>

            <JmFormField label="메모">
              <JmInput
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="메모 (선택)"
              />
            </JmFormField>

            <div className="flex items-center gap-3">
              <span className="text-jm-sm text-[var(--jm-text)]">활성</span>
              <JmSwitch
                checked={isActive}
                onCheckedChange={(v) => setIsActive(v)}
                size="sm"
              />
            </div>
          </JmDrawerBody>
          <JmDrawerFooter className="flex justify-between">
            <JmButton
              variant="outline"
              onClick={() => setDeactivateConfirmOpen(true)}
              disabled={deactivateMutation.isPending}
              className="text-[var(--jm-danger-fg)]"
            >
              <Trash2 className="size-3.5" />
              비활성화
            </JmButton>
            <div className="flex gap-2">
              <JmButton variant="ghost" onClick={handleClose}>
                취소
              </JmButton>
              <JmButton
                variant="cta"
                onClick={() => updateMutation.mutate()}
                disabled={!name.trim() || updateMutation.isPending}
              >
                {updateMutation.isPending && (
                  <JmSpinner size="sm" tone="inverted" />
                )}
                저장
              </JmButton>
            </div>
          </JmDrawerFooter>
        </JmDrawerContent>
      </JmDrawer>

      {/* 비활성화 확인 Dialog */}
      <JmDialog
        open={deactivateConfirmOpen}
        onOpenChange={(v) => !deactivateMutation.isPending && setDeactivateConfirmOpen(v)}
      >
        <JmDialogContent size="sm">
          <JmDialogHeader>
            <JmDialogTitle>브랜드 비활성화</JmDialogTitle>
          </JmDialogHeader>
          <JmDialogBody>
            <p className="text-jm-sm text-[var(--jm-text)]">
              <span className="font-semibold">{brand?.name}</span> 브랜드를
              비활성화합니다.
            </p>
            <p className="mt-2 text-jm-xs text-[var(--jm-text-muted)]">
              비활성화한 브랜드는 목록에서 숨겨집니다. 연결된 상품에는 영향을
              주지 않습니다.
            </p>
          </JmDialogBody>
          <JmDialogFooter>
            <JmButton
              variant="outline"
              onClick={() => setDeactivateConfirmOpen(false)}
              disabled={deactivateMutation.isPending}
            >
              취소
            </JmButton>
            <JmButton
              variant="danger"
              onClick={() => deactivateMutation.mutate()}
              disabled={deactivateMutation.isPending}
            >
              {deactivateMutation.isPending && (
                <JmSpinner size="sm" tone="inverted" />
              )}
              비활성화
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>
    </>
  );
}
