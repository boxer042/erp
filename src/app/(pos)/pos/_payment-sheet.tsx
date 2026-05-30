"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { JmDatePicker, JmSpinner } from "@/jm";
import { Building2, ChevronRight, Clock, Pencil, Info, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiMutate } from "@/lib/api-client";
import { formatComma, parseComma } from "@/lib/utils";
import { useSessions, type CartSession } from "@/components/pos/sessions-context";
import { calcCartTotals } from "@/components/pos/cart-helpers";
import { submitCheckout } from "@/components/pos/checkout-submit";
import {
  PaymentMethodSelector,
  type PaymentMethod,
} from "@/components/pos/payment-method-selector";
import {
  PartialPaymentTile,
  type PartialPayment,
} from "@/components/pos/partial-payment-tile";
import {
  deriveTempCode,
  deriveTempColor,
} from "@/components/pos/temp-customer";
import { BottomSheet } from "./_components/bottom-sheet";
import { PriceInputDialog } from "./_components/price-input-dialog";
import { DateTimePickerSheet } from "./_components/datetime-picker-sheet";
import { issueStatement } from "./_issue-document";

type FulfillmentType =
  | "IN_STORE"
  | "PICKUP"
  | "DELIVERY"
  | "QUICK"
  | "SHIPPING";
const FULFILLMENT_OPTIONS: { value: FulfillmentType; label: string; sub: string }[] = [
  { value: "IN_STORE", label: "매장판매", sub: "즉시 인도 · 종결" },
  { value: "PICKUP", label: "픽업 대기", sub: "추후 방문 수령" },
  { value: "DELIVERY", label: "배달", sub: "자체 배달" },
  { value: "QUICK", label: "퀵", sub: "퀵 호출 · 매장 부담" },
  { value: "SHIPPING", label: "택배", sub: "ERP 출고 워크보드" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  session: CartSession;
  /** 결제 완료 — 부모가 영수증/라벨/거래명세표 출력 선택 다이얼로그 + 모달 처리.
   *  statementId 는 등록 고객일 때만 (자동 발행됨). */
  onPaymentSuccess: (info: {
    orderId: string;
    orderNo: string;
    labelCodes: string[];
    /** 기존 시리얼 보유 수리 라벨 — 결제 후 [재출력 포함] 옵션에서 사용 */
    reprintCandidates: {
      code: string;
      ticketNo: string;
      displayName: string;
    }[];
    statementId: string | null;
  }) => void;
  /** 고객 썸네일 카드 클릭 — 부모가 CustomerActionSheet 띄우도록 (재사용) */
  onCustomerClick?: () => void;
  /** 미등록 고객 회원등록 유도 — 부모가 QuickCustomerSheet 띄우도록 */
  onCreateCustomer?: () => void;
  /** 좌상단 뒤로가기 — 부모가 카트 시트로 복귀시킴 */
  onBack?: () => void;
}

/**
 * 결제 시트의 고객 카드 — 임대 시트 CustomerCard 와 동일한 시각 패턴.
 * 미등록: temp palette + #코드 / 등록: 첫글자 + 이름/전화.
 * required=true 면 미등록일 때 "연결 필요" amber 보조 문구 노출.
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
      <span className="text-jm-3xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
        고객
      </span>
      <div className="flex min-w-0 items-center gap-2.5">
        {isRegistered ? (
          session.customerType === "BUSINESS" ? (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--jm-warning-bg)] text-[var(--jm-warning-fg)]">
              <Building2 className="size-[18px]" />
            </div>
          ) : (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--jm-surface-muted)] text-jm-md font-bold text-[var(--jm-text)]">
              {(session.customerName ?? "?").charAt(0)}
            </div>
          )
        ) : (
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-full text-white ${palette.bg}`}
          >
            <span className="font-mono text-jm-xs font-bold tracking-wider">
              {code}
            </span>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          {isRegistered ? (
            <>
              <div className="flex items-center gap-1">
                {session.customerType === "BUSINESS" && (
                  <span className="rounded-full bg-[var(--jm-warning-bg)] px-1.5 py-0 text-jm-4xs font-semibold text-[var(--jm-warning-fg)]">
                    기업
                  </span>
                )}
                <span className="line-clamp-1 text-jm-base font-semibold text-[var(--jm-text)]">
                  {session.customerName}
                </span>
              </div>
              {session.customerType === "BUSINESS" &&
              session.customerBusinessNumber ? (
                <span className="line-clamp-1 font-mono text-jm-2xs text-[var(--jm-text-muted)]">
                  {session.customerBusinessNumber}
                </span>
              ) : session.customerPhone ? (
                <span className="line-clamp-1 font-mono text-jm-2xs text-[var(--jm-text-muted)]">
                  {session.customerPhone}
                </span>
              ) : null}
            </>
          ) : (
            <>
              <span className="line-clamp-1 text-jm-base font-semibold text-[var(--jm-text)]">
                미등록 고객
              </span>
              <span className="font-mono text-jm-2xs text-[var(--jm-text-muted)]">#{code}</span>
              {required && (
                <span className="line-clamp-1 text-jm-2xs text-[var(--jm-warning-fg)]">
                  연결 필요
                </span>
              )}
            </>
          )}
        </div>
        {onClick && (
          <ChevronRight className="size-3.5 shrink-0 text-[var(--jm-text-disabled)]" aria-hidden />
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
 * 결제시간 카드 — 시트 마운트 시각이 기본. 카드 클릭으로 과거 시점으로 수정 가능.
 * 시간대별 매출 트래픽 분석용 Order.orderDate 로 저장. 미래는 허용 안 함.
 */
function CheckoutAtCard({
  at,
  onChange,
}: {
  at: Date;
  onChange: (next: Date) => void;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setEditorOpen(true)}
        className="flex w-full flex-col gap-1.5 rounded-2xl bg-[var(--jm-bg)] px-4 py-3 text-left transition-colors active:bg-[var(--jm-surface-muted)] sm:hover:bg-[var(--jm-surface-muted)]"
      >
        <span className="text-jm-3xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
          결제시간
        </span>
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)]">
            <Clock className="size-[18px]" aria-hidden />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-jm-base font-semibold tabular-nums text-[var(--jm-text)]">
              {format(at, "HH:mm")}
            </span>
            <span className="font-mono text-jm-2xs text-[var(--jm-text-muted)]">
              {format(at, "M월 d일 (eee)", { locale: ko })}
            </span>
          </div>
          <Pencil className="size-3.5 shrink-0 text-[var(--jm-text-subtle)]" aria-hidden />
        </div>
      </button>
      {editorOpen && (
        <DateTimePickerSheet
          value={at}
          onConfirm={(next) => {
            onChange(next);
            setEditorOpen(false);
          }}
          onClose={() => setEditorOpen(false)}
          title="결제시간 변경"
        />
      )}
    </>
  );
}

