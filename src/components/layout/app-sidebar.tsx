"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, createContext, useContext, useRef } from "react";
import {
  LayoutDashboard,
  Package,
  PackageSearch,
  Truck,
  PackageOpen,
  PackageMinus,
  ClipboardList,
  ClipboardCheck,
  Boxes,
  ShoppingCart,
  Store,
  Users,
  FileText,
  Receipt,
  BookOpen,
  TrendingUp,
  WalletMinimal,
  Settings,
  Menu,
  Columns2,
  Square,
  PanelLeft,
  PanelLeftOpen,
  Wrench,
  Container,
  Tag,
  Layers,
  Factory,
  FolderTree,
  SlidersHorizontal,
  QrCode,
} from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// ─── Sidebar Context ───
type SidebarMode = "expanded" | "collapsed" | "expand-on-hover";

interface SidebarContextValue {
  panelOpen: boolean;
  setPanelOpen: (v: boolean) => void;
  sidebarMode: SidebarMode;
  setSidebarMode: (m: SidebarMode) => void;
  activeSection: string;
  setActiveSection: (s: string) => void;
  hasPanel: boolean;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebarContext() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebarContext must be inside SidebarContext");
  return ctx;
}

// ─── Nav Structure ───
interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ElementType;
}

interface NavGroup {
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    items: [
      { id: "home", label: "대시보드", href: "/", icon: LayoutDashboard },
    ],
  },
  {
    items: [
      { id: "orders", label: "주문", href: "/orders", icon: ShoppingCart },
      { id: "quotations", label: "견적서", href: "/quotations", icon: FileText },
      { id: "statements", label: "거래명세표", href: "/statements", icon: Receipt },
      { id: "serial-items", label: "시리얼 라벨", href: "/serial-items", icon: QrCode },
      { id: "repairs", label: "수리", href: "/repairs", icon: Wrench },
      { id: "customers", label: "고객", href: "/customers", icon: Users },
      { id: "customer-ledger", label: "고객 원장", href: "/customers/ledger", icon: BookOpen },
      { id: "channels", label: "판매 채널", href: "/channels", icon: Store },
    ],
  },
  {
    items: [
      { id: "products", label: "상품", href: "/products", icon: Package },
      { id: "categories", label: "카테고리", href: "/products/categories", icon: FolderTree },
      { id: "brands", label: "브랜드", href: "/products/brands", icon: Tag },
      { id: "spec-slots", label: "스펙 슬롯", href: "/products/spec-slots", icon: SlidersHorizontal },
      { id: "assembly-templates", label: "조립 템플릿", href: "/products/assembly-templates", icon: Layers },
    ],
  },
  {
    items: [
      { id: "suppliers", label: "거래처", href: "/suppliers", icon: Truck },
      { id: "supplier-products", label: "거래처 상품", href: "/supplier-products", icon: PackageSearch },
      { id: "incoming", label: "입고", href: "/inventory/incoming", icon: PackageOpen },
      { id: "returns", label: "반품", href: "/inventory/returns", icon: PackageMinus },
      { id: "supplier-ledger", label: "거래처 원장", href: "/suppliers/ledger", icon: Receipt },
      { id: "initial-balance", label: "기초 미지급금", href: "/suppliers/initial-balance", icon: ClipboardList },
    ],
  },
  {
    items: [
      { id: "lots", label: "로트 현황", href: "/inventory/lots", icon: Boxes },
      { id: "assembly", label: "조립 실적", href: "/inventory/assembly", icon: Factory },
      { id: "stocktake", label: "실사 보정", href: "/inventory/stocktake", icon: ClipboardCheck },
      { id: "initial-inventory", label: "초기 등록", href: "/inventory/initial", icon: ClipboardList },
    ],
  },
  {
    items: [
      { id: "repair-services", label: "수리 서비스", href: "/repair-services", icon: Wrench },
      { id: "rental-assets", label: "임대 자산", href: "/rental-assets", icon: Container },
    ],
  },
  {
    items: [
      { id: "expenses", label: "경비", href: "/expenses", icon: WalletMinimal },
      { id: "margin-report", label: "마진 리포트", href: "/reports/margin", icon: TrendingUp },
    ],
  },
  {
    items: [
      { id: "settings", label: "설정", href: "/settings", icon: Settings },
    ],
  },
];

// flat list for matching
const allNavItems = navGroups.flatMap((g) => g.items);

// 정확한 active 매칭: 가장 긴 href가 매칭되는 것을 우선
function getActiveId(pathname: string): string {
  let bestId = "home";
  let bestLen = 0;

  for (const item of allNavItems) {
    if (item.href === "/" && pathname === "/") {
      if (bestLen === 0) { bestId = item.id; bestLen = 1; }
    } else if (item.href !== "/" && pathname.startsWith(item.href)) {
      if (item.href.length > bestLen) { bestId = item.id; bestLen = item.href.length; }
    }
  }
  return bestId;
}

// ─── Mode selector options ───
const modeOptions: { mode: SidebarMode; icon: React.ElementType; label: string }[] = [
  { mode: "expanded", icon: Columns2, label: "Expanded" },
  { mode: "collapsed", icon: Square, label: "Collapsed" },
  { mode: "expand-on-hover", icon: PanelLeftOpen, label: "Expand on hover" },
];

// ─── 모바일 사이드바 트리거 (글로벌 헤더에서 사용) ───
export function MobileSidebarTrigger({ className }: { className?: string }) {
  const { mobileOpen, setMobileOpen } = useSidebarContext();
  return (
    <button
      type="button"
      aria-label={mobileOpen ? "메뉴 닫기" : "메뉴 열기"}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted md:hidden",
        className
      )}
      onClick={() => setMobileOpen(!mobileOpen)}
    >
      <Menu className="h-4 w-4" />
    </button>
  );
}

