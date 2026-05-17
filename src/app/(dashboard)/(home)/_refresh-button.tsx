"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { JmButton } from "@/jm";

/**
 * 대시보드 수동 새로고침.
 * 서버 컴포넌트라 polling 없이 router.refresh() 로 데이터 재페치.
 * renderedAt — 서버 렌더 시각 (page.tsx 의 now). 새로고침하면 새 값으로 갱신됨.
 */
export function RefreshButton({ renderedAt }: { renderedAt: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const time = new Date(renderedAt).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex items-center gap-2">
      <span className="text-jm-2xs tabular-nums text-[var(--jm-text-muted)]">
        {time} 기준
      </span>
      <JmButton
        variant="outline"
        size="xs"
        onClick={() => startTransition(() => router.refresh())}
        disabled={isPending}
        className="gap-1"
      >
        <RefreshCw className={`size-3.5 ${isPending ? "animate-spin" : ""}`} />
        새로고침
      </JmButton>
    </div>
  );
}
