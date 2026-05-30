"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Search } from "lucide-react";
import { format } from "date-fns";

import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatComma, parseComma } from "@/lib/utils";
import {
  JmBadge,
  JmButton,
  JmCard,
  JmCardContent,
  JmCardHeader,
  JmCardTitle,
  JmCheckbox,
  JmFormField,
  JmIconButton,
  JmInput,
  JmSearchInput,
} from "@/jm";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";

import {
  totalUsedItemCost,
  usedItemName,
  type UsedItemListRow,
} from "./_types";
import { UsedItemImageUpload } from "./used-item-image-upload";

interface PartRow {
  componentId: string;
  name: string;
  unitCost: number; // 추정 (FIFO 실제값은 제출 시)
  quantity: string;
}

export interface UsedItemBuildValue {
  displayName: string;
  productId: string | null;
  spec: string;
  builtAt: string;
  laborCost: string;
  issueSerial: boolean;
  warrantyMonths: number;
  imageUrls: string[];
  memo: string;
  sourceUsedItemIds: string[];
  parts: PartRow[];
}

export const EMPTY_BUILD: UsedItemBuildValue = {
  displayName: "",
  productId: null,
  spec: "",
  builtAt: format(new Date(), "yyyy-MM-dd"),
  laborCost: "0",
  issueSerial: false,
  warrantyMonths: 0,
  imageUrls: [],
  memo: "",
  sourceUsedItemIds: [],
  parts: [],
};

interface Props {
  value: UsedItemBuildValue;
  onChange: (next: UsedItemBuildValue) => void;
}

