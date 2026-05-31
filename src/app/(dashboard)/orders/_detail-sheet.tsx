"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NoteTimeline } from "@/components/note-timeline";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  Banknote,
  CalendarClock,
  ChevronDown,
  Check,
  CheckCircle2,
  FilePlus,
  MapPin,
  Package,
  PackageCheck,
  PackageOpen,
  Pencil,
  Phone,
  Printer,
  Search,
  ShoppingBag,
  StickyNote,
  Store,
  Tag,
  ThumbsDown,
  Truck,
  Trash2,
  User,
  XCircle,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  JmBadge,
  JmButton,
  JmCard,
  JmCardContent,
  JmCardHeader,
  JmCardTitle,
  JmCombobox,
  JmDatePicker,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmDrawer,
  JmDrawerBody,
  JmDrawerContent,
  JmDrawerFooter,
  JmDrawerHeader,
  JmDrawerTitle,
  JmFormField,
  JmIconButton,
  JmInput,
  JmSectionLabel,
  JmSeparator,
  JmSegmentedControl,
  JmSwitch,
  JmSkeleton,
  JmSpinner,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
  JmTextarea,
} from "@/jm";
import { formatComma, parseComma } from "@/lib/utils";
import { focusCaretEnd } from "@/jm/lib/focus";

import {
  CLAIM_REASON_LABELS,
  CLAIM_REASON_LIABILITY,
  CLAIM_TYPE_LABELS,
  FULFILLMENT_LABELS,
  LIABILITY_LABELS,
  STATUS_LABELS,
  liabilityShippingNote,
  type FulfillmentType,
  type OrderClaimReason,
  type OrderClaimType,
  type OrderPaymentStatus,
  type OrderStatus,
} from "./_types";
import { CustomerPaymentDialog } from "@/components/customer-payment-dialog";
import { DocumentPrintDialog } from "@/components/document-print-dialog";
import { PriceInputDialog } from "@/app/(pos)/pos/_components/price-input-dialog";
import { ExchangeDialog } from "./_exchange-dialog";
import { formatCurrency } from "./_helpers";
import { PaymentStatusBadge, ShippingPaymentBadge, StatusBadge } from "./_parts";
import { RefundDialog } from "./_refund-dialog";
import { VariantResolveDialog } from "./_variant-resolve-dialog";

const FULFILLMENT_OPTIONS: { value: FulfillmentType; label: string }[] = [
  { value: "IN_STORE", label: "매장판매" },
  { value: "PICKUP", label: "픽업 대기" },
  { value: "DELIVERY", label: "배달" },
  { value: "QUICK", label: "퀵" },
  { value: "SHIPPING", label: "택배" },
];

function isEditable(status: OrderStatus) {
  return status === "PENDING" || status === "PREPARING" || status === "SHIPPED";
}

/**
 * 반품/교환 액션 — 5단계 흐름:
 *   요청 → 매장 결정(수락/반려) → 회수 → 검수 → 종결(환불/교환)
 * 즉시 반품(COMPLETED→RETURNED)은 매장 즉석 처리용 단축 경로.
 */
type ReturnAction =
  | "request_return"
  | "accept_return"
  | "reject_return"
  | "cancel_return_request"
  | "start_picking"
  | "collect_return"
  | "inspect_return"
  | "reject_inspection"
  | "return"
  | "refund"
  | "exchange";

/** 분할 출고 연결 주문 — "연결 주문" 카드 펼쳐보기용 요약 (품목·상태·합계) */
interface SplitLinkedOrder {
  id: string;
  orderNo: string;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  totalAmount: string;
  items: Array<{
    id: string;
    quantity: string;
    unitPrice: string;
    totalPrice: string;
    serviceName: string | null;
    product: { name: string; sku: string } | null;
  }>;
}

interface OrderDetail {
  id: string;
  orderNo: string;
  channelOrderNo: string | null;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  procurementMode: "RESTOCK" | "DROPSHIP" | null;
  expectedShipDate: string | null;
  customerId: string | null;
  customer: { id: string; name: string } | null;
  customerName: string | null;
  customerPhone: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  shippingAddress: string | null;
  trackingCarrier: string | null;
  trackingNumber: string | null;
  orderDate: string;
  subtotalAmount: string;
  discountAmount: string;
  shippingFee: string;
  shippingPaymentType: "PREPAID" | "COD" | "STORE_BURDEN";
  shippingCostBorne: string;
  taxAmount: string;
  totalAmount: string;
  commissionAmount: string;
  memo: string | null;
  paymentMethod: string | null;
  paymentStatus: OrderPaymentStatus;
  /** 부분 결제 — 즉시 결제된 금액 (PARTIAL_PAID 시). null 이면 전액 결제. */
  paidAmount: string | null;
  /** 부분 결제 구분 — DEPOSIT(계약금) / PARTIAL(부분결제). PARTIAL_PAID 시 의미. */
  partialPaymentKind: "DEPOSIT" | "PARTIAL" | null;
  taxInvoiceRequested: boolean;
  returnRequestedAt: string | null;
  returnAcceptedAt: string | null;
  returnRejectedAt: string | null;
  exchangedAt: string | null;
  exchangeOrderId: string | null;
  claimType: OrderClaimType | null;
  claimReason: OrderClaimReason | null;
  returnReason: string | null;
  channel: { name: string; code: string; commissionRate: string } | null;
  /** 이 주문에서 시작된 교환 새 주문 (link) */
  exchangeOrder: {
    id: string;
    orderNo: string;
    status: OrderStatus;
    totalAmount: string;
    paymentStatus: OrderPaymentStatus;
  } | null;
  /** 이 주문이 다른 주문의 교환 새 주문인 경우 (reverse lookup) — 차액·운임 책임 안내용 */
  exchangedFromOrders: Array<{
    id: string;
    orderNo: string;
    status: OrderStatus;
    totalAmount: string;
    claimType: OrderClaimType | null;
    claimReason: OrderClaimReason | null;
  }>;
  /** 분할 출고 — 이 주문이 택배 발송분이면 현장 수령분(부모) 참조 */
  splitParent?: SplitLinkedOrder | null;
  /** 분할 출고 — 이 주문이 현장 수령분이면 택배 발송분(자식) 목록 */
  splitChildren?: SplitLinkedOrder[];
  createdBy: { name: string };
  items: Array<{
    id: string;
    quantity: string;
    unitPrice: string;
    totalPrice: string;
    /** 정가(할인 전 단가, 세전) — null 이면 할인 없이 정가 그대로 */
    listPrice?: string | null;
    /** 개당 할인액 (세전) — null 또는 0 이면 할인 없음 */
    discountAmount?: string | null;
    /** 누적 발송 수량 (≤ quantity) — 부분 출고 추적 */
    shippedQty: string;
    /** 부분 반품 누적 (≤ quantity) */
    returnedQty: string;
    /** 부분 환불 금액 누적 (세전 공급가액 기준) */
    refundedAmount: string;
    /** 라인 역할 — MAIN(기본) / OPTION_REF(옵션) / ADDON(추가구매) */
    lineRole?: "MAIN" | "OPTION_REF" | "ADDON" | null;
    /** 부모 라인 link (OPTION_REF/ADDON 일 때 메인 OrderItem.id) */
    parentItemId?: string | null;
    /** 주문 시점 옵션값 스냅샷 — { "메모리": "32GB" } */
    optionSnapshot?: Record<string, string> | null;
    product: {
      id: string;
      name: string;
      sku: string;
      /** 대표상품(변형 부모) — true 면 PENDING 단계에서 변형 선택 강제 */
      isCanonical?: boolean;
      /** "OPTION_PARENT" 면 SWAP 옵션값으로 실제 SKU 결정 강제 */
      productType?: "FINISHED" | "PARTS" | "SET" | "ASSEMBLED" | "OPTION_PARENT";
      /** 시리얼 발번 대상 여부 — 시리얼 발번 버튼 노출 판단 */
      trackable?: boolean;
    } | null;
    serviceName: string | null;
    /** 진입 경로 SKU — 자사몰/외부 채널 funnel */
    entryProductId?: string | null;
    entryProduct?: { id: string; name: string; sku: string } | null;
    /** 서비스로 지급된 라인 — 상세 시트에 "서비스" 배지 표시 */
    isService?: boolean;
  }>;
  /** 분할 송장 회차별 발송 이력 (shipmentNo 순) */
  shipments: Array<{
    id: string;
    shipmentNo: number;
    trackingCarrier: string | null;
    trackingNumber: string | null;
    shippedAt: string;
    memo: string | null;
    items: Array<{
      id: string;
      orderItemId: string;
      quantity: string;
    }>;
  }>;
}

