"use client";

import React, { Suspense, useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { cn, formatComma, parseComma, formatCommaDecimal, parseCommaDecimal, normalizeDiscountInput, formatDiscountDisplay } from "@/lib/utils";
import { focusCaretEnd } from "@/jm/lib/focus";

import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTheme } from "next-themes";
import {
  JmBadge,
  JmButton,
  JmCheckbox,
  JmDateRangePicker,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmDrawer,
  JmDrawerContent,
  JmDrawerDescription,
  JmDrawerHeader,
  JmDrawerTitle,
  JmInput,
  JmScope,
  JmScrollArea,
  JmSegmentedControl,
  JmSkeleton,
  JmTooltip,
  JmTooltipProvider,
} from "@/jm";

import {
  Plus, Check, X, Trash2, FileText, PanelLeftClose, PanelLeftOpen, SlidersHorizontal, Search,
  Loader2, Pencil, Info,
} from "lucide-react";
import { startOfMonth, endOfMonth, startOfDay, subMonths } from "date-fns";
import { toast } from "sonner";
import { QuickSupplierSheet } from "@/components/quick-register-sheets";
import type { Supplier, SupplierProduct, Incoming, IncomingDetail, IncomingItemForm } from "./_types";
import {
  calcDiscountPerUnit,
  statusLabels,
  statusJmVariants,
  shippingToSupply,
  shippingToTotal,
} from "./_helpers";
import { DateInput, InlineCellProductSearch, ItemShippingPopover } from "./_parts";
import { computeShippingPerUnitDisplay } from "@/lib/incoming-shipping";
import { SupplierCombobox } from "@/components/supplier-combobox";


export default function IncomingPage() {
  return (
    <Suspense fallback={null}>
      <IncomingPageInner />
    </Suspense>
  );
}

