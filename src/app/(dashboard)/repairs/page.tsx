"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { HelpCircle, MapPin, Phone, User, Wrench } from "lucide-react";

import { apiGet } from "@/lib/api-client";
import {
  JmBadge,
  JmButton,
  JmCard,
  JmEmpty,
  JmPill,
  JmSearchInput,
  JmSelect,
  JmSkeleton,
  JmStat,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
  JmTableToolbar,
  JmTableToolbarActions,
  JmTableToolbarFilters,
  JmTableToolbarSearch,
} from "@/jm";
import { RepairsThemeScope } from "./_theme-scope";

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

type JmBadgeVariant = "default" | "outline" | "success" | "danger" | "warning" | "info" | "accent";

const STATUS_BADGE_VARIANT: Record<RepairStatus, JmBadgeVariant> = {
  RECEIVED: "default",
  DIAGNOSING: "default",
  QUOTED: "outline",
  APPROVED: "outline",
  REPAIRING: "info",
  READY: "info",
  PICKED_UP: "success",
  CANCELLED: "danger",
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

const CANCEL_REASON_OPTIONS: { value: CancelReasonValue; label: string }[] = [
  { value: "ALL", label: "사유 전체" },
  { value: "SOLD_AS_PRODUCT", label: "상품 전환" },
  { value: "CUSTOMER_DECLINED", label: "손님 거절" },
  { value: "CUSTOMER_NO_SHOW", label: "미반환" },
  { value: "SHOP_GAVE_UP", label: "매장 포기" },
  { value: "PARTS_UNAVAILABLE", label: "부속 부족" },
  { value: "MISTAKE", label: "잘못 생성" },
  { value: "OTHER", label: "기타" },
];

function RepairsSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <JmTableRow key={i} className="hover:bg-transparent">
          <JmTableCell><JmSkeleton className="h-5 w-14 rounded-full" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-28" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-5 w-12 rounded-md" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-5 w-16 rounded-full" /></JmTableCell>
          <JmTableCell>
            <div className="flex flex-col gap-1">
              <JmSkeleton className="h-4 w-24" />
              <JmSkeleton className="h-3 w-20" />
            </div>
          </JmTableCell>
          <JmTableCell>
            <div className="flex flex-col gap-1">
              <JmSkeleton className="h-3 w-24" />
              <JmSkeleton className="h-4 w-40" />
            </div>
          </JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-16" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-12" /></JmTableCell>
        </JmTableRow>
      ))}
    </>
  );
}

