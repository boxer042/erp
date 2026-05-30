"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, ScrollText } from "lucide-react";

import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

import {
  JmCard,
  JmEmpty,
  JmIconButton,
  JmSearchInput,
  JmSkeleton,
  JmSpinner,
  JmSelect,
  JmBadge,
  type JmBadgeProps,
  JmDialog,
  JmDialogContent,
  JmDialogHeader,
  JmDialogTitle,
  JmDialogBody,
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

interface AuditLog {
  id: string;
  userId: string | null;
  user: { id: string; name: string; email: string } | null;
  entity: string;
  entityId: string | null;
  action: string;
  before: unknown;
  after: unknown;
  meta: unknown;
  createdAt: string;
}

const ENTITY_LABELS: Record<string, string> = {
  Order: "주문",
  Incoming: "입고",
  PurchaseOrder: "발주",
  Supplier: "거래처",
  Customer: "고객",
  Quotation: "견적서",
  Statement: "거래명세표",
  Rental: "임대",
  RepairTicket: "수리",
  SupplierReturn: "반품",
  SupplierPayment: "지급",
  CustomerPayment: "수금",
};

const ACTION_LABELS: Record<string, string> = {
  CREATE: "생성",
  UPDATE: "수정",
  DELETE: "삭제",
  CONFIRM: "확정",
  CANCEL: "취소",
  STATUS_CHANGE: "상태변경",
};

const ACTION_BADGE: Record<string, JmBadgeProps["variant"]> = {
  CREATE: "success",
  UPDATE: "info",
  DELETE: "danger",
  CONFIRM: "info",
  CANCEL: "default",
  STATUS_CHANGE: "warning",
};

const ENTITY_OPTIONS = [
  { value: "all", label: "전체 엔티티" },
  ...Object.entries(ENTITY_LABELS).map(([k, v]) => ({ value: k, label: v })),
];

const ACTION_OPTIONS = [
  { value: "all", label: "전체 액션" },
  ...Object.entries(ACTION_LABELS).map(([k, v]) => ({ value: k, label: v })),
];

export default function AuditLogsPage() {
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [detailRow, setDetailRow] = useState<AuditLog | null>(null);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (entityFilter !== "all") p.set("entity", entityFilter);
    if (actionFilter !== "all") p.set("action", actionFilter);
    return p.toString();
  }, [entityFilter, actionFilter]);

  const logsQuery = useQuery<AuditLog[]>({
    queryKey: queryKeys.auditLogs.list({ entity: entityFilter, action: actionFilter }),
    queryFn: () => apiGet<AuditLog[]>(`/api/audit-logs${params ? "?" + params : ""}`),
    staleTime: 1000 * 30,
  });

  const filtered = useMemo(() => {
    const all = logsQuery.data ?? [];
    if (!search.trim()) return all;
    const q = search.trim().toLowerCase();
    return all.filter(
      (l) =>
        (l.entityId?.toLowerCase().includes(q) ?? false) ||
        (l.user?.name.toLowerCase().includes(q) ?? false) ||
        (l.user?.email.toLowerCase().includes(q) ?? false)
    );
  }, [logsQuery.data, search]);

  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="flex w-full flex-col gap-6 p-4">
        <JmCard className="overflow-hidden p-0">
          <JmTableToolbar>
            <JmTableToolbarSearch>
              <JmSearchInput
                size="sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClear={() => setSearch("")}
                placeholder="ID·사용자"
              />
            </JmTableToolbarSearch>
            <JmTableToolbarFilters>
              <JmSelect
                variant="pill"
                size="sm"
                options={ENTITY_OPTIONS}
                value={entityFilter}
                onChange={(v) => setEntityFilter(v ?? "all")}
              />
              <JmSelect
                variant="pill"
                size="sm"
                options={ACTION_OPTIONS}
                value={actionFilter}
                onChange={(v) => setActionFilter(v ?? "all")}
              />
            </JmTableToolbarFilters>
            <JmTableToolbarActions>
              <JmIconButton
                variant="ghost"
                size="sm"
                aria-label="새로고침"
                onClick={() => logsQuery.refetch()}
                disabled={logsQuery.isFetching}
              >
                {logsQuery.isFetching ? (
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
              <JmTableHead className="w-[160px]">시각</JmTableHead>
              <JmTableHead className="w-[140px]">사용자</JmTableHead>
              <JmTableHead className="w-[110px]">엔티티</JmTableHead>
              <JmTableHead className="w-[100px]">액션</JmTableHead>
              <JmTableHead className="w-[200px]">대상 ID</JmTableHead>
              <JmTableHead>상세</JmTableHead>
            </JmTableRow>
          </JmTableHeader>
          <JmTableBody>
            {logsQuery.isPending ? (
              Array.from({ length: 10 }).map((_, i) => (
                <JmTableRow key={i}>
                  <JmTableCell><JmSkeleton className="h-4 w-32" /></JmTableCell>
                  <JmTableCell><JmSkeleton className="h-4 w-20" /></JmTableCell>
                  <JmTableCell><JmSkeleton className="h-5 w-14 rounded-md" /></JmTableCell>
                  <JmTableCell><JmSkeleton className="h-5 w-12 rounded-md" /></JmTableCell>
                  <JmTableCell><JmSkeleton className="h-4 w-32" /></JmTableCell>
                  <JmTableCell><JmSkeleton className="h-4 w-40" /></JmTableCell>
                </JmTableRow>
              ))
            ) : filtered.length === 0 ? (
              <JmTableRow className="hover:bg-transparent">
                <JmTableCell colSpan={6} className="py-12">
                  <JmEmpty
                    icon={<ScrollText className="size-8" />}
                    title="활동 로그가 없습니다"
                    description={
                      search.trim()
                        ? "검색어와 일치하는 로그가 없습니다"
                        : "주요 변경이 발생하면 활동 로그가 기록됩니다"
                    }
                  />
                </JmTableCell>
              </JmTableRow>
            ) : (
              filtered.map((log) => (
                <JmTableRow
                  key={log.id}
                  className="cursor-pointer"
                  onClick={() => setDetailRow(log)}
                >
                  <JmTableCell className="text-jm-xs tabular-nums">
                    {new Date(log.createdAt).toLocaleString("ko-KR")}
                  </JmTableCell>
                  <JmTableCell className="text-jm-sm">
                    {log.user ? log.user.name : <span className="text-[var(--jm-text-muted)]">(시스템)</span>}
                  </JmTableCell>
                  <JmTableCell className="text-jm-sm">
                    {ENTITY_LABELS[log.entity] ?? log.entity}
                  </JmTableCell>
                  <JmTableCell>
                    <JmBadge variant={ACTION_BADGE[log.action] ?? "default"} size="sm" shape="square">
                      {ACTION_LABELS[log.action] ?? log.action}
                    </JmBadge>
                  </JmTableCell>
                  <JmTableCell className="font-mono text-jm-2xs text-[var(--jm-text-muted)] truncate">
                    {log.entityId ?? "-"}
                  </JmTableCell>
                  <JmTableCell className="text-jm-xs text-[var(--jm-text-muted)] truncate max-w-[300px]">
                    {summarizeMeta(log)}
                  </JmTableCell>
                </JmTableRow>
              ))
            )}
          </JmTableBody>
          </JmTable>
        </JmCard>
      </div>

      <JmDialog open={detailRow !== null} onOpenChange={(v) => !v && setDetailRow(null)}>
        <JmDialogContent size="xl" className="max-w-[700px]">
          <JmDialogHeader>
            <JmDialogTitle>활동 로그 상세</JmDialogTitle>
          </JmDialogHeader>
          {detailRow && (
            <JmDialogBody className="space-y-3 text-jm-sm">
              <Row label="시각" value={new Date(detailRow.createdAt).toLocaleString("ko-KR")} />
              <Row label="사용자" value={detailRow.user ? `${detailRow.user.name} (${detailRow.user.email})` : "(시스템)"} />
              <Row label="엔티티" value={`${ENTITY_LABELS[detailRow.entity] ?? detailRow.entity} (${detailRow.entity})`} />
              <Row label="액션" value={ACTION_LABELS[detailRow.action] ?? detailRow.action} />
              <Row label="대상 ID" value={detailRow.entityId ?? "-"} />
              {detailRow.meta != null && (
                <JsonBlock label="메타" value={detailRow.meta} />
              )}
              {detailRow.before != null && (
                <JsonBlock label="변경 전" value={detailRow.before} />
              )}
              {detailRow.after != null && (
                <JsonBlock label="변경 후" value={detailRow.after} />
              )}
            </JmDialogBody>
          )}
        </JmDialogContent>
      </JmDialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-3 items-baseline">
      <span className="text-jm-xs text-[var(--jm-text-muted)]">{label}</span>
      <span className="text-jm-sm">{value}</span>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <div className="text-jm-xs text-[var(--jm-text-muted)] mb-1">{label}</div>
      <JmCard className="p-3">
        <pre className="text-jm-2xs font-mono whitespace-pre-wrap break-all">
          {JSON.stringify(value, null, 2)}
        </pre>
      </JmCard>
    </div>
  );
}

function summarizeMeta(log: AuditLog): string {
  const m = log.meta as Record<string, unknown> | null;
  if (!m) return "";
  if (typeof m.from === "string" && typeof m.to === "string") {
    return `${m.from} → ${m.to}`;
  }
  const keys = Object.keys(m).slice(0, 3);
  return keys.map((k) => `${k}=${String(m[k])}`).join(" · ");
}
