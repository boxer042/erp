"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import type {
  SpecTableBlock,
  AmbientVideoBlock,
  TableBlock,
  ChartBlock,
  StatsGridBlock,
  HtmlEmbedBlock,
} from "@/lib/validators/landing-block";

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
    <section className="w-full px-6 py-10 md:px-16 md:py-12">
      <div className="mx-auto max-w-3xl">
        {block.title && (
          <h3 className="mb-4 text-2xl font-semibold md:text-3xl">{block.title}</h3>
        )}
        {!productId ? (
          <div className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            상품 컨텍스트 없이는 스펙을 표시할 수 없습니다 (편집기 미리보기에서 정상 동작)
          </div>
        ) : query.isPending ? (
          <div className="rounded-md border border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            스펙 불러오는 중...
          </div>
        ) : values.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            아직 등록된 스펙이 없습니다 (상품 상세에서 등록 후 표시됩니다)
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <tbody>
              {values.map((v) => (
                <tr key={v.id} className="border-b border-border">
                  <th className="w-1/3 bg-muted/40 px-4 py-3 text-left font-medium text-muted-foreground">
                    {v.slot.name}
                  </th>
                  <td className="px-4 py-3 tabular-nums">
                    {v.value}
                    {v.slot.type === "NUMBER" && v.slot.unit && (
                      <span className="ml-1 text-muted-foreground">{v.slot.unit}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

const AMBIENT_HEIGHT: Record<AmbientVideoBlock["height"], string> = {
  md: "h-[420px] md:h-[540px]",
  lg: "h-[560px] md:h-[720px]",
  screen: "h-[100svh]",
};

export function AmbientVideoBlockView({ block }: { block: AmbientVideoBlock }) {
  const color = block.textColor === "dark" ? "text-foreground" : "text-white";
  const overlay = block.textColor === "light" && block.videoUrl ? "bg-black/35" : "";

  return (
    <section className={cn("relative w-full overflow-hidden bg-black", AMBIENT_HEIGHT[block.height])}>
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
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/60">
          영상 URL을 입력하세요 (mp4)
        </div>
      )}
      {overlay && <div className={cn("absolute inset-0", overlay)} />}
      {(block.headline || block.subheadline) && (
        <div
          className={cn(
            "relative z-10 flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center md:px-16",
            color,
          )}
        >
          {block.headline && (
            <h2 className="text-3xl font-semibold leading-tight md:text-5xl">{block.headline}</h2>
          )}
          {block.subheadline && (
            <p className="max-w-2xl text-base opacity-90 md:text-lg">{block.subheadline}</p>
          )}
        </div>
      )}
    </section>
  );
}

export function TableBlockView({ block }: { block: TableBlock }) {
  const headers = block.headers.length > 0 ? block.headers : ["항목"];
  const rows = block.rows.length > 0 ? block.rows : [];

  if (rows.length === 0) {
    return (
      <section className="w-full px-6 py-8 md:px-16">
        <div className="mx-auto flex max-w-3xl items-center justify-center rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
          행을 추가하세요
        </div>
      </section>
    );
  }

  return (
    <section className="w-full px-6 py-10 md:px-16 md:py-12">
      <div className="mx-auto max-w-4xl overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-foreground/20 bg-muted/40">
              {headers.map((h, i) => (
                <th key={i} className="px-4 py-3 text-left font-semibold">
                  {h || `열 ${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="border-b border-border">
                {headers.map((_, c) => (
                  <td key={c} className="px-4 py-2.5 tabular-nums">
                    {row[c] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {block.caption && (
          <div className="mt-2 px-4 text-xs text-muted-foreground">{block.caption}</div>
        )}
      </div>
    </section>
  );
}

const CHART_COLORS = [
  "var(--chart-1, #3b82f6)",
  "var(--chart-2, #10b981)",
  "var(--chart-3, #f59e0b)",
  "var(--chart-4, #ef4444)",
  "var(--chart-5, #8b5cf6)",
  "var(--chart-6, #ec4899)",
];

export function ChartBlockView({ block }: { block: ChartBlock }) {
  const data = block.data.filter((d) => d.label || d.value);

  if (data.length === 0) {
    return (
      <section className="w-full px-6 py-8 md:px-16">
        <div className="mx-auto flex max-w-3xl items-center justify-center rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
          데이터를 추가하세요
        </div>
      </section>
    );
  }

  return (
    <section className="w-full px-6 py-10 md:px-16 md:py-12">
      <div className="mx-auto max-w-4xl">
        {block.title && (
          <h3 className="mb-4 text-center text-xl font-semibold md:text-2xl">{block.title}</h3>
        )}
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {block.chartType === "bar" ? (
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill={CHART_COLORS[0]} />
              </BarChart>
            ) : block.chartType === "line" ? (
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke={CHART_COLORS[0]} strokeWidth={2} />
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
                  label
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    </section>
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
  muted: "bg-muted",
  dark: "bg-foreground text-background",
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
                  "text-xs font-semibold uppercase tracking-[0.18em]",
                  isDark ? "text-background/70" : "text-muted-foreground",
                )}
              >
                {block.eyebrow}
              </div>
            )}
            {block.heading && (
              <h3
                className={cn(
                  "whitespace-pre-line text-3xl font-bold leading-[1.1] tracking-tight md:text-5xl",
                  isDark ? "text-background" : "text-foreground",
                )}
              >
                {block.heading}
              </h3>
            )}
            {block.body && (
              <p
                className={cn(
                  "whitespace-pre-wrap text-base leading-relaxed md:text-lg",
                  isDark ? "text-background/80" : "text-muted-foreground",
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
              isDark ? "border-background/20" : "border-border",
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
                        ? "md:border-r md:border-background/20"
                        : "md:border-r md:border-border"),
                  )}
                >
                  <div className="mb-2 flex items-baseline gap-1">
                    <span
                      className={cn(
                        "text-4xl font-bold leading-none tracking-tight md:text-5xl",
                        isDark ? "text-background" : "text-foreground",
                      )}
                    >
                      {it.value || "—"}
                    </span>
                    {it.unit && (
                      <span
                        className={cn(
                          "text-base font-medium md:text-lg",
                          isDark ? "text-background/70" : "text-muted-foreground",
                        )}
                      >
                        {it.unit}
                      </span>
                    )}
                  </div>
                  <div
                    className={cn(
                      "text-xs md:text-sm",
                      isDark ? "text-background/70" : "text-muted-foreground",
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
      ? "relative left-1/2 w-screen -translate-x-1/2 bg-background"
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

  const finalHeight = block.autoHeight && measuredHeight ? measuredHeight : block.heightPx;

  if (!block.htmlUrl) {
    return (
      <section className={wrapClass} style={{ height: block.heightPx }}>
        <div className="flex h-full items-center justify-center bg-muted text-sm text-muted-foreground">
          HTML 파일을 업로드하세요
        </div>
      </section>
    );
  }

  return (
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
  );
}
