"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ShieldAlert, ShieldCheck, ShieldX, Clock } from "lucide-react";

import { apiGet } from "@/lib/api-client";
import {
  JmBadge,
  JmCard,
  JmEmpty,
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
  JmTableToolbarSearch,
} from "@/jm";
import { RepairsThemeScope } from "../_theme-scope";

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

const DAYS_OPTIONS = [
  { value: "7", label: "7일 이내" },
  { value: "14", label: "14일 이내" },
  { value: "30", label: "30일 이내" },
  { value: "60", label: "60일 이내" },
  { value: "90", label: "90일 이내" },
];

function WarrantySkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <JmTableRow key={i} className="hover:bg-transparent">
          <JmTableCell><JmSkeleton className="h-4 w-28" /></JmTableCell>
          <JmTableCell>
            <div className="flex flex-col gap-1">
              <JmSkeleton className="h-4 w-24" />
              <JmSkeleton className="h-3 w-20" />
            </div>
          </JmTableCell>
          <JmTableCell>
            <div className="flex flex-col gap-1">
              <JmSkeleton className="h-4 w-32" />
              <JmSkeleton className="h-3 w-16" />
            </div>
          </JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-24" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-5 w-14 rounded-full" /></JmTableCell>
          <JmTableCell>
            <div className="flex justify-end">
              <JmSkeleton className="h-4 w-20" />
            </div>
          </JmTableCell>
        </JmTableRow>
      ))}
    </>
  );
}

