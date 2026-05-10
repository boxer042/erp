"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatComma, parseComma } from "@/lib/utils";
import {
  JmButton,
  JmCombobox,
  JmDrawer,
  JmDrawerBody,
  JmDrawerContent,
  JmDrawerFooter,
  JmDrawerHeader,
  JmDrawerTitle,
  JmFormField,
  JmIconButton,
  JmInput,
  JmSelect,
  JmSpinner,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
  JmTextarea,
} from "@/jm";

import type { FulfillmentType } from "./_types";

interface Channel {
  id: string;
  name: string;
  code: string;
  commissionRate: string;
}

interface CustomerOption {
  id: string;
  name: string;
  phone: string | null;
  type: "INDIVIDUAL" | "BUSINESS";
  businessNumber: string | null;
  shippingAddress: string | null;
  address: string | null;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
  isCanonical?: boolean;
  unitOfMeasure: string;
}

interface OrderItemForm {
  productId: string;
  productName: string;
  sku: string;
  quantity: string;
  unitPrice: string;
  /** 선택된 옵션값 ID 들 — API 에 그대로 전달 → OPTION_REF 자동 생성 */
  optionValueIds: string[];
}

const FULFILLMENT_OPTIONS: { value: FulfillmentType; label: string }[] = [
  { value: "PICKUP", label: "매장 수령" },
  { value: "DELIVERY", label: "배달" },
  { value: "SHIPPING", label: "택배" },
];

