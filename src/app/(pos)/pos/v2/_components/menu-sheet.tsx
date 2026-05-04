"use client";

import { useRouter } from "next/navigation";
import { BottomSheet } from "./bottom-sheet";
import { ThemeToggle } from "@/components/theme-toggle";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 검색 항목 클릭 — 부모가 GlobalSearchSheet 띄움 */
  onSearch?: () => void;
}

/**
 * v2 메뉴 시트 — 햄버거 누르면 열림.
 * 어드민/검색/테마 등 외부 진입점.
 */
export function MenuSheet({ open, onOpenChange, onSearch }: Props) {
  const router = useRouter();
  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="메뉴">
      <div className="flex flex-col gap-1.5 pb-2 pt-2">
        <Item
          icon={
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
              <rect x="11" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
              <rect x="3" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
              <rect x="11" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          }
          label="손님 그리드"
          desc="POS 메인"
          onClick={() => go("/pos/v2")}
        />
        <Item
          icon={
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
              <path d="M14 14l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          }
          label="검색"
          desc="상품·고객·수리 통합"
          onClick={() => {
            onOpenChange(false);
            onSearch?.();
          }}
        />

        <div className="my-2 h-px bg-zinc-100" />

        <Item
          icon={
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M3 5h14M3 10h14M3 15h14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          }
          label="어드민"
          desc="대시보드·설정·리포트"
          onClick={() => go("/")}
        />
        <div className="my-2 h-px bg-zinc-100" />

        {/* 테마 토글 — shadcn 컴포넌트지만 외부 시스템이라 그대로 사용 */}
        <div className="flex items-center justify-between rounded-2xl px-3 py-2">
          <div className="flex flex-col">
            <span className="text-[14px] font-semibold text-zinc-900">테마</span>
            <span className="text-[12px] text-zinc-500">밝기 모드 전환</span>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </BottomSheet>
  );
}

function Item({
  icon,
  label,
  desc,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  desc?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors active:bg-zinc-100 sm:hover:bg-zinc-50"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
        {icon}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[14px] font-semibold text-zinc-900">{label}</span>
        {desc && <span className="text-[12px] text-zinc-500">{desc}</span>}
      </div>
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        className="shrink-0 text-zinc-300"
      >
        <path
          d="M6 4l4 4-4 4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
