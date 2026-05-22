import {
  JmCard,
  JmCardContent,
  JmCardHeader,
  JmContainer,
  JmSkeleton,
} from "@/jm";
import { ProductsThemeScope } from "../../_theme-scope";

export default function Loading() {
  return (
    <ProductsThemeScope>
      <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
        {/* 스티키 헤더 */}
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-6 py-3">
          <JmSkeleton className="h-8 w-8 rounded-md" />
          <JmSkeleton className="h-5 w-40" />
          <JmSkeleton className="h-5 w-12 rounded-full" />
        </div>

        <JmContainer width="default" padded={false} className="space-y-6 p-6">
          {/* KPI 3개 */}
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <JmCard key={i}>
                <JmCardContent className="space-y-2 py-3">
                  <JmSkeleton className="h-3 w-20" />
                  <JmSkeleton className="h-6 w-24" />
                </JmCardContent>
              </JmCard>
            ))}
          </div>

          {/* 슬롯 카드 */}
          <JmCard>
            <JmCardHeader>
              <JmSkeleton className="h-5 w-16" />
            </JmCardHeader>
            <JmCardContent className="p-0">
              <div className="grid grid-cols-4 gap-4 bg-[var(--jm-surface-muted)] px-3 py-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <JmSkeleton key={i} className="h-3 w-16" />
                ))}
              </div>
              {Array.from({ length: 4 }).map((_, r) => (
                <div
                  key={r}
                  className="grid grid-cols-4 items-center gap-4 border-t border-[var(--jm-border)] px-3 py-2.5"
                >
                  <JmSkeleton className="ml-auto h-4 w-8" />
                  <JmSkeleton className="h-4 w-32" />
                  <JmSkeleton className="ml-auto h-4 w-12" />
                  <JmSkeleton className="h-4 w-40" />
                </div>
              ))}
            </JmCardContent>
          </JmCard>

          {/* 프리셋 카드 */}
          <JmCard>
            <JmCardHeader className="flex flex-row items-center justify-between">
              <JmSkeleton className="h-5 w-16" />
              <JmSkeleton className="h-8 w-24 rounded-md" />
            </JmCardHeader>
            <JmCardContent>
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="space-y-2 border-t border-[var(--jm-border)] py-3 first:border-t-0"
                >
                  <JmSkeleton className="h-4 w-32" />
                  <JmSkeleton className="h-3 w-64" />
                </div>
              ))}
            </JmCardContent>
          </JmCard>
        </JmContainer>
      </div>
    </ProductsThemeScope>
  );
}
