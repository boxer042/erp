"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Trash2 } from "lucide-react";

import { PriceInputDialog } from "@/app/(pos)/pos/_components/price-input-dialog";
import { toast } from "sonner";

import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatPhone } from "@/lib/utils";
import { focusCaretEnd } from "@/jm/lib/focus";
import {
  JmButton,
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
  JmSelect,
  JmSpinner,
  JmSwitch,
  JmTextarea,
} from "@/jm";

import type { FulfillmentType } from "./_types";

/** YYYY-MM-DD ↔ Date 변환 — 타임존 시프트 회피용 로컬 일자 */
const parseYmd = (s: string): Date | undefined => {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
};
const formatYmd = (d?: Date): string => {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

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
  imageUrl?: string | null;
  isCanonical?: boolean;
  canonicalProductId?: string | null;
  unitOfMeasure: string;
}

interface ServiceFeePreset {
  id: string;
  name: string;
  unitPrice: string;
}

interface OrderItemForm {
  /** "product" — 상품 라인 / "service" — 기술료·공임 등 자유 라인 (productName 이 항목명) */
  kind: "product" | "service";
  productId: string;
  productName: string;
  sku: string;
  imageUrl?: string | null;
  quantity: string;
  unitPrice: string;
  /** 선택된 옵션값 ID 들 — API 에 그대로 전달 → OPTION_REF 자동 생성 */
  optionValueIds: string[];
}

