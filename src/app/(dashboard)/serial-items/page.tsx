"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ChevronRight,
  Printer,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Wrench,
} from "lucide-react";

import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  JmBadge,
  JmButton,
  JmCard,
  JmCheckbox,
  JmDialog,
  JmDialogContent,
  JmDialogHeader,
  JmDialogTitle,
  JmEmpty,
  JmIconButton,
  JmPill,
  JmSearchInput,
  JmSkeleton,
  JmSpinner,
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
  JmTooltip,
  JmTooltipProvider,
} from "@/jm";
import { SerialItemsThemeScope } from "./_theme-scope";

interface SerialItemRow {
  id: string;
  code: string;
  status: "ACTIVE" | "RETURNED" | "SCRAPPED";
  source: "SALE" | "REPAIR";
  displayName: string | null;
  soldAt: string;
  warrantyEnds: string | null;
  product: { id: string; name: string; sku: string } | null;
  customer: { id: string; name: string; phone: string | null } | null;
  createdAt: string;
}

type StatusKey = SerialItemRow["status"];
type StatusFilter = "all" | StatusKey;
type SourceFilter = "all" | SerialItemRow["source"];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "ACTIVE", label: "활성" },
  { value: "RETURNED", label: "반품" },
  { value: "SCRAPPED", label: "폐기" },
];

const SOURCE_FILTERS: { value: SourceFilter; label: string }[] = [
  { value: "all", label: "전체 출처" },
  { value: "SALE", label: "판매" },
  { value: "REPAIR", label: "수리" },
];

type LabelSize = "small" | "standard" | "large";
const LABEL_SIZES: { value: LabelSize; label: string }[] = [
  { value: "small", label: "소형" },
  { value: "standard", label: "표준" },
  { value: "large", label: "대형" },
];

const fmtDate = (iso: string) => format(new Date(iso), "yyyy-MM-dd");

function daysUntil(iso: string) {
  const end = new Date(iso);
  end.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}

// ─────────────────────────────────────────────
function StatusBadge({ status }: { status: StatusKey }) {
  if (status === "ACTIVE")
    return (
      <JmBadge variant="success" size="sm">
        활성
      </JmBadge>
    );
  if (status === "SCRAPPED")
    return (
      <JmBadge variant="danger" size="sm">
        폐기
      </JmBadge>
    );
  return (
    <JmBadge variant="default" size="sm">
      반품
    </JmBadge>
  );
}

function WarrantyCell({ ends }: { ends: string | null }) {
  if (!ends)
    return <span className="text-jm-sm text-[var(--jm-text-subtle)]">—</span>;
  const left = daysUntil(ends);
  return (
    <div className="flex items-center gap-2">
      <span className="tabular-nums text-jm-sm text-[var(--jm-text-muted)]">
        {fmtDate(ends)}
      </span>
      {left < 0 ? (
        <JmBadge variant="default" size="sm">
          만료
        </JmBadge>
      ) : left <= 30 ? (
        <JmBadge variant="warning" size="sm">
          D-{left}
        </JmBadge>
      ) : (
        <span className="text-jm-2xs text-[var(--jm-text-subtle)]">
          D-{left}
        </span>
      )}
    </div>
  );
}

function SerialRowSkeleton() {
  return (
    <JmTableRow className="hover:bg-transparent">
      <JmTableCell>
        <JmSkeleton className="size-4 rounded-md" />
      </JmTableCell>
      <JmTableCell>
        <JmSkeleton className="h-4 w-28" />
      </JmTableCell>
      <JmTableCell>
        <div className="flex flex-col gap-1.5">
          <JmSkeleton className="h-4 w-40" />
          <JmSkeleton className="h-3 w-20" />
        </div>
      </JmTableCell>
      <JmTableCell>
        <div className="flex flex-col gap-1.5">
          <JmSkeleton className="h-4 w-24" />
          <JmSkeleton className="h-3 w-28" />
        </div>
      </JmTableCell>
      <JmTableCell>
        <JmSkeleton className="h-4 w-20" />
      </JmTableCell>
      <JmTableCell>
        <JmSkeleton className="h-4 w-28" />
      </JmTableCell>
      <JmTableCell>
        <JmSkeleton className="h-5 w-12 rounded-full" />
      </JmTableCell>
      <JmTableCell>
        <div className="flex justify-end">
          <JmSkeleton className="h-8 w-8 rounded-md" />
        </div>
      </JmTableCell>
    </JmTableRow>
  );
}

