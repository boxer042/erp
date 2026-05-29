"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { apiGet } from "@/lib/api-client";
import { focusCaretEnd } from "@/jm/lib/focus";
import {
  calcDiscountPerUnit,
  formatComma,
  formatDiscountDisplay,
  normalizeDiscountInput,
  parseComma,
} from "@/lib/utils";
import { CustomerCombobox } from "@/components/customer-combobox";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";
import { QuickCustomerSheet } from "@/components/quick-register-sheets";
import {
  JmButton,
  JmCheckbox,
  JmDrawer,
  JmDrawerContent,
  JmDrawerDescription,
  JmDrawerHeader,
  JmDrawerTitle,
  JmIconButton,
  JmInput,
  JmSelect,
  JmTextarea,
} from "@/jm";

type StatementStatus = "DRAFT" | "ISSUED" | "CANCELLED";

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "초안" },
  { value: "ISSUED", label: "발행" },
  { value: "CANCELLED", label: "취소" },
];

interface ItemForm {
  rowType: "product" | "free";
  productId: string | null;
  /** 중고 단품 선택 시 콤보박스 표시값 — UI 전용. 저장 시 productId=null 자유 입력 라인으로 처리. */
  usedItemId?: string | null;
  name: string;
  spec: string;
  unitOfMeasure: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  isTaxable: boolean;
  isZeroRateEligible: boolean;
  memo: string;
}

const emptyProductItem = (): ItemForm => ({
  rowType: "product",
  productId: null,
  usedItemId: null,
  name: "",
  spec: "",
  unitOfMeasure: "EA",
  quantity: "1",
  unitPrice: "0",
  discount: "",
  isTaxable: true,
  isZeroRateEligible: false,
  memo: "",
});

const emptyFreeItem = (): ItemForm => ({
  rowType: "free",
  productId: null,
  usedItemId: null,
  name: "",
  spec: "",
  unitOfMeasure: "EA",
  quantity: "1",
  unitPrice: "0",
  discount: "",
  isTaxable: true,
  isZeroRateEligible: false,
  memo: "",
});

export interface StatementFormData {
  id?: string;
  status: StatementStatus;
  issueDate: string;
  customerId: string;
  customerNameSnapshot: string;
  customerPhoneSnapshot: string;
  customerAddressSnapshot: string;
  customerBusinessNumberSnapshot: string;
  orderId: string;
  quotationId: string;
  memo: string;
  items: ItemForm[];
}

const emptyForm = (): StatementFormData => ({
  status: "ISSUED",
  issueDate: new Date().toISOString().slice(0, 10),
  customerId: "",
  customerNameSnapshot: "",
  customerPhoneSnapshot: "",
  customerAddressSnapshot: "",
  customerBusinessNumberSnapshot: "",
  orderId: "",
  quotationId: "",
  memo: "",
  items: [emptyProductItem()],
});

interface CustomerOption {
  id: string;
  name: string;
  phone?: string | null;
  businessNumber?: string | null;
  address?: string | null;
}

interface StatementSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editData?: StatementFormData | null;
  onSaved: (id: string, statementNo?: string) => void;
}

