"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ExternalLink, Pencil } from "lucide-react";
import { toast } from "sonner";

import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { focusCaretEnd } from "@/jm/lib/focus";
import { formatComma, parseComma } from "@/lib/utils";
import {
  JmBadge,
  JmButton,
  JmCard,
  JmCardContent,
  JmCardHeader,
  JmCardTitle,
  JmCheckbox,
  JmInput,
  JmSkeleton,
} from "@/jm";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

type ShippingHistoryRow = {
  incomingItemId: string;
  incomingId: string;
  incomingNo: string;
  incomingDate: string;
  quantity: string;
  perUnitShipping: number;
  isTaxable: boolean;
  source: "ITEM" | "ALLOCATED" | "DEDUCTED" | "ZERO";
  itemShippingCost: string | null;
  itemShippingIsTaxable: boolean;
};

const SOURCE_LABEL: Record<
  ShippingHistoryRow["source"],
  { label: string; variant: "info" | "default" | "warning" }
> = {
  ITEM: { label: "품목 직접 입력", variant: "info" },
  ALLOCATED: { label: "전표 분배", variant: "default" },
  DEDUCTED: { label: "거래처 차감", variant: "warning" },
  ZERO: { label: "0원(미입력)", variant: "default" },
};

function fmtKrw(n: number) {
  return Math.round(n).toLocaleString("ko-KR");
}

