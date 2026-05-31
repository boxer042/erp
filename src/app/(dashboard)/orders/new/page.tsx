"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, PanelRightClose, PanelRightOpen, Search, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { calcDiscountPerUnit, formatPhone, genClientId } from "@/lib/utils";
import {
  JmButton,
  JmDatePicker,
  JmIconButton,
  JmInput,
  JmSegmentedControl,
  JmSpinner,
  JmSwitch,
  JmTextarea,
} from "@/jm";

import { CategoryChips } from "@/app/(pos)/pos/_components/category-chips";
import { ProductGridCard } from "@/app/(pos)/pos/_components/product-grid-card";
import { PriceInputDialog } from "@/app/(pos)/pos/_components/price-input-dialog";
import { DiscountInputDialog } from "@/app/(pos)/pos/_components/discount-input-dialog";
import { VariantSelectSheet } from "@/app/(pos)/pos/_variant-select-sheet";
import { ServiceFeeSheet } from "@/app/(pos)/pos/_service-fee-sheet";
import { PresaleSheet } from "@/app/(pos)/pos/_presale-sheet";
import { QuickCustomerSheet } from "@/app/(pos)/pos/_quick-customer-sheet";
import { LinkCustomerSheet } from "@/app/(pos)/pos/_link-customer-sheet";
import { CustomerActionSheet } from "@/app/(pos)/pos/_customer-action-sheet";
import { issueQuotation, openPrintTab } from "@/app/(pos)/pos/_issue-document";
import type { ProductLite } from "@/app/(pos)/pos/_types";
import {
  calcCartTotals,
  type CartTotals,
} from "@/components/pos/cart-helpers";
import { CartEmptyState } from "@/components/pos/cart-empty-state";
import { CartActionButton as ActionButton } from "@/components/pos/cart-action-button";
import { PosLineItemRow } from "@/components/pos/line-item-row";
import { FooterStat } from "@/components/pos/footer-stat";
import { OrderContextBar } from "./_context-bar";
import {
  PaymentMethodSelector,
  type PaymentMethod,
} from "@/components/pos/payment-method-selector";
import {
  PartialPaymentTile,
  type PartialPayment,
} from "@/components/pos/partial-payment-tile";
import type {
  CartItem,
  CartSession,
} from "@/components/pos/sessions-context";

import type { FulfillmentType } from "../_types";
import {
  formatYmd,
  parseYmd,
  type CategoryRoot,
  type ChannelOption,
  type PickedVariant,
} from "./_types";
import {
  OrderItemOptionsCard,
  QuotationLoadDialog,
  VariantPickDialog,
} from "./_parts";

const FULFILLMENT_OPTIONS: { value: FulfillmentType; label: string; sub: string }[] = [
  { value: "IN_STORE", label: "매장판매", sub: "즉시 인도 · 종결" },
  { value: "PICKUP", label: "픽업 대기", sub: "추후 방문 수령" },
  { value: "DELIVERY", label: "배달", sub: "자체 배달" },
  { value: "QUICK", label: "퀵", sub: "퀵 호출 · 매장 부담" },
  { value: "SHIPPING", label: "택배", sub: "ERP 출고 워크보드" },
];

const SHIPPING_PAYMENT_OPTIONS = [
  { value: "PREPAID" as const, label: "선불", sub: "결제 시 함께" },
  { value: "COD" as const, label: "착불", sub: "받는 사람 부담" },
  { value: "STORE_BURDEN" as const, label: "무료", sub: "매장 부담 (회계 비용)" },
];

