"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";

import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import {
  useSessions,
  type CartSession,
} from "@/components/pos/sessions-context";
import type { RepairTicketRow } from "@/app/(pos)/pos/repair-v2/_types";
import { STATUS_META } from "@/app/(pos)/pos/repair-v2/_types";
import { BottomSheet } from "./_components/bottom-sheet";
// 수리 작업 화면은 v2 톤으로 만들어진 RepairV2Detail 재사용 (shadcn 0개).
import { RepairV2Detail } from "@/app/(pos)/pos/repair-v2/[id]/page";

interface Props {
  session: CartSession;
  /** 진행중 수리 건수가 변경되면 부모 세션에 반영 (탭 배지용) */
  onCountChange?: (count: number) => void;
}

/**
 * 수리 모드 v2 — 손님 작업 페이지의 "수리" 탭.
 *
 * 두 모드:
 *  1) 리스트 — 그 손님의 진행중 수리 카드 + "새 수리" 버튼
 *  2) 작업 — 카드 클릭 시 풀스크린 RepairWorkView 임베드
 *
 * 미등록 고객은 sessions 의 repairTicketIds 로 추적 (sessions-context 기존 로직 활용).
 */
export function RepairMode({ session, onCountChange }: Props) {
  const { addSessionRepairTicket, setSessionOpenRepairCount } = useSessions();
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const customerId = session.customerId;
  const trackedIds = session.repairTicketIds ?? [];

  const ticketsQuery = useQuery<RepairTicketRow[]>({
    queryKey: customerId
      ? ["pos-v2", "repairs", "by-customer", customerId]
      : ["pos-v2", "repairs", "by-session", session.id, trackedIds.join(",")],
    queryFn: () => {
      if (customerId) {
        return apiGet<RepairTicketRow[]>(
          `/api/repair-tickets?customerId=${customerId}`,
        );
      }
      if (trackedIds.length === 0) return Promise.resolve([] as RepairTicketRow[]);
      return apiGet<RepairTicketRow[]>(
        `/api/repair-tickets?ids=${trackedIds.join(",")}`,
      );
    },
    enabled: !!customerId || trackedIds.length > 0,
  });

  const openTickets = useMemo(
    () =>
      (ticketsQuery.data ?? []).filter(
        (t) => t.status !== "PICKED_UP" && t.status !== "CANCELLED",
      ),
    [ticketsQuery.data],
  );

  // 진행중 카운트 → 세션에 동기화 (탭 배지)
  useEffect(() => {
    if (!ticketsQuery.data) return;
    setSessionOpenRepairCount(openTickets.length, session.id);
    onCountChange?.(openTickets.length);
  }, [openTickets.length, ticketsQuery.data, session.id, setSessionOpenRepairCount, onCountChange]);

  const closedTickets = useMemo(
    () =>
      (ticketsQuery.data ?? []).filter(
        (t) => t.status === "PICKED_UP" || t.status === "CANCELLED",
      ),
    [ticketsQuery.data],
  );

  // 작업 화면일 때 — v2 톤 RepairV2Detail 풀스크린 임베드. ← 버튼은 onBack 으로 처리.
  if (activeTicketId) {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        <RepairV2Detail
          ticketId={activeTicketId}
          onBack={() => setActiveTicketId(null)}
        />
      </div>
    );
  }

  // useQuery 의 enabled=false 면 status 가 영원히 'pending' 으로 남는다 →
  // 미등록 + tracked 0 케이스에서 스켈레톤이 무한 노출되는 버그 회피.
  const queryEnabled = !!customerId || trackedIds.length > 0;
  const isLoading = queryEnabled && ticketsQuery.isPending;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {/* 본문 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6">
          {isLoading ? (
            <ListSkeleton />
          ) : openTickets.length === 0 && closedTickets.length === 0 ? (
            <EmptyState onNew={() => setNewOpen(true)} />
          ) : (
            <div className="flex flex-col gap-4">
              {openTickets.length > 0 && (
                <Section title={`진행중 ${openTickets.length}`}>
                  {openTickets.map((t) => (
                    <RepairCard
                      key={t.id}
                      ticket={t}
                      onClick={() => setActiveTicketId(t.id)}
                    />
                  ))}
                </Section>
              )}
              {closedTickets.length > 0 && (
                <Section
                  title={`이력 ${closedTickets.length}`}
                  muted
                >
                  {closedTickets.slice(0, 3).map((t) => (
                    <RepairCard
                      key={t.id}
                      ticket={t}
                      onClick={() => setActiveTicketId(t.id)}
                      muted
                    />
                  ))}
                  {closedTickets.length > 3 && (
                    <div className="px-1 py-1 text-[11px] text-zinc-400">
                      외 {closedTickets.length - 3}건
                    </div>
                  )}
                </Section>
              )}
            </div>
          )}
          <div className="h-24" />
        </div>
      </div>

      {/* 하단 — 새 수리 버튼 */}
      <div className="shrink-0 border-t border-zinc-200 bg-white px-4 pb-3 pt-3 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-zinc-900 text-[15px] font-semibold text-white transition-transform active:scale-[0.99]"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path
                d="M10 4v12M4 10h12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            새 수리 시작
          </button>
        </div>
      </div>

      <NewRepairSheet
        open={newOpen}
        onOpenChange={setNewOpen}
        session={session}
        onCreated={(ticketId) => {
          if (!customerId) addSessionRepairTicket(ticketId, session.id);
          setNewOpen(false);
          setActiveTicketId(ticketId);
        }}
      />
    </div>
  );
}

