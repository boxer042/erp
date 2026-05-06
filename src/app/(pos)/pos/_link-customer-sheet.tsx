"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { MobileCombobox } from "./_components/mobile-combobox";

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
  onSelect: (c: Customer) => void;
  /** "+ 새 고객 등록" 누를 때 */
  onCreate?: (defaultName: string) => void;
}

/**
 * 고객 검색 시트 — MobileCombobox 사용 예시.
 * 풀스크린 모달 + 검색 + 인라인 새로 등록.
 */
export function LinkCustomerSheet({
  open,
  onOpenChange,
  onSelect,
  onCreate,
}: Props) {
  const [query, setQuery] = useState("");

  const customersQuery = useQuery<Customer[]>({
    queryKey: ["pos-v2", "customers", query],
    queryFn: () =>
      apiGet<Customer[]>(
        `/api/customers?search=${encodeURIComponent(query)}&limit=30`,
      ),
    enabled: open,
    staleTime: 1000 * 30,
  });

  return (
    <MobileCombobox<Customer>
      open={open}
      onOpenChange={onOpenChange}
      title="고객 검색"
      placeholder="이름·전화·사업자번호"
      items={customersQuery.data ?? []}
      loading={customersQuery.isPending}
      onQueryChange={setQuery}
      getKey={(c) => c.id}
      renderItem={(c) => (
        <>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[16px] font-bold text-zinc-700">
            {c.name.charAt(0)}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="line-clamp-1 text-[15px] font-semibold text-zinc-900">
              {c.name}
            </span>
            <span className="font-mono text-[12px] text-zinc-500">
              {c.phone}
            </span>
          </div>
        </>
      )}
      onSelect={onSelect}
      onCreate={onCreate}
      createLabel="새 고객으로 등록"
      emptyText="일치하는 고객 없음"
    />
  );
}
