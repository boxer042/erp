"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ShieldAlert, ShieldCheck, ShieldX, Clock } from "lucide-react";

import { apiGet } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface WarrantyItem {
  id: string;
  ticketNo: string;
  pickedUpAt: string | null;
  warrantyEnds: string;
  daysLeft: number;
  isExpired: boolean;
  finalAmount: number;
  symptom: string | null;
  diagnosis: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  productName: string;
  productSku: string | null;
  categoryName: string | null;
}

interface Response {
  items: WarrantyItem[];
  summary: {
    totalCount: number;
    expiredCount: number;
    in7Count: number;
    in30Count: number;
  };
}

const FILTER_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "expired", label: "이미 만료" },
  { value: "in7", label: "7일 이내" },
  { value: "in30", label: "30일 이내 (만료 제외)" },
];

export default function RepairWarrantyPage() {
  const router = useRouter();
  const [days, setDays] = useState(30);
  const [filter, setFilter] = useState<"all" | "expired" | "in7" | "in30">(
    "all",
  );
  const [search, setSearch] = useState("");

  const dataQuery = useQuery<Response>({
    queryKey: ["repair-warranty", days],
    queryFn: () =>
      apiGet<Response>(
        `/api/repair-tickets/warranty/expiring?days=${days}`,
      ),
  });

  const all = dataQuery.data?.items ?? [];
  const summary = dataQuery.data?.summary;

  const items = all.filter((i) => {
    if (filter === "expired" && !i.isExpired) return false;
    if (filter === "in7" && (i.isExpired || i.daysLeft > 7)) return false;
    if (filter === "in30" && i.isExpired) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !i.ticketNo.toLowerCase().includes(q) &&
        !(i.customerName?.toLowerCase().includes(q) ?? false) &&
        !i.productName.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <h1 className="text-lg font-semibold">수리 보증 만료 알림</h1>
        <span className="text-[12px] text-muted-foreground">
          PICKED_UP 후 보증 임박/만료 건
        </span>
        <div className="ml-auto flex items-center gap-2 text-[13px]">
          <span className="text-muted-foreground">조회 범위</span>
          <Select
            value={String(days)}
            onValueChange={(v) => setDays(parseInt(v ?? "30", 10) || 30)}
          >
            <SelectTrigger className="h-[30px] w-[120px] text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7일 이내</SelectItem>
              <SelectItem value="14">14일 이내</SelectItem>
              <SelectItem value="30">30일 이내</SelectItem>
              <SelectItem value="60">60일 이내</SelectItem>
              <SelectItem value="90">90일 이내</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            icon={<ShieldAlert className="size-4" />}
            label={`전체 (${days}일 이내 + 만료)`}
            value={summary?.totalCount ?? 0}
            tone="default"
            active={filter === "all"}
            onClick={() => setFilter("all")}
            loading={dataQuery.isPending}
          />
          <KpiCard
            icon={<ShieldX className="size-4" />}
            label="이미 만료"
            value={summary?.expiredCount ?? 0}
            tone="danger"
            active={filter === "expired"}
            onClick={() => setFilter("expired")}
            loading={dataQuery.isPending}
          />
          <KpiCard
            icon={<Clock className="size-4" />}
            label="7일 이내 임박"
            value={summary?.in7Count ?? 0}
            tone="warn"
            active={filter === "in7"}
            onClick={() => setFilter("in7")}
            loading={dataQuery.isPending}
          />
          <KpiCard
            icon={<ShieldCheck className="size-4" />}
            label="30일 이내 (만료 제외)"
            value={summary?.in30Count ?? 0}
            tone="default"
            active={filter === "in30"}
            onClick={() => setFilter("in30")}
            loading={dataQuery.isPending}
          />
        </div>

        <div className="mb-3">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="번호 / 고객명 / 상품명"
            className="h-[30px] w-[280px] text-[13px]"
          />
        </div>

        <Card>
          <CardContent className="px-0">
            <Table className="min-w-[1100px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">번호</TableHead>
                  <TableHead>고객</TableHead>
                  <TableHead>상품</TableHead>
                  <TableHead className="w-[110px]">만료일</TableHead>
                  <TableHead className="w-[110px]">상태</TableHead>
                  <TableHead className="w-[110px] text-right">금액</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dataQuery.isPending ? (
                  <SkeletonRows />
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-12 text-center text-muted-foreground"
                    >
                      조건에 맞는 보증 항목이 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((it) => (
                    <TableRow
                      key={it.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/repairs/${it.id}`)}
                    >
                      <TableCell className="font-mono text-[13px]">
                        {it.ticketNo}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {it.customerName ?? "(미등록)"}
                          </span>
                          {it.customerPhone && (
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {it.customerPhone}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{it.productName}</span>
                          {it.productSku && (
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {it.productSku}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-[12px]">
                        {format(new Date(it.warrantyEnds), "yyyy-MM-dd", {
                          locale: ko,
                        })}
                      </TableCell>
                      <TableCell>
                        {it.isExpired ? (
                          <Badge variant="destructive">
                            {Math.abs(it.daysLeft)}일 지남
                          </Badge>
                        ) : it.daysLeft <= 7 ? (
                          <Badge
                            variant="outline"
                            className="border-amber-300 bg-amber-50 text-amber-800"
                          >
                            D-{it.daysLeft}
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            D-{it.daysLeft}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        ₩{it.finalAmount.toLocaleString("ko-KR")}
                      </TableCell>
                    </TableRow>
                  ))
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
  tone,
  active,
  onClick,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "default" | "warn" | "danger";
  active: boolean;
  onClick: () => void;
  loading: boolean;
}) {
  const ringClass = active
    ? tone === "danger"
      ? "ring-2 ring-rose-300"
      : tone === "warn"
        ? "ring-2 ring-amber-300"
        : "ring-2 ring-zinc-300"
    : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left transition-shadow ${ringClass} rounded-xl`}
    >
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
          <CardTitle className="text-[12px] font-medium text-muted-foreground">
            {label}
          </CardTitle>
          <span
            className={
              tone === "danger"
                ? "text-rose-600"
                : tone === "warn"
                  ? "text-amber-600"
                  : "text-muted-foreground"
            }
          >
            {icon}
          </span>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <div className="text-2xl font-bold tabular-nums">{value}</div>
          )}
        </CardContent>
      </Card>
    </button>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 6 }).map((__, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-20" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