function IncomingPageInner() {
  const searchParams = useSearchParams();
  const incomingIdParam = searchParams.get("incomingId");
  const purchaseOrderIdParam = searchParams.get("purchaseOrderId");
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  // 현재 등록 시트가 발주 기반인지 — 입고 등록 후 비워짐
  const [linkedPurchaseOrderId, setLinkedPurchaseOrderId] = useState<string | null>(null);

  // 등록 시트
  const [panelOpen, setPanelOpen] = useState(true);
  const [viewMode, setViewMode] = useState<"items" | "statements">("statements");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>(Object.keys(statusLabels));
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<string | null>(null);

  // 기간 필터 (기본: 이번달)
  const now = useMemo(() => new Date(), []);
  const [from, setFrom] = useState<Date | undefined>(startOfMonth(now));
  const [to, setTo] = useState<Date | undefined>(endOfMonth(now));

  const applyPreset = (preset: "thisMonth" | "lastMonth" | "last3" | "all") => {
    if (preset === "thisMonth") {
      setFrom(startOfMonth(now));
      setTo(endOfMonth(now));
    } else if (preset === "lastMonth") {
      const last = subMonths(now, 1);
      setFrom(startOfMonth(last));
      setTo(endOfMonth(last));
    } else if (preset === "last3") {
      setFrom(startOfDay(subMonths(now, 3)));
      setTo(endOfMonth(now));
    } else {
      setFrom(undefined);
      setTo(undefined);
    }
  };

  const currentPresetLabel = (() => {
    if (!from && !to) return "전체";
    if (from && to) {
      const thisF = startOfMonth(now).getTime();
      const thisT = endOfMonth(now).getTime();
      if (from.getTime() === thisF && to.getTime() === thisT) return "이번달";
      const last = subMonths(now, 1);
      if (from.getTime() === startOfMonth(last).getTime() && to.getTime() === endOfMonth(last).getTime())
        return "지난달";
      if (from.getTime() === startOfDay(subMonths(now, 3)).getTime() && to.getTime() === endOfMonth(now).getTime())
        return "최근3개월";
    }
    return "커스텀";
  })();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [selectedSupplierName, setSelectedSupplierName] = useState("");
  const [incomingDate, setIncomingDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [unitPriceVatIncluded, setUnitPriceVatIncluded] = useState(false);
  const [vatInputBuffer, setVatInputBuffer] = useState<{ idx: number; text: string } | null>(null);
  // VAT포함 입력 원본 보관 (round-trip 오차 방지: 50,000 입력 → 45,455 저장 → 50,000.5×반올림 = 50,001 노출되는 문제)
  const [vatRawByIdx, setVatRawByIdx] = useState<Record<number, string>>({});
  const [memo, setMemo] = useState("");
  const [shippingCost, setShippingCost] = useState("");
  const [shippingSupply, setShippingSupply] = useState("");
  const [shippingIsTaxable, setShippingIsTaxable] = useState(true);
  const [shippingDeducted, setShippingDeducted] = useState(false);
  const [items, setItems] = useState<IncomingItemForm[]>([]);

  // 현재 시트에서 입력된 신규 상품 목록 (다른 행 콤보박스에서 재사용 가능)
  const pendingNewProducts = items
    .map((item, idx) => item.isNew && item.supplierProductName
      ? { name: item.supplierProductName, spec: item.spec || "", supplierCode: item.supplierCode || "", rowIndex: idx }
      : null)
    .filter((x): x is { name: string; spec: string; supplierCode: string; rowIndex: number } => x !== null);

  // 거래처 빠른 등록 Sheet
  const [quickSupplierOpen, setQuickSupplierOpen] = useState(false);
  const [quickSupplierName, setQuickSupplierName] = useState("");




  // 상세 시트
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [unconfirmDialogOpen, setUnconfirmDialogOpen] = useState(false);

  // 택배비 후기입
  const [shippingEditOpen, setShippingEditOpen] = useState(false);
  const [shippingEditCost, setShippingEditCost] = useState("");
  const [shippingEditSupply, setShippingEditSupply] = useState("");
  const [shippingEditIsTaxable, setShippingEditIsTaxable] = useState(true);
  const [shippingEditDeducted, setShippingEditDeducted] = useState(false);
  // 후기입 다이얼로그의 품목별 운임 override (key=IncomingItem.id)
  const [shippingEditItemOverrides, setShippingEditItemOverrides] = useState<
    Record<string, { value: string; taxable: boolean }>
  >({});

  const suppliersQuery = useQuery({
    queryKey: queryKeys.suppliers.list(),
    queryFn: () => apiGet<Supplier[]>("/api/suppliers"),
  });
  const suppliers = suppliersQuery.data ?? [];

  const supplierProductsQuery = useQuery({
    queryKey: queryKeys.supplierProducts.list({ supplierId: selectedSupplierId }),
    queryFn: () =>
      apiGet<Array<SupplierProduct & { productMappings?: { id: string }[] }>>(
        `/api/supplier-products?supplierId=${selectedSupplierId}`,
      ),
    enabled: !!selectedSupplierId,
  });
  const supplierProducts: SupplierProduct[] = (supplierProductsQuery.data ?? []).map(
    (sp) => ({
      ...sp,
      hasMapping: (sp.productMappings?.length ?? 0) > 0,
    }),
  );

  const detailQuery = useQuery({
    queryKey: queryKeys.incoming.detail(detailId ?? ""),
    queryFn: () => apiGet<IncomingDetail>(`/api/incoming/${detailId}`),
    enabled: !!detailId,
  });
  const detail = detailQuery.data ?? null;
  const detailLoading = detailQuery.isFetching;

  const incomingsQuery = useQuery({
    queryKey: queryKeys.incoming.list({
      from: from?.toISOString(),
      to: to?.toISOString(),
    }),
    queryFn: () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from.toISOString());
      if (to) {
        const toInclusive = new Date(to);
        toInclusive.setDate(toInclusive.getDate() + 1);
        params.set("to", toInclusive.toISOString());
      }
      const qs = params.toString();
      return apiGet<Incoming[]>(`/api/incoming${qs ? `?${qs}` : ""}`);
    },
  });

  const incomings = incomingsQuery.data ?? [];
  const loading = incomingsQuery.isPending;

  // ─── 거래처 관련 ───
  const handleSupplierChange = (supplierId: string, name: string) => {
    setSelectedSupplierId(supplierId);
    setSelectedSupplierName(name);
    setItems([{
      supplierProductId: "", supplierProductName: "", supplierCode: "", spec: "",
      unitOfMeasure: "EA", quantity: "", unitPrice: "", supplyAmount: "", discount: "", originalPrice: "", memo: "",
      itemShippingCost: "", itemShippingIsTaxable: true,
    }]);
  };

  const handleCreateSupplier = (name: string) => {
    setQuickSupplierName(name);
    setQuickSupplierOpen(true);
  };

  const handleQuickSupplierCreated = async (supplier: { id: string; name: string }) => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });
    handleSupplierChange(supplier.id, supplier.name);
  };

  // ─── 공급자 상품 관련 ───
  const addEmptyRow = () => {
    setItems(prev => [...prev, {
      supplierProductId: "",
      supplierProductName: "",
      supplierCode: "",
      spec: "",
      unitOfMeasure: "EA",
      quantity: "",
      unitPrice: "",
      supplyAmount: "",
      discount: "",
      originalPrice: "",
      memo: "",
      itemShippingCost: "",
      itemShippingIsTaxable: true,
    }]);
  };

  const selectProductForRow = (index: number, sp: SupplierProduct) => {
    setItems(prev => {
      const updated = [...prev];
      const existing = updated[index];
      // 이미 다른 공급상품이 선택돼 있던 행에서 교체하는 경우 — 가격/할인/공급가액은
      // 새 상품 기준으로 리셋 (이전 상품 단가가 잔류하면 안 됨).
      const isSwap = !!existing.supplierProductId && existing.supplierProductId !== sp.id;
      // 빈 행에 처음 선택하는 경우 — 사용자가 손으로 입력한 값이 있으면 보존.
      const hasData = existing.quantity || existing.unitPrice || existing.supplyAmount;
      updated[index] = {
        ...existing,
        supplierProductId: sp.id,
        supplierProductName: sp.name,
        supplierCode: sp.supplierCode || "",
        spec: sp.spec || "",
        unitOfMeasure: sp.unitOfMeasure,
        originalPrice: sp.unitPrice,
        // 비교 기준 — 이 공급상품의 직전 입고가(마스터 단가). 입력 단가와 비교해 상승/하락 표시.
        prevUnitPrice: sp.unitPrice,
        isNew: undefined,
        pendingSourceRow: undefined,
        ...(isSwap
          ? { unitPrice: sp.unitPrice, discount: "", supplyAmount: "" }
          : hasData
            ? {}
            : { unitPrice: sp.unitPrice }),
      };
      return updated;
    });
    // 수량 셀로 포커스 이동
    setTimeout(() => {
      const el = document.querySelector(`[data-row="${index}"][data-field="quantity"]`) as HTMLInputElement;
      el?.focus();
      el?.select();
    }, 50);
  };

  // 신규 상품 — 모달 없이 행에 직접 채움
  const handleCreateNewInline = (index: number, name: string) => {
    setItems(prev => {
      const updated = [...prev];
      const existing = updated[index];
      // 이미 값이 입력된 행이면 품명만 변경, 빈 행이면 초기화
      const hasData = existing.quantity || existing.unitPrice || existing.supplyAmount;
      updated[index] = {
        ...existing,
        supplierProductId: "",
        supplierProductName: name,
        supplierCode: "",
        isNew: true,
        pendingSourceRow: undefined,
        ...(hasData ? {} : { spec: "", unitOfMeasure: "EA", quantity: "", unitPrice: "", supplyAmount: "", discount: "", originalPrice: "", memo: "" }),
      };
      return updated;
    });
    // 수량 셀로 포커스
    setTimeout(() => {
      const el = document.querySelector(`[data-row="${index}"][data-field="quantity"]`) as HTMLInputElement;
      el?.focus();
      el?.select();
    }, 50);
  };

  // 다른 행에서 입력된 신규 상품 재사용
  const handleSelectPending = (index: number, pending: { name: string; spec: string; supplierCode: string; rowIndex: number }) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = {
        supplierProductId: "", supplierProductName: pending.name,
        supplierCode: pending.supplierCode, spec: pending.spec,
        unitOfMeasure: "EA", quantity: "", unitPrice: "",
        supplyAmount: "", discount: "", originalPrice: "", memo: "",
        itemShippingCost: "", itemShippingIsTaxable: true,
        isNew: true,
        pendingSourceRow: pending.rowIndex,
      };
      return updated;
    });
    setTimeout(() => {
      const el = document.querySelector(`[data-row="${index}"][data-field="unitPrice"]`) as HTMLInputElement;
      el?.focus(); el?.select();
    }, 50);
  };

  // ─── 품목 편집 ───
  const updateItem = (index: number, field: keyof IncomingItemForm, value: string) => {
    const updated = [...items];
    const next = { ...updated[index], [field]: value };
    // 재사용으로 들어온 행이 원본과 다른 값으로 수정되면 분리 표시
    if (
      next.pendingSourceRow !== undefined &&
      (field === "supplierProductName" || field === "spec" || field === "supplierCode")
    ) {
      const source = updated[next.pendingSourceRow];
      if (
        !source ||
        source.supplierProductName !== next.supplierProductName ||
        source.spec !== next.spec ||
        source.supplierCode !== next.supplierCode
      ) {
        next.pendingSourceRow = undefined;
      }
    }
    updated[index] = next;
    setItems(updated);
  };

  // 단가/공급가액/수량 입력 완료(blur) 시 상호 계산
  const recalcOnBlur = (index: number, field: string, vatRawOverride?: string) => {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index] };
      const qty = parseFloat(item.quantity || "0");
      const up = parseFloat(item.unitPrice || "0");

      if (field === "unitPrice" || field === "quantity" || field === "discount") {
        const disc = calcDiscountPerUnit(up, item.discount);
        // VAT포함 입력 원본이 있으면 그 값 기준으로 공급가액 산출 (단가 반올림 round-trip 오차 방지)
        const rawStr = vatRawOverride !== undefined
          ? vatRawOverride
          : (unitPriceVatIncluded ? vatRawByIdx[index] : undefined);
        const raw = parseFloat(rawStr || "0");
        let supply: number;
        if (raw > 0 && qty > 0) {
          // VAT포함 합계 / 1.1 - 개당할인 × 수량
          supply = Math.round((raw * qty) / 1.1) - disc * qty;
        } else {
          const actual = up - disc;
          supply = actual * qty;
        }
        item.supplyAmount = supply > 0 ? String(supply) : "";
      }
      if (field === "supplyAmount") {
        // 실제단가 = 공급가액 / 수량, 단가는 할인 역산
        const supply = parseFloat(item.supplyAmount || "0");
        const q = qty > 0 ? qty : 1;
        if (supply > 0) {
          const actual = Math.round(supply / q);
          // 할인이 없으면 단가 = 실제단가
          const disc = calcDiscountPerUnit(up, item.discount);
          item.unitPrice = disc > 0 ? String(actual + disc) : String(actual);
          if (!item.quantity) item.quantity = "1";
        }
      }

      updated[index] = item;
      return updated;
    });
  };

  const updateItemTaxable = (index: number, value: boolean) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], itemShippingIsTaxable: value };
      return updated;
    });
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const validItems = items.filter((i) => i.supplierProductId || i.isNew);
  // 할인 합계 (단가 기준 할인 × 수량)
  const totalDiscount = validItems.reduce((sum, i) => {
    const qty = parseFloat(i.quantity || "0");
    const up = parseFloat(i.unitPrice || "0");
    return sum + calcDiscountPerUnit(up, i.discount) * qty;
  }, 0);
  // 공급가액 합계 = 실제단가 × 수량
  const supplyAmount = validItems.reduce((sum, i) => {
    const qty = parseFloat(i.quantity || "0");
    const up = parseFloat(i.unitPrice || "0");
    if (i.supplyAmount) return sum + parseFloat(i.supplyAmount);
    const actualUp = up - calcDiscountPerUnit(up, i.discount);
    return sum + actualUp * qty;
  }, 0);
  // 세액 합계 = 공급가액 × 10%
  const taxAmount = Math.round(supplyAmount * 0.1);

  // ─── 시트 열기 ───
  const openCreateSheet = () => {
    setSelectedSupplierId("");
    setSelectedSupplierName("");
    setItems([{
      supplierProductId: "", supplierProductName: "", supplierCode: "", spec: "",
      unitOfMeasure: "EA", quantity: "", unitPrice: "", supplyAmount: "", discount: "", originalPrice: "", memo: "",
      itemShippingCost: "", itemShippingIsTaxable: true,
    }]);
    setIncomingDate(new Date().toISOString().split("T")[0]);
    setUnitPriceVatIncluded(false);
    setVatInputBuffer(null);
    setVatRawByIdx({});
    setMemo("");
    setShippingCost("");
    setShippingSupply("");
    setShippingIsTaxable(true);
    setShippingDeducted(false);
    setCreateOpen(true);
  };

  const openEditSheet = (incoming: IncomingDetail) => {
    setSelectedSupplierId(incoming.supplier.id);
    setSelectedSupplierName(incoming.supplier.name);
    setIncomingDate(new Date(incoming.incomingDate).toISOString().split("T")[0]);
    setUnitPriceVatIncluded(false);
    setVatInputBuffer(null);
    setVatRawByIdx({});
    setMemo(incoming.memo ?? "");
    {
      const total = incoming.shippingCost ? String(parseFloat(incoming.shippingCost)) : "";
      setShippingCost(total);
      setShippingSupply(shippingToSupply(total, incoming.shippingIsTaxable));
    }
    setShippingIsTaxable(incoming.shippingIsTaxable);
    setShippingDeducted(incoming.shippingDeducted);
    setItems(incoming.items.map((item) => {
      const beforeDiscount = item.originalPrice ?? item.unitPrice;
      const discAmt = item.discountAmount ? parseFloat(item.discountAmount) : 0;
      return {
        supplierProductId: item.supplierProduct.id,
        supplierProductName: item.supplierProduct.name,
        supplierCode: item.supplierProduct.supplierCode ?? "",
        spec: "",
        unitOfMeasure: item.supplierProduct.unitOfMeasure,
        quantity: String(parseFloat(item.quantity)),
        unitPrice: String(parseFloat(beforeDiscount)),
        supplyAmount: item.totalPrice,
        discount: discAmt > 0 ? String(discAmt) : "",
        originalPrice: beforeDiscount,
        memo: item.memo ?? "",
        itemShippingCost: item.itemShippingCost != null && item.itemShippingCost !== ""
          ? String(parseFloat(item.itemShippingCost))
          : "",
        itemShippingIsTaxable: item.itemShippingIsTaxable ?? true,
      };
    }));
    setEditingId(incoming.id);
    setCreateOpen(true);
  };

  // ─── 제출 ───
  const handleCreate = async () => {
    if (!selectedSupplierId) { toast.error("거래처를 선택해주세요"); return; }
    const validItems = items.filter((i) => i.supplierProductId || i.isNew);
    if (validItems.length === 0) { toast.error("입고 항목을 추가해주세요"); return; }
    const emptyRowCount = items.length - validItems.length;
    if (emptyRowCount > 0) {
      toast.error(`비어있는 행 ${emptyRowCount}개가 있습니다. 삭제하거나 채워주세요.`);
      return;
    }

    submitMutation.mutate({ validItems });
  };

  const submitMutation = useMutation({
    mutationFn: async ({ validItems }: { validItems: IncomingItemForm[] }) => {
      // 1) isNew 항목 → 같은 (name, spec, supplierCode)끼리 1건만 등록 (10+1 중복 방지)
      const newProductCache = new Map<string, string>();
      for (const item of validItems) {
        if (!item.isNew) continue;
        const key = `${item.supplierProductName}||${item.spec || ""}||${item.supplierCode || ""}`;
        if (newProductCache.has(key)) continue;
        const up = parseFloat(item.unitPrice || "0");
        const discPerUnit = calcDiscountPerUnit(up, item.discount);
        try {
          const created = await apiMutate<{ id: string }>(
            "/api/supplier-products",
            "POST",
            {
              supplierId: selectedSupplierId,
              name: item.supplierProductName,
              spec: item.spec || undefined,
              supplierCode: item.supplierCode || undefined,
              unitPrice: String(up - discPerUnit),
              unitOfMeasure: item.unitOfMeasure,
            }
          );
          newProductCache.set(key, created.id);
        } catch {
          throw new ApiError(`"${item.supplierProductName}" 상품 등록에 실패했습니다`, 500);
        }
      }

      const resolvedItems = validItems.map((item) => {
        const up = parseFloat(item.unitPrice || "0");
        const qty = parseFloat(item.quantity || "0");
        const discPerUnit = calcDiscountPerUnit(up, item.discount);
        const actualUnit = up - discPerUnit;
        const actualPrice = String(actualUnit);
        const key = `${item.supplierProductName}||${item.spec || ""}||${item.supplierCode || ""}`;
        // VAT포함 입력 시 폼이 round(VAT × qty / 1.1) 로 계산해 둔 supplyAmount 를 그대로 보낸다.
        // 그러지 않으면 API가 qty × round(VAT/1.1) 로 1원씩 잃는다.
        const totalPrice = item.supplyAmount && parseFloat(item.supplyAmount) > 0
          ? item.supplyAmount
          : String(actualUnit * qty);
        return {
          supplierProductId: item.isNew ? newProductCache.get(key)! : item.supplierProductId,
          quantity: item.quantity,
          unitPrice: actualPrice,
          totalPrice,
          originalPrice: item.unitPrice,
          discountAmount: String(discPerUnit),
          itemShippingCost: item.itemShippingCost.trim() === "" ? null : item.itemShippingCost,
          itemShippingIsTaxable: item.itemShippingIsTaxable,
          purchaseOrderItemId: item.purchaseOrderItemId || undefined,
        };
      });

      const payload = {
        supplierId: selectedSupplierId,
        incomingDate,
        memo,
        shippingCost: shippingCost || undefined,
        shippingIsTaxable,
        shippingDeducted,
        items: resolvedItems,
        purchaseOrderId: linkedPurchaseOrderId || undefined,
      };

      return editingId
        ? await apiMutate(`/api/incoming/${editingId}`, "PUT", payload)
        : await apiMutate("/api/incoming", "POST", payload);
    },
    onSuccess: () => {
      const wasEditing = editingId;
      toast.success(wasEditing ? "입고가 수정되었습니다" : "입고가 등록되었습니다");
      setCreateOpen(false);
      setEditingId(null);
      setLinkedPurchaseOrderId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.incoming.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.supplierProducts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      if (wasEditing) openDetail(wasEditing);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : editingId ? "수정에 실패했습니다" : "등록에 실패했습니다");
    },
  });

  // ─── 상세/확인/취소/삭제 ───
  const openDetail = useCallback((id: string) => {
    setDetailId(id);
  }, []);

  // 딥링크: ?incomingId= 쿼리가 있으면 자동으로 상세 Sheet 열기
  useEffect(() => {
    if (incomingIdParam) {
      openDetail(incomingIdParam);
    }
  }, [incomingIdParam, openDetail]);

  // 딥링크: ?purchaseOrderId= 쿼리가 있으면 발주 데이터로 등록 Sheet 자동 열기
  useEffect(() => {
    if (!purchaseOrderIdParam) return;
    let cancelled = false;
    (async () => {
      try {
        const po = await apiGet<{
          id: string;
          supplier: { id: string; name: string };
          items: Array<{
            id: string;
            quantity: string;
            receivedQty: string;
            // PENDING 입고로 이미 등록된 양 — 잔량 계산 시 차감해 이중 입고 방지
            pendingQty: number;
            unitPrice: string;
            supplierProduct: {
              id: string;
              name: string;
              spec: string | null;
              supplierCode: string | null;
              unitOfMeasure: string;
            };
          }>;
        }>(`/api/purchase-orders/${purchaseOrderIdParam}`);
        if (cancelled) return;
        // 잔량 = 발주수량 - 확정입고 - 진행중 입고(PENDING)
        const remainingItems = po.items
          .map((it) => {
            const remain = Math.max(
              0,
              parseFloat(it.quantity) - parseFloat(it.receivedQty) - (it.pendingQty ?? 0)
            );
            return { it, remain };
          })
          .filter(({ remain }) => remain > 0);

        if (remainingItems.length === 0) {
          toast.info("이 발주서는 잔량이 없어 추가 입고할 수 없습니다 (진행 중인 입고 포함)");
          return;
        }

        setSelectedSupplierId(po.supplier.id);
        setSelectedSupplierName(po.supplier.name);
        setIncomingDate(new Date().toISOString().split("T")[0]);
        setUnitPriceVatIncluded(false);
        setVatInputBuffer(null);
        setVatRawByIdx({});
        setMemo("");
        setShippingCost("");
        setShippingSupply("");
        setShippingIsTaxable(true);
        setShippingDeducted(false);
        setItems(
          remainingItems.map(({ it, remain }) => ({
            supplierProductId: it.supplierProduct.id,
            supplierProductName: it.supplierProduct.name,
            supplierCode: it.supplierProduct.supplierCode ?? "",
            spec: it.supplierProduct.spec ?? "",
            unitOfMeasure: it.supplierProduct.unitOfMeasure,
            quantity: String(remain),
            unitPrice: String(parseFloat(it.unitPrice)),
            supplyAmount: String(remain * parseFloat(it.unitPrice)),
            discount: "",
            originalPrice: String(parseFloat(it.unitPrice)),
            memo: "",
            itemShippingCost: "",
            itemShippingIsTaxable: true,
            purchaseOrderItemId: it.id,
          }))
        );
        setLinkedPurchaseOrderId(po.id);
        setEditingId(null);
        setCreateOpen(true);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "발주서를 불러오지 못했습니다");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [purchaseOrderIdParam]);

  const confirmMutation = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/incoming/${id}`, "PUT", { action: "confirm" }),
    onSuccess: () => {
      toast.success("입고가 확인되었습니다. 재고가 반영되었습니다.");
      setConfirmDialogOpen(false);
      setDetailId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.incoming.all });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "확인 실패"),
  });
  const handleConfirm = (id: string) => confirmMutation.mutate(id);
  const confirming = confirmMutation.isPending;

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/incoming/${id}`, "PUT", { action: "cancel" }),
    onSuccess: () => {
      toast.success("입고가 취소되었습니다");
      setCancelDialogOpen(false);
      setDetailId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.incoming.all });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "취소 실패"),
  });
  const handleCancel = (id: string) => cancelMutation.mutate(id);
  const cancelling = cancelMutation.isPending;

  const unconfirmMutation = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/incoming/${id}`, "PUT", { action: "unconfirm" }),
    onSuccess: () => {
      toast.success("입고가 대기 상태로 되돌아갔습니다. 이제 품목을 수정할 수 있습니다.");
      setUnconfirmDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.incoming.all });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "확정 취소 실패"),
  });
  const handleUnconfirm = (id: string) => unconfirmMutation.mutate(id);
  const unconfirming = unconfirmMutation.isPending;

  const shippingEditMutation = useMutation({
    mutationFn: (vars: {
      id: string;
      cost: string;
      isTaxable: boolean;
      deducted: boolean;
      items: Array<{ id: string; itemShippingCost: string | null; itemShippingIsTaxable: boolean }>;
    }) =>
      apiMutate(`/api/incoming/${vars.id}`, "PUT", {
        action: "update-shipping",
        shippingCost: vars.cost || "0",
        shippingIsTaxable: vars.isTaxable,
        shippingDeducted: vars.deducted,
        items: vars.items,
      }),
    onSuccess: (_data, vars) => {
      setShippingEditOpen(false);
      toast.success("택배비가 저장되었습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.incoming.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.incoming.detail(vars.id) });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });
  const handleShippingEdit = () => {
    if (!detail) return;
    const items = detail.items.map((it) => {
      const ov = shippingEditItemOverrides[it.id];
      const value = (ov?.value ?? "").trim();
      return {
        id: it.id,
        itemShippingCost: value === "" ? null : value,
        itemShippingIsTaxable: ov?.taxable ?? it.itemShippingIsTaxable ?? true,
      };
    });
    shippingEditMutation.mutate({
      id: detail.id,
      cost: shippingEditCost,
      isTaxable: shippingEditIsTaxable,
      deducted: shippingEditDeducted,
      items,
    });
  };
  const shippingEditSaving = shippingEditMutation.isPending;

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/incoming/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("입고가 삭제되었습니다");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.incoming.all });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "삭제 실패"),
  });
  const handleDelete = (id: string) => deleteMutation.mutate(id);
  const deleting = deleteMutation.isPending;

  const formatPrice = (price: string | number) =>
    (typeof price === "string" ? parseFloat(price) : price).toLocaleString("ko-KR");

  const selectedId = detail?.id;

  return (
    <JmScope theme={resolvedTheme === "dark" ? "dark" : "light"} className="contents">
      <div className="flex h-full">
        {/* ─── 좌측 패널 ─── */}
        {panelOpen && (() => {
          const filtered = incomings.filter((inc) => {
            if (!statusFilter.includes(inc.status)) return false;
            if (searchQuery) {
              const q = searchQuery.toLowerCase();
              return inc.supplier.name.toLowerCase().includes(q) || inc.incomingNo.toLowerCase().includes(q);
            }
            return true;
          });

          // 품목별: 거래처 목록 집계
          const supplierMap = new Map<string, { name: string; count: number }>();
          filtered.forEach((inc) => {
            const existing = supplierMap.get(inc.supplier.name);
            if (existing) { existing.count += inc._count.items; }
            else { supplierMap.set(inc.supplier.name, { name: inc.supplier.name, count: inc._count.items }); }
          });
          const supplierList = Array.from(supplierMap.values());

          return (
            <div className="w-[300px] shrink-0 border-r border-[var(--jm-border)] flex flex-col bg-[var(--jm-surface)]">
              {/* 헤더 — 글로벌 사이드바/컨텐츠 헤더와 같은 h-12 통일 */}
              <div className="h-12 px-4 border-b border-[var(--jm-border)] flex items-center shrink-0">
                <h2 className="text-jm-sm font-semibold text-[var(--jm-text)]">입고 관리</h2>
              </div>

              {/* 입고 등록 */}
              <div className="px-3 pt-2 shrink-0">
                <JmButton variant="cta" size="sm" onClick={openCreateSheet} className="w-full">
                  <Plus className="size-4" /><span>입고 등록</span>
                </JmButton>
              </div>

              {/* 뷰 전환 — SegmentedControl */}
              <div className="px-3 py-2 shrink-0">
                <JmSegmentedControl
                  size="sm"
                  fullWidth
                  ariaLabel="뷰 전환"
                  value={viewMode}
                  onChange={(v) => {
                    setViewMode(v as "items" | "statements");
                    setDetailId(null);
                    setSelectedSupplierFilter(null);
                  }}
                  options={[
                    { value: "statements", label: "명세표별" },
                    { value: "items", label: "품목별" },
                  ]}
                />
              </div>

              {/* 기간 프리셋 */}
              <div className="px-3 flex flex-wrap gap-1 shrink-0">
                {(["thisMonth", "lastMonth", "last3", "all"] as const).map((p) => {
                  const labels = { thisMonth: "이번달", lastMonth: "지난달", last3: "최근3개월", all: "전체" };
                  const active = currentPresetLabel === labels[p];
                  return (
                    <button
                      key={p}
                      onClick={() => applyPreset(p)}
                      className={cn(
                        "px-2 h-6 rounded text-[11px] border transition-colors",
                        active
                          ? "bg-[var(--jm-surface-muted)] border-[var(--jm-border-strong)] text-[var(--jm-text)]"
                          : "border-[var(--jm-border)] text-[var(--jm-text-muted)] hover:text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)]"
                      )}
                    >
                      {labels[p]}
                    </button>
                  );
                })}
              </div>

              {/* 기간 선택 — JmDateRangePicker */}
              <div className="px-3 pt-2 pb-2 shrink-0">
                <JmDateRangePicker
                  size="sm"
                  value={{ from, to }}
                  onChange={(range) => {
                    setFrom(range?.from);
                    setTo(range?.to);
                  }}
                  placeholder="전체 기간"
                />
              </div>

              {/* 검색 + 필터 */}
              <div className="px-3 pb-2 flex items-center gap-2 shrink-0">
                <div className="flex-1 flex items-center gap-1.5 h-9 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] px-2.5">
                  <Search className="size-3.5 text-[var(--jm-text-muted)] shrink-0" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={viewMode === "items" ? "거래처, 품목 검색..." : "거래처, 입고번호 검색..."}
                    className="flex-1 bg-transparent text-jm-xs text-[var(--jm-text)] outline-none placeholder:text-[var(--jm-text-subtle)]"
                  />
                </div>
                <Popover>
                  <PopoverTrigger
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg border shrink-0 transition-colors",
                      statusFilter.length < Object.keys(statusLabels).length
                        ? "bg-[var(--jm-info-bg)] text-[var(--jm-info-fg)] border-[var(--jm-info-fg)]/30"
                        : "border-[var(--jm-border)] text-[var(--jm-text-muted)] hover:text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)]"
                    )}
                  >
                    <SlidersHorizontal className="size-3.5" />
                  </PopoverTrigger>
                  <PopoverContent
                    data-jm-scope
                    className="w-[180px] p-2 bg-[var(--jm-surface)] border-[var(--jm-border)]"
                    align="end"
                  >
                    <p className="text-jm-xs text-[var(--jm-text-muted)] mb-2 px-1">상태 필터</p>
                    {Object.entries(statusLabels).map(([key, label]) => {
                      const checked = statusFilter.includes(key);
                      return (
                        <label
                          key={key}
                          className={cn(
                            "flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-jm-xs cursor-pointer transition-colors",
                            checked ? "bg-[var(--jm-surface-muted)] text-[var(--jm-text)]" : "text-[var(--jm-text-muted)] hover:text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)]"
                          )}
                        >
                          <JmCheckbox
                            checked={checked}
                            onCheckedChange={() => setStatusFilter(prev => checked ? prev.filter((s) => s !== key) : [...prev, key])}
                          />
                          <JmBadge variant={statusJmVariants[key]} size="sm" shape="square">{label}</JmBadge>
                        </label>
                      );
                    })}
                    {statusFilter.length < Object.keys(statusLabels).length && (
                      <button className="w-full text-jm-xs text-[var(--jm-text-muted)] hover:text-[var(--jm-text)] mt-1.5 pt-1.5 border-t border-[var(--jm-border)]" onClick={() => setStatusFilter(Object.keys(statusLabels))}>
                        전체 선택
                      </button>
                    )}
                  </PopoverContent>
                </Popover>
              </div>

              {/* 목록 컨텐츠 */}
              <ScrollArea className="flex-1 min-h-0">
                {loading ? (
                  <>
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} className="px-3 py-2.5 border-b border-[var(--jm-border)]">
                        <div className="flex items-center justify-between">
                          <JmSkeleton className="h-4 w-28" />
                          <JmSkeleton className="h-3 w-8" />
                        </div>
                      </div>
                    ))}
                  </>
                ) : viewMode === "items" ? (
                  /* 품목별: 거래처 목록 */
                  <>
                    <div
                      onClick={() => setSelectedSupplierFilter(null)}
                      className={cn("px-3 py-2.5 border-b border-[var(--jm-border)] cursor-pointer transition-colors", selectedSupplierFilter === null ? "bg-[var(--jm-surface-muted)]" : "hover:bg-[var(--jm-surface-muted)]/60")}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-jm-sm text-[var(--jm-text)]">전체보기</span>
                        <span className="text-jm-xs text-[var(--jm-text-muted)] tabular-nums">{filtered.reduce((s, i) => s + i._count.items, 0)}건</span>
                      </div>
                    </div>
                    {supplierList.length === 0 ? (
                      <div className="text-center py-8 text-[var(--jm-text-muted)] text-jm-sm">입고 내역이 없습니다</div>
                    ) : (
                      supplierList.map((sup) => (
                        <div
                          key={sup.name}
                          onClick={() => setSelectedSupplierFilter(sup.name)}
                          className={cn("px-3 py-2.5 border-b border-[var(--jm-border)] cursor-pointer transition-colors", selectedSupplierFilter === sup.name ? "bg-[var(--jm-surface-muted)]" : "hover:bg-[var(--jm-surface-muted)]/60")}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-jm-sm text-[var(--jm-text)]">{sup.name}</span>
                            <span className="text-jm-xs text-[var(--jm-text-muted)] tabular-nums">{sup.count}건</span>
                          </div>
                        </div>
                      ))
                    )}
                  </>
                ) : (
                  /* 명세표별: 기존 입고건 목록 */
                  filtered.length === 0 ? (
                    <div className="text-center py-8 text-[var(--jm-text-muted)] text-jm-sm">
                      {incomings.length === 0 ? "입고 내역이 없습니다" : "검색 결과가 없습니다"}
                    </div>
                  ) : (
                    filtered.map((inc) => {
                      const supply = parseFloat(inc.totalAmount);
                      const tax = Math.round(supply * 0.1);
                      const total = supply + tax;
                      const isSelected = selectedId === inc.id;
                      return (
                        <div
                          key={inc.id}
                          onClick={() => openDetail(inc.id)}
                          className={cn("px-3 py-2.5 border-b border-[var(--jm-border)] cursor-pointer transition-colors", isSelected ? "bg-[var(--jm-surface-muted)]" : "hover:bg-[var(--jm-surface-muted)]/60")}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-jm-sm text-[var(--jm-text)]">{inc.supplier.name}</span>
                            <div className="flex items-center gap-1">
                              {inc.purchaseOrder && (
                                <JmBadge variant="info" size="sm" shape="square">발주분</JmBadge>
                              )}
                              {inc.supplierReturn && (
                                <JmBadge variant="accent" size="sm" shape="square">교환분</JmBadge>
                              )}
                              {inc.status === "CONFIRMED" && inc.paymentStatus === "PAID" && (
                                <JmBadge variant="success" size="sm" shape="square">결제완료</JmBadge>
                              )}
                              <JmBadge variant={statusJmVariants[inc.status]} size="sm" shape="square">{statusLabels[inc.status]}</JmBadge>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-jm-xs text-[var(--jm-text-muted)]">
                            <span>{new Date(inc.incomingDate).toLocaleDateString("ko-KR")}</span>
                            <span className="tabular-nums">{inc._count.items}건</span>
                          </div>
                          <div className="flex items-center justify-between text-jm-xs mt-0.5">
                            <span className="text-[var(--jm-text-muted)] font-[family-name:var(--jm-font-mono)]">{inc.incomingNo}</span>
                            <span className="tabular-nums text-[var(--jm-text)]">₩{formatPrice(total)}</span>
                          </div>
                        </div>
                      );
                    })
                  )
                )}
              </ScrollArea>
            </div>
          );
        })()}

        {/* ─── 우측 컨텐츠 ─── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* 상단 바 — 글로벌 사이드바/좌측 패널 헤더와 같은 h-12 통일 */}
          <div className="min-h-12 border-b border-[var(--jm-border)] px-4 flex items-center justify-between flex-wrap gap-x-3 gap-y-1 py-1 bg-[var(--jm-bg)] shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setPanelOpen(!panelOpen)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--jm-text-muted)] hover:text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)] transition-colors"
              >
                {panelOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
              </button>
              {viewMode === "statements" && detail && (
                <>
                  <span className="font-medium text-jm-sm truncate text-[var(--jm-text)]">{detail.incomingNo}</span>
                  <JmBadge variant={statusJmVariants[detail.status]} size="sm" shape="square" className="shrink-0">{statusLabels[detail.status]}</JmBadge>
                  {detail.status === "CONFIRMED" && detail.paymentStatus === "PAID" && (
                    <JmBadge variant="success" size="sm" shape="square" className="shrink-0">결제완료</JmBadge>
                  )}
                </>
              )}
              {viewMode === "items" && (
                <span className="text-jm-sm text-[var(--jm-text-muted)] truncate">
                  {selectedSupplierFilter ? `${selectedSupplierFilter} 입고 품목` : "전체 입고 품목"}
                </span>
              )}
            </div>
            {viewMode === "statements" && detail?.status === "PENDING" && (
              <div className="flex gap-2 flex-wrap">
                <JmButton size="sm" variant="ghost" onClick={() => openEditSheet(detail)}>
                  <Pencil className="size-4" /><span>수정</span>
                </JmButton>
                <JmButton size="sm" variant="danger" onClick={() => setCancelDialogOpen(true)}>
                  <X className="size-4" /><span>취소</span>
                </JmButton>
                <JmButton size="sm" variant="cta" onClick={() => setConfirmDialogOpen(true)}>
                  <Check className="size-4" /><span>입고 확인</span>
                </JmButton>
              </div>
            )}
            {viewMode === "statements" && detail?.status === "CONFIRMED" && (
              <div className="flex gap-2 flex-wrap">
                <JmButton
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const sc = parseFloat(detail.shippingCost) || 0;
                    const total = sc > 0 ? String(sc) : "";
                    setShippingEditCost(total);
                    setShippingEditSupply(shippingToSupply(total, detail.shippingIsTaxable));
                    setShippingEditIsTaxable(detail.shippingIsTaxable);
                    setShippingEditDeducted(detail.shippingDeducted);
                    const overrides: Record<string, { value: string; taxable: boolean }> = {};
                    for (const it of detail.items) {
                      const v = it.itemShippingCost != null && it.itemShippingCost !== ""
                        ? String(parseFloat(it.itemShippingCost))
                        : "";
                      overrides[it.id] = { value: v, taxable: it.itemShippingIsTaxable ?? true };
                    }
                    setShippingEditItemOverrides(overrides);
                    setShippingEditOpen(true);
                  }}
                >
                  <Pencil className="size-4" />
                  <span>{parseFloat(detail.shippingCost) > 0 ? "택배비 수정" : "택배비 추가"}</span>
                </JmButton>
                <JmButton size="sm" variant="ghost" onClick={() => setUnconfirmDialogOpen(true)}>
                  <X className="size-4" /><span>확정 취소</span>
                </JmButton>
              </div>
            )}
          </div>

          {viewMode === "items" ? (() => {
            // 품목별 뷰 — 날짜별 그룹핑
            const filteredDetails = incomings.filter((d) => {
              if (!statusFilter.includes(d.status)) return false;
              if (selectedSupplierFilter && d.supplier.name !== selectedSupplierFilter) return false;
              if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const matchSupplier = d.supplier.name.toLowerCase().includes(q);
                const matchItem = d.items.some((i) => i.supplierProduct.name.toLowerCase().includes(q));
                return matchSupplier || matchItem;
              }
              return true;
            });

            // 날짜별 그룹핑
            const dateGroups = new Map<string, Array<{ detail: Incoming; item: Incoming["items"][0] }>>();
            filteredDetails.forEach((d) => {
              const dateKey = new Date(d.incomingDate).toLocaleDateString("ko-KR");
              d.items.forEach((item) => {
                if (searchQuery) {
                  const q = searchQuery.toLowerCase();
                  if (!item.supplierProduct.name.toLowerCase().includes(q) && !d.supplier.name.toLowerCase().includes(q)) return;
                }
                const existing = dateGroups.get(dateKey) || [];
                existing.push({ detail: d, item });
                dateGroups.set(dateKey, existing);
              });
            });

            // 날짜 내림차순 정렬
            const sortedDates = Array.from(dateGroups.entries()).sort((a, b) => b[0].localeCompare(a[0]));

            return (
              <div className="flex-1 min-h-0 overflow-auto">
                {incomings.length === 0 && loading ? (
                  <table className="w-full min-w-[1000px] text-sm table-fixed">
                    <colgroup>
                      <col style={{ width: "12%" }} />
                      <col />
                      <col style={{ width: "8%" }} />
                      <col style={{ width: "50px" }} />
                      <col style={{ width: "70px" }} />
                      <col style={{ width: "100px" }} />
                      <col style={{ width: "80px" }} />
                      <col style={{ width: "100px" }} />
                      <col style={{ width: "110px" }} />
                      <col style={{ width: "90px" }} />
                      <col style={{ width: "80px" }} />
                      <col style={{ width: "70px" }} />
                    </colgroup>
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs">
                        <th className="border-r border-b border-[var(--jm-border)] py-1.5 px-2 text-left font-medium">거래처</th>
                        <th className="border-r border-b border-[var(--jm-border)] py-1.5 px-2 text-left font-medium">품명</th>
                        <th className="border-r border-b border-[var(--jm-border)] py-1.5 px-2 text-left font-medium">규격</th>
                        <th className="border-r border-b border-[var(--jm-border)] py-1.5 text-center font-medium">단위</th>
                        <th className="border-r border-b border-[var(--jm-border)] py-1.5 text-center font-medium">수량</th>
                        <th className="border-r border-b border-[var(--jm-border)] py-1.5 text-center font-medium">단가</th>
                        <th className="border-r border-b border-[var(--jm-border)] py-1.5 text-center font-medium">할인</th>
                        <th className="border-r border-b border-[var(--jm-border)] py-1.5 text-center font-medium">실제단가</th>
                        <th className="border-r border-b border-[var(--jm-border)] py-1.5 text-center font-medium">공급가액</th>
                        <th className="border-r border-b border-[var(--jm-border)] py-1.5 text-center font-medium">세액</th>
                        <th className="border-r border-b border-[var(--jm-border)] py-1.5 px-2 text-left font-medium">비고</th>
                        <th className="border-b border-[var(--jm-border)] py-1.5 text-center font-medium">매핑</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 3 }).map((_, gi) => (
                        <React.Fragment key={`sk-g-${gi}`}>
                          <tr className="bg-[var(--jm-surface)]">
                            <td colSpan={12} className="px-3 py-1.5 border-b border-[var(--jm-border)]">
                              <JmSkeleton className="h-3 w-24" />
                            </td>
                          </tr>
                          {Array.from({ length: 3 }).map((_, ri) => (
                            <tr key={`sk-${gi}-${ri}`} className="border-b border-[var(--jm-border)]">
                              <td className="border-r border-[var(--jm-border)] px-2 py-1.5"><JmSkeleton className="h-4 w-24" /></td>
                              <td className="border-r border-[var(--jm-border)] px-2 py-1.5"><JmSkeleton className="h-4 w-32" /></td>
                              <td className="border-r border-[var(--jm-border)] px-2 py-1.5"><JmSkeleton className="h-4 w-16" /></td>
                              <td className="border-r border-[var(--jm-border)] py-1.5"><JmSkeleton className="h-4 w-8 mx-auto" /></td>
                              <td className="border-r border-[var(--jm-border)] py-1.5"><JmSkeleton className="h-4 w-12 mx-auto" /></td>
                              <td className="border-r border-[var(--jm-border)] py-1.5"><JmSkeleton className="h-4 w-16 mx-auto" /></td>
                              <td className="border-r border-[var(--jm-border)] py-1.5"><JmSkeleton className="h-4 w-12 mx-auto" /></td>
                              <td className="border-r border-[var(--jm-border)] py-1.5"><JmSkeleton className="h-4 w-16 mx-auto" /></td>
                              <td className="border-r border-[var(--jm-border)] py-1.5"><JmSkeleton className="h-4 w-20 mx-auto" /></td>
                              <td className="border-r border-[var(--jm-border)] py-1.5"><JmSkeleton className="h-4 w-16 mx-auto" /></td>
                              <td className="border-r border-[var(--jm-border)] px-2 py-1.5"><JmSkeleton className="h-4 w-12" /></td>
                              <td className="py-1.5"><JmSkeleton className="h-5 w-12 rounded-md mx-auto" /></td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                ) : sortedDates.length === 0 ? (
                  <div className="text-center py-8 text-[var(--jm-text-muted)] text-sm">입고 내역이 없습니다</div>
                ) : (
                  <table className="w-full min-w-[1000px] text-sm table-fixed">
                    <colgroup>
                      <col style={{ width: "12%" }} />
                      <col />
                      <col style={{ width: "8%" }} />
                      <col style={{ width: "50px" }} />
                      <col style={{ width: "70px" }} />
                      <col style={{ width: "100px" }} />
                      <col style={{ width: "80px" }} />
                      <col style={{ width: "100px" }} />
                      <col style={{ width: "110px" }} />
                      <col style={{ width: "90px" }} />
                      <col style={{ width: "80px" }} />
                      <col style={{ width: "70px" }} />
                    </colgroup>
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs">
                        <th className="border-r border-b border-[var(--jm-border)] py-1.5 px-2 text-left font-medium">거래처</th>
                        <th className="border-r border-b border-[var(--jm-border)] py-1.5 px-2 text-left font-medium">품명</th>
                        <th className="border-r border-b border-[var(--jm-border)] py-1.5 px-2 text-left font-medium">규격</th>
                        <th className="border-r border-b border-[var(--jm-border)] py-1.5 text-center font-medium">단위</th>
                        <th className="border-r border-b border-[var(--jm-border)] py-1.5 text-center font-medium">수량</th>
                        <th className="border-r border-b border-[var(--jm-border)] py-1.5 text-center font-medium">단가</th>
                        <th className="border-r border-b border-[var(--jm-border)] py-1.5 text-center font-medium">할인</th>
                        <th className="border-r border-b border-[var(--jm-border)] py-1.5 text-center font-medium">실제단가</th>
                        <th className="border-r border-b border-[var(--jm-border)] py-1.5 text-center font-medium">공급가액</th>
                        <th className="border-r border-b border-[var(--jm-border)] py-1.5 text-center font-medium">세액</th>
                        <th className="border-r border-b border-[var(--jm-border)] py-1.5 px-2 text-left font-medium">비고</th>
                        <th className="border-b border-[var(--jm-border)] py-1.5 text-center font-medium">매핑</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedDates.map(([date, rows]) => (
                        <>
                          {/* 날짜 구분 행 */}
                          <tr key={`date-${date}`} className="bg-[var(--jm-surface)]">
                            <td colSpan={12} className="px-3 py-1.5 text-xs text-[var(--jm-text-muted)] font-medium border-b border-[var(--jm-border)]">
                              {date}
                            </td>
                          </tr>
                          {rows.map(({ detail: d, item }, ri) => {
                            const qty = parseFloat(item.quantity);
                            const up = parseFloat(item.unitPrice);
                            const discPerUnit = item.discountAmount ? parseFloat(item.discountAmount) : 0;
                            const origPrice = item.originalPrice ? parseFloat(item.originalPrice) : up + discPerUnit;
                            const supplyLine = up * qty;
                            const taxLine = Math.round(supplyLine * 0.1);
                            return (
                              <tr
                                key={`${d.id}-${item.id}-${ri}`}
                                className="border-b border-[var(--jm-border)] hover:bg-[var(--jm-surface-muted)]/60 cursor-pointer"
                                onClick={() => { setViewMode("statements"); openDetail(d.id); }}
                              >
                                <td className="border-r border-[var(--jm-border)] px-2 py-1.5 text-xs text-[var(--jm-text-muted)] truncate">{d.supplier.name}</td>
                                <td className="border-r border-[var(--jm-border)] px-2 py-1.5 truncate">
                                  <span className="font-medium">{item.supplierProduct.name}</span>
                                  {item.supplierProduct.supplierCode && <span className="ml-1 text-xs text-[var(--jm-text-muted)]">({item.supplierProduct.supplierCode})</span>}
                                </td>
                                <td className="border-r border-[var(--jm-border)] px-2 py-1.5 text-[var(--jm-text-muted)] truncate"></td>
                                <td className="border-r border-[var(--jm-border)] text-center text-[var(--jm-text-muted)] py-1.5">{item.supplierProduct.unitOfMeasure}</td>
                                <td className="border-r border-[var(--jm-border)] text-right px-2 py-1.5 tabular-nums">{qty.toLocaleString()}</td>
                                <td className="border-r border-[var(--jm-border)] text-right px-2 py-1.5 tabular-nums">{formatPrice(origPrice)}</td>
                                <td className="border-r border-[var(--jm-border)] text-right px-2 py-1.5 tabular-nums">{discPerUnit > 0 && <span className="text-[var(--jm-danger-fg)]">-{formatPrice(discPerUnit)}</span>}</td>
                                <td className="border-r border-[var(--jm-border)] text-right px-2 py-1.5 tabular-nums">{formatPrice(up)}</td>
                                <td className="border-r border-[var(--jm-border)] text-right px-2 py-1.5 tabular-nums">{formatPrice(supplyLine)}</td>
                                <td className="border-r border-[var(--jm-border)] text-right px-2 py-1.5 text-[var(--jm-text-muted)] tabular-nums">{formatPrice(taxLine)}</td>
                                <td className="border-r border-[var(--jm-border)] px-2 py-1.5 text-[var(--jm-text-muted)] truncate">{item.memo || ""}</td>
                                <td className="text-center py-1.5">
                                  {item.supplierProduct._count.productMappings > 0 ? (
                                    <span className="text-xs text-brand">&#10003;</span>
                                  ) : (
                                    <span className="text-xs text-yellow-400">&#9888;</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })() : detailLoading ? (
            <div className="flex-1 min-h-0 overflow-auto">
              <div className="px-6 py-4">
                <div className="border border-[var(--jm-border)] rounded-lg overflow-hidden">
                  {/* 거래처 + 입고 정보 헤더 */}
                  <div className="grid grid-cols-2 border-b border-[var(--jm-border)]">
                    <div className="border-r border-[var(--jm-border)]">
                      <div className="bg-[var(--jm-surface-muted)] px-3 py-1.5 border-b border-[var(--jm-border)]">
                        <JmSkeleton className="h-3 w-20" />
                      </div>
                      <div className="p-3 space-y-1.5">
                        <JmSkeleton className="h-5 w-32" />
                        <JmSkeleton className="h-3 w-12" />
                      </div>
                    </div>
                    <div>
                      <div className="bg-[var(--jm-surface-muted)] px-3 py-1.5 border-b border-[var(--jm-border)]">
                        <JmSkeleton className="h-3 w-16" />
                      </div>
                      <div className="p-3 space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <JmSkeleton className="h-3 w-12 shrink-0" />
                            <JmSkeleton className="h-4 w-32" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {/* 품목 테이블 */}
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[var(--jm-surface-muted)]">
                        {Array.from({ length: 12 }).map((_, i) => (
                          <th key={i} className="py-2 px-2 border-r border-b border-[var(--jm-border)] last:border-r-0">
                            <JmSkeleton className="h-3 w-full" />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 4 }).map((_, r) => (
                        <tr key={r} className="border-b border-[var(--jm-border)] last:border-b-0">
                          {Array.from({ length: 12 }).map((_, c) => (
                            <td key={c} className="py-1.5 px-2 border-r border-[var(--jm-border)] last:border-r-0">
                              <JmSkeleton className="h-4 w-full" />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : !detail ? (
            <div className="flex-1 flex items-center justify-center text-[var(--jm-text-muted)]">
              <div className="text-center">
                <FileText className="size-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">입고를 선택하면 상세 내용이 표시됩니다</p>
              </div>
            </div>
          ) : (
            <>
              {/* 거래명세표 상세 */}
              <div className="flex-1 min-h-0 overflow-auto">
                <div className="px-6 py-4">
                <div className="border border-[var(--jm-border)] rounded-lg overflow-hidden min-w-[1200px]">
                  <div className="grid grid-cols-2 border-b border-[var(--jm-border)]">
                    <div className="border-r border-[var(--jm-border)]">
                      <div className="bg-[var(--jm-surface-muted)] px-3 py-1.5 text-xs text-[var(--jm-text-muted)] font-medium border-b border-[var(--jm-border)]">공급자 (거래처)</div>
                      <div className="p-3">
                        <p className="text-base font-bold">{detail.supplier.name}</p>
                        <p className="text-xs text-[var(--jm-text-muted)] mt-0.5">{detail.supplier.paymentMethod === "CREDIT" ? "외상" : "선불"}</p>
                      </div>
                    </div>
                    <div>
                      <div className="bg-[var(--jm-surface-muted)] px-3 py-1.5 text-xs text-[var(--jm-text-muted)] font-medium border-b border-[var(--jm-border)]">입고 정보</div>
                      <div className="p-3 space-y-1.5 text-sm">
                        <div className="flex items-center gap-2"><span className="text-xs text-[var(--jm-text-muted)] w-14 shrink-0">입고번호</span><span>{detail.incomingNo}</span></div>
                        <div className="flex items-center gap-2"><span className="text-xs text-[var(--jm-text-muted)] w-14 shrink-0">입고일</span><span>{new Date(detail.incomingDate).toLocaleDateString("ko-KR")}</span></div>
                        <div className="flex items-center gap-2"><span className="text-xs text-[var(--jm-text-muted)] w-14 shrink-0">등록자</span><span>{detail.createdBy.name}</span></div>
                        {detail.memo && <div className="flex items-center gap-2"><span className="text-xs text-[var(--jm-text-muted)] w-14 shrink-0">비고</span><span>{detail.memo}</span></div>}
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const detailShippingMap = computeShippingPerUnitDisplay(
                      detail.items.map((i) => ({
                        id: i.id,
                        quantity: parseFloat(i.quantity),
                        totalPrice: parseFloat(i.totalPrice),
                        itemShippingCost: i.itemShippingCost == null || i.itemShippingCost === ""
                          ? null
                          : parseFloat(i.itemShippingCost),
                        itemShippingIsTaxable: i.itemShippingIsTaxable,
                      })),
                      {
                        shippingCost: parseFloat(detail.shippingCost) || 0,
                        shippingIsTaxable: detail.shippingIsTaxable,
                        shippingDeducted: detail.shippingDeducted,
                      }
                    );
                    const itemOverrideTotal = detail.items.reduce((sum, it) => {
                      const v = it.itemShippingCost == null || it.itemShippingCost === ""
                        ? 0
                        : parseFloat(it.itemShippingCost);
                      return sum + (v > 0 ? v : 0);
                    }, 0);
                    return (
                  <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs">
                        <th className="border-r border-b border-[var(--jm-border)] w-[36px] py-2 text-center font-medium">번호</th>
                        <th className="border-r border-b border-[var(--jm-border)] w-[130px] py-2 px-2 text-left font-medium">품번</th>
                        <th className="border-r border-b border-[var(--jm-border)] py-2 px-2 text-left font-medium" style={{ width: "20%" }}>품명</th>
                        <th className="border-r border-b border-[var(--jm-border)] py-2 px-2 text-left font-medium" style={{ width: "12%" }}>규격</th>
                        <th className="border-r border-b border-[var(--jm-border)] w-[56px] py-2 text-center font-medium">단위</th>
                        <th className="border-r border-b border-[var(--jm-border)] w-[80px] py-2 text-center font-medium">수량</th>
                        <th className="border-r border-b border-[var(--jm-border)] w-[110px] py-2 text-center font-medium">단가</th>
                        <th className="border-r border-b border-[var(--jm-border)] w-[90px] py-2 text-center font-medium">할인</th>
                        <th className="border-r border-b border-[var(--jm-border)] w-[110px] py-2 text-center font-medium">실제단가</th>
                        <th className="border-r border-b border-[var(--jm-border)] w-[120px] py-2 text-center font-medium">공급가액</th>
                        <th className="border-r border-b border-[var(--jm-border)] w-[100px] py-2 text-center font-medium">세액</th>
                        <th className="border-r border-b border-[var(--jm-border)] w-[140px] py-2 text-center font-medium">배송비(개당)</th>
                        <th className="border-r border-b border-[var(--jm-border)] w-[80px] py-2 px-2 text-center font-medium">비고</th>
                        <th className="border-b border-[var(--jm-border)] w-[60px] py-2 text-center font-medium">매핑</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => null)()}
                      {detail.items.map((item, idx) => {
                        const qty = parseFloat(item.quantity);
                        const up = parseFloat(item.unitPrice);
                        const discPerUnit = item.discountAmount ? parseFloat(item.discountAmount) : 0;
                        const origPrice = item.originalPrice ? parseFloat(item.originalPrice) : up + discPerUnit;
                        const supplyLine = up * qty;
                        const taxLine = Math.round(supplyLine * 0.1);
                        const shipDisplay = detailShippingMap.get(item.id);
                        return (
                          <tr key={item.id} className="border-b border-[var(--jm-border)] last:border-b-0 hover:bg-[var(--jm-surface-muted)]/60">
                            <td className="border-r border-[var(--jm-border)] text-center text-[var(--jm-text-muted)] py-1.5">{idx + 1}</td>
                            <td className="border-r border-[var(--jm-border)] px-2 py-1.5 text-[var(--jm-text-muted)] text-xs">{item.supplierProduct.supplierCode || ""}</td>
                            <td className="border-r border-[var(--jm-border)] px-2 py-1.5 font-medium">{item.supplierProduct.name}</td>
                            <td className="border-r border-[var(--jm-border)] px-2 py-1.5 text-[var(--jm-text-muted)]">{item.supplierProduct.spec || ""}</td>
                            <td className="border-r border-[var(--jm-border)] text-center text-[var(--jm-text-muted)] py-1.5">{item.supplierProduct.unitOfMeasure}</td>
                            <td className="border-r border-[var(--jm-border)] text-right px-2 py-1.5 tabular-nums">{qty.toLocaleString()}</td>
                            <td className="border-r border-[var(--jm-border)] text-right px-2 py-1.5 tabular-nums">{formatPrice(origPrice)}</td>
                            <td className="border-r border-[var(--jm-border)] text-right px-2 py-1.5 tabular-nums">{discPerUnit > 0 && <span className="text-[var(--jm-danger-fg)]">-{formatPrice(discPerUnit)}</span>}</td>
                            <td className="border-r border-[var(--jm-border)] text-right px-2 py-1.5 tabular-nums">{formatPrice(up)}</td>
                            <td className="border-r border-[var(--jm-border)] text-right px-2 py-1.5 tabular-nums">{formatPrice(supplyLine)}</td>
                            <td className="border-r border-[var(--jm-border)] text-right px-2 py-1.5 text-[var(--jm-text-muted)] tabular-nums">{formatPrice(taxLine)}</td>
                            <td className="border-r border-[var(--jm-border)] px-2 py-1.5 text-right tabular-nums">
                              {shipDisplay && shipDisplay.perUnit > 0 ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <span>₩{formatPrice(Math.round(shipDisplay.perUnit))}</span>
                                  <span
                                    className={`text-[10px] px-1 py-0.5 rounded ${
                                      shipDisplay.source === "ITEM"
                                        ? "bg-primary/10 text-primary"
                                        : shipDisplay.source === "ALLOCATED"
                                          ? "bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)]"
                                          : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                                    }`}
                                  >
                                    {shipDisplay.source === "ITEM"
                                      ? "직접"
                                      : shipDisplay.source === "ALLOCATED"
                                        ? "분배"
                                        : "차감"}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-[var(--jm-text-muted)]">
                                  {shipDisplay?.source === "DEDUCTED" ? "차감(0)" : "—"}
                                </span>
                              )}
                            </td>
                            <td className="border-r border-[var(--jm-border)] px-2 py-1.5 text-[var(--jm-text-muted)]">{item.memo || ""}</td>
                            <td className="text-center py-1.5">
                              {item.supplierProduct.productMappings && item.supplierProduct.productMappings.length > 0 ? (
                                <span className="text-xs text-brand">&#10003;</span>
                              ) : (
                                <span className="text-xs text-yellow-400">&#9888;</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {(() => {
                    const dSupply = detail.items.reduce((s, i) => s + parseFloat(i.quantity) * parseFloat(i.unitPrice), 0);
                    const dTax = Math.round(dSupply * 0.1);
                    const dDiscount = detail.items.reduce((s, i) => {
                      const discPerUnit = i.discountAmount ? parseFloat(i.discountAmount) : 0;
                      return s + discPerUnit * parseFloat(i.quantity);
                    }, 0);
                    return (
                      <div className="border-t border-[var(--jm-border)] bg-[var(--jm-surface-muted)]">
                        <div className="grid grid-cols-5 text-sm">
                          <div className="border-r border-[var(--jm-border)] px-3 py-2.5 flex items-center justify-between"><span className="text-xs text-[var(--jm-text-muted)]">품목수</span><span>{detail.items.length}건</span></div>
                          <div className="border-r border-[var(--jm-border)] px-3 py-2.5 flex items-center justify-between"><span className="text-xs text-[var(--jm-text-muted)]">공급가액</span><span className="tabular-nums">₩{formatPrice(dSupply)}</span></div>
                          <div className="border-r border-[var(--jm-border)] px-3 py-2.5 flex items-center justify-between"><span className="text-xs text-[var(--jm-text-muted)]">세액</span><span className="tabular-nums">{dTax > 0 ? `₩${formatPrice(dTax)}` : ""}</span></div>
                          <div className="border-r border-[var(--jm-border)] px-3 py-2.5 flex items-center justify-between"><span className="text-xs text-[var(--jm-text-muted)]">할인합계</span><span className={`tabular-nums ${dDiscount > 0 ? "text-[var(--jm-danger-fg)]" : ""}`}>{dDiscount > 0 ? `-₩${formatPrice(dDiscount)}` : ""}</span></div>
                          <div className="px-3 py-2.5 flex items-center justify-between"><span className="text-xs text-[var(--jm-text-muted)]">합계금액</span><span className="font-bold text-base tabular-nums">₩{formatPrice(dSupply + dTax)}</span></div>
                        </div>
                        {parseFloat(detail.shippingCost) > 0 && (
                          <div className="border-t border-[var(--jm-border)] px-3 py-2 flex items-center justify-between text-sm">
                            <span className="text-xs text-[var(--jm-text-muted)]">
                              택배비{detail.shippingIsTaxable ? " (과세)" : " (면세)"}
                              {detail.shippingDeducted && " · 차감"}
                            </span>
                            <span className="tabular-nums">₩{formatPrice(parseFloat(detail.shippingCost))}</span>
                          </div>
                        )}
                        {itemOverrideTotal > 0 && (
                          <div className="border-t border-[var(--jm-border)] px-3 py-2 flex items-center justify-between text-sm">
                            <span className="text-xs text-[var(--jm-text-muted)]">품목 직접 운임 합계 (분배 제외)</span>
                            <span className="tabular-nums">₩{formatPrice(itemOverrideTotal)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  </>
                  );
                  })()}
                </div>
                </div>
              </div>

              {/* 확인/취소 다이얼로그 */}
              <JmDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
                <JmDialogContent size="sm">
                  <JmDialogHeader><JmDialogTitle>입고 확인</JmDialogTitle></JmDialogHeader>
                  <JmDialogBody>
                    <p className="text-jm-sm text-[var(--jm-text-muted)]">입고를 확인하시겠습니까?<br />재고가 증가하고 원장에 기록됩니다.</p>
                    {(() => {
                      const unmappedItems = detail.items.filter(
                        (i) => !i.supplierProduct.productMappings || i.supplierProduct.productMappings.length === 0
                      );
                      const seenNames = new Set<string>();
                      const unmapped = unmappedItems.filter((i) => {
                        if (seenNames.has(i.supplierProduct.name)) return false;
                        seenNames.add(i.supplierProduct.name);
                        return true;
                      });
                      if (unmapped.length === 0) return null;
                      return (
                        <div className="mt-3 rounded-lg bg-[var(--jm-warning-bg)] border border-[var(--jm-warning-fg)]/30 px-3 py-2 text-jm-sm text-[var(--jm-warning-fg)]">
                          <p className="font-medium">미매핑 항목 {unmapped.length}건</p>
                          <p className="text-jm-xs mt-1 opacity-80">해당 항목은 재고에 반영되지 않습니다 (오르판 로트로 보관, 매핑 시 자동 흡수).</p>
                          <ul className="mt-1.5 space-y-0.5 text-jm-xs">
                            {unmapped.map((i) => (
                              <li key={i.supplierProduct.name}>• {i.supplierProduct.name}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    })()}
                  </JmDialogBody>
                  <JmDialogFooter>
                    <JmButton variant="ghost" onClick={() => setConfirmDialogOpen(false)} disabled={confirming}>취소</JmButton>
                    <JmButton variant="cta" onClick={() => handleConfirm(detail.id)} disabled={confirming}>
                      {confirming ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                      <span>{confirming ? "처리 중..." : "입고 확인"}</span>
                    </JmButton>
                  </JmDialogFooter>
                </JmDialogContent>
              </JmDialog>
              <JmDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
                <JmDialogContent size="sm">
                  <JmDialogHeader><JmDialogTitle>입고 취소</JmDialogTitle></JmDialogHeader>
                  <JmDialogBody>
                    <p className="text-jm-sm text-[var(--jm-text-muted)]">입고를 취소하시겠습니까?</p>
                  </JmDialogBody>
                  <JmDialogFooter>
                    <JmButton variant="ghost" onClick={() => setCancelDialogOpen(false)} disabled={cancelling}>닫기</JmButton>
                    <JmButton variant="danger" onClick={() => handleCancel(detail.id)} disabled={cancelling}>
                      {cancelling ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                      <span>{cancelling ? "처리 중..." : "입고 취소"}</span>
                    </JmButton>
                  </JmDialogFooter>
                </JmDialogContent>
              </JmDialog>
              <JmDialog open={unconfirmDialogOpen} onOpenChange={setUnconfirmDialogOpen}>
                <JmDialogContent size="md">
                  <JmDialogHeader><JmDialogTitle>입고 확정 취소</JmDialogTitle></JmDialogHeader>
                  <JmDialogBody>
                    <div className="space-y-2 text-jm-sm text-[var(--jm-text-muted)]">
                      <p>확정된 입고를 <span className="text-[var(--jm-text)] font-medium">대기 상태</span>로 되돌립니다. 품목 수정·재확정이 가능해집니다.</p>
                      <ul className="list-disc pl-5 space-y-1 text-jm-xs">
                        <li>증가했던 재고 · 로트 · 거래처 원장 · 택배비 경비가 모두 원복됩니다.</li>
                        <li>확정 시 자동 생성된 상품 매핑이 있으면 매핑이 끊기고 흡수된 과거 입고 로트는 다시 미매핑(오르판) 상태로 돌아갑니다.</li>
                        <li>이 입고 재고나 흡수된 과거 입고 재고가 이미 <span className="text-[var(--jm-text)]">출고·수리·반품·실사</span>에 사용·차감되었으면 취소가 차단됩니다.</li>
                      </ul>
                    </div>
                  </JmDialogBody>
                  <JmDialogFooter>
                    <JmButton variant="ghost" onClick={() => setUnconfirmDialogOpen(false)} disabled={unconfirming}>닫기</JmButton>
                    <JmButton variant="danger" onClick={() => handleUnconfirm(detail.id)} disabled={unconfirming}>
                      {unconfirming ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                      <span>{unconfirming ? "처리 중..." : "확정 취소"}</span>
                    </JmButton>
                  </JmDialogFooter>
                </JmDialogContent>
              </JmDialog>

              {/* 택배비 후기입 다이얼로그 */}
              <JmDialog open={shippingEditOpen} onOpenChange={setShippingEditOpen}>
                <JmDialogContent size="md">
                  <JmDialogHeader><JmDialogTitle>택배비 {parseFloat(detail.shippingCost) > 0 ? "수정" : "추가"}</JmDialogTitle></JmDialogHeader>
                  <JmDialogBody>
                    <div className="space-y-4">
                    <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                      <p className="text-jm-xs text-[var(--jm-text-muted)]">공급가액</p>
                      <input
                        className="flex h-9 w-full rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 py-1 text-jm-sm text-[var(--jm-text)] tabular-nums text-right outline-none focus-visible:ring-4 focus-visible:ring-[var(--jm-ring)]"
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={formatComma(shippingEditSupply)}
                        onChange={(e) => {
                          const v = parseComma(e.target.value);
                          setShippingEditSupply(v);
                          setShippingEditCost(shippingToTotal(v, shippingEditIsTaxable));
                        }}
                        onFocus={focusCaretEnd}
                      />
                      <p className="text-jm-xs text-[var(--jm-text-muted)]">세액</p>
                      <input
                        disabled
                        className="flex h-9 w-full rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] px-3 py-1 text-jm-sm tabular-nums text-right text-[var(--jm-text-muted)]"
                        type="text"
                        value={formatComma(String(Math.max(0, (parseFloat(shippingEditCost || "0") || 0) - (parseFloat(shippingEditSupply || "0") || 0))))}
                      />
                      <p className="text-jm-xs text-[var(--jm-text-muted)]">합계금액</p>
                      <input
                        className="flex h-9 w-full rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 py-1 text-jm-sm text-[var(--jm-text)] tabular-nums text-right outline-none focus-visible:ring-4 focus-visible:ring-[var(--jm-ring)]"
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={formatComma(shippingEditCost)}
                        onChange={(e) => {
                          const v = parseComma(e.target.value);
                          setShippingEditCost(v);
                          setShippingEditSupply(shippingToSupply(v, shippingEditIsTaxable));
                        }}
                        onFocus={focusCaretEnd}
                      />
                    </div>
                    <div className="flex items-center gap-4 flex-wrap">
                      <JmSegmentedControl
                        size="sm"
                        ariaLabel="배송비 과세 여부"
                        value={shippingEditIsTaxable ? "tax" : "free"}
                        onChange={(v) => {
                          const next = v === "tax";
                          setShippingEditIsTaxable(next);
                          setShippingEditSupply(shippingToSupply(shippingEditCost, next));
                        }}
                        options={[
                          { value: "tax", label: "과세" },
                          { value: "free", label: "면세" },
                        ]}
                      />
                      <label className="flex items-center gap-2 text-jm-sm cursor-pointer text-[var(--jm-text)]">
                        <JmCheckbox
                          checked={shippingEditDeducted}
                          onCheckedChange={(checked) => setShippingEditDeducted(!!checked)}
                        />
                        거래처 차감
                      </label>
                    </div>

                    {/* 품목별 운임 — 토글로 펼침 */}
                    <details className="rounded-lg border border-[var(--jm-border)]">
                      <summary className="cursor-pointer select-none px-3 py-2 text-jm-sm font-medium text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)]">
                        품목별 운임 (선택)
                      </summary>
                      <div className="border-t border-[var(--jm-border)] p-2 max-h-[300px] overflow-y-auto space-y-2">
                        <p className="text-jm-xs text-[var(--jm-text-muted)] px-1">
                          입력한 품목은 전표 운임 분배에서 빠지고 자기 값을 사용합니다. 비워두면 분배 적용.
                        </p>
                        {detail.items.map((it) => {
                          const ov = shippingEditItemOverrides[it.id] ?? { value: "", taxable: true };
                          return (
                            <div key={it.id} className="grid grid-cols-[1fr_120px_50px] items-center gap-2 px-1">
                              <div className="text-jm-xs truncate text-[var(--jm-text)]">
                                <span className="font-medium">{it.supplierProduct.name}</span>
                                {it.supplierProduct.supplierCode && (
                                  <span className="ml-1 text-[var(--jm-text-muted)]">[{it.supplierProduct.supplierCode}]</span>
                                )}
                              </div>
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="분배 적용"
                                value={formatComma(ov.value)}
                                onChange={(e) =>
                                  setShippingEditItemOverrides((prev) => ({
                                    ...prev,
                                    [it.id]: { value: parseComma(e.target.value), taxable: prev[it.id]?.taxable ?? true },
                                  }))
                                }
                                onFocus={focusCaretEnd}
                                className="h-8 px-2 text-right tabular-nums text-jm-xs rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface)] text-[var(--jm-text)] outline-none focus-visible:ring-4 focus-visible:ring-[var(--jm-ring)]"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setShippingEditItemOverrides((prev) => ({
                                    ...prev,
                                    [it.id]: { value: prev[it.id]?.value ?? "", taxable: !(prev[it.id]?.taxable ?? true) },
                                  }))
                                }
                                className={cn(
                                  "h-8 rounded-md border text-[11px]",
                                  ov.taxable
                                    ? "border-[var(--jm-action)] text-[var(--jm-text)]"
                                    : "border-[var(--jm-border)] text-[var(--jm-text-muted)]",
                                )}
                                title="과세 여부"
                              >
                                {ov.taxable ? "과세" : "면세"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                    </div>
                  </JmDialogBody>
                  <JmDialogFooter>
                    <JmButton variant="ghost" onClick={() => setShippingEditOpen(false)} disabled={shippingEditSaving}>취소</JmButton>
                    <JmButton variant="cta" onClick={handleShippingEdit} disabled={shippingEditSaving}>
                      {shippingEditSaving ? <Loader2 className="size-4 animate-spin" /> : null}
                      <span>{shippingEditSaving ? "저장 중..." : "저장"}</span>
                    </JmButton>
                  </JmDialogFooter>
                </JmDialogContent>
              </JmDialog>
            </>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 입고 등록 — Sheet */}
      {/* ============================================================ */}
      <JmDrawer open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setEditingId(null); }}>
        <JmDrawerContent side="bottom" size="xl" className="p-0" data-jm-theme={resolvedTheme === "dark" ? "dark" : "light"}>
          <JmTooltipProvider delay={200}>
          <JmDrawerHeader className="px-5 py-3">
            <JmDrawerTitle>{editingId ? "입고 수정" : "입고 등록"}</JmDrawerTitle>
            <JmDrawerDescription className="sr-only">입고 등록 거래명세표</JmDrawerDescription>
          </JmDrawerHeader>

          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <JmScrollArea className="flex-1 min-h-0">
              {/* 상단 정보 + VAT 토글
                  ⚠️ 외부 wrapper 는 JmScrollArea 의 [&>div]:!block 강제 받음 → flex 가 적용 안 됨.
                  실제 flex 컨테이너는 한 단계 안쪽에 두기. */}
              <div className="px-5 py-4 border-b border-[var(--jm-border)]">
                <div className="flex flex-wrap items-end gap-x-4 gap-y-6">
                  <div className="flex flex-col gap-1.5 min-w-[200px] flex-1">
                    <label className="text-jm-2xs font-medium text-[var(--jm-text-muted)]">입고일</label>
                    <DateInput
                      label=""
                      value={incomingDate}
                      onChange={setIncomingDate}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 min-w-[240px] flex-[2]">
                    <label className="text-jm-2xs font-medium text-[var(--jm-text-muted)]">거래처</label>
                    <SupplierCombobox
                      suppliers={suppliers}
                      value={selectedSupplierId}
                      onChange={handleSupplierChange}
                      onCreateNew={handleCreateSupplier}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 min-w-[200px] flex-[2]">
                    <label className="text-jm-2xs font-medium text-[var(--jm-text-muted)]">비고</label>
                    <JmInput
                      size="sm"
                      value={memo}
                      onChange={(e) => setMemo(e.target.value)}
                      placeholder="특이사항"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-jm-2xs font-medium text-[var(--jm-text-muted)]">단가 입력 모드</label>
                    <JmSegmentedControl
                      size="sm"
                      ariaLabel="단가 입력 모드"
                      value={unitPriceVatIncluded ? "vat" : "net"}
                      onChange={(v) => setUnitPriceVatIncluded(v === "vat")}
                      options={[
                        { value: "net", label: "공급가액" },
                        { value: "vat", label: "VAT 포함" },
                      ]}
                    />
                  </div>
                </div>
              </div>

              {/* 품목 테이블 — 거래명세표 스타일 (인라인 입력) */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-jm-sm table-fixed">
                  <thead>
                    <tr className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-jm-xs">
                      <th className="border-r border-b border-[var(--jm-border)] w-[36px] py-2 text-center font-medium">번호</th>
                      <th className="border-r border-b border-[var(--jm-border)] w-[100px] py-2 px-2 text-left font-medium">품번</th>
                      <th className="border-r border-b border-[var(--jm-border)] w-[180px] py-2 px-2 text-left font-medium">품명</th>
                      <th className="border-r border-b border-[var(--jm-border)] w-[100px] py-2 px-2 text-left font-medium">규격</th>
                      <th className="border-r border-b border-[var(--jm-border)] w-[50px] py-2 text-center font-medium">단위</th>
                      <th className="border-r border-b border-[var(--jm-border)] w-[70px] py-2 text-center font-medium">수량</th>
                      <th className="border-r border-b border-[var(--jm-border)] w-[100px] py-2 text-center font-medium">
                        <span className="inline-flex items-center gap-1">
                          단가
                          <JmTooltip content="이 단가가 매출 시 마진 원가로 영구 사용됩니다. 정확히 입력해주세요.">
                            <Info className="size-3 text-[var(--jm-text-subtle)]" />
                          </JmTooltip>
                        </span>
                      </th>
                      <th className="border-r border-b border-[var(--jm-border)] w-[80px] py-2 text-center font-medium">할인</th>
                      <th className="border-r border-b border-[var(--jm-border)] w-[90px] py-2 text-center font-medium">실제단가</th>
                      <th className="border-r border-b border-[var(--jm-border)] w-[110px] py-2 text-center font-medium">
                        <span className="inline-flex items-center gap-1">
                          공급가액
                          <JmTooltip content="직접 입력 시 단가가 역산되며, 할인 정보는 사라집니다.">
                            <Info className="size-3 text-[var(--jm-text-subtle)]" />
                          </JmTooltip>
                        </span>
                      </th>
                      <th className="border-r border-b border-[var(--jm-border)] w-[84px] py-2 text-center font-medium">세액</th>
                      <th className="border-b border-[var(--jm-border)] w-[100px] py-2 px-2 text-center font-medium">비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const isEmptyRow = !item.supplierProductId && !item.isNew;
                      const qty = parseFloat(item.quantity || "0");
                      const up = parseFloat(item.unitPrice || "0");
                      const discountPerUnit = calcDiscountPerUnit(up, item.discount);
                      const actualPrice = up - discountPerUnit;
                      // 직전 입고가(공급상품 마스터 단가) 대비 변동 — 신규 상품·미입력은 비교 없음
                      const prevUnit = item.prevUnitPrice ? parseFloat(item.prevUnitPrice) : null;
                      const priceDiff =
                        prevUnit !== null && actualPrice > 0 ? actualPrice - prevUnit : 0;
                      const priceDiffPct =
                        priceDiff !== 0 && prevUnit && prevUnit > 0
                          ? Math.round(Math.abs(priceDiff / prevUnit) * 100)
                          : 0;
                      const lineSupply = item.supplyAmount ? parseFloat(item.supplyAmount) : actualPrice * qty;
                      const lineTax = Math.round(lineSupply * 0.1);
                      const matchedSp = supplierProducts.find((sp) => sp.id === item.supplierProductId);
                      const willOrphan = !!item.supplierProductId && matchedSp?.hasMapping === false;

                      return (
                        <tr key={`row-${idx}`} className="group border-b border-[var(--jm-border)] hover:bg-[var(--jm-surface-muted)]">
                          <td className="border-r border-[var(--jm-border)] text-center text-[var(--jm-text-muted)] py-1 text-jm-xs tabular-nums">{idx + 1}</td>

                          {/* 품번 */}
                          <td className="border-r border-[var(--jm-border)] p-0.5">
                            <input
                              data-row={idx}
                              data-field="supplierCode"
                              value={item.supplierCode}
                              onChange={(e) => updateItem(idx, "supplierCode", e.target.value)}
                              disabled={isEmptyRow}
                              className="w-full h-7 bg-transparent text-jm-sm text-[var(--jm-text)] px-2 outline-none focus:bg-[var(--jm-surface-muted)] rounded disabled:opacity-30"
                            />
                          </td>

                          {/* 품명 */}
                          <td className="border-r border-[var(--jm-border)] px-1 py-0.5">
                            {selectedSupplierId ? (
                              <div className="flex items-center gap-1.5">
                                <div className="flex-1 min-w-0">
                                  <InlineCellProductSearch
                                    rowIndex={idx}
                                    products={supplierProducts}
                                    onSelect={(sp) => selectProductForRow(idx, sp)}
                                    onCreateNewInline={(name) => handleCreateNewInline(idx, name)}
                                    existingIds={items.map((i) => i.supplierProductId).filter(Boolean)}
                                    selectedName={item.supplierProductName}
                                    isNew={item.isNew}
                                    pendingSourceRow={item.pendingSourceRow}
                                    pendingNewProducts={pendingNewProducts}
                                    onSelectPending={(pending) => handleSelectPending(idx, pending)}
                                    loading={supplierProductsQuery.isPending || supplierProductsQuery.isFetching}
                                  />
                                </div>
                                {willOrphan && (
                                  <JmTooltip content="이 공급상품은 매핑이 없어 등록 시 오르판 로트로 들어갑니다 (가용 재고 미반영).">
                                    <span className="size-1.5 rounded-full bg-[var(--jm-warning-solid)] shrink-0" />
                                  </JmTooltip>
                                )}
                              </div>
                            ) : (
                              <span className="text-jm-xs text-[var(--jm-text-muted)] px-2">거래처를 선택하세요</span>
                            )}
                          </td>

                          {/* 규격 */}
                          <td className="border-r border-[var(--jm-border)] p-0.5">
                            <input
                              data-row={idx}
                              data-field="spec"
                              value={item.spec}
                              onChange={(e) => updateItem(idx, "spec", e.target.value)}
                              disabled={isEmptyRow}
                              className="w-full h-7 bg-transparent text-jm-sm text-[var(--jm-text)] px-2 outline-none focus:bg-[var(--jm-surface-muted)] rounded disabled:opacity-30"
                            />
                          </td>

                          {/* 단위 */}
                          <td className="border-r border-[var(--jm-border)] text-center text-jm-xs text-[var(--jm-text-muted)] py-1">{item.unitOfMeasure}</td>

                          {/* 수량 */}
                          <td className="border-r border-[var(--jm-border)] p-0.5">
                            <input
                              data-row={idx}
                              data-field="quantity"
                              value={item.quantity}
                              onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                              onBlur={() => recalcOnBlur(idx, "quantity")}
                              onFocus={(e) => { if (e.target.value === "0") updateItem(idx, "quantity", ""); }}
                              disabled={isEmptyRow}
                              inputMode="decimal"
                              className="w-full h-7 bg-transparent text-right text-jm-sm text-[var(--jm-text)] px-2 outline-none focus:bg-[var(--jm-surface-muted)] rounded disabled:opacity-30 tabular-nums"
                            />
                          </td>

                          {/* 단가 (VAT 토글 영향) */}
                          <td className="border-r border-[var(--jm-border)] p-0.5">
                            <input
                              data-row={idx}
                              data-field="unitPrice"
                              inputMode="decimal"
                              value={
                                unitPriceVatIncluded
                                  ? (vatInputBuffer?.idx === idx
                                      ? vatInputBuffer.text
                                      : vatRawByIdx[idx] !== undefined
                                        ? formatCommaDecimal(vatRawByIdx[idx])
                                        : item.unitPrice
                                          ? formatCommaDecimal(String(Math.round(parseFloat(item.unitPrice) * 1.1)))
                                          : "")
                                  : formatCommaDecimal(item.unitPrice)
                              }
                              onChange={(e) => {
                                if (unitPriceVatIncluded) {
                                  setVatInputBuffer({ idx, text: e.target.value });
                                } else {
                                  updateItem(idx, "unitPrice", parseCommaDecimal(e.target.value));
                                  setVatRawByIdx((prev) => {
                                    if (prev[idx] === undefined) return prev;
                                    const next = { ...prev };
                                    delete next[idx];
                                    return next;
                                  });
                                }
                              }}
                              onBlur={() => {
                                if (unitPriceVatIncluded && vatInputBuffer?.idx === idx) {
                                  const raw = parseCommaDecimal(vatInputBuffer.text);
                                  const stored = raw
                                    ? String(Math.round(parseFloat(raw) / 1.1))
                                    : "";
                                  updateItem(idx, "unitPrice", stored);
                                  setVatRawByIdx((prev) => ({ ...prev, [idx]: raw }));
                                  setVatInputBuffer(null);
                                  recalcOnBlur(idx, "unitPrice", raw);
                                  return;
                                }
                                recalcOnBlur(idx, "unitPrice");
                              }}
                              onFocus={(e) => {
                                if (item.unitPrice === "0") updateItem(idx, "unitPrice", "");
                                else focusCaretEnd(e);
                              }}
                              disabled={isEmptyRow}
                              className={`w-full h-7 bg-transparent text-right text-jm-sm px-2 outline-none focus:bg-[var(--jm-surface-muted)] rounded disabled:opacity-30 tabular-nums ${
                                unitPriceVatIncluded ? "text-[var(--jm-info-fg)]" : "text-[var(--jm-text)]"
                              }`}
                            />
                          </td>

                          {/* 할인 */}
                          <td className="border-r border-[var(--jm-border)] p-0.5">
                            <input
                              data-row={idx}
                              data-field="discount"
                              inputMode={item.discount.trim().endsWith("%") ? "decimal" : "numeric"}
                              value={formatDiscountDisplay(item.discount)}
                              onChange={(e) => updateItem(idx, "discount", normalizeDiscountInput(e.target.value))}
                              onBlur={() => recalcOnBlur(idx, "discount")}
                              onFocus={focusCaretEnd}
                              disabled={isEmptyRow || up === 0}
                              className={`w-full h-7 bg-transparent text-right text-jm-sm px-2 outline-none focus:bg-[var(--jm-surface-muted)] rounded disabled:opacity-30 tabular-nums ${discountPerUnit > 0 ? "text-[var(--jm-danger-fg)]" : "text-[var(--jm-text)]"}`}
                            />
                          </td>

                          {/* 실제단가 — 직전 입고가 대비 상승/하락 표시 */}
                          <td className="border-r border-[var(--jm-border)] text-right px-2 py-1 tabular-nums text-[var(--jm-text)]">
                            {!isEmptyRow && actualPrice > 0 && (
                              <div className="flex flex-col items-end leading-tight">
                                <span>{formatPrice(actualPrice)}</span>
                                {priceDiff !== 0 && (
                                  <span
                                    className={`text-[10px] whitespace-nowrap ${
                                      priceDiff > 0
                                        ? "text-[var(--jm-warning-fg)]"
                                        : "text-[var(--jm-text-muted)]"
                                    }`}
                                    title={`직전 입고가 ₩${formatPrice(prevUnit ?? 0)} 대비`}
                                  >
                                    {priceDiff > 0 ? "▲" : "▼"} {formatPrice(Math.abs(priceDiff))}
                                    {priceDiffPct >= 1 ? ` (${priceDiffPct}%)` : ""}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* 공급가액 */}
                          <td className="border-r border-[var(--jm-border)] p-0.5">
                            <input
                              data-row={idx}
                              data-field="supplyAmount"
                              inputMode="decimal"
                              value={formatCommaDecimal(item.supplyAmount)}
                              onChange={(e) => updateItem(idx, "supplyAmount", parseCommaDecimal(e.target.value))}
                              onBlur={() => recalcOnBlur(idx, "supplyAmount")}
                              onFocus={focusCaretEnd}
                              disabled={isEmptyRow}
                              placeholder={isEmptyRow ? "" : lineSupply ? formatPrice(lineSupply) : ""}
                              className="w-full h-7 bg-transparent text-right text-jm-sm text-[var(--jm-text)] px-2 outline-none focus:bg-[var(--jm-surface-muted)] rounded disabled:opacity-30 tabular-nums placeholder:text-[var(--jm-text-subtle)]"
                            />
                          </td>

                          {/* 세액 */}
                          <td className="border-r border-[var(--jm-border)] text-right px-2 py-1 text-[var(--jm-text-muted)] tabular-nums">
                            {!isEmptyRow && lineTax > 0 && formatPrice(lineTax)}
                          </td>

                          {/* 비고 + 운임 + 삭제 */}
                          <td className="p-0.5">
                            <div className="flex items-center gap-0.5">
                              <input
                                data-row={idx}
                                data-field="memo"
                                value={item.memo}
                                onChange={(e) => updateItem(idx, "memo", e.target.value)}
                                disabled={isEmptyRow}
                                className="flex-1 h-7 bg-transparent text-jm-sm text-[var(--jm-text)] px-2 outline-none focus:bg-[var(--jm-surface-muted)] rounded disabled:opacity-30 min-w-0"
                                onKeyDown={(e) => {
                                  if (e.key === "Tab" && !e.shiftKey && idx === items.length - 1 && !isEmptyRow) {
                                    e.preventDefault();
                                    addEmptyRow();
                                  }
                                }}
                              />
                              <ItemShippingPopover
                                value={item.itemShippingCost}
                                isTaxable={item.itemShippingIsTaxable}
                                onChange={(v) => updateItem(idx, "itemShippingCost", v)}
                                onTaxableChange={(v) => updateItemTaxable(idx, v)}
                                disabled={isEmptyRow}
                              />
                              <button
                                type="button"
                                onClick={() => removeItem(idx)}
                                aria-label="행 삭제"
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--jm-text-muted)] hover:text-[var(--jm-danger-fg)] p-1 shrink-0"
                              >
                                <X className="size-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {/* 행 추가 */}
                    <tr>
                      <td colSpan={12} className="py-1.5 px-2">
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={addEmptyRow}
                            disabled={!selectedSupplierId}
                            className="flex items-center gap-1.5 text-jm-sm text-[var(--jm-text)] hover:text-[var(--jm-action)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Plus className="size-3.5" />
                            행 추가
                          </button>
                          <span className="text-jm-2xs text-[var(--jm-text-subtle)]">
                            마지막 행에서 Tab 키로 자동 추가
                          </span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

                {/* 합계 + 배송비 */}
                <div className="border-t border-[var(--jm-border)] bg-[var(--jm-surface-muted)]">
                  <div className="flex flex-wrap text-jm-sm">
                    <div className="flex flex-1 min-w-[140px] items-center justify-between gap-3 border-r border-[var(--jm-border)] px-3 py-2.5">
                      <span className="text-jm-xs text-[var(--jm-text-muted)]">품목수</span>
                      <span className="tabular-nums">{validItems.length}건</span>
                    </div>
                    <div className="flex flex-1 min-w-[140px] items-center justify-between gap-3 border-r border-[var(--jm-border)] px-3 py-2.5">
                      <span className="text-jm-xs text-[var(--jm-text-muted)]">공급가액</span>
                      <span className="tabular-nums">₩{formatPrice(supplyAmount)}</span>
                    </div>
                    <div className="flex flex-1 min-w-[140px] items-center justify-between gap-3 border-r border-[var(--jm-border)] px-3 py-2.5">
                      <span className="text-jm-xs text-[var(--jm-text-muted)]">세액</span>
                      <span className="tabular-nums">{taxAmount > 0 ? `₩${formatPrice(taxAmount)}` : ""}</span>
                    </div>
                    <div className="flex flex-1 min-w-[140px] items-center justify-between gap-3 border-r border-[var(--jm-border)] px-3 py-2.5">
                      <span className="text-jm-xs text-[var(--jm-text-muted)]">할인합계</span>
                      <span className={`tabular-nums ${totalDiscount > 0 ? "text-[var(--jm-danger-fg)]" : ""}`}>
                        {totalDiscount > 0 ? `-₩${formatPrice(totalDiscount)}` : ""}
                      </span>
                    </div>
                    <div className="flex flex-1 min-w-[140px] items-center justify-between gap-3 px-3 py-2.5">
                      <span className="text-jm-xs text-[var(--jm-text-muted)]">합계금액</span>
                      <span className="font-bold text-jm-base tabular-nums">₩{formatPrice(supplyAmount + taxAmount)}</span>
                    </div>
                  </div>
                  {/* 배송비 입력 */}
                  <div className="border-t border-[var(--jm-border)] px-3 py-2 flex items-center justify-end gap-3 flex-wrap">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <JmCheckbox
                        checked={shippingDeducted}
                        onCheckedChange={(checked) => setShippingDeducted(!!checked)}
                      />
                      <span className="text-jm-xs text-[var(--jm-text-muted)]">차감 결제</span>
                    </label>
                    <JmSegmentedControl
                      size="sm"
                      ariaLabel="배송비 과세 여부"
                      value={shippingIsTaxable ? "tax" : "free"}
                      onChange={(v) => {
                        const next = v === "tax";
                        setShippingIsTaxable(next);
                        setShippingSupply(shippingToSupply(shippingCost, next));
                      }}
                      options={[
                        { value: "tax", label: "과세" },
                        { value: "free", label: "면세" },
                      ]}
                    />
                    <span className="text-jm-xs text-[var(--jm-text-muted)]">배송비</span>
                    <span className="text-jm-2xs text-[var(--jm-text-muted)]">공급가액</span>
                    <div className="relative w-32">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-jm-xs text-[var(--jm-text-muted)]">₩</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={formatComma(shippingSupply)}
                        onChange={(e) => {
                          const v = parseComma(e.target.value);
                          setShippingSupply(v);
                          setShippingCost(shippingToTotal(v, shippingIsTaxable));
                        }}
                        onFocus={focusCaretEnd}
                        className="w-full h-8 pl-5 pr-2 text-right text-jm-sm bg-[var(--jm-surface)] border border-[var(--jm-border)] rounded-md text-[var(--jm-text)] tabular-nums outline-none focus-visible:ring-4 focus-visible:ring-[var(--jm-ring)]"
                      />
                    </div>
                    <span className="text-jm-2xs text-[var(--jm-text-muted)]">세액</span>
                    <div className="relative w-24">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-jm-xs text-[var(--jm-text-muted)]">₩</span>
                      <input
                        type="text"
                        disabled
                        value={formatComma(String(Math.max(0, (parseFloat(shippingCost || "0") || 0) - (parseFloat(shippingSupply || "0") || 0))))}
                        className="w-full h-8 pl-5 pr-2 text-right text-jm-sm bg-[var(--jm-surface-muted)] border border-[var(--jm-border)] rounded-md text-[var(--jm-text-muted)] tabular-nums"
                      />
                    </div>
                    <span className="text-jm-2xs text-[var(--jm-text-muted)]">합계</span>
                    <div className="relative w-32">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-jm-xs text-[var(--jm-text-muted)]">₩</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={formatComma(shippingCost)}
                        onChange={(e) => {
                          const v = parseComma(e.target.value);
                          setShippingCost(v);
                          setShippingSupply(shippingToSupply(v, shippingIsTaxable));
                        }}
                        onFocus={focusCaretEnd}
                        className="w-full h-8 pl-5 pr-2 text-right text-jm-sm bg-[var(--jm-surface)] border border-[var(--jm-border)] rounded-md text-[var(--jm-text)] tabular-nums outline-none focus-visible:ring-4 focus-visible:ring-[var(--jm-ring)]"
                      />
                    </div>
                  </div>
                </div>

            </JmScrollArea>

            {/* 하단 버튼 */}
            <div className="border-t border-[var(--jm-border)] px-5 py-3 flex justify-end gap-2 bg-[var(--jm-surface)]">
              <JmButton variant="ghost" onClick={() => { setCreateOpen(false); setEditingId(null); }}>
                취소
              </JmButton>
              <JmButton variant="cta" onClick={handleCreate} disabled={submitMutation.isPending || items.length === 0 || !selectedSupplierId}>
                {submitMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                <span>{submitMutation.isPending ? "처리 중..." : editingId ? "수정 저장" : "입고 등록"}</span>
              </JmButton>
            </div>
          </div>
          </JmTooltipProvider>
        </JmDrawerContent>
      </JmDrawer>

      {/* 거래처 빠른 등록 Sheet */}
      <QuickSupplierSheet
        open={quickSupplierOpen}
        onOpenChange={setQuickSupplierOpen}
        defaultName={quickSupplierName}
        onCreated={handleQuickSupplierCreated}
      />

      {/* 삭제 확인 다이얼로그 */}
      <JmDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <JmDialogContent size="sm">
          <JmDialogHeader>
            <JmDialogTitle>입고 삭제</JmDialogTitle>
          </JmDialogHeader>
          <p className="text-jm-sm text-[var(--jm-text-muted)]">정말 삭제하시겠습니까?</p>
          <JmDialogFooter>
            <JmButton variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>취소</JmButton>
            <JmButton variant="danger" onClick={() => deleteTarget && handleDelete(deleteTarget)} disabled={deleting}>
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              <span>{deleting ? "삭제 중..." : "삭제"}</span>
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>
    </JmScope>
  );
}