export function UsedItemBuildForm({ value, onChange }: Props) {
  const [matchCatalog, setMatchCatalog] = useState(!!value.productId);
  const [usedSearch, setUsedSearch] = useState("");

  const patch = (p: Partial<UsedItemBuildValue>) => onChange({ ...value, ...p });

  // 재료 후보 — IN_STOCK 중고 (비용 포함)
  const usedItemsQuery = useQuery<UsedItemListRow[]>({
    queryKey: queryKeys.usedItems.list({ for: "build-source" }),
    queryFn: () =>
      apiGet<UsedItemListRow[]>(
        "/api/used-items?status=IN_STOCK&includeCosts=true&limit=500",
      ),
    staleTime: 1000 * 60,
  });

  // 신품 부품 후보
  const productsQuery = useQuery<ProductOption[]>({
    queryKey: queryKeys.products.list({ for: "build-part" }),
    queryFn: () => apiGet<ProductOption[]>("/api/products?excludeVariants=true"),
    staleTime: 1000 * 60 * 5,
  });

  const usedItems = usedItemsQuery.data ?? [];
  const selectedIds = new Set(value.sourceUsedItemIds);

  const filteredUsed = useMemo(() => {
    const q = usedSearch.trim().toLowerCase();
    return usedItems.filter((u) => {
      if (selectedIds.has(u.id)) return false; // 선택된 건 위 섹션에 표시
      if (!q) return true;
      return (
        usedItemName(u).toLowerCase().includes(q) ||
        u.internalCode.toLowerCase().includes(q)
      );
    });
  }, [usedItems, usedSearch, value.sourceUsedItemIds]);

  const selectedUsed = usedItems.filter((u) => selectedIds.has(u.id));

  // 누적원가 미리보기 = 중고 재료합 + 신품 부품(추정) + 공임
  const estCost = useMemo(() => {
    const usedSum = selectedUsed.reduce(
      (s, u) => s + totalUsedItemCost(u),
      0,
    );
    const partSum = value.parts.reduce(
      (s, p) => s + p.unitCost * (parseFloat(p.quantity) || 0),
      0,
    );
    const labor = parseFloat(parseComma(value.laborCost)) || 0;
    return usedSum + partSum + labor;
  }, [selectedUsed, value.parts, value.laborCost]);

  const toggleUsed = (id: string) => {
    patch({
      sourceUsedItemIds: selectedIds.has(id)
        ? value.sourceUsedItemIds.filter((x) => x !== id)
        : [...value.sourceUsedItemIds, id],
    });
  };

  const addPart = () =>
    patch({
      parts: [...value.parts, { componentId: "", name: "", unitCost: 0, quantity: "1" }],
    });
  const updatePart = (idx: number, p: Partial<PartRow>) =>
    patch({ parts: value.parts.map((r, i) => (i === idx ? { ...r, ...p } : r)) });
  const removePart = (idx: number) =>
    patch({ parts: value.parts.filter((_, i) => i !== idx) });

  const isMatched = matchCatalog && !!value.productId;

  return (
    <div className="space-y-4">
      {/* 재료 ① 중고 단품 */}
      <JmCard>
        <JmCardHeader>
          <JmCardTitle>재료 ① 중고 단품 (필수)</JmCardTitle>
        </JmCardHeader>
        <JmCardContent className="space-y-3">
          {/* 선택된 재료 */}
          {selectedUsed.length > 0 && (
            <div className="space-y-1.5">
              {selectedUsed.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-[var(--jm-text)]">
                      {usedItemName(u)}
                    </span>
                    <span className="ml-2 font-[family-name:var(--jm-font-mono)] text-jm-xs text-[var(--jm-text-muted)]">
                      {u.internalCode}
                    </span>
                  </div>
                  <span className="shrink-0 text-jm-sm tabular-nums">
                    ₩{Math.round(totalUsedItemCost(u)).toLocaleString("ko-KR")}
                  </span>
                  <JmIconButton size="sm" aria-label="제거" onClick={() => toggleUsed(u.id)}>
                    <Trash2 className="size-3.5" />
                  </JmIconButton>
                </div>
              ))}
            </div>
          )}

          {/* 후보 검색 + 선택 */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--jm-text-muted)]" />
            <JmInput
              value={usedSearch}
              onChange={(e) => setUsedSearch(e.target.value)}
              placeholder="중고 재료 검색 (품명·코드)"
              className="pl-9"
            />
          </div>
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {usedItemsQuery.isPending ? (
              <p className="py-4 text-center text-jm-sm text-[var(--jm-text-muted)]">불러오는 중…</p>
            ) : filteredUsed.length === 0 ? (
              <p className="py-4 text-center text-jm-sm text-[var(--jm-text-muted)]">
                선택 가능한 중고가 없습니다
              </p>
            ) : (
              filteredUsed.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleUsed(u.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 py-2 text-left hover:bg-[var(--jm-surface-muted)]"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <JmCheckbox checked={false} onCheckedChange={() => toggleUsed(u.id)} />
                    <span className="truncate font-medium text-[var(--jm-text)]">
                      {usedItemName(u)}
                    </span>
                    {!u.productId && (
                      <JmBadge variant="info" size="sm" shape="square">비카탈로그</JmBadge>
                    )}
                  </div>
                  <span className="shrink-0 text-jm-sm tabular-nums text-[var(--jm-text-muted)]">
                    ₩{Math.round(totalUsedItemCost(u)).toLocaleString("ko-KR")}
                  </span>
                </button>
              ))
            )}
          </div>
        </JmCardContent>
      </JmCard>

      {/* 재료 ② 신품 부품 (선택) */}
      <JmCard>
        <JmCardHeader>
          <JmCardTitle>재료 ② 신품 부품 (선택)</JmCardTitle>
        </JmCardHeader>
        <JmCardContent className="space-y-2">
          {value.parts.map((part, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <ProductCombobox
                  products={productsQuery.data ?? []}
                  value={part.componentId}
                  onChange={(p) =>
                    updatePart(idx, {
                      componentId: p.id || "",
                      name: p.name,
                      unitCost: p.unitCost ? parseFloat(p.unitCost) : 0,
                    })
                  }
                  filterType="component"
                  placeholder="신품 부품 선택..."
                />
              </div>
              <div className="flex w-28 items-center gap-1">
                <JmInput
                  type="text"
                  inputMode="decimal"
                  value={part.quantity}
                  onChange={(e) => updatePart(idx, { quantity: e.target.value })}
                  className="text-right"
                />
                <span className="shrink-0 text-jm-xs text-[var(--jm-text-muted)]">개</span>
              </div>
              <JmIconButton size="sm" aria-label="제거" onClick={() => removePart(idx)}>
                <Trash2 className="size-3.5" />
              </JmIconButton>
            </div>
          ))}
          <JmButton variant="outline" size="sm" onClick={addPart} className="w-full">
            <Plus className="size-3.5" />
            신품 부품 추가
          </JmButton>
        </JmCardContent>
      </JmCard>

      {/* 결과물 */}
      <JmCard>
        <JmCardHeader>
          <JmCardTitle>결과물</JmCardTitle>
        </JmCardHeader>
        <JmCardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <JmFormField
              label="품명"
              required
              hint={isMatched ? "카탈로그 매칭 — 카탈로그 상품명 자동 사용" : undefined}
            >
              <JmInput
                value={value.displayName}
                onChange={(e) => patch({ displayName: e.target.value })}
                placeholder="예: 리퍼비시 고압분무기"
                readOnly={isMatched}
                className={isMatched ? "opacity-70" : undefined}
              />
            </JmFormField>
            <JmFormField label="규격">
              <JmInput
                value={value.spec}
                onChange={(e) => patch({ spec: e.target.value })}
                placeholder="(선택)"
              />
            </JmFormField>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-jm-sm">
            <JmCheckbox
              checked={matchCatalog}
              onCheckedChange={(c) => {
                setMatchCatalog(c === true);
                if (c !== true) patch({ productId: null });
              }}
            />
            <span>매장 카탈로그 상품과 매칭</span>
          </label>
          {matchCatalog && (
            <ProductCombobox
              products={productsQuery.data ?? []}
              value={value.productId ?? ""}
              onChange={(p) =>
                patch({
                  productId: p.id || null,
                  displayName: p.id ? p.name : value.displayName,
                })
              }
              placeholder="카탈로그에서 상품 선택..."
            />
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <JmFormField label="조립일" required>
              <JmInput
                type="date"
                value={value.builtAt}
                onChange={(e) => patch({ builtAt: e.target.value })}
              />
            </JmFormField>
            <JmFormField label="공임">
              <div className="flex items-center gap-2">
                <JmInput
                  type="text"
                  inputMode="numeric"
                  value={formatComma(value.laborCost)}
                  onChange={(e) => patch({ laborCost: parseComma(e.target.value) })}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <span className="shrink-0 text-jm-sm text-[var(--jm-text-muted)]">원</span>
              </div>
            </JmFormField>
          </div>

          {/* 시리얼 발번 */}
          <label className="flex cursor-pointer items-center gap-2 text-jm-sm">
            <JmCheckbox
              checked={value.issueSerial}
              onCheckedChange={(c) => patch({ issueSerial: c === true })}
            />
            <span>시리얼 라벨 발번</span>
            <span className="text-jm-xs text-[var(--jm-text-muted)]">— 단품 판매 예정이면</span>
          </label>
          {value.issueSerial && (
            <JmFormField label="보증 기간 (개월)" hint="0 = 보증 없음">
              <div className="flex items-center gap-2">
                <JmInput
                  type="number"
                  min={0}
                  max={120}
                  value={String(value.warrantyMonths)}
                  onChange={(e) =>
                    patch({
                      warrantyMonths: Math.max(0, Math.min(120, parseInt(e.target.value, 10) || 0)),
                    })
                  }
                  className="w-32"
                />
                <span className="text-jm-sm text-[var(--jm-text-muted)]">개월</span>
              </div>
            </JmFormField>
          )}

          <JmFormField label="사진">
            <UsedItemImageUpload
              value={value.imageUrls}
              onChange={(urls) => patch({ imageUrls: urls })}
            />
          </JmFormField>
        </JmCardContent>
      </JmCard>

      {/* 누적원가 미리보기 */}
      <div className="flex items-baseline justify-between rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] px-4 py-3">
        <span className="text-jm-sm text-[var(--jm-text-muted)]">
          예상 누적원가 (중고 재료 + 신품 부품 + 공임)
        </span>
        <span className="text-jm-lg font-bold tabular-nums">
          ₩{Math.round(estCost).toLocaleString("ko-KR")}
        </span>
      </div>
    </div>
  );
}
