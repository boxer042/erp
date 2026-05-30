import { JmSkeleton } from "@/jm";

export default function Loading() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <JmSkeleton className="size-8 rounded-md" />
        <JmSkeleton className="h-5 w-32" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <JmSkeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <JmSkeleton className="h-40 w-full rounded-lg" />
        <JmSkeleton className="h-40 w-full rounded-lg" />
      </div>
      <JmSkeleton className="h-48 w-full rounded-lg" />
    </div>
  );
}
