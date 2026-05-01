"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { ArrowLeft, Pencil, Plus, Trash2, Loader2 } from "lucide-react";
import Loading from "./loading";
import { toast } from "sonner";
import { formatComma, parseComma } from "@/lib/utils";
import { computeUnitCost } from "@/lib/cost-utils";
import { MappingSheet } from "@/components/mapping-sheet";
import { ShippingHistoryCard } from "@/components/shipping-history-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UNITS_OF_MEASURE } from "@/lib/constants";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface IncomingCost {
  id: string;
  name: string;
  costType: "FIXED" | "PERCENTAGE";
  value: string;
  perUnit: boolean;
  isTaxable: boolean;
}

interface ProductMapping {
  id: string;
  conversionRate: string;
  product: {
    id: string;
    name: string;
    sku: string;
    sellingPrice: string;
    taxType: string;
    sellingCosts: Array<{ costType: string; value: string; perUnit: boolean }>;
  };
}

interface IncomingItem {
  id: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  unitCostSnapshot: number;
  shippingAllocation: number;
  shippingPercent: number;
  shippingIsTaxable: boolean;
  hasItemOverride?: boolean;
  hasAllocated?: boolean;
  incoming: {
    id: string;
    incomingNo: string;
    incomingDate: string;
    shippingCost: string;
    shippingIsTaxable: boolean;
    shippingDeducted: boolean;
  };
}

interface PriceHistory {
  id: string;
  oldPrice: string;
  newPrice: string;
  changeAmount: string;
  changePercent: string;
  reason: string | null;
  incomingId: string | null;
  createdAt: string;
}

interface SupplierProductDetail {
  id: string;
  name: string;
  spec: string | null;
  supplierCode: string | null;
  unitOfMeasure: string;
  listPrice: string;
  unitPrice: string;
  isTaxable: boolean;
  currency: string;
  leadTimeDays: number | null;
  minOrderQty: number;
  memo: string | null;
  supplier: { id: string; name: string };
  productMappings: ProductMapping[];
  incomingCosts: IncomingCost[];
  incomingItems: IncomingItem[];
  priceHistory: PriceHistory[];
  avgShippingCost: number | null;
  avgShippingIsTaxable: boolean;
  activeLots: ActiveLot[];
}

interface ActiveLot {
  id: string;
  receivedAt: string;
  receivedQty: string;
  remainingQty: string;
  unitCost: string;
  source: string;
  product: { id: string; name: string; sku: string } | null;
  incomingId: string | null;
  incomingNo: string | null;
  shippingPerUnit: number;
  shippingIsTaxable: boolean;
  shippingSource: "ITEM" | "ALLOCATED" | "DEDUCTED" | "ZERO";
  isCurrentlyConsuming: boolean;
}

function fmt(v: string | number) {
  return parseFloat(v.toString()).toLocaleString("ko-KR");
}

