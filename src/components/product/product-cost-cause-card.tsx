"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Layers,
  Link2,
  Plus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { JmBadge, JmSkeleton } from "@/jm";

type CauseType =
  | "supplier-price"
  | "incoming-cost"
  | "mapping"
  | "subcomponent";

interface Cause {
  type: CauseType;
  title: string;
  subject: string;
  detail: string;
  delta: {
    from: number;
    to: number;
    diff: number;
    percent: number;
    direction: "up" | "down";
  } | null;
  occurredAt: string;
  link: { href: string; label: string } | null;
}

interface CostCauseResponse {
  acknowledgedAt: string | null;
  since: string;
  causes: Cause[];
}

const fmtKrw = (n: number) =>
  `₩${Math.round(Math.abs(n)).toLocaleString("ko-KR")}`;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

function CauseIcon({ type }: { type: CauseType }) {
  switch (type) {
    case "supplier-price":
      return <TrendingUp className="size-3.5" />;
    case "incoming-cost":
      return <Plus className="size-3.5" />;
    case "mapping":
      return <Link2 className="size-3.5" />;
    case "subcomponent":
      return <Layers className="size-3.5" />;
  }
}

export function ProductCostCauseCard({ productId }: { productId: string }) {
  const query = useQuery<CostCauseResponse>({
    queryKey: queryKeys.products.costCause(productId),
    queryFn: () =>
      apiGet<CostCauseResponse>(`/api/products/${productId}/cost-cause`),
  });

  if (query.isPending) {
    return (
      <div className="rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] p-3 space-y-2">
        <JmSkeleton className="h-4 w-40" />
        <JmSkeleton className="h-4 w-full" />
        <JmSkeleton className="h-4 w-3/4" />
      </div>
    );
  }

  const data = query.data;
  const causes = data?.causes ?? [];

  if (causes.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 py-2.5 text-jm-xs text-[var(--jm-text-muted)]">
        원인을 자동 감지하지 못했습니다. 매핑·부대비용·구성품 변경 이력을 직접
        확인해주세요.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] overflow-hidden">
      <div className="bg-[var(--jm-surface-muted)] px-3 py-1.5 text-jm-2xs font-medium text-[var(--jm-text-muted)] border-b border-[var(--jm-border)]">
        원가 변동 원인 ({causes.length}건)
        {data?.acknowledgedAt && (
          <span className="ml-2">
            · 마지막 확인: {fmtDate(data.acknowledgedAt)} 이후
          </span>
        )}
      </div>
      <ul className="divide-y divide-[var(--jm-border)]">
        {causes.map((c, idx) => {
          const up = c.delta?.direction === "up";
          const TrendIcon = up ? TrendingUp : TrendingDown;
          const deltaColor = c.delta
            ? up
              ? "text-[var(--jm-danger-fg)]"
              : "text-[var(--jm-success-fg)]"
            : "";
          return (
            <li key={idx} className="px-3 py-2 flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0 text-[var(--jm-text-muted)]">
                <CauseIcon type={c.type} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <JmBadge
                    variant="outline"
                    size="sm"
                    shape="square"
                    className="font-normal"
                  >
                    {c.title}
                  </JmBadge>
                  <span className="text-jm-sm font-medium text-[var(--jm-text)] truncate">
                    {c.subject}
                  </span>
                  <span className="text-jm-2xs text-[var(--jm-text-muted)] tabular-nums">
                    {fmtDate(c.occurredAt)}
                  </span>
                </div>
                <div className="mt-0.5 text-jm-xs text-[var(--jm-text-muted)] flex flex-wrap items-center gap-x-2">
                  <span>{c.detail}</span>
                  {c.delta && (
                    <span
                      className={`inline-flex items-center gap-0.5 tabular-nums font-medium ${deltaColor}`}
                    >
                      <TrendIcon className="size-3" />
                      {up ? "+" : "-"}
                      {fmtKrw(c.delta.diff)}
                      {" ("}
                      {up ? "+" : ""}
                      {c.delta.percent.toFixed(1)}%{")"}
                    </span>
                  )}
                  {c.link && (
                    <Link
                      href={c.link.href}
                      className="inline-flex items-center gap-0.5 text-[var(--jm-action)] hover:underline"
                    >
                      {c.link.label}
                      <ArrowRight className="size-3" />
                    </Link>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
