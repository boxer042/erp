"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
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
import { Plus, X, Loader2, CornerDownLeft, Check } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  QuickSupplierSheet,
} from "@/components/quick-register-sheets";
import { SupplierCombobox } from "@/components/supplier-combobox";
import { useIsCompactDevice } from "@/hooks/use-mobile";
import { MobileInlineCellProductSearch } from "@/components/inline-cell-product-search-mobile";
import {
  formatComma,
  parseComma,
  formatCommaDecimal,
  parseCommaDecimal,
  calcDiscountPerUnit,
  formatDiscountDisplay,
  normalizeDiscountInput,
} from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";

function InitialHistorySkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
          <TableCell><div className="flex justify-end"><Skeleton className="h-4 w-16" /></div></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

// ─── Types ───

interface Supplier {
  id: string;
  name: string;
  businessNumber?: string | null;
}

interface SupplierProduct {
  id: string;
  name: string;
  spec: string | null;
  supplierCode: string | null;
  unitPrice: string;
  unitOfMeasure: string;
}

interface ItemForm {
  supplierProductId: string;
  supplierProductName: string;
  supplierCode: string;
  spec: string;
  unitOfMeasure: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  supplyAmount: string;
  memo: string;
  isNew?: boolean;
  pendingSourceRow?: number;
}

const emptyItem = (): ItemForm => ({
  supplierProductId: "",
  supplierProductName: "",
  supplierCode: "",
  spec: "",
  unitOfMeasure: "EA",
  quantity: "",
  unitPrice: "",
  discount: "",
  supplyAmount: "",
  memo: "",
});

// ─── 품명 검색 (입고 페이지 InlineCellProductSearch 패턴) ───

