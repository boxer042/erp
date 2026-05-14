"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { JmCard } from "@/jm";
import { STATUS_META, type RepairTicketDetail, type RepairTicketRow } from "../_types";
import { Card } from "./_shared";

// ──── 시리얼 기준 수리 이력 ────
// 같은 SerialItem 의 모든 과거 수리 티켓을 시간순으로 표시 — 수리 작업 시 참고용.
export function SerialHistoryCard({
  serialItemId,
  serialCode,
  currentTicketId,
  onClickTicket,
}: {
  serialItemId: string;
  serialCode: string;
  currentTicketId: string;
  onClickTicket: (id: string) => void;
}) {
  const historyQuery = useQuery<RepairTicketRow[]>({
    queryKey: ["repairs", "serial-history", serialItemId, currentTicketId],
    queryFn: () =>
      apiGet<RepairTicketRow[]>(
        `/api/repair-tickets?serialItemId=${serialItemId}&excludeId=${currentTicketId}`,
      ),
    staleTime: 1000 * 60,
  });

  const history = historyQuery.data ?? [];
  if (historyQuery.isPending) {
    return (
      <div className="rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-4">
        <div className="mb-2 h-4 w-32 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
        <div className="h-12 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
      </div>
    );
  }
  if (history.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-4">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
            이 기기 수리 이력
          </span>
          <span className="font-mono text-[10px] text-[var(--jm-text-subtle)]">{serialCode}</span>
        </div>
        <span className="text-[12px] text-[var(--jm-text-subtle)]">이전 수리 이력 없음</span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-4">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
          이 기기 수리 이력 ({history.length})
        </span>
        <span className="font-mono text-[10px] text-[var(--jm-text-subtle)]">{serialCode}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {history.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => onClickTicket(h.id)}
            className="flex items-start justify-between gap-3 rounded-xl bg-[var(--jm-bg)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--jm-surface-muted)] active:bg-[var(--jm-border)]"
          >
            <div className="flex min-w-0 flex-col">
              <div className="flex items-center gap-1.5">
                <span className={`size-1.5 rounded-full ${STATUS_META[h.status].dot}`} />
                <span className="text-[11px] font-semibold text-[var(--jm-text)]">
                  {STATUS_META[h.status].label}
                </span>
                <span className="font-mono text-[11px] text-[var(--jm-text-subtle)]">
                  {h.ticketNo}
                </span>
              </div>
              {h.symptom && (
                <span className="line-clamp-1 mt-0.5 text-[12px] text-[var(--jm-text-muted)]">
                  {h.symptom}
                </span>
              )}
            </div>
            <div className="shrink-0 text-right text-[10px] text-[var(--jm-text-subtle)]">
              {format(new Date(h.receivedAt), "yyyy-MM-dd")}
              {h.pickedUpAt && (
                <div className="text-[var(--jm-text-disabled)]">
                  완료 {format(new Date(h.pickedUpAt), "MM-dd")}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ──── 재수리 (parent / revisits) ────
export function RevisitCard({
  parent,
  revisits,
  onClickTicket,
}: {
  parent: RepairTicketDetail["parentRepairTicket"];
  revisits: RepairTicketDetail["revisits"];
  onClickTicket: (id: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--jm-warning-bg)] bg-[var(--jm-warning-bg)] p-4">
      <div className="flex flex-col gap-2">
        {parent && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--jm-warning-fg)]">
              재수리 — 원본 티켓
            </span>
            <button
              type="button"
              onClick={() => onClickTicket(parent.id)}
              className="flex items-center justify-between rounded-xl bg-[var(--jm-surface)] px-3 py-2 text-left transition-colors hover:bg-[var(--jm-warning-bg)]/50"
            >
              <div className="flex items-center gap-2">
                <span className={`size-1.5 rounded-full ${STATUS_META[parent.status].dot}`} />
                <span className="font-mono text-[12px] font-semibold text-[var(--jm-text)]">
                  {parent.ticketNo}
                </span>
                <span className="text-[11px] text-[var(--jm-text-muted)]">
                  {STATUS_META[parent.status].label}
                </span>
              </div>
              {parent.repairWarrantyEnds && (
                <span className="text-[11px] text-[var(--jm-text-muted)]">
                  보증 ~{format(new Date(parent.repairWarrantyEnds), "yyyy-MM-dd")}
                </span>
              )}
            </button>
          </div>
        )}
        {revisits.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--jm-warning-fg)]">
              연관 재수리 {revisits.length}
            </span>
            <div className="flex flex-col gap-1">
              {revisits.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onClickTicket(r.id)}
                  className="flex items-center justify-between rounded-xl bg-[var(--jm-surface)] px-3 py-2 text-left transition-colors hover:bg-[var(--jm-warning-bg)]/50"
                >
                  <div className="flex items-center gap-2">
                    <span className={`size-1.5 rounded-full ${STATUS_META[r.status].dot}`} />
                    <span className="font-mono text-[12px] font-semibold text-[var(--jm-text)]">
                      {r.ticketNo}
                    </span>
                    <span className="text-[11px] text-[var(--jm-text-muted)]">
                      {STATUS_META[r.status].label}
                    </span>
                  </div>
                  <span className="text-[11px] text-[var(--jm-text-muted)]">
                    {format(new Date(r.receivedAt), "MM-dd HH:mm")}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ──── 수리 패키지 빠른 추가 ────
interface RepairPackageRow {
  id: string;
  name: string;
  description: string | null;
  parts: Array<{ id: string; quantity: string; unitPrice: string }>;
  labors: Array<{ id: string; name: string; unitRate: string }>;
}

export function PackagesCard({
  ticketId,
  onApplied,
}: {
  ticketId: string;
  onApplied: () => void;
}) {
  const packagesQuery = useQuery<RepairPackageRow[]>({
    queryKey: ["repairs", "packages"],
    queryFn: () => apiGet<RepairPackageRow[]>("/api/repair-packages"),
    staleTime: 1000 * 60 * 5,
  });
  const apply = useMutation({
    mutationFn: (packageId: string) =>
      apiMutate(`/api/repair-tickets/${ticketId}/apply-package`, "POST", {
        packageId,
      }),
    onSuccess: (_, packageId) => {
      const pkg = packagesQuery.data?.find((p) => p.id === packageId);
      toast.success(`${pkg?.name ?? "패키지"} 적용`);
      onApplied();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "패키지 적용 실패"),
  });

  const packages = packagesQuery.data ?? [];
  if (packagesQuery.isPending) {
    return (
      <Card>
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
            패키지
          </span>
          <div className="flex gap-1.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-9 w-24 animate-pulse rounded-full bg-[var(--jm-surface-muted)]"
              />
            ))}
          </div>
        </div>
      </Card>
    );
  }
  if (packages.length === 0) return null;

  return (
    <Card>
      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
          패키지 빠른 추가
        </span>
        <div className="flex flex-wrap gap-1.5">
          {packages.map((p) => {
            const partsCount = p.parts.length;
            const laborsCount = p.labors.length;
            return (
              <button
                key={p.id}
                type="button"
                disabled={apply.isPending}
                onClick={() => apply.mutate(p.id)}
                className="flex h-10 items-center gap-1.5 rounded-full border border-[var(--jm-border)] bg-[var(--jm-surface)] px-4 text-[12px] transition-colors hover:border-[var(--jm-action)] hover:bg-[var(--jm-bg)] active:scale-[0.98] disabled:opacity-50"
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                  <path d="M7 3v8M3 7h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <span className="font-semibold text-[var(--jm-text)]">{p.name}</span>
                <span className="text-[var(--jm-text-muted)]">
                  ({partsCount > 0 && `부속 ${partsCount}`}
                  {partsCount > 0 && laborsCount > 0 && " · "}
                  {laborsCount > 0 && `공임 ${laborsCount}`})
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

// ──── 참조 정보 섹션 — 시리얼 이력 + 재수리. 보조 정보라 접힘 기본 ────
export function ReferenceInfoSection({
  ticket,
  onClickTicket,
}: {
  ticket: RepairTicketDetail;
  onClickTicket: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasRevisit = !!ticket.parentRepairTicket || ticket.revisits.length > 0;
  const hasSerial = !!ticket.serialItem;
  const count =
    (hasSerial ? 1 : 0) +
    (ticket.parentRepairTicket ? 1 : 0) +
    ticket.revisits.length;

  return (
    <JmCard className="overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--jm-surface-muted)] sm:px-5"
      >
        <div className="flex items-center gap-2">
          <span className="text-jm-base font-semibold text-[var(--jm-text)]">
            참조 정보
          </span>
          <span className="text-jm-2xs text-[var(--jm-text-subtle)]">
            {hasSerial && "시리얼 이력"}
            {hasSerial && hasRevisit && " · "}
            {hasRevisit && `재수리 ${ticket.revisits.length + (ticket.parentRepairTicket ? 1 : 0)}건`}
            {count > 0 && ""}
          </span>
        </div>
        <ChevronDown
          className={`size-4 text-[var(--jm-text-muted)] transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>
      {expanded && (
        <div className="flex flex-col gap-3 border-t border-[var(--jm-border)] px-4 py-3 sm:px-5">
          {hasSerial && (
            <SerialHistoryCard
              serialItemId={ticket.serialItem!.id}
              serialCode={ticket.serialItem!.code}
              currentTicketId={ticket.id}
              onClickTicket={onClickTicket}
            />
          )}
          {hasRevisit && (
            <RevisitCard
              parent={ticket.parentRepairTicket}
              revisits={ticket.revisits}
              onClickTicket={onClickTicket}
            />
          )}
        </div>
      )}
    </JmCard>
  );
}
