"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ProductRef {
  id: string;
  name: string;
  sku: string;
}

interface FunnelRow {
  entryProduct: ProductRef;
  finalProduct: ProductRef | null;
  orderCount: number;
  quantity: number;
  revenue: number;
  isSwap: boolean;
}

interface EntrySummary {
  entryProduct: ProductRef;
  orderCount: number;
  quantity: number;
  revenue: number;
  swapCount: number;
  swapRate: number;
}

interface FunnelResponse {
  rows: FunnelRow[];
  entrySummary: EntrySummary[];
  total: {
    orderCount: number;
    quantity: number;
    revenue: number;
    swapCount: number;
    swapRate: number;
  };
  period: { from: string | null; to: string | null };
}

function todayStr() {
  return format(new Date(), "yyyy-MM-dd");
}

function dayOffsetStr(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return format(d, "yyyy-MM-dd");
}

export default function OptionFunnelPage() {
  const [from, setFrom] = useState(() => dayOffsetStr(-30));
  const [to, setTo] = useState(() => todayStr());

  const query = useQuery({
    queryKey: queryKeys.reports.optionFunnel({ from, to }),
    queryFn: () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      return apiGet<FunnelResponse>(`/api/reports/option-funnel?${params}`);
    },
  });

  const data = query.data;

  // entryProduct 별로 그룹화 — 표시 트리
  const grouped = useMemo(() => {
    if (!data) return [];
    const map = new Map<
      string,
      { entry: EntrySummary; rows: FunnelRow[] }
    >();
    for (const e of data.entrySummary) {
      map.set(e.entryProduct.id, { entry: e, rows: [] });
    }
    for (const r of data.rows) {
      map.get(r.entryProduct.id)?.rows.push(r);
    }
    return Array.from(map.values());
  }, [data]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-3 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-base font-semibold">옵션 funnel</h1>
          <p className="text-[12px] text-muted-foreground">
            자사몰·외부 채널 한정 — 손님이 진입한 카탈로그 SKU 와 실제 결제된 SKU 비교 (POS 제외)
          </p>
        </div>
        <div className="flex items-end gap-2 ml-auto">
          <div>
            <Label className="text-[11px]">From</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 w-[140px]"
            />
          </div>
          <div>
            <Label className="text-[11px]">To</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 w-[140px]"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* 전체 요약 KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label="진입 → 결제 주문"
            value={
              query.isPending
                ? null
                : `${(data?.total.orderCount ?? 0).toLocaleString("ko-KR")}건`
            }
          />
          <KpiCard
            label="합계 매출"
            value={
              query.isPending
                ? null
                : `₩${(data?.total.revenue ?? 0).toLocaleString("ko-KR")}`
            }
          />
          <KpiCard
            label="SWAP 발생"
            value={
              query.isPending
                ? null
                : `${(data?.total.swapCount ?? 0).toLocaleString("ko-KR")}건`
            }
            hint={
              query.isPending
                ? undefined
                : `진입 SKU ≠ 결제 SKU 인 케이스`
            }
          />
          <KpiCard
            label="SWAP 비율"
            value={
              query.isPending
                ? null
                : `${((data?.total.swapRate ?? 0) * 100).toFixed(1)}%`
            }
          />
        </div>

        {/* 진입 페이지 단위 요약 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[14px]">진입 페이지별 요약</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table className="min-w-[800px]">
              <TableHeader>
                <TableRow>
                  <TableHead>진입 SKU</TableHead>
                  <TableHead>상품명</TableHead>
                  <TableHead className="text-right">주문</TableHead>
                  <TableHead className="text-right">수량</TableHead>
                  <TableHead className="text-right">매출</TableHead>
                  <TableHead className="text-right">SWAP</TableHead>
                  <TableHead className="text-right">SWAP 비율</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.isPending ? (
                  <SkeletonRows colSpan={7} />
                ) : (data?.entrySummary ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      집계할 데이터가 없습니다 (entryProductId 가 채워진 자사몰/채널 주문 한정)
                    </TableCell>
                  </TableRow>
                ) : (
                  data!.entrySummary.map((e) => (
                    <TableRow key={e.entryProduct.id}>
                      <TableCell className="font-mono text-[12px]">
                        {e.entryProduct.sku}
                      </TableCell>
                      <TableCell>{e.entryProduct.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {e.orderCount.toLocaleString("ko-KR")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {e.quantity.toLocaleString("ko-KR")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        ₩{e.revenue.toLocaleString("ko-KR")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {e.swapCount.toLocaleString("ko-KR")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {(e.swapRate * 100).toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* 진입 → 결제 매트릭스 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[14px]">진입 → 결제 매트릭스</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead>진입 SKU</TableHead>
                  <TableHead>결제 SKU</TableHead>
                  <TableHead>SWAP</TableHead>
                  <TableHead className="text-right">주문</TableHead>
                  <TableHead className="text-right">수량</TableHead>
                  <TableHead className="text-right">매출</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.isPending ? (
                  <SkeletonRows colSpan={6} />
                ) : grouped.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      집계할 데이터가 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  grouped.flatMap((g) =>
                    g.rows.map((r, idx) => (
                      <TableRow key={`${r.entryProduct.id}-${r.finalProduct?.id ?? "null"}-${idx}`}>
                        <TableCell className="text-[12px]">
                          {idx === 0 ? (
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {r.entryProduct.name}
                              </span>
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {r.entryProduct.sku}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">↳</span>
                          )}
                        </TableCell>
                        <TableCell className="text-[12px]">
                          <div className="flex flex-col">
                            <span>{r.finalProduct?.name ?? "(삭제됨)"}</span>
                            {r.finalProduct?.sku && (
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {r.finalProduct.sku}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {r.isSwap ? (
                            <Badge variant="secondary" className="text-[10px]">SWAP</Badge>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">−</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.orderCount.toLocaleString("ko-KR")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.quantity.toLocaleString("ko-KR")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          ₩{r.revenue.toLocaleString("ko-KR")}
                        </TableCell>
                      </TableRow>
                    )),
                  )
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
  label,
  value,
  hint,
}: {
  label: string;
  value: string | null;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-1.5">
        <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </CardHeader>
      <CardContent>
        {value === null ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <div className="text-[18px] font-bold tabular-nums">{value}</div>
        )}
        {hint && (
          <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}

function SkeletonRows({ colSpan }: { colSpan: number }) {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: colSpan }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-24" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
