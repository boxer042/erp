"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { fmtKRW } from "./_helpers";
import type { RepairPart } from "./_types";
import { PriceInputDialog } from "@/app/(pos)/pos/_components/price-input-dialog";

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
}

/**
 * 부속 섹션 — 인라인 추가/수정/삭제, USED/LOST 토글.
 * shadcn 0개. 모바일: 큰 +- 버튼, 빠른 검색 드롭다운.
 */
export function PartsSection({
  ticketId,
  parts,
  readonly,
  onChanged,
}: {
  ticketId: string;
  parts: RepairPart[];
  readonly: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");

  const productsQuery = useQuery({
    queryKey: ["repair-v2", "products"],
    queryFn: () =>
      apiGet<ProductOption[]>(`/api/products?isBulk=all&excludeVariants=true`),
    enabled: adding,
    staleTime: 1000 * 60 * 5,
  });

  const filtered = (() => {
    const list = productsQuery.data ?? [];
    if (!search.trim()) return list.slice(0, 12);
    const q = search.trim().toLowerCase();
    return list
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
      )
      .slice(0, 12);
  })();

  const addMutation = useMutation({
    mutationFn: (p: ProductOption) =>
      apiMutate(`/api/repair-tickets/${ticketId}/parts`, "POST", {
        productId: p.id,
        quantity: 1,
        unitPrice: parseFloat(p.sellingPrice) || 0,
      }),
    onSuccess: (_, p) => {
      toast.success(`${p.name} 추가`);
      setSearch("");
      setAdding(false);
      onChanged();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "추가 실패"),
  });

  const usedTotal = parts
    .filter((p) => p.status === "USED")
    .reduce((s, p) => s + Number(p.totalPrice), 0);
  const lostTotal = parts
    .filter((p) => p.status === "LOST")
    .reduce((s, p) => s + Number(p.totalPrice), 0);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 sm:px-5">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold text-zinc-900">사용 부속</span>
          <span className="text-[12px] text-zinc-400">
            {parts.length === 0 ? "—" : `${parts.length}건`}
          </span>
        </div>
        {!readonly && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex h-9 items-center gap-1 rounded-full bg-zinc-100 px-4 text-[13px] font-semibold text-zinc-700 hover:bg-zinc-200"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M7 3v8M3 7h8"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            부속
          </button>
        )}
      </div>

      {/* 추가 영역 — 인라인 검색 + 결과 리스트 */}
      {adding && !readonly && (
        <div className="border-b border-zinc-100 bg-zinc-50 p-3 sm:p-4">
          <div className="flex gap-2">
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="상품명 또는 SKU 검색"
              className="h-11 flex-1 rounded-xl border border-zinc-200 bg-white px-4 text-[14px] outline-none focus:border-zinc-400"
            />
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setSearch("");
              }}
              className="rounded-xl px-4 text-[13px] text-zinc-500 hover:bg-zinc-100"
            >
              취소
            </button>
          </div>
          <div className="mt-2 flex flex-col gap-1">
            {productsQuery.isPending ? (
              <div className="px-3 py-2 text-[13px] text-zinc-400">
                불러오는 중…
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl bg-white px-3 py-3 text-[13px] text-zinc-500">
                결과 없음
              </div>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={addMutation.isPending}
                  onClick={() => addMutation.mutate(p)}
                  className="flex items-center justify-between rounded-xl bg-white px-3 py-2.5 text-left hover:bg-zinc-50 active:bg-zinc-100 disabled:opacity-50"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="line-clamp-1 text-[14px] font-medium text-zinc-900">
                      {p.name}
                    </span>
                    <span className="font-mono text-[11px] text-zinc-400">
                      {p.sku}
                    </span>
                  </div>
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums text-zinc-700">
                    {fmtKRW(parseFloat(p.sellingPrice) || 0)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* 행 리스트 */}
      <div className="flex flex-col">
        {parts.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-zinc-400 sm:px-5">
            추가된 부속이 없습니다
          </div>
        ) : (
          parts.map((p) => (
            <PartRow
              key={p.id}
              ticketId={ticketId}
              part={p}
              readonly={readonly}
              onChanged={onChanged}
            />
          ))
        )}
      </div>

      {/* 합계 */}
      {parts.length > 0 && (
        <div className="flex items-center justify-end gap-4 border-t border-zinc-100 px-4 py-3 text-[13px] sm:px-5">
          {lostTotal > 0 && (
            <span className="text-rose-600">손실 −{fmtKRW(lostTotal)}</span>
          )}
          <span className="font-semibold tabular-nums text-zinc-900">
            청구 {fmtKRW(usedTotal)}
          </span>
        </div>
      )}
    </div>
  );
}

