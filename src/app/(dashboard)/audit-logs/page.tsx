"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";

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

const ACTION_BADGE: Record<string, string> = {
  CREATE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  UPDATE: "bg-blue-50 text-blue-700 border-blue-200",
  DELETE: "bg-rose-50 text-rose-700 border-rose-200",
  CONFIRM: "bg-indigo-50 text-indigo-700 border-indigo-200",
  CANCEL: "bg-zinc-100 text-zinc-700 border-zinc-300",
  STATUS_CHANGE: "bg-amber-50 text-amber-800 border-amber-200",
};

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
    <div className="flex h-full flex-col">
      <DataTableToolbar
        search={{
          value: search,
          onChange: setSearch,
          onSearch: () => {},
          placeholder: "ID·사용자",
        }}
        onRefresh={() => logsQuery.refetch()}
        loading={logsQuery.isFetching}
        filters={
          <>
            <Select value={entityFilter} onValueChange={(v) => setEntityFilter(v ?? "all")}>
              <SelectTrigger className="h-[30px] w-[120px] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 엔티티</SelectItem>
                {Object.entries(ENTITY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={(v) => setActionFilter(v ?? "all")}>
              <SelectTrigger className="h-[30px] w-[110px] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 액션</SelectItem>
                {Object.entries(ACTION_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <Table className="min-w-[1000px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">시각</TableHead>
              <TableHead className="w-[140px]">사용자</TableHead>
              <TableHead className="w-[110px]">엔티티</TableHead>
              <TableHead className="w-[100px]">액션</TableHead>
              <TableHead className="w-[200px]">대상 ID</TableHead>
              <TableHead>상세</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logsQuery.isPending ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-14 rounded-md" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-12 rounded-md" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  로그가 없습니다
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((log) => (
                <TableRow
                  key={log.id}
                  className="cursor-pointer"
                  onClick={() => setDetailRow(log)}
                >
                  <TableCell className="text-[12px] tabular-nums">
                    {new Date(log.createdAt).toLocaleString("ko-KR")}
                  </TableCell>
                  <TableCell className="text-[13px]">
                    {log.user ? log.user.name : <span className="text-muted-foreground">(시스템)</span>}
                  </TableCell>
                  <TableCell className="text-[13px]">
                    {ENTITY_LABELS[log.entity] ?? log.entity}
                  </TableCell>
                  <TableCell>
                    <span className={cn(
                      "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium",
                      ACTION_BADGE[log.action] ?? "bg-muted text-muted-foreground border-border"
                    )}>
                      {ACTION_LABELS[log.action] ?? log.action}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-muted-foreground truncate">
                    {log.entityId ?? "-"}
                  </TableCell>
                  <TableCell className="text-[12px] text-muted-foreground truncate max-w-[300px]">
                    {summarizeMeta(log)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={detailRow !== null} onOpenChange={(v) => !v && setDetailRow(null)}>
        <DialogContent className="max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>활동 로그 상세</DialogTitle>
          </DialogHeader>
          {detailRow && (
            <div className="space-y-3 text-[13px]">
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-3 items-baseline">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="text-[13px]">{value}</span>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <div className="text-[12px] text-muted-foreground mb-1">{label}</div>
      <Card className="p-3">
        <pre className="text-[11px] font-mono whitespace-pre-wrap break-all">
          {JSON.stringify(value, null, 2)}
        </pre>
      </Card>
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
