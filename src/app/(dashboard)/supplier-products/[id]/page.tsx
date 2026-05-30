"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { ArrowLeft, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { computeUnitCost } from "@/lib/cost-utils";
import { formatComma, parseComma } from "@/lib/utils";
import { focusCaretEnd } from "@/jm/lib/focus";
import { UNITS_OF_MEASURE } from "@/lib/constants";
import { MappingSheet } from "@/components/mapping-sheet";
import { ShippingHistoryCard } from "@/components/shipping-history-card";
import {
  JmBadge,
  JmButton,
  JmCard,
  JmCardContent,
  JmCardHeader,
  JmCardTitle,
  JmContainer,
  JmIconButton,
  JmInput,
  JmScope,
  JmSelect,
  JmStat,
} from "@/jm";
import Loading from "./loading";

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

const UNIT_OPTIONS = UNITS_OF_MEASURE.map((u) => ({
  value: u.value,
  label: `${u.label} (${u.value})`,
}));

const COST_TYPE_OPTIONS = [
  { value: "FIXED", label: "고정금액" },
  { value: "PERCENTAGE", label: "비율(%)" },
];

const COST_PER_OPTIONS = [
  { value: "unit", label: "개당" },
  { value: "incoming", label: "입고건당" },
];

const COST_TAX_OPTIONS = [
  { value: "taxable", label: "과세" },
  { value: "exempt", label: "면세" },
];

function fmt(v: string | number) {
  return parseFloat(v.toString()).toLocaleString("ko-KR");
}

