"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Banknote,
  CalendarClock,
  Check,
  CheckCircle2,
  MapPin,
  Package,
  Pencil,
  Phone,
  Printer,
  StickyNote,
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
  JmDialog,
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
import { formatCurrency } from "./_helpers";
import { PaymentStatusBadge, StatusBadge } from "./_parts";

const FULFILLMENT_OPTIONS: { value: FulfillmentType; label: string }[] = [
  { value: "PICKUP", label: "매장 수령" },
  { value: "DELIVERY", label: "배달" },
  { value: "SHIPPING", label: "택배" },
];

function isEditable(status: OrderStatus) {
  return status === "PENDING" || status === "PREPARING" || status === "SHIPPED";
}

/**
 * 반품 액션 — 손님 요청 → 매장 결정(수락/반려) → 회수 후 종결(환불 또는 교환).
 * 즉시 반품(COMPLETED→RETURNED)은 매장 즉석 처리용 단축 경로.
 */
type ReturnAction =
  | "request_return"
  | "accept_return"
  | "reject_return"
  | "cancel_return_request"
  | "return"
  | "exchange";

interface OrderDetail {
  id: string;
  orderNo: string;
  channelOrderNo: string | null;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  expectedShipDate: string | null;
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
  taxAmount: string;
  totalAmount: string;
  commissionAmount: string;
  memo: string | null;
  paymentMethod: string | null;
  paymentStatus: OrderPaymentStatus;
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
  createdBy: { name: string };
  items: Array<{
    id: string;
    quantity: string;
    unitPrice: string;
    totalPrice: string;
    product: { id: string; name: string; sku: string } | null;
    serviceName: string | null;
  }>;
}

interface Props {
  orderId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface EditForm {
  fulfillmentType: FulfillmentType;
  expectedShipDate: string;
  recipientName: string;
  recipientPhone: string;
  shippingAddress: string;
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
    memo: o.memo ?? "",
  };
}