// ─── SidebarProvider ───
export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("sidebar_mode") as SidebarMode) || "expanded";
    }
    return "expanded";
  });
  const [panelOpen, setPanelOpen] = useState(true);
  const [activeSection, setActiveSection] = useState(() => getActiveId(pathname));
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setActiveSection(getActiveId(pathname));
  }, [pathname]);

  // 라우트 이동 시 모바일 사이드바 자동 닫기
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    localStorage.setItem("sidebar_mode", sidebarMode);
  }, [sidebarMode]);

  return (
    <SidebarContext.Provider
      value={{
        panelOpen,
        setPanelOpen,
        sidebarMode,
        setSidebarMode,
        activeSection,
        setActiveSection,
        hasPanel: false,
        mobileOpen,
        setMobileOpen,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function AppSidebar() {
  const pathname = usePathname();

  const { sidebarMode, setSidebarMode, mobileOpen, setMobileOpen } = useSidebarContext();

  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const activeId = getActiveId(pathname);

  // Reset hover state when mode changes
  useEffect(() => { setHoverExpanded(false); }, [sidebarMode]);

  // Collapse sidebar when popover closes in expand-on-hover mode
  useEffect(() => {
    if (!popoverOpen && sidebarMode === "expand-on-hover") {
      setHoverExpanded(false);
    }
  }, [popoverOpen, sidebarMode]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const isExpandOnHover = sidebarMode === "expand-on-hover";
  const isVisuallyCollapsed =
    sidebarMode === "collapsed" ||
    (isExpandOnHover && !hoverExpanded);

  const handleMouseEnter = () => {
    if (!isExpandOnHover) return;
    hoverTimeoutRef.current = setTimeout(() => setHoverExpanded(true), 100);
  };

  const handleMouseLeave = () => {
    if (!isExpandOnHover) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    if (popoverOpen) return;
    setHoverExpanded(false);
  };

  return (
    <>
      {/* 모바일 dim overlay — 햄버거는 글로벌 헤더의 MobileSidebarTrigger가 담당 */}
      {mobileOpen && (
        <div
          className="fixed inset-x-0 top-11 bottom-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "flex h-full shrink-0 relative",
          // 모바일: 헤더(h-11) 아래에서 시작, 좌측에서 슬라이드
          "max-md:fixed max-md:top-11 max-md:bottom-0 max-md:left-0 max-md:z-40 max-md:transition-transform max-md:duration-200",
          !mobileOpen && "max-md:-translate-x-full",
          isExpandOnHover && "w-[50px]"
        )}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className={cn(
          "flex h-full flex-col border-r border-border bg-sidebar transition-[width] duration-200 overflow-hidden",
          isExpandOnHover && "absolute inset-y-0 left-0 z-30",
          isExpandOnHover && hoverExpanded && "shadow-[4px_0_12px_rgba(0,0,0,0.15)]",
          // 모바일은 항상 펼친 폭 (collapsed/expand-on-hover 무시)
          "max-md:w-[220px]",
          isVisuallyCollapsed ? "w-[50px]" : "w-[180px]"
        )}>
          <ScrollArea className="flex-1 min-h-0">
          <nav className={cn("flex flex-col py-2 px-1.5")}>
            {navGroups.map((group, gi) => (
              <div key={gi} className={cn("flex flex-col gap-0.5", gi > 0 && "mt-3 pt-3 border-t border-border")}>
                {group.items.map((item) => {
                  const isActive = activeId === item.id;
                  const Icon = item.icon;

                  const link = (
                    <Link
                      key={item.id}
                      href={item.href}
                      className={cn(
                        "flex items-center rounded-md whitespace-nowrap h-8 gap-2.5 px-2.5",
                        isActive
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      <span className="text-[13px] truncate">{item.label}</span>
                    </Link>
                  );

                  // collapsed 모드에서만 툴팁 래핑 (expand-on-hover는 제외)
                  if (sidebarMode === "collapsed") {
                    return (
                      <Tooltip key={item.id}>
                        <TooltipTrigger
                          render={
                            <Link
                              href={item.href}
                              className={cn(
                                "flex items-center rounded-md whitespace-nowrap h-8 gap-2.5 px-2.5",
                                isActive
                                  ? "bg-secondary text-foreground"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                              )}
                            />
                          }
                        >
                          <Icon className="h-[18px] w-[18px] shrink-0" />
                          <span className="text-[13px] truncate">{item.label}</span>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          {item.label}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return link;
                })}
              </div>
            ))}
          </nav>
          </ScrollArea>

          {/* 하단: 모드 전환 Popover */}
          <div className={cn("border-t border-border py-2", isVisuallyCollapsed && !isExpandOnHover ? "flex justify-center px-1" : "px-1.5")}>
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-md",
                  "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <PanelLeft className="h-[18px] w-[18px] shrink-0" />
              </PopoverTrigger>
              <PopoverContent
                side="right"
                sideOffset={8}
                align="end"
                className="w-48 p-1 gap-0"
              >
                <p className="px-2.5 py-1.5 text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Sidebar control</p>
                {modeOptions.map((opt) => {
                  const isSelected = sidebarMode === opt.mode;
                  return (
                    <button
                      key={opt.mode}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2.5 h-8 text-[13px]",
                        isSelected
                          ? "text-foreground bg-secondary"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                      onClick={() => {
                        setSidebarMode(opt.mode);
                        setPopoverOpen(false);
                      }}
                    >
                      <opt.icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 text-left">{opt.label}</span>
                      {isSelected && (
                        <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                      )}
                    </button>
                  );
                })}
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </aside>
    </>
  );
}
