"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  format,
  endOfMonth,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
} from "date-fns";
import {
  Download,
  ShoppingCart,
  Wrench,
  Truck,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { apiGet } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CustomerCombobox } from "@/components/customer-combobox";

interface SalesRow {
  id: string;
  type: "product" | "repair" | "rental";
  refNo: string;
  date: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  channelName: string | null;
  paymentMethod: string | null;
  amount: number;
  status: string;
  sourceId: string;
  ticketNo?: string | null;
  rentalNo?: string | null;
}

interface Summary {
  totalCount: number;
  totalAmount: number;
  byType: {
    product: { count: number; amount: number };
    repair: { count: number; amount: number };
    rental: { count: number; amount: number };
  };
  truncated: boolean;
}

interface Pagination {
  page: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
}

interface Response {
  rows: SalesRow[];
  summary: Summary;
  pagination: Pagination;
}

interface CustomerOption {
  id: string;
  name: string;
  phone?: string | null;
  businessNumber?: string | null;
}

type SortKey = "date_desc" | "date_asc" | "amount_desc" | "amount_asc" | "type";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "date_desc", label: "최신순" },
  { value: "date_asc", label: "오래된순" },
  { value: "amount_desc", label: "금액 높은순" },
  { value: "amount_asc", label: "금액 낮은순" },
  { value: "type", label: "타입순" },
];

type RangePreset =
  | "ALL"
  | "TODAY"
  | "THIS_WEEK"
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "LAST_3M"
  | "THIS_YEAR"
  | "CUSTOM";

const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "TODAY", label: "오늘" },
  { value: "THIS_WEEK", label: "이번 주" },
  { value: "THIS_MONTH", label: "이번 달" },
  { value: "LAST_MONTH", label: "저번 달" },
  { value: "LAST_3M", label: "3개월" },
  { value: "THIS_YEAR", label: "올해" },
  { value: "CUSTOM", label: "직접 선택" },
];

function presetToRange(preset: RangePreset): { from: string; to: string } {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  if (preset === "TODAY") return { from: todayStr, to: todayStr };
  if (preset === "THIS_WEEK") {
    return {
      from: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      to: todayStr,
    };
  }
  if (preset === "THIS_MONTH") {
    return { from: format(startOfMonth(today), "yyyy-MM-dd"), to: todayStr };
  }
  if (preset === "LAST_MONTH") {
    const lastMonth = subMonths(today, 1);
    return {
      from: format(startOfMonth(lastMonth), "yyyy-MM-dd"),
      to: format(endOfMonth(lastMonth), "yyyy-MM-dd"),
    };
  }
  if (preset === "LAST_3M") {
    // 최근 3개월 — 오늘 기준 90일이 아니라 "이번 달 포함 직전 3개월" (예: 5/6 → 3/1~5/6)
    return {
      from: format(startOfMonth(subMonths(today, 2)), "yyyy-MM-dd"),
      to: todayStr,
    };
  }
  if (preset === "THIS_YEAR") {
    return { from: format(startOfYear(today), "yyyy-MM-dd"), to: todayStr };
  }
  return { from: "", to: "" };
}

const TYPE_LABEL: Record<string, string> = {
  product: "판매",
  repair: "수리",
  rental: "임대",
};

const TYPE_TONE: Record<
  string,
  "default" | "secondary" | "outline"
> = {
  product: "default",
  repair: "secondary",
  rental: "outline",
};

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  MIXED: "혼합",
  UNPAID: "외상",
};

