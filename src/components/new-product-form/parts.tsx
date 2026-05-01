"use client";

import { useId, isValidElement, cloneElement, type ReactElement } from "react";
import { Input } from "@/components/ui/input";
import { Plus, X, ChevronRight, Package, Wrench, Layers, Cpu } from "lucide-react";
import { formatComma, parseComma } from "@/lib/utils";
import { TYPE_ACCENT, emptyCostRow, type CostRow, type ProductType } from "./types";

export function Field({
  label,
  required,
  children,
  htmlFor,
  hint,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
}) {
  const autoId = useId();
  const targetId = htmlFor ?? autoId;

  let renderedChildren: React.ReactNode = children;
  if (!htmlFor && isValidElement(children)) {
    const el = children as ReactElement<{ id?: string }>;
    if (el.props?.id == null) {
      renderedChildren = cloneElement(el, { id: autoId });
    }
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={targetId} className="block text-[12px] font-medium text-muted-foreground">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {renderedChildren}
      {hint && <div className="text-[11px] text-amber-400/90">{hint}</div>}
    </div>
  );
}

export function GroupHeader({ step, title, id }: { step: string; title: string; id?: string }) {
  return (
    <div id={id} className="flex items-center gap-2 pt-2 first:pt-0 scroll-mt-4">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{step}</span>
      <span className="text-[12px] font-medium text-muted-foreground">{title}</span>
      <div className="flex-1 h-px bg-secondary" />
    </div>
  );
}

export function SectionTitle({
  title,
  badge,
  icon,
}: {
  title: React.ReactNode;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      {icon}
      <h4 className="text-[12px] font-semibold text-foreground">{title}</h4>
      {badge && <span className="ml-auto">{badge}</span>}
    </div>
  );
}