export default function SupplierProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/supplier-products");
    }
  };

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<SupplierProductDetail>>({});
  const [mappingOpen, setMappingOpen] = useState(false);

  // 입고 비용 추가 폼
  const [costName, setCostName] = useState("");
  const [costType, setCostType] = useState<"FIXED" | "PERCENTAGE">("FIXED");
  const [costValue, setCostValue] = useState("");
  const [costPerUnit, setCostPerUnit] = useState(true);
  const [costIsTaxable, setCostIsTaxable] = useState(true);

  const productQuery = useQuery({
    queryKey: queryKeys.supplierProducts.detail(id),
    queryFn: () => apiGet<SupplierProductDetail>(`/api/supplier-products/${id}`),
  });
  const product = productQuery.data ?? null;
  const loading = productQuery.isPending;
  const fetchProduct = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.supplierProducts.detail(id) });

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

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!product) throw new Error("상품 정보가 없습니다");
      return apiMutate(`/api/supplier-products/${id}`, "PUT", {
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
      });
    },
    onSuccess: () => {
      toast.success("저장되었습니다");
      setEditing(false);
      fetchProduct();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : err.message || "저장에 실패했습니다"),
  });
  const saving = saveMutation.isPending;
  const handleSave = () => saveMutation.mutate();

  const addCostMutation = useMutation({
    mutationFn: () => {
      if (!costName.trim() || !costValue) throw new Error("이름과 금액을 입력해주세요");
      return apiMutate(`/api/supplier-products/${id}/costs`, "POST", {
        name: costName.trim(),
        costType,
        value: costValue,
        perUnit: costPerUnit,
        isTaxable: costIsTaxable,
      });
    },
    onSuccess: () => {
      setCostName("");
      setCostValue("");
      setCostType("FIXED");
      setCostPerUnit(true);
      setCostIsTaxable(true);
      fetchProduct();
      toast.success("비용이 추가되었습니다");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : err.message || "비용 추가에 실패했습니다"),
  });
  const addingCost = addCostMutation.isPending;
  const handleAddCost = () => addCostMutation.mutate();

  const deleteCostMutation = useMutation({
    mutationFn: (costId: string) =>
      apiMutate(`/api/supplier-products/${id}/costs?costId=${costId}`, "DELETE"),
    onSuccess: () => fetchProduct(),
  });
  const handleDeleteCost = (costId: string) => deleteCostMutation.mutate(costId);

  if (loading) return <Loading />;

  // 404 ("진짜 못 찾음") 와 서버/네트워크 에러 (500 등) 를 분리. 합치면
  // 운영 장애 시 사용자가 데이터 사라진 줄 알고 디버깅이 헛돌게 됨.
  if (productQuery.isError) {
    const err = productQuery.error;
    const is404 = err instanceof ApiError && err.status === 404;
    if (is404) {
      return (
        <div className="p-6 text-[var(--jm-text-muted)]">상품을 찾을 수 없습니다</div>
      );
    }
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-jm-sm font-medium text-[var(--jm-text)]">
          데이터를 불러올 수 없습니다
        </p>
        <p className="text-jm-xs text-[var(--jm-text-muted)]">
          {err instanceof ApiError
            ? `${err.status} ${err.message}`
            : "서버 응답이 없습니다. 잠시 후 다시 시도해주세요."}
        </p>
        <JmButton size="sm" variant="outline" onClick={() => productQuery.refetch()}>
          다시 시도
        </JmButton>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="p-6 text-[var(--jm-text-muted)]">상품을 찾을 수 없습니다</div>
    );
  }

  const lastIncoming = product.incomingItems[0];
  const lastIncomingDate = lastIncoming
    ? new Date(lastIncoming.incoming.incomingDate).toLocaleDateString("ko-KR")
    : "-";

  // 요약 KPI 계산
  const unit = parseFloat(product.unitPrice) || 0;
  const costSupply = unit;
  const costTax = product.isTaxable ? Math.round(unit * 0.1) : 0;
  const costTotal = costSupply + costTax;

  const shipTotal = product.avgShippingCost ?? 0;
  const shipSupply = product.avgShippingIsTaxable
    ? Math.round(shipTotal / 1.1)
    : shipTotal;
  const shipTax = Math.round(shipTotal - shipSupply);
  const shipHas =
    product.avgShippingCost !== null && product.avgShippingCost !== undefined;

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

  type KpiData = {
    label: string;
    supply: number;
    tax: number;
    total: number;
    show: boolean;
  };
  const kpis: KpiData[] = [
    { label: "원가", supply: costSupply, tax: costTax, total: costTotal, show: true },
    { label: "입고배송비", supply: shipSupply, tax: shipTax, total: shipTotal, show: shipHas },
    {
      label: "입고부대비용",
      supply: extraSupply,
      tax: extraTax,
      total: extraTotal,
      show: extraHas,
    },
  ];

  return (
    <JmScope theme={resolvedTheme === "dark" ? "dark" : "light"} className="contents">
      <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
        {/* 스티키 헤더 */}
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-6 py-3">
          <JmIconButton
            aria-label="뒤로"
            size="sm"
            variant="ghost"
            onClick={handleBack}
          >
            <ArrowLeft />
          </JmIconButton>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-jm-base font-semibold truncate text-[var(--jm-text)]">
                {product.name}
              </h1>
              {!product.isTaxable && (
                <JmBadge variant="warning" size="sm" shape="square">
                  면세
                </JmBadge>
              )}
            </div>
            <p className="text-jm-xs text-[var(--jm-text-muted)]">{product.supplier.name}</p>
          </div>
          {!editing ? (
            <JmButton size="sm" variant="outline" onClick={startEdit}>
              <Pencil />
              <span>수정</span>
            </JmButton>
          ) : (
            <div className="flex gap-2">
              <JmButton size="sm" variant="ghost" onClick={() => setEditing(false)}>
                취소
              </JmButton>
              <JmButton size="sm" variant="cta" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="size-3.5 animate-spin" />}
                <span>저장</span>
              </JmButton>
            </div>
          )}
        </div>

        <JmContainer width="default" padded={false} className="space-y-6 p-6">
          {/* 요약 KPI */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {kpis.map((k) => (
              <JmStat
                key={k.label}
                size="sm"
                label={k.label}
                value={
                  k.show && k.total > 0
                    ? `₩${Math.round(k.total).toLocaleString("ko-KR")}`
                    : "—"
                }
                hint={
                  k.show && k.total > 0 ? (
                    <span className="flex flex-col tabular-nums">
                      <span>공급가 ₩{Math.round(k.supply).toLocaleString("ko-KR")}</span>
                      <span>세액 ₩{Math.round(k.tax).toLocaleString("ko-KR")}</span>
                    </span>
                  ) : undefined
                }
              />
            ))}
            <JmStat
              size="sm"
              label="총 입고 횟수"
              value={`${product.incomingItems.length}건`}
            />
            <JmStat size="sm" label="마지막 입고일" value={lastIncomingDate} />
          </div>

          {/* 기본 정보 */}
          <JmCard>
            <JmCardHeader>
              <JmCardTitle>기본 정보</JmCardTitle>
            </JmCardHeader>
            <JmCardContent>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-jm-sm">
                {[
                  { label: "거래처", value: product.supplier.name, noEdit: true },
                  { label: "품명", field: "name" },
                  { label: "단위", field: "unitOfMeasure", isSelect: true },
                  { label: "규격", field: "spec" },
                  { label: "정가 (세전)", field: "listPrice", money: true },
                  { label: "실제 단가 (세전)", field: "unitPrice", money: true },
                  { label: "품번", field: "supplierCode" },
                  { label: "부가세", field: "isTaxable", isTaxableToggle: true },
                  { label: "리드타임 (일)", field: "leadTimeDays", type: "number" },
                  { label: "최소발주량", field: "minOrderQty", type: "number" },
                ].map(({ label, value, field, noEdit, type, money, isSelect, isTaxableToggle }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="text-[var(--jm-text-muted)] w-28 shrink-0">{label}</span>
                    {editing && !noEdit ? (
                      isTaxableToggle ? (
                        <div className="flex h-7 rounded-md border border-[var(--jm-border)] text-jm-2xs overflow-hidden">
                          <button
                            type="button"
                            onClick={() =>
                              setEditForm((p) => ({ ...p, isTaxable: true }))
                            }
                            className={`px-2.5 transition-colors ${
                              editForm.isTaxable
                                ? "bg-[var(--jm-surface-muted)] text-[var(--jm-text)]"
                                : "text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
                            }`}
                          >
                            과세
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setEditForm((p) => ({ ...p, isTaxable: false }))
                            }
                            className={`px-2.5 transition-colors border-l border-[var(--jm-border)] ${
                              !editForm.isTaxable
                                ? "bg-[var(--jm-surface-muted)] text-[var(--jm-text)]"
                                : "text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
                            }`}
                          >
                            면세
                          </button>
                        </div>
                      ) : isSelect ? (
                        <JmSelect
                          size="sm"
                          className="w-32"
                          options={UNIT_OPTIONS}
                          value={(editForm.unitOfMeasure as string) ?? "EA"}
                          onChange={(v) =>
                            setEditForm((p) => ({ ...p, unitOfMeasure: v }))
                          }
                        />
                      ) : money ? (
                        <JmInput
                          size="sm"
                          type="text"
                          inputMode="numeric"
                          value={formatComma(
                            (editForm[field as keyof typeof editForm] as string) ?? "",
                          )}
                          onChange={(e) =>
                            setEditForm((p) => ({
                              ...p,
                              [field!]: parseComma(e.target.value),
                            }))
                          }
                          className="w-40"
                          onFocus={focusCaretEnd}
                        />
                      ) : (
                        <JmInput
                          size="sm"
                          type={type ?? "text"}
                          value={(editForm[field as keyof typeof editForm] as string) ?? ""}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, [field!]: e.target.value }))
                          }
                          className="w-40"
                          onFocus={focusCaretEnd}
                        />
                      )
                    ) : (
                      <span className="text-[var(--jm-text)]">
                        {isTaxableToggle
                          ? product.isTaxable
                            ? "과세"
                            : "면세"
                          : isSelect
                            ? product.unitOfMeasure
                            : value ??
                              (field
                                ? String(
                                    (product as unknown as Record<string, unknown>)[field!] ??
                                      "-",
                                  )
                                : "-")}
                      </span>
                    )}
                  </div>
                ))}
                <div className="col-span-2 flex items-start gap-2">
                  <span className="text-[var(--jm-text-muted)] w-28 shrink-0 pt-1">
                    메모
                  </span>
                  {editing ? (
                    <JmInput
                      size="sm"
                      value={(editForm.memo as string) ?? ""}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, memo: e.target.value }))
                      }
                      className="flex-1"
                      onFocus={focusCaretEnd}
                    />
                  ) : (
                    <span className="text-[var(--jm-text-muted)]">{product.memo || "-"}</span>
                  )}
                </div>
              </div>
            </JmCardContent>
          </JmCard>

          {/* 매핑된 판매상품 */}
          <JmCard>
            <JmCardHeader>
              <div className="flex items-center justify-between">
                <JmCardTitle>매핑된 판매상품</JmCardTitle>
                <JmButton
                  size="sm"
                  variant="outline"
                  onClick={() => setMappingOpen(true)}
                >
                  매핑 관리
                </JmButton>
              </div>
            </JmCardHeader>
            <JmCardContent className="px-0 pb-0">
              {product.productMappings.length === 0 ? (
                <p className="text-jm-sm text-[var(--jm-text-muted)] py-6 text-center">
                  매핑된 판매상품이 없습니다
                </p>
              ) : (
                <table className="w-full text-jm-sm">
                  <thead>
                    <tr className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-jm-xs border-b border-[var(--jm-border)]">
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
                        .reduce(
                          (sum, c) => sum + (sellingPrice * parseFloat(c.value)) / 100,
                          0,
                        );
                      const totalCost = unitCost + fixedSellingCost + pctSellingCost;
                      const margin =
                        sellingPrice > 0
                          ? ((sellingPrice - totalCost) / sellingPrice) * 100
                          : null;
                      return (
                        <tr
                          key={m.id}
                          className="border-b border-[var(--jm-border)] hover:bg-[var(--jm-surface-muted)]/50"
                        >
                          <td className="px-3 py-2.5 font-medium text-[var(--jm-text)]">
                            {m.product.name}
                          </td>
                          <td className="px-3 py-2.5 text-[var(--jm-text-muted)] font-[family-name:var(--jm-font-mono)] text-jm-xs">
                            {m.product.sku}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[var(--jm-text)]">
                            {conv}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[var(--jm-text)]">
                            ₩{fmt(sellingPrice)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[var(--jm-text-muted)]">
                            {taxAmount > 0
                              ? `₩${taxAmount.toLocaleString("ko-KR")}`
                              : "-"}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[var(--jm-text)]">
                            ₩{sellingPriceWithTax.toLocaleString("ko-KR")}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {margin !== null ? (
                              <span
                                className={
                                  margin >= 20
                                    ? "text-[var(--jm-success-fg)]"
                                    : margin >= 10
                                      ? "text-[var(--jm-text)]"
                                      : "text-[var(--jm-danger-fg)]"
                                }
                              >
                                {margin.toFixed(1)}%
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </JmCardContent>
          </JmCard>

          {/* 재고 로트 (잔여) */}
          <JmCard>
            <JmCardHeader>
              <JmCardTitle>
                재고 로트 (잔여)
                <span className="ml-2 text-jm-xs font-normal text-[var(--jm-text-muted)]">
                  FIFO 순. 첫 행이 다음 소진 대상 (사용 중)
                </span>
              </JmCardTitle>
            </JmCardHeader>
            <JmCardContent className="px-0 pb-0">
              {(product.activeLots ?? []).length === 0 ? (
                <p className="text-jm-sm text-[var(--jm-text-muted)] py-6 text-center">
                  잔여 재고 로트가 없습니다
                </p>
              ) : (
                <table className="w-full text-jm-sm">
                  <thead>
                    <tr className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-jm-xs border-b border-[var(--jm-border)]">
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
                        className={`border-b border-[var(--jm-border)] ${
                          lot.isCurrentlyConsuming
                            ? "bg-[var(--jm-info-bg)]/30 hover:bg-[var(--jm-info-bg)]/50"
                            : "hover:bg-[var(--jm-surface-muted)]/50"
                        }`}
                      >
                        <td className="px-3 py-2.5">
                          {lot.isCurrentlyConsuming ? (
                            <JmBadge variant="info" size="sm" shape="square">
                              사용 중
                            </JmBadge>
                          ) : (
                            <JmBadge variant="default" size="sm" shape="square">
                              대기
                            </JmBadge>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-[var(--jm-text-muted)] tabular-nums">
                          {new Date(lot.receivedAt).toLocaleDateString("ko-KR")}
                        </td>
                        <td className="px-3 py-2.5">
                          {lot.incomingNo && lot.incomingId ? (
                            <Link
                              href={`/inventory/incoming?incomingId=${lot.incomingId}`}
                              className="text-[var(--jm-text)] hover:text-[var(--jm-info-fg)] underline-offset-4 hover:underline"
                            >
                              {lot.incomingNo}
                            </Link>
                          ) : (
                            <span className="text-[var(--jm-text-muted)]">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-jm-xs">
                          {lot.product?.name ?? (
                            <span className="text-[var(--jm-warning-fg)]">미매핑(오르판)</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[var(--jm-text)]">
                          {parseFloat(lot.receivedQty).toLocaleString("ko-KR")}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium text-[var(--jm-text)]">
                          {parseFloat(lot.remainingQty).toLocaleString("ko-KR")}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[var(--jm-text)]">
                          ₩{Math.round(parseFloat(lot.unitCost)).toLocaleString("ko-KR")}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {lot.shippingPerUnit > 0 ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="text-[var(--jm-text)]">
                                ₩{Math.round(lot.shippingPerUnit).toLocaleString("ko-KR")}
                              </span>
                              <span
                                className={`text-jm-2xs px-1 py-0.5 rounded ${
                                  lot.shippingSource === "ITEM"
                                    ? "bg-[var(--jm-info-bg)] text-[var(--jm-info-fg)]"
                                    : lot.shippingSource === "DEDUCTED"
                                      ? "bg-[var(--jm-warning-bg)] text-[var(--jm-warning-fg)]"
                                      : "bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)]"
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
                            <span className="text-jm-xs text-[var(--jm-text-muted)]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </JmCardContent>
          </JmCard>

          {/* 입고 배송비 이력 */}
          <ShippingHistoryCard supplierProductId={product.id} />

          {/* 입고 부대비용 */}
          <JmCard>
            <JmCardHeader>
              <JmCardTitle>입고 부대비용</JmCardTitle>
              <p className="text-jm-xs text-[var(--jm-text-muted)] mt-1">
                ※ 배송비/택배비는 여기에 등록할 수 없습니다. 입고 전표의 배송비 또는 품목별
                배송비를 사용하세요.
              </p>
              <p className="text-jm-xs text-[var(--jm-text-muted)] mt-0.5">
                ※ 이전에 등록된 배송 성격 항목(택배비/배송비/운임)이 보이면 이중계상 방지를
                위해 휴지통 아이콘으로 삭제하세요.
              </p>
            </JmCardHeader>
            <JmCardContent className="px-0 pb-0">
              {/* 추가 폼 */}
              <div className="px-4 pb-3 border-b border-[var(--jm-border)] space-y-2">
                <div className="grid grid-cols-[1fr_110px_96px_96px_80px_64px] gap-2">
                  <span className="text-jm-xs text-[var(--jm-text-muted)]">비용명</span>
                  <span className="text-jm-xs text-[var(--jm-text-muted)]">유형</span>
                  <span className="text-jm-xs text-[var(--jm-text-muted)]">
                    {costType === "FIXED" ? "금액 (₩)" : "비율 (%)"}
                  </span>
                  <span className="text-jm-xs text-[var(--jm-text-muted)]">적용</span>
                  <span className="text-jm-xs text-[var(--jm-text-muted)]">부가세</span>
                  <span />
                </div>
                <div className="grid grid-cols-[1fr_110px_96px_96px_80px_64px] gap-2 items-center">
                  <JmInput
                    size="sm"
                    placeholder="예: 택배비"
                    value={costName}
                    onChange={(e) => setCostName(e.target.value)}
                    onFocus={focusCaretEnd}
                  />
                  <JmSelect
                    size="sm"
                    options={COST_TYPE_OPTIONS}
                    value={costType}
                    onChange={(v) => setCostType(v as "FIXED" | "PERCENTAGE")}
                  />
                  <JmInput
                    size="sm"
                    inputMode={costType === "FIXED" ? "numeric" : "decimal"}
                    placeholder={costType === "FIXED" ? "3,000" : "5"}
                    value={costType === "FIXED" ? formatComma(costValue) : costValue}
                    onChange={(e) => {
                      const v =
                        costType === "FIXED"
                          ? parseComma(e.target.value)
                          : e.target.value;
                      setCostValue(v);
                    }}
                    onFocus={focusCaretEnd}
                  />
                  <JmSelect
                    size="sm"
                    options={COST_PER_OPTIONS}
                    value={costPerUnit ? "unit" : "incoming"}
                    onChange={(v) => setCostPerUnit(v === "unit")}
                  />
                  <JmSelect
                    size="sm"
                    options={COST_TAX_OPTIONS}
                    value={costIsTaxable ? "taxable" : "exempt"}
                    onChange={(v) => setCostIsTaxable(v === "taxable")}
                  />
                  <JmButton
                    size="sm"
                    variant="outline"
                    onClick={handleAddCost}
                    disabled={addingCost}
                    className="w-full"
                  >
                    {addingCost ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Plus className="size-3.5" />
                    )}
                    <span>추가</span>
                  </JmButton>
                </div>
              </div>

              {product.incomingCosts.length === 0 ? (
                <p className="text-jm-sm text-[var(--jm-text-muted)] py-6 text-center">
                  등록된 비용이 없습니다
                </p>
              ) : (
                <table className="w-full text-jm-sm">
                  <thead>
                    <tr className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-jm-xs border-b border-[var(--jm-border)]">
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
                      <tr
                        key={c.id}
                        className="border-b border-[var(--jm-border)] hover:bg-[var(--jm-surface-muted)]/50"
                      >
                        <td className="px-3 py-2.5 font-medium text-[var(--jm-text)]">
                          {c.name}
                        </td>
                        <td className="px-3 py-2.5 text-[var(--jm-text-muted)]">
                          {c.costType === "FIXED" ? "고정" : "비율"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[var(--jm-text)]">
                          {c.costType === "FIXED"
                            ? `₩${fmt(c.value)}`
                            : `${parseFloat(c.value)}%`}
                        </td>
                        <td className="px-3 py-2.5 text-[var(--jm-text-muted)]">
                          {c.perUnit ? "개당" : "입고건당"}
                        </td>
                        <td className="px-3 py-2.5 text-[var(--jm-text-muted)]">
                          {c.isTaxable ? (
                            <span className="text-[var(--jm-text)]">과세</span>
                          ) : (
                            "면세"
                          )}
                        </td>
                        <td className="py-2 text-center">
                          <JmIconButton
                            aria-label="비용 삭제"
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteCost(c.id)}
                          >
                            <Trash2 />
                          </JmIconButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </JmCardContent>
          </JmCard>

          {/* 입고 이력 */}
          <JmCard>
            <JmCardHeader>
              <JmCardTitle>입고 이력</JmCardTitle>
            </JmCardHeader>
            <JmCardContent className="px-0 pb-0">
              {product.incomingItems.length === 0 ? (
                <p className="text-jm-sm text-[var(--jm-text-muted)] py-6 text-center">
                  입고 이력이 없습니다
                </p>
              ) : (
                <table className="w-full text-jm-sm">
                  <thead>
                    <tr className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-jm-xs border-b border-[var(--jm-border)]">
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
                      const taxAmount = product.isTaxable
                        ? Math.round(item.totalPrice * 0.1)
                        : 0;
                      const hasShipping = item.shippingAllocation > 0;
                      return (
                        <tr
                          key={item.id}
                          className="border-b border-[var(--jm-border)] hover:bg-[var(--jm-surface-muted)]/50"
                        >
                          <td className="px-3 py-2.5 text-[var(--jm-text-muted)] font-[family-name:var(--jm-font-mono)] text-jm-xs">
                            {item.incoming.incomingNo}
                          </td>
                          <td className="px-3 py-2.5 text-[var(--jm-text)] tabular-nums">
                            {new Date(item.incoming.incomingDate).toLocaleDateString("ko-KR")}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[var(--jm-text)]">
                            {fmt(item.quantity)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[var(--jm-text)]">
                            ₩{fmt(Math.round(item.unitPrice))}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[var(--jm-text)]">
                            ₩{fmt(item.totalPrice)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[var(--jm-text-muted)]">
                            {taxAmount > 0
                              ? `₩${taxAmount.toLocaleString("ko-KR")}`
                              : "-"}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[var(--jm-text-muted)]">
                            {hasShipping ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  className={
                                    item.incoming.shippingDeducted &&
                                    !item.hasItemOverride
                                      ? "line-through"
                                      : ""
                                  }
                                >
                                  ₩
                                  {Math.round(item.shippingAllocation).toLocaleString("ko-KR")}
                                </span>
                                {item.incoming.shippingDeducted && item.hasAllocated && (
                                  <span className="text-jm-2xs px-1.5 py-0.5 rounded bg-[var(--jm-warning-bg)] text-[var(--jm-warning-fg)]">
                                    거래처 차감
                                  </span>
                                )}
                                {item.hasItemOverride && (
                                  <span className="text-jm-2xs px-1.5 py-0.5 rounded bg-[var(--jm-info-bg)] text-[var(--jm-info-fg)]">
                                    품목 직접
                                  </span>
                                )}
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-medium text-[var(--jm-text)]">
                            ₩{fmt(Math.round(item.unitCostSnapshot))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </JmCardContent>
          </JmCard>

          {/* 단가 변동 이력 */}
          <JmCard>
            <JmCardHeader>
              <JmCardTitle>단가 변동 이력</JmCardTitle>
            </JmCardHeader>
            <JmCardContent className="px-0 pb-0">
              {product.priceHistory.length === 0 ? (
                <p className="text-jm-sm text-[var(--jm-text-muted)] py-6 text-center">
                  단가 변동 이력이 없습니다
                </p>
              ) : (
                <>
                  {/* 라인 차트 */}
                  {(() => {
                    const sorted = [...product.priceHistory].reverse();
                    const chartData = [
                      {
                        date: new Date(sorted[0].createdAt).toLocaleDateString("ko-KR"),
                        price: parseFloat(sorted[0].oldPrice.toString()),
                        label: "시작",
                      },
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
                          <LineChart
                            data={chartData}
                            margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--jm-border)" />
                            <XAxis
                              dataKey="date"
                              tick={{ fill: "var(--jm-text-muted)", fontSize: 11 }}
                              axisLine={{ stroke: "var(--jm-border)" }}
                              tickLine={false}
                            />
                            <YAxis
                              domain={[minPrice - padding, maxPrice + padding]}
                              tick={{ fill: "var(--jm-text-muted)", fontSize: 11 }}
                              axisLine={false}
                              tickLine={false}
                              tickFormatter={(v) =>
                                `₩${Math.round(v).toLocaleString("ko-KR")}`
                              }
                              width={80}
                            />
                            <Tooltip
                              contentStyle={{
                                background: "var(--jm-surface)",
                                border: "1px solid var(--jm-border)",
                                borderRadius: 6,
                                fontSize: 12,
                              }}
                              labelStyle={{ color: "var(--jm-text-muted)" }}
                              formatter={(value) => [
                                `₩${Math.round(Number(value)).toLocaleString("ko-KR")}`,
                                "단가",
                              ]}
                            />
                            <Line
                              type="monotone"
                              dataKey="price"
                              stroke="var(--jm-info-fg)"
                              strokeWidth={2}
                              dot={{ fill: "var(--jm-info-fg)", r: 4, strokeWidth: 0 }}
                              activeDot={{ r: 6, fill: "var(--jm-info-fg)" }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    );
                  })()}
                  {/* 이력 테이블 */}
                  <table className="w-full text-jm-sm mt-2">
                    <thead>
                      <tr className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-jm-xs border-y border-[var(--jm-border)]">
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
                          <tr
                            key={h.id}
                            className="border-b border-[var(--jm-border)] hover:bg-[var(--jm-surface-muted)]/50"
                          >
                            <td className="px-3 py-2.5 text-[var(--jm-text)] tabular-nums">
                              {new Date(h.createdAt).toLocaleDateString("ko-KR")}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[var(--jm-text-muted)]">
                              ₩{fmt(h.oldPrice)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-medium text-[var(--jm-text)]">
                              ₩{fmt(h.newPrice)}
                            </td>
                            <td
                              className={`px-3 py-2.5 text-right tabular-nums ${
                                change > 0
                                  ? "text-[var(--jm-danger-fg)]"
                                  : "text-[var(--jm-success-fg)]"
                              }`}
                            >
                              {change > 0 ? "+" : ""}₩{fmt(h.changeAmount)}
                            </td>
                            <td
                              className={`px-3 py-2.5 text-right tabular-nums ${
                                pct > 0
                                  ? "text-[var(--jm-danger-fg)]"
                                  : "text-[var(--jm-success-fg)]"
                              }`}
                            >
                              {change > 0 ? "+" : ""}
                              {pct.toFixed(1)}%
                            </td>
                            <td className="px-3 py-2.5 text-[var(--jm-text-muted)]">
                              {h.reason || "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}
            </JmCardContent>
          </JmCard>
        </JmContainer>
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
    </JmScope>
  );
}
