"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSessions } from "@/components/pos/sessions-context";
import { CustomerCard } from "./_components/customer-card";
import { MenuSheet } from "./_components/menu-sheet";
import { LinkCustomerSheet } from "./_link-customer-sheet";
import { QuickCustomerSheet } from "./_quick-customer-sheet";
import { GlobalSearchSheet } from "./_global-search-sheet";

/**
 * POS v2 손님 그리드 — 진입 화면.
 * - 활성 카트 세션을 카드 그리드로 표시
 * - 클릭 시 그 손님의 작업 페이지로 이동
 * - 우하단 FAB: 새 손님(미등록 임시 + 색·코드 자동) / 기존 고객 검색
 */
export default function PosV2HomePage() {
  const router = useRouter();
  const {
    sessions,
    addSession,
    removeSession,
    setCustomer,
    hydrated,
  } = useSessions();
  const [linkOpen, setLinkOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickRegister, setQuickRegister] = useState<{ defaultText: string } | null>(null);
  const [gridFilter, setGridFilter] = useState("");
  const [gridTypeFilter, setGridTypeFilter] = useState<
    "ALL" | "INDIVIDUAL" | "BUSINESS" | "UNREGISTERED"
  >("ALL");
  const [gridSort, setGridSort] = useState<"recent" | "name" | "active">(
    "recent",
  );

  // 손님 세션 필터 — 검색어 + type
  const filteredSessions = sessions
    .filter((s) => {
      if (gridTypeFilter === "BUSINESS" && s.customerType !== "BUSINESS") return false;
      if (gridTypeFilter === "INDIVIDUAL" && s.customerType !== "INDIVIDUAL") return false;
      if (gridTypeFilter === "UNREGISTERED" && s.customerId) return false;
      if (gridFilter.trim()) {
        const q = gridFilter.trim().toLowerCase();
        const hay = [
          s.customerName ?? "",
          s.customerPhone ?? "",
          s.customerBusinessNumber ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .slice() // sort 불변성 위해 복사
    .sort((a, b) => {
      if (gridSort === "name") {
        const an = (a.customerName ?? "").toLowerCase();
        const bn = (b.customerName ?? "").toLowerCase();
        // 미등록은 뒤로
        if (!a.customerId && b.customerId) return 1;
        if (a.customerId && !b.customerId) return -1;
        return an.localeCompare(bn, "ko");
      }
      if (gridSort === "active") {
        const ac =
          (a.openRepairCount ?? 0) +
          a.items.length;
        const bc =
          (b.openRepairCount ?? 0) +
          b.items.length;
        return bc - ac;
      }
      // recent (default) — server 응답 순서 (updatedAt desc) 유지
      return 0;
    });

  const goToCustomer = (sessionId: string) => {
    router.push(`/pos/customer/${sessionId}`);
  };

  const startUnregistered = () => {
    const sid = addSession();
    if (sid) goToCustomer(sid);
  };

  // "고객 찾기" — 시트만 띄움. 세션은 고객이 선택될 때만 생성 (취소/X면 안 만듦).
  const startWithCustomerLink = () => {
    setLinkOpen(true);
  };

  if (!hydrated) {
    return <Skeleton />;
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--jm-bg)]">
      {/* 헤더 — 햄버거 + 타이틀 + 카운트 */}
      <header className="shrink-0 border-b border-[var(--jm-border)] bg-[var(--jm-surface)]">
        <div className="flex items-center gap-2 px-3 py-2.5 sm:px-6">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)] active:bg-[var(--jm-border)]"
            aria-label="메뉴"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M3 6h14M3 10h14M3 14h14"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <h1 className="flex-1 text-[20px] font-bold tracking-tight text-[var(--jm-text)]">
            POS
          </h1>
          <span className="text-[12px] text-[var(--jm-text-muted)]">
            {sessions.length === 0 ? "비어있음" : `진행 ${sessions.length}`}
          </span>
        </div>
      </header>

      {/* 본문 — 손님 카드 그리드 */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 py-4 sm:px-6">
          {sessions.length === 0 ? (
            <EmptyState
              onUnregistered={startUnregistered}
              onSearch={startWithCustomerLink}
            />
          ) : (
            <>
              {/* 검색 + type 필터 — 세션 8개 이상일 때만 노출 */}
              {sessions.length >= 8 && (
                <div className="mb-3 flex flex-col gap-2">
                  <div className="relative">
                    <svg
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--jm-text-subtle)]"
                      width="16"
                      height="16"
                      viewBox="0 0 20 20"
                      fill="none"
                    >
                      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M14 14l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                    <input
                      type="search"
                      value={gridFilter}
                      onChange={(e) => setGridFilter(e.target.value)}
                      placeholder="이름·전화·사업자번호"
                      className="h-11 w-full rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface)] pl-9 pr-3 text-[14px] outline-none focus:border-[var(--jm-border-strong)]"
                    />
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto">
                    {(
                      [
                        { v: "ALL", label: "전체" },
                        { v: "BUSINESS", label: "기업" },
                        { v: "INDIVIDUAL", label: "개인" },
                        { v: "UNREGISTERED", label: "미등록" },
                      ] as const
                    ).map((opt) => {
                      const active = gridTypeFilter === opt.v;
                      return (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => setGridTypeFilter(opt.v)}
                          className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                            active
                              ? "bg-[var(--jm-action)] text-white"
                              : "bg-[var(--jm-surface)] text-[var(--jm-text-muted)] ring-1 ring-[var(--jm-border)] hover:bg-[var(--jm-bg)]"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                    <div className="ml-1 flex shrink-0 gap-1 rounded-full bg-[var(--jm-surface-muted)] p-0.5">
                      {(
                        [
                          { v: "recent", label: "최근" },
                          { v: "active", label: "진행중" },
                          { v: "name", label: "이름순" },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => setGridSort(opt.v)}
                          className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                            gridSort === opt.v
                              ? "bg-[var(--jm-surface)] text-[var(--jm-text)] shadow-sm"
                              : "text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {(gridFilter ||
                      gridTypeFilter !== "ALL" ||
                      gridSort !== "recent") && (
                      <button
                        type="button"
                        onClick={() => {
                          setGridFilter("");
                          setGridTypeFilter("ALL");
                          setGridSort("recent");
                        }}
                        className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
                      >
                        초기화
                      </button>
                    )}
                  </div>
                  {filteredSessions.length !== sessions.length && (
                    <p className="text-[11px] text-[var(--jm-text-muted)]">
                      {filteredSessions.length} / {sessions.length} 표시
                    </p>
                  )}
                </div>
              )}

              {filteredSessions.length === 0 ? (
                <div className="py-12 text-center text-[13px] text-[var(--jm-text-muted)]">
                  조건에 맞는 손님이 없습니다
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {filteredSessions.map((s) => (
                    <CustomerCard
                      key={s.id}
                      session={s}
                      onClick={() => goToCustomer(s.id)}
                      onClose={
                        s.items.length === 0 && (s.openRepairCount ?? 0) === 0
                          ? () => {
                              removeSession(s.id);
                            }
                          : undefined
                      }
                    />
                  ))}
                </div>
              )}
            </>
          )}
          <div className="h-28" />
        </div>
      </main>

      {/* 우하단 FAB — 두 액션 (미등록 빠른 시작 + 고객 검색) */}
      {sessions.length > 0 && (
        <div className="fixed bottom-6 right-6 z-30 flex flex-col items-end gap-2 sm:bottom-8 sm:right-8">
          <button
            type="button"
            onClick={startWithCustomerLink}
            className="flex h-12 items-center gap-2 rounded-full bg-[var(--jm-surface)] px-5 text-[var(--jm-text)] shadow-lg shadow-[var(--jm-shadow-md)] ring-1 ring-[var(--jm-border)] transition-transform active:scale-95"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <circle
                cx="9"
                cy="9"
                r="6"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M14 14l3 3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-[14px] font-semibold">고객 찾기</span>
          </button>
          <button
            type="button"
            onClick={startUnregistered}
            className="flex h-14 items-center gap-2 rounded-full bg-[var(--jm-action)] px-5 text-white shadow-lg shadow-[var(--jm-shadow-lg)] transition-transform active:scale-95"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M10 4v12M4 10h12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-[15px] font-semibold">새 손님</span>
          </button>
        </div>
      )}

      {/* 메뉴 시트 (햄버거) */}
      <MenuSheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onSearch={() => setSearchOpen(true)}
        onRentalManagement={() => router.push("/pos/rentals")}
      />
      <GlobalSearchSheet open={searchOpen} onOpenChange={setSearchOpen} />

      {/* 고객 검색 시트 — 선택 시점에만 세션 생성 + 고객 연결 + 페이지 이동.
          취소/X 누르면 아무것도 안 만듦. */}
      <LinkCustomerSheet
        open={linkOpen}
        onOpenChange={setLinkOpen}
        onSelect={(c) => {
          // 같은 고객의 진행중 세션이 있으면 그걸 재사용 (중복 방지)
          const existing = sessions.find((s) => s.customerId === c.id);
          if (existing) {
            setLinkOpen(false);
            goToCustomer(existing.id);
            return;
          }
          const sid = addSession();
          if (!sid) return;
          setCustomer(c.id, c.name, c.phone, sid, {
            type: c.type,
            businessNumber: c.businessNumber ?? null,
          });
          setLinkOpen(false);
          goToCustomer(sid);
        }}
        onCreate={(query) => {
          setLinkOpen(false);
          setQuickRegister({ defaultText: query });
        }}
      />

      {/* 고객 빠른 등록 시트 */}
      <QuickCustomerSheet
        open={!!quickRegister}
        onOpenChange={(o) => !o && setQuickRegister(null)}
        defaultText={quickRegister?.defaultText ?? ""}
        onCreated={(c) => {
          // 등록 후 즉시 새 세션 + 고객 연결 + 손님 페이지 이동
          const sid = addSession();
          if (!sid) return;
          setCustomer(c.id, c.name, c.phone, sid, {
            type: c.type,
            businessNumber: c.businessNumber ?? null,
          });
          setQuickRegister(null);
          goToCustomer(sid);
        }}
      />
    </div>
  );
}

function EmptyState({
  onUnregistered,
  onSearch,
}: {
  onUnregistered: () => void;
  onSearch: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-20 text-center">
      <div className="flex size-20 items-center justify-center rounded-3xl bg-[var(--jm-surface-muted)]">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
          <circle
            cx="12"
            cy="9"
            r="3"
            stroke="#71717a"
            strokeWidth="1.5"
          />
          <path
            d="M5 19c1-3 4-5 7-5s6 2 7 5"
            stroke="#71717a"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[18px] font-bold text-[var(--jm-text)]">
          진행중인 손님이 없습니다
        </h2>
        <p className="text-[13px] text-[var(--jm-text-muted)]">
          손님이 매장에 들어오면 시작해주세요
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-2">
        <button
          type="button"
          onClick={onUnregistered}
          className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-[var(--jm-action)] text-[15px] font-semibold text-white"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path
              d="M10 4v12M4 10h12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          새 손님 (미등록)
        </button>
        <button
          type="button"
          onClick={onSearch}
          className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-[var(--jm-surface)] text-[15px] font-semibold text-[var(--jm-text)] ring-1 ring-[var(--jm-border)]"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <circle
              cx="9"
              cy="9"
              r="6"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path
              d="M14 14l3 3"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          기존 고객 찾기
        </button>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--jm-bg)]">
      {/* 헤더 — [☰메뉴][POS][진행 N] 골격 */}
      <header className="shrink-0 border-b border-[var(--jm-border)] bg-[var(--jm-surface)]">
        <div className="flex items-center gap-2 px-3 py-2.5 sm:px-6">
          <div className="size-10 shrink-0 animate-pulse rounded-full bg-[var(--jm-surface-muted)]" />
          <div className="h-5 w-12 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
          <div className="ml-auto h-3 w-14 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
        </div>
      </header>
      {/* 본문 — 손님 카드 그리드 */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 py-4 sm:px-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex h-32 flex-col gap-3 rounded-2xl bg-[var(--jm-surface)] p-4 ring-1 ring-[var(--jm-border)]"
              >
                <div className="flex items-center gap-3">
                  <div className="size-12 animate-pulse rounded-full bg-[var(--jm-surface-muted)]" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
                  </div>
                </div>
                <div className="mt-auto flex gap-1.5">
                  <div className="h-5 w-12 animate-pulse rounded-full bg-[var(--jm-surface-muted)]" />
                  <div className="h-5 w-12 animate-pulse rounded-full bg-[var(--jm-surface-muted)]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
