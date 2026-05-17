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
import { SupplierCombobox } from "@/components/supplier-combobox";
import { SupplierProductCombobox } from "@/components/supplier-product-combobox";
import {
  QuickCustomerSheet,
  QuickSupplierProductSheet,
  QuickSupplierSheet,
} from "@/components/quick-register-sheets";
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

type QuotationType = "SALES" | "PURCHASE";
type QuotationStatus =
  | "DRAFT"
  | "SENT"
  | "ACCEPTED"
  | "REJECTED"
  | "EXPIRED"
  | "CONVERTED";

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "초안" },
  { value: "SENT", label: "발송" },
  { value: "ACCEPTED", label: "수락" },
  { value: "REJECTED", label: "거절" },
  { value: "EXPIRED", label: "만료" },
];

interface ItemForm {
  rowType: "product" | "free";
  productId: string | null;
  supplierProductId: string | null;
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
  supplierProductId: null,
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
  supplierProductId: null,
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

export interface QuotationFormData {
  id?: string;
  type: QuotationType;
  status: QuotationStatus;
  issueDate: string;
  validUntil: string;
  customerId: string;
  supplierId: string;
  title: string;
  memo: string;
  terms: string;
  items: ItemForm[];
}

function addOneMonth(isoDate: string): string {
  const d = new Date(isoDate);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

const emptyForm = (type: QuotationType): QuotationFormData => {
  const today = new Date().toISOString().slice(0, 10);
  return {
    type,
    status: "DRAFT",
    issueDate: today,
    validUntil: addOneMonth(today),
    customerId: "",
    supplierId: "",
    title: "",
    memo: "",
    terms: "",
    items: [emptyProductItem()],
  };
};

interface CustomerOption {
  id: string;
  name: string;
  phone?: string | null;
  businessNumber?: string | null;
}
interface SupplierOption {
  id: string;
  name: string;
  businessNumber?: string | null;
}
interface SupplierProductOption {
  id: string;
  name: string;
  spec?: string | null;
  supplierCode?: string | null;
  unitPrice: string;
  unitOfMeasure: string;
}

interface QuotationSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  type: QuotationType;
  editData?: QuotationFormData | null;
  onSaved: (id: string, quotationNo?: string) => void;
}

export function QuotationSheet({
  open,
  onOpenChange,
  type,
  editData,
  onSaved,
}: QuotationSheetProps) {
  const isEdit = !!editData?.id;
  const [form, setForm] = useState<QuotationFormData>(emptyForm(type));
  const [submitting, setSubmitting] = useState(false);

  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [supplierProducts, setSupplierProducts] = useState<SupplierProductOption[]>([]);

  // Quick sheets
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [quickCustomerName, setQuickCustomerName] = useState("");
  const [quickSupplierOpen, setQuickSupplierOpen] = useState(false);
  const [quickSupplierName, setQuickSupplierName] = useState("");
  const [quickSpOpen, setQuickSpOpen] = useState(false);
  const [quickSpName, setQuickSpName] = useState("");
  const [quickSpItemIdx, setQuickSpItemIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(editData ? editData : emptyForm(type));
    (async () => {
      if (type === "SALES") {
        const [c, p] = await Promise.all([
          apiGet<CustomerOption[]>("/api/customers"),
          apiGet<ProductOption[]>("/api/products"),
        ]);
        setCustomers(c);
        setProducts(p);
      } else {
        const [s, sp] = await Promise.all([
          apiGet<SupplierOption[]>("/api/suppliers"),
          apiGet<SupplierProductOption[]>("/api/supplier-products"),
        ]);
        setSuppliers(s);
        setSupplierProducts(sp);
      }
    })();
  }, [open, type, editData]);

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
    if (type === "SALES" && !form.customerId) return toast.error("고객을 선택해주세요");
    if (type === "PURCHASE" && !form.supplierId)
      return toast.error("거래처를 선택해주세요");
    const validItems = form.items.filter((it) => it.name.trim());
    if (validItems.length === 0) return toast.error("품목을 하나 이상 추가해주세요");

