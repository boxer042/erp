"use client";

import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { ApiError, apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatComma, parseComma } from "@/lib/utils";
import {
  syncChannelPricings,
  type ChannelPriceState,
} from "@/lib/product-mutations";
import { summarizeCosts, toVatPrice } from "../helpers";
import type { ProductDetail } from "../types";
import { ProductCostsEditSheet } from "./product-costs-edit-sheet";

interface Channel {
  id: string;
  name: string;
  code: string;
}

interface ProductChannelPricingEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductDetail;
}

export function ProductChannelPricingEditSheet(props: ProductChannelPricingEditSheetProps) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <ProductChannelPricingEditSheetContent {...props} />}
    </Sheet>
  );
}

interface RowState {
  channelId: string;
  enabled: boolean;
  /** UI 입력값 — VAT 포함 금액 (세전 → VAT 포함은 toVatPrice 로 변환) */
  vatPrice: string;
}

function ProductChannelPricingEditSheetContent({
  onOpenChange,
  product,
}: ProductChannelPricingEditSheetProps) {
  const queryClient = useQueryClient();

  const channelsQuery = useQuery({
    queryKey: queryKeys.channels.list(),
    queryFn: () => apiGet<Channel[]>("/api/channels"),
  });

  const taxRate = parseFloat(product.taxRate ?? "0.1");
  const isTaxable = product.taxType !== "TAX_FREE";

  // 초기값: 기존 channelPricings 에서 enabled/price 매핑
  const [rows, setRows] = useState<Map<string, RowState>>(() => {
    const map = new Map<string, RowState>();
    for (const cp of product.channelPricings ?? []) {
      map.set(cp.channelId, {
        channelId: cp.channelId,
        enabled: true,
        vatPrice: String(toVatPrice(cp.sellingPrice, product.taxType)),
      });
    }
    return map;
  });

  const setRow = (channelId: string, patch: Partial<RowState>) =>
    setRows((prev) => {
      const next = new Map(prev);
      const cur = next.get(channelId) ?? {
        channelId,
        enabled: false,
        vatPrice: "",
      };
      next.set(channelId, { ...cur, ...patch });
      return next;
    });

  const channels = channelsQuery.data ?? [];

  // 채널별 기존 비용 미리 계산 (요약 표시용)
  const costsByChannel = new Map<string, typeof product.sellingCosts>();
  for (const c of product.sellingCosts ?? []) {
    if (!c.channelId) continue;
    const list = costsByChannel.get(c.channelId) ?? [];
    list.push(c);
    costsByChannel.set(c.channelId, list);
  }

  const [costsEditChannelId, setCostsEditChannelId] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // VAT 포함 → 세전 변환
      const next: ChannelPriceState[] = [];
      for (const ch of channels) {
        const r = rows.get(ch.id);
        if (!r || !r.enabled || !r.vatPrice) {
          next.push({ channelId: ch.id, price: null });
          continue;
        }
        const vat = parseFloat(r.vatPrice);
        const net =
          isTaxable && taxRate > 0
            ? Math.round(vat / (1 + taxRate))
            : Math.round(vat);
        next.push({ channelId: ch.id, price: String(net) });
      }
      const prev = (product.channelPricings ?? []).map((cp) => ({
        pricingId: cp.id,
        channelId: cp.channelId,
      }));
      const result = await syncChannelPricings(product.id, prev, next);
      if (result.failed.length > 0) {
        throw new Error(`일부 항목 실패: ${result.failed.join(", ")}`);
      }
    },
    onSuccess: () => {
      toast.success("채널 가격이 저장되었습니다");
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : err.message || "저장에 실패했습니다"),
  });

  return (
    <>
      <SheetContent side="bottom" className="h-[90dvh] p-0 flex flex-col">
        <SheetHeader className="border-b border-border px-5 py-4 flex-shrink-0">
          <SheetTitle>채널별 가격 편집</SheetTitle>
          <SheetDescription className="text-xs">
            채널을 활성화하고 판매가(VAT 포함 금액)를 입력합니다. 저장 시 DB에는 세전(공급가액)으로 환산되어 저장됩니다. 채널 전용 비용은 행의 &ldquo;채널 비용 편집&rdquo; 버튼.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {channels.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                등록된 판매채널이 없습니다
              </p>
            ) : (
              channels.map((ch) => {
                const row = rows.get(ch.id) ?? {
                  channelId: ch.id,
                  enabled: false,
                  vatPrice: "",
                };
                const chCosts = costsByChannel.get(ch.id) ?? [];
                return (
                  <div
                    key={ch.id}
                    className="rounded-md border border-border p-3 space-y-2"
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={row.enabled}
                        onCheckedChange={(v) => setRow(ch.id, { enabled: !!v })}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{ch.name}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {ch.code}
                          </Badge>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-[12px]"
                        onClick={() => setCostsEditChannelId(ch.id)}
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        채널 비용 편집
                      </Button>
                    </div>
                    {row.enabled && (
                      <div className="pl-7 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground w-28">
                            판매가 (VAT 포함)
                          </span>
                          <span className="text-sm">₩</span>
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={formatComma(row.vatPrice)}
                            onChange={(e) =>
                              setRow(ch.id, { vatPrice: parseComma(e.target.value) })
                            }
                            onFocus={(e) => e.currentTarget.select()}
                            className="h-9 w-40"
                          />
                        </div>
                        <div className="text-[11px] text-muted-foreground pl-30">
                          채널 전용 비용 요약: {summarizeCosts(chCosts)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-border px-5 py-4 flex justify-end gap-2 bg-background flex-shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saveMutation.isPending}
            >
              취소
            </Button>
            <Button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              저장
            </Button>
          </div>
        </div>
      </SheetContent>

      {/* 채널 전용 비용 편집 Sheet */}
      <ProductCostsEditSheet
        open={costsEditChannelId !== null}
        onOpenChange={(o) => {
          if (!o) setCostsEditChannelId(null);
        }}
        product={product}
        channelId={costsEditChannelId}
        channelName={
          costsEditChannelId
            ? channels.find((c) => c.id === costsEditChannelId)?.name
            : undefined
        }
      />
    </>
  );
}
