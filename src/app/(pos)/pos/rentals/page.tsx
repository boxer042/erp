"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Menu } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import { fmtKRW } from "../repairs/_helpers";
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
  imageUrl: string | null;
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
    imageUrl: string | null;
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
type RentalFilterKey = "all" | "active" | "reserved" | "available";

export default function RentalManagementPage() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // 상단 칩 필터 — "all" 이면 전체 노출, 특정 키 시 그 섹션만
  const [filter, setFilter] = useState<RentalFilterKey>("all");
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

  // 자산별 점유 — AssetCard 하단에 표시. ACTIVE/OVERDUE/RESERVED 모두 합산해서
  // 액션시트의 "이미 예약됨" 표시와 일치시킴 (자산이 임대 가능 상태여도 미래 예약/현재 임대가 잡혀있을 수 있음).
  const occupancyByAssetId = useMemo(() => {
    const map = new Map<string, RentalRow[]>();
    const all = [
      ...(activeQuery.data ?? []),
      ...(overdueQuery.data ?? []),
      ...(reservedQuery.data ?? []),
    ];
    for (const r of all) {
      const arr = map.get(r.asset.id) ?? [];
      arr.push(r);
      map.set(r.asset.id, arr);
    }
    // 시작일 오름차순 — 가장 가까운 일정이 먼저
    for (const arr of map.values()) {
      arr.sort(
        (a, b) =>
          new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
      );
    }
    return map;
  }, [activeQuery.data, overdueQuery.data, reservedQuery.data]);

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

      {/* 상태 칩 — 가로 스크롤. 활성 칩 섹션만 본문에 노출. */}
      <div className="shrink-0 border-b border-[var(--jm-border)] bg-[var(--jm-surface)]">
        <div className="flex gap-1.5 overflow-x-auto px-3 py-2 sm:px-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <FilterChipButton
            label="전체"
            count={
              activeRentals.length + todayReserved.length + assets.length
            }
            dot="muted"
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          <FilterChipButton
            label="현재 임대"
            count={activeRentals.length}
            dot="rose"
            active={filter === "active"}
            onClick={() => setFilter("active")}
          />
          <FilterChipButton
            label="오늘 픽업 예약"
            count={todayReserved.length}
            dot="amber"
            active={filter === "reserved"}
            onClick={() => setFilter("reserved")}
          />
          <FilterChipButton
            label="임대 가능"
            count={assets.length}
            dot="emerald"
            active={filter === "available"}
            onClick={() => setFilter("available")}
          />
        </div>
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-5 px-4 py-4 sm:px-6">
          {(filter === "all" || filter === "active") && (
            <section className="flex flex-col gap-2">
              {filter === "all" && (
                <SectionHeader
                  label="현재 임대 나감"
                  count={activeRentals.length}
                  dot="rose"
                />
              )}
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
          )}

          {(filter === "all" || filter === "reserved") && (
            <section className="flex flex-col gap-2">
              {filter === "all" && (
                <SectionHeader
                  label="오늘 픽업 예약"
                  count={todayReserved.length}
                  dot="amber"
                />
              )}
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
          )}

          {(filter === "all" || filter === "available") && (
            <section className="flex flex-col gap-2">
              {filter === "all" && (
                <SectionHeader
                  label="임대 가능"
                  count={assets.length}
                  dot="emerald"
                />
              )}
              {assetsQuery.isPending ? (
                <RowsSkeleton />
              ) : assets.length === 0 ? (
                <EmptyHint text="가용 자산이 없습니다" />
              ) : (
                <div className="flex flex-col gap-2">
                  {assets.map((a) => (
                    <AssetCard
                      key={a.id}
                      asset={a}
                      reservations={occupancyByAssetId.get(a.id) ?? []}
                      onClick={() =>
                        setSelectedAsset({ asset: a, availability: "available" })
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          )}
          <div className="h-12" />
        </div>
      </main>

      {/* 메뉴 시트 — 자기 자신 페이지(임대관리)는 미전달로 숨김 */}
      <MenuSheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onSearch={() => setSearchOpen(true)}
        onRepairManagement={() => router.push("/pos/repairs")}
        onParkedSessions={() => router.push("/pos/parked")}
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
      ? "bg-[var(--jm-danger-solid)]"
      : dot === "amber"
        ? "bg-[var(--jm-warning-solid)]"
        : dot === "emerald"
          ? "bg-[var(--jm-success-solid)]"
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
    <div className="rounded-2xl bg-[var(--jm-surface)] px-4 py-5 text-center text-[13px] text-[var(--jm-text-subtle)] border border-[var(--jm-border)]">
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
          className="flex items-center gap-3 rounded-2xl bg-[var(--jm-surface)] p-3 border border-[var(--jm-border)]"
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
          className="flex flex-col gap-2 rounded-2xl bg-[var(--jm-surface)] p-3 border border-[var(--jm-border)]"
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
      <AssetThumb
        asset={{ name: rental.asset.name, imageUrl: rental.asset.imageUrl }}
      />
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
    imageUrl: r.asset.imageUrl,
  };
}

function AssetCard({
  asset,
  reservations,
  onClick,
}: {
  asset: RentalAsset;
  reservations: RentalRow[];
  onClick: () => void;
}) {
  const dailyRate = parseFloat(asset.dailyRate) || 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-stretch gap-3 rounded-2xl bg-[var(--jm-surface)] p-3 text-left border border-[var(--jm-border)] transition-all active:scale-[0.99] sm:hover:ring-[var(--jm-border-strong)] sm:hover:shadow-sm"
    >
      <AssetThumb asset={asset} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col">
            <span className="line-clamp-1 text-[14px] font-semibold leading-tight text-[var(--jm-text)]">
              {asset.name}
            </span>
            <span className="font-mono text-[10px] text-[var(--jm-text-subtle)]">
              {asset.assetNo}
            </span>
          </div>
          <span className="shrink-0 text-[14px] font-bold tabular-nums text-[var(--jm-text)]">
            {fmtKRW(dailyRate)}
            <span className="ml-0.5 text-[10px] font-normal text-[var(--jm-text-muted)]">
              /일
            </span>
          </span>
        </div>
        {reservations.length > 0 ? (
          <div className="mt-0.5 flex flex-col gap-0.5">
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--jm-warning-fg)]">
              <span className="size-1.5 rounded-full bg-[var(--jm-warning-solid)]" />
              예약·임대 {reservations.length}건
            </span>
            {reservations.map((r) => (
              <span
                key={r.id}
                className="line-clamp-1 text-[11px] text-[var(--jm-text-muted)]"
              >
                <span
                  className={`mr-1 font-semibold ${
                    r.status === "OVERDUE"
                      ? "text-[var(--jm-danger-fg)]"
                      : r.status === "ACTIVE"
                        ? "text-[var(--jm-info-fg)]"
                        : "text-[var(--jm-warning-fg)]"
                  }`}
                >
                  {r.status === "OVERDUE"
                    ? "연체"
                    : r.status === "ACTIVE"
                      ? "임대중"
                      : "예약"}
                </span>
                {format(new Date(r.startDate), "M/d")}~
                {format(new Date(r.endDate), "M/d")} · {r.customer.name}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-[11px] text-[var(--jm-text-subtle)]">
            예약 없음 — 즉시 임대 가능
          </span>
        )}
      </div>
    </button>
  );
}

/**
 * 자산 썸네일 — product.imageUrl 있으면 이미지, 없으면 자산명 첫 글자.
 */
function AssetThumb({ asset }: { asset: { name: string; imageUrl: string | null } }) {
  if (asset.imageUrl) {
    return (
      <img
        src={asset.imageUrl}
        alt={asset.name}
        className="size-14 shrink-0 rounded-xl object-cover border border-[var(--jm-border)]"
      />
    );
  }
  return (
    <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-[var(--jm-surface-muted)] text-[16px] font-bold text-[var(--jm-text)] border border-[var(--jm-border)]">
      {asset.name.charAt(0)}
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
  dot: "rose" | "amber" | "emerald" | "muted";
  active: boolean;
  onClick: () => void;
}) {
  const dotColor =
    dot === "rose"
      ? "bg-[var(--jm-danger-solid)]"
      : dot === "amber"
        ? "bg-[var(--jm-warning-solid)]"
        : dot === "emerald"
          ? "bg-[var(--jm-success-solid)]"
          : "bg-[var(--jm-text-muted)]";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-colors ${
        active
          ? "bg-[var(--jm-action)] text-white"
          : "bg-[var(--jm-surface)] text-[var(--jm-text-muted)] border border-[var(--jm-border)] hover:bg-[var(--jm-bg)]"
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
