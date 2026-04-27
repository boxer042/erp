import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="flex flex-col h-full">
      {/* 상단 바: 뒤로 + 품명 + 거래처 + 수정 버튼 */}
      <div className="px-6 py-4 border-b border-border flex items-center gap-3 shrink-0">
        <Skeleton className="h-7 w-7 rounded-md" />
        <div className="flex-1 min-w-0 space-y-1">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-8 w-16 rounded-md" />
      </div>

      <div className="flex-1 overflow-auto">
        {/* 요약 카드 3개 */}
        <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card rounded-lg p-4 border border-border space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-24" />
            </div>
          ))}
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* 기본 정보 */}
          <Card>
            <CardHeader className="pb-3"><Skeleton className="h-4 w-16" /></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-3 w-16 shrink-0" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 매핑된 판매상품 */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-20 rounded-md" />
            </CardHeader>
            <CardContent className="p-0">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-4 py-3 border-t border-border first:border-t-0 grid grid-cols-4 gap-4 items-center">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-16 rounded-md" />
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-7 w-7 rounded-md ml-auto" />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* 입고 비용 */}
          <Card>
            <CardHeader className="pb-3"><Skeleton className="h-4 w-16" /></CardHeader>
            <CardContent className="p-0">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="px-4 py-3 border-t border-border first:border-t-0 grid grid-cols-5 gap-4">
                  {Array.from({ length: 5 }).map((_, c) => (
                    <Skeleton key={c} className="h-4 w-full" />
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* 입고 이력 */}
          <Card>
            <CardHeader className="pb-3"><Skeleton className="h-4 w-16" /></CardHeader>
            <CardContent className="p-0">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-4 py-3 border-t border-border first:border-t-0 grid grid-cols-6 gap-4">
                  {Array.from({ length: 6 }).map((_, c) => (
                    <Skeleton key={c} className="h-4 w-full" />
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
