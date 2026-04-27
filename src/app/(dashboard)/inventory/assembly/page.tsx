"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Loader2, Plus, Undo2 } from "lucide-react";
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
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";
import { formatComma, parseComma } from "@/lib/utils";

interface AssemblyRow {
  id: string;
  assemblyNo: string;
  productId: string;
  product: { id: string; name: string; sku: string };
  quantity: string;
  type: "PRODUCE" | "DISASSEMBLE";
  laborCost: string | null;
  assembledAt: string;
  memo: string | null;
  reverseOfId: string | null;
  _count: { consumptions: number };
}

interface ComponentRow {
  componentId: string;
  quantity: string;
}

export default function AssemblyPage() {
  const [rows, setRows] = useState<AssemblyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<ProductOption[]>([]);

  // register sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [assembledAt, setAssembledAt] = useState<Date>(new Date());
  const [laborCost, setLaborCost] = useState("");
  const [memo, setMemo] = useState("");
  const [components, setComponents] = useState<ComponentRow[]>([]);

  // disassemble dialog
  const [disOpen, setDisOpen] = useState(false);
  const [disTarget, setDisTarget] = useState<AssemblyRow | null>(null);
  const [disSubmitting, setDisSubmitting] = useState(false);

  const fetchAssemblies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/assemblies");
      if (res.ok) setRows(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    const res = await fetch("/api/products");
    if (res.ok) {
      const data = await res.json();
      setProducts(
        data.map((p: {
          id: string; name: string; sku: string;
          sellingPrice: string; unitCost: string | null;
          unitOfMeasure: string; isSet: boolean;
        }) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          sellingPrice: p.sellingPrice,
          unitCost: p.unitCost,
          unitOfMeasure: p.unitOfMeasure,
          isSet: p.isSet,
        })),
      );
    }
  }, []);

  useEffect(() => {
    fetchAssemblies();
    fetchProducts();
  }, [fetchAssemblies, fetchProducts]);

  const resetForm = () => {
    setProductId("");
    setQuantity("1");
    setAssembledAt(new Date());
    setLaborCost("");
    setMemo("");
    setComponents([]);
  };

  const openRegister = () => {
    resetForm();
    setSheetOpen(true);
  };

  // 조립상품 선택 시 setComponents 자동 로드
  const handleProductChange = async (p: ProductOption) => {
    setProductId(p.id);
    const res = await fetch(`/api/products/${p.id}`);
    if (res.ok) {
      const detail = await res.json();
      const setComps = detail.setComponents ?? [];
      setComponents(
        setComps.map((c: { componentId: string; quantity: string }) => ({
          componentId: c.componentId,
          quantity: c.quantity,
        })),
      );
    } else {
      setComponents([]);
    }
  };

  const addComponent = () =>
    setComponents((prev) => [...prev, { componentId: "", quantity: "1" }]);

  const removeComponent = (idx: number) =>
    setComponents((prev) => prev.filter((_, i) => i !== idx));

  const updateComponent = (idx: number, patch: Partial<ComponentRow>) =>
    setComponents((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    );

  const submitAssembly = async () => {
    if (!productId) {
      toast.error("조립상품을 선택해주세요");
      return;
    }
    if (components.length === 0) {
      toast.error("구성품을 추가해주세요");
      return;
    }
    if (components.some((c) => !c.componentId || !c.quantity)) {
      toast.error("구성품과 수량을 모두 입력해주세요");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/assemblies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          quantity,
          assembledAt: assembledAt.toISOString(),
          laborCost: laborCost ? laborCost : undefined,
          memo: memo || undefined,
          components,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(typeof err.error === "string" ? err.error : "등록 실패");
        return;
      }
      toast.success("조립 실적이 등록되었습니다");
      setSheetOpen(false);
      fetchAssemblies();
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDisassemble = async () => {
    if (!disTarget) return;
    setDisSubmitting(true);
    try {
      const res = await fetch(`/api/assemblies/${disTarget.id}/disassemble`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(typeof err.error === "string" ? err.error : "역조립 실패");
        return;
      }
      toast.success("역조립이 완료되었습니다");
      setDisOpen(false);
      setDisTarget(null);
      fetchAssemblies();
    } finally {
      setDisSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <DataTableToolbar
        onRefresh={fetchAssemblies}
        onAdd={openRegister}
        addLabel="조립 실적 등록"
        loading={loading}
      />

      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>조립번호</TableHead>
              <TableHead>조립상품</TableHead>
              <TableHead className="text-right">수량</TableHead>
              <TableHead>유형</TableHead>
              <TableHead className="text-right">조립비</TableHead>
              <TableHead>조립일</TableHead>
              <TableHead>메모</TableHead>
              <TableHead className="w-28"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  로딩 중...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  등록된 조립 실적이 없습니다
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">
                    {r.assemblyNo}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{r.product.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {r.product.sku}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {Number(r.quantity).toLocaleString("ko-KR")}
                  </TableCell>
                  <TableCell>
                    {r.type === "PRODUCE" ? (
                      <Badge variant="default">조립</Badge>
                    ) : (
                      <Badge variant="destructive">역조립</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.laborCost
                      ? `₩${Number(r.laborCost).toLocaleString("ko-KR")}`
                      : "-"}
                  </TableCell>
                  <TableCell>
                    {format(new Date(r.assembledAt), "yyyy-MM-dd")}
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {r.memo ?? "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.type === "PRODUCE" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[12px]"
                        onClick={() => {
                          setDisTarget(r);
                          setDisOpen(true);
                        }}
                      >
                        <Undo2 data-icon="inline-start" />
                        역조립
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="h-[90vh] p-0 flex flex-col">
          <SheetHeader className="border-b border-border px-5 py-4 flex-shrink-0">
            <SheetTitle>조립 실적 등록</SheetTitle>
          </SheetHeader>

          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
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
                    <Calendar
                      mode="single"
                      selected={assembledAt}
                      onSelect={(d) => d && setAssembledAt(d)}
                    />
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
                <Textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">구성품</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addComponent}
                  >
                    <Plus data-icon="inline-start" />
                    구성품 추가
                  </Button>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>상품</TableHead>
                      <TableHead className="w-32 text-right">
                        1개당 수량
                      </TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {components.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-4">
                          조립상품을 선택하면 구성품이 자동 로드됩니다
                        </TableCell>
                      </TableRow>
                    ) : (
                      components.map((c, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="p-1">
                            <ProductCombobox
                              products={products}
                              value={c.componentId}
                              onChange={(p) =>
                                updateComponent(idx, { componentId: p.id })
                              }
                              filterType="component"
                            />
                          </TableCell>
                          <TableCell className="p-1 text-right">
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={c.quantity}
                              onChange={(e) =>
                                updateComponent(idx, { quantity: e.target.value })
                              }
                              onFocus={(e) => e.currentTarget.select()}
                              className="text-right"
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeComponent(idx)}
                            >
                              삭제
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="border-t border-border px-5 py-4 flex justify-end gap-2 bg-background">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSheetOpen(false)}
              >
                취소
              </Button>
              <Button
                type="button"
                onClick={submitAssembly}
                disabled={submitting}
              >
                {submitting ? <Loader2 className="animate-spin" /> : null}
                <span>{submitting ? "처리 중..." : "등록"}</span>
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={disOpen} onOpenChange={setDisOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>역조립 확인</DialogTitle>
            <DialogDescription>
              {disTarget && (
                <>
                  <span className="block">
                    조립번호 {disTarget.assemblyNo} 을(를) 역조립하면 완제품 재고가
                    차감되고 구성품 재고가 원래 로트로 복원됩니다.
                  </span>
                  <span className="block mt-2 font-medium">진행하시겠습니까?</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisOpen(false)}>
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDisassemble}
              disabled={disSubmitting}
            >
              {disSubmitting ? <Loader2 className="animate-spin" /> : null}
              역조립
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
