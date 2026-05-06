"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import {
  ChevronLeft,
  Wrench,
  Truck,
  Check,
  PackageCheck,
  Truck as TruckIcon,
  CheckCircle,
  XCircle,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

interface OrderDetail {
  id: string;
  orderNo: string;
  channelOrderNo: string | null;
  status: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  shippingAddress: string | null;
  orderDate: string;
  subtotalAmount: string;
  discountAmount: string;
  shippingFee: string;
  taxAmount: string;
  totalAmount: string;
  commissionAmount: string;
  paymentMethod: string | null;
  taxInvoiceRequested: boolean;
  taxInvoicedAt: string | null;
  memo: string | null;
  repairTicketId: string | null;
  rentalId: string | null;
  channel: {
    name: string;
    code: string;
    commissionRate: string;
  } | null;
  createdBy: { name: string };
  items: Array<{
    id: string;
    productId: string | null;
    quantity: string;
    unitPrice: string;
    totalPrice: string;
    serviceName: string | null;
    product: {
      id: string;
      name: string;
      sku: string;
      isSet: boolean;
    } | null;
  }>;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "대기",
  CONFIRMED: "확정",
  PREPARING: "준비중",
  SHIPPED: "배송중",
  DELIVERED: "완료",
  CANCELLED: "취소",
  RETURNED: "반품",
};

const STATUS_TONE: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  PENDING: "outline",
  CONFIRMED: "default",
  PREPARING: "secondary",
  SHIPPED: "secondary",
  DELIVERED: "default",
  CANCELLED: "destructive",
  RETURNED: "destructive",
};

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  MIXED: "혼합",
  UNPAID: "외상",
};

