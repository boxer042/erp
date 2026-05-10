"use client";

import { use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Wrench, CalendarClock, Menu, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useSessions } from "@/components/pos/sessions-context";
import {
  deriveTempCode,
  deriveTempColor,
} from "@/components/pos/temp-customer";
import { BottomTabBar } from "../../_components/bottom-tab-bar";
import { MenuSheet } from "../../_components/menu-sheet";
import { ProductsMode } from "../../_products-mode";
import { RepairMode } from "../../_repair-mode";
import { RentalMode } from "../../_rental-mode";
import { GlobalSearchSheet } from "../../_global-search-sheet";
import { LinkCustomerSheet } from "../../_link-customer-sheet";
import { QuickCustomerSheet } from "../../_quick-customer-sheet";
import { CustomerActionSheet } from "../../_customer-action-sheet";
import { CartSheet } from "../../_cart-sheet";
import { PaymentSheet } from "../../_payment-sheet";
import { useRepairSync } from "../../_use-repair-sync";
import { ProductDetailView, type LandingResponse } from "../../_product-detail-view";
import { RepairDetail } from "@/app/(pos)/pos/repairs/[id]/page";
import {
  STATUS_META,
  type RepairTicketDetail,
} from "@/app/(pos)/pos/repairs/_types";

type Mode = "product" | "repair" | "rental";
type Detail = { type: "repair-ticket"; id: string } | { type: "product"; id: string } | null;

const MODE_LABELS: Record<Mode, string> = {
  product: "상품",
  repair: "수리",
  rental: "임대",
};

const MODE_SUBLABELS: Record<Mode, string> = {
  product: "상품 추가 · 결제",
  repair: "진행중 수리 · 신규 접수",
  rental: "임대 자산 · 대여 등록",
};

/**
 * POS 손님 작업 페이지.
 *
 * 헤더 — 단일 1줄. 모드 무관 동일 layout:
 *  [< 뒤로]  [좌측 타이틀 (모드 또는 컨텐츠)]                  [우측 손님 영역]
 *
 * BottomTabBar — 좌측 첫 자리에 ☰메뉴 항상 노출 → [메뉴|상품|수리|임대].
 */
