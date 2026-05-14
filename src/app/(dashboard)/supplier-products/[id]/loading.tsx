import { JmCard, JmCardContent, JmCardHeader, JmSkeleton } from "@/jm";

export default function Loading() {
  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      {/* 스티키 헤더 */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-6 py-3">
        <JmSkeleton className="h-7 w-7 rounded-md" />
        <div className="flex-1 min-w-0 space-y-1">
          <JmSkeleton className="h-5 w-48" />
          <JmSkeleton className="h-3 w-24" />
        </div>
        <JmSkeleton className="h-8 w-16 rounded-md" />
      </div>

      <div className="space-y-6 p-6 max-w-[1280px] mx-auto w-full">
        {/* 요약 KPI 5 */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <JmCard key={i}>
              <JmCardContent className="p-4 space-y-2">
                <JmSkeleton className="h-3 w-16" />
                <JmSkeleton className="h-6 w-24" />
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
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <JmSkeleton className="h-3 w-16 shrink-0" />
                  <JmSkeleton className="h-4 flex-1" />
                </div>
              ))}
            </div>
          </JmCardContent>
        </JmCard>

        {/* 매핑/로트/비용/입고 이력 카드 4개 */}
        {Array.from({ length: 4 }).map((_, i) => (
          <JmCard key={i}>
            <JmCardHeader>
              <JmSkeleton className="h-5 w-32" />
            </JmCardHeader>
            <JmCardContent className="p-0">
              {Array.from({ length: 3 }).map((_, r) => (
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
        ))}
      </div>
    </div>
  );
}
