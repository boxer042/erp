"use client";

import { useMemo, useState } from "react";
import {
  useMutation,
  useQueries,
  useQueryClient,
} from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { JmButton, JmDatePicker, JmTextarea } from "@/jm";
import { fmtKRW } from "../repairs/_helpers";
import { BottomSheet } from "../_components/bottom-sheet";
import { LinkCustomerSheet } from "../_link-customer-sheet";

interface RentalAsset {
  id: string;
  assetNo: string;
  name: string;
  dailyRate: string;
  depositAmount: string | null;
}

type Sub = "today" | "reserve" | "manage" | null;

interface Props {
  /** null 이면 닫힌 상태. 자산 객체면 그 자산에 대한 액션 드로우 열림. */
  asset: RentalAsset | null;
  /**
   * - "available": 임대 가능 자산 → 3개 액션 모두 노출
   * - "in-use": 이미 임대중이거나 오늘 픽업 예약된 자산 → 오늘임대시작 비활성, 예약은 미래일만 허용
   */
  availability?: "available" | "in-use";
  onClose: () => void;
}

/**
 * 자산 클릭 시 열리는 액션 드로우.
 * 메뉴: 오늘 임대 시작 / 임대 예약 / 관리 (예정).
 *
 * 각 액션은 자산이 이미 선택되어 있는 상태에서 시작.
 */
export function RentalAssetActionSheet({
  asset,
  availability = "available",
  onClose,
}: Props) {
  if (!asset) return null;
  return <Body asset={asset} availability={availability} onClose={onClose} />;
}

function Body({
  asset,
  availability,
  onClose,
}: {
  asset: RentalAsset;
  availability: "available" | "in-use";
  onClose: () => void;
}) {
  const [sub, setSub] = useState<Sub>(null);
  const inUse = availability === "in-use";
  const dailyRate = parseFloat(asset.dailyRate) || 0;

  return (
    <>
      <BottomSheet open onOpenChange={(v) => !v && onClose()} title={asset.name}>
        <div className="flex flex-col gap-3 pb-2">
          {/* 자산 요약 */}
          <div className="flex items-center justify-between rounded-2xl bg-[var(--jm-bg)] px-4 py-3">
            <div className="flex flex-col">
              <span className="font-mono text-jm-2xs text-[var(--jm-text-muted)]">
                {asset.assetNo}
              </span>
              <span className="text-jm-sm text-[var(--jm-text)]">
                일일가{" "}
                <span className="font-semibold tabular-nums text-[var(--jm-text)]">
                  {fmtKRW(dailyRate)}
                </span>
              </span>
            </div>
            {inUse ? (
              <span className="rounded-full bg-[var(--jm-danger-bg)] px-2.5 py-1 text-jm-3xs font-bold uppercase tracking-wider text-[var(--jm-danger-fg)]">
                사용중
              </span>
            ) : (
              <span className="rounded-full bg-[var(--jm-success-bg)] px-2.5 py-1 text-jm-3xs font-bold uppercase tracking-wider text-[var(--jm-success-fg)]">
                임대 가능
              </span>
            )}
          </div>

          {/* 액션 메뉴 — in-use 자산은 "오늘임대시작" 비활성 (사유 표시) */}
          <div className="flex flex-col gap-1.5">
            <ActionItem
              label="오늘 임대 시작"
              desc={
                inUse
                  ? "이미 사용중·오늘 픽업 예약된 자산은 시작 불가"
                  : "고객 선택 후 즉시 ACTIVE 임대 생성"
              }
              accent="emerald"
              disabled={inUse}
              onClick={() => setSub("today")}
            />
            <ActionItem
              label="임대 예약"
              desc={
                inUse
                  ? "미래 시작일(내일 이후)로 RESERVED 임대 생성"
                  : "미래 시작일로 RESERVED 임대 생성"
              }
              accent="amber"
              onClick={() => setSub("reserve")}
            />
            <ActionItem
              label="관리"
              desc="자산 점검·정비 이력 (준비 중)"
              accent="zinc"
              onClick={() => setSub("manage")}
            />
          </div>
        </div>
      </BottomSheet>

      {(sub === "today" || sub === "reserve") && (
        <RentalCreateSheet
          mode={sub}
          asset={asset}
          requireFutureStart={inUse}
          onClose={() => setSub(null)}
          onCreated={() => {
            setSub(null);
            onClose();
          }}
        />
      )}

      {sub === "manage" && (
        <BottomSheet open onOpenChange={() => setSub(null)} title="관리">
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <span className="text-jm-base font-semibold text-[var(--jm-text)]">
              자산 점검·정비 이력 — 준비 중
            </span>
            <span className="text-jm-xs text-[var(--jm-text-muted)]">
              수리 티켓과 연동해 자산별 정비 이력을 여기서 추적할 예정입니다.
            </span>
          </div>
        </BottomSheet>
      )}
    </>
  );
}

