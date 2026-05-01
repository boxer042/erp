"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { cn, formatComma, parseComma, formatCommaDecimal, parseCommaDecimal, normalizeDiscountInput, formatDiscountDisplay } from "@/lib/utils";
import { Input } from "@/components/ui/input";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

import {
  Plus, Check, X, Trash2, FileText, PanelLeftClose, PanelLeftOpen, SlidersHorizontal, Search, ChevronDown,
  Loader2, Pencil, Truck,
} from "lucide-react";
import { toast } from "sonner";
import { QuickSupplierSheet } from "@/components/quick-register-sheets";
import { Skeleton } from "@/components/ui/skeleton";
import type { Supplier, SupplierProduct, Incoming, IncomingDetail, IncomingItemForm } from "./_types";
import {
  calcDiscountPerUnit,
  statusLabels,
  statusVariants,
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
  const queryClient = useQueryClient();

  // 등록 시트
  const [panelOpen, setPanelOpen] = useState(true);
  const [viewMode, setViewMode] = useState<"items" | "statements">("statements");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>(Object.keys(statusLabels));
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<string | null>(null);
  const [viewPopoverOpen, setViewPopoverOpen] = useState(false);
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
    queryFn: () => apiGet<SupplierProduct[]>(`/api/supplier-products?supplierId=${selectedSupplierId}`),
    enabled: !!selectedSupplierId,
  });
  const supplierProducts = supplierProductsQuery.data ?? [];

  const detailQuery = useQuery({
    queryKey: queryKeys.incoming.detail(detailId ?? ""),
    queryFn: () => apiGet<IncomingDetail>(`/api/incoming/${detailId}`),
    enabled: !!detailId,
  });
  const detail = detailQuery.data ?? null;
  const detailLoading = detailQuery.isFetching;

  const incomingsQuery = useQuery({
    queryKey: queryKeys.incoming.list(),
    queryFn: async () => {
      const list = await apiGet<Incoming[]>("/api/incoming");
      const details = await Promise.all(
        list.map(async (inc) => {
          try {
            return await apiGet<IncomingDetail>(`/api/incoming/${inc.id}`);
          } catch {
            return null;
          }
        })
      );
      return { list, details: details.filter((d): d is IncomingDetail => !!d) };
    },
  });

  const incomings = incomingsQuery.data?.list ?? [];
  const allDetails = incomingsQuery.data?.details ?? [];
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
      const hasData = existing.quantity || existing.unitPrice || existing.supplyAmount;
      updated[index] = {
        ...existing,
        supplierProductId: sp.id,
        supplierProductName: sp.name,
        supplierCode: sp.supplierCode || "",
        spec: sp.spec || "",
        unitOfMeasure: sp.unitOfMeasure,
        originalPrice: sp.unitPrice,
        isNew: undefined,
        pendingSourceRow: undefined,
        // 금액이 이미 입력되어 있으면 유지, 없으면 상품 기본가 적용
        ...(hasData ? {} : { unitPrice: sp.unitPrice }),
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

      if (field === "unitPrice" || field === "quantity") {
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
        const discPerUnit = calcDiscountPerUnit(up, item.discount);
        const actualPrice = String(up - discPerUnit);
        const key = `${item.supplierProductName}||${item.spec || ""}||${item.supplierCode || ""}`;
        return {
          supplierProductId: item.isNew ? newProductCache.get(key)! : item.supplierProductId,
          quantity: item.quantity,
          unitPrice: actualPrice,
          originalPrice: item.unitPrice,
          discountAmount: String(discPerUnit),
          itemShippingCost: item.itemShippingCost.trim() === "" ? null : item.itemShippingCost,
          itemShippingIsTaxable: item.itemShippingIsTaxable,
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
      queryClient.invalidateQueries({ queryKey: queryKeys.incoming.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.supplierProducts.all });
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
    <>
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
            <div className="w-[300px] shrink-0 border-r border-border flex flex-col bg-background">
              {/* 헤더 */}
              <div className="h-10 px-3 border-b border-border flex items-center shrink-0">
                <h2 className="text-sm font-medium">입고 관리</h2>
              </div>

              {/* 입고 등록 */}
              <div className="px-3 pt-2 shrink-0">
                <Button size="sm" onClick={openCreateSheet} className="w-full h-8 text-xs">
                  <Plus /><span>입고 등록</span>
                </Button>
              </div>

              {/* 뷰 전환 */}
              <div className="px-3 py-2 shrink-0">
                <Popover open={viewPopoverOpen} onOpenChange={setViewPopoverOpen}>
                  <PopoverTrigger className="flex h-8 w-full items-center justify-between rounded-md border border-border px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted">
                    <span>{viewMode === "items" ? "품목별" : "명세표별"}</span>
                    <ChevronDown className="size-3" />
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--anchor-width)] p-1" align="start">
                    <button
                      className={cn("flex w-full items-center rounded-md px-2.5 py-1.5 text-xs", viewMode === "items" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
                      onClick={() => { setViewMode("items"); setDetailId(null); setSelectedSupplierFilter(null); setViewPopoverOpen(false); }}
                    >
                      품목별
                    </button>
                    <button
                      className={cn("flex w-full items-center rounded-md px-2.5 py-1.5 text-xs", viewMode === "statements" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
                      onClick={() => { setViewMode("statements"); setDetailId(null); setSelectedSupplierFilter(null); setViewPopoverOpen(false); }}
                    >
                      명세표별
                    </button>
                  </PopoverContent>
                </Popover>
              </div>

              {/* 검색 + 필터 */}
              <div className="px-3 pb-2 flex items-center gap-2 shrink-0">
                <div className="flex-1 flex items-center gap-1.5 h-8 rounded-md border border-border bg-card px-2.5">
                  <Search className="size-3.5 text-muted-foreground shrink-0" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={viewMode === "items" ? "거래처, 품목 검색..." : "거래처, 입고번호 검색..."}
                    className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <Popover>
                  <PopoverTrigger
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-md border border-border shrink-0 transition-colors",
                      statusFilter.length < Object.keys(statusLabels).length ? "bg-primary/10 text-primary border-[#3ECF8E]/30" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    <SlidersHorizontal className="size-3.5" />
                  </PopoverTrigger>
                  <PopoverContent className="w-[180px] p-2" align="end">
                    <p className="text-xs text-muted-foreground mb-2 px-1">상태 필터</p>
                    {Object.entries(statusLabels).map(([key, label]) => {
                      const checked = statusFilter.includes(key);
                      return (
                        <button
                          key={key}
                          className={cn(
                            "flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-xs transition-colors",
                            checked ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                          )}
                          onClick={() => setStatusFilter(prev => checked ? prev.filter((s) => s !== key) : [...prev, key])}
                        >
                          <div className={cn("h-3.5 w-3.5 rounded border flex items-center justify-center", checked ? "bg-primary border-[#3ECF8E]" : "border-[#555]")}>
                            {checked && <Check className="size-2.5 text-foreground" />}
                          </div>
                          <Badge variant={statusVariants[key]} className="text-[10px]">{label}</Badge>
                        </button>
                      );
                    })}
                    {statusFilter.length < Object.keys(statusLabels).length && (
                      <button className="w-full text-xs text-muted-foreground hover:text-foreground mt-1.5 pt-1.5 border-t border-border" onClick={() => setStatusFilter(Object.keys(statusLabels))}>
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
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="px-3 py-2.5 border-b border-border space-y-1">
                        <div className="flex items-center justify-between">
                          <Skeleton className="h-4 w-28" />
                          <Skeleton className="h-5 w-10 rounded-full" />
                        </div>
                        <div className="flex items-center justify-between">
                          <Skeleton className="h-3 w-20" />
                          <Skeleton className="h-3 w-8" />
                        </div>
                        <div className="flex items-center justify-between">
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                    ))}
                  </>
                ) : viewMode === "items" ? (
                  /* 품목별: 거래처 목록 */
                  <>
                    <div
                      onClick={() => setSelectedSupplierFilter(null)}
                      className={cn("px-3 py-2.5 border-b border-border cursor-pointer transition-colors", selectedSupplierFilter === null ? "bg-muted" : "hover:bg-muted/50")}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">전체보기</span>
                        <span className="text-xs text-muted-foreground">{filtered.reduce((s, i) => s + i._count.items, 0)}건</span>
                      </div>
                    </div>
                    {supplierList.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm">입고 내역이 없습니다</div>
                    ) : (
                      supplierList.map((sup) => (
                        <div
                          key={sup.name}
                          onClick={() => setSelectedSupplierFilter(sup.name)}
                          className={cn("px-3 py-2.5 border-b border-border cursor-pointer transition-colors", selectedSupplierFilter === sup.name ? "bg-muted" : "hover:bg-muted/50")}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm">{sup.name}</span>
                            <span className="text-xs text-muted-foreground">{sup.count}건</span>
                          </div>
                        </div>
                      ))
                    )}
                  </>
                ) : (
                  /* 명세표별: 기존 입고건 목록 */
                  filtered.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
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
                          className={`px-3 py-2.5 border-b border-border cursor-pointer transition-colors ${isSelected ? "bg-muted" : "hover:bg-muted/50"}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-sm">{inc.supplier.name}</span>
                            <Badge variant={statusVariants[inc.status]} className="text-[10px] h-5">{statusLabels[inc.status]}</Badge>
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{new Date(inc.incomingDate).toLocaleDateString("ko-KR")}</span>
                            <span>{inc._count.items}건</span>
                          </div>
                          <div className="flex items-center justify-between text-xs mt-0.5">
                            <span className="text-muted-foreground font-mono">{inc.incomingNo}</span>
                            <span className="tabular-nums">₩{formatPrice(total)}</span>
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
          {/* 상단 바 */}
          <div className="min-h-10 border-b border-border px-4 flex items-center justify-between flex-wrap gap-x-3 gap-y-1 py-1 bg-background shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setPanelOpen(!panelOpen)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {panelOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
              </button>
              {viewMode === "statements" && detail && (
                <>
                  <span className="font-medium text-sm truncate">{detail.incomingNo}</span>
                  <Badge variant={statusVariants[detail.status]} className="shrink-0">{statusLabels[detail.status]}</Badge>
                </>
              )}
              {viewMode === "items" && (
                <span className="text-sm text-muted-foreground truncate">
                  {selectedSupplierFilter ? `${selectedSupplierFilter} 입고 품목` : "전체 입고 품목"}
                </span>
              )}
            </div>
            {viewMode === "statements" && detail?.status === "PENDING" && (
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => openEditSheet(detail)}>
                  <Pencil /><span>수정</span>
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setCancelDialogOpen(true)}>
                  <X /><span>취소</span>
                </Button>
                <Button size="sm" onClick={() => setConfirmDialogOpen(true)}>
                  <Check /><span>입고 확인</span>
                </Button>
              </div>
            )}
            {viewMode === "statements" && detail?.status === "CONFIRMED" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const sc = parseFloat(detail.shippingCost) || 0;
                  const total = sc > 0 ? String(sc) : "";
                  setShippingEditCost(total);
                  setShippingEditSupply(shippingToSupply(total, detail.shippingIsTaxable));
                  setShippingEditIsTaxable(detail.shippingIsTaxable);
                  setShippingEditDeducted(detail.shippingDeducted);
                  // 품목별 override 초기화
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
                <Pencil />
                <span>{parseFloat(detail.shippingCost) > 0 ? "택배비 수정" : "택배비 추가"}</span>
              </Button>
            )}
          </div>

          {viewMode === "items" ? (() => {
            // 품목별 뷰 — 날짜별 그룹핑
            const filteredDetails = allDetails.filter((d) => {
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
            const dateGroups = new Map<string, Array<{ detail: IncomingDetail; item: IncomingDetail["items"][0] }>>();
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
                {allDetails.length === 0 && loading ? (
                  <div className="p-4 space-y-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : sortedDates.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">입고 내역이 없습니다</div>
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
                      <tr className="bg-muted text-muted-foreground text-xs">
                        <th className="border-r border-b border-border py-1.5 px-2 text-left font-medium">거래처</th>
                        <th className="border-r border-b border-border py-1.5 px-2 text-left font-medium">품명</th>
                        <th className="border-r border-b border-border py-1.5 px-2 text-left font-medium">규격</th>
                        <th className="border-r border-b border-border py-1.5 text-center font-medium">단위</th>
                        <th className="border-r border-b border-border py-1.5 text-center font-medium">수량</th>
                        <th className="border-r border-b border-border py-1.5 text-center font-medium">단가</th>
                        <th className="border-r border-b border-border py-1.5 text-center font-medium">할인</th>
                        <th className="border-r border-b border-border py-1.5 text-center font-medium">실제단가</th>
                        <th className="border-r border-b border-border py-1.5 text-center font-medium">공급가액</th>
                        <th className="border-r border-b border-border py-1.5 text-center font-medium">세액</th>
                        <th className="border-r border-b border-border py-1.5 px-2 text-left font-medium">비고</th>
                        <th className="border-b border-border py-1.5 text-center font-medium">매핑</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedDates.map(([date, rows]) => (
                        <>
                          {/* 날짜 구분 행 */}
                          <tr key={`date-${date}`} className="bg-card">
                            <td colSpan={12} className="px-3 py-1.5 text-xs text-muted-foreground font-medium border-b border-border">
                              {date}
                            </td>
                          </tr>
                          {rows.map(({ detail: d, item }, ri) => {
                            const qty = parseFloat(item.quantity);
                            const up = parseFloat(item.unitPrice);
                            const origPrice = parseFloat(item.supplierProduct.unitPrice);
                            const discPerUnit = up < origPrice ? origPrice - up : 0;
                            const supplyLine = up * qty;
                            const taxLine = Math.round(supplyLine * 0.1);
                            return (
                              <tr
                                key={`${d.id}-${item.id}-${ri}`}
                                className="border-b border-border hover:bg-muted/50 cursor-pointer"
                                onClick={() => { setViewMode("statements"); openDetail(d.id); }}
                              >
                                <td className="border-r border-border px-2 py-1.5 text-xs text-muted-foreground truncate">{d.supplier.name}</td>
                                <td className="border-r border-border px-2 py-1.5 truncate">
                                  <span className="font-medium">{item.supplierProduct.name}</span>
                                  {item.supplierProduct.supplierCode && <span className="ml-1 text-xs text-muted-foreground">({item.supplierProduct.supplierCode})</span>}
                                </td>
                                <td className="border-r border-border px-2 py-1.5 text-muted-foreground truncate"></td>
                                <td className="border-r border-border text-center text-muted-foreground py-1.5">{item.supplierProduct.unitOfMeasure}</td>
                                <td className="border-r border-border text-right px-2 py-1.5 tabular-nums">{qty.toLocaleString()}</td>
                                <td className="border-r border-border text-right px-2 py-1.5 tabular-nums">{formatPrice(origPrice)}</td>
                                <td className="border-r border-border text-right px-2 py-1.5 tabular-nums">{discPerUnit > 0 && <span className="text-red-400">-{formatPrice(discPerUnit)}</span>}</td>
                                <td className="border-r border-border text-right px-2 py-1.5 tabular-nums">{formatPrice(up)}</td>
                                <td className="border-r border-border text-right px-2 py-1.5 tabular-nums">{formatPrice(supplyLine)}</td>
                                <td className="border-r border-border text-right px-2 py-1.5 text-muted-foreground tabular-nums">{formatPrice(taxLine)}</td>
                                <td className="border-r border-border px-2 py-1.5 text-muted-foreground truncate">{item.memo || ""}</td>
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
                <div className="border border-border rounded-lg overflow-hidden">
                  {/* 거래처 + 입고 정보 헤더 */}
                  <div className="grid grid-cols-2 border-b border-border">
                    <div className="border-r border-border">
                      <div className="bg-muted px-3 py-1.5 border-b border-border">
                        <Skeleton className="h-3 w-20" />
                      </div>
                      <div className="p-3 space-y-1.5">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-3 w-12" />
                      </div>
                    </div>
                    <div>
                      <div className="bg-muted px-3 py-1.5 border-b border-border">
                        <Skeleton className="h-3 w-16" />
                      </div>
                      <div className="p-3 space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Skeleton className="h-3 w-12 shrink-0" />
                            <Skeleton className="h-4 w-32" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {/* 품목 테이블 */}
                  <table className="w-full">
                    <thead>
                      <tr className="bg-muted">
                        {Array.from({ length: 12 }).map((_, i) => (
                          <th key={i} className="py-2 px-2 border-r border-b border-border last:border-r-0">
                            <Skeleton className="h-3 w-full" />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 4 }).map((_, r) => (
                        <tr key={r} className="border-b border-border last:border-b-0">
                          {Array.from({ length: 12 }).map((_, c) => (
                            <td key={c} className="py-1.5 px-2 border-r border-border last:border-r-0">
                              <Skeleton className="h-4 w-full" />
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
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
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
                <div className="border border-border rounded-lg overflow-hidden min-w-[1200px]">
                  <div className="grid grid-cols-2 border-b border-border">
                    <div className="border-r border-border">
                      <div className="bg-muted px-3 py-1.5 text-xs text-muted-foreground font-medium border-b border-border">공급자 (거래처)</div>
                      <div className="p-3">
                        <p className="text-base font-bold">{detail.supplier.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{detail.supplier.paymentMethod === "CREDIT" ? "외상" : "선불"}</p>
                      </div>
                    </div>
                    <div>
                      <div className="bg-muted px-3 py-1.5 text-xs text-muted-foreground font-medium border-b border-border">입고 정보</div>
                      <div className="p-3 space-y-1.5 text-sm">
                        <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground w-14 shrink-0">입고번호</span><span>{detail.incomingNo}</span></div>
                        <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground w-14 shrink-0">입고일</span><span>{new Date(detail.incomingDate).toLocaleDateString("ko-KR")}</span></div>
                        <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground w-14 shrink-0">등록자</span><span>{detail.createdBy.name}</span></div>
                        {detail.memo && <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground w-14 shrink-0">비고</span><span>{detail.memo}</span></div>}
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
                      <tr className="bg-muted text-muted-foreground text-xs">
                        <th className="border-r border-b border-border w-[36px] py-2 text-center font-medium">번호</th>
                        <th className="border-r border-b border-border w-[130px] py-2 px-2 text-left font-medium">품번</th>
                        <th className="border-r border-b border-border py-2 px-2 text-left font-medium" style={{ width: "20%" }}>품명</th>
                        <th className="border-r border-b border-border py-2 px-2 text-left font-medium" style={{ width: "12%" }}>규격</th>
                        <th className="border-r border-b border-border w-[56px] py-2 text-center font-medium">단위</th>
                        <th className="border-r border-b border-border w-[80px] py-2 text-center font-medium">수량</th>
                        <th className="border-r border-b border-border w-[110px] py-2 text-center font-medium">단가</th>
                        <th className="border-r border-b border-border w-[90px] py-2 text-center font-medium">할인</th>
                        <th className="border-r border-b border-border w-[110px] py-2 text-center font-medium">실제단가</th>
                        <th className="border-r border-b border-border w-[120px] py-2 text-center font-medium">공급가액</th>
                        <th className="border-r border-b border-border w-[100px] py-2 text-center font-medium">세액</th>
                        <th className="border-r border-b border-border w-[140px] py-2 text-center font-medium">배송비(개당)</th>
                        <th className="border-r border-b border-border w-[80px] py-2 px-2 text-center font-medium">비고</th>
                        <th className="border-b border-border w-[60px] py-2 text-center font-medium">매핑</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => null)()}
                      {detail.items.map((item, idx) => {
                        const qty = parseFloat(item.quantity);
                        const up = parseFloat(item.unitPrice);
                        const origPrice = parseFloat(item.supplierProduct.unitPrice);
                        const discPerUnit = up < origPrice ? origPrice - up : 0;
                        const supplyLine = up * qty;
                        const taxLine = Math.round(supplyLine * 0.1);
                        const shipDisplay = detailShippingMap.get(item.id);
                        return (
                          <tr key={item.id} className="border-b border-border last:border-b-0 hover:bg-muted/50">
                            <td className="border-r border-border text-center text-muted-foreground py-1.5">{idx + 1}</td>
                            <td className="border-r border-border px-2 py-1.5 text-muted-foreground text-xs">{item.supplierProduct.supplierCode || ""}</td>
                            <td className="border-r border-border px-2 py-1.5 font-medium">{item.supplierProduct.name}</td>
                            <td className="border-r border-border px-2 py-1.5 text-muted-foreground">{item.supplierProduct.spec || ""}</td>
                            <td className="border-r border-border text-center text-muted-foreground py-1.5">{item.supplierProduct.unitOfMeasure}</td>
                            <td className="border-r border-border text-right px-2 py-1.5 tabular-nums">{qty.toLocaleString()}</td>
                            <td className="border-r border-border text-right px-2 py-1.5 tabular-nums">{formatPrice(origPrice)}</td>
                            <td className="border-r border-border text-right px-2 py-1.5 tabular-nums">{discPerUnit > 0 && <span className="text-red-400">-{formatPrice(discPerUnit)}</span>}</td>
                            <td className="border-r border-border text-right px-2 py-1.5 tabular-nums">{formatPrice(up)}</td>
                            <td className="border-r border-border text-right px-2 py-1.5 tabular-nums">{formatPrice(supplyLine)}</td>
                            <td className="border-r border-border text-right px-2 py-1.5 text-muted-foreground tabular-nums">{formatPrice(taxLine)}</td>
                            <td className="border-r border-border px-2 py-1.5 text-right tabular-nums">
                              {shipDisplay && shipDisplay.perUnit > 0 ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <span>₩{formatPrice(Math.round(shipDisplay.perUnit))}</span>
                                  <span
                                    className={`text-[10px] px-1 py-0.5 rounded ${
                                      shipDisplay.source === "ITEM"
                                        ? "bg-primary/10 text-primary"
                                        : shipDisplay.source === "ALLOCATED"
                                          ? "bg-muted text-muted-foreground"
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
                                <span className="text-xs text-muted-foreground">
                                  {shipDisplay?.source === "DEDUCTED" ? "차감(0)" : "—"}
                                </span>
                              )}
                            </td>
                            <td className="border-r border-border px-2 py-1.5 text-muted-foreground">{item.memo || ""}</td>
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
                      const orig = parseFloat(i.supplierProduct.unitPrice);
                      const cur = parseFloat(i.unitPrice);
                      return s + (orig > cur ? (orig - cur) * parseFloat(i.quantity) : 0);
                    }, 0);
                    return (
                      <div className="border-t border-border bg-muted">
                        <div className="grid grid-cols-5 text-sm">
                          <div className="border-r border-border px-3 py-2.5 flex items-center justify-between"><span className="text-xs text-muted-foreground">품목수</span><span>{detail.items.length}건</span></div>
                          <div className="border-r border-border px-3 py-2.5 flex items-center justify-between"><span className="text-xs text-muted-foreground">공급가액</span><span className="tabular-nums">₩{formatPrice(dSupply)}</span></div>
                          <div className="border-r border-border px-3 py-2.5 flex items-center justify-between"><span className="text-xs text-muted-foreground">세액</span><span className="tabular-nums">{dTax > 0 ? `₩${formatPrice(dTax)}` : ""}</span></div>
                          <div className="border-r border-border px-3 py-2.5 flex items-center justify-between"><span className="text-xs text-muted-foreground">할인합계</span><span className={`tabular-nums ${dDiscount > 0 ? "text-red-400" : ""}`}>{dDiscount > 0 ? `-₩${formatPrice(dDiscount)}` : ""}</span></div>
                          <div className="px-3 py-2.5 flex items-center justify-between"><span className="text-xs text-muted-foreground">합계금액</span><span className="font-bold text-base tabular-nums">₩{formatPrice(dSupply + dTax)}</span></div>
                        </div>
                        {parseFloat(detail.shippingCost) > 0 && (
                          <div className="border-t border-border px-3 py-2 flex items-center justify-between text-sm">
                            <span className="text-xs text-muted-foreground">
                              택배비{detail.shippingIsTaxable ? " (과세)" : " (면세)"}
                              {detail.shippingDeducted && " · 차감"}
                            </span>
                            <span className="tabular-nums">₩{formatPrice(parseFloat(detail.shippingCost))}</span>
                          </div>
                        )}
                        {itemOverrideTotal > 0 && (
                          <div className="border-t border-border px-3 py-2 flex items-center justify-between text-sm">
                            <span className="text-xs text-muted-foreground">품목 직접 운임 합계 (분배 제외)</span>
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
              <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
                <DialogContent className="max-w-sm">
                  <DialogHeader><DialogTitle>입고 확인</DialogTitle></DialogHeader>
                  <p className="text-sm text-muted-foreground">입고를 확인하시겠습니까?<br />재고가 증가하고 원장에 기록됩니다.</p>
                  {(() => {
                    const unmappedItems = detail.items.filter(
                      (i) => !i.supplierProduct.productMappings || i.supplierProduct.productMappings.length === 0
                    );
                    // 같은 상품이 여러 행(10+1 등)인 경우 품명 기준 중복 제거
                    const seenNames = new Set<string>();
                    const unmapped = unmappedItems.filter((i) => {
                      if (seenNames.has(i.supplierProduct.name)) return false;
                      seenNames.add(i.supplierProduct.name);
                      return true;
                    });
                    if (unmapped.length === 0) return null;
                    return (
                      <div className="mt-3 rounded-md bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-sm text-yellow-400">
                        <p className="font-medium">미매핑 항목 {unmapped.length}건</p>
                        <p className="text-xs mt-1 text-yellow-400/80">해당 항목은 재고에 반영되지 않습니다.</p>
                        <ul className="mt-1.5 space-y-0.5 text-xs">
                          {unmapped.map((i) => (
                            <li key={i.supplierProduct.name}>• {i.supplierProduct.name}</li>
                          ))}
                        </ul>
                      </div>
                    );
                  })()}
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setConfirmDialogOpen(false)} disabled={confirming}>취소</Button>
                    <Button onClick={() => handleConfirm(detail.id)} disabled={confirming}>
                      {confirming ? <Loader2 className="animate-spin" /> : <Check />}
                      <span>{confirming ? "처리 중..." : "입고 확인"}</span>
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
                <DialogContent className="max-w-sm">
                  <DialogHeader><DialogTitle>입고 취소</DialogTitle></DialogHeader>
                  <p className="text-sm text-muted-foreground">입고를 취소하시겠습니까?</p>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCancelDialogOpen(false)} disabled={cancelling}>닫기</Button>
                    <Button variant="destructive" onClick={() => handleCancel(detail.id)} disabled={cancelling}>
                      {cancelling ? <Loader2 className="animate-spin" /> : <X />}
                      <span>{cancelling ? "처리 중..." : "입고 취소"}</span>
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* 택배비 후기입 다이얼로그 */}
              <Dialog open={shippingEditOpen} onOpenChange={setShippingEditOpen}>
                <DialogContent className="max-w-md">
                  <DialogHeader><DialogTitle>택배비 {parseFloat(detail.shippingCost) > 0 ? "수정" : "추가"}</DialogTitle></DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                      <p className="text-xs text-muted-foreground">공급가액</p>
                      <input
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm tabular-nums text-right shadow-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={formatComma(shippingEditSupply)}
                        onChange={(e) => {
                          const v = parseComma(e.target.value);
                          setShippingEditSupply(v);
                          setShippingEditCost(shippingToTotal(v, shippingEditIsTaxable));
                        }}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <p className="text-xs text-muted-foreground">세액</p>
                      <input
                        disabled
                        className="flex h-9 w-full rounded-md border border-input bg-muted px-3 py-1 text-sm tabular-nums text-right text-muted-foreground"
                        type="text"
                        value={formatComma(String(Math.max(0, (parseFloat(shippingEditCost || "0") || 0) - (parseFloat(shippingEditSupply || "0") || 0))))}
                      />
                      <p className="text-xs text-muted-foreground">합계금액</p>
                      <input
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm tabular-nums text-right shadow-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={formatComma(shippingEditCost)}
                        onChange={(e) => {
                          const v = parseComma(e.target.value);
                          setShippingEditCost(v);
                          setShippingEditSupply(shippingToSupply(v, shippingEditIsTaxable));
                        }}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <div className="flex h-[30px] rounded-md border border-border bg-card text-[13px]">
                          <button
                            type="button"
                            className={`px-2.5 rounded-l-md ${shippingEditIsTaxable ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
                            onClick={() => {
                              setShippingEditIsTaxable(true);
                              setShippingEditSupply(shippingToSupply(shippingEditCost, true));
                            }}
                          >과세</button>
                          <button
                            type="button"
                            className={`px-2.5 rounded-r-md border-l border-border ${!shippingEditIsTaxable ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
                            onClick={() => {
                              setShippingEditIsTaxable(false);
                              setShippingEditSupply(shippingToSupply(shippingEditCost, false));
                            }}
                          >면세</button>
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={shippingEditDeducted}
                          onCheckedChange={(checked) => setShippingEditDeducted(!!checked)}
                        />
                        거래처 차감
                      </label>
                    </div>

                    {/* 품목별 운임 — 토글로 펼침 */}
                    <details className="rounded-md border border-border">
                      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium hover:bg-muted">
                        품목별 운임 (선택)
                      </summary>
                      <div className="border-t border-border p-2 max-h-[300px] overflow-y-auto space-y-2">
                        <p className="text-xs text-muted-foreground px-1">
                          입력한 품목은 전표 운임 분배에서 빠지고 자기 값을 사용합니다. 비워두면 분배 적용.
                        </p>
                        {detail.items.map((it) => {
                          const ov = shippingEditItemOverrides[it.id] ?? { value: "", taxable: true };
                          return (
                            <div key={it.id} className="grid grid-cols-[1fr_120px_50px] items-center gap-2 px-1">
                              <div className="text-xs truncate">
                                <span className="font-medium">{it.supplierProduct.name}</span>
                                {it.supplierProduct.supplierCode && (
                                  <span className="ml-1 text-muted-foreground">[{it.supplierProduct.supplierCode}]</span>
                                )}
                              </div>
                              <Input
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
                                onFocus={(e) => e.currentTarget.select()}
                                className="h-8 text-right tabular-nums text-xs"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setShippingEditItemOverrides((prev) => ({
                                    ...prev,
                                    [it.id]: { value: prev[it.id]?.value ?? "", taxable: !(prev[it.id]?.taxable ?? true) },
                                  }))
                                }
                                className={`h-8 rounded-md border text-[11px] ${
                                  ov.taxable ? "border-primary text-primary" : "border-border text-muted-foreground"
                                }`}
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
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShippingEditOpen(false)} disabled={shippingEditSaving}>취소</Button>
                    <Button onClick={handleShippingEdit} disabled={shippingEditSaving}>
                      {shippingEditSaving ? <Loader2 className="animate-spin" /> : null}
                      <span>{shippingEditSaving ? "저장 중..." : "저장"}</span>
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 입고 등록 — Sheet */}
      {/* ============================================================ */}
      <Sheet open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setEditingId(null); }}>
        <SheetContent side="bottom" className="h-[90vh] p-0 flex flex-col">
          <SheetHeader className="border-b border-border px-5 py-4 flex-shrink-0">
            <SheetTitle>{editingId ? "입고 수정" : "입고 등록"}</SheetTitle>
            <SheetDescription className="sr-only">입고 등록 거래명세표</SheetDescription>
          </SheetHeader>

          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <ScrollArea className="flex-1 min-h-0">
              {/* 상단 정보 */}
              <div className="px-5 py-4 border-b border-border grid grid-cols-1 gap-y-3">
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">입고일</p>
                  <DateInput
                    label=""
                    value={incomingDate}
                    onChange={setIncomingDate}
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">거래처</p>
                  <SupplierCombobox
                    suppliers={suppliers}
                    value={selectedSupplierId}
                    onChange={handleSupplierChange}
                    onCreateNew={handleCreateSupplier}
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">비고</p>
                  <Input
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder="특이사항"
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              {/* 품목 테이블 — 거래명세표 스타일 (인라인 입력) */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1040px] text-sm table-fixed">
                  <thead>
                    <tr className="bg-muted text-muted-foreground text-xs">
                      <th className="border-r border-b border-border w-[36px] py-2 text-center font-medium">번호</th>
                      <th className="border-r border-b border-border w-[100px] py-2 px-2 text-left font-medium">품번</th>
                      <th className="border-r border-b border-border w-[160px] py-2 px-2 text-left font-medium">품명</th>
                      <th className="border-r border-b border-border w-[100px] py-2 px-2 text-left font-medium">규격</th>
                      <th className="border-r border-b border-border w-[50px] py-2 text-center font-medium">단위</th>
                      <th className="border-r border-b border-border w-[70px] py-2 text-center font-medium">수량</th>
                      <th className="border-r border-b border-border w-[90px] py-1 text-center font-medium">
                        <div className="flex flex-col items-center gap-0.5">
                          <span>단가</span>
                          <button
                            type="button"
                            onClick={() => setUnitPriceVatIncluded((v) => !v)}
                            className={`text-[10px] leading-none px-1.5 py-0.5 rounded border ${
                              unitPriceVatIncluded
                                ? "bg-primary text-primary-foreground border-primary"
                                : "border-border text-muted-foreground hover:bg-muted/70"
                            }`}
                            title="ON: VAT포함 금액으로 입력 → 자동 ÷1.1 저장"
                          >
                            VAT포함
                          </button>
                        </div>
                      </th>
                      <th className="border-r border-b border-border w-[80px] py-2 text-center font-medium">할인</th>
                      <th className="border-r border-b border-border w-[90px] py-2 text-center font-medium">실제단가</th>
                      <th className="border-r border-b border-border w-[100px] py-2 text-center font-medium">공급가액</th>
                      <th className="border-r border-b border-border w-[84px] py-2 text-center font-medium">세액</th>
                      <th className="border-b border-border w-[80px] py-2 px-2 text-center font-medium">비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const isEmptyRow = !item.supplierProductId && !item.isNew;
                      const qty = parseFloat(item.quantity || "0");
                      const up = parseFloat(item.unitPrice || "0");
                      // 실제단가 = 단가 - 할인 적용
                      const discountPerUnit = calcDiscountPerUnit(up, item.discount);
                      const actualPrice = up - discountPerUnit;
                      // 공급가액 = 실제단가 × 수량, 세액 = 공급가액 × 10%
                      const lineSupply = item.supplyAmount ? parseFloat(item.supplyAmount) : actualPrice * qty;
                      const lineTax = Math.round(lineSupply * 0.1);

                      return (
                        <tr key={`row-${idx}`} className="group border-b border-border hover:bg-muted/50">
                          <td className="border-r border-border text-center text-muted-foreground py-1">{idx + 1}</td>

                          {/* 품번 */}
                          <td className="border-r border-border p-0.5">
                            <input
                              data-row={idx}
                              data-field="supplierCode"
                              value={item.supplierCode}
                              onChange={(e) => updateItem(idx, "supplierCode", e.target.value)}
                              disabled={isEmptyRow}
                              className="w-full h-7 bg-transparent text-sm px-2 outline-none focus:bg-muted rounded disabled:opacity-30"
                            />
                          </td>

                          {/* 품명 — 항상 콤보박스 */}
                          <td className="border-r border-border px-1 py-0.5">
                            {selectedSupplierId ? (
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
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground px-2">거래처를 선택하세요</span>
                            )}
                          </td>

                          {/* 규격 */}
                          <td className="border-r border-border p-0.5">
                            <input
                              data-row={idx}
                              data-field="spec"
                              value={item.spec}
                              onChange={(e) => updateItem(idx, "spec", e.target.value)}
                              disabled={isEmptyRow}
                              className="w-full h-7 bg-transparent text-sm px-2 outline-none focus:bg-muted rounded disabled:opacity-30"
                            />
                          </td>

                          {/* 단위 */}
                          <td className="border-r border-border text-center text-xs text-muted-foreground py-1">{item.unitOfMeasure}</td>

                          {/* 수량 */}
                          <td className="border-r border-border p-0.5">
                            <input
                              data-row={idx}
                              data-field="quantity"
                              value={item.quantity}
                              onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                              onBlur={() => recalcOnBlur(idx, "quantity")}
                              onFocus={(e) => { if (e.target.value === "0") updateItem(idx, "quantity", ""); }}
                              disabled={isEmptyRow}
                              className="w-full h-7 bg-transparent text-right text-sm px-2 outline-none focus:bg-muted rounded disabled:opacity-30"
                            />
                          </td>

                          {/* 단가 (부가세 미포함) — VAT포함 토글 ON이면 표시는 ×1.1, 저장은 round(input/1.1) */}
                          <td className="border-r border-border p-0.5">
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
                                    const { [idx]: _, ...rest } = prev;
                                    return rest;
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
                                else e.currentTarget.select();
                              }}
                              disabled={isEmptyRow}
                              className={`w-full h-7 bg-transparent text-right text-sm px-2 outline-none focus:bg-muted rounded disabled:opacity-30 ${
                                unitPriceVatIncluded ? "text-blue-600 dark:text-blue-400" : ""
                              }`}
                            />
                          </td>

                          {/* 할인 */}
                          <td className="border-r border-border p-0.5">
                            <input
                              data-row={idx}
                              data-field="discount"
                              inputMode={item.discount.trim().endsWith("%") ? "decimal" : "numeric"}
                              value={formatDiscountDisplay(item.discount)}
                              onChange={(e) => updateItem(idx, "discount", normalizeDiscountInput(e.target.value))}
                              onFocus={(e) => e.currentTarget.select()}
                              disabled={isEmptyRow || up === 0}
                              placeholder=""
                              className={`w-full h-7 bg-transparent text-right text-sm px-2 outline-none focus:bg-muted rounded disabled:opacity-30 ${discountPerUnit > 0 ? "text-red-400" : ""}`}
                            />
                          </td>

                          {/* 실제단가 = 단가 - 할인 */}
                          <td className="border-r border-border text-right px-2 py-1 tabular-nums">
                            {!isEmptyRow && actualPrice > 0 && formatPrice(actualPrice)}
                          </td>

                          {/* 공급가액 = 실제단가 × 수량 */}
                          <td className="border-r border-border p-0.5">
                            <input
                              data-row={idx}
                              data-field="supplyAmount"
                              inputMode="decimal"
                              value={formatCommaDecimal(item.supplyAmount)}
                              onChange={(e) => updateItem(idx, "supplyAmount", parseCommaDecimal(e.target.value))}
                              onBlur={() => recalcOnBlur(idx, "supplyAmount")}
                              onFocus={(e) => e.currentTarget.select()}
                              disabled={isEmptyRow}
                              placeholder={isEmptyRow ? "" : lineSupply ? formatPrice(lineSupply) : ""}
                              className="w-full h-7 bg-transparent text-right text-sm px-2 outline-none focus:bg-muted rounded disabled:opacity-30 tabular-nums placeholder:text-muted-foreground"
                            />
                          </td>

                          {/* 세액 = 공급가액 × 10% */}
                          <td className="border-r border-border text-right px-2 py-1 text-muted-foreground tabular-nums">
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
                                className="flex-1 h-7 bg-transparent text-sm px-2 outline-none focus:bg-muted rounded disabled:opacity-30 min-w-0"
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
                              <button type="button" onClick={() => removeItem(idx)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400 p-1 shrink-0">
                                <X className="size-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {/* 행 추가 버튼 행 */}
                    <tr>
                      <td colSpan={12} className="py-1.5 px-2">
                        <button
                          type="button"
                          onClick={addEmptyRow}
                          disabled={!selectedSupplierId}
                          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/70 transition-colors disabled:opacity-30 disabled:cursor-not-allowed px-1 py-0.5"
                        >
                          <Plus className="size-3.5" />
                          행 추가
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

                {/* 합계 — 거래명세표 하단 */}
                <div className="border-t border-border bg-muted">
                  <div className="grid grid-cols-5 text-sm">
                    <div className="border-r border-border px-3 py-2.5 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">품목수</span>
                      <span>{validItems.length}건</span>
                    </div>
                    <div className="border-r border-border px-3 py-2.5 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">공급가액</span>
                      <span className="tabular-nums">₩{formatPrice(supplyAmount)}</span>
                    </div>
                    <div className="border-r border-border px-3 py-2.5 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">세액</span>
                      <span className="tabular-nums">{taxAmount > 0 ? `₩${formatPrice(taxAmount)}` : ""}</span>
                    </div>
                    <div className="border-r border-border px-3 py-2.5 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">할인합계</span>
                      <span className={`tabular-nums ${totalDiscount > 0 ? "text-red-400" : ""}`}>
                        {totalDiscount > 0 ? `-₩${formatPrice(totalDiscount)}` : ""}
                      </span>
                    </div>
                    <div className="px-3 py-2.5 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">합계금액</span>
                      <span className="font-bold text-base tabular-nums">₩{formatPrice(supplyAmount + taxAmount)}</span>
                    </div>
                  </div>
                  {/* 배송비 입력 */}
                  <div className="border-t border-border px-3 py-2 flex items-center justify-end gap-3 flex-wrap">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <Checkbox
                        checked={shippingDeducted}
                        onCheckedChange={(checked) => setShippingDeducted(!!checked)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="text-xs text-muted-foreground">차감 결제</span>
                    </label>
                    <div className="flex h-7 rounded-md border border-border text-[12px] overflow-hidden">
                      <button
                        type="button"
                        onClick={() => {
                          setShippingIsTaxable(true);
                          setShippingSupply(shippingToSupply(shippingCost, true));
                        }}
                        className={`px-2.5 ${shippingIsTaxable ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
                      >과세</button>
                      <button
                        type="button"
                        onClick={() => {
                          setShippingIsTaxable(false);
                          setShippingSupply(shippingToSupply(shippingCost, false));
                        }}
                        className={`px-2.5 ${!shippingIsTaxable ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
                      >면세</button>
                    </div>
                    <span className="text-xs text-muted-foreground">배송비</span>
                    <span className="text-[11px] text-muted-foreground">공급가액</span>
                    <div className="relative w-32">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₩</span>
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
                        onFocus={(e) => e.currentTarget.select()}
                        className="w-full h-7 pl-5 pr-2 text-right text-[13px] bg-card border border-border rounded-md text-foreground tabular-nums focus:outline-none focus:border-brand/50"
                      />
                    </div>
                    <span className="text-[11px] text-muted-foreground">세액</span>
                    <div className="relative w-24">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₩</span>
                      <input
                        type="text"
                        disabled
                        value={formatComma(String(Math.max(0, (parseFloat(shippingCost || "0") || 0) - (parseFloat(shippingSupply || "0") || 0))))}
                        className="w-full h-7 pl-5 pr-2 text-right text-[13px] bg-muted border border-border rounded-md text-muted-foreground tabular-nums"
                      />
                    </div>
                    <span className="text-[11px] text-muted-foreground">합계</span>
                    <div className="relative w-32">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₩</span>
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
                        onFocus={(e) => e.currentTarget.select()}
                        className="w-full h-7 pl-5 pr-2 text-right text-[13px] bg-card border border-border rounded-md text-foreground tabular-nums focus:outline-none focus:border-brand/50"
                      />
                    </div>
                  </div>
                </div>

            </ScrollArea>

            {/* 하단 버튼 */}
            <div className="border-t border-border px-5 py-4 flex justify-end gap-2 bg-background">
              <Button type="button" variant="outline" onClick={() => { setCreateOpen(false); setEditingId(null); }}>
                취소
              </Button>
              <Button type="button" onClick={handleCreate} disabled={submitMutation.isPending || items.length === 0 || !selectedSupplierId}>
                {submitMutation.isPending ? <Loader2 className="animate-spin" /> : <Check />}
                <span>{submitMutation.isPending ? "처리 중..." : editingId ? "수정 저장" : "입고 등록"}</span>
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* 거래처 빠른 등록 Sheet */}
      <QuickSupplierSheet
        open={quickSupplierOpen}
        onOpenChange={setQuickSupplierOpen}
        defaultName={quickSupplierName}
        onCreated={handleQuickSupplierCreated}
      />

      {/* 삭제 확인 다이얼로그 */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>입고 삭제</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">정말 삭제하시겠습니까?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>취소</Button>
            <Button variant="destructive" onClick={() => deleteTarget && handleDelete(deleteTarget)} disabled={deleting}>
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              <span>{deleting ? "삭제 중..." : "삭제"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
