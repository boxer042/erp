"use client";

import { use, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Loader2, AlertCircle, FileText } from "lucide-react";
import { toast } from "sonner";

import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import {
  JmBadge,
  JmButton,
  JmCard,
  JmCardContent,
  JmCardHeader,
  JmCardTitle,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmInput,
  JmNumberInput,
  JmTextarea,
} from "@/jm";

type ShippingMethodValue =
  | "COURIER"
  | "DIRECT_DELIVERY"
  | "QUICK_OR_CARGO"
  | "OTHER_SUPPLIER"
  | "PICKUP";

const SHIPPING_LABELS: Record<ShippingMethodValue, string> = {
  COURIER: "택배 출고",
  DIRECT_DELIVERY: "직접 배달",
  QUICK_OR_CARGO: "퀵 · 용달",
  OTHER_SUPPLIER: "다른 거래처 출고",
  PICKUP: "직접 수령 (매장 픽업)",
};

// 거래처가 선택 가능한 4종 (PICKUP 제외 — 매장이 PO 발송 시 사전 지정)
const SUPPLIER_SHIPPING_OPTIONS: ShippingMethodValue[] = [
  "COURIER",
  "DIRECT_DELIVERY",
  "QUICK_OR_CARGO",
  "OTHER_SUPPLIER",
];

interface PoItem {
  id: string;
  name: string;
  spec: string | null;
  supplierCode: string | null;
  unitOfMeasure: string;
  priceUndetermined: boolean;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  proposedUnitPrice: string | null;
  proposalStatus: "NONE" | "PENDING" | "ACCEPTED" | "REJECTED";
  proposalRespondedAt: string | null;
  proposalRejectionNote: string | null;
}

interface PoDetail {
  poNo: string;
  orderDate: string;
  expectedDate: string | null;
  shippingMethod: ShippingMethodValue | null;
  promisedDate: string | null;
  shippingMemo: string | null;
  totalAmount: string;
  issuer: {
    name: string;
    businessNumber: string | null;
    ceo: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    businessType: string | null;
    businessItem: string | null;
  } | null;
  supplier: { name: string; businessNumber: string | null; representative: string | null };
  items: PoItem[];
  poStatus: string;
  tokenStatus: string;
  alreadyAccepted: boolean;
  acceptedAt: string | null;
  expiresAt: string;
}

