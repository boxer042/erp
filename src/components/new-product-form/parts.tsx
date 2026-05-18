"use client";

import { useId, useMemo, useState, isValidElement, cloneElement, type ReactElement } from "react";
import { focusCaretEnd } from "@/jm/lib/focus";
import { JmBadge, JmInput } from "@/jm";
import { Plus, X, ChevronRight, Package, Wrench, Layers, Cpu, Palette } from "lucide-react";
import { formatComma, parseComma } from "@/lib/utils";
import { TYPE_ACCENT, emptyCostRow, type CostRow, type ProductType } from "./types";

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

export interface NameAutocompleteItem {
  id: string;
  name: string;
  badge?: string | null;
}

export function NameAutocomplete({
  value,
  onChange,
  items,
  placeholder = "상품명을 입력하세요",
  autoFocus,
  onKeyDown,
  warningLabel = "이미 등록된 상품",
  inputClassName = "h-9",
}: {
  value: string;
  onChange: (name: string) => void;
  items: NameAutocompleteItem[];
  placeholder?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  warningLabel?: string;
  inputClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const normalized = useMemo(() => normalizeName(value), [value]);

  const suggestions = useMemo(() => {
    if (normalized.length < 1) return [];
    return items
      .filter((it) => normalizeName(it.name).includes(normalized))
      .slice(0, 8);
  }, [items, normalized]);

  const exactMatch = useMemo(() => {
    if (normalized.length < 1) return null;
    return items.find((it) => normalizeName(it.name) === normalized) ?? null;
  }, [items, normalized]);

  return (
    <div className="relative">
      <JmInput
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (value.trim().length >= 1) setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className={inputClassName}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface)] shadow-md">
          {suggestions.map((it) => (
            <button
              key={it.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(it.name);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-[var(--jm-surface-muted)] text-left"
            >
              <span className="truncate">{it.name}</span>
              {it.badge && <JmBadge variant="outline" className="ml-2 shrink-0">{it.badge}</JmBadge>}
            </button>
          ))}
        </div>
      )}
      {exactMatch && (
        <p className="mt-1 text-xs text-[var(--jm-warning-fg)]">
          {warningLabel}: <span className="font-medium">{exactMatch.name}</span>
          {exactMatch.badge && (
            <span className="ml-1 text-[var(--jm-text-muted)]">({exactMatch.badge})</span>
          )}
        </p>
      )}
    </div>
  );
}

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
      <label htmlFor={targetId} className="block text-jm-xs font-medium text-[var(--jm-text-muted)]">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {renderedChildren}
      {hint && <div className="text-jm-2xs text-[var(--jm-warning-fg)]">{hint}</div>}
    </div>
  );
}

