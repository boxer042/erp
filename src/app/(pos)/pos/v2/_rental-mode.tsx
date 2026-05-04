"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { apiGet } from "@/lib/api-client";
import {
  useSessions,
  type CartSession,
} from "@/components/pos/sessions-context";
import { BottomSheet } from "./_components/bottom-sheet";
import { fmtKRW } from "../repair-v2/_helpers";

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
}

/**
 * 임대 모드 v2 — 자산 그리드 + 자산 클릭 시 기간/보증금 시트 → 카트 추가.
 * 결제 흐름은 차후 PaymentSheet 가 rental 라인 처리하도록 확장 예정.
 */
export function RentalMode({ session }: Props) {
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
        <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6">
          {/* 카트에 담긴 임대 라인 — 간단 표시 */}
          {rentalItems.length > 0 && (
            <section className="mb-4 flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                담긴 임대 {rentalItems.length}
              </span>
              <div className="flex flex-col gap-2">
                {rentalItems.map((it) => (
                  <div
                    key={it.cartItemId}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-zinc-50 px-4 py-3"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="line-clamp-1 text-[14px] font-semibold text-zinc-900">
                        {it.name}
                      </span>
                      {it.rentalMeta?.startDate && it.rentalMeta?.endDate && (
                        <span className="text-[11px] text-zinc-500">
                          {it.rentalMeta.startDate} ~ {it.rentalMeta.endDate}
                        </span>
                      )}
                    </div>
                    <span className="text-[14px] font-semibold tabular-nums text-zinc-900">
                      {fmtKRW(it.unitPrice)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 자산 그리드 */}
          <section className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              가용 자산 {assets.length}
            </span>
            {assetsQuery.isPending ? (
              <GridSkeleton />
            ) : assets.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <span className="text-[14px] text-zinc-500">가용 자산이 없습니다</span>
                <span className="text-[12px] text-zinc-400">
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
        sessionId={session.id}
        canAdd={!!session.customerId}
        onAdded={() => setSelectedAsset(null)}
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
      className="flex flex-col gap-1.5 rounded-2xl bg-white p-3 text-left ring-1 ring-zinc-200 transition-all active:scale-[0.98] sm:hover:ring-zinc-300 sm:hover:shadow-sm"
    >
      <span className="line-clamp-2 min-h-[2.4em] text-[13px] font-semibold leading-tight text-zinc-900">
        {asset.name}
      </span>
      <span className="font-mono text-[10px] text-zinc-400">{asset.assetNo}</span>
      <span className="mt-1 text-[14px] font-bold tabular-nums text-zinc-900">
        {fmtKRW(dailyRate)}
        <span className="ml-0.5 text-[10px] font-normal text-zinc-500">/일</span>
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
          className="h-24 animate-pulse rounded-2xl bg-white ring-1 ring-zinc-200"
        />
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
  sessionId,
  canAdd,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  asset: RentalAsset | null;
  sessionId: string;
  canAdd: boolean;
  onAdded: () => void;
}) {
  if (!open || !asset) return null;
  return (
    <RentalSheetBody
      onOpenChange={onOpenChange}
      asset={asset}
      sessionId={sessionId}
      canAdd={canAdd}
      onAdded={onAdded}
    />
  );
}

function RentalSheetBody({
  onOpenChange,
  asset,
  sessionId,
  canAdd,
  onAdded,
}: {
  onOpenChange: (v: boolean) => void;
  asset: RentalAsset;
  sessionId: string;
  canAdd: boolean;
  onAdded: () => void;
}) {
  const { add } = useSessions();
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());

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
    if (!canAdd) {
      toast.error("임대는 고객 연결이 필요합니다");
      return;
    }
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
        },
      },
      { sessionId },
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
          className="flex h-14 w-full items-center justify-between rounded-2xl bg-zinc-900 px-5 text-[16px] font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-50"
        >
          <span>{days}일 카트 추가</span>
          <span className="tabular-nums">{fmtKRW(total)}</span>
        </button>
      }
    >
      <div className="flex flex-col gap-5 pt-2">
        {!canAdd && (
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-[12px] text-amber-900">
            임대는 고객 연결이 필요합니다 — 손님 그리드에서 고객을 연결한 뒤 다시 시도하세요
          </div>
        )}

        {/* 기간 */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
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
          <span className="text-[11px] text-zinc-400">{days}일 임대</span>
        </div>

        {/* 가격 요약 */}
        <div className="flex flex-col gap-2 rounded-2xl bg-zinc-50 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] text-zinc-600">일일가</span>
            <span className="text-[14px] font-semibold tabular-nums text-zinc-900">
              {fmtKRW(dailyRate)}
              <span className="ml-1 text-[11px] font-normal text-zinc-500">×{days}</span>
            </span>
          </div>
          {deposit > 0 && (
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-zinc-600">보증금</span>
              <span className="text-[14px] font-semibold tabular-nums text-zinc-900">
                {fmtKRW(deposit)}
                <span className="ml-1 text-[11px] font-normal text-zinc-500">반환</span>
              </span>
            </div>
          )}
          <div className="my-1 h-px bg-zinc-200" />
          <div className="flex items-baseline justify-between">
            <span className="text-[14px] font-semibold text-zinc-900">임대료</span>
            <span className="text-[18px] font-bold tabular-nums text-zinc-900">
              {fmtKRW(total)}
            </span>
          </div>
        </div>
      </div>
    </BottomSheet>
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
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-[14px] tabular-nums outline-none focus:border-zinc-400 focus:bg-white"
      />
    </label>
  );
}
