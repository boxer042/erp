"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow, subDays } from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronLeft, Menu } from "lucide-react";

import { apiGet } from "@/lib/api-client";
import { MenuSheet } from "../_components/menu-sheet";
import { GlobalSearchSheet } from "../_global-search-sheet";
import {
  STATUS_META,
  type RepairTicketRow,
} from "./_types";
import { NewRepairSheet } from "./_new-repair-sheet";
import { RepairActionSheet } from "./_action-sheet";

type RepairFilterKey =
  | "all"
  | "ready"
  | "quoted"
  | "working"
  | "diagnosing"
  | "received"
  | "recent";

interface FilterChip {
  key: RepairFilterKey;
  label: string;
  dot: "emerald" | "amber" | "blue" | "zinc" | "muted";
}

const FILTER_CHIPS: FilterChip[] = [
  { key: "all", label: "전체", dot: "muted" },
  { key: "ready", label: "픽업 대기", dot: "emerald" },
  { key: "quoted", label: "견적 송부", dot: "amber" },
  { key: "working", label: "수리중", dot: "blue" },
  { key: "diagnosing", label: "진단중", dot: "amber" },
  { key: "received", label: "진단 대기", dot: "zinc" },
  { key: "recent", label: "최근 완료", dot: "zinc" },
];

/**
 * 수리관리 페이지 — 메뉴 → 수리관리 진입.
 * 매장 전체 수리 현황 단일 화면.
 *
 * 섹션 (위에서 아래로 우선순위 순):
 *   1. 픽업 대기   (READY)                    — 손님 오면 인계·결제
 *   2. 견적 송부   (QUOTED)                   — 손님 답변 대기
 *   3. 수리중      (APPROVED + REPAIRING)     — 작업 진행
 *   4. 진단중      (DIAGNOSING)               — 직원 진단 중
 *   5. 진단 대기   (RECEIVED)                 — 새로 접수, 아직 안 봄
 *   6. 최근 완료   (PICKED_UP, 7일)           — 최근 픽업 이력
 *
 * CANCELLED 는 노출 안 함.
 *
 * 행 클릭 → RepairActionSheet (이 손님 카드 열기 / 수리 상세 / 결제)
 */
