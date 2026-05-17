"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Building2,
  ChevronRight,
  FileText,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  User,
  Users,
} from "lucide-react";

import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatBusinessNumber, formatPhone } from "@/lib/utils";
import {
  JmButton,
  JmCard,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmEmpty,
  JmIconButton,
  JmPill,
  JmSearchInput,
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
  JmTableToolbarFilters,
  JmTableToolbarSearch,
  JmTooltip,
  JmTooltipProvider,
} from "@/jm";

import { CustomerSheet } from "./_customer-sheet";
import {
  CustomerRowSkeleton,
  CustomerStatusBadge,
  CustomerTypeBadge,
} from "./_parts";
import { CustomersThemeScope } from "./_theme-scope";
import type { Customer, CustomerType } from "./_types";

type TypeFilter = "all" | CustomerType;
type StatusFilter = "active" | "inactive" | "all";

const TYPE_FILTER_LABELS: Record<TypeFilter, string> = {
  all: "전체",
  INDIVIDUAL: "개인",
  BUSINESS: "기업",
};

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Customer | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);

  const customersQuery = useQuery({
    queryKey: queryKeys.customers.list({
      search: appliedSearch,
      includeInactive: statusFilter !== "active",
    }),
    queryFn: () => {
      const params = new URLSearchParams();
      if (appliedSearch) params.set("search", appliedSearch);
      if (statusFilter !== "active") params.set("includeInactive", "1");
      const qs = params.toString();
      return apiGet<Customer[]>(`/api/customers${qs ? `?${qs}` : ""}`);
    },
  });

  const all = useMemo(
    () => customersQuery.data ?? [],
    [customersQuery.data],
  );

  // KPI 는 활성 고객만 기준 — 데이터가 includeInactive=1 일 땐 클라이언트에서 분리
  const stats = useMemo(() => {
    const active = all.filter((c) => c.isActive);
    const business = active.filter((c) => c.type === "BUSINESS").length;
    const individual = active.filter((c) => c.type === "INDIVIDUAL").length;

    // 이번 달 신규 — createdAt 기반
    const now = new Date();
    const thisMonth = now.getFullYear() * 100 + now.getMonth();
    const newThisMonth = active.filter((c) => {
      if (!c.createdAt) return false;
      const d = new Date(c.createdAt);
      return d.getFullYear() * 100 + d.getMonth() === thisMonth;
    }).length;

    return {
      total: active.length,
      individual,
      business,
      newThisMonth,
    };
  }, [all]);

  const rows = useMemo(() => {
    let r = all;
    if (statusFilter === "active") r = r.filter((c) => c.isActive);
    if (statusFilter === "inactive") r = r.filter((c) => !c.isActive);
    if (typeFilter !== "all") r = r.filter((c) => c.type === typeFilter);
    return r;
  }, [all, typeFilter, statusFilter]);

  const counts: Record<TypeFilter, number> = useMemo(() => {
    const base = all.filter((c) =>
      statusFilter === "all"
        ? true
        : statusFilter === "active"
          ? c.isActive
          : !c.isActive,
    );
    return {
      all: base.length,
      INDIVIDUAL: base.filter((c) => c.type === "INDIVIDUAL").length,
      BUSINESS: base.filter((c) => c.type === "BUSINESS").length,
    };
  }, [all, statusFilter]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/customers/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("고객이 비활성화되었습니다");
      invalidate();
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError ? err.message : "비활성화에 실패했습니다",
      );
    },
  });

  const openCreate = () => {
    setEditTarget(null);
    setSheetOpen(true);
  };
  const openEdit = (c: Customer) => {
    setEditTarget(c);
    setSheetOpen(true);
  };

  const isPending = customersQuery.isPending;
  const isError = customersQuery.isError;

  return (
    <CustomersThemeScope>
      <JmTooltipProvider>
        <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
          <div className="flex w-full flex-col gap-6 p-4">
          {/* KPI */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <JmStat
              label="전체 고객"
              value={isPending ? "—" : stats.total.toLocaleString("ko-KR")}
              icon={<Users className="size-4" />}
              hint={isPending ? "" : "활성 기준"}
              size="sm"
            />
            <JmStat
              label="개인"
              value={isPending ? "—" : stats.individual.toLocaleString("ko-KR")}
              icon={<User className="size-4" />}
              hint={
                isPending || stats.total === 0
                  ? ""
                  : `${Math.round((stats.individual / stats.total) * 100)}%`
              }
              size="sm"
            />
            <JmStat
              label="기업"
              value={isPending ? "—" : stats.business.toLocaleString("ko-KR")}
              icon={<Building2 className="size-4" />}
              hint={
                isPending || stats.total === 0
                  ? ""
                  : `${Math.round((stats.business / stats.total) * 100)}%`
              }
              size="sm"
            />
            <JmStat
              label="이번 달 신규"
              value={isPending ? "—" : stats.newThisMonth.toLocaleString("ko-KR")}
              icon={<Plus className="size-4" />}
              hint={isPending ? "" : "신규 등록"}
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
                  placeholder="이름·연락처·사업자번호"
                />
              </JmTableToolbarSearch>
              <JmTableToolbarFilters>
                {(Object.keys(TYPE_FILTER_LABELS) as TypeFilter[]).map((t) => (
                  <JmPill
                    key={t}
                    size="sm"
                    active={typeFilter === t}
                    onClick={() => setTypeFilter(t)}
                  >
                    {TYPE_FILTER_LABELS[t]}
                    <span className="ml-1 tabular-nums opacity-70">
                      {counts[t]}
                    </span>
                  </JmPill>
                ))}
                <span className="mx-1 h-4 w-px bg-[var(--jm-border)]" />
                <JmPill
                  size="sm"
                  active={statusFilter === "active"}
                  onClick={() => setStatusFilter("active")}
                >
                  활성
                </JmPill>
                <JmPill
                  size="sm"
                  active={statusFilter === "inactive"}
                  onClick={() => setStatusFilter("inactive")}
                >
                  비활성
                </JmPill>
                <JmPill
                  size="sm"
                  active={statusFilter === "all"}
                  onClick={() => setStatusFilter("all")}
                >
                  모두
                </JmPill>
              </JmTableToolbarFilters>
              <JmTableToolbarActions>
                <JmIconButton
                  variant="ghost"
                  size="sm"
                  aria-label="새로고침"
                  onClick={() => customersQuery.refetch()}
                  disabled={customersQuery.isFetching}
                >
                  {customersQuery.isFetching ? (
                    <JmSpinner size="sm" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                </JmIconButton>
                <JmButton size="sm" onClick={openCreate}>
                  <Plus className="size-4" />
                  고객 추가
                </JmButton>
              </JmTableToolbarActions>
            </JmTableToolbar>

            <JmTable className="min-w-[1100px]">
                <JmTableHeader>
                  <JmTableRow>
                    <JmTableHead className="w-[88px]">구분</JmTableHead>
                    <JmTableHead>이름 / 상호</JmTableHead>
                    <JmTableHead className="w-[140px]">연락처</JmTableHead>
                    <JmTableHead className="w-[140px]">사업자번호</JmTableHead>
                    <JmTableHead className="w-[100px]">대표자</JmTableHead>
                    <JmTableHead>이메일</JmTableHead>
                    <JmTableHead className="w-[80px]">상태</JmTableHead>
                    <JmTableHead className="w-[160px] text-right">
                      관리
                    </JmTableHead>
                  </JmTableRow>
                </JmTableHeader>
                <JmTableBody>
                  {isPending ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <CustomerRowSkeleton key={i} />
                    ))
                  ) : isError ? (
                    <JmTableRow className="hover:bg-transparent">
                      <JmTableCell
                        colSpan={8}
                        className="py-10 text-center text-[var(--jm-danger-fg)]"
                      >
                        고객 목록을 불러오지 못했습니다
                      </JmTableCell>
                    </JmTableRow>
                  ) : rows.length === 0 ? (
                    <JmTableRow className="hover:bg-transparent">
                      <JmTableCell colSpan={8} className="py-12">
                        <JmEmpty
                          icon={<Users className="size-8" />}
                          title={
                            appliedSearch
                              ? "검색 결과가 없습니다"
                              : "등록된 고객이 없습니다"
                          }
                          description={
                            appliedSearch
                              ? "다른 검색어를 시도하거나 새 고객을 추가하세요"
                              : "첫 고객을 추가해 거래·수리·임대 이력을 한곳에 모아보세요"
                          }
                          action={
                            !appliedSearch ? (
                              <JmButton size="sm" onClick={openCreate}>
                                <Plus className="size-4" />
                                고객 추가
                              </JmButton>
                            ) : null
                          }
                        />
                      </JmTableCell>
                    </JmTableRow>
                  ) : (
                    rows.map((c) => (
                      <JmTableRow
                        key={c.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/customers/${c.id}`)}
                      >
                        <JmTableCell>
                          <CustomerTypeBadge type={c.type} />
                        </JmTableCell>
                        <JmTableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-[var(--jm-text)]">
                              {c.name}
                            </span>
                            {c.type === "BUSINESS" && c.ceo && (
                              <span className="text-[11px] text-[var(--jm-text-muted)]">
                                대표 {c.ceo}
                                {c.businessType && ` · ${c.businessType}`}
                              </span>
                            )}
                          </div>
                        </JmTableCell>
                        <JmTableCell className="tabular-nums">
                          {formatPhone(c.phone)}
                        </JmTableCell>
                        <JmTableCell className="tabular-nums text-[var(--jm-text-muted)]">
                          {c.businessNumber
                            ? formatBusinessNumber(c.businessNumber)
                            : "—"}
                        </JmTableCell>
                        <JmTableCell className="text-[var(--jm-text-muted)]">
                          {c.ceo || "—"}
                        </JmTableCell>
                        <JmTableCell className="text-[var(--jm-text-muted)]">
                          {c.email || "—"}
                        </JmTableCell>
                        <JmTableCell>
                          <CustomerStatusBadge active={c.isActive} />
                        </JmTableCell>
                        <JmTableCell>
                          <div
                            className="flex items-center justify-end gap-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <JmTooltip content="원장 보기">
                              <JmIconButton
                                variant="ghost"
                                size="sm"
                                aria-label="원장 보기"
                                onClick={() =>
                                  router.push(
                                    `/customers/ledger?customerId=${c.id}`,
                                  )
                                }
                              >
                                <FileText className="size-4" />
                              </JmIconButton>
                            </JmTooltip>
                            <JmTooltip content="수정">
                              <JmIconButton
                                variant="ghost"
                                size="sm"
                                aria-label="수정"
                                onClick={() => openEdit(c)}
                              >
                                <Pencil className="size-4" />
                              </JmIconButton>
                            </JmTooltip>
                            {c.isActive && (
                              <JmTooltip content="비활성화">
                                <JmIconButton
                                  variant="ghost"
                                  size="sm"
                                  aria-label="비활성화"
                                  onClick={() => setDeleteTarget(c)}
                                >
                                  <Trash2 className="size-4" />
                                </JmIconButton>
                              </JmTooltip>
                            )}
                            <ChevronRight className="size-4 shrink-0 text-[var(--jm-text-subtle)]" />
                          </div>
                        </JmTableCell>
                      </JmTableRow>
                    ))
                  )}
                </JmTableBody>
                </JmTable>
            </JmCard>
          </div>

          <CustomerSheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            editTarget={editTarget}
            onSaved={invalidate}
          />

          <JmDialog
            open={!!deleteTarget}
            onOpenChange={(v) => !v && setDeleteTarget(null)}
          >
            <JmDialogContent size="sm">
              <JmDialogHeader>
                <JmDialogTitle>고객 비활성화</JmDialogTitle>
              </JmDialogHeader>
              <JmDialogBody>
                <p className="text-jm-sm text-[var(--jm-text)]">
                  <span className="font-semibold">{deleteTarget?.name}</span>{" "}
                  고객을 비활성화 합니다.
                </p>
                <p className="mt-2 text-jm-xs text-[var(--jm-text-muted)]">
                  비활성화한 고객은 목록 상단에서 숨겨지고, 신규 거래·견적에
                  선택할 수 없습니다. 기존 거래 이력과 원장은 그대로 유지됩니다.
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
                  비활성화
                </JmButton>
              </JmDialogFooter>
            </JmDialogContent>
          </JmDialog>
        </div>
      </JmTooltipProvider>
    </CustomersThemeScope>
  );
}
