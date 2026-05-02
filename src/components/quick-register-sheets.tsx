"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PAYMENT_METHODS } from "@/lib/constants";
import { digitsOnly, formatBusinessNumber, formatPhone, formatComma, parseComma } from "@/lib/utils";
import { apiMutate, ApiError } from "@/lib/api-client";

// ─── 공통 필드 행 ───

function FieldRow({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3">
      <Label className="text-right text-[13px] text-muted-foreground shrink-0">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </Label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ============================================================
// 거래처 등록/수정
// ============================================================

interface ContactForm {
  id?: string;
  name: string;
  phone: string;
  email: string;
  position: string;
  memo: string;
}

const emptyContact = (): ContactForm => ({ name: "", phone: "", email: "", position: "", memo: "" });

interface SupplierFormData {
  id?: string;
  name: string;
  businessNumber: string;
  representative: string;
  phone: string;
  fax: string;
  email: string;
  address: string;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  paymentMethod: "CREDIT" | "PREPAID";
  paymentTermDays: number;
  memo: string;
  contacts: ContactForm[];
}

const emptySupplierForm: SupplierFormData = {
  name: "", businessNumber: "", representative: "", phone: "", fax: "",
  email: "", address: "", bankName: "", bankAccount: "", bankHolder: "",
  paymentMethod: "CREDIT", paymentTermDays: 30, memo: "", contacts: [],
};

interface QuickSupplierSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName?: string;
  editData?: SupplierFormData | null;
  onCreated: (supplier: { id: string; name: string }) => void;
  onUpdated?: () => void;
}

export function QuickSupplierSheet({
  open, onOpenChange, defaultName = "", editData, onCreated, onUpdated,
}: QuickSupplierSheetProps) {
  const [form, setForm] = useState<SupplierFormData>(emptySupplierForm);
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!editData?.id;

  // open + defaultName/editData가 변경될 때 form 초기화
  useEffect(() => {
    if (open) {
      setForm(editData ? editData : { ...emptySupplierForm, name: defaultName });
    }
  }, [open, defaultName, editData]);

  const handleOpenChange = (v: boolean) => {
    onOpenChange(v);
  };

  const update = (field: keyof SupplierFormData, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // 담당자 관리
  const addContact = () => setForm((prev) => ({ ...prev, contacts: [...prev.contacts, emptyContact()] }));
  const removeContact = (i: number) => setForm((prev) => ({ ...prev, contacts: prev.contacts.filter((_, idx) => idx !== i) }));
  const updateContact = (i: number, field: keyof ContactForm, value: string) => {
    setForm((prev) => ({
      ...prev,
      contacts: prev.contacts.map((c, idx) => idx === i ? { ...c, [field]: value } : c),
    }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      const url = isEdit ? `/api/suppliers/${editData!.id}` : "/api/suppliers";
      const method = isEdit ? "PUT" : "POST";

      const validContacts = form.contacts
        .filter((c) => c.name.trim())
        .map((c) => ({
          ...(c.id ? { id: c.id } : {}),
          name: c.name.trim(),
          phone: c.phone || undefined,
          email: c.email || undefined,
          position: c.position || undefined,
          memo: c.memo || undefined,
        }));

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          businessNumber: form.businessNumber || undefined,
          representative: form.representative || undefined,
          phone: form.phone || undefined,
          fax: form.fax || undefined,
          email: form.email || undefined,
          address: form.address || undefined,
          bankName: form.bankName || undefined,
          bankAccount: form.bankAccount || undefined,
          bankHolder: form.bankHolder || undefined,
          paymentMethod: form.paymentMethod,
          paymentTermDays: form.paymentTermDays,
          memo: form.memo || undefined,
          contacts: validContacts,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        const msg = err?.error?.formErrors?.[0] || (typeof err?.error === "string" ? err.error : (isEdit ? "거래처 수정 실패" : "거래처 등록 실패"));
        toast.error(msg);
        return;
      }
      const created = await res.json();
      toast.success(isEdit ? `거래처 "${form.name.trim()}" 수정 완료` : `거래처 "${form.name.trim()}" 등록 완료`);
      onOpenChange(false);
      if (isEdit) { onUpdated?.(); } else { onCreated({ id: created.id, name: created.name }); }
    } catch {
      toast.error("오류가 발생했습니다");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="h-[90vh]! p-0 flex flex-col">
        <SheetHeader className="border-b border-border px-5 py-4 flex-shrink-0">
          <SheetTitle>{isEdit ? "거래처 수정" : "거래처 등록"}</SheetTitle>
          <SheetDescription className="sr-only">{isEdit ? "거래처를 수정합니다" : "새 거래처를 등록합니다"}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-5 py-5 space-y-5">
          {/* 기본 정보 */}
          <div className="space-y-3">
            <FieldRow label="거래처명" required>
              <Input autoFocus value={form.name} onChange={(e) => update("name", e.target.value)} />
            </FieldRow>
            <FieldRow label="사업자번호">
              <Input
                value={formatBusinessNumber(form.businessNumber)}
                onChange={(e) => update("businessNumber", digitsOnly(e.target.value))}
                placeholder="1234567890"
              />
            </FieldRow>
            <FieldRow label="대표자">
              <Input value={form.representative} onChange={(e) => update("representative", e.target.value)} />
            </FieldRow>
            <FieldRow label="전화번호">
              <Input
                value={formatPhone(form.phone)}
                onChange={(e) => update("phone", digitsOnly(e.target.value))}
                placeholder="0212345678"
              />
            </FieldRow>
            <FieldRow label="FAX">
              <Input
                value={formatPhone(form.fax)}
                onChange={(e) => update("fax", digitsOnly(e.target.value))}
                placeholder="0212345678"
              />
            </FieldRow>
            <FieldRow label="이메일">
              <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="example@email.com" />
            </FieldRow>
            <FieldRow label="사업지 주소">
              <Input value={form.address} onChange={(e) => update("address", e.target.value)} />
            </FieldRow>
            <FieldRow label="은행명">
              <Input value={form.bankName} onChange={(e) => update("bankName", e.target.value)} placeholder="국민은행" />
            </FieldRow>
            <FieldRow label="계좌번호">
              <Input
                value={form.bankAccount}
                onChange={(e) => update("bankAccount", digitsOnly(e.target.value))}
                placeholder="숫자만 입력"
              />
            </FieldRow>
            <FieldRow label="예금주">
              <Input value={form.bankHolder} onChange={(e) => update("bankHolder", e.target.value)} />
            </FieldRow>
            <FieldRow label="결제 방식">
              <Select value={form.paymentMethod} onValueChange={(v) => update("paymentMethod", v ?? "CREDIT")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="결제 기한 (일)">
              <Input type="number" min="0" value={form.paymentTermDays} onChange={(e) => update("paymentTermDays", parseInt(e.target.value) || 0)} />
            </FieldRow>
            <FieldRow label="메모">
              <Input value={form.memo} onChange={(e) => update("memo", e.target.value)} placeholder="특이사항" />
            </FieldRow>
          </div>

          {/* 담당자 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium">담당자</span>
              <Button variant="ghost" size="sm" className="h-7 text-[12px] text-primary" onClick={addContact}>
                <Plus className="h-3.5 w-3.5 mr-1" />추가
              </Button>
            </div>

            {form.contacts.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">등록된 담당자가 없습니다</p>
            ) : (
              <div className="-mx-5 border-y border-border">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-muted text-muted-foreground text-xs">
                      <th className="py-2 px-3 text-left font-medium">이름</th>
                      <th className="py-2 px-3 text-left font-medium">휴대폰</th>
                      <th className="py-2 px-3 text-left font-medium hidden sm:table-cell">직책</th>
                      <th className="py-2 w-9"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.contacts.map((c, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-2 py-1">
                          <Input
                            value={c.name}
                            onChange={(e) => updateContact(i, "name", e.target.value)}
                            className="h-8 text-[13px]"
                            placeholder="이름 *"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <Input
                            value={formatPhone(c.phone)}
                            onChange={(e) => updateContact(i, "phone", digitsOnly(e.target.value))}
                            className="h-8 text-[13px]"
                            placeholder="01012345678"
                          />
                        </td>
                        <td className="px-2 py-1 hidden sm:table-cell">
                          <Input
                            value={c.position}
                            onChange={(e) => updateContact(i, "position", e.target.value)}
                            className="h-8 text-[13px]"
                            placeholder="직책"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeContact(i)}>
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          </div>
        </ScrollArea>

        <div className="border-t border-border px-5 py-4 flex justify-end gap-2 bg-background flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleSubmit} disabled={!form.name.trim() || submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? "수정" : "등록"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
// 공급상품 등록
// ============================================================

interface QuickSupplierProductSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: string;
  supplierName: string;
  defaultName?: string;
  isProvisional?: boolean;
  onCreated: (sp: { id: string; name: string; unitPrice: string }) => void;
}

export function QuickSupplierProductSheet({
  open, onOpenChange, supplierId, supplierName, defaultName = "", isProvisional = false, onCreated,
}: QuickSupplierProductSheetProps) {
  const [name, setName] = useState(defaultName);
  const [supplierCode, setSupplierCode] = useState("");
  const [unitOfMeasure, setUnitOfMeasure] = useState("EA");
  const [listPrice, setListPrice] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [isTaxable, setIsTaxable] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) { setName(defaultName); setSupplierCode(""); setUnitOfMeasure("EA"); setListPrice(""); setUnitPrice(""); setIsTaxable(true); }
  }, [open, defaultName]);

  const handleOpenChange = (v: boolean) => {
    onOpenChange(v);
  };

  const handleSubmit = async () => {
    if (!name.trim() || !supplierId) return;
    setSubmitting(true);
    try {
      const created = await apiMutate<{ id: string; name: string; unitPrice: string }>(
        "/api/supplier-products",
        "POST",
        {
          supplierId,
          name: name.trim(),
          supplierCode: supplierCode || undefined,
          unitOfMeasure,
          listPrice: listPrice || unitPrice || "0",
          unitPrice: unitPrice || listPrice || "0",
          isTaxable,
          isProvisional,
        },
      );
      toast.success(`공급상품 "${name.trim()}" 등록 완료`);
      onOpenChange(false);
      onCreated({ id: created.id, name: created.name, unitPrice: created.unitPrice });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "공급상품 등록 실패");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="h-[90vh]! p-0 flex flex-col">
        <SheetHeader className="border-b border-border px-5 py-4 flex-shrink-0">
          <SheetTitle>공급상품 등록</SheetTitle>
          <SheetDescription>거래처: <strong>{supplierName}</strong></SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-5 py-5 space-y-3">
          <FieldRow label="상품명" required>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && name.trim()) handleSubmit(); }} />
          </FieldRow>
          <FieldRow label="품번">
            <Input value={supplierCode} onChange={(e) => setSupplierCode(e.target.value)} placeholder="공급자 코드" />
          </FieldRow>
          <FieldRow label="단위">
            <Select value={unitOfMeasure} onValueChange={(v) => setUnitOfMeasure(v ?? "EA")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EA">EA (개)</SelectItem>
                <SelectItem value="BOX">BOX (박스)</SelectItem>
                <SelectItem value="KG">KG</SelectItem>
                <SelectItem value="L">L (리터)</SelectItem>
                <SelectItem value="SET">SET (세트)</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="정가 (세전)">
            <Input
              type="text"
              inputMode="numeric"
              value={formatComma(listPrice)}
              onChange={(e) => setListPrice(parseComma(e.target.value))}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="0"
            />
          </FieldRow>
          <FieldRow label="실제 매입 단가 (세전)">
            <Input
              type="text"
              inputMode="numeric"
              value={formatComma(unitPrice)}
              onChange={(e) => setUnitPrice(parseComma(e.target.value))}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="정가와 동일 시 비워두세요"
            />
          </FieldRow>
          <FieldRow label="부가세">
            <div className="flex h-8 rounded-md border border-input text-[13px] overflow-hidden w-fit">
              <button type="button" onClick={() => setIsTaxable(true)} className={`px-3 ${isTaxable ? "bg-muted text-foreground" : "text-muted-foreground"}`}>과세</button>
              <button type="button" onClick={() => setIsTaxable(false)} className={`px-3 ${!isTaxable ? "bg-muted text-foreground" : "text-muted-foreground"}`}>면세</button>
            </div>
          </FieldRow>
          </div>
        </ScrollArea>
        <div className="border-t border-border px-5 py-4 flex justify-end gap-2 bg-background flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            등록
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
// 고객 등록
// ============================================================

export interface CustomerFormData {
  id?: string;
  name: string;
  phone: string;
  businessNumber: string;
  ceo: string;
  email: string;
  address: string;
  memo: string;
}

interface QuickCustomerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName?: string;
  editData?: CustomerFormData | null;
  onCreated: (customer: { id: string; name: string; phone: string }) => void;
  onUpdated?: () => void;
}

export function QuickCustomerSheet({
  open, onOpenChange, defaultName = "", editData, onCreated, onUpdated,
}: QuickCustomerSheetProps) {
  const isEdit = !!editData?.id;
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState("");
  const [businessNumber, setBusinessNumber] = useState("");
  const [ceo, setCeo] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (editData) {
        setName(editData.name);
        setPhone(editData.phone);
        setBusinessNumber(editData.businessNumber);
        setCeo(editData.ceo);
        setEmail(editData.email);
        setAddress(editData.address);
        setMemo(editData.memo);
      } else {
        setName(defaultName); setPhone(""); setBusinessNumber(""); setCeo("");
        setEmail(""); setAddress(""); setMemo("");
      }
    }
  }, [open, defaultName, editData]);

  const handleSubmit = async () => {
    if (!name.trim() || !phone.trim()) return;
    setSubmitting(true);
    try {
      const url = isEdit ? `/api/customers/${editData!.id}` : "/api/customers";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          businessNumber: digitsOnly(businessNumber) || undefined,
          ceo: ceo.trim() || undefined,
          email: email.trim() || undefined,
          address: address.trim() || undefined,
          memo: memo.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        const fieldErr = err?.error?.fieldErrors;
        const msg = fieldErr?.name?.[0] || fieldErr?.phone?.[0] || fieldErr?.email?.[0] || (typeof err?.error === "string" ? err.error : isEdit ? "고객 수정 실패" : "고객 등록 실패");
        toast.error(msg);
        return;
      }
      const saved = await res.json();
      toast.success(isEdit ? `고객 "${name.trim()}" 수정 완료` : `고객 "${name.trim()}" 등록 완료`);
      onOpenChange(false);
      if (isEdit) {
        onUpdated?.();
      } else {
        onCreated({ id: saved.id, name: saved.name, phone: saved.phone });
      }
    } catch { toast.error("오류가 발생했습니다"); } finally { setSubmitting(false); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh]! p-0 flex flex-col">
        <SheetHeader className="border-b border-border px-5 py-4 flex-shrink-0">
          <SheetTitle>{isEdit ? "고객 수정" : "고객 등록"}</SheetTitle>
          <SheetDescription className="sr-only">{isEdit ? "고객 정보를 수정합니다" : "새 고객을 등록합니다"}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-5 py-5 space-y-3">
            <FieldRow label="고객명" required>
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            </FieldRow>
            <FieldRow label="연락처" required>
              <Input
                value={formatPhone(phone)}
                onChange={(e) => setPhone(digitsOnly(e.target.value))}
                placeholder="010-0000-0000"
              />
            </FieldRow>
            <FieldRow label="사업자번호">
              <Input
                value={formatBusinessNumber(businessNumber)}
                onChange={(e) => setBusinessNumber(digitsOnly(e.target.value))}
                placeholder="000-00-00000"
              />
            </FieldRow>
            <FieldRow label="대표자">
              <Input value={ceo} onChange={(e) => setCeo(e.target.value)} />
            </FieldRow>
            <FieldRow label="이메일">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </FieldRow>
            <FieldRow label="주소">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </FieldRow>
            <FieldRow label="메모">
              <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
            </FieldRow>
          </div>
        </ScrollArea>
        <div className="border-t border-border px-5 py-4 flex justify-end gap-2 bg-background flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || !phone.trim() || submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? "수정" : "등록"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
// 브랜드 등록 (간단형 — 로고 업로드는 /products/brands 관리 페이지에서)
// ============================================================

interface QuickBrandSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName?: string;
  onCreated: (brand: { id: string; name: string; logoUrl?: string | null }) => void;
}

export function QuickBrandSheet({ open, onOpenChange, defaultName = "", onCreated }: QuickBrandSheetProps) {
  const [name, setName] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setMemo("");
    }
  }, [open, defaultName]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("브랜드명을 입력해주세요");
      return;
    }
    setSubmitting(true);
    try {
      const json = await apiMutate<{ id: string; name: string; logoUrl: string | null }>(
        "/api/brands",
        "POST",
        { name: name.trim(), memo: memo.trim() || null },
      );
      toast.success("브랜드가 등록되었습니다");
      onCreated({ id: json.id, name: json.name, logoUrl: json.logoUrl });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "등록 실패");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh]! p-0 flex flex-col">
        <SheetHeader className="border-b border-border px-5 py-4 flex-shrink-0">
          <SheetTitle>브랜드 등록</SheetTitle>
          <SheetDescription className="sr-only">새 브랜드를 등록합니다</SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-5 py-5 space-y-3">
            <FieldRow label="브랜드명" required>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing && name.trim() && !submitting) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
            </FieldRow>
            <FieldRow label="메모">
              <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="(선택)" />
            </FieldRow>
            <p className="text-[11px] text-muted-foreground pl-[132px]">
              로고 업로드는 [상품 → 브랜드] 관리 페이지에서 가능합니다
            </p>
          </div>
        </ScrollArea>
        <div className="border-t border-border px-5 py-4 flex justify-end gap-2 bg-background flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            등록
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
