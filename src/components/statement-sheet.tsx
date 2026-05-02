"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CustomerCombobox } from "@/components/customer-combobox";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";
import { QuickCustomerSheet } from "@/components/quick-register-sheets";
import { formatComma, parseComma, calcDiscountPerUnit, normalizeDiscountInput, formatDiscountDisplay } from "@/lib/utils";
import { apiGet } from "@/lib/api-client";

type StatementStatus = "DRAFT" | "ISSUED" | "CANCELLED";

const STATEMENT_STATUS_LABEL: Record<StatementStatus, string> = {
  DRAFT: "초안",
  ISSUED: "발행",
  CANCELLED: "취소",
};

interface ItemForm {
  rowType: "product" | "free";
  productId: string | null;
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

interface CustomerOption { id: string; name: string; phone?: string | null; businessNumber?: string | null; address?: string | null; }

interface StatementSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editData?: StatementFormData | null;
  onSaved: (id: string) => void;
}

export function StatementSheet({ open, onOpenChange, editData, onSaved }: StatementSheetProps) {
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
      const [c, p] = await Promise.all([
        apiGet<CustomerOption[]>("/api/customers"),
        apiGet<ProductOption[]>("/api/products"),
      ]);
      setCustomers(c);
      setProducts(p);
    })();
  }, [open, editData]);

  const updateItem = (idx: number, patch: Partial<ItemForm>) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));
  };

  const addProductRow = () => setForm((prev) => ({ ...prev, items: [...prev.items, emptyProductItem()] }));
  const addFreeRow = () => setForm((prev) => ({ ...prev, items: [...prev.items, emptyFreeItem()] }));
  const removeItem = (idx: number) => setForm((prev) => ({
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
    // 고객 미선택 시 스냅샷 이름은 필수
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
        toast.error(typeof err?.error === "string" ? err.error : isEdit ? "수정 실패" : "등록 실패");
        return;
      }
      const saved = await res.json().catch(() => null);
      const savedId = isEdit ? editData!.id! : saved?.id;
      toast.success(isEdit ? "거래명세표가 수정되었습니다" : "거래명세표가 등록되었습니다");
      onOpenChange(false);
      onSaved(savedId);
    } catch {
      toast.error("오류가 발생했습니다");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[92vh] p-0 flex flex-col">
          <SheetHeader className="border-b border-border px-5 py-4 flex-shrink-0">
            <SheetTitle>{isEdit ? "거래명세표 수정" : "거래명세표 등록"}</SheetTitle>
            <SheetDescription className="sr-only">거래명세표 폼</SheetDescription>
          </SheetHeader>

          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="grid grid-cols-[120px_1fr] items-center gap-3">
                    <Label className="text-right text-[13px] text-muted-foreground">고객</Label>
                    <CustomerCombobox
                      customers={customers}
                      value={form.customerId}
                      onChange={(id, c) => setForm((p) => ({
                        ...p,
                        customerId: id,
                        customerNameSnapshot: c.name,
                        customerPhoneSnapshot: c.phone || "",
                        customerAddressSnapshot: (c as { address?: string | null }).address || "",
                        customerBusinessNumberSnapshot: c.businessNumber || "",
                      }))}
                      onCreateNew={(name) => { setQuickCustomerName(name); setQuickCustomerOpen(true); }}
                    />
                  </div>
                  <div className="grid grid-cols-[120px_1fr] items-center gap-3">
                    <Label className="text-right text-[13px] text-muted-foreground">고객명(표시)</Label>
                    <Input
                      value={form.customerNameSnapshot}
                      onChange={(e) => setForm((p) => ({ ...p, customerNameSnapshot: e.target.value }))}
                      placeholder="미등록 고객이면 직접 입력"
                    />
                  </div>
                  <div className="grid grid-cols-[120px_1fr] items-center gap-3">
                    <Label className="text-right text-[13px] text-muted-foreground">연락처(표시)</Label>
                    <Input
                      value={form.customerPhoneSnapshot}
                      onChange={(e) => setForm((p) => ({ ...p, customerPhoneSnapshot: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-[120px_1fr] items-center gap-3">
                    <Label className="text-right text-[13px] text-muted-foreground">발행일자<span className="text-red-400 ml-0.5">*</span></Label>
                    <Input type="date" value={form.issueDate} onChange={(e) => setForm((p) => ({ ...p, issueDate: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-[120px_1fr] items-center gap-3">
                    <Label className="text-right text-[13px] text-muted-foreground">상태</Label>
                    <Select
                      value={form.status}
                      onValueChange={(v) => setForm((p) => ({ ...p, status: (v as StatementStatus) ?? "ISSUED" }))}
                    >
                      <SelectTrigger>
                        <SelectValue>
                          {(v: unknown) => STATEMENT_STATUS_LABEL[v as StatementStatus] ?? String(v ?? "")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DRAFT">초안</SelectItem>
                        <SelectItem value="ISSUED">발행</SelectItem>
                        <SelectItem value="CANCELLED">취소</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] items-center gap-3">
                    <Label className="text-right text-[13px] text-muted-foreground">주소(표시)</Label>
                    <Input
                      value={form.customerAddressSnapshot}
                      onChange={(e) => setForm((p) => ({ ...p, customerAddressSnapshot: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="-mx-5 border-y border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-center font-normal w-[36px]">#</th>
                      <th className="px-3 py-2 text-left font-normal" style={{ width: "20%" }}>품명<span className="text-red-400 ml-0.5">*</span></th>
                      <th className="px-3 py-2 text-left font-normal" style={{ width: "12%" }}>규격</th>
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
                        <tr key={idx} className="border-t border-border">
                          <td className="px-3 py-1.5 text-center text-muted-foreground">{idx + 1}</td>
                          <td className="px-3 py-1.5">
                            {it.rowType === "product" ? (
                              <ProductCombobox
                                products={products}
                                value={it.productId || ""}
                                onChange={(pr) => updateItem(idx, {
                                  productId: pr.id,
                                  name: pr.name,
                                  unitOfMeasure: pr.unitOfMeasure,
                                  unitPrice: pr.sellingPrice,
                                  isTaxable: pr.taxType !== "TAX_FREE",
                                  isZeroRateEligible: pr.zeroRateEligible ?? false,
                                })}
                                placeholder="상품 선택..."
                              />
                            ) : (
                              <Input className="h-8" value={it.name} onChange={(e) => updateItem(idx, { name: e.target.value })} placeholder="품명 직접 입력" />
                            )}
                          </td>
                          <td className="px-3 py-1.5">
                            <Input className="h-8" value={it.spec} onChange={(e) => updateItem(idx, { spec: e.target.value })} />
                          </td>
                          <td className="px-3 py-1.5">
                            <Input className="h-8" value={it.unitOfMeasure} onChange={(e) => updateItem(idx, { unitOfMeasure: e.target.value })} />
                          </td>
                          <td className="px-3 py-1.5">
                            <Input className="h-8 text-right" inputMode="decimal" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: e.target.value })} onFocus={(e) => e.currentTarget.select()} />
                          </td>
                          <td className="px-3 py-1.5">
                            <Input className="h-8 text-right" inputMode="numeric" value={formatComma(it.unitPrice)} onChange={(e) => updateItem(idx, { unitPrice: parseComma(e.target.value) })} onFocus={(e) => e.currentTarget.select()} />
                          </td>
                          <td className="px-3 py-1.5">
                            <Input
                              className={`h-8 text-right ${discPerUnit > 0 ? "text-red-400" : ""}`}
                              inputMode={it.discount.trim().endsWith("%") ? "decimal" : "numeric"}
                              value={formatDiscountDisplay(it.discount)}
                              onChange={(e) => updateItem(idx, { discount: normalizeDiscountInput(e.target.value) })}
                              onFocus={(e) => e.currentTarget.select()}
                              disabled={p === 0}
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {actualPrice > 0 ? formatComma(String(Math.round(actualPrice))) : ""}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {lineSupply > 0 ? `₩${Math.round(lineSupply).toLocaleString("ko-KR")}` : ""}
                          </td>
                          <td className="px-3 py-1.5 text-right text-muted-foreground tabular-nums">
                            {lineTax > 0 ? `₩${lineTax.toLocaleString("ko-KR")}` : ""}
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="flex justify-center">
                              {(it.isZeroRateEligible || it.rowType === "free") ? (
                                <Checkbox
                                  checked={!it.isTaxable}
                                  onCheckedChange={(v) => updateItem(idx, { isTaxable: !v })}
                                />
                              ) : !it.isTaxable ? (
                                <span className="text-[11px] text-muted-foreground">면세</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(idx)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td colSpan={12} className="px-3 py-2">
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={addProductRow}>
                            <Plus className="h-3.5 w-3.5 mr-1" /> 상품 추가
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={addFreeRow}>
                            <Plus className="h-3.5 w-3.5 mr-1" /> 자유 품명 추가
                          </Button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* 합계 — 거래명세표 하단 */}
                <div className="border-t border-border bg-muted">
                  <div className="grid grid-cols-5 text-sm">
                    <div className="border-r border-border px-3 py-2.5 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">품목수</span>
                      <span>{form.items.filter((it) => it.name.trim()).length}건</span>
                    </div>
                    <div className="border-r border-border px-3 py-2.5 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">공급가액</span>
                      <span className="tabular-nums">₩{Math.round(subtotal).toLocaleString("ko-KR")}</span>
                    </div>
                    <div className="border-r border-border px-3 py-2.5 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">세액</span>
                      <span className="tabular-nums">{tax > 0 ? `₩${Math.round(tax).toLocaleString("ko-KR")}` : ""}</span>
                    </div>
                    <div className="border-r border-border px-3 py-2.5 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">할인합계</span>
                      <span className={`tabular-nums ${totalDiscount > 0 ? "text-red-400" : ""}`}>
                        {totalDiscount > 0 ? `-₩${Math.round(totalDiscount).toLocaleString("ko-KR")}` : ""}
                      </span>
                    </div>
                    <div className="px-3 py-2.5 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">합계금액</span>
                      <span className="font-bold text-base tabular-nums">₩{Math.round(total).toLocaleString("ko-KR")}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-[120px_1fr] items-start gap-3">
                <Label className="text-right text-[13px] text-muted-foreground mt-2">비고</Label>
                <textarea
                  className="min-h-[60px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                  value={form.memo}
                  onChange={(e) => setForm((p) => ({ ...p, memo: e.target.value }))}
                />
              </div>
            </div>

            <div className="border-t border-border px-5 py-4 flex justify-end gap-2 bg-background">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
              <Button type="button" onClick={handleSubmit} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {isEdit ? "수정" : "등록"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

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