export function ShippingHistoryCard({
  supplierProductId,
  productNameById,
  readOnly,
  limit,
  hideTitle,
}: {
  supplierProductId: string;
  productNameById?: (id: string) => string | undefined;
  readOnly?: boolean;
  limit?: number;
  hideTitle?: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["supplier-products", supplierProductId, "shipping-history"];
  const historyQuery = useQuery({
    queryKey,
    queryFn: () =>
      apiGet<ShippingHistoryRow[]>(
        `/api/supplier-products/${supplierProductId}/shipping-history`,
      ),
  });
  const allRows = historyQuery.data ?? [];
  const rows = typeof limit === "number" ? allRows.slice(0, limit) : allRows;
  // 평균은 거래처 차감(DEDUCTED) 행을 제외 — 우리 부담 운임이 아니므로
  // 0원 행(정기 배송 0원)은 분모에 포함 (실제 우리 부담 0원이 발생한 회차)
  const avgRows = allRows.filter((r) => r.source !== "DEDUCTED");
  const avgPerUnit =
    avgRows.length > 0
      ? avgRows.reduce((s, r) => s + r.perUnitShipping, 0) / avgRows.length
      : 0;

  const editMutation = useMutation({
    mutationFn: (vars: {
      incomingItemId: string;
      itemShippingCost: string | null;
      itemShippingIsTaxable: boolean;
    }) =>
      apiMutate(`/api/incoming-items/${vars.incomingItemId}/shipping`, "PATCH", {
        itemShippingCost: vars.itemShippingCost,
        itemShippingIsTaxable: vars.itemShippingIsTaxable,
      }),
    onSuccess: () => {
      toast.success("배송비가 수정되었습니다");
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: queryKeys.supplierProducts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.incoming.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "수정 실패"),
  });

  return (
    <JmCard>
      {!hideTitle && (
        <JmCardHeader>
          <JmCardTitle className="flex items-center justify-between">
            <span>
              입고 배송비 이력
              {productNameById ? null : (
                <span className="ml-1 text-jm-xs font-normal text-[var(--jm-text-muted)]">
                  (최근 {rows.length}건)
                </span>
              )}
            </span>
            {readOnly && allRows.length > 0 && (
              <span className="text-jm-xs font-normal text-[var(--jm-text-muted)]">
                평균 ₩{fmtKrw(avgPerUnit)}/개 (VAT포함, 계산기 반영)
              </span>
            )}
          </JmCardTitle>
        </JmCardHeader>
      )}
      <JmCardContent className="px-0 pb-0">
        {historyQuery.isPending ? (
          <div className="px-6 pb-4 space-y-2">
            <JmSkeleton className="h-6 w-full" />
            <JmSkeleton className="h-6 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-jm-sm text-[var(--jm-text-muted)] py-6 text-center">
            확정된 입고 이력이 없습니다
          </p>
        ) : (
          <table className="w-full text-jm-sm">
            <thead>
              <tr className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-jm-xs border-b border-[var(--jm-border)]">
                <th className="py-2 px-3 text-left font-medium">입고일</th>
                <th className="py-2 px-3 text-left font-medium">전표</th>
                <th className="py-2 px-3 text-right font-medium">수량</th>
                <th className="py-2 px-3 text-right font-medium">개당 배송비</th>
                <th className="py-2 px-3 text-left font-medium">출처</th>
                <th className="py-2 px-3 text-left font-medium">VAT</th>
                {!readOnly && <th className="py-2 w-12"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const src = SOURCE_LABEL[r.source];
                return (
                  <tr
                    key={r.incomingItemId}
                    className="border-b border-[var(--jm-border)] hover:bg-[var(--jm-surface-muted)]/50"
                  >
                    <td className="px-3 py-2.5 text-[var(--jm-text-muted)] tabular-nums">
                      {format(new Date(r.incomingDate), "yyyy-MM-dd", { locale: ko })}
                    </td>
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/inventory/incoming?incomingId=${r.incomingId}`}
                        className="inline-flex items-center gap-1 text-[var(--jm-text)] hover:text-[var(--jm-info-fg)] underline-offset-4 hover:underline"
                      >
                        {r.incomingNo}
                        <ExternalLink className="size-3" />
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--jm-text-muted)]">
                      {parseFloat(r.quantity).toLocaleString("ko-KR")}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--jm-text)]">
                      ₩{fmtKrw(r.perUnitShipping)}
                    </td>
                    <td className="px-3 py-2.5">
                      <JmBadge
                        variant={src.variant}
                        size="sm"
                        shape="square"
                        className="font-normal"
                      >
                        {src.label}
                      </JmBadge>
                    </td>
                    <td className="px-3 py-2.5 text-[var(--jm-text-muted)] text-jm-xs">
                      {r.isTaxable ? "과세" : "면세"}
                    </td>
                    {!readOnly && (
                      <td className="py-2 text-center">
                        <InlineShippingEditor
                          row={r}
                          onSave={(payload) => editMutation.mutate(payload)}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </JmCardContent>
    </JmCard>
  );
}

function InlineShippingEditor({
  row,
  onSave,
}: {
  row: ShippingHistoryRow;
  onSave: (payload: {
    incomingItemId: string;
    itemShippingCost: string | null;
    itemShippingIsTaxable: boolean;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(
    row.itemShippingCost ? String(parseFloat(row.itemShippingCost)) : "",
  );
  const [taxable, setTaxable] = useState(row.itemShippingIsTaxable);
  const handleOpen = (next: boolean) => {
    if (next) {
      setDraft(row.itemShippingCost ? String(parseFloat(row.itemShippingCost)) : "");
      setTaxable(row.itemShippingIsTaxable);
    }
    setOpen(next);
  };

  const apply = () => {
    onSave({
      incomingItemId: row.incomingItemId,
      itemShippingCost: draft.trim() === "" ? null : draft.trim(),
      itemShippingIsTaxable: taxable,
    });
    setOpen(false);
  };
  const clear = () => {
    onSave({
      incomingItemId: row.incomingItemId,
      itemShippingCost: null,
      itemShippingIsTaxable: true,
    });
    setOpen(false);
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpen}>
      <PopoverPrimitive.Trigger className="p-1 rounded text-[var(--jm-text-muted)] hover:text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)] transition-colors">
        <Pencil className="size-3.5" />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner align="end" sideOffset={4} className="isolate z-50">
          <PopoverPrimitive.Popup
            data-jm-scope
            className="z-50 w-72 rounded-xl bg-[var(--jm-surface)] p-3 ring-1 ring-[var(--jm-border)] shadow-[var(--jm-shadow-lg)] outline-none font-[family-name:var(--jm-font-sans)]"
          >
            <div className="space-y-3">
              <div className="text-jm-sm font-medium text-[var(--jm-text)]">
                이 품목 배송비 수정
              </div>
              <div className="text-jm-xs text-[var(--jm-text-muted)]">
                값을 입력하면 그 품목 한정 운임으로 적용. 비우면 전표 분배로 되돌립니다.
              </div>
              <div className="space-y-1.5">
                <label className="text-jm-xs text-[var(--jm-text-muted)]">
                  운임 (₩, VAT포함)
                </label>
                <JmInput
                  size="sm"
                  type="text"
                  inputMode="numeric"
                  value={formatComma(draft)}
                  onChange={(e) => setDraft(parseComma(e.target.value))}
                  onFocus={focusCaretEnd}
                  placeholder="비우면 분배 적용"
                />
              </div>
              <label className="flex items-center gap-2 text-jm-sm cursor-pointer select-none text-[var(--jm-text)]">
                <JmCheckbox
                  checked={taxable}
                  onCheckedChange={(c) => setTaxable(c === true)}
                />
                <span>과세</span>
              </label>
              <div className="flex justify-between gap-2 pt-1">
                <JmButton variant="ghost" size="sm" onClick={clear}>
                  비우기 (분배)
                </JmButton>
                <JmButton variant="cta" size="sm" onClick={apply}>
                  적용
                </JmButton>
              </div>
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
