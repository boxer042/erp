import { JmContainer, JmSkeleton } from "@/jm";
import { CustomersThemeScope } from "../_theme-scope";

export default function CustomerDetailLoading() {
  return (
    <CustomersThemeScope>
      <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
        {/* 스티키 헤더 (실제 페이지와 동일한 px-6 py-3) */}
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-6 py-3">
          <JmSkeleton className="h-8 w-8 rounded-lg" />
          <JmSkeleton className="h-5 w-40" />
          <JmSkeleton className="h-5 w-12 rounded-md" />
          <div className="ml-auto flex gap-2">
            <JmSkeleton className="h-9 w-24 rounded-lg" />
            <JmSkeleton className="h-9 w-20 rounded-lg" />
          </div>
        </div>

        <JmContainer width="default" padded={false} className="space-y-6 p-6">
          {/* 메타 라인 */}
          <div className="flex gap-4">
            <JmSkeleton className="h-4 w-32" />
            <JmSkeleton className="h-4 w-40" />
          </div>

          {/* KPI */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl bg-[var(--jm-surface)] p-5 ring-1 ring-[var(--jm-border)]"
              >
                <JmSkeleton className="mb-3 h-3 w-16" />
                <JmSkeleton className="h-7 w-24" />
                <JmSkeleton className="mt-2 h-3 w-20" />
              </div>
            ))}
          </div>

          {/* 탭 헤더 */}
          <JmSkeleton className="h-9 w-full max-w-[640px]" />

          {/* 탭 본문 — 개요 카드 2개 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl bg-[var(--jm-surface)] p-5 ring-1 ring-[var(--jm-border)]"
              >
                <JmSkeleton className="mb-4 h-4 w-24" />
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <div
                      key={j}
                      className="grid grid-cols-[120px_1fr] items-baseline gap-3"
                    >
                      <JmSkeleton className="h-3 w-16" />
                      <JmSkeleton className="h-4 w-40" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </JmContainer>
      </div>
    </CustomersThemeScope>
  );
}
