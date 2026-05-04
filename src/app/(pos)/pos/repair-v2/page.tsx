"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";

import { apiGet } from "@/lib/api-client";
import {
  STATUS_META,
  STATUS_FILTERS,
  type RepairTicketRow,
  type StatusFilter,
} from "./_types";
import { NewRepairSheet } from "./_new-repair-sheet";

/**
 * 수리 v2 메인 보드.
 * - shadcn 0개 — 모든 UI 직접 작성 (Tailwind + raw HTML)
 * - 모바일 우선: 큰 터치 타깃, 1컬럼 카드, FAB
 * - 태블릿/데스크탑: 2컬럼 그리드 (md+)
 */
export default function RepairV2BoardPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("OPEN");
  const [newOpen, setNewOpen] = useState(false);

  const ticketsQuery = useQuery({
    queryKey: ["repair-v2", "list", { search, filter }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filter !== "OPEN" && filter !== "ALL") params.set("status", filter);
      return apiGet<RepairTicketRow[]>(`/api/repair-tickets?${params}`);
    },
  });

  const tickets = useMemo(() => {
    const all = ticketsQuery.data ?? [];
    if (filter === "OPEN") {
      return all.filter(
        (t) => t.status !== "PICKED_UP" && t.status !== "CANCELLED",
      );
    }
    return all;
  }, [ticketsQuery.data, filter]);

  // 상태별 카운트 (필터 칩 옆에 표시)
  const counts = useMemo(() => {
    const all = ticketsQuery.data ?? [];
    const open = all.filter(
      (t) => t.status !== "PICKED_UP" && t.status !== "CANCELLED",
    ).length;
    const byStatus: Record<string, number> = { OPEN: open, ALL: all.length };
    for (const t of all) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    return byStatus;
  }, [ticketsQuery.data]);

  return (
    <div className="flex h-full flex-col bg-zinc-50">
      {/* 상단 — 타이틀 + 검색 */}
      <header className="shrink-0 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          <div className="flex items-center justify-between">
            <h1 className="text-[22px] font-bold tracking-tight text-zinc-900">
              수리
            </h1>
            <div className="text-[12px] text-zinc-500">
              {ticketsQuery.isFetching ? "동기화 중…" : `${tickets.length}건`}
            </div>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="수리번호 · 고객 · 전화 · 증상"
            className="h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-[15px] outline-none placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white"
          />
          {/* 필터 칩 — 가로 스크롤 */}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6">
            {STATUS_FILTERS.map((f) => {
              const active = filter === f.value;
              const c = counts[f.value] ?? 0;
              return (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={`flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-[13px] font-medium transition-colors ${
                    active
                      ? "bg-zinc-900 text-white"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  {f.label}
                  {c > 0 && (
                    <span
                      className={`text-[11px] tabular-nums ${
                        active ? "text-white/70" : "text-zinc-500"
                      }`}
                    >
                      {c}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* 본문 — 카드 리스트 */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6">
          {ticketsQuery.isPending ? (
            <SkeletonGrid />
          ) : tickets.length === 0 ? (
            <EmptyState
              filterLabel={
                STATUS_FILTERS.find((f) => f.value === filter)?.label ?? "전체"
              }
              onNew={() => setNewOpen(true)}
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {tickets.map((t) => (
                <TicketCard
                  key={t.id}
                  ticket={t}
                  onClick={() => router.push(`/pos/repair-v2/${t.id}`)}
                />
              ))}
            </div>
          )}
        </div>
        {/* FAB 보호 — 본문 끝에 여백 */}
        <div className="h-24" />
      </main>

      {/* 우하단 FAB */}
      <button
        type="button"
        onClick={() => setNewOpen(true)}
        className="fixed bottom-6 right-6 z-30 flex h-14 items-center gap-2 rounded-full bg-zinc-900 px-5 text-white shadow-lg shadow-zinc-900/25 transition-transform active:scale-95 sm:bottom-8 sm:right-8"
        aria-label="새 수리 시작"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M10 4v12M4 10h12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span className="text-[15px] font-semibold">새 수리</span>
      </button>

      {/* 새 수리 시트 */}
      <NewRepairSheet
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(ticketId) => {
          setNewOpen(false);
          router.push(`/pos/repair-v2/${ticketId}`);
        }}
      />
    </div>
  );
}

function TicketCard({
  ticket,
  onClick,
}: {
  ticket: RepairTicketRow;
  onClick: () => void;
}) {
  const meta = STATUS_META[ticket.status];
  const device =
    ticket.serialItem?.displayName ??
    ticket.customerMachine?.name ??
    null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-left transition-all active:scale-[0.99] sm:hover:border-zinc-300 sm:hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${meta.dot}`} />
            <span className={`text-[11px] font-semibold ${meta.tint.split(" ")[1] ?? ""}`}>
              {meta.label}
            </span>
            {ticket.type === "ON_SITE" && (
              <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                즉시
              </span>
            )}
          </div>
          <span className="font-mono text-[12px] text-zinc-400">
            {ticket.ticketNo}
          </span>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] text-zinc-400">
            {formatDistanceToNow(new Date(ticket.receivedAt), {
              addSuffix: true,
              locale: ko,
            })}
          </div>
          <div className="text-[10px] text-zinc-300">
            {format(new Date(ticket.receivedAt), "MM/dd HH:mm")}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="text-[15px] font-semibold text-zinc-900">
          {ticket.customer?.name ?? "(미등록 고객)"}
        </div>
        {ticket.customer?.phone && (
          <div className="font-mono text-[12px] text-zinc-500">
            {ticket.customer.phone}
          </div>
        )}
      </div>

      {(device || ticket.symptom) && (
        <div className="flex flex-col gap-0.5 border-t border-zinc-100 pt-3">
          {device && (
            <div className="line-clamp-1 text-[13px] font-medium text-zinc-700">
              {device}
            </div>
          )}
          {ticket.symptom && (
            <div className="line-clamp-2 text-[13px] text-zinc-500">
              {ticket.symptom}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-zinc-100 pt-2">
        <div className="flex gap-3 text-[11px] text-zinc-400">
          {ticket._count.parts > 0 && <span>부속 {ticket._count.parts}</span>}
          {ticket._count.labors > 0 && <span>공임 {ticket._count.labors}</span>}
          {ticket._count.parts === 0 && ticket._count.labors === 0 && (
            <span className="text-zinc-300">—</span>
          )}
        </div>
        {ticket.assignedTo?.name && (
          <span className="text-[11px] text-zinc-500">
            담당 {ticket.assignedTo.name}
          </span>
        )}
      </div>
    </button>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4"
        >
          <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-100" />
          <div className="h-5 w-2/3 animate-pulse rounded bg-zinc-100" />
          <div className="h-4 w-full animate-pulse rounded bg-zinc-100" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  filterLabel,
  onNew,
}: {
  filterLabel: string;
  onNew: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-zinc-100">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M14.7 6.3a4 4 0 1 1-5.4 5.4l-5.6 5.6a1.4 1.4 0 0 0 2 2l5.6-5.6a4 4 0 0 1 5.4-5.4z"
            stroke="#71717a"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="flex flex-col gap-1">
        <div className="text-[15px] font-semibold text-zinc-900">
          {filterLabel} 수리가 없습니다
        </div>
        <div className="text-[13px] text-zinc-500">
          우하단 + 버튼으로 새 수리를 시작하세요
        </div>
      </div>
      <button
        type="button"
        onClick={onNew}
        className="mt-2 h-10 rounded-full bg-zinc-900 px-5 text-[13px] font-semibold text-white"
      >
        새 수리 시작
      </button>
    </div>
  );
}
