"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, FileText, Minus, Plus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";
import { apiGet } from "@/lib/api-client";
import { JmScope, JmSkeleton, JmButton, JmIconButton } from "@/jm";
import type {
  SpecTableBlock,
  AmbientVideoBlock,
  TableBlock,
  ChartBlock,
  StatsGridBlock,
  CalloutBlock,
  InfoGridBlock,
  ProductHeroBlock,
  ProductInfoBlock,
  HtmlEmbedBlock,
} from "@/lib/validators/landing-block";
import { resolveLandingIcon } from "@/lib/landing-icons";
import { InlineMarkdown } from "@/components/landing/inline-md";
import { useCommerce } from "@/components/landing/commerce-context";

interface SpecValue {
  id: string;
  value: string;
  slot: { name: string; type: string; unit: string | null };
}

export function SpecTableBlockView({
  block,
  productId,
}: {
  block: SpecTableBlock;
  productId?: string;
}) {
  const query = useQuery({
    queryKey: ["product-specs", productId ?? ""],
    queryFn: () => apiGet<SpecValue[]>(`/api/products/${productId}/specs`),
    enabled: !!productId,
  });

  const values = query.data ?? [];

  return (
    <JmScope theme="light" className="w-full">
      <section className="w-full px-6 py-10 md:px-16 md:py-12">
        <div className="mx-auto max-w-3xl">
          {block.title && (
            <h3 className="mb-5 text-2xl font-bold tracking-tight text-[var(--jm-text)] md:text-3xl">
              {block.title}
            </h3>
          )}
          {!productId ? (
            <div className="rounded-2xl border border-dashed border-[var(--jm-border)] bg-[var(--jm-surface-muted)]/40 px-4 py-6 text-center text-jm-sm text-[var(--jm-text-muted)]">
              상품 컨텍스트 없이는 스펙을 표시할 수 없습니다 (편집기 미리보기에서 정상 동작)
            </div>
          ) : query.isPending ? (
            <div className="rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface-muted)]/40 px-4 py-6 text-center text-jm-sm text-[var(--jm-text-muted)]">
              스펙 불러오는 중...
            </div>
          ) : values.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--jm-border)] bg-[var(--jm-surface-muted)]/40 px-4 py-6 text-center text-jm-sm text-[var(--jm-text-muted)]">
              아직 등록된 스펙이 없습니다 (상품 상세에서 등록 후 표시됩니다)
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)]">
              <table className="w-full border-collapse text-jm-sm">
                <tbody>
                  {values.map((v, i) => (
                    <tr
                      key={v.id}
                      className={cn(
                        i !== values.length - 1 && "border-b border-[var(--jm-border)]",
                      )}
                    >
                      <th className="w-1/3 bg-[var(--jm-surface-muted)]/60 px-5 py-3.5 text-left font-medium text-[var(--jm-text-muted)]">
                        {v.slot.name}
                      </th>
                      <td className="px-5 py-3.5 tabular-nums text-[var(--jm-text)]">
                        {v.value}
                        {v.slot.type === "NUMBER" && v.slot.unit && (
                          <span className="ml-1 text-[var(--jm-text-muted)]">
                            {v.slot.unit}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </JmScope>
  );
}

const AMBIENT_HEIGHT: Record<AmbientVideoBlock["height"], string> = {
  md: "h-[420px] md:h-[540px]",
  lg: "h-[560px] md:h-[720px]",
  screen: "h-[100svh]",
};

export function AmbientVideoBlockView({ block }: { block: AmbientVideoBlock }) {
  const color =
    block.textColor === "dark" ? "text-[var(--jm-text)]" : "text-white";
  const overlay =
    block.textColor === "light" && block.videoUrl ? "bg-black/35" : "";

  return (
    <JmScope theme="light" className="w-full">
      <section
        className={cn(
          "relative w-full overflow-hidden bg-black",
          AMBIENT_HEIGHT[block.height],
        )}
      >
        {block.videoUrl ? (
          <video
            src={block.videoUrl}
            poster={block.posterUrl || undefined}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : block.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={block.posterUrl}
            alt={block.headline || ""}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-jm-sm text-white/60">
            영상 URL을 입력하세요 (mp4)
          </div>
        )}
        {overlay && <div className={cn("absolute inset-0", overlay)} />}
        {(block.headline || block.subheadline) && (
          <div
            className={cn(
              "relative z-10 flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center md:px-16",
              color,
            )}
          >
            {block.headline && (
              <h2 className="text-3xl font-bold leading-tight tracking-tight md:text-5xl lg:text-6xl">
                {block.headline}
              </h2>
            )}
            {block.subheadline && (
              <p className="max-w-2xl text-jm-base leading-relaxed opacity-90 md:text-jm-md">
                {block.subheadline}
              </p>
            )}
          </div>
        )}
      </section>
    </JmScope>
  );
}

export function TableBlockView({ block }: { block: TableBlock }) {
  const headers = block.headers.length > 0 ? block.headers : ["항목"];
  const rows = block.rows.length > 0 ? block.rows : [];

  if (rows.length === 0) {
    return (
      <JmScope theme="light" className="w-full">
        <section className="w-full px-6 py-8 md:px-16">
          <div className="mx-auto flex max-w-3xl items-center justify-center rounded-2xl border border-dashed border-[var(--jm-border)] bg-[var(--jm-surface-muted)]/40 px-4 py-6 text-jm-sm text-[var(--jm-text-muted)]">
            행을 추가하세요
          </div>
        </section>
      </JmScope>
    );
  }

  return (
    <JmScope theme="light" className="w-full">
      <section className="w-full px-6 py-10 md:px-16 md:py-12">
        <div className="mx-auto max-w-4xl">
          <div className="overflow-hidden overflow-x-auto rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)]">
            <table className="w-full border-collapse text-jm-sm">
              <thead>
                <tr className="border-b border-[var(--jm-border)] bg-[var(--jm-surface-muted)]/60">
                  {headers.map((h, i) => (
                    <th
                      key={i}
                      className="px-5 py-3.5 text-left font-semibold text-[var(--jm-text)]"
                    >
                      {h || `열 ${i + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, r) => (
                  <tr
                    key={r}
                    className={cn(
                      r !== rows.length - 1 &&
                        "border-b border-[var(--jm-border)]",
                    )}
                  >
                    {headers.map((_, c) => (
                      <td
                        key={c}
                        className="px-5 py-3 tabular-nums text-[var(--jm-text)]"
                      >
                        {row[c] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {block.caption && (
            <div className="mt-3 px-1 text-jm-xs text-[var(--jm-text-muted)]">
              {block.caption}
            </div>
          )}
        </div>
      </section>
    </JmScope>
  );
}

// jm semantic 토큰 기반 차트 색상 매핑 (token + oklch fallback)
const CHART_COLOR_MAP: Record<
  Exclude<NonNullable<ChartBlock["color"]>, "palette">,
  string
> = {
  action: "oklch(0.21 0 0)", // jm-action (검정)
  success: "oklch(0.6 0.15 145)", // jm-success-solid
  warning: "oklch(0.75 0.15 85)", // jm-warning-solid
  danger: "oklch(0.6 0.2 25)", // jm-danger-solid
  info: "oklch(0.6 0.15 240)", // jm-info-solid
  accent: "oklch(0.6 0.2 295)", // jm-accent-solid
};

const CHART_PALETTE: string[] = [
  CHART_COLOR_MAP.action,
  CHART_COLOR_MAP.success,
  CHART_COLOR_MAP.warning,
  CHART_COLOR_MAP.danger,
  CHART_COLOR_MAP.info,
  CHART_COLOR_MAP.accent,
];

/**
 * 선택된 컬러를 기준으로 차트 색상 시리즈 빌드.
 * - "palette" → 전체 팔레트 회전 (pie 다색)
 * - 그 외 → 선택 색을 첫 색으로, 나머지는 그 색에서 시작하는 팔레트 회전 (pie slice 다색 보장)
 */
function buildChartColors(
  color: NonNullable<ChartBlock["color"]>,
  count: number,
): string[] {
  if (color === "palette") {
    return Array.from(
      { length: count },
      (_, i) => CHART_PALETTE[i % CHART_PALETTE.length],
    );
  }
  const first = CHART_COLOR_MAP[color];
  const rest = CHART_PALETTE.filter((c) => c !== first);
  const ordered = [first, ...rest];
  return Array.from(
    { length: count },
    (_, i) => ordered[i % ordered.length],
  );
}

export function ChartBlockView({ block }: { block: ChartBlock }) {
  const data = block.data.filter((d) => d.label || d.value);
  const colorChoice = block.color ?? "action";
  const colors = buildChartColors(colorChoice, data.length);
  const primaryColor = colors[0];

  if (data.length === 0) {
    return (
      <JmScope theme="light" className="w-full">
        <section className="w-full px-6 py-8 md:px-16">
          <div className="mx-auto flex max-w-3xl items-center justify-center rounded-2xl border border-dashed border-[var(--jm-border)] bg-[var(--jm-surface-muted)]/40 px-4 py-6 text-jm-sm text-[var(--jm-text-muted)]">
            데이터를 추가하세요
          </div>
        </section>
      </JmScope>
    );
  }

  return (
    <JmScope theme="light" className="w-full">
      <section className="w-full px-6 py-10 md:px-16 md:py-12">
        <div className="mx-auto max-w-4xl">
          {block.title && (
            <h3 className="mb-5 text-center text-xl font-bold tracking-tight text-[var(--jm-text)] md:text-2xl">
              {block.title}
            </h3>
          )}
          <div className="h-[320px] w-full rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-4 md:p-6">
            <ResponsiveContainer width="100%" height="100%">
              {block.chartType === "bar" ? (
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--jm-border)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "var(--jm-text-muted)", fontSize: 12 }}
                    stroke="var(--jm-border-strong)"
                  />
                  <YAxis
                    tick={{ fill: "var(--jm-text-muted)", fontSize: 12 }}
                    stroke="var(--jm-border-strong)"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--jm-surface)",
                      border: "1px solid var(--jm-border)",
                      borderRadius: "0.75rem",
                      color: "var(--jm-text)",
                    }}
                  />
                  <Bar dataKey="value" fill={primaryColor} radius={[8, 8, 0, 0]} />
                </BarChart>
              ) : block.chartType === "line" ? (
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--jm-border)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "var(--jm-text-muted)", fontSize: 12 }}
                    stroke="var(--jm-border-strong)"
                  />
                  <YAxis
                    tick={{ fill: "var(--jm-text-muted)", fontSize: 12 }}
                    stroke="var(--jm-border-strong)"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--jm-surface)",
                      border: "1px solid var(--jm-border)",
                      borderRadius: "0.75rem",
                      color: "var(--jm-text)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={primaryColor}
                    strokeWidth={2.5}
                    dot={{ fill: primaryColor, r: 4 }}
                  />
                </LineChart>
              ) : (
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={110}
                    label={{ fill: "var(--jm-text)", fontSize: 12 }}
                  >
                    {data.map((_, i) => (
                      <Cell key={i} fill={colors[i % colors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--jm-surface)",
                      border: "1px solid var(--jm-border)",
                      borderRadius: "0.75rem",
                      color: "var(--jm-text)",
                    }}
                  />
                  <Legend
                    wrapperStyle={{ color: "var(--jm-text-muted)", fontSize: 12 }}
                  />
                </PieChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    </JmScope>
  );
}

const STATS_PADDING: Record<NonNullable<StatsGridBlock["paddingY"]>, string> = {
  sm: "py-8 md:py-12",
  md: "py-12 md:py-16",
  lg: "py-16 md:py-24",
  xl: "py-20 md:py-32",
};

const STATS_BG: Record<NonNullable<StatsGridBlock["background"]>, string> = {
  none: "",
  muted: "bg-[var(--jm-surface-muted)]",
  dark: "bg-[var(--jm-text)] text-white",
};

const STATS_COLS: Record<2 | 3 | 4 | 5, string> = {
  2: "grid-cols-2",
  3: "grid-cols-2 md:grid-cols-3",
  4: "grid-cols-2 md:grid-cols-4",
  5: "grid-cols-2 md:grid-cols-5",
};

export function StatsGridBlockView({
  block,
  productId,
}: {
  block: StatsGridBlock;
  productId?: string;
}) {
  const isDark = block.background === "dark";
  const headerAlign = block.align === "center" ? "text-center" : "text-left";

  // useProductSpecs 켜져 있으면 상품 스펙을 자동으로 stats item 으로 변환
  const specsQuery = useQuery({
    queryKey: ["product-specs", productId ?? ""],
    queryFn: () => apiGet<SpecValue[]>(`/api/products/${productId}/specs`),
    enabled: !!productId && block.useProductSpecs,
  });

  const items = block.useProductSpecs
    ? (specsQuery.data ?? []).map((sv) => ({
        value: sv.value,
        unit: sv.slot.unit ?? "",
        label: sv.slot.name,
      }))
    : block.items.filter((it) => it.value || it.label);

  return (
    <JmScope theme="light" className="w-full">
      <section
        className={cn(
          "w-full px-6 md:px-16",
          STATS_PADDING[block.paddingY ?? "xl"],
          STATS_BG[block.background ?? "muted"],
        )}
      >
        <div className="mx-auto max-w-6xl">
          {(block.eyebrow || block.heading || block.body) && (
            <div className={cn("mb-12 space-y-4 md:mb-16", headerAlign)}>
              {block.eyebrow && (
                <div
                  className={cn(
                    "inline-flex w-fit items-center rounded-full px-3 py-1 text-jm-xs font-semibold uppercase tracking-[0.18em]",
                    block.align === "center" && "mx-auto",
                    isDark
                      ? "bg-white/15 text-white/80"
                      : "bg-[var(--jm-surface)] text-[var(--jm-text-muted)]",
                  )}
                >
                  {block.eyebrow}
                </div>
              )}
              {block.heading && (
                <h3
                  className={cn(
                    "whitespace-pre-line text-3xl font-bold leading-[1.1] tracking-tight md:text-5xl lg:text-6xl",
                    isDark ? "text-white" : "text-[var(--jm-text)]",
                  )}
                >
                  {block.heading}
                </h3>
              )}
              {block.body && (
                <p
                  className={cn(
                    "whitespace-pre-wrap text-jm-base leading-relaxed md:text-jm-md",
                    isDark ? "text-white/80" : "text-[var(--jm-text-muted)]",
                  )}
                >
                  {block.body}
                </p>
              )}
            </div>
          )}
          {items.length > 0 && (
            <div
              className={cn(
                "grid border-t pt-8 md:pt-10",
                STATS_COLS[block.columns],
                isDark ? "border-white/15" : "border-[var(--jm-border)]",
              )}
            >
              {items.map((it, i) => {
                const isLastInRow = (i + 1) % block.columns === 0;
                const isLastItem = i === items.length - 1;
                const showDivider = block.dividers && !isLastInRow && !isLastItem;
                return (
                  <div
                    key={i}
                    className={cn(
                      "px-3 py-4 md:px-6",
                      showDivider &&
                        (isDark
                          ? "md:border-r md:border-white/15"
                          : "md:border-r md:border-[var(--jm-border)]"),
                    )}
                  >
                    <div className="mb-2 flex items-baseline gap-1">
                      <span
                        className={cn(
                          "text-4xl font-bold leading-none tracking-tight md:text-5xl",
                          isDark ? "text-white" : "text-[var(--jm-text)]",
                        )}
                      >
                        {it.value || "—"}
                      </span>
                      {it.unit && (
                        <span
                          className={cn(
                            "text-jm-base font-medium md:text-jm-md",
                            isDark
                              ? "text-white/70"
                              : "text-[var(--jm-text-muted)]",
                          )}
                        >
                          {it.unit}
                        </span>
                      )}
                    </div>
                    <div
                      className={cn(
                        "text-jm-xs md:text-jm-sm",
                        isDark
                          ? "text-white/70"
                          : "text-[var(--jm-text-muted)]",
                      )}
                    >
                      {it.label}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </JmScope>
  );
}

/** Callout / Info-grid 의 variant 별 jm 토큰 매핑 */
const CALLOUT_VARIANT: Record<
  NonNullable<CalloutBlock["variant"]>,
  { border: string; bg: string; text: string; label: string }
> = {
  warning: {
    border: "border-[var(--jm-warning-solid)]",
    bg: "bg-[var(--jm-warning-bg)]",
    text: "text-[var(--jm-warning-fg)]",
    label: "text-[var(--jm-warning-fg)]",
  },
  info: {
    border: "border-[var(--jm-info-solid)]",
    bg: "bg-[var(--jm-info-bg)]",
    text: "text-[var(--jm-info-fg)]",
    label: "text-[var(--jm-info-fg)]",
  },
  success: {
    border: "border-[var(--jm-success-solid)]",
    bg: "bg-[var(--jm-success-bg)]",
    text: "text-[var(--jm-success-fg)]",
    label: "text-[var(--jm-success-fg)]",
  },
  danger: {
    border: "border-[var(--jm-danger-solid)]",
    bg: "bg-[var(--jm-danger-bg)]",
    text: "text-[var(--jm-danger-fg)]",
    label: "text-[var(--jm-danger-fg)]",
  },
  neutral: {
    border: "border-[var(--jm-border-strong)]",
    bg: "bg-[var(--jm-surface-muted)]",
    text: "text-[var(--jm-text)]",
    label: "text-[var(--jm-text)]",
  },
};

const CALLOUT_PADDING: Record<NonNullable<CalloutBlock["paddingY"]>, string> = {
  sm: "px-4 py-3",
  md: "px-5 py-4",
  lg: "px-6 py-5",
};

/** 강조 박스 — 좌측 컬러 바 + 라벨 + 본문. info-grid 안의 notice 에서도 재사용 */
export function CalloutBlockView({ block }: { block: CalloutBlock }) {
  return (
    <JmScope theme="light" className="w-full">
      <section className="w-full px-6 md:px-16">
        <CalloutBox {...block} inSection />
      </section>
    </JmScope>
  );
}

/** 내부 컴포넌트 — info-grid 의 notice 에서도 사용. inSection=true 면 JmScope 바깥에서 호출됨 */
export function CalloutBox({
  variant,
  icon,
  label,
  body,
  paddingY = "md",
  inSection = false,
}: {
  variant: CalloutBlock["variant"];
  icon?: string | null;
  label: string;
  body: string;
  paddingY?: CalloutBlock["paddingY"];
  /** info-grid 내부면 외부 패딩 안 줌 */
  inSection?: boolean;
}) {
  const style = CALLOUT_VARIANT[variant];
  const Icon = resolveLandingIcon(icon ?? null);

  // 좌측 4px 컬러 바 + 둥근 모서리 + 부드러운 배경
  const inner = (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border-l-4",
        style.border,
        style.bg,
        CALLOUT_PADDING[paddingY ?? "md"],
      )}
    >
      <div className="flex items-start gap-2.5">
        {Icon && (
          <Icon
            className={cn("mt-[3px] h-4 w-4 shrink-0", style.text)}
            aria-hidden
          />
        )}
        <div className="flex-1 text-jm-sm leading-relaxed text-[var(--jm-text)]">
          {label && (
            <strong className={cn("mr-1.5 font-bold", style.label)}>
              {label}
            </strong>
          )}
          <span className="text-[var(--jm-text-muted)]">
            <InlineMarkdown text={body} />
          </span>
        </div>
      </div>
    </div>
  );

  return inSection ? inner : inner;
}

const INFO_GRID_PADDING: Record<NonNullable<InfoGridBlock["paddingY"]>, string> = {
  md: "py-12",
  lg: "py-16",
  xl: "py-20 md:py-24",
};

const INFO_GRID_BG: Record<NonNullable<InfoGridBlock["background"]>, string> = {
  none: "",
  muted: "bg-[var(--jm-surface-muted)]",
};

/** 정보 그리드 — 한국 쇼핑몰 표준 footer 4섹션 패턴 */
export function InfoGridBlockView({ block }: { block: InfoGridBlock }) {
  const sections = block.sections;

  if (sections.length === 0) {
    return (
      <JmScope theme="light" className="w-full">
        <section
          className={cn(
            "w-full px-6 md:px-16",
            INFO_GRID_BG[block.background ?? "muted"],
          )}
        >
          <div className="mx-auto flex h-32 max-w-5xl items-center justify-center text-jm-sm text-[var(--jm-text-muted)]">
            섹션을 추가하세요
          </div>
        </section>
      </JmScope>
    );
  }

  return (
    <JmScope theme="light" className="w-full">
      <section
        className={cn(
          "w-full px-6 md:px-16",
          INFO_GRID_PADDING[block.paddingY ?? "xl"],
          INFO_GRID_BG[block.background ?? "muted"],
        )}
      >
        <div className="mx-auto max-w-5xl">
          {sections.map((sec, i) => {
            const Icon = resolveLandingIcon(sec.icon);
            return (
              <div
                key={i}
                className={cn(
                  "grid gap-5 border-t border-[var(--jm-border)] py-8 md:grid-cols-[260px_1fr] md:gap-12 md:py-10",
                  i === sections.length - 1 && "border-b",
                )}
              >
                <div className="flex flex-col gap-2">
                  {sec.number && (
                    <span className="text-jm-2xs font-semibold tracking-[0.25em] text-[var(--jm-text-subtle)]">
                      {sec.number}
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    {Icon && (
                      <Icon
                        className="h-5 w-5 shrink-0 text-[var(--jm-text)]"
                        aria-hidden
                      />
                    )}
                    <h3 className="text-jm-lg font-bold tracking-tight text-[var(--jm-text)] md:text-jm-xl">
                      {sec.title}
                    </h3>
                  </div>
                </div>
                <div className="space-y-4 text-jm-sm leading-relaxed text-[var(--jm-text)]">
                  {sec.rows.length > 0 && (
                    <dl className="grid gap-x-6 gap-y-3 md:grid-cols-[110px_1fr]">
                      {sec.rows.map((row, ri) => (
                        <div key={ri} className="contents">
                          <dt className="text-[var(--jm-text-muted)]">
                            {row.key}
                          </dt>
                          <dd className="font-medium text-[var(--jm-text)]">
                            <InlineMarkdown text={row.value} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {sec.bullets.length > 0 && (
                    <ul className="space-y-2">
                      {sec.bullets.map((b, bi) => (
                        <li
                          key={bi}
                          className="relative pl-4 text-jm-sm text-[var(--jm-text-muted)] before:absolute before:left-0 before:top-[10px] before:h-px before:w-2.5 before:bg-[var(--jm-text-subtle)]"
                        >
                          <InlineMarkdown text={b} />
                        </li>
                      ))}
                    </ul>
                  )}
                  {sec.notice && (
                    <div className="mt-2">
                      <CalloutBox
                        variant={sec.notice.variant}
                        label={sec.notice.label}
                        body={sec.notice.body}
                        paddingY="md"
                        inSection
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </JmScope>
  );
}

interface ProductInfoApiResponse {
  id: string;
  name: string;
  modelName: string | null;
  brand: string | null;
  brandRef?: { name: string } | null;
  spec: string | null;
  countryOfOrigin: string | null;
  manufacturer: string | null;
  importer: string | null;
  certifications: string | null;
  manufactureDate: string | null;
  warrantyPolicy: string | null;
  asResponsible: string | null;
}

interface ProductHeroOptionValue {
  id: string;
  label: string;
  addPrice: string;
  mappedProductId: string | null;
  mappedVariantId: string | null;
  mappedMode: "SWAP" | "ADDON";
  mappedProduct: {
    id: string;
    name: string;
    sku: string;
    sellingPrice: string;
    listPrice: string | null;
    taxType: string;
  } | null;
  mappedVariant: { id: string; name: string; sku: string } | null;
}

interface ProductHeroOption {
  id: string;
  name: string;
  required: boolean;
  values: ProductHeroOptionValue[];
}

interface ProductHeroBundle {
  id: string;
  defaultQuantity: string;
  discountAmount: string | null;
  copy: string | null;
  bundleProduct: {
    id: string;
    name: string;
    sku: string;
    sellingPrice: string;
    listPrice: string | null;
    imageUrl: string | null;
    taxType: string;
    productType: string;
  };
}

interface ProductHeroApiResponse {
  id: string;
  name: string;
  modelName: string | null;
  brand: string | null;
  brandRef?: { name: string } | null;
  category?: { name: string } | null;
  imageUrl: string | null;
  listPrice: string;
  sellingPrice: string;
  taxRate: string;
  taxType: string;
  media: Array<{ id: string; url: string; type: string; sortOrder: number; title: string | null }>;
  productOptions?: ProductHeroOption[];
  bundles?: ProductHeroBundle[];
}

const PRODUCT_HERO_PADDING: Record<NonNullable<ProductHeroBlock["paddingY"]>, string> = {
  md: "py-12 md:py-16",
  lg: "py-16 md:py-24",
  xl: "py-20 md:py-28 lg:pt-[100px] lg:pb-[120px]",
};

const PRODUCT_HERO_BG: Record<NonNullable<ProductHeroBlock["background"]>, string> = {
  none: "",
  muted: "bg-[var(--jm-surface-muted)]",
};

/** 상품 메인 — PDP 최상단 요약 영역. Product 데이터 자동 매핑 */
export function ProductHeroBlockView({
  block,
  productId,
}: {
  block: ProductHeroBlock;
  productId?: string;
}) {
  const productQuery = useQuery({
    queryKey: ["product-hero", productId ?? ""],
    queryFn: () => apiGet<ProductHeroApiResponse>(`/api/products/${productId}`),
    enabled: !!productId,
  });

  const product = productQuery.data;
  const commerce = useCommerce();
  const [activeIdx, setActiveIdx] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [busyAction, setBusyAction] = useState<"cart" | "buy" | null>(null);
  // optionId → valueId
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  // bundle.id → quantity (0 = 선택 안 됨, 1 이상 = 선택 + 수량)
  const [bundleQuantities, setBundleQuantities] = useState<Record<string, number>>({});

  const runCommerce = async (
    action: "cart" | "buy",
    handler: ((productId: string, qty: number) => void | Promise<void>) | undefined,
    productIdLocal: string,
  ) => {
    if (!handler) {
      const env = commerce.environment ?? "preview";
      if (env === "preview" || env === "export") {
        toast.info(
          action === "cart"
            ? "미리보기 — 실제 페이지에서 장바구니에 담깁니다"
            : "미리보기 — 실제 페이지에서 결제 화면으로 이동합니다",
        );
      } else {
        toast.error(`${env} 환경에서 ${action === "cart" ? "장바구니" : "구매"} 핸들러가 설정되지 않았습니다`);
      }
      return;
    }
    try {
      setBusyAction(action);
      await handler(productIdLocal, quantity);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "처리 실패");
    } finally {
      setBusyAction(null);
    }
  };

  // 이미지 — override 우선, 없으면 Product.imageUrl + media (IMAGE 타입만, sortOrder 기준)
  const images = (() => {
    if (block.imagesOverride.length > 0) {
      return block.imagesOverride.filter((img) => img.url);
    }
    if (!product) return [];
    const list: Array<{ url: string; alt: string }> = [];
    if (product.imageUrl) list.push({ url: product.imageUrl, alt: product.name });
    const mediaImgs = (product.media ?? [])
      .filter((m) => m.type === "IMAGE" && m.url && m.url !== product.imageUrl)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((m) => ({ url: m.url, alt: m.title || product.name }));
    return [...list, ...mediaImgs];
  })();

  if (!productId) {
    return (
      <JmScope theme="light" className="w-full">
        <section
          className={cn(
            "w-full px-6 py-16 md:px-16",
            PRODUCT_HERO_BG[block.background ?? "none"],
          )}
        >
          <div className="mx-auto max-w-6xl rounded-md border border-dashed border-[var(--jm-border)] bg-[var(--jm-surface)]/50 px-4 py-10 text-center text-sm text-[var(--jm-text-muted)]">
            상품 컨텍스트 없이는 자동 매핑이 동작하지 않습니다 (편집기 미리보기에서 정상 동작)
          </div>
        </section>
      </JmScope>
    );
  }

  if (productQuery.isPending) {
    return (
      <JmScope theme="light" className="w-full">
        <section
          className={cn(
            "w-full px-6 md:px-16",
            PRODUCT_HERO_PADDING[block.paddingY ?? "xl"],
            PRODUCT_HERO_BG[block.background ?? "none"],
          )}
        >
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-10 md:grid-cols-[1.05fr_1fr] md:gap-12">
              <JmSkeleton className="aspect-square w-full rounded-3xl" />
              <div className="space-y-5">
                <JmSkeleton className="h-7 w-24 rounded-full" />
                <JmSkeleton className="h-12 w-3/4" />
                <JmSkeleton className="h-5 w-full" />
                <JmSkeleton className="h-5 w-2/3" />
                <JmSkeleton className="h-24 w-full rounded-2xl" />
                <JmSkeleton className="h-14 w-56 rounded-full" />
              </div>
            </div>
          </div>
        </section>
      </JmScope>
    );
  }

  if (!product) return null;

  const list = parseFloat(product.listPrice || "0");
  const sell = parseFloat(product.sellingPrice || "0");
  const taxRate = parseFloat(product.taxRate || "0");
  const isTaxable = product.taxType === "TAXABLE";
  const factor = block.vatIncluded && isTaxable ? 1 + taxRate : 1;
  const displayList = Math.round(list * factor);
  const displaySell = Math.round(sell * factor);
  const hasDiscount = list > sell && sell > 0;
  const discountPct = hasDiscount ? Math.round(((list - sell) / list) * 100) : 0;

  const eyebrow = block.eyebrow.trim()
    ? block.eyebrow
    : [product.category?.name, product.brandRef?.name ?? product.brand]
        .filter(Boolean)
        .join(" · ");

  const isImageTop = block.layout === "image-top";
  const isImageRight = block.layout === "image-right";

  const safeIdx = images.length > 0 ? Math.min(activeIdx, images.length - 1) : 0;
  const mainImage = images[safeIdx];

  const productOptions = product.productOptions ?? [];
  const bundles = product.bundles ?? [];
  const hasOptions = productOptions.length > 0;
  const hasBundles = bundles.length > 0;

  const getBundleQty = (id: string) => bundleQuantities[id] ?? 0;
  const setBundleQty = (id: string, qty: number) => {
    setBundleQuantities((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });
  };
  const addBundle = (id: string, defaultQty: number) => {
    const safe = defaultQty > 0 ? Math.floor(defaultQty) : 1;
    setBundleQty(id, safe);
  };
  const selectedBundleCount = Object.keys(bundleQuantities).length;

  // ─── 이미지 블록 — 둥근 카드 + 부드러운 그림자 ───
  const imageBlock = (
    <div className="hero-fade-up-image space-y-4">
      <div className="relative aspect-square w-full overflow-hidden rounded-3xl bg-[var(--jm-surface-muted)] shadow-[var(--jm-shadow-md)]">
        {mainImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mainImage.url}
            alt={mainImage.alt}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-jm-sm text-[var(--jm-text-subtle)]">
            상품 이미지 없음
          </div>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex flex-wrap gap-2.5">
          {images.map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveIdx(i)}
              className={cn(
                "size-16 overflow-hidden rounded-2xl bg-[var(--jm-surface-muted)] transition-all md:size-20",
                i === safeIdx
                  ? "ring-2 ring-[var(--jm-action)] ring-offset-2 ring-offset-[var(--jm-bg)]"
                  : "opacity-60 hover:opacity-100",
              )}
              aria-label={`이미지 ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.alt} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // ─── 정보 블록 ───
  const infoBlock = (
    <div className="hero-fade-up-stagger flex flex-col gap-7">
      {/* eyebrow — pill 형태 */}
      {eyebrow && (
        <div>
          <span className="inline-flex items-center rounded-full bg-[var(--jm-surface-muted)] px-3 py-1 text-jm-xs font-semibold text-[var(--jm-text-muted)]">
            {eyebrow}
          </span>
        </div>
      )}

      {/* 제목 */}
      <h1 className="text-3xl font-bold leading-tight tracking-tight text-[var(--jm-text)] md:text-4xl lg:text-5xl">
        {product.name}
      </h1>

      {/* 부제목 / 모델명 */}
      {block.subheadline ? (
        <p className="max-w-xl whitespace-pre-wrap text-jm-base leading-relaxed text-[var(--jm-text-muted)] md:text-jm-md">
          {block.subheadline}
        </p>
      ) : product.modelName ? (
        <p className="max-w-xl text-jm-base leading-relaxed text-[var(--jm-text-muted)] md:text-jm-md">
          모델명 · {product.modelName}
        </p>
      ) : null}

      {/* 가격 — 평면 + 얇은 구분선 (회색 카드 제거) */}
      {block.priceVisible && (
        <div className="border-y border-[var(--jm-border)] py-6 md:py-7">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
            <div className="text-3xl font-bold tabular-nums tracking-tight text-[var(--jm-text)] md:text-4xl">
              ₩{displaySell.toLocaleString("ko-KR")}
            </div>
            {hasDiscount && (
              <div className="text-jm-base text-[var(--jm-text-subtle)] line-through tabular-nums">
                ₩{displayList.toLocaleString("ko-KR")}
              </div>
            )}
            {hasDiscount && block.showSaleBadge && (
              <span className="inline-flex items-center rounded-full bg-[var(--jm-warning-bg)] px-2.5 py-1 text-jm-xs font-bold text-[var(--jm-warning-fg)]">
                SALE{discountPct > 0 && ` ${discountPct}%`}
              </span>
            )}
          </div>
          {block.vatIncluded && isTaxable && (
            <div className="mt-2 text-jm-xs text-[var(--jm-text-muted)]">VAT 포함</div>
          )}
        </div>
      )}

      {/* 옵션 선택 */}
      {hasOptions && (
        <div className="space-y-5">
          {productOptions.map((opt) => {
            const selectedValueId = selectedOptions[opt.id];
            const selectedValue = opt.values.find((v) => v.id === selectedValueId);
            return (
              <div key={opt.id} className="space-y-2.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-jm-sm font-semibold text-[var(--jm-text)]">
                    {opt.name}
                  </span>
                  {opt.required && (
                    <span className="text-jm-2xs font-medium text-[var(--jm-danger-fg)]">
                      필수
                    </span>
                  )}
                  {selectedValue && (
                    <span className="ml-auto text-jm-xs text-[var(--jm-text-muted)]">
                      {selectedValue.label}
                      {selectedValue.mappedProduct && (
                        <span className="ml-1 text-[var(--jm-text-subtle)]">
                          → {selectedValue.mappedProduct.name}
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {opt.values.map((val) => {
                    const isSelected = selectedValueId === val.id;
                    const addPrice = parseFloat(val.addPrice) || 0;
                    // 가격 표시 우선순위 (POS 시트와 동일):
                    //  - addPrice ≠ 0 → "+₩addPrice" (운영자 표시용 차액)
                    //  - SWAP + mappedProduct.sellingPrice > 0 → "₩sellingPrice" (폴백)
                    const isSwap =
                      val.mappedMode === "SWAP" && !!val.mappedProduct;
                    const swapPrice = isSwap
                      ? Number(val.mappedProduct?.sellingPrice ?? 0)
                      : 0;
                    return (
                      <button
                        key={val.id}
                        type="button"
                        onClick={() =>
                          setSelectedOptions((prev) => ({
                            ...prev,
                            [opt.id]: isSelected ? "" : val.id,
                          }))
                        }
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-jm-sm font-medium transition-all",
                          isSelected
                            ? "border-[var(--jm-action)] bg-[var(--jm-action)] text-[var(--jm-action-fg)]"
                            : "border-[var(--jm-border)] bg-[var(--jm-surface)] text-[var(--jm-text)] hover:border-[var(--jm-border-strong)]",
                        )}
                      >
                        <span>{val.label}</span>
                        {addPrice !== 0 ? (
                          <span
                            className={cn(
                              "text-jm-xs tabular-nums",
                              isSelected
                                ? "opacity-80"
                                : "text-[var(--jm-text-muted)]",
                            )}
                          >
                            {addPrice > 0 ? "+" : ""}
                            ₩{Math.abs(addPrice).toLocaleString("ko-KR")}
                          </span>
                        ) : isSwap && swapPrice > 0 ? (
                          <span
                            className={cn(
                              "text-jm-xs tabular-nums",
                              isSelected
                                ? "opacity-80"
                                : "text-[var(--jm-text-muted)]",
                            )}
                          >
                            ₩{swapPrice.toLocaleString("ko-KR")}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 수량 + 장바구니 + 바로 구매 — pill 스타일 */}
      {(block.quantityVisible || block.addToCart.visible || block.buyNow.visible) && (
        <div className="flex flex-wrap items-stretch gap-3">
          {block.quantityVisible && (block.addToCart.visible || block.buyNow.visible) && (
            <div className="inline-flex h-14 items-center rounded-full border border-[var(--jm-border)] bg-[var(--jm-surface)] p-1">
              <JmIconButton
                variant="ghost"
                size="md"
                className="size-12 rounded-full text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                aria-label="수량 감소"
              >
                <Minus className="h-5 w-5" />
              </JmIconButton>
              <input
                type="text"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => {
                  const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
                  setQuantity(Number.isFinite(v) && v > 0 ? v : 1);
                }}
                className="h-full w-12 bg-transparent text-center text-jm-base font-semibold tabular-nums text-[var(--jm-text)] outline-none"
                aria-label="수량"
              />
              <JmIconButton
                variant="ghost"
                size="md"
                className="size-12 rounded-full text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
                onClick={() => setQuantity((q) => q + 1)}
                aria-label="수량 증가"
              >
                <Plus className="h-5 w-5" />
              </JmIconButton>
            </div>
          )}
          {block.addToCart.visible && (
            <JmButton
              variant="outline"
              disabled={busyAction !== null}
              onClick={() => runCommerce("cart", commerce.onAddToCart, product.id)}
              className="h-14 gap-2.5 rounded-full px-7 text-jm-base"
            >
              <ShoppingCart className="h-5 w-5" />
              {busyAction === "cart" ? "처리 중..." : block.addToCart.label}
            </JmButton>
          )}
          {block.buyNow.visible && (
            <JmButton
              variant="cta"
              disabled={busyAction !== null}
              onClick={() => runCommerce("buy", commerce.onBuyNow, product.id)}
              className="group h-14 gap-3 rounded-full px-9 text-jm-base"
            >
              {busyAction === "buy" ? "처리 중..." : block.buyNow.label}
              <span
                aria-hidden
                className="inline-block transition-transform duration-200 group-hover:translate-x-1"
              >
                →
              </span>
            </JmButton>
          )}
        </div>
      )}

      {/* 추가구매 추천 */}
      {hasBundles && (
        <div className="space-y-3 rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-jm-sm font-semibold text-[var(--jm-text)]">
              함께 사면 좋아요
            </h3>
            <span className="text-jm-xs text-[var(--jm-text-muted)]">
              {selectedBundleCount > 0
                ? `${selectedBundleCount}개 추가됨`
                : `${bundles.length}개 추천`}
            </span>
          </div>
          <div className="flex flex-col gap-2.5">
            {bundles.map((bundle) => {
              const qty = getBundleQty(bundle.id);
              const isSelected = qty > 0;
              const bp = bundle.bundleProduct;
              const bpSell = parseFloat(bp.sellingPrice) || 0;
              const bpList = parseFloat(bp.listPrice ?? "0") || 0;
              const bundleDiscount = parseFloat(bundle.discountAmount ?? "0") || 0;
              const bpFinal = Math.max(0, bpSell - bundleDiscount);
              const bpTaxable = bp.taxType === "TAXABLE";
              const bpFactor = block.vatIncluded && bpTaxable ? 1 + taxRate : 1;
              const showFinal = Math.round(bpFinal * bpFactor);
              const showOriginal =
                bundleDiscount > 0
                  ? Math.round(bpSell * bpFactor)
                  : bpList > bpSell
                    ? Math.round(bpList * bpFactor)
                    : 0;
              const defaultQty = parseFloat(bundle.defaultQuantity) || 1;
              return (
                <div
                  key={bundle.id}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-3 transition-all",
                    isSelected
                      ? "border-[var(--jm-action)] bg-[var(--jm-surface-muted)]"
                      : "border-[var(--jm-border)] bg-[var(--jm-bg)]",
                  )}
                >
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-[var(--jm-surface-muted)]">
                    {bp.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={bp.imageUrl}
                        alt={bp.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-jm-2xs text-[var(--jm-text-subtle)]">
                        no img
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-jm-sm font-medium text-[var(--jm-text)]">
                      {bp.name}
                    </div>
                    {bundle.copy ? (
                      <div className="truncate text-jm-xs text-[var(--jm-text-muted)]">
                        {bundle.copy}
                      </div>
                    ) : null}
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-jm-sm font-semibold tabular-nums text-[var(--jm-text)]">
                        ₩{showFinal.toLocaleString("ko-KR")}
                      </span>
                      {showOriginal > 0 && showOriginal !== showFinal && (
                        <span className="text-jm-xs text-[var(--jm-text-subtle)] line-through tabular-nums">
                          ₩{showOriginal.toLocaleString("ko-KR")}
                        </span>
                      )}
                      {isSelected && qty > 1 && (
                        <span className="text-jm-xs tabular-nums text-[var(--jm-text-muted)]">
                          × {qty} ={" "}
                          <span className="font-semibold text-[var(--jm-text)]">
                            ₩{(showFinal * qty).toLocaleString("ko-KR")}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                  {isSelected ? (
                    /* 선택된 상태 — 수량 stepper pill */
                    <div className="inline-flex h-9 items-center rounded-full border border-[var(--jm-border)] bg-[var(--jm-surface)] p-0.5">
                      <JmIconButton
                        variant="ghost"
                        size="sm"
                        className="size-8 rounded-full text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
                        onClick={() => setBundleQty(bundle.id, qty - 1)}
                        aria-label="수량 감소"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </JmIconButton>
                      <span className="w-7 text-center text-jm-sm font-semibold tabular-nums text-[var(--jm-text)]">
                        {qty}
                      </span>
                      <JmIconButton
                        variant="ghost"
                        size="sm"
                        className="size-8 rounded-full text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
                        onClick={() => setBundleQty(bundle.id, qty + 1)}
                        aria-label="수량 증가"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </JmIconButton>
                    </div>
                  ) : (
                    /* 미선택 상태 — 추가 버튼 */
                    <button
                      type="button"
                      onClick={() => addBundle(bundle.id, defaultQty)}
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] transition-colors hover:bg-[var(--jm-border)] hover:text-[var(--jm-text)]"
                      aria-label={`${bp.name} 추가`}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {selectedBundleCount > 0 && (
            <div className="flex items-baseline justify-between gap-2 border-t border-[var(--jm-border)] pt-3">
              <span className="text-jm-xs text-[var(--jm-text-muted)]">
                추가상품 합계
              </span>
              <span className="text-jm-base font-bold tabular-nums text-[var(--jm-text)]">
                +₩
                {bundles
                  .reduce((sum, b) => {
                    const q = getBundleQty(b.id);
                    if (q <= 0) return sum;
                    const bp = b.bundleProduct;
                    const bpSell = parseFloat(bp.sellingPrice) || 0;
                    const bd = parseFloat(b.discountAmount ?? "0") || 0;
                    const bpFinal = Math.max(0, bpSell - bd);
                    const bpTaxable = bp.taxType === "TAXABLE";
                    const bpFactor =
                      block.vatIncluded && bpTaxable ? 1 + taxRate : 1;
                    return sum + Math.round(bpFinal * bpFactor) * q;
                  }, 0)
                  .toLocaleString("ko-KR")}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 추가 CTA — 라운드 pill */}
      {block.ctas.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {block.ctas
            .filter((c) => c.label)
            .slice(0, 2)
            .map((cta, i) => (
              <a
                key={i}
                href={cta.href || "#"}
                className={cn(
                  "group inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-jm-sm font-semibold transition-colors",
                  cta.variant === "primary"
                    ? "bg-[var(--jm-action)] text-[var(--jm-action-fg)] hover:bg-[var(--jm-action-hover)]"
                    : "border border-[var(--jm-border)] text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)]",
                )}
              >
                {cta.label}
                <span
                  aria-hidden
                  className="inline-block transition-transform duration-200 group-hover:translate-x-0.5"
                >
                  →
                </span>
              </a>
            ))}
        </div>
      )}
    </div>
  );

  return (
    <JmScope theme="light" className="w-full">
      <section
        className={cn(
          "w-full px-6 md:px-16",
          PRODUCT_HERO_PADDING[block.paddingY ?? "xl"],
          PRODUCT_HERO_BG[block.background ?? "none"],
        )}
      >
        <div className="mx-auto max-w-6xl">
          {isImageTop ? (
            <div className="space-y-10 md:space-y-12">
              {imageBlock}
              {infoBlock}
            </div>
          ) : (
            <div className="grid gap-10 md:grid-cols-[1.05fr_1fr] md:items-start md:gap-12 lg:gap-16">
              {isImageRight ? (
                <>
                  <div>{infoBlock}</div>
                  <div className="md:sticky md:top-6">{imageBlock}</div>
                </>
              ) : (
                <>
                  <div className="md:sticky md:top-6">{imageBlock}</div>
                  <div>{infoBlock}</div>
                </>
              )}
            </div>
          )}
        </div>
      </section>
    </JmScope>
  );
}

interface CompanyInfoApiResponse {
  name: string;
  phone: string | null;
  email: string | null;
}

/** 상품정보 고시 — Product 의 의무 필드 + spec 자동 + custom rows 합쳐서 info-grid 1섹션 디자인으로 */
export function ProductInfoBlockView({
  block,
  productId,
}: {
  block: ProductInfoBlock;
  productId?: string;
}) {
  const productQuery = useQuery({
    queryKey: ["product-info-disclosure", productId ?? ""],
    queryFn: () => apiGet<ProductInfoApiResponse>(`/api/products/${productId}`),
    enabled: !!productId,
  });

  const companyQuery = useQuery({
    queryKey: ["company-info-fallback"],
    queryFn: () => apiGet<CompanyInfoApiResponse>("/api/company-info"),
    enabled: !!productId,
  });

  const specsQuery = useQuery({
    queryKey: ["product-specs", productId ?? ""],
    queryFn: () => apiGet<SpecValue[]>(`/api/products/${productId}/specs`),
    enabled: !!productId && block.useProductSpecs,
  });

  const product = productQuery.data;
  const company = companyQuery.data;

  // 자동 매핑 행 생성
  const autoRows: Array<{ key: string; value: string }> = [];
  if (product) {
    if (product.name) autoRows.push({ key: "품명", value: product.name });
    if (product.modelName) autoRows.push({ key: "모델명", value: product.modelName });
    if (product.brandRef?.name || product.brand) {
      autoRows.push({
        key: "제조사 / 브랜드",
        value: product.brandRef?.name ?? product.brand ?? "",
      });
    }
    if (product.countryOfOrigin)
      autoRows.push({ key: "제조국", value: product.countryOfOrigin });
    if (product.manufacturer)
      autoRows.push({ key: "제조자", value: product.manufacturer });
    if (product.importer) autoRows.push({ key: "수입자", value: product.importer });
    if (product.certifications)
      autoRows.push({ key: "인증·허가", value: product.certifications });
    if (product.spec) autoRows.push({ key: "규격", value: product.spec });

    // 주요 사양 (Spec 자동 매핑)
    if (block.useProductSpecs && specsQuery.data) {
      for (const sv of specsQuery.data) {
        autoRows.push({
          key: sv.slot.name,
          value: `${sv.value}${sv.slot.type === "NUMBER" && sv.slot.unit ? ` ${sv.slot.unit}` : ""}`,
        });
      }
    }

    if (product.manufactureDate)
      autoRows.push({ key: "제조 연월", value: product.manufactureDate });

    autoRows.push({
      key: "품질보증기준",
      value: product.warrantyPolicy || "소비자분쟁해결기준 (공정거래위원회 고시) 준용",
    });

    // A/S 책임자 / 연락처 — Product 우선, 없으면 CompanyInfo 폴백
    const asResp = product.asResponsible || company?.name || "";
    if (asResp) autoRows.push({ key: "A/S 책임자", value: asResp });
    const asPhone = company?.phone;
    const asEmail = company?.email;
    if (asPhone || asEmail) {
      autoRows.push({
        key: "A/S 연락처",
        value: [asPhone, asEmail].filter(Boolean).join(" / "),
      });
    }
  }

  // excludeKeys 필터 + customRows 합치기
  const filtered = autoRows.filter((r) => !block.excludeKeys.includes(r.key));
  const allRows = [...filtered, ...block.customRows.filter((r) => r.key || r.value)];

  // 데이터 미준비/오류 상태
  if (!productId) {
    return (
      <JmScope theme="light" className="w-full">
        <section
          className={cn(
            "w-full px-6 py-12 md:px-16",
            block.background === "muted"
              ? "bg-[var(--jm-surface-muted)]"
              : "",
          )}
        >
          <div className="mx-auto max-w-5xl rounded-2xl border border-dashed border-[var(--jm-border)] bg-[var(--jm-surface)]/50 px-4 py-6 text-center text-jm-sm text-[var(--jm-text-muted)]">
            상품 컨텍스트 없이는 자동 매핑이 동작하지 않습니다 (편집기 미리보기에서 정상 동작)
          </div>
        </section>
      </JmScope>
    );
  }

  if (productQuery.isPending) {
    return (
      <JmScope theme="light" className="w-full">
        <section
          className={cn(
            "w-full px-6 py-12 md:px-16",
            block.background === "muted"
              ? "bg-[var(--jm-surface-muted)]"
              : "",
          )}
        >
          <div className="mx-auto h-32 max-w-5xl animate-pulse rounded-2xl bg-[var(--jm-surface-muted)]" />
        </section>
      </JmScope>
    );
  }

  return (
    <JmScope theme="light" className="w-full">
      <section
        className={cn(
          "w-full px-6 md:px-16",
          INFO_GRID_PADDING[block.paddingY ?? "xl"],
          INFO_GRID_BG[block.background ?? "muted"],
        )}
      >
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-5 border-y border-[var(--jm-border)] py-8 md:grid-cols-[260px_1fr] md:gap-12 md:py-10">
            <div className="flex flex-col gap-2">
              {block.number && (
                <span className="text-jm-2xs font-semibold tracking-[0.25em] text-[var(--jm-text-subtle)]">
                  {block.number}
                </span>
              )}
              <div className="flex items-center gap-2">
                <FileText
                  className="h-5 w-5 shrink-0 text-[var(--jm-text)]"
                  aria-hidden
                />
                <h3 className="text-jm-lg font-bold tracking-tight text-[var(--jm-text)] md:text-jm-xl">
                  {block.title}
                </h3>
              </div>
            </div>
            <div className="space-y-3 text-jm-sm leading-relaxed text-[var(--jm-text)]">
              {allRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--jm-border)] px-4 py-6 text-center text-jm-sm text-[var(--jm-text-muted)]">
                  표시할 항목이 없습니다 — 상품 정보 또는 ProductSpec 을 먼저 등록하세요
                </div>
              ) : (
                <dl className="grid gap-x-6 gap-y-3 md:grid-cols-[110px_1fr]">
                  {allRows.map((row, ri) => (
                    <div key={ri} className="contents">
                      <dt className="text-[var(--jm-text-muted)]">{row.key}</dt>
                      <dd className="font-medium text-[var(--jm-text)]">
                        <InlineMarkdown text={row.value} />
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>
        </div>
      </section>
    </JmScope>
  );
}

/** 직접 Supabase 공개 URL → 우리 프록시 URL 로 재작성 (Content-Type 강제 + 인코딩 자동 변환) */
function resolveHtmlUrl(url: string): string {
  if (!url) return url;
  const m = url.match(/\/storage\/v1\/object\/public\/product-html\/(.+)$/);
  if (m) return `/api/products/landing-html/${m[1]}`;
  return url;
}

export function HtmlEmbedBlockView({ block }: { block: HtmlEmbedBlock }) {
  const sandbox = block.allowForms ? "allow-scripts allow-forms" : "allow-scripts";
  const wrapClass = cn(
    block.displayMode === "cover"
      ? "relative left-1/2 w-screen -translate-x-1/2 bg-[var(--jm-bg)]"
      : "w-full",
  );

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);

  // iframe 안 HTML 이 보낸 콘텐츠 높이 수신 → autoHeight 켜져 있으면 iframe 동적 리사이즈
  useEffect(() => {
    if (!block.autoHeight) return;
    const onMessage = (e: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      if (e.source !== iframe.contentWindow) return;
      const data = e.data as { type?: string; height?: number };
      if (data?.type !== "landing-html-resize") return;
      if (typeof data.height === "number" && data.height > 0) {
        setMeasuredHeight(Math.min(Math.ceil(data.height), 50000));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [block.autoHeight]);

  // 새 iframe 마운트 시 측정값 리셋 (이전 콘텐츠 높이 흔적 제거)
  useEffect(() => {
    setMeasuredHeight(null);
  }, [block.htmlUrl]);

  const finalHeight =
    block.autoHeight && measuredHeight ? measuredHeight : block.heightPx;

  if (!block.htmlUrl) {
    return (
      <JmScope theme="light" className="w-full">
        <section className={wrapClass} style={{ height: block.heightPx }}>
          <div className="flex h-full items-center justify-center bg-[var(--jm-surface-muted)] text-jm-sm text-[var(--jm-text-muted)]">
            HTML 파일을 업로드하세요
          </div>
        </section>
      </JmScope>
    );
  }

  return (
    <JmScope theme="light" className="w-full">
      <section className={wrapClass} style={{ height: finalHeight }}>
        <iframe
          ref={iframeRef}
          src={resolveHtmlUrl(block.htmlUrl)}
          sandbox={sandbox}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="block h-full w-full border-0"
          title="custom-html"
          scrolling={block.autoHeight ? "no" : "auto"}
        />
      </section>
    </JmScope>
  );
}