export default function RepairWarrantyPage() {
  const router = useRouter();
  const [days, setDays] = useState(30);
  const [filter, setFilter] = useState<"all" | "expired" | "in7" | "in30">("all");
  const [search, setSearch] = useState("");

  const dataQuery = useQuery<Response>({
    queryKey: ["repair-warranty", days],
    queryFn: () =>
      apiGet<Response>(`/api/repair-tickets/warranty/expiring?days=${days}`),
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

  const isPending = dataQuery.isPending;
  const isError = dataQuery.isError;

  return (
    <RepairsThemeScope>
      <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
        {/* 상단 헤더 */}
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-6 py-3">
          <span className="text-jm-base font-semibold">수리 보증 만료 알림</span>
          <span className="text-jm-xs text-[var(--jm-text-muted)]">
            PICKED_UP 후 보증 임박/만료 건
          </span>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-jm-sm text-[var(--jm-text-muted)]">조회 범위</span>
            <JmSelect
              size="sm"
              value={String(days)}
              onChange={(v) => setDays(parseInt(v ?? "30", 10) || 30)}
              options={DAYS_OPTIONS}
            />
          </div>
        </div>

        <div className="flex w-full flex-col gap-6 p-4">
          {/* KPI — 클릭 가능한 JmStat */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <button
              type="button"
              className={`rounded-xl text-left transition-shadow ${
                filter === "all" ? "ring-2 ring-[var(--jm-ring)]" : ""
              }`}
              onClick={() => setFilter("all")}
            >
              <JmStat
                label={`전체 (${days}일 이내 + 만료)`}
                value={isPending ? "—" : (summary?.totalCount ?? 0).toLocaleString("ko-KR")}
                icon={<ShieldAlert className="size-4" />}
                size="sm"
              />
            </button>
            <button
              type="button"
              className={`rounded-xl text-left transition-shadow ${
                filter === "expired" ? "ring-2 ring-[var(--jm-ring)]" : ""
              }`}
              onClick={() => setFilter("expired")}
            >
              <JmStat
                label="이미 만료"
                value={isPending ? "—" : (summary?.expiredCount ?? 0).toLocaleString("ko-KR")}
                icon={<ShieldX className="size-4" />}
                size="sm"
                positiveIsGood={false}
              />
            </button>
            <button
              type="button"
              className={`rounded-xl text-left transition-shadow ${
                filter === "in7" ? "ring-2 ring-[var(--jm-ring)]" : ""
              }`}
              onClick={() => setFilter("in7")}
            >
              <JmStat
                label="7일 이내 임박"
                value={isPending ? "—" : (summary?.in7Count ?? 0).toLocaleString("ko-KR")}
                icon={<Clock className="size-4" />}
                size="sm"
                positiveIsGood={false}
              />
            </button>
            <button
              type="button"
              className={`rounded-xl text-left transition-shadow ${
                filter === "in30" ? "ring-2 ring-[var(--jm-ring)]" : ""
              }`}
              onClick={() => setFilter("in30")}
            >
              <JmStat
                label="30일 이내 (만료 제외)"
                value={isPending ? "—" : (summary?.in30Count ?? 0).toLocaleString("ko-KR")}
                icon={<ShieldCheck className="size-4" />}
                size="sm"
              />
            </button>
          </div>

          {/* 검색 + 테이블 카드 */}
          <JmCard className="overflow-hidden p-0">
            <JmTableToolbar>
              <JmTableToolbarSearch>
                <JmSearchInput
                  size="sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onClear={() => setSearch("")}
                  placeholder="번호 / 고객명 / 상품명"
                />
              </JmTableToolbarSearch>
            </JmTableToolbar>

            <JmTable className="min-w-[1100px]">
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead className="w-[140px]">번호</JmTableHead>
                  <JmTableHead>고객</JmTableHead>
                  <JmTableHead>상품</JmTableHead>
                  <JmTableHead className="w-[110px]">만료일</JmTableHead>
                  <JmTableHead className="w-[110px]">상태</JmTableHead>
                  <JmTableHead className="w-[110px] text-right">금액</JmTableHead>
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {isPending ? (
                  <WarrantySkeletonRows />
                ) : isError ? (
                  <JmTableRow className="hover:bg-transparent">
                    <JmTableCell
                      colSpan={6}
                      className="py-10 text-center text-jm-sm text-[var(--jm-danger-fg)]"
                    >
                      보증 목록을 불러오지 못했습니다
                    </JmTableCell>
                  </JmTableRow>
                ) : items.length === 0 ? (
                  <JmTableRow className="hover:bg-transparent">
                    <JmTableCell colSpan={6} className="py-12">
                      <JmEmpty
                        icon={<ShieldCheck className="size-8" />}
                        title="조건에 맞는 보증 항목이 없습니다"
                        description="필터나 조회 범위를 바꿔보세요"
                      />
                    </JmTableCell>
                  </JmTableRow>
                ) : (
                  items.map((it) => (
                    <JmTableRow
                      key={it.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/repairs/${it.id}`)}
                    >
                      <JmTableCell>
                        <span className="font-[family-name:var(--jm-font-mono)] text-jm-sm text-[var(--jm-text-muted)]">
                          {it.ticketNo}
                        </span>
                      </JmTableCell>
                      <JmTableCell>
                        <div className="flex flex-col">
                          <span className="text-jm-sm font-medium text-[var(--jm-text)]">
                            {it.customerName ?? "(미등록)"}
                          </span>
                          {it.customerPhone && (
                            <span className="font-[family-name:var(--jm-font-mono)] text-jm-2xs text-[var(--jm-text-muted)]">
                              {it.customerPhone}
                            </span>
                          )}
                        </div>
                      </JmTableCell>
                      <JmTableCell>
                        <div className="flex flex-col">
                          <span className="text-jm-sm font-medium text-[var(--jm-text)]">
                            {it.productName}
                          </span>
                          {it.productSku && (
                            <span className="font-[family-name:var(--jm-font-mono)] text-jm-2xs text-[var(--jm-text-muted)]">
                              {it.productSku}
                            </span>
                          )}
                        </div>
                      </JmTableCell>
                      <JmTableCell>
                        <span className="font-[family-name:var(--jm-font-mono)] text-jm-xs text-[var(--jm-text-muted)]">
                          {format(new Date(it.warrantyEnds), "yyyy-MM-dd", { locale: ko })}
                        </span>
                      </JmTableCell>
                      <JmTableCell>
                        {it.isExpired ? (
                          <JmBadge variant="danger" size="sm">
                            {Math.abs(it.daysLeft)}일 지남
                          </JmBadge>
                        ) : it.daysLeft <= 7 ? (
                          <JmBadge variant="warning" size="sm">
                            D-{it.daysLeft}
                          </JmBadge>
                        ) : (
                          <JmBadge variant="outline" size="sm">
                            D-{it.daysLeft}
                          </JmBadge>
                        )}
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums text-jm-sm text-[var(--jm-text)]">
                        ₩{it.finalAmount.toLocaleString("ko-KR")}
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