/**
 * 결제 시트 — 다크 합계 + 결제수단 + checkout API 호출 + 라벨 자동 발번.
 *
 * 고객 등록 강제: 임대/수리 라인이 있거나 외상 결제 시 고객 연결 필수 (통계/추적).
 * Skip 옵션: 정말 등록하기 싫은 고객 케이스를 위해 "등록 없이 진행" 작은 링크 노출.
 */
export function PaymentSheet({
  open,
  onOpenChange,
  session,
  onPaymentSuccess,
  onCustomerClick,
  onCreateCustomer,
  onBack,
}: Props) {
  if (!open) return null;
  return (
    <Body
      onOpenChange={onOpenChange}
      session={session}
      onPaymentSuccess={onPaymentSuccess}
      onCustomerClick={onCustomerClick}
      onCreateCustomer={onCreateCustomer}
      onBack={onBack}
    />
  );
}

function Body({
  onOpenChange,
  session,
  onPaymentSuccess,
  onCustomerClick,
  onCreateCustomer,
  onBack,
}: Omit<Props, "open">) {
  const { setSessionLabels } = useSessions();
  const [method, setMethod] = useState<PaymentMethod>("CARD");
  // 부분 결제 — 즉시 결제 금액 + 종류 (DEPOSIT/PARTIAL). null/totalAmount 와 같으면 전액 결제.
  const [partial, setPartial] = useState<PartialPayment>({
    paidAmount: null,
    kind: null,
  });
  // 고객 등록 우회 — "이 고객은 등록 없이 진행" 클릭 시 true. 통계 데이터 안 쌓이는 단점 있음.
  const [skipCustomerLink, setSkipCustomerLink] = useState(false);
  // 미등록 고객 결제 가로채기 — 결제 직전 회원등록 유도 다이얼로그
  const [registerPromptOpen, setRegisterPromptOpen] = useState(false);
  // 세금계산서 발행 요청 — Order.taxInvoiceRequested 로 저장 (사장님이 추후 발행)
  const [taxInvoiceRequested, setTaxInvoiceRequested] = useState(false);
  // 결제시간 — 시트가 열린 순간 기본. 사용자가 CheckoutAtCard 탭하면 과거 시점으로 수정 가능.
  // 미래 시점은 picker 자체에서 차단 (toDate=today). Order.orderDate 로 저장.
  const [paymentAt, setPaymentAt] = useState(() => new Date());
  // 출고 방식 — 매장판매(즉시 종결) / 픽업대기(워크보드) / 배달 / 택배. 수리·임대 라인이 있으면 IN_STORE 강제.
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>("IN_STORE");
  const [shippingRecipientName, setShippingRecipientName] = useState("");
  const [shippingRecipientPhone, setShippingRecipientPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  // 배송비 결제 방식 — DELIVERY/SHIPPING 일 때만 의미. 기본 선불 (자사몰/일반 POS 흐름).
  const [shippingPaymentType, setShippingPaymentType] = useState<
    "PREPAID" | "COD" | "STORE_BURDEN"
  >("PREPAID");
  // 배송 원가(매장 지불) — 우리가 낸 퀵비·택배비. 손님 청구와 독립적 (복합 케이스 가능),
  // 마진에서만 차감. 입력값은 net(세전) — PriceInputDialog 가 net 반환.
  const [shippingCostBorne, setShippingCostBorne] = useState("");
  const [shipCostDialogOpen, setShipCostDialogOpen] = useState(false);
  // 발송 예정일 — 기본 주문일+1 (서버 자동값과 동일). DELIVERY/QUICK/SHIPPING 만 사용.
  const [expectedShipDate, setExpectedShipDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return format(d, "yyyy-MM-dd");
  });
  // 착불(COD) 로 전환 시 매장 부담 금액 자동 리셋 — 착불은 매장 회계 무관
  useEffect(() => {
    if (shippingPaymentType === "COD") setShippingCostBorne("");
  }, [shippingPaymentType]);

  // 결제 대상 = 상품 + 임대 + 수리(미연결: repairTicketId 없는 즉석 수리). 수리는 자체 픽업 흐름이 별도라
  // RepairTicket 픽업은 RepairDetail 의 PickupSheet 에서 처리. 여기선 카트 라인만.
  const productItems = session.items.filter((i) => i.itemType === "product");
  const rentalItems = session.items.filter((i) => i.itemType === "rental");
  const repairItems = session.items.filter((i) => i.itemType === "repair");
  const allItems = [...productItems, ...rentalItems, ...repairItems];
  const totals = calcCartTotals({ ...session, items: allItems });

  const hasRentalOrRepair = rentalItems.length > 0 || repairItems.length > 0;
  // 출고 방식 토글 노출 여부 — 임대만 매장 인도 강제 (자산 인계·보증금 정산이 매장에서 일어나야 함).
  // 수리는 배달/택배 허용 (수리 끝난 기기를 손님이 배송으로 받는 케이스가 종종 발생).
  const fulfillmentLocked = rentalItems.length > 0;
  const effectiveFulfillment: FulfillmentType = fulfillmentLocked ? "IN_STORE" : fulfillmentType;
  // 매장 인도(IN_STORE/PICKUP)는 배송정보 불필요
  const needsShippingInfo =
    effectiveFulfillment !== "IN_STORE" && effectiveFulfillment !== "PICKUP";
  // 모든 결제는 고객 등록을 권장 (통계/추적). skip 활성화 시 우회.
  const needsCustomer = !session.customerId && !skipCustomerLink;
  const requiresCustomer = hasRentalOrRepair && needsCustomer;
  const requiresCustomerForUnpaid =
    method === "UNPAID" && !session.customerId && !skipCustomerLink;
  // 변형/옵션 미확정 라인 — canonical(변형 미선택) 또는 OPTION_PARENT(SWAP 미선택) 그대로 결제 불가
  const unresolvedVariants = session.items.filter(
    (i) => (i.isCanonical || i.isOptionParent) && i.productId,
  );
  const hasUnresolvedVariant = unresolvedVariants.length > 0;

  const checkoutMutation = useMutation<
    {
      id: string;
      no: string;
      labelCodes: string[];
      reprintCandidates: {
        code: string;
        ticketNo: string;
        displayName: string;
      }[];
      oversoldLines?: { name: string; deficitQty: number }[];
    },
    Error
  >({
    mutationFn: async () => {
      if (requiresCustomer) {
        throw new Error("임대/수리는 고객 연결이 필요합니다");
      }
      if (method === "UNPAID" && !session.customerId && !skipCustomerLink) {
        throw new Error("외상은 고객 연결이 필요합니다");
      }
      if (hasUnresolvedVariant) {
        throw new Error(
          `변형 미확정 라인 ${unresolvedVariants.length}건 — 카트에서 먼저 변형을 선택하세요`,
        );
      }
      if (needsShippingInfo) {
        if (!shippingAddress.trim()) {
          throw new Error("배송지를 입력해주세요");
        }
        if (!shippingRecipientPhone.trim()) {
          throw new Error("받는 사람 연락처를 입력해주세요");
        }
      }

      // 1) 라벨 자동 발번 — 상품(trackable) + 수리. API 가 신규/기존 자동 분기:
      //    · 시리얼 미발번 수리 → 신규 발번 (newlyIssued: true) → labelCodes 에 포함
      //    · 시리얼 이미 있는 수리 → 신규 발번 안 함, 기존 코드 반환 (newlyIssued: false)
      //      → reprintCandidates 에 모아 결제 후 다이얼로그에서 "재출력 포함" 옵션 노출
      let labelCodes: string[] = [];
      let reprintCandidates: {
        code: string;
        ticketNo: string;
        displayName: string;
      }[] = [];
      const trackableCandidates = productItems
        .filter((i) => i.productId)
        .map((i) => ({ productId: i.productId!, quantity: Math.max(1, Math.round(i.quantity)) }));
      const repairTicketIds = repairItems
        .map((i) => i.repairMeta?.repairTicketId)
        .filter((v): v is string => !!v);

      if (trackableCandidates.length > 0 || repairTicketIds.length > 0) {
        try {
          const res = await apiMutate<{
            labels: {
              code: string;
              newlyIssued: boolean;
              ticketNo: string | null;
              displayName: string;
            }[];
          }>(
            "/api/serial-items/issue",
            "POST",
            {
              customerId: session.customerId ?? null,
              productItems: trackableCandidates,
              repairTicketIds,
            },
          );
          labelCodes = res.labels.filter((l) => l.newlyIssued).map((l) => l.code);
          reprintCandidates = res.labels
            .filter((l) => !l.newlyIssued && l.ticketNo)
            .map((l) => ({
              code: l.code,
              ticketNo: l.ticketNo as string,
              displayName: l.displayName,
            }));
          if (labelCodes.length > 0) {
            setSessionLabels(labelCodes, session.id, session.id);
          }
        } catch {
          // 라벨 실패해도 결제는 진행
        }
      }

      // 2) 결제 — submitCheckout 가 product/rental/repair 모두 처리 (이미 buildCheckoutPayload 가 분기됨)
      const sessionForCheckout: CartSession = labelCodes.length
        ? { ...session, labelCodes, items: allItems }
        : { ...session, items: allItems };
      const result = await submitCheckout(sessionForCheckout, {
        action: "order",
        paymentMethod: method,
        // 부분 결제 — paidAmount<totalAmount 면 PARTIAL_PAID + 잔금 ledger SALE (서버 분기)
        paidAmount: partial.paidAmount,
        partialPaymentKind: partial.kind,
        taxInvoiceRequested,
        fulfillmentType: effectiveFulfillment,
        shippingPaymentType: needsShippingInfo ? shippingPaymentType : undefined,
        shippingCostBorne: needsShippingInfo
          ? parseFloat(parseComma(shippingCostBorne) || "0")
          : undefined,
        shipping: needsShippingInfo
          ? {
              recipientName: shippingRecipientName.trim() || session.customerName,
              recipientPhone: shippingRecipientPhone.trim(),
              address: shippingAddress.trim(),
              expectedShipDate: expectedShipDate || null,
            }
          : undefined,
        checkoutAt: paymentAt,
      });
      return { ...result, labelCodes, reprintCandidates };
    },
    onSuccess: async (data) => {
      // 외상 결제는 미수금 자동 등록됐다는 명시적 안내
      if (method === "UNPAID") {
        toast.success(`외상 등록 — ${data.no}`, {
          description: session.customerName
            ? `${session.customerName} 님 미수금에 추가됐습니다`
            : "미수금에 추가됐습니다",
          duration: 5000,
        });
      } else {
        toast.success(`결제 완료 — ${data.no}`);
      }
      // 적자 출고 경고 — 재고 없이 나간 라인이 있으면 직원에게 명시.
      // 결제는 정상 완료됐지만 시스템 재고가 음수가 됐다는 사후 안내. 실사보정으로 정산 필요.
      if (data.oversoldLines && data.oversoldLines.length > 0) {
        const summary = data.oversoldLines
          .map((l) => `${l.name} (-${l.deficitQty}개)`)
          .join(", ");
        toast.warning("재고 없이 출고됨 — 실사보정 권장", {
          description: summary,
          duration: 8000,
        });
      }
      // 거래명세표 자동 발행 — 등록 고객일 때만 (사업자/B2B 증빙용 DB 기록).
      // 출력 자체는 결제 후 다이얼로그에서 사장님이 선택.
      let statementId: string | null = null;
      if (session.customerId) {
        try {
          // data.id = 방금 생성된 주문 id — 거래명세표를 주문에 연결해
          // 이후 주문 취소 시 거래명세표도 함께 취소되게 한다.
          const stmt = await issueStatement(
            { ...session, items: allItems },
            data.id,
          );
          statementId = stmt.id;
        } catch {
          /* 거래명세표 실패해도 결제는 완료됨 — silent */
        }
      }
      // 서버 세션 즉시 soft delete — 인쇄 모달 진행 중 새로고침해도 세션이 부활하지 않게.
      // 부모의 removeSession 만 호출하면 800ms debounce sync 갭에 새로고침 시 부활 가능.
      // sessions=[] 라 다른 세션은 영향 없음 (route.ts:196 — incoming 중 deletedIds 항목은 skip).
      try {
        await fetch("/api/pos/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessions: [], deletedIds: [session.id] }),
        });
      } catch {
        /* 네트워크 실패 — 부모 removeSession 의 다음 sync 가 재시도 */
      }
      // 결제 시트 닫기. 부모는 onPaymentSuccess 안에서 removeSession(로컬) + 다이얼로그 표시.
      onOpenChange(false);
      onPaymentSuccess({
        orderId: data.id,
        orderNo: data.no,
        labelCodes: data.labelCodes,
        reprintCandidates: data.reprintCandidates,
        statementId,
      });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : err.message || "결제 실패"),
  });

  return (
    <BottomSheet
      open
      onOpenChange={(o) => !checkoutMutation.isPending && onOpenChange(o)}
      title="결제"
      locked={checkoutMutation.isPending}
      onBack={onBack}
      footer={
        <button
          type="button"
          onClick={() => {
            // 미등록 + 등록필수 아님 + skip 안함 + 등록 유도 prop 있음 → 다이얼로그로 가로채기
            if (
              !session.customerId &&
              !skipCustomerLink &&
              !hasRentalOrRepair &&
              method !== "UNPAID" &&
              onCreateCustomer
            ) {
              setRegisterPromptOpen(true);
              return;
            }
            checkoutMutation.mutate();
          }}
          disabled={
            checkoutMutation.isPending ||
            allItems.length === 0 ||
            requiresCustomer ||
            requiresCustomerForUnpaid ||
            hasUnresolvedVariant
          }
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--jm-action)] text-jm-lg font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-60"
        >
          {checkoutMutation.isPending && <Spinner />}₩
          {totals.total.toLocaleString("ko-KR")} 결제
        </button>
      }
    >
      <div className="flex flex-col gap-5 pt-2">
        {/* 다크 합계 카드 */}
        <div className="rounded-2xl bg-[var(--jm-action)] p-5 text-white">
          <div className="text-jm-xs font-semibold uppercase tracking-wider text-white/60">
            결제 금액
          </div>
          <div className="mt-1 text-jm-6xl font-bold tabular-nums leading-none">
            ₩{totals.total.toLocaleString("ko-KR")}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-jm-2xs">
            <Pill label="공급가액" value={totals.net} />
            <Pill label="세액" value={totals.vat} />
            {totals.sessionDiscountAmount > 0 ? (
              <Pill
                label="할인"
                value={-totals.sessionDiscountAmount}
                tone="warn"
              />
            ) : (
              <Pill label="건수" value={allItems.length} suffix="건" />
            )}
          </div>
          {/* 항목 구성 */}
          {(rentalItems.length > 0 || repairItems.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5 text-jm-2xs">
              {productItems.length > 0 && (
                <span className="rounded-full bg-[var(--jm-surface)]/10 px-2.5 py-1">
                  상품 {productItems.length}
                </span>
              )}
              {rentalItems.length > 0 && (
                <span className="rounded-full bg-[var(--jm-surface)]/10 px-2.5 py-1">
                  임대 {rentalItems.length}
                </span>
              )}
              {repairItems.length > 0 && (
                <span className="rounded-full bg-[var(--jm-surface)]/10 px-2.5 py-1">
                  수리 {repairItems.length}
                </span>
              )}
            </div>
          )}
        </div>

        {/* 고객 + 결제시간 — 임대 시트와 동일 2-grid 패턴. 향후 시간대별 매출 트래픽 분석. */}
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2.5">
            <CustomerCard
              session={session}
              onClick={onCustomerClick}
              required={
                !session.customerId &&
                !skipCustomerLink &&
                (hasRentalOrRepair || method === "UNPAID")
              }
            />
            <CheckoutAtCard at={paymentAt} onChange={setPaymentAt} />
          </div>

          {/* 등록 권장 / 필수 안내 — 미등록 + (임대·수리 또는 외상) */}
          {!session.customerId &&
            !skipCustomerLink &&
            (hasRentalOrRepair || method === "UNPAID") && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--jm-warning-bg)] bg-[var(--jm-warning-bg)] px-3 py-2.5">
                <span className="text-jm-2xs text-[var(--jm-warning-fg)]">
                  {hasRentalOrRepair
                    ? "임대/수리 기록 추적을 위해 고객 연결을 권장합니다"
                    : "외상은 미수금 추적을 위해 고객 연결이 필요합니다"}
                </span>
                {/* 외상은 skip 불가 — 미수금 추적 필수 */}
                {method !== "UNPAID" && (
                  <button
                    type="button"
                    onClick={() => setSkipCustomerLink(true)}
                    className="shrink-0 text-jm-2xs font-medium text-[var(--jm-warning-fg)] underline-offset-2 hover:underline"
                  >
                    등록 없이 진행
                  </button>
                )}
              </div>
            )}

          {/* skip 활성 시 안내 */}
          {skipCustomerLink && (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-[var(--jm-bg)] px-3 py-2.5">
              <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                등록 없이 결제 — 통계/이력 추적 안 됨
              </span>
              <button
                type="button"
                onClick={() => setSkipCustomerLink(false)}
                className="shrink-0 text-jm-2xs font-medium text-[var(--jm-text)] underline-offset-2 hover:underline"
              >
                취소
              </button>
            </div>
          )}

          {!session.customerId &&
            !hasRentalOrRepair &&
            method !== "UNPAID" &&
            !skipCustomerLink && (
              <p className="px-1 text-jm-2xs text-[var(--jm-text-subtle)]">
                고객 등록 시 구매 이력·통계가 자동 누적됩니다
              </p>
            )}

          {/* 변형 미확정 — 결제 차단 안내 */}
          {hasUnresolvedVariant && (
            <div className="rounded-xl bg-[var(--jm-warning-bg)] px-4 py-3 text-jm-xs text-[var(--jm-warning-fg)]">
              ⚠ 변형 미확정 <strong>{unresolvedVariants.length}건</strong> — 카트로 돌아가 변형을 선택해주세요
            </div>
          )}

          {/* 세금계산서 요청 토글 — 등록 고객일 때만 (사업자번호 등 기록 필요) */}
          {session.customerId && (
            <button
              type="button"
              onClick={() => setTaxInvoiceRequested((v) => !v)}
              className={`flex items-center justify-between rounded-xl px-4 py-3 text-left transition-colors ${
                taxInvoiceRequested
                  ? "bg-[var(--jm-success-bg)] ring-1 ring-[var(--jm-success-solid)]"
                  : "bg-[var(--jm-bg)] hover:bg-[var(--jm-surface-muted)]"
              }`}
            >
              <div className="flex flex-col">
                <span className="text-jm-sm font-semibold text-[var(--jm-text)]">
                  세금계산서 발행 요청
                </span>
                <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                  결제 후 사장님이 별도 발행
                </span>
              </div>
              <span
                className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${
                  taxInvoiceRequested ? "bg-[var(--jm-success-solid)]" : "bg-[var(--jm-border-strong)]"
                }`}
              >
                <span
                  className={`size-5 rounded-full bg-[var(--jm-surface)] shadow transition-transform ${
                    taxInvoiceRequested ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </span>
            </button>
          )}
        </div>

        {method === "UNPAID" && session.customerId && (
          <div className="flex items-center gap-2 rounded-xl bg-[var(--jm-bg)] px-4 py-3 text-jm-xs text-[var(--jm-text)]">
            <Info className="size-3.5 shrink-0" />
            결제 시 <span className="font-semibold">{session.customerName}</span> 님 미수금에 자동 등록됩니다
          </div>
        )}

        {/* 출고 방식 — 수리/임대 라인이 있으면 PICKUP 강제 (토글 숨김) */}
        {!fulfillmentLocked && (
          <div className="flex flex-col gap-1.5">
            <span className="text-jm-xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
              출고 방식
            </span>
            <div className="grid grid-cols-3 gap-2">
              {FULFILLMENT_OPTIONS.map((opt) => {
                const active = fulfillmentType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFulfillmentType(opt.value)}
                    className={`flex flex-col gap-0.5 rounded-2xl border-2 p-3 text-left transition-colors ${
                      active
                        ? "border-[var(--jm-action)] bg-[var(--jm-bg)]"
                        : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)]"
                    }`}
                  >
                    <span
                      className={`text-jm-base font-semibold ${
                        active ? "text-[var(--jm-text)]" : "text-[var(--jm-text)]"
                      }`}
                    >
                      {opt.label}
                    </span>
                    <span className="text-jm-2xs text-[var(--jm-text-muted)]">{opt.sub}</span>
                  </button>
                );
              })}
            </div>

            {needsShippingInfo && (
              <div className="mt-2 flex flex-col gap-2 rounded-2xl bg-[var(--jm-bg)] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-jm-xs font-semibold text-[var(--jm-text)]">
                    {effectiveFulfillment === "SHIPPING"
                      ? "택배 발송지"
                      : "배달지"}
                  </span>
                  {session.customerId && (session.customerName || session.customerPhone) && (
                    <button
                      type="button"
                      onClick={() => {
                        setShippingRecipientName(session.customerName ?? "");
                        setShippingRecipientPhone(session.customerPhone ?? "");
                      }}
                      className="text-jm-2xs font-medium text-[var(--jm-text)] underline-offset-2 hover:underline"
                    >
                      고객 정보 채우기
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={shippingRecipientName}
                  onChange={(e) => setShippingRecipientName(e.target.value)}
                  placeholder="받는 사람 이름 (선택)"
                  className="h-10 rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 text-jm-sm outline-none focus:border-[var(--jm-border-strong)]"
                />
                <input
                  type="tel"
                  value={shippingRecipientPhone}
                  onChange={(e) => setShippingRecipientPhone(e.target.value)}
                  placeholder="받는 사람 연락처 *"
                  className="h-10 rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 text-jm-sm outline-none focus:border-[var(--jm-border-strong)]"
                />
                <textarea
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  placeholder="주소 *"
                  rows={2}
                  className="resize-none rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 py-2 text-jm-sm outline-none focus:border-[var(--jm-border-strong)]"
                />
                {/* 발송 예정일 — 출고 워크보드 지연/오늘/이번주 분류 기준 */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
                    발송 예정일
                  </span>
                  <JmDatePicker
                    size="sm"
                    value={(() => {
                      if (!expectedShipDate) return undefined;
                      const [y, m, d] = expectedShipDate.split("-").map(Number);
                      return y && m && d ? new Date(y, m - 1, d) : undefined;
                    })()}
                    onChange={(d) =>
                      setExpectedShipDate(d ? format(d, "yyyy-MM-dd") : "")
                    }
                    fromDate={(() => {
                      const t = new Date();
                      t.setHours(0, 0, 0, 0);
                      return t;
                    })()}
                    placeholder="발송일 선택"
                  />
                </div>
                {/* 배송비 결제 방식 — 선불 / 착불 / 매장 부담 */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
                    배송비
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { value: "PREPAID" as const, label: "선불", sub: "결제 시 함께" },
                        { value: "COD" as const, label: "착불", sub: "받는 사람 부담" },
                        { value: "STORE_BURDEN" as const, label: "무료", sub: "매장 부담 (회계 비용)" },
                      ]
                    ).map((opt) => {
                      const active = shippingPaymentType === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setShippingPaymentType(opt.value)}
                          className={`flex flex-col items-start gap-0.5 rounded-xl border px-2.5 py-2 text-left transition-colors ${
                            active
                              ? "border-[var(--jm-action)] bg-[var(--jm-bg)]"
                              : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)]"
                          }`}
                        >
                          <span className="text-jm-xs font-semibold text-[var(--jm-text)]">
                            {opt.label}
                          </span>
                          <span className="text-jm-3xs text-[var(--jm-text-muted)]">
                            {opt.sub}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* 배송 원가 (매장 지불) — 착불 제외 (착불은 매장 회계 무관) */}
                {shippingPaymentType !== "COD" && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
                      배송 원가 (매장 지불)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShipCostDialogOpen(true)}
                      className="flex h-10 items-center justify-between rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 text-jm-sm text-[var(--jm-text)] outline-none transition-colors hover:border-[var(--jm-border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--jm-ring)]"
                    >
                      <span className="tabular-nums">
                        {parseFloat(shippingCostBorne || "0") > 0
                          ? `₩${Math.round(parseFloat(shippingCostBorne) * 1.1).toLocaleString("ko-KR")}`
                          : "—"}
                      </span>
                      <span className="text-jm-3xs text-[var(--jm-text-muted)]">
                        수정
                      </span>
                    </button>
                    <span className="text-jm-3xs text-[var(--jm-text-muted)]">
                      손님 청구(배송비)와 독립 — 복합 케이스(손님 일부 + 매장
                      일부) 가능. <strong>매장 부담분만</strong> 입력 →
                      마진에서 차감.
                    </span>
                  </div>
                )}
                <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                  결제 후 ERP <strong>출고 워크보드</strong>로 자동 진입합니다
                </span>
              </div>
            )}
          </div>
        )}

        {/* 결제수단 — 공용 컴포넌트 (ERP 신규주문과 공유, 한쪽 수정 시 양쪽 적용) */}
        <div className="flex flex-col gap-1.5">
          <span className="text-jm-xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
            결제수단
          </span>
          <PaymentMethodSelector value={method} onChange={setMethod} />
        </div>

        {/* 부분 결제 — UNPAID 결제일 땐 의미 없으므로 비활성. 계약금/일부결제 분기 포함 */}
        <PartialPaymentTile
          totalAmount={totals.total}
          value={partial}
          disabled={method === "UNPAID"}
          onChange={setPartial}
        />

      </div>

      {/* 미등록 고객 회원등록 유도 다이얼로그 */}
      {registerPromptOpen && onCreateCustomer && (
        <RegisterPromptDialog
          onRegister={() => {
            setRegisterPromptOpen(false);
            onCreateCustomer();
          }}
          onSkip={() => {
            setRegisterPromptOpen(false);
            setSkipCustomerLink(true);
            checkoutMutation.mutate();
          }}
          onCancel={() => setRegisterPromptOpen(false)}
        />
      )}

      {/* 배송 원가 (매장 지불) — 가격 드로워. VAT 포함 입력, net 으로 저장 */}
      <PriceInputDialog
        open={shipCostDialogOpen}
        onOpenChange={setShipCostDialogOpen}
        initialNet={parseFloat(shippingCostBorne || "0") || 0}
        taxType="TAXABLE"
        title="배송 원가 (매장 지불)"
        onSubmit={(net) => {
          setShippingCostBorne(String(net));
          setShipCostDialogOpen(false);
        }}
      />
    </BottomSheet>
  );
}

