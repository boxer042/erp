import {
  JmCard,
  JmCardContent,
  JmCardHeader,
  JmSkeleton,
} from "@/jm";
import { ProductsThemeScope } from "../../_theme-scope";

export default function Loading() {
  return (
    <ProductsThemeScope>
      <div className="flex h-full flex-col bg-[var(--jm-bg)]">
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-6 p-6">
            {/* 뒤로가기 버튼 */}
            <div className="flex items-center gap-2">
              <JmSkeleton className="h-8 w-16 rounded-md" />
            </div>

            {/* 헤더 카드 */}
            <JmCard>
              <JmCardHeader className="space-y-2">
                <div className="flex items-center gap-2">
                  <JmSkeleton className="h-6 w-40" />
                  <JmSkeleton className="h-5 w-12 rounded-full" />
                </div>
                <JmSkeleton className="h-4 w-72" />
              </JmCardHeader>
              <JmCardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <JmSkeleton className="h-4 w-20" />
                    <JmSkeleton className="h-4 w-24" />
                  </div>
                  <div className="flex items-center gap-2">
                    <JmSkeleton className="h-4 w-12" />
                    <JmSkeleton className="h-4 w-8" />
                  </div>
                </div>
              </JmCardContent>
            </JmCard>

            {/* 슬롯 카드 */}
            <JmCard>
              <JmCardHeader>
                <JmSkeleton className="h-5 w-16" />
              </JmCardHeader>
              <JmCardContent className="p-0">
                <div className="bg-[var(--jm-surface-muted)] px-3 py-2 grid grid-cols-4 gap-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <JmSkeleton key={i} className="h-3 w-16" />
                  ))}
                </div>
                {Array.from({ length: 4 }).map((_, r) => (
                  <div
                    key={r}
                    className="px-3 py-2.5 border-t border-[var(--jm-border)] grid grid-cols-4 gap-4 items-center"
                  >
                    <JmSkeleton className="h-4 w-8 ml-auto" />
                    <JmSkeleton className="h-4 w-32" />
                    <JmSkeleton className="h-4 w-12 ml-auto" />
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
                    className="border-t border-[var(--jm-border)] first:border-t-0 py-3 space-y-2"
                  >
                    <JmSkeleton className="h-4 w-32" />
                    <JmSkeleton className="h-3 w-64" />
                  </div>
                ))}
              </JmCardContent>
            </JmCard>
          </div>
        </div>
      </div>
    </ProductsThemeScope>
  );
}
