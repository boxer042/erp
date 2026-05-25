"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  jmToast as toast,
  JmButton,
  JmCombobox,
  type JmComboboxItem,
  JmDrawer,
  JmDrawerBody,
  JmDrawerContent,
  JmDrawerFooter,
  JmDrawerHeader,
  JmDrawerTitle,
  JmFormField,
  JmIconButton,
  JmInput,
  JmNumberInput,
  JmSelect,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
} from "@/jm";

import { QuickSupplierSheet, QuickSupplierProductSheet } from "@/components/quick-register-sheets";

import {
  emptyItem,
  SHIPPING_METHOD_LABELS,
  type PurchaseOrderFormState,
  type PurchaseOrderItemForm,
  type ShippingMethodOption,
} from "./_types";

interface SupplierLite { id: string; name: string; businessNumber: string | null }
interface SupplierProductLite {
  id: string;
  name: string;
  spec: string | null;
  supplierCode: string | null;
  unitPrice: string;
  unitOfMeasure: string;
  supplierId: string;
}

/**
 * 발주 등록·수정 Drawer.
 * - editingId 가 있으면 수정 모드 (PUT), 없으면 등록 (POST)
 * - 거래처 선택 후 그 거래처의 공급상품만 로드
 * - QuickSupplier* 빠른 등록 Sheet 는 shadcn 기반(외부) — JM 영역 안에 띄울 때 시각 차이가 있을 수 있음
 */
