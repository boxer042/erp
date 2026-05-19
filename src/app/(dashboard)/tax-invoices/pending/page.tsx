"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { CheckCircle, Clock, Receipt, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import {
  JmBadge,
  JmButton,
  JmCard,
  JmEmpty,
  JmIconButton,
  JmSkeleton,
  JmSpinner,
  JmStat,
  JmSwitch,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
  JmTableToolbar,
  JmTableToolbarActions,
  JmTableToolbarFilters,
} from "@/jm";
import { TaxInvoicesThemeScope } from "../_theme-scope";

interface PendingItem {
  id: string;
  orderNo: string;
  orderDate: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  businessNumber: string | null;
  ceo: string | null;
  email: string | null;
  address: string | null;
  totalAmount: number;
  taxAmount: number;
  paymentMethod: string | null;
  channelName: string | null;
  taxInvoicedAt: string | null;
}

interface Response {
  items: PendingItem[];
  summary: {
    pendingCount: number;
    pendingAmount: number;
    pendingTaxAmount: number;
  };
}

function TaxInvoiceSkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <JmTableRow key={i} className="hover:bg-transparent">
          <JmTableCell>
            <JmSkeleton className="h-4 w-24" />
          </JmTableCell>
          <JmTableCell>
            <JmSkeleton className="h-4 w-32" />
          </JmTableCell>
          <JmTableCell>
            <JmSkeleton className="h-4 w-28" />
          </JmTableCell>
          <JmTableCell>
            <JmSkeleton className="h-4 w-28" />
          </JmTableCell>
          <JmTableCell>
            <div className="flex justify-end">
              <JmSkeleton className="h-4 w-20" />
            </div>
          </JmTableCell>
          <JmTableCell>
            <div className="flex justify-end">
              <JmSkeleton className="h-4 w-16" />
            </div>
          </JmTableCell>
          <JmTableCell>
            <JmSkeleton className="h-5 w-12 rounded-full" />
          </JmTableCell>
          <JmTableCell>
            <JmSkeleton className="h-7 w-20 rounded-md" />
          </JmTableCell>
        </JmTableRow>
      ))}
    </>
  );
}