export default function RepairsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RepairStatus | "OPEN" | "ALL">("OPEN");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
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
    if (categoryFilter === "__none__") {
      all = all.filter((t) => !t.repairCategory);
    } else if (categoryFilter) {
      all = all.filter((t) => t.repairCategory?.id === categoryFilter);
    }
    if (statusFilter === "CANCELLED" && cancelReasonFilter !== "ALL") {
      all = all.filter((t) => t.cancelReason === cancelReasonFilter);
    }
    return all;
  }, [ticketsQuery.data, statusFilter, categoryFilter, cancelReasonFilter]);

  // KPI — 로드된 티켓 기준
  const kpi = useMemo(() => {
    const all = ticketsQuery.data ?? [];
    const total = all.length;
    const inProgress = all.filter((t) => t.status !== "PICKED_UP" && t.status !== "CANCELLED").length;
    const repairing = all.filter((t) => t.status === "REPAIRING").length;
    const ready = all.filter((t) => t.status === "READY").length;
    return { total, inProgress, repairing, ready };
  }, [ticketsQuery.data]);

  const isPending = ticketsQuery.isPending;
  const isError = ticketsQuery.isError;

  const categoryOptions = useMemo(() => {
    const cats = categoriesQuery.data ?? [];
    return [
      { value: "", label: "카테고리 전체" },
      { value: "__none__", label: "기타 (미지정)" },
      ...cats.map((c) => ({ value: c.id, label: c.name })),
    ];
  }, [categoriesQuery.data]);

  return (
    <RepairsThemeScope>
      <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
        <div className="flex w-full flex-col gap-6 p-4">
          {/* KPI */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <JmStat
              label="전체 티켓"
              value={isPending ? "—" : kpi.total.toLocaleString("ko-KR")}
              size="sm"
              hint={isPending ? "" : "조회된 수리 티켓"}
            />
            <JmStat
              label="진행중"
              value={isPending ? "—" : kpi.inProgress.toLocaleString("ko-KR")}
              size="sm"
              hint={isPending ? "" : "완료·취소 제외"}
            />
            <JmStat
              label="수리중"
              value={isPending ? "—" : kpi.repairing.toLocaleString("ko-KR")}
              size="sm"
              hint={isPending ? "" : "REPAIRING 상태"}
              positiveIsGood={false}
            />
            <JmStat
              label="인계대기"
              value={isPending ? "—" : kpi.ready.toLocaleString("ko-KR")}
              size="sm"
              hint={isPending ? "" : "손님 픽업 대기"}
              positiveIsGood={false}
            />
          </div>

          {/* 메인 카드 */}
          <JmCard className="overflow-hidden p-0">
            <JmTableToolbar>
              <JmTableToolbarSearch>
                <JmSearchInput
                  size="sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onClear={() => setSearch("")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      ticketsQuery.refetch();
                    }
                  }}
                  placeholder="수리번호·고객이름·전화·증상 검색"
                />
              </JmTableToolbarSearch>

              <JmTableToolbarFilters>
                {/* 상태 필터 */}
                {STATUS_FILTERS.map((f) => (
                  <JmPill
                    key={f.value}
                    size="sm"
                    active={statusFilter === f.value}
                    onClick={() => setStatusFilter(f.value)}
                  >
                    {f.label}
                  </JmPill>
                ))}

                <span className="mx-1 h-4 w-px bg-[var(--jm-border)]" />

                {/* 카테고리 필터 */}
                <JmSelect
                  size="sm"
                  variant="pill"
                  label="카테고리"
                  value={categoryFilter}
                  onChange={(v) => setCategoryFilter(v)}
                  options={categoryOptions}
                />

                {/* 취소사유 필터 — CANCELLED 일 때만 노출 */}
                {statusFilter === "CANCELLED" && (
                  <JmSelect
                    size="sm"
                    variant="pill"
                    label="취소사유"
                    value={cancelReasonFilter}
                    onChange={(v) => setCancelReasonFilter(v as CancelReasonValue)}
                    options={CANCEL_REASON_OPTIONS}
                  />
                )}
              </JmTableToolbarFilters>

              <JmTableToolbarActions>
                <JmButton
                  size="sm"
                  variant="ghost"
                  onClick={() => router.push("/repairs/help")}
                >
                  <HelpCircle className="size-4" />
                  도움말
                </JmButton>
                <JmButton
                  size="sm"
                  variant="outline"
                  onClick={() => router.push("/repairs/stats")}
                >
                  통계
                </JmButton>
              </JmTableToolbarActions>
            </JmTableToolbar>

            <JmTable className="min-w-[1100px]">
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead className="w-[90px]">상태</JmTableHead>
                  <JmTableHead className="w-[150px]">수리번호</JmTableHead>
                  <JmTableHead className="w-[80px]">유형</JmTableHead>
                  <JmTableHead className="w-[100px]">카테고리</JmTableHead>
                  <JmTableHead className="w-[160px]">고객</JmTableHead>
                  <JmTableHead>증상 / 기기</JmTableHead>
                  <JmTableHead className="w-[110px]">접수일</JmTableHead>
                  <JmTableHead className="w-[90px]">담당</JmTableHead>
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {isPending ? (
                  <RepairsSkeletonRows />
                ) : isError ? (
                  <JmTableRow className="hover:bg-transparent">
                    <JmTableCell
                      colSpan={8}
                      className="py-10 text-center text-[13px] text-[var(--jm-danger-fg)]"
                    >
                      수리 티켓을 불러오지 못했습니다
                    </JmTableCell>
                  </JmTableRow>
                ) : tickets.length === 0 ? (
                  <JmTableRow className="hover:bg-transparent">
                    <JmTableCell colSpan={8} className="py-12">
                      <JmEmpty
                        icon={<Wrench className="size-8" />}
                        title="수리 티켓이 없습니다"
                        description="필터를 바꾸거나 POS에서 수리를 접수하세요"
                      />
                    </JmTableCell>
                  </JmTableRow>
                ) : (
                  tickets.map((t) => (
                    <JmTableRow
                      key={t.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/pos/repairs/${t.id}`)}
                    >
                      <JmTableCell>
                        <JmBadge variant={STATUS_BADGE_VARIANT[t.status]} size="sm">
                          {STATUS_LABEL[t.status]}
                        </JmBadge>
                      </JmTableCell>
                      <JmTableCell>
                        <span className="font-[family-name:var(--jm-font-mono)] text-[12px] text-[var(--jm-text-muted)]">
                          {t.ticketNo}
                        </span>
                      </JmTableCell>
                      <JmTableCell>
                        <JmBadge variant="outline" size="sm">
                          {t.type === "ON_SITE" ? (
                            <><MapPin className="size-3" /> 즉시</>
                          ) : (
                            <><Wrench className="size-3" /> 맡김</>
                          )}
                        </JmBadge>
                      </JmTableCell>
                      <JmTableCell>
                        {t.repairCategory ? (
                          <JmBadge variant="default" size="sm">
                            {t.repairCategory.name}
                          </JmBadge>
                        ) : (
                          <span className="text-[12px] text-[var(--jm-text-subtle)]">기타</span>
                        )}
                      </JmTableCell>
                      <JmTableCell>
                        <div className="flex flex-col">
                          {t.customer ? (
                            <>
                              <span className="flex items-center gap-1 text-[13px] text-[var(--jm-text)]">
                                <User className="size-3 text-[var(--jm-text-muted)]" />
                                {t.customer.name}
                              </span>
                              {t.customer.phone && (
                                <span className="flex items-center gap-1 text-[11px] text-[var(--jm-text-muted)]">
                                  <Phone className="size-3" />
                                  {t.customer.phone}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="flex items-center gap-1 text-[12px] text-[var(--jm-text-subtle)]">
                              <User className="size-3" /> 미등록
                            </span>
                          )}
                        </div>
                      </JmTableCell>
                      <JmTableCell>
                        <div className="flex flex-col">
                          {t.customerMachine && (
                            <span className="text-[11px] text-[var(--jm-text-muted)]">
                              {t.customerMachine.name}
                            </span>
                          )}
                          <span className="line-clamp-1 max-w-[280px] text-[13px] text-[var(--jm-text)]">
                            {t.symptom ?? <span className="text-[var(--jm-text-subtle)]">-</span>}
                          </span>
                        </div>
                      </JmTableCell>
                      <JmTableCell className="text-[12px] text-[var(--jm-text-muted)]">
                        {format(new Date(t.receivedAt), "MM-dd HH:mm")}
                      </JmTableCell>
                      <JmTableCell className="text-[12px] text-[var(--jm-text-muted)]">
                        {t.assignedTo?.name ?? (
                          <span className="text-[var(--jm-text-subtle)]">-</span>
                        )}
                      </JmTableCell>
                    </JmTableRow>
                  ))
                )}
              </JmTableBody>
            </JmTable>
          </JmCard>
        </div>
      </div>
    </RepairsThemeScope>
  );
}