// ──── 카드 ────
function RepairCard({
  ticket,
  onClick,
  muted,
}: {
  ticket: RepairTicketRow;
  onClick: () => void;
  muted?: boolean;
}) {
  const meta = STATUS_META[ticket.status];
  const device =
    ticket.serialItem?.displayName ?? ticket.customerMachine?.name ?? null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full flex-col gap-2 rounded-2xl border p-3.5 text-left transition-all active:scale-[0.99] sm:p-4 ${
        muted
          ? "border-zinc-100 bg-zinc-50 opacity-80"
          : "border-zinc-200 bg-white sm:hover:border-zinc-300 sm:hover:shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className={`size-2 rounded-full ${meta.dot}`} />
          <span className="text-[12px] font-semibold text-zinc-700">
            {meta.label}
          </span>
          {ticket.type === "ON_SITE" && (
            <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              즉시
            </span>
          )}
        </div>
        <span className="text-[11px] text-zinc-400">
          {formatDistanceToNow(new Date(ticket.receivedAt), {
            addSuffix: true,
            locale: ko,
          })}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          {device && (
            <span className="line-clamp-1 text-[14px] font-semibold text-zinc-900">
              {device}
            </span>
          )}
          {ticket.symptom && (
            <span className="line-clamp-1 text-[12px] text-zinc-500">
              {ticket.symptom}
            </span>
          )}
        </div>
        <span className="shrink-0 font-mono text-[11px] text-zinc-400">
          {ticket.ticketNo}
        </span>
      </div>
    </button>
  );
}

function Section({
  title,
  muted,
  children,
}: {
  title: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <span
        className={`text-[11px] font-semibold uppercase tracking-wider ${
          muted ? "text-zinc-400" : "text-zinc-500"
        }`}
      >
        {title}
      </span>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-24 animate-pulse rounded-2xl bg-white ring-1 ring-zinc-200"
        />
      ))}
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-zinc-100">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path
            d="M14.7 6.3a4 4 0 1 1-5.4 5.4l-5.6 5.6a1.4 1.4 0 0 0 2 2l5.6-5.6a4 4 0 0 1 5.4-5.4z"
            stroke="#71717a"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-[15px] font-semibold text-zinc-900">진행중인 수리가 없습니다</h2>
        <p className="text-[12px] text-zinc-500">맡김 또는 즉시 수리를 시작하세요</p>
      </div>
      <button
        type="button"
        onClick={onNew}
        className="h-11 rounded-full bg-zinc-900 px-5 text-[14px] font-semibold text-white"
      >
        새 수리 시작
      </button>
    </div>
  );
}

