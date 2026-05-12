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
import type { RepairTicketRow } from "@/app/(pos)/pos/repairs/_types";
import { STATUS_META } from "@/app/(pos)/pos/repairs/_types";
import { BottomSheet } from "./_components/bottom-sheet";
import { useRepairSync } from "./_use-repair-sync";

interface CategoryRoot {
  id: string;
  name: string;
}

interface ProductSearchResult {
  id: string;
  name: string;
  sku: string;
  brand: string | null;
  imageUrl: string | null;
  categoryId: string | null;
}

const OTHER_CATEGORY_ID = "__other__";

interface Props {
  session: CartSession;
  /** 진행중 수리 건수가 변경되면 부모 세션에 반영 (탭 배지용) */
  onCountChange?: (count: number) => void;
  /** ticket 카드 클릭 — 부모(customer page) 가 detail state 진입을 결정 */
  onTicketDetail?: (ticketId: string) => void;
}

/**
 * 수리 모드 v2 — 고객 작업 페이지의 "수리" 탭.
 *
 * 리스트만 책임: 그 고객의 진행중 수리 카드 + "새 수리" 버튼.
 * 카드 클릭 → onTicketDetail(id) 콜백 → 부모가 detail 진입 처리 (헤더/탭바 동적 변경).
 *
 * 미등록 고객은 sessions 의 repairTicketIds 로 추적 (sessions-context 기존 로직 활용).
 */
export function RepairMode({ session, onCountChange, onTicketDetail }: Props) {
  const { addSessionRepairTicket } = useSessions();
  const [newOpen, setNewOpen] = useState(false);

  // 카운트 + ticketIds sync 는 useRepairSync 훅이 처리. 여기선 UI 데이터만.
  const { ticketsQuery, openTickets, closedTickets, isLoading } =
    useRepairSync(session);

  // RepairMode 마운트 동안 부모에게 카운트 변동 알림
  useEffect(() => {
    if (!ticketsQuery.data) return;
    onCountChange?.(openTickets.length);
  }, [openTickets.length, ticketsQuery.data, onCountChange]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {/* 본문 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 py-4 sm:px-6">
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
                      onClick={() => onTicketDetail?.(t.id)}
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
                      onClick={() => onTicketDetail?.(t.id)}
                      muted
                    />
                  ))}
                  {closedTickets.length > 3 && (
                    <div className="px-1 py-1 text-[11px] text-[var(--jm-text-subtle)]">
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
      <div className="shrink-0 border-t border-[var(--jm-border)] bg-[var(--jm-surface)] px-4 pb-3 pt-3 sm:px-6">
        <div>
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--jm-action)] text-[15px] font-semibold text-white transition-transform active:scale-[0.99]"
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
          if (!session.customerId) addSessionRepairTicket(ticketId, session.id);
          setNewOpen(false);
          onTicketDetail?.(ticketId);
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
          ? "border-[var(--jm-border)] bg-[var(--jm-bg)] opacity-80"
          : "border-[var(--jm-border)] bg-[var(--jm-surface)] sm:hover:border-[var(--jm-border-strong)] sm:hover:shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className={`size-2 rounded-full ${meta.dot}`} />
          <span className="text-[12px] font-semibold text-[var(--jm-text)]">
            {meta.label}
          </span>
          {ticket.type === "ON_SITE" && (
            <span className="rounded bg-[var(--jm-action)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              즉시
            </span>
          )}
        </div>
        <span className="text-[11px] text-[var(--jm-text-subtle)]">
          {formatDistanceToNow(new Date(ticket.receivedAt), {
            addSuffix: true,
            locale: ko,
          })}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          {device && (
            <span className="line-clamp-1 text-[14px] font-semibold text-[var(--jm-text)]">
              {device}
            </span>
          )}
          {ticket.symptom && (
            <span className="line-clamp-1 text-[12px] text-[var(--jm-text-muted)]">
              {ticket.symptom}
            </span>
          )}
        </div>
        <span className="shrink-0 font-mono text-[11px] text-[var(--jm-text-subtle)]">
          {ticket.ticketNo}
        </span>
      </div>
      {/* 취소된 ticket — 사유/메모 표시 */}
      {ticket.status === "CANCELLED" && (ticket.cancelReason || ticket.cancelMemo) && (
        <div className="flex items-center gap-1.5 rounded-lg bg-[var(--jm-surface-muted)] px-2 py-1.5">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 text-[var(--jm-text-muted)]">
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M4 4l4 4M8 4l-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span className="line-clamp-1 text-[11px] text-[var(--jm-text-muted)]">
            {ticket.cancelReason ? cancelReasonLabel(ticket.cancelReason) : null}
            {ticket.cancelReason && ticket.cancelMemo ? " — " : null}
            {ticket.cancelMemo}
          </span>
        </div>
      )}
    </button>
  );
}