    setSubmitting(true);
    try {
      const url = isEdit ? `/api/quotations/${editData!.id}` : "/api/quotations";
      const method = isEdit ? "PUT" : "POST";
      const body = {
        type: form.type,
        status: form.status,
        issueDate: form.issueDate,
        validUntil: form.validUntil || undefined,
        customerId: form.type === "SALES" ? form.customerId : undefined,
        supplierId: form.type === "PURCHASE" ? form.supplierId : undefined,
        title: form.title || undefined,
        memo: form.memo || undefined,
        terms: form.terms || undefined,
        items: validItems.map((it, idx) => {
          const p = parseFloat(it.unitPrice || "0");
          const discPerUnit = calcDiscountPerUnit(p, it.discount);
          const actual = p - discPerUnit;
          return {
            productId: it.productId,
            supplierProductId: it.supplierProductId,
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
      const savedNo: string | undefined = saved?.quotationNo;
      toast.success(isEdit ? "견적서가 수정되었습니다" : "견적서가 등록되었습니다");
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
              {isEdit ? "견적서 수정" : "견적서 등록"} · {type === "SALES" ? "판매" : "매입"}
            </JmDrawerTitle>
            <JmDrawerDescription className="sr-only">견적서 폼</JmDrawerDescription>
          </JmDrawerHeader>

          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
              {/* 상단 정보 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <FieldRow label={type === "SALES" ? "고객" : "거래처"} required>
                    {type === "SALES" ? (
                      <CustomerCombobox
                        customers={customers}
                        value={form.customerId}
                        onChange={(id) => setForm((p) => ({ ...p, customerId: id }))}
                        onCreateNew={(name) => {
                          setQuickCustomerName(name);
                          setQuickCustomerOpen(true);
                        }}
                      />
                    ) : (
                      <SupplierCombobox
                        suppliers={suppliers}
                        value={form.supplierId}
                        onChange={(id) => setForm((p) => ({ ...p, supplierId: id }))}
                        onCreateNew={(name) => {
                          setQuickSupplierName(name);
                          setQuickSupplierOpen(true);
                        }}
                      />
                    )}
                  </FieldRow>
                  <FieldRow label="견적 제목">
                    <JmInput
                      size="sm"
                      value={form.title}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, title: e.target.value }))
                      }
                      onFocus={focusCaretEnd}
                      placeholder="예: 4월 정기 발주 견적"
                    />
                  </FieldRow>
                  <FieldRow label="상태">
                    <JmSelect
                      size="sm"
                      options={STATUS_OPTIONS}
                      value={form.status}
                      onChange={(v) =>
                        setForm((p) => ({ ...p, status: v as QuotationStatus }))
                      }
                    />
                  </FieldRow>
                </div>

                <div className="space-y-3">
                  <FieldRow label="견적일자" required>
                    <JmInput
                      size="sm"
                      type="date"
                      value={form.issueDate}
                      onChange={(e) => {
                        const newIssue = e.target.value;
                        setForm((p) => {
                          const autoPrev = p.issueDate ? addOneMonth(p.issueDate) : "";
                          const shouldAutoUpdate = !p.validUntil || p.validUntil === autoPrev;
                          return {
                            ...p,
                            issueDate: newIssue,
                            validUntil:
                              shouldAutoUpdate && newIssue
                                ? addOneMonth(newIssue)
                                : p.validUntil,
                          };
                        });
                      }}
                    />
                  </FieldRow>
                  <FieldRow label="유효기간">
                    <JmInput
                      size="sm"
                      type="date"
                      value={form.validUntil}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, validUntil: e.target.value }))
                      }
                    />
                  </FieldRow>
                  <FieldRow label="결제/납기 조건">
                    <JmInput
                      size="sm"
                      value={form.terms}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, terms: e.target.value }))
                      }
                      onFocus={focusCaretEnd}
                      placeholder="예: 월말 결제, 납기 3일"
                    />
                  </FieldRow>
                </div>
              </div>

              {/* 품목 테이블 */}
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
                              type === "SALES" ? (
                                <ProductCombobox
                                  products={products}
                                  value={it.productId || ""}
                                  onChange={(pr) =>
                                    updateItem(idx, {
                                      productId: pr.id,
                                      name: pr.name,
                                      isTaxable: pr.taxType !== "TAX_FREE",
                                      isZeroRateEligible: pr.zeroRateEligible ?? false,
                                      unitOfMeasure: pr.unitOfMeasure,
                                      unitPrice: pr.sellingPrice,
                                    })
                                  }
                                  placeholder="상품 선택..."
                                />
                              ) : (
                                <SupplierProductCombobox
                                  supplierProducts={supplierProducts}
                                  value={it.supplierProductId || ""}
                                  onChange={(sp) =>
                                    updateItem(idx, {
                                      supplierProductId: sp.id,
                                      name: sp.name,
                                      spec: sp.spec || "",
                                      unitOfMeasure: sp.unitOfMeasure,
                                      unitPrice: sp.unitPrice,
                                    })
                                  }
                                  onCreateNew={(name) => {
                                    setQuickSpName(name);
                                    setQuickSpItemIdx(idx);
                                    setQuickSpOpen(true);
                                  }}
                                  placeholder="공급상품 선택..."
                                />
                              )
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

                {/* 합계 */}
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

              {/* 메모 */}
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
          setCustomers(await apiGet<CustomerOption[]>("/api/customers"));
          setForm((p) => ({ ...p, customerId: c.id }));
        }}
      />
      <QuickSupplierSheet
        open={quickSupplierOpen}
        onOpenChange={setQuickSupplierOpen}
        defaultName={quickSupplierName}
        onCreated={async (s) => {
          setSuppliers(await apiGet<SupplierOption[]>("/api/suppliers"));
          setForm((p) => ({ ...p, supplierId: s.id }));
        }}
      />
      <QuickSupplierProductSheet
        open={quickSpOpen}
        onOpenChange={setQuickSpOpen}
        defaultName={quickSpName}
        supplierId={form.supplierId}
        supplierName={suppliers.find((s) => s.id === form.supplierId)?.name || ""}
        onCreated={async (sp) => {
          setSupplierProducts(
            await apiGet<SupplierProductOption[]>("/api/supplier-products"),
          );
          if (quickSpItemIdx !== null) {
            updateItem(quickSpItemIdx, {
              supplierProductId: sp.id,
              name: sp.name,
              unitPrice: sp.unitPrice,
            });
          }
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
