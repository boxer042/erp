import { JmCard, JmSkeleton } from "@/jm";

function StatSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-5">
      <div className="flex items-start justify-between">
        <JmSkeleton className="h-3 w-20" />
        <JmSkeleton className="h-8 w-8 rounded-lg" />
      </div>
      <JmSkeleton className="h-7 w-24" />
      <JmSkeleton className="h-3 w-32" />
    </div>
  );
}

function TableCardSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <JmCard className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-[var(--jm-border)] px-5 py-3">
        <JmSkeleton className="h-4 w-24" />
        <JmSkeleton className="h-6 w-16" />
      </div>
      <div className="flex items-center gap-3 bg-[var(--jm-surface-muted)] px-3 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <JmSkeleton key={i} className="h-3 w-16 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex items-center gap-3 border-b border-[var(--jm-border)] px-3 py-3 last:border-0"
        >
          {Array.from({ length: cols }).map((_, i) => (
            <JmSkeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </JmCard>
  );
}

export default function Loading() {
  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="flex w-full flex-col gap-6 p-4">
        {/* 헤더 */}
        <div className="space-y-1.5">
          <JmSkeleton className="h-7 w-48" />
          <JmSkeleton className="h-4 w-72" />
        </div>

        {/* 빠른 액션 */}
        <div className="flex flex-wrap items-center gap-2">
          <JmSkeleton className="h-10 w-[260px] rounded-xl" />
          {Array.from({ length: 5 }).map((_, i) => (
            <JmSkeleton key={i} className="h-10 w-24 rounded-xl" />
          ))}
        </div>

        {/* KPI — 사장 4 + 운영 8 (모바일 노출), 그 외 3 row 는 데스크톱만 */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, row) => (
          <div key={row} className="hidden gap-3 md:grid md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <StatSkeleton key={i} />
            ))}
          </div>
        ))}

        {/* 현금흐름 */}
        <JmCard className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-[var(--jm-border)] px-5 py-3">
            <JmSkeleton className="h-4 w-24" />
            <JmSkeleton className="h-6 w-16" />
          </div>
          <div className="grid grid-cols-2 divide-x divide-y divide-[var(--jm-border)] md:grid-cols-4 md:divide-y-0">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2 px-5 py-4">
                <JmSkeleton className="h-3 w-20" />
                <JmSkeleton className="h-6 w-32" />
                <JmSkeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        </JmCard>

        {/* 차트 row 1 (2개) */}
        <div className="grid gap-6 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <JmCard key={i} className="overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-[var(--jm-border)] px-5 py-3">
                <JmSkeleton className="h-4 w-32" />
              </div>
              <div className="p-3">
                <JmSkeleton className="h-[200px] w-full rounded-md" />
              </div>
            </JmCard>
          ))}
        </div>
        {/* 차트 row 2 (3개) */}
        <div className="grid gap-6 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <JmCard key={i} className="overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-[var(--jm-border)] px-5 py-3">
                <JmSkeleton className="h-4 w-28" />
              </div>
              <div className="p-3">
                <JmSkeleton className="h-[200px] w-full rounded-md" />
              </div>
            </JmCard>
          ))}
        </div>
        {/* 히트맵 */}
        <JmCard className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-[var(--jm-border)] px-5 py-3">
            <JmSkeleton className="h-4 w-40" />
          </div>
          <div className="p-4">
            <JmSkeleton className="h-[180px] w-full rounded-md" />
          </div>
        </JmCard>

        {/* 테이블 2 + 2 + 1 + 1 */}
        <div className="grid gap-6 lg:grid-cols-2">
          <TableCardSkeleton cols={4} />
          <TableCardSkeleton cols={4} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <TableCardSkeleton cols={3} />
          <TableCardSkeleton cols={4} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <TableCardSkeleton cols={3} />
          <TableCardSkeleton cols={2} />
        </div>
        <TableCardSkeleton cols={2} />
        <TableCardSkeleton cols={4} />
      </div>
    </div>
  );
}
