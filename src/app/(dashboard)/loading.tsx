import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="p-6 space-y-6">
      {/* 제목 */}
      <div className="space-y-1.5">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* 요약 카드 4개 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-7 w-24" />
                </div>
                <Skeleton className="h-10 w-10 rounded-lg" />
              </div>
              <Skeleton className="h-3 w-24 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 좌: 최근 주문 / 우: 재고 경고 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-7 w-20" />
          </CardHeader>
          <CardContent className="p-0">
            <div className="bg-muted/50 px-4 py-2 grid grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-3 w-16" />
              ))}
            </div>
            {Array.from({ length: 5 }).map((_, r) => (
              <div key={r} className="px-4 py-3 border-t border-border grid grid-cols-4 gap-4 items-center">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-12 rounded-full" />
                <Skeleton className="h-4 w-20 ml-auto" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-7 w-20" />
          </CardHeader>
          <CardContent className="p-0">
            <div className="bg-muted/50 px-4 py-2 grid grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-3 w-16" />
              ))}
            </div>
            {Array.from({ length: 5 }).map((_, r) => (
              <div key={r} className="px-4 py-3 border-t border-border grid grid-cols-3 gap-4 items-center">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-12 ml-auto" />
                <Skeleton className="h-4 w-12 ml-auto" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
