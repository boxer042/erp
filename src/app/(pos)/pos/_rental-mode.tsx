"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";
import { apiGet } from "@/lib/api-client";
import {
  useSessions,
  type CartSession,
} from "@/components/pos/sessions-context";
import {
  deriveTempCode,
  deriveTempColor,
} from "@/components/pos/temp-customer";
import { BottomSheet } from "./_components/bottom-sheet";
import { fmtKRW } from "./repairs/_helpers";

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

interface Props {
  session: CartSession;
  /** 임대 시트의 고객 카드 클릭 → 부모의 CustomerActionSheet 열기 (헤더 썸네일과 동일 트리거) */
  onCustomerClick?: () => void;
}

/**
 * 임대 모드 v2 — 자산 그리드 + 자산 클릭 시 기간/보증금 시트 → 카트 추가.
 * 결제 흐름은 차후 PaymentSheet 가 rental 라인 처리하도록 확장 예정.
 */
export function RentalMode({ session, onCustomerClick }: Props) {
  const [selectedAsset, setSelectedAsset] = useState<RentalAsset | null>(null);

  const assetsQuery = useQuery<RentalAsset[]>({
    queryKey: ["pos-v2", "rental-assets"],
    queryFn: () => apiGet<RentalAsset[]>("/api/rental-assets?status=AVAILABLE"),
    staleTime: 1000 * 60,
  });

  const assets = assetsQuery.data ?? [];
  const rentalItems = session.items.filter((i) => i.itemType === "rental");

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 py-4 sm:px-6">
          {/* 카트에 담긴 임대 라인 — 이번 세션에서 추가한 것 */}
          {rentalItems.length > 0 && (
            <section className="mb-4 flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
                담긴 임대 {rentalItems.length}
              </span>
              <div className="flex flex-col gap-2">
                {rentalItems.map((it) => (
                  <div
                    key={it.cartItemId}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--jm-bg)] px-4 py-3"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="line-clamp-1 text-[14px] font-semibold text-[var(--jm-text)]">
                        {it.name}
                      </span>
                      {it.rentalMeta?.startDate && it.rentalMeta?.endDate && (
                        <span className="text-[11px] text-[var(--jm-text-muted)]">
                          {it.rentalMeta.startDate} ~ {it.rentalMeta.endDate}
                        </span>
                      )}
                    </div>
                    <span className="text-[14px] font-semibold tabular-nums text-[var(--jm-text)]">
                      {fmtKRW(it.unitPrice)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 가용 자산 그리드 — 매장 전체 대시보드는 메뉴 → 임대관리 로 분리됨.
              여기서는 이번 손님 세션 카트에 담을 자산만 노출. */}
          <section className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
              임대 가능 {assets.length}
            </span>
            {assetsQuery.isPending ? (
              <GridSkeleton />
            ) : assets.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <span className="text-[14px] text-[var(--jm-text-muted)]">가용 자산이 없습니다</span>
                <span className="text-[12px] text-[var(--jm-text-subtle)]">
                  다른 임대로 모두 나가있거나 등록된 자산이 없습니다
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {assets.map((a) => (
                  <AssetCard
                    key={a.id}
                    asset={a}
                    onClick={() => setSelectedAsset(a)}
                  />
                ))}
              </div>
            )}
          </section>
          <div className="h-12" />
        </div>
      </div>

      {/* 임대 시트 */}
      <RentalSheet
        open={!!selectedAsset}
        onOpenChange={(o) => !o && setSelectedAsset(null)}
        asset={selectedAsset}
        session={session}
        onAdded={() => setSelectedAsset(null)}
        onCustomerClick={
          onCustomerClick
            ? () => {
                setSelectedAsset(null);
                onCustomerClick();
              }
            : undefined
        }
      />
    </div>
  );
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
      className="flex flex-col gap-1.5 rounded-2xl bg-[var(--jm-surface)] p-3 text-left border border-[var(--jm-border)] transition-all active:scale-[0.98] sm:hover:ring-[var(--jm-border-strong)] sm:hover:shadow-sm"
    >
      <span className="line-clamp-2 min-h-[2.4em] text-[13px] font-semibold leading-tight text-[var(--jm-text)]">
        {asset.name}
      </span>
      <span className="font-mono text-[10px] text-[var(--jm-text-subtle)]">{asset.assetNo}</span>
      <span className="mt-1 text-[14px] font-bold tabular-nums text-[var(--jm-text)]">
        {fmtKRW(dailyRate)}
        <span className="ml-0.5 text-[10px] font-normal text-[var(--jm-text-muted)]">/일</span>
      </span>
    </button>
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

function todayIso() {
  return format(new Date(), "yyyy-MM-dd");
}

function RentalSheet({
  open,
  onOpenChange,
  asset,
  session,
  onAdded,
  onCustomerClick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  asset: RentalAsset | null;
  session: CartSession;
  onAdded: () => void;
  onCustomerClick?: () => void;
}) {
  if (!open || !asset) return null;
  return (
    <RentalSheetBody
      onOpenChange={onOpenChange}
      asset={asset}
      session={session}
      onAdded={onAdded}
      onCustomerClick={onCustomerClick}
    />
  );
}

function RentalSheetBody({
  onOpenChange,
  asset,
  session,
  onAdded,
  onCustomerClick,
}: {
  onOpenChange: (v: boolean) => void;
  asset: RentalAsset;
  session: CartSession;
  onAdded: () => void;
  onCustomerClick?: () => void;
}) {
  const { add } = useSessions();
  const canAdd = !!session.customerId;
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  // 시트가 열린 시각 = 픽업/접수 시각. 시트가 unmount → 다시 mount 되면 새로 캡처됨.
  const [checkoutAt] = useState(() => new Date());

  const days = useMemo(() => {
    const diff = Math.round(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000,
    );
    return Math.max(1, diff);
  }, [startDate, endDate]);

  const dailyRate = parseFloat(asset.dailyRate) || 0;
  const total = dailyRate * days;
  const deposit = asset.depositAmount ? parseFloat(asset.depositAmount) : 0;

  const handleAdd = () => {
    if (!canAdd) return;
    if (new Date(endDate) < new Date(startDate)) {
      toast.error("종료일이 시작일보다 빠를 수 없습니다");
      return;
    }
    add(
      {
        itemType: "rental",
        name: asset.name,
        sku: asset.assetNo,
        imageUrl: null,
        unitPrice: total,
        taxType: "TAXABLE",
        rentalMeta: {
          assetId: asset.id,
          dailyRate,
          depositAmount: deposit > 0 ? deposit : undefined,
          startDate,
          endDate,
          checkoutAt: checkoutAt.toISOString(),
        },
      },
      { sessionId: session.id },
    );
    toast.success(`${asset.name} 임대 추가`);
    onAdded();
  };

  return (
    <BottomSheet
      open
      onOpenChange={onOpenChange}
      title={asset.name}
      footer={
        <button
          type="button"
          onClick={handleAdd}
          disabled={!canAdd}
          className="flex h-14 w-full items-center justify-between rounded-2xl bg-[var(--jm-action)] px-5 text-[16px] font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-50"
        >
          <span>{days}일 카트 추가</span>
          <span className="tabular-nums">{fmtKRW(total)}</span>
        </button>
      }
    >
      <div className="flex flex-col gap-5 pt-2">
        {/* 고객 + 접수시간 — 2-grid. 고객 카드는 글로벌 헤더 썸네일과 동일 스타일 + 동일 시트 트리거 */}
        <div className="grid grid-cols-2 gap-2.5">
          <CustomerCard session={session} onClick={onCustomerClick} required />
          <CheckoutAtCard at={checkoutAt} />
        </div>

        {/* 기간 */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
            기간
          </span>
          <div className="grid grid-cols-2 gap-2">
            <DateField
              label="시작"
              value={startDate}
              onChange={setStartDate}
            />
            <DateField label="종료" value={endDate} onChange={setEndDate} />
          </div>
          <span className="text-[11px] text-[var(--jm-text-subtle)]">{days}일 임대</span>
        </div>

        {/* 가격 요약 */}
        <div className="flex flex-col gap-2 rounded-2xl bg-[var(--jm-bg)] p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] text-[var(--jm-text-muted)]">일일가</span>
            <span className="text-[14px] font-semibold tabular-nums text-[var(--jm-text)]">
              {fmtKRW(dailyRate)}
              <span className="ml-1 text-[11px] font-normal text-[var(--jm-text-muted)]">×{days}</span>
            </span>
          </div>
          {deposit > 0 && (
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-[var(--jm-text-muted)]">보증금</span>
              <span className="text-[14px] font-semibold tabular-nums text-[var(--jm-text)]">
                {fmtKRW(deposit)}
                <span className="ml-1 text-[11px] font-normal text-[var(--jm-text-muted)]">반환</span>
              </span>
            </div>
          )}
          <div className="my-1 h-px bg-[var(--jm-border)]" />
          <div className="flex items-baseline justify-between">
            <span className="text-[14px] font-semibold text-[var(--jm-text)]">임대료</span>
            <span className="text-[18px] font-bold tabular-nums text-[var(--jm-text)]">
              {fmtKRW(total)}
            </span>
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}

/**
 * 고객 카드 — 글로벌 헤더 우측 손님 썸네일과 동일한 시각 패턴 (등록=zinc 원+이니셜, 미등록=palette+temp code).
 * 클릭 시 헤더 썸네일과 동일한 CustomerActionSheet 가 열림.
 * required=true 면 미등록일 때 "연결 필요" 보조 문구 노출.
 */
function CustomerCard({
  session,
  onClick,
  required,
}: {
  session: CartSession;
  onClick?: () => void;
  required?: boolean;
}) {
  const isRegistered = !!session.customerId;
  const code = deriveTempCode(session.id);
  const palette = deriveTempColor(session.id);

  const inner = (
    <>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
        고객
      </span>
      <div className="flex min-w-0 items-center gap-2.5">
        {isRegistered ? (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--jm-surface-muted)] text-[15px] font-bold text-[var(--jm-text)]">
            {(session.customerName ?? "?").charAt(0)}
          </div>
        ) : (
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-full text-white ${palette.bg}`}
          >
            <span className="font-mono text-[12px] font-bold tracking-wider">
              {code}
            </span>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          {isRegistered ? (
            <>
              <span className="line-clamp-1 text-[14px] font-semibold text-[var(--jm-text)]">
                {session.customerName}
              </span>
              {session.customerPhone && (
                <span className="line-clamp-1 font-mono text-[11px] text-[var(--jm-text-muted)]">
                  {session.customerPhone}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="line-clamp-1 text-[14px] font-semibold text-[var(--jm-text)]">
                미등록 손님
              </span>
              <span className="font-mono text-[11px] text-[var(--jm-text-muted)]">#{code}</span>
              {required && (
                <span className="line-clamp-1 text-[11px] text-[var(--jm-warning-fg)]">
                  연결 필요
                </span>
              )}
            </>
          )}
        </div>
        {onClick && (
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className="shrink-0 text-[var(--jm-text-disabled)]"
            aria-hidden
          >
            <path
              d="M5 3l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    </>
  );

  if (!onClick) {
    return (
      <div className="flex flex-col gap-1.5 rounded-2xl bg-[var(--jm-bg)] px-4 py-3">
        {inner}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-1.5 rounded-2xl bg-[var(--jm-bg)] px-4 py-3 text-left transition-colors active:bg-[var(--jm-surface-muted)] sm:hover:bg-[var(--jm-surface-muted)]"
    >
      {inner}
    </button>
  );
}

/**
 * 접수시간 카드 — 임대 시트가 열린 순간의 시각 (= 픽업 시각).
 * 시간대별 임대 트래픽 분석을 위해 그대로 Rental.checkoutAt 으로 저장됨.
 */
function CheckoutAtCard({ at }: { at: Date }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl bg-[var(--jm-bg)] px-4 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
        접수시간
      </span>
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)]">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
            <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M10 6v4l2.5 2"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[14px] font-semibold tabular-nums text-[var(--jm-text)]">
            {format(at, "HH:mm")}
          </span>
          <span className="font-mono text-[11px] text-[var(--jm-text-muted)]">
            {format(at, "M월 d일 (eee)", { locale: ko })}
          </span>
        </div>
      </div>
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--jm-text-subtle)]">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 rounded-xl border border-[var(--jm-border)] bg-[var(--jm-bg)] px-3 text-[14px] tabular-nums outline-none focus:border-[var(--jm-border-strong)] focus:bg-[var(--jm-surface)]"
      />
    </label>
  );
}
