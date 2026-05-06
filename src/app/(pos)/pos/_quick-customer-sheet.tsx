"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, apiMutate } from "@/lib/api-client";
import { BottomSheet } from "./_components/bottom-sheet";
import { formatPhone, digitsOnly, formatBusinessNumber } from "@/lib/utils";

interface Customer {
  id: string;
  name: string;
  phone: string;
  type?: "INDIVIDUAL" | "BUSINESS";
  businessNumber?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 등록 후 콜백 — 새 고객 객체 전달 */
  onCreated: (c: Customer) => void;
  /** 검색에서 입력된 텍스트 — 이름 또는 전화로 자동 채움 */
  defaultText?: string;
}

type CustomerType = "INDIVIDUAL" | "BUSINESS";

/**
 * 사업체 키워드 감지 — name 으로 type 자동 추정.
 * 사용자는 토글로 override 가능.
 */
const BUSINESS_KEYWORDS = [
  // 법인 형태
  "(주)", "(유)", "(합)", "㈜",
  "주식회사", "유한회사", "합자회사", "합명회사",
  "유한책임회사", "법인", "재단", "사단",
  // 일반 사업체
  "회사", "기업", "상사", "상회", "상점", "상가",
  "공업사", "공방", "공장", "물산", "산업", "유통",
  // 업종
  "농기계", "농업기계", "건설", "엔지니어링", "테크", "TEC",
  // 금융/공공
  "은행", "농협", "수협", "신협", "축협", "새마을금고", "조합",
  "보험", "증권", "투자", "캐피탈", "저축", "대부",
  // 의료/공익/교육
  "병원", "의원", "약국", "한의원", "치과", "재활원",
  "교회", "성당", "사찰", "절", "선교회",
  "학교", "학원", "유치원", "어린이집",
  // 외국 형태
  "Inc", "Inc.", "Co.", "Ltd", "Ltd.", "LLC", "Corp", "Corp.", "GmbH",
];

function detectBusinessType(name: string): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return BUSINESS_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * 고객 빠른 등록 — 개인/기업 토글 + 자동 감지.
 * 검색에서 못 찾았을 때 LinkCustomerSheet 의 "+ 새로 등록" → 이 시트.
 *
 * 자동 감지: 이름에 "(주)", "주식회사", "상사" 등 키워드 → BUSINESS 자동 설정.
 * 수동 토글로 override 가능.
 */
export function QuickCustomerSheet(props: Props) {
  if (!props.open) return null;
  return <Body {...props} />;
}