interface Props {
  orderId: string | null;
  /** 워크보드의 품목별 행에서 진입 시 — 해당 OrderItem 카드 highlight + scroll */
  highlightItemId?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface EditForm {
  fulfillmentType: FulfillmentType;
  expectedShipDate: string;
  recipientName: string;
  recipientPhone: string;
  shippingAddress: string;
  /** 배송 원가(매장 지불) — 사후 수정용. 저장 시 net 으로 (PriceInputDialog 가 net 반환) */
  shippingCostBorne: string;
  memo: string;
}

/** 항목 편집 폼 — PENDING 한정 */
interface ItemFormRow {
  productId: string;
  productName: string;
  sku: string;
  quantity: string;
  unitPrice: string;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
  isCanonical?: boolean;
}

function toEditForm(o: OrderDetail): EditForm {
  return {
    fulfillmentType: o.fulfillmentType,
    expectedShipDate: o.expectedShipDate ? o.expectedShipDate.slice(0, 10) : "",
    recipientName: o.recipientName ?? "",
    recipientPhone: o.recipientPhone ?? "",
    shippingAddress: o.shippingAddress ?? "",
    shippingCostBorne: String(o.shippingCostBorne ?? "0"),
    memo: o.memo ?? "",
  };
}

export function OrderDetailSheet({
  orderId,
  highlightItemId,
  open,
  onOpenChange,
}: Props) {
  const queryClient = useQueryClient();
  const detailQuery = useQuery<OrderDetail>({
    queryKey: queryKeys.orders.detail(orderId ?? ""),
    queryFn: () => apiGet(`/api/orders/${orderId}`),
    enabled: open && !!orderId,
  });

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  // 항목 편집 모드 — PENDING 한정. EditView 와 별개 모드.
  const [editingItems, setEditingItems] = useState(false);
  const [itemsForm, setItemsForm] = useState<ItemFormRow[]>([]);
  const [productPick, setProductPick] = useState("");
  const [shipDialogOpen, setShipDialogOpen] = useState(false);
  const [trackingCarrier, setTrackingCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  // 부분 출고 — partial 모드면 항목별 shipQty 입력
  const [shipMode, setShipMode] = useState<"full" | "partial">("full");
  const [partialShips, setPartialShips] = useState<Record<string, string>>({});
  // 변형/옵션 미확정 라인 해결 Dialog — 단일 라인 ID 만 담음 (1건만 처리)
  const [resolveItemId, setResolveItemId] = useState<string | null>(null);
  // 반품 요청 Dialog (claimType + reason 입력)
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [claimType, setClaimType] = useState<OrderClaimType>("REFUND");
  const [claimReason, setClaimReason] = useState<OrderClaimReason | "">("");
  const [claimNote, setClaimNote] = useState("");
  // 교환 분기 Dialog (RETURN_ACCEPTED 에서 SAME/DIFFERENT 결정)
  // 교환 Dialog — 내부 state 는 ExchangeDialog 가 보유
  const [exchangeDialogOpen, setExchangeDialogOpen] = useState(false);
  const [exchangeDialogPrefill, setExchangeDialogPrefill] = useState<
    Record<string, string>
  >({});
  // 환불 Dialog (RETURN_INSPECTED → refund / COMPLETED → return 양쪽 진입) — 내부 state 는 RefundDialog 가 보유
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundDialogPrefill, setRefundDialogPrefill] = useState<
    Record<string, string>
  >({});

  // 인쇄 미리보기 모달 (시리얼 라벨·영수증 — iframe 임베드)
  const [printPreview, setPrintPreview] = useState<{
    title: string;
    src: string;
  } | null>(null);
  // 거래명세표 — DocumentPrintDialog (공급가액만 토글·PDF 다운로드 제공)
  const [statementPreviewOpen, setStatementPreviewOpen] = useState(false);
  // 거래명세표 발행 확인 다이얼로그
  const [issueStatementOpen, setIssueStatementOpen] = useState(false);
  // 배송 메타 사후 수정 (완료된 주문에서 출고방식·배송원가만 backfill)
  const [metaEditOpen, setMetaEditOpen] = useState(false);
  const [metaFulfillment, setMetaFulfillment] =
    useState<FulfillmentType>("DELIVERY");
  const [metaShipCost, setMetaShipCost] = useState("0");
  const [metaShippingPaymentType, setMetaShippingPaymentType] = useState<
    "PREPAID" | "COD" | "STORE_BURDEN"
  >("PREPAID");
  // 배송 원가 가격 드로워 (PriceInputDialog) — VAT 포함 입력 UX
  const [shipCostDialogOpen, setShipCostDialogOpen] = useState(false);
  // 외상 주문 수금 등록 다이얼로그
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

  // orderId/open 변경 시 모든 다이얼로그·편집 state 초기화 — 렌더 중 비교 패턴 (effect 회피)
  const resetKey = `${orderId ?? ""}|${open ? "1" : "0"}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey);
    setEditing(false);
    setEditForm(null);
    setEditingItems(false);
    setItemsForm([]);
    setProductPick("");
    setShipDialogOpen(false);
    setTrackingCarrier("");
    setTrackingNumber("");
    setShipMode("full");
    setPartialShips({});
    setClaimDialogOpen(false);
    setClaimType("REFUND");
    setClaimReason("");
    setClaimNote("");
    setExchangeDialogOpen(false);
    setExchangeDialogPrefill({});
    setRefundDialogOpen(false);
    setRefundDialogPrefill({});
    setPrintPreview(null);
    setStatementPreviewOpen(false);
    setIssueStatementOpen(false);
    setMetaEditOpen(false);
    setPaymentDialogOpen(false);
  }

  // highlightItemId 가 있고 데이터 로드 후 — 해당 라인으로 스크롤
  useEffect(() => {
    if (!open || !highlightItemId || !detailQuery.data) return;
    const el = document.querySelector<HTMLElement>(
      `[data-item-id="${highlightItemId}"]`,
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [open, highlightItemId, detailQuery.data]);

  // 항목 편집 모드 진입 시에만 상품 목록 fetch
  const productsQuery = useQuery({
    queryKey: ["products", "for-order"],
    queryFn: () => apiGet<ProductOption[]>("/api/products?isBulk=all"),
    enabled: editingItems,
  });
  const productItems = (productsQuery.data ?? [])
    .filter((p) => !p.isCanonical)
    .map((p) => ({
      id: p.id,
      label: p.name,
      description: p.sku,
      sku: p.sku,
      sellingPrice: p.sellingPrice,
    }));

  const updateMutation = useMutation({
    mutationFn: (form: EditForm) =>
      apiMutate(`/api/orders/${orderId}`, "PATCH", {
        fulfillmentType: form.fulfillmentType,
        expectedShipDate: form.expectedShipDate || "",
        recipientName: form.recipientName,
        recipientPhone: form.recipientPhone,
        shippingAddress: form.shippingAddress,
        shippingCostBorne: form.shippingCostBorne || "0",
        memo: form.memo,
      }),
    onSuccess: () => {
      toast.success("저장되었습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
      setEditing(false);
      setEditForm(null);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  // 항목 replace — PENDING 한정. items 배열 보내면 기존 OrderItem 모두 삭제 후 재생성 + 금액 재계산.
  const itemsMutation = useMutation({
    mutationFn: (rows: ItemFormRow[]) =>
      apiMutate(`/api/orders/${orderId}`, "PATCH", {
        items: rows.map((r) => ({
          productId: r.productId,
          quantity: r.quantity,
          unitPrice: r.unitPrice,
        })),
      }),
    onSuccess: () => {
      toast.success("주문 항목이 갱신되었습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
      setEditingItems(false);
      setItemsForm([]);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiMutate(`/api/orders/${orderId}`, "DELETE"),
    onSuccess: () => {
      toast.success("주문이 삭제되었습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "삭제 실패"),
  });

  // 조달 방식 설정 — 입고대기/거래처 직출고/해제 (택배 발송분 등)
  const setProcurementMutation = useMutation({
    mutationFn: (mode: "RESTOCK" | "DROPSHIP" | null) =>
      apiMutate(`/api/orders/${orderId}`, "PUT", {
        action: "set-procurement",
        procurementMode: mode,
      }),
    onSuccess: () => {
      toast.success("조달 방식이 설정되었습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "설정 실패"),
  });

  // 시리얼 소급 발번 — trackable 상품 라인에 시리얼 라벨 발번 후 라벨 인쇄 탭 오픈
  const issueSerialsMutation = useMutation({
    mutationFn: () =>
      apiMutate<{ labels: { code: string }[]; consentMissing: boolean }>(
        `/api/orders/${orderId}/issue-serials`,
        "POST",
      ),
    onSuccess: (res) => {
      const codes = res.labels.map((l) => l.code);
      toast.success(`시리얼 ${codes.length}장 발번 완료`);
      if (res.consentMissing) {
        toast.warning(
          "이 손님은 시리얼 조회 서비스 미동의 — QR 없이 발급되었습니다",
        );
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      if (codes.length > 0) {
        setPrintPreview({
          title: `시리얼 라벨 ${codes.length}장`,
          src: `/serial-items/print?codes=${encodeURIComponent(codes.join(","))}`,
        });
      }
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "발번 실패"),
  });

  // 거래명세표 발행 — 주문 품목으로 Statement 레코드 생성 (orderId 연결)
  const issueStatementMutation = useMutation({
    mutationFn: () =>
      apiMutate<{ id: string; statementNo: string; alreadyIssued?: boolean }>(
        `/api/orders/${orderId}/issue-statement`,
        "POST",
      ),
    onSuccess: (res) => {
      if (res.alreadyIssued) {
        toast.info(`이미 발행된 거래명세표가 있습니다 (${res.statementNo})`);
      } else {
        toast.success(`거래명세표가 발행되었습니다 (${res.statementNo})`);
      }
      setIssueStatementOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.statements.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "발행 실패"),
  });

  // 배송 메타 사후 수정 — 완료된 주문에서 출고방식·배송원가·배송비결제만 backfill 용도
  const metaEditMutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/orders/${orderId}`, "PATCH", {
        fulfillmentType: metaFulfillment,
        shippingCostBorne: metaShipCost || "0",
        shippingPaymentType: metaShippingPaymentType,
      }),
    onSuccess: () => {
      toast.success("배송 메타가 수정됐습니다");
      setMetaEditOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "수정 실패"),
  });

  // 부분 출고 — partialItems(orderItemId, shipQty) + 송장 정보
  const partialShipMutation = useMutation({
    mutationFn: (input: {
      partialItems: Array<{ orderItemId: string; shipQty: number }>;
      trackingCarrier: string;
      trackingNumber: string;
    }) =>
      apiMutate(`/api/orders/${orderId}`, "PUT", {
        action: "partial_ship",
        partialItems: input.partialItems,
        trackingCarrier: input.trackingCarrier,
        trackingNumber: input.trackingNumber,
      }),
    onSuccess: () => {
      toast.success("부분 출고 처리 — 일부 항목 발송 완료");
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
      setShipDialogOpen(false);
      setShipMode("full");
      setPartialShips({});
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "처리 실패"),
  });

  const shipMutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/orders/${orderId}`, "PUT", {
        action: "ship",
        trackingCarrier: trackingCarrier.trim(),
        trackingNumber: trackingNumber.trim(),
      }),
    onSuccess: () => {
      toast.success("발송 처리되었습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
      setShipDialogOpen(false);
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "발송 처리 실패"),
  });

  // 반품 요청 — claimType + claimReason + 자유 메모 함께 전송
  const claimRequestMutation = useMutation({
    mutationFn: (input: {
      claimType: OrderClaimType;
      claimReason: OrderClaimReason | null;
      returnReason: string;
    }) =>
      apiMutate(`/api/orders/${orderId}`, "PUT", {
        action: "request_return",
        claimType: input.claimType,
        ...(input.claimReason ? { claimReason: input.claimReason } : {}),
        ...(input.returnReason ? { returnReason: input.returnReason } : {}),
      }),
    onSuccess: () => {
      toast.success("반품 요청 접수 — 매장 결정 대기");
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
      setClaimDialogOpen(false);
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "처리 실패"),
  });

  const transitionMutation = useMutation({
    mutationFn: (
      action:
        | "prepare"
        | "pack"
        | "complete"
        | "cancel"
        | ReturnAction,
    ) => apiMutate(`/api/orders/${orderId}`, "PUT", { action }),
    onSuccess: (_data, action) => {
      const labels: Record<string, string> = {
        prepare: "출고대기 — 재고 차감",
        pack: "출고확정 — 송장 발급 후 발송 처리",
        complete: "배송완료",
        cancel: "주문 취소 — 재고·결제 복원",
        request_return: "요청 접수 — 매장 결정 대기",
        accept_return: "수락 — 회수 대기",
        reject_return: "요청 반려",
        cancel_return_request: "요청 취소",
        start_picking: "회수 시작 — 택배 라벨 발급",
        collect_return: "회수완료 — 검수 진행",
        inspect_return: "검수완료 — 환불/교환 종결 대기",
        reject_inspection: "검수 반려 — 손님 반송, 배송완료로 복귀",
        return: "반품완료 — 재고 복원·환불",
        refund: "반품완료 — 재고 복원·환불",
        exchange: "교환완료 — 새 주문 자동 생성",
      };
      toast.success(labels[action]);
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "처리 실패"),
  });

  const startEdit = () => {
    if (!detailQuery.data) return;
    setEditForm(toEditForm(detailQuery.data));
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setEditForm(null);
  };

  const startItemsEdit = () => {
    if (!detailQuery.data) return;
    setItemsForm(
      detailQuery.data.items
        .filter((i) => i.product) // 서비스 라인은 편집 대상 아님
        .map((i) => ({
          productId: i.product!.id,
          productName: i.product!.name,
          sku: i.product!.sku,
          quantity: String(i.quantity),
          unitPrice: String(i.unitPrice),
        })),
    );
    setProductPick("");
    setEditingItems(true);
  };
  const cancelItemsEdit = () => {
    setEditingItems(false);
    setItemsForm([]);
    setProductPick("");
  };
  const addItemRow = (item: (typeof productItems)[number]) => {
    setItemsForm((prev) => [
      ...prev,
      {
        productId: item.id,
        productName: item.label,
        sku: item.sku,
        quantity: "1",
        unitPrice: item.sellingPrice,
      },
    ]);
    setProductPick("");
  };
  const updateItemRow = (idx: number, patch: Partial<ItemFormRow>) =>
    setItemsForm((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    );
  const removeItemRow = (idx: number) =>
    setItemsForm((prev) => prev.filter((_, i) => i !== idx));

  const submitItemsEdit = () => {
    if (itemsForm.length === 0) {
      toast.error("최소 1개 이상의 항목이 필요합니다");
      return;
    }
    for (const it of itemsForm) {
      const q = parseFloat(it.quantity);
      const p = parseFloat(it.unitPrice);
      if (!Number.isFinite(q) || q <= 0) {
        toast.error(`${it.productName} — 수량을 올바르게 입력해주세요`);
        return;
      }
      if (!Number.isFinite(p) || p < 0) {
        toast.error(`${it.productName} — 단가를 올바르게 입력해주세요`);
        return;
      }
    }
    itemsMutation.mutate(itemsForm);
  };
  const handleDelete = () => {
    if (!confirm("이 주문을 삭제하시겠습니까? 되돌릴 수 없습니다.")) return;
    deleteMutation.mutate();
  };

  const handleTransition = (
    action:
      | "prepare"
      | "pack"
      | "ship"
      | "complete"
      | "cancel"
      | ReturnAction,
  ) => {
    if (action === "ship") {
      setTrackingCarrier(detailQuery.data?.trackingCarrier ?? "");
      setTrackingNumber(detailQuery.data?.trackingNumber ?? "");
      setShipMode("full");
      // 부분 출고용 잔여 prefill (= quantity - shippedQty)
      const init: Record<string, string> = {};
      for (const it of detailQuery.data?.items ?? []) {
        const remaining =
          Number(it.quantity) - Number(it.shippedQty ?? 0);
        init[it.id] = String(remaining);
      }
      setPartialShips(init);
      setShipDialogOpen(true);
      return;
    }
    // 반품/교환 요청 — Dialog 로 claimType + reason 입력 받기
    if (action === "request_return") {
      setClaimType("REFUND");
      setClaimReason("");
      setClaimNote("");
      setClaimDialogOpen(true);
      return;
    }
    // 교환 처리 — ExchangeDialog 가 SAME/DIFFERENT + 전체/부분 모두 관리
    if (action === "exchange") {
      const init: Record<string, string> = {};
      for (const it of detailQuery.data?.items ?? []) {
        const remaining = Number(it.quantity) - Number(it.returnedQty);
        init[it.id] = String(remaining);
      }
      setExchangeDialogPrefill(init);
      setExchangeDialogOpen(true);
      return;
    }
    // 환불 처리 — Dialog 로 전체/부분 + 환불 실내역 입력 (RETURN_INSPECTED, COMPLETED 즉시반품 양쪽)
    if (
      (action === "refund" &&
        detailQuery.data?.status === "RETURN_INSPECTED") ||
      (action === "return" && detailQuery.data?.status === "COMPLETED")
    ) {
      // 잔여 반품 가능 수량 prefill — RefundDialog 가 받음
      const init: Record<string, string> = {};
      for (const it of detailQuery.data!.items) {
        const remaining = Number(it.quantity) - Number(it.returnedQty);
        init[it.id] = String(remaining);
      }
      setRefundDialogPrefill(init);
      setRefundDialogOpen(true);
      return;
    }
    const isUnpaidReturn =
      (action === "refund" || action === "return" || action === "cancel") &&
      detailQuery.data?.paymentStatus === "UNPAID";
    const cancelRefundLine = isUnpaidReturn
      ? "외상 주문이라 매출 취소(SALES_CANCELLED) 처리됩니다."
      : "재고·결제건이 환불 처리됩니다.";
    const confirms: Partial<Record<typeof action, string>> = {
      cancel: `주문을 취소하시겠습니까?\n${cancelRefundLine}`,
      pack:
        "출고확정 단계로 전환합니다.\n포장·송장 발급 완료 후 발송 가능. 이 시점부터 취소 불가 (반품 흐름으로 처리).",
      accept_return:
        "요청을 수락합니다.\n회수 대기 상태로 전환됩니다 (재고 미복원).",
      reject_return:
        "요청을 반려하시겠습니까?\n주문은 배송완료 상태로 복귀합니다.",
      cancel_return_request:
        "요청을 취소하고 배송완료 상태로 되돌리시겠습니까?",
      start_picking:
        "택배 회수 라벨을 발급하고 손님에게 안내합니다.\n물품 도착 시 [회수완료] 누르면 검수 단계로 진입.",
      collect_return: "회수가 완료되었습니까? 검수 단계로 진입합니다.",
      inspect_return:
        "검수가 완료되었습니까?\n결제건 paymentStatus 가 환불진행(REFUND_PENDING)으로 표시됩니다.",
      reject_inspection:
        "검수 반려 — 손님에게 반송하고 배송완료로 복귀합니다.\n재고는 복원되지 않으며 결제건도 그대로 유지됩니다 (손님이 다시 받음).",
      refund: `반품완료로 처리합니다.\n재고가 복원되고 ${cancelRefundLine}`,
      return: `반품완료로 처리합니다.\n재고가 복원되고 ${cancelRefundLine}`,
    };
    const msg = confirms[action];
    if (msg && !confirm(msg)) return;
    transitionMutation.mutate(action);
  };

  const transitionPending =
    transitionMutation.isPending || shipMutation.isPending;
  const data = detailQuery.data;
  const editable = data ? isEditable(data.status) : false;

  return (
    <JmDrawer open={open} onOpenChange={onOpenChange}>
      <JmDrawerContent side="bottom" size="xl" dragHandle>
        <JmDrawerHeader>
          <div className="flex flex-wrap items-center gap-2">
            <JmDrawerTitle className="font-mono text-jm-md">
              {data?.orderNo ?? "—"}
            </JmDrawerTitle>
            {data && (
              <>
                <StatusBadge
                  status={data.status}
                  channelId={data.channel ? "ext" : null}
                  claimType={data.claimType}
                  isExchangeReplacement={
                    (data.exchangedFromOrders?.length ?? 0) > 0
                  }
                  fulfillmentType={data.fulfillmentType}
                />
                <PaymentStatusBadge status={data.paymentStatus} showPaid />
                <JmBadge variant="outline" size="sm" shape="square">
                  <FulfillmentIcon type={data.fulfillmentType} />
                  {FULFILLMENT_LABELS[data.fulfillmentType]}
                </JmBadge>
                {data.channel && (
                  <JmBadge variant="default" size="sm" shape="square">
                    {data.channel.name}
                  </JmBadge>
                )}
                <div className="ml-auto flex items-center gap-1.5">
                  {editable && !editing && !editingItems && (
                    <JmButton variant="ghost" size="xs" onClick={startEdit}>
                      <Pencil className="size-3.5" />
                      수정
                    </JmButton>
                  )}
                  {data.status === "PENDING" && !editing && !editingItems && (
                    <JmButton
                      variant="ghost"
                      size="xs"
                      onClick={startItemsEdit}
                    >
                      <Package className="size-3.5" />
                      항목 수정
                    </JmButton>
                  )}
                  {data.paymentMethod && (
                    <JmButton
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        setPrintPreview({
                          title: "영수증 미리보기",
                          src: `/pos-receipt/${data.id}/print`,
                        })
                      }
                    >
                      <Printer className="size-3.5" />
                      영수증
                    </JmButton>
                  )}
                  <JmButton
                    variant="ghost"
                    size="xs"
                    onClick={() => setStatementPreviewOpen(true)}
                  >
                    <Printer className="size-3.5" />
                    거래명세표
                  </JmButton>
                  {/* 수금 등록 — UNPAID(전액 미수) 또는 PARTIAL_PAID(잔금 미수) + 등록 고객 */}
                  {(data.paymentStatus === "UNPAID" ||
                    data.paymentStatus === "PARTIAL_PAID") &&
                    data.customerId && (
                      <JmButton
                        variant="cta"
                        size="xs"
                        onClick={() => setPaymentDialogOpen(true)}
                      >
                        <Banknote className="size-3.5" />
                        {data.paymentStatus === "PARTIAL_PAID"
                          ? "잔금 수금"
                          : "수금 등록"}
                      </JmButton>
                    )}
                  {data.status !== "CANCELLED" && (
                    <JmButton
                      variant="ghost"
                      size="xs"
                      onClick={() => setIssueStatementOpen(true)}
                    >
                      <FilePlus className="size-3.5" />
                      거래명세표 발행
                    </JmButton>
                  )}
                  {/* 배송 메타 사후 수정 — 완료된 주문(잠금)에서 출고방식·배송원가만 backfill */}
                  {data.status !== "CANCELLED" &&
                    data.status !== "PENDING" &&
                    data.status !== "PREPARING" &&
                    data.status !== "PREPARING_PACKED" &&
                    data.status !== "SHIPPED" && (
                      <JmButton
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          setMetaFulfillment(data.fulfillmentType);
                          setMetaShipCost(
                            String(data.shippingCostBorne ?? "0"),
                          );
                          setMetaShippingPaymentType(data.shippingPaymentType);
                          setMetaEditOpen(true);
                        }}
                      >
                        <Truck className="size-3.5" />
                        배송 메타 수정
                      </JmButton>
                    )}
                  {data.status !== "CANCELLED" &&
                    data.items.some((it) => it.product?.trackable) && (
                      <JmButton
                        variant="ghost"
                        size="xs"
                        onClick={() => issueSerialsMutation.mutate()}
                        disabled={issueSerialsMutation.isPending}
                      >
                        <Tag className="size-3.5" />
                        시리얼 발번
                      </JmButton>
                    )}
                  {data.status === "PENDING" && !editing && (
                    <JmButton
                      variant="ghost"
                      size="xs"
                      onClick={handleDelete}
                      disabled={deleteMutation.isPending}
                      className="text-[var(--jm-danger-fg)] hover:bg-[var(--jm-danger-bg)]"
                    >
                      {deleteMutation.isPending ? (
                        <JmSpinner size="xs" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                      삭제
                    </JmButton>
                  )}
                </div>
              </>
            )}
          </div>
        </JmDrawerHeader>

        <JmDrawerBody className="bg-[var(--jm-bg)]">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
            {detailQuery.isPending ? (
              <DetailSkeleton />
            ) : detailQuery.isError || !data ? (
              <JmCard>
                <JmCardContent className="text-center text-jm-sm text-[var(--jm-danger-fg)]">
                  주문을 불러오지 못했습니다
                </JmCardContent>
              </JmCard>
            ) : editing && editForm ? (
              <EditView form={editForm} onChange={setEditForm} order={data} />
            ) : editingItems ? (
              <ItemsEditView
                rows={itemsForm}
                productItems={productItems}
                productsLoading={productsQuery.isPending}
                productPick={productPick}
                onPick={addItemRow}
                onUpdate={updateItemRow}
                onRemove={removeItemRow}
                order={data}
              />
            ) : (
              <ReadView
                order={data}
                highlightItemId={highlightItemId}
                onResolveItem={
                  data.status === "PENDING"
                    ? (id) => setResolveItemId(id)
                    : undefined
                }
                onSetProcurement={(m) => setProcurementMutation.mutate(m)}
              />
            )}
          </div>
        </JmDrawerBody>

        {data && editing && editForm ? (
          <JmDrawerFooter>
            <JmButton
              variant="outline"
              onClick={cancelEdit}
              disabled={updateMutation.isPending}
            >
              취소
            </JmButton>
            <JmButton
              onClick={() => updateMutation.mutate(editForm)}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending && (
                <JmSpinner size="sm" tone="inverted" />
              )}
              저장
            </JmButton>
          </JmDrawerFooter>
        ) : data && editingItems ? (
          <JmDrawerFooter>
            <JmButton
              variant="outline"
              onClick={cancelItemsEdit}
              disabled={itemsMutation.isPending}
            >
              취소
            </JmButton>
            <JmButton
              onClick={submitItemsEdit}
              disabled={itemsMutation.isPending}
            >
              {itemsMutation.isPending && (
                <JmSpinner size="sm" tone="inverted" />
              )}
              항목 저장
            </JmButton>
          </JmDrawerFooter>
        ) : data ? (
          <ActionFooter
            status={data.status}
            claimType={data.claimType}
            fulfillmentType={data.fulfillmentType}
            onTransition={handleTransition}
            pending={transitionPending}
          />
        ) : null}
      </JmDrawerContent>

      {/* 변형/옵션 미확정 라인 해결 Dialog — 라인별 [출고 SKU 선택] 클릭 진입 */}
      {data && resolveItemId && (() => {
        const it = data.items.find((x) => x.id === resolveItemId);
        if (!it || !it.product) return null;
        const kind: "canonical" | "option_parent" =
          it.product.productType === "OPTION_PARENT"
            ? "option_parent"
            : "canonical";
        return (
          <VariantResolveDialog
            open={!!resolveItemId}
            onOpenChange={(v) => !v && setResolveItemId(null)}
            orderId={data.id}
            items={[
              {
                itemId: it.id,
                productId: it.product.id,
                productName: it.product.name,
                kind,
              },
            ]}
            onResolved={() => {
              queryClient.invalidateQueries({
                queryKey: queryKeys.orders.detail(data.id),
              });
            }}
          />
        );
      })()}

      {/* 송장 입력 Dialog — ship 또는 partial_ship */}
      <JmDialog open={shipDialogOpen} onOpenChange={setShipDialogOpen}>
        <JmDialogContent size="md">
          <JmDialogHeader>
            <JmDialogTitle>
              {data?.fulfillmentType === "SHIPPING"
                ? "발송 처리 — 이번 회차 송장"
                : "배달 처리"}
              {data && data.shipments && data.shipments.length > 0 && (
                <span className="ml-2 text-jm-xs font-normal text-[var(--jm-text-muted)]">
                  ({data.shipments.length + 1}차)
                </span>
              )}
            </JmDialogTitle>
          </JmDialogHeader>
          <div className="space-y-3 px-5 py-4">
            {/* 전체/부분 토글 */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShipMode("full")}
                className={`flex-1 rounded-lg border-2 p-2.5 text-left text-jm-xs transition-colors ${
                  shipMode === "full"
                    ? "border-[var(--jm-action)] bg-[var(--jm-surface-muted)]"
                    : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)]"
                }`}
              >
                <div className="text-jm-sm font-medium">전체 발송</div>
                <div className="text-jm-2xs text-[var(--jm-text-muted)]">
                  잔여 항목 모두 이번 회차로 발송
                </div>
              </button>
              <button
                type="button"
                onClick={() => setShipMode("partial")}
                className={`flex-1 rounded-lg border-2 p-2.5 text-left text-jm-xs transition-colors ${
                  shipMode === "partial"
                    ? "border-[var(--jm-action)] bg-[var(--jm-surface-muted)]"
                    : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)]"
                }`}
              >
                <div className="text-jm-sm font-medium">부분 발송</div>
                <div className="text-jm-2xs text-[var(--jm-text-muted)]">
                  일부 항목만 이번 회차로. 잔여는 다음 회차에 발송
                </div>
              </button>
            </div>

            {data?.fulfillmentType === "SHIPPING" ? (
              <>
                <div className="rounded-md border border-[var(--jm-info-border)] bg-[var(--jm-info-bg)] px-2.5 py-2 text-jm-2xs text-[var(--jm-info-fg)]">
                  💡 이 송장은 <strong>이번 회차</strong> 에만 적용됩니다. 다음
                  회차 발송 시 다른 송장번호 사용 가능 — 회차별로 따로
                  보관됩니다.
                </div>

                <JmFormField label="택배사">
                  <JmInput
                    value={trackingCarrier}
                    onChange={(e) => setTrackingCarrier(e.target.value)}
                    placeholder="예: CJ대한통운"
                  />
                </JmFormField>
                <JmFormField
                  label="송장번호"
                  hint="빈 채로 진행 시 발송만 처리되고 송장은 발송 이력 카드에서 추후 수정 가능합니다."
                >
                  <JmInput
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder="송장번호"
                  />
                </JmFormField>
              </>
            ) : data?.fulfillmentType === "QUICK" ? (
              <>
                <div className="rounded-md border border-[var(--jm-info-border)] bg-[var(--jm-info-bg)] px-2.5 py-2 text-jm-2xs text-[var(--jm-info-fg)]">
                  💡 퀵 호출 — 업체와 접수번호 입력은 선택입니다. 퀵비는 우측
                  패널의 <strong>배송 원가(매장 지불)</strong> 에 기록하세요.
                </div>

                <JmFormField label="퀵 업체 (선택)">
                  <JmInput
                    value={trackingCarrier}
                    onChange={(e) => setTrackingCarrier(e.target.value)}
                    placeholder="예: 퀵퀵 / 인성데이타"
                  />
                </JmFormField>
                <JmFormField
                  label="퀵 접수번호 (선택)"
                  hint="퀵 업체에서 받은 접수번호를 기록 (선택)"
                >
                  <JmInput
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder="퀵 접수번호"
                  />
                </JmFormField>
              </>
            ) : (
              // DELIVERY (자체 배달) — 송장 영역 없음
              <div className="rounded-md border border-[var(--jm-info-border)] bg-[var(--jm-info-bg)] px-2.5 py-2 text-jm-2xs text-[var(--jm-info-fg)]">
                💡 자체 배달은 송장번호 없이 발송 처리됩니다.
              </div>
            )}

            {shipMode === "partial" && data && (
              <div className="space-y-1.5 border-t border-[var(--jm-border)] pt-3">
                <p className="text-jm-2xs text-[var(--jm-text-muted)]">
                  각 항목별 발송 수량 (잔여 = 주문수량 − 누적발송)
                </p>
                {data.items
                  .filter((it) => it.product)
                  .map((it) => {
                    const ordered = Number(it.quantity);
                    const already = Number(it.shippedQty ?? 0);
                    const remaining = ordered - already;
                    const raw = partialShips[it.id] ?? "0";
                    const parsed = parseFloat(raw);
                    const exceedsRemaining =
                      Number.isFinite(parsed) && parsed > remaining + 0.0001;
                    return (
                      <div
                        key={it.id}
                        className={`flex items-center gap-2 rounded border p-2 ${
                          exceedsRemaining
                            ? "border-[var(--jm-danger-fg)] bg-[var(--jm-danger-bg)]"
                            : "border-[var(--jm-border)]"
                        }`}
                      >
                        <div className="flex-1 text-jm-xs">
                          <div className="text-[var(--jm-text)]">
                            {it.product?.name ?? "—"}
                          </div>
                          <div className="text-jm-2xs text-[var(--jm-text-muted)]">
                            잔여{" "}
                            <span className="font-medium">
                              {remaining.toLocaleString("ko-KR")}
                            </span>{" "}
                            / 주문 {ordered.toLocaleString("ko-KR")}
                            {exceedsRemaining && (
                              <span className="ml-1 font-semibold text-[var(--jm-danger-fg)]">
                                · 잔여 초과
                              </span>
                            )}
                          </div>
                        </div>
                        <JmInput
                          size="sm"
                          type="text"
                          inputMode="decimal"
                          value={raw}
                          onChange={(e) =>
                            setPartialShips({
                              ...partialShips,
                              [it.id]: e.target.value,
                            })
                          }
                          onFocus={focusCaretEnd}
                          className="w-[80px] text-right"
                        />
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
          <JmDialogFooter>
            <JmButton
              variant="outline"
              onClick={() => setShipDialogOpen(false)}
              disabled={
                shipMutation.isPending || partialShipMutation.isPending
              }
            >
              취소
            </JmButton>
            <JmButton
              onClick={() => {
                if (shipMode === "full") {
                  shipMutation.mutate();
                } else {
                  const partialItems: Array<{
                    orderItemId: string;
                    shipQty: number;
                  }> = [];
                  // 잔여 초과 검증 — 서버 가드 전에 UI 에서 차단
                  for (const [itemId, qtyStr] of Object.entries(partialShips)) {
                    const q = parseFloat(qtyStr);
                    if (!Number.isFinite(q) || q <= 0) continue;
                    if (!data) continue;
                    const item = data.items.find((x) => x.id === itemId);
                    if (!item) continue;
                    const remaining =
                      Number(item.quantity) - Number(item.shippedQty ?? 0);
                    if (q > remaining + 0.0001) {
                      toast.error(
                        `${item.product?.name ?? "항목"} — 발송 ${q} > 잔여 ${remaining}`,
                      );
                      return;
                    }
                    partialItems.push({ orderItemId: itemId, shipQty: q });
                  }
                  if (partialItems.length === 0) {
                    toast.error("발송 수량을 1개 이상 입력해주세요");
                    return;
                  }
                  partialShipMutation.mutate({
                    partialItems,
                    trackingCarrier,
                    trackingNumber,
                  });
                }
              }}
              disabled={
                shipMutation.isPending || partialShipMutation.isPending
              }
            >
              {(shipMutation.isPending || partialShipMutation.isPending) && (
                <JmSpinner size="sm" tone="inverted" />
              )}
              {shipMode === "full" ? "전체 발송" : "부분 발송"}
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>

      {/* 반품 요청 Dialog — 손님이 반품/교환 요청. claimType + reason 입력 */}
      <JmDialog open={claimDialogOpen} onOpenChange={setClaimDialogOpen}>
        <JmDialogContent size="md">
          <JmDialogHeader>
            <JmDialogTitle>반품/교환 요청 접수</JmDialogTitle>
          </JmDialogHeader>
          <div className="space-y-4 px-5 py-4">
            <JmFormField label="원하는 처리">
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    "REFUND",
                    "EXCHANGE_SAME",
                    "EXCHANGE_DIFFERENT",
                  ] as const
                ).map((t) => {
                  const active = claimType === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setClaimType(t)}
                      className={`h-11 rounded-xl border-2 text-jm-xs font-medium transition-colors ${
                        active
                          ? "border-[var(--jm-action)] bg-[var(--jm-surface-muted)]"
                          : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)]"
                      }`}
                    >
                      {CLAIM_TYPE_LABELS[t]}
                    </button>
                  );
                })}
              </div>
            </JmFormField>

            <JmFormField label="사유">
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(CLAIM_REASON_LABELS) as OrderClaimReason[]).map(
                  (r) => {
                    const active = claimReason === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setClaimReason(active ? "" : r)}
                        className={`h-10 rounded-lg border text-jm-xs transition-colors ${
                          active
                            ? "border-[var(--jm-action)] bg-[var(--jm-surface-muted)] font-medium"
                            : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)]"
                        }`}
                      >
                        {CLAIM_REASON_LABELS[r]}
                      </button>
                    );
                  },
                )}
              </div>
            </JmFormField>

            <JmFormField
              label="자유 메모"
              hint="손님 사유 또는 매장 특이사항을 자유롭게 기록"
            >
              <JmTextarea
                rows={3}
                value={claimNote}
                onChange={(e) => setClaimNote(e.target.value)}
                placeholder="예: 좌측 버튼이 눌려도 동작 안 함 / 다른 색상으로 교환 원함"
              />
            </JmFormField>
          </div>
          <JmDialogFooter>
            <JmButton
              variant="outline"
              onClick={() => setClaimDialogOpen(false)}
              disabled={claimRequestMutation.isPending}
            >
              취소
            </JmButton>
            <JmButton
              onClick={() =>
                claimRequestMutation.mutate({
                  claimType,
                  claimReason: claimReason || null,
                  returnReason: claimNote.trim(),
                })
              }
              disabled={claimRequestMutation.isPending}
            >
              {claimRequestMutation.isPending && (
                <JmSpinner size="sm" tone="inverted" />
              )}
              요청 접수
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>


      {/* 환불 Dialog — 내부 state·mutations 자체 관리. parent 는 open + prefill 만 전달 */}
      {data && (
        <RefundDialog
          open={refundDialogOpen}
          onOpenChange={setRefundDialogOpen}
          order={data}
          initialPartialReturns={refundDialogPrefill}
          onDone={() => onOpenChange(false)}
        />
      )}

      {/* 교환 Dialog — 내부 state·mutations 자체 관리. parent 는 open + prefill 만 전달 */}
      {data && (
        <ExchangeDialog
          open={exchangeDialogOpen}
          onOpenChange={setExchangeDialogOpen}
          order={data}
          initialPartialReturns={exchangeDialogPrefill}
          onDone={() => onOpenChange(false)}
        />
      )}

      {/* 인쇄 미리보기 — 시리얼 라벨·영수증 iframe 모달 */}
      <JmDialog
        open={!!printPreview}
        onOpenChange={(o) => !o && setPrintPreview(null)}
      >
        <JmDialogContent className="flex h-[95vh] w-[95vw] max-w-[95vw] flex-col p-0">
          <JmDialogHeader>
            <JmDialogTitle>{printPreview?.title}</JmDialogTitle>
          </JmDialogHeader>
          {printPreview && (
            <iframe
              src={printPreview.src}
              className="size-full flex-1 border-0"
              title={printPreview.title}
            />
          )}
        </JmDialogContent>
      </JmDialog>

      {/* 거래명세표 — 공급가액만 토글 제공 */}
      <DocumentPrintDialog
        open={statementPreviewOpen}
        onOpenChange={setStatementPreviewOpen}
        printPath={data ? `/order-statement/${data.id}/print` : null}
        title={data ? `거래명세표 — ${data.orderNo}` : "거래명세표"}
      />

      {/* 거래명세표 발행 확인 */}
      <JmDialog open={issueStatementOpen} onOpenChange={setIssueStatementOpen}>
        <JmDialogContent size="sm">
          <JmDialogHeader>
            <JmDialogTitle>거래명세표 발행</JmDialogTitle>
          </JmDialogHeader>
          <JmDialogBody>
            <p className="text-jm-sm text-[var(--jm-text)]">
              주문{" "}
              <span className="font-semibold">{data?.orderNo}</span> 으로
              거래명세표를 발행합니다.
            </p>
            <p className="mt-2 text-jm-xs text-[var(--jm-text-muted)]">
              발행한 거래명세표는 거래명세표 목록에 등록되며, 이후 주문이
              취소되면 함께 취소됩니다. 이미 발행된 거래명세표가 있으면 새로
              만들지 않습니다.
            </p>
          </JmDialogBody>
          <JmDialogFooter>
            <JmButton
              variant="outline"
              onClick={() => setIssueStatementOpen(false)}
              disabled={issueStatementMutation.isPending}
            >
              취소
            </JmButton>
            <JmButton
              variant="cta"
              onClick={() => issueStatementMutation.mutate()}
              disabled={issueStatementMutation.isPending}
            >
              {issueStatementMutation.isPending && (
                <JmSpinner size="sm" tone="inverted" />
              )}
              발행
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>

      {/* 배송 메타 사후 수정 — 완료된 주문에서 출고방식·배송원가만 backfill */}
      <JmDialog open={metaEditOpen} onOpenChange={setMetaEditOpen}>
        <JmDialogContent size="sm">
          <JmDialogHeader>
            <JmDialogTitle>배송 메타 수정</JmDialogTitle>
          </JmDialogHeader>
          <JmDialogBody className="space-y-4">
            <p className="text-jm-xs text-[var(--jm-text-muted)]">
              완료된 주문이라 다른 항목은 잠겨있습니다. <strong>퀵 backfill</strong>{" "}
              · <strong>퀵비(배송 원가) 사후 입력</strong> 용도. 매출/재고에는
              영향 없고 마진 리포트의 순익만 갱신됩니다.
            </p>
            <JmFormField label="출고방식">
              <div className="grid grid-cols-3 gap-2">
                {FULFILLMENT_OPTIONS.map((opt) => {
                  const active = metaFulfillment === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setMetaFulfillment(opt.value)}
                      className={`h-10 rounded-xl border-2 text-jm-sm font-medium transition-colors ${
                        active
                          ? "border-[var(--jm-action)] bg-[var(--jm-surface-muted)]"
                          : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </JmFormField>
            <JmFormField
              label="배송비 결제"
              hint="선불 = 손님 결제 / 착불 = 도착 시 손님 지불 / 무료 = 매장 부담"
            >
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { value: "PREPAID", label: "선불" },
                    { value: "COD", label: "착불" },
                    { value: "STORE_BURDEN", label: "무료" },
                  ] as const
                ).map((opt) => {
                  const active = metaShippingPaymentType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setMetaShippingPaymentType(opt.value)}
                      className={`h-10 rounded-xl border-2 text-jm-sm font-medium transition-colors ${
                        active
                          ? "border-[var(--jm-action)] bg-[var(--jm-surface-muted)]"
                          : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </JmFormField>
            <JmFormField
              label="배송 원가 (매장 지불)"
              hint="우리가 낸 퀵비·택배비 — VAT 포함 금액 입력. 마진 리포트·경비에서 차감됨"
            >
              <button
                type="button"
                onClick={() => setShipCostDialogOpen(true)}
                className="flex h-10 w-full items-center justify-between rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 text-jm-sm text-[var(--jm-text)] hover:border-[var(--jm-border-strong)]"
              >
                <span className="tabular-nums">
                  {parseFloat(metaShipCost || "0") === 0
                    ? "—"
                    : `₩${Math.round(parseFloat(metaShipCost) * 1.1).toLocaleString("ko-KR")}`}
                </span>
                <span className="text-jm-2xs text-[var(--jm-text-muted)]">수정</span>
              </button>
            </JmFormField>
          </JmDialogBody>
          <JmDialogFooter>
            <JmButton
              variant="outline"
              onClick={() => setMetaEditOpen(false)}
              disabled={metaEditMutation.isPending}
            >
              취소
            </JmButton>
            <JmButton
              variant="cta"
              onClick={() => metaEditMutation.mutate()}
              disabled={metaEditMutation.isPending}
            >
              {metaEditMutation.isPending && (
                <JmSpinner size="sm" tone="inverted" />
              )}
              저장
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>

      {/* 배송 원가 가격 드로워 — VAT 포함 입력 UX, net 으로 저장 (POS 와 동일 패턴) */}
      <PriceInputDialog
        open={shipCostDialogOpen}
        onOpenChange={setShipCostDialogOpen}
        initialNet={parseFloat(metaShipCost || "0") || 0}
        taxType="TAXABLE"
        title="배송 원가 (매장 지불)"
        onSubmit={(net) => {
          setMetaShipCost(String(net));
          setShipCostDialogOpen(false);
        }}
      />

      {/* 외상 주문 수금 등록 — 고객·금액·메모 prefill 후 dialog 안에서 사용자가 확인 */}
      {data && data.customerId && (
        <CustomerPaymentDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          fixedCustomer={{
            id: data.customerId,
            name: data.customer?.name ?? data.customerName ?? "",
          }}
          initialAmount={String(Math.round(Number(data.totalAmount)))}
          initialMemo={`주문 ${data.orderNo} 수금`}
          onSaved={() => {
            queryClient.invalidateQueries({
              queryKey: queryKeys.orders.detail(orderId ?? ""),
            });
            queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.ledger.customers() });
          }}
        />
      )}
    </JmDrawer>
  );
}

/* ------------------------------ READ VIEW ------------------------------ */

function ReadView({
  order,
  highlightItemId,
  onResolveItem,
  onSetProcurement,
}: {
  order: OrderDetail;
  highlightItemId?: string | null;
  /** PENDING 상태일 때만 전달 — canonical/OPTION_PARENT 라인의 [출고 SKU 선택] 클릭 핸들러 */
  onResolveItem?: (itemId: string) => void;
  /** 조달 방식 설정 (입고대기/거래처 직출고/해제) */
  onSetProcurement?: (mode: "RESTOCK" | "DROPSHIP" | null) => void;
}) {
  return (
    <>
      {/* 출고 정보 */}
      <JmCard>
        <JmCardHeader className="flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Truck className="size-4 text-[var(--jm-text-muted)]" />
            <JmCardTitle>출고 정보</JmCardTitle>
          </div>
        </JmCardHeader>
        <JmCardContent>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3">
            <Field label="출고 방식" icon={<FulfillmentIcon type={order.fulfillmentType} />}>
              {FULFILLMENT_LABELS[order.fulfillmentType]}
            </Field>
            {order.fulfillmentType !== "IN_STORE" && order.fulfillmentType !== "PICKUP" && (
              <>
                <Field label="배송비 결제" icon={<Banknote className="size-3.5" />}>
                  <ShippingPaymentBadge type={order.shippingPaymentType} />
                </Field>
                <Field label="출고 예정일" icon={<CalendarClock className="size-3.5" />}>
                  {order.expectedShipDate
                    ? new Date(order.expectedShipDate).toLocaleDateString("ko-KR")
                    : "—"}
                </Field>
                <Field label="받는 사람" icon={<User className="size-3.5" />}>
                  {order.recipientName ?? order.customerName ?? "—"}
                </Field>
                <Field label="받는 사람 연락처" icon={<Phone className="size-3.5" />}>
                  {order.recipientPhone ?? order.customerPhone ?? "—"}
                </Field>
                <Field
                  label="배송지"
                  icon={<MapPin className="size-3.5" />}
                  className="col-span-2 md:col-span-3"
                >
                  {order.shippingAddress ?? "—"}
                </Field>
                {(order.trackingCarrier || order.trackingNumber) && (
                  <Field label="송장" icon={<Truck className="size-3.5" />}>
                    {[order.trackingCarrier, order.trackingNumber]
                      .filter(Boolean)
                      .join(" · ")}
                  </Field>
                )}
              </>
            )}
            <Field label="주문일">
              {new Date(order.orderDate).toLocaleString("ko-KR", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </Field>
            {order.channelOrderNo && (
              <Field label="채널 주문번호">{order.channelOrderNo}</Field>
            )}
            <Field label="등록자">{order.createdBy.name}</Field>
          </div>
        </JmCardContent>
      </JmCard>

      {/* 메모 · 할 일 — 업무 노트 허브와 연동 (출처: 주문) */}
      <JmCard>
        <JmCardHeader>
          <JmCardTitle>메모 · 할 일</JmCardTitle>
        </JmCardHeader>
        <JmCardContent>
          <NoteTimeline sourceType="ORDER" sourceId={order.id} sourceLabel={order.orderNo} />
        </JmCardContent>
      </JmCard>

      {/* 주문 항목 */}
      <JmCard className="overflow-hidden p-0">
        <JmCardHeader>
          <div className="flex items-center gap-2">
            <Package className="size-4 text-[var(--jm-text-muted)]" />
            <JmCardTitle>주문 항목</JmCardTitle>
            <span className="text-jm-xs text-[var(--jm-text-muted)]">
              {order.items.length}건
            </span>
          </div>
        </JmCardHeader>
        <JmTable>
          <JmTableHeader>
            <JmTableRow>
              <JmTableHead>상품</JmTableHead>
              <JmTableHead className="w-[80px] text-right">수량</JmTableHead>
              <JmTableHead className="w-[120px] text-right">단가</JmTableHead>
              <JmTableHead className="w-[130px] text-right">금액</JmTableHead>
            </JmTableRow>
          </JmTableHeader>
          <JmTableBody>
            {order.items.map((item) => {
              const ordered = Number(item.quantity);
              const shipped = Number(item.shippedQty ?? 0);
              const returned = Number(item.returnedQty ?? 0);
              const refunded = Number(item.refundedAmount ?? 0);
              const hasPartialShip = shipped > 0 && shipped < ordered;
              const hasPartialReturn = returned > 0;
              const isHighlighted = highlightItemId === item.id;
              const needsResolve =
                !!item.product &&
                (item.product.isCanonical ||
                  item.product.productType === "OPTION_PARENT");
              return (
                <JmTableRow
                  key={item.id}
                  data-item-id={item.id}
                  className={`hover:bg-transparent ${
                    isHighlighted
                      ? "bg-[var(--jm-info-bg)]/40 border border-[var(--jm-info-border)]"
                      : ""
                  }`}
                >
                  <JmTableCell>
                    <div
                      className={`flex flex-col ${
                        item.parentItemId ? "pl-4" : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                        <span className="text-jm-sm text-[var(--jm-text)]">
                          {item.lineRole === "OPTION_REF" && (
                            <span className="mr-1 text-[var(--jm-text-muted)]">
                              ↳ 옵션
                            </span>
                          )}
                          {item.lineRole === "ADDON" && (
                            <span className="mr-1 text-[var(--jm-text-muted)]">
                              ↳ 추가구매
                            </span>
                          )}
                          {item.product?.name ?? item.serviceName ?? "—"}
                          {/* 서비스로 지급 — 0원 라인이라 매출 0 이지만 흔적은 명시 */}
                          {item.isService && (
                            <span className="ml-1.5 inline-flex items-center rounded-md bg-[var(--jm-success-bg)] px-1.5 py-px text-jm-3xs font-semibold text-[var(--jm-success-fg)]">
                              서비스
                            </span>
                          )}
                          {/* SWAP 결과 라인은 상품명에 옵션 이미 반영 — 부속 표시 안 함 */}
                          {item.optionSnapshot &&
                            Object.keys(item.optionSnapshot).length > 0 &&
                            (!item.entryProductId ||
                              item.entryProductId === item.product?.id) && (
                              <span className="text-[var(--jm-text-muted)]">
                                {" "}
                                (
                                {Object.values(
                                  item.optionSnapshot as Record<string, string>,
                                ).join(" · ")}
                                )
                              </span>
                            )}
                        </span>
                        {/* SWAP chip — 상품명 옆 (자사몰/외부 채널 진입 SKU ≠ 결제 SKU) */}
                        {item.entryProduct &&
                          item.entryProductId !== item.product?.id && (
                            <span
                              className="inline-flex items-center rounded-md bg-[var(--jm-surface-muted)] px-1.5 py-px text-jm-3xs text-[var(--jm-text-muted)]"
                              title={`손님이 진입한 카탈로그 SKU: ${item.entryProduct.sku}`}
                            >
                              ← 진입: {item.entryProduct.name}
                            </span>
                          )}
                      </div>
                      {item.product?.sku && (
                        <span className="font-mono text-jm-2xs text-[var(--jm-text-muted)]">
                          {item.product.sku}
                        </span>
                      )}
                      {needsResolve && (
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="rounded-md bg-[var(--jm-warning-bg)] px-1.5 py-px text-jm-3xs font-semibold text-[var(--jm-warning-fg)]">
                            {item.product?.productType === "OPTION_PARENT"
                              ? "옵션 미확정"
                              : "변형 미확정"}
                          </span>
                          {onResolveItem && (
                            <button
                              type="button"
                              onClick={() => onResolveItem(item.id)}
                              className="rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface)] px-2 py-0.5 text-jm-3xs font-semibold text-[var(--jm-text)] hover:border-[var(--jm-border-strong)]"
                            >
                              출고 SKU 선택
                            </button>
                          )}
                        </div>
                      )}
                      {hasPartialShip && (
                        <span className="mt-0.5 text-jm-2xs text-[var(--jm-info-fg)]">
                          발송 {shipped.toLocaleString("ko-KR")}/
                          {ordered.toLocaleString("ko-KR")} (잔여{" "}
                          {(ordered - shipped).toLocaleString("ko-KR")})
                        </span>
                      )}
                      {hasPartialReturn && (
                        <span className="mt-0.5 text-jm-2xs text-[var(--jm-warning-fg)]">
                          반품 {returned.toLocaleString("ko-KR")}건 · 환불{" "}
                          {formatCurrency(refunded)}
                        </span>
                      )}
                    </div>
                  </JmTableCell>
                  <JmTableCell className="text-right tabular-nums">
                    {Number(item.quantity).toLocaleString("ko-KR")}
                  </JmTableCell>
                  <JmTableCell className="text-right tabular-nums">
                    {(() => {
                      const listNet = item.listPrice ? Number(item.listPrice) : 0;
                      const discNet = item.discountAmount ? Number(item.discountAmount) : 0;
                      const unitNet = Number(item.unitPrice);
                      // 할인(정가보다 싸게)일 때만 비교 표시. 인상은 손님 노출 우려 + 운영상 문제 아님.
                      const showDiscount = listNet > 0 && unitNet < listNet;
                      if (!showDiscount) {
                        return formatCurrency(item.unitPrice);
                      }
                      const diff = unitNet - listNet;
                      const pct = listNet > 0
                        ? Math.round((diff / listNet) * 1000) / 10
                        : 0;
                      const perUnitDisc = discNet > 0 ? discNet : Math.abs(diff);
                      return (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-jm-2xs text-[var(--jm-text-muted)] line-through">
                            {formatCurrency(listNet)}
                          </span>
                          <span>{formatCurrency(unitNet)}</span>
                          <span className="text-jm-2xs font-semibold text-[var(--jm-success-fg)]">
                            −{formatCurrency(perUnitDisc)} ({Math.abs(pct).toFixed(1)}%)
                          </span>
                        </div>
                      );
                    })()}
                  </JmTableCell>
                  <JmTableCell className="text-right tabular-nums font-semibold">
                    {(() => {
                      const listNet = item.listPrice ? Number(item.listPrice) : 0;
                      const unitNet = Number(item.unitPrice);
                      const qty = Number(item.quantity);
                      const showDiscount = listNet > 0 && unitNet < listNet;
                      if (!showDiscount) {
                        return formatCurrency(item.totalPrice);
                      }
                      const grossTotal = listNet * qty;
                      const totalDisc = (listNet - unitNet) * qty;
                      return (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-jm-2xs font-normal text-[var(--jm-text-muted)] line-through">
                            {formatCurrency(grossTotal)}
                          </span>
                          <span>{formatCurrency(item.totalPrice)}</span>
                          {totalDisc > 0 && (
                            <span className="text-jm-2xs font-semibold text-[var(--jm-success-fg)]">
                              −{formatCurrency(totalDisc)}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </JmTableCell>
                </JmTableRow>
              );
            })}
          </JmTableBody>
        </JmTable>
      </JmCard>

      {/* 송장 사전 등록 — PREPARING + SHIPPING(택배)/QUICK(퀵) 만. DELIVERY(자체 배달)는 송장 개념 없음 */}
      {order.status === "PREPARING" &&
        (order.fulfillmentType === "SHIPPING" ||
          order.fulfillmentType === "QUICK") && (
          <PreShipmentTrackingCard order={order} />
        )}

      {/* 분할 송장 — 회차별 발송 이력. 1건 이상 있으면 노출 */}
      {order.shipments.length > 0 && (
        <ShipmentHistoryCard order={order} />
      )}

      {/* 금액 + 고객 — 좌우 분할 (모바일은 stack) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <JmCard>
          <JmCardHeader>
            <div className="flex items-center gap-2">
              <Banknote className="size-4 text-[var(--jm-text-muted)]" />
              <JmCardTitle>금액 요약</JmCardTitle>
            </div>
          </JmCardHeader>
          <JmCardContent className="space-y-1.5 text-jm-sm">
            <SumRow label="공급가액" value={Number(order.subtotalAmount)} />
            {Number(order.discountAmount) > 0 && (
              <SumRow
                label="할인"
                value={-Number(order.discountAmount)}
                muted
              />
            )}
            {Number(order.shippingFee) > 0 && (
              <SumRow label="배송비" value={Number(order.shippingFee)} muted />
            )}
            <SumRow label="부가세" value={Number(order.taxAmount)} muted />
            {Number(order.commissionAmount) > 0 && (
              <SumRow
                label={`채널 수수료 (${(
                  Number(order.channel?.commissionRate ?? 0) * 100
                ).toFixed(1)}%)`}
                value={-Number(order.commissionAmount)}
                muted
              />
            )}
            <JmSeparator className="my-2" />
            <SumRow label="합계" value={Number(order.totalAmount)} bold />
            {/* 부분 결제 — 즉시 결제(또는 계약금) / 잔금(미수) 분리 표시 */}
            {order.paymentStatus === "PARTIAL_PAID" && order.paidAmount && (
              <div className="mt-2 space-y-1 rounded-md border border-[var(--jm-warning-fg)]/40 bg-[var(--jm-warning-bg)] px-3 py-2">
                <div className="flex items-center justify-between text-jm-xs">
                  <span className="text-[var(--jm-warning-fg)]">
                    {order.partialPaymentKind === "DEPOSIT"
                      ? "계약금 입금"
                      : "즉시 결제"}
                  </span>
                  <span className="font-semibold tabular-nums text-[var(--jm-warning-fg)]">
                    ₩{Number(order.paidAmount).toLocaleString("ko-KR")}
                  </span>
                </div>
                <div className="flex items-center justify-between text-jm-sm">
                  <span className="font-semibold text-[var(--jm-warning-fg)]">
                    잔금 (미수)
                  </span>
                  <span className="font-bold tabular-nums text-[var(--jm-warning-fg)]">
                    ₩
                    {Math.max(
                      0,
                      Number(order.totalAmount) - Number(order.paidAmount),
                    ).toLocaleString("ko-KR")}
                  </span>
                </div>
                <p className="text-jm-2xs text-[var(--jm-warning-fg)]/80">
                  {order.partialPaymentKind === "DEPOSIT"
                    ? "계약금 수령 — 잔금은 고객 미수금으로 등록되어 차후 수금"
                    : "잔금은 고객 미수금으로 등록됨 — 수금 시 [수금 등록] 사용"}
                </p>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-1.5 text-jm-2xs text-[var(--jm-text-muted)]">
              {order.paymentMethod && (
                <span>결제수단 · {paymentLabel(order.paymentMethod)}</span>
              )}
              <PaymentStatusBadge status={order.paymentStatus} showPaid />
            </div>
            {/* 매장 부담 배송 원가 — 손님 청구와 무관 (내부 비용, 마진 리포트에서 차감).
                 저장은 세전(net) 이지만 표시는 VAT 포함(gross) 으로 통일 — 다른 비용 행과 일관. */}
            {Number(order.shippingCostBorne) > 0 && (
              <div className="mt-2 rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface-muted)]/40 px-2.5 py-2 text-jm-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--jm-text-muted)]">
                    배송 원가 (매장 부담, VAT 포함)
                  </span>
                  <span className="tabular-nums text-[var(--jm-text)]">
                    ₩{Math.round(Number(order.shippingCostBorne) * 1.1).toLocaleString("ko-KR")}
                  </span>
                </div>
                <p className="mt-0.5 text-jm-2xs text-[var(--jm-text-muted)]">
                  손님 청구와 무관 — 마진 리포트·경비에서 자동 차감
                </p>
              </div>
            )}
            <TaxInvoiceToggle
              orderId={order.id}
              requested={order.taxInvoiceRequested}
              disabled={order.status === "CANCELLED"}
            />
            {(order.returnRequestedAt ||
              order.returnAcceptedAt ||
              order.returnRejectedAt ||
              order.exchangedAt ||
              order.claimType ||
              order.claimReason ||
              order.returnReason ||
              order.exchangeOrder ||
              order.exchangedFromOrders.length > 0) && (
              <div className="mt-2 space-y-1 border-t border-[var(--jm-border)] pt-2 text-jm-2xs text-[var(--jm-text-muted)]">
                {order.claimType && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span>처리 ·</span>
                    <JmBadge variant="outline" size="sm" shape="square">
                      {CLAIM_TYPE_LABELS[order.claimType]}
                    </JmBadge>
                    {order.claimReason && (
                      <JmBadge variant="default" size="sm" shape="square">
                        {CLAIM_REASON_LABELS[order.claimReason]}
                      </JmBadge>
                    )}
                  </div>
                )}
                {order.returnRequestedAt && (
                  <div>
                    반품 요청 ·{" "}
                    {new Date(order.returnRequestedAt).toLocaleDateString("ko-KR")}
                  </div>
                )}
                {order.returnAcceptedAt && (
                  <div>
                    반품 수락 ·{" "}
                    {new Date(order.returnAcceptedAt).toLocaleDateString("ko-KR")}
                  </div>
                )}
                {order.returnRejectedAt && (
                  <div>
                    반품 반려 ·{" "}
                    {new Date(order.returnRejectedAt).toLocaleDateString("ko-KR")}
                  </div>
                )}
                {order.exchangedAt && (
                  <div>
                    교환 종결 ·{" "}
                    {new Date(order.exchangedAt).toLocaleDateString("ko-KR")}
                  </div>
                )}
                {order.exchangeOrder && (
                  <div className="flex items-center gap-1.5">
                    <span>교환 새 주문 →</span>
                    <a
                      href={`/orders?id=${order.exchangeOrder.id}`}
                      className="font-mono text-[var(--jm-action)] underline-offset-2 hover:underline"
                    >
                      {order.exchangeOrder.orderNo}
                    </a>
                    <JmBadge variant="outline" size="sm" shape="square">
                      {STATUS_LABELS[order.exchangeOrder.status]}
                    </JmBadge>
                  </div>
                )}
                {order.exchangedFromOrders.map((src) => (
                  <div key={src.id} className="flex items-center gap-1.5">
                    <span>← 교환 원본</span>
                    <a
                      href={`/orders?id=${src.id}`}
                      className="font-mono text-[var(--jm-action)] underline-offset-2 hover:underline"
                    >
                      {src.orderNo}
                    </a>
                    <JmBadge variant="outline" size="sm" shape="square">
                      {STATUS_LABELS[src.status]}
                    </JmBadge>
                  </div>
                ))}
                {order.returnReason && (
                  <div className="whitespace-pre-line pt-1">
                    메모 · {order.returnReason}
                  </div>
                )}
              </div>
            )}
          </JmCardContent>
        </JmCard>

        {/* 분할 출고 연결 — 이 주문 역할(현장 수령분/택배 발송분) 명시 + 연결 주문 펼쳐보기.
            현장 수령분(부모) ↔ 택배 발송분(자식) (docs/SPLIT_FULFILLMENT.md) */}
        {(() => {
          // splitParent 있으면 이 주문은 택배 발송분(자식), 없고 children 있으면 현장 수령분(부모)
          const isChild = !!order.splitParent;
          const connected: SplitLinkedOrder[] = isChild
            ? [order.splitParent!]
            : order.splitChildren ?? [];
          if (connected.length === 0) return null;
          const currentRole = isChild ? "택배 발송분" : "현장 수령분";
          const connectedRole = isChild ? "현장 수령분" : "택배 발송분";
          return (
            <JmCard>
              <JmCardHeader>
                <div className="flex items-center gap-2">
                  <Package className="size-4 text-[var(--jm-text-muted)]" />
                  <JmCardTitle>연결 주문 · 분할 출고</JmCardTitle>
                </div>
              </JmCardHeader>
              <JmCardContent>
                {/* 이 주문이 둘 중 무엇인지 — 헷갈림 방지 */}
                <div className="mb-2 flex items-center gap-1.5 text-jm-xs">
                  <span className="text-[var(--jm-text-muted)]">이 주문은</span>
                  <JmBadge variant="default" size="sm" shape="square">
                    {currentRole}
                  </JmBadge>
                </div>
                <div className="space-y-1.5">
                  {connected.map((o) => (
                    <ConnectedOrderRow key={o.id} order={o} roleLabel={connectedRole} />
                  ))}
                </div>
              </JmCardContent>
            </JmCard>
          );
        })()}

        {/* 조달 방식 — 택배 발송 주문의 입고대기/거래처 직출고 마커 (③) */}
        {order.fulfillmentType === "SHIPPING" && (
          <JmCard>
            <JmCardHeader>
              <div className="flex items-center gap-2">
                <Truck className="size-4 text-[var(--jm-text-muted)]" />
                <JmCardTitle>조달 방식</JmCardTitle>
                {order.procurementMode && (
                  <JmBadge variant="outline" size="sm" shape="square">
                    {order.procurementMode === "DROPSHIP" ? "거래처 직출고" : "입고 대기"}
                  </JmBadge>
                )}
              </div>
            </JmCardHeader>
            <JmCardContent>
              <div className="flex flex-col gap-2">
                <p className="text-jm-2xs text-[var(--jm-text-muted)]">
                  재고 없이 조달해 보낼 때 — 입고 후 우리가 발송할지(입고 대기), 거래처가 손님에게
                  직접 보낼지(거래처 직출고) 표시.
                </p>
                <JmSegmentedControl
                  size="sm"
                  ariaLabel="조달 방식"
                  value={order.procurementMode ?? "none"}
                  onChange={(v) =>
                    onSetProcurement?.(
                      v === "none" ? null : (v as "RESTOCK" | "DROPSHIP"),
                    )
                  }
                  options={[
                    { value: "none", label: "미설정" },
                    { value: "RESTOCK", label: "입고 대기" },
                    { value: "DROPSHIP", label: "거래처 직출고" },
                  ]}
                />
              </div>
            </JmCardContent>
          </JmCard>
        )}

        <JmCard>
          <JmCardHeader>
            <div className="flex items-center gap-2">
              <User className="size-4 text-[var(--jm-text-muted)]" />
              <JmCardTitle>고객</JmCardTitle>
            </div>
          </JmCardHeader>
          <JmCardContent>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Field label="등록 고객">{order.customerName ?? "—"}</Field>
              <Field label="연락처">{order.customerPhone ?? "—"}</Field>
              {order.fulfillmentType !== "IN_STORE" &&
                order.fulfillmentType !== "PICKUP" &&
                ((order.recipientName &&
                  order.recipientName !== order.customerName) ||
                  (order.recipientPhone &&
                    order.recipientPhone !== order.customerPhone)) && (
                  <p className="col-span-2 text-jm-2xs text-[var(--jm-warning-fg)]">
                    받는 사람이 등록 고객과 다릅니다 — 출고 정보 카드 확인
                  </p>
                )}
            </div>
          </JmCardContent>
        </JmCard>
      </div>

      {/* 교환 발송 안내 — 이 주문이 다른 주문의 교환으로 생성된 경우 */}
      {order.exchangedFromOrders.length > 0 && (
        <ExchangeReplacementCard order={order} />
      )}

      {/* 메모 — 있을 때만 */}
      {order.memo && (
        <JmCard>
          <JmCardHeader>
            <div className="flex items-center gap-2">
              <StickyNote className="size-4 text-[var(--jm-text-muted)]" />
              <JmCardTitle>메모</JmCardTitle>
            </div>
          </JmCardHeader>
          <JmCardContent>
            <p className="whitespace-pre-line text-jm-sm text-[var(--jm-text)]">
              {order.memo}
            </p>
          </JmCardContent>
        </JmCard>
      )}
    </>
  );
}

/* ------------------------------ EDIT VIEW ------------------------------ */

function EditView({
  form,
  onChange,
  order,
}: {
  form: EditForm;
  onChange: (next: EditForm) => void;
  order: OrderDetail;
}) {
  const set = <K extends keyof EditForm>(key: K, value: EditForm[K]) =>
    onChange({ ...form, [key]: value });

  return (
    <>
      <JmCard>
        <JmCardHeader>
          <div className="flex items-center gap-2">
            <Truck className="size-4 text-[var(--jm-text-muted)]" />
            <JmCardTitle>출고 정보 수정</JmCardTitle>
          </div>
        </JmCardHeader>
        <JmCardContent className="space-y-4">
          <JmFormField label="출고 방식">
            <div className="grid grid-cols-3 gap-2">
              {FULFILLMENT_OPTIONS.map((opt) => {
                const active = form.fulfillmentType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set("fulfillmentType", opt.value)}
                    className={`h-11 rounded-xl border-2 text-jm-base font-medium transition-colors ${
                      active
                        ? "border-[var(--jm-action)] bg-[var(--jm-surface-muted)]"
                        : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)]"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </JmFormField>

          {form.fulfillmentType !== "IN_STORE" && form.fulfillmentType !== "PICKUP" && (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <JmFormField label="출고 예정일">
                  <JmDatePicker
                    value={
                      form.expectedShipDate
                        ? new Date(form.expectedShipDate + "T00:00:00")
                        : undefined
                    }
                    onChange={(d) =>
                      set(
                        "expectedShipDate",
                        d ? format(d, "yyyy-MM-dd") : "",
                      )
                    }
                  />
                </JmFormField>
                <JmFormField label="배송지">
                  <JmInput
                    value={form.shippingAddress}
                    onChange={(e) => set("shippingAddress", e.target.value)}
                    placeholder="주소"
                  />
                </JmFormField>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <JmFormField label="받는 사람">
                  <JmInput
                    value={form.recipientName}
                    onChange={(e) => set("recipientName", e.target.value)}
                    placeholder="이름"
                  />
                </JmFormField>
                <JmFormField label="받는 사람 연락처">
                  <JmInput
                    value={form.recipientPhone}
                    onChange={(e) => set("recipientPhone", e.target.value)}
                    placeholder="010-0000-0000"
                  />
                </JmFormField>
              </div>
              {/* 배송 원가 (매장 지불) — 착불(COD) 제외, 매장 회계 무관 */}
              {order.shippingPaymentType !== "COD" && (
                <JmFormField
                  label="배송 원가 (매장 지불)"
                  hint="우리가 낸 퀵비·택배비 — 손님 청구와 독립 (복합 케이스 가능). 매장 부담분만 입력. VAT 제외 금액"
                >
                  <JmInput
                    type="text"
                    inputMode="numeric"
                    value={formatComma(form.shippingCostBorne)}
                    onChange={(e) =>
                      set("shippingCostBorne", parseComma(e.target.value))
                    }
                    onFocus={focusCaretEnd}
                    placeholder="0"
                  />
                </JmFormField>
              )}
            </>
          )}
        </JmCardContent>
      </JmCard>

      <JmCard>
        <JmCardHeader>
          <div className="flex items-center gap-2">
            <StickyNote className="size-4 text-[var(--jm-text-muted)]" />
            <JmCardTitle>메모</JmCardTitle>
          </div>
        </JmCardHeader>
        <JmCardContent>
          <JmTextarea
            rows={4}
            value={form.memo}
            onChange={(e) => set("memo", e.target.value)}
          />
        </JmCardContent>
      </JmCard>

      <p className="text-center text-jm-2xs text-[var(--jm-text-muted)]">
        주문 번호 {order.orderNo} · 항목 편집은 헤더의 [항목 수정] 버튼 (PENDING
        한정)
      </p>
    </>
  );
}

/* ------------------------------ ITEMS EDIT VIEW ------------------------------ */

/**
 * 항목 편집 모드 — PENDING 한정. 재고 미차감이라 안전.
 * 저장 시 PATCH 가 기존 OrderItem 모두 삭제 후 재생성 + subtotal/tax/total/commission 재계산.
 */
function ItemsEditView({
  rows,
  productItems,
  productsLoading,
  productPick,
  onPick,
  onUpdate,
  onRemove,
  order,
}: {
  rows: ItemFormRow[];
  productItems: Array<{
    id: string;
    label: string;
    description: string;
    sku: string;
    sellingPrice: string;
  }>;
  productsLoading: boolean;
  productPick: string;
  onPick: (item: (typeof productItems)[number]) => void;
  onUpdate: (idx: number, patch: Partial<ItemFormRow>) => void;
  onRemove: (idx: number) => void;
  order: OrderDetail;
}) {
  const subtotal = rows.reduce(
    (sum, r) =>
      sum + parseFloat(r.quantity || "0") * parseFloat(r.unitPrice || "0"),
    0,
  );
  return (
    <>
      <JmCard>
        <JmCardHeader>
          <div className="flex items-center gap-2">
            <Package className="size-4 text-[var(--jm-text-muted)]" />
            <JmCardTitle>주문 항목 편집</JmCardTitle>
            <JmBadge variant="warning" size="sm" shape="square">
              PENDING 한정
            </JmBadge>
          </div>
        </JmCardHeader>
        <JmCardContent className="space-y-3">
          <JmFormField
            label="상품 추가"
            hint={
              productsLoading
                ? "상품 목록 불러오는 중…"
                : "검색해 항목으로 추가하세요. 대표(canonical) 상품은 prepare 차단되므로 제외됩니다."
            }
          >
            <JmCombobox
              items={productItems}
              value={productPick}
              onChange={onPick}
              placeholder="상품 검색·선택"
              searchPlaceholder="상품명·SKU"
              emptyMessage={productsLoading ? "불러오는 중…" : "검색 결과 없음"}
            />
          </JmFormField>

          {rows.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-[var(--jm-border)]">
              <JmTable>
                <JmTableHeader>
                  <JmTableRow>
                    <JmTableHead>상품</JmTableHead>
                    <JmTableHead className="w-[100px]">수량</JmTableHead>
                    <JmTableHead className="w-[140px] text-right">
                      단가
                    </JmTableHead>
                    <JmTableHead className="w-[120px] text-right">
                      금액
                    </JmTableHead>
                    <JmTableHead className="w-[44px]" />
                  </JmTableRow>
                </JmTableHeader>
                <JmTableBody>
                  {rows.map((r, idx) => {
                    const lineTotal =
                      parseFloat(r.quantity || "0") *
                      parseFloat(r.unitPrice || "0");
                    return (
                      <JmTableRow key={idx} className="hover:bg-transparent">
                        <JmTableCell>
                          <div className="flex flex-col">
                            <span className="text-jm-sm text-[var(--jm-text)]">
                              {r.productName}
                            </span>
                            <span className="font-mono text-jm-2xs text-[var(--jm-text-muted)]">
                              {r.sku}
                            </span>
                          </div>
                        </JmTableCell>
                        <JmTableCell>
                          <JmInput
                            size="sm"
                            type="text"
                            inputMode="decimal"
                            value={r.quantity}
                            onChange={(e) =>
                              onUpdate(idx, { quantity: e.target.value })
                            }
                            onFocus={focusCaretEnd}
                          />
                        </JmTableCell>
                        <JmTableCell>
                          <JmInput
                            size="sm"
                            type="text"
                            inputMode="numeric"
                            value={formatComma(r.unitPrice)}
                            onChange={(e) =>
                              onUpdate(idx, {
                                unitPrice: parseComma(e.target.value),
                              })
                            }
                            onFocus={focusCaretEnd}
                            className="text-right"
                          />
                        </JmTableCell>
                        <JmTableCell className="text-right tabular-nums font-semibold">
                          ₩{lineTotal.toLocaleString("ko-KR")}
                        </JmTableCell>
                        <JmTableCell>
                          <JmIconButton
                            variant="ghost"
                            size="sm"
                            aria-label="행 삭제"
                            onClick={() => onRemove(idx)}
                          >
                            <Trash2 className="size-4" />
                          </JmIconButton>
                        </JmTableCell>
                      </JmTableRow>
                    );
                  })}
                </JmTableBody>
              </JmTable>
            </div>
          ) : (
            <div className="rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] p-6 text-center text-jm-xs text-[var(--jm-text-muted)]">
              항목이 없습니다. 위 검색에서 상품을 선택해 추가하세요.
            </div>
          )}

          <div className="flex items-baseline justify-between border-t border-[var(--jm-border)] pt-2 text-jm-sm">
            <span className="text-[var(--jm-text-muted)]">공급가액 합계</span>
            <span className="tabular-nums font-semibold">
              ₩{subtotal.toLocaleString("ko-KR")}
            </span>
          </div>
          <p className="text-jm-2xs text-[var(--jm-text-muted)]">
            ※ 부가세·총액·채널 수수료는 저장 시 자동 재계산됩니다. 할인·배송비는
            기존 값 유지.
          </p>
        </JmCardContent>
      </JmCard>

      <p className="text-center text-jm-2xs text-[var(--jm-text-muted)]">
        주문 번호 {order.orderNo} · PENDING 상태에서만 편집 가능 — prepare 후엔
        재고 차감으로 잠금
      </p>
    </>
  );
}

/* ------------------------------ FOOTER ------------------------------ */

/**
 * 상태별 액션 footer — 5단계 출고 + 5단계 반품/교환 흐름.
 *
 * PENDING            → [취소] [출고대기]
 * PREPARING          → [취소] [출고확정]
 * PREPARING_PACKED   → [발송]                                             (취소 불가, 송장 발급됨)
 * SHIPPED            → [배송완료]
 * COMPLETED          → [즉시 반품] [반품/교환 요청]                       (Dialog 에서 type 결정)
 * RETURN_REQUESTED   → [요청 취소] [반려] [수락]
 * RETURN_ACCEPTED    → [회수완료]
 * RETURN_COLLECTED   → [검수완료]
 * RETURN_INSPECTED   → [반품완료] / [교환완료]                            (claimType 따라)
 * 그 외(CANCELLED/RETURNED/EXCHANGED) → 종결 메시지
 */
function ActionFooter({
  status,
  claimType,
  fulfillmentType,
  onTransition,
  pending,
}: {
  status: OrderStatus;
  claimType: OrderClaimType | null;
  fulfillmentType: FulfillmentType;
  onTransition: (
    action:
      | "prepare"
      | "pack"
      | "ship"
      | "complete"
      | "cancel"
      | ReturnAction,
  ) => void;
  pending: boolean;
}) {
  type Btn = {
    action:
      | "prepare"
      | "pack"
      | "ship"
      | "complete"
      | "cancel"
      | ReturnAction;
    label: string;
    icon: React.ReactNode;
    /** 시각 — primary(채워짐) / outline / ghost(빨강) / ghost(회색) */
    tone: "primary" | "outline" | "danger-ghost" | "ghost";
  };
  const buttons: Btn[] = [];

  const isExchangeClaim =
    claimType === "EXCHANGE_SAME" || claimType === "EXCHANGE_DIFFERENT";

  switch (status) {
    case "PENDING":
      buttons.push({
        action: "cancel",
        label: "취소",
        icon: <XCircle className="size-4" />,
        tone: "danger-ghost",
      });
      buttons.push({
        action: "prepare",
        label: "출고대기",
        icon: <Package className="size-4" />,
        tone: "primary",
      });
      break;
    case "PREPARING":
      buttons.push({
        action: "cancel",
        label: "취소",
        icon: <XCircle className="size-4" />,
        tone: "danger-ghost",
      });
      // 매장 인도(매장판매·픽업) 는 출고확정·발송 단계 없이 바로 완료.
      // 택배/배달만 pack→ship→complete 거침.
      if (fulfillmentType === "IN_STORE" || fulfillmentType === "PICKUP") {
        buttons.push({
          action: "complete",
          label: fulfillmentType === "IN_STORE" ? "판매완료" : "픽업완료",
          icon: <CheckCircle2 className="size-4" />,
          tone: "primary",
        });
      } else {
        buttons.push({
          action: "pack",
          label: "출고확정",
          icon: <PackageCheck className="size-4" />,
          tone: "primary",
        });
      }
      break;
    case "PREPARING_PACKED":
      // 매장 인도(매장판매·픽업) 는 발송(송장) 단계 없이 바로 완료.
      // 기존에 출고확정까지 진행된 매장판매 주문도 여기서 마무리 가능.
      if (fulfillmentType === "IN_STORE" || fulfillmentType === "PICKUP") {
        buttons.push({
          action: "complete",
          label: fulfillmentType === "IN_STORE" ? "판매완료" : "픽업완료",
          icon: <CheckCircle2 className="size-4" />,
          tone: "primary",
        });
      } else {
        buttons.push({
          action: "ship",
          label: "발송",
          icon: <Truck className="size-4" />,
          tone: "primary",
        });
      }
      break;
    case "SHIPPED":
      buttons.push({
        action: "complete",
        label: "배송완료",
        icon: <CheckCircle2 className="size-4" />,
        tone: "primary",
      });
      break;
    case "COMPLETED":
      buttons.push({
        action: "return",
        label: "즉시 반품",
        icon: <RotateCcw className="size-4" />,
        tone: "danger-ghost",
      });
      buttons.push({
        action: "request_return",
        label: "반품/교환 요청",
        icon: <RotateCcw className="size-4" />,
        tone: "outline",
      });
      break;
    case "RETURN_REQUESTED":
      buttons.push({
        action: "cancel_return_request",
        label: "요청 취소",
        icon: null,
        tone: "ghost",
      });
      buttons.push({
        action: "reject_return",
        label: "반려",
        icon: <ThumbsDown className="size-4" />,
        tone: "danger-ghost",
      });
      buttons.push({
        action: "accept_return",
        label: "수락",
        icon: <Check className="size-4" />,
        tone: "primary",
      });
      break;
    case "RETURN_ACCEPTED":
      // 택배 회수 라벨 발급 흐름이 있으면 [회수 시작], 매장 직접 회수 케이스는 바로 [회수완료]
      buttons.push({
        action: "start_picking",
        label: "회수 시작",
        icon: <Truck className="size-4" />,
        tone: "outline",
      });
      buttons.push({
        action: "collect_return",
        label: "회수완료",
        icon: <PackageOpen className="size-4" />,
        tone: "primary",
      });
      break;
    case "RETURN_PICKING":
      // 택배 회수 중 — 도착 시 회수완료
      buttons.push({
        action: "collect_return",
        label: "회수완료",
        icon: <PackageOpen className="size-4" />,
        tone: "primary",
      });
      break;
    case "RETURN_COLLECTED":
      buttons.push({
        action: "reject_inspection",
        label: "검수 반려",
        icon: <ThumbsDown className="size-4" />,
        tone: "danger-ghost",
      });
      buttons.push({
        action: "inspect_return",
        label: "검수완료",
        icon: <Search className="size-4" />,
        tone: "primary",
      });
      break;
    case "RETURN_INSPECTED":
      // claimType 따라 강조 분기 — 다른 옵션은 outline 으로 변경 가능
      if (isExchangeClaim) {
        buttons.push({
          action: "refund",
          label: "반품완료(환불)",
          icon: <RotateCcw className="size-4" />,
          tone: "outline",
        });
        buttons.push({
          action: "exchange",
          label: "교환완료",
          icon: <ArrowLeftRight className="size-4" />,
          tone: "primary",
        });
      } else {
        buttons.push({
          action: "exchange",
          label: "교환완료",
          icon: <ArrowLeftRight className="size-4" />,
          tone: "outline",
        });
        buttons.push({
          action: "refund",
          label: "반품완료",
          icon: <RotateCcw className="size-4" />,
          tone: "primary",
        });
      }
      break;
  }

  if (buttons.length === 0) {
    return (
      <div className="border-t border-[var(--jm-border)] bg-[var(--jm-surface)] px-5 py-4 text-center text-jm-xs text-[var(--jm-text-muted)]">
        종결된 주문입니다
      </div>
    );
  }

  return (
    <JmDrawerFooter>
      {buttons.map((b) => {
        const isPrimary = b.tone === "primary";
        const variant: "outline" | "ghost" | undefined =
          b.tone === "outline"
            ? "outline"
            : b.tone === "ghost" || b.tone === "danger-ghost"
              ? "ghost"
              : undefined;
        const className =
          b.tone === "danger-ghost"
            ? "text-[var(--jm-danger-fg)] hover:bg-[var(--jm-danger-bg)]"
            : undefined;
        return (
          <JmButton
            key={b.action}
            variant={variant}
            onClick={() => onTransition(b.action)}
            disabled={pending}
            className={className}
          >
            {isPrimary && pending ? (
              <JmSpinner size="sm" tone="inverted" />
            ) : (
              b.icon
            )}
            {b.label}
          </JmButton>
        );
      })}
    </JmDrawerFooter>
  );
}

/* ------------------------------ HELPERS ------------------------------ */

function FulfillmentIcon({ type }: { type: FulfillmentType }) {
  const Icon =
    type === "DELIVERY"
      ? Truck
      : type === "SHIPPING"
      ? Package
      : type === "PICKUP"
      ? ShoppingBag
      : Store; // IN_STORE
  return <Icon className="size-3" />;
}

function Field({
  label,
  icon,
  children,
  className = "",
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      <JmSectionLabel className="flex items-center gap-1 text-jm-3xs">
        {icon && (
          <span className="text-[var(--jm-text-subtle)]">{icon}</span>
        )}
        {label}
      </JmSectionLabel>
      <span className="text-jm-sm text-[var(--jm-text)]">{children}</span>
    </div>
  );
}

function SumRow({
  label,
  value,
  muted,
  bold,
}: {
  label: string;
  value: number;
  muted?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span
        className={
          muted ? "text-[var(--jm-text-muted)]" : "text-[var(--jm-text)]"
        }
      >
        {label}
      </span>
      <span
        className={`tabular-nums ${
          bold
            ? "text-jm-lg font-bold text-[var(--jm-text)]"
            : muted
              ? "text-[var(--jm-text-muted)]"
              : "text-[var(--jm-text)]"
        }`}
      >
        {value < 0 ? "−" : ""}₩{Math.abs(value).toLocaleString("ko-KR")}
      </span>
    </div>
  );
}

/**
 * 세금계산서 발행 요청 토글 — 종결 주문(완료 등) 포함 어느 상태에서나 변경 가능 (CANCELLED 제외).
 * 단독 PATCH 라 출고 흐름 잠금을 우회. 토글 즉시 자동 저장.
 */
function TaxInvoiceToggle({
  orderId,
  requested,
  disabled,
}: {
  orderId: string;
  requested: boolean;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const [override, setOverride] = useState<boolean | null>(null);
  const checked = override ?? requested;
  const mutation = useMutation({
    mutationFn: (next: boolean) =>
      apiMutate(`/api/orders/${orderId}`, "PATCH", {
        taxInvoiceRequested: next,
      }),
    onSuccess: (_d, next) => {
      toast.success(
        next ? "세금계산서 발행 요청됨" : "세금계산서 발행 요청 해제됨",
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
    },
    onError: (err) => {
      setOverride(null);
      toast.error(err instanceof ApiError ? err.message : "저장 실패");
    },
  });
  return (
    <div className="flex items-center justify-between border-t border-[var(--jm-border)] pt-2 text-jm-xs">
      <span className="text-[var(--jm-text-muted)]">세금계산서 발행 요청</span>
      <JmSwitch
        size="sm"
        checked={checked}
        disabled={disabled || mutation.isPending}
        onCheckedChange={(v) => {
          setOverride(v);
          mutation.mutate(v);
        }}
      />
    </div>
  );
}

/**
 * 송장 사전 등록 카드 — PREPARING 단계에서 송장 정보를 미리 입력해두는 경량 카드.
 * 출고확정(pack→ship) 시점의 ship 다이얼로그가 같은 trackingCarrier/Number 를 prefill.
 *
 * 매장 운영 흐름:
 *  1) 출고대기 진입 (재고 차감)
 *  2) 포장 + 외부 시스템에서 송장번호 발급 (택배사 API / 라벨 프린터)
 *  3) 이 카드에서 송장 정보 입력 → PATCH 로 Order 에 저장
 *  4) 출고확정 클릭 → ship 다이얼로그가 자동 prefill, 사용자는 확인만 누름
 */
function PreShipmentTrackingCard({ order }: { order: OrderDetail }) {
  const queryClient = useQueryClient();
  const [carrier, setCarrier] = useState(order.trackingCarrier ?? "");
  const [number, setNumber] = useState(order.trackingNumber ?? "");

  const saveMutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/orders/${order.id}`, "PATCH", {
        trackingCarrier: carrier.trim() || null,
        trackingNumber: number.trim() || null,
      }),
    onSuccess: () => {
      toast.success("송장 정보가 저장되었습니다 — 출고확정 시 자동 prefill");
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  const dirty =
    (order.trackingCarrier ?? "") !== carrier.trim() ||
    (order.trackingNumber ?? "") !== number.trim();

  return (
    <JmCard>
      <JmCardHeader>
        <div className="flex items-center gap-2">
          <Truck className="size-4 text-[var(--jm-text-muted)]" />
          <JmCardTitle>송장 사전 등록</JmCardTitle>
          <span className="text-jm-xs text-[var(--jm-text-muted)]">
            출고확정 전 송장 미리 발급 (선택)
          </span>
        </div>
      </JmCardHeader>
      <JmCardContent>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[160px_1fr_auto]">
          <JmFormField label="택배사">
            <JmInput
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              placeholder="CJ대한통운"
            />
          </JmFormField>
          <JmFormField label="송장번호">
            <JmInput
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="숫자만"
            />
          </JmFormField>
          <div className="flex items-end">
            <JmButton
              variant="cta"
              onClick={() => saveMutation.mutate()}
              disabled={!dirty || saveMutation.isPending}
            >
              {saveMutation.isPending && <JmSpinner size="xs" tone="inverted" />}
              저장
            </JmButton>
          </div>
        </div>
        <p className="mt-2 text-jm-2xs text-[var(--jm-text-subtle)]">
          여기서 저장한 송장은 출고확정(ship) 다이얼로그의 입력란에 자동으로 채워집니다.
          여러 회차 발송이 필요한 경우 회차별 송장은 발송 후 [발송 이력] 카드에서 따로 관리됩니다.
        </p>
      </JmCardContent>
    </JmCard>
  );
}

/**
 * 교환 발송 안내 카드 — 이 주문이 다른 주문의 교환으로 생성된 경우 노출.
 * - 원본 주문 link
 * - 차액 자동 계산 (claimType=EXCHANGE_DIFFERENT 일 때 의미 있음)
 * - claimReason 기반 운임 책임 안내
 * - 매출 중복 방지 안내 (마진 리포트에서 제외됨)
 */
/**
 * 분할 송장 회차 이력 카드.
 * - 회차별로 송장정보 + 어느 라인을 얼마만큼 발송했는지 표시.
 * - 1건이라도 있으면 부모가 렌더 (단일 발송도 1차 회차로 표시)
 *
 * 한국 오픈마켓 (네이버·쿠팡) 패턴 — 한 주문 안 여러 송장번호를 회차별로 보관.
 */
function ShipmentHistoryCard({ order }: { order: OrderDetail }) {
  const queryClient = useQueryClient();
  const itemById = new Map(order.items.map((it) => [it.id, it]));
  // 회차 단위 수정 dialog 상태
  const [editing, setEditing] = useState<{
    shipmentNo: number;
    trackingCarrier: string;
    trackingNumber: string;
    memo: string;
  } | null>(null);
  // 회차 취소 확인 dialog
  const [cancelTarget, setCancelTarget] = useState<number | null>(null);

  const cancelable =
    order.status === "PREPARING" ||
    order.status === "PREPARING_PACKED" ||
    order.status === "SHIPPED";

  const updateMutation = useMutation({
    mutationFn: ({
      shipmentNo,
      data,
    }: {
      shipmentNo: number;
      data: {
        trackingCarrier?: string | null;
        trackingNumber?: string | null;
        memo?: string | null;
      };
    }) =>
      apiMutate(
        `/api/orders/${order.id}/shipments/${shipmentNo}`,
        "PATCH",
        data,
      ),
    onSuccess: () => {
      toast.success("송장 정보가 갱신되었습니다");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "수정 실패"),
  });

  const cancelMutation = useMutation({
    mutationFn: (shipmentNo: number) =>
      apiMutate(`/api/orders/${order.id}/shipments/${shipmentNo}`, "DELETE"),
    onSuccess: () => {
      toast.success("회차 취소 완료 — 발송 수량 복원");
      setCancelTarget(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "취소 실패"),
  });

  return (
    <>
      <JmCard className="overflow-hidden p-0">
        <JmCardHeader>
          <div className="flex items-center gap-2">
            <Truck className="size-4 text-[var(--jm-text-muted)]" />
            <JmCardTitle>발송 이력</JmCardTitle>
            <span className="text-jm-xs text-[var(--jm-text-muted)]">
              {order.shipments.length}회차
            </span>
          </div>
        </JmCardHeader>
        <JmCardContent className="space-y-3">
          {order.shipments.map((s) => {
            const tracking = [s.trackingCarrier, s.trackingNumber]
              .filter(Boolean)
              .join(" · ");
            return (
              <div
                key={s.id}
                className="rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface)] p-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <JmBadge variant="info" size="sm" shape="square">
                    {s.shipmentNo}차 발송
                  </JmBadge>
                  <span className="text-jm-xs text-[var(--jm-text-muted)]">
                    {new Date(s.shippedAt).toLocaleString("ko-KR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                  {tracking ? (
                    <span className="font-mono text-jm-xs text-[var(--jm-text)]">
                      {tracking}
                    </span>
                  ) : (
                    <span className="text-jm-2xs text-[var(--jm-text-subtle)]">
                      송장정보 없음
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <JmButton
                      size="xs"
                      variant="ghost"
                      onClick={() =>
                        setEditing({
                          shipmentNo: s.shipmentNo,
                          trackingCarrier: s.trackingCarrier ?? "",
                          trackingNumber: s.trackingNumber ?? "",
                          memo: s.memo ?? "",
                        })
                      }
                    >
                      수정
                    </JmButton>
                    {cancelable && (
                      <JmButton
                        size="xs"
                        variant="ghost"
                        onClick={() => setCancelTarget(s.shipmentNo)}
                      >
                        취소
                      </JmButton>
                    )}
                  </div>
                </div>
                <ul className="space-y-0.5 text-jm-xs">
                  {s.items.map((si) => {
                    const it = itemById.get(si.orderItemId);
                    return (
                      <li
                        key={si.id}
                        className="flex items-center gap-2 text-[var(--jm-text)]"
                      >
                        <span className="line-clamp-1 flex-1">
                          {it?.product?.name ?? it?.serviceName ?? "—"}
                        </span>
                        <span className="tabular-nums text-[var(--jm-text-muted)]">
                          {Number(si.quantity).toLocaleString("ko-KR")}개
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {s.memo && (
                  <p className="mt-2 text-jm-2xs text-[var(--jm-text-subtle)]">
                    {s.memo}
                  </p>
                )}
              </div>
            );
          })}
        </JmCardContent>
      </JmCard>

      {/* 회차 송장 수정 dialog */}
      <JmDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <JmDialogContent size="md">
          <JmDialogHeader>
            <JmDialogTitle>
              {editing?.shipmentNo}차 발송 송장 수정
            </JmDialogTitle>
          </JmDialogHeader>
          {editing && (
            <div className="space-y-3 px-1">
              <FieldEditRow label="택배사">
                <JmInput
                  value={editing.trackingCarrier}
                  onChange={(e) =>
                    setEditing({ ...editing, trackingCarrier: e.target.value })
                  }
                  placeholder="CJ대한통운"
                />
              </FieldEditRow>
              <FieldEditRow label="송장번호">
                <JmInput
                  value={editing.trackingNumber}
                  onChange={(e) =>
                    setEditing({ ...editing, trackingNumber: e.target.value })
                  }
                  placeholder="1234567890"
                />
              </FieldEditRow>
              <FieldEditRow label="메모">
                <JmInput
                  value={editing.memo}
                  onChange={(e) =>
                    setEditing({ ...editing, memo: e.target.value })
                  }
                  placeholder="(선택)"
                />
              </FieldEditRow>
            </div>
          )}
          <JmDialogFooter>
            <JmButton variant="ghost" onClick={() => setEditing(null)}>
              취소
            </JmButton>
            <JmButton
              onClick={() =>
                editing &&
                updateMutation.mutate({
                  shipmentNo: editing.shipmentNo,
                  data: {
                    trackingCarrier: editing.trackingCarrier || null,
                    trackingNumber: editing.trackingNumber || null,
                    memo: editing.memo || null,
                  },
                })
              }
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending && (
                <JmSpinner size="xs" tone="inverted" />
              )}
              저장
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>

      {/* 회차 취소 확인 dialog */}
      <JmDialog
        open={cancelTarget !== null}
        onOpenChange={(o) => !o && setCancelTarget(null)}
      >
        <JmDialogContent size="sm">
          <JmDialogHeader>
            <JmDialogTitle>{cancelTarget}차 발송을 취소할까요?</JmDialogTitle>
          </JmDialogHeader>
          <p className="px-1 text-jm-sm text-[var(--jm-text-muted)]">
            이 회차의 발송 수량만큼 항목별 발송 수량(shippedQty) 이 차감되며,
            잔량이 발생하면 주문 상태가 출고확정으로 복귀합니다. 송장은 영구
            삭제됩니다.
          </p>
          <JmDialogFooter>
            <JmButton variant="ghost" onClick={() => setCancelTarget(null)}>
              아니오
            </JmButton>
            <JmButton
              variant="danger"
              onClick={() =>
                cancelTarget !== null && cancelMutation.mutate(cancelTarget)
              }
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending && (
                <JmSpinner size="xs" tone="inverted" />
              )}
              회차 취소
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>
    </>
  );
}

function FieldEditRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[80px_1fr] items-center gap-3">
      <span className="text-jm-xs text-[var(--jm-text-muted)]">{label}</span>
      {children}
    </div>
  );
}

function ExchangeReplacementCard({ order }: { order: OrderDetail }) {
  const origin = order.exchangedFromOrders[0];
  if (!origin) return null;
  const originAmount = Number(origin.totalAmount);
  const currentAmount = Number(order.totalAmount);
  const diff = currentAmount - originAmount;
  const reason = origin.claimReason;
  const isSame = origin.claimType === "EXCHANGE_SAME";

  const liability = reason ? CLAIM_REASON_LIABILITY[reason] : null;
  const liabilityNote = liabilityShippingNote(reason);

  // 차액 표시 분기
  let diffMessage: { tone: "warning" | "muted"; text: string } | null = null;
  if (isSame) {
    diffMessage = {
      tone: "muted",
      text: "같은 상품 재발송 — 차액 없음 (이미 결제 완료된 건 매출 미인식)",
    };
  } else if (diff > 0) {
    diffMessage = {
      tone: "warning",
      text: `손님 추가 결제 필요 +₩${diff.toLocaleString("ko-KR")}`,
    };
  } else if (diff < 0) {
    diffMessage = {
      tone: "warning",
      text: `매장 환불 필요 ₩${Math.abs(diff).toLocaleString("ko-KR")}`,
    };
  } else {
    diffMessage = {
      tone: "muted",
      text: "차액 없음 (동일 금액 교환)",
    };
  }

  return (
    <JmCard className="border-[var(--jm-info-bg)]">
      <JmCardHeader>
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="size-4 text-[var(--jm-info-fg)]" />
          <JmCardTitle>교환 발송</JmCardTitle>
          <JmBadge variant="info" size="sm" shape="square">
            매출 미인식
          </JmBadge>
        </div>
      </JmCardHeader>
      <JmCardContent className="space-y-3 text-jm-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[var(--jm-text-muted)]">원본 주문 ·</span>
          <a
            href={`/orders?id=${origin.id}`}
            className="font-mono text-[var(--jm-action)] underline-offset-2 hover:underline"
          >
            {origin.orderNo}
          </a>
          <span className="tabular-nums text-[var(--jm-text-muted)]">
            ₩{originAmount.toLocaleString("ko-KR")}
          </span>
          {origin.claimType && (
            <JmBadge variant="outline" size="sm" shape="square">
              {CLAIM_TYPE_LABELS[origin.claimType]}
            </JmBadge>
          )}
          {reason && (
            <JmBadge variant="default" size="sm" shape="square">
              {CLAIM_REASON_LABELS[reason]}
            </JmBadge>
          )}
        </div>

        <div
          className={`rounded-lg border p-2.5 text-jm-xs ${
            diffMessage.tone === "warning"
              ? "border-[var(--jm-warning-bg)] bg-[var(--jm-warning-bg)] text-[var(--jm-warning-fg)]"
              : "border-[var(--jm-border)] bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)]"
          }`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span>현재 주문 합계</span>
            <span className="tabular-nums font-semibold">
              ₩{currentAmount.toLocaleString("ko-KR")}
            </span>
          </div>
          <div className="mt-1 font-medium">{diffMessage.text}</div>
        </div>

        {liability && liabilityNote && (
          <div className="flex items-start gap-2 text-jm-2xs text-[var(--jm-text-muted)]">
            <JmBadge
              variant={liability === "shop" ? "warning" : "outline"}
              size="sm"
              shape="square"
            >
              운임 {LIABILITY_LABELS[liability]}
            </JmBadge>
            <span className="leading-relaxed">{liabilityNote}</span>
          </div>
        )}

        {!isSame && (
          <p className="text-jm-2xs text-[var(--jm-text-muted)]">
            ※ 항목과 차액 정산은 일반 주문 흐름으로 처리하세요. 추가 결제는 결제
            완료 후 paymentStatus 가 PAID 로 갱신됩니다.
          </p>
        )}
      </JmCardContent>
    </JmCard>
  );
}

function DetailSkeleton() {
  return (
    <>
      <JmCard>
        <JmCardHeader>
          <JmSkeleton className="h-5 w-24" />
        </JmCardHeader>
        <JmCardContent>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex flex-col gap-1">
                <JmSkeleton className="h-3 w-16" />
                <JmSkeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        </JmCardContent>
      </JmCard>
      <JmCard className="p-0 overflow-hidden">
        <JmCardHeader>
          <JmSkeleton className="h-5 w-24" />
        </JmCardHeader>
        <div className="space-y-2 p-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <JmSkeleton className="h-4 w-40" />
              <JmSkeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </JmCard>
    </>
  );
}

function paymentLabel(method: string): string {
  switch (method) {
    case "CARD":
      return "카드";
    case "CASH":
      return "현금";
    case "TRANSFER":
      return "계좌이체";
    case "MIXED":
      return "혼합";
    case "UNPAID":
      return "외상";
    default:
      return method;
  }
}

/**
 * 분할 출고 연결 주문 행 — 누르면 그 자리에서 품목·합계 펼쳐보기(페이지 이동 없음).
 * [전체 보기] 만 client-side 로 해당 주문 상세로 전환(새로고침 없음).
 */
function ConnectedOrderRow({
  order,
  roleLabel,
}: {
  order: SplitLinkedOrder;
  roleLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--jm-border)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2.5 py-2 text-left text-jm-xs hover:bg-[var(--jm-surface-muted)]"
      >
        <span className="font-semibold text-[var(--jm-text)]">{roleLabel}</span>
        <span className="font-mono text-[var(--jm-text-muted)]">{order.orderNo}</span>
        <JmBadge variant="outline" size="sm" shape="square">
          {STATUS_LABELS[order.status]}
        </JmBadge>
        <ChevronDown
          className={`ml-auto size-4 shrink-0 text-[var(--jm-text-muted)] transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div className="border-t border-[var(--jm-border)] bg-[var(--jm-surface-muted)]/40 px-2.5 py-2">
          <div className="space-y-1">
            {order.items.map((it) => (
              <div
                key={it.id}
                className="flex items-center justify-between gap-2 text-jm-2xs"
              >
                <span className="line-clamp-1 text-[var(--jm-text)]">
                  {it.product?.name ?? it.serviceName ?? "—"}
                  <span className="ml-1 text-[var(--jm-text-muted)]">
                    ×{Number(it.quantity)}
                  </span>
                </span>
                <span className="shrink-0 font-medium tabular-nums text-[var(--jm-text)]">
                  ₩{Number(it.totalPrice).toLocaleString("ko-KR")}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex items-center justify-between border-t border-[var(--jm-border)] pt-1.5">
            <span className="text-jm-2xs text-[var(--jm-text-muted)]">합계</span>
            <span className="text-jm-xs font-semibold tabular-nums text-[var(--jm-text)]">
              ₩{Number(order.totalAmount).toLocaleString("ko-KR")}
            </span>
          </div>
          <button
            type="button"
            onClick={() => router.push(`/orders?id=${order.id}`)}
            className="mt-1.5 w-full rounded-lg border border-[var(--jm-border)] py-1.5 text-jm-2xs font-medium text-[var(--jm-action)] hover:bg-[var(--jm-surface)]"
          >
            전체 보기 →
          </button>
        </div>
      )}
    </div>
  );
}
