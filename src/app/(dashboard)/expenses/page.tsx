"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { focusCaretEnd } from "@/jm/lib/focus";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { format, startOfMonth, endOfMonth, startOfDay, subMonths } from "date-fns";
import { ko } from "date-fns/locale";
import {
  Pencil,
  Trash2,
  Loader2,
  ExternalLink,
  Download,
  ChevronLeft,
  ChevronRight,
  Coins,
  Receipt,
  RotateCcw,
  TrendingDown,
} from "lucide-react";
import { toast } from "sonner";

import {
  JmBadge,
  JmButton,
  JmCard,
  JmCheckbox,
  JmDatePicker,
  JmDateRangePicker,
  JmDialog,
  JmDialogContent,
  JmDialogDescription,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmEmpty,
  JmIconButton,
  JmInput,
  JmPill,
  JmSearchInput,
  JmSegmentedControl,
  JmSelect,
  JmSkeleton,
  JmSpinner,
  JmStat,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableFooter,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
  JmTableToolbar,
  JmTableToolbarActions,
  JmTableToolbarFilters,
  JmTableToolbarSearch,
} from "@/jm";
import { cn } from "@/lib/utils";
import { formatComma, parseComma, toCSV, downloadCSV } from "@/lib/utils";
import { SupplierCombobox } from "@/components/supplier-combobox";
import { CustomerCombobox } from "@/components/customer-combobox";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";
import { QuickSupplierSheet } from "@/components/quick-register-sheets";

import {
  CATEGORY_LABELS,
  USAGE_REASONS,
  REASON_LABELS,
  TARGET_REQUIRED_REASONS,
  CATEGORIES,
  PAYMENT_METHOD_LABELS,
  statusLabels,
  statusVariants,
  emptyForm,
  formatPrice,
  type UsageReasonKey,
  type Expense,
  type Summary,
  type PeriodTotals,
  type IncomingOption,
  type IncomingDetail,
} from "./_types";

