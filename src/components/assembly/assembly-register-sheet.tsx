"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Loader2, Plus } from "lucide-react";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";
import { formatComma, parseComma } from "@/lib/utils";

interface ComponentRow {
  componentId: string;
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
        <TableRow key={i}>
          <TableCell><Skeleton className="h-3 w-16" /></TableCell>
          <TableCell className="p-1"><Skeleton className="h-9 w-full rounded-lg" /></TableCell>
          <TableCell className="p-1 text-right">
            <div className="flex justify-end"><Skeleton className="h-9 w-full rounded-lg" /></div>
          </TableCell>
          <TableCell className="p-1"><Skeleton className="h-7 w-12 rounded-md" /></TableCell>
        </TableRow>
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
  const [newVariantData, setNewVariantData] = useState<{ id: string; name: string; sku: string } | null>(null);
  const [newVariantSku, setNewVariantSku] = useState("");
  const [newVariantSavingSku, setNewVariantSavingSku] = useState(false);

  const fetchProducts = useCallback(async () => {
    try {
      const data = await apiGet<Array<{
        id: string; name: string; sku: string;
        sellingPrice: string; unitCost: string | null;
        unitOfMeasure: string; isSet: boolean;
      }>>("/api/products?isBulk=all");
      setProducts(
        data.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          sellingPrice: p.sellingPrice,
          unitCost: p.unitCost,
          unitOfMeasure: p.unitOfMeasure,
          isSet: p.isSet,
        })),
      );
    } catch {
      // ignore
    }
  }, []);

  // 시트 열릴 때마다 상품 로드 + 폼 초기화
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

  // initialProductId 가 있으면 products 로드 후 자동 선택
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (!open || !initialProductId || autoSelectedRef.current) return;
    if (products.length === 0) return;
    const match = products.find((p) => p.id === initialProductId);
    if (!match) return;
    autoSelectedRef.current = true;
    handleProductChange(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, products, initialProductId]);

  // 시트 닫히면 autoSelected 초기화 (다음에 또 열면 다시 자동 선택)
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
          slots?: Array<{ id: string; slotLabelId: string | null; label: string; isVariable: boolean }>;
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
      const slots: Array<{ id: string; slotLabelId: string | null; label: string; isVariable: boolean }> =
        detail.assemblyTemplate?.slots ?? [];
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
        if (s.label && s.label.trim()) variableByKey.set(`LBL:${s.label.trim()}`, s.isVariable);
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
      { componentId: "", quantity: "1", slotId: null, slotLabelId: null, slotLabel: null, isVariable: true },
    ]);

  const removeComponent = (idx: number) =>
    setComponents((prev) => prev.filter((_, i) => i !== idx));

  const updateComponent = (idx: number, patch: Partial<ComponentRow>) =>
    setComponents((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const performAssemblySubmit = async (filteredComponents: ComponentRow[]) => {
    setSubmitting(true);
    try {
      const data = await apiMutate<{ newVariant?: { id: string; name: string; sku: string } | null }>(
        "/api/assemblies",
        "POST",
        {
          productId,
          quantity,
          assembledAt: assembledAt.toISOString(),
          laborCost: laborCost ? laborCost : undefined,
          memo: memo || undefined,
          components: filteredComponents.map((c) => ({
            componentId: c.componentId,
            quantity: c.quantity,
            slotId: c.slotId ?? null,
            slotLabelId: c.slotLabelId ?? null,
            slotLabel: c.slotLabel ?? null,
          })),
        },
      );
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
      await apiMutate(`/api/products/${newVariantData.id}`, "PATCH", { sku: newVariantSku.trim() });
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
      const hasComponent = c.componentId.trim().length > 0;
      const qty = parseFloat(c.quantity);
      const hasQuantity = !Number.isNaN(qty) && qty > 0;
      if (hasComponent && hasQuantity) {
        filledComponents.push(c);
      } else {
        emptyNames.push(c.slotLabel?.trim() ? `${c.slotLabel} 슬롯` : `${idx + 1}번 행`);
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
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="p-0 flex flex-col"
          style={{ height: "90vh", maxHeight: "90vh" }}
        >
          <SheetHeader className="border-b border-border px-5 py-4 flex-shrink-0">
            <SheetTitle>조립 실적 등록</SheetTitle>
          </SheetHeader>

          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
              {showProductPicker && (
                <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                  <label className="text-sm text-right">조립상품</label>
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
                <label className="text-sm text-right">조립 수량</label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  className="max-w-[200px]"
                />
              </div>

              <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                <label className="text-sm text-right">조립일</label>
                <Popover>
                  <PopoverTrigger className="flex h-9 max-w-[240px] items-center rounded-lg border border-input bg-transparent px-3 text-sm hover:bg-accent/50">
                    {format(assembledAt, "yyyy년 M월 d일", { locale: ko })}
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={assembledAt} onSelect={(d) => d && setAssembledAt(d)} />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                <label className="text-sm text-right">조립비(총액)</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={formatComma(laborCost)}
                  onChange={(e) => setLaborCost(parseComma(e.target.value))}
                  onFocus={(e) => e.currentTarget.select()}
                  className="max-w-[200px]"
                  placeholder="선택"
                />
              </div>

              <div className="grid grid-cols-[120px_1fr] items-start gap-2">
                <label className="text-sm text-right pt-2">메모</label>
                <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} />
              </div>

              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">구성품</h3>
                  <Button type="button" variant="outline" size="sm" onClick={addComponent}>
                    <Plus data-icon="inline-start" />
                    구성품 추가
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mb-2">
                  가변 슬롯에서 다른 부품을 선택하면 새 변형 SKU 가 자동 생성됩니다.
                  같은 조합이 이미 있으면 그 SKU 의 재고만 누적됩니다.
                </p>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">슬롯</TableHead>
                      <TableHead>상품</TableHead>
                      <TableHead className="w-32 text-right">1개당 수량</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {componentsLoading ? (
                      <ComponentsSkeletonRows />
                    ) : components.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-4">
                          조립상품을 선택하면 구성품이 자동 로드됩니다
                        </TableCell>
                      </TableRow>
                    ) : (
                      components.map((c, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-muted-foreground text-xs">
                            <div className="flex items-center gap-1.5">
                              <span>{c.slotLabel || "-"}</span>
                              {c.slotLabelId && (
                                c.isVariable ? (
                                  <Badge variant="default" className="text-[10px] px-1 py-0">가변</Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[10px] px-1 py-0">고정</Badge>
                                )
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="p-1">
                            <ProductCombobox
                              products={products}
                              value={c.componentId}
                              onChange={(p) => updateComponent(idx, { componentId: p.id })}
                              filterType="component"
                              disabled={!c.isVariable}
                            />
                          </TableCell>
                          <TableCell className="p-1 text-right">
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={c.quantity}
                              onChange={(e) => updateComponent(idx, { quantity: e.target.value })}
                              onFocus={(e) => e.currentTarget.select()}
                              disabled={!c.isVariable}
                              className="text-right"
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            {(c.slotId || c.slotLabelId || c.slotLabel) ? null : (
                              <Button type="button" variant="ghost" size="sm" onClick={() => removeComponent(idx)}>
                                삭제
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="border-t border-border px-5 py-4 flex justify-end gap-2 bg-background">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                취소
              </Button>
              <Button type="button" onClick={submitAssembly} disabled={submitting}>
                {submitting ? <Loader2 className="animate-spin" /> : null}
                <span>{submitting ? "처리 중..." : "등록"}</span>
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={emptySlotConfirmOpen} onOpenChange={setEmptySlotConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>빈 슬롯 확인</DialogTitle>
            <DialogDescription>
              <span className="block">{emptySlotNames.join(", ")}이(가) 비었습니다.</span>
              <span className="block mt-2 text-muted-foreground">
                비어있는 슬롯은 제외하고 저장됩니다. 계속 진행하시겠습니까?
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmptySlotConfirmOpen(false)} disabled={submitting}>
              취소
            </Button>
            <Button onClick={confirmSubmitWithEmptySlots} disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : null}
              계속 저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newVariantOpen} onOpenChange={setNewVariantOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>새 변형이 자동 생성되었습니다</DialogTitle>
            <DialogDescription>
              가변 슬롯의 새 조합으로 변형 SKU 가 만들어졌어요. SKU 만 수정 가능하며,
              이름은 부모 상품과 동일하게 유지됩니다 (이름이 달라야 한다면 새 상품으로 등록해주세요).
            </DialogDescription>
          </DialogHeader>
          {newVariantData && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-[80px_1fr] items-center gap-2 text-sm">
                <label className="text-right text-muted-foreground">상품명</label>
                <Input value={newVariantData.name} disabled />
              </div>
              <div className="grid grid-cols-[80px_1fr] items-center gap-2 text-sm">
                <label className="text-right text-muted-foreground">SKU</label>
                <Input
                  value={newVariantSku}
                  onChange={(e) => setNewVariantSku(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setNewVariantOpen(false);
                setNewVariantData(null);
              }}
              disabled={newVariantSavingSku}
            >
              자동값 그대로 사용
            </Button>
            <Button onClick={confirmNewVariantSku} disabled={newVariantSavingSku}>
              {newVariantSavingSku ? <Loader2 className="animate-spin" /> : null}
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
