"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

interface Customer {
  id: string;
  name: string;
  phone: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (ticketId: string) => void;
  /** 미등록 고객일 때 ticket 의 카트 세션 매핑 — DB 에 영구 추적 (선택) */
  posSessionId?: string;
}

/**
 * 새 수리 시작 — 바텀 시트 (raw HTML, shadcn 0개).
 * 단순화: 고객(검색·새 등록), 유형(즉시/맡김), 기기 정보(자유 입력),
 *          증상. 진단비/매핑 등 디테일은 상세 페이지에서.
 */
export function NewRepairSheet(props: Props) {
  if (!props.open) return null;
  return <NewRepairSheetBody {...props} />;
}

function NewRepairSheetBody({ onOpenChange, onCreated, posSessionId }: Props) {
  useBodyScrollLock();
  // 즉시수리가 더 흔해서 디폴트
  const [type, setType] = useState<"ON_SITE" | "DROP_OFF">("ON_SITE");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [device, setDevice] = useState("");
  const [symptom, setSymptom] = useState("");

  // 고객 검색
  const customersQuery = useQuery<Customer[]>({
    queryKey: ["repairs", "customer-search", customerSearch],
    queryFn: () =>
      apiGet<Customer[]>(
        `/api/customers?search=${encodeURIComponent(customerSearch)}&limit=8`,
      ),
    enabled: customerSearch.length > 0 && !selectedCustomer,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const ticket = await apiMutate<{ id: string; ticketNo: string }>(
        "/api/repair-tickets",
        "POST",
        {
          type,
          customerId: selectedCustomer?.id ?? null,
          repairProductText: device.trim() || null,
          symptom: symptom.trim() || null,
          // 미등록 고객이면 카트 세션 매핑 — 등록 고객은 customerId 가 매핑 역할
          posSessionId: selectedCustomer ? null : posSessionId ?? null,
        },
      );
      // ON_SITE 면 자동으로 REPAIRING 으로 (사용자 의도: 즉시는 그 자리에서 작업)
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
      onCreated(ticket.id);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "생성 실패"),
  });

  if (!open) return null;

  return (
    <>
      {/* 백드롭 */}
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        aria-label="닫기"
      />

      {/* 바텀 시트 */}
      <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col rounded-t-3xl bg-[var(--jm-surface)] shadow-2xl">
        {/* 핸들 */}
        <div className="flex shrink-0 justify-center pt-3">
          <div className="h-1 w-10 rounded-full bg-[var(--jm-border-strong)]" />
        </div>

        {/* 헤더 */}
        <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-3">
          <h2 className="text-[18px] font-bold text-[var(--jm-text)]">새 수리</h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--jm-text-subtle)] hover:bg-[var(--jm-surface-muted)] active:bg-[var(--jm-border)]"
            aria-label="닫기"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M5 5l10 10M15 5l-10 10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* 본문 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          <div className="flex flex-col gap-5">
            {/* 유형 — 큰 토글 */}
            <Section label="유형">
              <div className="grid grid-cols-2 gap-2">
                <TypeOption
                  active={type === "ON_SITE"}
                  onClick={() => setType("ON_SITE")}
                  title="즉시"
                  desc="현장에서 바로 수리"
                />
                <TypeOption
                  active={type === "DROP_OFF"}
                  onClick={() => setType("DROP_OFF")}
                  title="맡김"
                  desc="며칠 보관 후 픽업"
                />
              </div>
            </Section>

            {/* 고객 */}
            <Section label="고객" optional>
              {selectedCustomer ? (
                <div className="flex items-center justify-between rounded-xl bg-[var(--jm-surface-muted)] px-4 py-3">
                  <div className="flex flex-col">
                    <span className="text-[15px] font-semibold text-[var(--jm-text)]">
                      {selectedCustomer.name}
                    </span>
                    <span className="font-mono text-[12px] text-[var(--jm-text-muted)]">
                      {selectedCustomer.phone}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCustomer(null);
                      setCustomerSearch("");
                    }}
                    className="text-[12px] font-medium text-[var(--jm-text-muted)] underline-offset-2 hover:underline"
                  >
                    변경
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    inputMode="search"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="이름 또는 전화 검색"
                    className="h-12 w-full rounded-xl border border-[var(--jm-border)] bg-[var(--jm-bg)] px-4 text-[15px] outline-none placeholder:text-[var(--jm-text-subtle)] focus:border-[var(--jm-border-strong)] focus:bg-[var(--jm-surface)]"
                  />
                  {customerSearch.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1">
                      {customersQuery.isPending ? (
                        <div className="px-3 py-2 text-[13px] text-[var(--jm-text-subtle)]">
                          검색 중…
                        </div>
                      ) : customersQuery.data?.length === 0 ? (
                        <div className="rounded-xl bg-[var(--jm-bg)] px-3 py-3 text-[13px] text-[var(--jm-text-muted)]">
                          일치하는 고객 없음 — 미등록으로 진행하거나 고객 페이지에서 등록하세요
                        </div>
                      ) : (
                        customersQuery.data?.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setSelectedCustomer(c)}
                            className="flex items-center justify-between rounded-xl px-3 py-2.5 text-left hover:bg-[var(--jm-surface-muted)] active:bg-[var(--jm-border)]"
                          >
                            <span className="text-[14px] font-medium text-[var(--jm-text)]">
                              {c.name}
                            </span>
                            <span className="font-mono text-[12px] text-[var(--jm-text-muted)]">
                              {c.phone}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </Section>

            {/* 기기 */}
            <Section label="기기" optional>
              <input
                type="text"
                value={device}
                onChange={(e) => setDevice(e.target.value)}
                placeholder="예: Sony A7M4 (Black)"
                className="h-12 w-full rounded-xl border border-[var(--jm-border)] bg-[var(--jm-bg)] px-4 text-[15px] outline-none placeholder:text-[var(--jm-text-subtle)] focus:border-[var(--jm-border-strong)] focus:bg-[var(--jm-surface)]"
              />
              <p className="mt-1.5 text-[12px] text-[var(--jm-text-muted)]">
                상세 페이지에서 시리얼 코드/카탈로그 매핑으로 정밀화 가능
              </p>
            </Section>

            {/* 증상 */}
            <Section label="증상" optional>
              <textarea
                value={symptom}
                onChange={(e) => setSymptom(e.target.value)}
                placeholder="고객이 호소하는 증상"
                rows={3}
                className="w-full resize-none rounded-xl border border-[var(--jm-border)] bg-[var(--jm-bg)] p-3 text-[15px] outline-none placeholder:text-[var(--jm-text-subtle)] focus:border-[var(--jm-border-strong)] focus:bg-[var(--jm-surface)]"
              />
            </Section>
          </div>
        </div>

        {/* 하단 액션 — sticky */}
        <div className="shrink-0 border-t border-[var(--jm-border)] bg-[var(--jm-surface)] px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-3">
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--jm-action)] text-[16px] font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-60"
          >
            {createMutation.isPending && (
              <Spinner className="size-4 text-white" />
            )}
            {type === "ON_SITE" ? "즉시 수리 시작" : "맡김 접수"}
          </button>
        </div>
      </div>
    </>
  );
}

function Section({
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
        {optional && (
          <span className="text-[10px] text-[var(--jm-text-subtle)]">선택</span>
        )}
      </div>
      {children}
    </div>
  );
}

function TypeOption({
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
      className={`flex flex-col gap-1 rounded-2xl border-2 p-4 text-left transition-colors ${
        active
          ? "border-[var(--jm-action)] bg-[var(--jm-bg)]"
          : "border-[var(--jm-border)] bg-[var(--jm-surface)] text-[var(--jm-text-muted)] hover:border-[var(--jm-border-strong)]"
      }`}
    >
      <span
        className={`text-[16px] font-semibold ${active ? "text-[var(--jm-text)]" : ""}`}
      >
        {title}
      </span>
      <span className="text-[12px] text-[var(--jm-text-muted)]">{desc}</span>
    </button>
  );
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
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
  );
}
