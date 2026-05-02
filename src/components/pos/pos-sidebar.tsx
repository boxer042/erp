"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Search,
  Package,
  Wrench,
  CalendarClock,
  ShoppingCart,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { useSessions } from "@/components/pos/sessions-context";
import { usePosShell } from "@/components/pos/pos-shell-context";

export type CartMode = "product" | "repair" | "rental";

const MODES: { value: CartMode; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "product", label: "상품", Icon: Package },
  { value: "repair", label: "수리", Icon: Wrench },
  { value: "rental", label: "임대", Icon: CalendarClock },
];

function getActiveSessionId(pathname: string): string {
  const m = pathname.match(/^\/pos\/cart\/([^/]+)/);
  return m?.[1] ?? "";
}

export function PosSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { sessions, activeId, addSession, hydrated } = useSessions();
  const { setSearchOpen, cartOpen, setCartOpen, pickedSessionId } = usePosShell();

  const activeSessionIdInUrl = getActiveSessionId(pathname);
  const inCart = activeSessionIdInUrl !== "";
  const activeMode = (searchParams.get("mode") ?? "product") as CartMode;

  const ensureSessionId = (): string => {
    if (activeSessionIdInUrl) return activeSessionIdInUrl;
    const target = sessions.find((s) => s.id === activeId) ?? sessions[0];
    if (target) return target.id;
    return addSession();
  };

  const handleSearch = () => {
    if (!hydrated) return;
    const sid = ensureSessionId();
    if (sid) setSearchOpen(true);
  };

  const switchMode = (newMode: CartMode) => {
    if (!hydrated) return;
    const sid = ensureSessionId();
    if (!sid) return;
    router.push(`/pos/cart/${sid}?mode=${newMode}`);
  };

  const handleCartToggle = () => {
    if (!hydrated) return;
    const sid = ensureSessionId();
    if (sid) setCartOpen(!cartOpen);
  };

  const cartCount = pickedSessionId
    ? Math.round(
        sessions
          .find((s) => s.id === pickedSessionId)
          ?.items.reduce((a, i) => a + i.quantity, 0) ?? 0
      )
    : 0;

  return (
    <aside className="flex h-full w-[88px] shrink-0 flex-col border-r border-border bg-card">
      <div className="flex flex-1 flex-col gap-1 p-2">
        {/* 검색 — 첫번째 */}
        <SidebarButton
          icon={<Search className="size-5" />}
          label="검색"
          onClick={handleSearch}
        />

        {/* 모드 */}
        {MODES.map(({ value, label, Icon }) => (
          <SidebarButton
            key={value}
            icon={<Icon className="size-5" />}
            label={label}
            active={inCart && activeMode === value}
            onClick={() => switchMode(value)}
          />
        ))}

        {/* 카트 — 드로워 토글 */}
        <SidebarButton
          icon={<ShoppingCart className="size-5" />}
          label="카트"
          active={cartOpen}
          onClick={handleCartToggle}
          badge={cartCount > 0 ? cartCount : undefined}
        />
      </div>

      <div className="shrink-0 border-t border-border p-2">
        <div className="flex justify-center">
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}

function SidebarButton({
  icon,
  label,
  active,
  onClick,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center justify-center gap-1 rounded-md py-3 transition-colors",
        active
          ? "bg-primary/10 text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {icon}
      <span className="text-[11px] font-medium leading-tight">{label}</span>
      {badge !== undefined && (
        <Badge
          variant="default"
          className="absolute right-1 top-1 h-4 min-w-4 rounded-full px-1 text-[9px] tabular-nums"
        >
          {badge}
        </Badge>
      )}
    </button>
  );
}
