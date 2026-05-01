"use client";

import { useEffect, useState } from "react";
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
import { StatementSheet, type StatementFormData } from "@/components/statement-sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Printer, FileDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

function StatementsSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-5 w-12 rounded-md" /></TableCell>
          <TableCell><div className="flex justify-end"><Skeleton className="h-4 w-20" /></div></TableCell>
          <TableCell><div className="flex gap-1"><Skeleton className="h-8 w-8 rounded-md" /><Skeleton className="h-8 w-8 rounded-md" /></div></TableCell>
        </TableRow>
      ))}
    </>
  );
}

type StatementStatus = "DRAFT" | "ISSUED" | "CANCELLED";

interface StatementRow {
  id: string;
  statementNo: string;
  status: StatementStatus;
  issueDate: string;
  totalAmount: string;
  customer: { id: string; name: string } | null;
  customerNameSnapshot: string | null;
  order: { id: string; orderNo: string } | null;
  quotation: { id: string; quotationNo: string } | null;
  _count: { items: number };
}

const STATUS_LABEL: Record<StatementStatus, string> = {
  DRAFT: "초안",
  ISSUED: "발행",
  CANCELLED: "취소",
};
const STATUS_VARIANT: Record<StatementStatus, "default" | "secondary" | "destructive" | "success"> = {
  DRAFT: "secondary",
  ISSUED: "success",
  CANCELLED: "destructive",
};

export default function StatementsPage() {
  const [statements, setStatements] = useState<StatementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editData, setEditData] = useState<StatementFormData | null>(null);
  const [printDialogId, setPrintDialogId] = useState<string | null>(null);

  const fetchStatements = async (q = search) => {
    setLoading(true);
    const res = await fetch(`/api/statements?search=${encodeURIComponent(q)}`);
    const data = await res.json();
    setStatements(data);
    setLoading(false);
  };

  useEffect(() => { fetchStatements(); }, []);

  const openCreate = () => {
    setEditData(null);
    setSheetOpen(true);
  };

  const openEdit = async (row: StatementRow) => {
    const res = await fetch(`/api/statements/${row.id}`);
    if (!res.ok) return toast.error("거래명세표를 불러오지 못했습니다");
    const s = await res.json();
    setEditData({
      id: s.id,
      status: s.status,
      issueDate: (s.issueDate as string).slice(0, 10),
      customerId: s.customerId || "",
      customerNameSnapshot: s.customerNameSnapshot || "",
      customerPhoneSnapshot: s.customerPhoneSnapshot || "",
      customerAddressSnapshot: s.customerAddressSnapshot || "",
      customerBusinessNumberSnapshot: s.customerBusinessNumberSnapshot || "",
      orderId: s.orderId || "",
      quotationId: s.quotationId || "",
      memo: s.memo || "",
      items: s.items.map((it: {
        productId: string | null;
        name: string;
        spec: string | null;
        unitOfMeasure: string;
        quantity: string;
        listPrice: string;
        discountAmount: string;
        unitPrice: string;
        isTaxable: boolean;
        memo: string | null;
      }) => ({
        rowType: it.productId ? ("product" as const) : ("free" as const),
        productId: it.productId,
        name: it.name,
        spec: it.spec || "",
        unitOfMeasure: it.unitOfMeasure,
        quantity: it.quantity,
        unitPrice: parseFloat(it.listPrice) > 0 ? it.listPrice : it.unitPrice,
        discount: parseFloat(it.discountAmount) > 0 ? it.discountAmount : "",
        isTaxable: it.isTaxable,
        memo: it.memo || "",
      })),
    });
    setSheetOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    const res = await fetch(`/api/statements/${id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("삭제에 실패했습니다");
    toast.success("거래명세표가 삭제되었습니다");
    fetchStatements();
  };

  return (
    <>
      <div className="flex h-full flex-col">
        <DataTableToolbar
          search={{
            value: search,
            onChange: setSearch,
            onSearch: () => fetchStatements(search),
            placeholder: "명세표번호 / 고객 검색",
          }}
          onRefresh={() => fetchStatements(search)}
          onAdd={openCreate}
          addLabel="거래명세표 작성"
          loading={loading}
        />
        <ScrollArea className="flex-1 min-h-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>명세표번호</TableHead>
                <TableHead>고객</TableHead>
                <TableHead>발행일자</TableHead>
                <TableHead>원본</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">합계</TableHead>
                <TableHead className="w-[130px]">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <StatementsSkeletonRows />
              ) : statements.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">등록된 거래명세표가 없습니다</TableCell></TableRow>
              ) : (
                statements.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium font-mono text-xs">{s.statementNo}</TableCell>
                    <TableCell>{s.customer?.name || s.customerNameSnapshot || "-"}</TableCell>
                    <TableCell>{s.issueDate.slice(0, 10)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {s.order ? s.order.orderNo : s.quotation ? s.quotation.quotationNo : "-"}
                    </TableCell>
                    <TableCell><Badge variant={STATUS_VARIANT[s.status]}>{STATUS_LABEL[s.status]}</Badge></TableCell>
                    <TableCell className="text-right font-medium">₩{Math.round(parseFloat(s.totalAmount)).toLocaleString("ko-KR")}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Link href={`/statements/${s.id}/print`} target="_blank">
                          <Button variant="ghost" size="icon"><FileText className="h-4 w-4" /></Button>
                        </Link>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)}>
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

      <StatementSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editData={editData}
        onSaved={(id) => {
          fetchStatements(search);
          if (id) setPrintDialogId(id);
        }}
      />

      <Dialog open={!!printDialogId} onOpenChange={(v) => { if (!v) setPrintDialogId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>저장되었습니다</DialogTitle>
            <DialogDescription>작성한 거래명세표를 바로 출력할까요?</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setPrintDialogId(null)}>닫기</Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (printDialogId) window.open(`/statements/${printDialogId}/print?auto=1`, "_blank");
                setPrintDialogId(null);
              }}
            >
              <FileDown className="h-4 w-4 mr-1.5" /> PDF 다운로드
            </Button>
            <Button
              onClick={() => {
                if (printDialogId) window.open(`/statements/${printDialogId}/print?auto=1`, "_blank");
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
