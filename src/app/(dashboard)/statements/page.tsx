"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { FileText, Loader2, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { StatementSheet, type StatementFormData } from "@/components/statement-sheet";
import { DocumentPrintDialog } from "@/components/document-print-dialog";
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

const STATUS_JM_VARIANT: Record<StatementStatus, "default" | "success" | "danger"> = {
  DRAFT: "default",
  ISSUED: "success",
  CANCELLED: "danger",
};

function StatementsSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <JmTableRow key={i} className="hover:bg-transparent">
          <JmTableCell><JmSkeleton className="h-4 w-24" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-28" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-20" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-24" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-5 w-12 rounded-md" /></JmTableCell>
          <JmTableCell>
            <div className="flex justify-end">
              <JmSkeleton className="h-4 w-20" />
            </div>
          </JmTableCell>
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

export default function StatementsPage() {
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editData, setEditData] = useState<StatementFormData | null>(null);
  const [previewTarget, setPreviewTarget] = useState<{
    id: string;
    statementNo: string;
  } | null>(null);

  const statementsQuery = useQuery({
    queryKey: queryKeys.statements.list({ search: appliedSearch }),
    queryFn: () =>
      apiGet<StatementRow[]>(
        `/api/statements?search=${encodeURIComponent(appliedSearch)}`,
      ),
  });
  const statements = statementsQuery.data ?? [];
  const loading = statementsQuery.isPending;
  const refreshing = statementsQuery.isFetching && !loading;
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.statements.all });

  const openCreate = () => {
    setEditData(null);
    setSheetOpen(true);
  };

  type StatementDetail = {
    id: string;
    status: StatementStatus;
    issueDate: string;
    customerId: string | null;
    customerNameSnapshot: string | null;
    customerPhoneSnapshot: string | null;
    customerAddressSnapshot: string | null;
    customerBusinessNumberSnapshot: string | null;
    orderId: string | null;
    quotationId: string | null;
    memo: string | null;
    items: Array<{
      productId: string | null;
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
  };

  const openEdit = async (row: StatementRow) => {
    let s: StatementDetail;
    try {
      s = await apiGet<StatementDetail>(`/api/statements/${row.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "거래명세표를 불러오지 못했습니다");
      return;
    }
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
      items: s.items.map((it) => ({
        rowType: it.productId ? ("product" as const) : ("free" as const),
        productId: it.productId,
        name: it.name,
        spec: it.spec || "",
        unitOfMeasure: it.unitOfMeasure,
        quantity: it.quantity,
        unitPrice:
          parseFloat(it.listPrice) > 0 ? it.listPrice : it.unitPrice,
        discount: parseFloat(it.discountAmount) > 0 ? it.discountAmount : "",
        isTaxable: it.isTaxable,
        isZeroRateEligible: it.isZeroRateEligible ?? false,
        memo: it.memo || "",
      })),
    });
    setSheetOpen(true);
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/statements/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("거래명세표가 삭제되었습니다");
      refresh();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "삭제에 실패했습니다"),
  });

  const handleDelete = (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    deleteMutation.mutate(id);
  };

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
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  setAppliedSearch(search);
                }
              }}
              placeholder="명세표번호 / 고객 검색"
              className="flex-1 bg-transparent text-jm-sm outline-none placeholder:text-[var(--jm-text-muted)] text-[var(--jm-text)]"
            />
          </div>
          <JmIconButton
            aria-label="새로고침"
            onClick={refresh}
            disabled={loading}
            size="sm"
            variant="ghost"
          >
            <RefreshCw className={refreshing ? "animate-spin" : ""} />
          </JmIconButton>
          <div className="ml-auto">
            <JmButton size="sm" variant="cta" onClick={openCreate}>
              <Plus />
              <span>거래명세표 작성</span>
            </JmButton>
          </div>
        </div>

        {/* 테이블 */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <JmTable className="min-w-[900px]">
            <JmTableHeader className="sticky top-0 z-10">
              <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">명세표번호</JmTableHead>
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">고객</JmTableHead>
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">발행일자</JmTableHead>
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">원본</JmTableHead>
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">상태</JmTableHead>
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">합계</JmTableHead>
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-[130px]">관리</JmTableHead>
              </JmTableRow>
            </JmTableHeader>
            <JmTableBody>
              {loading ? (
                <StatementsSkeletonRows />
              ) : statements.length === 0 ? (
                <JmTableRow className="hover:bg-transparent">
                  <JmTableCell colSpan={7} className="text-center py-10 text-[var(--jm-text-muted)] text-sm">
                    {appliedSearch ? (
                      <>
                        <span className="text-[var(--jm-text)] font-medium">
                          &ldquo;{appliedSearch}&rdquo;
                        </span>{" "}
                        검색 결과가 없습니다
                      </>
                    ) : (
                      "등록된 거래명세표가 없습니다"
                    )}
                  </JmTableCell>
                </JmTableRow>
              ) : (
                statements.map((s) => (
                  <JmTableRow key={s.id}>
                    <JmTableCell className="px-3 py-2 font-medium font-[family-name:var(--jm-font-mono)] text-jm-xs text-[var(--jm-text)]">
                      {s.statementNo}
                    </JmTableCell>
                    <JmTableCell className="px-3 py-2 text-[var(--jm-text)]">
                      {s.customer?.name || s.customerNameSnapshot || "-"}
                    </JmTableCell>
                    <JmTableCell className="px-3 py-2 text-[var(--jm-text-muted)] tabular-nums">
                      {s.issueDate.slice(0, 10)}
                    </JmTableCell>
                    <JmTableCell className="px-3 py-2 font-[family-name:var(--jm-font-mono)] text-jm-xs text-[var(--jm-text-muted)]">
                      {s.order
                        ? s.order.orderNo
                        : s.quotation
                          ? s.quotation.quotationNo
                          : "-"}
                    </JmTableCell>
                    <JmTableCell className="px-3 py-2">
                      <JmBadge
                        variant={STATUS_JM_VARIANT[s.status]}
                        size="sm"
                        shape="square"
                      >
                        {STATUS_LABEL[s.status]}
                      </JmBadge>
                    </JmTableCell>
                    <JmTableCell className="px-3 py-2 text-right font-medium tabular-nums text-[var(--jm-text)]">
                      ₩{Math.round(parseFloat(s.totalAmount)).toLocaleString("ko-KR")}
                    </JmTableCell>
                    <JmTableCell className="px-3 py-2">
                      <div className="flex gap-1">
                        <JmIconButton
                          aria-label="거래명세표 보기"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setPreviewTarget({ id: s.id, statementNo: s.statementNo })
                          }
                        >
                          <FileText />
                        </JmIconButton>
                        <JmIconButton
                          aria-label="수정"
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(s)}
                        >
                          <Pencil />
                        </JmIconButton>
                        <JmIconButton
                          aria-label="삭제"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(s.id)}
                          disabled={
                            deleteMutation.isPending &&
                            deleteMutation.variables === s.id
                          }
                        >
                          {deleteMutation.isPending &&
                          deleteMutation.variables === s.id ? (
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

      <StatementSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editData={editData}
        onSaved={(id, no) => {
          refresh();
          if (id) setPreviewTarget({ id, statementNo: no ?? "" });
        }}
      />

      <DocumentPrintDialog
        open={!!previewTarget}
        onOpenChange={(v) => {
          if (!v) setPreviewTarget(null);
        }}
        printPath={previewTarget ? `/statements/${previewTarget.id}/print` : null}
        title={
          previewTarget ? `거래명세표 — ${previewTarget.statementNo}` : "거래명세표"
        }
      />
    </JmScope>
  );
}
