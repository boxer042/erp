import { JmSkeleton } from "@/jm";

export default function Loading() {
  return (
    <div className="flex h-full flex-col bg-[var(--jm-bg)]">
      <div className="flex items-center gap-3 border-b border-[var(--jm-border)] p-4">
        <JmSkeleton className="size-8 rounded-md" />
        <JmSkeleton className="h-5 w-40" />
      </div>
      <div className="flex flex-1 gap-4 p-4">
        <JmSkeleton className="h-[70vh] w-[380px] rounded-lg" />
        <JmSkeleton className="h-[70vh] flex-1 rounded-lg" />
      </div>
    </div>
  );
}
