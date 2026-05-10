"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, User } from "lucide-react";
import { toast } from "sonner";

import { apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { digitsOnly, formatBusinessNumber, formatPhone } from "@/lib/utils";
import {
  JmAlert,
  JmButton,
  JmDrawer,
  JmDrawerBody,
  JmDrawerContent,
  JmDrawerFooter,
  JmDrawerHeader,
  JmDrawerTitle,
  JmFormField,
  JmInput,
  JmSectionLabel,
  JmSegmentedControl,
  JmSpinner,
  JmTextarea,
} from "@/jm";

import {
  type Customer,
  type CustomerFormState,
  type CustomerType,
  customerToForm,
  emptyCustomerForm,
} from "./_types";

interface DuplicateInfo {
  id: string;
  name: string;
  phone: string | null;
  businessNumber: string | null;
  type: CustomerType;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 수정 모드일 때 기존 고객 데이터. null/undefined 면 신규 등록 모드. */
  editTarget?: Customer | null;
  onSaved?: () => void;
}

/**
 * Drawer 자체는 항상 mount 상태로 두고, 내부 폼 컴포넌트만 open 시점에
 * remount(`key`)되어 초기 상태가 lazy initializer 로 깨끗하게 잡힘.
 * useEffect 로 setState 하는 anti-pattern 회피.
 */
export function CustomerSheet({
  open,
  onOpenChange,
  editTarget,
  onSaved,
}: Props) {
  return (
    <JmDrawer open={open} onOpenChange={onOpenChange}>
      <JmDrawerContent side="right" size="lg">
        {open && (
          <CustomerSheetForm
            key={editTarget?.id ?? "new"}
            editTarget={editTarget ?? null}
            onClose={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        )}
      </JmDrawerContent>
    </JmDrawer>
  );
}

interface FormProps {
  editTarget: Customer | null;
  onClose: () => void;
  onSaved?: () => void;
}

function CustomerSheetForm({ editTarget, onClose, onSaved }: FormProps) {
  const queryClient = useQueryClient();
  const isEdit = !!editTarget;

  const [form, setForm] = useState<CustomerFormState>(() =>
    editTarget ? customerToForm(editTarget) : emptyCustomerForm(),
  );
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);
  const [allowDuplicatePhone, setAllowDuplicatePhone] = useState(false);

  const update = <K extends keyof CustomerFormState>(
    key: K,
    value: CustomerFormState[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const isBusiness = form.type === "BUSINESS";

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("이름/상호를 입력해주세요");
      if (!form.phone.trim()) throw new Error("연락처를 입력해주세요");

      const payload = {
        type: form.type,
        name: form.name.trim(),
        phone: digitsOnly(form.phone),
        email: form.email || undefined,
        memo: form.memo || undefined,
        businessNumber: isBusiness
          ? digitsOnly(form.businessNumber) || undefined
          : undefined,
        ceo: isBusiness ? form.ceo || undefined : undefined,
        fax: isBusiness ? digitsOnly(form.fax) || undefined : undefined,
        businessType: isBusiness ? form.businessType || undefined : undefined,
        businessItem: isBusiness ? form.businessItem || undefined : undefined,
        address: form.address || undefined,
        shippingAddress: form.shippingAddress || undefined,
        contactName: isBusiness ? form.contactName || undefined : undefined,
        contactPhone: isBusiness
          ? digitsOnly(form.contactPhone) || undefined
          : undefined,
        contactPosition: isBusiness
          ? form.contactPosition || undefined
          : undefined,
        allowDuplicatePhone: !isEdit && allowDuplicatePhone ? true : undefined,
      };

      if (isEdit && editTarget) {
        return apiMutate(`/api/customers/${editTarget.id}`, "PUT", payload);
      }
      return apiMutate("/api/customers", "POST", payload);
    },
    onSuccess: () => {
      toast.success(
        isEdit ? "고객 정보가 수정되었습니다" : "고객이 등록되었습니다",
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      onSaved?.();
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        const existing = (err.details as { existing?: DuplicateInfo } | null)
          ?.existing;
        if (existing) {
          setDuplicate(existing);
          return;
        }
      }
      toast.error(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "저장 실패",
      );
    },
  });

  const handleSubmit = () => {
    saveMutation.mutate();
  };

  const handleAcceptDuplicate = () => {
    setAllowDuplicatePhone(true);
    setDuplicate(null);
    saveMutation.mutate();
  };

  return (
    <>
      <JmDrawerHeader>
        <JmDrawerTitle>
          {isEdit ? "고객 정보 수정" : "신규 고객 등록"}
        </JmDrawerTitle>
      </JmDrawerHeader>

      <JmDrawerBody className="space-y-6">
          {/* 구분 */}
          <JmFormField label="구분" required>
            <JmSegmentedControl<CustomerType>
              fullWidth
              size="md"
              options={[
                {
                  value: "INDIVIDUAL",
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <User className="size-3.5" />
                      개인
                    </span>
                  ),
                },
                {
                  value: "BUSINESS",
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <Building2 className="size-3.5" />
                      기업
                    </span>
                  ),
                },
              ]}
              value={form.type}
              onChange={(v) => update("type", v)}
            />
          </JmFormField>

          {duplicate && (
            <JmAlert
              variant="warning"
              title="동일 전화번호 고객이 이미 있습니다"
              action={
                <div className="flex gap-2">
                  <JmButton
                    size="sm"
                    variant="outline"
                    onClick={() => setDuplicate(null)}
                  >
                    수정
                  </JmButton>
                  <JmButton size="sm" onClick={handleAcceptDuplicate}>
                    그래도 등록
                  </JmButton>
                </div>
              }
            >
              {duplicate.name}
              {duplicate.phone ? ` · ${formatPhone(duplicate.phone)}` : ""}
              {duplicate.businessNumber
                ? ` · ${formatBusinessNumber(duplicate.businessNumber)}`
                : ""}
            </JmAlert>
          )}

          {/* 기본 정보 */}
          <section className="space-y-3">
            <JmSectionLabel>기본 정보</JmSectionLabel>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <JmFormField label={isBusiness ? "상호" : "이름"} required>
                <JmInput
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder={isBusiness ? "주식회사 ○○" : "홍길동"}
                />
              </JmFormField>
              <JmFormField label="연락처" required>
                <JmInput
                  inputMode="tel"
                  value={formatPhone(form.phone)}
                  onChange={(e) => update("phone", e.target.value)}
                  placeholder="010-0000-0000"
                />
              </JmFormField>
              <JmFormField label="이메일">
                <JmInput
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="example@company.com"
                />
              </JmFormField>
              {!isBusiness && (
                <JmFormField label="주소">
                  <JmInput
                    value={form.address}
                    onChange={(e) => update("address", e.target.value)}
                    placeholder="기본 주소"
                  />
                </JmFormField>
              )}
            </div>
          </section>

          {/* 사업자 정보 — BUSINESS 한정 */}
          {isBusiness && (
            <section className="space-y-3">
              <JmSectionLabel>사업자 정보</JmSectionLabel>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <JmFormField
                  label="사업자번호"
                  hint="000-00-00000 형식 (10자리)"
                >
                  <JmInput
                    inputMode="numeric"
                    value={formatBusinessNumber(form.businessNumber)}
                    onChange={(e) =>
                      update("businessNumber", e.target.value)
                    }
                    placeholder="000-00-00000"
                  />
                </JmFormField>
                <JmFormField label="대표자">
                  <JmInput
                    value={form.ceo}
                    onChange={(e) => update("ceo", e.target.value)}
                  />
                </JmFormField>
                <JmFormField label="업태">
                  <JmInput
                    value={form.businessType}
                    onChange={(e) =>
                      update("businessType", e.target.value)
                    }
                    placeholder="도소매 / 서비스 ..."
                  />
                </JmFormField>
                <JmFormField label="종목">
                  <JmInput
                    value={form.businessItem}
                    onChange={(e) =>
                      update("businessItem", e.target.value)
                    }
                    placeholder="컴퓨터 및 주변기기 ..."
                  />
                </JmFormField>
                <JmFormField label="FAX">
                  <JmInput
                    inputMode="tel"
                    value={formatPhone(form.fax)}
                    onChange={(e) => update("fax", e.target.value)}
                    placeholder="02-0000-0000"
                  />
                </JmFormField>
              </div>
            </section>
          )}

          {/* 주소 — BUSINESS 한정 (개인은 위에 단일 주소만) */}
          {isBusiness && (
            <section className="space-y-3">
              <JmSectionLabel>주소</JmSectionLabel>
              <div className="grid grid-cols-1 gap-3">
                <JmFormField label="사업장 주소">
                  <JmInput
                    value={form.address}
                    onChange={(e) => update("address", e.target.value)}
                    placeholder="등기상 주소"
                  />
                </JmFormField>
                <JmFormField
                  label="배송지"
                  hint="사업장과 다를 경우 입력 — 주문 시 자동 채움"
                >
                  <JmInput
                    value={form.shippingAddress}
                    onChange={(e) =>
                      update("shippingAddress", e.target.value)
                    }
                    placeholder="다른 배송지 (선택)"
                  />
                </JmFormField>
              </div>
            </section>
          )}

          {/* 담당자 — BUSINESS 한정 */}
          {isBusiness && (
            <section className="space-y-3">
              <JmSectionLabel>담당자</JmSectionLabel>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <JmFormField label="이름">
                  <JmInput
                    value={form.contactName}
                    onChange={(e) =>
                      update("contactName", e.target.value)
                    }
                  />
                </JmFormField>
                <JmFormField label="직책">
                  <JmInput
                    value={form.contactPosition}
                    onChange={(e) =>
                      update("contactPosition", e.target.value)
                    }
                    placeholder="과장 / 대리 ..."
                  />
                </JmFormField>
                <JmFormField label="연락처">
                  <JmInput
                    inputMode="tel"
                    value={formatPhone(form.contactPhone)}
                    onChange={(e) =>
                      update("contactPhone", e.target.value)
                    }
                    placeholder="010-0000-0000"
                  />
                </JmFormField>
              </div>
            </section>
          )}

          {/* 메모 */}
          <section className="space-y-3">
            <JmSectionLabel>메모</JmSectionLabel>
            <JmTextarea
              rows={3}
              value={form.memo}
              onChange={(e) => update("memo", e.target.value)}
              placeholder="이 고객에 대한 내부 메모"
            />
          </section>
      </JmDrawerBody>

      <JmDrawerFooter>
        <JmButton
          variant="outline"
          onClick={onClose}
          disabled={saveMutation.isPending}
        >
          취소
        </JmButton>
        <JmButton
          onClick={handleSubmit}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending && (
            <JmSpinner size="sm" tone="inverted" />
          )}
          {saveMutation.isPending
            ? "저장 중..."
            : isEdit
              ? "수정"
              : "등록"}
        </JmButton>
      </JmDrawerFooter>
    </>
  );
}
