"use client";

import { JmCard } from "@/jm";

/** 카드 컨테이너 — JmCard + 표준 padding wrapper. 다수 sub-card 가 공유. */
export function Card({ children }: { children: React.ReactNode }) {
  return <JmCard className="p-4 sm:p-5">{children}</JmCard>;
}

/** 라벨 + 내용 row — CustomerDeviceCard 등 grid 카드에서 사용. */
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-jm-3xs font-semibold uppercase tracking-wider text-[var(--jm-text-subtle)]">
        {label}
      </span>
      {children}
    </div>
  );
}
