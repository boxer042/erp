"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";

import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { calcRepairTotals } from "@/lib/repair";
import {
  STATUS_META,
  type RepairTicketDetail,
  type RepairPart,
  type RepairLabor,
  type RepairTicketRow,
} from "../_types";
import { calcFinal, nextActions, fmtKRW } from "../_helpers";
import { PartsSection } from "../_parts-section";
import { LaborsSection } from "../_labors-section";
import { PickupSheet } from "../_pickup-sheet";
import { PriceInputDialog } from "@/app/(pos)/pos/v2/_components/price-input-dialog";

/** 라우트 진입점 — params 받아 RepairV2Detail 에 위임. */
export default function RepairV2DetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <RepairV2Detail ticketId={id} />;
}

interface RepairV2DetailProps {
  ticketId: string;
  /** ← 버튼 클릭 — 미제공이면 router.push("/pos/repair-v2") 로 fallback */
  onBack?: () => void;
}

/**
 * 수리 v2 작업 화면 — repair-v2 라우트와 v2 손님 페이지(수리 탭) 가 공유.
 * shadcn 0개. 부속·공임·진단비·할인·픽업까지 풀 기능.
 */
export function RepairV2Detail({ ticketId, onBack }: RepairV2DetailProps) {
  const id = ticketId;
  const router = useRouter();
  const qc = useQueryClient();
  const [pickupOpen, setPickupOpen] = useState(false);

  const ticketQuery = useQuery({
    queryKey: ["repair-v2", "detail", id],
    queryFn: () => apiGet<RepairTicketDetail>(`/api/repair-tickets/${id}`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["repair-v2", "detail", id] });
    qc.invalidateQueries({ queryKey: ["repair-v2", "list"] });
    // 어드민/POS 기존 페이지도 함께
    qc.invalidateQueries({ queryKey: ["repairs"] });
  };

  const transitionMutation = useMutation({
    mutationFn: (vars: { action: string; payload?: Record<string, unknown> }) =>
      apiMutate(`/api/repair-tickets/${id}/transition`, "POST", {
        action: vars.action,
        ...(vars.payload ?? {}),
      }),
    onSuccess: (_, vars) => {
      const labels: Record<string, string> = {
        diagnose: "진단 시작",
        quote: "견적 확정",
        approve: "승인 완료",
        start: "수리 시작",
        ready: "수리 완료",
        pickup: "픽업/결제 완료",
        cancel: "취소 처리됨",
      };
      toast.success(labels[vars.action] ?? "처리되었습니다");
      setPickupOpen(false);
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "처리 실패"),
  });

  const goBack = onBack ?? (() => router.push("/pos/repair-v2"));

  if (ticketQuery.isPending) {
    return <DetailSkeleton onBack={goBack} />;
  }
  if (ticketQuery.isError || !ticketQuery.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-50 p-6 text-center">
        <span className="text-[15px] font-semibold text-zinc-900">
          수리 티켓을 찾을 수 없습니다
        </span>
        <button
          type="button"
          onClick={goBack}
          className="h-10 rounded-full bg-zinc-900 px-5 text-[13px] font-semibold text-white"
        >
          뒤로
        </button>
      </div>
    );
  }

  const t = ticketQuery.data;
  const meta = STATUS_META[t.status];
  const readonly = t.status === "PICKED_UP" || t.status === "CANCELLED";
  const actions = nextActions(t.status, t.type);
  const finalAmount = calcFinal(t);
  const totals = calcRepairTotals({
    parts: t.parts,
    labors: t.labors,
    diagnosisFee: t.diagnosisFee,
    totalDiscount: t.totalDiscount,
  });

  const triggerAction = (action: string) => {
    if (action === "pickup") {
      setPickupOpen(true);
      return;
    }
    if (action === "cancel" && !confirm("정말 취소하시겠습니까? 사용된 부속은 재고로 복원됩니다.")) {
      return;
    }
    transitionMutation.mutate({ action });
  };

  return (
    <div className="flex h-full flex-col bg-zinc-50">
      {/* 상단 — 뒤로 + 티켓번호 + 상태 */}
      <header className="shrink-0 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={goBack}
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
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${meta.dot}`} />
              <span className="text-[12px] font-semibold text-zinc-700">
                {meta.label}
              </span>
              {t.type === "ON_SITE" && (
                <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  즉시
                </span>
              )}
            </div>
            <span className="font-mono text-[13px] text-zinc-500">
              {t.ticketNo}
            </span>
          </div>
          <button
            type="button"
            onClick={() => window.open(`/repairs/${t.id}/print`, "_blank")}
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 active:bg-zinc-200"
            aria-label="내역서"
            title="내역서 출력"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path
                d="M5 4h10v4H5zM5 12h10v4H5zM3 8h14v4H3z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* 본문 */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4 sm:p-6">
          {/* 시리얼 기준 수리 이력 — 같은 시리얼의 다른 RepairTicket 들 */}
          {t.serialItem && (
            <SerialHistoryCard
              serialItemId={t.serialItem.id}
              serialCode={t.serialItem.code}
              currentTicketId={t.id}
              onClickTicket={(id) => router.push(`/pos/repair-v2/${id}`)}
            />
          )}

          {/* 재수리 (parent/revisits) — 시리얼 무관한 직접 재수리 관계만 */}
          {(t.parentRepairTicket || t.revisits.length > 0) && (
            <RevisitCard
              parent={t.parentRepairTicket}
              revisits={t.revisits}
              onClickTicket={(id) => router.push(`/pos/repair-v2/${id}`)}
            />
          )}

          {/* 합계 카드 — 가장 위로 */}
          <SummaryCard
            usedPartsTotal={totals.usedPartsTotal}
            laborTotal={totals.laborTotal}
            diagnosisFee={totals.diagnosisFee}
            discountAmount={totals.discountAmount}
            finalTotal={finalAmount}
            partsCount={t.parts.length}
            laborsCount={t.labors.length}
          />

          {/* 고객 / 기기 */}
          <CustomerDeviceCard ticket={t} />

          {/* 가져온 기기 — 시리얼/검색/직접입력 3모드 */}
          <ProductLinkCard ticket={t} readonly={readonly} onChanged={invalidate} />

          {/* 증상 / 진단 / 메모 */}
          <NotesCard ticket={t} readonly={readonly} onSaved={invalidate} />

          {/* 패키지 빠른 추가 */}
          {!readonly && <PackagesCard ticketId={t.id} onApplied={invalidate} />}

          {/* 부속 */}
          <PartsSection
            ticketId={t.id}
            parts={t.parts}
            readonly={readonly}
            onChanged={invalidate}
          />

          {/* 공임 */}
          <LaborsSection
            ticketId={t.id}
            labors={t.labors}
            readonly={readonly}
            onChanged={invalidate}
          />

          {/* 진단비 / 할인 */}
          <FeesAndDiscountCard
            ticket={t}
            readonly={readonly}
            onSaved={invalidate}
          />

          {/* 종료 상태 메시지 */}
          {readonly && (
            <div
              className={`rounded-2xl border px-4 py-3 text-[13px] ${
                t.status === "PICKED_UP"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-rose-200 bg-rose-50 text-rose-900"
              }`}
            >
              {t.status === "PICKED_UP"
                ? `수리 완료 — ${fmtKRW(t.finalAmount)}${
                    t.repairWarrantyEnds
                      ? ` · 보증 ~${format(
                          new Date(t.repairWarrantyEnds),
                          "yyyy-MM-dd",
                        )}`
                      : ""
                  }`
                : "취소된 수리"}
            </div>
          )}

          {/* FAB 보호 */}
          <div className="h-24" />
        </div>
      </main>

      {/* 하단 액션 바 — sticky */}
      {actions.length > 0 && (
        <div className="shrink-0 border-t border-zinc-200 bg-white px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 sm:px-6">
          <div className="mx-auto flex max-w-3xl items-stretch gap-2">
            {actions.map((a) => (
              <button
                key={a.action}
                type="button"
                disabled={transitionMutation.isPending}
                onClick={() => triggerAction(a.action)}
                className={`h-13 flex-1 rounded-2xl text-[15px] font-semibold transition-transform active:scale-[0.99] disabled:opacity-60 ${
                  a.primary
                    ? "bg-zinc-900 text-white"
                    : a.destructive
                      ? "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                      : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                } ${a.primary ? "py-4" : "py-3.5"}`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 픽업 결제 시트 */}
      <PickupSheet
        open={pickupOpen}
        onOpenChange={setPickupOpen}
        finalAmount={finalAmount}
        warrantyMonths={t.repairWarrantyMonths}
        onConfirm={(paymentMethod) =>
          transitionMutation.mutate({
            action: "pickup",
            payload: { paymentMethod },
          })
        }
        loading={transitionMutation.isPending}
      />
    </div>
  );
}

