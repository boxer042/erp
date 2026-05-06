"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Menu } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import { fmtKRW } from "../repair-v2/_helpers";
import { MenuSheet } from "../_components/menu-sheet";
import { GlobalSearchSheet } from "../_global-search-sheet";
import { RentalAssetActionSheet } from "./_asset-action-sheet";

interface RentalAsset {
  id: string;
  assetNo: string;
  name: string;
  brand: string | null;
  dailyRate: string;
  monthlyRate: string;
  depositAmount: string | null;
  status: string;
}

interface RentalRow {
  id: string;
  rentalNo: string;
  status: "RESERVED" | "ACTIVE" | "OVERDUE" | "RETURNED" | "CANCELLED";
  startDate: string;
  endDate: string;
  asset: {
    id: string;
    assetNo: string;
    name: string;
    dailyRate: string;
    depositAmount: string | null;
  };
  customer: { id: string; name: string; phone: string | null };
}

/**
 * 임대관리 페이지 — 메뉴 → 임대관리 진입.
 * 매장 전체 자산/임대 현황 단일 화면.
 *
 * 섹션:
 *   1. 현재 임대 나감 (ACTIVE + OVERDUE)
 *   2. 오늘 픽업 예약 (RESERVED with startDate=today)
 *   3. 임대 가능 (RentalAsset.status=AVAILABLE) — 클릭 시 액션 드로우
 *
 * 액션 드로우(자산 클릭 시) — 오늘 임대 시작 / 임대 예약 / 관리.
 * 관리 메뉴는 후속작업: 자산 점검·정비 이력 (수리 티켓 연동).
 */
