"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, apiMutate } from "@/lib/api-client";
import { BottomSheet } from "./_components/bottom-sheet";
import { formatPhone, digitsOnly } from "@/lib/utils";

interface Customer {
  id: string;
  name: string;
  phone: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 등록 후 콜백 — 새 고객 객체 전달 */
  onCreated: (c: Customer) => void;
  /** 검색에서 입력된 텍스트 — 이름 또는 전화로 자동 채움 */
  defaultText?: string;
}

/**
 * 고객 빠른 등록 — 이름 + 전화 두 필드만. 어드민 안 거치고 즉석 등록.
 * 검색에서 못 찾았을 때 LinkCustomerSheet 의 "+ 새로 등록" → 이 시트.
 */
export function QuickCustomerSheet(props: Props) {
  if (!props.open) return null;
  return <Body {...props} />;
}

function Body({ onOpenChange, onCreated, defaultText = "" }: Props) {
  const qc = useQueryClient();
  // defaultText 가 숫자가 많으면 전화로, 아니면 이름으로 자동 분류
  const looksLikePhone = digitsOnly(defaultText).length >= 6;
  const [name, setName] = useState(looksLikePhone ? "" : defaultText);
  const [phone, setPhone] = useState(
    looksLikePhone ? formatPhone(defaultText) : "",
  );

  const create = useMutation<Customer, Error>({
    mutationFn: () =>
      apiMutate<Customer>("/api/customers", "POST", {
        name: name.trim(),
        phone: digitsOnly(phone),
      }),
    onSuccess: (c) => {
      toast.success(`${c.name} 등록`);
      qc.invalidateQueries({ queryKey: ["pos-v2", "customers"] });
      onCreated(c);
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "등록 실패"),
  });

  const valid =
    name.trim().length > 0 && digitsOnly(phone).length >= 6;

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
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-zinc-900 text-[16px] font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-50"
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
        <Field label="이름">
          <input
            type="text"
            autoFocus={!looksLikePhone}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="홍길동"
            className="h-12 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-[15px] outline-none focus:border-zinc-400 focus:bg-white"
          />
        </Field>
        <Field label="전화">
          <input
            type="tel"
            inputMode="tel"
            autoFocus={looksLikePhone}
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            placeholder="010-1234-5678"
            className="h-12 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-[15px] tabular-nums outline-none focus:border-zinc-400 focus:bg-white"
          />
        </Field>
        <p className="text-[12px] text-zinc-500">
          추가 정보(사업자번호·이메일·주소·메모)는 등록 후 어드민에서 수정 가능합니다.
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
      <span className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      {children}
    </div>
  );
}
