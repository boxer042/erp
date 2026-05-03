"use client";

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
import { queryKeys } from "@/lib/query-keys";
import type {
  SpecTableBlock,
  AmbientVideoBlock,
  TableBlock,
  ChartBlock,
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