export function PurchaseOrderCreateSheet({
  open,
  onOpenChange,
  form,
  setForm,
  editingId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: PurchaseOrderFormState;
  setForm: React.Dispatch<React.SetStateAction<PurchaseOrderFormState>>;
  editingId: string | null;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();

  const [quickSupplierOpen, setQuickSupplierOpen] = useState(false);
  const [quickSupplierName, setQuickSupplierName] = useState("");
  const [quickSpOpen, setQuickSpOpen] = useState(false);
  const [quickSpName, setQuickSpName] = useState("");
  const [quickSpRowIndex, setQuickSpRowIndex] = useState<number | null>(null);

  const suppliersQuery = useQuery<SupplierLite[]>({
    queryKey: queryKeys.suppliers.list(),
    queryFn: () => apiGet<SupplierLite[]>("/api/suppliers"),
    staleTime: 1000 * 60,
    enabled: open,
  });

  const supplierProductsQuery = useQuery<SupplierProductLite[]>({
    queryKey: queryKeys.supplierProducts.list({ supplierId: form.supplierId }),
    queryFn: () =>
      apiGet<SupplierProductLite[]>(
        `/api/supplier-products?supplierId=${encodeURIComponent(form.supplierId)}`,
      ),
    enabled: open && !!form.supplierId,
    staleTime: 1000 * 60,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: {
      supplierId: string;
      orderDate: string;
      expectedDate?: string;
      memo?: string;
      shippingMethod?: ShippingMethodOption | null;
      requirePriceReview?: boolean;
      items: Array<{
        supplierProductId?: string | null;
        name?: string | null;
        priceUndetermined?: boolean;
        quantity: string;
        unitPrice: string;
        totalPrice: string;
        memo?: string;
      }>;
    }) =>
      editingId
        ? apiMutate(`/api/purchase-orders/${editingId}`, "PUT", payload)
        : apiMutate("/api/purchase-orders", "POST", payload),
    onSuccess: () => {
      toast.success(editingId ? "발주가 수정되었습니다" : "발주가 등록되었습니다");
      onSaved();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : editingId ? "수정에 실패했습니다" : "등록에 실패했습니다");
    },
  });

  const updateItem = (idx: number, patch: Partial<PurchaseOrderItemForm>) => {
    setForm((prev) => {
      const items = prev.items.slice();
      items[idx] = { ...items[idx], ...patch };
      // 가격 미정 토글이 켜지면 단가·소계 0 으로 강제, 끄면 그대로 유지
      if (patch.priceUndetermined === true) {
        items[idx].unitPrice = "0";
        items[idx].totalPrice = "0";
      } else {
        const qty = parseFloat(items[idx].quantity || "0");
        const price = parseFloat(items[idx].unitPrice || "0");
        items[idx].totalPrice = qty > 0 && price >= 0 ? String(Math.round(qty * price)) : "";
      }
      return { ...prev, items };
    });
  };

  const addRow = (rowType: "product" | "free" = "product") =>
    setForm((prev) => ({ ...prev, items: [...prev.items, emptyItem(rowType)] }));
  const removeRow = (idx: number) =>
    setForm((prev) =>
      prev.items.length === 1
        ? { ...prev, items: [emptyItem()] }
        : { ...prev, items: prev.items.filter((_, i) => i !== idx) }
    );

  const totalAmount = useMemo(
    () => form.items.reduce((s, it) => s + (parseFloat(it.totalPrice || "0") || 0), 0),
    [form.items]
  );

  const handleSubmit = () => {
    if (!form.supplierId) {
      toast.error("거래처를 선택해주세요");
      return;
    }
    // 라인 유효성 — product 는 supplierProductId 필수, free 는 name 필수. 가격 미정 토글이면 단가 검사 skip.
    const validItems = form.items.filter((it) => {
      if (!it.quantity) return false;
      if (!it.priceUndetermined && it.unitPrice === "") return false;
      if (it.rowType === "free") return it.name.trim().length > 0;
      return Boolean(it.supplierProductId);
    });
    if (validItems.length === 0) {
      toast.error("발주 항목을 1개 이상 추가해주세요 (수량·단가 필수, 가격 미정 토글 가능)");
      return;
    }
    saveMutation.mutate({
      supplierId: form.supplierId,
      orderDate: form.orderDate,
      expectedDate: form.expectedDate || undefined,
      memo: form.memo || undefined,
      shippingMethod: form.shippingMethod || null,
      requirePriceReview: form.requirePriceReview,
      items: validItems.map((it) => ({
        supplierProductId: it.rowType === "free" ? null : it.supplierProductId,
        name: it.rowType === "free" ? it.name.trim() : null,
        priceUndetermined: it.priceUndetermined,
        quantity: it.quantity,
        unitPrice: it.priceUndetermined ? "0" : it.unitPrice,
        totalPrice: it.priceUndetermined ? "0" : it.totalPrice,
        memo: it.memo || undefined,
      })),
    });
  };

  return (
    <>
      <JmDrawer open={open} onOpenChange={onOpenChange}>
        <JmDrawerContent side="bottom" size="xl">
          <JmDrawerHeader>
            <JmDrawerTitle>{editingId ? "발주 수정" : "발주 등록"}</JmDrawerTitle>
          </JmDrawerHeader>

          <JmDrawerBody>
            <div className="space-y-5">
              {/* 헤더 정보 */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <JmFormField label="거래처" required>
                  <JmCombobox<JmComboboxItem>
                    items={(suppliersQuery.data ?? []).map((s) => ({
                      id: s.id,
                      label: s.name,
                      description: s.businessNumber ?? undefined,
                    }))}
                    value={form.supplierId}
                    onChange={(item) => {
                      const sup = suppliersQuery.data?.find((s) => s.id === item.id);
                      setForm((prev) => ({
                        ...prev,
                        supplierId: item.id,
                        supplierName: sup?.name ?? item.label,
                        items: item.id !== prev.supplierId ? [emptyItem()] : prev.items,
                      }));
                    }}
                    clearable
                    onClear={() =>
                      setForm((prev) => ({ ...prev, supplierId: "", supplierName: "", items: [emptyItem()] }))
                    }
                    placeholder="거래처 선택..."
                    searchPlaceholder="이름·사업자번호 검색"
                    onCreateNew={(name) => {
                      setQuickSupplierName(name);
                      setQuickSupplierOpen(true);
                    }}
                  />
                </JmFormField>
                <JmFormField label="발주일" required>
                  <JmInput
                    type="date"
                    value={form.orderDate}
                    onChange={(e) => setForm((p) => ({ ...p, orderDate: e.target.value }))}
                  />
                </JmFormField>
                <JmFormField label="예상 입고일">
                  <JmInput
                    type="date"
                    value={form.expectedDate}
                    onChange={(e) => setForm((p) => ({ ...p, expectedDate: e.target.value }))}
                  />
                </JmFormField>
                <JmFormField
                  label="출고 방법 (사전 선택)"
                  hint="비워두면 거래처가 [수락] 시 선택. PICKUP 선택 시 거래처는 출고 가능일만 입력."
                >
                  <JmSelect
                    value={form.shippingMethod}
                    onChange={(v) =>
                      setForm((p) => ({ ...p, shippingMethod: v as PurchaseOrderFormState["shippingMethod"] }))
                    }
                    options={[
                      { value: "", label: "거래처가 선택" },
                      ...Object.entries(SHIPPING_METHOD_LABELS).map(([value, label]) => ({
                        value,
                        label,
                      })),
                    ]}
                  />
                </JmFormField>
              </div>

              {/* 가격 미정 라인 처리 정책 — 라인 존재 여부와 무관하게 항상 노출 */}
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] p-3 text-jm-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4"
                  checked={form.requirePriceReview}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, requirePriceReview: e.target.checked }))
                  }
                />
                <span>
                  <span className="font-medium text-[var(--jm-text)]">
                    가격 미정 라인의 단가는 거래처 제안 후 우리쪽 확인 필요
                  </span>
                  <span className="ml-1 text-jm-xs text-[var(--jm-text-muted)]">
                    (OFF: 거래처 입력 즉시 수락 · ON: 거래처 입력 → 매장에서 검토 후 수락)
                  </span>
                </span>
              </label>

              {/* 항목 */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-jm-xs font-medium text-[var(--jm-text-muted)]">
                    발주 항목 *{" "}
                    <span className="text-[var(--jm-text-subtle)]">— 자유 품명 라인은 입고 시 공급상품 매핑</span>
                  </span>
                  <div className="flex gap-1.5">
                    <JmButton
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => addRow("product")}
                      disabled={!form.supplierId}
                    >
                      <Plus />
                      상품 추가
                    </JmButton>
                    <JmButton
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => addRow("free")}
                      disabled={!form.supplierId}
                    >
                      <Plus />
                      자유 품명 추가
                    </JmButton>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-[var(--jm-border)]">
                  <JmTable>
                    <JmTableHeader>
                      <JmTableRow>
                        <JmTableHead>공급상품</JmTableHead>
                        <JmTableHead className="w-[110px] text-right">수량</JmTableHead>
                        <JmTableHead className="w-[140px] text-right">단가</JmTableHead>
                        <JmTableHead className="w-[140px] text-right">소계</JmTableHead>
                        <JmTableHead className="w-[200px]">메모</JmTableHead>
                        <JmTableHead className="w-[40px]"></JmTableHead>
                      </JmTableRow>
                    </JmTableHeader>
                    <JmTableBody>
                      {form.items.map((it, idx) => (
                        <JmTableRow key={idx} className="hover:bg-transparent">
                          <JmTableCell className="align-top">
                            {!form.supplierId ? (
                              <span className="text-jm-xs text-[var(--jm-text-muted)]">먼저 거래처를 선택하세요</span>
                            ) : it.rowType === "free" ? (
                              <JmInput
                                size="sm"
                                value={it.name}
                                onChange={(e) => updateItem(idx, { name: e.target.value })}
                                placeholder="자유 품명 (입고 시 공급상품 매핑)"
                              />
                            ) : (
                              <JmCombobox<JmComboboxItem>
                                items={(supplierProductsQuery.data ?? []).map((sp) => ({
                                  id: sp.id,
                                  label: sp.name + (sp.spec ? ` (${sp.spec})` : ""),
                                  description: [
                                    sp.supplierCode,
                                    sp.unitPrice ? `₩${parseFloat(sp.unitPrice).toLocaleString("ko-KR")}` : null,
                                  ].filter(Boolean).join(" · ") || undefined,
                                }))}
                                value={it.supplierProductId}
                                size="sm"
                                placeholder="공급상품 선택..."
                                searchPlaceholder="품명·품번 검색"
                                onChange={(item) => {
                                  const sp = supplierProductsQuery.data?.find((s) => s.id === item.id);
                                  if (!sp) return;
                                  updateItem(idx, {
                                    supplierProductId: sp.id,
                                    supplierProductName: sp.name,
                                    supplierCode: sp.supplierCode ?? null,
                                    unitOfMeasure: sp.unitOfMeasure,
                                    unitPrice: sp.unitPrice ? String(Math.round(parseFloat(sp.unitPrice))) : it.unitPrice,
                                  });
                                }}
                                onCreateNew={(name) => {
                                  setQuickSpName(name);
                                  setQuickSpRowIndex(idx);
                                  setQuickSpOpen(true);
                                }}
                              />
                            )}
                          </JmTableCell>
                          <JmTableCell className="align-top">
                            <JmNumberInput
                              size="sm"
                              clearable={false}
                              value={it.quantity}
                              onValueChange={(v) => updateItem(idx, { quantity: v })}
                            />
                          </JmTableCell>
                          <JmTableCell className="align-top">
                            {it.priceUndetermined ? (
                              <button
                                type="button"
                                onClick={() => updateItem(idx, { priceUndetermined: false })}
                                title="클릭하여 단가 입력"
                                className="flex h-9 w-full items-center justify-center rounded-md border border-[var(--jm-warning-fg)] bg-[var(--jm-warning-bg)] text-jm-xs font-medium text-[var(--jm-warning-fg)] transition-opacity hover:opacity-80"
                              >
                                가격 미정
                              </button>
                            ) : (
                              <div className="flex items-center gap-1">
                                <div className="min-w-0 flex-1">
                                  <JmNumberInput
                                    size="sm"
                                    prefix="₩"
                                    clearable={false}
                                    value={it.unitPrice}
                                    onValueChange={(v) => updateItem(idx, { unitPrice: v })}
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => updateItem(idx, { priceUndetermined: true })}
                                  title="가격 미정으로 표시"
                                  className="shrink-0 rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface)] px-1.5 py-1 text-jm-2xs text-[var(--jm-text-muted)] transition-colors hover:border-[var(--jm-warning-fg)] hover:bg-[var(--jm-warning-bg)] hover:text-[var(--jm-warning-fg)]"
                                >
                                  미정
                                </button>
                              </div>
                            )}
                          </JmTableCell>
                          <JmTableCell className="text-right tabular-nums align-middle">
                            {it.priceUndetermined ? (
                              <span className="text-[var(--jm-warning-fg)]">미정</span>
                            ) : it.totalPrice ? (
                              `₩${parseFloat(it.totalPrice).toLocaleString("ko-KR")}`
                            ) : (
                              "-"
                            )}
                          </JmTableCell>
                          <JmTableCell className="align-top">
                            <JmInput
                              size="sm"
                              value={it.memo}
                              onChange={(e) => updateItem(idx, { memo: e.target.value })}
                              placeholder="(선택)"
                            />
                          </JmTableCell>
                          <JmTableCell className="text-center align-middle">
                            <JmIconButton
                              size="sm"
                              aria-label="행 삭제"
                              onClick={() => removeRow(idx)}
                            >
                              <Trash2 />
                            </JmIconButton>
                          </JmTableCell>
                        </JmTableRow>
                      ))}
                    </JmTableBody>
                  </JmTable>
                  <div className="flex items-center justify-between border-t border-[var(--jm-border)] bg-[var(--jm-surface-muted)] px-4 py-2.5 text-jm-sm">
                    <span className="text-jm-xs text-[var(--jm-text-muted)]">총 발주금액</span>
                    <span className="font-bold tabular-nums">₩{totalAmount.toLocaleString("ko-KR")}</span>
                  </div>
                </div>
              </div>

              {/* 메모 */}
              <JmFormField label="발주 메모">
                <JmInput
                  value={form.memo}
                  onChange={(e) => setForm((p) => ({ ...p, memo: e.target.value }))}
                  placeholder="(선택) 발주 시 거래처에 전달할 메모 등"
                />
              </JmFormField>
            </div>
          </JmDrawerBody>

          <JmDrawerFooter>
            <JmButton variant="ghost" onClick={() => onOpenChange(false)}>
              취소
            </JmButton>
            <JmButton onClick={handleSubmit} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="animate-spin" />}
              {saveMutation.isPending ? (editingId ? "수정 중..." : "등록 중...") : (editingId ? "수정" : "등록")}
            </JmButton>
          </JmDrawerFooter>
        </JmDrawerContent>
      </JmDrawer>

      <QuickSupplierSheet
        open={quickSupplierOpen}
        onOpenChange={setQuickSupplierOpen}
        defaultName={quickSupplierName}
        onCreated={(s) => {
          queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });
          setForm((prev) => ({ ...prev, supplierId: s.id, supplierName: s.name, items: [emptyItem()] }));
          setQuickSupplierOpen(false);
        }}
      />
      <QuickSupplierProductSheet
        open={quickSpOpen}
        onOpenChange={setQuickSpOpen}
        supplierId={form.supplierId}
        supplierName={form.supplierName}
        defaultName={quickSpName}
        onCreated={(sp) => {
          queryClient.invalidateQueries({ queryKey: queryKeys.supplierProducts.all });
          if (quickSpRowIndex !== null) {
            updateItem(quickSpRowIndex, {
              supplierProductId: sp.id,
              supplierProductName: sp.name,
              unitPrice: sp.unitPrice ? String(Math.round(parseFloat(sp.unitPrice))) : "",
            });
          }
          setQuickSpOpen(false);
        }}
      />
    </>
  );
}
