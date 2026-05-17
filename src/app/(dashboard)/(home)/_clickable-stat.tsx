"use client";

import Link from "next/link";
import { JmStat, type JmStatProps } from "@/jm";

/**
 * 클릭 가능한 KPI 카드. href 있으면 Link 로 감싸 워크보드로 점프.
 * JmStat 의 interactive 모드는 내부에서 이벤트 핸들러를 쓰므로
 * 이 컴포넌트는 반드시 클라이언트 컴포넌트여야 한다 (서버 컴포넌트 페이지에서 호출 가능).
 */
export function ClickableStat({
  href,
  ...props
}: JmStatProps & { href?: string }) {
  if (!href) return <JmStat {...props} />;
  return (
    <Link
      href={href}
      className="block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--jm-ring)]"
    >
      <JmStat {...props} interactive />
    </Link>
  );
}
