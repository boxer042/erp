"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Archive, History, Loader2, Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { focusCaretEnd } from "@/jm/lib/focus";
import { ApiError, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { AssemblyRegisterSheet } from "@/components/assembly/assembly-register-sheet";
import {
  JmBadge,
  JmButton,
  JmCheckbox,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogDescription,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmIconButton,
  JmInput,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
} from "@/jm";
import { VariantHistorySheet } from "./variant-history-sheet";
import { fmtNumber, fmtPrice, toVatPrice } from "./helpers";
import { ProductSection } from "./product-section";
import type { VariantItem } from "./types";

interface ProductVariantsCardProps {
  productId: string;
  taxType: string;
  variants: VariantItem[];
  parentSetComponentsEmpty?: boolean;
}

type Action = "copy_from_parent" | "percent" | "delta";

export function ProductVariantsCard({
  productId,
  taxType,
  variants,
  parentSetComponentsEmpty,
}: ProductVariantsCardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [action, setAction] = useState<Action>("copy_from_parent");
  const [percent, setPercent] = useState("");
  const [delta, setDelta] = useState("");
  const [applySelling, setApplySelling] = useState(true);
  const [applyList, setApplyList] = useState(false);
  const [assemblySheetOpen, setAssemblySheetOpen] = useState(false);

  const [historyVariant, setHistoryVariant] = useState<VariantItem | null>(null);
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
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : err.message || "비활성 실패",
      ),
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
      return apiMutate<{ updated: number }>(
        `/api/products/${productId}/variants/bulk`,
        "POST",
        body,
      );
    },
    onSuccess: (result) => {
      toast.success(`${result.updated}개 변형이 수정되었습니다`);
      setBulkOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      if (typeof window !== "undefined") window.location.reload();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : err.message || "일괄 수정 실패",
      ),
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
            <JmButton size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
              <Settings2 />
              <span>일괄 수정</span>
            </JmButton>
          )}
          <JmButton
            size="sm"
            variant="cta"
            onClick={() => setAssemblySheetOpen(true)}
          >
            <Plus />
            <span>조립실적 추가</span>
          </JmButton>
        </div>
      }
      noPadding
    >
      {variants.length === 0 ? (
        <p className="text-jm-sm text-[var(--jm-text-muted)] py-6 text-center px-3">
          등록된 변형이 없습니다. &quot;조립실적 추가&quot;로 첫 조립을 등록하면 변형이
          자동 생성됩니다.
        </p>
      ) : (
        <>
          {parentSetComponentsEmpty && (
            <p className="px-3 py-2 text-jm-2xs text-[var(--jm-warning-fg)] bg-[var(--jm-warning-bg)]/30 border-b border-[var(--jm-border)]">
              ⚠️ 대표 상품의 기본 구성품이 없어서 변형마다 모든 부품이
              &quot;다름&quot; 으로 표시됩니다. 대표 상품의 구성품을 등록하면 정확한
              비교가 가능합니다.
            </p>
          )}
          <JmTable className="min-w-[640px]">
            <JmTableHeader>
              <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
                  SKU
                </JmTableHead>
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
                  대표와 다른 부품
                </JmTableHead>
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
                  평균 원가
                </JmTableHead>
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
                  판매가
                </JmTableHead>
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
                  재고
                </JmTableHead>
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 w-20"></JmTableHead>
              </JmTableRow>
            </JmTableHeader>
            <JmTableBody>
              {variants.map((v) => {
                const vc = v.variableComponents ?? [];
                return (
                  <JmTableRow key={v.id}>
                    <JmTableCell className="px-3 py-2">
                      <JmBadge variant="outline" size="sm" shape="square">
                        {v.sku}
                      </JmBadge>
                    </JmTableCell>
                    <JmTableCell className="px-3 py-2">
                      {vc.length === 0 ? (
                        <span className="text-jm-xs text-[var(--jm-text-muted)]">
                          대표와 동일 (기본 조합)
                        </span>
                      ) : (
                        <div className="flex flex-col gap-0.5 text-jm-xs">
                          {vc.map((c, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              {c.slotLabel?.trim() && (
                                <span className="text-[var(--jm-text-muted)] shrink-0">
                                  {c.slotLabel}:
                                </span>
                              )}
                              <span className="truncate text-[var(--jm-text)]">
                                {c.componentName}
                              </span>
                              {Number(c.quantity) !== 1 && (
                                <span className="text-[var(--jm-text-muted)] shrink-0">
                                  ×{c.quantity}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </JmTableCell>
                    <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
                      {v.avgInboundUnitCost && v.avgInboundUnitCost > 0 ? (
                        `₩${fmtPrice(Math.round(v.avgInboundUnitCost))}`
                      ) : (
                        <span className="text-[var(--jm-text-muted)] text-jm-xs">-</span>
                      )}
                    </JmTableCell>
                    <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
                      {v.sellingPrice
                        ? `₩${fmtPrice(toVatPrice(v.sellingPrice, taxType))}`
                        : "-"}
                    </JmTableCell>
                    <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
                      {v.inventory ? fmtNumber(v.inventory.quantity) : "0"}
                    </JmTableCell>
                    <JmTableCell className="px-3 py-2">
                      <div className="flex items-center gap-1 justify-end">
                        <JmIconButton
                          variant="ghost"
                          size="sm"
                          onClick={() => setHistoryVariant(v)}
                          title="이력 보기"
                          aria-label="이력 보기"
                        >
                          <History />
                        </JmIconButton>
                        <JmIconButton
                          variant="ghost"
                          size="sm"
                          onClick={() => setArchiveTarget(v)}
                          title="비활성"
                          aria-label="비활성"
                          className="text-[var(--jm-text-muted)] hover:text-[var(--jm-danger-fg)]"
                        >
                          <Archive />
                        </JmIconButton>
                      </div>
                    </JmTableCell>
                  </JmTableRow>
                );
              })}
            </JmTableBody>
          </JmTable>
        </>
      )}

      <JmDialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <JmDialogContent size="md">
          <JmDialogHeader>
            <JmDialogTitle>변형 일괄 수정</JmDialogTitle>
            <JmDialogDescription>
              모든 변형 ({variants.length}개) 의 가격을 한 번에 수정합니다.
            </JmDialogDescription>
          </JmDialogHeader>
          <JmDialogBody>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-jm-xs text-[var(--jm-text-muted)]">액션</label>
                <div className="flex gap-2 flex-wrap">
                  {(
                    [
                      ["copy_from_parent", "부모 가격 재복사"],
                      ["percent", "% 인상/인하"],
                      ["delta", "절대값 +/-"],
                    ] as Array<[Action, string]>
                  ).map(([k, label]) => (
                    <JmButton
                      key={k}
                      size="sm"
                      variant={action === k ? "cta" : "outline"}
                      onClick={() => setAction(k)}
                    >
                      {label}
                    </JmButton>
                  ))}
                </div>
              </div>
              {action === "percent" && (
                <div className="space-y-1.5">
                  <label className="text-jm-xs text-[var(--jm-text-muted)]">
                    퍼센트 (예: 10 = +10%, -5 = -5%)
                  </label>
                  <JmInput
                    size="sm"
                    type="text"
                    inputMode="decimal"
                    value={percent}
                    onChange={(e) => setPercent(e.target.value)}
                    onFocus={focusCaretEnd}
                    placeholder="10"
                  />
                </div>
              )}
              {action === "delta" && (
                <div className="space-y-1.5">
                  <label className="text-jm-xs text-[var(--jm-text-muted)]">
                    증감액 (음수 가능)
                  </label>
                  <JmInput
                    size="sm"
                    type="text"
                    inputMode="decimal"
                    value={delta}
                    onChange={(e) => setDelta(e.target.value)}
                    onFocus={focusCaretEnd}
                    placeholder="1000"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-jm-xs text-[var(--jm-text-muted)]">
                  적용 필드
                </label>
                <div className="flex gap-3 text-jm-sm">
                  <label className="flex items-center gap-1.5 cursor-pointer text-[var(--jm-text)]">
                    <JmCheckbox
                      checked={applySelling}
                      onCheckedChange={(c) => setApplySelling(c === true)}
                    />
                    판매가
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-[var(--jm-text)]">
                    <JmCheckbox
                      checked={applyList}
                      onCheckedChange={(c) => setApplyList(c === true)}
                    />
                    정가
                  </label>
                </div>
              </div>
            </div>
          </JmDialogBody>
          <JmDialogFooter>
            <JmButton
              variant="ghost"
              onClick={() => setBulkOpen(false)}
              disabled={submitting}
            >
              취소
            </JmButton>
            <JmButton variant="cta" onClick={submit} disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              <span>적용</span>
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>

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

      <JmDialog
        open={!!archiveTarget}
        onOpenChange={(o) => !o && setArchiveTarget(null)}
      >
        <JmDialogContent size="md">
          <JmDialogHeader>
            <JmDialogTitle>변형 비활성</JmDialogTitle>
            <JmDialogDescription>
              {archiveTarget && (
                <span className="block">
                  &quot;{archiveTarget.sku}&quot; 변형을 비활성화하시겠습니까? 이후
                  카드에서 가려지며, 필요 시 관리자가 다시 활성화할 수 있습니다. 이
                  변형의 lot/주문 이력은 보존됩니다.
                </span>
              )}
            </JmDialogDescription>
          </JmDialogHeader>
          <JmDialogFooter>
            <JmButton
              variant="ghost"
              onClick={() => setArchiveTarget(null)}
              disabled={archiving}
            >
              취소
            </JmButton>
            <JmButton variant="danger" onClick={archiveVariant} disabled={archiving}>
              {archiving && <Loader2 className="size-4 animate-spin" />}
              <span>비활성</span>
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>
    </ProductSection>
  );
}
