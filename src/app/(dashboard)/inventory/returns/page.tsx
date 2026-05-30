"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import {
  JmScope,
  JmButton,
  JmIconButton,
  JmBadge,
  JmCard,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
  JmTableToolbar,
  JmTableToolbarFilters,
  JmTableToolbarActions,
  JmSelect,
  JmScrollArea,
  JmSkeleton,
  JmInput,
  JmCheckbox,
  JmDatePicker,
  JmEmpty,
  JmDrawer,
  JmDrawerContent,
  JmDrawerHeader,
  JmDrawerTitle,
  JmDrawerDescription,
} from "@/jm";
import { focusCaretEnd } from "@/jm/lib/focus";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { SupplierCombobox } from "@/components/supplier-combobox";
import { InlineCellProductSearch } from "@/components/inline-cell-product-search";
import {
  Plus, X, RefreshCw, Loader2, ArrowUpRight, ChevronsUpDown, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { format, parse } from "date-fns";
import { QuickSupplierSheet, QuickSupplierProductSheet } from "@/components/quick-register-sheets";
import { formatComma, parseComma } from "@/lib/utils";

interface Supplier {
  id: string;
  name: string;
  businessNumber?: string | null;
}

interface SupplierProduct {
  id: string;
  name: string;
  spec?: string | null;
  supplierCode?: string | null;
  unitPrice: string;
  unitOfMeasure: string;
  isTaxable: boolean;
}

interface IncomingOption {
  id: string;
  incomingNo: string;
  incomingDate: string;
  totalAmount: number;
  _count: { items: number };
}

interface IncomingDetail {
  id: string;
  items: Array<{
    supplierProduct: { id: string; name: string; supplierCode: string | null; spec: string | null; unitOfMeasure: string; isTaxable: boolean };
    unitPrice: string;
  }>;
}

interface SupplierReturn {
  id: string;
  returnNo: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  returnDate: string;
  returnReason: string | null;
  memo: string | null;
  refundAmount: number;
  supplier: { name: string };
  createdBy: { name: string };
  _count: { items: number };
  exchangeIncoming: { id: string; incomingNo: string; status: string } | null;
}

interface ReturnDetail {
  id: string;
  returnNo: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  returnDate: string;
  returnReason: string | null;
  memo: string | null;
  supplier: { id: string; name: string; paymentMethod: string };
  createdBy: { name: string };
  items: Array<{
    id: string;
    quantity: string;
    unitPrice: string;
    totalPrice: string;
    memo: string | null;
    supplierProduct: { id: string; name: string; supplierCode: string | null; unitOfMeasure: string };
  }>;
  exchangeIncoming: { id: string; incomingNo: string; status: string } | null;
  returnCost: string | null;
  returnCostIsTaxable: boolean;
  returnCostType: "ADD" | "DEDUCT" | "SEPARATE" | null;
  returnCostNote: string | null;
}

interface ReturnItemForm {
  supplierProductId: string;
  supplierProductName: string;
  supplierCode: string;
  spec: string;
  unitOfMeasure: string;
  quantity: string;
  unitPrice: string;
  memo: string;
  fromIncoming: boolean;
  isTaxable: boolean;
}

const emptyItem = (): ReturnItemForm => ({
  supplierProductId: "",
  supplierProductName: "",
  supplierCode: "",
  spec: "",
  unitOfMeasure: "EA",
  quantity: "",
  unitPrice: "",
  memo: "",
  fromIncoming: false,
  isTaxable: true,
});

const statusLabels: Record<string, string> = {
  PENDING: "대기",
  CONFIRMED: "확정",
  CANCELLED: "취소",
};

const statusVariant: Record<string, "outline" | "default" | "danger" | "warning" | "success"> = {
  PENDING: "warning",
  CONFIRMED: "success",
  CANCELLED: "danger",
};

function ReturnsSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <JmTableRow key={i}>
          <JmTableCell><JmSkeleton className="h-4 w-28" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-32" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-24" /></JmTableCell>
          <JmTableCell className="text-right"><div className="flex justify-end"><JmSkeleton className="h-4 w-8" /></div></JmTableCell>
          <JmTableCell className="text-right"><div className="flex justify-end"><JmSkeleton className="h-4 w-20" /></div></JmTableCell>
          <JmTableCell><JmSkeleton className="h-5 w-12 rounded-full" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-24" /></JmTableCell>
        </JmTableRow>
      ))}
    </>
  );
}

// 날짜 입력 컴포넌트 — JmDatePicker 표준 래퍼 (값은 yyyy-MM-dd 문자열)
function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <JmDatePicker
      size="sm"
      value={value ? parse(value, "yyyy-MM-dd", new Date()) : undefined}
      onChange={(date) => { if (date) onChange(format(date, "yyyy-MM-dd")); }}
    />
  );
}