export default function PosV2CustomerPage({
  params,
}: {
  params: Promise<{ sid: string }>;
}) {
  const { sid } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const { getSession, hydrated, setCustomer, add } = useSessions();

  /**
   * 미등록 손님 → 등록 고객으로 전환할 때:
   * 1. setCustomer 로 sessions state 업데이트 (UI 즉시 반영)
   * 2. 이 세션의 미등록 RepairTicket 들의 customerId 도 같은 고객으로 일괄 매핑 (server)
   * 3. repair query invalidate — useRepairSync 가 customerId 기준 fetch 로 전환되어도 ticket 따라옴
   */
  const linkCustomerToSession = async (
    customerId: string,
    name: string,
    phone: string | undefined,
    extras?: {
      type?: "INDIVIDUAL" | "BUSINESS";
      businessNumber?: string | null;
    },
  ) => {
    setCustomer(customerId, name, phone, sid, extras);
    try {
      await apiMutate(`/api/pos/sessions/${sid}/link-customer`, "POST", {
        customerId,
      });
    } catch {
      // 무시 — sessions state 는 이미 업데이트됨. ticket 추적은 다음 sync 로 복원
    }
    qc.invalidateQueries({ queryKey: ["pos-v2", "repairs"] });
  };
  // mode 는 URL query 로 persist — 새로고침해도 같은 모드 유지
  const initialMode: Mode = (() => {
    const v = searchParams.get("mode");
    return v === "repair" || v === "rental" ? v : "product";
  })();
  const [mode, setModeState] = useState<Mode>(initialMode);
  const setMode = (m: Mode) => {
    setModeState(m);
    const sp = new URLSearchParams(Array.from(searchParams.entries()));
    if (m === "product") sp.delete("mode");
    else sp.set("mode", m);
    const qs = sp.toString();
    router.replace(`/pos/customer/${sid}${qs ? `?${qs}` : ""}`, { scroll: false });
  };
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [customerActionOpen, setCustomerActionOpen] = useState(false);
  const [quickRegister, setQuickRegister] = useState<{ defaultText: string } | null>(null);
  const [labelCodes, setLabelCodes] = useState<string[] | null>(null);
  // 라벨 모달 닫을 때 손님 그리드(/pos) 로 이동할지 — 결제 직후 발번 케이스만 true.
  // 카트에서 미리 출력하는 케이스는 false (세션 유지, 손님 페이지 머물러야 함).
  const [labelRedirectAfter, setLabelRedirectAfter] = useState(false);
  const [detail, setDetail] = useState<Detail>(null);
  // 카트/결제 시트 — 모드 무관 페이지 레벨에서 mount (수리 모드에서도 카트 열 수 있어야 함)
  const [cartOpen, setCartOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  // URL 의 ?openCart=1 — 외부 진입 (예: 수리관리 "결제로 이동") 시 도착 후 자동 카트 오픈.
  // 한 번 처리 후 URL 에서 파라미터 제거 → 새로고침 시 재오픈 방지.
  useEffect(() => {
    if (searchParams.get("openCart") !== "1") return;
    setCartOpen(true);
    const sp = new URLSearchParams(Array.from(searchParams.entries()));
    sp.delete("openCart");
    const qs = sp.toString();
    router.replace(`/pos/customer/${sid}${qs ? `?${qs}` : ""}`, { scroll: false });
    // searchParams/router 는 stable 하지 않을 수 있어 의존성에 sid 만 — mount 1회 처리.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid]);

  const session = hydrated ? getSession(sid) : undefined;
  // 모드 무관 — repair count + ticketIds 항상 동기화 (RepairMode 미마운트 상태에서도)
  // session 이 undefined 일 땐 hook 안에서 noop.
  useRepairSync(session);

  // 모드 전환 시 detail 자동 해제
  const switchMode = (m: Mode) => {
    setDetail(null);
    setMode(m);
  };

  if (!hydrated) {
    return <CustomerPageSkeleton />;
  }

  if (!session) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--jm-bg)] p-6 text-center">
        <span className="text-[15px] font-semibold text-[var(--jm-text)]">
          손님 세션을 찾을 수 없습니다
        </span>
        <button
          type="button"
          onClick={() => router.push("/pos")}
          className="h-10 rounded-full bg-[var(--jm-action)] px-5 text-[13px] font-semibold text-white"
        >
          손님 그리드로
        </button>
      </div>
    );
  }

  const isRegistered = !!session.customerId;
  const code = deriveTempCode(session.id);
  const palette = deriveTempColor(session.id);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--jm-bg)]">
      {/* 상단 헤더 — detail 유무로 두 레이아웃 */}
      <header className="shrink-0 border-b border-[var(--jm-border)] bg-[var(--jm-surface)]">
        <div className="flex items-center gap-3 px-3 py-2.5 sm:px-6">
          {/* 좌측: 뒤로 — detail 시엔 detail 해제, 일반 시엔 손님 그리드로 */}
          <button
            type="button"
            onClick={() => (detail ? setDetail(null) : router.push("/pos"))}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)] active:bg-[var(--jm-border)]"
            aria-label="뒤로"
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

          {detail ? (
            // 상세 모드 — 좌측: 컨텐츠 타이틀/상태, 우측: 손님 썸네일+이름+번호
            <>
              <div className="flex min-w-0 flex-1">
                {detail.type === "repair-ticket" ? (
                  <RepairTicketHeader ticketId={detail.id} />
                ) : (
                  <ProductHeader productId={detail.id} />
                )}
              </div>
              <button
                type="button"
                onClick={() => setCustomerActionOpen(true)}
                className="flex shrink-0 items-center gap-2 rounded-full px-1 py-1 text-left transition-colors hover:bg-[var(--jm-bg)] active:bg-[var(--jm-surface-muted)]"
                aria-label="손님"
              >
                {isRegistered ? (
                  <>
                    {session.customerType === "BUSINESS" ? (
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--jm-warning-bg)] text-[var(--jm-warning-fg)]">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M3 21V7l9-4 9 4v14M9 21V11h6v10"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    ) : (
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--jm-surface-muted)] text-[15px] font-bold text-[var(--jm-text)]">
                        {(session.customerName ?? "?").charAt(0)}
                      </div>
                    )}
                    <div className="flex min-w-0 max-w-[140px] flex-col">
                      <span className="line-clamp-1 text-[14px] font-semibold text-[var(--jm-text)]">
                        {session.customerName}
                      </span>
                      {session.customerType === "BUSINESS" &&
                      session.customerBusinessNumber ? (
                        <span className="line-clamp-1 font-mono text-[11px] text-[var(--jm-text-muted)]">
                          {session.customerBusinessNumber}
                        </span>
                      ) : session.customerPhone ? (
                        <span className="line-clamp-1 font-mono text-[11px] text-[var(--jm-text-muted)]">
                          {session.customerPhone}
                        </span>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <>
                    <div
                      className={`flex size-10 shrink-0 items-center justify-center rounded-full text-white ${palette.bg}`}
                    >
                      <span className="font-mono text-[12px] font-bold tracking-wider">
                        {code}
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <span className="text-[14px] font-semibold text-[var(--jm-text)]">
                        미등록 손님
                      </span>
                      <span className="font-mono text-[11px] text-[var(--jm-text-muted)]">
                        #{code}
                      </span>
                    </div>
                  </>
                )}
              </button>
            </>
          ) : (
            // 일반 모드 — 좌측: 모드 타이틀, (상품모드일 땐 중앙: 검색창), 우측: 손님
            <>
              <div className="flex shrink-0 flex-col">
                <span className="text-[14px] font-semibold text-[var(--jm-text)]">
                  {MODE_LABELS[mode]}
                </span>
                <span className="text-[11px] text-[var(--jm-text-muted)]">
                  {MODE_SUBLABELS[mode]}
                </span>
              </div>
              {mode === "product" ? (
                <div className="relative flex h-10 min-w-0 flex-1 items-center">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    className="pointer-events-none absolute left-4 text-[var(--jm-text-muted)]"
                  >
                    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="상품명 · SKU 검색"
                    className="h-10 w-full min-w-0 rounded-full bg-[var(--jm-surface-muted)] pl-10 pr-9 text-[13px] text-[var(--jm-text)] placeholder:text-[var(--jm-text-muted)] focus:bg-[var(--jm-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--jm-action)]"
                  />
                  {productSearch && (
                    <button
                      type="button"
                      onClick={() => setProductSearch("")}
                      aria-label="검색어 지우기"
                      className="absolute right-2 flex h-7 w-7 items-center justify-center rounded-full text-[var(--jm-text-muted)] hover:bg-[var(--jm-border)] active:bg-[var(--jm-border)]"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path
                          d="M3 3l8 8M11 3l-8 8"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              ) : (
                <div className="min-w-0 flex-1" />
              )}
              <button
                type="button"
                onClick={() => setCustomerActionOpen(true)}
                className="flex shrink-0 items-center gap-2 rounded-full px-1 py-1 text-left transition-colors hover:bg-[var(--jm-bg)] active:bg-[var(--jm-surface-muted)]"
                aria-label="손님"
              >
                {isRegistered ? (
                  <>
                    {session.customerType === "BUSINESS" ? (
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--jm-warning-bg)] text-[var(--jm-warning-fg)]">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M3 21V7l9-4 9 4v14M9 21V11h6v10"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    ) : (
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--jm-surface-muted)] text-[15px] font-bold text-[var(--jm-text)]">
                        {(session.customerName ?? "?").charAt(0)}
                      </div>
                    )}
                    <div className="flex min-w-0 max-w-[140px] flex-col">
                      <span className="line-clamp-1 text-[14px] font-semibold text-[var(--jm-text)]">
                        {session.customerName}
                      </span>
                      {session.customerType === "BUSINESS" &&
                      session.customerBusinessNumber ? (
                        <span className="line-clamp-1 font-mono text-[11px] text-[var(--jm-text-muted)]">
                          {session.customerBusinessNumber}
                        </span>
                      ) : session.customerPhone ? (
                        <span className="line-clamp-1 font-mono text-[11px] text-[var(--jm-text-muted)]">
                          {session.customerPhone}
                        </span>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <>
                    <div
                      className={`flex size-10 shrink-0 items-center justify-center rounded-full text-white ${palette.bg}`}
                    >
                      <span className="font-mono text-[12px] font-bold tracking-wider">
                        {code}
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <span className="text-[14px] font-semibold text-[var(--jm-text)]">
                        미등록 손님
                      </span>
                      <span className="font-mono text-[11px] text-[var(--jm-text-muted)]">
                        #{code}
                      </span>
                    </div>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </header>

      {/* 메뉴 시트 */}
      <MenuSheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onSearch={() => setSearchOpen(true)}
        onRepairManagement={() => router.push("/pos/repairs")}
        onRentalManagement={() => router.push("/pos/rentals")}
        onParkedSessions={() => router.push("/pos/parked")}
      />
      <GlobalSearchSheet
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onProductSelect={(id) => {
          setSearchOpen(false);
          setMode("product");
          setDetail({ type: "product", id });
        }}
      />

      {/* 손님 액션 시트 — 썸네일 클릭 시 */}
      <CustomerActionSheet
        open={customerActionOpen}
        onOpenChange={setCustomerActionOpen}
        session={session}
        onLinkCustomer={() => setLinkOpen(true)}
        onCreateCustomer={() => setQuickRegister({ defaultText: "" })}
      />

      {/* 미등록 → 기존 고객 매핑 시트 */}
      <LinkCustomerSheet
        open={linkOpen}
        onOpenChange={setLinkOpen}
        onSelect={(c) => {
          void linkCustomerToSession(c.id, c.name, c.phone, {
            type: c.type,
            businessNumber: c.businessNumber ?? null,
          });
          setLinkOpen(false);
        }}
        onCreate={(query) => {
          setLinkOpen(false);
          setQuickRegister({ defaultText: query });
        }}
      />
      {/* 고객 빠른 등록 — 등록 후 현재 세션에 연결 */}
      <QuickCustomerSheet
        open={!!quickRegister}
        onOpenChange={(o) => !o && setQuickRegister(null)}
        defaultText={quickRegister?.defaultText ?? ""}
        onCreated={(c) => {
          void linkCustomerToSession(c.id, c.name, c.phone, {
            type: c.type,
            businessNumber: c.businessNumber ?? null,
          });
          setQuickRegister(null);
        }}
      />

      {/* 본문 — flex-1 + min-h-0 필수 (안 그러면 하단 탭바 가려짐) */}
      <main className="min-h-0 flex-1 overflow-hidden">
        {detail?.type === "repair-ticket" ? (
          <RepairDetail
            ticketId={detail.id}
            hideHeader
            onBack={() => setDetail(null)}
            onCustomerClick={() => setCustomerActionOpen(true)}
            onAddToCart={(ticket, finalAmount) => {
              if (finalAmount <= 0) {
                toast.error("청구할 금액이 없습니다");
                return;
              }
              add(
                {
                  itemType: "repair",
                  name: `수리 ${ticket.ticketNo}`,
                  imageUrl: null,
                  unitPrice: finalAmount,
                  taxType: "TAXABLE",
                  repairMeta: {
                    repairTicketId: ticket.id,
                    deviceModel:
                      ticket.serialItem?.product?.name ??
                      ticket.serialItem?.displayName ??
                      ticket.repairProduct?.name ??
                      ticket.repairProductText ??
                      undefined,
                    issueDescription: ticket.symptom ?? undefined,
                  },
                },
                { sessionId: session.id },
              );
              toast.success(`카트에 추가됨 — ${ticket.ticketNo}`);
              setDetail(null);
              setMode("product"); // 상품 탭으로 전환 — 결제 흐름 유도
            }}
          />
        ) : detail?.type === "product" ? (
          <ProductDetailView productId={detail.id} />
        ) : mode === "product" ? (
          <ProductsMode
            session={session}
            onProductDetail={(id) => setDetail({ type: "product", id })}
            searchQuery={productSearch}
            onOpenCart={() => setCartOpen(true)}
            onOpenPayment={() => setPaymentOpen(true)}
          />
        ) : mode === "repair" ? (
          <RepairMode
            session={session}
            onTicketDetail={(id) => setDetail({ type: "repair-ticket", id })}
          />
        ) : (
          <RentalMode
            session={session}
            onCustomerClick={() => setCustomerActionOpen(true)}
          />
        )}
      </main>

      {/* 라벨 인쇄 모달 — 결제 직후 자동 표시 또는 카트의 시리얼출력 */}
      {labelCodes && labelCodes.length > 0 && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => {
              setLabelCodes(null);
              if (labelRedirectAfter) {
                setLabelRedirectAfter(false);
                router.push("/pos");
              }
            }}
            className="m-4 self-end rounded-full bg-[var(--jm-surface)] px-4 py-2 text-[13px] font-semibold text-[var(--jm-text)] shadow"
          >
            닫기
          </button>
          <iframe
            src={`/serial-items/print?codes=${labelCodes.join(",")}`}
            className="mx-auto mb-4 size-full max-h-[88vh] max-w-3xl rounded-2xl bg-[var(--jm-surface)] shadow-2xl"
            title="라벨 미리보기"
          />
        </div>
      )}

      {/* 카트 / 결제 시트 — 모드 무관 페이지 레벨에서 mount.
          수리·임대 모드에서도 BottomTabBar 의 장바구니 버튼 또는
          외부 진입(?openCart=1)으로 열 수 있게 하기 위함. */}
      <CartSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        session={session}
        onCheckout={() => setPaymentOpen(true)}
        onPrintLabels={(codes, options) => {
          setLabelCodes(codes);
          setLabelRedirectAfter(!!options?.afterPayment);
        }}
      />
      <PaymentSheet
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        session={session}
        onPrintLabels={(codes, options) => {
          setLabelCodes(codes);
          setLabelRedirectAfter(!!options?.afterPayment);
        }}
        onCustomerClick={() => setCustomerActionOpen(true)}
        onBack={() => {
          setPaymentOpen(false);
          setCartOpen(true);
        }}
      />

      {/* 하단 탭 바 — 좌측 ☰메뉴 + 우측 🛒장바구니 항상 노출 */}
      <BottomTabBar<Mode>
        active={mode}
        onChange={switchMode}
        prefixAction={{
          label: "메뉴",
          icon: <Menu className="size-5" />,
          onClick: () => setMenuOpen(true),
        }}
        suffixAction={{
          label: "장바구니",
          icon: <ShoppingCart className="size-5" />,
          badge: session.items.length,
          onClick: () => {
            // 카트는 모드 무관 페이지 레벨 모달 — 모드 전환 없이 바로 오픈.
            // detail 만 닫아 카트가 detail 위에 가려지지 않게.
            setDetail(null);
            setCartOpen(true);
          },
        }}
        tabs={[
          {
            value: "product",
            label: "상품",
            icon: <Package className="size-5" />,
            badge: session.items.filter((i) => i.itemType === "product").length,
          },
          {
            value: "repair",
            label: "수리",
            icon: <Wrench className="size-5" />,
            badge: session.openRepairCount ?? 0,
          },
          {
            value: "rental",
            label: "임대",
            icon: <CalendarClock className="size-5" />,
            badge: session.items.filter((i) => i.itemType === "rental").length,
          },
        ]}
      />
    </div>
  );
}

