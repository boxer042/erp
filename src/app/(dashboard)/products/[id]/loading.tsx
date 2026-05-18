import { JmCard, JmCardContent, JmCardHeader, JmSkeleton } from "@/jm";
import { ProductsThemeScope } from "../_theme-scope";

export default function Loading() {
  return (
    <ProductsThemeScope>
      <div className="flex h-full flex-col bg-[var(--jm-bg)]">
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-6 p-6">
            {/* 헤더 */}
            <div className="flex flex-wrap items-center gap-3">
              <JmSkeleton className="h-8 w-8 rounded-md" />
              <JmSkeleton className="h-10 w-10 rounded-md" />
              <JmSkeleton className="h-6 w-48" />
              <JmSkeleton className="h-5 w-16 rounded-md" />
              <div className="ml-auto flex gap-2">
                <JmSkeleton className="h-8 w-16 rounded-md" />
                <JmSkeleton className="h-8 w-16 rounded-md" />
              </div>
            </div>

            {/* KPI 카드 5개 */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <JmCard key={i}>
                  <JmCardHeader className="px-4 pb-1 pt-4">
                    <JmSkeleton className="h-3 w-20" />
                  </JmCardHeader>
                  <JmCardContent className="px-4 pb-4">
                    <JmSkeleton className="h-7 w-24" />
                  </JmCardContent>
                </JmCard>
              ))}
            </div>

            {/* 6개 섹션 카드 골격 */}
            {Array.from({ length: 6 }).map((_, i) => (
              <JmCard key={i}>
                <JmCardHeader className="pb-3">
                  <JmSkeleton className="h-5 w-32" />
                  <JmSkeleton className="h-3 w-48" />
                </JmCardHeader>
                <JmCardContent>
                  <div className="space-y-3">
                    <JmSkeleton className="h-4 w-full" />
                    <JmSkeleton className="h-4 w-3/4" />
                    <JmSkeleton className="h-4 w-5/6" />
                  </div>
                </JmCardContent>
              </JmCard>
            ))}
          </div>
        </div>
      </div>
    </ProductsThemeScope>
  );
}
