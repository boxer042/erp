"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

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

  // 합칠 대상 후보 — 모든 active 상품. 검색은 SearchableSelect 자체 필터에 위임.
  const productsQuery = useQuery({
    queryKey: queryKeys.products.list({ scope: "merge-target" }),
    queryFn: () => apiGet<ProductLite[]>(`/api/products?isBulk=all`),
    enabled: open,
  });

  const options = useMemo(() => {
    return (productsQuery.data ?? [])
      .filter((p) => p.id !== sourceProductId && p.isActive && !p.isCanonical && !p.isBulk)
      .map((p) => ({ value: p.id, label: p.name, sub: p.sku }));
  }, [productsQuery.data, sourceProductId]);

  const previewQuery = useQuery({
    queryKey: ["product-merge-preview", sourceProductId, targetId],
    queryFn: () => apiGet<PreviewResponse>(`/api/products/${sourceProductId}/merge?targetId=${targetId}`),
    enabled: open && !!targetId,
  });

  const mergeMutation = useMutation({
    mutationFn: () => apiMutate(`/api/products/${sourceProductId}/merge`, "POST", { targetId }),
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>상품 합치기</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">&ldquo;{sourceProductName}&rdquo;</span>의 매핑·재고·이력을 다른 상품으로 모두 이전하고
            현재 상품은 비활성 처리합니다. 되돌릴 수 없습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="text-xs text-muted-foreground mb-1.5">합쳐질 대상 상품</div>
            <SearchableSelect
              options={options}
              value={targetId}
              onChange={setTargetId}
              placeholder="상품명 또는 SKU 검색"
            />
          </div>

          {previewQuery.isPending && targetId && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> 영향 범위 확인 중...
            </div>
          )}

          {preview && (
            <div className="rounded-lg border border-border p-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">원본 재고</span>
                <span>{preview.source.inventoryQty.toLocaleString("ko-KR")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">대상 재고 (합치기 후)</span>
                <span className="font-medium">{(preview.source.inventoryQty + preview.target.inventoryQty).toLocaleString("ko-KR")}</span>
              </div>
              <div className="border-t border-border pt-2 space-y-1 text-xs text-muted-foreground">
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
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <div className="flex items-center gap-1.5 font-medium text-destructive mb-1">
                <AlertTriangle className="h-4 w-4" /> 합칠 수 없습니다
              </div>
              <ul className="list-disc list-inside text-destructive/80 space-y-0.5 text-xs">
                {blockers.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mergeMutation.isPending}>
            취소
          </Button>
          <Button
            onClick={() => mergeMutation.mutate()}
            disabled={!targetId || blockers.length > 0 || mergeMutation.isPending || previewQuery.isPending}
          >
            {mergeMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            합치기 실행
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
