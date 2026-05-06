"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronLeft } from "lucide-react";

import { apiGet } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface RentalDetail {
  id: string;
  rentalNo: string;
  status: string;
  rateType: "DAILY" | "MONTHLY";
  unitRate: string;
  totalUnits: number;
  rentalAmount: string;
  depositAmount: string;
  depositReturned: boolean;
  overdueAmount: string;
  finalAmount: string;
  paymentMethod: string | null;
  startDate: string;
  endDate: string;
  actualReturnedAt: string | null;
  checkoutAt: string | null;
  memo: string | null;
  createdAt: string;
  asset: {
    id: string;
    assetNo: string;
    name: string;
    brand: string | null;
    modelNo: string | null;
    serialNo: string | null;
    dailyRate: string;
    monthlyRate: string;
    depositAmount: string;
  };
  customer: {
    id: string;
    type: "INDIVIDUAL" | "BUSINESS";
    name: string;
    phone: string;
    businessNumber: string | null;
  } | null;
  orders: Array<{
    id: string;
    orderNo: string;
    totalAmount: string;
    paymentMethod: string | null;
    status: string;
    createdAt: string;
  }>;
  createdBy: { name: string };
}

const STATUS_LABEL: Record<string, string> = {
  RESERVED: "예약",
  ACTIVE: "임대중",
  RETURNED: "반납완료",
  OVERDUE: "연체",
  CANCELLED: "취소",
};
const STATUS_TONE: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  RESERVED: "outline",
  ACTIVE: "default",
  RETURNED: "secondary",
  OVERDUE: "destructive",
  CANCELLED: "destructive",
};
const PAYMENT_LABEL: Record<string, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  MIXED: "혼합",
  UNPAID: "외상",
};