export function GroupHeader({ step, title, id }: { step: string; title: string; id?: string }) {
  return (
    <div id={id} className="flex items-center gap-2 pt-2 first:pt-0 scroll-mt-4">
      <span className="text-jm-3xs font-bold uppercase tracking-wider text-[var(--jm-text-muted)]">{step}</span>
      <span className="text-jm-xs font-medium text-[var(--jm-text-muted)]">{title}</span>
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
      <h4 className="text-jm-xs font-semibold text-[var(--jm-text)]">{title}</h4>
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
    <div className="flex rounded-lg border border-[var(--jm-border)] overflow-hidden h-9">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 text-sm font-medium transition-colors ${
            value === o.value
              ? "bg-secondary text-[var(--jm-text)]"
              : "text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
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
        <p className="text-jm-xs text-[var(--jm-text-muted)] py-4 text-center">
          {emptyLabel ?? "등록된 입고 비용이 없습니다"}
        </p>
      );
    }
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs">
            <th className="border-r border-b border-[var(--jm-border)] py-1.5 px-2 text-left font-medium">비용명</th>
            <th className="border-r border-b border-[var(--jm-border)] w-[80px] py-1.5 px-2 text-center font-medium">유형</th>
            <th className="border-r border-b border-[var(--jm-border)] w-[90px] py-1.5 px-2 text-center font-medium">공급가액</th>
            <th className="border-r border-b border-[var(--jm-border)] w-[80px] py-1.5 px-2 text-center font-medium">세액</th>
            <th className="border-b border-[var(--jm-border)] w-[90px] py-1.5 px-2 text-center font-medium">금액</th>
          </tr>
        </thead>
        <tbody>
          {hasShipping && (
            <tr className="border-b border-[var(--jm-border)] bg-[var(--jm-surface)]">
              <td className="border-r border-[var(--jm-border)] px-2 py-2 text-jm-xs text-[var(--jm-text-muted)]">
                평균 배송비{avgShippingIsTaxable && <span className="ml-1 text-jm-3xs">(과세)</span>}
              </td>
              <td className="border-r border-[var(--jm-border)] px-2 py-2 text-jm-xs text-center text-[var(--jm-text-muted)]">고정</td>
              <td className="border-r border-[var(--jm-border)] px-2 py-2 text-jm-xs text-right tabular-nums">
                ₩{Math.round(avgShippingIsTaxable ? avgShippingCost! / 1.1 : avgShippingCost!).toLocaleString("ko-KR")}
              </td>
              <td className="border-r border-[var(--jm-border)] px-2 py-2 text-jm-xs text-right tabular-nums">
                {avgShippingIsTaxable ? `₩${Math.round(avgShippingCost! / 1.1 * 0.1).toLocaleString("ko-KR")}` : "—"}
              </td>
              <td className="px-2 py-2 text-jm-xs text-right tabular-nums">
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
              <tr key={cost.id} className="border-b border-[var(--jm-border)]">
                <td className="border-r border-[var(--jm-border)] px-2 py-2 text-jm-xs">{cost.name || "—"}</td>
                <td className="border-r border-[var(--jm-border)] px-2 py-2 text-jm-xs text-center text-[var(--jm-text-muted)]">
                  {cost.costType === "FIXED" ? "고정" : "비율"}
                </td>
                <td className="border-r border-[var(--jm-border)] px-2 py-2 text-jm-xs text-right tabular-nums text-[var(--jm-text-muted)]">
                  {supply != null ? `₩${supply.toLocaleString("ko-KR")}` : "—"}
                </td>
                <td className="border-r border-[var(--jm-border)] px-2 py-2 text-jm-xs text-right tabular-nums text-[var(--jm-text-muted)]">
                  {tax != null ? `₩${tax.toLocaleString("ko-KR")}` : "—"}
                </td>
                <td className="px-2 py-2 text-jm-xs text-right tabular-nums">
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
        <tr className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs">
          <th className="border-r border-b border-[var(--jm-border)] py-1.5 px-2 text-left font-medium">비용명</th>
          <th className="border-r border-b border-[var(--jm-border)] w-[90px] py-1.5 px-2 text-center font-medium">유형</th>
          <th className="border-r border-b border-[var(--jm-border)] w-[90px] py-1.5 px-2 text-center font-medium">공급가액</th>
          <th className="border-r border-b border-[var(--jm-border)] w-[80px] py-1.5 px-2 text-center font-medium">세액</th>
          <th className="border-r border-b border-[var(--jm-border)] w-[90px] py-1.5 px-2 text-center font-medium">금액</th>
          <th className="border-b border-[var(--jm-border)] w-[32px]" />
        </tr>
      </thead>
      <tbody>
        {costs.map((cost, idx) => (
          <tr key={cost.id} className="border-b border-[var(--jm-border)] hover:bg-[var(--jm-surface-muted)]/50">
            <td className="border-r border-[var(--jm-border)] px-1 py-0.5">
              <JmInput
                placeholder="비용명"
                value={cost.name}
                onChange={(e) => onChange((prev) => prev.map((c, i) => i === idx ? { ...c, name: e.target.value } : c))}
                className="h-7 text-jm-xs border-0 bg-transparent focus-visible:ring-0 px-1"
              />
            </td>
            <td className="border-r border-[var(--jm-border)] px-1 py-0.5">
              <div className="flex rounded border border-[var(--jm-border)] overflow-hidden">
                {(["FIXED", "PERCENTAGE"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => onChange((prev) => prev.map((c, i) => i === idx ? { ...c, costType: type } : c))}
                    className={`flex-1 h-7 text-jm-2xs transition-colors ${cost.costType === type ? "bg-secondary text-[var(--jm-text)]" : "text-[var(--jm-text-muted)]"}`}
                  >
                    {type === "FIXED" ? "고정" : "비율"}
                  </button>
                ))}
              </div>
            </td>
            <td className="border-r border-[var(--jm-border)] px-2 py-0.5 text-right text-jm-2xs tabular-nums text-[var(--jm-text-muted)]">
              {cost.costType === "FIXED" && cost.value
                ? `₩${Math.round(cost.isTaxable ? parseFloat(cost.value) / 1.1 : parseFloat(cost.value)).toLocaleString("ko-KR")}`
                : "—"}
            </td>
            <td className="border-r border-[var(--jm-border)] px-2 py-0.5 text-right text-jm-2xs tabular-nums text-[var(--jm-text-muted)]">
              {cost.costType === "FIXED" && cost.value && cost.isTaxable
                ? `₩${Math.round(parseFloat(cost.value) / 1.1 * 0.1).toLocaleString("ko-KR")}`
                : "—"}
            </td>
            <td className="border-r border-[var(--jm-border)] px-1 py-0.5">
              <JmInput
                type="text"
                inputMode={cost.costType === "PERCENTAGE" ? "decimal" : "numeric"}
                placeholder={cost.costType === "PERCENTAGE" ? "%" : "원"}
                value={cost.costType === "FIXED" ? formatComma(cost.value) : cost.value}
                onChange={(e) => {
                  const v = cost.costType === "FIXED" ? parseComma(e.target.value) : e.target.value;
                  onChange((prev) => prev.map((c, i) => i === idx ? { ...c, value: v } : c));
                }}
                onFocus={focusCaretEnd}
                className="h-7 text-jm-xs text-right border-0 bg-transparent focus-visible:ring-0 px-1"
              />
            </td>
            <td className="text-center">
              <button
                type="button"
                className="text-[var(--jm-text-muted)] hover:text-red-400 transition-colors p-1"
                onClick={() => onChange((prev) => prev.filter((_, i) => i !== idx))}
              >
                <X className="h-3 w-3" />
              </button>
            </td>
          </tr>
        ))}
        {avgShippingCost != null && avgShippingCost > 0 && (
          <tr className="border-b border-[var(--jm-border)] bg-[var(--jm-surface)]">
            <td className="border-r border-[var(--jm-border)] px-2 py-1.5 text-jm-xs text-[var(--jm-text-muted)]">
              평균 배송비{avgShippingIsTaxable && <span className="ml-1">(과세)</span>}
              <span className="ml-1.5 text-jm-2xs text-[var(--jm-text-muted)]">과거 입고 기준·수정 불가</span>
            </td>
            <td className="border-r border-[var(--jm-border)] px-2 py-1.5 text-jm-xs text-center text-[var(--jm-text-muted)]">고정</td>
            <td className="border-r border-[var(--jm-border)] px-2 py-1.5 text-jm-xs text-right tabular-nums text-[var(--jm-text-muted)]">
              ₩{Math.round(avgShippingIsTaxable ? avgShippingCost / 1.1 : avgShippingCost).toLocaleString("ko-KR")}
            </td>
            <td className="border-r border-[var(--jm-border)] px-2 py-1.5 text-jm-xs text-right tabular-nums text-[var(--jm-text-muted)]">
              {avgShippingIsTaxable ? `₩${Math.round(avgShippingCost / 1.1 * 0.1).toLocaleString("ko-KR")}` : "—"}
            </td>
            <td className="border-r border-[var(--jm-border)] px-2 py-1.5 text-jm-xs text-right tabular-nums">
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
              className="flex items-center gap-1.5 text-[var(--jm-text-muted)] text-jm-xs hover:text-[var(--jm-text)] transition-colors"
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
          <div key={cost.id} className="rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <JmInput
                placeholder="비용명"
                value={cost.name}
                onChange={(e) => onChange((prev) => prev.map((c, i) => i === idx ? { ...c, name: e.target.value } : c))}
                className="h-9 text-jm-sm flex-1"
              />
              <button
                type="button"
                className="text-[var(--jm-text-muted)] hover:text-red-400 transition-colors p-1.5 shrink-0"
                onClick={() => onChange((prev) => prev.filter((_, i) => i !== idx))}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded border border-[var(--jm-border)] overflow-hidden shrink-0">
                {(["FIXED", "PERCENTAGE"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => onChange((prev) => prev.map((c, i) => i === idx ? { ...c, costType: type } : c))}
                    className={`px-3 h-9 text-jm-xs transition-colors ${cost.costType === type ? "bg-secondary text-[var(--jm-text)]" : "text-[var(--jm-text-muted)]"}`}
                  >
                    {type === "FIXED" ? "고정" : "비율"}
                  </button>
                ))}
              </div>
              <JmInput
                type="text"
                inputMode={cost.costType === "PERCENTAGE" ? "decimal" : "numeric"}
                placeholder={cost.costType === "PERCENTAGE" ? "%" : "원"}
                value={cost.costType === "FIXED" ? formatComma(cost.value) : cost.value}
                onChange={(e) => {
                  const v = cost.costType === "FIXED" ? parseComma(e.target.value) : e.target.value;
                  onChange((prev) => prev.map((c, i) => i === idx ? { ...c, value: v } : c));
                }}
                onFocus={focusCaretEnd}
                className="h-9 flex-1 text-right text-jm-sm"
              />
            </div>
            {cost.costType === "FIXED" && cost.value && (
              <div className="flex justify-between text-jm-2xs text-[var(--jm-text-muted)] tabular-nums px-1">
                <span>공급가액 ₩{supplyAmount.toLocaleString("ko-KR")}</span>
                <span>세액 {cost.isTaxable ? `₩${taxAmount.toLocaleString("ko-KR")}` : "—"}</span>
              </div>
            )}
          </div>
        );
      })}
      {avgShippingCost != null && avgShippingCost > 0 && (
        <div className="rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] p-2.5 space-y-1">
          <div className="flex items-center justify-between text-jm-xs">
            <span className="text-[var(--jm-text-muted)]">
              평균 배송비{avgShippingIsTaxable && <span className="ml-1 text-jm-3xs">(과세)</span>}
              <span className="ml-1.5 text-jm-3xs text-[var(--jm-text-muted)]">과거 입고 기준·수정 불가</span>
            </span>
            <span className="tabular-nums">₩{Math.round(avgShippingCost).toLocaleString("ko-KR")}</span>
          </div>
          <div className="flex justify-between text-jm-2xs text-[var(--jm-text-muted)] tabular-nums px-1">
            <span>공급가액 ₩{Math.round(avgShippingIsTaxable ? avgShippingCost / 1.1 : avgShippingCost).toLocaleString("ko-KR")}</span>
            <span>세액 {avgShippingIsTaxable ? `₩${Math.round(avgShippingCost / 1.1 * 0.1).toLocaleString("ko-KR")}` : "—"}</span>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => onChange((prev) => [...prev, emptyCostRow()])}
        className="flex items-center gap-1.5 text-[var(--jm-text-muted)] text-jm-sm hover:text-[var(--jm-text)] transition-colors py-2"
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
  {
    type: "OPTION_PARENT" as ProductType,
    label: "옵션 대표 상품",
    Icon: Palette,
    desc: "자체 재고 X — 카탈로그 노출용 placeholder. 색상/사이즈 옵션의 SWAP 으로 실제 SKU 결정 (자사몰 단일 페이지 운영)",
  },
] as const;

