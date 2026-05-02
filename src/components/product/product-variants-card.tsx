"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Settings2, History, Archive } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AssemblyRegisterSheet } from "@/components/assembly/assembly-register-sheet";
import { VariantHistorySheet } from "./variant-history-sheet";
import { fmtNumber, fmtPrice, toVatPrice } from "./helpers";
import { ProductSection } from "./product-section";
import type { VariantItem } from "./types";

interface ProductVariantsCardProps {
  productId: string;
  taxType: string;
  variants: VariantItem[];
  /** 부모 상품의 SetComponent 가 비어있는지 — 비어있으면 모든 부품이 "다름" 으로 표시되므로 안내 */
  parentSetComponentsEmpty?: boolean;
}

type Action = "copy_from_parent" | "percent" | "delta";

export function ProductVariantsCard({ productId, taxType, variants, parentSetComponentsEmpty }: ProductVariantsCardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [action, setAction] = useState<Action>("copy_from_parent");
  const [percent, setPercent] = useState("");
  const [delta, setDelta] = useState("");
  const [applySelling, setApplySelling] = useState(true);
  const [applyList, setApplyList] = useState(false);
  const [assemblySheetOpen, setAssemblySheetOpen] = useState(false);

  // 변형 이력 시트
  const [historyVariant, setHistoryVariant] = useState<VariantItem | null>(null);

  // 비활성화 다이얼로그
  const [archiveTarget, setArchiveTarget] = useState<VariantItem | null>(null);

  const archiveMutation = useMutation({
    mutationFn: () => {
      if (!archiveTarget) throw new Error("대상이 없습니다");
      return apiMutate(`/api/products/${archiveTarget.id}`, "DELETE");
    },
    onSuccess: () => {
      toast.success("변형이 비활성되었습니다");
      setArchiveTarget(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      router.refresh();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : err.message || "비활성 실패"),
  });
  const archiving = archiveMutation.isPending;
  const archiveVariant = () => archiveMutation.mutate();

  const submitMutation = useMutation({
    mutationFn: () => {
      const applyTo: string[] = [];
      if (applySelling) applyTo.push("sellingPrice");
      if (applyList) applyTo.push("listPrice");
      if (applyTo.length === 0) throw new Error("적용할 필드를 선택해주세요");
      const body: Record<string, unknown> = { action, applyTo };
      if (action === "percent") {
        const v = parseFloat(percent);
        if (Number.isNaN(v)) throw new Error("퍼센트 값을 입력해주세요");
        body.percent = v;
      } else if (action === "delta") {
        const v = parseFloat(delta);
        if (Number.isNaN(v)) throw new Error("증감액을 입력해주세요");
        body.delta = v;
      }
      return apiMutate<{ updated: number }>(`/api/products/${productId}/variants/bulk`, "POST", body);
    },
    onSuccess: (result) => {
      toast.success(`${result.updated}개 변형이 수정되었습니다`);
      setBulkOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      if (typeof window !== "undefined") window.location.reload();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : err.message || "일괄 수정 실패"),
  });
  const submitting = submitMutation.isPending;
  const submit = () => submitMutation.mutate();

  return (
    <ProductSection
      title={`변형 (${variants.length}개)`}
      description="대표 상품의 실제 출고 단위. 재고는 변형별로 관리됩니다."
      actions={
        <div className="flex gap-2">
          {variants.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setBulkOpen(true)}
            >
              <Settings2 className="h-3.5 w-3.5 mr-1.5" />일괄 수정
            </Button>
          )}
          <Button size="sm" className="h-8" onClick={() => setAssemblySheetOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />조립실적 추가
          </Button>
        </div>
      }
      noPadding
    >
      {variants.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center px-3">
          등록된 변형이 없습니다. &quot;조립실적 추가&quot;로 첫 조립을 등록하면 변형이 자동 생성됩니다.
        </p>
      ) : (
        <>
          {parentSetComponentsEmpty && (
            <p className="px-3 py-2 text-[11px] text-orange-600 dark:text-orange-400 bg-orange-500/5 border-b border-border">
              ⚠️ 대표 상품의 기본 구성품이 없어서 변형마다 모든 부품이 &quot;다름&quot; 으로 표시됩니다.
              대표 상품의 구성품을 등록하면 정확한 비교가 가능합니다.
            </p>
          )}
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead className="h-9 px-3 text-xs">SKU</TableHead>
              <TableHead className="h-9 px-3 text-xs">대표와 다른 부품</TableHead>
              <TableHead className="h-9 px-3 text-xs text-right">평균 원가</TableHead>
              <TableHead className="h-9 px-3 text-xs text-right">판매가</TableHead>
              <TableHead className="h-9 px-3 text-xs text-right">재고</TableHead>
              <TableHead className="h-9 px-3 w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((v) => {
              const vc = v.variableComponents ?? [];
              return (
                <TableRow key={v.id}>
                  <TableCell className="px-3 py-2.5">
                    <Badge variant="outline">{v.sku}</Badge>
                  </TableCell>
                  <TableCell className="px-3 py-2.5">
                    {vc.length === 0 ? (
                      <span className="text-xs text-muted-foreground">대표와 동일 (기본 조합)</span>
                    ) : (
                      <div className="flex flex-col gap-0.5 text-xs">
                        {vc.map((c, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            {c.slotLabel?.trim() && (
                              <span className="text-muted-foreground shrink-0">
                                {c.slotLabel}:
                              </span>
                            )}
                            <span className="truncate">{c.componentName}</span>
                            {Number(c.quantity) !== 1 && (
                              <span className="text-muted-foreground shrink-0">
                                ×{c.quantity}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-right tabular-nums">
                    {v.avgInboundUnitCost && v.avgInboundUnitCost > 0
                      ? `₩${fmtPrice(Math.round(v.avgInboundUnitCost))}`
                      : <span className="text-muted-foreground text-xs">-</span>}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-right tabular-nums">
                    {v.sellingPrice ? `₩${fmtPrice(toVatPrice(v.sellingPrice, taxType))}` : "-"}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-right tabular-nums">
                    {v.inventory ? fmtNumber(v.inventory.quantity) : "0"}
                  </TableCell>
                  <TableCell className="px-3 py-2.5">
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[12px]"
                        onClick={() => setHistoryVariant(v)}
                        title="이력 보기"
                      >
                        <History className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[12px] text-muted-foreground hover:text-destructive"
                        onClick={() => setArchiveTarget(v)}
                        title="비활성"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </>
      )}

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>변형 일괄 수정</DialogTitle>
            <DialogDescription>
              모든 변형 ({variants.length}개) 의 가격을 한 번에 수정합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">액션</label>
              <div className="flex gap-2 flex-wrap">
                {([
                  ["copy_from_parent", "부모 가격 재복사"],
                  ["percent", "% 인상/인하"],
                  ["delta", "절대값 +/-"],
                ] as Array<[Action, string]>).map(([k, label]) => (
                  <Button
                    key={k}
                    size="sm"
                    variant={action === k ? "default" : "outline"}
                    onClick={() => setAction(k)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            {action === "percent" && (
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">퍼센트 (예: 10 = +10%, -5 = -5%)</label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  placeholder="10"
                />
              </div>
            )}
            {action === "delta" && (
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">증감액 (음수 가능)</label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                  placeholder="1000"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">적용 필드</label>
              <div className="flex gap-3 text-sm">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={applySelling}
                    onCheckedChange={(c) => setApplySelling(c === true)}
                  />
                  판매가
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={applyList}
                    onCheckedChange={(c) => setApplyList(c === true)}
                  />
                  정가
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={submitting}>
              취소
            </Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : null}
              적용
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AssemblyRegisterSheet
        open={assemblySheetOpen}
        onOpenChange={setAssemblySheetOpen}
        initialProductId={productId}
        showProductPicker={false}
        onSuccess={() => router.refresh()}
      />

      <VariantHistorySheet
        variantId={historyVariant?.id ?? null}
        variantName={historyVariant?.name}
        variantSku={historyVariant?.sku}
        open={!!historyVariant}
        onOpenChange={(o) => !o && setHistoryVariant(null)}
      />

      <Dialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>변형 비활성</DialogTitle>
            <DialogDescription>
              {archiveTarget && (
                <span className="block">
                  &quot;{archiveTarget.sku}&quot; 변형을 비활성화하시겠습니까? 이후 카드에서 가려지며,
                  필요 시 관리자가 다시 활성화할 수 있습니다. 이 변형의 lot/주문 이력은 보존됩니다.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveTarget(null)} disabled={archiving}>
              취소
            </Button>
            <Button variant="destructive" onClick={archiveVariant} disabled={archiving}>
              {archiving ? <Loader2 className="animate-spin" /> : null}
              비활성
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProductSection>
  );
}
