"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  MonitorSmartphone,
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
  History,
  PackagePlus,
  AlertTriangle,
  ShieldAlert,
  FileSpreadsheet,
  WalletMinimal,
  Settings,
  Columns2,
  Square,
  PanelLeftOpen,
  Wrench,
  Container,
  Tag,
  Layers,
  Factory,
  FolderTree,
  Recycle,
  SlidersHorizontal,
  QrCode,
  ClipboardSignature,
  Scale,
  ScrollText,
  Sun,
  Moon,
  LogOut,
  MoreHorizontal,
} from "lucide-react";

import { useTheme } from "next-themes";
import {
  JmSidebar,
  JmSidebarHeader,
  JmSidebarBody,
  JmSidebarFooter,
  JmSidebarGroup,
  JmSidebarItem,
  JmSidebarSeparator,
  JmSidebarProvider,
  JmSidebarTrigger,
  JmDropdownMenu,
  JmDropdownMenuTrigger,
  JmDropdownMenuContent,
  JmDropdownMenuItem,
  JmDropdownMenuGroup,
  JmDropdownMenuLabel,
  JmDropdownMenuSeparator,
  JmAvatar,
  JmBrandMark,
  JmScope,
  useJmSidebar,
  type JmSidebarMode,
} from "@/jm";

// ─── Nav structure ────────────────────────────────────────────────────────
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
      { id: "pos", label: "POS", href: "/pos", icon: MonitorSmartphone },
    ],
  },
  {
    items: [
      { id: "orders", label: "주문", href: "/orders", icon: ShoppingCart },
      { id: "sales-history", label: "통합 판매내역", href: "/sales/history", icon: History },
      { id: "presale", label: "선판매 정리", href: "/presale", icon: PackagePlus },
      { id: "tax-invoices-pending", label: "세금계산서 대기", href: "/tax-invoices/pending", icon: FileSpreadsheet },
      { id: "quotations", label: "견적서", href: "/quotations", icon: FileText },
      { id: "statements", label: "거래명세표", href: "/statements", icon: Receipt },
      { id: "serial-items", label: "시리얼 라벨", href: "/serial-items", icon: QrCode },
      { id: "repairs", label: "수리", href: "/repairs", icon: Wrench },
      { id: "repairs-warranty", label: "수리 보증 만료", href: "/repairs/warranty", icon: ShieldAlert },
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
      { id: "purchase-orders", label: "발주", href: "/purchase-orders", icon: ClipboardSignature },
      { id: "incoming", label: "입고", href: "/inventory/incoming", icon: PackageOpen },
      { id: "returns", label: "반품", href: "/inventory/returns", icon: PackageMinus },
      { id: "supplier-ledger", label: "거래처 원장", href: "/suppliers/ledger", icon: Receipt },
      { id: "initial-balance", label: "기초 미지급금", href: "/suppliers/initial-balance", icon: ClipboardList },
    ],
  },
  {
    items: [
      { id: "lots", label: "로트 현황", href: "/inventory/lots", icon: Boxes },
      { id: "low-stock", label: "재고 부족", href: "/inventory/low-stock", icon: AlertTriangle },
      { id: "assembly", label: "조립 실적", href: "/inventory/assembly", icon: Factory },
      { id: "used-items", label: "중고 상품", href: "/inventory/used-items", icon: Recycle },
      { id: "stocktake", label: "실사 보정", href: "/inventory/stocktake", icon: ClipboardCheck },
      { id: "initial-inventory", label: "초기 등록", href: "/inventory/initial", icon: ClipboardList },
    ],
  },
  {
    items: [
      { id: "repair-services", label: "수리 서비스", href: "/repair-services", icon: Wrench },
      { id: "rental-assets", label: "임대 자산", href: "/rental-assets", icon: Container },
      { id: "rentals-stats", label: "임대 통계", href: "/rentals/stats", icon: TrendingUp },
    ],
  },
  {
    items: [
      { id: "expenses", label: "경비", href: "/expenses", icon: WalletMinimal },
      { id: "income-statement", label: "손익계산서", href: "/reports/income-statement", icon: FileSpreadsheet },
      { id: "balance-sheet", label: "재무상태표", href: "/reports/balance-sheet", icon: Scale },
      { id: "vat-filing", label: "부가세 신고 자료", href: "/reports/vat-filing", icon: FileText },
      { id: "margin-report", label: "마진 리포트", href: "/reports/margin", icon: TrendingUp },
      { id: "option-funnel", label: "옵션 funnel", href: "/reports/option-funnel", icon: TrendingUp },
    ],
  },
  {
    items: [
      { id: "audit-logs", label: "활동 로그", href: "/audit-logs", icon: ScrollText },
      { id: "settings", label: "설정", href: "/settings", icon: Settings },
    ],
  },
];

const allNavItems = navGroups.flatMap((g) => g.items);

// 정확한 active 매칭: 가장 긴 href가 매칭되는 것을 우선
function getActiveId(pathname: string): string {
  let bestId = "home";
  let bestLen = 0;

  for (const item of allNavItems) {
    if (item.href === "/" && pathname === "/") {
      if (bestLen === 0) {
        bestId = item.id;
        bestLen = 1;
      }
    } else if (item.href !== "/" && pathname.startsWith(item.href)) {
      if (item.href.length > bestLen) {
        bestId = item.id;
        bestLen = item.href.length;
      }
    }
  }
  return bestId;
}

