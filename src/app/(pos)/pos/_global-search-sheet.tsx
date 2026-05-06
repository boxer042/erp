"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { apiGet } from "@/lib/api-client";
import { useSessions } from "@/components/pos/sessions-context";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

interface SearchProduct {
  id: string;
  name: string;
  sku: string;
  imageUrl: string | null;
}
interface SearchCustomer {
  id: string;
  name: string;
  phone: string;
  type?: "INDIVIDUAL" | "BUSINESS";
  businessNumber?: string | null;
}
interface SearchRepair {
  id: string;
  ticketNo: string;
  status: string;
  receivedAt: string;
  symptom: string | null;
  customer: { name: string; phone: string | null } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** customer page 에서 열렸을 때 — 상품 결과 클릭 시 인라인 detail 진입. 없으면 v1 페이지로 router.push fallback. */
  onProductSelect?: (productId: string) => void;
}

/**
 * 통합 검색 — 상품·고객·수리 한 번에. 햄버거 메뉴 → 검색.
 * 풀스크린 모달, 결과 카테고리별 섹션.
 */
export function GlobalSearchSheet({ open, onOpenChange, onProductSelect }: Props) {
  if (!open) return null;
  return <Body onOpenChange={onOpenChange} onProductSelect={onProductSelect} />;
}