export function TypeSelectScreen({ onSelect }: { onSelect: (type: ProductType) => void }) {
  return (
    <div className="max-w-2xl mx-auto px-5 py-8 space-y-3">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-[var(--jm-text)]">어떤 상품을 등록하시겠어요?</h2>
        <p className="text-jm-sm text-[var(--jm-text-muted)] mt-1">상품 유형에 따라 등록 방법이 달라집니다</p>
      </div>
      {PRODUCT_TYPE_CARDS.map(({ type, label, Icon, desc }) => {
        const accent = TYPE_ACCENT[type];
        return (
          <button
            key={type}
            type="button"
            onClick={() => onSelect(type)}
            className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface)] text-left hover:border-[var(--jm-border)] hover:bg-[var(--jm-surface-muted)]/50 transition-all group"
          >
            <div
              className="p-2.5 rounded-lg shrink-0 transition-colors"
              style={{ backgroundColor: `${accent}15` }}
            >
              <Icon className="h-5 w-5 transition-colors" style={{ color: accent }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[var(--jm-text)] text-sm">{label}</p>
              <p className="text-jm-xs text-[var(--jm-text-muted)] mt-0.5 leading-relaxed">{desc}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-[var(--jm-text-muted)] group-hover:text-[var(--jm-text-muted)] transition-colors shrink-0" />
          </button>
        );
      })}
    </div>
  );
}
