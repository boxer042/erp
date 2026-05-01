"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pencil, ExternalLink, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { formatComma, parseComma } from "@/lib/utils";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";
import Link from "next/link";

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

const SOURCE_LABEL: Record<ShippingHistoryRow["source"], { label: string; tone: "primary" | "muted" | "warn" }> = {
  ITEM: { label: "품목 직접 입력", tone: "primary" },
  ALLOCATED: { label: "전표 분배", tone: "muted" },
  DEDUCTED: { label: "거래처 차감", tone: "warn" },
  ZERO: { label: "0원(미입력)", tone: "muted" },
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
      apiGet<ShippingHistoryRow[]>(`/api/supplier-products/${supplierProductId}/shipping-history`),
  });
  const allRows = historyQuery.data ?? [];
  const rows = typeof limit === "number" ? allRows.slice(0, limit) : allRows;
  // 평균은 거래처 차감(DEDUCTED) 행을 제외 — 우리 부담 운임이 아니므로
  // 0원 행(정기 배송 0원)은 분모에 포함 (실제 우리 부담 0원이 발생한 회차)
  const avgRows = allRows.filter((r) => r.source !== "DEDUCTED");
  const avgPerUnit = avgRows.length > 0
    ? avgRows.reduce((s, r) => s + r.perUnitShipping, 0) / avgRows.length
    : 0;

  const editMutation = useMutation({
    mutationFn: (vars: { incomingItemId: string; itemShippingCost: string | null; itemShippingIsTaxable: boolean }) =>
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
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "수정 실패"),
  });

  return (
    <Card className="bg-card border-border">
      {!hideTitle && (
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
            <span>
              입고 배송비 이력
              {productNameById ? null : <span className="ml-1 text-[11px] text-muted-foreground/70">(최근 {rows.length}건)</span>}
            </span>
            {readOnly && allRows.length > 0 && (
              <span className="text-[11px] font-normal text-muted-foreground">
                평균 ₩{fmtKrw(avgPerUnit)}/개 (VAT포함, 계산기 반영)
              </span>
            )}
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className="px-0 pb-0">
        {historyQuery.isPending ? (
          <div className="px-6 pb-4 space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">확정된 입고 이력이 없습니다</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-muted text-muted-foreground text-xs border-b border-border">
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
                  <tr key={r.incomingItemId} className="border-b border-border hover:bg-muted/50">
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                      {format(new Date(r.incomingDate), "yyyy-MM-dd", { locale: ko })}
                    </td>
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/inventory/incoming?incomingId=${r.incomingId}`}
                        className="inline-flex items-center gap-1 text-foreground hover:text-primary underline-offset-4 hover:underline"
                      >
                        {r.incomingNo}
                        <ExternalLink className="size-3" />
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {parseFloat(r.quantity).toLocaleString("ko-KR")}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      ₩{fmtKrw(r.perUnitShipping)}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant={src.tone === "primary" ? "default" : src.tone === "warn" ? "destructive" : "secondary"}
                        className="text-[10px] font-normal"
                      >
                        {src.label}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">
                      {r.isTaxable ? "과세" : "면세"}
                    </td>
                    {!readOnly && (
                      <td className="py-2 text-center">
                        <InlineShippingEditor row={r} onSave={(payload) => editMutation.mutate(payload)} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function InlineShippingEditor({
  row,
  onSave,
}: {
  row: ShippingHistoryRow;
  onSave: (payload: { incomingItemId: string; itemShippingCost: string | null; itemShippingIsTaxable: boolean }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(row.itemShippingCost ? String(parseFloat(row.itemShippingCost)) : "");
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
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted">
        <Pencil className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end">
        <div className="space-y-3">
          <div className="text-sm font-medium">이 품목 배송비 수정</div>
          <div className="text-xs text-muted-foreground">
            값을 입력하면 그 품목 한정 운임으로 적용. 비우면 전표 분배로 되돌립니다.
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">운임 (₩, VAT포함)</label>
            <Input
              type="text"
              inputMode="numeric"
              value={formatComma(draft)}
              onChange={(e) => setDraft(parseComma(e.target.value))}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="비우면 분배 적용"
              className="h-8"
            />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <Checkbox
              checked={taxable}
              onCheckedChange={(c) => setTaxable(c === true)}
            />
            <span>과세</span>
          </label>
          <div className="flex justify-between gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" className="text-xs h-7" onClick={clear}>
              비우기 (분배)
            </Button>
            <Button type="button" size="sm" className="text-xs h-7" onClick={apply}>
              <Loader2 className="hidden" />
              적용
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