function Body({
  onOpenChange,
  onProductSelect,
}: {
  onOpenChange: (v: boolean) => void;
  onProductSelect?: (productId: string) => void;
}) {
  const router = useRouter();
  const { addSession, setCustomer, sessions } = useSessions();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = q.trim();
  useBodyScrollLock();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const productsQuery = useQuery<SearchProduct[]>({
    queryKey: ["pos-v2", "search", "products", trimmed],
    queryFn: () =>
      apiGet<SearchProduct[]>(
        `/api/products?search=${encodeURIComponent(trimmed)}&excludeVariants=true`,
      ),
    enabled: trimmed.length > 0,
    staleTime: 1000 * 30,
  });

  const customersQuery = useQuery<SearchCustomer[]>({
    queryKey: ["pos-v2", "search", "customers", trimmed],
    queryFn: () =>
      apiGet<SearchCustomer[]>(
        `/api/customers?search=${encodeURIComponent(trimmed)}&limit=10`,
      ),
    enabled: trimmed.length > 0,
    staleTime: 1000 * 30,
  });

  const repairsQuery = useQuery<SearchRepair[]>({
    queryKey: ["pos-v2", "search", "repairs", trimmed],
    queryFn: () =>
      apiGet<SearchRepair[]>(
        `/api/repair-tickets?search=${encodeURIComponent(trimmed)}`,
      ),
    enabled: trimmed.length > 0,
    staleTime: 1000 * 30,
  });

  const products = productsQuery.data ?? [];
  const customers = customersQuery.data ?? [];
  const repairs = repairsQuery.data ?? [];

  const totalCount = products.length + customers.length + repairs.length;
  const isLoading =
    trimmed.length > 0 &&
    (productsQuery.isPending ||
      customersQuery.isPending ||
      repairsQuery.isPending);

  const close = () => onOpenChange(false);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--jm-surface)]">
      <header className="shrink-0 border-b border-[var(--jm-border)]">
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={close}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)] active:bg-[var(--jm-border)]"
            aria-label="닫기"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M12 4l-6 6 6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="상품·고객·수리 통합 검색"
            className="h-11 flex-1 rounded-xl bg-[var(--jm-surface-muted)] px-4 text-[15px] outline-none placeholder:text-[var(--jm-text-subtle)] focus:bg-[var(--jm-bg)]"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                inputRef.current?.focus();
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--jm-text-subtle)] hover:bg-[var(--jm-surface-muted)]"
              aria-label="지우기"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {trimmed.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-16 text-center text-[13px] text-[var(--jm-text-subtle)]">
            검색어를 입력하세요
            <span className="text-[11px]">상품명·SKU · 이름·전화 · 수리번호·증상</span>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-[13px] text-[var(--jm-text-subtle)]">
            검색 중…
          </div>
        ) : totalCount === 0 ? (
          <div className="px-4 py-12 text-center text-[13px] text-[var(--jm-text-subtle)]">
            결과 없음
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {products.length > 0 && (
              <Section title="상품" count={products.length}>
                {products.slice(0, 10).map((p) => (
                  <Row
                    key={p.id}
                    onClick={() => {
                      close();
                      // customer page 에서 열렸으면 인라인 detail 진입, 아니면 v1 페이지 fallback
                      if (onProductSelect) {
                        onProductSelect(p.id);
                      } else {
                        router.push(`/pos/products/${p.id}`);
                      }
                    }}
                  >
                    <Avatar imageUrl={p.imageUrl} fallback="상품" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="line-clamp-1 text-[14px] font-semibold text-[var(--jm-text)]">
                        {p.name}
                      </span>
                      <span className="font-mono text-[11px] text-[var(--jm-text-muted)]">
                        {p.sku}
                      </span>
                    </div>
                  </Row>
                ))}
              </Section>
            )}

            {customers.length > 0 && (
              <Section title="고객" count={customers.length}>
                {customers.map((c) => (
                  <Row
                    key={c.id}
                    onClick={() => {
                      close();
                      // 같은 고객 진행중 세션 있으면 재사용, 없으면 새 세션
                      const existing = sessions.find(
                        (s) => s.customerId === c.id,
                      );
                      if (existing) {
                        router.push(`/pos/customer/${existing.id}`);
                      } else {
                        const sid = addSession();
                        if (sid) {
                          setCustomer(c.id, c.name, c.phone, sid, {
                            type: c.type,
                            businessNumber: c.businessNumber ?? null,
                          });
                          router.push(`/pos/customer/${sid}`);
                        }
                      }
                    }}
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--jm-surface-muted)] text-[15px] font-bold text-[var(--jm-text)]">
                      {c.name.charAt(0)}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[14px] font-semibold text-[var(--jm-text)]">
                        {c.name}
                      </span>
                      <span className="font-mono text-[11px] text-[var(--jm-text-muted)]">
                        {c.phone}
                      </span>
                    </div>
                  </Row>
                ))}
              </Section>
            )}

            {repairs.length > 0 && (
              <Section title="수리" count={repairs.length}>
                {repairs.slice(0, 10).map((r) => (
                  <Row
                    key={r.id}
                    onClick={() => {
                      close();
                      router.push(`/pos/repair-v2/${r.id}`);
                    }}
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--jm-surface-muted)] text-[var(--jm-text)]">
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                        <path
                          d="M14.7 6.3a4 4 0 1 1-5.4 5.4l-5.6 5.6a1.4 1.4 0 0 0 2 2l5.6-5.6a4 4 0 0 1 5.4-5.4z"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        />
                      </svg>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[12px] font-semibold text-[var(--jm-text)]">
                          {r.ticketNo}
                        </span>
                        <span className="text-[11px] text-[var(--jm-text-muted)]">
                          {format(new Date(r.receivedAt), "MM-dd")}
                        </span>
                      </div>
                      <span className="line-clamp-1 text-[12px] text-[var(--jm-text-muted)]">
                        {r.customer?.name ?? "(미등록)"}
                        {r.symptom && ` — ${r.symptom}`}
                      </span>
                    </div>
                  </Row>
                ))}
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col">
      <div className="flex items-baseline gap-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
        <span>{title}</span>
        <span className="text-[var(--jm-text-subtle)]">{count}</span>
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

function Row({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 border-b border-[var(--jm-border)] px-4 py-2.5 text-left transition-colors active:bg-[var(--jm-bg)] sm:hover:bg-[var(--jm-bg)]"
    >
      {children}
    </button>
  );
}

function Avatar({
  imageUrl,
  fallback,
}: {
  imageUrl: string | null;
  fallback: string;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={fallback}
        className="size-10 shrink-0 rounded-lg object-cover"
      />
    );
  }
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--jm-surface-muted)] text-[var(--jm-text-subtle)]">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
        <path
          d="M3 6l7-4 7 4v8l-7 4-7-4V6z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