/**
 * 미등록 고객으로 결제하려 할 때 잠깐 끼어드는 다이얼로그.
 * 회원 등록 시 이력·통계 추적 가능 — 매장 입장에선 큰 가치.
 * 거절(등록 없이 결제)도 한 번에 가능 — 손이 한 번 더 가는 마찰만 약하게.
 */
function RegisterPromptDialog({
  onRegister,
  onSkip,
  onCancel,
}: {
  onRegister: () => void;
  onSkip: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-[var(--jm-surface)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center gap-3 pt-2 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-[var(--jm-action)]/10 text-[var(--jm-action)]">
            <UserPlus className="size-7" />
          </div>
          <h3 className="text-jm-xl font-bold text-[var(--jm-text)]">
            회원 등록하시겠어요?
          </h3>
          <p className="text-jm-sm leading-relaxed text-[var(--jm-text-muted)]">
            등록하시면 다음 방문 때 구매·수리·임대 이력을 한눈에 보실 수 있어요.
            <br />
            연락처만 입력해도 충분합니다.
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onRegister}
            className="flex h-12 w-full items-center justify-center rounded-2xl bg-[var(--jm-action)] text-jm-md font-semibold text-white transition-transform active:scale-[0.99]"
          >
            회원 등록하고 결제
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="flex h-12 w-full items-center justify-center rounded-2xl bg-[var(--jm-surface-muted)] text-jm-base font-semibold text-[var(--jm-text-muted)] transition-colors active:bg-[var(--jm-border)]"
          >
            등록 없이 결제
          </button>
        </div>
      </div>
    </div>
  );
}

function Pill({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: number;
  suffix?: string;
  tone?: "warn";
}) {
  return (
    <div
      className={`flex flex-col rounded-xl px-3 py-2 ${
        tone === "warn" ? "bg-[var(--jm-warning-solid)]/20" : "bg-[var(--jm-surface)]/10"
      }`}
    >
      <div className="text-jm-3xs uppercase tracking-wider text-white/60">
        {label}
      </div>
      <div className="mt-0.5 text-jm-xs font-semibold tabular-nums">
        {suffix
          ? `${value.toLocaleString("ko-KR")}${suffix}`
          : `${value < 0 ? "−" : ""}₩${Math.abs(value).toLocaleString("ko-KR")}`}
      </div>
    </div>
  );
}

function Spinner() {
  return <JmSpinner size="sm" tone="inverted" />;
}
