"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { Loader2, X, Check, Plus, Info } from "lucide-react";
import { toast } from "sonner";

import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { focusCaretEnd } from "@/jm/lib/focus";
import {
  calcDiscountPerUnit,
  formatComma,
  formatCommaDecimal,
  formatDiscountDisplay,
  normalizeDiscountInput,
  parseComma,
  parseCommaDecimal,
} from "@/lib/utils";

import { QuickSupplierSheet } from "@/components/quick-register-sheets";
import { SupplierCombobox } from "@/components/supplier-combobox";

import {
  JmBadge,
  JmButton,
  JmDateRangePicker,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmIconButton,
  JmScope,
  JmScrollArea,
  JmSegmentedControl,
  JmTabs,
  JmTabsList,
  JmTabsPanel,
  JmTabsTrigger,
  JmTooltip,
  JmTooltipProvider,
  type DateRange,
} from "@/jm";

import {
  HistoryTable,
  InlineCellProductSearch,
  SummaryFooter,
} from "./_parts";
import {
  buildPayload,
  calcLine,
  calcTotals,
  formatPrice,
  hasUnsaved,
} from "./_helpers";
import {
  emptyItem,
  TAB_OPTIONS,
  type InitialHistoryItem,
  type ItemForm,
  type PendingNewProduct,
  type Supplier,
  type SupplierProduct,
  type Tab,
} from "./_types";

interface SupplierProductApiResp {
  id: string;
  name: string;
  spec: string | null;
  supplierCode: string | null;
  unitPrice: string;
  unitOfMeasure: string;
  productMappings?: { id: string }[];
}