export default function RentalManagementPage() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  /**
   * 자산 액션 드로우 트리거.
   * - availability="available": 임대 가능 섹션에서 클릭 → 3개 액션 모두 노출
   * - availability="in-use": 현재 임대중/오늘 예약 행에서 클릭 → 오늘임대시작 비활성, 예약 시작일 > today 강제
   */
  const [selectedAsset, setSelectedAsset] = useState<{
    asset: RentalAsset;
    availability: "available" | "in-use";
  } | null>(null);

  const assetsQuery = useQuery<RentalAsset[]>({
    queryKey: ["pos-v2", "rental-assets"],
    queryFn: () => apiGet<RentalAsset[]>("/api/rental-assets?status=AVAILABLE"),
    staleTime: 1000 * 30,
  });
  const activeQuery = useQuery<RentalRow[]>({
    queryKey: ["pos-v2", "rentals", "ACTIVE"],
    queryFn: () => apiGet<RentalRow[]>("/api/rentals?status=ACTIVE"),
    staleTime: 1000 * 30,
  });
  const overdueQuery = useQuery<RentalRow[]>({
    queryKey: ["pos-v2", "rentals", "OVERDUE"],
    queryFn: () => apiGet<RentalRow[]>("/api/rentals?status=OVERDUE"),
    staleTime: 1000 * 30,
  });
  const reservedQuery = useQuery<RentalRow[]>({
    queryKey: ["pos-v2", "rentals", "RESERVED"],
    queryFn: () => apiGet<RentalRow[]>("/api/rentals?status=RESERVED"),
    staleTime: 1000 * 30,
  });

  const assets = assetsQuery.data ?? [];
  const activeRentals = useMemo(
    () => [...(activeQuery.data ?? []), ...(overdueQuery.data ?? [])],
    [activeQuery.data, overdueQuery.data],
  );
  const todayReserved = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    return (reservedQuery.data ?? []).filter(
      (r) => format(new Date(r.startDate), "yyyy-MM-dd") === today,
    );
  }, [reservedQuery.data]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--jm-bg)]">
      {/* 헤더 — 좌: 뒤로 / 가운데: 타이틀 / 우: 메뉴 */}
      <header className="shrink-0 border-b border-[var(--jm-border)] bg-[var(--jm-surface)]">
        <div className="flex items-center gap-3 px-3 py-2.5 sm:px-6">
          <button
            type="button"
            onClick={() => router.back()}
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
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-[14px] font-semibold text-[var(--jm-text)]">
              임대관리
            </span>
            <span className="text-[11px] text-[var(--jm-text-muted)]">
              매장 자산·임대 현황
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

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-5 px-4 py-4 sm:px-6">
          {/* 1. 현재 임대 나감 */}
          <section className="flex flex-col gap-2">
            <SectionHeader
              label="현재 임대 나감"
              count={activeRentals.length}
              dot="rose"
            />
            {activeQuery.isPending || overdueQuery.isPending ? (
              <RowsSkeleton />
            ) : activeRentals.length === 0 ? (
              <EmptyHint text="현재 나간 임대가 없습니다" />
            ) : (
              <div className="flex flex-col gap-2">
                {activeRentals.map((r) => (
                  <RentalRowCard
                    key={r.id}
                    rental={r}
                    variant="active"
                    onClick={() =>
                      setSelectedAsset({
                        asset: rentalAssetFromRow(r),
                        availability: "in-use",
                      })
                    }
                  />
                ))}
              </div>
            )}
          </section>

          {/* 2. 오늘 픽업 예약 */}
          <section className="flex flex-col gap-2">
            <SectionHeader
              label="오늘 픽업 예약"
              count={todayReserved.length}
              dot="amber"
            />
            {reservedQuery.isPending ? (
              <RowsSkeleton />
            ) : todayReserved.length === 0 ? (
              <EmptyHint text="오늘 픽업 예약이 없습니다" />
            ) : (
              <div className="flex flex-col gap-2">
                {todayReserved.map((r) => (
                  <RentalRowCard
                    key={r.id}
                    rental={r}
                    variant="reserved"
                    onClick={() =>
                      setSelectedAsset({
                        asset: rentalAssetFromRow(r),
                        availability: "in-use",
                      })
                    }
                  />
                ))}
              </div>
            )}
          </section>

          {/* 3. 임대 가능 — 클릭 시 액션 드로우 */}
          <section className="flex flex-col gap-2">
            <SectionHeader
              label="임대 가능"
              count={assets.length}
              dot="emerald"
            />
            {assetsQuery.isPending ? (
              <GridSkeleton />
            ) : assets.length === 0 ? (
              <EmptyHint text="가용 자산이 없습니다" />
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {assets.map((a) => (
                  <AssetCard
                    key={a.id}
                    asset={a}
                    onClick={() =>
                      setSelectedAsset({ asset: a, availability: "available" })
                    }
                  />
                ))}
              </div>
            )}
          </section>
          <div className="h-12" />
        </div>
      </main>

      {/* 메뉴 시트 — 다른 진입점도 노출 (다른 임대페이지로 재진입 방지하려면 onRentalManagement 미전달) */}
      <MenuSheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onSearch={() => setSearchOpen(true)}
      />
      <GlobalSearchSheet open={searchOpen} onOpenChange={setSearchOpen} />

      {/* 자산 클릭 → 액션 드로우 */}
      <RentalAssetActionSheet
        asset={selectedAsset?.asset ?? null}
        availability={selectedAsset?.availability ?? "available"}
        onClose={() => setSelectedAsset(null)}
      />
    </div>
  );
}

// ─── 섹션 헬퍼 ──────────────────────────────────────────────────────────
function SectionHeader({
  label,
  count,
  dot,
}: {
  label: string;
  count: number;
  dot?: "rose" | "amber" | "emerald";
}) {
  const dotColor =
    dot === "rose"
      ? "bg-[var(--jm-danger-bg)]0"
      : dot === "amber"
        ? "bg-[var(--jm-warning-bg)]0"
        : dot === "emerald"
          ? "bg-[var(--jm-success-bg)]0"
          : "";
  return (
    <div className="flex items-center gap-2">
      {dot && <span className={`size-2 rounded-full ${dotColor}`} />}
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
        {label}
      </span>
      <span className="text-[11px] font-semibold tabular-nums text-[var(--jm-text)]">
        {count}
      </span>
    </div>
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
          <div className="h-9 w-9 animate-pulse rounded-full bg-[var(--jm-surface-muted)]" />
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

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-2 rounded-2xl bg-[var(--jm-surface)] p-3 ring-1 ring-[var(--jm-border)]"
        >
          <div className="h-3 w-16 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
          <div className="h-4 w-full animate-pulse rounded bg-[var(--jm-surface-muted)]" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
          <div className="mt-1 h-3.5 w-2/3 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
        </div>
      ))}
    </div>
  );
}