function ActionItem({
  label,
  desc,
  accent,
  onClick,
  disabled,
}: {
  label: string;
  desc: string;
  accent: "emerald" | "amber" | "zinc";
  onClick: () => void;
  disabled?: boolean;
}) {
  const ring =
    accent === "emerald"
      ? "ring-[var(--jm-success-bg)] bg-[var(--jm-success-bg)]"
      : accent === "amber"
        ? "ring-[var(--jm-warning-bg)] bg-[var(--jm-warning-bg)]"
        : "ring-[var(--jm-border)] bg-[var(--jm-bg)]";
  const dot =
    accent === "emerald"
      ? "bg-[var(--jm-success-solid)]"
      : accent === "amber"
        ? "bg-[var(--jm-warning-solid)]"
        : "bg-[var(--jm-text-subtle)]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left ring-1 transition-all ${ring} ${
        disabled
          ? "cursor-not-allowed opacity-50"
          : "active:scale-[0.99] sm:hover:shadow-sm"
      }`}
    >
      <span className={`size-2.5 shrink-0 rounded-full ${dot}`} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-jm-md font-semibold text-[var(--jm-text)]">{label}</span>
        <span className="line-clamp-1 text-jm-xs text-[var(--jm-text-muted)]">{desc}</span>
      </div>
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        className="shrink-0 text-[var(--jm-text-subtle)]"
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
    </button>
  );
}

// ─── 임대 생성 폼 ─────────────────────────────────────────────────────
function RentalCreateSheet({
  mode,
  asset,
  requireFutureStart,
  onClose,
  onCreated,
}: {
  mode: "today" | "reserve";
  asset: RentalAsset;
  /** true 면 시작일은 내일 이후만 허용 (사용중 자산 예약). startDate <= today 이면 submit 차단. */
  requireFutureStart?: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const qc = useQueryClient();
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [customer, setCustomer] = useState<{
    id: string;
    name: string;
    phone: string | null;
  } | null>(null);

  const todayIso = format(new Date(), "yyyy-MM-dd");
  const tomorrowIso = format(new Date(Date.now() + 86400000), "yyyy-MM-dd");
  const dayAfterIso = format(
    new Date(Date.now() + 86400000 * 2),
    "yyyy-MM-dd",
  );
  // 사용중 자산은 미래 예약만 — 시작 default 를 내일로 강제
  const [startDate, setStartDate] = useState(
    mode === "today" && !requireFutureStart ? todayIso : tomorrowIso,
  );
  const [endDate, setEndDate] = useState(
    mode === "today" && !requireFutureStart ? tomorrowIso : dayAfterIso,
  );
  const [memo, setMemo] = useState("");

  // 자산 점유 fetch — ACTIVE / OVERDUE / RESERVED 모두 합산
  const occupancyQueries = useQueries({
    queries: (["ACTIVE", "OVERDUE", "RESERVED"] as const).map((s) => ({
      queryKey: ["pos-v2", "rentals", "by-asset", asset.id, s],
      queryFn: () =>
        apiGet<
          {
            id: string;
            startDate: string;
            endDate: string;
          }[]
        >(`/api/rentals?assetId=${asset.id}&status=${s}`),
      staleTime: 1000 * 30,
    })),
  });
  const occupiedRanges = useMemo(() => {
    const all = occupancyQueries.flatMap((q) => q.data ?? []);
    return all
      .map((r) => ({
        start: stripTime(new Date(r.startDate)),
        end: stripTime(new Date(r.endDate)),
      }))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [occupancyQueries]);
  const occupancyLoading = occupancyQueries.some((q) => q.isPending);

  // 선택된 [start, end] 가 어떤 occupied range 와도 겹치지 않는지
  const startD = stripTime(new Date(startDate));
  const endD = stripTime(new Date(endDate));
  const overlap = useMemo(
    () =>
      occupiedRanges.find(
        (r) => Math.max(startD.getTime(), r.start.getTime()) <= Math.min(endD.getTime(), r.end.getTime()),
      ),
    [occupiedRanges, startD, endD],
  );

  const days = Math.max(
    1,
    Math.round(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000,
    ),
  );
  const dailyRate = parseFloat(asset.dailyRate) || 0;
  const total = dailyRate * days;
  const deposit = asset.depositAmount ? parseFloat(asset.depositAmount) || 0 : 0;

  const createMutation = useMutation({
    mutationFn: () =>
      apiMutate<{ id: string; rentalNo: string }>("/api/rentals", "POST", {
        assetId: asset.id,
        customerId: customer!.id,
        startDate,
        endDate,
        rateType: "DAILY",
        unitRate: dailyRate,
        depositAmount: deposit > 0 ? deposit : undefined,
        memo: memo.trim() || undefined,
      }),
    onSuccess: (r) => {
      toast.success(`임대 생성됨 — ${r.rentalNo}`);
      qc.invalidateQueries({ queryKey: ["pos-v2", "rentals"] });
      qc.invalidateQueries({ queryKey: ["pos-v2", "rental-assets"] });
      onCreated();
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "임대 생성에 실패했습니다",
      ),
  });

  // requireFutureStart=true 면 시작일이 오늘 이전이면 submit 불가
  const startTooEarly = requireFutureStart && startDate <= todayIso;
  const canSubmit =
    !!customer &&
    !!startDate &&
    !!endDate &&
    new Date(endDate) > new Date(startDate) &&
    !startTooEarly &&
    !overlap &&
    !createMutation.isPending;

  return (
    <>
      <BottomSheet
        open
        onOpenChange={(v) => !v && onClose()}
        title={mode === "today" ? "오늘 임대 시작" : "임대 예약"}
        footer={
          <JmButton
            size="lg"
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit}
            className="w-full justify-between"
          >
            <span className="flex items-center gap-2">
              {createMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {days}일 임대 생성
            </span>
            <span className="tabular-nums">{fmtKRW(total)}</span>
          </JmButton>
        }
      >
        <div className="flex flex-col gap-4 pt-2">
          {/* 자산 — 고정 (상위 시트에서 이미 선택됨) */}
          <div className="flex flex-col gap-1.5 rounded-2xl bg-[var(--jm-bg)] px-4 py-3">
            <span className="text-jm-3xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
              자산
            </span>
            <span className="text-jm-base font-semibold text-[var(--jm-text)]">
              {asset.name}
            </span>
            <span className="font-mono text-jm-2xs text-[var(--jm-text-muted)]">
              {asset.assetNo}
            </span>
          </div>

          {/* 고객 */}
          <FieldButton
            label="고객"
            value={
              customer ? (
                <span className="flex flex-col">
                  <span className="text-jm-base font-semibold text-[var(--jm-text)]">
                    {customer.name}
                  </span>
                  {customer.phone && (
                    <span className="font-mono text-jm-2xs text-[var(--jm-text-muted)]">
                      {customer.phone}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-jm-base text-[var(--jm-text-subtle)]">고객 선택</span>
              )
            }
            onClick={() => setCustomerPickerOpen(true)}
          />

          {/* 기간 — Calendar 에서 점유된 날짜 자체가 선택 불가능. min 제약(과거/미래만 등)도 함께 적용 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-jm-3xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
              기간
            </span>

            {/* 점유 안내 — 사용자가 시작일을 정하기 전에 어느 날짜가 막힌지 한눈에 파악 */}
            {!occupancyLoading && occupiedRanges.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-[var(--jm-bg)] px-3 py-2">
                <span className="text-jm-3xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
                  이미 예약됨
                </span>
                {occupiedRanges.map((r, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-[var(--jm-danger-bg)] px-2 py-0.5 text-jm-2xs font-semibold text-[var(--jm-danger-fg)]"
                  >
                    {format(r.start, "M/d")} ~ {format(r.end, "M/d")}
                  </span>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <DateField
                label="시작"
                value={startDate}
                onChange={(v) => {
                  setStartDate(v);
                  // 종료일이 새 시작일보다 빠르면 자동 보정
                  if (v >= endDate)
                    setEndDate(
                      format(
                        new Date(new Date(v).getTime() + 86400000),
                        "yyyy-MM-dd",
                      ),
                    );
                }}
                minIso={requireFutureStart ? tomorrowIso : todayIso}
                occupiedRanges={occupiedRanges}
              />
              <DateField
                label="종료"
                value={endDate}
                onChange={setEndDate}
                minIso={format(
                  new Date(new Date(startDate).getTime() + 86400000),
                  "yyyy-MM-dd",
                )}
                // 종료일은 시작일 + 1 일 이상이어야 하고, 선택된 startDate 이후 첫 점유 시작일 이전이어야 overlap 안 발생
                maxIso={(() => {
                  const next = occupiedRanges.find(
                    (r) => r.start > startD,
                  )?.start;
                  if (!next) return undefined;
                  // 점유 시작일 하루 전까지만 종료 가능
                  return format(
                    new Date(next.getTime() - 86400000),
                    "yyyy-MM-dd",
                  );
                })()}
                occupiedRanges={occupiedRanges}
              />
            </div>

            {startTooEarly ? (
              <span className="text-jm-2xs text-[var(--jm-danger-fg)]">
                사용중 자산은 내일 이후만 예약 가능합니다
              </span>
            ) : overlap ? (
              <span className="text-jm-2xs text-[var(--jm-danger-fg)]">
                선택한 기간이 기존 예약({format(overlap.start, "M/d")} ~{" "}
                {format(overlap.end, "M/d")})과 겹칩니다
              </span>
            ) : (
              <span className="text-jm-2xs text-[var(--jm-text-subtle)]">{days}일 임대</span>
            )}
          </div>

          {/* 메모 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-jm-3xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
              메모
            </span>
            <JmTextarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={2}
              placeholder="(선택)"
            />
          </div>

          {/* 가격 요약 */}
          <div className="flex flex-col gap-2 rounded-2xl bg-[var(--jm-bg)] p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-jm-sm text-[var(--jm-text-muted)]">일일가</span>
              <span className="text-jm-base font-semibold tabular-nums text-[var(--jm-text)]">
                {fmtKRW(dailyRate)}
                <span className="ml-1 text-jm-2xs font-normal text-[var(--jm-text-muted)]">
                  ×{days}
                </span>
              </span>
            </div>
            {deposit > 0 && (
              <div className="flex items-baseline justify-between">
                <span className="text-jm-sm text-[var(--jm-text-muted)]">보증금</span>
                <span className="text-jm-base font-semibold tabular-nums text-[var(--jm-text)]">
                  {fmtKRW(deposit)}
                  <span className="ml-1 text-jm-2xs font-normal text-[var(--jm-text-muted)]">
                    반환
                  </span>
                </span>
              </div>
            )}
            <div className="my-1 h-px bg-[var(--jm-border)]" />
            <div className="flex items-baseline justify-between">
              <span className="text-jm-base font-semibold text-[var(--jm-text)]">
                임대료
              </span>
              <span className="text-jm-xl font-bold tabular-nums text-[var(--jm-text)]">
                {fmtKRW(total)}
              </span>
            </div>
          </div>
        </div>
      </BottomSheet>

      <LinkCustomerSheet
        open={customerPickerOpen}
        onOpenChange={setCustomerPickerOpen}
        onSelect={(c) => {
          setCustomer({ id: c.id, name: c.name, phone: c.phone || null });
          setCustomerPickerOpen(false);
        }}
      />
    </>
  );
}

function FieldButton({
  label,
  value,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-1.5 rounded-2xl bg-[var(--jm-bg)] px-4 py-3 text-left transition-colors active:bg-[var(--jm-surface-muted)] sm:hover:bg-[var(--jm-surface-muted)]"
    >
      <span className="text-jm-3xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
        {label}
      </span>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">{value}</div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="shrink-0 text-[var(--jm-text-subtle)]"
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
      </div>
    </button>
  );
}

/**
 * 날짜 필드 — JmDatePicker 래핑. 점유된 날짜 범위(occupiedRanges)는 매처로 변환해
 * react-day-picker `disabled` 에 합산되어 클릭 자체 불가.
 * minIso/maxIso 는 JmDatePicker 의 fromDate/toDate 로 전달.
 */
function DateField({
  label,
  value,
  onChange,
  minIso,
  maxIso,
  occupiedRanges,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  minIso?: string;
  maxIso?: string;
  occupiedRanges: { start: Date; end: Date }[];
}) {
  const selected = value ? new Date(value) : undefined;
  const fromDate = minIso ? stripTime(new Date(minIso)) : undefined;
  const toDate = maxIso ? stripTime(new Date(maxIso)) : undefined;

  // occupiedRanges 를 react-day-picker DateInterval[] 매처로 변환
  const occupiedMatchers = useMemo(
    () => occupiedRanges.map((r) => ({ from: r.start, to: r.end })),
    [occupiedRanges],
  );

  return (
    <div className="flex flex-col gap-1">
      <span className="text-jm-3xs font-semibold uppercase tracking-wider text-[var(--jm-text-subtle)]">
        {label}
      </span>
      <JmDatePicker
        size="lg"
        value={selected}
        onChange={(d) => {
          if (!d) return;
          onChange(format(d, "yyyy-MM-dd"));
        }}
        placeholder="날짜 선택"
        fromDate={fromDate}
        toDate={toDate}
        disabledDates={occupiedMatchers}
      />
    </div>
  );
}

function stripTime(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