export default function SupplierProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/supplier-products");
    }
  };
  const [product, setProduct] = useState<SupplierProductDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // 수정 상태
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<SupplierProductDetail>>({});
  const [saving, setSaving] = useState(false);

  // 매핑 Sheet
  const [mappingOpen, setMappingOpen] = useState(false);

  // 입고 비용 추가 폼
  const [costName, setCostName] = useState("");
  const [costType, setCostType] = useState<"FIXED" | "PERCENTAGE">("FIXED");
  const [costValue, setCostValue] = useState("");
  const [costPerUnit, setCostPerUnit] = useState(true);
  const [costIsTaxable, setCostIsTaxable] = useState(true);
  const [addingCost, setAddingCost] = useState(false);

  const fetchProduct = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/supplier-products/${id}`);
    if (!res.ok) { setLoading(false); return; }
    const data = await res.json();
    setProduct(data);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchProduct(); }, [fetchProduct]);

  const startEdit = () => {
    if (!product) return;
    setEditForm({
      name: product.name,
      spec: product.spec ?? "",
      supplierCode: product.supplierCode ?? "",
      unitOfMeasure: product.unitOfMeasure,
      listPrice: product.listPrice,
      unitPrice: product.unitPrice,
      isTaxable: product.isTaxable,
      leadTimeDays: product.leadTimeDays,
      minOrderQty: product.minOrderQty,
      memo: product.memo ?? "",
    });
    setEditing(true);
  };

  const handleSave = async () => {
    if (!product) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/supplier-products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: product.supplier.id,
          name: editForm.name,
          spec: editForm.spec ?? "",
          supplierCode: editForm.supplierCode ?? "",
          unitOfMeasure: editForm.unitOfMeasure,
          listPrice: editForm.listPrice ?? editForm.unitPrice ?? "0",
          unitPrice: editForm.unitPrice,
          isTaxable: editForm.isTaxable,
          currency: product.currency,
          leadTimeDays: editForm.leadTimeDays,
          minOrderQty: editForm.minOrderQty,
          memo: editForm.memo ?? "",
        }),
      });
      if (!res.ok) { toast.error("저장에 실패했습니다"); return; }
      toast.success("저장되었습니다");
      setEditing(false);
      await fetchProduct();
    } finally { setSaving(false); }
  };

  const handleAddCost = async () => {
    if (!costName.trim() || !costValue) { toast.error("이름과 금액을 입력해주세요"); return; }
    setAddingCost(true);
    try {
      const res = await fetch(`/api/supplier-products/${id}/costs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: costName.trim(), costType, value: costValue, perUnit: costPerUnit, isTaxable: costIsTaxable }),
      });
      if (!res.ok) { toast.error("비용 추가에 실패했습니다"); return; }
      setCostName(""); setCostValue(""); setCostType("FIXED"); setCostPerUnit(true); setCostIsTaxable(true);
      await fetchProduct();
      toast.success("비용이 추가되었습니다");
    } finally { setAddingCost(false); }
  };

  const handleDeleteCost = async (costId: string) => {
    await fetch(`/api/supplier-products/${id}/costs?costId=${costId}`, { method: "DELETE" });
    await fetchProduct();
  };

  if (loading) return <Loading />;

  if (!product) {
    return (
      <div className="p-6 text-muted-foreground">상품을 찾을 수 없습니다</div>
    );
  }

  const lastIncoming = product.incomingItems[0];
  const lastIncomingDate = lastIncoming
    ? new Date(lastIncoming.incoming.incomingDate).toLocaleDateString("ko-KR")
    : "-";

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon-xs" onClick={handleBack} aria-label="뒤로가기">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold truncate">{product.name}</h1>
            {!product.isTaxable && <Badge variant="outline" className="text-xs shrink-0">면세</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">{product.supplier.name}</p>
        </div>
        {!editing ? (
          <Button variant="outline" size="sm" onClick={startEdit}>
            <Pencil className="size-3.5 mr-1.5" />수정
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>취소</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}저장
            </Button>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 min-h-0">
      {/* 요약 카드 */}
      {(() => {
        const unit = parseFloat(product.unitPrice) || 0;

        // 원가
        const costSupply = unit;
        const costTax = product.isTaxable ? Math.round(unit * 0.1) : 0;
        const costTotal = costSupply + costTax;

        // 입고배송비
        const shipTotal = product.avgShippingCost ?? 0;
        const shipSupply = product.avgShippingIsTaxable ? Math.round(shipTotal / 1.1) : shipTotal;
        const shipTax = Math.round(shipTotal - shipSupply);
        const shipHas = product.avgShippingCost !== null && product.avgShippingCost !== undefined;

        // 입고부대비용
        let extraSupply = 0;
        let extraTax = 0;
        for (const c of product.incomingCosts) {
          const v = parseFloat(c.value) || 0;
          if (c.costType === "FIXED") {
            const supply = c.isTaxable ? Math.round(v / 1.1) : v;
            const tax = c.isTaxable ? v - supply : 0;
            extraSupply += supply;
            extraTax += tax;
          } else {
            const amount = (unit * v) / 100;
            extraSupply += amount;
            extraTax += c.isTaxable ? Math.round(amount * 0.1) : 0;
          }
        }
        const extraTotal = extraSupply + extraTax;
        const extraHas = product.incomingCosts.length > 0;

        type KpiData = { label: string; supply: number; tax: number; total: number; show: boolean };
        const kpis: KpiData[] = [
          { label: "원가", supply: costSupply, tax: costTax, total: costTotal, show: true },
          { label: "입고배송비", supply: shipSupply, tax: shipTax, total: shipTotal, show: shipHas },
          { label: "입고부대비용", supply: extraSupply, tax: extraTax, total: extraTotal, show: extraHas },
        ];

        return (
          <div className="grid grid-cols-5 gap-4 px-6 py-4 border-b border-border">
            {kpis.map((k) => (
              <div key={k.label} className="bg-card rounded-lg p-4 border border-border">
                <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
                {k.show && k.total > 0 ? (
                  <>
                    <p className="text-lg font-bold tabular-nums">₩{Math.round(k.total).toLocaleString("ko-KR")}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">공급가 ₩{Math.round(k.supply).toLocaleString("ko-KR")}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">세액 ₩{Math.round(k.tax).toLocaleString("ko-KR")}</p>
                  </>
                ) : (
                  <p className="text-lg font-bold text-muted-foreground">—</p>
                )}
              </div>
            ))}
            <div className="bg-card rounded-lg p-4 border border-border">
              <p className="text-xs text-muted-foreground mb-1">총 입고 횟수</p>
              <p className="text-lg font-bold">{product.incomingItems.length}건</p>
            </div>
            <div className="bg-card rounded-lg p-4 border border-border">
              <p className="text-xs text-muted-foreground mb-1">마지막 입고일</p>
              <p className="text-lg font-bold">{lastIncomingDate}</p>
            </div>
          </div>
        );
      })()}

      <div className="px-6 py-6 space-y-6">
        {/* 기본 정보 */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">기본 정보</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-[13px]">
              {[
                { label: "거래처", value: product.supplier.name, noEdit: true },
                { label: "품명", field: "name" },
                { label: "단위", field: "unitOfMeasure", isSelect: true },
                { label: "규격", field: "spec" },
                { label: "정가 (세전)", field: "listPrice", type: "number" },
                { label: "실제 단가 (세전)", field: "unitPrice", type: "number" },
                { label: "품번", field: "supplierCode" },
                { label: "부가세", field: "isTaxable", isTaxableToggle: true },
                { label: "리드타임 (일)", field: "leadTimeDays", type: "number" },
                { label: "최소발주량", field: "minOrderQty", type: "number" },
              ].map(({ label, value, field, noEdit, type, isSelect, isTaxableToggle }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-muted-foreground w-28 shrink-0">{label}</span>
                  {editing && !noEdit ? (
                    isTaxableToggle ? (
                      <div className="flex h-7 rounded-md border border-border text-[12px] overflow-hidden">
                        <button type="button" onClick={() => setEditForm(p => ({ ...p, isTaxable: true }))} className={`px-2.5 ${editForm.isTaxable ? "bg-secondary text-foreground" : "text-muted-foreground"}`}>과세</button>
                        <button type="button" onClick={() => setEditForm(p => ({ ...p, isTaxable: false }))} className={`px-2.5 ${!editForm.isTaxable ? "bg-secondary text-foreground" : "text-muted-foreground"}`}>면세</button>
                      </div>
                    ) : isSelect ? (
                      <Select value={editForm.unitOfMeasure as string} onValueChange={(v) => setEditForm(p => ({ ...p, unitOfMeasure: v ?? "EA" }))}>
                        <SelectTrigger className="h-7 text-[13px] w-32">
                          <span>{editForm.unitOfMeasure as string}</span>
                        </SelectTrigger>
                        <SelectContent>
                          {UNITS_OF_MEASURE.map((u) => (
                            <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type={type ?? "text"}
                        value={(editForm[field as keyof typeof editForm] as string) ?? ""}
                        onChange={(e) => setEditForm(p => ({ ...p, [field!]: e.target.value }))}
                        className="h-7 text-[13px] w-40"
                      />
                    )
                  ) : (
                    <span>
                      {isTaxableToggle
                        ? (product.isTaxable ? "과세" : "면세")
                        : isSelect
                        ? product.unitOfMeasure
                        : (value ?? (field ? String((product as unknown as Record<string, unknown>)[field!] ?? "-") : "-"))}
                    </span>
                  )}
                </div>
              ))}
              <div className="col-span-2 flex items-start gap-2">
                <span className="text-muted-foreground w-28 shrink-0 pt-1">메모</span>
                {editing ? (
                  <Input
                    value={(editForm.memo as string) ?? ""}
                    onChange={(e) => setEditForm(p => ({ ...p, memo: e.target.value }))}
                    className="h-7 text-[13px] flex-1"
                  />
                ) : (
                  <span className="text-muted-foreground">{product.memo || "-"}</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 매핑된 판매상품 */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">매핑된 판매상품</CardTitle>
            <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => setMappingOpen(true)}>
              매핑 관리
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {product.productMappings.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">매핑된 판매상품이 없습니다</p>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-muted text-muted-foreground text-xs border-b border-border">
                    <th className="py-2 px-3 text-left font-medium">판매상품명</th>
                    <th className="py-2 px-3 text-left font-medium">SKU</th>
                    <th className="py-2 px-3 text-right font-medium">환산비율</th>
                    <th className="py-2 px-3 text-right font-medium">공급가액</th>
                    <th className="py-2 px-3 text-right font-medium">세액</th>
                    <th className="py-2 px-3 text-right font-medium">판매가</th>
                    <th className="py-2 px-3 text-right font-medium">예상 마진율</th>
                  </tr>
                </thead>
                <tbody>
                  {product.productMappings.map((m) => {
                    const conv = parseFloat(m.conversionRate);
                    const sellingPrice = parseFloat(m.product.sellingPrice);
                    const isTaxable = m.product.taxType === "TAXABLE";
                    const taxAmount = isTaxable ? Math.round(sellingPrice * 0.1) : 0;
                    const sellingPriceWithTax = sellingPrice + taxAmount;
                    const unitCost = computeUnitCost({
                      unitPrice: parseFloat(product.unitPrice),
                      conversionRate: conv,
                      incomingCosts: product.incomingCosts.map((c) => ({
                        costType: c.costType,
                        value: c.value,
                        isTaxable: c.isTaxable,
                      })),
                    });
                    const fixedSellingCost = m.product.sellingCosts
                      .filter((c) => c.costType === "FIXED" && c.perUnit)
                      .reduce((sum, c) => sum + parseFloat(c.value), 0);
                    const pctSellingCost = m.product.sellingCosts
                      .filter((c) => c.costType === "PERCENTAGE" && c.perUnit)
                      .reduce((sum, c) => sum + sellingPrice * parseFloat(c.value) / 100, 0);
                    const totalCost = unitCost + fixedSellingCost + pctSellingCost;
                    const margin = sellingPrice > 0 ? ((sellingPrice - totalCost) / sellingPrice) * 100 : null;
                    return (
                      <tr key={m.id} className="border-b border-border hover:bg-muted/50">
                        <td className="px-3 py-2.5 font-medium">{m.product.name}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{m.product.sku}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{conv}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">₩{fmt(sellingPrice)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {taxAmount > 0 ? `₩${taxAmount.toLocaleString("ko-KR")}` : "-"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">₩{sellingPriceWithTax.toLocaleString("ko-KR")}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {margin !== null ? (
                            <span className={margin >= 20 ? "text-green-500" : margin >= 10 ? "text-foreground" : "text-red-500"}>
                              {margin.toFixed(1)}%
                            </span>
                          ) : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* 재고 로트 (사용 중) */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              재고 로트 (잔여)
              <span className="ml-2 text-[11px] font-normal text-muted-foreground/70">
                FIFO 순. 첫 행이 다음 소진 대상 (사용 중)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {(product.activeLots ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">잔여 재고 로트가 없습니다</p>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-muted text-muted-foreground text-xs border-b border-border">
                    <th className="py-2 px-3 text-left font-medium">상태</th>
                    <th className="py-2 px-3 text-left font-medium">입고일</th>
                    <th className="py-2 px-3 text-left font-medium">전표</th>
                    <th className="py-2 px-3 text-left font-medium">매핑상품</th>
                    <th className="py-2 px-3 text-right font-medium">입고수량</th>
                    <th className="py-2 px-3 text-right font-medium">잔량</th>
                    <th className="py-2 px-3 text-right font-medium">단가</th>
                    <th className="py-2 px-3 text-right font-medium">배송비(개당)</th>
                  </tr>
                </thead>
                <tbody>
                  {(product.activeLots ?? []).map((lot) => (
                    <tr
                      key={lot.id}
                      className={`border-b border-border ${
                        lot.isCurrentlyConsuming ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/50"
                      }`}
                    >
                      <td className="px-3 py-2.5">
                        {lot.isCurrentlyConsuming ? (
                          <Badge variant="default" className="text-[10px]">사용 중</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">대기</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                        {new Date(lot.receivedAt).toLocaleDateString("ko-KR")}
                      </td>
                      <td className="px-3 py-2.5">
                        {lot.incomingNo && lot.incomingId ? (
                          <Link
                            href={`/inventory/incoming?incomingId=${lot.incomingId}`}
                            className="text-foreground hover:text-primary underline-offset-4 hover:underline"
                          >
                            {lot.incomingNo}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs">
                        {lot.product?.name ?? <span className="text-yellow-500">미매핑(오르판)</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {parseFloat(lot.receivedQty).toLocaleString("ko-KR")}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                        {parseFloat(lot.remainingQty).toLocaleString("ko-KR")}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        ₩{Math.round(parseFloat(lot.unitCost)).toLocaleString("ko-KR")}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {lot.shippingPerUnit > 0 ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <span>₩{Math.round(lot.shippingPerUnit).toLocaleString("ko-KR")}</span>
                            <span
                              className={`text-[10px] px-1 py-0.5 rounded ${
                                lot.shippingSource === "ITEM"
                                  ? "bg-primary/10 text-primary"
                                  : lot.shippingSource === "DEDUCTED"
                                    ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                                    : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {lot.shippingSource === "ITEM"
                                ? "직접"
                                : lot.shippingSource === "DEDUCTED"
                                  ? "차감"
                                  : lot.shippingSource === "ALLOCATED"
                                    ? "분배"
                                    : "0원"}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* 입고 배송비 이력 */}
        <ShippingHistoryCard supplierProductId={product.id} />

        {/* 입고 부대비용 */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">입고 부대비용</CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              ※ 배송비/택배비는 여기에 등록할 수 없습니다. 입고 전표의 배송비 또는 품목별 배송비를 사용하세요.
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              ※ 이전에 등록된 배송 성격 항목(택배비/배송비/운임)이 보이면 이중계상 방지를 위해 휴지통 아이콘으로 삭제하세요.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {/* 추가 폼 */}
            <div className="px-4 pb-3 border-b border-border space-y-2">
              <div className="grid grid-cols-[1fr_110px_96px_96px_80px_64px] gap-2">
                <span className="text-xs text-muted-foreground">비용명</span>
                <span className="text-xs text-muted-foreground">유형</span>
                <span className="text-xs text-muted-foreground">{costType === "FIXED" ? "금액 (₩)" : "비율 (%)"}</span>
                <span className="text-xs text-muted-foreground">적용</span>
                <span className="text-xs text-muted-foreground">부가세</span>
                <span />
              </div>
              <div className="grid grid-cols-[1fr_110px_96px_96px_80px_64px] gap-2 items-center">
                <Input placeholder="예: 택배비" value={costName} onChange={(e) => setCostName(e.target.value)} className="h-8 text-[13px]" />
                <Select value={costType} onValueChange={(v) => setCostType((v ?? "FIXED") as "FIXED" | "PERCENTAGE")}>
                  <SelectTrigger className="h-8 w-full text-[13px]"><span>{costType === "FIXED" ? "고정금액" : "비율(%)"}</span></SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectItem value="FIXED">고정금액</SelectItem>
                    <SelectItem value="PERCENTAGE">비율(%)</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="text"
                  inputMode={costType === "FIXED" ? "numeric" : "decimal"}
                  placeholder={costType === "FIXED" ? "3,000" : "5"}
                  value={costType === "FIXED" ? formatComma(costValue) : costValue}
                  onChange={(e) => {
                    const v = costType === "FIXED" ? parseComma(e.target.value) : e.target.value;
                    setCostValue(v);
                  }}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-8 text-[13px]"
                />
                <Select value={costPerUnit ? "unit" : "incoming"} onValueChange={(v) => setCostPerUnit(v === "unit")}>
                  <SelectTrigger className="h-8 w-full text-[13px]"><span>{costPerUnit ? "개당" : "입고건당"}</span></SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectItem value="unit">개당</SelectItem>
                    <SelectItem value="incoming">입고건당</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={costIsTaxable ? "taxable" : "exempt"} onValueChange={(v) => setCostIsTaxable(v === "taxable")}>
                  <SelectTrigger className="h-8 w-full text-[13px]"><span>{costIsTaxable ? "과세" : "면세"}</span></SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectItem value="taxable">과세</SelectItem>
                    <SelectItem value="exempt">면세</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={handleAddCost} disabled={addingCost} className="w-full">
                  {addingCost ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                  추가
                </Button>
              </div>
            </div>

            {product.incomingCosts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">등록된 비용이 없습니다</p>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-muted text-muted-foreground text-xs border-b border-border">
                    <th className="py-2 px-3 text-left font-medium">비용명</th>
                    <th className="py-2 px-3 text-left font-medium">유형</th>
                    <th className="py-2 px-3 text-right font-medium">금액</th>
                    <th className="py-2 px-3 text-left font-medium">적용</th>
                    <th className="py-2 px-3 text-left font-medium">부가세</th>
                    <th className="py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {product.incomingCosts.map((c) => (
                    <tr key={c.id} className="border-b border-border hover:bg-muted/50">
                      <td className="px-3 py-2.5 font-medium">{c.name}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{c.costType === "FIXED" ? "고정" : "비율"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {c.costType === "FIXED" ? `₩${fmt(c.value)}` : `${parseFloat(c.value)}%`}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{c.perUnit ? "개당" : "입고건당"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{c.isTaxable ? <span className="text-foreground">과세</span> : "면세"}</td>
                      <td className="py-2 text-center">
                        <Button variant="ghost" size="icon-xs" onClick={() => handleDeleteCost(c.id)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* 입고 이력 */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">입고 이력</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {product.incomingItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">입고 이력이 없습니다</p>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-muted text-muted-foreground text-xs border-b border-border">
                    <th className="py-2 px-3 text-left font-medium">입고번호</th>
                    <th className="py-2 px-3 text-left font-medium">날짜</th>
                    <th className="py-2 px-3 text-right font-medium">수량</th>
                    <th className="py-2 px-3 text-right font-medium">매입단가</th>
                    <th className="py-2 px-3 text-right font-medium">공급가액</th>
                    <th className="py-2 px-3 text-right font-medium">세액</th>
                    <th className="py-2 px-3 text-right font-medium">배송비</th>
                    <th className="py-2 px-3 text-right font-medium">실제원가</th>
                  </tr>
                </thead>
                <tbody>
                  {product.incomingItems.map((item) => {
                    const taxAmount = product.isTaxable ? Math.round(item.totalPrice * 0.1) : 0;
                    const hasShipping = item.shippingAllocation > 0;
                    return (
                      <tr key={item.id} className="border-b border-border hover:bg-muted/50">
                        <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs">{item.incoming.incomingNo}</td>
                        <td className="px-3 py-2.5">{new Date(item.incoming.incomingDate).toLocaleDateString("ko-KR")}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{fmt(item.quantity)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">₩{fmt(Math.round(item.unitPrice))}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">₩{fmt(item.totalPrice)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {taxAmount > 0 ? `₩${taxAmount.toLocaleString("ko-KR")}` : "-"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {hasShipping ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className={item.incoming.shippingDeducted && !item.hasItemOverride ? "line-through" : ""}>
                                ₩{Math.round(item.shippingAllocation).toLocaleString("ko-KR")}
                              </span>
                              {item.incoming.shippingDeducted && item.hasAllocated && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">거래처 차감</span>
                              )}
                              {item.hasItemOverride && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">품목 직접</span>
                              )}
                            </span>
                          ) : "-"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                          ₩{fmt(Math.round(item.unitCostSnapshot))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* 단가 변동 이력 */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">단가 변동 이력</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {product.priceHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">단가 변동 이력이 없습니다</p>
            ) : (
              <>
                {/* 라인 차트 */}
                {(() => {
                  // 시간순 정렬 후 차트 데이터 구성 (이전 단가 → 변경 단가 순서로)
                  const sorted = [...product.priceHistory].reverse();
                  const chartData = [
                    { date: new Date(sorted[0].createdAt).toLocaleDateString("ko-KR"), price: parseFloat(sorted[0].oldPrice.toString()), label: "시작" },
                    ...sorted.map((h) => ({
                      date: new Date(h.createdAt).toLocaleDateString("ko-KR"),
                      price: parseFloat(h.newPrice.toString()),
                      label: h.reason || "",
                    })),
                  ];
                  const prices = chartData.map((d) => d.price);
                  const minPrice = Math.min(...prices);
                  const maxPrice = Math.max(...prices);
                  const padding = (maxPrice - minPrice) * 0.2 || maxPrice * 0.1;
                  return (
                    <div className="px-4 pt-4 pb-2">
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis
                            dataKey="date"
                            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                            axisLine={{ stroke: "var(--border)" }}
                            tickLine={false}
                          />
                          <YAxis
                            domain={[minPrice - padding, maxPrice + padding]}
                            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v) => `₩${Math.round(v).toLocaleString("ko-KR")}`}
                            width={80}
                          />
                          <Tooltip
                            contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
                            labelStyle={{ color: "var(--muted-foreground)" }}
                            formatter={(value) => [`₩${Math.round(Number(value)).toLocaleString("ko-KR")}`, "단가"]}
                          />
                          <Line
                            type="monotone"
                            dataKey="price"
                            stroke="#3ECF8E"
                            strokeWidth={2}
                            dot={{ fill: "#3ECF8E", r: 4, strokeWidth: 0 }}
                            activeDot={{ r: 6, fill: "#3ECF8E" }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  );
                })()}
                {/* 이력 테이블 */}
                <table className="w-full text-[13px] mt-2">
                  <thead>
                    <tr className="bg-muted text-muted-foreground text-xs border-y border-border">
                      <th className="py-2 px-3 text-left font-medium">날짜</th>
                      <th className="py-2 px-3 text-right font-medium">이전 단가</th>
                      <th className="py-2 px-3 text-right font-medium">변경 단가</th>
                      <th className="py-2 px-3 text-right font-medium">변동액</th>
                      <th className="py-2 px-3 text-right font-medium">변동률</th>
                      <th className="py-2 px-3 text-left font-medium">사유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.priceHistory.map((h) => {
                      const change = parseFloat(h.changeAmount.toString());
                      const pct = parseFloat(h.changePercent.toString());
                      return (
                        <tr key={h.id} className="border-b border-border hover:bg-muted/50">
                          <td className="px-3 py-2.5">{new Date(h.createdAt).toLocaleDateString("ko-KR")}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">₩{fmt(h.oldPrice)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-medium">₩{fmt(h.newPrice)}</td>
                          <td className={`px-3 py-2.5 text-right tabular-nums ${change > 0 ? "text-red-500" : "text-green-500"}`}>
                            {change > 0 ? "+" : ""}₩{fmt(h.changeAmount)}
                          </td>
                          <td className={`px-3 py-2.5 text-right tabular-nums ${pct > 0 ? "text-red-500" : "text-green-500"}`}>
                            {change > 0 ? "+" : ""}{pct.toFixed(1)}%
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">{h.reason || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {product && (
        <MappingSheet
          open={mappingOpen}
          onOpenChange={setMappingOpen}
          mode="supplier-to-product"
          supplierProductId={product.id}
          supplierProductName={product.name}
          supplierProductUnit={product.unitOfMeasure}
          onMappingChange={fetchProduct}
        />
      )}
      </ScrollArea>
    </div>
  );
}
