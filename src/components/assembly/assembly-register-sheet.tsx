"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { focusCaretEnd } from "@/jm/lib/focus";
import { formatComma, parseComma } from "@/lib/utils";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";
import {
  JmBadge,
  JmButton,
  JmDatePicker,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogDescription,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmDrawer,
  JmDrawerContent,
  JmDrawerHeader,
  JmDrawerTitle,
  JmInput,
  JmSkeleton,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
  JmTextarea,
} from "@/jm";

interface ComponentRow {
  componentId: string;
  /** 중고 단품 끼움 — 있으면 UsedItem 흡수 흐름 (status=ASSEMBLED_INTO) */
  usedItemId?: string | null;
  quantity: string;
  slotId?: string | null;
  slotLabelId?: string | null;
  slotLabel?: string | null;
  isVariable: boolean;
}

function ComponentsSkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <JmTableRow key={i} className="hover:bg-transparent">
          <JmTableCell><JmSkeleton className="h-3 w-16" /></JmTableCell>
          <JmTableCell className="p-1">
            <JmSkeleton className="h-9 w-full rounded-lg" />
          </JmTableCell>
          <JmTableCell className="p-1 text-right">
            <div className="flex justify-end">
              <JmSkeleton className="h-9 w-full rounded-lg" />
            </div>
          </JmTableCell>
          <JmTableCell className="p-1">
            <JmSkeleton className="h-7 w-12 rounded-md" />
          </JmTableCell>
        </JmTableRow>
      ))}
    </>
  );
}

interface AssemblyRegisterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 진입 시 자동 선택될 상품 ID (예: 변형 카드에서 부모 ID) */
  initialProductId?: string;
  /** 등록 성공 후 호출. 부모는 데이터 다시 fetch 또는 router.refresh */
  onSuccess?: () => void;
  /** 조립상품 선택 콤보박스 노출 여부 — false 면 initialProductId 만 사용 */
  showProductPicker?: boolean;
}