// ──── 합계 카드 ────
function SummaryCard({
  usedPartsTotal,
  laborTotal,
  diagnosisFee,
  discountAmount,
  finalTotal,
  partsCount,
  laborsCount,
}: {
  usedPartsTotal: number;
  laborTotal: number;
  diagnosisFee: number;
  discountAmount: number;
  finalTotal: number;
  partsCount: number;
  laborsCount: number;
}) {
  return (
    <div className="rounded-2xl bg-zinc-900 p-5 text-white">
      <div className="text-[12px] font-semibold uppercase tracking-wider text-white/60">
        최종 청구
      </div>
      <div className="mt-1 text-[36px] font-bold tabular-nums leading-none">
        {fmtKRW(finalTotal)}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
        <Pill label="부속" value={fmtKRW(usedPartsTotal)} hint={`${partsCount}건`} />
        <Pill label="공임" value={fmtKRW(laborTotal)} hint={`${laborsCount}건`} />
        {diagnosisFee > 0 && (
          <Pill label="진단비" value={fmtKRW(diagnosisFee)} />
        )}
        {discountAmount > 0 && (
          <Pill
            label="할인"
            value={`−${fmtKRW(discountAmount)}`}
            tone="warn"
          />
        )}
      </div>
    </div>
  );
}

function Pill({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "warn";
}) {
  return (
    <div
      className={`flex flex-col rounded-xl px-3 py-2 ${
        tone === "warn" ? "bg-amber-500/20" : "bg-white/10"
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider text-white/60">
        {label}
        {hint && <span className="ml-1 text-white/40">· {hint}</span>}
      </div>
      <div className="mt-0.5 text-[13px] font-semibold tabular-nums">
        {value}
      </div>
    </div>
  );
}

// ──── 고객 / 담당 / 접수 (기기는 별도 ProductLinkCard) ────
function CustomerDeviceCard({ ticket }: { ticket: RepairTicketDetail }) {
  return (
    <Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="고객">
          {ticket.customer ? (
            <div className="flex flex-col">
              <span className="text-[15px] font-semibold text-zinc-900">
                {ticket.customer.name}
              </span>
              {ticket.customer.phone && (
                <span className="font-mono text-[12px] text-zinc-500">
                  {ticket.customer.phone}
                </span>
              )}
            </div>
          ) : (
            <span className="text-[14px] text-zinc-400">미등록</span>
          )}
        </Field>
        <Field label="담당">
          <span className="text-[14px] text-zinc-700">
            {ticket.assignedTo?.name ?? (
              <span className="text-zinc-400">미지정</span>
            )}
          </span>
        </Field>
        <Field label="접수">
          <span className="text-[14px] text-zinc-700">
            {format(new Date(ticket.receivedAt), "yyyy-MM-dd HH:mm")}
          </span>
        </Field>
      </div>
    </Card>
  );
}

// ──── 가져온 기기 — 시리얼/검색/직접입력 ────
type DeviceMode = "SERIAL" | "SEARCH" | "TEXT";

interface SerialItemSearchResult {
  id: string;
  code: string;
  source: "SALE" | "REPAIR";
  displayName: string | null;
  soldAt: string;
  warrantyEnds: string | null;
  product: { id: string; name: string; sku: string } | null;
  customer: { id: string; name: string; phone: string | null } | null;
}

interface ProductSearchResult {
  id: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  warrantyMonths: number | null;
}

function ProductLinkCard({
  ticket,
  readonly,
  onChanged,
}: {
  ticket: RepairTicketDetail;
  readonly: boolean;
  onChanged: () => void;
}) {
  const initialMode: DeviceMode = ticket.serialItem
    ? "SERIAL"
    : ticket.repairProduct
      ? "SEARCH"
      : ticket.repairProductText
        ? "TEXT"
        : "SERIAL";
  const [mode, setMode] = useState<DeviceMode>(initialMode);
  const [editing, setEditing] = useState(false);

  const hasLink =
    !!ticket.serialItem || !!ticket.repairProduct || !!ticket.repairProductText;

  const update = useMutation({
    mutationFn: (data: {
      serialItemId?: string | null;
      repairProductId?: string | null;
      repairProductText?: string | null;
    }) => apiMutate(`/api/repair-tickets/${ticket.id}`, "PUT", data),
    onSuccess: () => {
      toast.success("기기 정보 저장됨");
      setEditing(false);
      onChanged();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  const clearLink = () => {
    update.mutate({
      serialItemId: null,
      repairProductId: null,
      repairProductText: null,
    });
  };

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
            가져온 기기
          </span>
          {!readonly && (
            <div className="flex items-center gap-2">
              {hasLink && (
                <button
                  type="button"
                  onClick={clearLink}
                  disabled={update.isPending}
                  className="text-[11px] font-medium text-zinc-500 underline-offset-2 hover:underline"
                >
                  초기화
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className="text-[11px] font-semibold text-zinc-700 underline-offset-2 hover:underline"
              >
                {editing ? "닫기" : hasLink ? "변경" : "연결"}
              </button>
            </div>
          )}
        </div>

        {/* 표시 영역 */}
        {ticket.serialItem ? (
          <SerialDisplay item={ticket.serialItem} />
        ) : ticket.repairProduct ? (
          <SearchProductDisplay product={ticket.repairProduct} />
        ) : ticket.repairProductText ? (
          <TextDisplay text={ticket.repairProductText} />
        ) : (
          <div className="rounded-xl bg-zinc-50 p-3 text-center text-[12px] text-zinc-500">
            연결된 기기 없음 — 우측 [연결] 로 시리얼·상품·자유입력 등록
          </div>
        )}

        {/* 편집 영역 */}
        {!readonly && editing && (
          <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            {/* 모드 토글 */}
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { v: "SERIAL", label: "시리얼" },
                  { v: "SEARCH", label: "상품 검색" },
                  { v: "TEXT", label: "직접 입력" },
                ] as const
              ).map((b) => (
                <button
                  key={b.v}
                  type="button"
                  onClick={() => setMode(b.v)}
                  className={`flex h-9 items-center justify-center rounded-lg text-[12px] font-semibold transition-colors ${
                    mode === b.v
                      ? "bg-zinc-900 text-white"
                      : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100"
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>

            {mode === "SERIAL" && (
              <SerialModeForm
                ticketId={ticket.id}
                onSaved={() => {
                  setEditing(false);
                  onChanged();
                }}
              />
            )}
            {mode === "SEARCH" && (
              <SearchModeForm
                ticketId={ticket.id}
                onSaved={() => {
                  setEditing(false);
                  onChanged();
                }}
              />
            )}
            {mode === "TEXT" && (
              <TextModeForm
                ticketId={ticket.id}
                initialValue={ticket.repairProductText ?? ""}
                onSaved={() => {
                  setEditing(false);
                  onChanged();
                }}
              />
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// 시리얼 표시 — 우리 판매 (SALE) / 수리 라벨 (REPAIR) 구분
function SerialDisplay({
  item,
}: {
  item: NonNullable<RepairTicketDetail["serialItem"]>;
}) {
  const displayName = item.product?.name ?? item.displayName ?? "(미상)";
  const isRepairLabel = item.source === "REPAIR";
  const warrantyActive =
    item.warrantyEnds && new Date(item.warrantyEnds) > new Date();
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-zinc-900 p-3 text-white">
      <div className="flex items-center gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/10">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" />
            <rect x="6" y="6" width="3" height="3" fill="currentColor" />
            <rect x="11" y="6" width="3" height="3" fill="currentColor" />
            <rect x="6" y="11" width="3" height="3" fill="currentColor" />
            <rect x="11" y="11" width="3" height="3" fill="currentColor" />
          </svg>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-mono text-[11px] font-semibold tracking-wider text-white/60">
            {item.code}
          </span>
          <span className="line-clamp-1 text-[14px] font-semibold">{displayName}</span>
        </div>
        <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold">
          {isRepairLabel ? "수리 라벨" : "우리 판매"}
        </span>
      </div>
      <div className="flex flex-wrap gap-3 border-t border-white/15 pt-2 text-[11px]">
        <div>
          <span className="text-white/50">{isRepairLabel ? "접수일" : "구매일"} </span>
          <span className="font-medium">
            {format(new Date(item.soldAt), "yyyy-MM-dd")}
          </span>
        </div>
        {item.warrantyEnds && (
          <div>
            <span className="text-white/50">보증 </span>
            <span className={warrantyActive ? "text-emerald-300" : "text-rose-300"}>
              ~{format(new Date(item.warrantyEnds), "yyyy-MM-dd")}
              {warrantyActive ? " (유효)" : " (만료)"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function SearchProductDisplay({
  product,
}: {
  product: NonNullable<RepairTicketDetail["repairProduct"]>;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-zinc-50 p-3">
      {product.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.imageUrl}
          alt={product.name}
          className="size-12 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-white text-zinc-400">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path
              d="M3 6l7-4 7 4v8l-7 4-7-4V6z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="line-clamp-1 text-[14px] font-semibold text-zinc-900">
          {product.name}
        </span>
        <span className="font-mono text-[11px] text-zinc-500">{product.sku}</span>
      </div>
      <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-700">
        카탈로그
      </span>
    </div>
  );
}

function TextDisplay({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-zinc-50 p-3">
      <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-white text-zinc-400">
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <path
            d="M4 5h12M4 10h12M4 15h8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <span className="line-clamp-2 flex-1 text-[14px] font-medium text-zinc-900">
        {text}
      </span>
      <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-700">
        외부 기기
      </span>
    </div>
  );
}

// ──── 모드별 폼 ────
function SerialModeForm({
  ticketId,
  onSaved,
}: {
  ticketId: string;
  onSaved: () => void;
}) {
  const [code, setCode] = useState("");
  const lookup = useMutation({
    mutationFn: async () => {
      const list = await apiGet<SerialItemSearchResult[]>(
        `/api/serial-items?search=${encodeURIComponent(code.trim())}`,
      );
      const exact = list.find((i) => i.code === code.trim());
      if (!exact) throw new Error("해당 시리얼을 찾을 수 없습니다");
      await apiMutate(`/api/repair-tickets/${ticketId}`, "PUT", {
        serialItemId: exact.id,
        repairProductId: null,
        repairProductText: null,
      });
      return exact;
    },
    onSuccess: (item) => {
      toast.success(`${item.code} 연결됨`);
      onSaved();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "조회 실패"),
  });

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="예: 250903-0001"
        className="h-11 flex-1 rounded-xl border border-zinc-200 bg-white px-3 font-mono text-[14px] outline-none focus:border-zinc-400"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing && code.trim()) {
            lookup.mutate();
          }
        }}
      />
      <button
        type="button"
        onClick={() => lookup.mutate()}
        disabled={!code.trim() || lookup.isPending}
        className="h-11 rounded-xl bg-zinc-900 px-4 text-[13px] font-semibold text-white disabled:opacity-50"
      >
        {lookup.isPending ? "조회…" : "조회·연결"}
      </button>
    </div>
  );
}

function SearchModeForm({
  ticketId,
  onSaved,
}: {
  ticketId: string;
  onSaved: () => void;
}) {
  const [query, setQuery] = useState("");
  const productsQuery = useQuery<ProductSearchResult[]>({
    queryKey: ["repair-v2", "device-product-search", query],
    queryFn: () =>
      apiGet<ProductSearchResult[]>(
        `/api/products?search=${encodeURIComponent(query)}&excludeVariants=true`,
      ),
    enabled: query.trim().length > 0,
    staleTime: 1000 * 30,
  });

  const link = useMutation({
    mutationFn: (productId: string) =>
      apiMutate(`/api/repair-tickets/${ticketId}`, "PUT", {
        serialItemId: null,
        repairProductId: productId,
        repairProductText: null,
      }),
    onSuccess: () => {
      toast.success("상품 연결됨");
      onSaved();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="상품명 또는 SKU 검색"
        className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-[14px] outline-none focus:border-zinc-400"
      />
      {query.trim().length > 0 && (
        <div className="flex max-h-60 flex-col gap-1 overflow-y-auto rounded-xl bg-white ring-1 ring-zinc-200">
          {productsQuery.isPending ? (
            <div className="px-3 py-3 text-[13px] text-zinc-400">검색 중…</div>
          ) : (productsQuery.data ?? []).length === 0 ? (
            <div className="px-3 py-3 text-[13px] text-zinc-500">결과 없음</div>
          ) : (
            (productsQuery.data ?? []).slice(0, 30).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => link.mutate(p.id)}
                disabled={link.isPending}
                className="flex items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-50 active:bg-zinc-100 disabled:opacity-50"
              >
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imageUrl}
                    alt={p.name}
                    className="size-9 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-400">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                      <path
                        d="M3 6l7-4 7 4v8l-7 4-7-4V6z"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="line-clamp-1 text-[13px] font-medium text-zinc-900">
                    {p.name}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-500">
                    {p.sku}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function TextModeForm({
  ticketId,
  initialValue,
  onSaved,
}: {
  ticketId: string;
  initialValue: string;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const save = useMutation({
    mutationFn: () =>
      apiMutate(`/api/repair-tickets/${ticketId}`, "PUT", {
        serialItemId: null,
        repairProductId: null,
        repairProductText: value.trim() || null,
      }),
    onSuccess: () => {
      toast.success("저장됨");
      onSaved();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });
  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="예: Sony A7M4 Black"
        className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-[14px] outline-none focus:border-zinc-400"
      />
      <button
        type="button"
        onClick={() => save.mutate()}
        disabled={!value.trim() || save.isPending}
        className="h-11 rounded-xl bg-zinc-900 text-[13px] font-semibold text-white disabled:opacity-50"
      >
        {save.isPending ? "저장…" : "저장"}
      </button>
    </div>
  );
}

// ──── 시리얼 기준 수리 이력 ────
// 같은 SerialItem 의 모든 과거 수리 티켓을 시간순으로 표시 — 수리 작업 시 참고용.
function SerialHistoryCard({
  serialItemId,
  serialCode,
  currentTicketId,
  onClickTicket,
}: {
  serialItemId: string;
  serialCode: string;
  currentTicketId: string;
  onClickTicket: (id: string) => void;
}) {
  const historyQuery = useQuery<RepairTicketRow[]>({
    queryKey: ["repair-v2", "serial-history", serialItemId, currentTicketId],
    queryFn: () =>
      apiGet<RepairTicketRow[]>(
        `/api/repair-tickets?serialItemId=${serialItemId}&excludeId=${currentTicketId}`,
      ),
    staleTime: 1000 * 60,
  });

  const history = historyQuery.data ?? [];
  if (historyQuery.isPending) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="mb-2 h-4 w-32 animate-pulse rounded bg-zinc-100" />
        <div className="h-12 animate-pulse rounded bg-zinc-100" />
      </div>
    );
  }
  if (history.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
            이 기기 수리 이력
          </span>
          <span className="font-mono text-[10px] text-zinc-400">{serialCode}</span>
        </div>
        <span className="text-[12px] text-zinc-400">이전 수리 이력 없음</span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
          이 기기 수리 이력 ({history.length})
        </span>
        <span className="font-mono text-[10px] text-zinc-400">{serialCode}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {history.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => onClickTicket(h.id)}
            className="flex items-start justify-between gap-3 rounded-xl bg-zinc-50 px-3 py-2.5 text-left transition-colors hover:bg-zinc-100 active:bg-zinc-200"
          >
            <div className="flex min-w-0 flex-col">
              <div className="flex items-center gap-1.5">
                <span className={`size-1.5 rounded-full ${STATUS_META[h.status].dot}`} />
                <span className="text-[11px] font-semibold text-zinc-700">
                  {STATUS_META[h.status].label}
                </span>
                <span className="font-mono text-[11px] text-zinc-400">
                  {h.ticketNo}
                </span>
              </div>
              {h.symptom && (
                <span className="line-clamp-1 mt-0.5 text-[12px] text-zinc-600">
                  {h.symptom}
                </span>
              )}
            </div>
            <div className="shrink-0 text-right text-[10px] text-zinc-400">
              {format(new Date(h.receivedAt), "yyyy-MM-dd")}
              {h.pickedUpAt && (
                <div className="text-zinc-300">
                  완료 {format(new Date(h.pickedUpAt), "MM-dd")}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ──── 재수리 (parent / revisits) ────
function RevisitCard({
  parent,
  revisits,
  onClickTicket,
}: {
  parent: RepairTicketDetail["parentRepairTicket"];
  revisits: RepairTicketDetail["revisits"];
  onClickTicket: (id: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-col gap-2">
        {parent && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
              재수리 — 원본 티켓
            </span>
            <button
              type="button"
              onClick={() => onClickTicket(parent.id)}
              className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-left transition-colors hover:bg-amber-100/50"
            >
              <div className="flex items-center gap-2">
                <span className={`size-1.5 rounded-full ${STATUS_META[parent.status].dot}`} />
                <span className="font-mono text-[12px] font-semibold text-zinc-900">
                  {parent.ticketNo}
                </span>
                <span className="text-[11px] text-zinc-600">
                  {STATUS_META[parent.status].label}
                </span>
              </div>
              {parent.repairWarrantyEnds && (
                <span className="text-[11px] text-zinc-500">
                  보증 ~{format(new Date(parent.repairWarrantyEnds), "yyyy-MM-dd")}
                </span>
              )}
            </button>
          </div>
        )}
        {revisits.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
              연관 재수리 {revisits.length}
            </span>
            <div className="flex flex-col gap-1">
              {revisits.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onClickTicket(r.id)}
                  className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-left transition-colors hover:bg-amber-100/50"
                >
                  <div className="flex items-center gap-2">
                    <span className={`size-1.5 rounded-full ${STATUS_META[r.status].dot}`} />
                    <span className="font-mono text-[12px] font-semibold text-zinc-900">
                      {r.ticketNo}
                    </span>
                    <span className="text-[11px] text-zinc-600">
                      {STATUS_META[r.status].label}
                    </span>
                  </div>
                  <span className="text-[11px] text-zinc-500">
                    {format(new Date(r.receivedAt), "MM-dd HH:mm")}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ──── 수리 패키지 빠른 추가 ────
interface RepairPackageRow {
  id: string;
  name: string;
  description: string | null;
  parts: Array<{ id: string; quantity: string; unitPrice: string }>;
  labors: Array<{ id: string; name: string; unitRate: string }>;
}

function PackagesCard({
  ticketId,
  onApplied,
}: {
  ticketId: string;
  onApplied: () => void;
}) {
  const packagesQuery = useQuery<RepairPackageRow[]>({
    queryKey: ["repair-v2", "packages"],
    queryFn: () => apiGet<RepairPackageRow[]>("/api/repair-packages"),
    staleTime: 1000 * 60 * 5,
  });
  const apply = useMutation({
    mutationFn: (packageId: string) =>
      apiMutate(`/api/repair-tickets/${ticketId}/apply-package`, "POST", {
        packageId,
      }),
    onSuccess: (_, packageId) => {
      const pkg = packagesQuery.data?.find((p) => p.id === packageId);
      toast.success(`${pkg?.name ?? "패키지"} 적용`);
      onApplied();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "패키지 적용 실패"),
  });

  const packages = packagesQuery.data ?? [];
  if (packagesQuery.isPending) {
    return (
      <Card>
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
            패키지
          </span>
          <div className="flex gap-1.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-9 w-24 animate-pulse rounded-full bg-zinc-100"
              />
            ))}
          </div>
        </div>
      </Card>
    );
  }
  if (packages.length === 0) return null;

  return (
    <Card>
      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
          패키지 빠른 추가
        </span>
        <div className="flex flex-wrap gap-1.5">
          {packages.map((p) => {
            const partsCount = p.parts.length;
            const laborsCount = p.labors.length;
            return (
              <button
                key={p.id}
                type="button"
                disabled={apply.isPending}
                onClick={() => apply.mutate(p.id)}
                className="flex h-10 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-4 text-[12px] transition-colors hover:border-zinc-900 hover:bg-zinc-50 active:scale-[0.98] disabled:opacity-50"
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                  <path d="M7 3v8M3 7h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <span className="font-semibold text-zinc-900">{p.name}</span>
                <span className="text-zinc-500">
                  ({partsCount > 0 && `부속 ${partsCount}`}
                  {partsCount > 0 && laborsCount > 0 && " · "}
                  {laborsCount > 0 && `공임 ${laborsCount}`})
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        {label}
      </span>
      {children}
    </div>
  );
}

// ──── 증상 / 진단 / 메모 ────
function NotesCard({
  ticket,
  readonly,
  onSaved,
}: {
  ticket: RepairTicketDetail;
  readonly: boolean;
  onSaved: () => void;
}) {
  const [symptom, setSymptom] = useState(ticket.symptom ?? "");
  const [diagnosis, setDiagnosis] = useState(ticket.diagnosis ?? "");
  const [repairNotes, setRepairNotes] = useState(ticket.repairNotes ?? "");

  const dirty =
    symptom !== (ticket.symptom ?? "") ||
    diagnosis !== (ticket.diagnosis ?? "") ||
    repairNotes !== (ticket.repairNotes ?? "");

  const saveMutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/repair-tickets/${ticket.id}`, "PUT", {
        symptom,
        diagnosis,
        repairNotes,
      }),
    onSuccess: () => {
      toast.success("저장됨");
      onSaved();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <NotesField
          label="증상"
          hint="고객 호소"
          value={symptom}
          onChange={setSymptom}
          readonly={readonly}
          placeholder="예: 누수 발생, 호스 연결부 새는 듯"
        />
        <NotesField
          label="진단"
          hint="직원 확인"
          value={diagnosis}
          onChange={setDiagnosis}
          readonly={readonly}
          placeholder="예: 체크밸브 마모"
        />
        <NotesField
          label="수리 메모"
          hint="내부"
          value={repairNotes}
          onChange={setRepairNotes}
          readonly={readonly}
          placeholder="작업 메모"
        />
        {!readonly && dirty && (
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="self-end rounded-full bg-zinc-900 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {saveMutation.isPending ? "저장 중…" : "저장"}
          </button>
        )}
      </div>
    </Card>
  );
}

function NotesField({
  label,
  hint,
  value,
  onChange,
  readonly,
  placeholder,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  readonly: boolean;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
          {label}
        </span>
        <span className="text-[10px] text-zinc-400">{hint}</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={readonly}
        placeholder={placeholder}
        rows={2}
        className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-[14px] outline-none placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white disabled:opacity-70"
      />
    </div>
  );
}

// ──── 진단비 / 할인 ────
function FeesAndDiscountCard({
  ticket,
  readonly,
  onSaved,
}: {
  ticket: RepairTicketDetail;
  readonly: boolean;
  onSaved: () => void;
}) {
  const [feeOpen, setFeeOpen] = useState(false);
  const [totalDiscount, setTotalDiscount] = useState(
    ticket.totalDiscount === "0" ? "" : ticket.totalDiscount,
  );
  const currentFee = Number(ticket.diagnosisFee) || 0;
  const dirty =
    totalDiscount !== (ticket.totalDiscount === "0" ? "" : ticket.totalDiscount);

  const saveDiscount = useMutation({
    mutationFn: () =>
      apiMutate(`/api/repair-tickets/${ticket.id}`, "PUT", {
        totalDiscount: totalDiscount.trim() || "0",
      }),
    onSuccess: () => {
      toast.success("저장됨");
      onSaved();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  const saveFee = useMutation({
    mutationFn: (net: number) =>
      apiMutate(`/api/repair-tickets/${ticket.id}`, "PUT", {
        diagnosisFee: net,
      }),
    onSuccess: () => {
      toast.success("진단비 저장됨");
      onSaved();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
              진단비
            </span>
            <button
              type="button"
              onClick={() => !readonly && setFeeOpen(true)}
              disabled={readonly}
              className="flex h-12 items-center justify-end rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-right text-[16px] font-semibold tabular-nums text-zinc-900 transition-colors hover:bg-white hover:border-zinc-400 disabled:opacity-70"
            >
              {currentFee > 0 ? fmtKRW(currentFee) : (
                <span className="text-zinc-400">탭하여 입력</span>
              )}
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
              전체 할인
            </span>
            <input
              type="text"
              value={totalDiscount}
              onChange={(e) => setTotalDiscount(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              disabled={readonly}
              placeholder="5000 또는 10%"
              className="h-12 rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-right text-[16px] outline-none focus:border-zinc-400 focus:bg-white disabled:opacity-70"
            />
          </div>
        </div>
        {!readonly && dirty && (
          <button
            type="button"
            onClick={() => saveDiscount.mutate()}
            disabled={saveDiscount.isPending}
            className="self-end rounded-full bg-zinc-900 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {saveDiscount.isPending ? "저장 중…" : "저장"}
          </button>
        )}
      </div>

      <PriceInputDialog
        open={feeOpen}
        onOpenChange={setFeeOpen}
        title="진단비"
        initialNet={currentFee}
        taxType="TAXABLE"
        onSubmit={(net) => saveFee.mutate(net)}
      />
    </Card>
  );
}

// ──── 카드 컨테이너 (raw) ────
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
      {children}
    </div>
  );
}

function DetailSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex h-full flex-col bg-zinc-50">
      <header className="shrink-0 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-700"
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
          <div className="flex flex-1 flex-col gap-1">
            <div className="h-3 w-20 animate-pulse rounded bg-zinc-100" />
            <div className="h-3 w-32 animate-pulse rounded bg-zinc-100" />
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4 sm:p-6">
          <div className="h-32 animate-pulse rounded-2xl bg-zinc-200" />
          <div className="h-24 animate-pulse rounded-2xl bg-white" />
          <div className="h-48 animate-pulse rounded-2xl bg-white" />
        </div>
      </main>
    </div>
  );
}

// 미사용 import 정리 — 파일 외부에서 참조될 수 있도록 export 만 한 줄
export type { RepairPart, RepairLabor };
