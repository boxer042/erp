"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  JmButton,
  JmCombobox,
  type JmComboboxItem,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogDescription,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
} from "@/jm";

interface ProductLite {
  id: string;
  name: string;
  sku: string;
  isActive: boolean;
  isCanonical?: boolean;
  isBulk?: boolean;
}

interface PreviewResponse {
  source: { id: string; name: string; sku: string; inventoryQty: number };
  target: { id: string; name: string; sku: string; inventoryQty: number };
  impact: {
    mappings: number;
    lots: number;
    orderItems: number;
    quotationItems: number;
    statementItems: number;
    channelPricings: number;
    sellingCosts: number;
    media: number;
  };
  blockers: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceProductId: string;
  sourceProductName: string;
  /** 합치기 성공 후 호출 — 보통 이전 페이지로 redirect */
  onMerged?: (targetId: string) => void;
}

export function ProductMergeDialog({
  open,
  onOpenChange,
  sourceProductId,
  sourceProductName,
  onMerged,
}: Props) {
  const queryClient = useQueryClient();
  const [targetId, setTargetId] = useState<string>("");

  const productsQuery = useQuery({
    queryKey: queryKeys.products.list({ scope: "merge-target" }),
    queryFn: () => apiGet<ProductLite[]>(`/api/products?isBulk=all`),
    enabled: open,
  });

  const items = useMemo<JmComboboxItem[]>(() => {
    return (productsQuery.data ?? [])
      .filter(
        (p) => p.id !== sourceProductId && p.isActive && !p.isCanonical && !p.isBulk,
      )
      .map((p) => ({ id: p.id, label: p.name, description: p.sku }));
  }, [productsQuery.data, sourceProductId]);

  const previewQuery = useQuery({
    queryKey: ["product-merge-preview", sourceProductId, targetId],
    queryFn: () =>
      apiGet<PreviewResponse>(
        `/api/products/${sourceProductId}/merge?targetId=${targetId}`,
      ),
    enabled: open && !!targetId,
  });

  const mergeMutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/products/${sourceProductId}/merge`, "POST", { targetId }),
    onSuccess: () => {
      toast.success("상품을 합쳤습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      onOpenChange(false);
      onMerged?.(targetId);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "합치기 실패");
    },
  });

  const preview = previewQuery.data;
  const blockers = preview?.blockers ?? [];

  return (
    <JmDialog open={open} onOpenChange={onOpenChange}>
      <JmDialogContent size="lg">
        <JmDialogHeader>
          <JmDialogTitle>상품 합치기</JmDialogTitle>
          <JmDialogDescription>
            <span className="font-medium text-[var(--jm-text)]">
              &ldquo;{sourceProductName}&rdquo;
            </span>
            의 매핑·재고·이력을 다른 상품으로 모두 이전하고 현재 상품은 비활성 처리합니다.
            되돌릴 수 없습니다.
          </JmDialogDescription>
        </JmDialogHeader>

        <JmDialogBody>
          <div className="space-y-4">
            <div>
              <div className="text-jm-xs text-[var(--jm-text-muted)] mb-1.5">
                합쳐질 대상 상품
              </div>
              <JmCombobox
                items={items}
                value={targetId}
                size="sm"
                onChange={(item) => setTargetId(item.id)}
                placeholder="상품명 또는 SKU 검색"
                searchPlaceholder="상품명·SKU 검색..."
                clearable
                onClear={() => setTargetId("")}
                matches={(item, q) => {
                  const lower = q.toLowerCase();
                  return (
                    item.label.toLowerCase().includes(lower) ||
                    (item.description?.toLowerCase().includes(lower) ?? false)
                  );
                }}
              />
            </div>

            {previewQuery.isPending && targetId && (
              <div className="text-jm-sm text-[var(--jm-text-muted)] flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> 영향 범위 확인 중...
              </div>
            )}

            {preview && (
              <div className="rounded-lg border border-[var(--jm-border)] p-3 space-y-2 text-jm-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--jm-text-muted)]">원본 재고</span>
                  <span className="text-[var(--jm-text)]">
                    {preview.source.inventoryQty.toLocaleString("ko-KR")}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--jm-text-muted)]">대상 재고 (합치기 후)</span>
                  <span className="font-medium text-[var(--jm-text)]">
                    {(
                      preview.source.inventoryQty + preview.target.inventoryQty
                    ).toLocaleString("ko-KR")}
                  </span>
                </div>
                <div className="border-t border-[var(--jm-border)] pt-2 space-y-1 text-jm-xs text-[var(--jm-text-muted)]">
                  <div>이전될 항목:</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 pl-2">
                    <div>매핑 {preview.impact.mappings}건</div>
                    <div>로트 {preview.impact.lots}건</div>
                    <div>주문 {preview.impact.orderItems}건</div>
                    <div>견적 {preview.impact.quotationItems}건</div>
                    <div>거래명세 {preview.impact.statementItems}건</div>
                    <div>채널가 {preview.impact.channelPricings}건</div>
                    <div>판매비용 {preview.impact.sellingCosts}건</div>
                    <div>미디어 {preview.impact.media}건</div>
                  </div>
                </div>
              </div>
            )}

            {blockers.length > 0 && (
              <div className="rounded-lg border border-[var(--jm-danger-fg)]/40 bg-[var(--jm-danger-bg)]/30 p-3 text-jm-sm">
                <div className="flex items-center gap-1.5 font-medium text-[var(--jm-danger-fg)] mb-1">
                  <AlertTriangle className="size-4" /> 합칠 수 없습니다
                </div>
                <ul className="list-disc list-inside text-[var(--jm-danger-fg)]/80 space-y-0.5 text-jm-xs">
                  {blockers.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </JmDialogBody>

        <JmDialogFooter>
          <JmButton
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={mergeMutation.isPending}
          >
            취소
          </JmButton>
          <JmButton
            variant="cta"
            onClick={() => mergeMutation.mutate()}
            disabled={
              !targetId ||
              blockers.length > 0 ||
              mergeMutation.isPending ||
              previewQuery.isPending
            }
          >
            {mergeMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            <span>합치기 실행</span>
          </JmButton>
        </JmDialogFooter>
      </JmDialogContent>
    </JmDialog>
  );
}
