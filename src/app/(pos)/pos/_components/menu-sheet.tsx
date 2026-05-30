"use client";

import { useRouter } from "next/navigation";
import {
  LayoutGrid,
  Search,
  Wrench,
  CalendarDays,
  Package,
  Menu,
  ChevronRight,
} from "lucide-react";
import { BottomSheet } from "./bottom-sheet";
import { JmThemeToggle } from "@/jm";
import { usePosTheme } from "./pos-theme-wrapper";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 검색 항목 클릭 — 부모가 GlobalSearchSheet 띄움 */
  onSearch?: () => void;
  /** 임대관리 항목 클릭 — 부모가 RentalManagementSheet 띄움 */
  onRentalManagement?: () => void;
  /** 수리관리 항목 클릭 — 부모가 /pos/repairs 로 이동. 미전달 시 항목 숨김 (수리관리 페이지 자기 자신에서 숨김) */
  onRepairManagement?: () => void;
  /** 저장된 상담(parked) 항목 클릭 — 부모가 /pos/parked 로 이동. 자기 자신 페이지에서 숨김 */
  onParkedSessions?: () => void;
}

/**
 * v2 메뉴 시트 — 햄버거 누르면 열림.
 * 어드민/검색/임대관리/테마 등 외부 진입점.
 */
export function MenuSheet({
  open,
  onOpenChange,
  onSearch,
  onRentalManagement,
  onRepairManagement,
  onParkedSessions,
}: Props) {
  const router = useRouter();
  const { theme, setTheme } = usePosTheme();
  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="메뉴">
      <div className="flex flex-col gap-1.5 pb-2 pt-2">
        <Item
          icon={<LayoutGrid className="size-5" strokeWidth={1.5} />}
          label="고객 그리드"
          desc="POS 메인"
          onClick={() => go("/pos")}
        />
        <Item
          icon={<Search className="size-5" strokeWidth={1.5} />}
          label="검색"
          desc="상품·고객·수리 통합"
          onClick={() => {
            onOpenChange(false);
            onSearch?.();
          }}
        />

        {onRepairManagement && (
          <Item
            icon={<Wrench className="size-5" strokeWidth={1.5} />}
            label="수리관리"
            desc="픽업대기·진행중·진단 현황"
            onClick={() => {
              onOpenChange(false);
              onRepairManagement();
            }}
          />
        )}

        {onRentalManagement && (
          <Item
            icon={<CalendarDays className="size-5" strokeWidth={1.5} />}
            label="임대관리"
            desc="현재 임대·예약·자산 관리"
            onClick={() => {
              onOpenChange(false);
              onRentalManagement();
            }}
          />
        )}

        {onParkedSessions && (
          <Item
            icon={<Package className="size-5" strokeWidth={1.5} />}
            label="저장된 상담"
            desc="장바구니로 저장한 고객들"
            onClick={() => {
              onOpenChange(false);
              onParkedSessions();
            }}
          />
        )}

        <div className="my-2 h-px bg-[var(--jm-surface-muted)]" />

        <Item
          icon={<Menu className="size-5" strokeWidth={1.5} />}
          label="어드민"
          desc="대시보드·설정·리포트"
          onClick={() => go("/")}
        />
        <div className="my-2 h-px bg-[var(--jm-surface-muted)]" />

        {/* 테마 토글 — jm 시스템 라이트/다크/auto */}
        <div className="flex items-center justify-between rounded-2xl px-3 py-2">
          <div className="flex flex-col">
            <span className="text-jm-base font-semibold text-[var(--jm-text)]">테마</span>
            <span className="text-jm-xs text-[var(--jm-text-muted)]">라이트 / 다크 / 시스템</span>
          </div>
          <JmThemeToggle value={theme} onChange={setTheme} />
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
      className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors active:bg-[var(--jm-surface-muted)] sm:hover:bg-[var(--jm-bg)]"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--jm-surface-muted)] text-[var(--jm-text)]">
        {icon}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-jm-base font-semibold text-[var(--jm-text)]">{label}</span>
        {desc && <span className="text-jm-xs text-[var(--jm-text-muted)]">{desc}</span>}
      </div>
      <ChevronRight
        className="size-4 shrink-0 text-[var(--jm-text-disabled)]"
        strokeWidth={1.5}
      />
    </button>
  );
}
