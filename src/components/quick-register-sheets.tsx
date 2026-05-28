"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { focusCaretEnd } from "@/jm/lib/focus";
import { PAYMENT_METHODS } from "@/lib/constants";
import {
  digitsOnly,
  formatBusinessNumber,
  formatComma,
  formatPhone,
  parseComma,
} from "@/lib/utils";
import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { NameAutocomplete } from "@/components/new-product-form/parts";
import {
  JmButton,
  JmDrawer,
  JmDrawerContent,
  JmDrawerDescription,
  JmDrawerHeader,
  JmDrawerTitle,
  JmIconButton,
  JmInput,
  JmScrollArea,
  JmSelect,
} from "@/jm";

// ─── 공통 필드 행 ───

function FieldRow({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3">
      <label className="text-right text-jm-sm text-[var(--jm-text-muted)] shrink-0">
        {label}
        {required && <span className="text-[var(--jm-danger-fg)] ml-0.5">*</span>}
      </label>
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

const emptyContact = (): ContactForm => ({
  name: "",
  phone: "",
  email: "",
  position: "",
  memo: "",
});

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
  name: "",
  businessNumber: "",
  representative: "",
  phone: "",
  fax: "",
  email: "",
  address: "",
  bankName: "",
  bankAccount: "",
  bankHolder: "",
  paymentMethod: "CREDIT",
  paymentTermDays: 30,
  memo: "",
  contacts: [],
};

const PAYMENT_METHOD_OPTIONS = PAYMENT_METHODS.map((m) => ({
  value: m.value,
  label: m.label,
}));

const UNIT_OPTIONS = [
  { value: "EA", label: "EA (개)" },
  { value: "BOX", label: "BOX (박스)" },
  { value: "KG", label: "KG" },
  { value: "L", label: "L (리터)" },
  { value: "SET", label: "SET (세트)" },
];

interface QuickSupplierSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName?: string;
  editData?: SupplierFormData | null;
  onCreated: (supplier: { id: string; name: string }) => void;
  onUpdated?: () => void;
}