export default function RentalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const rentalQuery = useQuery<RentalDetail>({
    queryKey: ["rental", id],
    queryFn: () => apiGet<RentalDetail>(`/api/rentals/${id}`),
  });

  if (rentalQuery.isPending) {
    return <DetailSkeleton onBack={() => router.push("/rentals")} />;
  }

  if (rentalQuery.isError || !rentalQuery.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="text-[15px] font-semibold">
          임대를 찾을 수 없습니다
        </span>
        <Button variant="outline" onClick={() => router.push("/rentals")}>
          목록으로
        </Button>
      </div>
    );
  }

  const r = rentalQuery.data;
  const start = new Date(r.startDate);
  const end = new Date(r.endDate);
  const returned = r.actualReturnedAt ? new Date(r.actualReturnedAt) : null;
  const isOverdue = r.status === "OVERDUE";
  const overdueDays = isOverdue
    ? Math.max(
        0,
        Math.floor((Date.now() - end.getTime()) / 86400000),
      )
    : 0;

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
        <h1 className="text-lg font-semibold font-mono">{r.rentalNo}</h1>
        <Badge variant={STATUS_TONE[r.status]}>
          {STATUS_LABEL[r.status] ?? r.status}
        </Badge>
        {isOverdue && overdueDays > 0 && (
          <Badge variant="destructive">{overdueDays}일 경과</Badge>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="grid gap-5 md:grid-cols-3">
          {/* 좌측: 임대 자산 + 기간 + 금액 */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">임대 자산</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row
                label="자산명"
                value={
                  <div className="flex flex-col">
                    <span className="font-medium">{r.asset.name}</span>
                    {(r.asset.brand || r.asset.modelNo) && (
                      <span className="text-[11px] text-muted-foreground">
                        {[r.asset.brand, r.asset.modelNo]
                          .filter(Boolean)
                          .join(" / ")}
                      </span>
                    )}
                  </div>
                }
              />
              <Row label="자산 번호" value={r.asset.assetNo} mono />
              {r.asset.serialNo && (
                <Row label="시리얼" value={r.asset.serialNo} mono />
              )}
              <Row
                label="요율"
                value={
                  r.rateType === "DAILY"
                    ? `일 ₩${Number(r.asset.dailyRate).toLocaleString("ko-KR")}`
                    : `월 ₩${Number(r.asset.monthlyRate).toLocaleString("ko-KR")}`
                }
              />
            </CardContent>
          </Card>

          {/* 우측 상단: 고객 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">고객</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {r.customer ? (
                <>
                  <div className="flex items-center gap-1.5">
                    {r.customer.type === "BUSINESS" && (
                      <Badge
                        variant="outline"
                        className="border-amber-300 bg-amber-50 text-amber-800"
                      >
                        기업
                      </Badge>
                    )}
                    <span className="font-medium">{r.customer.name}</span>
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {r.customer.phone}
                  </div>
                  {r.customer.businessNumber && (
                    <div className="font-mono text-xs text-muted-foreground">
                      {r.customer.businessNumber}
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-7 px-2 text-[11px]"
                    onClick={() =>
                      router.push(`/pos/customer-profile/${r.customer!.id}`)
                    }
                  >
                    프로필 보기
                  </Button>
                </>
              ) : (
                <span className="text-muted-foreground">미등록</span>
              )}
            </CardContent>
          </Card>

          {/* 기간 */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">기간</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-3 text-sm">
              <Block
                label="시작"
                value={format(start, "yyyy-MM-dd", { locale: ko })}
                sub={
                  r.checkoutAt
                    ? format(new Date(r.checkoutAt), "HH:mm")
                    : null
                }
              />
              <Block
                label="만기"
                value={format(end, "yyyy-MM-dd", { locale: ko })}
                sub={
                  r.rateType === "DAILY"
                    ? `${r.totalUnits}일`
                    : `${r.totalUnits}개월`
                }
              />
              <Block
                label="실제 반납"
                value={
                  returned
                    ? format(returned, "yyyy-MM-dd", { locale: ko })
                    : "-"
                }
                sub={returned ? format(returned, "HH:mm") : null}
              />
            </CardContent>
          </Card>

          {/* 금액 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">금액</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <Row
                label="임대료"
                value={`₩${Number(r.rentalAmount).toLocaleString("ko-KR")}`}
              />
              <Row
                label={`보증금 ${r.depositReturned ? "(반환됨)" : ""}`}
                value={`₩${Number(r.depositAmount).toLocaleString("ko-KR")}`}
              />
              {Number(r.overdueAmount) > 0 && (
                <Row
                  label="연체료"
                  value={`+₩${Number(r.overdueAmount).toLocaleString("ko-KR")}`}
                />
              )}
              <div className="border-t pt-1.5 mt-1.5 flex justify-between text-base font-bold">
                <span>최종</span>
                <span className="tabular-nums">
                  ₩{Number(r.finalAmount).toLocaleString("ko-KR")}
                </span>
              </div>
              <p className="pt-1 text-[11px] text-muted-foreground">
                결제수단:{" "}
                {r.paymentMethod
                  ? PAYMENT_LABEL[r.paymentMethod] ?? r.paymentMethod
                  : "-"}
              </p>
            </CardContent>
          </Card>

          {/* 연결 주문 */}
          {r.orders.length > 0 && (
            <Card className="md:col-span-3">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">연결 주문</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5 text-sm">
                {r.orders.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => router.push(`/orders/${o.id}`)}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{o.orderNo}</span>
                      <Badge variant="outline">{o.status}</Badge>
                      {o.paymentMethod && (
                        <span className="text-xs text-muted-foreground">
                          {PAYMENT_LABEL[o.paymentMethod] ?? o.paymentMethod}
                        </span>
                      )}
                    </div>
                    <span className="font-semibold tabular-nums">
                      ₩{Number(o.totalAmount).toLocaleString("ko-KR")}
                    </span>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          {r.memo && (
            <Card className="md:col-span-3">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">메모</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{r.memo}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : "tabular-nums"}>
        {value}
      </span>
    </div>
  );
}

function Block({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string | null;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-muted/40 p-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="tabular-nums font-medium">{value}</span>
      {sub && (
        <span className="text-[10px] text-muted-foreground">{sub}</span>
      )}
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
          <Skeleton className="h-48 md:col-span-2" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32 md:col-span-2" />
          <Skeleton className="h-40" />
        </div>
      </div>
    </div>
  );
}
