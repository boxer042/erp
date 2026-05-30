"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiGet, ApiError } from "@/lib/api-client";
import { genClientId } from "@/lib/utils";
import {
  JmButton,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmSelect,
  JmSpinner,
} from "@/jm";
import type { CartItem } from "@/components/pos/sessions-context";
import type { PickedVariant, VariantDetail } from "./_types";

/**
 * 옵션 선택 — 상품에 등록된 ProductOption 들을 슬롯별 dropdown 으로 노출.
 * 옵션 없는 상품은 null 반환 (영역 생략).
 * 카드 레이아웃용: 카트 라인 카드 하단 영역으로 렌더.
 */
export function OrderItemOptionsCard({
  productId,
  selectedIds,
  onChange,
}: {
  productId: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  type OptionValue = {
    id: string;
    label: string;
    addPrice: string;
    mappedProduct: { id: string; name: string; sku: string } | null;
    mappedVariant: { id: string; name: string; sku: string } | null;
  };
  type Option = {
    id: string;
    name: string;
    required: boolean;
    values: OptionValue[];
  };
  const optionsQuery = useQuery({
    queryKey: ["product-options", productId],
    queryFn: () => apiGet<Option[]>(`/api/products/${productId}/options`),
    enabled: !!productId,
  });
  const options = optionsQuery.data ?? [];
  if (options.length === 0) return null;

  return (
    <div className="mt-2.5 flex flex-col gap-1.5 rounded-lg bg-[var(--jm-surface-muted)] px-3 py-2">
      {options.map((opt) => {
        const selectedForOpt =
          selectedIds.find((id) => opt.values.some((v) => v.id === id)) ?? "";
        return (
          <div key={opt.id} className="flex items-center gap-2 text-jm-xs">
            <span className="w-[80px] shrink-0 text-[var(--jm-text-muted)]">
              {opt.name}
              {opt.required && <span className="text-[var(--jm-danger-fg)]"> *</span>}
            </span>
            <div className="flex-1">
              <JmSelect
                size="sm"
                value={selectedForOpt}
                onChange={(newId) => {
                  const otherIds = selectedIds.filter(
                    (id) => !opt.values.some((v) => v.id === id),
                  );
                  onChange(newId ? [...otherIds, newId] : otherIds);
                }}
                placeholder="— 선택 안 함 —"
                options={[
                  { value: "", label: "— 선택 안 함 —" },
                  ...opt.values.map((v) => {
                    const addPrice = Number(v.addPrice);
                    const suffix = v.mappedProduct
                      ? ` → ${v.mappedProduct.name}`
                      : v.mappedVariant
                        ? ` → ${v.mappedVariant.name}`
                        : "";
                    const priceLabel =
                      addPrice > 0
                        ? ` (+₩${addPrice.toLocaleString("ko-KR")})`
                        : "";
                    return {
                      value: v.id,
                      label: `${v.label}${priceLabel}${suffix}`,
                    };
                  }),
                ]}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface VariantPickDialogProps {
  canonicalId: string;
  canonicalName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (variant: PickedVariant) => void;
}

/**
 * 대표(canonical) 상품에서 변형 선택 모달.
 * POS 의 VariantSelectSheet 와 같은 의도 — 같은 이름·다른 SKU 가 평탄하게 나와 헤깔리는 문제 해결.
 */
export function VariantPickDialog({
  canonicalId,
  canonicalName,
  open,
  onOpenChange,
  onPick,
}: VariantPickDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const productQuery = useQuery<{
    id: string;
    name: string;
    variants: VariantDetail[];
  }>({
    queryKey: ["product-detail-variants", canonicalId],
    queryFn: () =>
      apiGet<{ id: string; name: string; variants: VariantDetail[] }>(
        `/api/products/${canonicalId}`,
      ),
    enabled: open,
  });

  const variants = productQuery.data?.variants ?? [];

  const confirm = () => {
    const picked = variants.find((v) => v.id === selectedId);
    if (!picked) return;
    onPick({
      id: picked.id,
      name: picked.name,
      sku: picked.sku,
      sellingPrice: picked.sellingPrice,
      imageUrl: picked.imageUrl ?? null,
    });
  };

  return (
    <JmDialog open={open} onOpenChange={onOpenChange}>
      <JmDialogContent size="xl">
        <JmDialogHeader>
          <JmDialogTitle>변형 선택 — {canonicalName}</JmDialogTitle>
        </JmDialogHeader>
        <JmDialogBody>
          {productQuery.isPending ? (
            <div className="flex items-center justify-center py-10 text-jm-sm text-[var(--jm-text-subtle)]">
              <JmSpinner size="sm" />
              <span className="ml-2">불러오는 중…</span>
            </div>
          ) : variants.length === 0 ? (
            <div className="rounded-2xl bg-[var(--jm-surface-muted)] py-10 text-center text-jm-sm text-[var(--jm-text-subtle)]">
              등록된 변형이 없습니다 — 상품 페이지에서 추가하세요
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {variants.map((v) => {
                const active = selectedId === v.id;
                const price = parseFloat(v.sellingPrice) || 0;
                const priceGross = Math.round(price * 1.1);
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedId(v.id)}
                    onDoubleClick={() => {
                      setSelectedId(v.id);
                      onPick({
                        id: v.id,
                        name: v.name,
                        sku: v.sku,
                        sellingPrice: v.sellingPrice,
                        imageUrl: v.imageUrl ?? null,
                      });
                    }}
                    className={`flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors ${
                      active
                        ? "border-[var(--jm-action)] bg-[var(--jm-bg)]"
                        : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)]"
                    }`}
                  >
                    {v.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={v.imageUrl}
                        alt={v.name}
                        className="size-14 shrink-0 rounded-xl bg-[var(--jm-surface-muted)] object-cover"
                      />
                    ) : (
                      <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-[var(--jm-surface-muted)] text-[var(--jm-text-subtle)]">
                        <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
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
                      <span className="line-clamp-1 text-jm-sm font-semibold text-[var(--jm-text)]">
                        {v.name}
                      </span>
                      <span className="font-mono text-jm-xs text-[var(--jm-text-muted)]">
                        {v.sku}
                      </span>
                      {v.variableComponents && v.variableComponents.length > 0 && (
                        <span className="mt-0.5 line-clamp-2 text-jm-xs text-[var(--jm-text-muted)]">
                          {v.variableComponents
                            .map((c) => `${c.slotLabel}: ${c.componentName}`)
                            .join(" · ")}
                        </span>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-jm-3xs uppercase tracking-wider text-[var(--jm-text-subtle)]">
                        VAT 포함
                      </div>
                      <div className="text-jm-sm font-semibold tabular-nums text-[var(--jm-text)]">
                        ₩{priceGross.toLocaleString("ko-KR")}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </JmDialogBody>
        <JmDialogFooter>
          <JmButton variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </JmButton>
          <JmButton onClick={confirm} disabled={!selectedId}>
            선택
          </JmButton>
        </JmDialogFooter>
      </JmDialogContent>
    </JmDialog>
  );
}

// ─── 견적서 불러오기 다이얼로그 ─────────────────────────────────────────
//   POS `_quotation-load-sheet.tsx` 와 같은 변환 로직.
//   POS sessions context 대신 onLoad(items[]) 콜백으로 상위 setItems 호출.

interface QuotationListItem {
  id: string;
  quotationNo: string;
  status:
    | "DRAFT"
    | "SENT"
    | "ACCEPTED"
    | "REJECTED"
    | "EXPIRED"
    | "CONVERTED";
  issueDate: string;
  totalAmount: string;
  title: string | null;
  _count: { items: number };
}

interface QuotationDetailItem {
  id: string;
  productId: string | null;
  name: string;
  quantity: string;
  listPrice: string;
  discountAmount: string;
  unitPrice: string;
  product: {
    id: string;
    name: string;
    sku: string;
    taxType: "TAXABLE" | "TAX_FREE";
    zeroRateEligible: boolean;
    isBulk: boolean;
    unitOfMeasure: string;
    productType:
      | "FINISHED"
      | "PARTS"
      | "SET"
      | "ASSEMBLED"
      | "OPTION_PARENT";
    media: Array<{ url: string }>;
  } | null;
}

interface QuotationDetail {
  id: string;
  quotationNo: string;
  items: QuotationDetailItem[];
}

const QUOTATION_STATUS_LABEL: Record<QuotationListItem["status"], string> = {
  DRAFT: "임시",
  SENT: "발송",
  ACCEPTED: "승인",
  REJECTED: "거절",
  EXPIRED: "만료",
  CONVERTED: "전환됨",
};

interface QuotationLoadDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 등록 고객만 견적서 매칭 — 미선택 시 다이얼로그 자체를 띄우지 않게 부모가 가드 */
  customerId: string;
  /** 카트 비어있지 않을 때 confirm 으로 교체 경고 */
  cartItemCount: number;
  /** 선택한 견적서의 변환된 CartItem[] — 상위가 setItems(items) 로 카트 교체 */
  onLoad: (items: CartItem[]) => void;
}

/**
 * 견적서 → ERP 신규주문 카트 로드 다이얼로그.
 *  - 고객의 SALES 견적서 목록 조회
 *  - 선택 시 카트 라인을 일괄 교체 (replace)
 *  - free-text 라인(productId 없음) 스킵
 *  - OPTION_PARENT 는 그대로 추가 (결제 직전 SWAP 옵션 선택 강제)
 *  - 할인은 quotation discountAmount 정액 문자열로 적용
 */
export function QuotationLoadDialog({
  open,
  onOpenChange,
  customerId,
  cartItemCount,
  onLoad,
}: QuotationLoadDialogProps) {
  const [pickingId, setPickingId] = useState<string | null>(null);
  const listQuery = useQuery<QuotationListItem[]>({
    queryKey: ["orders-new", "quotation-load", customerId],
    queryFn: () =>
      apiGet<QuotationListItem[]>(
        `/api/quotations?type=SALES&customerId=${encodeURIComponent(customerId)}`,
      ),
    enabled: open && !!customerId,
    staleTime: 1000 * 30,
  });
  const list = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  const handlePick = async (id: string) => {
    if (cartItemCount > 0) {
      const ok = window.confirm(
        "현재 카트의 라인이 모두 교체됩니다. 계속할까요?",
      );
      if (!ok) return;
    }
    setPickingId(id);
    try {
      const detail = await apiGet<QuotationDetail>(`/api/quotations/${id}`);
      const items: CartItem[] = [];
      let skipped = 0;
      for (const it of detail.items) {
        if (!it.productId || !it.product) {
          skipped++;
          continue;
        }
        const qtyNum = Number(it.quantity);
        const unitPriceNum = Number(it.unitPrice);
        const listPriceNum = Number(it.listPrice);
        const discount =
          Number(it.discountAmount) > 0
            ? String(Math.round(Number(it.discountAmount)))
            : "0";
        items.push({
          cartItemId: genClientId(),
          productId: it.product.id,
          itemType: "product",
          name: it.product.name,
          sku: it.product.sku,
          imageUrl: it.product.media[0]?.url ?? null,
          unitPrice: Math.round(unitPriceNum),
          listPrice: listPriceNum > 0 ? Math.round(listPriceNum) : undefined,
          quantity: qtyNum,
          discount,
          taxType: it.product.taxType,
          zeroRateEligible: it.product.zeroRateEligible,
          isBulk: it.product.isBulk,
          unitOfMeasure: it.product.unitOfMeasure,
          isOptionParent: it.product.productType === "OPTION_PARENT",
        });
      }
      if (items.length === 0) {
        toast.error("이 견적서엔 카트로 옮길 수 있는 상품 라인이 없습니다");
        setPickingId(null);
        return;
      }
      onLoad(items);
      toast.success(
        `${detail.quotationNo} — ${items.length}개 라인 카트로 불러옴` +
          (skipped > 0 ? ` (자유입력 ${skipped}개 스킵)` : ""),
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "견적서 불러오기 실패",
      );
    } finally {
      setPickingId(null);
    }
  };

  return (
    <JmDialog open={open} onOpenChange={onOpenChange}>
      <JmDialogContent size="xl">
        <JmDialogHeader>
          <JmDialogTitle>견적서 불러오기</JmDialogTitle>
        </JmDialogHeader>
        <JmDialogBody>
          {listQuery.isPending ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-2xl bg-[var(--jm-surface-muted)]"
                />
              ))}
            </div>
          ) : list.length === 0 ? (
            <div className="rounded-2xl bg-[var(--jm-surface-muted)] py-10 text-center text-jm-sm text-[var(--jm-text-subtle)]">
              이 고객으로 발행된 견적서가 없습니다
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {list.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  disabled={pickingId !== null}
                  onClick={() => handlePick(q.id)}
                  className="flex flex-col gap-1 rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] px-4 py-3 text-left transition-colors hover:border-[var(--jm-border-strong)] disabled:opacity-50"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-jm-sm font-semibold text-[var(--jm-text)]">
                        {q.quotationNo}
                      </span>
                      <span className="rounded-full bg-[var(--jm-surface-muted)] px-2 py-0.5 text-jm-3xs font-medium text-[var(--jm-text-muted)]">
                        {QUOTATION_STATUS_LABEL[q.status]}
                      </span>
                    </div>
                    <span className="tabular-nums text-jm-md font-bold text-[var(--jm-text)]">
                      ₩{Math.round(Number(q.totalAmount)).toLocaleString("ko-KR")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-jm-xs text-[var(--jm-text-muted)]">
                    <span>
                      {format(new Date(q.issueDate), "yyyy년 M월 d일", {
                        locale: ko,
                      })}
                      {" · "}
                      {q._count.items}개 라인
                    </span>
                    {pickingId === q.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                  </div>
                  {q.title ? (
                    <span className="line-clamp-1 text-jm-xs text-[var(--jm-text-subtle)]">
                      {q.title}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </JmDialogBody>
        <JmDialogFooter>
          <JmButton variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </JmButton>
        </JmDialogFooter>
      </JmDialogContent>
    </JmDialog>
  );
}