export default function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();

  const orderQuery = useQuery<OrderDetail>({
    queryKey: ["order", id],
    queryFn: () => apiGet<OrderDetail>(`/api/orders/${id}`),
  });

  const transitionMutation = useMutation<unknown, Error, string>({
    mutationFn: (action: string) =>
      apiMutate(`/api/orders/${id}`, "PUT", { action }),
    onSuccess: (_, action) => {
      const labels: Record<string, string> = {
        confirm: "확정",
        prepare: "준비중 전환",
        ship: "배송 시작",
        deliver: "배송 완료",
        cancel: "취소",
        return: "반품 처리",
      };
      toast.success(labels[action] ?? "처리됨");
      qc.invalidateQueries({ queryKey: ["order", id] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "처리 실패"),
  });

  if (orderQuery.isPending) {
    return <DetailSkeleton onBack={() => router.push("/orders")} />;
  }

  if (orderQuery.isError || !orderQuery.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="text-[15px] font-semibold">
          주문을 찾을 수 없습니다
        </span>
        <Button variant="outline" onClick={() => router.push("/orders")}>
          목록으로
        </Button>
      </div>
    );
  }

  const order = orderQuery.data;
  const subtotal = Number(order.subtotalAmount);
  const discount = Number(order.discountAmount);
  const shipping = Number(order.shippingFee);
  const tax = Number(order.taxAmount);
  const total = Number(order.totalAmount);
  const commission = Number(order.commissionAmount);

  // 다음 가능한 액션 — status 별 분기
  const nextActions: Array<{
    action: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    primary?: boolean;
    destructive?: boolean;
  }> = (() => {
    if (order.status === "PENDING")
      return [
        { action: "confirm", label: "확정", icon: Check, primary: true },
        { action: "cancel", label: "취소", icon: XCircle, destructive: true },
      ];
    if (order.status === "CONFIRMED")
      return [
        { action: "prepare", label: "준비 시작", icon: PackageCheck, primary: true },
        { action: "cancel", label: "취소", icon: XCircle, destructive: true },
      ];
    if (order.status === "PREPARING")
      return [{ action: "ship", label: "배송 시작", icon: TruckIcon, primary: true }];
    if (order.status === "SHIPPED")
      return [
        { action: "deliver", label: "배송 완료", icon: CheckCircle, primary: true },
      ];
    if (order.status === "DELIVERED")
      return [{ action: "return", label: "반품 처리", icon: RotateCcw }];
    return [];
  })();
  const isPending = transitionMutation.isPending;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.back()}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <h1 className="text-lg font-semibold font-mono">{order.orderNo}</h1>
        <Badge variant={STATUS_TONE[order.status]}>
          {STATUS_LABEL[order.status] ?? order.status}
        </Badge>
        {order.repairTicketId && (
          <button
            type="button"
            onClick={() =>
              router.push(`/pos/repair-v2/${order.repairTicketId}`)
            }
            className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 hover:bg-amber-200"
          >
            <Wrench className="size-3" />
            연결 수리
          </button>
        )}
        {order.rentalId && (
          <button
            type="button"
            onClick={() => router.push(`/rentals/${order.rentalId}`)}
            className="flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800 hover:bg-sky-200"
          >
            <Truck className="size-3" />
            연결 임대
          </button>
        )}
        {/* 상태 전환 버튼들 — 우측 정렬 */}
        <div className="ml-auto flex items-center gap-2">
          {nextActions.map((a) => {
            const Icon = a.icon;
            return (
              <Button
                key={a.action}
                size="sm"
                variant={a.destructive ? "destructive" : a.primary ? "default" : "outline"}
                disabled={isPending}
                onClick={() => {
                  if (a.destructive) {
                    if (!confirm(`"${a.label}" 처리하시겠습니까?`)) return;
                  }
                  transitionMutation.mutate(a.action);
                }}
                className="h-8 gap-1.5"
              >
                <Icon className="size-3.5" />
                {a.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="grid gap-5 md:grid-cols-3">
          {/* 좌측: 주문 정보 */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">주문 항목</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>상품</TableHead>
                    <TableHead className="w-[80px] text-right">수량</TableHead>
                    <TableHead className="w-[100px] text-right">단가</TableHead>
                    <TableHead className="w-[110px] text-right">금액</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="py-6 text-center text-muted-foreground"
                      >
                        항목이 없습니다
                      </TableCell>
                    </TableRow>
                  ) : (
                    order.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {item.product?.name ?? item.serviceName ?? "(이름없음)"}
                            </span>
                            {item.product?.sku && (
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {item.product.sku}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(item.quantity).toLocaleString("ko-KR")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          ₩{Number(item.unitPrice).toLocaleString("ko-KR")}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          ₩{Number(item.totalPrice).toLocaleString("ko-KR")}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* 우측 상단: 메타 정보 */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">기본 정보</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="채널" value={order.channel?.name ?? "POS"} />
                <Row
                  label="주문일"
                  value={format(new Date(order.orderDate), "yyyy-MM-dd HH:mm", {
                    locale: ko,
                  })}
                />
                <Row
                  label="결제수단"
                  value={
                    order.paymentMethod
                      ? PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod
                      : "-"
                  }
                />
                <Row label="처리자" value={order.createdBy?.name ?? "-"} />
                {order.channelOrderNo && (
                  <Row label="채널 주문번호" value={order.channelOrderNo} />
                )}
                {order.taxInvoiceRequested && (
                  <Row
                    label="세금계산서"
                    value={
                      order.taxInvoicedAt
                        ? `발행 (${format(
                            new Date(order.taxInvoicedAt),
                            "yyyy-MM-dd",
                          )})`
                        : "발행 요청됨 (대기)"
                    }
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">고객</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {order.customerName ? (
                  <>
                    <Row label="이름" value={order.customerName} />
                    {order.customerPhone && (
                      <Row label="전화" value={order.customerPhone} />
                    )}
                    {order.shippingAddress && (
                      <Row label="배송지" value={order.shippingAddress} />
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">미등록 고객</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">금액</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <Row label="공급가액" value={`₩${subtotal.toLocaleString("ko-KR")}`} />
                {discount > 0 && (
                  <Row
                    label="할인"
                    value={`−₩${discount.toLocaleString("ko-KR")}`}
                  />
                )}
                {shipping > 0 && (
                  <Row label="배송비" value={`₩${shipping.toLocaleString("ko-KR")}`} />
                )}
                <Row label="세액" value={`₩${tax.toLocaleString("ko-KR")}`} />
                <div className="border-t pt-1.5 mt-1.5 flex justify-between text-base font-bold">
                  <span>합계</span>
                  <span className="tabular-nums">
                    ₩{total.toLocaleString("ko-KR")}
                  </span>
                </div>
                {commission > 0 && order.channel && (
                  <p className="pt-1 text-[11px] text-muted-foreground">
                    수수료 ({(Number(order.channel.commissionRate) * 100).toFixed(1)}%): ₩
                    {commission.toLocaleString("ko-KR")}
                  </p>
                )}
              </CardContent>
            </Card>

            {order.memo && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">메모</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{order.memo}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
}

function DetailSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onBack}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        <div className="grid gap-5 md:grid-cols-3">
          <Skeleton className="h-64 md:col-span-2" />
          <div className="space-y-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-24" />
            <Skeleton className="h-32" />
          </div>
        </div>
      </div>
    </div>
  );
}
