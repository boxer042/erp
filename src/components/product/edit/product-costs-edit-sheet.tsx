"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatComma, parseComma } from "@/lib/utils";
import { diffSellingCosts, type CostInput } from "@/lib/product-mutations";
import type { ProductDetail, SellingCostItem } from "../types";

interface ProductCostsEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductDetail;
  /** null = 전사 / channelId = 채널 전용 */
  channelId?: string | null;
  channelName?: string;
}

export function ProductCostsEditSheet(props: ProductCostsEditSheetProps) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <ProductCostsEditSheetContent {...props} />}
    </Sheet>
  );
}

interface CostRow extends CostInput {
  /** UI 행 키 */
  rowId: string;
}

const newRow = (): CostRow => ({
  rowId: Math.random().toString(36).slice(2),
  name: "",
  costType: "FIXED",
  value: "",
  perUnit: false,
  isTaxable: true,
});

function ProductCostsEditSheetContent({
  onOpenChange,
  product,
  channelId = null,
  channelName,
}: ProductCostsEditSheetProps) {
  const queryClient = useQueryClient();

  // 현재 비용을 행으로 매핑 (해당 channelId 만 필터)
  const initialCosts: SellingCostItem[] = (product.sellingCosts ?? []).filter(
    (c) => c.channelId === channelId,
  );
  const [rows, setRows] = useState<CostRow[]>(() =>
    initialCosts.length > 0
      ? initialCosts.map((c) => ({
          rowId: Math.random().toString(36).slice(2),
          serverId: c.id,
          name: c.name,
          costType: c.costType as "FIXED" | "PERCENTAGE",
          value: String(c.value),
          perUnit: c.perUnit,
          isTaxable: c.isTaxable,
        }))
      : [newRow()],
  );

  const update = (rowId: string, patch: Partial<CostRow>) =>
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));

  const remove = (rowId: string) =>
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));

  const addRow = () => setRows((prev) => [...prev, newRow()]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const prev: CostInput[] = initialCosts.map((c) => ({
        serverId: c.id,
        name: c.name,
        costType: c.costType as "FIXED" | "PERCENTAGE",
        value: String(c.value),
        perUnit: c.perUnit,
        isTaxable: c.isTaxable,
      }));
      const next: CostInput[] = rows.map((r) => ({
        serverId: r.serverId,
        name: r.name,
        costType: r.costType,
        value: r.value,
        perUnit: r.perUnit,
        isTaxable: r.isTaxable,
      }));
      const result = await diffSellingCosts(product.id, channelId, prev, next);
      if (result.failed.length > 0) {
        throw new Error(`일부 항목 실패: ${result.failed.join(", ")}`);
      }
    },
    onSuccess: () => {
      toast.success("판매비용이 저장되었습니다");
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : err.message || "저장에 실패했습니다"),
  });

  const title = channelId ? `${channelName ?? "채널"} 전용 판매비용` : "전사 판매비용";

  return (
    <SheetContent side="bottom" className="h-[90vh] p-0 flex flex-col">
      <SheetHeader className="border-b border-border px-5 py-4 flex-shrink-0">
        <SheetTitle>{title} 편집</SheetTitle>
        <SheetDescription className="text-xs">
          비용 항목을 추가/수정/삭제합니다. FIXED 금액은 VAT 포함값으로 입력하면 원가 계산 시 자동으로 공급가액 환산됩니다.
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {rows.map((row) => (
            <div key={row.rowId} className="rounded-md border border-border p-3 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_140px_auto] gap-2 items-end">
                <FieldSm label="비용 항목명">
                  <Input
                    value={row.name}
                    onChange={(e) => update(row.rowId, { name: e.target.value })}
                    placeholder="예: 포장비, 완충재"
                    className="h-9"
                  />
                </FieldSm>
                <FieldSm label="유형">
                  <Select
                    value={row.costType}
                    onValueChange={(v) =>
                      update(row.rowId, {
                        costType: (v ?? row.costType) as "FIXED" | "PERCENTAGE",
                      })
                    }
                  >
                    <SelectTrigger className="!h-9 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FIXED">고정 금액</SelectItem>
                      <SelectItem value="PERCENTAGE">비율 (%)</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldSm>
                <FieldSm label={row.costType === "FIXED" ? "금액 (VAT포함)" : "비율(%)"}>
                  <Input
                    type="text"
                    inputMode={row.costType === "FIXED" ? "numeric" : "decimal"}
                    value={
                      row.costType === "FIXED" ? formatComma(row.value) : row.value
                    }
                    onChange={(e) => {
                      const v =
                        row.costType === "FIXED"
                          ? parseComma(e.target.value)
                          : e.target.value;
                      update(row.rowId, { value: v });
                    }}
                    onFocus={(e) => e.currentTarget.select()}
                    className="h-9"
                  />
                </FieldSm>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(row.rowId)}
                  aria-label="행 삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FieldSm label="적용 단위">
                  <Select
                    value={row.perUnit ? "true" : "false"}
                    onValueChange={(v) =>
                      update(row.rowId, { perUnit: v === "true" })
                    }
                  >
                    <SelectTrigger className="!h-9 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">개당</SelectItem>
                      <SelectItem value="false">건당</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldSm>
                <FieldSm label="과세 여부">
                  <Select
                    value={row.isTaxable ? "true" : "false"}
                    onValueChange={(v) =>
                      update(row.rowId, { isTaxable: v === "true" })
                    }
                  >
                    <SelectTrigger className="!h-9 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">과세 (세금계산서)</SelectItem>
                      <SelectItem value="false">면세</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldSm>
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full"
            onClick={addRow}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            비용 항목 추가
          </Button>
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
  );
}

function FieldSm({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
