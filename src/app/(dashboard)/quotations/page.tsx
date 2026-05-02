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
import { Pencil, Trash2, FileText } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { QuotationSheet, type QuotationFormData } from "@/components/quotation-sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Printer, FileDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

function QuotationsSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16 rounded-md" /></TableCell>
          <TableCell><div className="flex justify-end"><Skeleton className="h-4 w-20" /></div></TableCell>
          <TableCell><div className="flex gap-1"><Skeleton className="h-8 w-8 rounded-md" /><Skeleton className="h-8 w-8 rounded-md" /></div></TableCell>
        </TableRow>
      ))}
    </>
  );
}

type QuotationType = "SALES" | "PURCHASE";
type QuotationStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "CONVERTED";

interface QuotationRow {
  id: string;
  quotationNo: string;
  type: QuotationType;
  status: QuotationStatus;
  issueDate: string;
  validUntil: string | null;
  title: string | null;
  totalAmount: string;
  customer: { id: string; name: string } | null;
  supplier: { id: string; name: string } | null;
  _count: { items: number };
}

const STATUS_LABEL: Record<QuotationStatus, string> = {
  DRAFT: "초안",
  SENT: "발송",
  ACCEPTED: "수락",
  REJECTED: "거절",
  EXPIRED: "만료",
  CONVERTED: "전환",
};

const STATUS_VARIANT: Record<QuotationStatus, "default" | "secondary" | "destructive" | "outline" | "warning" | "success"> = {
  DRAFT: "secondary",
  SENT: "warning",
  ACCEPTED: "success",
  REJECTED: "destructive",
  EXPIRED: "secondary",
  CONVERTED: "default",
};

interface QuotationDetail {
  id: string;
  type: QuotationType;
  status: QuotationStatus;
  issueDate: string;
  validUntil: string | null;
  customerId: string | null;
  supplierId: string | null;
  title: string | null;
  memo: string | null;
  terms: string | null;
  items: Array<{
    productId: string | null;
    supplierProductId: string | null;
    name: string;
    spec: string | null;
    unitOfMeasure: string;
    quantity: string;
    listPrice: string;
    discountAmount: string;
    unitPrice: string;
    isTaxable: boolean;
    isZeroRateEligible?: boolean;
    memo: string | null;
  }>;
}

