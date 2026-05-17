"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  PackagePlus,
  Receipt,
  Search,
  ShoppingBag,
  Store,
  Wrench,
} from "lucide-react";
import {
  JmButton,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogHeader,
  JmDialogTitle,
  JmKbd,
  JmSearchInput,
} from "@/jm";

interface SearchRoute {
  label: string;
  href: (q: string) => string;
  hint: string;
}

const ROUTES: SearchRoute[] = [
  { label: "주문 검색", href: (q) => `/orders?search=${encodeURIComponent(q)}`, hint: "주문번호 · 고객명 · 상품" },
  { label: "수리 검색", href: (q) => `/repairs?search=${encodeURIComponent(q)}`, hint: "수리번호 · 고객명 · 모델" },
  { label: "고객 검색", href: (q) => `/customers?search=${encodeURIComponent(q)}`, hint: "이름 · 전화 · 사업자번호" },
  { label: "상품 검색", href: (q) => `/products?search=${encodeURIComponent(q)}`, hint: "SKU · 상품명" },
  { label: "거래처 검색", href: (q) => `/suppliers?search=${encodeURIComponent(q)}`, hint: "상호 · 사업자번호" },
  { label: "통합 판매내역", href: (q) => `/sales/history?search=${encodeURIComponent(q)}`, hint: "주문번호 · 결제·반품" },
];

export function QuickActionsBar() {
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex h-10 min-w-[260px] flex-1 items-center gap-2 rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 text-jm-sm text-[var(--jm-text-muted)] transition-colors hover:border-[var(--jm-border-strong)] hover:bg-[var(--jm-surface-muted)] sm:flex-none"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">통합 검색…</span>
          <JmKbd>⌘K</JmKbd>
        </button>

        <Link href="/pos">
          <JmButton variant="cta" size="sm" className="gap-1.5">
            <Store className="size-4" />
            POS 시작
          </JmButton>
        </Link>
        <Link href="/orders">
          <JmButton variant="outline" size="sm" className="gap-1.5">
            <ShoppingBag className="size-4" />
            새 주문
          </JmButton>
        </Link>
        <Link href="/repairs">
          <JmButton variant="outline" size="sm" className="gap-1.5">
            <Wrench className="size-4" />
            새 수리
          </JmButton>
        </Link>
        <Link href="/inventory/incoming">
          <JmButton variant="outline" size="sm" className="gap-1.5">
            <PackagePlus className="size-4" />
            입고 등록
          </JmButton>
        </Link>
        <Link href="/expenses">
          <JmButton variant="outline" size="sm" className="gap-1.5">
            <Receipt className="size-4" />
            지출 등록
          </JmButton>
        </Link>
      </div>

      <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}

function GlobalSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const trimmed = query.trim();
  const filtered = useMemo(() => {
    if (!trimmed) return ROUTES;
    const lower = trimmed.toLowerCase();
    return ROUTES.filter(
      (r) => r.label.toLowerCase().includes(lower) || r.hint.toLowerCase().includes(lower),
    );
  }, [trimmed]);

  const handleNavigate = (href: string) => {
    onOpenChange(false);
    setQuery("");
    router.push(href);
  };

  return (
    <JmDialog open={open} onOpenChange={onOpenChange}>
      <JmDialogContent size="xl">
        <JmDialogHeader>
          <JmDialogTitle>통합 검색</JmDialogTitle>
        </JmDialogHeader>
        <JmDialogBody className="space-y-3">
          <JmSearchInput
            autoFocus
            placeholder="검색어 입력 후 카테고리 선택…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => setQuery("")}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && trimmed && filtered.length > 0) {
                e.preventDefault();
                handleNavigate(filtered[0].href(trimmed));
              }
            }}
          />
          <div className="flex flex-col gap-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-4 text-center text-jm-sm text-[var(--jm-text-muted)]">
                일치하는 카테고리 없음
              </p>
            ) : (
              filtered.map((r) => (
                <button
                  type="button"
                  key={r.label}
                  onClick={() => handleNavigate(r.href(trimmed))}
                  disabled={!trimmed}
                  className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--jm-surface-muted)] disabled:opacity-40"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-jm-sm font-medium text-[var(--jm-text)]">
                      {r.label}
                    </span>
                    <span className="text-jm-xs text-[var(--jm-text-muted)]">
                      {r.hint}
                    </span>
                  </div>
                  <ArrowRight className="size-4 text-[var(--jm-text-muted)]" />
                </button>
              ))
            )}
          </div>
          <p className="text-jm-xs text-[var(--jm-text-muted)]">
            Enter 키로 첫번째 카테고리 점프 · <JmKbd>⌘K</JmKbd> 로 토글
          </p>
        </JmDialogBody>
      </JmDialogContent>
    </JmDialog>
  );
}
