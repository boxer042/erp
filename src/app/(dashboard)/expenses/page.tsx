"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { format, startOfMonth, endOfMonth, startOfDay, subMonths } from "date-fns";
import { ko } from "date-fns/locale";
import { Pencil, Trash2, Loader2, ExternalLink, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
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

  // 선택한 파일의 로컬 미리보기 URL (Blob URL — unmount/변경 시 revoke)
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

  // 저장된 영수증 표시명 — attachmentName 우선, 없으면 URL에서 basename 추정, UUID-only면 "영수증"
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

  // INVENTORY_USAGE 카테고리 진입 시 상품/고객 목록 로드
  useEffect(() => {
    if (formOpen && form.category === "INVENTORY_USAGE") {
      if (products.length === 0) fetchProducts();
      if (customers.length === 0) fetchCustomers();
    }
  }, [formOpen, form.category, products.length, customers.length, fetchProducts, fetchCustomers]);

  // 금액 프리뷰 — 상품/수량 변경 시 FIFO 비용 조회
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

  // 필터 변경 시 페이지 1로 초기화
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
    // 내 상품 사용 경비는 수정 불가
    if (e.referenceType === "INVENTORY_MOVEMENT") {
      toast.error("내 상품 사용 경비는 수정할 수 없습니다");
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

        // 영수증 처리 — 저장 시점에 Storage 업로드/삭제
        let finalAttachmentUrl = form.attachmentUrl;
        let finalAttachmentPath = form.attachmentPath;
        let finalAttachmentName = form.attachmentName;

        // 1) 교체 또는 제거를 위해 기존 파일이 있으면 Storage에서 삭제
        const willReplaceOrRemove = pendingReceiptFile !== null || removeExistingReceipt;
        if (willReplaceOrRemove && form.attachmentPath) {
          await apiMutate("/api/expenses/upload", "DELETE", { path: form.attachmentPath });
          finalAttachmentUrl = "";
          finalAttachmentPath = "";
          finalAttachmentName = "";
        }

        // 2) 신규 파일 업로드
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
          // 방금 업로드한 파일이 있었다면 롤백
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

  // 서버에서 이미 카테고리 필터 적용 — 클라이언트 필터 제거 (페이지네이션 일관성)
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
    // 현재 필터 조건 전체 데이터 받아오기 (페이지네이션 무시, 최대 500)
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

  return (
    <div className="flex h-full flex-col">
      <DataTableToolbar
        search={{ value: search, onChange: setSearch, onSearch: fetchData, placeholder: "설명 검색" }}
        onRefresh={fetchData}
        onAdd={openCreate}
        filters={
          <Button
            variant="outline"
            size="sm"
            className="h-[30px] text-[13px]"
            onClick={handleExport}
            disabled={loading || total === 0}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            CSV
          </Button>
        }
        addLabel="경비 추가"
        loading={loading}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* 왼쪽: 캘린더 + 카테고리별 합계 */}
        <div className="w-64 flex-shrink-0 border-r border-border flex flex-col overflow-hidden">
          {/* 기간 프리셋 */}
          <div className="px-3 pt-2 flex flex-wrap gap-1 shrink-0">
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
                      ? "bg-primary/10 border-primary/40 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  {labels[p]}
                </button>
              );
            })}
          </div>

          {/* 달력 */}
          <div className="px-1 pt-1 shrink-0">
            <Calendar
              mode="range"
              selected={{ from, to }}
              onSelect={(range) => {
                setFrom(range?.from);
                setTo(range?.to);
              }}
              numberOfMonths={1}
              locale={ko}
              className="w-full"
            />
          </div>

          {/* 기간 합계 + 카테고리 목록 */}
          <div className="border-t border-border p-3 shrink-0 space-y-0.5">
            <p className="text-xs text-muted-foreground">기간 합계</p>
            <p className="text-lg font-bold tabular-nums">₩{formatPrice(periodTotals.all)}</p>
            {periodTotals.recoverable > 0 && (
              <>
                <p className="text-[11px] text-amber-600 dark:text-amber-400 tabular-nums">회수예정 ₩{formatPrice(periodTotals.recoverable)}</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">실비용 ₩{formatPrice(periodTotals.net)}</p>
              </>
            )}
          </div>
          <div className="py-1 overflow-y-auto flex-1">
            <button
              className={`w-full text-left px-3 py-2.5 text-sm flex justify-between items-center hover:bg-muted/50 ${categoryFilter === "ALL" ? "bg-muted font-medium" : ""}`}
              onClick={() => setCategoryFilter("ALL")}
            >
              <span>전체</span>
              <span className="tabular-nums text-xs text-muted-foreground">₩{formatPrice(periodTotals.all)}</span>
            </button>
            {CATEGORIES.map((cat) => {
              const s = summary.find((x) => x.category === cat);
              const total = s?.total ?? 0;
              return (
                <button
                  key={cat}
                  className={`w-full text-left px-3 py-2.5 text-sm flex justify-between items-center hover:bg-muted/50 ${categoryFilter === cat ? "bg-muted font-medium" : ""}`}
                  onClick={() => setCategoryFilter(cat)}
                >
                  <span>{CATEGORY_LABELS[cat]}</span>
                  <span className={`tabular-nums text-xs ${total > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                    {total > 0 ? `₩${formatPrice(total)}` : "-"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 오른쪽: 경비 목록 */}
        <div className="flex-1 overflow-y-auto min-w-0">
          <Table className="min-w-[800px]">
            <TableHeader>
              <TableRow className="bg-muted hover:bg-muted">
                <TableHead className="px-3 text-xs text-muted-foreground font-medium">날짜</TableHead>
                <TableHead className="px-3 text-xs text-muted-foreground font-medium">카테고리</TableHead>
                <TableHead className="px-3 text-xs text-muted-foreground font-medium">설명</TableHead>
                <TableHead className="px-3 text-xs text-muted-foreground font-medium">결제</TableHead>
                <TableHead className="px-3 text-xs text-muted-foreground font-medium">메모</TableHead>
                <TableHead className="px-3 text-right text-xs text-muted-foreground font-medium">금액</TableHead>
                <TableHead className="px-3 w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={`sk-${i}`} className="hover:bg-transparent">
                    <TableCell className="px-3 py-2.5"><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell className="px-3 py-2.5"><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell className="px-3 py-2.5"><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell className="px-3 py-2.5"><Skeleton className="h-4 w-12" /></TableCell>
                    <TableCell className="px-3 py-2.5"><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell className="px-3 py-2.5 text-right"><div className="flex justify-end"><Skeleton className="h-4 w-20" /></div></TableCell>
                    <TableCell className="px-3 py-2.5 text-right"><div className="flex gap-1 justify-end"><Skeleton className="h-7 w-7 rounded-md" /><Skeleton className="h-7 w-7 rounded-md" /></div></TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow className="hover:bg-transparent"><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">경비 내역이 없습니다</TableCell></TableRow>
              ) : (
                filtered.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="px-3 py-2.5 text-muted-foreground">
                      {format(new Date(e.date), "yyyy.MM.dd", { locale: ko })}
                    </TableCell>
                    <TableCell className="px-3 py-2.5">
                      {CATEGORY_LABELS[e.category] ?? e.category}
                    </TableCell>
                    <TableCell className="px-3 py-2.5 whitespace-normal">
                      {e.description}
                      {e.recoverable && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">회수예정</span>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-muted-foreground text-xs">
                      {e.paymentMethod ? (PAYMENT_METHOD_LABELS[e.paymentMethod] ?? e.paymentMethod) : "-"}
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-muted-foreground text-xs whitespace-normal">{e.memo ?? ""}</TableCell>
                    <TableCell className={`px-3 py-2.5 text-right tabular-nums font-medium ${e.recoverable ? "text-muted-foreground line-through" : ""}`}>
                      ₩{formatPrice(parseFloat(e.amount))}
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(e)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {!e.referenceType && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(e.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {filtered.length > 0 && (
              <TableFooter>
                <TableRow className="hover:bg-muted/50">
                  <TableCell colSpan={5} className="px-3 py-2.5 text-xs text-muted-foreground">
                    {total}건 중 {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-right tabular-nums">
                    <div className="flex flex-col items-end gap-0.5">
                      <div className="font-bold">총 지출 ₩{formatPrice(filteredTotal)}</div>
                      {filteredRecoverable > 0 && (
                        <>
                          <div className="text-xs text-amber-600 dark:text-amber-400">회수예정 ₩{formatPrice(filteredRecoverable)}</div>
                          <div className="text-xs text-muted-foreground">실비용 ₩{formatPrice(filteredNet)}</div>
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            )}
          </Table>
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-2 border-t border-border py-2 text-sm">
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── 경비 등록/수정 다이얼로그 ── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "경비 수정" : "경비 추가"}</DialogTitle>
            <DialogDescription className="sr-only">경비를 등록하거나 수정합니다</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 min-w-0 overflow-hidden">
            {/* 카테고리 */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">카테고리</p>
              <Select
                value={form.category}
                onValueChange={(v) => {
                  setForm({ ...form, category: v ?? "OTHER", amount: "" });
                  setSelectedIncomingId("");
                  setShippingIsTaxable(true);
                  setShippingDeducted(false);
                }}
              >
                <SelectTrigger className="h-9">
                  <span>{CATEGORY_LABELS[form.category] || form.category}</span>
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isUsage ? (
              /* ── 내 상품 사용 전용 폼 ── */
              <>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">날짜 <span className="text-destructive">*</span></p>
                  <Input
                    type="date"
                    className="h-9"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">상품 <span className="text-destructive">*</span></p>
                  <ProductCombobox
                    products={products}
                    value={usageProductId}
                    onChange={(p) => setUsageProductId(p.id)}
                    filterType="component"
                    placeholder="상품 선택..."
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">수량 <span className="text-destructive">*</span></p>
                  <Input
                    type="text"
                    inputMode="decimal"
                    className="h-9"
                    placeholder="0"
                    value={usageQuantity}
                    onChange={(e) => setUsageQuantity(e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">용도 <span className="text-destructive">*</span></p>
                  <Select value={usageReason} onValueChange={(v) => setUsageReason((v ?? "SELF_USE") as UsageReasonKey)}>
                    <SelectTrigger className="h-9">
                      <span>{REASON_LABELS[usageReason]}</span>
                    </SelectTrigger>
                    <SelectContent>
                      {USAGE_REASONS.map((r) => (
                        <SelectItem key={r} value={r}>{REASON_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {TARGET_REQUIRED_REASONS.includes(usageReason) && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      대상 <span className="text-destructive">*</span>
                    </p>
                    <div className="flex h-[30px] rounded-md border border-border bg-card text-[13px] w-fit mb-2">
                      <button
                        type="button"
                        className={`px-3 rounded-l-md ${usageTargetType === "supplier" ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
                        onClick={() => { setUsageTargetType("supplier"); setUsageCustomerId(""); }}
                      >거래처</button>
                      <button
                        type="button"
                        className={`px-3 rounded-r-md border-l border-border ${usageTargetType === "customer" ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
                        onClick={() => { setUsageTargetType("customer"); setForm((prev) => ({ ...prev, supplierId: "" })); }}
                      >고객</button>
                    </div>
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
                  <p className="text-xs text-muted-foreground">설명 <span className="text-[10px]">(비워두면 자동 생성)</span></p>
                  <Input
                    type="text"
                    className="h-9"
                    placeholder="예: 전시용 샘플 2개"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">메모</p>
                  <Input
                    type="text"
                    className="h-9"
                    placeholder="메모 (선택)"
                    value={form.memo}
                    onChange={(e) => setForm({ ...form, memo: e.target.value })}
                  />
                </div>

                {/* 금액 프리뷰 */}
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-xs">현재 로트 잔량</span>
                    <span className="tabular-nums">
                      {usagePreview ? usagePreview.available : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span className="text-xs">경비 금액 (FIFO 원가)</span>
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
                  <p className="text-[10px] text-muted-foreground">
                    등록 시 재고 로트 FIFO 차감 + 경비(자동 계산) 기록. 확정 후 수정·삭제 불가.
                  </p>
                </div>
              </>
            ) : isShipping ? (
              /* ── 택배비 전용 폼 ── */
              <>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    입고 거래명세서 <span className="text-destructive">*</span>
                  </p>
                  <div className="flex gap-2">
                    <Select
                      value={selectedIncomingId}
                      onValueChange={(v) => {
                        setSelectedIncomingId(v ?? "");
                        const inc = incomings.find((i) => i.id === v);
                        if (inc && parseFloat(inc.shippingCost) > 0) {
                          setForm((prev) => ({ ...prev, amount: String(parseFloat(inc.shippingCost)) }));
                        }
                      }}
                      disabled={incomingLocked}
                    >
                      <SelectTrigger className="h-9 flex-1">
                        {loadingIncomings ? (
                          <Skeleton className="h-4 w-40" />
                        ) : (
                          <span className="truncate">
                            {(() => {
                              const inc = incomings.find((i) => i.id === selectedIncomingId);
                              if (!inc) return "입고 선택...";
                              return `${inc.incomingNo} — ${inc.supplierName} (${format(new Date(inc.incomingDate), "yy.MM.dd", { locale: ko })})`;
                            })()}
                          </span>
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        {incomings.map((i) => {
                          const existing = parseFloat(i.shippingCost) > 0
                            ? ` · ₩${formatPrice(parseFloat(i.shippingCost))}`
                            : "";
                          return (
                            <SelectItem key={i.id} value={i.id}>
                              {i.incomingNo} — {i.supplierName} ({format(new Date(i.incomingDate), "yy.MM.dd", { locale: ko })}){existing}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    {selectedIncomingId && (
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-9 w-9 flex-shrink-0"
                        onClick={() => openDetailModal(selectedIncomingId)}
                        title="자세히 보기"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {incomingLocked && (
                    <p className="text-xs text-muted-foreground">입고에 연결된 택배비입니다</p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    택배비 금액 <span className="text-destructive">*</span>
                  </p>
                  <Input
                    type="text"
                    inputMode="numeric"
                    className="h-9"
                    placeholder="0"
                    value={formatComma(form.amount)}
                    onChange={(e) => setForm({ ...form, amount: parseComma(e.target.value) })}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex h-[30px] rounded-md border border-border bg-card text-[13px]">
                    <button
                      type="button"
                      className={`px-2.5 rounded-l-md ${shippingIsTaxable ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
                      onClick={() => setShippingIsTaxable(true)}
                    >과세</button>
                    <button
                      type="button"
                      className={`px-2.5 rounded-r-md border-l border-border ${!shippingIsTaxable ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
                      onClick={() => setShippingIsTaxable(false)}
                    >면세</button>
                  </div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={shippingDeducted} onCheckedChange={(v) => setShippingDeducted(!!v)} />
                    거래처 차감
                  </label>
                </div>
              </>
            ) : (
              /* ── 일반 경비 폼 ── */
              <>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">날짜 <span className="text-destructive">*</span></p>
                  <Input
                    type="date"
                    className="h-9"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">금액 (VAT 포함, 원) <span className="text-destructive">*</span></p>
                  <Input
                    type="text"
                    inputMode="numeric"
                    className="h-9"
                    placeholder="0"
                    value={formatComma(form.amount)}
                    onChange={(e) => setForm({ ...form, amount: parseComma(e.target.value) })}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">설명 <span className="text-destructive">*</span></p>
                  <Input
                    type="text"
                    className="h-9"
                    placeholder="경비 내용을 입력하세요"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">거래처 <span className="text-[10px]">(선택)</span></p>
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
                  <p className="text-xs text-muted-foreground">부가세</p>
                  <div className="flex h-[30px] rounded-md border border-border bg-card text-[13px] w-fit">
                    <button
                      type="button"
                      className={`px-3 rounded-l-md ${form.isTaxable ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
                      onClick={() => setForm({ ...form, isTaxable: true })}
                    >과세</button>
                    <button
                      type="button"
                      className={`px-3 rounded-r-md border-l border-border ${!form.isTaxable ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
                      onClick={() => setForm({ ...form, isTaxable: false })}
                    >면세</button>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">결제수단</p>
                  <div className="flex h-[30px] rounded-md border border-border bg-card text-[13px] w-fit overflow-hidden">
                    {[
                      { k: "", l: "미지정" },
                      { k: "CASH", l: "현금" },
                      { k: "CARD", l: "카드" },
                      { k: "TRANSFER", l: "계좌이체" },
                    ].map((opt, i) => (
                      <button
                        key={opt.k}
                        type="button"
                        className={`px-3 ${i > 0 ? "border-l border-border" : ""} ${form.paymentMethod === opt.k ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
                        onClick={() => setForm({ ...form, paymentMethod: opt.k })}
                      >{opt.l}</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">회수예정</p>
                  <label className="flex items-center gap-2 text-sm cursor-pointer h-[30px]">
                    <Checkbox
                      checked={form.recoverable}
                      onCheckedChange={(v) => setForm({ ...form, recoverable: !!v })}
                    />
                    <span className="text-muted-foreground">거래처 차감 등으로 돌려받을 금액 (손익에서 제외)</span>
                  </label>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">메모</p>
                  <Input
                    type="text"
                    className="h-9"
                    placeholder="메모 (선택)"
                    value={form.memo}
                    onChange={(e) => setForm({ ...form, memo: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">영수증 <span className="text-[10px]">(선택, JPG/PNG/WebP/PDF, 최대 10MB · 저장 시 업로드)</span></p>
                  {pendingReceiptFile && pendingPreviewUrl ? (
                    <div className="flex items-start gap-3 rounded-md border border-border border-dashed px-3 py-2 min-w-0">
                      {isImageByMime(pendingReceiptFile.type) ? (
                        <a href={pendingPreviewUrl} target="_blank" rel="noreferrer" className="block shrink-0">
                          <img
                            src={pendingPreviewUrl}
                            alt="영수증 미리보기"
                            className="h-20 w-20 rounded border border-border object-cover"
                          />
                        </a>
                      ) : (
                        <a
                          href={pendingPreviewUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex h-20 w-20 shrink-0 items-center justify-center rounded border border-border bg-muted text-[11px] text-muted-foreground"
                        >
                          PDF
                        </a>
                      )}
                      <div className="flex-1 min-w-0 text-sm">
                        <div className="truncate" title={pendingReceiptFile.name}>
                          {pendingReceiptFile.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground">저장 시 업로드</div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => setPendingReceiptFile(null)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : form.attachmentUrl && !removeExistingReceipt ? (
                    <div className="flex items-start gap-3 rounded-md border border-border px-3 py-2 min-w-0">
                      {isImageByUrl(form.attachmentUrl) ? (
                        <a href={form.attachmentUrl} target="_blank" rel="noreferrer" className="block shrink-0">
                          <img
                            src={form.attachmentUrl}
                            alt="영수증"
                            className="h-20 w-20 rounded border border-border object-cover"
                          />
                        </a>
                      ) : (
                        <a
                          href={form.attachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex h-20 w-20 shrink-0 items-center justify-center rounded border border-border bg-muted text-[11px] text-muted-foreground"
                        >
                          PDF
                        </a>
                      )}
                      <div className="flex-1 min-w-0 text-sm">
                        <div className="truncate" title={getDisplayName(form.attachmentName, form.attachmentUrl)}>
                          {getDisplayName(form.attachmentName, form.attachmentUrl)}
                        </div>
                        <a
                          href={form.attachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-primary underline"
                        >
                          새 탭에서 열기
                        </a>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => setRemoveExistingReceipt(true)}
                        title="제거 (저장 시 적용)"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <Input
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
                      className="h-9 text-sm"
                    />
                  )}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>취소</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : null}
              <span>{saving ? "저장 중..." : "저장"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 입고 상세 모달 ── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[90dvh] flex flex-col p-0">
          <DialogHeader className="px-5 py-4 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <DialogTitle>
                {incomingDetail ? incomingDetail.incomingNo : "입고 상세"}
              </DialogTitle>
              {incomingDetail && (
                <Badge variant={statusVariants[incomingDetail.status] ?? "outline"}>
                  {statusLabels[incomingDetail.status] ?? incomingDetail.status}
                </Badge>
              )}
            </div>
            <DialogDescription className="sr-only">입고 거래명세서 상세 내역</DialogDescription>
          </DialogHeader>

          {loadingDetail ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-muted-foreground" />
            </div>
          ) : incomingDetail ? (
            <ScrollArea className="flex-1 min-h-0">
              {/* 헤더 정보 */}
              <div className="px-5 py-3 border-b border-border grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">거래처</span>
                  <span className="font-medium">{incomingDetail.supplier.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">입고일</span>
                  <span>{format(new Date(incomingDetail.incomingDate), "yyyy년 M월 d일", { locale: ko })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">등록자</span>
                  <span>{incomingDetail.createdBy.name}</span>
                </div>
                {incomingDetail.memo && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">메모</span>
                    <span>{incomingDetail.memo}</span>
                  </div>
                )}
              </div>

              {/* 품목 테이블 */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted sticky top-0">
                    <th className="h-8 px-3 text-left text-xs text-muted-foreground font-medium">품명</th>
                    <th className="h-8 px-3 text-left text-xs text-muted-foreground font-medium">품번</th>
                    <th className="h-8 px-3 text-right text-xs text-muted-foreground font-medium">수량</th>
                    <th className="h-8 px-3 text-right text-xs text-muted-foreground font-medium">단가</th>
                    <th className="h-8 px-3 text-right text-xs text-muted-foreground font-medium">공급가액</th>
                    <th className="h-8 px-3 text-right text-xs text-muted-foreground font-medium">세액</th>
                  </tr>
                </thead>
                <tbody>
                  {incomingDetail.items.map((item) => {
                    const qty = parseFloat(item.quantity);
                    const unitPrice = parseFloat(item.unitPrice);
                    const totalPrice = parseFloat(item.totalPrice);
                    const tax = Math.round(totalPrice * 0.1);
                    return (
                      <tr key={item.id} className="border-b border-border hover:bg-muted/50">
                        <td className="px-3 py-2">{item.supplierProduct.name}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">
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
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
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
                  <div className="border-t border-border bg-muted grid grid-cols-4 text-sm">
                    <div className="border-r border-border px-3 py-2.5 flex justify-between">
                      <span className="text-xs text-muted-foreground">품목수</span>
                      <span>{incomingDetail.items.length}건</span>
                    </div>
                    <div className="border-r border-border px-3 py-2.5 flex justify-between">
                      <span className="text-xs text-muted-foreground">공급가액</span>
                      <span className="tabular-nums">₩{formatPrice(supply)}</span>
                    </div>
                    <div className="border-r border-border px-3 py-2.5 flex justify-between">
                      <span className="text-xs text-muted-foreground">세액</span>
                      <span className="tabular-nums">₩{formatPrice(tax)}</span>
                    </div>
                    <div className="px-3 py-2.5 flex justify-between">
                      <span className="text-xs text-muted-foreground">
                        택배비{incomingDetail.shippingDeducted ? " · 차감" : ""}
                      </span>
                      <span className="tabular-nums">{shipping > 0 ? `₩${formatPrice(shipping)}` : "-"}</span>
                    </div>
                  </div>
                );
              })()}
            </ScrollArea>
          ) : (
            <div className="py-12 text-center text-muted-foreground text-sm">불러오기 실패</div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── 삭제 확인 ── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>경비 삭제</DialogTitle>
            <DialogDescription className="sr-only">경비 항목을 삭제합니다</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">이 경비 항목을 삭제하시겠습니까?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>취소</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              <span>{deleting ? "삭제 중..." : "삭제"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
