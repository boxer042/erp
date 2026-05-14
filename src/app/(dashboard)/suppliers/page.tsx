"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { Eye, Loader2, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { apiGet, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { PAYMENT_METHODS } from "@/lib/constants";
import { QuickSupplierSheet } from "@/components/quick-register-sheets";
import {
  JmBadge,
  JmButton,
  JmIconButton,
  JmScope,
  JmSkeleton,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
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
      <div className="flex h-full flex-col bg-[var(--jm-bg)]">
        {/* 툴바 */}
        <div className="flex items-center gap-2 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-4 py-2 shrink-0">
          <div className="flex flex-1 items-center gap-1.5 h-8 max-w-[320px] rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface)] px-2.5">
            <Search className="size-3.5 text-[var(--jm-text-muted)] shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSearch();
              }}
              placeholder="거래처명 또는 사업자번호로 검색"
              className="flex-1 bg-transparent text-jm-sm outline-none placeholder:text-[var(--jm-text-muted)] text-[var(--jm-text)]"
            />
          </div>
          <JmIconButton
            aria-label="새로고침"
            onClick={() => suppliersQuery.refetch()}
            disabled={loading}
            size="sm"
            variant="ghost"
          >
            <RefreshCw className={refreshing ? "animate-spin" : ""} />
          </JmIconButton>
          <div className="ml-auto">
            <JmButton size="sm" variant="cta" onClick={openCreate}>
              <Plus />
              <span>거래처 추가</span>
            </JmButton>
          </div>
        </div>

        {/* 테이블 */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <JmTable className="min-w-[800px]">
            <JmTableHeader className="sticky top-0 z-10">
              <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">거래처명</JmTableHead>
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">사업자번호</JmTableHead>
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">대표자</JmTableHead>
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">전화번호</JmTableHead>
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">결제방식</JmTableHead>
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">상태</JmTableHead>
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-[120px]">관리</JmTableHead>
              </JmTableRow>
            </JmTableHeader>
            <JmTableBody>
              {loading ? (
                <SuppliersSkeletonRows />
              ) : suppliers.length === 0 ? (
                <JmTableRow className="hover:bg-transparent">
                  <JmTableCell colSpan={7} className="text-center py-10 text-[var(--jm-text-muted)] text-sm">
                    {appliedSearch ? (
                      <>
                        <span className="text-[var(--jm-text)] font-medium">
                          &ldquo;{appliedSearch}&rdquo;
                        </span>{" "}
                        에 해당하는 거래처가 없습니다
                      </>
                    ) : (
                      "등록된 거래처가 없습니다"
                    )}
                  </JmTableCell>
                </JmTableRow>
              ) : (
                suppliers.map((supplier) => (
                  <JmTableRow key={supplier.id}>
                    <JmTableCell className="font-medium px-3 py-2 text-[var(--jm-text)]">
                      {supplier.name}
                    </JmTableCell>
                    <JmTableCell className="px-3 py-2 text-[var(--jm-text-muted)] tabular-nums">
                      {supplier.businessNumber || "-"}
                    </JmTableCell>
                    <JmTableCell className="px-3 py-2 text-[var(--jm-text-muted)]">
                      {supplier.representative || "-"}
                    </JmTableCell>
                    <JmTableCell className="px-3 py-2 text-[var(--jm-text-muted)]">
                      {supplier.phone || "-"}
                    </JmTableCell>
                    <JmTableCell className="px-3 py-2">
                      <JmBadge
                        variant={supplier.paymentMethod === "CREDIT" ? "danger" : "default"}
                        size="sm"
                        shape="square"
                      >
                        {paymentLabel(supplier.paymentMethod)}
                      </JmBadge>
                    </JmTableCell>
                    <JmTableCell className="px-3 py-2">
                      <JmBadge
                        variant={supplier.isActive ? "success" : "default"}
                        size="sm"
                        shape="square"
                      >
                        {supplier.isActive ? "활성" : "비활성"}
                      </JmBadge>
                    </JmTableCell>
                    <JmTableCell className="px-3 py-2">
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