export default function InitialInventoryPage() {
  const { resolvedTheme } = useTheme();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("register");

  // ─── 등록 탭 state ──────────────────────────────────────────────────────
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [selectedSupplierName, setSelectedSupplierName] = useState("");
  const [items, setItems] = useState<ItemForm[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [supplierChangeConfirm, setSupplierChangeConfirm] = useState<{
    nextId: string;
    nextName: string;
  } | null>(null);

  // 단가 VAT포함 입력 모드 + 원본 보관
  const [unitPriceVatIncluded, setUnitPriceVatIncluded] = useState(false);
  const [vatInputBuffer, setVatInputBuffer] = useState<{
    idx: number;
    text: string;
  } | null>(null);
  const [vatRawByIdx, setVatRawByIdx] = useState<Record<number, string>>({});

  // 거래처 빠른 등록
  const [quickSupplierOpen, setQuickSupplierOpen] = useState(false);
  const [quickSupplierName, setQuickSupplierName] = useState("");

  // 1회성 가드 — 서버가 돌려준 중복 supplierProductId 집합
  const [duplicateIds, setDuplicateIds] = useState<Set<string>>(new Set());

  // ─── 이력 탭 state ──────────────────────────────────────────────────────
  const [historySearch, setHistorySearch] = useState("");
  const [historySupplierId, setHistorySupplierId] = useState("");
  const [historyDateRange, setHistoryDateRange] = useState<DateRange | undefined>(undefined);

  // ─── 거래처 ─────────────────────────────────────────────────────────────
  const suppliersQuery = useQuery({
    queryKey: queryKeys.suppliers.list(),
    queryFn: () => apiGet<Supplier[]>("/api/suppliers"),
  });
  const suppliers = suppliersQuery.data ?? [];

  // ─── 공급상품 (선택된 거래처 한정) ──────────────────────────────────────
  const supplierProductsQuery = useQuery({
    queryKey: queryKeys.supplierProducts.list({ supplierId: selectedSupplierId }),
    queryFn: () =>
      apiGet<SupplierProductApiResp[]>(
        `/api/supplier-products?supplierId=${selectedSupplierId}`,
      ),
    enabled: !!selectedSupplierId,
  });
  const supplierProducts: SupplierProduct[] = (supplierProductsQuery.data ?? []).map(
    (sp) => ({
      id: sp.id,
      name: sp.name,
      spec: sp.spec,
      supplierCode: sp.supplierCode,
      unitPrice: sp.unitPrice,
      unitOfMeasure: sp.unitOfMeasure,
      hasMapping: (sp.productMappings?.length ?? 0) > 0,
    }),
  );

  // ─── 이력 ───────────────────────────────────────────────────────────────
  const historyParams: Record<string, string> = {};
  if (historySearch) historyParams.search = historySearch;
  if (historySupplierId) historyParams.supplierId = historySupplierId;

  const historyQuery = useQuery({
    queryKey: queryKeys.inventory.initial.history({
      search: historySearch,
      supplierId: historySupplierId,
    }),
    queryFn: () => {
      const params = new URLSearchParams(historyParams);
      return apiGet<InitialHistoryItem[]>(`/api/inventory/initial?${params}`);
    },
    enabled: tab === "history",
  });
  const historyItems = historyQuery.data ?? [];

  // 클라이언트측 기간 필터 (API 가 기간 안 받음)
  const filteredHistoryItems = historyDateRange?.from
    ? historyItems.filter((it) => {
        const d = new Date(it.createdAt);
        const from = historyDateRange.from!;
        const to = historyDateRange.to ?? from;
        const dayStart = new Date(from);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(to);
        dayEnd.setHours(23, 59, 59, 999);
        return d >= dayStart && d <= dayEnd;
      })
    : historyItems;

  // ─── 미저장 데이터 경고 ────────────────────────────────────────────────
  const isDirty = hasUnsaved(items);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // ─── 거래처 변경 ────────────────────────────────────────────────────────
  const applySupplierChange = (id: string, name: string) => {
    setSelectedSupplierId(id);
    setSelectedSupplierName(name);
    setItems(id ? [emptyItem()] : []);
    setVatRawByIdx({});
    setVatInputBuffer(null);
    setDuplicateIds(new Set());
  };

  const handleSupplierChange = (id: string, name: string) => {
    if (id === selectedSupplierId) return;
    if (isDirty) {
      setSupplierChangeConfirm({ nextId: id, nextName: name });
      return;
    }
    applySupplierChange(id, name);
  };

  const handleCreateSupplier = (name: string) => {
    setQuickSupplierName(name);
    setQuickSupplierOpen(true);
  };

  const handleQuickSupplierCreated = async (sup: { id: string; name: string }) => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });
    applySupplierChange(sup.id, sup.name);
  };

  // ─── 행 조작 ────────────────────────────────────────────────────────────
  const addEmptyRow = () => {
    setItems((prev) => [...prev, emptyItem()]);
  };

  const focusFieldNextTick = (rowIdx: number, field: string) => {
    setTimeout(() => {
      const el = document.querySelector(
        `[data-row="${rowIdx}"][data-field="${field}"]`,
      ) as HTMLInputElement | null;
      el?.focus();
      el?.select?.();
    }, 50);
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
    focusFieldNextTick(index, "unitPrice");
  };

  const handleSelectPending = (index: number, pending: PendingNewProduct) => {
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
    focusFieldNextTick(index, "spec");
  };

  const handleCreateNewInline = (index: number, name: string) => {
    setItems((prev) => {
      const updated = [...prev];
      const existing = updated[index];
      // 이미 값이 입력된 행이면 SP 식별 필드만 비우고 수량·단가·메모 등은 보존
      // (입고등록과 동일 패턴). 빈 행이면 풀 초기화.
      const hasData = existing.quantity || existing.unitPrice;
      updated[index] = {
        ...existing,
        supplierProductId: "",
        supplierProductName: name,
        supplierCode: "",
        isNew: true,
        pendingSourceRow: undefined,
        ...(hasData
          ? {}
          : {
              spec: "",
              unitOfMeasure: "EA",
              quantity: "",
              unitPrice: "",
              discount: "",
              supplyAmount: "",
              memo: "",
            }),
      };
      return updated;
    });
    focusFieldNextTick(index, "spec");
  };

  const updateItem = (index: number, field: keyof ItemForm, value: string) => {
    setItems((prev) => {
      const updated = [...prev];
      const next = { ...updated[index], [field]: value };
      // 재사용으로 들어온 행이 원본과 다른 값으로 수정되면 분리 표시
      if (
        next.pendingSourceRow !== undefined &&
        (field === "supplierProductName" ||
          field === "spec" ||
          field === "supplierCode")
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

  const recalcOnBlur = (
    index: number,
    field: string,
    vatRawOverride?: string,
  ) => {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };
      const qty = parseFloat(item.quantity || "0");
      const up = parseFloat(item.unitPrice || "0");
      const discPerUnit = calcDiscountPerUnit(up, item.discount);
      const actualPrice = up - discPerUnit;

      if (field === "unitPrice" || field === "quantity" || field === "discount") {
        const rawStr =
          vatRawOverride !== undefined
            ? vatRawOverride
            : unitPriceVatIncluded
              ? vatRawByIdx[index]
              : undefined;
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

  // ─── 신규 입력 중 항목 (다른 행에서 검색 가능) ──────────────────────────
  const pendingNewProducts: PendingNewProduct[] = items
    .map((item, idx): PendingNewProduct | null =>
      item.isNew && item.supplierProductName
        ? {
            name: item.supplierProductName,
            spec: item.spec || "",
            supplierCode: item.supplierCode || "",
            rowIndex: idx,
          }
        : null,
    )
    .filter((x): x is PendingNewProduct => x !== null);

  // ─── 합계 ──────────────────────────────────────────────────────────────
  const totals = calcTotals(items);

  // ─── 등록 mutation ─────────────────────────────────────────────────────
  const registerMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload(items, selectedSupplierId);
      if (payload.length === 0) throw new ApiError("등록할 항목이 없습니다", 400);
      return apiMutate<{ count: number; lotsCreated: number }>(
        "/api/inventory/initial",
        "POST",
        { items: payload },
      );
    },
    onSuccess: async (result) => {
      toast.success(`${result.count}개 등록 완료 (로트 ${result.lotsCreated}건 생성)`);
      setConfirmOpen(false);
      setDuplicateIds(new Set());
      setItems([emptyItem()]);
      setVatRawByIdx({});
      setVatInputBuffer(null);
      // 공급상품 / 이력 / 로트 / 재고 모두 영향
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.supplierProducts.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.inventory.initial.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
      ]);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.details as
          | { duplicates?: Array<{ supplierProductId: string }> }
          | undefined;
        if (body?.duplicates?.length) {
          setDuplicateIds(new Set(body.duplicates.map((d) => d.supplierProductId)));
          setConfirmOpen(false);
          toast.error(`${body.duplicates.length}건 중복 — 강조된 행을 제거해주세요`);
          return;
        }
      }
      toast.error(err instanceof ApiError ? err.message : "등록 실패");
    },
  });

  // ─── 마지막 셀에서 Tab → 자동 행추가 ───────────────────────────────────
  const handleLastCellTab = (rowIdx: number, e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || e.shiftKey) return;
    if (rowIdx !== items.length - 1) return;
    const item = items[rowIdx];
    if (!item.supplierProductId && !item.isNew) return;
    e.preventDefault();
    addEmptyRow();
    focusFieldNextTick(rowIdx + 1, "supplierCode");
  };

  // ─── 렌더 ──────────────────────────────────────────────────────────────
  return (
    <JmScope
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      className="flex h-full flex-col"
    >
      <JmTooltipProvider delay={200}>
        <JmTabs
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
          className="flex h-full flex-col gap-0"
        >
          {/* 페이지 상단 헤더 — sticky, jm 표준 패턴 */}
          <div className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-3 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-4">
            <h2 className="text-jm-base font-semibold text-[var(--jm-text)]">
              초기 등록
            </h2>
            <JmTabsList variant="pill">
              {TAB_OPTIONS.map((opt) => (
                <JmTabsTrigger key={opt.value} value={opt.value} className="h-7 px-3 text-jm-xs">
                  {opt.label}
                </JmTabsTrigger>
              ))}
            </JmTabsList>
            <div className="ml-auto flex items-center gap-3">
              {tab === "register" && totals.validCount > 0 && (
                <span className="text-jm-xs text-[var(--jm-text-muted)] tabular-nums">
                  {totals.validCount}건 · ₩{formatPrice(totals.totalSupply)}
                </span>
              )}
              {tab === "register" && (
                <JmButton
                  variant="cta"
                  size="sm"
                  disabled={
                    totals.validCount === 0 ||
                    !selectedSupplierId ||
                    registerMutation.isPending
                  }
                  onClick={() => setConfirmOpen(true)}
                >
                  {registerMutation.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                  일괄 등록
                </JmButton>
              )}
            </div>
          </div>

          {/* ─── 등록 탭 ─── */}
          <JmTabsPanel value="register" className="flex-1 min-h-0">
            <JmScrollArea className="h-full" viewportClassName="">
              {/* 거래처 + VAT 토글 — 상단 영역 */}
              <div className="border-b border-[var(--jm-border)]">
                <div className="bg-[var(--jm-surface-muted)] px-4 py-1.5 text-jm-xs font-medium text-[var(--jm-text-muted)] border-b border-[var(--jm-border)]">
                  공급자 (거래처)
                </div>
                <div className="flex flex-wrap items-end gap-4 p-4">
                  <div className="w-full sm:w-[320px]">
                    <SupplierCombobox
                      suppliers={suppliers}
                      value={selectedSupplierId}
                      onChange={handleSupplierChange}
                      onCreateNew={handleCreateSupplier}
                    />
                  </div>
                  {/* VAT 포함 토글 — 페이지 상단 격상 */}
                  <div className="flex flex-col gap-1">
                    <span className="text-jm-2xs font-medium text-[var(--jm-text-muted)]">
                      단가 입력 모드
                    </span>
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

              {/* 품목 테이블 — 거래명세표 스타일 (인라인 편집) */}
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
                      const isDuplicate =
                        !!item.supplierProductId &&
                        duplicateIds.has(item.supplierProductId);
                      const matchedSp = supplierProducts.find(
                        (sp) => sp.id === item.supplierProductId,
                      );
                      const willOrphan =
                        !!item.supplierProductId && matchedSp?.hasMapping === false;
                      const calc = calcLine(item);

                      return (
                        <tr
                          key={`row-${idx}`}
                          className={`group border-b border-[var(--jm-border)] ${
                            isDuplicate
                              ? "bg-[var(--jm-danger-bg)] hover:bg-[var(--jm-danger-bg)]"
                              : "hover:bg-[var(--jm-surface-muted)]"
                          }`}
                        >
                          <td className="border-r border-[var(--jm-border)] text-center text-[var(--jm-text-muted)] py-1 text-jm-xs tabular-nums">
                            {idx + 1}
                          </td>
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
                                    onSelectPending={(p) => handleSelectPending(idx, p)}
                                    existingIds={items
                                      .map((i) => i.supplierProductId)
                                      .filter(Boolean)}
                                    pendingNewProducts={pendingNewProducts}
                                    selectedName={item.supplierProductName}
                                    isNew={item.isNew}
                                    pendingSourceRow={item.pendingSourceRow}
                                    loading={
                                      supplierProductsQuery.isPending ||
                                      supplierProductsQuery.isFetching
                                    }
                                  />
                                </div>
                                {willOrphan && (
                                  <JmTooltip content="이 공급상품은 매핑이 없어 등록 시 오르판 로트로 들어갑니다 (가용 재고 미반영).">
                                    <span className="size-1.5 rounded-full bg-[var(--jm-warning-solid)] shrink-0" />
                                  </JmTooltip>
                                )}
                                {isDuplicate && (
                                  <JmBadge variant="danger" size="sm" shape="square" className="shrink-0">
                                    이미 초기등록됨
                                  </JmBadge>
                                )}
                              </div>
                            ) : (
                              <span className="text-jm-xs text-[var(--jm-text-muted)] px-2">
                                거래처를 선택하세요
                              </span>
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
                          <td className="border-r border-[var(--jm-border)] text-center text-jm-xs text-[var(--jm-text-muted)] py-1">
                            {item.unitOfMeasure}
                          </td>
                          {/* 수량 */}
                          <td className="border-r border-[var(--jm-border)] p-0.5">
                            <input
                              data-row={idx}
                              data-field="quantity"
                              value={item.quantity}
                              onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                              onBlur={() => recalcOnBlur(idx, "quantity")}
                              onFocus={(e) => {
                                if (e.target.value === "0") updateItem(idx, "quantity", "");
                              }}
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
                                  ? vatInputBuffer?.idx === idx
                                    ? vatInputBuffer.text
                                    : vatRawByIdx[idx] !== undefined
                                      ? formatCommaDecimal(vatRawByIdx[idx])
                                      : item.unitPrice
                                        ? formatCommaDecimal(
                                            String(Math.round(parseFloat(item.unitPrice) * 1.1)),
                                          )
                                        : ""
                                  : formatComma(item.unitPrice)
                              }
                              onChange={(e) => {
                                if (unitPriceVatIncluded) {
                                  setVatInputBuffer({ idx, text: e.target.value });
                                } else {
                                  updateItem(idx, "unitPrice", parseComma(e.target.value));
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
                                unitPriceVatIncluded
                                  ? "text-[var(--jm-info-fg)]"
                                  : "text-[var(--jm-text)]"
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
                              onChange={(e) =>
                                updateItem(idx, "discount", normalizeDiscountInput(e.target.value))
                              }
                              onBlur={() => recalcOnBlur(idx, "discount")}
                              onFocus={focusCaretEnd}
                              disabled={isEmptyRow || calc.unitPrice === 0}
                              className={`w-full h-7 bg-transparent text-right text-jm-sm px-2 outline-none focus:bg-[var(--jm-surface-muted)] rounded disabled:opacity-30 tabular-nums ${
                                calc.discPerUnit > 0
                                  ? "text-[var(--jm-danger-fg)]"
                                  : "text-[var(--jm-text)]"
                              }`}
                            />
                          </td>
                          {/* 실제단가 */}
                          <td className="border-r border-[var(--jm-border)] text-right px-2 py-1 tabular-nums text-[var(--jm-text)]">
                            {!isEmptyRow && calc.actualPrice > 0 && formatPrice(calc.actualPrice)}
                          </td>
                          {/* 공급가액 */}
                          <td className="border-r border-[var(--jm-border)] p-0.5">
                            <input
                              data-row={idx}
                              data-field="supplyAmount"
                              value={item.supplyAmount ? formatComma(item.supplyAmount) : ""}
                              onChange={(e) =>
                                updateItem(idx, "supplyAmount", parseComma(e.target.value))
                              }
                              onBlur={() => recalcOnBlur(idx, "supplyAmount")}
                              disabled={isEmptyRow}
                              inputMode="numeric"
                              placeholder={
                                isEmptyRow
                                  ? ""
                                  : calc.lineSupply
                                    ? formatComma(String(Math.round(calc.lineSupply)))
                                    : ""
                              }
                              className="w-full h-7 bg-transparent text-right text-jm-sm text-[var(--jm-text)] px-2 outline-none focus:bg-[var(--jm-surface-muted)] rounded disabled:opacity-30 tabular-nums placeholder:text-[var(--jm-text-subtle)]"
                            />
                          </td>
                          {/* 세액 */}
                          <td className="border-r border-[var(--jm-border)] text-right px-2 py-1 text-[var(--jm-text-muted)] tabular-nums">
                            {!isEmptyRow && calc.lineTax > 0 && formatPrice(calc.lineTax)}
                          </td>
                          {/* 비고 + 삭제 */}
                          <td className="p-0.5">
                            <div className="flex items-center gap-0.5">
                              <input
                                data-row={idx}
                                data-field="memo"
                                value={item.memo}
                                onChange={(e) => updateItem(idx, "memo", e.target.value)}
                                onKeyDown={(e) => handleLastCellTab(idx, e)}
                                disabled={isEmptyRow}
                                className="flex-1 min-w-0 h-7 bg-transparent text-jm-sm text-[var(--jm-text)] px-2 outline-none focus:bg-[var(--jm-surface-muted)] rounded disabled:opacity-30"
                              />
                              <button
                                type="button"
                                onClick={() => removeItem(idx)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--jm-text-muted)] hover:text-[var(--jm-danger-fg)] p-1 shrink-0"
                                aria-label="행 삭제"
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
              <div className="flex items-center border-t border-[var(--jm-border)] px-3 py-2">
                <button
                  type="button"
                  className={`flex items-center gap-1.5 text-jm-sm ${
                    selectedSupplierId
                      ? "text-[var(--jm-text)] hover:text-[var(--jm-action)]"
                      : "text-[var(--jm-text-subtle)] cursor-not-allowed"
                  }`}
                  onClick={addEmptyRow}
                  disabled={!selectedSupplierId}
                >
                  <Plus className="size-4" />
                  행 추가
                </button>
                <span className="ml-auto text-jm-2xs text-[var(--jm-text-subtle)]">
                  마지막 행에서 Tab 키로 자동 추가
                </span>
              </div>

              <SummaryFooter {...totals} />
            </JmScrollArea>
          </JmTabsPanel>

          {/* ─── 이력 탭 ─── */}
          <JmTabsPanel value="history" className="flex-1 min-h-0">
            <JmScrollArea className="h-full" viewportClassName="">
              {/* 필터 영역 — label + 컨트롤 묶음 그리드 */}
              <div className="border-b border-[var(--jm-border)] bg-[var(--jm-surface)] px-4 py-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1 min-w-[240px] flex-[2]">
                    <label className="text-jm-2xs font-medium text-[var(--jm-text-muted)]">
                      검색
                    </label>
                    <input
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder="품명 또는 품번"
                      className="h-9 w-full rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 text-jm-sm text-[var(--jm-text)] placeholder:text-[var(--jm-text-subtle)] outline-none focus-visible:ring-4 focus-visible:ring-[var(--jm-ring)]"
                    />
                  </div>
                  <div className="flex flex-col gap-1 min-w-[200px] flex-1">
                    <label className="text-jm-2xs font-medium text-[var(--jm-text-muted)]">
                      거래처
                    </label>
                    <SupplierCombobox
                      suppliers={suppliers}
                      value={historySupplierId}
                      onChange={(id) => setHistorySupplierId(id)}
                      onCreateNew={() => {}}
                      clearable
                      placeholder="전체 거래처"
                    />
                  </div>
                  <div className="flex flex-col gap-1 min-w-[260px] flex-1">
                    <label className="text-jm-2xs font-medium text-[var(--jm-text-muted)]">
                      등록일 기간
                    </label>
                    <JmDateRangePicker
                      size="sm"
                      value={historyDateRange}
                      onChange={setHistoryDateRange}
                      placeholder="기간 선택"
                    />
                  </div>
                  <div className="flex items-center gap-3 ml-auto">
                    <span className="text-jm-xs text-[var(--jm-text-muted)] tabular-nums">
                      {filteredHistoryItems.length}건
                    </span>
                    {(historyDateRange?.from ||
                      historySupplierId ||
                      historySearch) && (
                      <JmIconButton
                        aria-label="필터 초기화"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setHistorySearch("");
                          setHistorySupplierId("");
                          setHistoryDateRange(undefined);
                        }}
                      >
                        <X />
                      </JmIconButton>
                    )}
                  </div>
                </div>
              </div>
              <HistoryTable
                items={filteredHistoryItems}
                loading={historyQuery.isPending}
              />
            </JmScrollArea>
          </JmTabsPanel>
        </JmTabs>

        {/* 일괄 등록 confirm */}
        <JmDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <JmDialogContent>
            <JmDialogHeader>
              <JmDialogTitle>초기 등록 확인</JmDialogTitle>
            </JmDialogHeader>
            <JmDialogBody className="space-y-3 text-jm-sm text-[var(--jm-text)]">
              <p>
                거래처 <strong>{selectedSupplierName}</strong>의{" "}
                <strong>{totals.validCount}건</strong> 공급상품/재고를 초기등록합니다.
              </p>
              <p className="text-[var(--jm-text-muted)]">
                총 공급가액: <strong>₩{formatPrice(totals.totalSupply)}</strong>
              </p>
              <div className="rounded-lg bg-[var(--jm-surface-muted)] border border-[var(--jm-border)] p-3 text-jm-xs text-[var(--jm-text-muted)] space-y-1">
                <p>· 신규 품목은 거래처 공급상품 + 자동매핑 판매상품으로 등록됩니다</p>
                <p>· 공급상품마다 기초재고 로트(source: INITIAL)가 1건씩 생성됩니다</p>
                <p>· 매핑된 항목은 즉시 가용 재고에 반영, 매핑 없으면 오르판 로트로 보관 → 매핑 시 자동 흡수</p>
                <p>· 1회성 작업입니다. 같은 공급상품에 이미 초기등록이 있으면 거부됩니다</p>
                <p>· 거래처 원장(미지급금)에는 영향 없습니다</p>
              </div>
            </JmDialogBody>
            <JmDialogFooter>
              <JmButton variant="ghost" onClick={() => setConfirmOpen(false)}>
                취소
              </JmButton>
              <JmButton
                variant="cta"
                onClick={() => registerMutation.mutate()}
                disabled={registerMutation.isPending}
              >
                {registerMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                등록
              </JmButton>
            </JmDialogFooter>
          </JmDialogContent>
        </JmDialog>

        {/* 거래처 변경 시 미저장 데이터 confirm */}
        <JmDialog
          open={!!supplierChangeConfirm}
          onOpenChange={(o) => !o && setSupplierChangeConfirm(null)}
        >
          <JmDialogContent>
            <JmDialogHeader>
              <JmDialogTitle>거래처 변경 — 입력 중인 데이터 삭제</JmDialogTitle>
            </JmDialogHeader>
            <JmDialogBody className="space-y-2 text-jm-sm text-[var(--jm-text)]">
              <p>
                현재 입력 중인 <strong>{totals.validCount}건</strong>의 데이터가 모두 사라집니다. 진행할까요?
              </p>
              <p className="text-[var(--jm-text-muted)] text-jm-xs">
                다음 거래처: <strong>{supplierChangeConfirm?.nextName}</strong>
              </p>
            </JmDialogBody>
            <JmDialogFooter>
              <JmButton variant="ghost" onClick={() => setSupplierChangeConfirm(null)}>
                취소
              </JmButton>
              <JmButton
                variant="danger"
                onClick={() => {
                  if (supplierChangeConfirm) {
                    applySupplierChange(
                      supplierChangeConfirm.nextId,
                      supplierChangeConfirm.nextName,
                    );
                  }
                  setSupplierChangeConfirm(null);
                }}
              >
                삭제하고 변경
              </JmButton>
            </JmDialogFooter>
          </JmDialogContent>
        </JmDialog>

        {/* 거래처 빠른 등록 */}
        <QuickSupplierSheet
          open={quickSupplierOpen}
          onOpenChange={setQuickSupplierOpen}
          defaultName={quickSupplierName}
          onCreated={handleQuickSupplierCreated}
        />
      </JmTooltipProvider>
    </JmScope>
  );
}
