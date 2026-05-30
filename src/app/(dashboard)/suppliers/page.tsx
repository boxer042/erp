"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { Building2, Eye, Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { apiGet, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { PAYMENT_METHODS } from "@/lib/constants";
import { QuickSupplierSheet } from "@/components/quick-register-sheets";
import {
  JmBadge,
  JmButton,
  JmCard,
  JmEmpty,
  JmIconButton,
  JmScope,
  JmSearchInput,
  JmSkeleton,
  JmSpinner,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
  JmTableToolbar,
  JmTableToolbarActions,
  JmTableToolbarSearch,
} from "@/jm";

interface SupplierContact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  position: string | null;
  memo: string | null;
}

interface Supplier {
  id: string;
  name: string;
  businessNumber: string | null;
  representative: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  address: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
  paymentMethod: "CREDIT" | "PREPAID";
  paymentTermDays: number;
  memo: string | null;
  isActive: boolean;
  contacts?: SupplierContact[];
}

function SuppliersSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <JmTableRow key={i} className="hover:bg-transparent">
          <JmTableCell><JmSkeleton className="h-4 w-32" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-28" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-20" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-28" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-5 w-12 rounded-md" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-5 w-10 rounded-md" /></JmTableCell>
          <JmTableCell>
            <div className="flex gap-1">
              <JmSkeleton className="h-8 w-8 rounded-md" />
              <JmSkeleton className="h-8 w-8 rounded-md" />
              <JmSkeleton className="h-8 w-8 rounded-md" />
            </div>
          </JmTableCell>
        </JmTableRow>
      ))}
    </>
  );
}

export default function SuppliersPage() {
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editData, setEditData] = useState<Parameters<typeof QuickSupplierSheet>[0]["editData"]>(null);

  const suppliersQuery = useQuery({
    queryKey: queryKeys.suppliers.list({ search: appliedSearch }),
    queryFn: () => apiGet<Supplier[]>(`/api/suppliers?search=${encodeURIComponent(appliedSearch)}`),
  });

  const suppliers = suppliersQuery.data ?? [];
  const loading = suppliersQuery.isPending;
  const refreshing = suppliersQuery.isFetching && !loading;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/suppliers/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("거래처가 비활성화되었습니다");
      invalidate();
    },
    onError: () => toast.error("삭제에 실패했습니다"),
  });

  const handleSearch = () => setAppliedSearch(search);

  const openCreate = () => {
    setEditData(null);
    setSheetOpen(true);
  };

  const openEdit = (supplier: Supplier) => {
    setEditData({
      id: supplier.id,
      name: supplier.name,
      businessNumber: supplier.businessNumber || "",
      representative: supplier.representative || "",
      phone: supplier.phone || "",
      fax: supplier.fax || "",
      email: supplier.email || "",
      address: supplier.address || "",
      bankName: supplier.bankName || "",
      bankAccount: supplier.bankAccount || "",
      bankHolder: supplier.bankHolder || "",
      paymentMethod: supplier.paymentMethod,
      paymentTermDays: supplier.paymentTermDays,
      memo: supplier.memo || "",
      contacts: (supplier.contacts || []).map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone || "",
        email: c.email || "",
        position: c.position || "",
        memo: c.memo || "",
      })),
    });
    setSheetOpen(true);
  };

  const handleDelete = (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    deleteMutation.mutate(id);
  };

  const paymentLabel = (method: string) =>
    PAYMENT_METHODS.find((m) => m.value === method)?.label || method;

  return (
    <JmScope theme={resolvedTheme === "dark" ? "dark" : "light"} className="contents">
      <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
        <div className="flex w-full flex-col gap-6 p-4">
          {/* 메인 카드 — 툴바 + 테이블 */}
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
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSearch();
                  }}
                  placeholder="거래처명 또는 사업자번호로 검색"
                />
              </JmTableToolbarSearch>
              <JmTableToolbarActions>
                <JmIconButton
                  aria-label="새로고침"
                  onClick={() => suppliersQuery.refetch()}
                  disabled={loading}
                  size="sm"
                  variant="ghost"
                >
                  {refreshing ? <JmSpinner size="sm" /> : <RefreshCw className="size-4" />}
                </JmIconButton>
                <JmButton size="sm" variant="cta" onClick={openCreate}>
                  <Plus className="size-4" />
                  <span>거래처 추가</span>
                </JmButton>
              </JmTableToolbarActions>
            </JmTableToolbar>

            <JmTable className="min-w-[800px]">
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead>거래처명</JmTableHead>
                  <JmTableHead>사업자번호</JmTableHead>
                  <JmTableHead>대표자</JmTableHead>
                  <JmTableHead>전화번호</JmTableHead>
                  <JmTableHead>결제방식</JmTableHead>
                  <JmTableHead>상태</JmTableHead>
                  <JmTableHead className="w-[120px]">관리</JmTableHead>
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {loading ? (
                  <SuppliersSkeletonRows />
                ) : suppliers.length === 0 ? (
                  <JmTableRow className="hover:bg-transparent">
                    <JmTableCell colSpan={7} className="py-12">
                      <JmEmpty
                        icon={<Building2 className="size-8" />}
                        title={
                          appliedSearch
                            ? `"${appliedSearch}" 검색 결과 없음`
                            : "등록된 거래처가 없습니다"
                        }
                        description={
                          appliedSearch
                            ? "검색어를 바꾸거나 새 거래처를 등록해보세요"
                            : "거래처를 등록하면 공급상품·입고·발주에서 사용할 수 있습니다"
                        }
                      />
                    </JmTableCell>
                  </JmTableRow>
                ) : (
                  suppliers.map((supplier) => (
                    <JmTableRow key={supplier.id}>
                      <JmTableCell className="font-medium text-[var(--jm-text)]">
                        {supplier.name}
                      </JmTableCell>
                      <JmTableCell className="text-[var(--jm-text-muted)] tabular-nums">
                        {supplier.businessNumber || "-"}
                      </JmTableCell>
                      <JmTableCell className="text-[var(--jm-text-muted)]">
                        {supplier.representative || "-"}
                      </JmTableCell>
                      <JmTableCell className="text-[var(--jm-text-muted)]">
                        {supplier.phone || "-"}
                      </JmTableCell>
                      <JmTableCell>
                        <JmBadge
                          variant={supplier.paymentMethod === "CREDIT" ? "danger" : "default"}
                          size="sm"
                          shape="square"
                        >
                          {paymentLabel(supplier.paymentMethod)}
                        </JmBadge>
                      </JmTableCell>
                      <JmTableCell>
                        <JmBadge
                          variant={supplier.isActive ? "success" : "default"}
                          size="sm"
                          shape="square"
                        >
                          {supplier.isActive ? "활성" : "비활성"}
                        </JmBadge>
                      </JmTableCell>
                      <JmTableCell>
                        <div className="flex gap-1">
                          <Link href={`/suppliers/${supplier.id}`}>
                            <JmIconButton aria-label="상세 보기" size="sm" variant="ghost">
                              <Eye />
                            </JmIconButton>
                          </Link>
                          <JmIconButton
                            aria-label="수정"
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(supplier)}
                          >
                            <Pencil />
                          </JmIconButton>
                          <JmIconButton
                            aria-label="삭제"
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(supplier.id)}
                            disabled={deleteMutation.isPending && deleteMutation.variables === supplier.id}
                          >
                            {deleteMutation.isPending && deleteMutation.variables === supplier.id ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <Trash2 />
                            )}
                          </JmIconButton>
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

      <QuickSupplierSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editData={editData}
        onCreated={invalidate}
        onUpdated={invalidate}
      />
    </JmScope>
  );
}