function InlineCellProductSearch({
  rowIndex, products, onSelect, onCreateNewInline, onSelectPending, existingIds, pendingNewProducts, selectedName = "", isNew = false, pendingSourceRow,
}: {
  rowIndex: number;
  products: SupplierProduct[];
  onSelect: (product: SupplierProduct) => void;
  onCreateNewInline: (name: string) => void;
  onSelectPending: (item: { name: string; spec: string; supplierCode: string; rowIndex: number }) => void;
  existingIds: string[];
  pendingNewProducts?: { name: string; spec: string; supplierCode: string; rowIndex: number }[];
  selectedName?: string;
  isNew?: boolean;
  pendingSourceRow?: number;
}) {
  const isMobile = useIsCompactDevice();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef(search);
  useEffect(() => { searchRef.current = search; }, [search]);

  if (isMobile) {
    return (
      <MobileInlineCellProductSearch
        rowIndex={rowIndex}
        products={products}
        onSelect={onSelect}
        onCreateNew={onCreateNewInline}
        existingIds={existingIds}
        selectedName={selectedName}
        isNew={isNew}
        pendingSourceRow={pendingSourceRow}
        pendingNewProducts={pendingNewProducts}
        onSelectPending={onSelectPending}
      />
    );
  }

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.supplierCode?.toLowerCase().includes(q) ?? false);
  });

  const triggerCreate = () => {
    const val = searchRef.current.trim();
    if (!val) return;
    setOpen(false);
    setSearch("");
    setTimeout(() => onCreateNewInline(val), 0);
  };

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
          <span className="flex items-center gap-1.5 truncate">
            <span className="font-medium truncate">{selectedName}</span>
            {isNew && pendingSourceRow !== undefined && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground border-dashed shrink-0">
                행 {pendingSourceRow + 1} 재사용
              </Badge>
            )}
            {isNew && pendingSourceRow === undefined && (
              <Badge variant="outline" className="text-[10px] text-primary border-primary/40 shrink-0">신규</Badge>
            )}
          </span>
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
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter" && search.trim() && filtered.length === 0) {
                e.preventDefault();
                triggerCreate();
              }
            }}
          />
          <CommandList>
            <CommandEmpty>
              {search.trim() ? (
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-primary hover:bg-accent rounded cursor-pointer"
                  onClick={triggerCreate}
                >
                  <span className="flex-1 text-left truncate">&quot;{search.trim()}&quot;</span>
                  <kbd className="inline-flex h-5 items-center rounded border border-border bg-card px-1.5 text-[10px] text-muted-foreground font-mono">
                    <CornerDownLeft className="size-3" />
                  </kbd>
                </button>
              ) : "결과 없음"}
            </CommandEmpty>
            {pendingNewProducts && pendingNewProducts.filter((p) => p.rowIndex !== rowIndex && p.name.toLowerCase().includes(search.toLowerCase())).length > 0 && (
              <CommandGroup heading="이미 입력된 신규 항목">
                {pendingNewProducts
                  .filter((p) => p.rowIndex !== rowIndex && p.name.toLowerCase().includes(search.toLowerCase()))
                  .map((p) => (
                    <CommandItem
                      key={`pending-${p.rowIndex}`}
                      value={`pending-${p.rowIndex}`}
                      onSelect={() => { onSelectPending(p); setOpen(false); setSearch(""); }}
                    >
                      <span className="flex-1">{p.name}</span>
                      {p.spec && <span className="text-xs text-muted-foreground ml-1">({p.spec})</span>}
                      <Badge variant="outline" className="ml-2 text-xs text-primary border-primary/40">행 {p.rowIndex + 1} 재사용</Badge>
                    </CommandItem>
                  ))}
              </CommandGroup>
            )}
            <CommandGroup>
              {filtered.map((p) => {
                const alreadyAdded = existingIds.includes(p.id);
                return (
                  <CommandItem
                    key={p.id}
                    value={p.id}
                    onSelect={() => { onSelect(p); setOpen(false); setSearch(""); }}
                  >
                    <span className="flex-1">{p.name}</span>
                    {p.supplierCode && <span className="text-xs text-muted-foreground mr-2">{p.supplierCode}</span>}
                    <span className="text-xs text-muted-foreground">₩{parseFloat(p.unitPrice).toLocaleString("ko-KR")}</span>
                    {alreadyAdded && <Badge variant="outline" className="ml-2 text-xs text-yellow-500 border-yellow-500/40">추가됨</Badge>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {search.trim() && filtered.length > 0 && !filtered.some((p) => p.name.toLowerCase() === search.toLowerCase()) && (
              <CommandGroup>
                <CommandItem onSelect={triggerCreate} className="text-primary">
                  <span className="flex-1 truncate">&quot;{search.trim()}&quot;</span>
                  <kbd className="inline-flex h-5 items-center rounded border border-border bg-card px-1.5 text-[10px] text-muted-foreground font-mono">
                    <CornerDownLeft className="size-3" />
                  </kbd>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── Main Page ───

const formatPrice = (n: number) => n.toLocaleString("ko-KR");

interface InitialHistoryItem {
  id: string;
  name: string;
  spec: string | null;
  supplierCode: string | null;
  unitOfMeasure: string;
  unitPrice: string;
  createdAt: string;
  supplier: { name: string };
}

export default function InitialInventoryPage() {
  const [tab, setTab] = useState<"register" | "history">("register");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [selectedSupplierName, setSelectedSupplierName] = useState("");
  const [supplierProducts, setSupplierProducts] = useState<SupplierProduct[]>([]);
  const [items, setItems] = useState<ItemForm[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // 단가 VAT포함 입력 모드 + 원본 보관 (입고 페이지와 동일)
  const [unitPriceVatIncluded, setUnitPriceVatIncluded] = useState(false);
  const [vatInputBuffer, setVatInputBuffer] = useState<{ idx: number; text: string } | null>(null);
  const [vatRawByIdx, setVatRawByIdx] = useState<Record<number, string>>({});

  // 이력 탭
  const [historyItems, setHistoryItems] = useState<InitialHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState("");

  // 거래처 빠른 등록
  const [quickSupplierOpen, setQuickSupplierOpen] = useState(false);
  const [quickSupplierName, setQuickSupplierName] = useState("");

  // 1회성 가드 — 서버가 돌려준 중복 supplierProductId 집합
  const [duplicateIds, setDuplicateIds] = useState<Set<string>>(new Set());

  const fetchSuppliers = useCallback(async () => {
    try {
      setSuppliers(await apiGet<Supplier[]>("/api/suppliers"));
    } catch {
      // ignore
    }
  }, []);

  const fetchHistory = useCallback(async (search = "") => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      setHistoryItems(await apiGet(`/api/inventory/initial?${params}`));
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);
  useEffect(() => { if (tab === "history") fetchHistory(historySearch); }, [tab, fetchHistory, historySearch]);

  // 미저장 데이터 경고
  const hasUnsavedData = items.some((i) => i.supplierProductId || i.isNew);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedData) { e.preventDefault(); }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedData]);

  // ─── 거래처 관련 ───
  const handleSupplierChange = async (supplierId: string, name: string) => {
    setSelectedSupplierId(supplierId);
    setSelectedSupplierName(name);
    setItems([emptyItem()]);
    setVatRawByIdx({});
    setVatInputBuffer(null);
    if (!supplierId) { setSupplierProducts([]); return; }
    setSupplierProducts(await apiGet<SupplierProduct[]>(`/api/supplier-products?supplierId=${supplierId}`));
  };

  const handleCreateSupplier = (name: string) => {
    setQuickSupplierName(name);
    setQuickSupplierOpen(true);
  };

  const handleQuickSupplierCreated = async (supplier: { id: string; name: string }) => {
    await fetchSuppliers();
    handleSupplierChange(supplier.id, supplier.name);
  };

  // ─── 품목 관련 ───
  const addEmptyRow = () => {
    setItems((prev) => [...prev, emptyItem()]);
  };

  const selectProductForRow = (index: number, sp: SupplierProduct) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        supplierProductId: sp.id,
        supplierProductName: sp.name,
        supplierCode: sp.supplierCode || "",
        spec: sp.spec || "",
        unitOfMeasure: sp.unitOfMeasure,
        unitPrice: sp.unitPrice,
        isNew: undefined,
        pendingSourceRow: undefined,
      };
      return updated;
    });
    setTimeout(() => {
      const el = document.querySelector(`[data-row="${index}"][data-field="unitPrice"]`) as HTMLInputElement;
      el?.focus(); el?.select();
    }, 50);
  };

  const handleSelectPending = (index: number, pending: { name: string; spec: string; supplierCode: string; rowIndex: number }) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...emptyItem(),
        supplierProductName: pending.name,
        spec: pending.spec,
        supplierCode: pending.supplierCode,
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

  const handleCreateNewInline = (index: number, name: string) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...emptyItem(),
        supplierProductName: name,
        isNew: true,
      };
      return updated;
    });
    setTimeout(() => {
      const el = document.querySelector(`[data-row="${index}"][data-field="unitPrice"]`) as HTMLInputElement;
      el?.focus(); el?.select();
    }, 50);
  };

  const updateItem = (index: number, field: keyof ItemForm, value: string) => {
    setItems((prev) => {
      const updated = [...prev];
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
      return updated;
    });
    // 수정하면 해당 행의 중복 표시 해제
    const row = items[index];
    if (row?.supplierProductId && duplicateIds.has(row.supplierProductId)) {
      setDuplicateIds((prev) => {
        const next = new Set(prev);
        next.delete(row.supplierProductId);
        return next;
      });
    }
  };

  const recalcOnBlur = (index: number, field: string, vatRawOverride?: string) => {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };
      const qty = parseFloat(item.quantity || "0");
      const up = parseFloat(item.unitPrice || "0");
      const discPerUnit = calcDiscountPerUnit(up, item.discount);
      const actualPrice = up - discPerUnit;

      if (field === "unitPrice" || field === "quantity" || field === "discount") {
        // VAT포함 입력 원본이 있으면 그 값 기준으로 공급가액 산출 (단가 반올림 round-trip 오차 방지)
        const rawStr = vatRawOverride !== undefined
          ? vatRawOverride
          : (unitPriceVatIncluded ? vatRawByIdx[index] : undefined);
        const raw = parseFloat(rawStr || "0");
        let supply: number;
        if (raw > 0 && qty > 0) {
          supply = Math.round((raw * qty) / 1.1) - discPerUnit * qty;
        } else {
          supply = actualPrice * qty;
        }
        item.supplyAmount = supply > 0 ? String(Math.round(supply)) : "";
      }
      if (field === "supplyAmount") {
        const supply = parseFloat(item.supplyAmount || "0");
        const q = qty > 0 ? qty : 1;
        if (supply > 0) {
          // 공급가액 직접 입력 시 할인 정보는 유지 못 하므로 단가만 역산
          item.unitPrice = String(Math.round(supply / q));
          item.discount = "";
          if (!item.quantity) item.quantity = "1";
        }
      }

      updated[index] = item;
      return updated;
    });
  };

  const removeItem = (index: number) => {
    const row = items[index];
    if (row?.supplierProductId && duplicateIds.has(row.supplierProductId)) {
      setDuplicateIds((prev) => {
        const next = new Set(prev);
        next.delete(row.supplierProductId);
        return next;
      });
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // ─── 신규 입력 중인 항목 목록 (다른 행에서 검색 가능) ───
  const pendingNewProducts = items
    .map((item, idx) => item.isNew && item.supplierProductName
      ? { name: item.supplierProductName, spec: item.spec || "", supplierCode: item.supplierCode || "", rowIndex: idx }
      : null)
    .filter((x): x is { name: string; spec: string; supplierCode: string; rowIndex: number } => x !== null);

  // ─── 합계 ───
  const validItems = items.filter((i) => i.supplierProductId || i.isNew);
  const totalSupply = validItems.reduce((sum, i) => {
    const qty = parseFloat(i.quantity || "0");
    const up = parseFloat(i.unitPrice || "0");
    const actual = up - calcDiscountPerUnit(up, i.discount);
    return sum + (i.supplyAmount ? parseFloat(i.supplyAmount) : actual * qty);
  }, 0);
  const totalTax = Math.round(totalSupply * 0.1);
  const totalDiscount = validItems.reduce((sum, i) => {
    const qty = parseFloat(i.quantity || "0");
    const up = parseFloat(i.unitPrice || "0");
    return sum + calcDiscountPerUnit(up, i.discount) * qty;
  }, 0);

  // ─── 제출 ───
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload = validItems.map((i) => {
        const up = parseFloat(i.unitPrice || "0");
        const discPerUnit = calcDiscountPerUnit(up, i.discount);
        const actualPrice = up - discPerUnit;
        return {
          supplierId: selectedSupplierId,
          ...(i.isNew
            ? { newSupplierProduct: { name: i.supplierProductName, spec: i.spec || undefined, supplierCode: i.supplierCode || undefined, unitOfMeasure: i.unitOfMeasure } }
            : { supplierProductId: i.supplierProductId, spec: i.spec || undefined }),
          quantity: i.quantity,
          unitPrice: String(actualPrice),
          ...(discPerUnit > 0 ? { originalPrice: String(up), discountAmount: String(discPerUnit) } : {}),
          memo: i.memo || undefined,
        };
      });

      if (payload.length === 0) { toast.error("등록할 항목이 없습니다"); return; }

      let result: { count: number; lotsCreated: number };
      try {
        result = await apiMutate("/api/inventory/initial", "POST", { items: payload });
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          const body = err.details as { duplicates?: Array<{ supplierProductId: string }> } | undefined;
          if (body?.duplicates && Array.isArray(body.duplicates)) {
            const ids = new Set<string>(body.duplicates.map((d) => d.supplierProductId));
            setDuplicateIds(ids);
            setConfirmOpen(false);
            toast.error(`${body.duplicates.length}건 중복 — 강조된 행을 제거해주세요`);
            return;
          }
        }
        toast.error(err instanceof ApiError ? err.message : "등록 실패");
        return;
      }
      toast.success(`${result.count}개 등록 완료 (로트 ${result.lotsCreated}건 생성)`);
      setConfirmOpen(false);
      setDuplicateIds(new Set());

      // 공급상품 목록 새로고침
      if (selectedSupplierId) {
        try {
          setSupplierProducts(await apiGet<SupplierProduct[]>(`/api/supplier-products?supplierId=${selectedSupplierId}`));
        } catch {
          // ignore
        }
      }
      // 행 초기화
      setItems([emptyItem()]);
      setVatRawByIdx({});
      setVatInputBuffer(null);
    } catch {
      toast.error("오류가 발생했습니다");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Tabs value={tab} onValueChange={setTab} className="flex h-full flex-col gap-0">
        {/* 상단 툴바 */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-2.5">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium">초기 등록</h2>
            <TabsList className="h-[30px] text-[13px]">
              <TabsTrigger value="register">등록</TabsTrigger>
              <TabsTrigger value="history">이력</TabsTrigger>
            </TabsList>
          </div>
          <div className="flex items-center gap-2">
            {tab === "register" && validItems.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {validItems.length}건 · ₩{formatPrice(totalSupply)}
              </span>
            )}
            {tab === "register" && (
              <Button
                size="sm"
                className="h-[30px] text-[13px]"
                disabled={validItems.length === 0 || !selectedSupplierId || submitting}
                onClick={() => setConfirmOpen(true)}
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
                일괄 등록
              </Button>
            )}
          </div>
        </div>

        {/* 등록 탭 콘텐츠 */}
        <TabsContent value="register" className="flex-1 mt-0">
          <ScrollArea className="h-full">
          <div className="border-b border-border">
            {/* 거래처 선택 */}
            <div className="bg-muted px-3 py-1.5 text-xs text-muted-foreground font-medium border-b border-border">공급자 (거래처)</div>
            <div className="p-3 max-w-sm">
              <SupplierCombobox
                suppliers={suppliers}
                value={selectedSupplierId}
                onChange={handleSupplierChange}
                onCreateNew={handleCreateSupplier}
              />
            </div>
          </div>

          {/* 품목 테이블 — 거래명세표 스타일 */}
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
                const isDuplicate = !!item.supplierProductId && duplicateIds.has(item.supplierProductId);
                const qty = parseFloat(item.quantity || "0");
                const up = parseFloat(item.unitPrice || "0");
                const discPerUnit = calcDiscountPerUnit(up, item.discount);
                const actualPrice = up - discPerUnit;
                const lineSupply = item.supplyAmount ? parseFloat(item.supplyAmount) : actualPrice * qty;
                const lineTax = Math.round(lineSupply * 0.1);

                return (
                  <tr key={`row-${idx}`} className={`group border-b border-border ${isDuplicate ? "bg-destructive/20 hover:bg-destructive/30" : "hover:bg-muted/50"}`}>
                    {/* 번호 */}
                    <td className="border-r border-border text-center text-muted-foreground py-1">{idx + 1}</td>

                    {/* 품번 */}
                    <td className="border-r border-border p-0.5">
                      <input
                        data-row={idx} data-field="supplierCode"
                        value={item.supplierCode}
                        onChange={(e) => updateItem(idx, "supplierCode", e.target.value)}
                        disabled={isEmptyRow}
                        className="w-full h-7 bg-transparent text-sm px-2 outline-none focus:bg-muted rounded disabled:opacity-30"
                      />
                    </td>

                    {/* 품명 */}
                    <td className="border-r border-border px-1 py-0.5">
                      {selectedSupplierId ? (
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 min-w-0">
                            <InlineCellProductSearch
                              rowIndex={idx}
                              products={supplierProducts}
                              onSelect={(sp) => selectProductForRow(idx, sp)}
                              onCreateNewInline={(name) => handleCreateNewInline(idx, name)}
                              onSelectPending={(p) => handleSelectPending(idx, p)}
                              existingIds={items.map((i) => i.supplierProductId).filter(Boolean)}
                              pendingNewProducts={pendingNewProducts}
                              selectedName={item.supplierProductName}
                              isNew={item.isNew}
                              pendingSourceRow={item.pendingSourceRow}
                            />
                          </div>
                          {isDuplicate && (
                            <Badge variant="destructive" className="text-[10px] shrink-0">이미 초기등록됨</Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground px-2">거래처를 선택하세요</span>
                      )}
                    </td>

                    {/* 규격 */}
                    <td className="border-r border-border p-0.5">
                      <input
                        data-row={idx} data-field="spec"
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
                        data-row={idx} data-field="quantity"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                        onBlur={() => recalcOnBlur(idx, "quantity")}
                        onFocus={(e) => { if (e.target.value === "0") updateItem(idx, "quantity", ""); }}
                        disabled={isEmptyRow}
                        inputMode="decimal"
                        className="w-full h-7 bg-transparent text-right text-sm px-2 outline-none focus:bg-muted rounded disabled:opacity-30"
                      />
                    </td>

                    {/* 단가 — VAT포함 ON이면 표시는 ×1.1, 저장은 round(input/1.1) */}
                    <td className="border-r border-border p-0.5">
                      <input
                        data-row={idx} data-field="unitPrice"
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
                            : formatComma(item.unitPrice)
                        }
                        onChange={(e) => {
                          if (unitPriceVatIncluded) {
                            setVatInputBuffer({ idx, text: e.target.value });
                          } else {
                            updateItem(idx, "unitPrice", parseComma(e.target.value));
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
                        data-row={idx} data-field="discount"
                        inputMode={item.discount.trim().endsWith("%") ? "decimal" : "numeric"}
                        value={formatDiscountDisplay(item.discount)}
                        onChange={(e) => updateItem(idx, "discount", normalizeDiscountInput(e.target.value))}
                        onBlur={() => recalcOnBlur(idx, "discount")}
                        onFocus={(e) => e.currentTarget.select()}
                        disabled={isEmptyRow || up === 0}
                        className={`w-full h-7 bg-transparent text-right text-sm px-2 outline-none focus:bg-muted rounded disabled:opacity-30 ${discPerUnit > 0 ? "text-red-400" : ""}`}
                      />
                    </td>

                    {/* 실제단가 */}
                    <td className="border-r border-border text-right px-2 py-1 tabular-nums">
                      {!isEmptyRow && actualPrice > 0 && formatPrice(actualPrice)}
                    </td>

                    {/* 공급가액 */}
                    <td className="border-r border-border p-0.5">
                      <input
                        data-row={idx} data-field="supplyAmount"
                        value={item.supplyAmount ? formatComma(item.supplyAmount) : ""}
                        onChange={(e) => updateItem(idx, "supplyAmount", parseComma(e.target.value))}
                        onBlur={() => recalcOnBlur(idx, "supplyAmount")}
                        disabled={isEmptyRow}
                        inputMode="numeric"
                        placeholder={isEmptyRow ? "" : lineSupply ? formatComma(String(Math.round(lineSupply))) : ""}
                        className="w-full h-7 bg-transparent text-right text-sm px-2 outline-none focus:bg-muted rounded disabled:opacity-30 tabular-nums placeholder:text-muted-foreground"
                      />
                    </td>

                    {/* 세액 */}
                    <td className="border-r border-border text-right px-2 py-1 text-muted-foreground tabular-nums">
                      {!isEmptyRow && lineTax > 0 && formatPrice(lineTax)}
                    </td>

                    {/* 비고 + 삭제 */}
                    <td className="p-0.5">
                      <div className="flex items-center gap-0.5">
                        <input
                          data-row={idx} data-field="memo"
                          value={item.memo}
                          onChange={(e) => updateItem(idx, "memo", e.target.value)}
                          disabled={isEmptyRow}
                          className="flex-1 min-w-0 h-7 bg-transparent text-sm px-2 outline-none focus:bg-muted rounded disabled:opacity-30"
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
            </tbody>
          </table>
          </div>

          {/* 행 추가 */}
          <div className="flex items-center border-t border-border px-3 py-2">
            <button
              className={`flex items-center gap-1.5 text-sm ${selectedSupplierId ? "text-primary hover:underline" : "text-muted-foreground cursor-not-allowed"}`}
              onClick={addEmptyRow}
              disabled={!selectedSupplierId}
            >
              <Plus className="size-4" />행 추가
            </button>
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
                <span className="tabular-nums">₩{formatPrice(Math.round(totalSupply))}</span>
              </div>
              <div className="border-r border-border px-3 py-2.5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">세액</span>
                <span className="tabular-nums">{totalTax > 0 ? `₩${formatPrice(totalTax)}` : ""}</span>
              </div>
              <div className="border-r border-border px-3 py-2.5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">할인합계</span>
                <span className={`tabular-nums ${totalDiscount > 0 ? "text-red-400" : ""}`}>
                  {totalDiscount > 0 ? `-₩${formatPrice(Math.round(totalDiscount))}` : ""}
                </span>
              </div>
              <div className="px-3 py-2.5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">합계금액</span>
                <span className="font-bold text-base tabular-nums">₩{formatPrice(Math.round(totalSupply) + totalTax)}</span>
              </div>
            </div>
          </div>
          </ScrollArea>
        </TabsContent>

        {/* 이력 탭 콘텐츠 */}
        <TabsContent value="history" className="flex-1 mt-0">
          <ScrollArea className="h-full">
          <div className="space-y-0">
            <div className="border-b border-border px-5 py-2.5">
              <input
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) fetchHistory(historySearch); }}
                placeholder="품명 또는 품번 검색..."
                className="h-[30px] w-full max-w-[320px] rounded-md border border-border bg-card px-3 text-[13px] outline-none focus:border-primary"
              />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>거래처</TableHead>
                  <TableHead>품명</TableHead>
                  <TableHead>규격</TableHead>
                  <TableHead>품번</TableHead>
                  <TableHead>단위</TableHead>
                  <TableHead className="text-right">단가</TableHead>
                  <TableHead>등록일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyLoading ? (
                  <InitialHistorySkeletonRows />
                ) : historyItems.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8">초기 등록 이력이 없습니다</TableCell></TableRow>
                ) : (
                  historyItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.supplier.name}</TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-muted-foreground">{item.spec || "-"}</TableCell>
                      <TableCell className="text-muted-foreground">{item.supplierCode || "-"}</TableCell>
                      <TableCell>{item.unitOfMeasure}</TableCell>
                      <TableCell className="text-right">₩{parseFloat(item.unitPrice).toLocaleString("ko-KR")}</TableCell>
                      <TableCell className="text-muted-foreground">{new Date(item.createdAt).toLocaleDateString("ko-KR")}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* 일괄 등록 확인 */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>초기 등록 확인</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              거래처 <strong>{selectedSupplierName}</strong>의 <strong>{validItems.length}건</strong> 공급상품/재고를 초기등록합니다.
            </p>
            <p className="text-muted-foreground">
              총 공급가액: <strong>₩{formatPrice(totalSupply)}</strong>
            </p>
            <div className="rounded-md bg-card border border-border p-3 text-xs text-muted-foreground space-y-1">
              <p>· 신규 품목은 거래처 공급상품으로 등록됩니다</p>
              <p>· 공급상품마다 기초재고 로트(source: INITIAL)가 1건씩 생성됩니다</p>
              <p>· 판매상품 매핑이 있으면 재고에 환산 반영, 없으면 미매핑 로트로 기록됩니다</p>
              <p>· 1회성 작업입니다. 같은 공급상품에 이미 초기등록이 있으면 거부됩니다</p>
              <p>· 거래처 원장(미지급금)에는 영향 없습니다</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>취소</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              등록
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 거래처 빠른 등록 */}
      <QuickSupplierSheet
        open={quickSupplierOpen}
        onOpenChange={setQuickSupplierOpen}
        defaultName={quickSupplierName}
        onCreated={handleQuickSupplierCreated}
      />
    </>
  );
}
