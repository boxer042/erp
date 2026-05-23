"use client";

import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, PackagePlus, Send, CheckCircle2, XCircle, Lock, Loader2,
  Trash2, Pencil, FileText, RefreshCw, ThumbsUp, Link2, Copy,
} from "lucide-react";

import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

import {
  jmToast as toast,
  JmAlert,
  JmBadge,
  JmButton,
  JmCard,
  JmCardContent,
  JmCardHeader,
  JmCardTitle,
  JmContainer,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogDescription,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmIconButton,
  JmInput,
  JmSkeleton,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
  JmTextarea,
} from "@/jm";

import { statusLabels, type PurchaseOrderStatus } from "../_types";
import { isoToKr } from "../_helpers";
import { PoStatusBadge } from "../_parts";

interface AccessToken {
  id: string;
  token: string;
  status: "ACTIVE" | "VIEWED" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "REVOKED";
  issuedAt: string;
  expiresAt: string;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
  acceptedAt: string | null;
  rejectedAt: string | null;
  rejectionNote: string | null;
}

type ShippingMethod =
  | "COURIER"
  | "DIRECT_DELIVERY"
  | "QUICK_OR_CARGO"
  | "OTHER_SUPPLIER"
  | "PICKUP";

const SHIPPING_LABELS_DETAIL: Record<ShippingMethod, string> = {
  COURIER: "택배 출고",
  DIRECT_DELIVERY: "직접 배달",
  QUICK_OR_CARGO: "퀵 · 용달",
  OTHER_SUPPLIER: "다른 거래처 출고",
  PICKUP: "직접 수령 (매장 픽업)",
};

interface PurchaseOrderDetail {
  id: string;
  poNo: string;
  status: PurchaseOrderStatus;
  orderDate: string;
  expectedDate: string | null;
  shippingMethod: ShippingMethod | null;
  promisedDate: string | null;
  shippingMemo: string | null;
  totalAmount: string;
  memo: string | null;
  supplier: { id: string; name: string; phone: string | null; representative: string | null };
  createdBy: { id: string; name: string };
  quotation: { id: string; quotationNo: string } | null;
  accessTokens: AccessToken[];
  items: Array<{
    id: string;
    name: string | null;        // 자유입력 라인일 때만 값
    priceUndetermined: boolean;
    quantity: string;
    receivedQty: string;
    pendingQty: number;
    unitPrice: string;
    totalPrice: string;
    proposedUnitPrice: string | null;
    memo: string | null;
    sortOrder: number;
    supplierProduct: {
      id: string;
      name: string;
      spec: string | null;
      supplierCode: string | null;
      unitOfMeasure: string;
    } | null;
  }>;
  incomings: Array<{
    id: string;
    incomingNo: string;
    incomingDate: string;
    status: "PENDING" | "CONFIRMED" | "CANCELLED";
    totalAmount: string;
  }>;
}

