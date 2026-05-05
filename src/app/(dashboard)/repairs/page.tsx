"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Phone, User, Wrench, MapPin } from "lucide-react";

import { apiGet } from "@/lib/api-client";
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
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { cn } from "@/lib/utils";

type RepairStatus =
  | "RECEIVED"
  | "DIAGNOSING"
  | "QUOTED"
  | "APPROVED"
  | "REPAIRING"
  | "READY"
  | "PICKED_UP"
  | "CANCELLED";

type RepairType = "ON_SITE" | "DROP_OFF";

interface RepairTicketRow {
  id: string;
  ticketNo: string;
  type: RepairType;
  status: RepairStatus;
  receivedAt: string;
  pickedUpAt: string | null;
  symptom: string | null;
  customer: { id: string; name: string; phone: string | null } | null;
  customerMachine: { id: string; name: string } | null;
  serialItem: { id: string; code: string } | null;
  assignedTo: { id: string; name: string } | null;
  repairCategory: { id: string; name: string } | null;
  cancelReason:
    | "CUSTOMER_DECLINED"
    | "CUSTOMER_NO_SHOW"
    | "SHOP_GAVE_UP"
    | "PARTS_UNAVAILABLE"
    | "SOLD_AS_PRODUCT"
    | "MISTAKE"
    | "OTHER"
    | null;
  cancelMemo: string | null;
  _count: { parts: number; labors: number };
}

const STATUS_LABEL: Record<RepairStatus, string> = {
  RECEIVED: "접수",
  DIAGNOSING: "진단중",
  QUOTED: "견적대기",
  APPROVED: "승인",
  REPAIRING: "수리중",
  READY: "인계대기",
  PICKED_UP: "수리완료",
  CANCELLED: "취소",
};

const STATUS_VARIANT: Record<RepairStatus, "default" | "secondary" | "outline" | "destructive"> = {
  RECEIVED: "secondary",
  DIAGNOSING: "secondary",
  QUOTED: "outline",
  APPROVED: "outline",
  REPAIRING: "default",
  READY: "default",
  PICKED_UP: "secondary",
  CANCELLED: "destructive",
};

const STATUS_FILTERS: { value: RepairStatus | "OPEN" | "ALL"; label: string }[] = [
  { value: "OPEN", label: "진행중" },
  { value: "RECEIVED", label: "접수" },
  { value: "DIAGNOSING", label: "진단중" },
  { value: "QUOTED", label: "견적대기" },
  { value: "APPROVED", label: "승인" },
  { value: "REPAIRING", label: "수리중" },
  { value: "READY", label: "인계대기" },
  { value: "PICKED_UP", label: "수리완료" },
  { value: "CANCELLED", label: "취소" },
  { value: "ALL", label: "전체" },
];

function RepairsSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-5 w-12 rounded-md" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-5 w-12 rounded-md" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

interface CategoryOption {
  id: string;
  name: string;
}

type CancelReasonValue =
  | "ALL"
  | "CUSTOMER_DECLINED"
  | "CUSTOMER_NO_SHOW"
  | "SHOP_GAVE_UP"
  | "PARTS_UNAVAILABLE"
  | "SOLD_AS_PRODUCT"
  | "MISTAKE"
  | "OTHER";

const CANCEL_REASON_FILTERS: { value: CancelReasonValue; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "SOLD_AS_PRODUCT", label: "상품 전환" },
  { value: "CUSTOMER_DECLINED", label: "손님 거절" },
  { value: "CUSTOMER_NO_SHOW", label: "미반환" },
  { value: "SHOP_GAVE_UP", label: "매장 포기" },
  { value: "PARTS_UNAVAILABLE", label: "부속 부족" },
  { value: "MISTAKE", label: "잘못 생성" },
  { value: "OTHER", label: "기타" },
];

const REPAIR_CANCEL_REASON_LABEL: Record<string, string> = {
  CUSTOMER_DECLINED: "손님 거절",
  CUSTOMER_NO_SHOW: "손님 미반환",
  SHOP_GAVE_UP: "매장 포기",
  PARTS_UNAVAILABLE: "부속 수급 불가",
  SOLD_AS_PRODUCT: "상품 구매로 전환",
  MISTAKE: "잘못 생성",
  OTHER: "기타",
};

