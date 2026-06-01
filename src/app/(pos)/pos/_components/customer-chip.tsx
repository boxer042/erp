"use client";

import { Building2 } from "lucide-react";

/**
 * 고객 칩 — 헤더 우측 고객 표시 (아바타 + 이름 + 부가정보).
 * POS 손님 작업 페이지(상품·수리·임대 모드) + 수리 standalone 헤더 공유.
 *
 * 등록 고객: name 있음 → BUSINESS 면 Building2 아바타, 개인은 이니셜.
 * 미등록: name 없음 → unregisteredCode 있으면 코드 아바타(세션 임시코드), 없으면 ? 아바타.
 */
export function CustomerChip({
  name,
  type,
  businessNumber,
  phone,
  unregisteredCode,
  unregisteredPaletteBg,
  onClick,
}: {
  name?: string | null;
  type?: "INDIVIDUAL" | "BUSINESS" | null;
  businessNumber?: string | null;
  phone?: string | null;
  /** 미등록 고객 임시 코드 (POS 세션) — 없으면 standalone 처럼 "미등록 손님" + ? 아바타 */
  unregisteredCode?: string | null;
  /** 미등록 코드 아바타 배경 (palette.bg) */
  unregisteredPaletteBg?: string;
  onClick?: () => void;
}) {
  const registered = !!name;

  const inner = registered ? (
    <>
      {type === "BUSINESS" ? (
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--jm-warning-bg)] text-[var(--jm-warning-fg)]">
          <Building2 className="size-5" />
        </div>
      ) : (
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--jm-surface-muted)] text-jm-md font-bold text-[var(--jm-text)]">
          {(name ?? "?").charAt(0)}
        </div>
      )}
      <div className="flex min-w-0 max-w-[140px] flex-col">
        <span className="line-clamp-1 text-jm-base font-semibold text-[var(--jm-text)]">
          {name}
        </span>
        {type === "BUSINESS" && businessNumber ? (
          <span className="line-clamp-1 font-mono text-jm-2xs text-[var(--jm-text-muted)]">
            {businessNumber}
          </span>
        ) : phone ? (
          <span className="line-clamp-1 font-mono text-jm-2xs text-[var(--jm-text-muted)]">
            {phone}
          </span>
        ) : null}
      </div>
    </>
  ) : (
    <>
      <div
        className={`flex size-10 shrink-0 items-center justify-center rounded-full text-white ${
          unregisteredCode ? unregisteredPaletteBg ?? "bg-[var(--jm-text-subtle)]" : "bg-[var(--jm-text-subtle)]"
        }`}
      >
        <span className="font-mono text-jm-xs font-bold tracking-wider">
          {unregisteredCode ?? "?"}
        </span>
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="text-jm-base font-semibold text-[var(--jm-text)]">
          {unregisteredCode ? "미등록 고객" : "미등록 손님"}
        </span>
        {unregisteredCode && (
          <span className="font-mono text-jm-2xs text-[var(--jm-text-muted)]">#{unregisteredCode}</span>
        )}
      </div>
    </>
  );

  if (!onClick) {
    return <div className="flex shrink-0 items-center gap-2 px-1 py-1">{inner}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="고객"
      className="flex shrink-0 items-center gap-2 rounded-full px-1 py-1 text-left transition-colors hover:bg-[var(--jm-bg)] active:bg-[var(--jm-surface-muted)]"
    >
      {inner}
    </button>
  );
}