export default function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [confirmAction, setConfirmAction] = useState<"close" | "cancel" | "delete" | null>(null);
  const [tokenLink, setTokenLink] = useState<string | null>(null);

  const detailQuery = useQuery<PurchaseOrderDetail>({
    queryKey: queryKeys.purchaseOrders.detail(id),
    queryFn: () => apiGet<PurchaseOrderDetail>(`/api/purchase-orders/${id}`),
    staleTime: 1000 * 30,
  });

  const statusMutation = useMutation({
    mutationFn: (target: PurchaseOrderStatus) =>
      apiMutate(`/api/purchase-orders/${id}/status`, "PUT", { status: target }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(id) });
      toast.success("상태가 변경되었습니다");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "상태 변경 실패"),
  });

  const proposalMutation = useMutation({
    mutationFn: (vars: { action: "accept" | "reject"; rejectionNote?: string }) =>
      apiMutate(`/api/purchase-orders/${id}/proposal`, "POST", vars),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(id) });
      toast.success(vars.action === "accept" ? "제안 단가를 적용했습니다" : "제안을 거절했습니다");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "처리 실패"),
  });

  const issueTokenMutation = useMutation({
    mutationFn: () =>
      apiMutate<{ token: string; url: string; expiresAt: string; nextStatus: string }>(
        `/api/purchase-orders/${id}/issue-token`,
        "POST"
      ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(id) });
      setTokenLink(res.url);
      toast.success("거래처용 링크가 발급되었습니다");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "발급 실패"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiMutate(`/api/purchase-orders/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      toast.success("삭제되었습니다");
      router.push("/purchase-orders");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "삭제 실패"),
  });

  const data = detailQuery.data;

  const progress = useMemo(() => {
    if (!data) return { ordered: 0, received: 0, pending: 0, remaining: 0, percentReceived: 0, percentPending: 0 };
    const ordered = data.items.reduce((s, it) => s + parseFloat(it.quantity || "0"), 0);
    const received = data.items.reduce((s, it) => s + parseFloat(it.receivedQty || "0"), 0);
    const pending = data.items.reduce((s, it) => s + (it.pendingQty ?? 0), 0);
    const remaining = Math.max(0, ordered - received - pending);
    const percentReceived = ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0;
    const percentPending = ordered > 0 ? Math.min(100 - percentReceived, Math.round((pending / ordered) * 100)) : 0;
    return { ordered, received, pending, remaining, percentReceived, percentPending };
  }, [data]);

  if (detailQuery.isPending) {
    return (
      <div className="p-6 space-y-6">
        <JmSkeleton className="h-8 w-64" />
        <JmSkeleton className="h-32 w-full" />
        <JmSkeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!data) {
    return <div className="p-6 text-[var(--jm-text-muted)]">발주서를 찾을 수 없습니다</div>;
  }

  const hasNonCancelledIncoming = data.incomings.some((i) => i.status !== "CANCELLED");
  const isTerminal = ["RECEIVED", "PARTIAL_COMPLETED", "CLOSED", "CANCELLED"].includes(data.status);
  const canEdit = data.status === "DRAFT" && !hasNonCancelledIncoming;
  const canIncoming = ["CONFIRMED", "PARTIAL", "PARTIAL_REACCEPTED"].includes(data.status) && progress.remaining > 0;
  const canSend = data.status === "DRAFT";
  const canConfirm = data.status === "SENT";
  const canResend = data.status === "PARTIAL";
  const canReaccept = data.status === "PARTIAL_RESENT";
  const canClose = ["PARTIAL", "PARTIAL_RESENT", "PARTIAL_REACCEPTED"].includes(data.status);
  const canCancel = !isTerminal && !hasNonCancelledIncoming;
  const canDelete = data.status === "DRAFT" && !hasNonCancelledIncoming;

  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      {/* 헤더 — sticky, 페이지 폭 제한 없음 (액션 버튼 다 보이도록) */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-6 py-3">
        <JmIconButton aria-label="뒤로" onClick={() => router.push("/purchase-orders")} size="sm">
          <ArrowLeft />
        </JmIconButton>
        <div className="flex items-center gap-2">
          <span className="font-[family-name:var(--jm-font-mono)] text-jm-base">{data.poNo}</span>
          <PoStatusBadge status={data.status} />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <JmButton
            size="sm"
            variant="outline"
            onClick={() => window.open(`/purchase-orders/${data.id}/print?auto=1`, "_blank")}
          >
            <FileText /> PDF
          </JmButton>
          {canEdit && (
            <JmButton
              size="sm"
              variant="outline"
              onClick={() => router.push(`/purchase-orders?editId=${data.id}`)}
            >
              <Pencil /> 편집
            </JmButton>
          )}
          {(canSend || canResend) && (
            <JmButton
              size="sm"
              variant="outline"
              onClick={() => issueTokenMutation.mutate()}
              disabled={issueTokenMutation.isPending}
            >
              {issueTokenMutation.isPending ? <Loader2 className="animate-spin" /> : <Send />}
              {canSend ? "거래처 발송 (링크 발급)" : "잔량 재요청 (링크 발급)"}
            </JmButton>
          )}
          {canConfirm && (
            <JmButton size="sm" variant="outline" onClick={() => statusMutation.mutate("CONFIRMED")} disabled={statusMutation.isPending}>
              <CheckCircle2 /> 수동 수락 처리
            </JmButton>
          )}
          {canIncoming && (
            <JmButton
              size="sm"
              onClick={() => router.push(`/inventory/incoming?purchaseOrderId=${data.id}`)}
            >
              <PackagePlus /> 입고 등록
            </JmButton>
          )}
          {canResend && (
            <JmButton size="sm" variant="outline" onClick={() => statusMutation.mutate("PARTIAL_RESENT")} disabled={statusMutation.isPending}>
              <RefreshCw /> 잔량 재요청
            </JmButton>
          )}
          {canReaccept && (
            <JmButton size="sm" variant="outline" onClick={() => statusMutation.mutate("PARTIAL_REACCEPTED")} disabled={statusMutation.isPending}>
              <ThumbsUp /> 재요청 수락
            </JmButton>
          )}
          {canClose && (
            <JmButton size="sm" variant="outline" onClick={() => setConfirmAction("close")} disabled={statusMutation.isPending}>
              <Lock /> 부분입고 종결
            </JmButton>
          )}
          {canCancel && (
            <JmButton size="sm" variant="outline" onClick={() => setConfirmAction("cancel")} disabled={statusMutation.isPending}>
              <XCircle /> 발주 취소
            </JmButton>
          )}
          {canDelete && (
            <JmButton size="sm" variant="ghost" onClick={() => setConfirmAction("delete")} disabled={deleteMutation.isPending}>
              <Trash2 /> 삭제
            </JmButton>
          )}
        </div>
      </div>

      <JmContainer width="default" padded={false} className="space-y-5 p-6">
        {/* 정보 카드 */}
        <JmCard>
          <JmCardHeader>
            <JmCardTitle>발주 정보</JmCardTitle>
          </JmCardHeader>
          <JmCardContent>
            <div className="grid grid-cols-2 gap-4 text-jm-sm md:grid-cols-4">
              <InfoField label="거래처" value={data.supplier.name} />
              <InfoField label="발주일" value={isoToKr(data.orderDate)} />
              <InfoField label="예상 입고일" value={isoToKr(data.expectedDate)} />
              <InfoField label="총 발주금액" value={`₩${parseFloat(data.totalAmount).toLocaleString("ko-KR")}`} />
              {data.quotation && <InfoField label="견적서" value={data.quotation.quotationNo} mono />}
              <InfoField label="작성자" value={data.createdBy.name} />
              <InfoField
                label="출고 방법"
                value={data.shippingMethod ? SHIPPING_LABELS_DETAIL[data.shippingMethod] : "—"}
              />
              <InfoField label="납기일" value={isoToKr(data.promisedDate)} />
            </div>
            {data.shippingMemo && (
              <div className="mt-4 border-t border-[var(--jm-border)] pt-4">
                <div className="mb-1 text-jm-xs text-[var(--jm-text-muted)]">출고 메모</div>
                <div className="whitespace-pre-wrap text-jm-sm">{data.shippingMemo}</div>
              </div>
            )}
            {data.memo && (
              <div className="mt-4 border-t border-[var(--jm-border)] pt-4">
                <div className="mb-1 text-jm-xs text-[var(--jm-text-muted)]">메모</div>
                <div className="whitespace-pre-wrap text-jm-sm">{data.memo}</div>
              </div>
            )}
            {/* 진행률 */}
            {!["DRAFT", "CANCELLED"].includes(data.status) && (
              <div className="mt-4 border-t border-[var(--jm-border)] pt-4">
                <div className="mb-1.5 flex items-center justify-between text-jm-xs">
                  <span className="text-[var(--jm-text-muted)]">입고 진행률</span>
                  <span className="tabular-nums">
                    <span className="font-medium text-[var(--jm-success-fg)]">확정 {progress.received.toLocaleString("ko-KR")}</span>
                    {progress.pending > 0 && (
                      <span className="text-[var(--jm-info-fg)]"> · 대기 {progress.pending.toLocaleString("ko-KR")}</span>
                    )}
                    <span className="text-[var(--jm-text-muted)]">
                      {" "}/ 발주 {progress.ordered.toLocaleString("ko-KR")} ({progress.percentReceived}%)
                    </span>
                  </span>
                </div>
                <div className="relative h-2 overflow-hidden rounded-full bg-[var(--jm-surface-muted)]">
                  <div
                    className="absolute inset-y-0 left-0 bg-[var(--jm-success-solid)] transition-all"
                    style={{ width: `${progress.percentReceived}%` }}
                  />
                  <div
                    className="absolute inset-y-0 bg-[var(--jm-info-solid)] transition-all"
                    style={{ left: `${progress.percentReceived}%`, width: `${progress.percentPending}%` }}
                  />
                </div>
                {progress.remaining === 0 && progress.pending > 0 && (
                  <div className="mt-2 text-jm-2xs text-[var(--jm-info-fg)]">
                    ℹ 잔량 모두 입고 등록됨 (대기 {progress.pending.toLocaleString("ko-KR")}). 검수 후 입고 페이지에서 확정하세요.
                  </div>
                )}
              </div>
            )}
          </JmCardContent>
        </JmCard>

        {/* 항목 */}
        <JmCard className="overflow-hidden p-0">
          <JmCardHeader>
            <JmCardTitle>발주 항목</JmCardTitle>
          </JmCardHeader>
          <div className="border-t border-[var(--jm-border)]">
            <JmTable className="min-w-[800px]">
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead>공급상품</JmTableHead>
                  <JmTableHead className="w-[110px]">품번</JmTableHead>
                  <JmTableHead className="w-[90px] text-right">발주</JmTableHead>
                  <JmTableHead className="w-[90px] text-right">확정</JmTableHead>
                  <JmTableHead className="w-[90px] text-right">대기</JmTableHead>
                  <JmTableHead className="w-[90px] text-right">잔량</JmTableHead>
                  <JmTableHead className="w-[100px] text-right">단가</JmTableHead>
                  <JmTableHead className="w-[110px] text-right">소계</JmTableHead>
                  <JmTableHead>메모</JmTableHead>
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {data.items.map((it) => {
                  const ordered = parseFloat(it.quantity || "0");
                  const received = parseFloat(it.receivedQty || "0");
                  const pending = it.pendingQty ?? 0;
                  const remaining = Math.max(0, ordered - received - pending);
                  return (
                    <JmTableRow key={it.id}>
                      <JmTableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {it.supplierProduct?.name ?? it.name ?? "-"}
                          </span>
                          {it.supplierProduct?.spec && (
                            <span className="text-jm-2xs text-[var(--jm-text-muted)]">{it.supplierProduct.spec}</span>
                          )}
                          {!it.supplierProduct && (
                            <span className="text-jm-2xs text-[var(--jm-warning-fg)]">자유 품명 — 입고 시 공급상품 매핑 필요</span>
                          )}
                          {it.priceUndetermined && (
                            <span className="mt-0.5 inline-flex w-fit items-center rounded-md bg-[var(--jm-warning-bg)] px-1.5 py-0.5 text-jm-2xs font-medium text-[var(--jm-warning-fg)]">
                              가격 미정
                            </span>
                          )}
                        </div>
                      </JmTableCell>
                      <JmTableCell className="font-[family-name:var(--jm-font-mono)] text-jm-xs text-[var(--jm-text-muted)]">
                        {it.supplierProduct?.supplierCode ?? "-"}
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums">
                        {ordered.toLocaleString("ko-KR")} {it.supplierProduct?.unitOfMeasure ?? "EA"}
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums text-[var(--jm-success-fg)]">
                        {received.toLocaleString("ko-KR")}
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums text-[var(--jm-info-fg)]">
                        {pending > 0 ? pending.toLocaleString("ko-KR") : "-"}
                      </JmTableCell>
                      <JmTableCell className={cn(
                        "text-right tabular-nums",
                        remaining > 0 ? "font-medium text-[var(--jm-warning-fg)]" : "text-[var(--jm-text-muted)]"
                      )}>
                        {remaining.toLocaleString("ko-KR")}
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums">
                        ₩{parseFloat(it.unitPrice).toLocaleString("ko-KR")}
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums">
                        ₩{parseFloat(it.totalPrice).toLocaleString("ko-KR")}
                      </JmTableCell>
                      <JmTableCell className="text-jm-xs text-[var(--jm-text-muted)]">{it.memo ?? "-"}</JmTableCell>
                    </JmTableRow>
                  );
                })}
              </JmTableBody>
            </JmTable>
          </div>
        </JmCard>

        {/* 단가 협상 카드 */}
        {data.status === "COUNTER_OFFER" && data.items.some((it) => it.proposedUnitPrice != null) && (
          <CounterOfferCard
            items={data.items}
            onAccept={() => proposalMutation.mutate({ action: "accept" })}
            onReject={(note) => proposalMutation.mutate({ action: "reject", rejectionNote: note })}
            pending={proposalMutation.isPending}
          />
        )}

        {/* 거래처 발송 링크 */}
        {data.accessTokens.length > 0 && <AccessTokenCard tokens={data.accessTokens} />}

        {/* 입고 내역 */}
        {data.incomings.length > 0 && (
          <JmCard className="overflow-hidden p-0">
            <JmCardHeader>
              <JmCardTitle>입고 내역</JmCardTitle>
            </JmCardHeader>
            <div className="border-t border-[var(--jm-border)]">
              <JmTable>
                <JmTableHeader>
                  <JmTableRow>
                    <JmTableHead className="w-[160px]">입고번호</JmTableHead>
                    <JmTableHead className="w-[120px]">입고일</JmTableHead>
                    <JmTableHead className="w-[100px]">상태</JmTableHead>
                    <JmTableHead className="text-right">금액</JmTableHead>
                  </JmTableRow>
                </JmTableHeader>
                <JmTableBody>
                  {data.incomings.map((inc) => (
                    <JmTableRow
                      key={inc.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/inventory/incoming?incomingId=${inc.id}`)}
                    >
                      <JmTableCell className="font-[family-name:var(--jm-font-mono)] text-jm-xs">{inc.incomingNo}</JmTableCell>
                      <JmTableCell className="text-jm-sm">{isoToKr(inc.incomingDate)}</JmTableCell>
                      <JmTableCell>
                        <JmBadge
                          size="sm"
                          variant={inc.status === "CONFIRMED" ? "success" : inc.status === "CANCELLED" ? "danger" : "default"}
                        >
                          {inc.status === "PENDING" ? "대기" : inc.status === "CONFIRMED" ? "확정" : "취소"}
                        </JmBadge>
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums">
                        ₩{parseFloat(inc.totalAmount).toLocaleString("ko-KR")}
                      </JmTableCell>
                    </JmTableRow>
                  ))}
                </JmTableBody>
              </JmTable>
            </div>
          </JmCard>
        )}
      </JmContainer>

      {/* 토큰 링크 다이얼로그 */}
      <JmDialog open={tokenLink !== null} onOpenChange={(v) => !v && setTokenLink(null)}>
        <JmDialogContent size="md">
          <JmDialogHeader>
            <JmDialogTitle>거래처용 링크가 발급되었습니다</JmDialogTitle>
            <JmDialogDescription>
              아래 링크를 카톡·문자·이메일 등으로 거래처에 전달하세요. 거래처가 수락 버튼을 누르면 발주 상태가 자동으로 전환됩니다.
            </JmDialogDescription>
          </JmDialogHeader>
          <JmDialogBody>
            <div className="space-y-3">
              <div className="flex gap-2">
                <JmInput value={tokenLink ?? ""} readOnly className="font-[family-name:var(--jm-font-mono)] text-jm-xs" />
                <JmIconButton
                  aria-label="복사"
                  onClick={async () => {
                    if (!tokenLink) return;
                    try {
                      await navigator.clipboard.writeText(tokenLink);
                      toast.success("링크가 복사되었습니다");
                    } catch {
                      toast.error("클립보드 복사 실패");
                    }
                  }}
                >
                  <Copy />
                </JmIconButton>
              </div>
              <div className="rounded-md border border-[color-mix(in_oklch,var(--jm-warning-fg)_30%,transparent)] bg-[var(--jm-warning-bg)] p-3 text-jm-xs text-[var(--jm-warning-fg)]">
                <div className="mb-1 font-semibold">⚠ 보안 주의</div>
                <ul className="list-disc space-y-0.5 pl-4">
                  <li>이 링크는 30일 후 만료됩니다.</li>
                  <li>거래처에게만 전달하세요. 링크를 가진 사람은 누구나 발주 내용을 보고 수락할 수 있습니다.</li>
                  <li>재발급 시 이전 링크는 즉시 무효화됩니다.</li>
                </ul>
              </div>
            </div>
          </JmDialogBody>
        </JmDialogContent>
      </JmDialog>

      {/* 확인 다이얼로그 (close/cancel/delete) */}
      <JmDialog open={confirmAction !== null} onOpenChange={(v) => !v && setConfirmAction(null)}>
        <JmDialogContent size="sm">
          <JmDialogHeader>
            <JmDialogTitle>
              {confirmAction === "close" && "부분입고로 종결하시겠습니까?"}
              {confirmAction === "cancel" && "발주를 취소하시겠습니까?"}
              {confirmAction === "delete" && "발주를 삭제하시겠습니까?"}
            </JmDialogTitle>
            <JmDialogDescription>
              {confirmAction === "close" && "이미 입고된 분량만 인정하고, 잔량은 받지 않고 종결됩니다. 이후 추가 입고는 불가능합니다."}
              {confirmAction === "cancel" && "발주 자체를 취소합니다. 입고가 진행 중이면 취소할 수 없습니다."}
              {confirmAction === "delete" && "이 작업은 되돌릴 수 없습니다."}
            </JmDialogDescription>
          </JmDialogHeader>
          <JmDialogFooter>
            <JmButton variant="ghost" onClick={() => setConfirmAction(null)}>취소</JmButton>
            <JmButton
              variant={confirmAction === "delete" || confirmAction === "cancel" ? "danger" : "cta"}
              onClick={() => {
                if (confirmAction === "close") statusMutation.mutate("CLOSED");
                if (confirmAction === "cancel") statusMutation.mutate("CANCELLED");
                if (confirmAction === "delete") deleteMutation.mutate();
                setConfirmAction(null);
              }}
              disabled={statusMutation.isPending || deleteMutation.isPending}
            >
              {(statusMutation.isPending || deleteMutation.isPending) && <Loader2 className="animate-spin" />}
              확인
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>
    </div>
  );
}

