"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { QuickCustomerSheet, type CustomerFormData } from "@/components/quick-register-sheets";
import { formatPhone, formatBusinessNumber } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

function CustomersSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
          <TableCell><Skeleton className="h-5 w-12 rounded-md" /></TableCell>
          <TableCell><div className="flex gap-1"><Skeleton className="h-8 w-8 rounded-md" /><Skeleton className="h-8 w-8 rounded-md" /></div></TableCell>
        </TableRow>
      ))}
    </>
  );
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  businessNumber: string | null;
  ceo: string | null;
  email: string | null;
  address: string | null;
  memo: string | null;
  isActive: boolean;
}

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editData, setEditData] = useState<CustomerFormData | null>(null);

  const customersQuery = useQuery({
    queryKey: queryKeys.customers.list({ search: appliedSearch }),
    queryFn: () => apiGet<Customer[]>(`/api/customers?search=${encodeURIComponent(appliedSearch)}`),
  });

  const customers = customersQuery.data ?? [];
  const loading = customersQuery.isPending;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/customers/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("고객이 비활성화되었습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "삭제에 실패했습니다"),
  });

  const openCreate = () => {
    setEditData(null);
    setSheetOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditData({
      id: c.id,
      name: c.name,
      phone: c.phone,
      businessNumber: c.businessNumber || "",
      ceo: c.ceo || "",
      email: c.email || "",
      address: c.address || "",
      memo: c.memo || "",
    });
    setSheetOpen(true);
  };

  const handleDelete = (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    deleteMutation.mutate(id);
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });

  return (
    <>
      <div className="flex h-full flex-col">
        <DataTableToolbar
          search={{
            value: search,
            onChange: setSearch,
            onSearch: () => setAppliedSearch(search),
            placeholder: "고객명 / 연락처 / 사업자번호 검색",
          }}
          onRefresh={refresh}
          onAdd={openCreate}
          addLabel="고객 추가"
          loading={loading}
        />
        <ScrollArea className="flex-1 min-h-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>고객명</TableHead>
                <TableHead>연락처</TableHead>
                <TableHead>사업자번호</TableHead>
                <TableHead>대표자</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="w-[120px]">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <CustomersSkeletonRows />
              ) : customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">등록된 고객이 없습니다</TableCell>
                </TableRow>
              ) : (
                customers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{formatPhone(c.phone)}</TableCell>
                    <TableCell>{c.businessNumber ? formatBusinessNumber(c.businessNumber) : "-"}</TableCell>
                    <TableCell>{c.ceo || "-"}</TableCell>
                    <TableCell>{c.email || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={c.isActive ? "success" : "secondary"}>
                        {c.isActive ? "활성" : "비활성"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}>
                          <Trash2 className="h-4 w-4" />
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

      <QuickCustomerSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editData={editData}
        onCreated={refresh}
        onUpdated={refresh}
      />
    </>
  );
}