export function AssemblyRegisterSheet({
  open,
  onOpenChange,
  initialProductId,
  onSuccess,
  showProductPicker = true,
}: AssemblyRegisterSheetProps) {
  const [submitting, setSubmitting] = useState(false);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [assembledAt, setAssembledAt] = useState<Date>(new Date());
  const [laborCost, setLaborCost] = useState("");
  const [memo, setMemo] = useState("");
  const [components, setComponents] = useState<ComponentRow[]>([]);
  const [componentsLoading, setComponentsLoading] = useState(false);

  const [emptySlotConfirmOpen, setEmptySlotConfirmOpen] = useState(false);
  const [emptySlotNames, setEmptySlotNames] = useState<string[]>([]);

  const [newVariantOpen, setNewVariantOpen] = useState(false);
  const [newVariantData, setNewVariantData] = useState<
    { id: string; name: string; sku: string } | null
  >(null);
  const [newVariantSku, setNewVariantSku] = useState("");
  const [newVariantSavingSku, setNewVariantSavingSku] = useState(false);

  const fetchProducts = useCallback(async () => {
    try {
      // 신품 카탈로그 + IN_STOCK 중고 단품 병렬 fetch
      const [productsData, usedItemsData] = await Promise.all([
        apiGet<
          Array<{
            id: string;
            name: string;
            sku: string;
            sellingPrice: string;
            unitCost: string | null;
            unitOfMeasure: string;
            isSet: boolean;
          }>
        >("/api/products?isBulk=all"),
        apiGet<
          Array<{
            id: string;
            internalCode: string;
            displayName: string;
            acquiredCost: string;
            productId: string | null;
          }>
        >("/api/used-items?status=IN_STOCK&includeCosts=true&limit=500").catch(
          () => [] as Array<{
            id: string;
            internalCode: string;
            displayName: string;
            acquiredCost: string;
            productId: string | null;
          }>,
        ),
      ]);

      // 중고도 ProductOption 형태로 변환 — id 는 UsedItem.id, name 에 "(중고)" 자동 prefix.
      // ProductCombobox UI 자체는 변경 없음 — 검색·선택만 통합.
      const usedAsProducts: ProductOption[] = usedItemsData.map((u) => ({
        id: u.id,
        name: `${u.displayName} (중고)`,
        sku: u.internalCode,
        sellingPrice: "0",
        unitCost: u.acquiredCost,
        unitOfMeasure: "EA",
        isSet: false,
        usedItemId: u.id,
      }));

      setProducts([
        ...productsData.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          sellingPrice: p.sellingPrice,
          unitCost: p.unitCost,
          unitOfMeasure: p.unitOfMeasure,
          isSet: p.isSet,
        })),
        ...usedAsProducts,
      ]);
    } catch {
      // ignore
    }
  }, []);

  const initRef = useRef<string>("");
  useEffect(() => {
    if (!open) return;
    fetchProducts();
    setQuantity("1");
    setAssembledAt(new Date());
    setLaborCost("");
    setMemo("");
    setComponents([]);
    setProductId(initialProductId ?? "");
    initRef.current = initialProductId ?? "";
  }, [open, initialProductId, fetchProducts]);

  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (!open || !initialProductId || autoSelectedRef.current) return;
    if (products.length === 0) return;
    const match = products.find((p) => p.id === initialProductId);
    if (!match) return;
    autoSelectedRef.current = true;
    handleProductChange(match);
  }, [open, products, initialProductId]);

  useEffect(() => {
    if (!open) autoSelectedRef.current = false;
  }, [open]);

  const handleProductChange = async (p: ProductOption) => {
    setProductId(p.id);
    setComponents([]);
    setComponentsLoading(true);
    try {
      let detail: {
        setComponents?: Array<{
          componentId: string;
          quantity: string;
          label?: string | null;
          slotLabelId?: string | null;
          slotId?: string | null;
        }>;
        assemblyTemplate?: {
          slots?: Array<{
            id: string;
            slotLabelId: string | null;
            label: string;
            isVariable: boolean;
          }>;
        };
      };
      try {
        detail = await apiGet(`/api/products/${p.id}`);
      } catch {
        return;
      }
      const setComps: Array<{
        componentId: string;
        quantity: string;
        label?: string | null;
        slotLabelId?: string | null;
        slotId?: string | null;
      }> = detail.setComponents ?? [];
      const slots: Array<{
        id: string;
        slotLabelId: string | null;
        label: string;
        isVariable: boolean;
      }> = detail.assemblyTemplate?.slots ?? [];
      const slotKey = (
        slotId: string | null | undefined,
        slotLabelId: string | null | undefined,
        label: string | null | undefined,
      ) =>
        slotId
          ? `SID:${slotId}`
          : slotLabelId
            ? `LID:${slotLabelId}`
            : label && label.trim()
              ? `LBL:${label.trim()}`
              : null;
      const variableByKey = new Map<string, boolean>();
      for (const s of slots) {
        variableByKey.set(`SID:${s.id}`, s.isVariable);
        if (s.slotLabelId) variableByKey.set(`LID:${s.slotLabelId}`, s.isVariable);
        if (s.label && s.label.trim())
          variableByKey.set(`LBL:${s.label.trim()}`, s.isVariable);
      }
      setComponents(
        setComps.map((c) => {
          const k = slotKey(c.slotId, c.slotLabelId, c.label);
          return {
            componentId: c.componentId,
            quantity: c.quantity,
            slotId: c.slotId ?? null,
            slotLabelId: c.slotLabelId ?? null,
            slotLabel: c.label ?? null,
            isVariable: k ? (variableByKey.get(k) ?? false) : true,
          };
        }),
      );
    } finally {
      setComponentsLoading(false);
    }
  };

  const addComponent = () =>
    setComponents((prev) => [
      ...prev,
      {
        componentId: "",
        quantity: "1",
        slotId: null,
        slotLabelId: null,
        slotLabel: null,
        isVariable: true,
      },
    ]);

  const removeComponent = (idx: number) =>
    setComponents((prev) => prev.filter((_, i) => i !== idx));

  const updateComponent = (idx: number, patch: Partial<ComponentRow>) =>
    setComponents((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const performAssemblySubmit = async (filteredComponents: ComponentRow[]) => {
    setSubmitting(true);
    try {
      const data = await apiMutate<{
        newVariant?: { id: string; name: string; sku: string } | null;
      }>("/api/assemblies", "POST", {
        productId,
        quantity,
        assembledAt: assembledAt.toISOString(),
        laborCost: laborCost ? laborCost : undefined,
        memo: memo || undefined,
        components: filteredComponents.map((c) => ({
          componentId: c.componentId,
          usedItemId: c.usedItemId ?? null,
          quantity: c.quantity,
          slotId: c.slotId ?? null,
          slotLabelId: c.slotLabelId ?? null,
          slotLabel: c.slotLabel ?? null,
        })),
      });
      toast.success("조립 실적이 등록되었습니다");
      onOpenChange(false);
      setEmptySlotConfirmOpen(false);
      onSuccess?.();
      if (data.newVariant) {
        setNewVariantData(data.newVariant);
        setNewVariantSku(data.newVariant.sku);
        setNewVariantOpen(true);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "등록 실패");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmNewVariantSku = async () => {
    if (!newVariantData) return;
    if (newVariantSku.trim() === newVariantData.sku) {
      setNewVariantOpen(false);
      setNewVariantData(null);
      return;
    }
    setNewVariantSavingSku(true);
    try {
      await apiMutate(`/api/products/${newVariantData.id}`, "PATCH", {
        sku: newVariantSku.trim(),
      });
      toast.success("변형 SKU 가 변경되었습니다");
      setNewVariantOpen(false);
      setNewVariantData(null);
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "SKU 변경 실패");
    } finally {
      setNewVariantSavingSku(false);
    }
  };

  const submitAssembly = async () => {
    if (!productId) {
      toast.error("조립상품을 선택해주세요");
      return;
    }
    if (components.length === 0) {
      toast.error("구성품을 추가해주세요");
      return;
    }

    const emptyNames: string[] = [];
    const filledComponents: ComponentRow[] = [];
    components.forEach((c, idx) => {
      // 중고 단품 끼움 = usedItemId 있으면 채워진 것으로 인정 (componentId 비어있어도 OK)
      const hasComponent = c.componentId.trim().length > 0 || !!c.usedItemId;
      const qty = parseFloat(c.quantity);
      // 음수 qty = 회수 (부속을 분해해서 재고로 돌려놓는 케이스). qty === 0 만 무효.
      const hasQuantity = !Number.isNaN(qty) && qty !== 0;
      if (hasComponent && hasQuantity) {
        filledComponents.push(c);
      } else {
        emptyNames.push(
          c.slotLabel?.trim() ? `${c.slotLabel} 슬롯` : `${idx + 1}번 행`,
        );
      }
    });

    if (filledComponents.length === 0) {
      toast.error("구성품을 1개 이상 입력해주세요");
      return;
    }

    if (emptyNames.length > 0) {
      setEmptySlotNames(emptyNames);
      setEmptySlotConfirmOpen(true);
      return;
    }

    await performAssemblySubmit(filledComponents);
  };

  const confirmSubmitWithEmptySlots = async () => {
    const filledComponents = components.filter((c) => {
      const qty = parseFloat(c.quantity);
      return c.componentId.trim().length > 0 && !Number.isNaN(qty) && qty > 0;
    });
    await performAssemblySubmit(filledComponents);
  };

  return (
    <>
      <JmDrawer open={open} onOpenChange={onOpenChange}>
        <JmDrawerContent
          side="bottom"
          size="xl"
          className="flex flex-col p-0"
          dragHandle={false}
        >
          <JmDrawerHeader className="border-b border-[var(--jm-border)] px-5 py-4 flex-shrink-0">
            <JmDrawerTitle>조립 실적 등록</JmDrawerTitle>
          </JmDrawerHeader>

          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
              {showProductPicker && (
                <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                  <label className="text-jm-sm text-right text-[var(--jm-text-muted)]">
                    조립상품
                  </label>
                  <ProductCombobox
                    products={products}
                    value={productId}
                    onChange={handleProductChange}
                    filterType="set"
                    placeholder="조립상품 선택..."
                  />
                </div>
              )}

              <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                <label className="text-jm-sm text-right text-[var(--jm-text-muted)]">
                  조립 수량
                </label>
                <JmInput
                  size="sm"
                  type="text"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  onFocus={focusCaretEnd}
                  className="max-w-[200px]"
                />
              </div>

              <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                <label className="text-jm-sm text-right text-[var(--jm-text-muted)]">
                  조립일
                </label>
                <div className="max-w-[240px]">
                  <JmDatePicker
                    size="sm"
                    value={assembledAt}
                    onChange={(d) => d && setAssembledAt(d)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                <label className="text-jm-sm text-right text-[var(--jm-text-muted)]">
                  조립비(총액)
                </label>
                <JmInput
                  size="sm"
                  type="text"
                  inputMode="numeric"
                  value={formatComma(laborCost)}
                  onChange={(e) => setLaborCost(parseComma(e.target.value))}
                  onFocus={focusCaretEnd}
                  className="max-w-[200px]"
                  placeholder="선택"
                />
              </div>

              <div className="grid grid-cols-[120px_1fr] items-start gap-2">
                <label className="text-jm-sm text-right pt-2 text-[var(--jm-text-muted)]">
                  메모
                </label>
                <JmTextarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="border-t border-[var(--jm-border)] pt-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-jm-base text-[var(--jm-text)]">
                    구성품
                  </h3>
                  <JmButton
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addComponent}
                  >
                    <Plus />
                    <span>구성품 추가</span>
                  </JmButton>
                </div>
                <p className="text-jm-xs text-[var(--jm-text-muted)] mb-2">
                  가변 슬롯에서 다른 부품을 선택하면 새 변형 SKU 가 자동 생성됩니다. 같은
                  조합이 이미 있으면 그 SKU 의 재고만 누적됩니다.
                </p>

                <JmTable>
                  <JmTableHeader>
                    <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
                      <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-32">
                        슬롯
                      </JmTableHead>
                      <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
                        상품
                      </JmTableHead>
                      <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-32 text-right">
                        1개당 수량
                      </JmTableHead>
                      <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-20"></JmTableHead>
                    </JmTableRow>
                  </JmTableHeader>
                  <JmTableBody>
                    {componentsLoading ? (
                      <ComponentsSkeletonRows />
                    ) : components.length === 0 ? (
                      <JmTableRow className="hover:bg-transparent">
                        <JmTableCell
                          colSpan={4}
                          className="text-center py-4 text-[var(--jm-text-muted)]"
                        >
                          조립상품을 선택하면 구성품이 자동 로드됩니다
                        </JmTableCell>
                      </JmTableRow>
                    ) : (
                      components.map((c, idx) => {
                        const qtyNum = parseFloat(c.quantity);
                        const isRecovery = !Number.isNaN(qtyNum) && qtyNum < 0;
                        return (
                        <JmTableRow key={idx}>
                          <JmTableCell className="text-[var(--jm-text-muted)] text-jm-xs px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <span>{c.slotLabel || "-"}</span>
                              {isRecovery && (
                                <JmBadge
                                  variant="warning"
                                  size="sm"
                                  shape="square"
                                  className="text-jm-2xs px-1 py-0"
                                >
                                  회수
                                </JmBadge>
                              )}
                              {c.slotLabelId &&
                                (c.isVariable ? (
                                  <JmBadge
                                    variant="info"
                                    size="sm"
                                    shape="square"
                                    className="text-jm-2xs px-1 py-0"
                                  >
                                    가변
                                  </JmBadge>
                                ) : (
                                  <JmBadge
                                    variant="default"
                                    size="sm"
                                    shape="square"
                                    className="text-jm-2xs px-1 py-0"
                                  >
                                    고정
                                  </JmBadge>
                                ))}
                            </div>
                          </JmTableCell>
                          <JmTableCell className="p-1">
                            <ProductCombobox
                              products={products}
                              value={c.usedItemId ?? c.componentId}
                              onChange={(p) => {
                                if (p.usedItemId) {
                                  // 중고 단품 선택 — usedItemId 채우고 componentId 는 카탈로그 매칭이면 그대로
                                  updateComponent(idx, {
                                    usedItemId: p.usedItemId,
                                    // 결과 lot.unitCost 합산에만 사용되니 componentId 는 기존 슬롯값 유지
                                  });
                                } else {
                                  // 신품 Product — 기존 흐름. usedItemId clear.
                                  updateComponent(idx, {
                                    componentId: p.id,
                                    usedItemId: null,
                                  });
                                }
                              }}
                              filterType="component"
                              disabled={!c.isVariable}
                            />
                          </JmTableCell>
                          <JmTableCell className="p-1 text-right">
                            <JmInput
                              size="sm"
                              type="text"
                              inputMode="decimal"
                              value={c.quantity}
                              onChange={(e) =>
                                updateComponent(idx, { quantity: e.target.value })
                              }
                              onFocus={focusCaretEnd}
                              disabled={!c.isVariable}
                              className="text-right"
                            />
                          </JmTableCell>
                          <JmTableCell className="p-1">
                            {c.slotId || c.slotLabelId || c.slotLabel ? null : (
                              <JmButton
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeComponent(idx)}
                              >
                                삭제
                              </JmButton>
                            )}
                          </JmTableCell>
                        </JmTableRow>
                        );
                      })
                    )}
                  </JmTableBody>
                </JmTable>
              </div>
            </div>

            <div className="border-t border-[var(--jm-border)] px-5 py-4 flex justify-end gap-2 bg-[var(--jm-bg)]">
              <JmButton
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                취소
              </JmButton>
              <JmButton
                type="button"
                variant="cta"
                onClick={submitAssembly}
                disabled={submitting}
              >
                {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
                <span>{submitting ? "처리 중..." : "등록"}</span>
              </JmButton>
            </div>
          </div>
        </JmDrawerContent>
      </JmDrawer>

      <JmDialog open={emptySlotConfirmOpen} onOpenChange={setEmptySlotConfirmOpen}>
        <JmDialogContent size="md">
          <JmDialogHeader>
            <JmDialogTitle>빈 슬롯 확인</JmDialogTitle>
            <JmDialogDescription>
              <span className="block">{emptySlotNames.join(", ")}이(가) 비었습니다.</span>
              <span className="block mt-2 text-[var(--jm-text-muted)]">
                비어있는 슬롯은 제외하고 저장됩니다. 계속 진행하시겠습니까?
              </span>
            </JmDialogDescription>
          </JmDialogHeader>
          <JmDialogFooter>
            <JmButton
              variant="ghost"
              onClick={() => setEmptySlotConfirmOpen(false)}
              disabled={submitting}
            >
              취소
            </JmButton>
            <JmButton
              variant="cta"
              onClick={confirmSubmitWithEmptySlots}
              disabled={submitting}
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              <span>계속 저장</span>
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>

      <JmDialog open={newVariantOpen} onOpenChange={setNewVariantOpen}>
        <JmDialogContent size="md">
          <JmDialogHeader>
            <JmDialogTitle>새 변형이 자동 생성되었습니다</JmDialogTitle>
            <JmDialogDescription>
              가변 슬롯의 새 조합으로 변형 SKU 가 만들어졌어요. SKU 만 수정 가능하며,
              이름은 부모 상품과 동일하게 유지됩니다 (이름이 달라야 한다면 새 상품으로
              등록해주세요).
            </JmDialogDescription>
          </JmDialogHeader>
          {newVariantData && (
            <JmDialogBody className="space-y-3">
              <div className="grid grid-cols-[80px_1fr] items-center gap-2 text-jm-sm">
                <label className="text-right text-[var(--jm-text-muted)]">상품명</label>
                <JmInput size="sm" value={newVariantData.name} disabled />
              </div>
              <div className="grid grid-cols-[80px_1fr] items-center gap-2 text-jm-sm">
                <label className="text-right text-[var(--jm-text-muted)]">SKU</label>
                <JmInput
                  size="sm"
                  value={newVariantSku}
                  onChange={(e) => setNewVariantSku(e.target.value)}
                  onFocus={focusCaretEnd}
                />
              </div>
            </JmDialogBody>
          )}
          <JmDialogFooter>
            <JmButton
              variant="ghost"
              onClick={() => {
                setNewVariantOpen(false);
                setNewVariantData(null);
              }}
              disabled={newVariantSavingSku}
            >
              자동값 그대로 사용
            </JmButton>
            <JmButton
              variant="cta"
              onClick={confirmNewVariantSku}
              disabled={newVariantSavingSku}
            >
              {newVariantSavingSku && <Loader2 className="size-4 animate-spin" />}
              <span>확인</span>
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>
    </>
  );
}