export function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-lg border border-border overflow-hidden h-9">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 text-sm font-medium transition-colors ${
            value === o.value
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function CostList({
  costs,
  onChange,
  addLabel,
  avgShippingCost,
  avgShippingIsTaxable,
  readOnly,
  emptyLabel,
}: {
  costs: CostRow[];
  onChange: React.Dispatch<React.SetStateAction<CostRow[]>>;
  addLabel: string;
  avgShippingCost?: number | null;
  avgShippingIsTaxable?: boolean;
  readOnly?: boolean;
  emptyLabel?: string;
}) {
  if (readOnly) {
    const hasCosts = costs.length > 0;
    const hasShipping = avgShippingCost != null && avgShippingCost > 0;
    if (!hasCosts && !hasShipping) {
      return (
        <p className="text-[12px] text-muted-foreground py-4 text-center">
          {emptyLabel ?? "등록된 입고 비용이 없습니다"}
        </p>
      );
    }
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted text-muted-foreground text-xs">
            <th className="border-r border-b border-border py-1.5 px-2 text-left font-medium">비용명</th>
            <th className="border-r border-b border-border w-[80px] py-1.5 px-2 text-center font-medium">유형</th>
            <th className="border-r border-b border-border w-[90px] py-1.5 px-2 text-center font-medium">공급가액</th>
            <th className="border-r border-b border-border w-[80px] py-1.5 px-2 text-center font-medium">세액</th>
            <th className="border-b border-border w-[90px] py-1.5 px-2 text-center font-medium">금액</th>
          </tr>
        </thead>
        <tbody>
          {hasShipping && (
            <tr className="border-b border-border bg-card">
              <td className="border-r border-border px-2 py-2 text-[12px] text-muted-foreground">
                평균 배송비{avgShippingIsTaxable && <span className="ml-1 text-[10px]">(과세)</span>}
              </td>
              <td className="border-r border-border px-2 py-2 text-[12px] text-center text-muted-foreground">고정</td>
              <td className="border-r border-border px-2 py-2 text-[12px] text-right tabular-nums">
                ₩{Math.round(avgShippingIsTaxable ? avgShippingCost! / 1.1 : avgShippingCost!).toLocaleString("ko-KR")}
              </td>
              <td className="border-r border-border px-2 py-2 text-[12px] text-right tabular-nums">
                {avgShippingIsTaxable ? `₩${Math.round(avgShippingCost! / 1.1 * 0.1).toLocaleString("ko-KR")}` : "—"}
              </td>
              <td className="px-2 py-2 text-[12px] text-right tabular-nums">
                ₩{Math.round(avgShippingCost!).toLocaleString("ko-KR")}
              </td>
            </tr>
          )}
          {costs.map((cost) => {
            const v = parseFloat(cost.value || "0");
            const supply = cost.costType === "FIXED" && v
              ? Math.round(cost.isTaxable ? v / 1.1 : v)
              : null;
            const tax = cost.costType === "FIXED" && v && cost.isTaxable
              ? Math.round((v / 1.1) * 0.1)
              : null;
            return (
              <tr key={cost.id} className="border-b border-border">
                <td className="border-r border-border px-2 py-2 text-[12px]">{cost.name || "—"}</td>
                <td className="border-r border-border px-2 py-2 text-[12px] text-center text-muted-foreground">
                  {cost.costType === "FIXED" ? "고정" : "비율"}
                </td>
                <td className="border-r border-border px-2 py-2 text-[12px] text-right tabular-nums text-muted-foreground">
                  {supply != null ? `₩${supply.toLocaleString("ko-KR")}` : "—"}
                </td>
                <td className="border-r border-border px-2 py-2 text-[12px] text-right tabular-nums text-muted-foreground">
                  {tax != null ? `₩${tax.toLocaleString("ko-KR")}` : "—"}
                </td>
                <td className="px-2 py-2 text-[12px] text-right tabular-nums">
                  {cost.costType === "FIXED" && v
                    ? `₩${v.toLocaleString("ko-KR")}`
                    : cost.value
                      ? `${cost.value}%`
                      : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <>
    {/* PC 테이블 */}
    <table className="hidden md:table w-full text-sm">
      <thead>
        <tr className="bg-muted text-muted-foreground text-xs">
          <th className="border-r border-b border-border py-1.5 px-2 text-left font-medium">비용명</th>
          <th className="border-r border-b border-border w-[90px] py-1.5 px-2 text-center font-medium">유형</th>
          <th className="border-r border-b border-border w-[90px] py-1.5 px-2 text-center font-medium">공급가액</th>
          <th className="border-r border-b border-border w-[80px] py-1.5 px-2 text-center font-medium">세액</th>
          <th className="border-r border-b border-border w-[90px] py-1.5 px-2 text-center font-medium">금액</th>
          <th className="border-b border-border w-[32px]" />
        </tr>
      </thead>
      <tbody>
        {costs.map((cost, idx) => (
          <tr key={cost.id} className="border-b border-border hover:bg-muted/50">
            <td className="border-r border-border px-1 py-0.5">
              <Input
                placeholder="비용명"
                value={cost.name}
                onChange={(e) => onChange((prev) => prev.map((c, i) => i === idx ? { ...c, name: e.target.value } : c))}
                className="h-7 text-[12px] border-0 bg-transparent focus-visible:ring-0 px-1"
              />
            </td>
            <td className="border-r border-border px-1 py-0.5">
              <div className="flex rounded border border-border overflow-hidden">
                {(["FIXED", "PERCENTAGE"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => onChange((prev) => prev.map((c, i) => i === idx ? { ...c, costType: type } : c))}
                    className={`flex-1 h-7 text-[11px] transition-colors ${cost.costType === type ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
                  >
                    {type === "FIXED" ? "고정" : "비율"}
                  </button>
                ))}
              </div>
            </td>
            <td className="border-r border-border px-2 py-0.5 text-right text-[11px] tabular-nums text-muted-foreground">
              {cost.costType === "FIXED" && cost.value
                ? `₩${Math.round(cost.isTaxable ? parseFloat(cost.value) / 1.1 : parseFloat(cost.value)).toLocaleString("ko-KR")}`
                : "—"}
            </td>
            <td className="border-r border-border px-2 py-0.5 text-right text-[11px] tabular-nums text-muted-foreground">
              {cost.costType === "FIXED" && cost.value && cost.isTaxable
                ? `₩${Math.round(parseFloat(cost.value) / 1.1 * 0.1).toLocaleString("ko-KR")}`
                : "—"}
            </td>
            <td className="border-r border-border px-1 py-0.5">
              <Input
                type="text"
                inputMode={cost.costType === "PERCENTAGE" ? "decimal" : "numeric"}
                placeholder={cost.costType === "PERCENTAGE" ? "%" : "원"}
                value={cost.costType === "FIXED" ? formatComma(cost.value) : cost.value}
                onChange={(e) => {
                  const v = cost.costType === "FIXED" ? parseComma(e.target.value) : e.target.value;
                  onChange((prev) => prev.map((c, i) => i === idx ? { ...c, value: v } : c));
                }}
                onFocus={(e) => e.currentTarget.select()}
                className="h-7 text-[12px] text-right border-0 bg-transparent focus-visible:ring-0 px-1"
              />
            </td>
            <td className="text-center">
              <button
                type="button"
                className="text-muted-foreground hover:text-red-400 transition-colors p-1"
                onClick={() => onChange((prev) => prev.filter((_, i) => i !== idx))}
              >
                <X className="h-3 w-3" />
              </button>
            </td>
          </tr>
        ))}
        {avgShippingCost != null && avgShippingCost > 0 && (
          <tr className="border-b border-border bg-card">
            <td className="border-r border-border px-2 py-1.5 text-[12px] text-muted-foreground">
              평균 배송비{avgShippingIsTaxable && <span className="ml-1">(과세)</span>}
              <span className="ml-1.5 text-[11px] text-muted-foreground">과거 입고 기준·수정 불가</span>
            </td>
            <td className="border-r border-border px-2 py-1.5 text-[12px] text-center text-muted-foreground">고정</td>
            <td className="border-r border-border px-2 py-1.5 text-[12px] text-right tabular-nums text-muted-foreground">
              ₩{Math.round(avgShippingIsTaxable ? avgShippingCost / 1.1 : avgShippingCost).toLocaleString("ko-KR")}
            </td>
            <td className="border-r border-border px-2 py-1.5 text-[12px] text-right tabular-nums text-muted-foreground">
              {avgShippingIsTaxable ? `₩${Math.round(avgShippingCost / 1.1 * 0.1).toLocaleString("ko-KR")}` : "—"}
            </td>
            <td className="border-r border-border px-2 py-1.5 text-[12px] text-right tabular-nums">
              ₩{Math.round(avgShippingCost).toLocaleString("ko-KR")}
            </td>
            <td />
          </tr>
        )}
        <tr>
          <td colSpan={6} className="px-2 py-1.5">
            <button
              type="button"
              onClick={() => onChange((prev) => [...prev, emptyCostRow()])}
              className="flex items-center gap-1.5 text-muted-foreground text-[12px] hover:text-primary transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              {addLabel}
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    {/* 모바일 카드 뷰 */}
    <div className="md:hidden space-y-2 px-3 py-2">
      {costs.map((cost, idx) => {
        const supplyAmount = cost.costType === "FIXED" && cost.value
          ? Math.round(cost.isTaxable ? parseFloat(cost.value) / 1.1 : parseFloat(cost.value))
          : 0;
        const taxAmount = cost.costType === "FIXED" && cost.value && cost.isTaxable
          ? Math.round(parseFloat(cost.value) / 1.1 * 0.1)
          : 0;
        return (
          <div key={cost.id} className="rounded-lg border border-border bg-card p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <Input
                placeholder="비용명"
                value={cost.name}
                onChange={(e) => onChange((prev) => prev.map((c, i) => i === idx ? { ...c, name: e.target.value } : c))}
                className="h-9 text-[13px] flex-1"
              />
              <button
                type="button"
                className="text-muted-foreground hover:text-red-400 transition-colors p-1.5 shrink-0"
                onClick={() => onChange((prev) => prev.filter((_, i) => i !== idx))}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded border border-border overflow-hidden shrink-0">
                {(["FIXED", "PERCENTAGE"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => onChange((prev) => prev.map((c, i) => i === idx ? { ...c, costType: type } : c))}
                    className={`px-3 h-9 text-[12px] transition-colors ${cost.costType === type ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
                  >
                    {type === "FIXED" ? "고정" : "비율"}
                  </button>
                ))}
              </div>
              <Input
                type="text"
                inputMode={cost.costType === "PERCENTAGE" ? "decimal" : "numeric"}
                placeholder={cost.costType === "PERCENTAGE" ? "%" : "원"}
                value={cost.costType === "FIXED" ? formatComma(cost.value) : cost.value}
                onChange={(e) => {
                  const v = cost.costType === "FIXED" ? parseComma(e.target.value) : e.target.value;
                  onChange((prev) => prev.map((c, i) => i === idx ? { ...c, value: v } : c));
                }}
                onFocus={(e) => e.currentTarget.select()}
                className="h-9 flex-1 text-right text-[13px]"
              />
            </div>
            {cost.costType === "FIXED" && cost.value && (
              <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums px-1">
                <span>공급가액 ₩{supplyAmount.toLocaleString("ko-KR")}</span>
                <span>세액 {cost.isTaxable ? `₩${taxAmount.toLocaleString("ko-KR")}` : "—"}</span>
              </div>
            )}
          </div>
        );
      })}
      {avgShippingCost != null && avgShippingCost > 0 && (
        <div className="rounded-lg border border-border bg-card p-2.5 space-y-1">
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-muted-foreground">
              평균 배송비{avgShippingIsTaxable && <span className="ml-1 text-[10px]">(과세)</span>}
              <span className="ml-1.5 text-[10px] text-muted-foreground">과거 입고 기준·수정 불가</span>
            </span>
            <span className="tabular-nums">₩{Math.round(avgShippingCost).toLocaleString("ko-KR")}</span>
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums px-1">
            <span>공급가액 ₩{Math.round(avgShippingIsTaxable ? avgShippingCost / 1.1 : avgShippingCost).toLocaleString("ko-KR")}</span>
            <span>세액 {avgShippingIsTaxable ? `₩${Math.round(avgShippingCost / 1.1 * 0.1).toLocaleString("ko-KR")}` : "—"}</span>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => onChange((prev) => [...prev, emptyCostRow()])}
        className="flex items-center gap-1.5 text-muted-foreground text-[13px] hover:text-primary transition-colors py-2"
      >
        <Plus className="h-4 w-4" />
        {addLabel}
      </button>
    </div>
    </>
  );
}

export const PRODUCT_TYPE_CARDS = [
  {
    type: "FINISHED" as ProductType,
    label: "완제품",
    Icon: Package,
    desc: "거래처에서 구매하거나 직접 제조한 판매 상품",
  },
  {
    type: "PARTS" as ProductType,
    label: "부속",
    Icon: Wrench,
    desc: "다른 상품의 구성 부품. 상위 세트/조립 상품과 연결 가능",
  },
  {
    type: "SET" as ProductType,
    label: "세트상품",
    Icon: Layers,
    desc: "기존 상품을 묶어서 구성한 패키지 상품",
  },
  {
    type: "ASSEMBLED" as ProductType,
    label: "조립상품",
    Icon: Cpu,
    desc: "기존 상품을 조립·가공하여 만든 상품. 조립 비용 추가 가능",
  },
] as const;

export function TypeSelectScreen({ onSelect }: { onSelect: (type: ProductType) => void }) {
  return (
    <div className="max-w-2xl mx-auto px-5 py-8 space-y-3">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-foreground">어떤 상품을 등록하시겠어요?</h2>
        <p className="text-[13px] text-muted-foreground mt-1">상품 유형에 따라 등록 방법이 달라집니다</p>
      </div>
      {PRODUCT_TYPE_CARDS.map(({ type, label, Icon, desc }) => {
        const accent = TYPE_ACCENT[type];
        return (
          <button
            key={type}
            type="button"
            onClick={() => onSelect(type)}
            className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border border-border bg-card text-left hover:border-border hover:bg-muted/50 transition-all group"
          >
            <div
              className="p-2.5 rounded-lg shrink-0 transition-colors"
              style={{ backgroundColor: `${accent}15` }}
            >
              <Icon className="h-5 w-5 transition-colors" style={{ color: accent }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground text-sm">{label}</p>
              <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-muted-foreground transition-colors shrink-0" />
          </button>
        );
      })}
    </div>
  );
}
