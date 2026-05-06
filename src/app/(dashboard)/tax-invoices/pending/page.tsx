"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { CheckCircle, Receipt, Clock, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <h1 className="text-lg font-semibold">세금계산서 발행 대기</h1>
        <span className="text-[12px] text-muted-foreground">
          POS 결제 시 발행 요청한 주문 큐
        </span>
        <div className="ml-auto flex items-center gap-2 text-[13px]">
          <span className="text-muted-foreground">발행 완료 포함</span>
          <Switch
            checked={includeInvoiced}
            onCheckedChange={setIncludeInvoiced}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="mb-5 grid grid-cols-3 gap-3">
          <KpiCard
            icon={<Clock className="size-4" />}
            label="대기 건수"
            value={summary?.pendingCount.toLocaleString("ko-KR") ?? "0"}
            loading={dataQuery.isPending}
          />
          <KpiCard
            icon={<Receipt className="size-4" />}
            label="대기 합계 (총액)"
            value={`₩${(summary?.pendingAmount ?? 0).toLocaleString("ko-KR")}`}
            loading={dataQuery.isPending}
          />
          <KpiCard
            icon={<Receipt className="size-4" />}
            label="대기 세액 합계"
            value={`₩${(summary?.pendingTaxAmount ?? 0).toLocaleString("ko-KR")}`}
            loading={dataQuery.isPending}
          />
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {includeInvoiced ? "전체 (발행 완료 포함)" : "발행 대기"}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table className="min-w-[1100px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">주문일</TableHead>
                  <TableHead className="w-[140px]">주문번호</TableHead>
                  <TableHead>고객</TableHead>
                  <TableHead className="w-[140px]">사업자번호</TableHead>
                  <TableHead className="w-[120px] text-right">공급가액</TableHead>
                  <TableHead className="w-[100px] text-right">세액</TableHead>
                  <TableHead className="w-[100px]">발행</TableHead>
                  <TableHead className="w-[110px]">동작</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dataQuery.isPending ? (
                  <SkeletonRows />
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-12 text-center text-muted-foreground"
                    >
                      {includeInvoiced
                        ? "세금계산서 발행 요청된 주문이 없습니다"
                        : "발행 대기 중인 주문이 없습니다"}
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((it) => {
                    const supply = it.totalAmount - it.taxAmount;
                    const isPending = !it.taxInvoicedAt;
                    return (
                      <TableRow key={it.id}>
                        <TableCell className="font-mono text-[12px] text-muted-foreground">
                          {format(new Date(it.orderDate), "yyyy-MM-dd")}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => router.push(`/orders/${it.id}`)}
                            className="font-mono text-[13px] hover:underline"
                          >
                            {it.orderNo}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {it.customerName ?? "(미등록)"}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {[it.ceo, it.email, it.customerPhone]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-[12px]">
                          {it.businessNumber ?? (
                            <span className="text-muted-foreground">
                              사업자번호 없음
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          ₩{supply.toLocaleString("ko-KR")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          ₩{it.taxAmount.toLocaleString("ko-KR")}
                        </TableCell>
                        <TableCell>
                          {isPending ? (
                            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                              대기
                            </Badge>
                          ) : (
                            <div className="flex flex-col">
                              <Badge variant="default" className="w-fit">
                                완료
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {format(new Date(it.taxInvoicedAt!), "MM-dd", {
                                  locale: ko,
                                })}
                              </span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {isPending ? (
                            <Button
                              size="sm"
                              className="h-7 gap-1 text-[12px]"
                              disabled={
                                markMutation.isPending &&
                                markMutation.variables?.id === it.id
                              }
                              onClick={() =>
                                markMutation.mutate({
                                  id: it.id,
                                  invoiced: true,
                                })
                              }
                            >
                              <CheckCircle className="size-3" />
                              발행 완료
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 text-[12px]"
                              disabled={
                                markMutation.isPending &&
                                markMutation.variables?.id === it.id
                              }
                              onClick={() =>
                                markMutation.mutate({
                                  id: it.id,
                                  invoiced: false,
                                })
                              }
                            >
                              <RotateCcw className="size-3" />
                              취소
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
        <CardTitle className="text-[12px] font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-7 w-32" />
        ) : (
          <div className="text-xl font-bold tabular-nums">{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 8 }).map((__, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-20" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
