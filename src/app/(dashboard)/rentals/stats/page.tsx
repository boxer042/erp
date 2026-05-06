"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock, Container, TrendingUp } from "lucide-react";

import { apiGet } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface Stats {
  period: { from: string; to: string; days: number };
  statusCounts: Record<string, number>;
  revenue: { total: number; completedCount: number };
  byAsset: Array<{
    assetId: string;
    assetNo: string;
    name: string;
    brand: string | null;
    rentalCount: number;
    usedDays: number;
    utilization: number;
    revenue: number;
  }>;
  overdue: Array<{
    id: string;
    rentalNo: string;
    endDate: string;
    daysOverdue: number;
    finalAmount: number;
    assetName: string;
    assetNo: string;
    customerName: string;
    customerPhone: string | null;
  }>;
}

function todayMinusDaysIso(days: number) {
  const d = new Date(Date.now() - days * 86400_000);
  return d.toISOString().split("T")[0];
}

export default function RentalsStatsPage() {
  const router = useRouter();
  const [from, setFrom] = useState(() => todayMinusDaysIso(90));
  const [to, setTo] = useState(() => todayMinusDaysIso(0));

  const statsQuery = useQuery<Stats>({
    queryKey: ["rentals-stats", from, to],
    queryFn: () => apiGet<Stats>(`/api/rentals/stats?from=${from}&to=${to}`),
    staleTime: 1000 * 60,
  });
  const data = statsQuery.data;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <h1 className="text-lg font-semibold">임대 통계</h1>
        <div className="ml-auto flex items-center gap-2">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-[30px] w-[150px] text-[13px]"
          />
          <span className="text-muted-foreground">~</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-[30px] w-[150px] text-[13px]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* KPI 카드 */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <KpiCard
            label="기간 매출"
            value={data ? `₩${data.revenue.total.toLocaleString("ko-KR")}` : ""}
            sub={data ? `완료 ${data.revenue.completedCount}건` : undefined}
            icon={<TrendingUp className="size-4" />}
            tone="primary"
            loading={statsQuery.isPending}
          />
          <KpiCard
            label="진행 중"
            value={data ? String(data.statusCounts["ACTIVE"] ?? 0) : ""}
            icon={<Container className="size-4" />}
            tone="info"
            loading={statsQuery.isPending}
          />
          <KpiCard
            label="연체"
            value={data ? String(data.statusCounts["OVERDUE"] ?? 0) : ""}
            icon={<AlertTriangle className="size-4" />}
            tone="danger"
            loading={statsQuery.isPending}
          />
          <KpiCard
            label="예약"
            value={data ? String(data.statusCounts["RESERVED"] ?? 0) : ""}
            icon={<Clock className="size-4" />}
            tone="default"
            loading={statsQuery.isPending}
          />
        </div>

        {/* 자산별 가동률 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-[14px]">자산별 가동률</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table className="min-w-[800px]">
              <TableHeader>
                <TableRow>
                  <TableHead>자산명</TableHead>
                  <TableHead className="w-[120px]">번호</TableHead>
                  <TableHead className="w-[100px]">브랜드</TableHead>
                  <TableHead className="w-[90px] text-right">대여건수</TableHead>
                  <TableHead className="w-[90px] text-right">사용일</TableHead>
                  <TableHead className="w-[160px]">가동률</TableHead>
                  <TableHead className="w-[140px] text-right">매출</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statsQuery.isPending ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell className="text-right"><div className="flex justify-end"><Skeleton className="h-4 w-8" /></div></TableCell>
                      <TableCell className="text-right"><div className="flex justify-end"><Skeleton className="h-4 w-10" /></div></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell className="text-right"><div className="flex justify-end"><Skeleton className="h-4 w-20" /></div></TableCell>
                    </TableRow>
                  ))
                ) : !data || data.byAsset.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                      기간 내 임대 활동이 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  data.byAsset.map((a) => (
                    <TableRow
                      key={a.assetId}
                      className="cursor-pointer"
                      onClick={() => router.push(`/rental-assets`)}
                    >
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="font-mono text-[12px]">{a.assetNo}</TableCell>
                      <TableCell className="text-[13px] text-muted-foreground">{a.brand ?? "-"}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.rentalCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.usedDays}</TableCell>
                      <TableCell>
                        <UtilizationBar percent={a.utilization} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        ₩{a.revenue.toLocaleString("ko-KR")}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* 연체 현황 */}
        {data && data.overdue.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-[14px] flex items-center gap-2">
                <AlertTriangle className="size-4 text-rose-600" />
                연체 현황 ({data.overdue.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>임대번호</TableHead>
                    <TableHead>고객</TableHead>
                    <TableHead>자산</TableHead>
                    <TableHead className="w-[120px]">반납예정</TableHead>
                    <TableHead className="w-[80px] text-right">연체일</TableHead>
                    <TableHead className="w-[120px] text-right">금액</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.overdue.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/rentals/${r.id}`)}
                    >
                      <TableCell className="font-mono text-[12px]">{r.rentalNo}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{r.customerName}</span>
                          {r.customerPhone && (
                            <span className="text-[11px] text-muted-foreground">{r.customerPhone}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-[13px]">{r.assetName}</TableCell>
                      <TableCell className="text-[13px]">
                        {new Date(r.endDate).toLocaleDateString("ko-KR")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-rose-700">
                        {r.daysOverdue}일
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        ₩{r.finalAmount.toLocaleString("ko-KR")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  tone,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone: "default" | "primary" | "info" | "danger";
  loading: boolean;
}) {
  const toneClass = {
    default: "text-muted-foreground",
    primary: "text-primary",
    info: "text-blue-600",
    danger: "text-rose-600",
  }[tone];
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
        <CardTitle className="text-[12px] font-medium text-muted-foreground">{label}</CardTitle>
        <span className={toneClass}>{icon}</span>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <>
            <div className="text-xl font-bold tabular-nums">{value}</div>
            {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function UtilizationBar({ percent }: { percent: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            percent >= 80 ? "bg-emerald-500" : percent >= 40 ? "bg-amber-500" : "bg-zinc-400"
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-[12px] tabular-nums w-10 text-right">{percent}%</span>
    </div>
  );
}
