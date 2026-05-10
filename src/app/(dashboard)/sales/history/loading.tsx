import { JmCard, JmSkeleton } from "@/jm";

/**
 * 통합 판매내역 첫 진입 로딩.
 * 실제 page.tsx 의 골격 (KPI 5 + 채널 한 줄 + 테이블) 에 맞춰 인라인 작성.
 */
export default function Loading() {
  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="flex w-full flex-col gap-6 p-4">
        {/* KPI 5 */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-2xl bg-[var(--jm-surface)] p-5 border border-[var(--jm-border)]"
            >
              <JmSkeleton className="h-3 w-16" />
              <JmSkeleton className="h-7 w-32" />
              <JmSkeleton className="h-3 w-20" />
            </div>
          ))}
        </div>

        {/* 메인 카드 */}
        <JmCard className="overflow-hidden p-0">
          {/* 툴바 */}
          <div className="flex items-center gap-2 border-b border-[var(--jm-border)] px-3 py-2.5">
            <JmSkeleton className="h-8 w-[260px]" />
            <JmSkeleton className="h-8 w-[200px]" />
            <JmSkeleton className="h-8 w-[160px]" />
            <div className="ml-auto flex gap-2">
              <JmSkeleton className="h-8 w-[130px]" />
              <JmSkeleton className="h-8 w-8" />
              <JmSkeleton className="h-8 w-[80px]" />
            </div>
          </div>
          {/* 채널 분포 한 줄 */}
          <div className="flex items-center gap-3 border-b border-[var(--jm-border)] bg-[var(--jm-surface-muted)] px-4 py-2.5">
            <JmSkeleton className="h-4 w-20" />
            <JmSkeleton className="h-6 w-[120px] rounded-md" />
            <JmSkeleton className="h-6 w-[120px] rounded-md" />
            <JmSkeleton className="h-6 w-[120px] rounded-md" />
          </div>
          {/* 테이블 헤더 */}
          <div className="flex items-center gap-3 border-b border-[var(--jm-border)] px-3 py-2.5">
            {Array.from({ length: 10 }).map((_, i) => (
              <JmSkeleton
                key={i}
                className="h-3"
                style={{ width: `${[80, 50, 100, 80, 70, 90, 80, 120, 60, 80][i]}px` }}
              />
            ))}
          </div>
          {/* 테이블 본문 */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-[var(--jm-border)] px-3 py-3"
            >
              {Array.from({ length: 10 }).map((_, j) => (
                <JmSkeleton
                  key={j}
                  className="h-4"
                  style={{
                    width: `${[80, 50, 100, 80, 70, 90, 80, 120, 60, 80][j]}px`,
                  }}
                />
              ))}
            </div>
          ))}
        </JmCard>
      </div>
    </div>
  );
}