function PartRow({
  ticketId,
  part,
  readonly,
  onChanged,
}: {
  ticketId: string;
  part: RepairPart;
  readonly: boolean;
  onChanged: () => void;
}) {
  const [qty, setQty] = useState(String(Math.round(Number(part.quantity))));
  const [priceOpen, setPriceOpen] = useState(false);

  const update = useMutation({
    mutationFn: (data: {
      quantity?: number;
      unitPrice?: number;
      status?: "USED" | "LOST";
      billLost?: boolean;
    }) =>
      apiMutate(
        `/api/repair-tickets/${ticketId}/parts/${part.id}`,
        "PATCH",
        data,
      ),
    onSuccess: () => onChanged(),
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "수정 실패"),
  });

  const del = useMutation({
    mutationFn: () =>
      apiMutate(`/api/repair-tickets/${ticketId}/parts/${part.id}`, "DELETE"),
    onSuccess: () => {
      toast.success("삭제됨");
      onChanged();
    },
  });

  const isLost = part.status === "LOST";

  const setQtyAndCommit = (next: number) => {
    const n = Math.max(1, Math.round(next));
    setQty(String(n));
    if (n !== Number(part.quantity)) update.mutate({ quantity: n });
  };

  return (
    <div
      className={`flex flex-col gap-3 border-b border-zinc-50 px-4 py-3 last:border-b-0 sm:px-5 ${
        isLost ? "opacity-60" : ""
      }`}
    >
      {/* 1행: 이름/SKU + USED/LOST + (LOST 면) 청구 토글 + 삭제 */}
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span
              className={`line-clamp-1 text-[14px] font-semibold text-zinc-900 ${
                isLost && !part.billLost ? "line-through" : ""
              }`}
            >
              {part.product.name}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              {/* LOST 일 때만 — 청구 토글 (회사 손실 vs 손님 청구) */}
              {!readonly && isLost && (
                <button
                  type="button"
                  onClick={() => update.mutate({ billLost: !part.billLost })}
                  className={`h-5 shrink-0 rounded-full px-2 text-[10px] font-bold ${
                    part.billLost
                      ? "bg-amber-100 text-amber-800"
                      : "bg-zinc-100 text-zinc-500"
                  }`}
                  title={
                    part.billLost
                      ? "손님 청구 — 합계 포함 (해제 시 회사 손실)"
                      : "회사 손실 — 합계 미포함 (클릭 시 청구)"
                  }
                >
                  {part.billLost ? "청구" : "손실"}
                </button>
              )}
              {!readonly && (
                <button
                  type="button"
                  onClick={() => update.mutate({ status: isLost ? "USED" : "LOST" })}
                  className={`h-5 shrink-0 rounded-full px-2 text-[10px] font-bold ${
                    isLost
                      ? "bg-rose-100 text-rose-700"
                      : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {isLost ? "LOST" : "USED"}
                </button>
              )}
            </div>
          </div>
          <span className="font-mono text-[11px] text-zinc-400">
            {part.product.sku}
          </span>
        </div>
        {!readonly && (
          <button
            type="button"
            onClick={() => del.mutate()}
            disabled={del.isPending}
            className="shrink-0 text-zinc-300 hover:text-rose-600"
            aria-label="삭제"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path
                d="M5 6h10M8 6V4h4v2M7 6v10h6V6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      {/* 2행: 단가 (클릭 가능, 좌측) + 수량 ± (중앙) + 라인 합계 (우측) — 카트 라인 row 와 동일 */}
      <div className="flex items-center justify-between gap-2">
        {/* 단가 — 클릭 시 가격 다이얼로그 */}
        <button
          type="button"
          onClick={() => !readonly && setPriceOpen(true)}
          disabled={readonly}
          className="flex flex-col items-start rounded-lg px-2 py-1 text-left hover:bg-zinc-50 active:bg-zinc-100 disabled:hover:bg-transparent"
        >
          <span className="text-[10px] uppercase tracking-wider text-zinc-400">
            단가
          </span>
          <span className="text-[15px] font-semibold tabular-nums text-zinc-900">
            {fmtKRW(part.unitPrice)}
          </span>
        </button>

        {/* 수량 ± */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={readonly || Number(qty) <= 1}
            onClick={() => setQtyAndCommit(Number(qty) - 1)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-[18px] font-semibold text-zinc-700 hover:bg-zinc-200 disabled:opacity-30"
          >
            −
          </button>
          <input
            type="text"
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
            onBlur={() => setQtyAndCommit(parseInt(qty, 10) || 1)}
            disabled={readonly}
            className="h-9 w-12 rounded-md text-center text-[15px] font-semibold tabular-nums outline-none focus:bg-zinc-50"
          />
          <button
            type="button"
            disabled={readonly}
            onClick={() => setQtyAndCommit(Number(qty) + 1)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-[18px] font-semibold text-zinc-700 hover:bg-zinc-200 disabled:opacity-30"
          >
            +
          </button>
        </div>

        {/* 라인 합계 */}
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-zinc-400">
            합계
          </div>
          <div className="text-[15px] font-bold tabular-nums text-zinc-900">
            {fmtKRW(part.totalPrice)}
          </div>
        </div>
      </div>

      {/* 가격 다이얼로그 — 단가 클릭 */}
      <PriceInputDialog
        open={priceOpen}
        onOpenChange={setPriceOpen}
        title={part.product.name}
        initialNet={Number(part.unitPrice) || 0}
        taxType="TAXABLE"
        onSubmit={(net) => update.mutate({ unitPrice: net })}
      />
    </div>
  );
}
