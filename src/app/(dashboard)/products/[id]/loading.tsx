import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">
          {/* 헤더 */}
          <div className="flex items-center gap-3 flex-wrap">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-10 w-10 rounded-md" />
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-5 w-16 rounded-md" />
            <div className="ml-auto flex gap-2">
              <Skeleton className="h-8 w-16 rounded-md" />
              <Skeleton className="h-8 w-16 rounded-md" />
            </div>
          </div>

          {/* KPI 카드 5개 */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-1 pt-4 px-4">
                  <Skeleton className="h-3 w-20" />
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <Skeleton className="h-7 w-24" />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* 6개 섹션 카드 골격 */}
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3 w-48" />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