// ─── 헤더 안에 표시하는 detail 정보 ─────────────────────────────────────────
// 같은 queryKey 로 RepairDetail / ProductDetailView 가 사용 중이라 cache 공유 (추가 fetch 없음)

function RepairTicketHeader({ ticketId }: { ticketId: string }) {
  const q = useQuery({
    queryKey: ["repairs", "detail", ticketId],
    queryFn: () => apiGet<RepairTicketDetail>(`/api/repair-tickets/${ticketId}`),
  });
  if (!q.data) {
    return (
      <div className="flex flex-col gap-1">
        <div className="h-3 w-20 animate-pulse rounded bg-[var(--jm-border)]" />
        <div className="h-3 w-24 animate-pulse rounded bg-[var(--jm-border)]" />
      </div>
    );
  }
  const t = q.data;
  const meta = STATUS_META[t.status];
  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-center gap-1.5">
        <span className={`size-2 rounded-full ${meta.dot}`} />
        <span className="text-[12px] font-semibold text-[var(--jm-text)]">
          {meta.label}
        </span>
        {t.type === "ON_SITE" && (
          <span className="rounded bg-[var(--jm-action)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            즉시
          </span>
        )}
      </div>
      <span className="font-mono text-[13px] text-[var(--jm-text-muted)]">{t.ticketNo}</span>
    </div>
  );
}