// ─────────────────────────────────────────────
export default function SerialItemsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printCodes, setPrintCodes] = useState<string[] | null>(null);
  const [printSize, setPrintSize] = useState<LabelSize>("standard");

  const itemsQuery = useQuery({
    queryKey: queryKeys.serialItems.list({ search: appliedSearch }),
    queryFn: () =>
      apiGet<SerialItemRow[]>(
        `/api/serial-items?limit=200&search=${encodeURIComponent(appliedSearch)}`,
      ),
  });

  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);

  // KPI — 로드된 데이터 기준
  const stats = useMemo(() => {
    let active = 0;
    let warrantyValid = 0;
    let expiringSoon = 0;
    for (const it of items) {
      if (it.status === "ACTIVE") {
        active += 1;
        if (it.warrantyEnds) {
          const left = daysUntil(it.warrantyEnds);
          if (left >= 0) {
            warrantyValid += 1;
            if (left <= 30) expiringSoon += 1;
          }
        }
      }
    }
    return { total: items.length, active, warrantyValid, expiringSoon };
  }, [items]);

  const statusCounts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: items.length,
      ACTIVE: 0,
      RETURNED: 0,
      SCRAPPED: 0,
    };
    for (const it of items) c[it.status] += 1;
    return c;
  }, [items]);

  const rows = useMemo(() => {
    let r = items;
    if (statusFilter !== "all") r = r.filter((i) => i.status === statusFilter);
    if (sourceFilter !== "all") r = r.filter((i) => i.source === sourceFilter);
    return r;
  }, [items, statusFilter, sourceFilter]);

  const allSelected =
    rows.length > 0 && rows.every((i) => selectedIds.has(i.id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  const selectedCodes = useMemo(
    () => rows.filter((i) => selectedIds.has(i.id)).map((i) => i.code),
    [rows, selectedIds],
  );

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((i) => i.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isPending = itemsQuery.isPending;
  const isError = itemsQuery.isError;

  return (
    <SerialItemsThemeScope>
      <JmTooltipProvider>
        <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
          <div className="flex w-full flex-col gap-6 p-4">
            {/* KPI */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <JmStat
                label="전체 라벨"
                value={isPending ? "—" : stats.total.toLocaleString("ko-KR")}
                icon={<Tag className="size-4" />}
                hint={isPending ? "" : "발번된 시리얼"}
                size="sm"
              />
              <JmStat
                label="활성"
                value={isPending ? "—" : stats.active.toLocaleString("ko-KR")}
                icon={<ScanLine className="size-4" />}
                hint={isPending ? "" : "유통 중"}
                size="sm"
              />
              <JmStat
                label="보증 유효"
                value={
                  isPending
                    ? "—"
                    : stats.warrantyValid.toLocaleString("ko-KR")
                }
                icon={<ShieldCheck className="size-4" />}
                hint={isPending ? "" : "보증 기간 내"}
                size="sm"
              />
              <JmStat
                label="만료 임박"
                value={
                  isPending ? "—" : stats.expiringSoon.toLocaleString("ko-KR")
                }
                icon={<ShieldAlert className="size-4" />}
                hint={isPending ? "" : "30일 이내"}
                positiveIsGood={false}
                size="sm"
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
                    onClear={() => {
                      setSearch("");
                      setAppliedSearch("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        setAppliedSearch(search);
                      }
                    }}
                    placeholder="코드·상품명·고객"
                  />
                </JmTableToolbarSearch>
                <JmTableToolbarFilters>
                  {STATUS_FILTERS.map((f) => (
                    <JmPill
                      key={f.value}
                      size="sm"
                      active={statusFilter === f.value}
                      onClick={() => setStatusFilter(f.value)}
                    >
                      {f.label}
                      <span className="ml-1 tabular-nums opacity-70">
                        {statusCounts[f.value]}
                      </span>
                    </JmPill>
                  ))}
                  <span className="mx-1 h-4 w-px bg-[var(--jm-border)]" />
                  {SOURCE_FILTERS.map((f) => (
                    <JmPill
                      key={f.value}
                      size="sm"
                      active={sourceFilter === f.value}
                      onClick={() => setSourceFilter(f.value)}
                    >
                      {f.label}
                    </JmPill>
                  ))}
                </JmTableToolbarFilters>
                <JmTableToolbarActions>
                  {selectedCodes.length > 0 && (
                    <JmButton
                      size="sm"
                      onClick={() => setPrintCodes(selectedCodes)}
                    >
                      <Printer className="size-4" />
                      선택 {selectedCodes.length}장 재출력
                    </JmButton>
                  )}
                  <JmIconButton
                    variant="ghost"
                    size="sm"
                    aria-label="새로고침"
                    onClick={() => itemsQuery.refetch()}
                    disabled={itemsQuery.isFetching}
                  >
                    {itemsQuery.isFetching ? (
                      <JmSpinner size="sm" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                  </JmIconButton>
                </JmTableToolbarActions>
              </JmTableToolbar>

              <JmTable className="min-w-[1000px]">
                <JmTableHeader>
                  <JmTableRow>
                    <JmTableHead className="w-10">
                      <JmCheckbox
                        size="sm"
                        checked={allSelected}
                        indeterminate={someSelected}
                        onCheckedChange={toggleAll}
                        disabled={rows.length === 0}
                        aria-label="전체 선택"
                      />
                    </JmTableHead>
                    <JmTableHead className="w-[170px]">코드</JmTableHead>
                    <JmTableHead>상품</JmTableHead>
                    <JmTableHead className="w-[180px]">고객</JmTableHead>
                    <JmTableHead className="w-[110px]">판매일</JmTableHead>
                    <JmTableHead className="w-[170px]">보증</JmTableHead>
                    <JmTableHead className="w-[84px]">상태</JmTableHead>
                    <JmTableHead className="w-[90px] text-right">
                      재출력
                    </JmTableHead>
                  </JmTableRow>
                </JmTableHeader>
                <JmTableBody>
                  {isPending ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <SerialRowSkeleton key={i} />
                    ))
                  ) : isError ? (
                    <JmTableRow className="hover:bg-transparent">
                      <JmTableCell
                        colSpan={8}
                        className="py-10 text-center text-jm-sm text-[var(--jm-danger-fg)]"
                      >
                        라벨 목록을 불러오지 못했습니다
                      </JmTableCell>
                    </JmTableRow>
                  ) : rows.length === 0 ? (
                    <JmTableRow className="hover:bg-transparent">
                      <JmTableCell colSpan={8} className="py-12">
                        <JmEmpty
                          icon={<ScanLine className="size-8" />}
                          title={
                            appliedSearch ||
                            statusFilter !== "all" ||
                            sourceFilter !== "all"
                              ? "조건에 맞는 라벨이 없습니다"
                              : "발번된 라벨이 없습니다"
                          }
                          description={
                            appliedSearch ||
                            statusFilter !== "all" ||
                            sourceFilter !== "all"
                              ? "검색어나 필터를 바꿔보세요"
                              : "POS 판매·수리 접수 시 시리얼 라벨이 발번됩니다"
                          }
                        />
                      </JmTableCell>
                    </JmTableRow>
                  ) : (
                    rows.map((it) => (
                      <JmTableRow
                        key={it.id}
                        className="cursor-pointer"
                        onClick={() =>
                          router.push(
                            `/serial-items/${encodeURIComponent(it.code)}`,
                          )
                        }
                      >
                        <JmTableCell onClick={(e) => e.stopPropagation()}>
                          <JmCheckbox
                            size="sm"
                            checked={selectedIds.has(it.id)}
                            onCheckedChange={() => toggleOne(it.id)}
                            aria-label={`${it.code} 선택`}
                          />
                        </JmTableCell>
                        <JmTableCell>
                          <div className="flex items-center gap-1.5">
                            {it.source === "REPAIR" && (
                              <JmBadge variant="outline" size="sm">
                                <Wrench className="size-3" />
                                수리
                              </JmBadge>
                            )}
                            <span className="font-[family-name:var(--jm-font-mono)] text-jm-sm font-medium text-[var(--jm-text)]">
                              {it.code}
                            </span>
                          </div>
                        </JmTableCell>
                        <JmTableCell>
                          {it.product ? (
                            <div className="flex flex-col">
                              <span className="text-jm-sm text-[var(--jm-text)]">
                                {it.product.name}
                              </span>
                              <span className="font-[family-name:var(--jm-font-mono)] text-jm-2xs text-[var(--jm-text-muted)]">
                                {it.product.sku}
                              </span>
                            </div>
                          ) : it.displayName ? (
                            <div className="flex flex-col">
                              <span className="text-jm-sm text-[var(--jm-text)]">
                                {it.displayName}
                              </span>
                              <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                                외부 기기
                              </span>
                            </div>
                          ) : (
                            <span className="text-jm-sm text-[var(--jm-text-subtle)]">
                              —
                            </span>
                          )}
                        </JmTableCell>
                        <JmTableCell>
                          {it.customer ? (
                            <div className="flex flex-col">
                              <span className="text-jm-sm text-[var(--jm-text)]">
                                {it.customer.name}
                              </span>
                              {it.customer.phone && (
                                <span className="font-[family-name:var(--jm-font-mono)] text-jm-2xs text-[var(--jm-text-muted)]">
                                  {it.customer.phone}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-jm-sm text-[var(--jm-text-subtle)]">
                              —
                            </span>
                          )}
                        </JmTableCell>
                        <JmTableCell className="tabular-nums text-jm-sm text-[var(--jm-text-muted)]">
                          {fmtDate(it.soldAt)}
                        </JmTableCell>
                        <JmTableCell>
                          <WarrantyCell ends={it.warrantyEnds} />
                        </JmTableCell>
                        <JmTableCell>
                          <StatusBadge status={it.status} />
                        </JmTableCell>
                        <JmTableCell>
                          <div
                            className="flex items-center justify-end gap-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <JmTooltip content="라벨 재출력">
                              <JmIconButton
                                variant="ghost"
                                size="sm"
                                aria-label="재출력"
                                onClick={() => setPrintCodes([it.code])}
                              >
                                <Printer className="size-4" />
                              </JmIconButton>
                            </JmTooltip>
                            <ChevronRight className="size-4 shrink-0 text-[var(--jm-text-subtle)]" />
                          </div>
                        </JmTableCell>
                      </JmTableRow>
                    ))
                  )}
                </JmTableBody>
              </JmTable>
            </JmCard>
          </div>
        </div>

        <JmDialog
          open={!!printCodes}
          onOpenChange={(o) => !o && setPrintCodes(null)}
        >
          <JmDialogContent className="flex h-[95vh] w-[95vw] max-w-[95vw] flex-col p-0">
            <JmDialogHeader className="flex-row items-center gap-3">
              <JmDialogTitle>
                라벨 재출력 ({printCodes?.length ?? 0}장)
              </JmDialogTitle>
              <div className="flex gap-1.5">
                {LABEL_SIZES.map((sz) => (
                  <JmButton
                    key={sz.value}
                    variant={printSize === sz.value ? "cta" : "outline"}
                    size="xs"
                    onClick={() => setPrintSize(sz.value)}
                  >
                    {sz.label}
                  </JmButton>
                ))}
              </div>
            </JmDialogHeader>
            {printCodes && (
              <iframe
                key={printSize}
                src={`/serial-items/print?codes=${printCodes.join(",")}&size=${printSize}`}
                className="size-full flex-1 border-0"
                title="라벨 재출력"
              />
            )}
          </JmDialogContent>
        </JmDialog>
      </JmTooltipProvider>
    </SerialItemsThemeScope>
  );
}