export default function QuotationsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<QuotationType>("SALES");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editData, setEditData] = useState<QuotationFormData | null>(null);
  const [printDialogId, setPrintDialogId] = useState<string | null>(null);

  const quotationsQuery = useQuery({
    queryKey: queryKeys.quotations.list({ type: tab, search: appliedSearch }),
    queryFn: () => apiGet<QuotationRow[]>(`/api/quotations?type=${tab}&search=${encodeURIComponent(appliedSearch)}`),
  });
  const quotations = quotationsQuery.data ?? [];
  const loading = quotationsQuery.isPending;
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.quotations.all });

  const openCreate = () => {
    setEditData(null);
    setSheetOpen(true);
  };

  const openEdit = async (row: QuotationRow) => {
    let q: QuotationDetail;
    try {
      q = await apiGet<QuotationDetail>(`/api/quotations/${row.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "견적서 정보를 불러오지 못했습니다");
      return;
    }
    setEditData({
      id: q.id,
      type: q.type,
      status: q.status,
      issueDate: (q.issueDate as string).slice(0, 10),
      validUntil: q.validUntil ? (q.validUntil as string).slice(0, 10) : "",
      customerId: q.customerId || "",
      supplierId: q.supplierId || "",
      title: q.title || "",
      memo: q.memo || "",
      terms: q.terms || "",
      items: q.items.map((it) => ({
        rowType: (it.productId || it.supplierProductId) ? ("product" as const) : ("free" as const),
        productId: it.productId,
        supplierProductId: it.supplierProductId,
        name: it.name,
        spec: it.spec || "",
        unitOfMeasure: it.unitOfMeasure,
        quantity: it.quantity,
        // 단가는 "할인 전" 가격으로 로드. listPrice가 0이면 unitPrice로 대체 (구버전 데이터).
        unitPrice: parseFloat(it.listPrice) > 0 ? it.listPrice : it.unitPrice,
        discount: parseFloat(it.discountAmount) > 0 ? it.discountAmount : "",
        isTaxable: it.isTaxable,
        isZeroRateEligible: it.isZeroRateEligible ?? false,
        memo: it.memo || "",
      })),
    });
    setSheetOpen(true);
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/quotations/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("견적서가 삭제되었습니다");
      refresh();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "삭제에 실패했습니다"),
  });

  const handleDelete = (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    deleteMutation.mutate(id);
  };

  return (
    <>
      <div className="flex h-full flex-col">
        <div className="border-b border-border px-5 py-2.5 flex items-center gap-3">
          <div className="flex h-[30px] rounded-md border border-border bg-card text-[13px]">
            <button
              className={cn("px-3 h-full rounded-md", tab === "SALES" ? "bg-secondary text-foreground" : "text-muted-foreground")}
              onClick={() => setTab("SALES")}
            >
              판매
            </button>
            <button
              className={cn("px-3 h-full rounded-md", tab === "PURCHASE" ? "bg-secondary text-foreground" : "text-muted-foreground")}
              onClick={() => setTab("PURCHASE")}
            >
              매입
            </button>
          </div>
        </div>
        <DataTableToolbar
          search={{
            value: search,
            onChange: setSearch,
            onSearch: () => setAppliedSearch(search),
            placeholder: "견적번호 / 제목 / 상대방 검색",
          }}
          onRefresh={refresh}
          onAdd={openCreate}
          addLabel="견적서 작성"
          loading={loading}
        />
        <ScrollArea className="flex-1 min-h-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>견적번호</TableHead>
                <TableHead>{tab === "SALES" ? "고객" : "거래처"}</TableHead>
                <TableHead>제목</TableHead>
                <TableHead>견적일자</TableHead>
                <TableHead>유효기간</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">합계</TableHead>
                <TableHead className="w-[130px]">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <QuotationsSkeletonRows />
              ) : quotations.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8">등록된 견적서가 없습니다</TableCell></TableRow>
              ) : (
                quotations.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-medium font-mono text-xs">{q.quotationNo}</TableCell>
                    <TableCell>{tab === "SALES" ? q.customer?.name || "-" : q.supplier?.name || "-"}</TableCell>
                    <TableCell>{q.title || "-"}</TableCell>
                    <TableCell>{q.issueDate.slice(0, 10)}</TableCell>
                    <TableCell>{q.validUntil ? q.validUntil.slice(0, 10) : "-"}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[q.status]}>{STATUS_LABEL[q.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      ₩{Math.round(parseFloat(q.totalAmount)).toLocaleString("ko-KR")}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Link href={`/quotations/${q.id}/print`} target="_blank">
                          <Button variant="ghost" size="icon"><FileText className="h-4 w-4" /></Button>
                        </Link>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(q)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(q.id)}>
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

      <QuotationSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        type={tab}
        editData={editData}
        onSaved={(id) => {
          refresh();
          if (id) setPrintDialogId(id);
        }}
      />

      <Dialog open={!!printDialogId} onOpenChange={(v) => { if (!v) setPrintDialogId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>저장되었습니다</DialogTitle>
            <DialogDescription>작성한 견적서를 바로 출력할까요?</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setPrintDialogId(null)}>닫기</Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (printDialogId) window.open(`/quotations/${printDialogId}/print?auto=1`, "_blank");
                setPrintDialogId(null);
              }}
            >
              <FileDown className="h-4 w-4 mr-1.5" /> PDF 다운로드
            </Button>
            <Button
              onClick={() => {
                if (printDialogId) window.open(`/quotations/${printDialogId}/print?auto=1`, "_blank");
                setPrintDialogId(null);
              }}
            >
              <Printer className="h-4 w-4 mr-1.5" /> 인쇄
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