// ──── 새 수리 시트 ────
function NewRepairSheet({
  open,
  onOpenChange,
  session,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  session: CartSession;
  onCreated: (ticketId: string) => void;
}) {
  if (!open) return null;
  return (
    <NewRepairBody
      onOpenChange={onOpenChange}
      session={session}
      onCreated={onCreated}
    />
  );
}

function NewRepairBody({
  onOpenChange,
  session,
  onCreated,
}: {
  onOpenChange: (v: boolean) => void;
  session: CartSession;
  onCreated: (ticketId: string) => void;
}) {
  const qc = useQueryClient();
  const [type, setType] = useState<"ON_SITE" | "DROP_OFF">("DROP_OFF");
  const [device, setDevice] = useState("");
  const [symptom, setSymptom] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const ticket = await apiMutate<{ id: string; ticketNo: string }>(
        "/api/repair-tickets",
        "POST",
        {
          type,
          customerId: session.customerId ?? null,
          repairProductText: device.trim() || null,
          symptom: symptom.trim() || null,
        },
      );
      if (type === "ON_SITE") {
        await apiMutate(
          `/api/repair-tickets/${ticket.id}/transition`,
          "POST",
          { action: "start" },
        );
      }
      return ticket;
    },
    onSuccess: (ticket) => {
      toast.success(`수리 접수 — ${ticket.ticketNo}`);
      qc.invalidateQueries({ queryKey: ["pos-v2", "repairs"] });
      onCreated(ticket.id);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "생성 실패"),
  });

  return (
    <BottomSheet
      open
      onOpenChange={onOpenChange}
      title="새 수리"
      footer={
        <button
          type="button"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-zinc-900 text-[16px] font-semibold text-white disabled:opacity-60"
        >
          {createMutation.isPending && (
            <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
                opacity="0.25"
              />
              <path
                d="M12 2a10 10 0 0 1 10 10"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          )}
          {type === "ON_SITE" ? "즉시 수리 시작" : "맡김 접수"}
        </button>
      }
    >
      <div className="flex flex-col gap-5 pt-2">
        {/* 유형 */}
        <FieldGroup label="유형">
          <div className="grid grid-cols-2 gap-2">
            <TypeButton
              active={type === "DROP_OFF"}
              onClick={() => setType("DROP_OFF")}
              title="맡김"
              desc="며칠 보관 후 픽업"
            />
            <TypeButton
              active={type === "ON_SITE"}
              onClick={() => setType("ON_SITE")}
              title="즉시"
              desc="현장에서 바로 수리"
            />
          </div>
        </FieldGroup>

        {/* 기기 */}
        <FieldGroup label="기기" optional>
          <input
            type="text"
            value={device}
            onChange={(e) => setDevice(e.target.value)}
            placeholder="예: Sony A7M4 (Black)"
            className="h-12 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-[15px] outline-none focus:border-zinc-400 focus:bg-white"
          />
        </FieldGroup>

        {/* 증상 */}
        <FieldGroup label="증상" optional>
          <textarea
            value={symptom}
            onChange={(e) => setSymptom(e.target.value)}
            placeholder="고객이 호소하는 증상"
            rows={3}
            className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-[15px] outline-none focus:border-zinc-400 focus:bg-white"
          />
        </FieldGroup>
      </div>
    </BottomSheet>
  );
}

function FieldGroup({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
          {label}
        </span>
        {optional && <span className="text-[10px] text-zinc-400">선택</span>}
      </div>
      {children}
    </div>
  );
}

function TypeButton({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col gap-0.5 rounded-2xl border-2 p-4 text-left transition-colors ${
        active
          ? "border-zinc-900 bg-zinc-50"
          : "border-zinc-200 bg-white hover:border-zinc-300"
      }`}
    >
      <span
        className={`text-[16px] font-semibold ${
          active ? "text-zinc-900" : "text-zinc-700"
        }`}
      >
        {title}
      </span>
      <span className="text-[12px] text-zinc-500">{desc}</span>
    </button>
  );
}

