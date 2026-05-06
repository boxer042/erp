"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  CalendarClock,
  CheckCircle2,
  MapPin,
  Package,
  Pencil,
  Phone,
  Printer,
  StickyNote,
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

import {
  FULFILLMENT_LABELS,
  STATUS_LABELS,
  type FulfillmentType,
  type OrderStatus,
} from "./_types";
import { formatCurrency } from "./_helpers";
import { statusBadgeVariant } from "./_parts";

const FULFILLMENT_OPTIONS: { value: FulfillmentType; label: string }[] = [
  { value: "PICKUP", label: "매장 수령" },
  { value: "DELIVERY", label: "배달" },
  { value: "SHIPPING", label: "택배" },
];

function isEditable(status: OrderStatus) {
  return status === "PENDING" || status === "PREPARING" || status === "SHIPPED";
}

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
  channel: { name: string; code: string; commissionRate: string } | null;
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
  const [shipDialogOpen, setShipDialogOpen] = useState(false);
  const [trackingCarrier, setTrackingCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");

  useEffect(() => {
    setEditing(false);
    setEditForm(null);
    setShipDialogOpen(false);
    setTrackingCarrier("");
    setTrackingNumber("");
  }, [orderId, open]);

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

  const transitionMutation = useMutation({
    mutationFn: (action: "prepare" | "complete" | "cancel" | "return") =>
      apiMutate(`/api/orders/${orderId}`, "PUT", { action }),
    onSuccess: (_data, action) => {
      const labels: Record<string, string> = {
        prepare: "준비 시작 — 재고가 차감되었습니다",
        complete: "주문이 완료되었습니다",
        cancel: "주문이 취소되었습니다",
        return: "반품 처리되었습니다",
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
  const handleDelete = () => {
    if (!confirm("이 주문을 삭제하시겠습니까? 되돌릴 수 없습니다.")) return;
    deleteMutation.mutate();
  };

  const handleTransition = (
    action: "prepare" | "ship" | "complete" | "cancel" | "return",
  ) => {
    if (action === "ship") {
      setTrackingCarrier(detailQuery.data?.trackingCarrier ?? "");
      setTrackingNumber(detailQuery.data?.trackingNumber ?? "");
      setShipDialogOpen(true);
      return;
    }
    if (action === "cancel" && !confirm("주문을 취소하시겠습니까?")) return;
    if (action === "return" && !confirm("반품 처리하시겠습니까?")) return;
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
                <JmBadge
                  variant={statusBadgeVariant(data.status)}
                  size="sm"
                  shape="square"
                >
                  {STATUS_LABELS[data.status]}
                </JmBadge>
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
                  {editable && !editing && (
                    <JmButton variant="ghost" size="xs" onClick={startEdit}>
                      <Pencil className="size-3.5" />
                      수정
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
            {order.paymentMethod && (
              <p className="pt-1 text-[11px] text-[var(--jm-text-muted)]">
                결제수단 · {paymentLabel(order.paymentMethod)}
              </p>
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
        주문 번호 {order.orderNo} · 항목·금액 편집은 미지원 (재고 정합성 보호)
      </p>
    </>
  );
}

/* ------------------------------ FOOTER ------------------------------ */

function ActionFooter({
  status,
  onTransition,
  pending,
}: {
  status: OrderStatus;
  onTransition: (
    action: "prepare" | "ship" | "complete" | "cancel" | "return",
  ) => void;
  pending: boolean;
}) {
  let primary: { action: "prepare" | "ship" | "complete"; label: string; icon: React.ReactNode } | null = null;
  let cancellable = false;
  let returnable = false;

  switch (status) {
    case "PENDING":
      primary = {
        action: "prepare",
        label: "준비 시작",
        icon: <Package className="size-4" />,
      };
      cancellable = true;
      break;
    case "PREPARING":
      primary = {
        action: "ship",
        label: "발송",
        icon: <Truck className="size-4" />,
      };
      cancellable = true;
      break;
    case "SHIPPED":
      primary = {
        action: "complete",
        label: "완료",
        icon: <CheckCircle2 className="size-4" />,
      };
      break;
    case "COMPLETED":
      returnable = true;
      break;
  }

  if (!primary && !cancellable && !returnable) {
    return (
      <div className="border-t border-[var(--jm-border)] bg-[var(--jm-surface)] px-5 py-4 text-center text-[12px] text-[var(--jm-text-muted)]">
        종결된 주문입니다
      </div>
    );
  }

  return (
    <JmDrawerFooter>
      {cancellable && (
        <JmButton
          variant="ghost"
          onClick={() => onTransition("cancel")}
          disabled={pending}
          className="text-[var(--jm-danger-fg)] hover:bg-[var(--jm-danger-bg)]"
        >
          <XCircle className="size-4" />
          취소
        </JmButton>
      )}
      {returnable && (
        <JmButton
          variant="outline"
          onClick={() => onTransition("return")}
          disabled={pending}
        >
          <RotateCcw className="size-4" />
          반품
        </JmButton>
      )}
      {primary && (
        <JmButton
          onClick={() => onTransition(primary!.action)}
          disabled={pending}
        >
          {pending ? (
            <JmSpinner size="sm" tone="inverted" />
          ) : (
            primary.icon
          )}
          {primary.label}
        </JmButton>
      )}
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
