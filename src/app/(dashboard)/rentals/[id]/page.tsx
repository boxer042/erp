"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ArrowLeft } from "lucide-react";

import { apiGet } from "@/lib/api-client";
import {
  JmCard,
  JmCardContent,
  JmCardHeader,
  JmCardTitle,
  JmBadge,
  JmButton,
  JmIconButton,
  JmSkeleton,
  JmContainer,
} from "@/jm";

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
  "solid" | "default" | "outline" | "danger"
> = {
  RESERVED: "outline",
  ACTIVE: "solid",
  RETURNED: "default",
  OVERDUE: "danger",
  CANCELLED: "danger",
};
const PAYMENT_LABEL: Record<string, string> = {
  CASH: "현금",
  CASH_RECEIPT: "현금영수증",
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
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--jm-bg)] p-6 text-center">
        <span className="text-jm-md font-semibold text-[var(--jm-text)]">
          임대를 찾을 수 없습니다
        </span>
        <JmButton variant="outline" onClick={() => router.push("/rentals")}>
          목록으로
        </JmButton>
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
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-6 py-3">
        <JmIconButton
          aria-label="뒤로"
          size="sm"
          onClick={() => router.back()}
        >
          <ArrowLeft />
        </JmIconButton>
        <h1 className="text-jm-xl font-semibold font-mono text-[var(--jm-text)]">
          {r.rentalNo}
        </h1>
        <JmBadge variant={STATUS_TONE[r.status]}>
          {STATUS_LABEL[r.status] ?? r.status}
        </JmBadge>
        {isOverdue && overdueDays > 0 && (
          <JmBadge variant="danger">{overdueDays}일 경과</JmBadge>
        )}
      </div>

      <JmContainer width="default" padded={false} className="p-6">
        <div className="grid gap-5 md:grid-cols-3">
          {/* 좌측: 임대 자산 + 기간 + 금액 */}
          <JmCard className="md:col-span-2">
            <JmCardHeader className="pb-3">
              <JmCardTitle className="text-jm-lg">임대 자산</JmCardTitle>
            </JmCardHeader>
            <JmCardContent className="space-y-2 text-jm-sm">
              <Row
                label="자산명"
                value={
                  <div className="flex flex-col">
                    <span className="font-medium">{r.asset.name}</span>
                    {(r.asset.brand || r.asset.modelNo) && (
                      <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                        {[r.asset.brand, r.asset.modelNo]
                          .filter(Boolean)
                          .join(" / ")}
                      </span>
                    )}
                  </div>
                }
              />
              <Row label="자산 번호" value={r.asset.assetNo} mono />
              <Row
                label="요율"
                value={
                  r.rateType === "DAILY"
                    ? `일 ₩${Number(r.asset.dailyRate).toLocaleString("ko-KR")}`
                    : `월 ₩${Number(r.asset.monthlyRate).toLocaleString("ko-KR")}`
                }
              />
            </JmCardContent>
          </JmCard>

          {/* 우측 상단: 고객 */}
          <JmCard>
            <JmCardHeader className="pb-2">
              <JmCardTitle className="text-jm-lg">고객</JmCardTitle>
            </JmCardHeader>
            <JmCardContent className="space-y-1.5 text-jm-sm">
              {r.customer ? (
                <>
                  <div className="flex items-center gap-1.5">
                    {r.customer.type === "BUSINESS" && (
                      <JmBadge variant="warning">기업</JmBadge>
                    )}
                    <span className="font-medium">{r.customer.name}</span>
                  </div>
                  <div className="font-mono text-jm-xs text-[var(--jm-text-muted)]">
                    {r.customer.phone}
                  </div>
                  {r.customer.businessNumber && (
                    <div className="font-mono text-jm-xs text-[var(--jm-text-muted)]">
                      {r.customer.businessNumber}
                    </div>
                  )}
                  <JmButton
                    variant="ghost"
                    size="xs"
                    className="mt-2 text-jm-2xs"
                    onClick={() =>
                      router.push(`/pos/customer-profile/${r.customer!.id}`)
                    }
                  >
                    프로필 보기
                  </JmButton>
                </>
              ) : (
                <span className="text-[var(--jm-text-muted)]">미등록</span>
              )}
            </JmCardContent>
          </JmCard>

          {/* 기간 */}
          <JmCard className="md:col-span-2">
            <JmCardHeader className="pb-2">
              <JmCardTitle className="text-jm-lg">기간</JmCardTitle>
            </JmCardHeader>
            <JmCardContent className="grid grid-cols-3 gap-3 text-jm-sm">
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
            </JmCardContent>
          </JmCard>

          {/* 금액 */}
          <JmCard>
            <JmCardHeader className="pb-2">
              <JmCardTitle className="text-jm-lg">금액</JmCardTitle>
            </JmCardHeader>
            <JmCardContent className="space-y-1.5 text-jm-sm">
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
              <div className="border-t border-[var(--jm-border)] pt-1.5 mt-1.5 flex justify-between text-jm-lg font-bold text-[var(--jm-text)]">
                <span>최종</span>
                <span className="tabular-nums">
                  ₩{Number(r.finalAmount).toLocaleString("ko-KR")}
                </span>
              </div>
              <p className="pt-1 text-jm-2xs text-[var(--jm-text-muted)]">
                결제수단:{" "}
                {r.paymentMethod
                  ? PAYMENT_LABEL[r.paymentMethod] ?? r.paymentMethod
                  : "-"}
              </p>
            </JmCardContent>
          </JmCard>

          {/* 연결 주문 */}
          {r.orders.length > 0 && (
            <JmCard className="md:col-span-3">
              <JmCardHeader className="pb-2">
                <JmCardTitle className="text-jm-lg">연결 주문</JmCardTitle>
              </JmCardHeader>
              <JmCardContent className="flex flex-col gap-1.5 text-jm-sm">
                {r.orders.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => router.push(`/orders/${o.id}`)}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-[var(--jm-surface-muted)]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-jm-xs">{o.orderNo}</span>
                      <JmBadge variant="outline">{o.status}</JmBadge>
                      {o.paymentMethod && (
                        <span className="text-jm-xs text-[var(--jm-text-muted)]">
                          {PAYMENT_LABEL[o.paymentMethod] ?? o.paymentMethod}
                        </span>
                      )}
                    </div>
                    <span className="font-semibold tabular-nums">
                      ₩{Number(o.totalAmount).toLocaleString("ko-KR")}
                    </span>
                  </button>
                ))}
              </JmCardContent>
            </JmCard>
          )}

          {r.memo && (
            <JmCard className="md:col-span-3">
              <JmCardHeader className="pb-2">
                <JmCardTitle className="text-jm-lg">메모</JmCardTitle>
              </JmCardHeader>
              <JmCardContent>
                <p className="text-jm-sm whitespace-pre-wrap text-[var(--jm-text)]">
                  {r.memo}
                </p>
              </JmCardContent>
            </JmCard>
          )}
        </div>
      </JmContainer>
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
      <span className="text-[var(--jm-text-muted)]">{label}</span>
      <span className={mono ? "font-mono text-jm-xs" : "tabular-nums"}>
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
    <div className="flex flex-col gap-0.5 rounded-lg bg-[var(--jm-surface-muted)] p-2.5">
      <span className="text-jm-3xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
        {label}
      </span>
      <span className="tabular-nums font-medium text-[var(--jm-text)]">
        {value}
      </span>
      {sub && (
        <span className="text-jm-3xs text-[var(--jm-text-muted)]">{sub}</span>
      )}
    </div>
  );
}

function DetailSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-6 py-3">
        <JmIconButton aria-label="뒤로" size="sm" onClick={onBack}>
          <ArrowLeft />
        </JmIconButton>
        <JmSkeleton className="h-5 w-40" />
      </div>
      <JmContainer width="default" padded={false} className="p-6">
        <div className="grid gap-5 md:grid-cols-3">
          <JmSkeleton className="h-48 md:col-span-2" />
          <JmSkeleton className="h-32" />
          <JmSkeleton className="h-32 md:col-span-2" />
          <JmSkeleton className="h-40" />
        </div>
      </JmContainer>
    </div>
  );
}