// 입고 선택 Combobox
function IncomingComboboxLocal({
  incomings,
  value,
  onChange,
  onClear,
  disabled,
}: {
  incomings: IncomingOption[];
  value: string;
  onChange: (id: string) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = incomings.find((i) => i.id === value);

  const filtered = incomings.filter((i) =>
    i.incomingNo.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative h-9">
      <PopoverPrimitive.Root open={open} onOpenChange={(o) => { setOpen(o); if (o) setSearch(""); }}>
        <PopoverPrimitive.Trigger
          disabled={disabled}
          className="relative flex h-9 max-h-9 box-border w-full items-center overflow-hidden rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] pl-3 pr-9 text-jm-sm text-[var(--jm-text)] cursor-pointer hover:border-[var(--jm-border-strong)] focus:outline-none focus-visible:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className={`truncate ${selected ? "" : "text-[var(--jm-text-subtle)]"}`}>
            {selected
              ? `${selected.incomingNo} — ${format(new Date(selected.incomingDate), "yyyy-MM-dd")} (${selected._count.items}종 / ₩${selected.totalAmount.toLocaleString("ko-KR")})`
              : disabled ? "거래처를 먼저 선택하세요" : "입고 선택 (선택하면 품목 자동완성)"}
          </span>
          <span className="absolute inset-y-0 right-2 flex items-center">
            {selected ? (
              <span
                role="button"
                className="inline-flex h-4 w-4 items-center justify-center rounded hover:bg-[var(--jm-surface-muted)] opacity-60 hover:opacity-100"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClear(); }}
              >
                <X className="h-3 w-3" />
              </span>
            ) : (
              <ChevronsUpDown className="h-4 w-4 opacity-50" />
            )}
          </span>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner align="start" sideOffset={6} className="isolate z-50">
            <PopoverPrimitive.Popup
              data-jm-scope
              className="w-(--anchor-width) p-0 rounded-xl bg-[var(--jm-surface)] ring-1 ring-[var(--jm-border)] shadow-[var(--jm-shadow-lg)] outline-none font-[family-name:var(--jm-font-sans)]"
            >
              <div className="border-b border-[var(--jm-border)] px-3 py-2">
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="입고번호 검색..."
                  className="h-7 w-full bg-transparent text-jm-sm text-[var(--jm-text)] placeholder:text-[var(--jm-text-subtle)] outline-none"
                />
              </div>
              <div className="max-h-[280px] overflow-y-auto p-1">
                {filtered.length === 0 ? (
                  <div className="px-3 py-6 text-center text-jm-sm text-[var(--jm-text-muted)]">입고 내역이 없습니다</div>
                ) : (
                  filtered.map((i) => (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => { onChange(i.id); setOpen(false); setSearch(""); }}
                      className={`flex w-full items-center rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--jm-surface-muted)] ${i.id === value ? "bg-[var(--jm-surface-muted)]" : ""}`}
                    >
                      <span className="font-mono text-jm-xs mr-2 text-[var(--jm-text)]">{i.incomingNo}</span>
                      <span className="text-[var(--jm-text-muted)] text-jm-xs mr-2">{format(new Date(i.incomingDate), "yyyy-MM-dd")}</span>
                      <span className="ml-auto text-jm-xs text-[var(--jm-text-muted)]">{i._count.items}종 · ₩{i.totalAmount.toLocaleString("ko-KR")}</span>
                    </button>
                  ))
                )}
              </div>
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  );
}

const formatPrice = (v: string | number) =>
  (typeof v === "string" ? parseFloat(v) : v).toLocaleString("ko-KR");