export default function ExpensesPage() {
  const now = new Date();

  const router = useRouter();
  const queryClient = useQueryClient();

  // 캘린더 필터 (Date 타입)
  const [from, setFrom] = useState<Date | undefined>(startOfMonth(now));
  const [to, setTo] = useState<Date | undefined>(endOfMonth(now));
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  // 페이지네이션
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // 폼
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // SHIPPING 전용 상태
  const [incomings, setIncomings] = useState<IncomingOption[]>([]);
  const [selectedIncomingId, setSelectedIncomingId] = useState("");
  const [incomingLocked, setIncomingLocked] = useState(false);
  const [shippingIsTaxable, setShippingIsTaxable] = useState(true);
  const [shippingDeducted, setShippingDeducted] = useState(false);
  const [loadingIncomings, setLoadingIncomings] = useState(false);

  // 입고 상세 모달
  const [detailOpen, setDetailOpen] = useState(false);
  const [incomingDetail, setIncomingDetail] = useState<IncomingDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // 삭제
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 거래처 목록 (전 카테고리 연결용)
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string; businessNumber?: string | null }>>([]);
  const [quickSupplierOpen, setQuickSupplierOpen] = useState(false);
  const [quickSupplierDefaultName, setQuickSupplierDefaultName] = useState("");

  // 내 상품 사용 전용 상태
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string; phone?: string | null; businessNumber?: string | null }>>([]);
  const [usageReason, setUsageReason] = useState<UsageReasonKey>("SELF_USE");
  const [usageProductId, setUsageProductId] = useState("");
  const [usageQuantity, setUsageQuantity] = useState("");
  const [usageTargetType, setUsageTargetType] = useState<"supplier" | "customer">("supplier");
  const [usageCustomerId, setUsageCustomerId] = useState("");
  const [usagePreview, setUsagePreview] = useState<{ totalCost: number; available: number; sufficient: boolean } | null>(null);
  const [usagePreviewLoading, setUsagePreviewLoading] = useState(false);

  // 영수증 업로드 — 저장 시점에 실제 업로드 (취소 시 Storage에 고아 파일 남지 않음)
  const [pendingReceiptFile, setPendingReceiptFile] = useState<File | null>(null);
  const [removeExistingReceipt, setRemoveExistingReceipt] = useState(false);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingReceiptFile) {
      setPendingPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingReceiptFile);
    setPendingPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingReceiptFile]);

  const isImageByUrl = (url: string) => /\.(jpe?g|png|webp|gif|heic)(\?|#|$)/i.test(url);
  const isImageByMime = (mime: string) => mime.startsWith("image/");

  const getDisplayName = (name: string | null, url: string | null) => {
    if (name) return name;
    if (!url) return "영수증";
    try {
      const last = new URL(url).pathname.split("/").pop() || "";
      const basename = decodeURIComponent(last);
      if (/^[0-9a-f-]{20,}\.[a-z0-9]+$/i.test(basename)) return "영수증";
      return basename || "영수증";
    } catch {
      return "영수증";
    }
  };

  const fetchSuppliers = useCallback(async () => {
    try {
      const data = await apiGet<Array<{ id: string; name: string; businessNumber?: string | null }>>("/api/suppliers");
      setSuppliers(
        data.map((s) => ({ id: s.id, name: s.name, businessNumber: s.businessNumber ?? null })),
      );
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const fetchProducts = useCallback(async () => {
    try {
      const data = await apiGet<Array<{ id: string; name: string; sku: string; sellingPrice: string; unitOfMeasure: string; isSet: boolean }>>("/api/products");
      setProducts(
        data.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          sellingPrice: p.sellingPrice,
          unitCost: null,
          unitOfMeasure: p.unitOfMeasure,
          isSet: p.isSet,
        })),
      );
    } catch {
      // ignore
    }
  }, []);

  const fetchCustomers = useCallback(async () => {
    try {
      const data = await apiGet<Array<{ id: string; name: string; phone?: string | null; businessNumber?: string | null }>>("/api/customers");
      setCustomers(
        data.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone ?? null,
          businessNumber: c.businessNumber ?? null,
        })),
      );
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (formOpen && form.category === "INVENTORY_USAGE") {
      if (products.length === 0) fetchProducts();
      if (customers.length === 0) fetchCustomers();
    }
  }, [formOpen, form.category, products.length, customers.length, fetchProducts, fetchCustomers]);

  useEffect(() => {
    if (form.category !== "INVENTORY_USAGE") { setUsagePreview(null); return; }
    if (!usageProductId || !usageQuantity) { setUsagePreview(null); return; }
    const qty = Number(usageQuantity);
    if (!Number.isFinite(qty) || qty <= 0) { setUsagePreview(null); return; }
    let cancelled = false;
    setUsagePreviewLoading(true);
    apiGet<{ totalCost: number | string; available: number | string; sufficient: boolean }>(
      `/api/inventory/lot-preview?productId=${usageProductId}&quantity=${qty}`,
    )
      .then((data) => {
        if (cancelled) return;
        setUsagePreview({
          totalCost: Number(data.totalCost) || 0,
          available: Number(data.available) || 0,
          sufficient: !!data.sufficient,
        });
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setUsagePreviewLoading(false); });
    return () => { cancelled = true; };
  }, [form.category, usageProductId, usageQuantity]);

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
      if (from.getTime() === startOfMonth(now).getTime() && to.getTime() === endOfMonth(now).getTime()) return "이번달";
      const last = subMonths(now, 1);
      if (from.getTime() === startOfMonth(last).getTime() && to.getTime() === endOfMonth(last).getTime()) return "지난달";
      if (from.getTime() === startOfDay(subMonths(now, 3)).getTime() && to.getTime() === endOfMonth(now).getTime()) return "최근3개월";
    }
    return "커스텀";
  })();

  const expensesQuery = useQuery({
    queryKey: queryKeys.expenses.list({ from, to, search, categoryFilter, page }),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set("from", format(from, "yyyy-MM-dd"));
      if (to) {
        const toInc = new Date(to);
        toInc.setDate(toInc.getDate() + 1);
        params.set("to", format(toInc, "yyyy-MM-dd"));
      }
      if (search) params.set("q", search);
      if (categoryFilter !== "ALL") params.set("category", categoryFilter);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      return apiGet<{
        entries: Expense[];
        summary: Summary[];
        total?: number;
        totals?: PeriodTotals;
      }>(`/api/expenses?${params}`);
    },
  });

  const expenses = expensesQuery.data?.entries ?? [];
  const summary = expensesQuery.data?.summary ?? [];
  const periodTotals = expensesQuery.data?.totals ?? { all: 0, recoverable: 0, net: 0 };
  const loading = expensesQuery.isPending;
  const fetchData = () => queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
  useEffect(() => {
    setTotal(expensesQuery.data?.total ?? 0);
  }, [expensesQuery.data?.total]);

  useEffect(() => { setPage(1); }, [from, to, search, categoryFilter]);

  const loadIncomings = useCallback(async () => {
    setLoadingIncomings(true);
    try {
      const data = await apiGet<Array<{
        id: string;
        incomingNo: string;
        incomingDate: string;
        status: string;
        shippingCost: string | null;
        supplier: { name: string };
      }>>("/api/incoming");
      setIncomings(
        data
          .filter((i) => i.status === "CONFIRMED")
          .map((i) => ({
            id: i.id,
            incomingNo: i.incomingNo,
            incomingDate: i.incomingDate,
            supplierName: i.supplier.name,
            shippingCost: i.shippingCost ?? "0",
          }))
      );
    } catch {
      // ignore
    } finally {
      setLoadingIncomings(false);
    }
  }, []);

  useEffect(() => {
    if (formOpen && form.category === "SHIPPING") {
      loadIncomings();
    }
  }, [formOpen, form.category, loadIncomings]);

  const openDetailModal = async (incomingId: string) => {
    setDetailOpen(true);
    setLoadingDetail(true);
    setIncomingDetail(null);
    try {
      setIncomingDetail(await apiGet(`/api/incoming/${incomingId}`));
    } catch {
      // ignore
    } finally {
      setLoadingDetail(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setSelectedIncomingId("");
    setIncomingLocked(false);
    setShippingIsTaxable(true);
    setShippingDeducted(false);
    setPendingReceiptFile(null);
    setRemoveExistingReceipt(false);
    setUsageReason("SELF_USE");
    setUsageProductId("");
    setUsageQuantity("");
    setUsageTargetType("supplier");
    setUsageCustomerId("");
    setUsagePreview(null);
    setFormOpen(true);
  };

  const openEdit = async (e: Expense) => {
    if (e.referenceType === "INVENTORY_MOVEMENT") {
      toast.error("내 상품 사용 경비는 수정할 수 없습니다");
      return;
    }
    if (e.referenceType === "ORDER_SHIPPING_BORNE") {
      toast.info("주문의 배송 원가는 주문 상세에서 수정합니다");
      if (e.referenceId) router.push(`/orders?id=${e.referenceId}`);
      return;
    }
    setEditingId(e.id);
    setPendingReceiptFile(null);
    setRemoveExistingReceipt(false);
    setForm({
      date: e.date.split("T")[0] ?? "",
      amount: String(parseFloat(e.amount)),
      category: e.category,
      description: e.description,
      memo: e.memo ?? "",
      isTaxable: e.isTaxable ?? true,
      supplierId: e.supplierId ?? "",
      attachmentUrl: e.attachmentUrl ?? "",
      attachmentPath: e.attachmentPath ?? "",
      attachmentName: e.attachmentName ?? "",
      paymentMethod: e.paymentMethod ?? "",
      recoverable: e.recoverable ?? false,
    });

    if (e.referenceType === "INCOMING" && e.referenceId) {
      setSelectedIncomingId(e.referenceId ?? "");
      setIncomingLocked(true);
      setShippingIsTaxable(true);
      setShippingDeducted(false);
      try {
        const inc = await apiGet<{ shippingCost: string; shippingIsTaxable: boolean; shippingDeducted: boolean }>(
          `/api/incoming/${e.referenceId}`,
        );
        setForm((prev) => ({ ...prev, amount: String(parseFloat(inc.shippingCost) || 0) }));
        setShippingIsTaxable(inc.shippingIsTaxable);
        setShippingDeducted(inc.shippingDeducted);
      } catch {
        // ignore
      }
    } else {
      setSelectedIncomingId("");
      setIncomingLocked(false);
      setShippingIsTaxable(true);
      setShippingDeducted(false);
    }

    setFormOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (form.category === "INVENTORY_USAGE") {
        if (!form.date) { toast.error("날짜를 입력하세요"); return; }
        if (!usageProductId) { toast.error("상품을 선택하세요"); return; }
        if (!usageQuantity || Number(usageQuantity) <= 0) { toast.error("수량을 입력하세요"); return; }
        if (!usagePreview?.sufficient) { toast.error("재고가 부족합니다"); return; }

        const needsTarget = TARGET_REQUIRED_REASONS.includes(usageReason);
        const supplierId = needsTarget && usageTargetType === "supplier" ? (form.supplierId || null) : null;
        const customerId = needsTarget && usageTargetType === "customer" ? (usageCustomerId || null) : null;
        if (needsTarget && !supplierId && !customerId) {
          toast.error("샘플 용도는 거래처 또는 고객을 선택하세요");
          return;
        }

        try {
          await apiMutate("/api/expenses/inventory-usage", "POST", {
            date: form.date,
            productId: usageProductId,
            quantity: Number(usageQuantity),
            usageReason,
            supplierId,
            customerId,
            description: form.description || undefined,
            memo: form.memo || undefined,
          });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "저장 실패");
          return;
        }
        toast.success("내 상품 사용이 기록되었습니다");
        setFormOpen(false);
        fetchData();
        return;
      }

      if (form.category === "SHIPPING") {
        if (!selectedIncomingId) { toast.error("입고 거래명세서를 선택하세요"); return; }
        if (!form.amount) { toast.error("택배비 금액을 입력하세요"); return; }
        try {
          await apiMutate(`/api/incoming/${selectedIncomingId}`, "PUT", {
            action: "update-shipping",
            shippingCost: form.amount,
            shippingIsTaxable,
            shippingDeducted,
          });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "저장 실패");
          return;
        }
        toast.success("택배비가 저장되었습니다");
      } else {
        if (!form.date || !form.amount || !form.description) {
          toast.error("날짜, 금액, 설명은 필수입니다");
          return;
        }

        let finalAttachmentUrl = form.attachmentUrl;
        let finalAttachmentPath = form.attachmentPath;
        let finalAttachmentName = form.attachmentName;

        const willReplaceOrRemove = pendingReceiptFile !== null || removeExistingReceipt;
        if (willReplaceOrRemove && form.attachmentPath) {
          await apiMutate("/api/expenses/upload", "DELETE", { path: form.attachmentPath });
          finalAttachmentUrl = "";
          finalAttachmentPath = "";
          finalAttachmentName = "";
        }

        if (pendingReceiptFile) {
          const fd = new FormData();
          fd.append("file", pendingReceiptFile);
          const upRes = await fetch("/api/expenses/upload", { method: "POST", body: fd });
          if (!upRes.ok) {
            const err = await upRes.json();
            toast.error(typeof err.error === "string" ? err.error : "영수증 업로드 실패");
            return;
          }
          const up = await upRes.json();
          finalAttachmentUrl = up.url;
          finalAttachmentPath = up.path;
          finalAttachmentName = up.name ?? pendingReceiptFile.name;
        }

        const url = editingId ? `/api/expenses/${editingId}` : "/api/expenses";
        const method = editingId ? "PUT" : "POST";
        try {
          await apiMutate(url, method, {
            date: form.date,
            amount: form.amount,
            category: form.category,
            description: form.description,
            memo: form.memo || undefined,
            isTaxable: form.isTaxable,
            supplierId: form.supplierId || null,
            attachmentUrl: finalAttachmentUrl || null,
            attachmentPath: finalAttachmentPath || null,
            attachmentName: finalAttachmentName || null,
            paymentMethod: form.paymentMethod || null,
            recoverable: form.recoverable,
          });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "저장 실패");
          if (pendingReceiptFile && finalAttachmentPath) {
            await apiMutate("/api/expenses/upload", "DELETE", { path: finalAttachmentPath });
          }
          return;
        }
        toast.success(editingId ? "경비가 수정되었습니다" : "경비가 등록되었습니다");
      }
      setFormOpen(false);
      fetchData();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiMutate(`/api/expenses/${deleteTarget}`, "DELETE");
      toast.success("경비가 삭제되었습니다");
      setDeleteTarget(null);
      fetchData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "삭제 실패");
    } finally {
      setDeleting(false);
    }
  };

  const filtered = expenses;

  const filteredTotal =
    categoryFilter === "ALL"
      ? periodTotals.all
      : (summary.find((s) => s.category === categoryFilter)?.total ?? 0);
  const filteredRecoverable =
    categoryFilter === "ALL"
      ? periodTotals.recoverable
      : (summary.find((s) => s.category === categoryFilter)?.recoverable ?? 0);
  const filteredNet = filteredTotal - filteredRecoverable;

  const isShipping = form.category === "SHIPPING";
  const isUsage = form.category === "INVENTORY_USAGE";

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleExport = async () => {
    const params = new URLSearchParams();
    if (from) params.set("from", format(from, "yyyy-MM-dd"));
    if (to) {
      const toInc = new Date(to);
      toInc.setDate(toInc.getDate() + 1);
      params.set("to", format(toInc, "yyyy-MM-dd"));
    }
    if (search) params.set("q", search);
    if (categoryFilter !== "ALL") params.set("category", categoryFilter);
    params.set("pageSize", "500");
    let data: { entries: Expense[] };
    try {
      data = await apiGet(`/api/expenses?${params}`);
    } catch {
      toast.error("내보내기 실패");
      return;
    }
    const rows = data.entries.map((e) => ({
      date: format(new Date(e.date), "yyyy-MM-dd"),
      category: CATEGORY_LABELS[e.category] ?? e.category,
      description: e.description,
      supplierName: e.supplier?.name ?? "",
      amount: formatPrice(parseFloat(e.amount)),
      isTaxable: e.isTaxable ? "과세" : "면세",
      paymentMethod: e.paymentMethod ? (PAYMENT_METHOD_LABELS[e.paymentMethod] ?? e.paymentMethod) : "",
      recoverable: e.recoverable ? "회수예정" : "",
      createdBy: e.createdBy?.name ?? "",
      memo: e.memo ?? "",
    }));
    const csv = toCSV(rows, [
      { key: "date", label: "날짜" },
      { key: "category", label: "카테고리" },
      { key: "description", label: "설명" },
      { key: "supplierName", label: "거래처" },
      { key: "amount", label: "금액" },
      { key: "isTaxable", label: "부가세" },
      { key: "paymentMethod", label: "결제수단" },
      { key: "recoverable", label: "회수구분" },
      { key: "createdBy", label: "등록자" },
      { key: "memo", label: "메모" },
    ]);
    const fromStr = from ? format(from, "yyyyMMdd") : "all";
    const toStr = to ? format(to, "yyyyMMdd") : "all";
    downloadCSV(`경비_${fromStr}-${toStr}.csv`, csv);
  };

  // KPI — 기간 합계 / 회수예정 / 실비용 / 건수 (회수예정 0 일 때도 4개 유지)
  const kpiCount = total;
  const periodPresets = [
    { value: "thisMonth", label: "이번달" },
    { value: "lastMonth", label: "지난달" },
    { value: "last3", label: "최근3개월" },
    { value: "all", label: "전체" },
  ] as const;
  type PeriodPreset = (typeof periodPresets)[number]["value"];
  const activePeriodPreset =
    (periodPresets.find((p) => p.label === currentPresetLabel)?.value ?? "") as PeriodPreset | "";

  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="flex w-full flex-col gap-6 p-4">
        {/* KPI 4종 */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <JmStat
            label="기간 지출"
            value={loading ? "—" : `₩${formatPrice(periodTotals.all)}`}
            icon={<Receipt className="size-4" />}
            hint={loading ? "" : `${kpiCount.toLocaleString("ko-KR")}건`}
            size="sm"
          />
          <JmStat
            label="회수예정"
            value={loading ? "—" : `₩${formatPrice(periodTotals.recoverable)}`}
            icon={<RotateCcw className="size-4" />}
            hint={loading ? "" : "추후 회수 가능"}
            positiveIsGood={false}
            size="sm"
          />
          <JmStat
            label="실비용 (순 지출)"
            value={loading ? "—" : `₩${formatPrice(periodTotals.net)}`}
            icon={<TrendingDown className="size-4" />}
            hint={loading ? "" : "회수예정 차감"}
            positiveIsGood={false}
            size="sm"
          />
          <JmStat
            label="기간"
            value={
              from && to
                ? `${format(from, "MM.dd")} – ${format(to, "MM.dd")}`
                : "전체"
            }
            icon={<Coins className="size-4" />}
            hint={currentPresetLabel}
            size="sm"
          />
        </div>

        {/* 메인 카드 */}
        <JmCard className="overflow-hidden p-0">
          <JmTableToolbar>
            <JmTableToolbarSearch>
              <JmSearchInput
                size="sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClear={() => setSearch("")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    fetchData();
                  }
                }}
                placeholder="설명·메모·거래처"
              />
            </JmTableToolbarSearch>
            <JmTableToolbarFilters>
              {/* 기간 프리셋 — 세그먼티드 */}
              <JmSegmentedControl<PeriodPreset>
                size="sm"
                ariaLabel="기간 선택"
                options={periodPresets.map((p) => ({ value: p.value, label: p.label }))}
                value={activePeriodPreset as PeriodPreset}
                onChange={applyPreset}
              />
              <JmDateRangePicker
                size="sm"
                value={{ from, to }}
                onChange={(range) => {
                  setFrom(range?.from);
                  setTo(range?.to);
                }}
                placeholder="기간 선택"
                className="w-[240px]"
              />
              {/* 카테고리 pills */}
              <span className="mx-1 h-5 w-px bg-[var(--jm-border)]" />
              <JmPill
                size="sm"
                active={categoryFilter === "ALL"}
                onClick={() => setCategoryFilter("ALL")}
              >
                전체
                {periodTotals.all > 0 && (
                  <span className="ml-1 tabular-nums text-jm-3xs opacity-70">
                    ₩{formatPrice(periodTotals.all)}
                  </span>
                )}
              </JmPill>
              {CATEGORIES.map((cat) => {
                const s = summary.find((x) => x.category === cat);
                const t = s?.total ?? 0;
                return (
                  <JmPill
                    key={cat}
                    size="sm"
                    active={categoryFilter === cat}
                    onClick={() => setCategoryFilter(cat)}
                  >
                    {CATEGORY_LABELS[cat]}
                    {t > 0 && (
                      <span className="ml-1 tabular-nums text-jm-3xs opacity-70">
                        ₩{formatPrice(t)}
                      </span>
                    )}
                  </JmPill>
                );
              })}
            </JmTableToolbarFilters>
            <JmTableToolbarActions>
              <JmButton
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={loading || total === 0}
              >
                <Download className="size-4" />
                <span>CSV</span>
              </JmButton>
              <JmButton variant="cta" size="sm" onClick={openCreate}>
                경비 추가
              </JmButton>
            </JmTableToolbarActions>
          </JmTableToolbar>

          <div className="overflow-x-auto">
            <JmTable className="min-w-[900px]">
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead className="w-[100px]">날짜</JmTableHead>
                  <JmTableHead className="w-[100px]">카테고리</JmTableHead>
                  <JmTableHead>설명</JmTableHead>
                  <JmTableHead className="w-[100px]">결제</JmTableHead>
                  <JmTableHead>메모</JmTableHead>
                  <JmTableHead className="w-[140px] text-right">금액</JmTableHead>
                  <JmTableHead className="w-[80px]" />
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <JmTableRow key={`sk-${i}`} className="hover:bg-transparent">
                      <JmTableCell><JmSkeleton className="h-4 w-20" /></JmTableCell>
                      <JmTableCell><JmSkeleton className="h-4 w-16" /></JmTableCell>
                      <JmTableCell><JmSkeleton className="h-4 w-48" /></JmTableCell>
                      <JmTableCell><JmSkeleton className="h-4 w-12" /></JmTableCell>
                      <JmTableCell><JmSkeleton className="h-4 w-32" /></JmTableCell>
                      <JmTableCell className="text-right">
                        <div className="flex justify-end"><JmSkeleton className="h-4 w-20" /></div>
                      </JmTableCell>
                      <JmTableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <JmSkeleton className="h-7 w-7 rounded-md" />
                          <JmSkeleton className="h-7 w-7 rounded-md" />
                        </div>
                      </JmTableCell>
                    </JmTableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <JmTableRow className="hover:bg-transparent">
                    <JmTableCell colSpan={7} className="py-12">
                      <JmEmpty
                        icon={<Receipt className="size-8" />}
                        title="해당 기간 경비 내역이 없습니다"
                        description="기간이나 카테고리 필터를 바꾸거나 새 경비를 추가하세요"
                      />
                    </JmTableCell>
                  </JmTableRow>
                ) : (
                  filtered.map((e) => (
                    <JmTableRow key={e.id}>
                      <JmTableCell className="text-[var(--jm-text-muted)] text-jm-xs tabular-nums">
                        {format(new Date(e.date), "yyyy.MM.dd", { locale: ko })}
                      </JmTableCell>
                      <JmTableCell className="text-jm-sm">
                        {CATEGORY_LABELS[e.category] ?? e.category}
                      </JmTableCell>
                      <JmTableCell className="whitespace-normal">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span>{e.description}</span>
                          {e.recoverable && (
                            <JmBadge variant="warning" size="sm">
                              회수예정
                            </JmBadge>
                          )}
                          {e.referenceType === "ORDER_SHIPPING_BORNE" && (
                            <JmBadge variant="info" size="sm">
                              주문 자동
                            </JmBadge>
                          )}
                        </div>
                      </JmTableCell>
                      <JmTableCell className="text-[var(--jm-text-muted)] text-jm-xs">
                        {e.paymentMethod ? (PAYMENT_METHOD_LABELS[e.paymentMethod] ?? e.paymentMethod) : "—"}
                      </JmTableCell>
                      <JmTableCell className="text-[var(--jm-text-muted)] text-jm-xs whitespace-normal">
                        {e.memo ?? ""}
                      </JmTableCell>
                      <JmTableCell
                        className={cn(
                          "text-right tabular-nums font-medium",
                          e.recoverable && "text-[var(--jm-text-muted)] line-through",
                        )}
                      >
                        ₩{formatPrice(parseFloat(e.amount))}
                      </JmTableCell>
                      <JmTableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <JmIconButton
                            size="sm"
                            variant="ghost"
                            aria-label="수정"
                            onClick={() => openEdit(e)}
                          >
                            <Pencil />
                          </JmIconButton>
                          {!e.referenceType && (
                            <JmIconButton
                              size="sm"
                              variant="ghost"
                              aria-label="삭제"
                              className="text-[var(--jm-danger-fg)]"
                              onClick={() => setDeleteTarget(e.id)}
                            >
                              <Trash2 />
                            </JmIconButton>
                          )}
                        </div>
                      </JmTableCell>
                    </JmTableRow>
                  ))
                )}
              </JmTableBody>
              {filtered.length > 0 && (
                <JmTableFooter>
                  <JmTableRow className="hover:bg-[var(--jm-surface-muted)]">
                    <JmTableCell colSpan={5} className="text-jm-xs text-[var(--jm-text-muted)]">
                      {total}건 중 {(page - 1) * PAGE_SIZE + 1}–
                      {Math.min(page * PAGE_SIZE, total)}
                    </JmTableCell>
                    <JmTableCell className="text-right tabular-nums">
                      <div className="flex flex-col items-end gap-0.5">
                        <div className="font-bold">
                          총 지출 ₩{formatPrice(filteredTotal)}
                        </div>
                        {filteredRecoverable > 0 && (
                          <>
                            <div className="text-jm-xs text-[var(--jm-warning-fg)]">
                              회수예정 ₩{formatPrice(filteredRecoverable)}
                            </div>
                            <div className="text-jm-xs text-[var(--jm-text-muted)]">
                              실비용 ₩{formatPrice(filteredNet)}
                            </div>
                          </>
                        )}
                      </div>
                    </JmTableCell>
                    <JmTableCell />
                  </JmTableRow>
                </JmTableFooter>
              )}
            </JmTable>
          </div>

          {/* 페이지네이션 */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-[var(--jm-border)] px-4 py-2.5">
              <span className="text-jm-xs text-[var(--jm-text-muted)]">
                총 {total.toLocaleString("ko-KR")}건 ·{" "}
                {((page - 1) * PAGE_SIZE + 1).toLocaleString("ko-KR")}–
                {Math.min(page * PAGE_SIZE, total).toLocaleString("ko-KR")}
              </span>
              <div className="flex items-center gap-2">
                <JmIconButton
                  variant="outline"
                  size="sm"
                  aria-label="이전 페이지"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft />
                </JmIconButton>
                <span className="text-jm-xs text-[var(--jm-text-muted)] tabular-nums">
                  {page} / {totalPages}
                </span>
                <JmIconButton
                  variant="outline"
                  size="sm"
                  aria-label="다음 페이지"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight />
                </JmIconButton>
              </div>
            </div>
          )}
        </JmCard>
      </div>

      {/* ── 경비 등록/수정 다이얼로그 ── */}
      <JmDialog open={formOpen} onOpenChange={setFormOpen}>
        <JmDialogContent size="md">
          <JmDialogHeader>
            <JmDialogTitle>{editingId ? "경비 수정" : "경비 추가"}</JmDialogTitle>
            <JmDialogDescription className="sr-only">경비를 등록하거나 수정합니다</JmDialogDescription>
          </JmDialogHeader>
          <div className="px-6 py-4 space-y-3 min-w-0 overflow-y-auto max-h-[70vh]">
            {/* 카테고리 */}
            <div className="space-y-1">
              <p className="text-jm-xs text-[var(--jm-text-muted)]">카테고리</p>
              <JmSelect
                size="sm"
                value={form.category}
                onChange={(v) => {
                  setForm({ ...form, category: v || "OTHER", amount: "" });
                  setSelectedIncomingId("");
                  setShippingIsTaxable(true);
                  setShippingDeducted(false);
                }}
                options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] ?? c }))}
              />
            </div>

            {isUsage ? (
              /* ── 내 상품 사용 전용 폼 ── */
              <>
                <div className="space-y-1">
                  <p className="text-jm-xs text-[var(--jm-text-muted)]">
                    날짜 <span className="text-[var(--jm-danger-fg)]">*</span>
                  </p>
                  <JmDatePicker
                    size="sm"
                    value={form.date ? new Date(`${form.date}T00:00:00`) : undefined}
                    onChange={(d) => setForm({ ...form, date: d ? format(d, "yyyy-MM-dd") : "" })}
                    placeholder="날짜 선택"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-jm-xs text-[var(--jm-text-muted)]">
                    상품 <span className="text-[var(--jm-danger-fg)]">*</span>
                  </p>
                  <ProductCombobox
                    products={products}
                    value={usageProductId}
                    onChange={(p) => setUsageProductId(p.id)}
                    filterType="component"
                    placeholder="상품 선택..."
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-jm-xs text-[var(--jm-text-muted)]">
                    수량 <span className="text-[var(--jm-danger-fg)]">*</span>
                  </p>
                  <JmInput
                    size="sm"
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={usageQuantity}
                    onChange={(e) => setUsageQuantity(e.target.value)}
                    onFocus={focusCaretEnd}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-jm-xs text-[var(--jm-text-muted)]">
                    용도 <span className="text-[var(--jm-danger-fg)]">*</span>
                  </p>
                  <JmSelect
                    size="sm"
                    value={usageReason}
                    onChange={(v) => setUsageReason((v || "SELF_USE") as UsageReasonKey)}
                    options={USAGE_REASONS.map((r) => ({ value: r, label: REASON_LABELS[r] }))}
                  />
                </div>

                {TARGET_REQUIRED_REASONS.includes(usageReason) && (
                  <div className="space-y-1">
                    <p className="text-jm-xs text-[var(--jm-text-muted)]">
                      대상 <span className="text-[var(--jm-danger-fg)]">*</span>
                    </p>
                    <JmSegmentedControl
                      size="sm"
                      value={usageTargetType}
                      onChange={(v) => {
                        if (v === "supplier") {
                          setUsageTargetType("supplier");
                          setUsageCustomerId("");
                        } else {
                          setUsageTargetType("customer");
                          setForm((prev) => ({ ...prev, supplierId: "" }));
                        }
                      }}
                      options={[
                        { value: "supplier", label: "거래처" },
                        { value: "customer", label: "고객" },
                      ]}
                    />
                    {usageTargetType === "supplier" ? (
                      <SupplierCombobox
                        suppliers={suppliers}
                        value={form.supplierId}
                        onChange={(id) => setForm({ ...form, supplierId: id })}
                        onCreateNew={(name) => {
                          setQuickSupplierDefaultName(name);
                          setQuickSupplierOpen(true);
                        }}
                        clearable
                      />
                    ) : (
                      <CustomerCombobox
                        customers={customers}
                        value={usageCustomerId}
                        onChange={(id) => setUsageCustomerId(id)}
                        onCreateNew={() => {
                          toast.error("고객은 고객 페이지에서 먼저 등록하세요");
                        }}
                        placeholder="고객 선택..."
                      />
                    )}
                  </div>
                )}

                <div className="space-y-1">
                  <p className="text-jm-xs text-[var(--jm-text-muted)]">
                    설명 <span className="text-jm-3xs">(비워두면 자동 생성)</span>
                  </p>
                  <JmInput
                    size="sm"
                    type="text"
                    placeholder="예: 전시용 샘플 2개"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <p className="text-jm-xs text-[var(--jm-text-muted)]">메모</p>
                  <JmInput
                    size="sm"
                    type="text"
                    placeholder="메모 (선택)"
                    value={form.memo}
                    onChange={(e) => setForm({ ...form, memo: e.target.value })}
                  />
                </div>

                {/* 금액 프리뷰 */}
                <div className="rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] px-3 py-2 space-y-1 text-jm-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--jm-text-muted)] text-jm-xs">현재 로트 잔량</span>
                    <span className="tabular-nums">
                      {usagePreview ? usagePreview.available : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span className="text-jm-xs">경비 금액 (FIFO 원가)</span>
                    <span className="tabular-nums">
                      {usagePreviewLoading
                        ? "계산 중..."
                        : usagePreview
                          ? usagePreview.sufficient
                            ? `₩${formatPrice(usagePreview.totalCost)}`
                            : "재고 부족"
                          : "—"}
                    </span>
                  </div>
                  <p className="text-jm-3xs text-[var(--jm-text-muted)]">
                    등록 시 재고 로트 FIFO 차감 + 경비(자동 계산) 기록. 확정 후 수정·삭제 불가.
                  </p>
                </div>
              </>
            ) : isShipping ? (
              /* ── 택배비 전용 폼 ── */
              <>
                <div className="space-y-1">
                  <p className="text-jm-xs text-[var(--jm-text-muted)]">
                    입고 거래명세서 <span className="text-[var(--jm-danger-fg)]">*</span>
                  </p>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      {loadingIncomings ? (
                        <JmSkeleton className="h-9 w-full" />
                      ) : (
                        <JmSelect
                          size="sm"
                          value={selectedIncomingId}
                          onChange={(v) => {
                            setSelectedIncomingId(v || "");
                            const inc = incomings.find((i) => i.id === v);
                            if (inc && parseFloat(inc.shippingCost) > 0) {
                              setForm((prev) => ({ ...prev, amount: String(parseFloat(inc.shippingCost)) }));
                            }
                          }}
                          disabled={incomingLocked}
                          placeholder="입고 선택..."
                          options={incomings.map((i) => {
                            const existing = parseFloat(i.shippingCost) > 0
                              ? ` · ₩${formatPrice(parseFloat(i.shippingCost))}`
                              : "";
                            return {
                              value: i.id,
                              label: `${i.incomingNo} — ${i.supplierName} (${format(new Date(i.incomingDate), "yy.MM.dd", { locale: ko })})${existing}`,
                            };
                          })}
                        />
                      )}
                    </div>
                    {selectedIncomingId && (
                      <JmIconButton
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-label="자세히 보기"
                        onClick={() => openDetailModal(selectedIncomingId)}
                      >
                        <ExternalLink />
                      </JmIconButton>
                    )}
                  </div>
                  {incomingLocked && (
                    <p className="text-jm-xs text-[var(--jm-text-muted)]">입고에 연결된 택배비입니다</p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-jm-xs text-[var(--jm-text-muted)]">
                    택배비 금액 <span className="text-[var(--jm-danger-fg)]">*</span>
                  </p>
                  <JmInput
                    size="sm"
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={formatComma(form.amount)}
                    onChange={(e) => setForm({ ...form, amount: parseComma(e.target.value) })}
                    onFocus={focusCaretEnd}
                  />
                </div>
                <div className="flex items-center gap-4">
                  <JmSegmentedControl
                    size="sm"
                    value={shippingIsTaxable ? "taxable" : "free"}
                    onChange={(v) => setShippingIsTaxable(v === "taxable")}
                    options={[
                      { value: "taxable", label: "과세" },
                      { value: "free", label: "면세" },
                    ]}
                  />
                  <label className="flex items-center gap-2 text-jm-sm cursor-pointer">
                    <JmCheckbox
                      checked={shippingDeducted}
                      onCheckedChange={(v) => setShippingDeducted(v === true)}
                    />
                    <span className="text-[var(--jm-text)]">거래처 차감</span>
                  </label>
                </div>
              </>
            ) : (
              /* ── 일반 경비 폼 ── */
              <>
                <div className="space-y-1">
                  <p className="text-jm-xs text-[var(--jm-text-muted)]">
                    날짜 <span className="text-[var(--jm-danger-fg)]">*</span>
                  </p>
                  <JmDatePicker
                    size="sm"
                    value={form.date ? new Date(`${form.date}T00:00:00`) : undefined}
                    onChange={(d) => setForm({ ...form, date: d ? format(d, "yyyy-MM-dd") : "" })}
                    placeholder="날짜 선택"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-jm-xs text-[var(--jm-text-muted)]">
                    금액 (VAT 포함, 원) <span className="text-[var(--jm-danger-fg)]">*</span>
                  </p>
                  <JmInput
                    size="sm"
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={formatComma(form.amount)}
                    onChange={(e) => setForm({ ...form, amount: parseComma(e.target.value) })}
                    onFocus={focusCaretEnd}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-jm-xs text-[var(--jm-text-muted)]">
                    설명 <span className="text-[var(--jm-danger-fg)]">*</span>
                  </p>
                  <JmInput
                    size="sm"
                    type="text"
                    placeholder="경비 내용을 입력하세요"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-jm-xs text-[var(--jm-text-muted)]">
                    거래처 <span className="text-jm-3xs">(선택)</span>
                  </p>
                  <SupplierCombobox
                    suppliers={suppliers}
                    value={form.supplierId}
                    onChange={(id) => setForm({ ...form, supplierId: id })}
                    onCreateNew={(name) => {
                      setQuickSupplierDefaultName(name);
                      setQuickSupplierOpen(true);
                    }}
                    clearable
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-jm-xs text-[var(--jm-text-muted)]">부가세</p>
                  <JmSegmentedControl
                    size="sm"
                    value={form.isTaxable ? "taxable" : "free"}
                    onChange={(v) => setForm({ ...form, isTaxable: v === "taxable" })}
                    options={[
                      { value: "taxable", label: "과세" },
                      { value: "free", label: "면세" },
                    ]}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-jm-xs text-[var(--jm-text-muted)]">결제수단</p>
                  <JmSegmentedControl
                    size="sm"
                    value={form.paymentMethod || "_none"}
                    onChange={(v) => setForm({ ...form, paymentMethod: v === "_none" ? "" : v })}
                    options={[
                      { value: "_none", label: "미지정" },
                      { value: "CASH", label: "현금" },
                      { value: "CARD", label: "카드" },
                      { value: "TRANSFER", label: "계좌이체" },
                    ]}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-jm-xs text-[var(--jm-text-muted)]">회수예정</p>
                  <label className="flex items-center gap-2 text-jm-sm cursor-pointer">
                    <JmCheckbox
                      checked={form.recoverable}
                      onCheckedChange={(v) => setForm({ ...form, recoverable: v === true })}
                    />
                    <span className="text-[var(--jm-text-muted)]">
                      거래처 차감 등으로 돌려받을 금액 (손익에서 제외)
                    </span>
                  </label>
                </div>
                <div className="space-y-1">
                  <p className="text-jm-xs text-[var(--jm-text-muted)]">메모</p>
                  <JmInput
                    size="sm"
                    type="text"
                    placeholder="메모 (선택)"
                    value={form.memo}
                    onChange={(e) => setForm({ ...form, memo: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-jm-xs text-[var(--jm-text-muted)]">
                    영수증 <span className="text-jm-3xs">(선택, JPG/PNG/WebP/PDF, 최대 10MB · 저장 시 업로드)</span>
                  </p>
                  {pendingReceiptFile && pendingPreviewUrl ? (
                    <div className="flex items-start gap-3 rounded-md border border-[var(--jm-border)] px-3 py-2 min-w-0">
                      {isImageByMime(pendingReceiptFile.type) ? (
                        <a href={pendingPreviewUrl} target="_blank" rel="noreferrer" className="block shrink-0">
                          <img
                            src={pendingPreviewUrl}
                            alt="영수증 미리보기"
                            className="h-20 w-20 rounded border border-[var(--jm-border)] object-cover"
                          />
                        </a>
                      ) : (
                        <a
                          href={pendingPreviewUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex h-20 w-20 shrink-0 items-center justify-center rounded border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] text-jm-2xs text-[var(--jm-text-muted)]"
                        >
                          PDF
                        </a>
                      )}
                      <div className="flex-1 min-w-0 text-jm-sm">
                        <div className="truncate" title={pendingReceiptFile.name}>
                          {pendingReceiptFile.name}
                        </div>
                        <div className="text-jm-3xs text-[var(--jm-text-muted)]">저장 시 업로드</div>
                      </div>
                      <JmIconButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label="첨부 제거"
                        onClick={() => setPendingReceiptFile(null)}
                      >
                        <Trash2 />
                      </JmIconButton>
                    </div>
                  ) : form.attachmentUrl && !removeExistingReceipt ? (
                    <div className="flex items-start gap-3 rounded-md border border-[var(--jm-border)] px-3 py-2 min-w-0">
                      {isImageByUrl(form.attachmentUrl) ? (
                        <a href={form.attachmentUrl} target="_blank" rel="noreferrer" className="block shrink-0">
                          <img
                            src={form.attachmentUrl}
                            alt="영수증"
                            className="h-20 w-20 rounded border border-[var(--jm-border)] object-cover"
                          />
                        </a>
                      ) : (
                        <a
                          href={form.attachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex h-20 w-20 shrink-0 items-center justify-center rounded border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] text-jm-2xs text-[var(--jm-text-muted)]"
                        >
                          PDF
                        </a>
                      )}
                      <div className="flex-1 min-w-0 text-jm-sm">
                        <div className="truncate" title={getDisplayName(form.attachmentName, form.attachmentUrl)}>
                          {getDisplayName(form.attachmentName, form.attachmentUrl)}
                        </div>
                        <a
                          href={form.attachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-jm-2xs text-[var(--jm-info-fg)] underline"
                        >
                          새 탭에서 열기
                        </a>
                      </div>
                      <JmIconButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label="첨부 제거"
                        onClick={() => setRemoveExistingReceipt(true)}
                      >
                        <Trash2 />
                      </JmIconButton>
                    </div>
                  ) : (
                    <JmInput
                      size="sm"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          if (f.size > 10 * 1024 * 1024) {
                            toast.error("파일이 10MB를 초과합니다");
                            e.target.value = "";
                            return;
                          }
                          setPendingReceiptFile(f);
                        }
                        e.target.value = "";
                      }}
                    />
                  )}
                </div>
              </>
            )}
          </div>
          <JmDialogFooter>
            <JmButton variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
              취소
            </JmButton>
            <JmButton variant="cta" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              <span>{saving ? "저장 중..." : "저장"}</span>
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>

      {/* ── 입고 상세 모달 ── */}
      <JmDialog open={detailOpen} onOpenChange={setDetailOpen}>
        <JmDialogContent size="xl" className="max-h-[90vh] flex flex-col p-0">
          <JmDialogHeader className="px-5 py-4 border-b border-[var(--jm-border)] flex-shrink-0">
            <div className="flex items-center gap-2">
              <JmDialogTitle>
                {incomingDetail ? incomingDetail.incomingNo : "입고 상세"}
              </JmDialogTitle>
              {incomingDetail && (
                <JmBadge variant={statusVariants[incomingDetail.status] ?? "outline"} size="sm">
                  {statusLabels[incomingDetail.status] ?? incomingDetail.status}
                </JmBadge>
              )}
            </div>
            <JmDialogDescription className="sr-only">입고 거래명세서 상세 내역</JmDialogDescription>
          </JmDialogHeader>

          {loadingDetail ? (
            <div className="flex items-center justify-center py-12">
              <JmSpinner />
            </div>
          ) : incomingDetail ? (
            <div className="flex-1 overflow-y-auto min-h-0">
              {/* 헤더 정보 */}
              <div className="px-5 py-3 border-b border-[var(--jm-border)] grid grid-cols-2 gap-x-8 gap-y-1 text-jm-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--jm-text-muted)]">거래처</span>
                  <span className="font-medium">{incomingDetail.supplier.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--jm-text-muted)]">입고일</span>
                  <span>{format(new Date(incomingDetail.incomingDate), "yyyy년 M월 d일", { locale: ko })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--jm-text-muted)]">등록자</span>
                  <span>{incomingDetail.createdBy.name}</span>
                </div>
                {incomingDetail.memo && (
                  <div className="flex justify-between">
                    <span className="text-[var(--jm-text-muted)]">메모</span>
                    <span>{incomingDetail.memo}</span>
                  </div>
                )}
              </div>

              {/* 품목 테이블 */}
              <table className="w-full text-jm-sm">
                <thead>
                  <tr className="border-b border-[var(--jm-border)] bg-[var(--jm-surface-muted)] sticky top-0">
                    <th className="h-8 px-3 text-left text-jm-xs text-[var(--jm-text-muted)] font-medium">품명</th>
                    <th className="h-8 px-3 text-left text-jm-xs text-[var(--jm-text-muted)] font-medium">품번</th>
                    <th className="h-8 px-3 text-right text-jm-xs text-[var(--jm-text-muted)] font-medium">수량</th>
                    <th className="h-8 px-3 text-right text-jm-xs text-[var(--jm-text-muted)] font-medium">단가</th>
                    <th className="h-8 px-3 text-right text-jm-xs text-[var(--jm-text-muted)] font-medium">공급가액</th>
                    <th className="h-8 px-3 text-right text-jm-xs text-[var(--jm-text-muted)] font-medium">세액</th>
                  </tr>
                </thead>
                <tbody>
                  {incomingDetail.items.map((item) => {
                    const qty = parseFloat(item.quantity);
                    const unitPrice = parseFloat(item.unitPrice);
                    const totalPrice = parseFloat(item.totalPrice);
                    const tax = Math.round(totalPrice * 0.1);
                    return (
                      <tr key={item.id} className="border-b border-[var(--jm-border)] hover:bg-[var(--jm-surface-muted)]">
                        <td className="px-3 py-2">{item.supplierProduct.name}</td>
                        <td className="px-3 py-2 text-[var(--jm-text-muted)] text-jm-xs">
                          {item.supplierProduct.supplierCode ?? "-"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {qty.toLocaleString("ko-KR")} {item.supplierProduct.unitOfMeasure}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          ₩{formatPrice(unitPrice)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          ₩{formatPrice(totalPrice)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--jm-text-muted)]">
                          ₩{formatPrice(tax)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* 합계 */}
              {(() => {
                const supply = incomingDetail.items.reduce((s, i) => s + parseFloat(i.totalPrice), 0);
                const tax = Math.round(supply * 0.1);
                const shipping = parseFloat(incomingDetail.shippingCost) || 0;
                return (
                  <div className="border-t border-[var(--jm-border)] bg-[var(--jm-surface-muted)] grid grid-cols-4 text-jm-sm">
                    <div className="border-r border-[var(--jm-border)] px-3 py-2.5 flex justify-between">
                      <span className="text-jm-xs text-[var(--jm-text-muted)]">품목수</span>
                      <span>{incomingDetail.items.length}건</span>
                    </div>
                    <div className="border-r border-[var(--jm-border)] px-3 py-2.5 flex justify-between">
                      <span className="text-jm-xs text-[var(--jm-text-muted)]">공급가액</span>
                      <span className="tabular-nums">₩{formatPrice(supply)}</span>
                    </div>
                    <div className="border-r border-[var(--jm-border)] px-3 py-2.5 flex justify-between">
                      <span className="text-jm-xs text-[var(--jm-text-muted)]">세액</span>
                      <span className="tabular-nums">₩{formatPrice(tax)}</span>
                    </div>
                    <div className="px-3 py-2.5 flex justify-between">
                      <span className="text-jm-xs text-[var(--jm-text-muted)]">
                        택배비{incomingDetail.shippingDeducted ? " · 차감" : ""}
                      </span>
                      <span className="tabular-nums">{shipping > 0 ? `₩${formatPrice(shipping)}` : "-"}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="py-12 text-center text-[var(--jm-text-muted)] text-jm-sm">불러오기 실패</div>
          )}
        </JmDialogContent>
      </JmDialog>

      {/* ── 삭제 확인 ── */}
      <JmDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <JmDialogContent size="sm">
          <JmDialogHeader>
            <JmDialogTitle>경비 삭제</JmDialogTitle>
            <JmDialogDescription className="sr-only">경비 항목을 삭제합니다</JmDialogDescription>
          </JmDialogHeader>
          <p className="px-6 py-4 text-jm-sm text-[var(--jm-text-muted)]">
            이 경비 항목을 삭제하시겠습니까?
          </p>
          <JmDialogFooter>
            <JmButton variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              취소
            </JmButton>
            <JmButton variant="danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 />}
              <span>{deleting ? "삭제 중..." : "삭제"}</span>
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>

      <QuickSupplierSheet
        open={quickSupplierOpen}
        onOpenChange={setQuickSupplierOpen}
        defaultName={quickSupplierDefaultName}
        onCreated={(s) => {
          setSuppliers((prev) => [...prev, { id: s.id, name: s.name, businessNumber: null }]);
          setForm((prev) => ({ ...prev, supplierId: s.id }));
          setQuickSupplierOpen(false);
          fetchSuppliers();
        }}
      />
    </div>
  );
}
