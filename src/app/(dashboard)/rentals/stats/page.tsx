"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock, Container, TrendingUp } from "lucide-react";

import { apiGet } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import {
  JmCard,
  JmCardContent,
  JmCardHeader,
  JmCardTitle,
  JmInput,
  JmSkeleton,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
} from "@/jm";

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
    <div className="flex h-full flex-col bg-[var(--jm-bg)]">
      <div className="flex items-center gap-3 border-b border-[var(--jm-border)] px-5 py-3">
        <h1 className="text-jm-lg font-semibold text-[var(--jm-text)]">임대 통계</h1>
        <div className="ml-auto flex items-center gap-2">
          <JmInput
            type="date"
            size="sm"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-[150px]"
          />
          <span className="text-[var(--jm-text-muted)]">~</span>
          <JmInput
            type="date"
            size="sm"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-[150px]"
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
        <JmCard>
          <JmCardHeader className="pb-3">
            <JmCardTitle className="text-jm-base">자산별 가동률</JmCardTitle>
          </JmCardHeader>
          <JmCardContent className="px-0">
            <JmTable className="min-w-[800px]">
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead>자산명</JmTableHead>
                  <JmTableHead className="w-[120px]">번호</JmTableHead>
                  <JmTableHead className="w-[100px]">브랜드</JmTableHead>
                  <JmTableHead className="w-[90px] text-right">대여건수</JmTableHead>
                  <JmTableHead className="w-[90px] text-right">사용일</JmTableHead>
                  <JmTableHead className="w-[160px]">가동률</JmTableHead>
                  <JmTableHead className="w-[140px] text-right">매출</JmTableHead>
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {statsQuery.isPending ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <JmTableRow key={i}>
                      <JmTableCell><JmSkeleton className="h-4 w-32" /></JmTableCell>
                      <JmTableCell><JmSkeleton className="h-4 w-20" /></JmTableCell>
                      <JmTableCell><JmSkeleton className="h-4 w-16" /></JmTableCell>
                      <JmTableCell className="text-right"><div className="flex justify-end"><JmSkeleton className="h-4 w-8" /></div></JmTableCell>
                      <JmTableCell className="text-right"><div className="flex justify-end"><JmSkeleton className="h-4 w-10" /></div></JmTableCell>
                      <JmTableCell><JmSkeleton className="h-4 w-32" /></JmTableCell>
                      <JmTableCell className="text-right"><div className="flex justify-end"><JmSkeleton className="h-4 w-20" /></div></JmTableCell>
                    </JmTableRow>
                  ))
                ) : !data || data.byAsset.length === 0 ? (
                  <JmTableRow>
                    <JmTableCell colSpan={7} className="py-12 text-center text-[var(--jm-text-muted)]">
                      기간 내 임대 활동이 없습니다
                    </JmTableCell>
                  </JmTableRow>
                ) : (
                  data.byAsset.map((a) => (
                    <JmTableRow
                      key={a.assetId}
                      className="cursor-pointer"
                      onClick={() => router.push(`/rental-assets`)}
                    >
                      <JmTableCell className="font-medium">{a.name}</JmTableCell>
                      <JmTableCell className="font-mono text-jm-xs">{a.assetNo}</JmTableCell>
                      <JmTableCell className="text-jm-sm text-[var(--jm-text-muted)]">{a.brand ?? "-"}</JmTableCell>
                      <JmTableCell className="text-right tabular-nums">{a.rentalCount}</JmTableCell>
                      <JmTableCell className="text-right tabular-nums">{a.usedDays}</JmTableCell>
                      <JmTableCell>
                        <UtilizationBar percent={a.utilization} />
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums">
                        ₩{a.revenue.toLocaleString("ko-KR")}
                      </JmTableCell>
                    </JmTableRow>
                  ))
                )}
              </JmTableBody>
            </JmTable>
          </JmCardContent>
        </JmCard>

        {/* 연체 현황 */}
        {data && data.overdue.length > 0 && (
          <JmCard>
            <JmCardHeader className="pb-3">
              <JmCardTitle className="text-jm-base flex items-center gap-2">
                <AlertTriangle className="size-4 text-[var(--jm-danger-fg)]" />
                연체 현황 ({data.overdue.length})
              </JmCardTitle>
            </JmCardHeader>
            <JmCardContent className="px-0">
              <JmTable>
                <JmTableHeader>
                  <JmTableRow>
                    <JmTableHead>임대번호</JmTableHead>
                    <JmTableHead>고객</JmTableHead>
                    <JmTableHead>자산</JmTableHead>
                    <JmTableHead className="w-[120px]">반납예정</JmTableHead>
                    <JmTableHead className="w-[80px] text-right">연체일</JmTableHead>
                    <JmTableHead className="w-[120px] text-right">금액</JmTableHead>
                  </JmTableRow>
                </JmTableHeader>
                <JmTableBody>
                  {data.overdue.map((r) => (
                    <JmTableRow
                      key={r.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/rentals/${r.id}`)}
                    >
                      <JmTableCell className="font-mono text-jm-xs">{r.rentalNo}</JmTableCell>
                      <JmTableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{r.customerName}</span>
                          {r.customerPhone && (
                            <span className="text-jm-2xs text-[var(--jm-text-muted)]">{r.customerPhone}</span>
                          )}
                        </div>
                      </JmTableCell>
                      <JmTableCell className="text-jm-sm">{r.assetName}</JmTableCell>
                      <JmTableCell className="text-jm-sm">
                        {new Date(r.endDate).toLocaleDateString("ko-KR")}
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums font-semibold text-[var(--jm-danger-fg)]">
                        {r.daysOverdue}일
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums">
                        ₩{r.finalAmount.toLocaleString("ko-KR")}
                      </JmTableCell>
                    </JmTableRow>
                  ))}
                </JmTableBody>
              </JmTable>
            </JmCardContent>
          </JmCard>
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
    default: "text-[var(--jm-text-muted)]",
    primary: "text-[var(--jm-accent-fg)]",
    info: "text-[var(--jm-info-fg)]",
    danger: "text-[var(--jm-danger-fg)]",
  }[tone];
  return (
    <JmCard>
      <JmCardHeader className="flex flex-row items-center justify-between space-y-0 border-b-0 pb-1">
        <JmCardTitle className="text-jm-xs font-medium text-[var(--jm-text-muted)]">{label}</JmCardTitle>
        <span className={toneClass}>{icon}</span>
      </JmCardHeader>
      <JmCardContent>
        {loading ? (
          <JmSkeleton className="h-7 w-20" />
        ) : (
          <>
            <div className="text-jm-2xl font-bold tabular-nums text-[var(--jm-text)]">{value}</div>
            {sub && <div className="text-jm-2xs text-[var(--jm-text-muted)] mt-0.5">{sub}</div>}
          </>
        )}
      </JmCardContent>
    </JmCard>
  );
}

function UtilizationBar({ percent }: { percent: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-[var(--jm-surface-muted)]">
        <div
          className={cn(
            "h-full rounded-full",
            percent >= 80
              ? "bg-[var(--jm-success-solid)]"
              : percent >= 40
                ? "bg-[var(--jm-warning-solid)]"
                : "bg-[var(--jm-text-subtle)]"
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-jm-xs tabular-nums w-10 text-right">{percent}%</span>
    </div>
  );
}
