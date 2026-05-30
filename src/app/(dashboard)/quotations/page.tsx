"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  ArrowRightCircle,
  FileText,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  JmBadge,
  JmButton,
  JmCard,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogDescription,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmEmpty,
  JmIconButton,
  JmSearchInput,
  JmSegmentedControl,
  JmSkeleton,
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
  JmTableToolbarSearch,
  JmTooltip,
  JmTooltipProvider,
} from "@/jm";
import { QuotationSheet, type QuotationFormData } from "@/components/quotation-sheet";
import { ChannelCombobox } from "@/components/channel-combobox";
import { DocumentPrintDialog } from "@/components/document-print-dialog";
import { QuotationsThemeScope } from "./_theme-scope";

// ─── Types ───────────────────────────────────────────────────────────────────

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

const STATUS_LABEL: Record<QuotationStatus, string> = {
  DRAFT: "초안",
  SENT: "발송",
  ACCEPTED: "수락",
  REJECTED: "거절",
  EXPIRED: "만료",
  CONVERTED: "전환",
};

type JmBadgeVariant = "default" | "outline" | "success" | "warning" | "danger" | "info" | "accent";

const STATUS_BADGE_VARIANT: Record<QuotationStatus, JmBadgeVariant> = {
  DRAFT: "default",
  SENT: "warning",
  ACCEPTED: "success",
  REJECTED: "danger",
  EXPIRED: "default",
  CONVERTED: "info",
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function QuotationsSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <JmTableRow key={i} className="hover:bg-transparent">
          <JmTableCell><JmSkeleton className="h-4 w-24" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-28" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-40" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-20" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-20" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-5 w-16 rounded-md" /></JmTableCell>
          <JmTableCell><div className="flex justify-end"><JmSkeleton className="h-4 w-20" /></div></JmTableCell>
          <JmTableCell>
            <div className="flex gap-1">
              <JmSkeleton className="h-7 w-7 rounded-md" />
              <JmSkeleton className="h-7 w-7 rounded-md" />
              <JmSkeleton className="h-7 w-7 rounded-md" />
              <JmSkeleton className="h-7 w-7 rounded-md" />
            </div>
          </JmTableCell>
        </JmTableRow>
      ))}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function QuotationsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<QuotationType>("SALES");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editData, setEditData] = useState<QuotationFormData | null>(null);

  /** 미리보기(모달) 대상 견적서 정보 */
  const [previewTarget, setPreviewTarget] = useState<{ id: string; quotationNo: string } | null>(null);

  /** 전환 다이얼로그 */
  const [convertDialog, setConvertDialog] = useState<QuotationRow | null>(null);
  const [convertTarget, setConvertTarget] = useState<"statement" | "order" | "incoming" | "purchase_order">("statement");
  const [convertChannelId, setConvertChannelId] = useState("");

  /** 삭제 확인 다이얼로그 */
  const [deleteTarget, setDeleteTarget] = useState<QuotationRow | null>(null);

  // 채널 목록 — 전환 다이얼로그용 (활성만)
  const channelsQuery = useQuery({
    queryKey: ["channels-for-convert"],
    queryFn: () =>
      apiGet<Array<{ id: string; name: string; code: string; commissionRate: string }>>("/api/channels"),
    enabled: convertDialog !== null,
  });

  const quotationsQuery = useQuery({
    queryKey: queryKeys.quotations.list({ type: tab, search: appliedSearch }),
    queryFn: () =>
      apiGet<QuotationRow[]>(`/api/quotations?type=${tab}&search=${encodeURIComponent(appliedSearch)}`),
  });
  const quotations = quotationsQuery.data ?? [];
  const loading = quotationsQuery.isPending;

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.quotations.all });

  // KPI — 현재 탭 로드된 데이터 기준
  const stats = useMemo(() => {
    let sent = 0;
    let accepted = 0;
    let totalAmount = 0;
    for (const q of quotations) {
      if (q.status === "SENT") sent++;
      if (q.status === "ACCEPTED") accepted++;
      totalAmount += parseFloat(q.totalAmount) || 0;
    }
    return { total: quotations.length, sent, accepted, totalAmount: Math.round(totalAmount) };
  }, [quotations]);

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
      setDeleteTarget(null);
      refresh();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "삭제에 실패했습니다"),
  });

  const convertMutation = useMutation<
    unknown,
    Error,
    { id: string; target: "statement" | "order" | "incoming" | "purchase_order"; channelId?: string }
  >({
    mutationFn: ({ id, target, channelId }) =>
      apiMutate(`/api/quotations/${id}/convert`, "POST", { target, channelId }),
    onSuccess: (_, vars) => {
      const label =
        vars.target === "statement"
          ? "거래명세표"
          : vars.target === "order"
            ? "주문"
            : vars.target === "purchase_order"
              ? "발주"
              : "입고";
      toast.success(`${label}로 전환됨`);
      refresh();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "전환 실패"),
  });

  const handleConvert = (q: QuotationRow) => {
    if (q.status === "CONVERTED") {
      toast.info("이미 전환된 견적서입니다");
      return;
    }
    setConvertDialog(q);
    setConvertTarget(q.type === "SALES" ? "statement" : "purchase_order");
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
    <QuotationsThemeScope>
      <JmTooltipProvider>
        <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
          <div className="flex w-full flex-col gap-6 p-4">
            {/* KPI */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <JmStat
                label="견적 건수"
                value={loading ? "—" : stats.total.toLocaleString("ko-KR")}
                hint={loading ? "" : tab === "SALES" ? "판매 견적" : "매입 견적"}
                size="sm"
              />
              <JmStat
                label="발송"
                value={loading ? "—" : stats.sent.toLocaleString("ko-KR")}
                hint={loading ? "" : "SENT 상태"}
                size="sm"
              />
              <JmStat
                label="수락"
                value={loading ? "—" : stats.accepted.toLocaleString("ko-KR")}
                hint={loading ? "" : "ACCEPTED 상태"}
                size="sm"
              />
              <JmStat
                label="견적 합계액"
                value={loading ? "—" : `₩${stats.totalAmount.toLocaleString("ko-KR")}`}
                hint={loading ? "" : "합계 기준"}
                size="sm"
              />
            </div>

            {/* 메인 카드 */}
            <JmCard className="overflow-hidden p-0">
              <JmTableToolbar>
                <JmTableToolbarSearch>
                  <JmSegmentedControl
                    options={[
                      { value: "SALES", label: "판매" },
                      { value: "PURCHASE", label: "매입" },
                    ]}
                    value={tab}
                    onChange={(v) => setTab(v as QuotationType)}
                    size="sm"
                  />
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
                    placeholder="견적번호 / 제목 / 상대방 검색"
                  />
                </JmTableToolbarSearch>
                <JmTableToolbarActions>
                  <JmIconButton
                    variant="ghost"
                    size="sm"
                    aria-label="새로고침"
                    onClick={refresh}
                    disabled={quotationsQuery.isFetching}
                  >
                    {quotationsQuery.isFetching ? (
                      <JmSpinner size="sm" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                  </JmIconButton>
                  <JmButton size="sm" onClick={openCreate}>
                    <Plus className="size-4" />
                    견적서 작성
                  </JmButton>
                </JmTableToolbarActions>
              </JmTableToolbar>

              <JmTable className="min-w-[960px]">
                <JmTableHeader>
                  <JmTableRow>
                    <JmTableHead>견적번호</JmTableHead>
                    <JmTableHead>{tab === "SALES" ? "고객" : "거래처"}</JmTableHead>
                    <JmTableHead>제목</JmTableHead>
                    <JmTableHead>견적일자</JmTableHead>
                    <JmTableHead>유효기간</JmTableHead>
                    <JmTableHead>상태</JmTableHead>
                    <JmTableHead className="text-right">합계</JmTableHead>
                    <JmTableHead className="w-[148px]">관리</JmTableHead>
                  </JmTableRow>
                </JmTableHeader>
                <JmTableBody>
                  {loading ? (
                    <QuotationsSkeletonRows />
                  ) : quotationsQuery.isError ? (
                    <JmTableRow className="hover:bg-transparent">
                      <JmTableCell
                        colSpan={8}
                        className="py-10 text-center text-jm-sm text-[var(--jm-danger-fg)]"
                      >
                        견적서 목록을 불러오지 못했습니다
                      </JmTableCell>
                    </JmTableRow>
                  ) : quotations.length === 0 ? (
                    <JmTableRow className="hover:bg-transparent">
                      <JmTableCell colSpan={8} className="py-12">
                        <JmEmpty
                          icon={<FileText className="size-8" />}
                          title="등록된 견적서가 없습니다"
                          description="첫 견적서를 작성해 고객에게 발송하세요"
                          action={
                            <JmButton size="sm" onClick={openCreate}>
                              <Plus className="size-4" />
                              견적서 작성
                            </JmButton>
                          }
                        />
                      </JmTableCell>
                    </JmTableRow>
                  ) : (
                    quotations.map((q) => (
                      <JmTableRow key={q.id}>
                        <JmTableCell>
                          <span className="font-[family-name:var(--jm-font-mono)] text-jm-xs text-[var(--jm-text-muted)]">
                            {q.quotationNo}
                          </span>
                        </JmTableCell>
                        <JmTableCell>
                          {tab === "SALES" ? q.customer?.name || "-" : q.supplier?.name || "-"}
                        </JmTableCell>
                        <JmTableCell>{q.title || "-"}</JmTableCell>
                        <JmTableCell>{q.issueDate.slice(0, 10)}</JmTableCell>
                        <JmTableCell>{q.validUntil ? q.validUntil.slice(0, 10) : "-"}</JmTableCell>
                        <JmTableCell>
                          <JmBadge variant={STATUS_BADGE_VARIANT[q.status]} size="sm">
                            {STATUS_LABEL[q.status]}
                          </JmBadge>
                        </JmTableCell>
                        <JmTableCell className="text-right font-medium tabular-nums">
                          ₩{Math.round(parseFloat(q.totalAmount)).toLocaleString("ko-KR")}
                        </JmTableCell>
                        <JmTableCell>
                          <div className="flex gap-1">
                            <JmTooltip content="견적서 보기">
                              <JmIconButton
                                variant="ghost"
                                size="sm"
                                aria-label="견적서 보기"
                                onClick={() => setPreviewTarget({ id: q.id, quotationNo: q.quotationNo })}
                              >
                                <FileText className="size-4" />
                              </JmIconButton>
                            </JmTooltip>
                            <JmTooltip
                              content={
                                q.status === "CONVERTED"
                                  ? "이미 전환됨"
                                  : q.type === "SALES"
                                    ? "거래명세표/주문으로 전환"
                                    : "발주/입고로 전환"
                              }
                            >
                              <JmIconButton
                                variant="ghost"
                                size="sm"
                                aria-label="전환"
                                onClick={() => handleConvert(q)}
                                disabled={q.status === "CONVERTED"}
                              >
                                <ArrowRightCircle className="size-4" />
                              </JmIconButton>
                            </JmTooltip>
                            <JmTooltip content="수정">
                              <JmIconButton
                                variant="ghost"
                                size="sm"
                                aria-label="수정"
                                onClick={() => openEdit(q)}
                              >
                                <Pencil className="size-4" />
                              </JmIconButton>
                            </JmTooltip>
                            <JmTooltip content="삭제">
                              <JmIconButton
                                variant="ghost"
                                size="sm"
                                aria-label="삭제"
                                onClick={() => setDeleteTarget(q)}
                              >
                                <Trash2 className="size-4" />
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

        {/* 견적서 작성/수정 Sheet */}
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

        {/* PDF 미리보기 */}
        <DocumentPrintDialog
          open={!!previewTarget}
          onOpenChange={(v) => { if (!v) setPreviewTarget(null); }}
          printPath={previewTarget ? `/quotations/${previewTarget.id}/print` : null}
          title={previewTarget ? `견적서 — ${previewTarget.quotationNo}` : "견적서"}
        />

        {/* 삭제 확인 다이얼로그 */}
        <JmDialog
          open={deleteTarget !== null}
          onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        >
          <JmDialogContent size="sm">
            <JmDialogHeader>
              <JmDialogTitle>견적서 삭제</JmDialogTitle>
              <JmDialogDescription>
                <span className="font-[family-name:var(--jm-font-mono)]">[{deleteTarget?.quotationNo}]</span>{" "}
                견적서를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
              </JmDialogDescription>
            </JmDialogHeader>
            <JmDialogFooter>
              <JmButton
                variant="ghost"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteMutation.isPending}
              >
                취소
              </JmButton>
              <JmButton
                variant="danger"
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending && <JmSpinner size="sm" tone="inverted" />}
                삭제
              </JmButton>
            </JmDialogFooter>
          </JmDialogContent>
        </JmDialog>

        {/* 전환 다이얼로그 */}
        <JmDialog
          open={convertDialog !== null}
          onOpenChange={(v) => { if (!v) setConvertDialog(null); }}
        >
          <JmDialogContent size="sm">
            <JmDialogHeader>
              <JmDialogTitle>견적서 전환</JmDialogTitle>
              <JmDialogDescription>
                {convertDialog && (
                  <span className="font-[family-name:var(--jm-font-mono)]">[{convertDialog.quotationNo}]</span>
                )}{" "}
                어디로 전환할지 선택하세요. 원본 견적서는{" "}
                <span className="font-semibold">CONVERTED</span> 상태로 잠깁니다.
              </JmDialogDescription>
            </JmDialogHeader>

            <JmDialogBody>
              <div className="flex flex-col gap-4">
                {/* 전환 대상 선택 */}
                <div className="space-y-2">
                  <p className="text-jm-sm font-medium text-[var(--jm-text)]">전환 대상</p>
                  <div className="grid grid-cols-2 gap-2">
                    {convertDialog?.type === "SALES" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setConvertTarget("statement")}
                          className={`rounded-lg border p-3 text-left text-jm-sm transition-colors ${
                            convertTarget === "statement"
                              ? "border-[var(--jm-action)] bg-[var(--jm-surface-muted)]"
                              : "border-[var(--jm-border)] hover:bg-[var(--jm-surface-muted)]"
                          }`}
                        >
                          <div className="font-semibold text-[var(--jm-text)]">거래명세표</div>
                          <div className="text-jm-xs text-[var(--jm-text-muted)]">실제 거래 증빙 (Statement)</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConvertTarget("order")}
                          className={`rounded-lg border p-3 text-left text-jm-sm transition-colors ${
                            convertTarget === "order"
                              ? "border-[var(--jm-action)] bg-[var(--jm-surface-muted)]"
                              : "border-[var(--jm-border)] hover:bg-[var(--jm-surface-muted)]"
                          }`}
                        >
                          <div className="font-semibold text-[var(--jm-text)]">주문</div>
                          <div className="text-jm-xs text-[var(--jm-text-muted)]">Order 생성 (채널 필수)</div>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setConvertTarget("purchase_order")}
                          className={`rounded-lg border p-3 text-left text-jm-sm transition-colors ${
                            convertTarget === "purchase_order"
                              ? "border-[var(--jm-action)] bg-[var(--jm-surface-muted)]"
                              : "border-[var(--jm-border)] hover:bg-[var(--jm-surface-muted)]"
                          }`}
                        >
                          <div className="font-semibold text-[var(--jm-text)]">발주 (권장)</div>
                          <div className="text-jm-xs text-[var(--jm-text-muted)]">RFQ → 발주 → 입고 정상 흐름</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConvertTarget("incoming")}
                          className={`rounded-lg border p-3 text-left text-jm-sm transition-colors ${
                            convertTarget === "incoming"
                              ? "border-[var(--jm-action)] bg-[var(--jm-surface-muted)]"
                              : "border-[var(--jm-border)] hover:bg-[var(--jm-surface-muted)]"
                          }`}
                        >
                          <div className="font-semibold text-[var(--jm-text)]">입고 (직접)</div>
                          <div className="text-jm-xs text-[var(--jm-text-muted)]">발주 단계 건너뛰고 즉시 입고</div>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* 주문 전환 시 채널 선택 */}
                {convertTarget === "order" && (
                  <div className="space-y-2">
                    <p className="text-jm-sm font-medium text-[var(--jm-text)]">채널 (필수)</p>
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
            </JmDialogBody>

            <JmDialogFooter>
              <JmButton variant="ghost" onClick={() => setConvertDialog(null)}>
                취소
              </JmButton>
              <JmButton
                variant="cta"
                onClick={submitConvert}
                disabled={
                  convertMutation.isPending ||
                  (convertTarget === "order" && !convertChannelId)
                }
              >
                {convertMutation.isPending && <JmSpinner size="sm" tone="inverted" />}
                전환
              </JmButton>
            </JmDialogFooter>
          </JmDialogContent>
        </JmDialog>
      </JmTooltipProvider>
    </QuotationsThemeScope>
  );
}