export function QuickSupplierSheet({
  open,
  onOpenChange,
  defaultName = "",
  editData,
  onCreated,
  onUpdated,
}: QuickSupplierSheetProps) {
  const [form, setForm] = useState<SupplierFormData>(emptySupplierForm);
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!editData?.id;

  useEffect(() => {
    if (open) {
      setForm(editData ? editData : { ...emptySupplierForm, name: defaultName });
    }
  }, [open, defaultName, editData]);

  const update = (field: keyof SupplierFormData, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const addContact = () =>
    setForm((prev) => ({ ...prev, contacts: [...prev.contacts, emptyContact()] }));
  const removeContact = (i: number) =>
    setForm((prev) => ({
      ...prev,
      contacts: prev.contacts.filter((_, idx) => idx !== i),
    }));
  const updateContact = (i: number, field: keyof ContactForm, value: string) => {
    setForm((prev) => ({
      ...prev,
      contacts: prev.contacts.map((c, idx) =>
        idx === i ? { ...c, [field]: value } : c,
      ),
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
        const msg =
          err?.error?.formErrors?.[0] ||
          (typeof err?.error === "string"
            ? err.error
            : isEdit
              ? "거래처 수정 실패"
              : "거래처 등록 실패");
        toast.error(msg);
        return;
      }
      const created = await res.json();
      toast.success(
        isEdit
          ? `거래처 "${form.name.trim()}" 수정 완료`
          : `거래처 "${form.name.trim()}" 등록 완료`,
      );
      onOpenChange(false);
      if (isEdit) {
        onUpdated?.();
      } else {
        onCreated({ id: created.id, name: created.name });
      }
    } catch {
      toast.error("오류가 발생했습니다");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <JmDrawer open={open} onOpenChange={onOpenChange}>
      <JmDrawerContent
        side="bottom"
        size="xl"
        className="flex flex-col p-0"
        dragHandle={false}
      >
        <JmDrawerHeader className="border-b border-[var(--jm-border)] px-5 py-4 flex-shrink-0">
          <JmDrawerTitle>{isEdit ? "거래처 수정" : "거래처 등록"}</JmDrawerTitle>
          <JmDrawerDescription className="sr-only">
            {isEdit ? "거래처를 수정합니다" : "새 거래처를 등록합니다"}
          </JmDrawerDescription>
        </JmDrawerHeader>

        <JmScrollArea className="flex-1 min-h-0">
          <div className="px-5 py-5 space-y-5">
            {/* 기본 정보 */}
            <div className="space-y-3">
              <FieldRow label="거래처명" required>
                <JmInput
                  size="sm"
                  autoFocus
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  onFocus={focusCaretEnd}
                />
              </FieldRow>
              <FieldRow label="사업자번호">
                <JmInput
                  size="sm"
                  value={formatBusinessNumber(form.businessNumber)}
                  onChange={(e) => update("businessNumber", digitsOnly(e.target.value))}
                  placeholder="1234567890"
                />
              </FieldRow>
              <FieldRow label="대표자">
                <JmInput
                  size="sm"
                  value={form.representative}
                  onChange={(e) => update("representative", e.target.value)}
                  onFocus={focusCaretEnd}
                />
              </FieldRow>
              <FieldRow label="전화번호">
                <JmInput
                  size="sm"
                  value={formatPhone(form.phone)}
                  onChange={(e) => update("phone", digitsOnly(e.target.value))}
                  placeholder="0212345678"
                />
              </FieldRow>
              <FieldRow label="FAX">
                <JmInput
                  size="sm"
                  value={formatPhone(form.fax)}
                  onChange={(e) => update("fax", digitsOnly(e.target.value))}
                  placeholder="0212345678"
                />
              </FieldRow>
              <FieldRow label="이메일">
                <JmInput
                  size="sm"
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  onFocus={focusCaretEnd}
                  placeholder="example@email.com"
                />
              </FieldRow>
              <FieldRow label="사업지 주소">
                <JmInput
                  size="sm"
                  value={form.address}
                  onChange={(e) => update("address", e.target.value)}
                  onFocus={focusCaretEnd}
                />
              </FieldRow>
              <FieldRow label="은행명">
                <JmInput
                  size="sm"
                  value={form.bankName}
                  onChange={(e) => update("bankName", e.target.value)}
                  onFocus={focusCaretEnd}
                  placeholder="국민은행"
                />
              </FieldRow>
              <FieldRow label="계좌번호">
                <JmInput
                  size="sm"
                  value={form.bankAccount}
                  onChange={(e) => update("bankAccount", digitsOnly(e.target.value))}
                  placeholder="숫자만 입력"
                />
              </FieldRow>
              <FieldRow label="예금주">
                <JmInput
                  size="sm"
                  value={form.bankHolder}
                  onChange={(e) => update("bankHolder", e.target.value)}
                  onFocus={focusCaretEnd}
                />
              </FieldRow>
              <FieldRow label="결제 방식">
                <JmSelect
                  size="sm"
                  options={PAYMENT_METHOD_OPTIONS}
                  value={form.paymentMethod}
                  onChange={(v) => update("paymentMethod", v)}
                />
              </FieldRow>
              <FieldRow label="결제 기한 (일)">
                <JmInput
                  size="sm"
                  type="number"
                  min="0"
                  value={String(form.paymentTermDays)}
                  onChange={(e) =>
                    update("paymentTermDays", parseInt(e.target.value) || 0)
                  }
                />
              </FieldRow>
              <FieldRow label="메모">
                <JmInput
                  size="sm"
                  value={form.memo}
                  onChange={(e) => update("memo", e.target.value)}
                  onFocus={focusCaretEnd}
                  placeholder="특이사항"
                />
              </FieldRow>
            </div>

            {/* 담당자 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-jm-sm font-medium text-[var(--jm-text)]">담당자</span>
                <JmButton
                  variant="ghost"
                  size="sm"
                  onClick={addContact}
                  className="text-[var(--jm-info-fg)]"
                >
                  <Plus />
                  <span>추가</span>
                </JmButton>
              </div>

              {form.contacts.length === 0 ? (
                <p className="text-jm-xs text-[var(--jm-text-muted)] text-center py-3">
                  등록된 담당자가 없습니다
                </p>
              ) : (
                <div className="-mx-5 border-y border-[var(--jm-border)]">
                  <table className="w-full text-jm-sm">
                    <thead>
                      <tr className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-jm-xs">
                        <th className="py-2 px-3 text-left font-medium">이름</th>
                        <th className="py-2 px-3 text-left font-medium">휴대폰</th>
                        <th className="py-2 px-3 text-left font-medium hidden sm:table-cell">
                          직책
                        </th>
                        <th className="py-2 w-9"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.contacts.map((c, i) => (
                        <tr key={i} className="border-t border-[var(--jm-border)]">
                          <td className="px-2 py-1">
                            <JmInput
                              size="sm"
                              value={c.name}
                              onChange={(e) => updateContact(i, "name", e.target.value)}
                              onFocus={focusCaretEnd}
                              placeholder="이름 *"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <JmInput
                              size="sm"
                              value={formatPhone(c.phone)}
                              onChange={(e) =>
                                updateContact(i, "phone", digitsOnly(e.target.value))
                              }
                              placeholder="01012345678"
                            />
                          </td>
                          <td className="px-2 py-1 hidden sm:table-cell">
                            <JmInput
                              size="sm"
                              value={c.position}
                              onChange={(e) =>
                                updateContact(i, "position", e.target.value)
                              }
                              onFocus={focusCaretEnd}
                              placeholder="직책"
                            />
                          </td>
                          <td className="px-1 py-1">
                            <JmIconButton
                              aria-label="담당자 삭제"
                              size="sm"
                              variant="ghost"
                              onClick={() => removeContact(i)}
                            >
                              <Trash2 />
                            </JmIconButton>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </JmScrollArea>

        <div className="border-t border-[var(--jm-border)] px-5 py-4 flex justify-end gap-2 bg-[var(--jm-bg)] flex-shrink-0">
          <JmButton variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </JmButton>
          <JmButton
            variant="cta"
            onClick={handleSubmit}
            disabled={!form.name.trim() || submitting}
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            <span>{isEdit ? "수정" : "등록"}</span>
          </JmButton>
        </div>
      </JmDrawerContent>
    </JmDrawer>
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
  open,
  onOpenChange,
  supplierId,
  supplierName,
  defaultName = "",
  isProvisional = false,
  onCreated,
}: QuickSupplierProductSheetProps) {
  const [name, setName] = useState(defaultName);
  const [supplierCode, setSupplierCode] = useState("");
  const [unitOfMeasure, setUnitOfMeasure] = useState("EA");
  const [listPrice, setListPrice] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [isTaxable, setIsTaxable] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const existingQuery = useQuery({
    queryKey: queryKeys.supplierProducts.list({ supplierId }),
    queryFn: () =>
      apiGet<Array<{ id: string; name: string; supplierCode: string | null }>>(
        `/api/supplier-products?supplierId=${encodeURIComponent(supplierId)}`,
      ),
    enabled: open && !!supplierId,
  });
  const nameItems = useMemo(
    () =>
      (existingQuery.data ?? []).map((sp) => ({
        id: sp.id,
        name: sp.name,
        badge: sp.supplierCode ?? null,
      })),
    [existingQuery.data],
  );

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setSupplierCode("");
      setUnitOfMeasure("EA");
      setListPrice("");
      setUnitPrice("");
      setIsTaxable(true);
    }
  }, [open, defaultName]);

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
    <JmDrawer open={open} onOpenChange={onOpenChange}>
      <JmDrawerContent
        side="bottom"
        size="xl"
        className="flex flex-col p-0"
        dragHandle={false}
      >
        <JmDrawerHeader className="border-b border-[var(--jm-border)] px-5 py-4 flex-shrink-0">
          <JmDrawerTitle>공급상품 등록</JmDrawerTitle>
          <JmDrawerDescription>
            거래처: <strong className="text-[var(--jm-text)]">{supplierName}</strong>
          </JmDrawerDescription>
        </JmDrawerHeader>
        <JmScrollArea className="flex-1 min-h-0">
          <div className="px-5 py-5 space-y-3">
            <FieldRow label="상품명" required>
              <NameAutocomplete
                autoFocus
                value={name}
                onChange={setName}
                items={nameItems}
                placeholder="공급상품명을 입력하세요"
                warningLabel="이미 등록된 공급상품"
                inputClassName=""
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing && name.trim())
                    handleSubmit();
                }}
              />
            </FieldRow>
            <FieldRow label="품번">
              <JmInput
                size="sm"
                value={supplierCode}
                onChange={(e) => setSupplierCode(e.target.value)}
                onFocus={focusCaretEnd}
                placeholder="공급자 코드"
              />
            </FieldRow>
            <FieldRow label="단위">
              <JmSelect
                size="sm"
                options={UNIT_OPTIONS}
                value={unitOfMeasure}
                onChange={(v) => setUnitOfMeasure(v)}
              />
            </FieldRow>
            <FieldRow label="정가 (세전)">
              <JmInput
                size="sm"
                type="text"
                inputMode="numeric"
                value={formatComma(listPrice)}
                onChange={(e) => setListPrice(parseComma(e.target.value))}
                onFocus={focusCaretEnd}
                placeholder="0"
              />
            </FieldRow>
            <FieldRow label="실제 매입 단가 (세전)">
              <JmInput
                size="sm"
                type="text"
                inputMode="numeric"
                value={formatComma(unitPrice)}
                onChange={(e) => setUnitPrice(parseComma(e.target.value))}
                onFocus={focusCaretEnd}
                placeholder="정가와 동일 시 비워두세요"
              />
            </FieldRow>
            <FieldRow label="부가세">
              <div className="flex h-8 rounded-md border border-[var(--jm-border)] text-jm-sm overflow-hidden w-fit">
                <button
                  type="button"
                  onClick={() => setIsTaxable(true)}
                  className={`px-3 transition-colors ${
                    isTaxable
                      ? "bg-[var(--jm-surface-muted)] text-[var(--jm-text)]"
                      : "text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
                  }`}
                >
                  과세
                </button>
                <button
                  type="button"
                  onClick={() => setIsTaxable(false)}
                  className={`px-3 transition-colors border-l border-[var(--jm-border)] ${
                    !isTaxable
                      ? "bg-[var(--jm-surface-muted)] text-[var(--jm-text)]"
                      : "text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
                  }`}
                >
                  면세
                </button>
              </div>
            </FieldRow>
          </div>
        </JmScrollArea>
        <div className="border-t border-[var(--jm-border)] px-5 py-4 flex justify-end gap-2 bg-[var(--jm-bg)] flex-shrink-0">
          <JmButton variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </JmButton>
          <JmButton
            variant="cta"
            onClick={handleSubmit}
            disabled={!name.trim() || submitting}
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            <span>등록</span>
          </JmButton>
        </div>
      </JmDrawerContent>
    </JmDrawer>
  );
}

// ============================================================
// 고객 등록
// ============================================================

export interface CustomerFormData {
  id?: string;
  type?: "INDIVIDUAL" | "BUSINESS";
  name: string;
  phone: string;
  email: string;
  memo: string;
  // 기업
  businessNumber: string;
  ceo: string;
  fax?: string;
  businessType?: string;
  businessItem?: string;
  // 주소
  address: string;
  shippingAddress?: string;
  // 담당자 (기업)
  contactName?: string;
  contactPhone?: string;
  contactPosition?: string;
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
  open,
  onOpenChange,
  defaultName = "",
  editData,
  onCreated,
  onUpdated,
}: QuickCustomerSheetProps) {
  const isEdit = !!editData?.id;
  const [type, setType] = useState<"INDIVIDUAL" | "BUSINESS">("INDIVIDUAL");
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [memo, setMemo] = useState("");
  // 기업 전용
  const [businessNumber, setBusinessNumber] = useState("");
  const [ceo, setCeo] = useState("");
  const [fax, setFax] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [businessItem, setBusinessItem] = useState("");
  // 주소
  const [address, setAddress] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingDiffers, setShippingDiffers] = useState(false);
  // 담당자 (기업)
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactPosition, setContactPosition] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (editData) {
        setType(editData.type ?? "INDIVIDUAL");
        setName(editData.name);
        setPhone(editData.phone);
        setEmail(editData.email);
        setMemo(editData.memo);
        setBusinessNumber(editData.businessNumber);
        setCeo(editData.ceo);
        setFax(editData.fax ?? "");
        setBusinessType(editData.businessType ?? "");
        setBusinessItem(editData.businessItem ?? "");
        setAddress(editData.address);
        setShippingAddress(editData.shippingAddress ?? "");
        setShippingDiffers(!!editData.shippingAddress);
        setContactName(editData.contactName ?? "");
        setContactPhone(editData.contactPhone ?? "");
        setContactPosition(editData.contactPosition ?? "");
      } else {
        setType("INDIVIDUAL");
        setName(defaultName);
        setPhone("");
        setEmail("");
        setMemo("");
        setBusinessNumber("");
        setCeo("");
        setFax("");
        setBusinessType("");
        setBusinessItem("");
        setAddress("");
        setShippingAddress("");
        setShippingDiffers(false);
        setContactName("");
        setContactPhone("");
        setContactPosition("");
      }
    }
  }, [open, defaultName, editData]);

  const isBusiness = type === "BUSINESS";

  const handleSubmit = async () => {
    // 기업 고객은 상호명 필수. 개인 고객은 이름 미입력 시 서버가 자동으로 전화번호로 채움.
    if (isBusiness && !name.trim()) return;
    if (!phone.trim()) return;
    setSubmitting(true);
    try {
      const url = isEdit ? `/api/customers/${editData!.id}` : "/api/customers";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          memo: memo.trim() || undefined,
          ...(isBusiness && {
            businessNumber: digitsOnly(businessNumber) || undefined,
            ceo: ceo.trim() || undefined,
            fax: digitsOnly(fax) || undefined,
            businessType: businessType.trim() || undefined,
            businessItem: businessItem.trim() || undefined,
            contactName: contactName.trim() || undefined,
            contactPhone: digitsOnly(contactPhone) || undefined,
            contactPosition: contactPosition.trim() || undefined,
          }),
          address: address.trim() || undefined,
          shippingAddress: shippingDiffers
            ? shippingAddress.trim() || undefined
            : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        // phone 중복 (409) — existing 고객 정보 보여주고 사용자가 선택
        if (res.status === 409 && err?.existing && !isEdit) {
          const existing = err.existing as {
            id: string;
            name: string;
            phone: string;
            type?: "INDIVIDUAL" | "BUSINESS";
          };
          const typeLabel = existing.type === "BUSINESS" ? " (기업)" : " (개인)";
          const useExisting = window.confirm(
            `같은 전화번호로 이미 등록된 고객이 있습니다:\n\n  ${existing.name}${typeLabel} — ${formatPhone(existing.phone)}\n\n[확인] 기존 고객 사용 (권장)\n[취소] 동명이인으로 새로 등록`,
          );
          if (useExisting) {
            toast.success(`기존 고객 "${existing.name}" 사용`);
            onOpenChange(false);
            onCreated({
              id: existing.id,
              name: existing.name,
              phone: existing.phone,
            });
            return;
          }
          // "그래도 등록" — allowDuplicatePhone 으로 재시도
          const retry = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...JSON.parse(
                JSON.stringify({
                  type,
                  name: name.trim(),
                  phone: phone.trim(),
                  email: email.trim() || undefined,
                  memo: memo.trim() || undefined,
                  ...(isBusiness && {
                    businessNumber: digitsOnly(businessNumber) || undefined,
                    ceo: ceo.trim() || undefined,
                    fax: digitsOnly(fax) || undefined,
                    businessType: businessType.trim() || undefined,
                    businessItem: businessItem.trim() || undefined,
                    contactName: contactName.trim() || undefined,
                    contactPhone: digitsOnly(contactPhone) || undefined,
                    contactPosition: contactPosition.trim() || undefined,
                  }),
                  address: address.trim() || undefined,
                  shippingAddress: shippingDiffers
                    ? shippingAddress.trim() || undefined
                    : undefined,
                }),
              ),
              allowDuplicatePhone: true,
            }),
          });
          if (!retry.ok) {
            const e = await retry.json().catch(() => null);
            toast.error(typeof e?.error === "string" ? e.error : "고객 등록 실패");
            return;
          }
          const saved2 = await retry.json();
          const typeLbl = isBusiness ? " (기업)" : " (개인)";
          toast.success(`고객 "${name.trim()}"${typeLbl} 등록 완료`);
          onOpenChange(false);
          onCreated({ id: saved2.id, name: saved2.name, phone: saved2.phone });
          return;
        }
        const fieldErr = err?.error?.fieldErrors;
        const msg =
          fieldErr?.name?.[0] ||
          fieldErr?.phone?.[0] ||
          fieldErr?.email?.[0] ||
          fieldErr?.businessNumber?.[0] ||
          (typeof err?.error === "string"
            ? err.error
            : isEdit
              ? "고객 수정 실패"
              : "고객 등록 실패");
        toast.error(msg);
        return;
      }
      const saved = await res.json();
      const typeLabel = isBusiness ? " (기업)" : " (개인)";
      toast.success(
        isEdit
          ? `고객 "${name.trim()}"${typeLabel} 수정 완료`
          : `고객 "${name.trim()}"${typeLabel} 등록 완료`,
      );
      onOpenChange(false);
      if (isEdit) {
        onUpdated?.();
      } else {
        onCreated({ id: saved.id, name: saved.name, phone: saved.phone });
      }
    } catch {
      toast.error("오류가 발생했습니다");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <JmDrawer open={open} onOpenChange={onOpenChange}>
      <JmDrawerContent
        side="bottom"
        size="xl"
        className="flex flex-col p-0"
        dragHandle={false}
      >
        <JmDrawerHeader className="border-b border-[var(--jm-border)] px-5 py-4 flex-shrink-0">
          <JmDrawerTitle>{isEdit ? "고객 수정" : "고객 등록"}</JmDrawerTitle>
          <JmDrawerDescription className="sr-only">
            {isEdit ? "고객 정보를 수정합니다" : "새 고객을 등록합니다"}
          </JmDrawerDescription>
        </JmDrawerHeader>
        <JmScrollArea className="flex-1 min-h-0">
          <div className="px-5 py-5 space-y-3">
            {/* 타입 토글 */}
            <FieldRow label="구분" required>
              <div className="grid grid-cols-2 gap-1.5 rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface-muted)]/40 p-1">
                {(["INDIVIDUAL", "BUSINESS"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`h-9 rounded text-jm-sm font-semibold transition-colors ${
                      type === t
                        ? "bg-[var(--jm-surface)] text-[var(--jm-text)] shadow-sm"
                        : "text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
                    }`}
                  >
                    {t === "INDIVIDUAL" ? "개인" : "기업/사업자"}
                  </button>
                ))}
              </div>
            </FieldRow>

            <FieldRow label={isBusiness ? "상호" : "이름"} required>
              <JmInput
                size="sm"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={focusCaretEnd}
                placeholder={isBusiness ? "(주)회사명" : "홍길동"}
              />
            </FieldRow>
            <FieldRow label={isBusiness ? "대표 전화" : "연락처"} required>
              <JmInput
                size="sm"
                value={formatPhone(phone)}
                onChange={(e) => setPhone(digitsOnly(e.target.value))}
                placeholder="010-0000-0000"
              />
            </FieldRow>
            <FieldRow label="이메일">
              <JmInput
                size="sm"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={focusCaretEnd}
              />
            </FieldRow>

            {/* 기업 전용 섹션 */}
            {isBusiness && (
              <>
                <div className="pt-2 pb-1 text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
                  사업자 정보
                </div>
                <FieldRow label="사업자번호">
                  <div className="flex flex-col gap-1">
                    <JmInput
                      size="sm"
                      value={formatBusinessNumber(businessNumber)}
                      onChange={(e) => setBusinessNumber(digitsOnly(e.target.value))}
                      placeholder="000-00-00000"
                      className={
                        businessNumber.length > 0 && businessNumber.length !== 10
                          ? "border-[var(--jm-warning-fg)]/60 focus-visible:border-[var(--jm-warning-fg)]"
                          : ""
                      }
                    />
                    {businessNumber.length > 0 && businessNumber.length < 10 && (
                      <p className="text-jm-2xs text-[var(--jm-warning-fg)]">
                        {10 - businessNumber.length}자리 더 입력 (10자리 필요)
                      </p>
                    )}
                    {businessNumber.length === 10 && (
                      <p className="text-jm-2xs text-[var(--jm-success-fg)]">
                        형식 OK ({formatBusinessNumber(businessNumber)})
                      </p>
                    )}
                    {businessNumber.length > 10 && (
                      <p className="text-jm-2xs text-[var(--jm-danger-fg)]">
                        10자리 초과 — 앞 10자리만 사용됩니다
                      </p>
                    )}
                  </div>
                </FieldRow>
                <FieldRow label="대표자">
                  <JmInput
                    size="sm"
                    value={ceo}
                    onChange={(e) => setCeo(e.target.value)}
                    onFocus={focusCaretEnd}
                  />
                </FieldRow>
                <FieldRow label="팩스">
                  <JmInput
                    size="sm"
                    value={formatPhone(fax)}
                    onChange={(e) => setFax(digitsOnly(e.target.value))}
                    placeholder="02-0000-0000"
                  />
                </FieldRow>
                <FieldRow label="업태">
                  <JmInput
                    size="sm"
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value)}
                    onFocus={focusCaretEnd}
                    placeholder="제조업, 도매업 등"
                  />
                </FieldRow>
                <FieldRow label="종목">
                  <JmInput
                    size="sm"
                    value={businessItem}
                    onChange={(e) => setBusinessItem(e.target.value)}
                    onFocus={focusCaretEnd}
                    placeholder="농기계, 부품 등"
                  />
                </FieldRow>

                <div className="pt-2 pb-1 text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
                  실무 담당자 (대표 외)
                </div>
                <FieldRow label="담당자명">
                  <JmInput
                    size="sm"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    onFocus={focusCaretEnd}
                  />
                </FieldRow>
                <FieldRow label="담당자 전화">
                  <JmInput
                    size="sm"
                    value={formatPhone(contactPhone)}
                    onChange={(e) => setContactPhone(digitsOnly(e.target.value))}
                  />
                </FieldRow>
                <FieldRow label="직책">
                  <JmInput
                    size="sm"
                    value={contactPosition}
                    onChange={(e) => setContactPosition(e.target.value)}
                    onFocus={focusCaretEnd}
                    placeholder="과장, 대리 등"
                  />
                </FieldRow>
              </>
            )}

            {/* 주소 섹션 */}
            <div className="pt-2 pb-1 text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
              주소
            </div>
            <FieldRow label={isBusiness ? "사업장 주소" : "주소"}>
              <JmInput
                size="sm"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onFocus={focusCaretEnd}
              />
            </FieldRow>
            <FieldRow label="배송지 다름">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShippingDiffers((v) => !v)}
                  className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${
                    shippingDiffers
                      ? "bg-[var(--jm-success-fg)]"
                      : "bg-[var(--jm-border)]"
                  }`}
                >
                  <span
                    className={`size-5 rounded-full bg-white shadow transition-transform ${
                      shippingDiffers ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
                <span className="text-jm-xs text-[var(--jm-text-muted)]">
                  배송지가 {isBusiness ? "사업장" : "주소"}와 다름
                </span>
              </div>
            </FieldRow>
            {shippingDiffers && (
              <FieldRow label="배송지 주소">
                <JmInput
                  size="sm"
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  onFocus={focusCaretEnd}
                  placeholder="물건을 받을 주소"
                />
              </FieldRow>
            )}

            <FieldRow label="메모">
              <JmInput
                size="sm"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                onFocus={focusCaretEnd}
              />
            </FieldRow>
          </div>
        </JmScrollArea>
        <div className="border-t border-[var(--jm-border)] px-5 py-4 flex justify-end gap-2 bg-[var(--jm-bg)] flex-shrink-0">
          <JmButton variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </JmButton>
          <JmButton
            variant="cta"
            onClick={handleSubmit}
            disabled={(isBusiness && !name.trim()) || !phone.trim() || submitting}
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            <span>{isEdit ? "수정" : "등록"}</span>
          </JmButton>
        </div>
      </JmDrawerContent>
    </JmDrawer>
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

export function QuickBrandSheet({
  open,
  onOpenChange,
  defaultName = "",
  onCreated,
}: QuickBrandSheetProps) {
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
      const json = await apiMutate<{
        id: string;
        name: string;
        logoUrl: string | null;
      }>("/api/brands", "POST", { name: name.trim(), memo: memo.trim() || null });
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
    <JmDrawer open={open} onOpenChange={onOpenChange}>
      <JmDrawerContent
        side="bottom"
        size="lg"
        className="flex flex-col p-0"
        dragHandle={false}
      >
        <JmDrawerHeader className="border-b border-[var(--jm-border)] px-5 py-4 flex-shrink-0">
          <JmDrawerTitle>브랜드 등록</JmDrawerTitle>
          <JmDrawerDescription className="sr-only">
            새 브랜드를 등록합니다
          </JmDrawerDescription>
        </JmDrawerHeader>
        <JmScrollArea className="flex-1 min-h-0">
          <div className="px-5 py-5 space-y-3">
            <FieldRow label="브랜드명" required>
              <JmInput
                size="sm"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={focusCaretEnd}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.nativeEvent.isComposing &&
                    name.trim() &&
                    !submitting
                  ) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
            </FieldRow>
            <FieldRow label="메모">
              <JmInput
                size="sm"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                onFocus={focusCaretEnd}
                placeholder="(선택)"
              />
            </FieldRow>
            <p className="text-jm-2xs text-[var(--jm-text-muted)] pl-[132px]">
              로고 업로드는 [상품 → 브랜드] 관리 페이지에서 가능합니다
            </p>
          </div>
        </JmScrollArea>
        <div className="border-t border-[var(--jm-border)] px-5 py-4 flex justify-end gap-2 bg-[var(--jm-bg)] flex-shrink-0">
          <JmButton variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </JmButton>
          <JmButton
            variant="cta"
            onClick={handleSubmit}
            disabled={!name.trim() || submitting}
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            <span>등록</span>
          </JmButton>
        </div>
      </JmDrawerContent>
    </JmDrawer>
  );
}