export default function TaxInvoicesPendingPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [includeInvoiced, setIncludeInvoiced] = useState(false);

  const dataQuery = useQuery<Response>({
    queryKey: ["tax-invoices-pending", includeInvoiced],
    queryFn: () =>
      apiGet<Response>(
        `/api/tax-invoices/pending${includeInvoiced ? "?includeInvoiced=1" : ""}`,
      ),
  });

  const markMutation = useMutation({
    mutationFn: ({ id, invoiced }: { id: string; invoiced: boolean }) =>
      apiMutate(`/api/orders/${id}/tax-invoice`, "POST", { invoiced }),
    onSuccess: (_, vars) => {
      toast.success(vars.invoiced ? "발행 완료 처리됨" : "미발행으로 되돌림");
      qc.invalidateQueries({ queryKey: ["tax-invoices-pending"] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "처리 실패"),
  });

  const items = dataQuery.data?.items ?? [];
  const summary = dataQuery.data?.summary;
  const isPending = dataQuery.isPending;
  const isError = dataQuery.isError;

  return (
    <TaxInvoicesThemeScope>
      <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
        <div className="flex w-full flex-col gap-6 p-4">
          {/* KPI */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <JmStat
              label="대기 건수"
              value={isPending ? "—" : (summary?.pendingCount ?? 0).toLocaleString("ko-KR")}
              icon={<Clock className="size-4" />}
              hint={isPending ? "" : "발행 미완료"}
              size="sm"
            />
            <JmStat
              label="대기 합계 (총액)"
              value={isPending ? "—" : `₩${(summary?.pendingAmount ?? 0).toLocaleString("ko-KR")}`}
              icon={<Receipt className="size-4" />}
              hint={isPending ? "" : "공급가액 기준"}
              size="sm"
            />
            <JmStat
              label="대기 세액 합계"
              value={isPending ? "—" : `₩${(summary?.pendingTaxAmount ?? 0).toLocaleString("ko-KR")}`}
              icon={<Receipt className="size-4" />}
              hint={isPending ? "" : "부가세 합계"}
              size="sm"
            />
          </div>

          {/* 메인 카드 */}
          <JmCard className="overflow-hidden p-0">
            <JmTableToolbar>
              <JmTableToolbarFilters>
                <div className="flex items-center gap-2">
                  <span className="text-jm-sm text-[var(--jm-text-muted)]">발행 완료 포함</span>
                  <JmSwitch
                    checked={includeInvoiced}
                    onCheckedChange={setIncludeInvoiced}
                    size="sm"
                  />
                </div>
              </JmTableToolbarFilters>
              <JmTableToolbarActions>
                <JmIconButton
                  variant="ghost"
                  size="sm"
                  aria-label="새로고침"
                  onClick={() => dataQuery.refetch()}
                  disabled={dataQuery.isFetching}
                >
                  {dataQuery.isFetching ? (
                    <JmSpinner size="sm" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                </JmIconButton>
              </JmTableToolbarActions>
            </JmTableToolbar>

            <JmTable className="min-w-[1100px]">
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead className="w-[110px]">주문일</JmTableHead>
                  <JmTableHead className="w-[140px]">주문번호</JmTableHead>
                  <JmTableHead>고객</JmTableHead>
                  <JmTableHead className="w-[140px]">사업자번호</JmTableHead>
                  <JmTableHead className="w-[120px] text-right">공급가액</JmTableHead>
                  <JmTableHead className="w-[100px] text-right">세액</JmTableHead>
                  <JmTableHead className="w-[100px]">발행</JmTableHead>
                  <JmTableHead className="w-[110px]">동작</JmTableHead>
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {isPending ? (
                  <TaxInvoiceSkeletonRows />
                ) : isError ? (
                  <JmTableRow className="hover:bg-transparent">
                    <JmTableCell
                      colSpan={8}
                      className="py-10 text-center text-jm-sm text-[var(--jm-danger-fg)]"
                    >
                      데이터를 불러오지 못했습니다
                    </JmTableCell>
                  </JmTableRow>
                ) : items.length === 0 ? (
                  <JmTableRow className="hover:bg-transparent">
                    <JmTableCell colSpan={8} className="py-12">
                      <JmEmpty
                        icon={<Receipt className="size-8" />}
                        title={
                          includeInvoiced
                            ? "세금계산서 발행 요청된 주문이 없습니다"
                            : "발행 대기 중인 주문이 없습니다"
                        }
                        description={
                          includeInvoiced
                            ? "POS 결제 시 세금계산서를 요청한 주문이 없습니다"
                            : "발행 완료 포함 토글로 전체 내역을 확인할 수 있습니다"
                        }
                      />
                    </JmTableCell>
                  </JmTableRow>
                ) : (
                  items.map((it) => {
                    const supply = it.totalAmount - it.taxAmount;
                    const isPendingItem = !it.taxInvoicedAt;
                    const isMutating =
                      markMutation.isPending &&
                      markMutation.variables?.id === it.id;
                    return (
                      <JmTableRow key={it.id}>
                        <JmTableCell className="font-[family-name:var(--jm-font-mono)] text-jm-xs text-[var(--jm-text-muted)]">
                          {format(new Date(it.orderDate), "yyyy-MM-dd")}
                        </JmTableCell>
                        <JmTableCell>
                          <button
                            type="button"
                            onClick={() => router.push(`/orders/${it.id}`)}
                            className="font-[family-name:var(--jm-font-mono)] text-jm-sm text-[var(--jm-action)] hover:underline"
                          >
                            {it.orderNo}
                          </button>
                        </JmTableCell>
                        <JmTableCell>
                          <div className="flex flex-col">
                            <span className="text-jm-sm font-medium text-[var(--jm-text)]">
                              {it.customerName ?? "(미등록)"}
                            </span>
                            <span className="text-jm-xs text-[var(--jm-text-muted)]">
                              {[it.ceo, it.email, it.customerPhone]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </div>
                        </JmTableCell>
                        <JmTableCell className="font-[family-name:var(--jm-font-mono)] text-jm-xs text-[var(--jm-text)]">
                          {it.businessNumber ?? (
                            <span className="text-[var(--jm-text-subtle)]">
                              사업자번호 없음
                            </span>
                          )}
                        </JmTableCell>
                        <JmTableCell className="text-right tabular-nums text-jm-sm text-[var(--jm-text)]">
                          ₩{supply.toLocaleString("ko-KR")}
                        </JmTableCell>
                        <JmTableCell className="text-right tabular-nums text-jm-sm text-[var(--jm-text-muted)]">
                          ₩{it.taxAmount.toLocaleString("ko-KR")}
                        </JmTableCell>
                        <JmTableCell>
                          {isPendingItem ? (
                            <JmBadge variant="warning" size="sm">
                              대기
                            </JmBadge>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              <JmBadge variant="success" size="sm">
                                완료
                              </JmBadge>
                              <span className="text-jm-3xs text-[var(--jm-text-muted)]">
                                {format(new Date(it.taxInvoicedAt!), "MM-dd", {
                                  locale: ko,
                                })}
                              </span>
                            </div>
                          )}
                        </JmTableCell>
                        <JmTableCell>
                          {isPendingItem ? (
                            <JmButton
                              size="xs"
                              variant="cta"
                              disabled={isMutating}
                              onClick={() =>
                                markMutation.mutate({ id: it.id, invoiced: true })
                              }
                            >
                              {isMutating ? (
                                <JmSpinner size="sm" tone="inverted" />
                              ) : (
                                <CheckCircle className="size-3" />
                              )}
                              발행 완료
                            </JmButton>
                          ) : (
                            <JmButton
                              size="xs"
                              variant="ghost"
                              disabled={isMutating}
                              onClick={() =>
                                markMutation.mutate({ id: it.id, invoiced: false })
                              }
                            >
                              {isMutating ? (
                                <JmSpinner size="sm" />
                              ) : (
                                <RotateCcw className="size-3" />
                              )}
                              취소
                            </JmButton>
                          )}
                        </JmTableCell>
                      </JmTableRow>
                    );
                  })
                )}
              </JmTableBody>
            </JmTable>
          </JmCard>
        </div>
      </div>
    </TaxInvoicesThemeScope>
  );
}