export default function RepairsBoardPage() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [selected, setSelected] = useState<RepairTicketRow | null>(null);
  // 상단 칩 필터 — "all" 이면 모든 섹션 노출. 특정 키 선택 시 그 섹션만 노출.
  const [filter, setFilter] = useState<RepairFilterKey>("all");

  const ticketsQuery = useQuery<RepairTicketRow[]>({
    queryKey: ["repairs", "board", "all"],
    queryFn: () =>
      apiGet<RepairTicketRow[]>(
        `/api/repair-tickets?` +
          // 한 번에 전체 받아 클라이언트 분류 — status 별 fetch 6번 대신 1번
          // (서버 take=200 으로 제한되어 있어 양 늘어나면 status 필터 분할 고려)
          new URLSearchParams({ }).toString(),
      ),
    staleTime: 1000 * 30,
  });

  const sections = useMemo(() => {
    const all = ticketsQuery.data ?? [];
    const sevenDaysAgo = subDays(new Date(), 7);
    return {
      ready: all.filter((t) => t.status === "READY"),
      quoted: all.filter((t) => t.status === "QUOTED"),
      working: all.filter(
        (t) => t.status === "APPROVED" || t.status === "REPAIRING",
      ),
      diagnosing: all.filter((t) => t.status === "DIAGNOSING"),
      received: all.filter((t) => t.status === "RECEIVED"),
      recent: all
        .filter(
          (t) =>
            t.status === "PICKED_UP" &&
            t.pickedUpAt &&
            new Date(t.pickedUpAt) >= sevenDaysAgo,
        )
        .slice(0, 20),
    };
  }, [ticketsQuery.data]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--jm-bg)]">
      <header className="shrink-0 border-b border-[var(--jm-border)] bg-[var(--jm-surface)]">
        <div className="flex items-center gap-3 px-3 py-2.5 sm:px-6">
          <button
            type="button"
            onClick={() => router.push("/pos")}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)] active:bg-[var(--jm-border)]"
            aria-label="뒤로"
          >
            <ChevronLeft className="size-5" />
          </button>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-[14px] font-semibold text-[var(--jm-text)]">
              수리관리
            </span>
            <span className="text-[11px] text-[var(--jm-text-muted)]">
              매장 수리 현황
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)] active:bg-[var(--jm-border)]"
            aria-label="메뉴"
          >
            <Menu className="size-5" />
          </button>
        </div>
      </header>

      {/* 상태 칩 — 가로 스크롤. 활성 칩 섹션만 본문에 노출. 헤더와 별도 라인으로 분리. */}
      <div className="shrink-0 border-b border-[var(--jm-border)] bg-[var(--jm-surface)]">
        <div className="flex gap-1.5 overflow-x-auto px-3 py-2 sm:px-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {FILTER_CHIPS.map((c) => {
            const count =
              c.key === "all"
                ? Object.values(sections).reduce((n, arr) => n + arr.length, 0)
                : sections[c.key].length;
            return (
              <FilterChipButton
                key={c.key}
                label={c.label}
                count={count}
                dot={c.dot}
                active={filter === c.key}
                onClick={() => setFilter(c.key)}
              />
            );
          })}
        </div>
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-5 px-4 py-4 sm:px-6">
          {(filter === "all" || filter === "ready") && (
            <Section
              label="픽업 대기"
              count={sections.ready.length}
              dot="emerald"
              loading={ticketsQuery.isPending}
              empty="픽업 대기중인 수리가 없습니다"
              tickets={sections.ready}
              onSelect={setSelected}
              hideHeader={filter === "ready"}
            />
          )}
          {(filter === "all" || filter === "quoted") && (
            <Section
              label="견적 송부"
              count={sections.quoted.length}
              dot="amber"
              loading={ticketsQuery.isPending}
              empty="견적 송부 대기가 없습니다"
              tickets={sections.quoted}
              onSelect={setSelected}
              hideHeader={filter === "quoted"}
            />
          )}
          {(filter === "all" || filter === "working") && (
            <Section
              label="수리중"
              count={sections.working.length}
              dot="blue"
              loading={ticketsQuery.isPending}
              empty="진행중인 수리가 없습니다"
              tickets={sections.working}
              onSelect={setSelected}
              hideHeader={filter === "working"}
            />
          )}
          {(filter === "all" || filter === "diagnosing") && (
            <Section
              label="진단중"
              count={sections.diagnosing.length}
              dot="amber"
              loading={ticketsQuery.isPending}
              empty="진단중인 수리가 없습니다"
              tickets={sections.diagnosing}
              onSelect={setSelected}
              hideHeader={filter === "diagnosing"}
            />
          )}
          {(filter === "all" || filter === "received") && (
            <Section
              label="진단 대기"
              count={sections.received.length}
              dot="zinc"
              loading={ticketsQuery.isPending}
              empty="진단 대기중인 수리가 없습니다"
              tickets={sections.received}
              onSelect={setSelected}
              hideHeader={filter === "received"}
            />
          )}
          {(filter === "recent" ||
            (filter === "all" && sections.recent.length > 0)) && (
            <Section
              label="최근 완료 (7일)"
              count={sections.recent.length}
              dot="zinc"
              hideHeader={filter === "recent"}
              loading={ticketsQuery.isPending}
              empty="최근 7일 완료된 수리가 없습니다"
              tickets={sections.recent}
              onSelect={setSelected}
              muted
            />
          )}
          <div className="h-24" />
        </div>
      </main>

      <button
        type="button"
        onClick={() => setNewOpen(true)}
        className="fixed bottom-6 right-6 z-30 flex h-14 items-center gap-2 rounded-full bg-[var(--jm-action)] px-5 text-white shadow-lg shadow-[var(--jm-shadow-lg)] transition-transform active:scale-95 sm:bottom-8 sm:right-8"
        aria-label="새 수리 시작"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M10 4v12M4 10h12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span className="text-[15px] font-semibold">새 수리</span>
      </button>

      <MenuSheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onSearch={() => setSearchOpen(true)}
        onRentalManagement={() => router.push("/pos/rentals")}
      />
      <GlobalSearchSheet open={searchOpen} onOpenChange={setSearchOpen} />

      <NewRepairSheet
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(ticketId) => {
          setNewOpen(false);
          router.push(`/pos/repairs/${ticketId}`);
        }}
      />

      <RepairActionSheet
        ticket={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

// ─── 상태 칩 ───────────────────────────────────────────────────────
function FilterChipButton({
  label,
  count,
  dot,
  active,
  onClick,
}: {
  label: string;
  count: number;
  dot: "emerald" | "amber" | "blue" | "zinc" | "muted";
  active: boolean;
  onClick: () => void;
}) {
  const dotColor =
    dot === "emerald"
      ? "bg-emerald-500"
      : dot === "amber"
        ? "bg-amber-500"
        : dot === "blue"
          ? "bg-blue-500"
          : dot === "zinc"
            ? "bg-zinc-400"
            : "bg-[var(--jm-text-muted)]";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-colors ${
        active
          ? "bg-[var(--jm-action)] text-white"
          : "bg-[var(--jm-surface)] text-[var(--jm-text-muted)] ring-1 ring-[var(--jm-border)] hover:bg-[var(--jm-bg)]"
      }`}
    >
      <span className={`size-1.5 rounded-full ${dotColor}`} />
      <span>{label}</span>
      {count > 0 && (
        <span
          className={`tabular-nums ${
            active ? "text-white/80" : "text-[var(--jm-text-subtle)]"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ─── 섹션 ──────────────────────────────────────────────────────────
function Section({
  label,
  count,
  dot,
  loading,
  empty,
  tickets,
  onSelect,
  muted = false,
  hideHeader = false,
}: {
  label: string;
  count: number;
  dot: "emerald" | "amber" | "blue" | "zinc";
  loading: boolean;
  empty: string;
  tickets: RepairTicketRow[];
  onSelect: (t: RepairTicketRow) => void;
  muted?: boolean;
  hideHeader?: boolean;
}) {
  const dotColor =
    dot === "emerald"
      ? "bg-emerald-500"
      : dot === "amber"
        ? "bg-amber-500"
        : dot === "blue"
          ? "bg-blue-500"
          : "bg-zinc-400";
  return (
    <section className="flex flex-col gap-2">
      {!hideHeader && (
        <div className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${dotColor}`} />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
            {label}
          </span>
          <span className="text-[11px] font-semibold tabular-nums text-[var(--jm-text)]">
            {count}
          </span>
        </div>
      )}
      {loading ? (
        <RowsSkeleton />
      ) : tickets.length === 0 ? (
        empty ? <EmptyHint text={empty} /> : null
      ) : (
        <div className="flex flex-col gap-2">
          {tickets.map((t) => (
            <TicketRow
              key={t.id}
              ticket={t}
              onClick={() => onSelect(t)}
              muted={muted}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function TicketRow({
  ticket,
  onClick,
  muted,
}: {
  ticket: RepairTicketRow;
  onClick: () => void;
  muted: boolean;
}) {
  const meta = STATUS_META[ticket.status];
  const device =
    ticket.serialItem?.displayName ??
    ticket.customerMachine?.name ??
    null;
  const customerName =
    ticket.customer?.name ??
    `미등록 손님 #${ticket.id.slice(0, 6)}`;
  const customerPhone = ticket.customer?.phone;
  const elapsed = formatDistanceToNow(new Date(ticket.receivedAt), {
    addSuffix: false,
    locale: ko,
  });

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left ring-1 transition-all active:scale-[0.99] sm:hover:shadow-sm ${
        muted
          ? "bg-[var(--jm-bg)] ring-[var(--jm-border)]"
          : "bg-[var(--jm-surface)] ring-[var(--jm-border)]"
      }`}
    >
      <div
        className={`flex size-10 shrink-0 items-center justify-center rounded-full text-[14px] font-bold ${
          muted
            ? "bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)]"
            : "bg-[var(--jm-surface-muted)] text-[var(--jm-text)]"
        }`}
      >
        {customerName.charAt(0)}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5">
          <span className="line-clamp-1 text-[14px] font-semibold text-[var(--jm-text)]">
            {customerName}
          </span>
          {ticket.type === "ON_SITE" && (
            <span className="rounded bg-[var(--jm-action)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              즉시
            </span>
          )}
        </div>
        <span className="line-clamp-1 text-[12px] text-[var(--jm-text-muted)]">
          {device ?? ticket.symptom ?? meta.label}
          {customerPhone && (
            <span className="ml-1.5 font-mono text-[var(--jm-text-subtle)]">
              {customerPhone}
            </span>
          )}
        </span>
        <span className="text-[11px] text-[var(--jm-text-muted)]">
          {ticket.status === "PICKED_UP" && ticket.pickedUpAt
            ? `${format(new Date(ticket.pickedUpAt), "M/d")} 픽업`
            : `접수 ${elapsed} 전`}
        </span>
      </div>
      <span className="font-mono text-[10px] text-[var(--jm-text-subtle)]">
        {ticket.ticketNo}
      </span>
    </button>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-2xl bg-[var(--jm-surface)] px-4 py-5 text-center text-[13px] text-[var(--jm-text-subtle)] ring-1 ring-[var(--jm-border)]">
      {text}
    </div>
  );
}

function RowsSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-2xl bg-[var(--jm-surface)] p-3 ring-1 ring-[var(--jm-border)]"
        >
          <div className="h-10 w-10 animate-pulse rounded-full bg-[var(--jm-surface-muted)]" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-3.5 w-1/2 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
          </div>
          <div className="h-3 w-16 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
        </div>
      ))}
    </div>
  );
}