export default function SupplierReturnsPage() {
  const { resolvedTheme } = useTheme();
  const [returns, setReturns] = useState<SupplierReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // 등록 Sheet
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 상세 Sheet
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<ReturnDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // 등록 폼
  const [supplierId, setSupplierId] = useState("");
  const [returnDate, setReturnDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [returnReason, setReturnReason] = useState("");
  const [memo, setMemo] = useState("");
  const [isExchange, setIsExchange] = useState(false);
  const [returnCostSupply, setReturnCostSupply] = useState("");
  const [returnCostTax, setReturnCostTax] = useState("");
  const [returnCostType, setReturnCostType] = useState<"ADD" | "DEDUCT" | "SEPARATE" | "">("");
  const [returnCostNote, setReturnCostNote] = useState("");
  const [items, setItems] = useState<ReturnItemForm[]>([emptyItem()]);
  const [supplierProducts, setSupplierProducts] = useState<SupplierProduct[]>([]);

  // 입고 선택
  const [incomingOptions, setIncomingOptions] = useState<IncomingOption[]>([]);
  const [selectedIncomingId, setSelectedIncomingId] = useState("");

  // QuickSheet
  const [quickSupplierOpen, setQuickSupplierOpen] = useState(false);
  const [quickSupplierName, setQuickSupplierName] = useState("");
  const [quickSpOpen, setQuickSpOpen] = useState(false);
  const [quickSpName, setQuickSpName] = useState("");

  const fetchReturns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedSupplier !== "all") params.set("supplierId", selectedSupplier);
      if (statusFilter !== "all") params.set("status", statusFilter);
      setReturns(await apiGet<SupplierReturn[]>(`/api/supplier-returns?${params}`));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [selectedSupplier, statusFilter]);

  const fetchSuppliers = useCallback(async () => {
    try {
      setSuppliers(await apiGet<Supplier[]>("/api/suppliers"));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => { fetchReturns(); }, [fetchReturns]);
  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const fetchSupplierProducts = useCallback(async (sid: string) => {
    if (!sid) return;
    try {
      setSupplierProducts(await apiGet<SupplierProduct[]>(`/api/supplier-products?supplierId=${sid}`));
    } catch {
      // ignore
    }
  }, []);

  const resetForm = () => {
    setSupplierId("");
    setReturnDate(format(new Date(), "yyyy-MM-dd"));
    setReturnReason("");
    setMemo("");
    setIsExchange(false);
    setReturnCostSupply("");
    setReturnCostTax("");
    setReturnCostType("");
    setReturnCostNote("");
    setItems([emptyItem()]);
    setSupplierProducts([]);
    setIncomingOptions([]);
    setSelectedIncomingId("");
  };

  const handleSupplierChange = (id: string) => {
    setSupplierId(id);
    setItems([emptyItem()]);
    setSelectedIncomingId("");
    setIncomingOptions([]);
    fetchSupplierProducts(id);
    if (id) {
      apiGet<IncomingOption[]>(`/api/incoming?supplierId=${id}&status=CONFIRMED`)
        .then(setIncomingOptions)
        .catch(() => {});
    }
  };

  const handleIncomingSelect = async (incomingId: string) => {
    setSelectedIncomingId(incomingId);
    if (!incomingId) { setItems([emptyItem()]); return; }
    try {
      const data = await apiGet<IncomingDetail>(`/api/incoming/${incomingId}`);
      setItems(data.items.map((item) => ({
        supplierProductId: item.supplierProduct.id,
        supplierProductName: item.supplierProduct.name,
        supplierCode: item.supplierProduct.supplierCode ?? "",
        spec: item.supplierProduct.spec ?? "",
        unitOfMeasure: item.supplierProduct.unitOfMeasure,
        unitPrice: item.unitPrice,
        quantity: "",
        memo: "",
        fromIncoming: true,
        isTaxable: item.supplierProduct.isTaxable,
      })));
    } catch {
      toast.error("입고 정보를 불러오지 못했습니다");
    }
  };

  const selectProductForRow = (index: number, sp: SupplierProduct) => {
    if (items.some((item, i) => i !== index && item.supplierProductId === sp.id)) {
      toast.error("이미 추가된 상품입니다");
      return;
    }
    setItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? { ...item, supplierProductId: sp.id, supplierProductName: sp.name, supplierCode: sp.supplierCode ?? "", spec: sp.spec ?? "", unitOfMeasure: sp.unitOfMeasure, unitPrice: sp.unitPrice, isTaxable: sp.isTaxable }
          : item
      )
    );
    setTimeout(() => {
      const el = document.querySelector(`[data-rrow="${index}"][data-rfield="quantity"]`) as HTMLInputElement;
      el?.focus(); el?.select();
    }, 50);
  };

  const addEmptyRow = () => setItems((prev) => [...prev, emptyItem()]);

  const removeItem = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index));

  const updateItem = (index: number, field: keyof ReturnItemForm, value: string) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const validItems = items.filter((i) => i.supplierProductId);
  const totalAmount = validItems.reduce(
    (sum, i) => sum + (parseFloat(i.quantity) || 0) * (parseFloat(i.unitPrice) || 0),
    0
  );
  const goodsAmount = validItems.reduce((sum, item) => {
    const supply = (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
    const tax = item.isTaxable ? Math.round(supply * 0.1) : 0;
    return sum + supply + tax;
  }, 0);
  const returnCostTotal = Number(parseComma(returnCostSupply)) + Number(parseComma(returnCostTax));
  const costSign = returnCostType === "ADD" ? 1 : returnCostType === "DEDUCT" ? -1 : 0;
  const refundAmount = goodsAmount + costSign * returnCostTotal;

  const handleCreate = async () => {
    if (!supplierId) { toast.error("거래처를 선택해주세요"); return; }
    if (validItems.length === 0) { toast.error("반품 품목을 추가해주세요"); return; }

    setSubmitting(true);
    try {
      await apiMutate("/api/supplier-returns", "POST", {
        supplierId,
        returnDate,
        returnReason: returnReason || undefined,
        memo: memo || undefined,
        isExchange,
        returnCost: (() => {
          const total = Number(parseComma(returnCostSupply)) + Number(parseComma(returnCostTax));
          return total > 0 ? String(total) : undefined;
        })(),
        returnCostIsTaxable: true,
        returnCostType: (Number(parseComma(returnCostSupply)) > 0 && returnCostType) ? returnCostType : undefined,
        returnCostNote: returnCostNote || undefined,
        items: validItems.map((item) => ({
          supplierProductId: item.supplierProductId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          memo: item.memo || undefined,
        })),
      });
      toast.success("반품이 등록되었습니다");
      setCreateOpen(false);
      resetForm();
      fetchReturns();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "반품 등록 실패");
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = async (id: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      setDetail(await apiGet<ReturnDetail>(`/api/supplier-returns/${id}`));
    } catch {
      // ignore
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAction = async (action: "confirm" | "cancel") => {
    if (!detail) return;
    setActionLoading(true);
    try {
      await apiMutate(`/api/supplier-returns/${detail.id}`, "PUT", { action });
      toast.success(action === "confirm" ? "반품이 확정되었습니다" : "반품이 취소되었습니다");
      setDetailOpen(false);
      fetchReturns();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "처리 실패");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!detail) return;
    setActionLoading(true);
    try {
      await apiMutate(`/api/supplier-returns/${detail.id}`, "DELETE");
      toast.success("반품이 삭제되었습니다");
      setDetailOpen(false);
      fetchReturns();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "삭제 실패");
      return;
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <JmScope theme={resolvedTheme === "dark" ? "dark" : "light"} className="contents">
      <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
        <div className="flex w-full flex-col gap-6 p-4">
          <JmCard className="overflow-hidden p-0">
            <JmTableToolbar>
              <JmTableToolbarFilters>
                <JmSelect
                  variant="pill"
                  size="sm"
                  label="거래처"
                  value={selectedSupplier}
                  onChange={(v) => setSelectedSupplier(v ?? "all")}
                  options={[
                    { value: "all", label: "전체 거래처" },
                    ...suppliers.map((s) => ({ value: s.id, label: s.name })),
                  ]}
                />
                <JmSelect
                  variant="pill"
                  size="sm"
                  label="상태"
                  value={statusFilter}
                  onChange={(v) => setStatusFilter(v ?? "all")}
                  options={[
                    { value: "all", label: "전체 상태" },
                    { value: "PENDING", label: "대기" },
                    { value: "CONFIRMED", label: "확정" },
                    { value: "CANCELLED", label: "취소" },
                  ]}
                />
              </JmTableToolbarFilters>
              <JmTableToolbarActions>
                <JmIconButton
                  variant="ghost"
                  size="sm"
                  aria-label="새로고침"
                  onClick={fetchReturns}
                  disabled={loading}
                >
                  <RefreshCw className={loading ? "animate-spin" : ""} />
                </JmIconButton>
                <JmButton size="sm" onClick={() => { resetForm(); setCreateOpen(true); }}>
                  <Plus className="size-4" />
                  반품 등록
                </JmButton>
              </JmTableToolbarActions>
            </JmTableToolbar>

            <JmTable>
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead>반품번호</JmTableHead>
                  <JmTableHead>거래처</JmTableHead>
                  <JmTableHead>반품일</JmTableHead>
                  <JmTableHead className="text-right">품목수</JmTableHead>
                  <JmTableHead className="text-right">환불액</JmTableHead>
                  <JmTableHead>상태</JmTableHead>
                  <JmTableHead>교환 입고</JmTableHead>
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {loading ? (
                  <ReturnsSkeletonRows />
                ) : returns.length === 0 ? (
                  <JmTableRow className="hover:bg-transparent">
                    <JmTableCell colSpan={7} className="py-12">
                      <JmEmpty
                        icon={<RotateCcw className="size-8" />}
                        title="반품 내역이 없습니다"
                        description="거래처 반품을 등록하면 여기에 표시됩니다"
                      />
                    </JmTableCell>
                  </JmTableRow>
                ) : (
                  returns.map((r) => (
                    <JmTableRow key={r.id} className="cursor-pointer" onClick={() => openDetail(r.id)}>
                      <JmTableCell className="font-mono text-jm-xs">{r.returnNo}</JmTableCell>
                      <JmTableCell>{r.supplier.name}</JmTableCell>
                      <JmTableCell>{format(new Date(r.returnDate), "yyyy-MM-dd")}</JmTableCell>
                      <JmTableCell className="text-right tabular-nums">{r._count.items}</JmTableCell>
                      <JmTableCell className="text-right tabular-nums">₩{r.refundAmount.toLocaleString("ko-KR")}</JmTableCell>
                      <JmTableCell>
                        <JmBadge variant={statusVariant[r.status]}>{statusLabels[r.status]}</JmBadge>
                      </JmTableCell>
                      <JmTableCell onClick={(e) => e.stopPropagation()}>
                        {r.exchangeIncoming ? (
                          <Link href="/inventory/incoming" className="flex items-center gap-1 text-jm-xs text-[var(--jm-action)] hover:underline">
                            {r.exchangeIncoming.incomingNo}
                            <ArrowUpRight className="size-3" />
                          </Link>
                        ) : (
                          <span className="text-[var(--jm-text-muted)] text-jm-xs">-</span>
                        )}
                      </JmTableCell>
                    </JmTableRow>
                  ))
                )}
              </JmTableBody>
            </JmTable>
          </JmCard>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 반품 등록 Sheet (bottom) */}
      {/* ============================================================ */}
      <JmDrawer open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
        <JmDrawerContent side="bottom" size="xl" className="p-0" data-jm-theme={resolvedTheme === "dark" ? "dark" : "light"}>
          <JmDrawerHeader className="px-5 py-4">
            <JmDrawerTitle>반품 등록</JmDrawerTitle>
            <JmDrawerDescription className="sr-only">거래처 반품 등록</JmDrawerDescription>
          </JmDrawerHeader>

          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <JmScrollArea className="flex-1 min-h-0">
              {/* 상단 정보 */}
            <div className="px-5 py-4 border-b border-[var(--jm-border)] grid grid-cols-2 gap-x-8 gap-y-3">
              <div className="space-y-1.5">
                <p className="text-jm-xs text-[var(--jm-text-muted)]">거래처</p>
                <SupplierCombobox
                  suppliers={suppliers}
                  value={supplierId}
                  onChange={(id) => handleSupplierChange(id)}
                  onCreateNew={(name) => { setQuickSupplierName(name); setQuickSupplierOpen(true); }}
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-jm-xs text-[var(--jm-text-muted)]">반품일</p>
                <DateInput value={returnDate} onChange={setReturnDate} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <p className="text-jm-xs text-[var(--jm-text-muted)]">
                  기준 입고{" "}
                  <span className="text-[var(--jm-text-subtle)]">(선택하면 품목·단가 자동완성)</span>
                </p>
                <IncomingComboboxLocal
                  incomings={incomingOptions}
                  value={selectedIncomingId}
                  onChange={handleIncomingSelect}
                  onClear={() => { setSelectedIncomingId(""); setItems([emptyItem()]); }}
                  disabled={!supplierId}
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-jm-xs text-[var(--jm-text-muted)]">반품 사유</p>
                <JmInput
                  size="sm"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="반품 사유..."
                  disabled={!supplierId}
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-jm-xs text-[var(--jm-text-muted)]">메모</p>
                <JmInput
                  size="sm"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="메모..."
                  disabled={!supplierId}
                />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <JmCheckbox
                  size="sm"
                  checked={isExchange}
                  onCheckedChange={(checked) => setIsExchange(checked === true)}
                  disabled={!supplierId}
                />
                <span className={`text-jm-xs text-[var(--jm-text-muted)] ${!supplierId ? "opacity-40" : ""}`}>교환 포함 — 확정 시 교환 입고(대기) 자동 생성</span>
              </div>

              {/* 반품 비용 */}
              <div className={`col-span-2 space-y-1.5 ${!supplierId ? "opacity-40 pointer-events-none" : ""}`}>
                <p className="text-jm-xs text-[var(--jm-text-muted)]">반품 비용 <span className="text-[var(--jm-text-subtle)]">(택배비 등 발생 시)</span></p>
                <div className="flex rounded-lg border border-[var(--jm-border)] overflow-hidden text-jm-sm w-full">
                  {/* 공급가액 */}
                  <div className="flex flex-col border-r border-[var(--jm-border)]">
                    <div className="px-3 py-1 text-jm-xs text-[var(--jm-text-muted)] bg-[var(--jm-surface-muted)] border-b border-[var(--jm-border)] text-center whitespace-nowrap">공급가액</div>
                    <input
                      type="text" inputMode="numeric"
                      value={formatComma(returnCostSupply)}
                      onChange={(e) => { const s = parseComma(e.target.value); setReturnCostSupply(s); setReturnCostTax(String(Math.round(Number(s) * 0.1))); }}
                      onFocus={focusCaretEnd}
                      placeholder="0"
                      className="w-[110px] px-3 py-1.5 text-right bg-transparent outline-none focus:bg-[var(--jm-surface-muted)] tabular-nums text-[var(--jm-text)]"
                    />
                  </div>
                  {/* 세액 */}
                  <div className="flex flex-col border-r border-[var(--jm-border)]">
                    <div className="px-3 py-1 text-jm-xs text-[var(--jm-text-muted)] bg-[var(--jm-surface-muted)] border-b border-[var(--jm-border)] text-center">세액</div>
                    <input
                      type="text" inputMode="numeric"
                      value={formatComma(returnCostTax)}
                      onChange={(e) => setReturnCostTax(parseComma(e.target.value))}
                      onFocus={focusCaretEnd}
                      placeholder="0"
                      className="w-[90px] px-3 py-1.5 text-right bg-transparent outline-none focus:bg-[var(--jm-surface-muted)] tabular-nums text-[var(--jm-text)]"
                    />
                  </div>
                  {/* 반품액 */}
                  <div className="flex flex-col border-r border-[var(--jm-border)]">
                    <div className="px-3 py-1 text-jm-xs text-[var(--jm-text-muted)] bg-[var(--jm-surface-muted)] border-b border-[var(--jm-border)] text-center">반품액</div>
                    <div className="w-[110px] px-3 py-1.5 text-right font-medium tabular-nums text-[var(--jm-text)]">
                      {(() => { const t = Number(parseComma(returnCostSupply)) + Number(parseComma(returnCostTax)); return t > 0 ? `₩${t.toLocaleString("ko-KR")}` : <span className="text-[var(--jm-text-subtle)]">0</span>; })()}
                    </div>
                  </div>
                  {/* 유형 — 토글 버튼 (클릭 시 해제 가능) */}
                  <div className="flex flex-col border-r border-[var(--jm-border)]">
                    <div className="px-3 py-1 text-jm-xs text-[var(--jm-text-muted)] bg-[var(--jm-surface-muted)] border-b border-[var(--jm-border)] text-center">유형</div>
                    <div className="flex items-center gap-1 px-2 py-1.5">
                      {(["ADD", "DEDUCT", "SEPARATE"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setReturnCostType(returnCostType === t ? "" : t)}
                          className={`px-1.5 py-0.5 text-jm-xs rounded border transition-colors whitespace-nowrap ${
                            returnCostType === t
                              ? "bg-[var(--jm-action)]/10 border-[var(--jm-action)] text-[var(--jm-action)]"
                              : "border-[var(--jm-border)] text-[var(--jm-text-muted)] hover:border-[var(--jm-border-strong)] hover:text-[var(--jm-text)]"
                          }`}
                        >
                          {{ ADD: "거래처 청구", DEDUCT: "착불 차감", SEPARATE: "자체 부담" }[t]}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* 메모 */}
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="px-3 py-1 text-jm-xs text-[var(--jm-text-muted)] bg-[var(--jm-surface-muted)] border-b border-[var(--jm-border)]">메모</div>
                    <input
                      type="text"
                      value={returnCostNote}
                      onChange={(e) => setReturnCostNote(e.target.value)}
                      placeholder="예: CJ대한통운"
                      className="w-full px-3 py-1.5 bg-transparent outline-none focus:bg-[var(--jm-surface-muted)] text-jm-sm min-w-0 text-[var(--jm-text)]"
                    />
                  </div>
                </div>
                {returnCostType && (
                  <p className="text-jm-xs text-[var(--jm-text-muted)]">
                    {returnCostType === "ADD" && "우리가 택배비를 먼저 냈고, 거래처에서 돌려받아야 할 금액입니다. 반품 환불액에 이 비용이 더해집니다."}
                    {returnCostType === "DEDUCT" && "거래처가 반품 택배비를 착불로 받았고, 그만큼 우리에게 돌려줄 환불액에서 빠집니다."}
                    {returnCostType === "SEPARATE" && "우리가 택배비를 부담하며 거래처에 청구하지 않습니다. 환불액은 그대로이고 비용은 경비로만 기록됩니다."}
                  </p>
                )}
              </div>
            </div>

            {/* 품목 테이블 — 거래명세표 스타일 (입고 시트와 동일 구조) */}
            <table className="w-full text-jm-sm table-fixed">
              <thead>
                <tr className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-jm-xs">
                  <th className="border-r border-b border-[var(--jm-border)] w-[36px] py-2 text-center font-medium">번호</th>
                  <th className="border-r border-b border-[var(--jm-border)] w-[100px] py-2 px-2 text-left font-medium">품번</th>
                  <th className="border-r border-b border-[var(--jm-border)] w-[160px] py-2 px-2 text-left font-medium">품명</th>
                  <th className="border-r border-b border-[var(--jm-border)] w-[100px] py-2 px-2 text-left font-medium">규격</th>
                  <th className="border-r border-b border-[var(--jm-border)] w-[50px] py-2 text-center font-medium">단위</th>
                  <th className="border-r border-b border-[var(--jm-border)] w-[70px] py-2 text-center font-medium">수량</th>
                  <th className="border-r border-b border-[var(--jm-border)] w-[90px] py-2 text-center font-medium">단가</th>
                  <th className="border-r border-b border-[var(--jm-border)] w-[100px] py-2 text-center font-medium">공급가액</th>
                  <th className="border-r border-b border-[var(--jm-border)] w-[84px] py-2 text-center font-medium">세액</th>
                  <th className="border-b border-[var(--jm-border)] w-[80px] py-2 px-2 text-center font-medium">비고</th>
                </tr>
              </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const isEmptyRow = !item.supplierProductId;
                      const qty = parseFloat(item.quantity || "0");
                      const up = parseFloat(item.unitPrice || "0");
                      const lineSupply = qty * up;
                      const lineTax = item.isTaxable ? Math.round(lineSupply * 0.1) : 0;

                      return (
                        <tr key={idx} className="group border-b border-[var(--jm-border)] hover:bg-[var(--jm-surface-muted)]">
                          <td className="border-r border-[var(--jm-border)] text-center text-[var(--jm-text-muted)] py-1 text-jm-xs">{idx + 1}</td>

                          {/* 품번 */}
                          <td className="border-r border-[var(--jm-border)] px-1 py-0.5">
                            <input
                              value={item.supplierCode}
                              onChange={(e) => updateItem(idx, "supplierCode", e.target.value)}
                              disabled={isEmptyRow}
                              className="w-full h-7 bg-transparent text-jm-sm px-2 outline-none focus:bg-[var(--jm-surface-muted)] rounded disabled:opacity-30 text-[var(--jm-text)]"
                            />
                          </td>

                          {/* 품명 */}
                          <td className="border-r border-[var(--jm-border)] px-1 py-0.5">
                            {item.fromIncoming ? (
                              <span className="flex h-7 items-center px-2 text-jm-sm font-medium truncate text-[var(--jm-text)]">{item.supplierProductName}</span>
                            ) : supplierId ? (
                              <InlineCellProductSearch
                                rowIndex={idx}
                                products={supplierProducts}
                                onSelect={(sp) => selectProductForRow(idx, sp)}
                                onCreateNew={(name) => { setQuickSpName(name); setQuickSpOpen(true); }}
                                existingIds={items.map((i) => i.supplierProductId).filter(Boolean)}
                                selectedName={item.supplierProductName}
                                disableAlreadyAdded
                              />
                            ) : (
                              <span className="text-jm-xs text-[var(--jm-text-muted)] px-2">거래처를 선택하세요</span>
                            )}
                          </td>

                          {/* 규격 */}
                          <td className="border-r border-[var(--jm-border)] px-1 py-0.5">
                            <input
                              value={item.spec}
                              onChange={(e) => updateItem(idx, "spec", e.target.value)}
                              disabled={isEmptyRow}
                              className="w-full h-7 bg-transparent text-jm-sm px-2 outline-none focus:bg-[var(--jm-surface-muted)] rounded disabled:opacity-30 text-[var(--jm-text)]"
                            />
                          </td>

                          {/* 단위 */}
                          <td className="border-r border-[var(--jm-border)] text-center text-jm-xs text-[var(--jm-text-muted)] py-1">{item.unitOfMeasure}</td>

                          {/* 수량 */}
                          <td className="border-r border-[var(--jm-border)] p-0.5">
                            <input
                              data-rrow={idx}
                              data-rfield="quantity"
                              value={item.quantity}
                              onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                              onFocus={(e) => { if (e.target.value === "0") updateItem(idx, "quantity", ""); }}
                              disabled={isEmptyRow}
                              className="w-full h-7 bg-transparent text-right text-jm-sm px-2 outline-none focus:bg-[var(--jm-surface-muted)] rounded disabled:opacity-30 text-[var(--jm-text)]"
                            />
                          </td>

                          {/* 단가 */}
                          <td className="border-r border-[var(--jm-border)] p-0.5">
                            <input
                              data-rrow={idx}
                              data-rfield="unitPrice"
                              type="text"
                              inputMode="numeric"
                              value={formatComma(item.unitPrice)}
                              onChange={(e) => updateItem(idx, "unitPrice", parseComma(e.target.value))}
                              onFocus={(e) => { if (e.target.value === "0") updateItem(idx, "unitPrice", ""); else focusCaretEnd(e); }}
                              disabled={isEmptyRow}
                              className="w-full h-7 bg-transparent text-right text-jm-sm px-2 outline-none focus:bg-[var(--jm-surface-muted)] rounded disabled:opacity-30 tabular-nums text-[var(--jm-text)]"
                            />
                          </td>

                          {/* 공급가액 = 단가 × 수량 */}
                          <td className="border-r border-[var(--jm-border)] text-right px-2 py-1 tabular-nums text-[var(--jm-text)]">
                            {!isEmptyRow && lineSupply > 0 && formatPrice(lineSupply)}
                          </td>

                          {/* 세액 = 공급가액 × 10% (과세 시) */}
                          <td className="border-r border-[var(--jm-border)] text-right px-2 py-1 text-[var(--jm-text-muted)] tabular-nums">
                            {!isEmptyRow && lineTax > 0 && formatPrice(lineTax)}
                          </td>

                          {/* 비고 + 삭제 */}
                          <td className="p-0.5">
                            <div className="flex items-center gap-0.5">
                              <input
                                value={item.memo}
                                onChange={(e) => updateItem(idx, "memo", e.target.value)}
                                disabled={isEmptyRow}
                                className="flex-1 h-7 bg-transparent text-jm-sm px-2 outline-none focus:bg-[var(--jm-surface-muted)] rounded disabled:opacity-30 min-w-0 text-[var(--jm-text)]"
                                onKeyDown={(e) => {
                                  if (e.key === "Tab" && !e.shiftKey && idx === items.length - 1 && !isEmptyRow) {
                                    e.preventDefault();
                                    addEmptyRow();
                                  }
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => removeItem(idx)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--jm-text-muted)] hover:text-[var(--jm-danger-fg)] p-1 shrink-0"
                              >
                                <X className="size-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {/* 행 추가 버튼 행 */}
                    <tr>
                      <td colSpan={10} className="py-1.5 px-2">
                        <button
                          type="button"
                          onClick={addEmptyRow}
                          disabled={!supplierId}
                          className="flex items-center gap-1.5 text-jm-xs text-[var(--jm-action)] hover:opacity-70 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed px-1 py-0.5"
                        >
                          <Plus className="size-3.5" />
                          행 추가
                        </button>
                      </td>
                    </tr>
              </tbody>
            </table>

            {/* 합계 — 거래명세표 하단 (입고 시트와 동일 구조) */}
            <div className="border-t border-[var(--jm-border)] bg-[var(--jm-surface-muted)]">
              <div className="grid grid-cols-5 text-jm-sm">
                <div className="border-r border-[var(--jm-border)] px-3 py-2.5 flex items-center justify-between">
                  <span className="text-jm-xs text-[var(--jm-text-muted)]">품목수</span>
                  <span className="text-[var(--jm-text)]">{validItems.length}건</span>
                </div>
                <div className="border-r border-[var(--jm-border)] px-3 py-2.5 flex items-center justify-between">
                  <span className="text-jm-xs text-[var(--jm-text-muted)]">공급가액</span>
                  <span className="tabular-nums text-[var(--jm-text)]">₩{formatPrice(totalAmount)}</span>
                </div>
                <div className="border-r border-[var(--jm-border)] px-3 py-2.5 flex items-center justify-between">
                  <span className="text-jm-xs text-[var(--jm-text-muted)]">세액</span>
                  <span className="tabular-nums text-[var(--jm-text)]">{goodsAmount - totalAmount > 0 ? `₩${formatPrice(goodsAmount - totalAmount)}` : ""}</span>
                </div>
                <div className="border-r border-[var(--jm-border)] px-3 py-2.5 flex items-center justify-between">
                  <span className="text-jm-xs text-[var(--jm-text-muted)]">반품 비용</span>
                  <span className="tabular-nums text-[var(--jm-text)]">
                    {returnCostTotal > 0
                      ? `${costSign > 0 ? "+" : costSign < 0 ? "−" : ""}₩${formatPrice(returnCostTotal)}`
                      : ""}
                  </span>
                </div>
                <div className="px-3 py-2.5 flex items-center justify-between">
                  <span className="text-jm-xs text-[var(--jm-text-muted)]">환불 예상액</span>
                  <span className="font-bold text-jm-lg tabular-nums text-[var(--jm-text)]">₩{formatPrice(refundAmount)}</span>
                </div>
              </div>
            </div>
            </JmScrollArea>

            {/* 하단 버튼 */}
            <div className="border-t border-[var(--jm-border)] px-5 py-4 flex justify-end gap-2 bg-[var(--jm-surface)]">
              <JmButton type="button" variant="outline" size="sm" onClick={() => { setCreateOpen(false); resetForm(); }}>
                취소
              </JmButton>
              <JmButton type="button" size="sm" onClick={handleCreate} disabled={submitting || validItems.length === 0 || !supplierId}>
                {submitting ? <Loader2 className="animate-spin" /> : null}
                <span>{submitting ? "등록 중..." : "반품 등록"}</span>
              </JmButton>
            </div>
          </div>
        </JmDrawerContent>
      </JmDrawer>

      {/* 반품 상세 Sheet */}
      <JmDrawer open={detailOpen} onOpenChange={setDetailOpen}>
        <JmDrawerContent side="bottom" size="lg" className="p-0" data-jm-theme={resolvedTheme === "dark" ? "dark" : "light"}>
          <JmDrawerHeader className="px-5 py-4">
            <JmDrawerTitle>{detailLoading ? <JmSkeleton className="h-5 w-32" /> : detail?.returnNo}</JmDrawerTitle>
            <JmDrawerDescription className="sr-only">반품 상세</JmDrawerDescription>
          </JmDrawerHeader>

          {detailLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="size-5 animate-spin text-[var(--jm-text-muted)]" />
            </div>
          ) : detail ? (
            <>
              <JmScrollArea className="flex-1 min-h-0">
                {/* 상단 정보 */}
                <div className="px-5 py-4 border-b border-[var(--jm-border)] grid grid-cols-2 gap-x-8 gap-y-2 text-jm-sm">
                  <div className="flex gap-2">
                    <span className="text-jm-xs text-[var(--jm-text-muted)] w-16 shrink-0">거래처</span>
                    <span className="font-medium text-[var(--jm-text)]">{detail.supplier.name}</span>
                    <span className="text-jm-xs text-[var(--jm-text-muted)]">({detail.supplier.paymentMethod === "CREDIT" ? "외상" : "선불"})</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-jm-xs text-[var(--jm-text-muted)] w-16 shrink-0">반품번호</span>
                    <span className="font-mono text-jm-xs text-[var(--jm-text)]">{detail.returnNo}</span>
                    <JmBadge variant={statusVariant[detail.status]} className="ml-1">{statusLabels[detail.status]}</JmBadge>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-jm-xs text-[var(--jm-text-muted)] w-16 shrink-0">반품일</span>
                    <span className="text-[var(--jm-text)]">{new Date(detail.returnDate).toLocaleDateString("ko-KR")}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-jm-xs text-[var(--jm-text-muted)] w-16 shrink-0">등록자</span>
                    <span className="text-[var(--jm-text)]">{detail.createdBy.name}</span>
                  </div>
                  {detail.returnReason && (
                    <div className="flex gap-2 col-span-2">
                      <span className="text-jm-xs text-[var(--jm-text-muted)] w-16 shrink-0">반품 사유</span>
                      <span className="text-[var(--jm-text)]">{detail.returnReason}</span>
                    </div>
                  )}
                  {detail.memo && (
                    <div className="flex gap-2 col-span-2">
                      <span className="text-jm-xs text-[var(--jm-text-muted)] w-16 shrink-0">메모</span>
                      <span className="text-[var(--jm-text)]">{detail.memo}</span>
                    </div>
                  )}
                  {detail.returnCost && parseFloat(detail.returnCost) > 0 && (() => {
                    const total = parseFloat(detail.returnCost!);
                    const supply = Math.round(total / 1.1);
                    const tax = total - supply;
                    const typeLabel: Record<string, string> = { ADD: "거래처 청구", DEDUCT: "착불 차감", SEPARATE: "자체 부담" };
                    return (
                      <div className="flex gap-2 col-span-2 items-start">
                        <span className="text-jm-xs text-[var(--jm-text-muted)] w-16 shrink-0 pt-1.5">반품 비용</span>
                        <div className="flex rounded-lg border border-[var(--jm-border)] overflow-hidden text-jm-sm">
                          {[{ label: "공급가액", val: supply }, { label: "세액", val: tax }, { label: "반품액", val: total }].map((col) => (
                            <div key={col.label} className="flex flex-col border-r border-[var(--jm-border)]">
                              <div className="px-3 py-0.5 text-jm-xs text-[var(--jm-text-muted)] bg-[var(--jm-surface-muted)] border-b border-[var(--jm-border)] text-center whitespace-nowrap">{col.label}</div>
                              <div className="px-3 py-1 text-right tabular-nums text-[var(--jm-text)]">₩{col.val.toLocaleString("ko-KR")}</div>
                            </div>
                          ))}
                          {detail.returnCostType && (
                            <div className="flex flex-col border-r border-[var(--jm-border)]">
                              <div className="px-3 py-0.5 text-jm-xs text-[var(--jm-text-muted)] bg-[var(--jm-surface-muted)] border-b border-[var(--jm-border)] text-center">유형</div>
                              <div className="px-3 py-1 whitespace-nowrap text-[var(--jm-text)]">{typeLabel[detail.returnCostType]}</div>
                            </div>
                          )}
                          {detail.returnCostNote && (
                            <div className="flex flex-col">
                              <div className="px-3 py-0.5 text-jm-xs text-[var(--jm-text-muted)] bg-[var(--jm-surface-muted)] border-b border-[var(--jm-border)] text-center">메모</div>
                              <div className="px-3 py-1 text-[var(--jm-text-muted)]">{detail.returnCostNote}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  {detail.exchangeIncoming && (
                    <div className="flex gap-2 col-span-2">
                      <span className="text-jm-xs text-[var(--jm-text-muted)] w-16 shrink-0">교환 입고</span>
                      <Link href="/inventory/incoming" className="flex items-center gap-1 text-[var(--jm-action)] hover:underline">
                        {detail.exchangeIncoming.incomingNo}
                        <JmBadge variant="outline" className="text-jm-xs ml-1">
                          {statusLabels[detail.exchangeIncoming.status] ?? detail.exchangeIncoming.status}
                        </JmBadge>
                        <ArrowUpRight className="size-3.5" />
                      </Link>
                    </div>
                  )}
                </div>

                {/* 품목 테이블 */}
                <table className="w-full text-jm-sm">
                  <thead>
                    <tr className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-jm-xs">
                      <th className="border-r border-b border-[var(--jm-border)] w-[36px] py-2 text-center font-medium">번호</th>
                      <th className="border-r border-b border-[var(--jm-border)] py-2 px-2 text-left font-medium">품명</th>
                      <th className="border-r border-b border-[var(--jm-border)] py-2 px-2 text-left font-medium">품번</th>
                      <th className="border-r border-b border-[var(--jm-border)] w-[60px] py-2 text-center font-medium">단위</th>
                      <th className="border-r border-b border-[var(--jm-border)] w-[100px] py-2 text-center font-medium">수량</th>
                      <th className="border-r border-b border-[var(--jm-border)] w-[130px] py-2 text-center font-medium">단가</th>
                      <th className="border-b border-[var(--jm-border)] w-[130px] py-2 text-center font-medium">금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((item, idx) => (
                      <tr key={item.id} className="border-b border-[var(--jm-border)] last:border-b-0 hover:bg-[var(--jm-surface-muted)]">
                        <td className="border-r border-[var(--jm-border)] text-center text-[var(--jm-text-muted)] py-1.5 text-jm-xs">{idx + 1}</td>
                        <td className="border-r border-[var(--jm-border)] px-2 py-1.5 font-medium text-[var(--jm-text)]">{item.supplierProduct.name}</td>
                        <td className="border-r border-[var(--jm-border)] px-2 py-1.5 text-[var(--jm-text-muted)] text-jm-xs">{item.supplierProduct.supplierCode ?? "-"}</td>
                        <td className="border-r border-[var(--jm-border)] text-center text-[var(--jm-text-muted)] py-1.5">{item.supplierProduct.unitOfMeasure}</td>
                        <td className="border-r border-[var(--jm-border)] text-right px-2 py-1.5 tabular-nums text-[var(--jm-text)]">{parseFloat(item.quantity).toLocaleString("ko-KR")}</td>
                        <td className="border-r border-[var(--jm-border)] text-right px-2 py-1.5 tabular-nums text-[var(--jm-text)]">₩{formatPrice(item.unitPrice)}</td>
                        <td className="text-right px-2 py-1.5 tabular-nums text-[var(--jm-text)]">₩{formatPrice(item.totalPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* 합계 */}
                <div className="border-t border-[var(--jm-border)] bg-[var(--jm-surface-muted)]">
                  <div className="grid grid-cols-3 text-jm-sm">
                    <div className="border-r border-[var(--jm-border)] px-5 py-2.5 flex items-center justify-between">
                      <span className="text-jm-xs text-[var(--jm-text-muted)]">품목수</span>
                      <span className="text-[var(--jm-text)]">{detail.items.length}건</span>
                    </div>
                    <div className="col-span-2 px-5 py-2.5 flex items-center justify-between">
                      <span className="text-jm-xs text-[var(--jm-text-muted)]">합계금액</span>
                      <span className="font-bold text-jm-lg tabular-nums text-[var(--jm-text)]">
                        ₩{formatPrice(detail.items.reduce((s, i) => s + parseFloat(i.totalPrice), 0))}
                      </span>
                    </div>
                  </div>
                </div>
              </JmScrollArea>

              {detail.status === "PENDING" && (
                <div className="shrink-0 flex justify-between gap-2 px-6 py-3 border-t border-[var(--jm-border)]">
                  <JmButton variant="danger" size="sm" onClick={handleDelete} disabled={actionLoading}>
                    {actionLoading ? <Loader2 className="size-4 animate-spin" /> : "삭제"}
                  </JmButton>
                  <div className="flex gap-2">
                    <JmButton variant="outline" size="sm" onClick={() => handleAction("cancel")} disabled={actionLoading}>취소</JmButton>
                    <JmButton size="sm" onClick={() => handleAction("confirm")} disabled={actionLoading}>
                      {actionLoading ? <Loader2 className="size-4 animate-spin" /> : "확정"}
                    </JmButton>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </JmDrawerContent>
      </JmDrawer>

      <QuickSupplierSheet
        open={quickSupplierOpen}
        onOpenChange={setQuickSupplierOpen}
        defaultName={quickSupplierName}
        onCreated={(supplier) => {
          setSuppliers((prev) => [...prev, supplier]);
          handleSupplierChange(supplier.id);
        }}
      />

      <QuickSupplierProductSheet
        open={quickSpOpen}
        onOpenChange={setQuickSpOpen}
        defaultName={quickSpName}
        supplierId={supplierId}
        supplierName={suppliers.find((s) => s.id === supplierId)?.name ?? ""}
        onCreated={(sp) => {
          setSupplierProducts((prev) => [...prev, { ...sp, spec: null, supplierCode: null, unitOfMeasure: "EA", isTaxable: true }]);
        }}
      />
    </JmScope>
  );
}