export default function RepairsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RepairStatus | "OPEN" | "ALL">("OPEN");
  // 카테고리 필터 — "" = 전체, "__none__" = 카테고리 없음(기타)
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  // 취소 사유 필터 — statusFilter === "CANCELLED" 일 때만 의미
  const [cancelReasonFilter, setCancelReasonFilter] = useState<CancelReasonValue>("ALL");

  const categoriesQuery = useQuery<CategoryOption[]>({
    queryKey: ["categories", "for-repair-filter"],
    queryFn: () => apiGet<CategoryOption[]>("/api/categories"),
    staleTime: 1000 * 60 * 5,
  });

  const ticketsQuery = useQuery({
    queryKey: ["repairs", "list", { search, statusFilter, categoryFilter }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "OPEN" && statusFilter !== "ALL")
        params.set("status", statusFilter);
      return apiGet<RepairTicketRow[]>(`/api/repair-tickets?${params}`);
    },
  });

  const tickets = useMemo(() => {
    let all = ticketsQuery.data ?? [];
    if (statusFilter === "OPEN") {
      all = all.filter((t) => t.status !== "PICKED_UP" && t.status !== "CANCELLED");
    }
    // 카테고리 필터 — 클라이언트 사이드 (간단)
    if (categoryFilter === "__none__") {
      all = all.filter((t) => !t.repairCategory);
    } else if (categoryFilter) {
      all = all.filter((t) => t.repairCategory?.id === categoryFilter);
    }
    // 취소사유 필터 — CANCELLED 상태일 때만
    if (statusFilter === "CANCELLED" && cancelReasonFilter !== "ALL") {
      all = all.filter((t) => t.cancelReason === cancelReasonFilter);
    }
    return all;
  }, [ticketsQuery.data, statusFilter, categoryFilter, cancelReasonFilter]);

  return (
    <div className="flex h-full flex-col">
      <DataTableToolbar
        onAdd={() => router.push("/repairs/stats")}
        addLabel="통계"
        search={{
          value: search,
          onChange: setSearch,
          onSearch: () => ticketsQuery.refetch(),
          placeholder: "수리번호·고객이름·전화·증상 검색",
        }}
        onRefresh={() => ticketsQuery.refetch()}
        loading={ticketsQuery.isFetching}
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-[30px] items-center gap-1 rounded-md border border-border bg-card px-1 text-[13px]">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={cn(
                    "rounded px-2 py-0.5 transition-colors",
                    statusFilter === f.value
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {/* 카테고리 필터 */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-[30px] rounded-md border border-border bg-card px-2 text-[13px]"
            >
              <option value="">카테고리 전체</option>
              <option value="__none__">기타 (미지정)</option>
              {(categoriesQuery.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {/* 취소사유 필터 — CANCELLED 일 때만 노출 */}
            {statusFilter === "CANCELLED" && (
              <select
                value={cancelReasonFilter}
                onChange={(e) =>
                  setCancelReasonFilter(e.target.value as CancelReasonValue)
                }
                className="h-[30px] rounded-md border border-border bg-card px-2 text-[13px]"
              >
                {CANCEL_REASON_FILTERS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.value === "ALL" ? "사유 전체" : r.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        }
      />
      <div className="flex-1 overflow-y-auto">
        <Table className="min-w-[1100px]">
          <TableHeader>
            <TableRow>
              <TableHead>상태</TableHead>
              <TableHead>수리번호</TableHead>
              <TableHead>유형</TableHead>
              <TableHead>카테고리</TableHead>
              <TableHead>고객</TableHead>
              <TableHead>증상 / 기기</TableHead>
              <TableHead>접수일</TableHead>
              <TableHead>담당</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ticketsQuery.isPending ? (
              <RepairsSkeletonRows />
            ) : tickets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  수리 티켓이 없습니다
                </TableCell>
              </TableRow>
            ) : (
              tickets.map((t) => (
                <TableRow
                  key={t.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/pos/repair-v2/${t.id}`)}
                >
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{t.ticketNo}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {t.type === "ON_SITE" ? (
                        <><MapPin className="size-3" /> 즉시</>
                      ) : (
                        <><Wrench className="size-3" /> 맡김</>
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {t.repairCategory ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {t.repairCategory.name}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">기타</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      {t.customer ? (
                        <>
                          <span className="flex items-center gap-1">
                            <User className="size-3 text-muted-foreground" />
                            {t.customer.name}
                          </span>
                          {t.customer.phone && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Phone className="size-3" />
                              {t.customer.phone}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="size-3" /> 미등록
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      {t.customerMachine && (
                        <span className="text-xs text-muted-foreground">
                          {t.customerMachine.name}
                        </span>
                      )}
                      <span className="line-clamp-1 max-w-[280px]">
                        {t.symptom ?? <span className="text-muted-foreground">-</span>}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {format(new Date(t.receivedAt), "MM-dd HH:mm")}
                  </TableCell>
                  <TableCell className="text-xs">
                    {t.assignedTo?.name ?? <span className="text-muted-foreground">-</span>}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