function Body({ onOpenChange, onCreated, defaultText = "" }: Props) {
  const qc = useQueryClient();
  const looksLikePhone = digitsOnly(defaultText).length >= 6;
  const [name, setName] = useState(looksLikePhone ? "" : defaultText);
  const [phone, setPhone] = useState(
    looksLikePhone ? formatPhone(defaultText) : "",
  );
  const [type, setType] = useState<CustomerType>(
    detectBusinessType(looksLikePhone ? "" : defaultText) ? "BUSINESS" : "INDIVIDUAL",
  );
  const [businessNumber, setBusinessNumber] = useState("");
  /** 사용자가 토글을 직접 만지면 자동 감지 중단 */
  const [autoTypeLocked, setAutoTypeLocked] = useState(false);

  // 이름 변경 시 자동 감지 (사용자가 토글 직접 안 만졌을 때만)
  useEffect(() => {
    if (autoTypeLocked) return;
    setType(detectBusinessType(name) ? "BUSINESS" : "INDIVIDUAL");
  }, [name, autoTypeLocked]);

  const isBusiness = type === "BUSINESS";

  const buildPayload = (allowDuplicate = false) => ({
    type,
    name: name.trim(),
    phone: digitsOnly(phone),
    ...(isBusiness && businessNumber
      ? { businessNumber: digitsOnly(businessNumber) }
      : {}),
    ...(allowDuplicate ? { allowDuplicatePhone: true } : {}),
  });

  const create = useMutation<Customer, Error>({
    mutationFn: async () => {
      try {
        return await apiMutate<Customer>("/api/customers", "POST", buildPayload());
      } catch (err) {
        // 409 + existing → 사용자에게 선택지 제공
        if (err instanceof ApiError && err.status === 409) {
          const existing = (err.details as { existing?: Customer })?.existing;
          if (existing) {
            const typeLbl = existing.type === "BUSINESS" ? " (기업)" : " (개인)";
            const useExisting = window.confirm(
              `같은 전화번호로 이미 등록된 고객이 있습니다:\n\n  ${existing.name}${typeLbl}\n  ${formatPhone(existing.phone)}\n\n[확인] 기존 고객 사용 (권장)\n[취소] 동명이인으로 새로 등록`,
            );
            if (useExisting) {
              return existing;
            }
            // 우회 등록 재시도
            return await apiMutate<Customer>(
              "/api/customers",
              "POST",
              buildPayload(true),
            );
          }
        }
        throw err;
      }
    },
    onSuccess: (c) => {
      const typeLabel =
        c.type === "BUSINESS" || isBusiness ? " (기업)" : " (개인)";
      toast.success(`${c.name}${typeLabel} 등록`);
      qc.invalidateQueries({ queryKey: ["pos-v2", "customers"] });
      onCreated(c);
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "등록 실패"),
  });

  const valid = name.trim().length > 0 && digitsOnly(phone).length >= 6;

  return (
    <BottomSheet
      open
      onOpenChange={onOpenChange}
      title="고객 빠른 등록"
      footer={
        <button
          type="button"
          onClick={() => create.mutate()}
          disabled={!valid || create.isPending}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--jm-action)] text-[16px] font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-50"
        >
          {create.isPending && (
            <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          )}
          등록
        </button>
      }
    >
      <div className="flex flex-col gap-5 pt-2">
        {/* 타입 토글 — 자동 감지된 경우 amber 힌트 */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
            구분
            {!autoTypeLocked && type === "BUSINESS" && (
              <span className="ml-2 rounded-full bg-[var(--jm-warning-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--jm-warning-fg)]">
                자동 감지
              </span>
            )}
          </span>
          <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[var(--jm-surface-muted)] p-1">
            {(["INDIVIDUAL", "BUSINESS"] as const).map((t) => {
              const active = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setType(t);
                    setAutoTypeLocked(true);
                  }}
                  className={`h-11 rounded-lg text-[14px] font-semibold transition-colors ${
                    active
                      ? "bg-[var(--jm-surface)] text-[var(--jm-text)] shadow-sm"
                      : "text-[var(--jm-text-muted)]"
                  }`}
                >
                  {t === "INDIVIDUAL" ? "개인" : "기업/사업자"}
                </button>
              );
            })}
          </div>
        </div>

        <Field label={isBusiness ? "상호" : "이름"}>
          <input
            type="text"
            autoFocus={!looksLikePhone}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isBusiness ? "(주)대한기계" : "홍길동"}
            className="h-12 w-full rounded-xl border border-[var(--jm-border)] bg-[var(--jm-bg)] px-4 text-[15px] outline-none focus:border-[var(--jm-border-strong)] focus:bg-[var(--jm-surface)]"
          />
        </Field>
        <Field label={isBusiness ? "대표 전화" : "전화"}>
          <input
            type="tel"
            inputMode="tel"
            autoFocus={looksLikePhone}
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            placeholder="010-1234-5678"
            className="h-12 w-full rounded-xl border border-[var(--jm-border)] bg-[var(--jm-bg)] px-4 text-[15px] tabular-nums outline-none focus:border-[var(--jm-border-strong)] focus:bg-[var(--jm-surface)]"
          />
        </Field>

        {/* 기업이면 사업자번호 1개만 추가 (선택) */}
        {isBusiness && (
          <Field label="사업자번호 (선택)">
            <input
              type="text"
              inputMode="numeric"
              value={formatBusinessNumber(businessNumber)}
              onChange={(e) => setBusinessNumber(digitsOnly(e.target.value))}
              placeholder="000-00-00000"
              className={`h-12 w-full rounded-xl border bg-[var(--jm-bg)] px-4 text-[15px] tabular-nums outline-none focus:bg-[var(--jm-surface)] ${
                businessNumber.length > 0 && businessNumber.length !== 10
                  ? "border-[var(--jm-warning-bg)] focus:border-amber-500"
                  : "border-[var(--jm-border)] focus:border-[var(--jm-border-strong)]"
              }`}
            />
            {/* 즉시 형식 검증 안내 */}
            {businessNumber.length > 0 && businessNumber.length < 10 && (
              <p className="mt-1.5 text-[11px] text-[var(--jm-warning-fg)]">
                {10 - businessNumber.length}자리 더 입력 (10자리 필요)
              </p>
            )}
            {businessNumber.length === 10 && (
              <p className="mt-1.5 text-[11px] text-[var(--jm-success-fg)]">
                형식 OK ({formatBusinessNumber(businessNumber)})
              </p>
            )}
            {businessNumber.length > 10 && (
              <p className="mt-1.5 text-[11px] text-[var(--jm-danger-fg)]">
                10자리 초과 — 앞 10자리만 사용됩니다
              </p>
            )}
          </Field>
        )}

        <p className="text-[12px] text-[var(--jm-text-muted)]">
          {isBusiness
            ? "대표자·업태·종목·담당자·배송지는 어드민 /customers 에서 추가 입력 가능."
            : "이메일·주소·메모는 어드민 /customers 에서 추가 입력 가능."}
        </p>
      </div>
    </BottomSheet>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
        {label}
      </span>
      {children}
    </div>
  );
}
