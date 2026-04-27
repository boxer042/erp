import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto px-5 py-8 space-y-3">
      <div className="mb-5 space-y-2">
        <Skeleton className="h-6 w-72" />
        <Skeleton className="h-4 w-96" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border border-border bg-card"
        >
          <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-72" />
          </div>
          <Skeleton className="h-4 w-4 shrink-0" />
        </div>
      ))}
    </div>
  );
}
