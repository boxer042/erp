import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="p-6 space-y-6">
      {/* 상단: 뒤로 + 거래처명 + 결제방식 배지 */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-5 w-12 rounded-md" />
      </div>

      {/* KPI 카드 3개 */}
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2"><Skeleton className="h-3 w-20" /></CardHeader>
            <CardContent><Skeleton className="h-8 w-24" /></CardContent>
          </Card>
        ))}
      </div>

      {/* 기본 정보 카드 */}
      <Card>
        <CardHeader><Skeleton className="h-5 w-20" /></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 담당자 카드 */}
      <Card>
        <CardHeader><Skeleton className="h-5 w-16" /></CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 탭 영역 */}
      <div className="space-y-3">
        <div className="flex gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-md" />
          ))}
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="border border-border rounded-md">
              <div className="bg-muted/50 px-4 py-2 grid grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-3 w-16" />
                ))}
              </div>
              {Array.from({ length: 6 }).map((_, r) => (
                <div key={r} className="px-4 py-3 border-t border-border grid grid-cols-4 gap-4 items-center">
                  {Array.from({ length: 4 }).map((_, c) => (
                    <Skeleton key={c} className="h-4 w-full" />
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
