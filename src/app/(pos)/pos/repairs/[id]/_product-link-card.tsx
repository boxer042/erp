"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Package, Search } from "lucide-react";
import { toast } from "sonner";

import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import {
  JmBadge,
  JmButton,
  JmComboboxDrawer,
  JmInput,
} from "@/jm";
import type { RepairTicketDetail } from "../_types";
import { Card } from "./_shared";

// ──── 가져온 기기 — 시리얼/검색/직접입력 ────
type DeviceMode = "SERIAL" | "CATEGORY" | "SEARCH" | "TEXT";

interface SerialItemSearchResult {
  id: string;
  code: string;
  source: "SALE" | "REPAIR";
  displayName: string | null;
  soldAt: string;
  warrantyEnds: string | null;
  product: { id: string; name: string; sku: string } | null;
  customer: { id: string; name: string; phone: string | null } | null;
}

interface ProductSearchResult {
  id: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  warrantyMonths: number | null;
}

export function ProductLinkCard({
  ticket,
  readonly,
  onChanged,
}: {
  ticket: RepairTicketDetail;
  readonly: boolean;
  onChanged: () => void;
}) {
  const initialMode: DeviceMode = ticket.serialItem
    ? "SERIAL"
    : ticket.repairProduct
      ? "SEARCH"
      : ticket.repairProductText
        ? "TEXT"
        : "SERIAL";
  const [mode, setMode] = useState<DeviceMode>(initialMode);

  const hasLink =
    !!ticket.serialItem || !!ticket.repairProduct || !!ticket.repairProductText;
  // 카테고리 모드는 등록 고객일 때만 활성 — 미등록 고객은 누르지 못함
  const categoryEnabled = !!ticket.customer;

  const update = useMutation({
    mutationFn: (data: {
      serialItemId?: string | null;
      repairProductId?: string | null;
      repairProductText?: string | null;
    }) => apiMutate(`/api/repair-tickets/${ticket.id}`, "PUT", data),
    onSuccess: () => {
      toast.success("기기 정보 저장됨");
      onChanged();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  const clearLink = () => {
    update.mutate({
      serialItemId: null,
      repairProductId: null,
      repairProductText: null,
    });
  };

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
              가져온 기기
            </span>
            {ticket.repairCategory && (
              <JmBadge variant="default" size="sm">
                {ticket.repairCategory.name}
              </JmBadge>
            )}
          </div>
          {!readonly && hasLink && (
            <button
              type="button"
              onClick={clearLink}
              disabled={update.isPending}
              className="text-[11px] font-medium text-[var(--jm-text-muted)] underline-offset-2 hover:underline"
            >
              초기화
            </button>
          )}
        </div>

        {/* 연결된 기기 표시 (있을 때만) */}
        {ticket.serialItem ? (
          <SerialDisplay item={ticket.serialItem} />
        ) : ticket.repairProduct ? (
          <SearchProductDisplay product={ticket.repairProduct} />
        ) : ticket.repairProductText ? (
          <TextDisplay text={ticket.repairProductText} />
        ) : null}

        {/* 검색/입력 영역 — 항상 표시 (readonly 가 아니면) */}
        {!readonly && (
          <div className="flex flex-col gap-3 rounded-xl border border-[var(--jm-border)] bg-[var(--jm-bg)] p-3">
            {/* 모드 토글 — 시리얼 / 카테고리 / 상품명 / 직접입력 */}
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { v: "SERIAL", label: "시리얼", enabled: true },
                  { v: "CATEGORY", label: "구매내역", enabled: categoryEnabled },
                  { v: "SEARCH", label: "상품명", enabled: true },
                  { v: "TEXT", label: "직접입력", enabled: true },
                ] as const
              ).map((b) => {
                const disabled = !b.enabled;
                return (
                  <button
                    key={b.v}
                    type="button"
                    onClick={() => !disabled && setMode(b.v)}
                    disabled={disabled}
                    title={disabled ? "등록 고객만 사용 가능" : undefined}
                    className={`flex h-9 items-center justify-center rounded-lg text-[12px] font-semibold transition-colors ${
                      mode === b.v
                        ? "bg-[var(--jm-action)] text-white"
                        : disabled
                          ? "bg-[var(--jm-surface-muted)] text-[var(--jm-text-disabled)]"
                          : "bg-[var(--jm-surface)] text-[var(--jm-text-muted)] border border-[var(--jm-border)] hover:bg-[var(--jm-surface-muted)]"
                    }`}
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>

            {mode === "SERIAL" && (
              <SerialModeForm ticketId={ticket.id} onSaved={onChanged} />
            )}
            {mode === "CATEGORY" && categoryEnabled && (
              <CategoryModeForm
                ticketId={ticket.id}
                customerId={ticket.customer!.id}
                categoryId={ticket.repairCategory?.id ?? null}
                categoryName={ticket.repairCategory?.name ?? "기타"}
                onSaved={onChanged}
              />
            )}
            {mode === "SEARCH" && (
              <SearchModeForm ticketId={ticket.id} onSaved={onChanged} />
            )}
            {mode === "TEXT" && (
              <TextModeForm
                ticketId={ticket.id}
                initialValue={ticket.repairProductText ?? ""}
                onSaved={onChanged}
              />
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// 카테고리 모드 — 등록 고객의 구매/수리 이력 + 그 카테고리 카탈로그 검색
// repairCategoryId=null (기타) 이면 전체 카탈로그 검색
function CategoryModeForm({
  ticketId,
  customerId,
  categoryId,
  categoryName,
  onSaved,
}: {
  ticketId: string;
  customerId: string;
  categoryId: string | null;
  categoryName: string;
  onSaved: () => void;
}) {
  // 등록 고객의 구매·수리 이력 (이 카테고리 내)
  const historyQuery = useQuery<
    Array<{ id: string; name: string; sku: string }>
  >({
    queryKey: ["repairs", "category-history", customerId, categoryId ?? "all"],
    queryFn: () =>
      apiGet<Array<{ id: string; name: string; sku: string }>>(
        `/api/customers/${customerId}/repair-devices${
          categoryId ? `?categoryId=${categoryId}` : ""
        }`,
      ),
    staleTime: 1000 * 60,
  });

  const [picker, setPicker] = useState(false);
  const productsQuery = useQuery<
    Array<{ id: string; name: string; sku: string; imageUrl: string | null }>
  >({
    queryKey: ["repairs", "category-catalog", categoryId ?? "all"],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (categoryId) sp.set("categoryId", categoryId);
      sp.set("excludeVariants", "true");
      return apiGet(`/api/products?${sp.toString()}`);
    },
    enabled: picker,
    staleTime: 1000 * 60 * 5,
  });

  const save = useMutation({
    mutationFn: (productId: string) =>
      apiMutate(`/api/repair-tickets/${ticketId}`, "PUT", {
        repairProductId: productId,
        repairProductText: null,
        serialItemId: null,
      }),
    onSuccess: () => {
      toast.success("기기 연결됨");
      onSaved();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  const history = historyQuery.data ?? [];
  const products = productsQuery.data ?? [];

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 px-1 text-[11px] text-[var(--jm-text-muted)]">
          <span className="rounded-full bg-[var(--jm-border)] px-2 py-0.5 font-semibold text-[var(--jm-text)]">
            {categoryName}
          </span>
          <span>구매·수리 이력 + 카탈로그 검색</span>
        </div>
        <button
          type="button"
          onClick={() => setPicker(true)}
          className="flex h-11 w-full items-center gap-2 rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 text-left text-jm-sm text-[var(--jm-text-subtle)] hover:border-[var(--jm-border-strong)] hover:bg-[var(--jm-surface-muted)]"
        >
          <Search className="size-4 text-[var(--jm-text-muted)]" />
          상품명·SKU 검색
        </button>
        {history.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--jm-text-subtle)]">
              이 손님 구매·수리 이력
            </span>
            {history.map((p) => (
              <button
                key={`h-${p.id}`}
                type="button"
                onClick={() => save.mutate(p.id)}
                disabled={save.isPending}
                className="flex items-center gap-2 rounded-lg bg-[var(--jm-surface)] px-3 py-2.5 text-left border border-[var(--jm-border)] hover:bg-[var(--jm-surface-muted)] active:bg-[var(--jm-border)] disabled:opacity-50"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="line-clamp-1 text-jm-sm font-medium text-[var(--jm-text)]">
                    {p.name}
                  </span>
                  <span className="font-mono text-jm-2xs text-[var(--jm-text-muted)]">
                    {p.sku}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <JmComboboxDrawer<{ id: string; name: string; sku: string; imageUrl: string | null }>
        open={picker}
        onOpenChange={setPicker}
        items={products}
        loading={productsQuery.isPending}
        getKey={(p) => p.id}
        title={categoryName ? `${categoryName} 카탈로그` : "상품 검색"}
        placeholder="상품명·SKU 검색"
        filterFn={(p, q) => {
          const lo = q.toLowerCase();
          return p.name.toLowerCase().includes(lo) || p.sku.toLowerCase().includes(lo);
        }}
        renderItem={(p) => (
          <div className="flex w-full items-center gap-3">
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.imageUrl}
                alt={p.name}
                className="size-9 shrink-0 rounded-md object-cover"
              />
            ) : (
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--jm-surface-muted)] text-[var(--jm-text-subtle)]">
                <Package className="size-4" />
              </div>
            )}
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="line-clamp-1 text-jm-sm font-medium text-[var(--jm-text)]">
                {p.name}
              </span>
              <span className="font-mono text-jm-2xs text-[var(--jm-text-muted)]">
                {p.sku}
              </span>
            </div>
          </div>
        )}
        onSelect={(p) => {
          save.mutate(p.id);
          setPicker(false);
        }}
      />
    </>
  );
}

// 시리얼 표시 — 우리 판매 (SALE) / 수리 라벨 (REPAIR) 구분
function SerialDisplay({
  item,
}: {
  item: NonNullable<RepairTicketDetail["serialItem"]>;
}) {
  const displayName = item.product?.name ?? item.displayName ?? "(미상)";
  const isRepairLabel = item.source === "REPAIR";
  const warrantyActive =
    item.warrantyEnds && new Date(item.warrantyEnds) > new Date();
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-[var(--jm-action)] p-3 text-white">
      <div className="flex items-center gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[var(--jm-surface)]/10">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" />
            <rect x="6" y="6" width="3" height="3" fill="currentColor" />
            <rect x="11" y="6" width="3" height="3" fill="currentColor" />
            <rect x="6" y="11" width="3" height="3" fill="currentColor" />
            <rect x="11" y="11" width="3" height="3" fill="currentColor" />
          </svg>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-mono text-[11px] font-semibold tracking-wider text-white/60">
            {item.code}
          </span>
          <span className="line-clamp-1 text-[14px] font-semibold">{displayName}</span>
        </div>
        <span className="rounded-full bg-[var(--jm-surface)]/15 px-2 py-0.5 text-[10px] font-bold">
          {isRepairLabel ? "수리 라벨" : "우리 판매"}
        </span>
      </div>
      <div className="flex flex-wrap gap-3 border-t border-white/15 pt-2 text-[11px]">
        <div>
          <span className="text-white/50">{isRepairLabel ? "접수일" : "구매일"} </span>
          <span className="font-medium">
            {format(new Date(item.soldAt), "yyyy-MM-dd")}
          </span>
        </div>
        {item.warrantyEnds && (
          <div>
            <span className="text-white/50">보증 </span>
            <span className={warrantyActive ? "text-emerald-300" : "text-rose-300"}>
              ~{format(new Date(item.warrantyEnds), "yyyy-MM-dd")}
              {warrantyActive ? " (유효)" : " (만료)"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function SearchProductDisplay({
  product,
}: {
  product: NonNullable<RepairTicketDetail["repairProduct"]>;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-[var(--jm-bg)] p-3">
      {product.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.imageUrl}
          alt={product.name}
          className="size-12 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-[var(--jm-surface)] text-[var(--jm-text-subtle)]">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path
              d="M3 6l7-4 7 4v8l-7 4-7-4V6z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="line-clamp-1 text-[14px] font-semibold text-[var(--jm-text)]">
          {product.name}
        </span>
        <span className="font-mono text-[11px] text-[var(--jm-text-muted)]">{product.sku}</span>
      </div>
      <span className="rounded-full bg-[var(--jm-border)] px-2 py-0.5 text-[10px] font-medium text-[var(--jm-text)]">
        카탈로그
      </span>
    </div>
  );
}

function TextDisplay({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-[var(--jm-bg)] p-3">
      <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-[var(--jm-surface)] text-[var(--jm-text-subtle)]">
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <path
            d="M4 5h12M4 10h12M4 15h8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <span className="line-clamp-2 flex-1 text-[14px] font-medium text-[var(--jm-text)]">
        {text}
      </span>
      <span className="rounded-full bg-[var(--jm-border)] px-2 py-0.5 text-[10px] font-medium text-[var(--jm-text)]">
        외부 기기
      </span>
    </div>
  );
}

// ──── 모드별 폼 ────
function SerialModeForm({
  ticketId,
  onSaved,
}: {
  ticketId: string;
  onSaved: () => void;
}) {
  const [code, setCode] = useState("");
  const lookup = useMutation({
    mutationFn: async () => {
      const list = await apiGet<SerialItemSearchResult[]>(
        `/api/serial-items?search=${encodeURIComponent(code.trim())}`,
      );
      const exact = list.find((i) => i.code === code.trim());
      if (!exact) throw new Error("해당 시리얼을 찾을 수 없습니다");
      await apiMutate(`/api/repair-tickets/${ticketId}`, "PUT", {
        serialItemId: exact.id,
        repairProductId: null,
        repairProductText: null,
      });
      return exact;
    },
    onSuccess: (item) => {
      toast.success(`${item.code} 연결됨`);
      onSaved();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "조회 실패"),
  });

  return (
    <div className="flex gap-2">
      <JmInput
        size="md"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="예: 250903-0001"
        className="flex-1 font-mono"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing && code.trim()) {
            lookup.mutate();
          }
        }}
      />
      <JmButton
        variant="cta"
        onClick={() => lookup.mutate()}
        disabled={!code.trim() || lookup.isPending}
      >
        {lookup.isPending ? "조회…" : "조회·연결"}
      </JmButton>
    </div>
  );
}

function SearchModeForm({
  ticketId,
  onSaved,
}: {
  ticketId: string;
  onSaved: () => void;
}) {
  const [picker, setPicker] = useState(false);
  const productsQuery = useQuery<ProductSearchResult[]>({
    queryKey: ["repairs", "device-product-catalog"],
    queryFn: () =>
      apiGet<ProductSearchResult[]>(`/api/products?excludeVariants=true`),
    enabled: picker,
    staleTime: 1000 * 60 * 5,
  });

  const link = useMutation({
    mutationFn: (productId: string) =>
      apiMutate(`/api/repair-tickets/${ticketId}`, "PUT", {
        serialItemId: null,
        repairProductId: productId,
        repairProductText: null,
      }),
    onSuccess: () => {
      toast.success("상품 연결됨");
      setPicker(false);
      onSaved();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setPicker(true)}
        className="flex h-11 w-full items-center gap-2 rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 text-left text-jm-sm text-[var(--jm-text-subtle)] hover:border-[var(--jm-border-strong)] hover:bg-[var(--jm-surface-muted)]"
      >
        <Search className="size-4 text-[var(--jm-text-muted)]" />
        상품명 또는 SKU 검색
      </button>

      <JmComboboxDrawer<ProductSearchResult>
        open={picker}
        onOpenChange={setPicker}
        items={productsQuery.data ?? []}
        loading={productsQuery.isPending}
        getKey={(p) => p.id}
        title="상품 검색"
        placeholder="상품명 또는 SKU 검색"
        filterFn={(p, q) => {
          const lo = q.toLowerCase();
          return p.name.toLowerCase().includes(lo) || p.sku.toLowerCase().includes(lo);
        }}
        renderItem={(p) => (
          <div className="flex w-full items-center gap-3">
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.imageUrl}
                alt={p.name}
                className="size-9 shrink-0 rounded-md object-cover"
              />
            ) : (
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--jm-surface-muted)] text-[var(--jm-text-subtle)]">
                <Package className="size-4" />
              </div>
            )}
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="line-clamp-1 text-jm-sm font-medium text-[var(--jm-text)]">
                {p.name}
              </span>
              <span className="font-mono text-jm-2xs text-[var(--jm-text-muted)]">
                {p.sku}
              </span>
            </div>
          </div>
        )}
        onSelect={(p) => link.mutate(p.id)}
      />
    </>
  );
}

function TextModeForm({
  ticketId,
  initialValue,
  onSaved,
}: {
  ticketId: string;
  initialValue: string;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const save = useMutation({
    mutationFn: (next: string) =>
      apiMutate(`/api/repair-tickets/${ticketId}`, "PUT", {
        serialItemId: null,
        repairProductId: null,
        repairProductText: next.trim() || null,
      }),
    onSuccess: () => onSaved(),
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  const handleBlur = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== initialValue.trim()) {
      save.mutate(value);
    }
  };

  return (
    <JmInput
      size="md"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      placeholder="예: Sony A7M4 Black"
    />
  );
}