function ProductHeader({ productId }: { productId: string }) {
  const q = useQuery({
    queryKey: queryKeys.products.landing(productId),
    queryFn: () => apiGet<LandingResponse>(`/api/products/${productId}/landing`),
  });
  if (!q.data) {
    return (
      <div className="flex flex-col gap-1">
        <div className="h-4 w-32 animate-pulse rounded bg-[var(--jm-border)]" />
        <div className="h-3 w-20 animate-pulse rounded bg-[var(--jm-border)]" />
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-col">
      <span className="line-clamp-1 text-[14px] font-semibold text-[var(--jm-text)]">
        {q.data.name}
      </span>
      {q.data.sku && (
        <span className="font-mono text-[11px] text-[var(--jm-text-muted)]">{q.data.sku}</span>
      )}
    </div>
  );
}

// ─── Customer Page Skeleton ─────────────────────────────────────────────────
// 헤더 + 본문 + BottomTabBar 골격을 그대로 보여줘 layout shift 최소화.
function CustomerPageSkeleton() {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--jm-bg)]">
      {/* 헤더 골격 */}
      <header className="shrink-0 border-b border-[var(--jm-border)] bg-[var(--jm-surface)]">
        <div className="flex items-center gap-3 px-3 py-2.5 sm:px-6">
          <div className="size-10 shrink-0 rounded-full bg-[var(--jm-surface-muted)]" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="h-3.5 w-20 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
            <div className="h-3 w-32 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="size-10 shrink-0 animate-pulse rounded-full bg-[var(--jm-surface-muted)]" />
            <div className="flex flex-col gap-1">
              <div className="h-3.5 w-20 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
              <div className="h-3 w-16 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
            </div>
          </div>
        </div>
      </header>
      {/* 본문 — 상품 그리드 톤 */}
      <main className="min-h-0 flex-1 overflow-hidden">
        <div className="px-3 py-3 sm:px-4 sm:py-4">
          <div className="mb-3 h-11 w-full animate-pulse rounded-xl bg-[var(--jm-surface-muted)]" />
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-2xl bg-[var(--jm-surface)] ring-1 ring-[var(--jm-border)]"
              >
                <div className="aspect-square w-full animate-pulse bg-[var(--jm-surface-muted)]" />
                <div className="space-y-1.5 p-2.5">
                  <div className="h-3.5 w-full animate-pulse rounded bg-[var(--jm-surface-muted)]" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
                  <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
      {/* BottomTabBar 골격 — 4개 셀 (메뉴 + 상품/수리/임대) */}
      <nav className="shrink-0 border-t border-[var(--jm-border)] bg-[var(--jm-surface)]">
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            paddingBottom: "max(env(safe-area-inset-bottom), 6px)",
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-1.5 pb-2 pt-3"
            >
              <div className="size-5 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
              <div className="h-2.5 w-8 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
}
