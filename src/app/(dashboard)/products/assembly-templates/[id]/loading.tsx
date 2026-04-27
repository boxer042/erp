import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="flex h-full flex-col overflow-auto p-5 gap-4">
      {/* 목록 버튼 */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-16 rounded-md" />
      </div>

      {/* 헤더 카드 */}
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-5 w-12 rounded-md" />
          </div>
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-8" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 슬롯 카드 */}
      <Card>
        <CardHeader><Skeleton className="h-5 w-12" /></CardHeader>
        <CardContent className="p-0">
          <div className="bg-muted/50 px-3 py-2 grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-16" />
            ))}
          </div>
          {Array.from({ length: 4 }).map((_, r) => (
            <div key={r} className="px-3 py-2.5 border-t border-border grid grid-cols-4 gap-4 items-center">
              <Skeleton className="h-4 w-8 ml-auto" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-12 ml-auto" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 프리셋 카드 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </CardHeader>
        <CardContent>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border-t border-border first:border-t-0 py-3 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-64" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