type PaymentMethod = "CASH" | "CARD" | "TRANSFER" | "MIXED" | "UNPAID";
const PAYMENT_OPTIONS = [
  { value: "" as const, label: "미정" },
  { value: "CARD" as const, label: "카드" },
  { value: "CASH" as const, label: "현금" },
  { value: "TRANSFER" as const, label: "계좌이체" },
  { value: "MIXED" as const, label: "복합" },
  { value: "UNPAID" as const, label: "외상" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

export function OrderCreateSheet({ open, onOpenChange, onCreated }: Props) {
  const queryClient = useQueryClient();

  const [channelId, setChannelId] = useState("");
  const [orderDate, setOrderDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [channelOrderNo, setChannelOrderNo] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [fulfillmentType, setFulfillmentType] =
    useState<FulfillmentType>("SHIPPING");
  const [expectedShipDate, setExpectedShipDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [shippingFee, setShippingFee] = useState("0");
  const [memo, setMemo] = useState("");
  const [items, setItems] = useState<OrderItemForm[]>([]);
  const [productPick, setProductPick] = useState("");

  const channelsQuery = useQuery({
    queryKey: ["channels"],
    queryFn: () => apiGet<Channel[]>("/api/channels"),
    enabled: open,
  });
  const customersQuery = useQuery({
    queryKey: ["customers"],
    queryFn: () => apiGet<CustomerOption[]>("/api/customers"),
    enabled: open,
  });
  const productsQuery = useQuery({
    queryKey: ["products", "for-order"],
    queryFn: () => apiGet<ProductOption[]>("/api/products?isBulk=all"),
    enabled: open,
  });

  // 채널 select 옵션
  const channelOptions = useMemo(
    () => [
      { value: "", label: "오프라인 / 직접" },
      ...(channelsQuery.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    ],
    [channelsQuery.data],
  );

  // 고객 combobox 아이템 — JmComboboxItem 형태 (id, label, description)
  const customerItems = useMemo(
    () =>
      (customersQuery.data ?? []).map((c) => ({
        id: c.id,
        label: c.name,
        description: c.businessNumber ?? c.phone ?? undefined,
        type: c.type,
        phone: c.phone,
        shippingAddress: c.shippingAddress,
        address: c.address,
      })),
    [customersQuery.data],
  );

  // 상품 combobox — canonical 제외 (변형 미확정 prepare 차단 회피)
  const productItems = useMemo(
    () =>
      (productsQuery.data ?? [])
        .filter((p) => !p.isCanonical)
        .map((p) => ({
          id: p.id,
          label: p.name,
          description: p.sku,
          sku: p.sku,
          sellingPrice: p.sellingPrice,
        })),
    [productsQuery.data],
  );

  // 초기화
  useEffect(() => {
    if (!open) return;
    setChannelId("");
    setOrderDate(new Date().toISOString().split("T")[0]);
    setChannelOrderNo("");
    setCustomerId("");
    setCustomerName("");
    setCustomerPhone("");
    setRecipientName("");
    setRecipientPhone("");
    setShippingAddress("");
    setFulfillmentType("SHIPPING");
    setExpectedShipDate("");
    setPaymentMethod("");
    setDiscountAmount("0");
    setShippingFee("0");
    setMemo("");
    setItems([]);
    setProductPick("");
  }, [open]);

  const addItem = (item: (typeof productItems)[number]) => {
    setItems((prev) => [
      ...prev,
      {
        productId: item.id,
        productName: item.label,
        sku: item.sku,
        quantity: "1",
        unitPrice: item.sellingPrice,
        optionValueIds: [],
      },
    ]);
    setProductPick("");
  };

  const updateItem = (idx: number, patch: Partial<OrderItemForm>) =>
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    );
  const removeItem = (idx: number) =>
    setItems((prev) => prev.filter((_, i) => i !== idx));

  const subtotal = items.reduce(
    (sum, it) =>
      sum + parseFloat(it.quantity || "0") * parseFloat(it.unitPrice || "0"),
    0,
  );
  const taxableBase = subtotal - parseFloat(discountAmount || "0");
  const taxAmount = Math.round(Math.max(0, taxableBase) * 0.1);
  const totalAmount = taxableBase + parseFloat(shippingFee || "0") + taxAmount;

  const createMutation = useMutation({
    mutationFn: () => {
      if (items.length === 0) {
        throw new Error("주문 항목을 1개 이상 추가해주세요");
      }
      if (fulfillmentType !== "PICKUP" && !shippingAddress.trim()) {
        throw new Error("배송지를 입력해주세요");
      }
      if (paymentMethod === "UNPAID" && !customerId) {
        throw new Error("외상 결제는 등록 고객 선택이 필요합니다");
      }
      return apiMutate("/api/orders", "POST", {
        channelId: channelId || null,
        channelOrderNo: channelOrderNo || undefined,
        customerId: customerId || undefined,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        recipientName: recipientName || undefined,
        recipientPhone: recipientPhone || undefined,
        shippingAddress: shippingAddress || undefined,
        orderDate,
        fulfillmentType,
        expectedShipDate: expectedShipDate || undefined,
        paymentMethod: paymentMethod || undefined,
        discountAmount: discountAmount || "0",
        shippingFee: shippingFee || "0",
        memo: memo || undefined,
        items: items.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          optionValueIds: it.optionValueIds,
        })),
      });
    },
    onSuccess: () => {
      toast.success("주문이 등록되었습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      onCreated?.();
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "등록 실패",
      ),
  });

  const handleCustomerSelect = (item: (typeof customerItems)[number]) => {
    setCustomerId(item.id);
    setCustomerName(item.label);
    setCustomerPhone(item.phone ?? "");
    if (item.shippingAddress) setShippingAddress(item.shippingAddress ?? "");
    else if (item.address) setShippingAddress(item.address ?? "");
  };

  return (
    <JmDrawer open={open} onOpenChange={onOpenChange}>
      <JmDrawerContent side="bottom" size="xl" dragHandle>
        <JmDrawerHeader>
          <JmDrawerTitle>신규 주문 등록</JmDrawerTitle>
        </JmDrawerHeader>

        <JmDrawerBody className="space-y-6">
          {/* 기본 정보 */}
          <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <JmFormField label="채널">
              <JmSelect
                options={channelOptions}
                value={channelId}
                onChange={setChannelId}
                placeholder="오프라인 / 직접"
              />
            </JmFormField>
            <JmFormField label="주문일">
              <JmInput
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
              />
            </JmFormField>
            <JmFormField label="채널 주문번호" hint="외부 채널 주문번호 (선택)">
              <JmInput
                value={channelOrderNo}
                onChange={(e) => setChannelOrderNo(e.target.value)}
                placeholder="—"
              />
            </JmFormField>
          </section>

          {/* 등록 고객 */}
          <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <JmFormField label="등록 고객" hint="선택 — 미등록 가능">
              <JmCombobox
                items={customerItems}
                value={customerId}
                onChange={handleCustomerSelect}
                clearable
                onClear={() => {
                  setCustomerId("");
                  setCustomerName("");
                  setCustomerPhone("");
                }}
                placeholder="고객 검색 / 미등록"
                searchPlaceholder="이름·전화·사업자번호"
                emptyMessage="검색 결과 없음 — 고객 페이지에서 등록 후 다시 시도"
              />
            </JmFormField>
            <JmFormField label="고객명 (스냅샷)">
              <JmInput
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="등록 고객명"
              />
            </JmFormField>
            <JmFormField label="고객 연락처">
              <JmInput
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="010-0000-0000"
              />
            </JmFormField>
          </section>

          {/* 출고 방식 */}
          <section className="space-y-3">
            <JmFormField
              label="출고 방식"
              hint={
                fulfillmentType === "PICKUP"
                  ? "매장 인도건은 POS 결제로 등록하면 즉시 종결되어 워크보드를 거치지 않습니다."
                  : undefined
              }
            >
              <div className="grid grid-cols-3 gap-2">
                {FULFILLMENT_OPTIONS.map((opt) => {
                  const active = fulfillmentType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFulfillmentType(opt.value)}
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

            {fulfillmentType !== "PICKUP" && (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <JmFormField label="받는 사람">
                    <JmInput
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder="이름 (미입력 시 등록 고객명)"
                    />
                  </JmFormField>
                  <JmFormField label="받는 사람 연락처">
                    <JmInput
                      value={recipientPhone}
                      onChange={(e) => setRecipientPhone(e.target.value)}
                      placeholder="010-0000-0000"
                    />
                  </JmFormField>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <JmFormField label="배송지" className="md:col-span-2">
                    <JmInput
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                      placeholder="주소"
                    />
                  </JmFormField>
                  <JmFormField label="출고 예정일">
                    <JmInput
                      type="date"
                      value={expectedShipDate}
                      onChange={(e) => setExpectedShipDate(e.target.value)}
                    />
                  </JmFormField>
                </div>
              </>
            )}
          </section>

          {/* 항목 */}
          <section className="space-y-2">
            <JmFormField
              label={`상품 ${items.length > 0 ? `· ${items.length}건` : ""}`}
              hint="대표(canonical) 상품은 변형 미확정으로 prepare 시 차단되므로 목록에서 제외됩니다."
            >
              <JmCombobox
                items={productItems}
                value={productPick}
                onChange={addItem}
                placeholder="상품 검색·선택"
                searchPlaceholder="상품명·SKU"
                emptyMessage="검색 결과 없음"
              />
            </JmFormField>

            {items.length > 0 && (
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
                    {items.map((it, idx) => {
                      const lineTotal =
                        parseFloat(it.quantity || "0") *
                        parseFloat(it.unitPrice || "0");
                      return (
                        <Fragment key={idx}>
                          <JmTableRow className="hover:bg-transparent">
                            <JmTableCell>
                              <div className="flex flex-col">
                                <span className="text-[13px] text-[var(--jm-text)]">
                                  {it.productName}
                                </span>
                                <span className="font-mono text-[11px] text-[var(--jm-text-muted)]">
                                  {it.sku}
                                </span>
                              </div>
                            </JmTableCell>
                            <JmTableCell>
                              <JmInput
                                size="sm"
                                type="text"
                                inputMode="decimal"
                                value={it.quantity}
                                onChange={(e) =>
                                  updateItem(idx, { quantity: e.target.value })
                                }
                                onFocus={(e) => e.currentTarget.select()}
                              />
                            </JmTableCell>
                            <JmTableCell>
                              <JmInput
                                size="sm"
                                type="text"
                                inputMode="numeric"
                                value={formatComma(it.unitPrice)}
                                onChange={(e) =>
                                  updateItem(idx, {
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
                                aria-label="삭제"
                                onClick={() => removeItem(idx)}
                              >
                                <Trash2 className="size-3.5" />
                              </JmIconButton>
                            </JmTableCell>
                          </JmTableRow>
                          {/* 옵션 선택 — 옵션 등록된 상품에만 노출. 5개 컬럼 colspan */}
                          <OrderItemOptionsRow
                            productId={it.productId}
                            selectedIds={it.optionValueIds}
                            onChange={(ids) =>
                              updateItem(idx, { optionValueIds: ids })
                            }
                          />
                        </Fragment>
                      );
                    })}
                  </JmTableBody>
                </JmTable>
              </div>
            )}
          </section>

          {/* 결제 + 금액 + 메모 */}
          <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-3">
              <JmFormField
                label="결제수단"
                hint={
                  paymentMethod === "UNPAID"
                    ? "외상은 등록 고객 선택 + 미수금 자동 등록됨"
                    : undefined
                }
              >
                <JmSelect<PaymentMethod | "">
                  options={PAYMENT_OPTIONS}
                  value={paymentMethod}
                  onChange={setPaymentMethod}
                  placeholder="미정"
                />
              </JmFormField>
              <JmFormField label="할인">
                <JmInput
                  type="text"
                  inputMode="numeric"
                  value={formatComma(discountAmount)}
                  onChange={(e) =>
                    setDiscountAmount(parseComma(e.target.value))
                  }
                  onFocus={(e) => e.currentTarget.select()}
                />
              </JmFormField>
              <JmFormField label="배송비">
                <JmInput
                  type="text"
                  inputMode="numeric"
                  value={formatComma(shippingFee)}
                  onChange={(e) => setShippingFee(parseComma(e.target.value))}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </JmFormField>
              <JmFormField label="메모">
                <JmTextarea
                  rows={3}
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                />
              </JmFormField>
            </div>

            <div className="flex flex-col gap-2 rounded-2xl bg-[var(--jm-surface-muted)] p-5">
              <SumRow
                label="공급가액"
                value={subtotal - parseFloat(discountAmount || "0")}
              />
              <SumRow
                label="할인"
                value={-parseFloat(discountAmount || "0")}
                muted
              />
              <SumRow
                label="배송비"
                value={parseFloat(shippingFee || "0")}
                muted
              />
              <SumRow label="부가세 (10%)" value={taxAmount} muted />
              <div className="my-1 h-px bg-[var(--jm-border)]" />
              <SumRow label="합계" value={totalAmount} bold />
            </div>
          </section>
        </JmDrawerBody>

        <JmDrawerFooter>
          <JmButton
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
          >
            취소
          </JmButton>
          <JmButton
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending && (
              <JmSpinner size="sm" tone="inverted" />
            )}
            {createMutation.isPending ? "등록 중..." : "등록"}
          </JmButton>
        </JmDrawerFooter>
      </JmDrawerContent>
    </JmDrawer>
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
    <div className="flex items-baseline justify-between text-[13px]">
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
            ? "text-[18px] font-bold text-[var(--jm-text)]"
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
 * 옵션 선택 행 — 상품에 등록된 ProductOption 들을 슬롯별 dropdown 으로 노출.
 * 옵션 없는 상품은 null 반환 (행 생략).
 *
 * 매핑별 표시:
 *  - 단순 텍스트: "화이트"
 *  - mappedProduct: "교체용 필터 추가 → 테스트 가습기 필터"
 *  - mappedVariant: "수냉 쿨러 → 수냉쿨러-i7" (variant Product 이름)
 */
function OrderItemOptionsRow({
  productId,
  selectedIds,
  onChange,
}: {
  productId: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  type OptionValue = {
    id: string;
    label: string;
    addPrice: string;
    mappedProduct: { id: string; name: string; sku: string } | null;
    mappedVariant: { id: string; name: string; sku: string } | null;
  };
  type Option = {
    id: string;
    name: string;
    required: boolean;
    values: OptionValue[];
  };
  const optionsQuery = useQuery({
    queryKey: ["product-options", productId],
    queryFn: () => apiGet<Option[]>(`/api/products/${productId}/options`),
    enabled: !!productId,
  });
  const options = optionsQuery.data ?? [];
  if (options.length === 0) return null;

  return (
    <JmTableRow className="hover:bg-transparent">
      <JmTableCell colSpan={5} className="bg-[var(--jm-surface-muted)] py-2">
        <div className="flex flex-col gap-1.5">
          {options.map((opt) => {
            // 이 옵션 슬롯 에서 선택된 값 (single-select 정책)
            const selectedForOpt =
              selectedIds.find((id) =>
                opt.values.some((v) => v.id === id),
              ) ?? "";
            return (
              <div
                key={opt.id}
                className="flex items-center gap-2 text-[12px]"
              >
                <span className="w-[80px] text-[var(--jm-text-muted)]">
                  {opt.name}
                  {opt.required && (
                    <span className="text-[var(--jm-danger-fg)]"> *</span>
                  )}
                </span>
                <select
                  value={selectedForOpt}
                  onChange={(e) => {
                    const newId = e.target.value;
                    // 같은 옵션 슬롯의 기존 선택 제거 후 새 값 추가
                    const otherIds = selectedIds.filter(
                      (id) => !opt.values.some((v) => v.id === id),
                    );
                    onChange(newId ? [...otherIds, newId] : otherIds);
                  }}
                  className="h-7 rounded border border-[var(--jm-border)] bg-[var(--jm-surface)] px-2 text-[12px]"
                >
                  <option value="">— 선택 안 함 —</option>
                  {opt.values.map((v) => {
                    const addPrice = Number(v.addPrice);
                    const suffix = v.mappedProduct
                      ? ` → ${v.mappedProduct.name}`
                      : v.mappedVariant
                        ? ` → ${v.mappedVariant.name}`
                        : "";
                    const priceLabel =
                      addPrice > 0
                        ? ` (+₩${addPrice.toLocaleString("ko-KR")})`
                        : "";
                    return (
                      <option key={v.id} value={v.id}>
                        {v.label}
                        {priceLabel}
                        {suffix}
                      </option>
                    );
                  })}
                </select>
              </div>
            );
          })}
        </div>
      </JmTableCell>
    </JmTableRow>
  );
}
