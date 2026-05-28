"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtCompact } from "./_helpers";

export interface DailySeriesPoint {
  date: string; // "MM/DD"
  amount: number;
}

export function DailySalesArea({ data }: { data: DailySeriesPoint[] }) {
  // 데이터 없을 때 recharts 가 ResponsiveContainer 초기 measurement 에서 width(-1) 경고를 띄움.
  // 빈 placeholder 로 같은 높이만 차지 — layout shift 없이 차트만 생략.
  if (data.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-jm-xs text-[var(--jm-text-subtle)]">
        데이터 없음
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="dashSalesArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--jm-action)" stopOpacity={0.4} />
            <stop offset="95%" stopColor="var(--jm-action)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "var(--jm-text-muted)" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--jm-text-muted)" }}
          tickFormatter={(v) => fmtCompact(Number(v))}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        <Tooltip
          cursor={{ stroke: "var(--jm-border-strong)", strokeWidth: 1 }}
          contentStyle={{
            backgroundColor: "var(--jm-surface)",
            border: "1px solid var(--jm-border)",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: "var(--jm-text-muted)" }}
          formatter={(v) => [`₩${Number(v).toLocaleString("ko-KR")}`, "매출"]}
        />
        <Area
          type="monotone"
          dataKey="amount"
          stroke="var(--jm-action)"
          strokeWidth={2}
          fill="url(#dashSalesArea)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export interface MarginTrendPoint {
  month: string; // "M월"
  marginPct: number;
  revenue: number;
}

export function MarginTrendLine({ data }: { data: MarginTrendPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-jm-xs text-[var(--jm-text-subtle)]">
        데이터 없음
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
        <CartesianGrid stroke="var(--jm-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: "var(--jm-text-muted)" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--jm-text-muted)" }}
          tickFormatter={(v) => `${v}%`}
          tickLine={false}
          axisLine={false}
          width={42}
        />
        <Tooltip
          cursor={{ stroke: "var(--jm-border-strong)", strokeWidth: 1 }}
          contentStyle={{
            backgroundColor: "var(--jm-surface)",
            border: "1px solid var(--jm-border)",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: "var(--jm-text-muted)" }}
          formatter={(v, name) => {
            if (name === "marginPct") return [`${Number(v).toFixed(1)}%`, "마진율"];
            return [v, name];
          }}
        />
        <Line
          type="monotone"
          dataKey="marginPct"
          stroke="var(--jm-success-solid)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--jm-success-solid)", strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export interface PaymentMixDatum {
  name: string;
  value: number;
}

export function PaymentMixBars({ data }: { data: PaymentMixDatum[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return (
      <p className="py-12 text-center text-jm-sm text-[var(--jm-text-muted)]">
        이번 달 결제 데이터 없음
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {data.map((d, i) => {
        const pct = (d.value / total) * 100;
        return (
          <div key={d.name} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-jm-xs">
              <span className="text-[var(--jm-text)]">{d.name}</span>
              <span className="text-[var(--jm-text-muted)] tabular-nums">
                ₩{Math.round(d.value).toLocaleString("ko-KR")} · {pct.toFixed(1)}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-[var(--jm-surface-muted)]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length],
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export interface ChannelDonutDatum {
  name: string;
  value: number;
}

const DONUT_COLORS = [
  "var(--jm-action)",
  "var(--jm-info-solid)",
  "var(--jm-success-solid)",
  "var(--jm-warning-solid)",
  "var(--jm-danger-solid)",
  "var(--jm-text-muted)",
];

export function ChannelDonut({ data }: { data: ChannelDonutDatum[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  // recharts ResponsiveContainer width/height="100%" 이라 데이터 0 일 때 초기 measurement
  // 가 -1 로 잡혀 dev 콘솔에 width(-1) 경고가 뜸. 호출처에서 length === 0 가드 하지만
  // 컴포넌트 자체에도 안전망 추가.
  if (data.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center text-jm-xs text-[var(--jm-text-subtle)] sm:h-[200px]">
        데이터 없음
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
      <div className="h-[180px] w-full min-w-0 sm:h-[200px] sm:flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={50}
              outerRadius={75}
              paddingAngle={2}
              strokeWidth={0}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--jm-surface)",
                border: "1px solid var(--jm-border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v) => [`₩${Number(v).toLocaleString("ko-KR")}`, ""]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex w-full flex-col gap-1 overflow-hidden sm:max-w-[200px]">
        {data.slice(0, 6).map((d, i) => {
          const pct = total > 0 ? (d.value / total) * 100 : 0;
          return (
            <div key={d.name} className="flex items-center gap-2 text-jm-xs">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }}
              />
              <span className="flex-1 truncate text-[var(--jm-text)]">
                {d.name}
              </span>
              <span className="tabular-nums text-[var(--jm-text-muted)]">
                {pct.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