function RentalRowCard({
  rental,
  variant,
  onClick,
}: {
  rental: RentalRow;
  variant: "active" | "reserved";
  onClick?: () => void;
}) {
  const start = new Date(rental.startDate);
  const end = new Date(rental.endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isOverdue = rental.status === "OVERDUE";
  const daysLeft = Math.round((end.getTime() - today.getTime()) / 86400000);

  const subtitle =
    variant === "active"
      ? isOverdue
        ? `${format(end, "M/d")} 반납예정 · ${Math.abs(daysLeft)}일 연체`
        : `${format(start, "M/d")} ~ ${format(end, "M/d")} · ${daysLeft >= 0 ? `${daysLeft}일 남음` : "반납예정"}`
      : `${format(start, "M/d")} ~ ${format(end, "M/d")}`;

  const className = `flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left ring-1 transition-all ${
    isOverdue
      ? "bg-[var(--jm-danger-bg)] ring-[var(--jm-danger-bg)]"
      : variant === "reserved"
        ? "bg-[var(--jm-warning-bg)] ring-[var(--jm-warning-bg)]"
        : "bg-[var(--jm-surface)] ring-[var(--jm-border)]"
  } ${onClick ? "active:scale-[0.99] sm:hover:shadow-sm" : ""}`;

  const inner = (
    <>
      <div
        className={`flex size-10 shrink-0 items-center justify-center rounded-full text-[14px] font-bold ${
          isOverdue
            ? "bg-[var(--jm-danger-bg)] text-[var(--jm-danger-fg)]"
            : variant === "reserved"
              ? "bg-[var(--jm-warning-bg)] text-[var(--jm-warning-fg)]"
              : "bg-[var(--jm-surface-muted)] text-[var(--jm-text)]"
        }`}
      >
        {rental.customer.name.charAt(0)}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5">
          <span className="line-clamp-1 text-[14px] font-semibold text-[var(--jm-text)]">
            {rental.asset.name}
          </span>
          {isOverdue && (
            <span className="rounded bg-[var(--jm-danger-solid)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              연체
            </span>
          )}
        </div>
        <span className="line-clamp-1 text-[12px] text-[var(--jm-text-muted)]">
          {rental.customer.name}
          {rental.customer.phone && (
            <span className="ml-1.5 font-mono text-[var(--jm-text-subtle)]">
              {rental.customer.phone}
            </span>
          )}
        </span>
        <span className="text-[11px] text-[var(--jm-text-muted)]">{subtitle}</span>
      </div>
      <span className="font-mono text-[10px] text-[var(--jm-text-subtle)]">
        {rental.asset.assetNo}
      </span>
    </>
  );

  return onClick ? (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  ) : (
    <div className={className}>{inner}</div>
  );
}

/**
 * RentalRow → 액션 드로우용 RentalAsset 형태로 변환.
 * 가격 정보(dailyRate / depositAmount)는 API 의 asset.select 에 포함됨.
 */
function rentalAssetFromRow(r: RentalRow): RentalAsset {
  return {
    id: r.asset.id,
    assetNo: r.asset.assetNo,
    name: r.asset.name,
    brand: null,
    dailyRate: r.asset.dailyRate,
    monthlyRate: "0",
    depositAmount: r.asset.depositAmount,
    status: "RENTED",
  };
}

function AssetCard({
  asset,
  onClick,
}: {
  asset: RentalAsset;
  onClick: () => void;
}) {
  const dailyRate = parseFloat(asset.dailyRate) || 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-1.5 rounded-2xl bg-[var(--jm-surface)] p-3 text-left ring-1 ring-[var(--jm-border)] transition-all active:scale-[0.98] sm:hover:ring-[var(--jm-border-strong)] sm:hover:shadow-sm"
    >
      <span className="line-clamp-2 min-h-[2.4em] text-[13px] font-semibold leading-tight text-[var(--jm-text)]">
        {asset.name}
      </span>
      <span className="font-mono text-[10px] text-[var(--jm-text-subtle)]">
        {asset.assetNo}
      </span>
      <span className="mt-1 text-[14px] font-bold tabular-nums text-[var(--jm-text)]">
        {fmtKRW(dailyRate)}
        <span className="ml-0.5 text-[10px] font-normal text-[var(--jm-text-muted)]">/일</span>
      </span>
    </button>
  );
}
