"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Minus, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import {
  JmBadge,
  JmButton,
  JmCard,
  JmComboboxDrawer,
  JmIconButton,
} from "@/jm";
import { fmtKRWInc } from "./_helpers";
import type { RepairPart } from "./_types";
import { PriceInputDialog } from "@/app/(pos)/pos/_components/price-input-dialog";

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
}

interface RecommendedPart {
  productId: string;
  name: string;
  sku: string;
  sellingPrice: string;
  occurrenceCount: number;
}

/**
 * 부속 섹션 — JmCard + JmComboboxDrawer 기반.
 * 모바일: 가상 키보드 가려짐 없는 풀-시트 검색, 큰 +- 버튼.
 * 진단이 선택되어 있으면 헤더 위에 자주 사용된 부속 추천 칩 노출.
 */
export function PartsSection({
  ticketId,
  parts,
  readonly,
  onChanged,
  diagnosisTemplateId,
}: {
  ticketId: string;
  parts: RepairPart[];
  readonly: boolean;
  onChanged: () => void;
  diagnosisTemplateId?: string | null;
}) {
  const [picker, setPicker] = useState(false);

  const productsQuery = useQuery({
    queryKey: ["repairs", "products"],
    queryFn: () =>
      apiGet<ProductOption[]>(`/api/products?isBulk=all&excludeVariants=true`),
    enabled: picker,
    staleTime: 1000 * 60 * 5,
  });

  // 진단 기반 부속 추천 — 진단이 선택되어 있을 때만 fetch
  const recommendationsQuery = useQuery<{ parts: RecommendedPart[] }>({
    queryKey: ["repairs", "diagnosis-recommendations", diagnosisTemplateId],
    queryFn: () =>
      apiGet<{ parts: RecommendedPart[]; labors: unknown[] }>(
        `/api/repair-diagnosis-templates/${diagnosisTemplateId}/recommendations`,
      ),
    enabled: !!diagnosisTemplateId && !readonly,
    staleTime: 1000 * 60,
  });

  const addMutation = useMutation({
    mutationFn: (p: { id: string; name: string; sellingPrice: string | number }) =>
      apiMutate(`/api/repair-tickets/${ticketId}/parts`, "POST", {
        productId: p.id,
        quantity: 1,
        unitPrice:
          typeof p.sellingPrice === "string"
            ? parseFloat(p.sellingPrice) || 0
            : p.sellingPrice,
      }),
    onSuccess: (_, p) => {
      toast.success(`${p.name} 추가`);
      setPicker(false);
      onChanged();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "추가 실패"),
  });

  const recommendations = recommendationsQuery.data?.parts ?? [];
  // 이미 추가된 부속은 추천에서 제외
  const addedProductIds = new Set(parts.map((p) => p.productId));
  const filteredRecs = recommendations.filter(
    (r) => !addedProductIds.has(r.productId),
  );

  const usedTotal = parts
    .filter((p) => p.status === "USED")
    .reduce((s, p) => s + Number(p.totalPrice), 0);
  const lostTotal = parts
    .filter((p) => p.status === "LOST")
    .reduce((s, p) => s + Number(p.totalPrice), 0);

  return (
    <>
      <JmCard className="overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-[var(--jm-border)] px-4 py-3 sm:px-5">
          <div className="flex items-baseline gap-2">
            <span className="text-jm-base font-semibold text-[var(--jm-text)]">사용 부속</span>
            <span className="text-jm-2xs text-[var(--jm-text-subtle)]">
              {parts.length === 0 ? "—" : `${parts.length}건`}
            </span>
          </div>
          {!readonly && (
            <JmButton
              variant="outline"
              size="sm"
              onClick={() => setPicker(true)}
            >
              <Plus className="size-3.5" />
              부속
            </JmButton>
          )}
        </div>

        {/* 진단 기반 추천 — 자주 함께 쓰인 부속 칩 노출. 이미 추가된 것은 자동 제외 */}
        {!readonly && filteredRecs.length > 0 && (
          <div className="flex flex-col gap-1.5 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-4 py-3 sm:px-5">
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-[var(--jm-accent-fg)]" />
              <span className="text-jm-2xs font-semibold text-[var(--jm-accent-fg)]">
                이 진단에 자주 쓰인 부속
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {filteredRecs.map((r) => (
                <button
                  key={r.productId}
                  type="button"
                  disabled={addMutation.isPending}
                  onClick={() =>
                    addMutation.mutate({
                      id: r.productId,
                      name: r.name,
                      sellingPrice: r.sellingPrice,
                    })
                  }
                  className="flex items-center gap-1.5 rounded-full border border-[var(--jm-accent-bg)] bg-[var(--jm-surface)] px-3 py-1.5 text-jm-2xs transition-colors hover:bg-[var(--jm-accent-bg)] disabled:opacity-50"
                >
                  <Plus className="size-3 text-[var(--jm-accent-fg)]" />
                  <span className="line-clamp-1 max-w-[140px] text-[var(--jm-text)]">
                    {r.name}
                  </span>
                  <span className="text-[var(--jm-text-subtle)]">
                    {r.occurrenceCount}회
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 행 리스트 */}
        <div className="flex flex-col">
          {parts.length === 0 ? (
            <div className="px-4 py-8 text-center text-jm-sm text-[var(--jm-text-subtle)] sm:px-5">
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
          <div className="flex items-center justify-end gap-4 border-t border-[var(--jm-border)] px-4 py-3 text-jm-sm sm:px-5">
            {lostTotal > 0 && (
              <span className="text-[var(--jm-danger-fg)]">손실 −{fmtKRWInc(lostTotal)}</span>
            )}
            <span className="font-semibold tabular-nums text-[var(--jm-text)]">
              청구 {fmtKRWInc(usedTotal)}
            </span>
          </div>
        )}
      </JmCard>

      {/* 부속 검색 — JmComboboxDrawer (모바일 가상 키보드 안 가림) */}
      <JmComboboxDrawer<ProductOption>
        open={picker}
        onOpenChange={setPicker}
        items={productsQuery.data ?? []}
        loading={productsQuery.isPending}
        getKey={(p) => p.id}
        title="부속 선택"
        placeholder="상품명 또는 SKU 검색"
        filterFn={(p, q) =>
          p.name.toLowerCase().includes(q.toLowerCase()) ||
          p.sku.toLowerCase().includes(q.toLowerCase())
        }
        renderItem={(p) => (
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <span className="line-clamp-1 text-jm-sm font-medium text-[var(--jm-text)]">
                {p.name}
              </span>
              <span className="font-mono text-jm-2xs text-[var(--jm-text-subtle)]">
                {p.sku}
              </span>
            </div>
            <span className="shrink-0 text-jm-sm font-semibold tabular-nums text-[var(--jm-text)]">
              {fmtKRWInc(parseFloat(p.sellingPrice) || 0)}
            </span>
          </div>
        )}
        onSelect={(p) => addMutation.mutate(p)}
      />
    </>
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
      className={`flex flex-col gap-3 border-b border-[var(--jm-border)] px-4 py-3 last:border-b-0 sm:px-5 ${
        isLost ? "opacity-60" : ""
      }`}
    >
      {/* 1행: 이름/SKU + USED/LOST + (LOST 면) 청구 토글 + 삭제 */}
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span
              className={`line-clamp-1 text-jm-sm font-semibold text-[var(--jm-text)] ${
                isLost && !part.billLost ? "line-through" : ""
              }`}
            >
              {part.product.name}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              {/* LOST 일 때만 — 청구 토글 (회사 손실 vs 고객 청구) */}
              {!readonly && isLost && (
                <button
                  type="button"
                  onClick={() => update.mutate({ billLost: !part.billLost })}
                  title={
                    part.billLost
                      ? "고객 청구 — 합계 포함 (해제 시 회사 손실)"
                      : "회사 손실 — 합계 미포함 (클릭 시 청구)"
                  }
                  className="appearance-none border-0 bg-transparent p-0"
                >
                  <JmBadge
                    variant={part.billLost ? "warning" : "default"}
                    size="sm"
                  >
                    {part.billLost ? "청구" : "손실"}
                  </JmBadge>
                </button>
              )}
              {!readonly && (
                <button
                  type="button"
                  onClick={() => update.mutate({ status: isLost ? "USED" : "LOST" })}
                  className="appearance-none border-0 bg-transparent p-0"
                >
                  <JmBadge
                    variant={isLost ? "danger" : "success"}
                    size="sm"
                  >
                    {isLost ? "LOST" : "USED"}
                  </JmBadge>
                </button>
              )}
            </div>
          </div>
          <span className="font-mono text-jm-2xs text-[var(--jm-text-subtle)]">
            {part.product.sku}
          </span>
        </div>
        {!readonly && (
          <JmIconButton
            size="sm"
            variant="ghost"
            onClick={() => del.mutate()}
            disabled={del.isPending}
            aria-label="삭제"
          >
            <Trash2 className="size-4" />
          </JmIconButton>
        )}
      </div>

      {/* 2행: 단가 (클릭 가능, 좌측) + 수량 ± (중앙) + 라인 합계 (우측) */}
      <div className="flex items-center justify-between gap-2">
        {/* 단가 — 클릭 시 가격 다이얼로그 */}
        <button
          type="button"
          onClick={() => !readonly && setPriceOpen(true)}
          disabled={readonly}
          className="flex flex-col items-start rounded-lg px-2 py-1 text-left hover:bg-[var(--jm-bg)] active:bg-[var(--jm-surface-muted)] disabled:hover:bg-transparent"
        >
          <span className="text-[10px] uppercase tracking-wider text-[var(--jm-text-subtle)]">
            단가
          </span>
          <span className="text-jm-base font-semibold tabular-nums text-[var(--jm-text)]">
            {fmtKRWInc(part.unitPrice)}
          </span>
        </button>

        {/* 수량 ± */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={readonly || Number(qty) <= 1}
            onClick={() => setQtyAndCommit(Number(qty) - 1)}
            className="flex size-9 items-center justify-center rounded-full bg-[var(--jm-surface-muted)] text-[var(--jm-text)] hover:bg-[var(--jm-border)] disabled:opacity-30"
            aria-label="수량 감소"
          >
            <Minus className="size-4" />
          </button>
          <input
            type="text"
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
            onBlur={() => setQtyAndCommit(parseInt(qty, 10) || 1)}
            disabled={readonly}
            className="h-9 w-12 rounded-md bg-transparent text-center text-jm-base font-semibold tabular-nums text-[var(--jm-text)] outline-none focus:bg-[var(--jm-bg)]"
          />
          <button
            type="button"
            disabled={readonly}
            onClick={() => setQtyAndCommit(Number(qty) + 1)}
            className="flex size-9 items-center justify-center rounded-full bg-[var(--jm-surface-muted)] text-[var(--jm-text)] hover:bg-[var(--jm-border)] disabled:opacity-30"
            aria-label="수량 증가"
          >
            <Plus className="size-4" />
          </button>
        </div>

        {/* 라인 합계 */}
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-[var(--jm-text-subtle)]">
            합계
          </div>
          <div className="text-jm-base font-bold tabular-nums text-[var(--jm-text)]">
            {fmtKRWInc(part.totalPrice)}
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
