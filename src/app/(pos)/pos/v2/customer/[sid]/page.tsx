"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Wrench, CalendarClock } from "lucide-react";
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

type Mode = "product" | "repair" | "rental";

/**
 * POS v2 손님 작업 페이지 — 골격 (Phase 1).
 * Phase 2 에서 상품 모드 풀 구현, Phase 3 에서 임대/수리/결제 통합.
 */
export default function PosV2CustomerPage({
  params,
}: {
  params: Promise<{ sid: string }>;
}) {
  const { sid } = use(params);
  const router = useRouter();
  const { getSession, hydrated, setCustomer } = useSessions();
  const [mode, setMode] = useState<Mode>("product");
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [quickRegister, setQuickRegister] = useState<{ defaultText: string } | null>(null);
  const [labelCodes, setLabelCodes] = useState<string[] | null>(null);

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-50">
        <div className="size-8 animate-pulse rounded-full bg-zinc-200" />
      </div>
    );
  }

  const session = getSession(sid);
  if (!session) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-50 p-6 text-center">
        <span className="text-[15px] font-semibold text-zinc-900">
          손님 세션을 찾을 수 없습니다
        </span>
        <button
          type="button"
          onClick={() => router.push("/pos/v2")}
          className="h-10 rounded-full bg-zinc-900 px-5 text-[13px] font-semibold text-white"
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
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-zinc-50">
      {/* 상단 — 뒤로 + 손님 정보 */}
      <header className="shrink-0 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 py-2.5 sm:px-6">
          <button
            type="button"
            onClick={() => router.push("/pos/v2")}
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-100 active:bg-zinc-200"
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

          {isRegistered ? (
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[15px] font-bold text-zinc-700">
                {(session.customerName ?? "?").charAt(0)}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="line-clamp-1 text-[15px] font-semibold text-zinc-900">
                  {session.customerName}
                </span>
                {session.customerPhone && (
                  <span className="font-mono text-[12px] text-zinc-500">
                    {session.customerPhone}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div
                className={`flex size-10 shrink-0 items-center justify-center rounded-full text-white ${palette.bg}`}
              >
                <span className="font-mono text-[12px] font-bold tracking-wider">
                  {code}
                </span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px] font-semibold text-zinc-900">
                  미등록 손님
                </span>
                <span className="font-mono text-[12px] text-zinc-500">
                  #{code}
                </span>
              </div>
              {/* 미등록 → 등록/매핑 버튼 — 어디서든 노출 */}
              <button
                type="button"
                onClick={() => setLinkOpen(true)}
                className="shrink-0 rounded-full bg-zinc-900 px-3 py-1.5 text-[12px] font-semibold text-white"
              >
                고객 연결
              </button>
            </div>
          )}

          {/* 우측 햄버거 */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-100 active:bg-zinc-200"
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
        </div>
      </header>

      {/* 메뉴 시트 */}
      <MenuSheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onSearch={() => setSearchOpen(true)}
      />
      <GlobalSearchSheet open={searchOpen} onOpenChange={setSearchOpen} />

      {/* 미등록 → 기존 고객 매핑 시트 */}
      <LinkCustomerSheet
        open={linkOpen}
        onOpenChange={setLinkOpen}
        onSelect={(c) => {
          setCustomer(c.id, c.name, c.phone, sid);
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
          setCustomer(c.id, c.name, c.phone, sid);
          setQuickRegister(null);
        }}
      />

      {/* 본문 — flex-1 + min-h-0 필수 (안 그러면 하단 탭바 가려짐) */}
      <main className="min-h-0 flex-1 overflow-hidden">
        {mode === "product" && (
          <ProductsMode
            session={session}
            onPrintLabels={(codes) => setLabelCodes(codes)}
          />
        )}
        {mode === "repair" && <RepairMode session={session} />}
        {mode === "rental" && <RentalMode session={session} />}
      </main>

      {/* 라벨 인쇄 모달 — 결제 직후 자동 표시 */}
      {labelCodes && labelCodes.length > 0 && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => {
              setLabelCodes(null);
              router.push("/pos/v2");
            }}
            className="m-4 self-end rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-zinc-900 shadow"
          >
            닫기
          </button>
          <iframe
            src={`/serial-items/print?codes=${labelCodes.join(",")}`}
            className="mx-auto mb-4 size-full max-h-[88vh] max-w-3xl rounded-2xl bg-white shadow-2xl"
            title="라벨 미리보기"
          />
        </div>
      )}

      {/* 하단 탭 바 */}
      <BottomTabBar<Mode>
        active={mode}
        onChange={setMode}
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