export default function SalesHistoryPage() {
  const router = useRouter();
  const [preset, setPreset] = useState<RangePreset>("THIS_MONTH");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [type, setType] = useState<string>("ALL");
  const [paymentMethod, setPaymentMethod] = useState<string>("ALL");
  const [customerId, setCustomerId] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("date_desc");
  const [page, setPage] = useState(1);

  const range = useMemo(() => {
    if (preset === "CUSTOM") return { from: customFrom, to: customTo };
    if (preset === "ALL") return { from: "", to: "" };
    return presetToRange(preset);
  }, [preset, customFrom, customTo]);

  // 필터 변경 시 1페이지로 리셋
  const filterKey = `${range.from}|${range.to}|${type}|${paymentMethod}|${customerId}|${sort}`;
  useMemo(() => {
    setPage(1);
    return null;
  }, [filterKey]);

  // 고객 목록 — 필터 combobox 용
  const customersQuery = useQuery<CustomerOption[]>({
    queryKey: ["customers-list-for-filter"],
    queryFn: () => apiGet<CustomerOption[]>("/api/customers"),
    staleTime: 1000 * 60 * 5,
  });

  const queryKey = useMemo(
    () => [
      "sales-history",
      range.from,
      range.to,
      type,
      paymentMethod,
      customerId,
      sort,
      page,
    ],
    [range.from, range.to, type, paymentMethod, customerId, sort, page],
  );

  const dataQuery = useQuery<Response>({
    queryKey,
    queryFn: () => {
      const sp = new URLSearchParams();
      if (range.from) sp.set("from", range.from);
      if (range.to) sp.set("to", range.to);
      if (type !== "ALL") sp.set("type", type);
      if (paymentMethod !== "ALL") sp.set("paymentMethod", paymentMethod);
      if (customerId) sp.set("customerId", customerId);
      sp.set("sort", sort);
      sp.set("page", String(page));
      sp.set("pageSize", "50");
      return apiGet<Response>(`/api/sales/history?${sp.toString()}`);
    },
    placeholderData: (prev) => prev,
  });

  const rows = dataQuery.data?.rows ?? [];
  const summary = dataQuery.data?.summary;
  const pagination = dataQuery.data?.pagination;

  const downloadCsv = () => {
    const sp = new URLSearchParams();
    if (range.from) sp.set("from", range.from);
    if (range.to) sp.set("to", range.to);
    if (type !== "ALL") sp.set("type", type);
    if (paymentMethod !== "ALL") sp.set("paymentMethod", paymentMethod);
    if (customerId) sp.set("customerId", customerId);
    window.location.href = `/api/sales/history/export?${sp.toString()}`;
  };

  const onRowClick = (row: SalesRow) => {
    // id prefix 로 source 종류 구분 — 같은 type 도 origin 이 Order vs orphan 둘 가능
    if (row.id.startsWith("order-")) {
      router.push(`/orders/${row.sourceId}`);
    } else if (row.id.startsWith("rental-")) {
      router.push(`/rentals/${row.sourceId}`);
    } else if (row.id.startsWith("repair-")) {
      router.push(`/repairs/${row.sourceId}`);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <h1 className="text-lg font-semibold">통합 판매내역</h1>
        <span className="text-[12px] text-muted-foreground">
          판매 · 수리 · 임대 통합
        </span>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={downloadCsv}
          >
            <Download className="size-3.5" />
            CSV
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {/* 필터 */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex h-[30px] items-center gap-1 rounded-md border border-border bg-card px-1 text-[13px]">
            {RANGE_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPreset(p.value)}
                className={`rounded px-2 py-0.5 transition-colors ${
                  preset === p.value
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset === "CUSTOM" && (
            <div className="flex items-center gap-1">
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-[30px] w-[140px] text-[13px]"
              />
              <span className="text-[12px] text-muted-foreground">~</span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-[30px] w-[140px] text-[13px]"
              />
            </div>
          )}

          <Select value={type} onValueChange={(v) => setType(v ?? "ALL")}>
            <SelectTrigger className="h-[30px] w-[100px] text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">전체</SelectItem>
              <SelectItem value="product">판매</SelectItem>
              <SelectItem value="repair">수리</SelectItem>
              <SelectItem value="rental">임대</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={paymentMethod}
            onValueChange={(v) => setPaymentMethod(v ?? "ALL")}
          >
            <SelectTrigger className="h-[30px] w-[110px] text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">결제 전체</SelectItem>
              <SelectItem value="CASH">현금</SelectItem>
              <SelectItem value="CARD">카드</SelectItem>
              <SelectItem value="TRANSFER">계좌이체</SelectItem>
              <SelectItem value="MIXED">혼합</SelectItem>
              <SelectItem value="UNPAID">외상</SelectItem>
            </SelectContent>
          </Select>

          <div className="w-[220px]">
            <CustomerCombobox
              customers={customersQuery.data ?? []}
              value={customerId}
              onChange={(id) => setCustomerId(id)}
              onCreateNew={() => {
                /* 통합 판매내역 필터에서는 신규 등록 X */
              }}
              placeholder="고객 전체"
            />
          </div>

          <Select value={sort} onValueChange={(v) => setSort((v ?? "date_desc") as SortKey)}>
            <SelectTrigger className="h-[30px] w-[130px] text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {summary?.truncated && (
            <span className="text-[11px] text-amber-700">
              ※ 결과가 5,000건 초과 — 기간을 더 좁혀주세요 (CSV 는 10,000건까지)
            </span>
          )}
        </div>

        {/* KPI */}
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            icon={<TrendingUp className="size-4" />}
            label="총 매출"
            value={`₩${(summary?.totalAmount ?? 0).toLocaleString("ko-KR")}`}
            hint={`${summary?.totalCount ?? 0}건`}
            loading={dataQuery.isPending}
          />
          <KpiCard
            icon={<ShoppingCart className="size-4" />}
            label="판매"
            value={`₩${(summary?.byType.product.amount ?? 0).toLocaleString("ko-KR")}`}
            hint={`${summary?.byType.product.count ?? 0}건`}
            loading={dataQuery.isPending}
          />
          <KpiCard
            icon={<Wrench className="size-4" />}
            label="수리"
            value={`₩${(summary?.byType.repair.amount ?? 0).toLocaleString("ko-KR")}`}
            hint={`${summary?.byType.repair.count ?? 0}건`}
            loading={dataQuery.isPending}
          />
          <KpiCard
            icon={<Truck className="size-4" />}
            label="임대"
            value={`₩${(summary?.byType.rental.amount ?? 0).toLocaleString("ko-KR")}`}
            hint={`${summary?.byType.rental.count ?? 0}건`}
            loading={dataQuery.isPending}
          />
        </div>

        {/* 테이블 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">판매 내역</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">일시</TableHead>
                  <TableHead className="w-[60px]">타입</TableHead>
                  <TableHead className="w-[140px]">번호</TableHead>
                  <TableHead>고객</TableHead>
                  <TableHead className="w-[100px]">채널</TableHead>
                  <TableHead className="w-[80px]">결제</TableHead>
                  <TableHead className="w-[100px] text-right">금액</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dataQuery.isPending ? (
                  <SkeletonRows />
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-12 text-center text-muted-foreground"
                    >
                      해당 기간에 판매 내역이 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => onRowClick(row)}
                    >
                      <TableCell className="font-mono text-[12px] text-muted-foreground">
                        {format(new Date(row.date), "MM-dd HH:mm")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={TYPE_TONE[row.type]}>
                          {TYPE_LABEL[row.type]}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-[13px]">
                        {row.refNo}
                      </TableCell>
                      <TableCell>
                        {row.customerName ?? (
                          <span className="text-muted-foreground">(미등록)</span>
                        )}
                        {row.customerPhone && (
                          <span className="ml-1 font-mono text-[11px] text-muted-foreground">
                            {row.customerPhone}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-[13px] text-muted-foreground">
                        {row.channelName ?? "-"}
                      </TableCell>
                      <TableCell className="text-[13px]">
                        {row.paymentMethod
                          ? PAYMENT_LABEL[row.paymentMethod] ?? row.paymentMethod
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        ₩{row.amount.toLocaleString("ko-KR")}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* 페이지네이션 */}
        {pagination && pagination.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <span className="text-[12px] text-muted-foreground">
              총 {pagination.totalCount.toLocaleString("ko-KR")}건 ·{" "}
              {pagination.page} / {pagination.totalPages} 페이지
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 px-2"
                disabled={pagination.page <= 1 || dataQuery.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-3.5" />
                이전
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 px-2"
                disabled={
                  pagination.page >= pagination.totalPages ||
                  dataQuery.isFetching
                }
                onClick={() =>
                  setPage((p) => Math.min(pagination.totalPages, p + 1))
                }
              >
                다음
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
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
          <>
            <div className="text-xl font-bold tabular-nums">{value}</div>
            {hint && (
              <p className="text-[11px] text-muted-foreground">{hint}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-12 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-28" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-32" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-12" />
          </TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end">
              <Skeleton className="h-4 w-20" />
            </div>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