export default function NewOrderPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // ─── 카탈로그 state ───────────────────────────────────────────────
  const [categoryId, setCategoryId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearch = useDeferredValue(searchQuery.trim());
  const isSearching = deferredSearch.length > 0;

  // ─── 카트 / 폼 state ──────────────────────────────────────────────
  const [items, setItems] = useState<CartItem[]>([]);
  const [sessionDiscount, setSessionDiscount] = useState("0"); // "1000" 또는 "10%"
  const [sessionShipping, setSessionShipping] = useState("0"); // net 공급가액

  // 고객 — 등록(combobox) 또는 미등록 직접입력 둘 다 지원
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerType, setCustomerType] = useState<"INDIVIDUAL" | "BUSINESS">(
    "INDIVIDUAL",
  );
  // 값은 현재 미표시(헤더 칩은 이름·기업 배지만) — 고객 선택 시 setter 만 사용
  const [, setCustomerBusinessNumber] = useState<string | null>(null);

  // 채널 / 주문일 — ERP-only
  const [channelId, setChannelId] = useState("");
  const [orderDate, setOrderDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [channelOrderNo, setChannelOrderNo] = useState("");

  // 출고
  const [fulfillmentType, setFulfillmentType] =
    useState<FulfillmentType>("SHIPPING");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [expectedShipDate, setExpectedShipDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return formatYmd(d);
  });

  // 결제
  // 결제수단 — POS 와 동일 4종 (CARD/CASH/TRANSFER/UNPAID). 기본 CARD.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CARD");
  // 부분 결제 — 즉시 결제 금액 + 종류. null/total 과 같으면 전액 결제.
  const [partial, setPartial] = useState<PartialPayment>({
    paidAmount: null,
    kind: null,
  });
  const [taxInvoiceRequested, setTaxInvoiceRequested] = useState(false);
  const [shippingPaymentType, setShippingPaymentType] = useState<
    "PREPAID" | "COD" | "STORE_BURDEN"
  >("PREPAID");
  const [shippingCostBorne, setShippingCostBorne] = useState("0"); // net
  const [memo, setMemo] = useState("");

  // Dialogs
  const [priceLineIdx, setPriceLineIdx] = useState<number | null>(null);
  const [priceProduct, setPriceProduct] = useState<ProductLite | null>(null);
  // OPTION_PARENT 또는 옵션 보유 상품 — VariantSelectSheet 로 SWAP/옵션값 미리 선택 후 카트 추가
  const [optionPickProduct, setOptionPickProduct] = useState<ProductLite | null>(
    null,
  );
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [shippingDialogOpen, setShippingDialogOpen] = useState(false);
  const [shipCostDialogOpen, setShipCostDialogOpen] = useState(false);
  const [variantPickFor, setVariantPickFor] = useState<{
    canonicalId: string;
    canonicalName: string;
  } | null>(null);
  const [quotationLoadOpen, setQuotationLoadOpen] = useState(false);
  const [serviceFeeOpen, setServiceFeeOpen] = useState(false);
  const [presaleOpen, setPresaleOpen] = useState(false);
  const [customerActionOpen, setCustomerActionOpen] = useState(false);
  const [linkCustomerOpen, setLinkCustomerOpen] = useState(false);
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [quickCustomerDefault, setQuickCustomerDefault] = useState("");
  // 우측 패널(카트+폼) 표시 여부 — 토글로 카탈로그 전체 화면 모드 가능
  const [panelOpen, setPanelOpen] = useState(true);
  // 모바일 카트/결제 하단 시트 — PC 는 측면 패널 유지, 모바일은 우상단 카트 버튼으로 열기
  const [cartOpen, setCartOpen] = useState(false);
  // POS 와 동일한 단계 흐름 — 카트(라인·액션) → [결제하기] → 결제(출고·결제수단·등록)
  const [step, setStep] = useState<"cart" | "payment">("cart");

  // 분할 출고 — "나중 배송"으로 표시한 (상품) 라인. 매장수령(지금) A / 택배 백오더(나중) B 분리.
  // 서비스(기술료)는 매장에서 수행 → 항상 지금. 상품 라인만 나중 배송 대상.
  const [laterIds, setLaterIds] = useState<Set<string>>(new Set());
  const toggleLater = (cartItemId: string) =>
    setLaterIds((prev) => {
      const next = new Set(prev);
      if (next.has(cartItemId)) next.delete(cartItemId);
      else next.add(cartItemId);
      return next;
    });
  const isLaterLine = (i: CartItem) =>
    i.itemType === "product" && laterIds.has(i.cartItemId);
  const laterItems = items.filter(isLaterLine);
  const nowItems = items.filter((i) => !isLaterLine(i));
  // 양쪽 모두 비어있지 않을 때만 분할 (한쪽뿐이면 단일 주문 — 기존 흐름 그대로)
  const isSplit = laterItems.length > 0 && nowItems.length > 0;

  const isDelivery =
    fulfillmentType !== "IN_STORE" && fulfillmentType !== "PICKUP";

  // ─── Queries ──────────────────────────────────────────────────────
  const channelsQuery = useQuery({
    queryKey: ["channels"],
    queryFn: () => apiGet<ChannelOption[]>("/api/channels"),
  });
  const categoriesQuery = useQuery<CategoryRoot[]>({
    queryKey: ["pos-v2", "categories"],
    queryFn: () => apiGet<CategoryRoot[]>("/api/categories"),
    staleTime: 1000 * 60 * 5,
  });
  // 카테고리 그리드 (검색 미사용 시)
  const productsQuery = useQuery<ProductLite[]>({
    queryKey: ["order-new", "products-grid", { categoryId }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (categoryId) params.set("categoryId", categoryId);
      params.set("excludeVariants", "true");
      params.set("isBulk", "all");
      return apiGet<ProductLite[]>(`/api/products?${params}`);
    },
    staleTime: 1000 * 60,
    enabled: !isSearching,
  });
  // 검색용 전체 (검색 시작 시 lazy fetch + 5분 캐시)
  const allProductsQuery = useQuery<ProductLite[]>({
    queryKey: ["order-new", "products-all"],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("excludeVariants", "true");
      params.set("isBulk", "all");
      return apiGet<ProductLite[]>(`/api/products?${params}`);
    },
    staleTime: 1000 * 60 * 5,
    enabled: isSearching,
  });

  const products = useMemo(() => {
    if (isSearching) {
      const q = deferredSearch.toLowerCase();
      return (allProductsQuery.data ?? []).filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
      );
    }
    return productsQuery.data ?? [];
  }, [isSearching, deferredSearch, allProductsQuery.data, productsQuery.data]);
  const isProductsPending = isSearching
    ? allProductsQuery.isPending
    : productsQuery.isPending;

  const channelOptions = useMemo(
    () => [
      { value: "", label: "오프라인 / 직접" },
      ...(channelsQuery.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    ],
    [channelsQuery.data],
  );

  // ─── 카트 합계 (POS 와 동일 helper) ─────────────────────────────
  const session: CartSession = useMemo(
    () => ({
      id: "draft",
      label: "신규 주문",
      items,
      totalDiscount: sessionDiscount,
      shippingCost: sessionShipping,
    }),
    [items, sessionDiscount, sessionShipping],
  );
  const totals: CartTotals = useMemo(() => calcCartTotals(session), [session]);

  // ─── 카트 ops ────────────────────────────────────────────────────
  const addCartItem = (item: Omit<CartItem, "cartItemId" | "quantity" | "discount"> & {
    quantity?: number;
  }) => {
    setItems((prev) => [
      ...prev,
      {
        ...item,
        cartItemId: genClientId(),
        quantity: item.quantity ?? 1,
        discount: "0",
      } as CartItem,
    ]);
  };
  const removeCartItem = (cartItemId: string) =>
    setItems((prev) => prev.filter((i) => i.cartItemId !== cartItemId));
  const updateCartItem = (cartItemId: string, patch: Partial<CartItem>) =>
    setItems((prev) =>
      prev.map((i) => (i.cartItemId === cartItemId ? { ...i, ...patch } : i)),
    );

  const addProductTap = (p: ProductLite) => {
    // 대표(canonical) — 변형 선택 모달로 분기
    if (p.isCanonical) {
      setVariantPickFor({ canonicalId: p.id, canonicalName: p.name });
      return;
    }
    // OPTION_PARENT — SWAP 옵션값 미리 선택해야 실제 SKU 결정
    if (p.productType === "OPTION_PARENT") {
      setOptionPickProduct(p);
      return;
    }
    // 0원 상품은 가격 입력 강제 (0원 결제 사고 방지)
    if (Number(p.sellingPrice) === 0) {
      setPriceProduct(p);
      return;
    }
    pushProductLine(p, parseFloat(p.sellingPrice) || 0);
  };

  const pushProductLine = (p: ProductLite, unitPrice: number) => {
    const list = p.listPrice ? parseFloat(p.listPrice) : 0;
    const selling = parseFloat(p.sellingPrice) || 0;
    const baseline = list > 0 ? list : selling;
    addCartItem({
      productId: p.id,
      itemType: "product",
      name: p.name,
      sku: p.sku,
      imageUrl: p.imageUrl,
      unitPrice,
      listPrice: baseline > 0 ? baseline : undefined,
      taxType: p.taxType === "TAX_FREE" ? "TAX_FREE" : "TAXABLE",
      zeroRateEligible: p.zeroRateEligible,
      isBulk: p.isBulk,
      unitOfMeasure: p.unitOfMeasure,
      hasProductOptions: p.hasProductOptions,
    });
    toast.success(`${p.name} 추가`, { duration: 1500 });
  };

  const handleVariantPicked = (variant: PickedVariant) => {
    addCartItem({
      productId: variant.id,
      itemType: "product",
      name: variant.name,
      sku: variant.sku,
      imageUrl: variant.imageUrl,
      unitPrice: parseFloat(variant.sellingPrice) || 0,
      listPrice: parseFloat(variant.sellingPrice) || 0,
      taxType: "TAXABLE",
    });
    setVariantPickFor(null);
    toast.success(`${variant.name} 추가`, { duration: 1500 });
  };

  // ─── 고객 선택 ────────────────────────────────────────────────────
  /** LinkCustomerSheet / QuickCustomerSheet 에서 받는 고객 객체 */
  type SelectedCustomer = {
    id: string;
    name: string;
    phone?: string | null;
    type?: "INDIVIDUAL" | "BUSINESS";
    businessNumber?: string | null;
    shippingAddress?: string | null;
    address?: string | null;
  };
  const handleCustomerSelect = (c: SelectedCustomer) => {
    setCustomerId(c.id);
    setCustomerName(c.name);
    const phone = c.phone ? formatPhone(c.phone) : "";
    setCustomerPhone(phone);
    setCustomerType(c.type ?? "INDIVIDUAL");
    setCustomerBusinessNumber(c.businessNumber ?? null);
    // 배달·택배·픽업 — 받는 사람도 기본 고객 본인으로 자동 채움 (수정 가능)
    if (isDelivery) {
      setRecipientName(c.name);
      setRecipientPhone(phone);
    }
    if (c.shippingAddress) setShippingAddress(c.shippingAddress);
    else if (c.address) setShippingAddress(c.address);
  };
  const clearCustomer = () => {
    setCustomerId("");
    setCustomerName("");
    setCustomerPhone("");
    setCustomerType("INDIVIDUAL");
    setCustomerBusinessNumber(null);
  };

  // ─── 견적서 발행 (POS 와 동일 issueQuotation 재사용) ───────────────
  const quotationMutation = useMutation({
    mutationFn: () => issueQuotation(session),
    onSuccess: (q) => {
      toast.success(`견적서 발행 — ${q.quotationNo}`);
      openPrintTab("quotations", q.id);
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "견적서 발행 실패",
      ),
  });

  // ─── 등록 mutation ────────────────────────────────────────────────
  const createMutation = useMutation<
    { id: string; orderNo: string; labelCodes: string[]; splitOrderNo?: string },
    Error
  >({
    mutationFn: async () => {
      if (items.length === 0) {
        throw new Error("주문 항목을 1개 이상 추가해주세요");
      }
      if (items.some((i) => i.itemType === "service" && !i.name.trim())) {
        throw new Error("기술료 항목명을 입력해주세요");
      }
      if (isDelivery && !shippingAddress.trim()) {
        throw new Error("배송지를 입력해주세요");
      }
      if (paymentMethod === "UNPAID" && !customerId) {
        throw new Error("외상 결제는 등록 고객 선택이 필요합니다");
      }
      // 부분 결제(잔금 미수) — customerLedger SALE 등록 필요해 등록 고객 필수
      const isPartialPaidUI =
        partial.paidAmount !== null &&
        partial.paidAmount > 0 &&
        partial.paidAmount < totals.total;
      if (isPartialPaidUI && !customerId) {
        throw new Error(
          "부분 결제(잔금 미수)는 등록 고객 선택이 필요합니다",
        );
      }

      // 분할 출고 가드 — 부분 결제와 동시 사용 불가 (주문별 결제 배분이 모호해짐)
      if (isSplit && isPartialPaidUI) {
        throw new Error("분할 출고는 전액 결제만 지원합니다 (부분 결제 해제 후 진행)");
      }

      // 주문 항목 payload 빌더 — POS CartItem → OrderItem contract (단일/분할 공통).
      // 라인 할인("1000"/"10%")을 개당 정액(net)으로 환산해 OrderItem 에 보존.
      const buildItems = (subset: CartItem[]) =>
        subset.map((i) => {
          const discountPerUnit = calcDiscountPerUnit(i.unitPrice, i.discount);
          const listPrice = i.listPrice ?? i.unitPrice;
          const base = {
            quantity: String(i.quantity),
            unitPrice: String(i.unitPrice),
            discountPerUnit:
              discountPerUnit > 0 ? String(Math.round(discountPerUnit)) : undefined,
            listPrice: listPrice > 0 ? String(Math.round(listPrice)) : undefined,
          };
          return i.itemType === "service"
            ? { ...base, serviceName: i.name, presaleKind: i.presaleKind }
            : {
                ...base,
                productId: i.productId,
                optionValueIds: i.optionValueIds ?? [],
              };
        });

      // 라벨 자동 발번 — 해당 주문에 속한 trackable 상품만 (POS 와 동일, best-effort).
      const issueLabelsFor = async (subset: CartItem[]): Promise<string[]> => {
        const cands = subset
          .filter((i) => i.itemType === "product" && i.productId)
          .map((i) => ({
            productId: i.productId!,
            quantity: Math.max(1, Math.round(i.quantity)),
          }));
        if (cands.length === 0) return [];
        try {
          const res = await apiMutate<{ labels: { code: string }[] }>(
            "/api/serial-items/issue",
            "POST",
            { customerId: customerId || null, productItems: cands, repairTicketIds: [] },
          );
          return res.labels.map((l) => l.code);
        } catch {
          return []; // 라벨 발번 실패해도 주문 등록은 진행
        }
      };

      // /api/orders 1건 등록 — subset + 출고방식 + (분할 시) 그룹 링크.
      // sessionLevel=true 주문(단일 또는 분할 대표 A)만 세션 할인·배송비·부분결제 메타 보유.
      // B(나중 배송)는 자기 품목 라인만 — 세션 할인/배송비 0, 결제수단 상속(전액), splitParentId=A.id.
      const postOrder = async (
        subset: CartItem[],
        opts: {
          fulfillmentType: FulfillmentType;
          sessionLevel: boolean;
          splitGroupId?: string;
          splitParentId?: string;
        },
      ) => {
        const labelCodes = await issueLabelsFor(subset);
        const ship =
          opts.fulfillmentType !== "IN_STORE" && opts.fulfillmentType !== "PICKUP";
        const r = await apiMutate<{ id: string; orderNo: string }>(
          "/api/orders",
          "POST",
          {
            channelId: channelId || null,
            channelOrderNo: channelOrderNo || undefined,
            customerId: customerId || undefined,
            customerName: customerName || undefined,
            customerPhone: customerPhone || undefined,
            recipientName: recipientName || undefined,
            recipientPhone: recipientPhone || undefined,
            shippingAddress: shippingAddress || undefined,
            orderDate,
            fulfillmentType: opts.fulfillmentType,
            expectedShipDate:
              opts.sessionLevel && ship ? expectedShipDate || undefined : undefined,
            paymentMethod: paymentMethod || undefined,
            // 부분 결제 — 대표 주문(sessionLevel)만. paidAmount<totalAmount 면 서버가 PARTIAL_PAID
            paidAmount:
              opts.sessionLevel && partial.paidAmount !== null
                ? String(partial.paidAmount)
                : undefined,
            partialPaymentKind: opts.sessionLevel ? partial.kind ?? undefined : undefined,
            taxInvoiceRequested,
            labelCodes: labelCodes.length > 0 ? labelCodes : undefined,
            // sessionDiscount 는 "1000"/"10%" — calcCartTotals 가 net 으로 환산
            discountAmount: opts.sessionLevel ? String(totals.sessionDiscountAmount) : "0",
            // 배송비는 API 가 gross 로 받음 → net × 1.1
            shippingFee: opts.sessionLevel
              ? String(Math.round(totals.shippingNet * 1.1))
              : "0",
            shippingPaymentType,
            shippingCostBorne: opts.sessionLevel ? shippingCostBorne || "0" : "0",
            memo: memo || undefined,
            splitGroupId: opts.splitGroupId,
            splitParentId: opts.splitParentId,
            items: buildItems(subset),
          },
        );
        return { ...r, labelCodes };
      };

      // 단일 주문 — 기존 동작 그대로 (split 필드 undefined → 서버 null, 흐름 불변)
      if (!isSplit) {
        return postOrder(items, { fulfillmentType, sessionLevel: true });
      }

      // 분할 — A(지금/대표, 전역 출고방식) + B(나중/택배 백오더, SHIPPING PENDING 미차감).
      // 각 주문이 자기 품목만큼 정상 결제·원장 보유. 동일 splitGroupId, B.splitParentId=A.id.
      const splitGroupId = genClientId();
      const a = await postOrder(nowItems, {
        fulfillmentType,
        sessionLevel: true,
        splitGroupId,
      });
      const b = await postOrder(laterItems, {
        fulfillmentType: "SHIPPING",
        sessionLevel: false,
        splitGroupId,
        splitParentId: a.id,
      });
      return {
        id: a.id,
        orderNo: a.orderNo,
        labelCodes: [...a.labelCodes, ...b.labelCodes],
        splitOrderNo: b.orderNo,
      };
    },
    onSuccess: (data) => {
      // 매장판매(IN_STORE) — 즉시 종결되어 워크보드에 안 노출. 통합 판매내역으로 진입.
      // 그 외(PICKUP/DELIVERY/QUICK/SHIPPING) — PENDING 으로 진입하므로 워크보드로.
      // 분할 등록이면 택배 백오더(B)가 워크보드에 있으니 항상 워크보드로 보냄.
      const isInStoreSale = fulfillmentType === "IN_STORE";
      const hasLabels = data.labelCodes.length > 0;
      toast.success(
        data.splitOrderNo
          ? `분할 등록 — 현장 수령분 ${data.orderNo} + 택배 발송분 ${data.splitOrderNo}` +
              (hasLabels ? ` · 라벨 ${data.labelCodes.length}개 발번` : "")
          : `주문이 등록되었습니다 — ${data.orderNo}` +
              (isInStoreSale ? " (매장판매 · 즉시 종결)" : "") +
              (hasLabels ? ` · 시리얼 라벨 ${data.labelCodes.length}개 자동 발번` : ""),
        hasLabels
          ? {
              duration: 8000,
              action: {
                label: "라벨 인쇄",
                onClick: () =>
                  window.open(
                    `/serial-items/print?codes=${encodeURIComponent(data.labelCodes.join(","))}`,
                    "_blank",
                  ),
              },
            }
          : undefined,
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      // 분할이면 워크보드로(B 백오더 노출), 아니면 기존 분기
      router.push(data.splitOrderNo || !isInStoreSale ? "/orders" : "/sales/history");
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

  const cartCount = items.length;
  const canSubmit = cartCount > 0 && !createMutation.isPending;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--jm-bg)]">
      {/* ─── 스티키 헤더 ─── */}
      <div className="sticky top-0 z-20 border-b border-[var(--jm-border)] bg-[var(--jm-bg)]">
        <header className="flex items-center gap-3 px-4 py-3 sm:px-6">
          <JmIconButton
            aria-label="뒤로"
            onClick={() => router.push("/orders")}
            variant="ghost"
          >
            <ArrowLeft className="size-4" />
          </JmIconButton>
          <div className="hidden min-w-0 flex-col md:flex">
            <span className="text-jm-base font-semibold text-[var(--jm-text)]">
              신규 주문 등록
            </span>
            <span className="text-jm-2xs text-[var(--jm-text-muted)]">
              채널·거래일을 확인하고 상품을 담아 등록하세요
            </span>
          </div>
          {/* 상품 검색바 — 헤더 중앙. 입력 시 좌측 카탈로그가 카테고리 무관 전체에서 검색 */}
          <div className="relative mx-2 max-w-[480px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--jm-text-subtle)]" />
            <JmInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="상품명·SKU 검색"
              className="pl-9"
            />
          </div>
          {/* 모바일 카트 버튼 — 카트/결제 하단 시트 열기 (배지=건수). POS 우상단 카트와 동일 흐름 */}
          <button
            type="button"
            aria-label="카트 열기"
            onClick={() => {
              setStep("cart");
              setCartOpen(true);
            }}
            className="relative ml-auto inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)] lg:hidden"
          >
            <ShoppingCart className="size-5" />
            {cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-[var(--jm-action)] px-1 text-jm-3xs font-bold leading-none text-white">
                {cartCount}
              </span>
            )}
          </button>
          {/* 우측 패널 토글 (PC) — 카탈로그 전체화면 모드 */}
          <JmIconButton
            aria-label={panelOpen ? "우측 패널 닫기" : "우측 패널 열기"}
            variant="ghost"
            onClick={() => setPanelOpen((v) => !v)}
            className="ml-auto hidden lg:inline-flex"
          >
            {panelOpen ? (
              <PanelRightClose className="size-4" />
            ) : (
              <PanelRightOpen className="size-4" />
            )}
          </JmIconButton>
        </header>

        {/* 맥락 바 — 채널·거래일(ERP 전용). 기본값이면 멈추지 않고 진행 */}
        <OrderContextBar
          customerName={customerName || null}
          customerType={customerType}
          hasCustomer={!!(customerId || customerName || customerPhone)}
          onCustomerClick={() => setCustomerActionOpen(true)}
          onCustomerClear={
            customerId || customerName || customerPhone
              ? () => clearCustomer()
              : undefined
          }
          channelOptions={channelOptions}
          channelId={channelId}
          onChannelChange={setChannelId}
          orderDate={parseYmd(orderDate)}
          onOrderDateChange={(d) => setOrderDate(formatYmd(d))}
          channelOrderNo={channelOrderNo}
          onChannelOrderNoChange={setChannelOrderNo}
        />
      </div>

      {/* ─── 본문 ─── */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ── 좌측: 카탈로그 ── */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-[var(--jm-border)] lg:border-b-0 lg:border-r">
          {/* 카테고리 칩 (검색바는 상단 헤더로 이동) */}
          <div className="shrink-0 border-b border-[var(--jm-border)] bg-[var(--jm-surface)]">
            <div className="px-4 sm:px-6">
              <CategoryChips
                categories={categoriesQuery.data ?? []}
                selectedId={categoryId}
                onSelect={setCategoryId}
                loading={categoriesQuery.isPending}
              />
            </div>
          </div>

          {/* 그리드 */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="px-3 py-3 sm:px-4 sm:py-4">
              {isProductsPending ? (
                <GridSkeleton />
              ) : products.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-center">
                  <span className="text-jm-base text-[var(--jm-text-muted)]">
                    {isSearching
                      ? `"${deferredSearch}" 검색 결과가 없습니다`
                      : "해당 카테고리에 상품이 없습니다"}
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4">
                  {products.map((p) => (
                    <ProductGridCard
                      key={p.id}
                      product={p}
                      onClick={() => addProductTap(p)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── 우측: 카트 + 폼 — PC 측면 패널 / 모바일 하단 시트(우상단 카트 버튼으로 열기) ── */}
        {/* 모바일 백드롭 */}
        <div
          className={`fixed inset-0 z-30 bg-black/40 transition-opacity lg:hidden ${
            cartOpen ? "" : "pointer-events-none opacity-0"
          }`}
          onClick={() => setCartOpen(false)}
          aria-hidden
        />
        <aside
          className={`flex min-h-0 flex-col bg-[var(--jm-surface)] fixed inset-x-0 bottom-0 z-40 max-h-[88vh] rounded-t-3xl shadow-[var(--jm-shadow-lg)] transition-transform duration-300 lg:static lg:z-auto lg:max-h-none lg:translate-y-0 lg:rounded-none lg:shadow-none lg:transition-none lg:w-[440px] lg:shrink-0 xl:w-[480px] ${
            cartOpen ? "translate-y-0" : "translate-y-full"
          } ${panelOpen ? "lg:flex" : "lg:hidden"}`}
        >
          {/* 모바일 드래그 핸들 */}
          <div className="flex shrink-0 items-center justify-center pt-2 lg:hidden">
            <div className="h-1 w-10 rounded-full bg-[var(--jm-border-strong)]" />
          </div>
          {/* 본문 — 스크롤 */}
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-5">
              {/* 고객은 상단 맥락 바(OrderContextBar)에서 선택 — POS 와 달리 결제 전 미리 지정 */}
              {/* ── 카트 단계 (POS 흐름: 카트 → [결제하기] → 결제) ── */}
              {step === "cart" && (
              <div className="flex flex-col gap-2.5">
                <SectionLabel>
                  카트 {cartCount > 0 ? `· ${cartCount}건` : ""}
                </SectionLabel>
                {items.length === 0 ? (
                  <CartEmptyState
                    customerId={customerId || null}
                    onLoadQuotation={
                      customerId ? () => setQuotationLoadOpen(true) : undefined
                    }
                  />
                ) : (
                  <div className="flex flex-col gap-2">
                    {items.map((it, idx) => (
                      <CartLineCard
                        key={it.cartItemId}
                        item={it}
                        onRemove={() => removeCartItem(it.cartItemId)}
                        onUpdate={(patch) => updateCartItem(it.cartItemId, patch)}
                        onEditPrice={() => setPriceLineIdx(idx)}
                        later={laterIds.has(it.cartItemId)}
                        onToggleLater={() => toggleLater(it.cartItemId)}
                      />
                    ))}
                  </div>
                )}

                {/* 카트 액션 그리드 — POS 카트시트와 동일 8버튼 구성(공용 CartActionButton).
                    [시리얼출력][장바구니저장]은 ERP 주문에서 미지원이라 비활성(제거하지 않고 통일). */}
                <div className="grid grid-cols-4 gap-1.5">
                  <ActionButton
                    label="할인"
                    sub={
                      sessionDiscount && sessionDiscount !== "0"
                        ? sessionDiscount.endsWith("%")
                          ? sessionDiscount
                          : `₩${parseInt(sessionDiscount, 10).toLocaleString("ko-KR")}`
                        : "추가"
                    }
                    active={!!sessionDiscount && sessionDiscount !== "0"}
                    onClick={() => setDiscountDialogOpen(true)}
                  />
                  <ActionButton
                    label="배송비"
                    sub={
                      sessionShipping && sessionShipping !== "0"
                        ? `₩${parseInt(sessionShipping, 10).toLocaleString("ko-KR")}`
                        : "추가"
                    }
                    active={!!sessionShipping && sessionShipping !== "0"}
                    onClick={() => setShippingDialogOpen(true)}
                  />
                  <ActionButton
                    label="기술료"
                    sub="공임 추가"
                    onClick={() => setServiceFeeOpen(true)}
                  />
                  <ActionButton
                    label="선판매"
                    sub="미등록 항목"
                    onClick={() => setPresaleOpen(true)}
                  />
                  <ActionButton
                    label="시리얼출력"
                    sub="POS 결제"
                    disabled
                    onClick={() => {}}
                  />
                  <ActionButton
                    label="장바구니저장"
                    sub="POS 전용"
                    disabled
                    onClick={() => {}}
                  />
                  <ActionButton
                    label="견적서"
                    sub={
                      !customerId
                        ? "고객 연결"
                        : items.length === 0
                          ? "라인 없음"
                          : quotationMutation.isPending
                            ? "진행중…"
                            : "발행"
                    }
                    disabled={
                      !customerId ||
                      items.length === 0 ||
                      quotationMutation.isPending
                    }
                    onClick={() => quotationMutation.mutate()}
                  />
                  <ActionButton
                    label="불러오기"
                    sub={customerId ? "이전 견적서" : "고객 연결"}
                    disabled={!customerId}
                    onClick={() => setQuotationLoadOpen(true)}
                  />
                </div>
              </div>
              )}

              {/* ── 결제 단계 (출고·결제수단·부분결제·세금·메모) ── */}
              {step === "payment" && (
                <>
              {/* 출고 방식 — POS 와 동일 5버튼 grid */}
              <div className="flex flex-col gap-2.5">
                <SectionLabel>출고 방식</SectionLabel>
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
                        <span className="text-jm-base font-semibold text-[var(--jm-text)]">
                          {opt.label}
                        </span>
                        <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                          {opt.sub}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* 분할 출고 안내 — "나중 배송" 라인이 섞이면 택배 백오더(B)가 별도 등록됨 */}
                {isSplit && (
                  <div className="flex items-start gap-2 rounded-2xl border border-[var(--jm-warning-solid)]/30 bg-[var(--jm-warning-bg)] px-3 py-2.5">
                    <span className="mt-0.5 text-jm-sm">📦</span>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-jm-xs font-semibold text-[var(--jm-warning-fg)]">
                        분할 출고 — 2개 주문으로 등록됩니다
                      </span>
                      <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                        지금(
                        {FULFILLMENT_OPTIONS.find((o) => o.value === fulfillmentType)
                          ?.label ?? "매장"}
                        ) {nowItems.length}건 + 택배 발송분 {laterItems.length}건.
                        택배 발송분은 미차감 PENDING 으로 워크보드에서 입고/직출고 후
                        발송하세요.
                      </span>
                    </div>
                  </div>
                )}

                {isDelivery && (
                  <div className="flex flex-col gap-2 rounded-2xl bg-[var(--jm-bg)] p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-jm-xs font-semibold text-[var(--jm-text)]">
                        {fulfillmentType === "SHIPPING"
                          ? "택배 발송지"
                          : "배달지"}
                      </span>
                      {customerId && (customerName || customerPhone) && (
                        <button
                          type="button"
                          onClick={() => {
                            setRecipientName(customerName);
                            setRecipientPhone(customerPhone);
                          }}
                          className="text-jm-2xs font-medium text-[var(--jm-text)] underline-offset-2 hover:underline"
                        >
                          고객 정보 채우기
                        </button>
                      )}
                    </div>
                    <JmInput
                      size="sm"
                      type="text"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder="받는 사람 이름 (선택)"
                      className="bg-[var(--jm-surface)]"
                    />
                    <JmInput
                      size="sm"
                      type="tel"
                      value={recipientPhone}
                      onChange={(e) =>
                        setRecipientPhone(formatPhone(e.target.value))
                      }
                      placeholder="받는 사람 연락처 *"
                      className="bg-[var(--jm-surface)]"
                    />
                    <textarea
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                      placeholder="주소 *"
                      rows={2}
                      className="resize-none rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 py-2 text-jm-sm text-[var(--jm-text)] outline-none focus:border-[var(--jm-border-strong)]"
                    />
                    <div className="flex flex-col gap-1.5">
                      <span className="text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
                        발송 예정일
                      </span>
                      <JmDatePicker
                        size="sm"
                        value={parseYmd(expectedShipDate)}
                        onChange={(d) =>
                          setExpectedShipDate(d ? formatYmd(d) : "")
                        }
                        placeholder="발송일 선택"
                      />
                    </div>
                    {/* 배송비 결제 방식 */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
                        배송비
                      </span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {SHIPPING_PAYMENT_OPTIONS.map((opt) => {
                          const active = shippingPaymentType === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => {
                                setShippingPaymentType(opt.value);
                                // 착불(COD) — 매장 회계 무관, 부담 금액 자동 리셋
                                if (opt.value === "COD") setShippingCostBorne("0");
                              }}
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
                    {shippingPaymentType !== "COD" && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
                          배송 원가 (매장 지불)
                        </span>
                        <button
                          type="button"
                          onClick={() => setShipCostDialogOpen(true)}
                          className="flex h-10 items-center justify-between rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 text-jm-sm text-[var(--jm-text)] outline-none transition-colors hover:border-[var(--jm-border-strong)]"
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
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 결제수단 — POS 와 동일 공용 컴포넌트 (한쪽 수정 시 양쪽 적용) */}
              <div className="flex flex-col gap-2.5">
                <SectionLabel>결제수단</SectionLabel>
                <PaymentMethodSelector
                  value={paymentMethod}
                  onChange={setPaymentMethod}
                />
                {paymentMethod === "UNPAID" && !customerId && (
                  <div className="rounded-xl bg-[var(--jm-warning-bg)] px-3 py-2 text-jm-2xs text-[var(--jm-warning-fg)]">
                    외상은 등록 고객 선택이 필요합니다
                  </div>
                )}
                {/* 부분 결제 — 계약금/일부결제 분기 (잔금 미수 자동 customerLedger) */}
                <PartialPaymentTile
                  totalAmount={totals.total}
                  value={partial}
                  disabled={paymentMethod === "UNPAID"}
                  onChange={setPartial}
                />
                {partial.paidAmount !== null &&
                  partial.paidAmount > 0 &&
                  partial.paidAmount < totals.total &&
                  !customerId && (
                    <div className="rounded-xl bg-[var(--jm-warning-bg)] px-3 py-2 text-jm-2xs text-[var(--jm-warning-fg)]">
                      부분 결제(잔금 미수)는 등록 고객 선택이 필요합니다
                    </div>
                  )}
              </div>


              {/* 세금계산서 */}
              <button
                type="button"
                onClick={() => setTaxInvoiceRequested((v) => !v)}
                className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left transition-colors ${
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
                    {customerId
                      ? "발행 대기 목록에 등록됩니다"
                      : "등록 고객 권장 — 발행 시 사업자 정보 필요"}
                  </span>
                </div>
                <JmSwitch checked={taxInvoiceRequested} onCheckedChange={setTaxInvoiceRequested} />
              </button>

              {/* 메모 */}
              <div className="flex flex-col gap-1.5">
                <SectionLabel>메모</SectionLabel>
                <JmTextarea
                  rows={3}
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="주문 메모 (선택)"
                />
              </div>
                </>
              )}
            </div>
          </div>

          {/* Sticky bottom bar — POS 결제시트 풋터 패턴(내역 + CTA). 항상 노출. */}
          <div className="shrink-0 border-t border-[var(--jm-border)] bg-[var(--jm-surface)] p-3">
            <div className="flex flex-col gap-2.5">
              {/* 내역 — 다크 카드 대체 (공급가액·세액·건수·할인) */}
              <div
                className={`grid gap-2 ${
                  totals.sessionDiscountAmount > 0 ? "grid-cols-4" : "grid-cols-3"
                }`}
              >
                <FooterStat label="공급가액" value={totals.net} />
                <FooterStat label="세액" value={totals.vat} />
                <FooterStat label="건수" value={cartCount} suffix="건" />
                {totals.sessionDiscountAmount > 0 && (
                  <FooterStat
                    label="할인"
                    value={-totals.sessionDiscountAmount}
                    tone="warn"
                  />
                )}
              </div>
              {step === "cart" ? (
                <div className="flex items-stretch gap-2">
                  <JmButton
                    variant="outline"
                    size="lg"
                    onClick={() => router.push("/orders")}
                    className="shrink-0"
                  >
                    취소
                  </JmButton>
                  <JmButton
                    variant="cta"
                    size="lg"
                    onClick={() => setStep("payment")}
                    disabled={items.length === 0}
                    className="flex-1"
                  >
                    결제하기 →
                  </JmButton>
                </div>
              ) : (
                <div className="flex items-stretch gap-2">
                  <JmButton
                    variant="outline"
                    size="lg"
                    onClick={() => setStep("cart")}
                    disabled={createMutation.isPending}
                    className="shrink-0"
                  >
                    ← 카트
                  </JmButton>
                  <JmButton
                    variant="cta"
                    size="lg"
                    onClick={() => createMutation.mutate()}
                    disabled={!canSubmit}
                    className="flex-1"
                  >
                    {createMutation.isPending && <JmSpinner size="sm" tone="inverted" />}
                    {createMutation.isPending
                      ? "등록 중..."
                      : `₩${totals.total.toLocaleString("ko-KR")} 등록`}
                  </JmButton>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* ─── Dialogs ─── */}
      {/* 0원 상품 → 가격 입력 */}
      {priceProduct && (
        <PriceInputDialog
          open
          onOpenChange={(o) => !o && setPriceProduct(null)}
          title={priceProduct.name}
          initialNet={parseFloat(priceProduct.sellingPrice) || 0}
          taxType={priceProduct.taxType === "TAX_FREE" ? "TAX_FREE" : "TAXABLE"}
          isZeroRate={false}
          originalPrice={(() => {
            const list = priceProduct.listPrice
              ? parseFloat(priceProduct.listPrice)
              : 0;
            const selling = parseFloat(priceProduct.sellingPrice) || 0;
            const baseline = list > 0 ? list : selling;
            return baseline > 0 ? baseline : undefined;
          })()}
          onSubmit={(net) => {
            pushProductLine(priceProduct, net);
            setPriceProduct(null);
          }}
        />
      )}

      {/* 카트 라인 단가 수정 */}
      {priceLineIdx !== null && items[priceLineIdx] && (
        <PriceInputDialog
          open
          onOpenChange={(o) => !o && setPriceLineIdx(null)}
          title={items[priceLineIdx].name || "단가 수정"}
          initialNet={items[priceLineIdx].unitPrice}
          taxType={items[priceLineIdx].taxType ?? "TAXABLE"}
          isZeroRate={items[priceLineIdx].isZeroRate}
          originalPrice={items[priceLineIdx].listPrice}
          onSubmit={(net) => {
            const cid = items[priceLineIdx].cartItemId;
            updateCartItem(cid, { unitPrice: net });
            setPriceLineIdx(null);
          }}
        />
      )}

      {/* 할인 다이얼로그 — 정액/% 토글 (POS 와 동일) */}
      <DiscountInputDialog
        open={discountDialogOpen}
        onOpenChange={setDiscountDialogOpen}
        title="전체 할인"
        baseAmount={totals.net + totals.vat}
        initialDiscount={sessionDiscount}
        onSubmit={(d) => setSessionDiscount(d)}
      />

      {/* 기술료/공임 추가 시트 — POS 와 동일 ServiceFeeSheet 재사용 (onAdd 콜백으로 ERP 카트에 라인 추가) */}
      <ServiceFeeSheet
        open={serviceFeeOpen}
        onOpenChange={setServiceFeeOpen}
        onAdd={(line) =>
          addCartItem({
            itemType: "service",
            name: line.name,
            imageUrl: null,
            unitPrice: line.unitPrice,
            taxType: "TAXABLE",
          })
        }
      />

      {/* 선판매 — 미등록 중고/내상품(비활)을 자유 입력으로 먼저 판매. 사후 정리로 연결.
          itemType="service" + presaleKind 으로 행을 미리 구별 (POS 카트시트와 동일 PresaleSheet 재사용). */}
      <PresaleSheet
        open={presaleOpen}
        onOpenChange={setPresaleOpen}
        onAdd={(line) =>
          addCartItem({
            itemType: "service",
            presaleKind: line.presaleKind,
            name: line.name,
            imageUrl: null,
            unitPrice: line.unitPrice,
            taxType: "TAXABLE",
          })
        }
      />

      {/* 고객 액션 시트 — 카드 클릭 시 뜨는 POS 패턴 (기존 고객 연결 / 새 고객 등록 / 다른 고객으로 변경 / 고객 페이지) */}
      <CustomerActionSheet
        open={customerActionOpen}
        onOpenChange={setCustomerActionOpen}
        data={{ customerId, customerName }}
        onLinkCustomer={() => setLinkCustomerOpen(true)}
        onCreateCustomer={() => {
          setQuickCustomerDefault("");
          setQuickCustomerOpen(true);
        }}
        onViewProfile={
          customerId ? () => router.push(`/customers/${customerId}`) : undefined
        }
      />

      {/* 고객 검색 시트 — POS 와 동일 LinkCustomerSheet 재사용 (풀스크린 검색 + 인라인 [+ 새 고객 등록]).
          onSelect 로 선택 적용, onCreate 로 QuickCustomerSheet 체이닝 (검색어 자동 prefill). */}
      <LinkCustomerSheet
        open={linkCustomerOpen}
        onOpenChange={setLinkCustomerOpen}
        onSelect={(c) => {
          handleCustomerSelect(c);
          setLinkCustomerOpen(false);
        }}
        onCreate={(defaultName) => {
          setLinkCustomerOpen(false);
          setQuickCustomerDefault(defaultName);
          setQuickCustomerOpen(true);
        }}
      />

      {/* 새 고객 빠른 등록 — POS 와 동일 시트 재사용. 등록 성공 시 자동 선택 */}
      <QuickCustomerSheet
        open={quickCustomerOpen}
        onOpenChange={setQuickCustomerOpen}
        defaultText={quickCustomerDefault}
        onCreated={(c) => {
          setCustomerId(c.id);
          setCustomerName(c.name);
          setCustomerPhone(c.phone ? formatPhone(c.phone) : "");
          setCustomerType(c.type ?? "INDIVIDUAL");
          setCustomerBusinessNumber(c.businessNumber ?? null);
          // 등록 후 customer 캐시 갱신 — 다음 검색에 반영
          queryClient.invalidateQueries({ queryKey: ["customers"] });
          if (isDelivery) {
            setRecipientName(c.name);
            setRecipientPhone(c.phone ? formatPhone(c.phone) : "");
          }
        }}
      />

      {/* 배송비 (손님 청구) — net 입력 */}
      <PriceInputDialog
        open={shippingDialogOpen}
        onOpenChange={setShippingDialogOpen}
        title="배송비 (손님 청구)"
        initialNet={parseFloat(sessionShipping || "0")}
        taxType="TAXABLE"
        onSubmit={(net) => setSessionShipping(String(net))}
      />

      {/* 배송 원가 (매장 지불) — net 입력 */}
      <PriceInputDialog
        open={shipCostDialogOpen}
        onOpenChange={setShipCostDialogOpen}
        title="배송 원가 (매장 지불)"
        initialNet={parseFloat(shippingCostBorne || "0")}
        taxType="TAXABLE"
        onSubmit={(net) => setShippingCostBorne(String(net))}
      />

      {/* OPTION_PARENT — SWAP/옵션 선택 시트 (POS 와 동일 UI). 확정 후 카트 라인 자동 추가. */}
      {optionPickProduct && (
        <VariantSelectSheet
          open
          onOpenChange={(o) => !o && setOptionPickProduct(null)}
          productId={optionPickProduct.id}
          needsVariant={!!optionPickProduct.isCanonical}
          onConfirm={(sel) => {
            const p = optionPickProduct;
            const isSwap = !!sel.swap;
            const finalProductId = isSwap ? sel.swap!.productId : p.id;
            const finalName = isSwap ? sel.swap!.name : p.name;
            const finalSku = isSwap ? sel.swap!.sku ?? p.sku : p.sku;
            const baseSellingPrice = isSwap
              ? sel.swap!.sellingPrice
              : parseFloat(p.sellingPrice) || 0;
            const finalUnitPrice = baseSellingPrice + sel.nonMappedAddPriceSum;
            const listForCompare = isSwap
              ? sel.swap!.listPrice ?? baseSellingPrice
              : parseFloat(p.listPrice ?? p.sellingPrice) || 0;
            const taxType: "TAXABLE" | "TAX_FREE" = isSwap
              ? sel.swap!.taxType ?? "TAXABLE"
              : p.taxType === "TAX_FREE"
                ? "TAX_FREE"
                : "TAXABLE";
            addCartItem({
              productId: finalProductId,
              itemType: "product",
              name: finalName,
              sku: finalSku,
              imageUrl: p.imageUrl,
              unitPrice: finalUnitPrice,
              listPrice: listForCompare > 0 ? listForCompare : undefined,
              taxType,
              zeroRateEligible: p.zeroRateEligible,
              isBulk: p.isBulk,
              unitOfMeasure: p.unitOfMeasure,
              hasProductOptions: p.hasProductOptions,
              optionValueIds:
                sel.optionValueIds.length > 0 ? sel.optionValueIds : undefined,
              optionSnapshot:
                Object.keys(sel.optionSnapshot).length > 0
                  ? sel.optionSnapshot
                  : undefined,
              optionAddPriceSum:
                sel.nonMappedAddPriceSum > 0
                  ? sel.nonMappedAddPriceSum
                  : undefined,
              optionRefs: sel.optionRefs.length > 0 ? sel.optionRefs : undefined,
            });
            toast.success(`${finalName} 추가`, { duration: 1500 });
            setOptionPickProduct(null);
          }}
        />
      )}

      {/* 견적서 → 카트 라인 일괄 로드 (등록 고객 한정) */}
      {customerId && (
        <QuotationLoadDialog
          open={quotationLoadOpen}
          onOpenChange={setQuotationLoadOpen}
          customerId={customerId}
          cartItemCount={cartCount}
          onLoad={(loaded) => setItems(loaded)}
        />
      )}

      {/* 대표 상품 → 변형 선택 */}
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
    </div>
  );
}

// ─── 소형 UI 헬퍼들 ────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-jm-xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
      {children}
    </span>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col overflow-hidden rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)]"
        >
          <div className="aspect-square w-full animate-pulse bg-[var(--jm-surface-muted)]" />
          <div className="flex flex-col gap-1.5 p-2.5">
            <div className="h-3.5 w-full animate-pulse rounded bg-[var(--jm-surface-muted)]" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── 카트 라인 카드 ──────────────────────────────────────────────────

function CartLineCard({
  item,
  onRemove,
  onUpdate,
  onEditPrice,
  later,
  onToggleLater,
}: {
  item: CartItem;
  onRemove: () => void;
  onUpdate: (patch: Partial<CartItem>) => void;
  onEditPrice: () => void;
  /** 분할 출고 — 이 라인이 "나중 배송"(택배 백오더) 으로 표시됐는지 */
  later: boolean;
  onToggleLater: () => void;
}) {
  const taxFree = item.taxType === "TAX_FREE" || item.isZeroRate;
  // 라인 할인 — 견적서 로드 시 반영되는 정액·% 할인을 개당 정액으로 환산
  const discountPerUnit = calcDiscountPerUnit(item.unitPrice, item.discount);
  const netUnit = Math.max(0, item.unitPrice - discountPerUnit);
  const unitGross = taxFree ? Math.round(netUnit) : Math.round(netUnit * 1.1);
  const lineNet = netUnit * item.quantity;
  const lineGross = taxFree ? Math.round(lineNet) : Math.round(lineNet * 1.1);
  const isService = item.itemType === "service";
  const isBulk = !!item.isBulk;
  const optionSummary =
    item.optionSnapshot && Object.keys(item.optionSnapshot).length > 0
      ? Object.entries(item.optionSnapshot)
          .map(([k, v]) => `${k}: ${v}`)
          .join(" · ")
      : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-bg)]">
      <PosLineItemRow
        image={
          isService ? undefined : item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt={item.name}
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
        }
        name={item.name}
        sku={isService ? null : item.sku}
        nameSlot={
          isService ? (
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {item.presaleKind === "used" ? (
                <span className="inline-flex shrink-0 items-center rounded-full bg-[var(--jm-success-bg)] px-2 py-0.5 text-jm-3xs font-semibold text-[var(--jm-success-fg)]">
                  중고 선판매
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center rounded-full bg-[var(--jm-surface-muted)] px-2 py-0.5 text-jm-3xs font-semibold text-[var(--jm-text-muted)]">
                  기술료
                </span>
              )}
              <JmInput
                size="sm"
                value={item.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                placeholder={
                  item.presaleKind === "used" ? "중고 품명 (예: 센다이 엔진)" : "기술료 항목명"
                }
              />
            </div>
          ) : undefined
        }
        headerBelow={
          /* 옵션 스냅샷 + 분할 배송 배지 */
          !isService && (optionSummary || later) ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              {optionSummary && (
                <span className="line-clamp-1 text-jm-3xs text-[var(--jm-text-muted)]">
                  {optionSummary}
                </span>
              )}
              {later && (
                <span className="inline-flex shrink-0 items-center rounded-full bg-[var(--jm-warning-bg)] px-1.5 py-0 text-jm-4xs font-semibold text-[var(--jm-warning-fg)]">
                  택배 나중 배송
                </span>
              )}
            </div>
          ) : undefined
        }
        onDelete={onRemove}
        unitPriceLabel="단가 (VAT 포함)"
        unitPrice={`₩${unitGross.toLocaleString("ko-KR")}`}
        onUnitPriceClick={onEditPrice}
        quantity={{
          value: item.quantity,
          onChange: (v) => onUpdate({ quantity: v }),
          min: isBulk ? 0.0001 : 1,
          step: isBulk ? 0.5 : 1,
          decimal: isBulk,
        }}
        total={`₩${lineGross.toLocaleString("ko-KR")}`}
      >
        {/* 라인 할인 안내 — 견적서 로드 등 비-제로 할인이 적용됐을 때 노출 */}
        {discountPerUnit > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-[var(--jm-surface-muted)] px-2.5 py-1.5 text-jm-2xs">
            <span className="text-[var(--jm-text-muted)]">
              할인 {item.discount.endsWith("%") ? `(${item.discount})` : ""}
            </span>
            <span className="font-semibold tabular-nums text-[var(--jm-text)]">
              −₩
              {Math.round(
                (taxFree ? discountPerUnit : discountPerUnit * 1.1) * item.quantity,
              ).toLocaleString("ko-KR")}
            </span>
          </div>
        )}

        {/* 옵션 — 상품 라인만 */}
        {!isService && item.productId && (
          <OrderItemOptionsCard
            productId={item.productId}
            selectedIds={item.optionValueIds ?? []}
            onChange={(ids) => onUpdate({ optionValueIds: ids })}
          />
        )}

        {/* 분할 출고 — 상품 라인만. "나중 배송" 표시 시 택배 백오더(B)로 분리 등록 */}
        {!isService && item.productId && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-jm-3xs font-medium text-[var(--jm-text-muted)]">
              출고 시점
            </span>
            <JmSegmentedControl
              size="sm"
              ariaLabel="출고 시점"
              value={later ? "later" : "now"}
              onChange={(v) => {
                if ((v === "later") !== later) onToggleLater();
              }}
              options={[
                { value: "now", label: "지금 받기" },
                { value: "later", label: "나중 배송" },
              ]}
            />
          </div>
        )}
      </PosLineItemRow>
    </div>
  );
}