function InfoField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="mb-0.5 text-jm-2xs text-[var(--jm-text-muted)]">{label}</div>
      <div className={cn("text-jm-sm", mono && "font-[family-name:var(--jm-font-mono)]")}>{value}</div>
    </div>
  );
}

// ============================================================
// 단가 협상 카드 (CounterOfferCard)
// ============================================================

function CounterOfferCard({
  items,
  onAccept,
  onReject,
  pending,
}: {
  items: PurchaseOrderDetail["items"];
  onAccept: () => void;
  onReject: (note?: string) => void;
  pending: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState<"accept" | "reject" | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const changes = items.filter((it) => it.proposedUnitPrice != null);
  const oldTotal = items.reduce((s, it) => s + parseFloat(it.unitPrice) * parseFloat(it.quantity), 0);
  const newTotal = items.reduce((s, it) => {
    const unit = it.proposedUnitPrice ? parseFloat(it.proposedUnitPrice) : parseFloat(it.unitPrice);
    return s + unit * parseFloat(it.quantity);
  }, 0);
  const diff = newTotal - oldTotal;
  const totalPct = oldTotal !== 0 ? (diff / oldTotal) * 100 : 0;

  return (
    <JmCard className="border-[color-mix(in_oklch,var(--jm-warning-fg)_30%,transparent)] bg-[var(--jm-warning-bg)] p-0">
      <JmCardHeader>
        <JmCardTitle className="flex items-center gap-2 text-[var(--jm-warning-fg)]">
          <Pencil className="size-4" />
          거래처 단가 변경 요청 ({changes.length}건)
        </JmCardTitle>
      </JmCardHeader>
      <JmCardContent className="space-y-3 px-5 pb-5">
        <div className="overflow-hidden rounded-xl border border-[var(--jm-border)] bg-[var(--jm-bg)]">
          <JmTable>
            <JmTableHeader>
              <JmTableRow>
                <JmTableHead>공급상품</JmTableHead>
                <JmTableHead className="w-[80px] text-right">수량</JmTableHead>
                <JmTableHead className="w-[110px] text-right">기존 단가</JmTableHead>
                <JmTableHead className="w-[110px] text-right">제안 단가</JmTableHead>
                <JmTableHead className="w-[120px] text-right">단가 차액 (%)</JmTableHead>
                <JmTableHead className="w-[120px] text-right">금액 차액</JmTableHead>
              </JmTableRow>
            </JmTableHeader>
            <JmTableBody>
              {changes.map((it) => {
                const qty = parseFloat(it.quantity);
                const oldUnit = parseFloat(it.unitPrice);
                const newUnit = parseFloat(it.proposedUnitPrice!);
                const unitDiff = newUnit - oldUnit;
                const lineDiff = unitDiff * qty;
                const pct = oldUnit !== 0 ? (unitDiff / oldUnit) * 100 : 0;
                const tone =
                  unitDiff > 0
                    ? "text-[var(--jm-danger-fg)]"
                    : unitDiff < 0
                      ? "text-[var(--jm-success-fg)]"
                      : "text-[var(--jm-text-muted)]";
                return (
                  <JmTableRow key={it.id}>
                    <JmTableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {it.supplierProduct?.name ?? it.name ?? "-"}
                        </span>
                        {it.supplierProduct?.spec && (
                          <span className="text-jm-2xs text-[var(--jm-text-muted)]">{it.supplierProduct.spec}</span>
                        )}
                      </div>
                    </JmTableCell>
                    <JmTableCell className="text-right tabular-nums">{qty.toLocaleString("ko-KR")}</JmTableCell>
                    <JmTableCell className="text-right tabular-nums text-[var(--jm-text-muted)] line-through">
                      ₩{oldUnit.toLocaleString("ko-KR")}
                    </JmTableCell>
                    <JmTableCell className="text-right tabular-nums font-semibold text-[var(--jm-warning-fg)]">
                      ₩{newUnit.toLocaleString("ko-KR")}
                    </JmTableCell>
                    <JmTableCell className={cn("text-right tabular-nums", tone)}>
                      <div className="flex flex-col items-end leading-tight">
                        <span>
                          {unitDiff > 0 ? "+" : unitDiff < 0 ? "−" : ""}₩{Math.abs(unitDiff).toLocaleString("ko-KR")}
                        </span>
                        <span className="text-jm-3xs">
                          ({pct > 0 ? "+" : pct < 0 ? "−" : ""}{Math.abs(pct).toFixed(1)}%)
                        </span>
                      </div>
                    </JmTableCell>
                    <JmTableCell className={cn("text-right tabular-nums", tone)}>
                      {lineDiff > 0 ? "+" : lineDiff < 0 ? "−" : ""}₩{Math.abs(lineDiff).toLocaleString("ko-KR")}
                    </JmTableCell>
                  </JmTableRow>
                );
              })}
            </JmTableBody>
          </JmTable>
        </div>
        <div className="flex items-baseline justify-between text-jm-sm">
          <span className="text-[var(--jm-text-muted)]">기존 합계 → 제안 합계</span>
          <span className="tabular-nums">
            <span className="text-[var(--jm-text-muted)] line-through">₩{oldTotal.toLocaleString("ko-KR")}</span>
            <span className="mx-2">→</span>
            <span className="font-semibold">₩{newTotal.toLocaleString("ko-KR")}</span>
            <span className={cn(
              "ml-2",
              diff > 0 ? "text-[var(--jm-danger-fg)]" : diff < 0 ? "text-[var(--jm-success-fg)]" : "text-[var(--jm-text-muted)]"
            )}>
              ({diff > 0 ? "+" : diff < 0 ? "−" : ""}₩{Math.abs(diff).toLocaleString("ko-KR")},{" "}
              {totalPct > 0 ? "+" : totalPct < 0 ? "−" : ""}{Math.abs(totalPct).toFixed(1)}%)
            </span>
          </span>
        </div>
        <div className="flex gap-2 pt-1">
          <JmButton size="sm" onClick={() => setConfirmOpen("accept")} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            제안 단가 수락
          </JmButton>
          <JmButton size="sm" variant="outline" onClick={() => setConfirmOpen("reject")} disabled={pending}>
            거절 (기존 단가 유지)
          </JmButton>
        </div>
      </JmCardContent>

      <JmDialog
        open={confirmOpen !== null}
        onOpenChange={(v) => {
          if (!v) {
            setConfirmOpen(null);
            setRejectNote("");
          }
        }}
      >
        <JmDialogContent size="md">
          <JmDialogHeader>
            <JmDialogTitle>
              {confirmOpen === "accept" ? "제안 단가를 수락하시겠습니까?" : "제안을 거절하시겠습니까?"}
            </JmDialogTitle>
            <JmDialogDescription>
              {confirmOpen === "accept"
                ? `발주 항목 단가가 거래처 제안 값으로 갱신되고, 발주 상태는 '수락' 으로 전환됩니다. 합계: ₩${newTotal.toLocaleString("ko-KR")}`
                : "거래처 제안 단가는 적용되지 않고 발주 상태가 '발송' 으로 되돌아갑니다. 거절 사유는 거래처가 토큰 페이지에서 확인할 수 있습니다."}
            </JmDialogDescription>
          </JmDialogHeader>
          {confirmOpen === "reject" && (
            <JmDialogBody>
              <label className="flex flex-col gap-1.5">
                <span className="text-jm-xs text-[var(--jm-text-muted)]">거절 사유 (선택, 거래처에 표시됨)</span>
                <JmTextarea
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="예) 시장가 대비 인상폭이 큽니다. 재협의 부탁드립니다."
                  rows={3}
                  maxLength={500}
                />
              </label>
            </JmDialogBody>
          )}
          <JmDialogFooter>
            <JmButton variant="ghost" onClick={() => { setConfirmOpen(null); setRejectNote(""); }}>취소</JmButton>
            <JmButton
              onClick={() => {
                if (confirmOpen === "accept") onAccept();
                if (confirmOpen === "reject") onReject(rejectNote.trim() || undefined);
                setConfirmOpen(null);
                setRejectNote("");
              }}
            >
              확인
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>
    </JmCard>
  );
}

// ============================================================
// 거래처 발송 토큰 카드 (AccessTokenCard)
// ============================================================

const TOKEN_STATUS_LABEL: Record<AccessToken["status"], string> = {
  ACTIVE: "활성 (미열람)",
  VIEWED: "활성 (열람됨)",
  ACCEPTED: "수락됨",
  REJECTED: "거절됨",
  EXPIRED: "만료",
  REVOKED: "재발급으로 폐기",
};

const TOKEN_STATUS_VARIANT: Record<AccessToken["status"], "default" | "info" | "success" | "danger"> = {
  ACTIVE: "info",
  VIEWED: "info",
  ACCEPTED: "success",
  REJECTED: "danger",
  EXPIRED: "default",
  REVOKED: "default",
};

function AccessTokenCard({ tokens }: { tokens: AccessToken[] }) {
  const [showHistory, setShowHistory] = useState(false);
  const active = tokens.find((t) => t.status === "ACTIVE" || t.status === "VIEWED");
  const history = tokens.filter((t) => t !== active);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const buildUrl = (token: string) => `${baseUrl}/external/po/${token}`;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("링크가 복사되었습니다");
    } catch {
      toast.error("클립보드 복사 실패");
    }
  };

  return (
    <JmCard>
      <JmCardHeader>
        <JmCardTitle className="flex items-center gap-2">
          <Link2 className="size-4" />
          거래처 발송 링크
        </JmCardTitle>
      </JmCardHeader>
      <JmCardContent className="space-y-3">
        {active ? (
          <div className="rounded-lg border border-[color-mix(in_oklch,var(--jm-info-fg)_30%,transparent)] bg-[var(--jm-info-bg)]/30 p-3">
            <div className="mb-2 flex items-center gap-2">
              <JmBadge variant={TOKEN_STATUS_VARIANT[active.status]} size="sm">
                {TOKEN_STATUS_LABEL[active.status]}
              </JmBadge>
              <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                발급: {new Date(active.issuedAt).toLocaleString("ko-KR")}
              </span>
            </div>
            <div className="mb-2 flex gap-2">
              <JmInput value={buildUrl(active.token)} readOnly className="font-[family-name:var(--jm-font-mono)] text-jm-xs" />
              <JmIconButton aria-label="복사" onClick={() => copy(buildUrl(active.token))}>
                <Copy />
              </JmIconButton>
            </div>
            <div className="grid grid-cols-2 gap-2 text-jm-xs text-[var(--jm-text-muted)] md:grid-cols-4">
              <Metric label="조회수" value={`${active.viewCount}회`} />
              <Metric label="처음 열람" value={active.firstViewedAt ? new Date(active.firstViewedAt).toLocaleString("ko-KR") : "-"} />
              <Metric label="최근 열람" value={active.lastViewedAt ? new Date(active.lastViewedAt).toLocaleString("ko-KR") : "-"} />
              <Metric label="만료" value={new Date(active.expiresAt).toLocaleString("ko-KR")} />
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-[var(--jm-border)] bg-[var(--jm-surface-muted)]/50 p-3 text-jm-xs text-[var(--jm-text-muted)]">
            활성 링크가 없습니다. &quot;거래처 발송 (링크 발급)&quot; 버튼으로 새로 발급하세요.
          </div>
        )}

        {history.length > 0 && (
          <div>
            <button
              type="button"
              className="text-jm-xs text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
              onClick={() => setShowHistory((v) => !v)}
            >
              {showHistory ? "이력 숨기기" : `이력 ${history.length}건 보기`}
            </button>
            {showHistory && (
              <div className="mt-2 space-y-2">
                {history.map((t) => (
                  <div key={t.id} className="rounded border border-[var(--jm-border)] bg-[var(--jm-surface)] p-2 text-jm-xs">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <JmBadge variant={TOKEN_STATUS_VARIANT[t.status]} size="sm">
                        {TOKEN_STATUS_LABEL[t.status]}
                      </JmBadge>
                      <span className="text-jm-3xs text-[var(--jm-text-muted)]">
                        {new Date(t.issuedAt).toLocaleString("ko-KR")}
                      </span>
                    </div>
                    <div className="text-jm-2xs text-[var(--jm-text-muted)]">
                      조회 {t.viewCount}회
                      {t.acceptedAt && ` · 수락 ${new Date(t.acceptedAt).toLocaleString("ko-KR")}`}
                      {t.rejectedAt && ` · 거절 ${new Date(t.rejectedAt).toLocaleString("ko-KR")}`}
                    </div>
                    {t.rejectionNote && (
                      <div className="mt-1 rounded bg-[var(--jm-danger-bg)] px-2 py-1 text-jm-2xs text-[var(--jm-danger-fg)]">
                        거절 사유: {t.rejectionNote}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </JmCardContent>
    </JmCard>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-jm-3xs">{label}</div>
      <div className="text-[var(--jm-text)]">{value}</div>
    </div>
  );
}
