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
import { Pencil, Trash2, FileText, ArrowRightCircle } from "lucide-react";
import { toast } from "sonner";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { QuotationSheet, type QuotationFormData } from "@/components/quotation-sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { ChannelCombobox } from "@/components/channel-combobox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentPrintDialog } from "@/components/document-print-dialog";

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
  /** 미리보기(모달) 대상 견적서 정보 */
  const [previewTarget, setPreviewTarget] = useState<{ id: string; quotationNo: string } | null>(null);
  /** 전환 다이얼로그 — null 이면 닫힘. 견적서 type 따라 옵션 분기 */
  const [convertDialog, setConvertDialog] = useState<QuotationRow | null>(null);
  const [convertTarget, setConvertTarget] = useState<"statement" | "order" | "incoming">(
    "statement",
  );
  const [convertChannelId, setConvertChannelId] = useState("");

  // 채널 목록 — 전환 다이얼로그용 (활성만)
  const channelsQuery = useQuery({
    queryKey: ["channels-for-convert"],
    queryFn: () =>
      apiGet<
        Array<{ id: string; name: string; code: string; commissionRate: string }>
      >("/api/channels"),
    enabled: convertDialog !== null,
  });

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

  const convertMutation = useMutation<
    unknown,
    Error,
    { id: string; target: "statement" | "order" | "incoming"; channelId?: string }
  >({
    mutationFn: ({ id, target, channelId }) =>
      apiMutate(`/api/quotations/${id}/convert`, "POST", { target, channelId }),
    onSuccess: (_, vars) => {
      const label =
        vars.target === "statement"
          ? "거래명세표"
          : vars.target === "order"
            ? "주문"
            : "입고";
      toast.success(`${label}로 전환됨`);
      refresh();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "전환 실패"),
  });

  const handleDelete = (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    deleteMutation.mutate(id);
  };

  const handleConvert = (q: QuotationRow) => {
    if (q.status === "CONVERTED") {
      toast.info("이미 전환된 견적서입니다");
      return;
    }
    setConvertDialog(q);
    setConvertTarget(q.type === "SALES" ? "statement" : "incoming");
    setConvertChannelId("");
  };

  const submitConvert = () => {
    if (!convertDialog) return;
    if (convertTarget === "order" && !convertChannelId) {
      toast.error("주문 전환은 채널 선택이 필요합니다");
      return;
    }
    convertMutation.mutate(
      {
        id: convertDialog.id,
        target: convertTarget,
        channelId: convertTarget === "order" ? convertChannelId : undefined,
      },
      {
        onSuccess: () => setConvertDialog(null),
      },
    );
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
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setPreviewTarget({ id: q.id, quotationNo: q.quotationNo })}
                          title="견적서 보기"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleConvert(q)}
                          disabled={q.status === "CONVERTED"}
                          title={
                            q.status === "CONVERTED"
                              ? "이미 전환됨"
                              : q.type === "SALES"
                                ? "거래명세표/주문으로 전환"
                                : "입고로 전환"
                          }
                        >
                          <ArrowRightCircle className="h-4 w-4" />
                        </Button>
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
        onSaved={(id, no) => {
          refresh();
          if (id) setPreviewTarget({ id, quotationNo: no ?? "" });
        }}
      />

      <DocumentPrintDialog
        open={!!previewTarget}
        onOpenChange={(v) => { if (!v) setPreviewTarget(null); }}
        printPath={previewTarget ? `/quotations/${previewTarget.id}/print` : null}
        title={previewTarget ? `견적서 — ${previewTarget.quotationNo}` : "견적서"}
      />

      {/* 전환 다이얼로그 — 거래명세표 / 주문 / 입고 선택 */}
      <Dialog
        open={convertDialog !== null}
        onOpenChange={(v) => {
          if (!v) setConvertDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>견적서 전환</DialogTitle>
            <DialogDescription>
              {convertDialog && (
                <span className="font-mono">[{convertDialog.quotationNo}]</span>
              )}{" "}
              어디로 전환할지 선택하세요. 원본 견적서는{" "}
              <span className="font-semibold">CONVERTED</span> 상태로 잠깁니다.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            {/* target 선택 */}
            <div className="space-y-2">
              <Label>전환 대상</Label>
              <div className="grid grid-cols-2 gap-2">
                {convertDialog?.type === "SALES" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setConvertTarget("statement")}
                      className={`rounded-md border p-3 text-left text-sm ${
                        convertTarget === "statement"
                          ? "border-primary bg-secondary"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="font-semibold">거래명세표</div>
                      <div className="text-xs text-muted-foreground">
                        실제 거래 증빙 (Statement)
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConvertTarget("order")}
                      className={`rounded-md border p-3 text-left text-sm ${
                        convertTarget === "order"
                          ? "border-primary bg-secondary"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="font-semibold">주문</div>
                      <div className="text-xs text-muted-foreground">
                        Order 생성 (채널 필수)
                      </div>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConvertTarget("incoming")}
                    className="col-span-2 rounded-md border border-primary bg-secondary p-3 text-left text-sm"
                  >
                    <div className="font-semibold">입고</div>
                    <div className="text-xs text-muted-foreground">
                      매입 견적서 → Incoming 생성
                    </div>
                  </button>
                )}
              </div>
            </div>

            {/* 주문 전환 시 채널 선택 */}
            {convertTarget === "order" && (
              <div className="space-y-2">
                <Label>채널 (필수)</Label>
                <ChannelCombobox
                  channels={channelsQuery.data ?? []}
                  value={convertChannelId}
                  onChange={(id) => setConvertChannelId(id)}
                  placeholder="채널 선택..."
                  clearable
                />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setConvertDialog(null)}>
              취소
            </Button>
            <Button
              onClick={submitConvert}
              disabled={
                convertMutation.isPending ||
                (convertTarget === "order" && !convertChannelId)
              }
            >
              {convertMutation.isPending && (
                <span className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              )}
              전환
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