export function OrderDetailSheet({ orderId, open, onOpenChange }: Props) {
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
  // 반품 요청 Dialog (claimType + reason 입력)
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [claimType, setClaimType] = useState<OrderClaimType>("REFUND");
  const [claimReason, setClaimReason] = useState<OrderClaimReason | "">("");
  const [claimNote, setClaimNote] = useState("");
  // 교환 분기 Dialog (RETURN_ACCEPTED 에서 SAME/DIFFERENT 결정)
  const [exchangeDialogOpen, setExchangeDialogOpen] = useState(false);
  const [exchangeKind, setExchangeKind] = useState<
    "EXCHANGE_SAME" | "EXCHANGE_DIFFERENT"
  >("EXCHANGE_SAME");

  useEffect(() => {
    setEditing(false);
    setEditForm(null);
    setEditingItems(false);
    setItemsForm([]);
    setProductPick("");
    setShipDialogOpen(false);
    setTrackingCarrier("");
    setTrackingNumber("");
    setClaimDialogOpen(false);
    setClaimType("REFUND");
    setClaimReason("");
    setClaimNote("");
    setExchangeDialogOpen(false);
    setExchangeKind("EXCHANGE_SAME");
  }, [orderId, open]);

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
        memo: form.memo,
      }),
    onSuccess: () => {
      toast.success("저장되었습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
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
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "삭제 실패"),
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
      setClaimDialogOpen(false);
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "처리 실패"),
  });

  // 교환 처리 — claimType (SAME/DIFFERENT) 을 함께 보내 새 주문 항목 prefill 분기.
  const exchangeMutation = useMutation({
    mutationFn: (kind: "EXCHANGE_SAME" | "EXCHANGE_DIFFERENT") =>
      apiMutate(`/api/orders/${orderId}`, "PUT", {
        action: "exchange",
        claimType: kind,
      }),
    onSuccess: () => {
      toast.success(
        "교환 처리 완료 — 새 주문이 생성되었습니다. 차액·항목은 새 주문에서 편집하세요.",
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      setExchangeDialogOpen(false);
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "처리 실패"),
  });

  const transitionMutation = useMutation({
    mutationFn: (
      action:
        | "prepare"
        | "complete"
        | "cancel"
        | ReturnAction,
    ) => apiMutate(`/api/orders/${orderId}`, "PUT", { action }),
    onSuccess: (_data, action) => {
      const labels: Record<string, string> = {
        prepare: "준비 시작 — 재고가 차감되었습니다",
        complete: "주문이 완료되었습니다",
        cancel: "주문이 취소되었습니다 (재고·환불 복원)",
        request_return: "반품 요청 접수 — 매장 결정 대기",
        accept_return: "반품 수락됨 — 회수 대기 상태입니다",
        reject_return: "반품 요청을 반려했습니다",
        cancel_return_request: "반품 요청을 취소했습니다",
        return: "반품 처리 완료 — 재고 복원·환불되었습니다",
        exchange: "교환 처리 완료 — 재고 복원, 차액은 새 주문에서 정산하세요",
      };
      toast.success(labels[action]);
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
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
      | "ship"
      | "complete"
      | "cancel"
      | ReturnAction,
  ) => {
    if (action === "ship") {
      setTrackingCarrier(detailQuery.data?.trackingCarrier ?? "");
      setTrackingNumber(detailQuery.data?.trackingNumber ?? "");
      setShipDialogOpen(true);
      return;
    }
    // 반품 요청 — Dialog 로 claimType + reason 입력 받기
    if (action === "request_return") {
      setClaimType("REFUND");
      setClaimReason("");
      setClaimNote("");
      setClaimDialogOpen(true);
      return;
    }
    // 교환 처리 — Dialog 로 SAME/DIFFERENT 분기 선택
    if (action === "exchange") {
      const cur = detailQuery.data?.claimType;
      setExchangeKind(
        cur === "EXCHANGE_DIFFERENT" ? "EXCHANGE_DIFFERENT" : "EXCHANGE_SAME",
      );
      setExchangeDialogOpen(true);
      return;
    }
    const confirms: Partial<Record<typeof action, string>> = {
      cancel: "주문을 취소하시겠습니까?\n재고가 복원되고 결제건은 환불 처리됩니다.",
      accept_return:
        "반품 요청을 수락합니다.\n회수 대기 상태로 전환됩니다 (재고 미복원).",
      reject_return:
        "반품 요청을 반려하시겠습니까?\n주문은 완료 상태로 되돌아갑니다.",
      cancel_return_request: "반품 요청을 취소하고 완료 상태로 되돌리시겠습니까?",
      return:
        "회수 완료 — 환불 처리합니다.\n재고가 복원되고 결제건은 환불 처리됩니다.",
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
            <JmDrawerTitle className="font-mono text-[15px]">
              {data?.orderNo ?? "—"}
            </JmDrawerTitle>
            {data && (
              <>
                <StatusBadge status={data.status} />
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
                        window.open(
                          `/pos-receipt/${data.id}/print`,
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                    >
                      <Printer className="size-3.5" />
                      영수증
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
                <JmCardContent className="text-center text-[13px] text-[var(--jm-danger-fg)]">
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
              <ReadView order={data} />
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
            onTransition={handleTransition}
            pending={transitionPending}
          />
        ) : null}
      </JmDrawerContent>

      {/* 송장 입력 Dialog — ship 액션 */}
      <JmDialog open={shipDialogOpen} onOpenChange={setShipDialogOpen}>
        <JmDialogContent size="md">
          <JmDialogHeader>
            <JmDialogTitle>발송 처리 — 송장 정보</JmDialogTitle>
          </JmDialogHeader>
          <div className="space-y-3 px-5 py-4">
            <JmFormField label="택배사">
              <JmInput
                value={trackingCarrier}
                onChange={(e) => setTrackingCarrier(e.target.value)}
                placeholder="예: CJ대한통운 / 자체배달"
              />
            </JmFormField>
            <JmFormField
              label="송장번호"
              hint="빈 채로 진행 시 발송만 처리되고 송장은 추후 수정에서 채울 수 있습니다."
            >
              <JmInput
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="송장번호"
              />
            </JmFormField>
          </div>
          <JmDialogFooter>
            <JmButton
              variant="outline"
              onClick={() => setShipDialogOpen(false)}
              disabled={shipMutation.isPending}
            >
              취소
            </JmButton>
            <JmButton
              onClick={() => shipMutation.mutate()}
              disabled={shipMutation.isPending}
            >
              {shipMutation.isPending && <JmSpinner size="sm" tone="inverted" />}
              발송 처리
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
                      className={`h-11 rounded-xl border-2 text-[12px] font-medium transition-colors ${
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
                        className={`h-10 rounded-lg border text-[12px] transition-colors ${
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

      {/* 교환 분기 Dialog — RETURN_ACCEPTED 에서 회수 후 처리 종류 선택 */}
      <JmDialog open={exchangeDialogOpen} onOpenChange={setExchangeDialogOpen}>
        <JmDialogContent size="md">
          <JmDialogHeader>
            <JmDialogTitle>교환 처리</JmDialogTitle>
          </JmDialogHeader>
          <div className="space-y-3 px-5 py-4">
            <p className="text-[13px] text-[var(--jm-text-muted)]">
              회수 완료 시 새 주문이 자동 생성됩니다. 차액·항목은 새 주문에서
              편집하세요.
            </p>
            {/* 운임 책임 안내 — claimReason 기반 자동 권장 */}
            {detailQuery.data?.claimReason &&
              (() => {
                const reason = detailQuery.data.claimReason;
                const liability = CLAIM_REASON_LIABILITY[reason];
                const note = liabilityShippingNote(reason);
                return (
                  <div className="flex items-start gap-2 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] p-2.5 text-[12px]">
                    <JmBadge
                      variant={liability === "shop" ? "warning" : "outline"}
                      size="sm"
                      shape="square"
                    >
                      {CLAIM_REASON_LABELS[reason]} · 운임{" "}
                      {LIABILITY_LABELS[liability]}
                    </JmBadge>
                    <span className="text-[var(--jm-text-muted)] leading-relaxed">
                      {note}
                    </span>
                  </div>
                );
              })()}
            <div className="space-y-2">
              {(["EXCHANGE_SAME", "EXCHANGE_DIFFERENT"] as const).map((k) => {
                const active = exchangeKind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setExchangeKind(k)}
                    className={`flex w-full flex-col gap-0.5 rounded-xl border-2 p-3 text-left transition-colors ${
                      active
                        ? "border-[var(--jm-action)] bg-[var(--jm-surface-muted)]"
                        : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)]"
                    }`}
                  >
                    <span className="text-[14px] font-medium text-[var(--jm-text)]">
                      {CLAIM_TYPE_LABELS[k]}
                    </span>
                    <span className="text-[11px] text-[var(--jm-text-muted)]">
                      {k === "EXCHANGE_SAME"
                        ? "원래 주문 항목 그대로 새 주문에 복제 (차액 없음, 매출 0)"
                        : "새 주문은 빈 항목으로 생성 — 항목·차액 직접 등록"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <JmDialogFooter>
            <JmButton
              variant="outline"
              onClick={() => setExchangeDialogOpen(false)}
              disabled={exchangeMutation.isPending}
            >
              취소
            </JmButton>
            <JmButton
              onClick={() => exchangeMutation.mutate(exchangeKind)}
              disabled={exchangeMutation.isPending}
            >
              {exchangeMutation.isPending && (
                <JmSpinner size="sm" tone="inverted" />
              )}
              교환 처리
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>
    </JmDrawer>
  );
}

/* ------------------------------ READ VIEW ------------------------------ */

function ReadView({ order }: { order: OrderDetail }) {
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
            {order.fulfillmentType !== "PICKUP" && (
              <>
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

      {/* 주문 항목 */}
      <JmCard className="overflow-hidden p-0">
        <JmCardHeader>
          <div className="flex items-center gap-2">
            <Package className="size-4 text-[var(--jm-text-muted)]" />
            <JmCardTitle>주문 항목</JmCardTitle>
            <span className="text-[12px] text-[var(--jm-text-muted)]">
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
            {order.items.map((item) => (
              <JmTableRow key={item.id} className="hover:bg-transparent">
                <JmTableCell>
                  <div className="flex flex-col">
                    <span className="text-[13px] text-[var(--jm-text)]">
                      {item.product?.name ?? item.serviceName ?? "—"}
                    </span>
                    {item.product?.sku && (
                      <span className="font-mono text-[11px] text-[var(--jm-text-muted)]">
                        {item.product.sku}
                      </span>
                    )}
                  </div>
                </JmTableCell>
                <JmTableCell className="text-right tabular-nums">
                  {Number(item.quantity).toLocaleString("ko-KR")}
                </JmTableCell>
                <JmTableCell className="text-right tabular-nums">
                  {formatCurrency(item.unitPrice)}
                </JmTableCell>
                <JmTableCell className="text-right tabular-nums font-semibold">
                  {formatCurrency(item.totalPrice)}
                </JmTableCell>
              </JmTableRow>
            ))}
          </JmTableBody>
        </JmTable>
      </JmCard>

      {/* 금액 + 고객 — 좌우 분할 (모바일은 stack) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <JmCard>
          <JmCardHeader>
            <div className="flex items-center gap-2">
              <Banknote className="size-4 text-[var(--jm-text-muted)]" />
              <JmCardTitle>금액 요약</JmCardTitle>
            </div>
          </JmCardHeader>
          <JmCardContent className="space-y-1.5 text-[13px]">
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
            <div className="flex flex-wrap items-center gap-2 pt-1.5 text-[11px] text-[var(--jm-text-muted)]">
              {order.paymentMethod && (
                <span>결제수단 · {paymentLabel(order.paymentMethod)}</span>
              )}
              <PaymentStatusBadge status={order.paymentStatus} showPaid />
            </div>
            {(order.returnRequestedAt ||
              order.returnAcceptedAt ||
              order.returnRejectedAt ||
              order.exchangedAt ||
              order.claimType ||
              order.claimReason ||
              order.returnReason ||
              order.exchangeOrder ||
              order.exchangedFromOrders.length > 0) && (
              <div className="mt-2 space-y-1 border-t border-[var(--jm-border)] pt-2 text-[11px] text-[var(--jm-text-muted)]">
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
              {order.fulfillmentType !== "PICKUP" &&
                ((order.recipientName &&
                  order.recipientName !== order.customerName) ||
                  (order.recipientPhone &&
                    order.recipientPhone !== order.customerPhone)) && (
                  <p className="col-span-2 text-[11px] text-[var(--jm-warning-fg)]">
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
            <p className="whitespace-pre-line text-[13px] text-[var(--jm-text)]">
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
                    className={`h-11 rounded-xl border-2 text-[14px] font-medium transition-colors ${
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

          {form.fulfillmentType !== "PICKUP" && (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <JmFormField label="출고 예정일">
                  <JmInput
                    type="date"
                    value={form.expectedShipDate}
                    onChange={(e) => set("expectedShipDate", e.target.value)}
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

      <p className="text-center text-[11px] text-[var(--jm-text-muted)]">
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
                            <span className="text-[13px] text-[var(--jm-text)]">
                              {r.productName}
                            </span>
                            <span className="font-mono text-[11px] text-[var(--jm-text-muted)]">
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
                            onFocus={(e) => e.currentTarget.select()}
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
                            onFocus={(e) => e.currentTarget.select()}
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
            <div className="rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] p-6 text-center text-[12px] text-[var(--jm-text-muted)]">
              항목이 없습니다. 위 검색에서 상품을 선택해 추가하세요.
            </div>
          )}

          <div className="flex items-baseline justify-between border-t border-[var(--jm-border)] pt-2 text-[13px]">
            <span className="text-[var(--jm-text-muted)]">공급가액 합계</span>
            <span className="tabular-nums font-semibold">
              ₩{subtotal.toLocaleString("ko-KR")}
            </span>
          </div>
          <p className="text-[11px] text-[var(--jm-text-muted)]">
            ※ 부가세·총액·채널 수수료는 저장 시 자동 재계산됩니다. 할인·배송비는
            기존 값 유지.
          </p>
        </JmCardContent>
      </JmCard>

      <p className="text-center text-[11px] text-[var(--jm-text-muted)]">
        주문 번호 {order.orderNo} · PENDING 상태에서만 편집 가능 — prepare 후엔
        재고 차감으로 잠금
      </p>
    </>
  );
}

/* ------------------------------ FOOTER ------------------------------ */

/**
 * 상태별 액션 footer.
 *
 * PENDING            → [취소] [준비 시작]
 * PREPARING          → [취소] [발송]
 * SHIPPED            → [완료]
 * COMPLETED          → [즉시 반품] [반품 요청]                         (1단계 또는 손님이 사후 요청)
 * RETURN_REQUESTED   → [요청 취소] [반려] [수락]                       (매장이 손님 요청에 응답)
 * RETURN_ACCEPTED    → [환불 처리] [교환 처리]                          (회수 후 종결 분기)
 * 그 외(CANCELLED/RETURNED/EXCHANGED) → 종결 메시지
 */
function ActionFooter({
  status,
  onTransition,
  pending,
}: {
  status: OrderStatus;
  onTransition: (
    action:
      | "prepare"
      | "ship"
      | "complete"
      | "cancel"
      | ReturnAction,
  ) => void;
  pending: boolean;
}) {
  type Btn = {
    action: "prepare" | "ship" | "complete" | "cancel" | ReturnAction;
    label: string;
    icon: React.ReactNode;
    /** 시각 — primary(채워짐) / outline / ghost(빨강) / ghost(회색) */
    tone: "primary" | "outline" | "danger-ghost" | "ghost";
  };
  const buttons: Btn[] = [];

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
        label: "준비 시작",
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
      buttons.push({
        action: "ship",
        label: "발송",
        icon: <Truck className="size-4" />,
        tone: "primary",
      });
      break;
    case "SHIPPED":
      buttons.push({
        action: "complete",
        label: "완료",
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
        label: "반품 요청",
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
      buttons.push({
        action: "exchange",
        label: "교환 처리",
        icon: <ArrowLeftRight className="size-4" />,
        tone: "outline",
      });
      buttons.push({
        action: "return",
        label: "환불 처리",
        icon: <RotateCcw className="size-4" />,
        tone: "primary",
      });
      break;
  }

  if (buttons.length === 0) {
    return (
      <div className="border-t border-[var(--jm-border)] bg-[var(--jm-surface)] px-5 py-4 text-center text-[12px] text-[var(--jm-text-muted)]">
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
  const Icon = type === "DELIVERY" ? Truck : type === "SHIPPING" ? Package : User;
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
      <JmSectionLabel className="flex items-center gap-1 text-[10px]">
        {icon && (
          <span className="text-[var(--jm-text-subtle)]">{icon}</span>
        )}
        {label}
      </JmSectionLabel>
      <span className="text-[13px] text-[var(--jm-text)]">{children}</span>
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
            ? "text-[16px] font-bold text-[var(--jm-text)]"
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
 * 교환 발송 안내 카드 — 이 주문이 다른 주문의 교환으로 생성된 경우 노출.
 * - 원본 주문 link
 * - 차액 자동 계산 (claimType=EXCHANGE_DIFFERENT 일 때 의미 있음)
 * - claimReason 기반 운임 책임 안내
 * - 매출 중복 방지 안내 (마진 리포트에서 제외됨)
 */
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
      <JmCardContent className="space-y-3 text-[13px]">
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
          className={`rounded-lg border p-2.5 text-[12px] ${
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
          <div className="flex items-start gap-2 text-[11px] text-[var(--jm-text-muted)]">
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
          <p className="text-[11px] text-[var(--jm-text-muted)]">
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