const FULFILLMENT_OPTIONS: { value: FulfillmentType; label: string }[] = [
  { value: "IN_STORE", label: "매장판매" },
  { value: "PICKUP", label: "픽업 대기" },
  { value: "DELIVERY", label: "배달" },
  { value: "QUICK", label: "퀵" },
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
  const [taxInvoiceRequested, setTaxInvoiceRequested] = useState(false);
  const [discountAmount, setDiscountAmount] = useState("0");
  const [shippingFee, setShippingFee] = useState("0");
  const [shippingCostBorne, setShippingCostBorne] = useState("0");
  const [shippingPaymentType, setShippingPaymentType] = useState<
    "PREPAID" | "COD" | "STORE_BURDEN"
  >("PREPAID");
  // 착불(COD) 로 전환 시 매장 부담 금액 자동 리셋 — 착불은 매장 회계 무관
  useEffect(() => {
    if (shippingPaymentType === "COD") setShippingCostBorne("0");
  }, [shippingPaymentType]);
  const [memo, setMemo] = useState("");
  const [items, setItems] = useState<OrderItemForm[]>([]);
  const [productPick, setProductPick] = useState("");
  const [servicePick, setServicePick] = useState("");
  const [priceLineIdx, setPriceLineIdx] = useState<number | null>(null);
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [shippingDialogOpen, setShippingDialogOpen] = useState(false);
  const [shipCostDialogOpen, setShipCostDialogOpen] = useState(false);
  // 대표(canonical) 상품 선택 시 열리는 변형 픽업 다이얼로그. null = 닫힘.
  const [variantPickFor, setVariantPickFor] = useState<{
    canonicalId: string;
    canonicalName: string;
  } | null>(null);

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
  const serviceFeePresetsQuery = useQuery({
    queryKey: queryKeys.serviceFeePresets.all,
    queryFn: () => apiGet<ServiceFeePreset[]>("/api/service-fee-presets"),
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
        description:
          c.businessNumber ?? (c.phone ? formatPhone(c.phone) : undefined),
        type: c.type,
        phone: c.phone,
        shippingAddress: c.shippingAddress,
        address: c.address,
      })),
    [customersQuery.data],
  );

  // 상품 combobox — 대표(canonical) + 단품만 노출. 변형(canonicalProductId 보유)은 대표 선택 시
  // 열리는 variant 다이얼로그에서만 보이게 해서 같은 이름·다른 SKU 가 평탄하게 깔리는 혼란 제거.
  const productItems = useMemo(
    () =>
      (productsQuery.data ?? [])
        .filter((p) => !p.canonicalProductId)
        .map((p) => ({
          id: p.id,
          label: p.isCanonical ? `${p.name} · 대표(변형 선택)` : p.name,
          description: p.sku,
          sku: p.sku,
          sellingPrice: p.sellingPrice,
          imageUrl: p.imageUrl ?? null,
          isCanonical: !!p.isCanonical,
        })),
    [productsQuery.data],
  );

  // 기술료 프리셋 combobox
  const serviceFeeItems = useMemo(
    () =>
      (serviceFeePresetsQuery.data ?? []).map((p) => ({
        id: p.id,
        label: p.name,
        description: `₩${Number(p.unitPrice).toLocaleString("ko-KR")}`,
        unitPrice: p.unitPrice,
      })),
    [serviceFeePresetsQuery.data],
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
    setTaxInvoiceRequested(false);
    setDiscountAmount("0");
    setShippingFee("0");
    setShippingCostBorne("0");
    setMemo("");
    setItems([]);
    setProductPick("");
    setServicePick("");
    setPriceLineIdx(null);
    setDiscountDialogOpen(false);
    setShippingDialogOpen(false);
    setShipCostDialogOpen(false);
    setVariantPickFor(null);
  }, [open]);

  const addItem = (item: (typeof productItems)[number]) => {
    // 대표(canonical) — 변형 선택 다이얼로그로 분기. 라인은 변형 확정 후에만 추가.
    if (item.isCanonical) {
      setVariantPickFor({
        canonicalId: item.id,
        canonicalName: item.label.replace(/ · 대표\(변형 선택\)$/, ""),
      });
      setProductPick("");
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        kind: "product",
        productId: item.id,
        productName: item.label,
        sku: item.sku,
        imageUrl: item.imageUrl ?? null,
        quantity: "1",
        unitPrice: item.sellingPrice,
        optionValueIds: [],
      },
    ]);
    setProductPick("");
  };

  const handleVariantPicked = (variant: PickedVariant) => {
    setItems((prev) => [
      ...prev,
      {
        kind: "product",
        productId: variant.id,
        productName: variant.name,
        sku: variant.sku,
        imageUrl: variant.imageUrl ?? null,
        quantity: "1",
        unitPrice: variant.sellingPrice,
        optionValueIds: [],
      },
    ]);
    setVariantPickFor(null);
  };

  // 기술료 라인 추가 — 프리셋 선택 또는 빈 라인 직접 추가
  const addServiceItem = (preset?: (typeof serviceFeeItems)[number]) => {
    setItems((prev) => [
      ...prev,
      {
        kind: "service",
        productId: "",
        productName: preset?.label ?? "",
        sku: "",
        quantity: "1",
        unitPrice: preset ? String(preset.unitPrice) : "0",
        optionValueIds: [],
      },
    ]);
    setServicePick("");
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
  // 백엔드 의미 — discountAmount=net, shippingFee=gross, shippingCostBorne=net
  const discountNet = parseFloat(discountAmount || "0");
  const shippingFeeGross = parseFloat(shippingFee || "0");
  const shippingCostBorneNet = parseFloat(shippingCostBorne || "0");
  const taxableBase = subtotal - discountNet;
  const taxAmount = Math.round(Math.max(0, taxableBase) * 0.1);
  const totalAmount = taxableBase + shippingFeeGross + taxAmount;
  // 표시용 (VAT 포함 일관)
  const discountGross = Math.round(discountNet * 1.1);
  const shippingCostBorneGross = Math.round(shippingCostBorneNet * 1.1);

  const isDelivery =
    fulfillmentType !== "IN_STORE" && fulfillmentType !== "PICKUP";

  const createMutation = useMutation({
    mutationFn: () => {
      if (items.length === 0) {
        throw new Error("주문 항목을 1개 이상 추가해주세요");
      }
      if (items.some((it) => it.kind === "service" && !it.productName.trim())) {
        throw new Error("기술료 항목명을 입력해주세요");
      }
      // 매장 인도(IN_STORE/PICKUP) 가 아닐 때만 배송지 필수
      if (isDelivery && !shippingAddress.trim()) {
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
        taxInvoiceRequested,
        discountAmount: discountAmount || "0",
        shippingFee: shippingFee || "0",
        shippingPaymentType,
        shippingCostBorne: shippingCostBorne || "0",
        memo: memo || undefined,
        items: items.map((it) =>
          it.kind === "service"
            ? {
                serviceName: it.productName,
                quantity: it.quantity,
                unitPrice: it.unitPrice,
              }
            : {
                productId: it.productId,
                quantity: it.quantity,
                unitPrice: it.unitPrice,
                optionValueIds: it.optionValueIds,
              },
        ),
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
    const phone = item.phone ? formatPhone(item.phone) : "";
    setCustomerPhone(phone);
    // 배달·택배(DELIVERY/SHIPPING) — 받는 사람도 기본은 고객 본인으로 자동 채움 (수정 가능)
    if (fulfillmentType !== "IN_STORE" && fulfillmentType !== "PICKUP") {
      setRecipientName(item.label);
      setRecipientPhone(phone);
    }
    if (item.shippingAddress) setShippingAddress(item.shippingAddress ?? "");
    else if (item.address) setShippingAddress(item.address ?? "");
  };

  return (
    <JmDrawer open={open} onOpenChange={onOpenChange}>
      <JmDrawerContent side="bottom" size="xl" dragHandle>
        <JmDrawerHeader>
          <JmDrawerTitle>신규 주문 등록</JmDrawerTitle>
        </JmDrawerHeader>

        <JmDrawerBody>
          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            {/* ── 좌측: 품목 영역 ── */}
            <div className="space-y-4">
              {/* 상품 검색 */}
              <JmFormField
                label={`상품 ${items.length > 0 ? `· ${items.length}건` : ""}`}
                hint="대표(canonical) 선택 시 변형 선택 창이 자동으로 열립니다. 변형은 대표 안에서만 보입니다."
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

              {/* 기술료 */}
              <JmFormField
                label="기술료 / 공임"
                hint="상품 장착·설치 등 추가 청구 — 프리셋 선택 또는 직접 추가 (항상 과세)"
              >
                <div className="flex gap-2">
                  <div className="flex-1">
                    <JmCombobox
                      items={serviceFeeItems}
                      value={servicePick}
                      onChange={(item) => addServiceItem(item)}
                      placeholder="기술료 프리셋 선택"
                      searchPlaceholder="기술료명"
                      emptyMessage="등록된 프리셋 없음 — 설정에서 추가"
                    />
                  </div>
                  <JmButton variant="outline" onClick={() => addServiceItem()}>
                    직접 추가
                  </JmButton>
                </div>
              </JmFormField>

              {/* 품목 카드 리스트 */}
              {items.length === 0 ? (
                <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] text-center">
                  <span className="text-2xl text-[var(--jm-text-disabled)]">
                    🛒
                  </span>
                  <p className="text-jm-sm text-[var(--jm-text-muted)]">
                    위에서 상품을 검색해 담아주세요
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {items.map((it, idx) => {
                    const unitNet = parseFloat(it.unitPrice || "0");
                    const unitGross = Math.round(unitNet * 1.1);
                    const qty = parseFloat(it.quantity || "0");
                    const lineNet = unitNet * qty;
                    const lineGross = Math.round(lineNet * 1.1);
                    return (
                      <Fragment key={idx}>
                        <div className="rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-3">
                          {/* 1행: 이미지 + 상품명/SKU + 삭제 */}
                          <div className="mb-2.5 flex items-start gap-3">
                            {it.kind === "product" ? (
                              it.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={it.imageUrl}
                                  alt={it.productName}
                                  className="size-12 shrink-0 rounded-xl bg-[var(--jm-surface-muted)] object-cover"
                                />
                              ) : (
                                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[var(--jm-surface-muted)] text-[var(--jm-text-subtle)]">
                                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                    <path
                                      d="M3 6l7-4 7 4v8l-7 4-7-4V6z"
                                      stroke="currentColor"
                                      strokeWidth="1.3"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                </div>
                              )
                            ) : (
                              /* 기술료: 이미지 자리에 배지 + 인라인 항목명 입력 */
                              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                <span className="inline-flex shrink-0 items-center rounded-full bg-[var(--jm-surface-muted)] px-2 py-0.5 text-jm-2xs font-semibold text-[var(--jm-text-muted)]">
                                  기술료
                                </span>
                                <JmInput
                                  size="sm"
                                  value={it.productName}
                                  onChange={(e) =>
                                    updateItem(idx, { productName: e.target.value })
                                  }
                                  placeholder="기술료 항목명"
                                />
                              </div>
                            )}

                            {it.kind === "product" && (
                              <div className="flex min-w-0 flex-1 flex-col">
                                <span className="line-clamp-1 text-[14px] font-semibold text-[var(--jm-text)]">
                                  {it.productName}
                                </span>
                                {it.sku && (
                                  <span className="font-mono text-[11px] text-[var(--jm-text-subtle)]">
                                    {it.sku}
                                  </span>
                                )}
                              </div>
                            )}

                            <JmIconButton
                              variant="ghost"
                              size="sm"
                              aria-label="삭제"
                              onClick={() => removeItem(idx)}
                              className="shrink-0 text-[var(--jm-text-disabled)] hover:text-[var(--jm-danger-fg)]"
                            >
                              <Trash2 className="size-3.5" />
                            </JmIconButton>
                          </div>

                          {/* 2행: 단가(클릭) + 수량 stepper + 라인 합계 */}
                          <div className="flex items-center justify-between gap-2">
                            {/* 단가 클릭 → PriceInputDialog */}
                            <button
                              type="button"
                              onClick={() => setPriceLineIdx(idx)}
                              className="flex flex-col items-start rounded-lg px-2 py-1 text-left hover:bg-[var(--jm-bg)] active:bg-[var(--jm-surface-muted)]"
                            >
                              <span className="text-[10px] uppercase tracking-wider text-[var(--jm-text-subtle)]">
                                단가 (VAT 포함)
                              </span>
                              <span className="text-[15px] font-semibold tabular-nums text-[var(--jm-text)]">
                                ₩{unitGross.toLocaleString("ko-KR")}
                              </span>
                            </button>

                            {/* 수량 stepper */}
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  updateItem(idx, {
                                    quantity: String(
                                      Math.max(1, Math.round(qty) - 1),
                                    ),
                                  })
                                }
                                disabled={qty <= 1}
                                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--jm-surface-muted)] text-[var(--jm-text)] hover:bg-[var(--jm-border)] disabled:opacity-30"
                              >
                                <Minus className="size-3.5" />
                              </button>
                              <JmInput
                                size="sm"
                                type="text"
                                inputMode="decimal"
                                value={it.quantity}
                                onChange={(e) =>
                                  updateItem(idx, { quantity: e.target.value })
                                }
                                onFocus={focusCaretEnd}
                                className="w-[48px] text-center"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateItem(idx, {
                                    quantity: String(Math.round(qty) + 1),
                                  })
                                }
                                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--jm-surface-muted)] text-[var(--jm-text)] hover:bg-[var(--jm-border)]"
                              >
                                <Plus className="size-3.5" />
                              </button>
                            </div>

                            {/* 라인 합계 */}
                            <div className="text-right">
                              <div className="text-[10px] uppercase tracking-wider text-[var(--jm-text-subtle)]">
                                합계
                              </div>
                              <div className="text-[15px] font-bold tabular-nums text-[var(--jm-text)]">
                                ₩{lineGross.toLocaleString("ko-KR")}
                              </div>
                            </div>
                          </div>

                          {/* 옵션 선택 — 옵션 등록된 상품에만 노출 */}
                          {it.kind === "product" && (
                            <OrderItemOptionsCard
                              productId={it.productId}
                              selectedIds={it.optionValueIds}
                              onChange={(ids) =>
                                updateItem(idx, { optionValueIds: ids })
                              }
                            />
                          )}
                        </div>
                      </Fragment>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── 우측: 요약·설정 패널 ── */}
            <div className="space-y-4 lg:sticky lg:top-0 lg:self-start">
              {/* 채널 / 주문일 / 채널주문번호 */}
              <div className="rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-4 space-y-3">
                <p className="text-jm-xs font-semibold text-[var(--jm-text-muted)] uppercase tracking-wider">
                  주문 정보
                </p>
                <JmFormField label="채널">
                  <JmSelect
                    options={channelOptions}
                    value={channelId}
                    onChange={setChannelId}
                    placeholder="오프라인 / 직접"
                  />
                </JmFormField>
                <JmFormField label="주문일">
                  <JmDatePicker
                    size="sm"
                    value={parseYmd(orderDate)}
                    onChange={(d) => setOrderDate(formatYmd(d))}
                  />
                </JmFormField>
                <JmFormField label="채널 주문번호" hint="외부 채널 주문번호 (선택)">
                  <JmInput
                    value={channelOrderNo}
                    onChange={(e) => setChannelOrderNo(e.target.value)}
                    placeholder="—"
                  />
                </JmFormField>
              </div>

              {/* 등록 고객 */}
              <div className="rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-4 space-y-3">
                <p className="text-jm-xs font-semibold text-[var(--jm-text-muted)] uppercase tracking-wider">
                  고객
                </p>
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
                <div className="grid grid-cols-2 gap-2">
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
                      onChange={(e) =>
                        setCustomerPhone(formatPhone(e.target.value))
                      }
                      placeholder="010-0000-0000"
                    />
                  </JmFormField>
                </div>
              </div>

              {/* 출고 방식 */}
              <div className="rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-4 space-y-3">
                <p className="text-jm-xs font-semibold text-[var(--jm-text-muted)] uppercase tracking-wider">
                  출고
                </p>
                <JmFormField
                  label="출고 방식"
                  hint={
                    fulfillmentType === "IN_STORE"
                      ? "매장판매는 POS 결제로 등록하면 즉시 종결되어 워크보드를 거치지 않습니다."
                      : fulfillmentType === "PICKUP"
                        ? "픽업 대기 — 결제 후 손님이 추후 방문 수령. 워크보드에 노출됩니다."
                        : fulfillmentType === "QUICK"
                          ? "퀵 — 외부 퀵 업체 호출. 퀵비는 매장 부담이라 배송 원가(매장 지불)에 기록하세요."
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

                {isDelivery && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <JmFormField label="받는 사람">
                        <JmInput
                          value={recipientName}
                          onChange={(e) => setRecipientName(e.target.value)}
                          placeholder="이름"
                        />
                      </JmFormField>
                      <JmFormField label="받는 사람 연락처">
                        <JmInput
                          value={recipientPhone}
                          onChange={(e) =>
                            setRecipientPhone(formatPhone(e.target.value))
                          }
                          placeholder="010-0000-0000"
                        />
                      </JmFormField>
                    </div>
                    <JmFormField label="배송지">
                      <JmInput
                        value={shippingAddress}
                        onChange={(e) => setShippingAddress(e.target.value)}
                        placeholder="주소"
                      />
                    </JmFormField>
                    <JmFormField label="출고 예정일">
                      <JmDatePicker
                        size="sm"
                        value={parseYmd(expectedShipDate)}
                        onChange={(d) => setExpectedShipDate(formatYmd(d))}
                      />
                    </JmFormField>
                  </>
                )}
              </div>

              {/* 결제 설정 */}
              <div className="rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-4 space-y-3">
                <p className="text-jm-xs font-semibold text-[var(--jm-text-muted)] uppercase tracking-wider">
                  결제
                </p>
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

                {/* 세금계산서 */}
                <div className="flex items-center justify-between rounded-xl border border-[var(--jm-border)] px-3 py-2.5">
                  <div className="flex flex-col">
                    <span className="text-jm-sm font-medium text-[var(--jm-text)]">
                      세금계산서 발행 요청
                    </span>
                    <span className="text-jm-xs text-[var(--jm-text-muted)]">
                      {customerId
                        ? "발행 대기 목록에 등록됩니다"
                        : "등록 고객 선택 권장 — 발행 시 사업자 정보 필요"}
                    </span>
                  </div>
                  <JmSwitch
                    checked={taxInvoiceRequested}
                    onCheckedChange={setTaxInvoiceRequested}
                  />
                </div>

                <JmFormField label="할인">
                  <button
                    type="button"
                    onClick={() => setDiscountDialogOpen(true)}
                    className="flex h-10 w-full items-center justify-between rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 text-jm-sm text-[var(--jm-text)] hover:border-[var(--jm-border-strong)]"
                  >
                    <span className="tabular-nums">
                      {parseFloat(discountAmount || "0") === 0
                        ? "—"
                        : `₩${Math.round(parseFloat(discountAmount || "0") * 1.1).toLocaleString("ko-KR")}`}
                    </span>
                    <span className="text-jm-2xs text-[var(--jm-text-muted)]">수정</span>
                  </button>
                </JmFormField>

                <JmFormField label="배송비 (손님 청구)">
                  <button
                    type="button"
                    onClick={() => setShippingDialogOpen(true)}
                    className="flex h-10 w-full items-center justify-between rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 text-jm-sm text-[var(--jm-text)] hover:border-[var(--jm-border-strong)]"
                  >
                    <span className="tabular-nums">
                      {parseFloat(shippingFee || "0") === 0
                        ? "—"
                        : `₩${parseFloat(shippingFee || "0").toLocaleString("ko-KR")}`}
                    </span>
                    <span className="text-jm-2xs text-[var(--jm-text-muted)]">수정</span>
                  </button>
                </JmFormField>

                {isDelivery && (
                  <>
                    <JmFormField label="배송비 결제">
                      <div className="flex gap-1.5">
                        {(
                          [
                            { value: "PREPAID" as const, label: "선불" },
                            { value: "COD" as const, label: "착불" },
                            { value: "STORE_BURDEN" as const, label: "무료" },
                          ] as const
                        ).map((opt) => {
                          const active = shippingPaymentType === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setShippingPaymentType(opt.value)}
                              className={`flex-1 rounded-md border px-2 py-1.5 text-jm-xs font-medium transition-colors ${
                                active
                                  ? "border-[var(--jm-action)] bg-[var(--jm-bg)] text-[var(--jm-text)]"
                                  : "border-[var(--jm-border)] bg-[var(--jm-surface)] text-[var(--jm-text-muted)] hover:border-[var(--jm-border-strong)]"
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </JmFormField>

                    {/* 배송 원가 (매장 지불) — 착불(COD) 제외, 매장 회계 무관 */}
                    {shippingPaymentType !== "COD" && (
                      <JmFormField
                        label="배송 원가 (매장 지불)"
                        hint="우리가 낸 퀵비·택배비 — 손님 청구와 독립 (복합 케이스 가능). 매장 부담분만 입력 → 마진 차감"
                      >
                        <button
                          type="button"
                          onClick={() => setShipCostDialogOpen(true)}
                          className="flex h-10 w-full items-center justify-between rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 text-jm-sm text-[var(--jm-text)] hover:border-[var(--jm-border-strong)]"
                        >
                          <span className="tabular-nums">
                            {parseFloat(shippingCostBorne || "0") === 0
                              ? "—"
                              : `₩${Math.round(parseFloat(shippingCostBorne || "0") * 1.1).toLocaleString("ko-KR")}`}
                          </span>
                          <span className="text-jm-2xs text-[var(--jm-text-muted)]">수정</span>
                        </button>
                      </JmFormField>
                    )}
                  </>
                )}
              </div>

              {/* 합계 카드 — POS 결제 시트 스타일 */}
              <div className="rounded-2xl bg-[var(--jm-surface-muted)] p-4">
                <p className="mb-3 text-jm-xs font-semibold text-[var(--jm-text-muted)] uppercase tracking-wider">
                  손님 청구
                </p>
                <div className="flex flex-col gap-1.5">
                  <SumRow label="품목 공급가액" value={subtotal} muted />
                  {discountNet > 0 && (
                    <SumRow
                      label="할인 (VAT 포함)"
                      value={-discountGross}
                      muted
                    />
                  )}
                  {shippingFeeGross > 0 && (
                    <SumRow
                      label="배송비 (VAT 포함)"
                      value={shippingFeeGross}
                      muted
                    />
                  )}
                  <SumRow label="부가세 (10%)" value={taxAmount} muted />
                  <div className="my-2 h-px bg-[var(--jm-border)]" />
                  {/* 합계 — 큰 글씨로 강조 */}
                  <div className="flex items-baseline justify-between">
                    <span className="text-jm-sm font-semibold text-[var(--jm-text)]">
                      합계 (VAT 포함)
                    </span>
                    <span className="text-jm-2xl font-bold tabular-nums text-[var(--jm-text)]">
                      ₩{Math.round(totalAmount).toLocaleString("ko-KR")}
                    </span>
                  </div>
                </div>

                {/* 매장 부담 — 손님 청구 무관, 마진 차감용 참고 */}
                {isDelivery && shippingCostBorneNet > 0 && (
                  <div className="mt-4 rounded-xl border border-[var(--jm-warning-border,var(--jm-border))] bg-[var(--jm-warning-bg)] p-3">
                    <p className="mb-1.5 text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-warning-fg)]">
                      매장 부담 (참고)
                    </p>
                    <div className="flex items-baseline justify-between">
                      <span className="text-jm-sm text-[var(--jm-warning-fg)]">
                        배송 원가 (VAT 포함)
                      </span>
                      <span className="text-jm-base font-bold tabular-nums text-[var(--jm-warning-fg)]">
                        −₩{shippingCostBorneGross.toLocaleString("ko-KR")}
                      </span>
                    </div>
                    <p className="mt-1 text-jm-2xs text-[var(--jm-warning-fg)]/80">
                      손님 청구와 무관 — 마진 리포트에서 순익 차감
                    </p>
                  </div>
                )}
              </div>

              {/* 메모 */}
              <JmFormField label="메모">
                <JmTextarea
                  rows={3}
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                />
              </JmFormField>
            </div>
          </div>
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

        {/* 품목 단가 수정 드로워 */}
        {priceLineIdx !== null && items[priceLineIdx] && (
          <PriceInputDialog
            open={true}
            onOpenChange={(o) => !o && setPriceLineIdx(null)}
            initialNet={parseFloat(items[priceLineIdx].unitPrice || "0")}
            taxType="TAXABLE"
            title="단가 수정"
            onSubmit={(net) => {
              updateItem(priceLineIdx, { unitPrice: String(net) });
              setPriceLineIdx(null);
            }}
          />
        )}

        {/* 할인 금액 드로워 */}
        <PriceInputDialog
          open={discountDialogOpen}
          onOpenChange={setDiscountDialogOpen}
          initialNet={parseFloat(discountAmount || "0")}
          taxType="TAXABLE"
          title="할인 금액"
          onSubmit={(net) => setDiscountAmount(String(net))}
        />

        {/* 배송비 (손님 청구) 드로워 — 저장값은 gross */}
        <PriceInputDialog
          open={shippingDialogOpen}
          onOpenChange={setShippingDialogOpen}
          initialNet={Math.round(parseFloat(shippingFee || "0") / 1.1)}
          taxType="TAXABLE"
          title="배송비 (손님 청구)"
          onSubmit={(net) => setShippingFee(String(Math.round(net * 1.1)))}
        />

        {/* 배송 원가 (매장 지불) 드로워 — 저장값은 net */}
        <PriceInputDialog
          open={shipCostDialogOpen}
          onOpenChange={setShipCostDialogOpen}
          initialNet={parseFloat(shippingCostBorne || "0")}
          taxType="TAXABLE"
          title="배송 원가 (매장 지불)"
          onSubmit={(net) => setShippingCostBorne(String(net))}
        />

        {/* 대표 상품 → 변형 선택 다이얼로그 */}
        {variantPickFor && (
          <VariantPickDialog
            canonicalId={variantPickFor.canonicalId}
            canonicalName={variantPickFor.canonicalName}
            open
            onOpenChange={(o) => {
              if (!o) setVariantPickFor(null);
            }}
            onPick={handleVariantPicked}
          />
        )}
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
    <div className="flex items-baseline justify-between text-jm-sm">
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
            ? "text-jm-xl font-bold text-[var(--jm-text)]"
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
 * 옵션 선택 — 상품에 등록된 ProductOption 들을 슬롯별 dropdown 으로 노출.
 * 옵션 없는 상품은 null 반환 (영역 생략).
 * 카드 레이아웃용: 테이블 row 대신 카드 하단 div 영역으로 렌더.
 */
function OrderItemOptionsCard({
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
    <div className="mt-2.5 flex flex-col gap-1.5 rounded-lg bg-[var(--jm-surface-muted)] px-3 py-2">
      {options.map((opt) => {
        // 이 옵션 슬롯에서 선택된 값 (single-select 정책)
        const selectedForOpt =
          selectedIds.find((id) =>
            opt.values.some((v) => v.id === id),
          ) ?? "";
        return (
          <div
            key={opt.id}
            className="flex items-center gap-2 text-jm-xs"
          >
            <span className="w-[80px] shrink-0 text-[var(--jm-text-muted)]">
              {opt.name}
              {opt.required && (
                <span className="text-[var(--jm-danger-fg)]"> *</span>
              )}
            </span>
            <div className="flex-1">
              <JmSelect
                size="sm"
                value={selectedForOpt}
                onChange={(newId) => {
                  // 같은 옵션 슬롯의 기존 선택 제거 후 새 값 추가
                  const otherIds = selectedIds.filter(
                    (id) => !opt.values.some((v) => v.id === id),
                  );
                  onChange(newId ? [...otherIds, newId] : otherIds);
                }}
                placeholder="— 선택 안 함 —"
                options={[
                  { value: "", label: "— 선택 안 함 —" },
                  ...opt.values.map((v) => {
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
                    return {
                      value: v.id,
                      label: `${v.label}${priceLabel}${suffix}`,
                    };
                  }),
                ]}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 변형 픽업 다이얼로그가 반환하는 결과 — 부모는 이걸로 라인 1개 추가. */
interface PickedVariant {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
  imageUrl: string | null;
}

interface VariantDetail {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
  imageUrl?: string | null;
  variableComponents?: { slotLabel: string; componentName: string }[];
}

interface VariantPickDialogProps {
  canonicalId: string;
  canonicalName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (variant: PickedVariant) => void;
}

/**
 * 대표(canonical) 상품에서 어떤 변형(variant) 인지 선택하는 모달.
 * POS 의 VariantSelectSheet 와 같은 의도 — 같은 이름·다른 SKU 가 평탄하게 나와 헤깔리는 문제 해결.
 *
 * /api/products/{id} 가 variants[]·variableComponents 를 반환 (POS 와 동일 contract).
 * 옵션(productOption) 은 라인 추가 후 OrderItemOptionsCard 가 처리하므로 여기선 변형만.
 */
function VariantPickDialog({
  canonicalId,
  canonicalName,
  open,
  onOpenChange,
  onPick,
}: VariantPickDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const productQuery = useQuery<{
    id: string;
    name: string;
    variants: VariantDetail[];
  }>({
    queryKey: ["product-detail-variants", canonicalId],
    queryFn: () =>
      apiGet<{ id: string; name: string; variants: VariantDetail[] }>(
        `/api/products/${canonicalId}`,
      ),
    enabled: open,
  });

  const variants = productQuery.data?.variants ?? [];

  const confirm = () => {
    const picked = variants.find((v) => v.id === selectedId);
    if (!picked) return;
    onPick({
      id: picked.id,
      name: picked.name,
      sku: picked.sku,
      sellingPrice: picked.sellingPrice,
      imageUrl: picked.imageUrl ?? null,
    });
  };

  return (
    <JmDialog open={open} onOpenChange={onOpenChange}>
      <JmDialogContent size="xl">
        <JmDialogHeader>
          <JmDialogTitle>변형 선택 — {canonicalName}</JmDialogTitle>
        </JmDialogHeader>
        <JmDialogBody>
          {productQuery.isPending ? (
            <div className="flex items-center justify-center py-10 text-jm-sm text-[var(--jm-text-subtle)]">
              <JmSpinner size="sm" />
              <span className="ml-2">불러오는 중…</span>
            </div>
          ) : variants.length === 0 ? (
            <div className="rounded-2xl bg-[var(--jm-surface-muted)] py-10 text-center text-jm-sm text-[var(--jm-text-subtle)]">
              등록된 변형이 없습니다 — 상품 페이지에서 추가하세요
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {variants.map((v) => {
                const active = selectedId === v.id;
                const price = parseFloat(v.sellingPrice) || 0;
                const priceGross = Math.round(price * 1.1);
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedId(v.id)}
                    onDoubleClick={() => {
                      setSelectedId(v.id);
                      onPick({
                        id: v.id,
                        name: v.name,
                        sku: v.sku,
                        sellingPrice: v.sellingPrice,
                        imageUrl: v.imageUrl ?? null,
                      });
                    }}
                    className={`flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors ${
                      active
                        ? "border-[var(--jm-action)] bg-[var(--jm-bg)]"
                        : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)]"
                    }`}
                  >
                    {v.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={v.imageUrl}
                        alt={v.name}
                        className="size-14 shrink-0 rounded-xl bg-[var(--jm-surface-muted)] object-cover"
                      />
                    ) : (
                      <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-[var(--jm-surface-muted)] text-[var(--jm-text-subtle)]">
                        <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
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
                      <span className="line-clamp-1 text-jm-sm font-semibold text-[var(--jm-text)]">
                        {v.name}
                      </span>
                      <span className="font-mono text-jm-xs text-[var(--jm-text-muted)]">
                        {v.sku}
                      </span>
                      {v.variableComponents && v.variableComponents.length > 0 && (
                        <span className="mt-0.5 line-clamp-2 text-jm-xs text-[var(--jm-text-muted)]">
                          {v.variableComponents
                            .map((c) => `${c.slotLabel}: ${c.componentName}`)
                            .join(" · ")}
                        </span>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[10px] uppercase tracking-wider text-[var(--jm-text-subtle)]">
                        VAT 포함
                      </div>
                      <div className="text-jm-sm font-semibold tabular-nums text-[var(--jm-text)]">
                        ₩{priceGross.toLocaleString("ko-KR")}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </JmDialogBody>
        <JmDialogFooter>
          <JmButton variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </JmButton>
          <JmButton onClick={confirm} disabled={!selectedId}>
            선택
          </JmButton>
        </JmDialogFooter>
      </JmDialogContent>
    </JmDialog>
  );
}