export default function ExternalPoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [resultMessage, setResultMessage] = useState<{ type: "success" | "info"; text: string } | null>(null);
  // 단가 협상 모드 — itemId → 입력 중인 새 단가 (string)
  const [editingPrices, setEditingPrices] = useState<Record<string, string>>({});
  const [priceMode, setPriceMode] = useState(false);
  // [수락] 모달 상태 — 출고 방법/납기일/메모 입력
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [acceptShipping, setAcceptShipping] = useState<ShippingMethodValue | null>(null);
  const [acceptDate, setAcceptDate] = useState("");
  const [acceptMemo, setAcceptMemo] = useState("");

  const detailQuery = useQuery<PoDetail>({
    queryKey: ["public-po", token],
    queryFn: () => apiGet<PoDetail>(`/api/public/po/${token}`),
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: (payload: {
      shippingMethod: ShippingMethodValue;
      promisedDate: string;
      shippingMemo?: string | null;
    }) => apiMutate(`/api/public/po/${token}/accept`, "POST", payload),
    onSuccess: () => {
      toast.success("발주를 수락했습니다");
      setResultMessage({ type: "success", text: "발주를 수락했습니다. 감사합니다." });
      setAcceptOpen(false);
      detailQuery.refetch();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "처리 실패"),
  });

  const rejectMutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/public/po/${token}/reject`, "POST", {
        note: rejectNote.trim() || null,
      }),
    onSuccess: () => {
      toast.success("거절 처리되었습니다");
      setResultMessage({ type: "info", text: "거절 처리되었습니다. 발주처와 별도로 협의해주세요." });
      detailQuery.refetch();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "처리 실패"),
  });

  const proposeMutation = useMutation({
    mutationFn: (changes: Array<{ itemId: string; proposedUnitPrice: number }>) =>
      apiMutate(`/api/public/po/${token}/propose-price`, "POST", { changes }),
    onSuccess: () => {
      toast.success("단가 변경 요청이 발주처에 전달되었습니다");
      setResultMessage({
        type: "info",
        text: "단가 변경 요청이 전송되었습니다. 발주처가 검토 후 결과를 알려드립니다.",
      });
      setPriceMode(false);
      setEditingPrices({});
      detailQuery.refetch();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "처리 실패"),
  });

  const data = detailQuery.data;

  // 항목별 화면 표시 단가 — priceMode 면 input 값, 아니면 unitPrice
  const effectiveUnitPrice = (it: PoItem): number => {
    if (priceMode && editingPrices[it.id] !== undefined) {
      const v = parseFloat(editingPrices[it.id]);
      return Number.isFinite(v) ? v : parseFloat(it.unitPrice);
    }
    if (it.proposedUnitPrice) return parseFloat(it.proposedUnitPrice);
    return parseFloat(it.unitPrice);
  };

  // 모든 hook 은 early return 전에 호출 (React Rules of Hooks)
  const subtotal = useMemo(() => {
    if (!data) return 0;
    return data.items.reduce((s, it) => s + effectiveUnitPrice(it) * parseFloat(it.quantity), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, priceMode, editingPrices]);

  // ─── 에러/만료 ──────────────────────────────
  if (detailQuery.isError) {
    const msg =
      (detailQuery.error as { message?: string })?.message ||
      "유효하지 않거나 만료된 링크입니다";
    return <ErrorScreen title="접근할 수 없는 링크" message={msg} />;
  }
  if (detailQuery.isPending || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <JmCard className="p-8">
          <div className="flex items-center gap-3">
            <Loader2 className="size-5 animate-spin text-[var(--jm-text-subtle)]" />
            <span className="text-jm-base text-[var(--jm-text-muted)]">발주서를 불러오는 중...</span>
          </div>
        </JmCard>
      </div>
    );
  }

  const isProcessed = data.alreadyAccepted || data.tokenStatus === "REJECTED";
  const isCounterOffer = data.poStatus === "COUNTER_OFFER";
  // 가격 미정 라인이 하나라도 있으면 [수락] 차단 — 거래처가 [단가 변경 요청] 거쳐야 함
  const hasUndetermined = data.items.some((it) => it.priceUndetermined);
  // 매장이 PICKUP 으로 사전 설정했으면 모달에서 출고 방법 선택 숨김
  const isPickupPreset = data.shippingMethod === "PICKUP";
  const tax = Math.round(subtotal * 0.1);
  const grandTotal = subtotal + tax;
  // 협상 결과 — 가장 최근 응답 (PENDING 외 ACCEPTED/REJECTED 가 모두 같은 응답시각이므로 한 번만 추출)
  const proposalAccepted = data.items.some((it) => it.proposalStatus === "ACCEPTED");
  const proposalRejected = data.items.some((it) => it.proposalStatus === "REJECTED");
  const proposalRespondedAt =
    data.items.find((it) => it.proposalStatus === "ACCEPTED" || it.proposalStatus === "REJECTED")
      ?.proposalRespondedAt ?? null;
  const rejectionNote =
    data.items.find((it) => it.proposalStatus === "REJECTED")?.proposalRejectionNote ?? null;
  // 원본 합계 (priceMode/proposed 무시) — 변동 표시용
  const originalSubtotal = data.items.reduce(
    (s, it) => s + parseFloat(it.unitPrice) * parseFloat(it.quantity),
    0
  );
  const subtotalDiff = subtotal - originalSubtotal;
  const subtotalPct = originalSubtotal !== 0 ? (subtotalDiff / originalSubtotal) * 100 : 0;
  const showDelta = Math.abs(subtotalDiff) > 0.5;

  const startPriceEdit = () => {
    const init: Record<string, string> = {};
    for (const it of data.items) {
      // JmNumberInput 은 raw digits 만 다루므로 정수로 강제
      init[it.id] = String(Math.round(parseFloat(it.unitPrice)));
    }
    setEditingPrices(init);
    setPriceMode(true);
  };

  const submitProposal = () => {
    const changes: Array<{ itemId: string; proposedUnitPrice: number }> = [];
    for (const it of data.items) {
      const newVal = parseFloat(editingPrices[it.id] ?? "");
      const original = parseFloat(it.unitPrice);
      if (Number.isFinite(newVal) && newVal >= 0 && newVal !== original) {
        changes.push({ itemId: it.id, proposedUnitPrice: newVal });
      }
    }
    if (changes.length === 0) {
      toast.error("변경된 단가가 없습니다");
      return;
    }
    proposeMutation.mutate(changes);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-32 pt-8">
      {/* 헤더 — 발주자 상호 + "발주서" + 한 줄 메타 (발주번호·발주일·입고희망일) */}
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <FileText className="size-5 text-[var(--jm-text-muted)]" />
          <h1 className="text-jm-xl font-bold text-[var(--jm-text)]">
            {data.issuer?.name ? `${data.issuer.name} 발주서` : "발주서"}
          </h1>
        </div>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 pl-7 text-jm-xs text-[var(--jm-text-muted)]">
          <span className="font-[family-name:var(--jm-font-mono)] font-semibold text-[var(--jm-text)]">
            {data.poNo}
          </span>
          <span>발주일 {new Date(data.orderDate).toLocaleDateString("ko-KR")}</span>
          {data.expectedDate && (
            <span>입고 희망일 {new Date(data.expectedDate).toLocaleDateString("ko-KR")}</span>
          )}
          {isPickupPreset && (
            <span className="rounded-md bg-[var(--jm-info-bg)] px-1.5 py-0.5 font-medium text-[var(--jm-info-fg)]">
              매장 직접 수령 (픽업)
            </span>
          )}
        </div>
      </header>

      {/* 결과 메시지 */}
      {(resultMessage || data.alreadyAccepted) && (
        <div
          className={`mb-4 rounded-xl border p-4 ${
            data.alreadyAccepted || resultMessage?.type === "success"
              ? "border-[color-mix(in_oklch,var(--jm-success-fg)_30%,transparent)] bg-[var(--jm-success-bg)] text-[var(--jm-success-fg)]"
              : "border-[var(--jm-border)] bg-[var(--jm-surface-muted)] text-[var(--jm-text)]"
          }`}
        >
          <div className="flex items-start gap-2">
            {data.alreadyAccepted ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 size-5 shrink-0" />
            )}
            <div>
              <div className="text-jm-base font-semibold">
                {data.alreadyAccepted ? "이미 수락된 발주입니다" : resultMessage?.text}
              </div>
              {data.alreadyAccepted && data.acceptedAt && (
                <div className="mt-0.5 text-jm-xs opacity-80">
                  수락 시각: {new Date(data.acceptedAt).toLocaleString("ko-KR")}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 발주자 (우리) */}
      {data.issuer && (
        <JmCard className="mb-4">
          <JmCardHeader>
            <JmCardTitle>발주자</JmCardTitle>
          </JmCardHeader>
          <JmCardContent className="space-y-1.5 text-jm-sm">
            <Row label="상호" value={data.issuer.name} bold />
            {data.issuer.ceo && <Row label="대표자" value={data.issuer.ceo} />}
            {data.issuer.phone && <Row label="연락처" value={data.issuer.phone} mono />}
            {data.issuer.address && <Row label="주소" value={data.issuer.address} />}
            {data.issuer.email && <Row label="이메일" value={data.issuer.email} />}
          </JmCardContent>
        </JmCard>
      )}

      {/* 수신자 (거래처) */}
      <JmCard className="mb-4">
        <JmCardHeader>
          <JmCardTitle>수신자 (귀사)</JmCardTitle>
        </JmCardHeader>
        <JmCardContent className="space-y-1.5 text-jm-sm">
          <Row label="상호" value={data.supplier.name} bold />
          {data.supplier.representative && <Row label="대표자" value={data.supplier.representative} />}
          {data.supplier.businessNumber && (
            <Row label="사업자번호" value={data.supplier.businessNumber} mono />
          )}
        </JmCardContent>
      </JmCard>

      {/* 항목 */}
      <JmCard className="mb-4 overflow-hidden p-0">
        <JmCardHeader>
          <JmCardTitle>발주 항목 ({data.items.length}건)</JmCardTitle>
        </JmCardHeader>
        <div className="divide-y divide-[var(--jm-border)] border-t border-[var(--jm-border)]">
          {data.items.map((it) => {
            const original = parseFloat(it.unitPrice);
            const eff = effectiveUnitPrice(it);
            const lineTotal = eff * parseFloat(it.quantity);
            const changed =
              priceMode &&
              editingPrices[it.id] !== undefined &&
              parseFloat(editingPrices[it.id]) !== original;
            const proposed =
              !priceMode && it.proposedUnitPrice && parseFloat(it.proposedUnitPrice) !== original;
            const renderDelta = (newVal: number, size: "xs" | "2xs" = "2xs") => {
              const d = newVal - original;
              const pct = original !== 0 ? (d / original) * 100 : 0;
              const cls =
                d > 0
                  ? "text-[var(--jm-danger-fg)]"
                  : d < 0
                    ? "text-[var(--jm-success-fg)]"
                    : "text-[var(--jm-text-muted)]";
              return (
                <div className={`flex items-baseline justify-end gap-2 text-jm-${size}`}>
                  <span className="text-[var(--jm-text-muted)] line-through">
                    ₩{original.toLocaleString("ko-KR")}
                  </span>
                  <span className={cls}>
                    {d > 0 ? "+" : d < 0 ? "−" : ""}₩{Math.abs(d).toLocaleString("ko-KR")} (
                    {pct > 0 ? "+" : pct < 0 ? "−" : ""}
                    {Math.abs(pct).toFixed(1)}%)
                  </span>
                </div>
              );
            };
            return (
              <div key={it.id} className="space-y-2.5 px-4 py-3">
                {/* 품명 + 품번 + 가격 미정 배지 */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[var(--jm-text)]">{it.name}</div>
                    {it.spec && (
                      <div className="text-jm-xs text-[var(--jm-text-muted)]">{it.spec}</div>
                    )}
                    {it.priceUndetermined && (
                      <div className="mt-1 inline-flex items-center rounded-md bg-[var(--jm-warning-bg)] px-1.5 py-0.5 text-jm-2xs font-medium text-[var(--jm-warning-fg)]">
                        가격 미정 — 단가 제안 필요
                      </div>
                    )}
                  </div>
                  {it.supplierCode && (
                    <JmBadge variant="outline" shape="square" size="sm" className="shrink-0">
                      {it.supplierCode}
                    </JmBadge>
                  )}
                </div>

                {/* 수량 */}
                <div className="flex items-baseline justify-between text-jm-sm">
                  <span className="text-[var(--jm-text-muted)]">수량</span>
                  <span className="tabular-nums text-[var(--jm-text)]">
                    {parseFloat(it.quantity).toLocaleString("ko-KR")} {it.unitOfMeasure}
                  </span>
                </div>

                {/* 단가 */}
                {priceMode ? (
                  <div className="space-y-1.5">
                    <div className="text-jm-sm text-[var(--jm-text-muted)]">단가</div>
                    <JmNumberInput
                      size="sm"
                      prefix="₩"
                      className="w-full"
                      value={editingPrices[it.id] ?? ""}
                      onValueChange={(v) =>
                        setEditingPrices((prev) => ({ ...prev, [it.id]: v }))
                      }
                    />
                    {changed && renderDelta(parseFloat(editingPrices[it.id]))}
                  </div>
                ) : it.priceUndetermined ? (
                  <div className="flex items-baseline justify-between text-jm-sm">
                    <span className="text-[var(--jm-text-muted)]">단가</span>
                    <span className="font-semibold text-[var(--jm-warning-fg)]">가격 미정</span>
                  </div>
                ) : proposed ? (
                  <div className="space-y-1">
                    <div className="flex items-baseline justify-between text-jm-sm">
                      <span className="text-[var(--jm-text-muted)]">단가</span>
                      <span className="font-bold tabular-nums text-[var(--jm-info-fg)]">
                        ₩{parseFloat(it.proposedUnitPrice!).toLocaleString("ko-KR")}
                      </span>
                    </div>
                    {renderDelta(parseFloat(it.proposedUnitPrice!))}
                  </div>
                ) : (
                  <div className="flex items-baseline justify-between text-jm-sm">
                    <span className="text-[var(--jm-text-muted)]">단가</span>
                    <span className="tabular-nums text-[var(--jm-text)]">
                      ₩{original.toLocaleString("ko-KR")}
                    </span>
                  </div>
                )}

                {/* 금액 (강조) */}
                <div className="flex items-baseline justify-between border-t border-[var(--jm-border)] pt-2 text-jm-sm">
                  <span className="text-[var(--jm-text-muted)]">금액</span>
                  <span className="font-bold tabular-nums text-[var(--jm-text)]">
                    {it.priceUndetermined ? (
                      <span className="text-[var(--jm-warning-fg)]">미정</span>
                    ) : (
                      `₩${Math.round(lineTotal).toLocaleString("ko-KR")}`
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="space-y-1 border-t border-[var(--jm-border)] bg-[var(--jm-surface-muted)] px-4 py-3 text-jm-sm">
          <Row label="공급가액" value={`₩${Math.round(subtotal).toLocaleString("ko-KR")}`} tabular />
          <Row label="부가세 (10%)" value={`₩${tax.toLocaleString("ko-KR")}`} tabular />
          <div className="mt-1 flex items-baseline justify-between border-t border-[var(--jm-border)] pt-2">
            <span className="font-semibold text-[var(--jm-text)]">합계</span>
            <span className="text-jm-lg font-bold tabular-nums text-[var(--jm-text)]">
              ₩{grandTotal.toLocaleString("ko-KR")}
            </span>
          </div>
          {showDelta && (() => {
            const cls = subtotalDiff > 0
              ? "text-[var(--jm-danger-fg)]"
              : subtotalDiff < 0
                ? "text-[var(--jm-success-fg)]"
                : "text-[var(--jm-text-muted)]";
            return (
              <div className="flex items-baseline justify-between border-t border-[var(--jm-border)] pt-1.5 text-jm-2xs text-[var(--jm-text-muted)]">
                <span>변경 폭 (공급가액)</span>
                <span className={`tabular-nums ${cls}`}>
                  {subtotalDiff > 0 ? "+" : "−"}₩{Math.abs(Math.round(subtotalDiff)).toLocaleString("ko-KR")}
                  {" · "}
                  {subtotalPct > 0 ? "+" : "−"}{Math.abs(subtotalPct).toFixed(1)}%
                </span>
              </div>
            );
          })()}
        </div>
      </JmCard>

      {/* COUNTER_OFFER 상태 안내 — 거래처가 단가 변경 요청 보낸 후 */}
      {isCounterOffer && !isProcessed && (
        <JmCard className="mb-4 border-[color-mix(in_oklch,var(--jm-info-fg)_30%,transparent)] bg-[var(--jm-info-bg)] p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-[var(--jm-info-fg)]" />
            <div className="text-jm-sm text-[var(--jm-info-fg)]">
              <div className="font-semibold">단가 변경 요청 전송됨</div>
              <div className="mt-0.5 opacity-90">
                발주처에서 검토 중입니다. 검토 결과는 별도 안내됩니다.
              </div>
            </div>
          </div>
        </JmCard>
      )}

      {/* 협상 결과 — 우리(발주자)가 수락/거절한 후 */}
      {(proposalAccepted || proposalRejected) && (
        <JmCard
          className={`mb-4 p-4 ${
            proposalAccepted
              ? "border-[color-mix(in_oklch,var(--jm-success-fg)_30%,transparent)] bg-[var(--jm-success-bg)]"
              : "border-[color-mix(in_oklch,var(--jm-danger-fg)_30%,transparent)] bg-[var(--jm-danger-bg)]"
          }`}
        >
          <div className="flex items-start gap-2">
            {proposalAccepted ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--jm-success-fg)]" />
            ) : (
              <XCircle className="mt-0.5 size-5 shrink-0 text-[var(--jm-danger-fg)]" />
            )}
            <div className={`text-jm-sm ${proposalAccepted ? "text-[var(--jm-success-fg)]" : "text-[var(--jm-danger-fg)]"}`}>
              <div className="font-semibold">
                {proposalAccepted ? "단가 변경 요청이 수락되었습니다" : "단가 변경 요청이 거절되었습니다"}
              </div>
              {proposalRespondedAt && (
                <div className="mt-0.5 text-jm-2xs opacity-80">
                  응답 시각: {new Date(proposalRespondedAt).toLocaleString("ko-KR")}
                </div>
              )}
              {proposalRejected && rejectionNote && (
                <div className="mt-2 rounded-md bg-[color-mix(in_oklch,var(--jm-danger-fg)_15%,transparent)] px-2 py-1.5 text-jm-xs">
                  거절 사유: {rejectionNote}
                </div>
              )}
              {proposalAccepted && (
                <div className="mt-1 opacity-90">
                  제안하신 단가가 적용되었습니다. 발주가 정식으로 수락 처리되었습니다.
                </div>
              )}
              {proposalRejected && (
                <div className="mt-1 opacity-90">
                  제안 단가는 적용되지 않았습니다. 발주처와 별도로 협의해주세요.
                </div>
              )}
            </div>
          </div>
        </JmCard>
      )}

      {/* 모드별 인라인 UI (priceMode 안내 / 거절 사유 textarea) */}
      {!isProcessed && !isCounterOffer && priceMode && (
        <JmCard className="p-4">
          <p className="text-jm-sm font-medium text-[var(--jm-text)]">
            위 표에서 변경할 단가를 입력하세요. 변경된 항목만 발주처에 전송됩니다.
          </p>
        </JmCard>
      )}
      {!isProcessed && !isCounterOffer && showRejectForm && (
        <JmCard className="space-y-3 p-4">
          <p className="text-jm-sm font-medium text-[var(--jm-text)]">거절 사유 (선택)</p>
          <JmTextarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="예) 재고 부족, 가격 재협상 필요 등"
            rows={3}
            maxLength={500}
          />
        </JmCard>
      )}

      {/* 가격 미정 안내 — 수락 차단 사유 명시 */}
      {!isProcessed && !isCounterOffer && hasUndetermined && !priceMode && !showRejectForm && (
        <JmCard className="border-[color-mix(in_oklch,var(--jm-warning-fg)_30%,transparent)] bg-[var(--jm-warning-bg)] p-4">
          <div className="flex items-start gap-2 text-jm-sm text-[var(--jm-warning-fg)]">
            <AlertCircle className="mt-0.5 size-5 shrink-0" />
            <div>
              <div className="font-semibold">가격 미정 라인이 있어 수락할 수 없습니다</div>
              <div className="mt-0.5 opacity-90">
                [단가 변경 요청] 으로 정확한 단가를 제안해주세요. 발주처가 단가를 수락하면 다시
                보내드릴 발주서에서 [수락] 으로 진행하실 수 있습니다.
              </div>
            </div>
          </div>
        </JmCard>
      )}

      <p className="mt-6 text-center text-jm-2xs text-[var(--jm-text-subtle)]">
        링크 만료: {new Date(data.expiresAt).toLocaleString("ko-KR")}
      </p>

      {/* 하단 고정 액션 바 — 발주번호·발주일 + 버튼 한 줄 */}
      {!isProcessed && !isCounterOffer && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--jm-border)] bg-[var(--jm-bg)] shadow-[0_-4px_12px_rgba(0,0,0,0.05)]"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="mx-auto max-w-3xl px-3 py-3 sm:px-4">
            {priceMode ? (
              <div className="flex gap-1.5 sm:gap-2">
                <JmButton
                  size="md"
                  variant="ghost"
                  className="flex-1 min-w-0 px-2 sm:px-5"
                  onClick={() => {
                    setPriceMode(false);
                    setEditingPrices({});
                  }}
                  disabled={proposeMutation.isPending}
                >
                  취소
                </JmButton>
                <JmButton
                  size="md"
                  className="flex-1 min-w-0 px-2 sm:px-5"
                  onClick={submitProposal}
                  disabled={proposeMutation.isPending}
                >
                  {proposeMutation.isPending && <Loader2 className="animate-spin" />}
                  변경 요청 전송
                </JmButton>
              </div>
            ) : showRejectForm ? (
              <div className="flex gap-1.5 sm:gap-2">
                <JmButton
                  size="md"
                  variant="ghost"
                  className="flex-1 min-w-0 px-2 sm:px-5"
                  onClick={() => {
                    setShowRejectForm(false);
                    setRejectNote("");
                  }}
                  disabled={rejectMutation.isPending}
                >
                  취소
                </JmButton>
                <JmButton
                  size="md"
                  variant="danger"
                  className="flex-1 min-w-0 px-2 sm:px-5"
                  onClick={() => rejectMutation.mutate()}
                  disabled={rejectMutation.isPending}
                >
                  {rejectMutation.isPending && <Loader2 className="animate-spin" />}
                  거절 확정
                </JmButton>
              </div>
            ) : (
              <div className="flex gap-1.5 sm:gap-2">
                {!hasUndetermined && (
                  <JmButton
                    size="md"
                    className="flex-1 min-w-0 px-2 sm:px-5"
                    onClick={() => {
                      setAcceptShipping(isPickupPreset ? "PICKUP" : null);
                      setAcceptDate("");
                      setAcceptMemo("");
                      setAcceptOpen(true);
                    }}
                    disabled={acceptMutation.isPending}
                  >
                    수락
                  </JmButton>
                )}
                <JmButton
                  size="md"
                  variant="outline"
                  className="flex-1 min-w-0 px-2 sm:px-5"
                  onClick={startPriceEdit}
                  disabled={acceptMutation.isPending}
                >
                  단가 변경
                </JmButton>
                <JmButton
                  size="md"
                  variant="ghost"
                  className="flex-1 min-w-0 px-2 sm:px-5"
                  onClick={() => setShowRejectForm(true)}
                  disabled={acceptMutation.isPending}
                >
                  거절
                </JmButton>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 수락 모달 — 출고 방법 + 납기일 + 메모 */}
      <JmDialog open={acceptOpen} onOpenChange={setAcceptOpen}>
        <JmDialogContent size="md">
          <JmDialogHeader>
            <JmDialogTitle>발주 수락</JmDialogTitle>
          </JmDialogHeader>
          <JmDialogBody className="space-y-4">
            {isPickupPreset ? (
              <div className="rounded-lg border border-[var(--jm-border)] bg-[var(--jm-info-bg)] p-3 text-jm-sm text-[var(--jm-info-fg)]">
                <div className="font-semibold">매장이 직접 수령 (픽업) 으로 요청했습니다</div>
                <div className="mt-1 opacity-90">
                  출고 가능일만 알려주세요. 메모에 시간대·연락처 등을 자유롭게 적으셔도 됩니다.
                </div>
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-jm-sm font-medium text-[var(--jm-text)]">
                  출고 방법
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {SUPPLIER_SHIPPING_OPTIONS.map((m) => {
                    const selected = acceptShipping === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setAcceptShipping(m)}
                        className={`rounded-lg border px-3 py-2.5 text-jm-sm font-medium transition-colors ${
                          selected
                            ? "border-[var(--jm-action)] bg-[var(--jm-action)] text-[var(--jm-action-fg)]"
                            : "border-[var(--jm-border)] bg-[var(--jm-surface)] text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)]"
                        }`}
                      >
                        {SHIPPING_LABELS[m]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-jm-sm font-medium text-[var(--jm-text)]">
                {isPickupPreset ? "출고 가능일" : "납기일"}
              </label>
              <JmInput
                type="date"
                value={acceptDate}
                onChange={(e) => setAcceptDate(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-jm-sm font-medium text-[var(--jm-text)]">
                메모 (선택)
              </label>
              <JmTextarea
                value={acceptMemo}
                onChange={(e) => setAcceptMemo(e.target.value)}
                placeholder="예) 송장번호, 배달 시간대, 외부 업체명·연락처 등"
                rows={2}
                maxLength={500}
              />
            </div>
          </JmDialogBody>
          <JmDialogFooter>
            <JmButton
              variant="ghost"
              onClick={() => setAcceptOpen(false)}
              disabled={acceptMutation.isPending}
            >
              취소
            </JmButton>
            <JmButton
              onClick={() => {
                const method = isPickupPreset ? "PICKUP" : acceptShipping;
                if (!method) {
                  toast.error("출고 방법을 선택해주세요");
                  return;
                }
                if (!acceptDate) {
                  toast.error(isPickupPreset ? "출고 가능일을 선택해주세요" : "납기일을 선택해주세요");
                  return;
                }
                acceptMutation.mutate({
                  shippingMethod: method,
                  promisedDate: acceptDate,
                  shippingMemo: acceptMemo.trim() || null,
                });
              }}
              disabled={acceptMutation.isPending}
            >
              {acceptMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              수락 확정
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  tabular,
  bold,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tabular?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[var(--jm-text-muted)]">{label}</span>
      <span
        className={[
          mono ? "font-[family-name:var(--jm-font-mono)]" : "",
          tabular ? "tabular-nums" : "",
          bold ? "font-bold text-[var(--jm-text)]" : "text-[var(--jm-text)]",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

function ErrorScreen({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <JmCard className="p-8 text-center">
        <div
          className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full"
          style={{ background: "var(--jm-danger-bg)" }}
        >
          <AlertCircle className="size-6" style={{ color: "var(--jm-danger-fg)" }} />
        </div>
        <h1 className="mb-2 text-jm-lg font-semibold text-[var(--jm-text)]">{title}</h1>
        <p className="text-jm-sm text-[var(--jm-text-muted)]">{message}</p>
      </JmCard>
    </div>
  );
}
