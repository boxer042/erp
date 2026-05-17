import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b p-4">
        <Skeleton className="size-8 rounded-md" />
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="flex flex-1 gap-4 p-4">
        <Skeleton className="h-[70vh] w-[380px] rounded-lg" />
        <Skeleton className="h-[70vh] flex-1 rounded-lg" />
      </div>
    </div>
  );
}
