"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Pencil, Trash2, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PAYMENT_METHODS } from "@/lib/constants";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { QuickSupplierSheet } from "@/components/quick-register-sheets";
import { apiGet, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { Skeleton } from "@/components/ui/skeleton";

function SuppliersSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-5 w-12 rounded-full" /></TableCell>
          <TableCell><Skeleton className="h-5 w-10 rounded-full" /></TableCell>
          <TableCell>
            <div className="flex gap-1">
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

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

export default function SuppliersPage() {
  const queryClient = useQueryClient();
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
    <>
      <div className="flex h-full flex-col">
        <DataTableToolbar
          search={{
            value: search,
            onChange: setSearch,
            onSearch: handleSearch,
            placeholder: "거래처명 또는 사업자번호로 검색",
          }}
          onRefresh={() => suppliersQuery.refetch()}
          onAdd={openCreate}
          addLabel="거래처 추가"
          loading={loading}
        />
        <ScrollArea className="flex-1 min-h-0">
          <Table className="min-w-[800px]">
            <TableHeader>
              <TableRow>
                <TableHead>거래처명</TableHead>
                <TableHead>사업자번호</TableHead>
                <TableHead>대표자</TableHead>
                <TableHead>전화번호</TableHead>
                <TableHead>결제방식</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="w-[120px]">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <SuppliersSkeletonRows />
              ) : suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    등록된 거래처가 없습니다
                  </TableCell>
                </TableRow>
              ) : (
                suppliers.map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell className="font-medium">
                      {supplier.name}
                    </TableCell>
                    <TableCell>{supplier.businessNumber || "-"}</TableCell>
                    <TableCell>{supplier.representative || "-"}</TableCell>
                    <TableCell>{supplier.phone || "-"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          supplier.paymentMethod === "CREDIT"
                            ? "destructive"
                            : "default"
                        }
                      >
                        {paymentLabel(supplier.paymentMethod)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={supplier.isActive ? "default" : "secondary"}
                      >
                        {supplier.isActive ? "활성" : "비활성"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Link href={`/suppliers/${supplier.id}`}>
                          <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(supplier)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(supplier.id)}
                          disabled={deleteMutation.isPending && deleteMutation.variables === supplier.id}
                        >
                          {deleteMutation.isPending && deleteMutation.variables === supplier.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      <QuickSupplierSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editData={editData}
        onCreated={invalidate}
        onUpdated={invalidate}
      />
    </>
  );
}