const modeOptions: { mode: JmSidebarMode; icon: React.ElementType; label: string }[] = [
  { mode: "expanded", icon: Columns2, label: "Expanded" },
  { mode: "collapsed", icon: Square, label: "Collapsed" },
  { mode: "expand-on-hover", icon: PanelLeftOpen, label: "Expand on hover" },
];

// ─── 모바일 사이드바 트리거 (글로벌 헤더에서 사용) ─────────────────────
export function MobileSidebarTrigger({ className }: { className?: string }) {
  return (
    <JmSidebarTrigger className={`lg:hidden ${className ?? ""}`.trim()} />
  );
}

// ─── SidebarProvider — JmSidebarProvider + localStorage 영속화 + 라우트 변경 시 모바일 자동 닫기 ─────────────────────
export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<JmSidebarMode>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("sidebar_mode") as JmSidebarMode | null;
      if (stored === "expanded" || stored === "collapsed" || stored === "expand-on-hover") {
        return stored;
      }
    }
    return "expanded";
  });

  useEffect(() => {
    localStorage.setItem("sidebar_mode", mode);
  }, [mode]);

  return (
    <JmSidebarProvider mode={mode} onModeChange={setMode}>
      <RouteChangeMobileCloser />
      {children}
    </JmSidebarProvider>
  );
}

function RouteChangeMobileCloser() {
  const pathname = usePathname();
  const { setMobileOpen } = useJmSidebar();
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);
  return null;
}

// ─── 메인 사이드바 ─────────────────────────────────────────────────────────
export interface AppSidebarUser {
  name: string;
  email?: string;
}

export function AppSidebar({ user }: { user: AppSidebarUser }) {
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();
  const activeId = getActiveId(pathname);

  return (
    <JmScope
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      className="contents print:hidden"
    >
      <JmSidebar width="200px" collapsedWidth="56px" mobileWidth="240px">
        <JmSidebarHeader>
          <JmBrandMark text="JM" size="sm" />
          <span className="min-w-0 truncate text-jm-sm font-bold text-[var(--jm-text)]">
            JAEWOOMADE
          </span>
        </JmSidebarHeader>

        <JmSidebarBody>
          {navGroups.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && <JmSidebarSeparator />}
              <JmSidebarGroup>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <JmSidebarItem
                      key={item.id}
                      href={item.href}
                      active={activeId === item.id}
                      icon={<Icon />}
                      render={(itemProps) => (
                        <Link href={item.href} {...itemProps} />
                      )}
                    >
                      {item.label}
                    </JmSidebarItem>
                  );
                })}
              </JmSidebarGroup>
            </div>
          ))}
        </JmSidebarBody>

        <JmSidebarFooter>
          <SidebarUserMenu user={user} />
        </JmSidebarFooter>
      </JmSidebar>
    </JmScope>
  );
}

function SidebarUserMenu({ user }: { user: AppSidebarUser }) {
  const router = useRouter();
  const { mode, setMode } = useJmSidebar();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <JmDropdownMenu>
      <JmDropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="사용자 메뉴"
            className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 outline-none transition-colors hover:bg-[var(--jm-surface-muted)] focus-visible:ring-4 focus-visible:ring-[var(--jm-ring)]"
          />
        }
      >
        <JmAvatar fallback={user.name.charAt(0)} size="sm" />
        <div className="min-w-0 flex-1 overflow-hidden text-left">
          <div className="truncate text-jm-xs font-semibold text-[var(--jm-text)]">
            {user.name}
          </div>
          {user.email && (
            <div className="truncate text-jm-3xs text-[var(--jm-text-muted)]">
              {user.email}
            </div>
          )}
        </div>
        <MoreHorizontal className="size-4 shrink-0 text-[var(--jm-text-muted)]" />
      </JmDropdownMenuTrigger>
      <JmDropdownMenuContent side="top" align="start" className="w-56">
        <JmDropdownMenuGroup>
          <JmDropdownMenuLabel>테마</JmDropdownMenuLabel>
          <JmDropdownMenuItem
            onClick={() => setTheme("light")}
            closeOnClick={false}
          >
            <Sun className="size-4" />
            <span className="flex-1">라이트</span>
            {!isDark && (
              <span className="size-1.5 rounded-full bg-[var(--jm-action)]" />
            )}
          </JmDropdownMenuItem>
          <JmDropdownMenuItem
            onClick={() => setTheme("dark")}
            closeOnClick={false}
          >
            <Moon className="size-4" />
            <span className="flex-1">다크</span>
            {isDark && (
              <span className="size-1.5 rounded-full bg-[var(--jm-action)]" />
            )}
          </JmDropdownMenuItem>
        </JmDropdownMenuGroup>
        <JmDropdownMenuSeparator />
        <JmDropdownMenuGroup>
          <JmDropdownMenuLabel>사이드바</JmDropdownMenuLabel>
          {modeOptions.map((opt) => {
            const Icon = opt.icon;
            const selected = mode === opt.mode;
            return (
              <JmDropdownMenuItem
                key={opt.mode}
                onClick={() => setMode(opt.mode)}
                closeOnClick={false}
              >
                <Icon className="size-4 shrink-0" />
                <span className="flex-1">{opt.label}</span>
                {selected && (
                  <span className="size-1.5 rounded-full bg-[var(--jm-action)]" />
                )}
              </JmDropdownMenuItem>
            );
          })}
        </JmDropdownMenuGroup>
        <JmDropdownMenuSeparator />
        <JmDropdownMenuItem onClick={handleSignOut} danger>
          <LogOut className="size-4" />
          <span>로그아웃</span>
        </JmDropdownMenuItem>
      </JmDropdownMenuContent>
    </JmDropdownMenu>
  );
}