function cancelReasonLabel(reason: string): string {
  const map: Record<string, string> = {
    CUSTOMER_DECLINED: "고객 거절",
    CUSTOMER_NO_SHOW: "고객 미반환",
    SHOP_GAVE_UP: "매장 포기",
    PARTS_UNAVAILABLE: "부속 수급 불가",
    SOLD_AS_PRODUCT: "상품 구매로 전환",
    MISTAKE: "잘못 생성",
    OTHER: "기타",
  };
  return map[reason] ?? reason;
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
          muted ? "text-[var(--jm-text-subtle)]" : "text-[var(--jm-text-muted)]"
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
    <div className="flex flex-col gap-3">
      <div className="h-3.5 w-16 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-2xl bg-[var(--jm-surface)] p-4 border border-[var(--jm-border)]"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="h-3 w-20 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
              <div className="h-5 w-12 animate-pulse rounded-full bg-[var(--jm-surface-muted)]" />
            </div>
            <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-[var(--jm-surface-muted)]">
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
        <h2 className="text-[15px] font-semibold text-[var(--jm-text)]">진행중인 수리가 없습니다</h2>
        <p className="text-[12px] text-[var(--jm-text-muted)]">맡김 또는 즉시 수리를 시작하세요</p>
      </div>
      <button
        type="button"
        onClick={onNew}
        className="h-11 rounded-full bg-[var(--jm-action)] px-5 text-[14px] font-semibold text-white"
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
  // 즉시수리가 더 흔해서 디폴트
  const [type, setType] = useState<"ON_SITE" | "DROP_OFF">("ON_SITE");
  // 카테고리 — "기타" 가 default
  const [categoryId, setCategoryId] = useState<string>(OTHER_CATEGORY_ID);

  // 카테고리 목록
  const categoriesQuery = useQuery<CategoryRoot[]>({
    queryKey: ["pos-v2", "categories"],
    queryFn: () => apiGet<CategoryRoot[]>("/api/categories"),
    staleTime: 1000 * 60 * 5,
  });
  // "기타" 항상 마지막에 추가
  const categoryOptions = useMemo(
    () => [
      ...(categoriesQuery.data ?? []),
      { id: OTHER_CATEGORY_ID, name: "기타" },
    ],
    [categoriesQuery.data],
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      const ticket = await apiMutate<{ id: string; ticketNo: string }>(
        "/api/repair-tickets",
        "POST",
        {
          type,
          customerId: session.customerId ?? null,
          // "기타" 는 null 로 저장
          repairCategoryId:
            categoryId === OTHER_CATEGORY_ID ? null : categoryId,
          // 미등록 고객이면 카트 세션 매핑 — 클라이언트 추적 끊겨도 DB 에서 복원 가능
          posSessionId: session.customerId ? null : session.id,
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
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--jm-action)] text-[16px] font-semibold text-white disabled:opacity-60"
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
              active={type === "ON_SITE"}
              onClick={() => setType("ON_SITE")}
              title="즉시"
              desc="현장에서 바로 수리"
            />
            <TypeButton
              active={type === "DROP_OFF"}
              onClick={() => setType("DROP_OFF")}
              title="맡김"
              desc="며칠 보관 후 픽업"
            />
          </div>
        </FieldGroup>

        {/* 카테고리 — 칩 선택. 기기/증상은 진행 페이지의 카드에서 입력. */}
        <FieldGroup label="카테고리">
          <div className="flex flex-wrap gap-1.5">
            {categoryOptions.map((c) => {
              const active = c.id === categoryId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  className={`h-9 rounded-full px-3.5 text-[13px] font-medium transition-colors ${
                    active
                      ? "bg-[var(--jm-action)] text-white"
                      : "bg-[var(--jm-surface-muted)] text-[var(--jm-text)] hover:bg-[var(--jm-border)]"
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
          <p className="px-1 pt-1.5 text-[11px] text-[var(--jm-text-subtle)]">
            가져온 기기 · 증상은 진행 페이지에서 입력합니다
          </p>
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
        <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
          {label}
        </span>
        {optional && <span className="text-[10px] text-[var(--jm-text-subtle)]">선택</span>}
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
          ? "border-[var(--jm-action)] bg-[var(--jm-bg)]"
          : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)]"
      }`}
    >
      <span
        className={`text-[16px] font-semibold ${
          active ? "text-[var(--jm-text)]" : "text-[var(--jm-text)]"
        }`}
      >
        {title}
      </span>
      <span className="text-[12px] text-[var(--jm-text-muted)]">{desc}</span>
    </button>
  );
}

