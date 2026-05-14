import { JmCard, JmCardContent, JmCardHeader, JmSkeleton } from "@/jm";

export default function Loading() {
  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      {/* 스티키 헤더 */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-6 py-3">
        <JmSkeleton className="h-8 w-8 rounded-md" />
        <JmSkeleton className="h-5 w-40" />
        <JmSkeleton className="h-5 w-12 rounded-md" />
      </div>

      <div className="space-y-6 p-6 max-w-[1280px] mx-auto w-full">
        {/* 메타 정보 */}
        <div className="flex gap-4">
          <JmSkeleton className="h-4 w-32" />
          <JmSkeleton className="h-4 w-40" />
          <JmSkeleton className="h-4 w-28" />
        </div>

        {/* KPI 3 */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <JmCard key={i}>
              <JmCardContent className="p-4 space-y-2">
                <JmSkeleton className="h-3 w-20" />
                <JmSkeleton className="h-7 w-24" />
              </JmCardContent>
            </JmCard>
          ))}
        </div>

        {/* 기본 정보 */}
        <JmCard>
          <JmCardHeader>
            <JmSkeleton className="h-5 w-20" />
          </JmCardHeader>
          <JmCardContent>
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <JmSkeleton className="h-3 w-16" />
                  <JmSkeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          </JmCardContent>
        </JmCard>

        {/* 탭 영역 */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <JmSkeleton className="h-8 w-24 rounded-md" />
            <JmSkeleton className="h-8 w-24 rounded-md" />
          </div>
          <JmCard>
            <JmCardContent className="p-0">
              <div className="bg-[var(--jm-surface-muted)] px-4 py-2 grid grid-cols-6 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <JmSkeleton key={i} className="h-3 w-16" />
                ))}
              </div>
              {Array.from({ length: 6 }).map((_, r) => (
                <div
                  key={r}
                  className="px-4 py-3 border-t border-[var(--jm-border)] grid grid-cols-6 gap-4 items-center"
                >
                  {Array.from({ length: 6 }).map((_, c) => (
                    <JmSkeleton key={c} className="h-4 w-full" />
                  ))}
                </div>
              ))}
            </JmCardContent>
          </JmCard>
        </div>
      </div>
    </div>
  );
}
