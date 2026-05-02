"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { SupplierCombobox } from "@/components/supplier-combobox";
import { useIsCompactDevice } from "@/hooks/use-mobile";
import { MobileInlineCellProductSearch } from "@/components/inline-cell-product-search-mobile";
import {
  Plus, X, CalendarIcon, Loader2, FileText, ArrowUpRight, ChevronsUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { format, parse } from "date-fns";
import { ko } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { QuickSupplierSheet, QuickSupplierProductSheet } from "@/components/quick-register-sheets";
import Link from "next/link";
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

const statusVariant: Record<string, "outline" | "secondary" | "default" | "destructive" | "warning" | "success"> = {
  PENDING: "warning",
  CONFIRMED: "success",
  CANCELLED: "destructive",
};

function ReturnsSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell className="text-right"><div className="flex justify-end"><Skeleton className="h-4 w-8" /></div></TableCell>
          <TableCell className="text-right"><div className="flex justify-end"><Skeleton className="h-4 w-20" /></div></TableCell>
          <TableCell><Skeleton className="h-5 w-12 rounded-full" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

// 날짜 입력 컴포넌트
function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);

  const display = value
    ? format(parse(value, "yyyy-MM-dd", new Date()), "yyyy년 M월 d일", { locale: ko })
    : "";

  const tryParse = (input: string) => {
    const digits = input.replace(/\D/g, "");
    if (digits.length === 8) {
      const y = digits.slice(0, 4);
      const m = digits.slice(4, 6);
      const d = digits.slice(6, 8);
      const date = new Date(`${y}-${m}-${d}`);
      if (!isNaN(date.getTime())) {
        onChange(`${y}-${m}-${d}`);
        setEditing(false);
        return;
      }
    }
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-1">
      {editing ? (
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => tryParse(text)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) tryParse(text); }}
          placeholder="20260329"
          className="h-9 flex-1 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus:border-primary"
        />
      ) : (
        <button
          type="button"
          onClick={() => { setText(""); setEditing(true); }}
          className="h-9 flex-1 text-left rounded-lg border border-input bg-transparent px-3 text-sm hover:bg-accent/50"
        >
          {display || <span className="text-muted-foreground">날짜 입력...</span>}
        </button>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="h-9 w-9 flex items-center justify-center rounded-lg border border-input hover:bg-accent/50 shrink-0">
          <CalendarIcon className="size-3.5 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={value ? parse(value, "yyyy-MM-dd", new Date()) : undefined}
            onSelect={(date) => {
              if (date) {
                onChange(format(date, "yyyy-MM-dd"));
                setOpen(false);
                setEditing(false);
              }
            }}
            defaultMonth={value ? parse(value, "yyyy-MM-dd", new Date()) : new Date()}
            locale={ko}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// 테이블 셀 내 품명 검색 (입고 페이지 패턴)
function InlineCellProductSearch({
  rowIndex,
  products,
  onSelect,
  onCreateNew,
  existingIds,
  selectedName = "",
}: {
  rowIndex: number;
  products: SupplierProduct[];
  onSelect: (sp: SupplierProduct) => void;
  onCreateNew: (name: string) => void;
  existingIds: string[];
  selectedName?: string;
}) {
  const isMobile = useIsCompactDevice();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  if (isMobile) {
    return (
      <MobileInlineCellProductSearch
        rowIndex={rowIndex}
        products={products}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
        existingIds={existingIds}
        selectedName={selectedName}
        disableAlreadyAdded
      />
    );
  }

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.supplierCode?.toLowerCase().includes(q) ?? false);
  });

  const hasExactMatch = products.some((p) => p.name.toLowerCase() === search.toLowerCase());

  return (
    <Popover open={open} onOpenChange={(v) => {
      setOpen(v);
      if (v && selectedName) setSearch(selectedName);
      if (!v) setSearch("");
    }}>
      <PopoverTrigger
        data-product-trigger={rowIndex}
        className={`flex h-7 w-full items-center rounded bg-transparent px-2 text-sm cursor-pointer hover:bg-muted ${selectedName ? "text-foreground" : "text-primary"}`}
      >
        {selectedName ? (
          <span className="truncate font-medium">{selectedName}</span>
        ) : (
          <span className="flex items-center gap-1.5"><Plus className="size-3.5 shrink-0" />품명 검색...</span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[var(--anchor-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="품명 또는 품번..."
            value={search}
            onValueChange={setSearch}
            onKeyDown={(e) => {
              if (e.key === "Enter" && search.trim() && filtered.length === 0) {
                e.preventDefault();
                onCreateNew(search.trim());
                setOpen(false);
                setSearch("");
              }
            }}
          />
          <CommandList>
            <CommandEmpty>
              {search.trim() ? (
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-primary hover:bg-accent rounded cursor-pointer"
                  onClick={() => { onCreateNew(search.trim()); setOpen(false); setSearch(""); }}
                >
                  <Plus className="size-4" />
                  &quot;{search.trim()}&quot; 직접 입력
                </button>
              ) : "결과 없음"}
            </CommandEmpty>
            <CommandGroup>
              {filtered.map((p) => {
                const alreadyAdded = existingIds.includes(p.id);
                return (
                  <CommandItem
                    key={p.id}
                    value={p.id}
                    disabled={alreadyAdded}
                    onSelect={() => {
                      if (!alreadyAdded) {
                        onSelect(p);
                        setOpen(false);
                        setSearch("");
                      }
                    }}
                  >
                    <span className="flex-1">{p.name}</span>
                    {p.supplierCode && <span className="text-xs text-muted-foreground mr-2">{p.supplierCode}</span>}
                    <span className="text-xs text-muted-foreground">₩{parseFloat(p.unitPrice).toLocaleString("ko-KR")}</span>
                    {alreadyAdded && <Badge variant="secondary" className="ml-2 text-xs">추가됨</Badge>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {search.trim() && !hasExactMatch && filtered.length > 0 && (
              <CommandGroup>
                <CommandItem
                  onSelect={() => { onCreateNew(search.trim()); setOpen(false); setSearch(""); }}
                  className="text-primary"
                >
                  <Plus className="size-4" />
                  &quot;{search.trim()}&quot; 직접 입력
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className="relative flex h-9 max-h-9 box-border w-full items-center overflow-hidden rounded-lg border border-input bg-transparent pl-3 pr-9 text-sm cursor-pointer hover:bg-accent/50 focus:outline-none focus-visible:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span className={`truncate ${selected ? "" : "text-muted-foreground"}`}>
          {selected
            ? `${selected.incomingNo} — ${format(new Date(selected.incomingDate), "yyyy-MM-dd")} (${selected._count.items}종 / ₩${selected.totalAmount.toLocaleString("ko-KR")})`
            : disabled ? "거래처를 먼저 선택하세요" : "입고 선택 (선택하면 품목 자동완성)"}
        </span>
        <span className="absolute inset-y-0 right-2 flex items-center">
          {selected ? (
            <span
              role="button"
              className="inline-flex h-4 w-4 items-center justify-center rounded hover:bg-secondary opacity-60 hover:opacity-100"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClear(); }}
            >
              <X className="h-3 w-3" />
            </span>
          ) : (
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          )}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--anchor-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="입고번호 검색..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>입고 내역이 없습니다</CommandEmpty>
            <CommandGroup>
              {filtered.map((i) => (
                <CommandItem
                  key={i.id}
                  value={i.id}
                  onSelect={() => { onChange(i.id); setOpen(false); setSearch(""); }}
                  data-checked={i.id === value ? "true" : undefined}
                >
                  <span className="font-mono text-xs mr-2">{i.incomingNo}</span>
                  <span className="text-muted-foreground text-xs mr-2">{format(new Date(i.incomingDate), "yyyy-MM-dd")}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{i._count.items}종 · ₩{i.totalAmount.toLocaleString("ko-KR")}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
    </div>
  );
}

const formatPrice = (v: string | number) =>
  (typeof v === "string" ? parseFloat(v) : v).toLocaleString("ko-KR");

export default function SupplierReturnsPage() {
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
    <>
      <div className="flex h-full flex-col">
        <DataTableToolbar
          onRefresh={fetchReturns}
          loading={loading}
          onAdd={() => { resetForm(); setCreateOpen(true); }}
          addLabel="반품 등록"
          filters={
            <div className="flex items-center gap-1.5">
              <Select value={selectedSupplier} onValueChange={(v) => setSelectedSupplier(v ?? "all")}>
                <SelectTrigger className="h-[30px] w-[140px] text-[13px] bg-card border-border">
                  <span className="truncate">
                    {selectedSupplier === "all" ? "전체 거래처" : suppliers.find((s) => s.id === selectedSupplier)?.name ?? "전체 거래처"}
                  </span>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectItem value="all">전체 거래처</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
                <SelectTrigger className="h-[30px] w-[100px] text-[13px] bg-card border-border">
                  <span className="truncate">
                    {{ all: "전체 상태", PENDING: "대기", CONFIRMED: "확정", CANCELLED: "취소" }[statusFilter] ?? "전체 상태"}
                  </span>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectItem value="all">전체 상태</SelectItem>
                  <SelectItem value="PENDING">대기</SelectItem>
                  <SelectItem value="CONFIRMED">확정</SelectItem>
                  <SelectItem value="CANCELLED">취소</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        />

        <ScrollArea className="flex-1 min-h-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>반품번호</TableHead>
                <TableHead>거래처</TableHead>
                <TableHead>반품일</TableHead>
                <TableHead className="text-right">품목수</TableHead>
                <TableHead className="text-right">환불액</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>교환 입고</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <ReturnsSkeletonRows />
              ) : returns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">반품 내역이 없습니다</TableCell>
                </TableRow>
              ) : (
                returns.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => openDetail(r.id)}>
                    <TableCell className="font-mono text-xs">{r.returnNo}</TableCell>
                    <TableCell>{r.supplier.name}</TableCell>
                    <TableCell>{format(new Date(r.returnDate), "yyyy-MM-dd")}</TableCell>
                    <TableCell className="text-right tabular-nums">{r._count.items}</TableCell>
                    <TableCell className="text-right tabular-nums">₩{r.refundAmount.toLocaleString("ko-KR")}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[r.status]}>{statusLabels[r.status]}</Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {r.exchangeIncoming ? (
                        <Link href="/inventory/incoming" className="flex items-center gap-1 text-xs text-primary hover:underline">
                          {r.exchangeIncoming.incomingNo}
                          <ArrowUpRight className="size-3" />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      {/* ============================================================ */}
      {/* 반품 등록 Sheet (bottom) */}
      {/* ============================================================ */}
      <Sheet open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
        <SheetContent side="bottom" className="h-[90dvh] p-0 flex flex-col">
          <SheetHeader className="border-b border-border px-5 py-4 flex-shrink-0">
            <SheetTitle>반품 등록</SheetTitle>
            <SheetDescription className="sr-only">거래처 반품 등록</SheetDescription>
          </SheetHeader>

          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <ScrollArea className="flex-1 min-h-0">
              {/* 상단 정보 */}
            <div className="px-5 py-4 border-b border-border grid grid-cols-2 gap-x-8 gap-y-3">
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">거래처</p>
                <SupplierCombobox
                  suppliers={suppliers}
                  value={supplierId}
                  onChange={(id) => handleSupplierChange(id)}
                  onCreateNew={(name) => { setQuickSupplierName(name); setQuickSupplierOpen(true); }}
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">반품일</p>
                <DateInput value={returnDate} onChange={setReturnDate} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  기준 입고{" "}
                  <span className="text-muted-foreground/60">(선택하면 품목·단가 자동완성)</span>
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
                <p className="text-xs text-muted-foreground">반품 사유</p>
                <input
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="반품 사유..."
                  disabled={!supplierId}
                  className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus:border-primary disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">메모</p>
                <input
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="메모..."
                  disabled={!supplierId}
                  className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus:border-primary disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsExchange(!isExchange)}
                  disabled={!supplierId}
                  className={`h-4 w-4 rounded border flex items-center justify-center transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${isExchange ? "bg-primary border-primary" : "border-input bg-transparent"}`}
                >
                  {isExchange && (
                    <svg className="size-2.5 text-black" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <span className={`text-xs text-muted-foreground ${!supplierId ? "opacity-40" : ""}`}>교환 포함 — 확정 시 교환 입고(대기) 자동 생성</span>
              </div>

              {/* 반품 비용 */}
              <div className={`col-span-2 space-y-1.5 ${!supplierId ? "opacity-40 pointer-events-none" : ""}`}>
                <p className="text-xs text-muted-foreground">반품 비용 <span className="text-muted-foreground/60">(택배비 등 발생 시)</span></p>
                <div className="flex rounded-lg border border-border overflow-hidden text-sm w-full">
                  {/* 공급가액 */}
                  <div className="flex flex-col border-r border-border">
                    <div className="px-3 py-1 text-xs text-muted-foreground bg-muted border-b border-border text-center whitespace-nowrap">공급가액</div>
                    <input
                      type="text" inputMode="numeric"
                      value={formatComma(returnCostSupply)}
                      onChange={(e) => { const s = parseComma(e.target.value); setReturnCostSupply(s); setReturnCostTax(String(Math.round(Number(s) * 0.1))); }}
                      onFocus={(e) => e.currentTarget.select()}
                      placeholder="0"
                      className="w-[110px] px-3 py-1.5 text-right bg-transparent outline-none focus:bg-muted/50 tabular-nums"
                    />
                  </div>
                  {/* 세액 */}
                  <div className="flex flex-col border-r border-border">
                    <div className="px-3 py-1 text-xs text-muted-foreground bg-muted border-b border-border text-center">세액</div>
                    <input
                      type="text" inputMode="numeric"
                      value={formatComma(returnCostTax)}
                      onChange={(e) => setReturnCostTax(parseComma(e.target.value))}
                      onFocus={(e) => e.currentTarget.select()}
                      placeholder="0"
                      className="w-[90px] px-3 py-1.5 text-right bg-transparent outline-none focus:bg-muted/50 tabular-nums"
                    />
                  </div>
                  {/* 반품액 */}
                  <div className="flex flex-col border-r border-border">
                    <div className="px-3 py-1 text-xs text-muted-foreground bg-muted border-b border-border text-center">반품액</div>
                    <div className="w-[110px] px-3 py-1.5 text-right font-medium tabular-nums text-foreground">
                      {(() => { const t = Number(parseComma(returnCostSupply)) + Number(parseComma(returnCostTax)); return t > 0 ? `₩${t.toLocaleString("ko-KR")}` : <span className="text-muted-foreground/40">0</span>; })()}
                    </div>
                  </div>
                  {/* 유형 — 토글 버튼 (클릭 시 해제 가능) */}
                  <div className="flex flex-col border-r border-border">
                    <div className="px-3 py-1 text-xs text-muted-foreground bg-muted border-b border-border text-center">유형</div>
                    <div className="flex items-center gap-1 px-2 py-1.5">
                      {(["ADD", "DEDUCT", "SEPARATE"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setReturnCostType(returnCostType === t ? "" : t)}
                          className={`px-1.5 py-0.5 text-xs rounded border transition-colors whitespace-nowrap ${
                            returnCostType === t
                              ? "bg-primary/10 border-primary text-primary"
                              : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                          }`}
                        >
                          {{ ADD: "거래처 청구", DEDUCT: "착불 차감", SEPARATE: "자체 부담" }[t]}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* 메모 */}
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="px-3 py-1 text-xs text-muted-foreground bg-muted border-b border-border">메모</div>
                    <input
                      type="text"
                      value={returnCostNote}
                      onChange={(e) => setReturnCostNote(e.target.value)}
                      placeholder="예: CJ대한통운"
                      className="w-full px-3 py-1.5 bg-transparent outline-none focus:bg-muted/50 text-sm min-w-0"
                    />
                  </div>
                </div>
                {returnCostType && (
                  <p className="text-xs text-muted-foreground/80">
                    {returnCostType === "ADD" && "우리가 택배비를 먼저 냈고, 거래처에서 돌려받아야 할 금액입니다. 반품 환불액에 이 비용이 더해집니다."}
                    {returnCostType === "DEDUCT" && "거래처가 반품 택배비를 착불로 받았고, 그만큼 우리에게 돌려줄 환불액에서 빠집니다."}
                    {returnCostType === "SEPARATE" && "우리가 택배비를 부담하며 거래처에 청구하지 않습니다. 환불액은 그대로이고 비용은 경비로만 기록됩니다."}
                  </p>
                )}
              </div>
            </div>

            {/* 품목 테이블 — 거래명세표 스타일 (입고 시트와 동일 구조) */}
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="bg-muted text-muted-foreground text-xs">
                  <th className="border-r border-b border-border w-[36px] py-2 text-center font-medium">번호</th>
                  <th className="border-r border-b border-border w-[100px] py-2 px-2 text-left font-medium">품번</th>
                  <th className="border-r border-b border-border w-[160px] py-2 px-2 text-left font-medium">품명</th>
                  <th className="border-r border-b border-border w-[100px] py-2 px-2 text-left font-medium">규격</th>
                  <th className="border-r border-b border-border w-[50px] py-2 text-center font-medium">단위</th>
                  <th className="border-r border-b border-border w-[70px] py-2 text-center font-medium">수량</th>
                  <th className="border-r border-b border-border w-[90px] py-2 text-center font-medium">단가</th>
                  <th className="border-r border-b border-border w-[100px] py-2 text-center font-medium">공급가액</th>
                  <th className="border-r border-b border-border w-[84px] py-2 text-center font-medium">세액</th>
                  <th className="border-b border-border w-[80px] py-2 px-2 text-center font-medium">비고</th>
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
                        <tr key={idx} className="group border-b border-border hover:bg-muted/50">
                          <td className="border-r border-border text-center text-muted-foreground py-1 text-xs">{idx + 1}</td>

                          {/* 품번 */}
                          <td className="border-r border-border px-1 py-0.5">
                            <input
                              value={item.supplierCode}
                              onChange={(e) => updateItem(idx, "supplierCode", e.target.value)}
                              disabled={isEmptyRow}
                              className="w-full h-7 bg-transparent text-sm px-2 outline-none focus:bg-muted rounded disabled:opacity-30"
                            />
                          </td>

                          {/* 품명 */}
                          <td className="border-r border-border px-1 py-0.5">
                            {item.fromIncoming ? (
                              <span className="flex h-7 items-center px-2 text-sm font-medium truncate">{item.supplierProductName}</span>
                            ) : supplierId ? (
                              <InlineCellProductSearch
                                rowIndex={idx}
                                products={supplierProducts}
                                onSelect={(sp) => selectProductForRow(idx, sp)}
                                onCreateNew={(name) => { setQuickSpName(name); setQuickSpOpen(true); }}
                                existingIds={items.map((i) => i.supplierProductId).filter(Boolean)}
                                selectedName={item.supplierProductName}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground px-2">거래처를 선택하세요</span>
                            )}
                          </td>

                          {/* 규격 */}
                          <td className="border-r border-border px-1 py-0.5">
                            <input
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
                              data-rrow={idx}
                              data-rfield="quantity"
                              value={item.quantity}
                              onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                              onFocus={(e) => { if (e.target.value === "0") updateItem(idx, "quantity", ""); }}
                              disabled={isEmptyRow}
                              className="w-full h-7 bg-transparent text-right text-sm px-2 outline-none focus:bg-muted rounded disabled:opacity-30"
                            />
                          </td>

                          {/* 단가 */}
                          <td className="border-r border-border p-0.5">
                            <input
                              data-rrow={idx}
                              data-rfield="unitPrice"
                              type="text"
                              inputMode="numeric"
                              value={formatComma(item.unitPrice)}
                              onChange={(e) => updateItem(idx, "unitPrice", parseComma(e.target.value))}
                              onFocus={(e) => { if (e.target.value === "0") updateItem(idx, "unitPrice", ""); else e.currentTarget.select(); }}
                              disabled={isEmptyRow}
                              className="w-full h-7 bg-transparent text-right text-sm px-2 outline-none focus:bg-muted rounded disabled:opacity-30 tabular-nums"
                            />
                          </td>

                          {/* 공급가액 = 단가 × 수량 */}
                          <td className="border-r border-border text-right px-2 py-1 tabular-nums">
                            {!isEmptyRow && lineSupply > 0 && formatPrice(lineSupply)}
                          </td>

                          {/* 세액 = 공급가액 × 10% (과세 시) */}
                          <td className="border-r border-border text-right px-2 py-1 text-muted-foreground tabular-nums">
                            {!isEmptyRow && lineTax > 0 && formatPrice(lineTax)}
                          </td>

                          {/* 비고 + 삭제 */}
                          <td className="p-0.5">
                            <div className="flex items-center gap-0.5">
                              <input
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
                              <button
                                type="button"
                                onClick={() => removeItem(idx)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400 p-1 shrink-0"
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
                          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/70 transition-colors disabled:opacity-30 disabled:cursor-not-allowed px-1 py-0.5"
                        >
                          <Plus className="size-3.5" />
                          행 추가
                        </button>
                      </td>
                    </tr>
              </tbody>
            </table>

            {/* 합계 — 거래명세표 하단 (입고 시트와 동일 구조) */}
            <div className="border-t border-border bg-muted">
              <div className="grid grid-cols-5 text-sm">
                <div className="border-r border-border px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">품목수</span>
                  <span>{validItems.length}건</span>
                </div>
                <div className="border-r border-border px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">공급가액</span>
                  <span className="tabular-nums">₩{formatPrice(totalAmount)}</span>
                </div>
                <div className="border-r border-border px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">세액</span>
                  <span className="tabular-nums">{goodsAmount - totalAmount > 0 ? `₩${formatPrice(goodsAmount - totalAmount)}` : ""}</span>
                </div>
                <div className="border-r border-border px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">반품 비용</span>
                  <span className="tabular-nums">
                    {returnCostTotal > 0
                      ? `${costSign > 0 ? "+" : costSign < 0 ? "−" : ""}₩${formatPrice(returnCostTotal)}`
                      : ""}
                  </span>
                </div>
                <div className="px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">환불 예상액</span>
                  <span className="font-bold text-base tabular-nums">₩{formatPrice(refundAmount)}</span>
                </div>
              </div>
            </div>
            </ScrollArea>

            {/* 하단 버튼 */}
            <div className="border-t border-border px-5 py-4 flex justify-end gap-2 bg-background">
              <Button type="button" variant="outline" onClick={() => { setCreateOpen(false); resetForm(); }}>
                취소
              </Button>
              <Button type="button" onClick={handleCreate} disabled={submitting || validItems.length === 0 || !supplierId}>
                {submitting ? <Loader2 className="animate-spin" /> : null}
                <span>{submitting ? "등록 중..." : "반품 등록"}</span>
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* 반품 상세 Sheet */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent side="bottom" className="h-[85dvh] p-0 flex flex-col">
          <SheetHeader className="border-b border-border px-5 py-4 flex-shrink-0">
            <SheetTitle>{detailLoading ? <Skeleton className="h-5 w-32" /> : detail?.returnNo}</SheetTitle>
            <SheetDescription className="sr-only">반품 상세</SheetDescription>
          </SheetHeader>

          {detailLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : detail ? (
            <>
              <ScrollArea className="flex-1 min-h-0">
                {/* 상단 정보 */}
                <div className="px-5 py-4 border-b border-border grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                  <div className="flex gap-2">
                    <span className="text-xs text-muted-foreground w-16 shrink-0">거래처</span>
                    <span className="font-medium">{detail.supplier.name}</span>
                    <span className="text-xs text-muted-foreground">({detail.supplier.paymentMethod === "CREDIT" ? "외상" : "선불"})</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-xs text-muted-foreground w-16 shrink-0">반품번호</span>
                    <span className="font-mono text-xs">{detail.returnNo}</span>
                    <Badge variant={statusVariant[detail.status]} className="ml-1">{statusLabels[detail.status]}</Badge>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-xs text-muted-foreground w-16 shrink-0">반품일</span>
                    <span>{new Date(detail.returnDate).toLocaleDateString("ko-KR")}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-xs text-muted-foreground w-16 shrink-0">등록자</span>
                    <span>{detail.createdBy.name}</span>
                  </div>
                  {detail.returnReason && (
                    <div className="flex gap-2 col-span-2">
                      <span className="text-xs text-muted-foreground w-16 shrink-0">반품 사유</span>
                      <span>{detail.returnReason}</span>
                    </div>
                  )}
                  {detail.memo && (
                    <div className="flex gap-2 col-span-2">
                      <span className="text-xs text-muted-foreground w-16 shrink-0">메모</span>
                      <span>{detail.memo}</span>
                    </div>
                  )}
                  {detail.returnCost && parseFloat(detail.returnCost) > 0 && (() => {
                    const total = parseFloat(detail.returnCost!);
                    const supply = Math.round(total / 1.1);
                    const tax = total - supply;
                    const typeLabel: Record<string, string> = { ADD: "거래처 청구", DEDUCT: "착불 차감", SEPARATE: "자체 부담" };
                    return (
                      <div className="flex gap-2 col-span-2 items-start">
                        <span className="text-xs text-muted-foreground w-16 shrink-0 pt-1.5">반품 비용</span>
                        <div className="flex rounded-lg border border-border overflow-hidden text-sm">
                          {[{ label: "공급가액", val: supply }, { label: "세액", val: tax }, { label: "반품액", val: total }].map((col, i) => (
                            <div key={col.label} className={`flex flex-col ${i < 2 ? "border-r border-border" : "border-r border-border"}`}>
                              <div className="px-3 py-0.5 text-xs text-muted-foreground bg-muted border-b border-border text-center whitespace-nowrap">{col.label}</div>
                              <div className="px-3 py-1 text-right tabular-nums">₩{col.val.toLocaleString("ko-KR")}</div>
                            </div>
                          ))}
                          {detail.returnCostType && (
                            <div className="flex flex-col border-r border-border">
                              <div className="px-3 py-0.5 text-xs text-muted-foreground bg-muted border-b border-border text-center">유형</div>
                              <div className="px-3 py-1 whitespace-nowrap">{typeLabel[detail.returnCostType]}</div>
                            </div>
                          )}
                          {detail.returnCostNote && (
                            <div className="flex flex-col">
                              <div className="px-3 py-0.5 text-xs text-muted-foreground bg-muted border-b border-border text-center">메모</div>
                              <div className="px-3 py-1 text-muted-foreground">{detail.returnCostNote}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  {detail.exchangeIncoming && (
                    <div className="flex gap-2 col-span-2">
                      <span className="text-xs text-muted-foreground w-16 shrink-0">교환 입고</span>
                      <Link href="/inventory/incoming" className="flex items-center gap-1 text-primary hover:underline">
                        {detail.exchangeIncoming.incomingNo}
                        <Badge variant="outline" className="text-xs ml-1">
                          {statusLabels[detail.exchangeIncoming.status] ?? detail.exchangeIncoming.status}
                        </Badge>
                        <ArrowUpRight className="size-3.5" />
                      </Link>
                    </div>
                  )}
                </div>

                {/* 품목 테이블 */}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted text-muted-foreground text-xs">
                      <th className="border-r border-b border-border w-[36px] py-2 text-center font-medium">번호</th>
                      <th className="border-r border-b border-border py-2 px-2 text-left font-medium">품명</th>
                      <th className="border-r border-b border-border py-2 px-2 text-left font-medium">품번</th>
                      <th className="border-r border-b border-border w-[60px] py-2 text-center font-medium">단위</th>
                      <th className="border-r border-b border-border w-[100px] py-2 text-center font-medium">수량</th>
                      <th className="border-r border-b border-border w-[130px] py-2 text-center font-medium">단가</th>
                      <th className="border-b border-border w-[130px] py-2 text-center font-medium">금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((item, idx) => (
                      <tr key={item.id} className="border-b border-border last:border-b-0 hover:bg-muted/50">
                        <td className="border-r border-border text-center text-muted-foreground py-1.5 text-xs">{idx + 1}</td>
                        <td className="border-r border-border px-2 py-1.5 font-medium">{item.supplierProduct.name}</td>
                        <td className="border-r border-border px-2 py-1.5 text-muted-foreground text-xs">{item.supplierProduct.supplierCode ?? "-"}</td>
                        <td className="border-r border-border text-center text-muted-foreground py-1.5">{item.supplierProduct.unitOfMeasure}</td>
                        <td className="border-r border-border text-right px-2 py-1.5 tabular-nums">{parseFloat(item.quantity).toLocaleString("ko-KR")}</td>
                        <td className="border-r border-border text-right px-2 py-1.5 tabular-nums">₩{formatPrice(item.unitPrice)}</td>
                        <td className="text-right px-2 py-1.5 tabular-nums">₩{formatPrice(item.totalPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* 합계 */}
                <div className="border-t border-border bg-muted">
                  <div className="grid grid-cols-3 text-sm">
                    <div className="border-r border-border px-5 py-2.5 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">품목수</span>
                      <span>{detail.items.length}건</span>
                    </div>
                    <div className="col-span-2 px-5 py-2.5 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">합계금액</span>
                      <span className="font-bold text-base tabular-nums">
                        ₩{formatPrice(detail.items.reduce((s, i) => s + parseFloat(i.totalPrice), 0))}
                      </span>
                    </div>
                  </div>
                </div>
              </ScrollArea>

              {detail.status === "PENDING" && (
                <div className="shrink-0 flex justify-between gap-2 px-6 py-3 border-t border-border">
                  <Button variant="destructive" size="sm" onClick={handleDelete} disabled={actionLoading}>
                    {actionLoading ? <Loader2 className="size-4 animate-spin" /> : "삭제"}
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleAction("cancel")} disabled={actionLoading}>취소</Button>
                    <Button size="sm" onClick={() => handleAction("confirm")} disabled={actionLoading}>
                      {actionLoading ? <Loader2 className="size-4 animate-spin" /> : "확정"}
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </SheetContent>
      </Sheet>

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
    </>
  );
}