export function StatementSheet({
  open,
  onOpenChange,
  editData,
  onSaved,
}: StatementSheetProps) {
  const isEdit = !!editData?.id;
  const [form, setForm] = useState<StatementFormData>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [quickCustomerName, setQuickCustomerName] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(editData ? editData : emptyForm());
    (async () => {
      const [c, p, usedItems] = await Promise.all([
        apiGet<CustomerOption[]>("/api/customers"),
        apiGet<ProductOption[]>("/api/products"),
        // 중고 단품 (IN_STOCK) — 명세표에 통합 노출. 판매되면 status≠IN_STOCK 라 자동 숨김.
        apiGet<
          Array<{ id: string; internalCode: string; displayName: string; unitOfMeasure?: string }>
        >("/api/used-items?status=IN_STOCK&limit=500").catch(() => []),
      ]);
      setCustomers(c);
      const usedAsProducts: ProductOption[] = usedItems.map((u) => ({
        id: u.id,
        name: `${u.displayName} (중고)`,
        sku: u.internalCode,
        sellingPrice: "0",
        unitCost: null,
        unitOfMeasure: u.unitOfMeasure ?? "EA",
        isSet: false,
        usedItemId: u.id,
      }));
      setProducts([...p, ...usedAsProducts]);
    })();
  }, [open, editData]);

  const updateItem = (idx: number, patch: Partial<ItemForm>) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));
  };

  const addProductRow = () =>
    setForm((prev) => ({ ...prev, items: [...prev.items, emptyProductItem()] }));
  const addFreeRow = () =>
    setForm((prev) => ({ ...prev, items: [...prev.items, emptyFreeItem()] }));
  const removeItem = (idx: number) =>
    setForm((prev) => ({
      ...prev,
      items: prev.items.length > 1 ? prev.items.filter((_, i) => i !== idx) : prev.items,
    }));

  const totalDiscount = form.items.reduce((acc, it) => {
    const q = parseFloat(it.quantity || "0");
    const p = parseFloat(it.unitPrice || "0");
    return acc + calcDiscountPerUnit(p, it.discount) * q;
  }, 0);
  const subtotal = form.items.reduce((acc, it) => {
    const q = parseFloat(it.quantity || "0");
    const p = parseFloat(it.unitPrice || "0");
    const actual = p - calcDiscountPerUnit(p, it.discount);
    return acc + q * actual;
  }, 0);
  const tax = form.items.reduce((acc, it) => {
    if (!it.isTaxable) return acc;
    const q = parseFloat(it.quantity || "0");
    const p = parseFloat(it.unitPrice || "0");
    const actual = p - calcDiscountPerUnit(p, it.discount);
    return acc + q * actual * 0.1;
  }, 0);
  const total = subtotal + tax;

  const handleSubmit = async () => {
    const validItems = form.items.filter((it) => it.name.trim());
    if (validItems.length === 0) return toast.error("품목을 하나 이상 추가해주세요");
    if (!form.customerId && !form.customerNameSnapshot.trim()) {
      return toast.error("고객을 선택하거나 고객명을 입력해주세요");
    }

    setSubmitting(true);
    try {
      const url = isEdit ? `/api/statements/${editData!.id}` : "/api/statements";
      const method = isEdit ? "PUT" : "POST";
      const body = {
        status: form.status,
        issueDate: form.issueDate,
        customerId: form.customerId || undefined,
        customerNameSnapshot: form.customerNameSnapshot || undefined,
        customerPhoneSnapshot: form.customerPhoneSnapshot || undefined,
        customerAddressSnapshot: form.customerAddressSnapshot || undefined,
        customerBusinessNumberSnapshot: form.customerBusinessNumberSnapshot || undefined,
        orderId: form.orderId || undefined,
        quotationId: form.quotationId || undefined,
        memo: form.memo || undefined,
        items: validItems.map((it, idx) => {
          const p = parseFloat(it.unitPrice || "0");
          const discPerUnit = calcDiscountPerUnit(p, it.discount);
          const actual = p - discPerUnit;
          return {
            productId: it.productId,
            name: it.name,
            spec: it.spec || undefined,
            unitOfMeasure: it.unitOfMeasure,
            quantity: it.quantity || "0",
            listPrice: String(p),
            discountAmount: String(discPerUnit),
            unitPrice: String(actual),
            isTaxable: it.isTaxable,
            sortOrder: idx,
            memo: it.memo || undefined,
          };
        }),
      };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(
          typeof err?.error === "string" ? err.error : isEdit ? "수정 실패" : "등록 실패",
        );
        return;
      }
      const saved = await res.json().catch(() => null);
      const savedId = isEdit ? editData!.id! : saved?.id;
      const savedNo: string | undefined = saved?.statementNo;
      toast.success(isEdit ? "거래명세표가 수정되었습니다" : "거래명세표가 등록되었습니다");
      onOpenChange(false);
      onSaved(savedId, savedNo);
    } catch {
      toast.error("오류가 발생했습니다");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <JmDrawer open={open} onOpenChange={onOpenChange}>
        <JmDrawerContent
          side="bottom"
          size="xl"
          className="flex flex-col p-0"
          dragHandle={false}
        >
          <JmDrawerHeader className="border-b border-[var(--jm-border)] px-5 py-4 flex-shrink-0">
            <JmDrawerTitle>
              {isEdit ? "거래명세표 수정" : "거래명세표 등록"}
            </JmDrawerTitle>
            <JmDrawerDescription className="sr-only">거래명세표 폼</JmDrawerDescription>
          </JmDrawerHeader>

          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <FieldRow label="고객">
                    <CustomerCombobox
                      customers={customers}
                      value={form.customerId}
                      onChange={(id, c) =>
                        setForm((p) => ({
                          ...p,
                          customerId: id,
                          customerNameSnapshot: c.name,
                          customerPhoneSnapshot: c.phone || "",
                          customerAddressSnapshot:
                            (c as { address?: string | null }).address || "",
                          customerBusinessNumberSnapshot: c.businessNumber || "",
                        }))
                      }
                      onCreateNew={(name) => {
                        setQuickCustomerName(name);
                        setQuickCustomerOpen(true);
                      }}
                    />
                  </FieldRow>
                  <FieldRow label="고객명(표시)">
                    <JmInput
                      size="sm"
                      value={form.customerNameSnapshot}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, customerNameSnapshot: e.target.value }))
                      }
                      onFocus={focusCaretEnd}
                      placeholder="미등록 고객이면 직접 입력"
                    />
                  </FieldRow>
                  <FieldRow label="연락처(표시)">
                    <JmInput
                      size="sm"
                      value={form.customerPhoneSnapshot}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, customerPhoneSnapshot: e.target.value }))
                      }
                      onFocus={focusCaretEnd}
                    />
                  </FieldRow>
                </div>

                <div className="space-y-3">
                  <FieldRow label="발행일자" required>
                    <JmInput
                      size="sm"
                      type="date"
                      value={form.issueDate}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, issueDate: e.target.value }))
                      }
                    />
                  </FieldRow>
                  <FieldRow label="상태">
                    <JmSelect
                      size="sm"
                      options={STATUS_OPTIONS}
                      value={form.status}
                      onChange={(v) =>
                        setForm((p) => ({ ...p, status: v as StatementStatus }))
                      }
                    />
                  </FieldRow>
                  <FieldRow label="주소(표시)">
                    <JmInput
                      size="sm"
                      value={form.customerAddressSnapshot}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          customerAddressSnapshot: e.target.value,
                        }))
                      }
                      onFocus={focusCaretEnd}
                    />
                  </FieldRow>
                </div>
              </div>

              <div className="-mx-5 border-y border-[var(--jm-border)]">
                <table className="w-full text-jm-sm">
                  <thead className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)]">
                    <tr>
                      <th className="px-3 py-2 text-center font-normal w-[36px]">#</th>
                      <th
                        className="px-3 py-2 text-left font-normal"
                        style={{ width: "20%" }}
                      >
                        품명
                        <span className="text-[var(--jm-danger-fg)] ml-0.5">*</span>
                      </th>
                      <th
                        className="px-3 py-2 text-left font-normal"
                        style={{ width: "12%" }}
                      >
                        규격
                      </th>
                      <th className="px-3 py-2 text-center font-normal w-[56px]">단위</th>
                      <th className="px-3 py-2 text-right font-normal w-[80px]">수량</th>
                      <th className="px-3 py-2 text-right font-normal w-[110px]">단가</th>
                      <th className="px-3 py-2 text-right font-normal w-[90px]">할인</th>
                      <th className="px-3 py-2 text-right font-normal w-[110px]">실제단가</th>
                      <th className="px-3 py-2 text-right font-normal w-[120px]">공급가액</th>
                      <th className="px-3 py-2 text-right font-normal w-[100px]">세액</th>
                      <th className="px-3 py-2 text-center font-normal w-[60px]">영세율</th>
                      <th className="px-3 py-2 w-[40px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.map((it, idx) => {
                      const q = parseFloat(it.quantity || "0");
                      const p = parseFloat(it.unitPrice || "0");
                      const discPerUnit = calcDiscountPerUnit(p, it.discount);
                      const actualPrice = p - discPerUnit;
                      const lineSupply = q * actualPrice;
                      const lineTax = it.isTaxable ? Math.round(lineSupply * 0.1) : 0;
                      return (
                        <tr key={idx} className="border-t border-[var(--jm-border)]">
                          <td className="px-3 py-1.5 text-center text-[var(--jm-text-muted)]">
                            {idx + 1}
                          </td>
                          <td className="px-3 py-1.5">
                            {it.rowType === "product" ? (
                              <ProductCombobox
                                products={products}
                                value={it.usedItemId || it.productId || ""}
                                onChange={(pr) =>
                                  pr.usedItemId
                                    ? updateItem(idx, {
                                        // 중고 단품 — productId null 유지 (FK 안전), 이름만 채움. 단가는 직접 입력.
                                        productId: null,
                                        usedItemId: pr.usedItemId,
                                        name: pr.name,
                                        unitOfMeasure: pr.unitOfMeasure,
                                        unitPrice: "0",
                                        isTaxable: true,
                                        isZeroRateEligible: false,
                                      })
                                    : updateItem(idx, {
                                        productId: pr.id,
                                        usedItemId: null,
                                        name: pr.name,
                                        unitOfMeasure: pr.unitOfMeasure,
                                        unitPrice: pr.sellingPrice,
                                        isTaxable: pr.taxType !== "TAX_FREE",
                                        isZeroRateEligible: pr.zeroRateEligible ?? false,
                                      })
                                }
                                placeholder="상품 선택..."
                              />
                            ) : (
                              <JmInput
                                size="sm"
                                value={it.name}
                                onChange={(e) =>
                                  updateItem(idx, { name: e.target.value })
                                }
                                onFocus={focusCaretEnd}
                                placeholder="품명 직접 입력"
                              />
                            )}
                          </td>
                          <td className="px-3 py-1.5">
                            <JmInput
                              size="sm"
                              value={it.spec}
                              onChange={(e) => updateItem(idx, { spec: e.target.value })}
                              onFocus={focusCaretEnd}
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <JmInput
                              size="sm"
                              value={it.unitOfMeasure}
                              onChange={(e) =>
                                updateItem(idx, { unitOfMeasure: e.target.value })
                              }
                              onFocus={focusCaretEnd}
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <JmInput
                              size="sm"
                              className="text-right"
                              inputMode="decimal"
                              value={it.quantity}
                              onChange={(e) =>
                                updateItem(idx, { quantity: e.target.value })
                              }
                              onFocus={focusCaretEnd}
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <JmInput
                              size="sm"
                              className="text-right"
                              inputMode="numeric"
                              value={formatComma(it.unitPrice)}
                              onChange={(e) =>
                                updateItem(idx, { unitPrice: parseComma(e.target.value) })
                              }
                              onFocus={focusCaretEnd}
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <JmInput
                              size="sm"
                              className={`text-right ${
                                discPerUnit > 0 ? "text-[var(--jm-danger-fg)]" : ""
                              }`}
                              inputMode={
                                it.discount.trim().endsWith("%") ? "decimal" : "numeric"
                              }
                              value={formatDiscountDisplay(it.discount)}
                              onChange={(e) =>
                                updateItem(idx, {
                                  discount: normalizeDiscountInput(e.target.value),
                                })
                              }
                              onFocus={focusCaretEnd}
                              disabled={p === 0}
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-[var(--jm-text)]">
                            {actualPrice > 0 ? formatComma(String(Math.round(actualPrice))) : ""}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-[var(--jm-text)]">
                            {lineSupply > 0
                              ? `₩${Math.round(lineSupply).toLocaleString("ko-KR")}`
                              : ""}
                          </td>
                          <td className="px-3 py-1.5 text-right text-[var(--jm-text-muted)] tabular-nums">
                            {lineTax > 0 ? `₩${lineTax.toLocaleString("ko-KR")}` : ""}
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="flex justify-center">
                              {it.isZeroRateEligible || it.rowType === "free" ? (
                                <JmCheckbox
                                  checked={!it.isTaxable}
                                  onCheckedChange={(v) =>
                                    updateItem(idx, { isTaxable: !v })
                                  }
                                />
                              ) : !it.isTaxable ? (
                                <span className="text-jm-xs text-[var(--jm-text-muted)]">
                                  면세
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            <JmIconButton
                              aria-label="행 삭제"
                              size="sm"
                              variant="ghost"
                              onClick={() => removeItem(idx)}
                            >
                              <Trash2 />
                            </JmIconButton>
                          </td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td colSpan={12} className="px-3 py-2">
                        <div className="flex gap-2">
                          <JmButton
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={addProductRow}
                          >
                            <Plus />
                            <span>상품 추가</span>
                          </JmButton>
                          <JmButton
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={addFreeRow}
                          >
                            <Plus />
                            <span>자유 품명 추가</span>
                          </JmButton>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* 합계 — 거래명세표 하단 */}
                <div className="border-t border-[var(--jm-border)] bg-[var(--jm-surface-muted)]">
                  <div className="grid grid-cols-5 text-jm-sm">
                    <div className="border-r border-[var(--jm-border)] px-3 py-2.5 flex items-center justify-between">
                      <span className="text-jm-xs text-[var(--jm-text-muted)]">품목수</span>
                      <span className="text-[var(--jm-text)]">
                        {form.items.filter((it) => it.name.trim()).length}건
                      </span>
                    </div>
                    <div className="border-r border-[var(--jm-border)] px-3 py-2.5 flex items-center justify-between">
                      <span className="text-jm-xs text-[var(--jm-text-muted)]">공급가액</span>
                      <span className="tabular-nums text-[var(--jm-text)]">
                        ₩{Math.round(subtotal).toLocaleString("ko-KR")}
                      </span>
                    </div>
                    <div className="border-r border-[var(--jm-border)] px-3 py-2.5 flex items-center justify-between">
                      <span className="text-jm-xs text-[var(--jm-text-muted)]">세액</span>
                      <span className="tabular-nums text-[var(--jm-text)]">
                        {tax > 0 ? `₩${Math.round(tax).toLocaleString("ko-KR")}` : ""}
                      </span>
                    </div>
                    <div className="border-r border-[var(--jm-border)] px-3 py-2.5 flex items-center justify-between">
                      <span className="text-jm-xs text-[var(--jm-text-muted)]">할인합계</span>
                      <span
                        className={`tabular-nums ${
                          totalDiscount > 0
                            ? "text-[var(--jm-danger-fg)]"
                            : "text-[var(--jm-text)]"
                        }`}
                      >
                        {totalDiscount > 0
                          ? `-₩${Math.round(totalDiscount).toLocaleString("ko-KR")}`
                          : ""}
                      </span>
                    </div>
                    <div className="px-3 py-2.5 flex items-center justify-between">
                      <span className="text-jm-xs text-[var(--jm-text-muted)]">합계금액</span>
                      <span className="font-bold text-jm-base tabular-nums text-[var(--jm-text)]">
                        ₩{Math.round(total).toLocaleString("ko-KR")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <FieldRow label="비고" alignTop>
                <JmTextarea
                  className="min-h-[60px]"
                  value={form.memo}
                  onChange={(e) => setForm((p) => ({ ...p, memo: e.target.value }))}
                />
              </FieldRow>
            </div>

            <div className="border-t border-[var(--jm-border)] px-5 py-4 flex justify-end gap-2 bg-[var(--jm-bg)]">
              <JmButton type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                취소
              </JmButton>
              <JmButton
                type="button"
                variant="cta"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting && <Loader2 className="size-4 animate-spin" />}
                <span>{isEdit ? "수정" : "등록"}</span>
              </JmButton>
            </div>
          </div>
        </JmDrawerContent>
      </JmDrawer>

      <QuickCustomerSheet
        open={quickCustomerOpen}
        onOpenChange={setQuickCustomerOpen}
        defaultName={quickCustomerName}
        onCreated={async (c) => {
          const list = await apiGet<CustomerOption[]>("/api/customers");
          setCustomers(list);
          const full = list.find((x) => x.id === c.id);
          setForm((p) => ({
            ...p,
            customerId: c.id,
            customerNameSnapshot: c.name,
            customerPhoneSnapshot: c.phone || "",
            customerAddressSnapshot: full?.address || "",
            customerBusinessNumberSnapshot: full?.businessNumber || "",
          }));
        }}
      />
    </>
  );
}

// ─── Field row helper ──────────────────────────────────────────────────────

function FieldRow({
  label,
  required,
  alignTop,
  children,
}: {
  label: string;
  required?: boolean;
  alignTop?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`grid grid-cols-[120px_1fr] gap-3 ${
        alignTop ? "items-start" : "items-center"
      }`}
    >
      <label
        className={`text-right text-jm-sm text-[var(--jm-text-muted)] ${
          alignTop ? "mt-2" : ""
        }`}
      >
        {label}
        {required && <span className="text-[var(--jm-danger-fg)] ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
