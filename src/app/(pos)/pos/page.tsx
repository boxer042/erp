import Link from "next/link";
import { startOfDay, endOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { ShoppingCart, Wrench, PackageCheck, CalendarClock, UserPlus, Search, BarChart3 } from "lucide-react";

async function getTodayStats() {
  const now = new Date();
  const start = startOfDay(now);
  const end = endOfDay(now);

  // OVERDUE 자동 전환
  await prisma.rental.updateMany({
    where: { status: "ACTIVE", endDate: { lt: now } },
    data: { status: "OVERDUE" },
  });

  const [salesAgg, salesCount, repairReceived, pickupReady, activeRentals] = await Promise.all([
    prisma.order.aggregate({
      where: {
        orderDate: { gte: start, lte: end },
        status: { notIn: ["CANCELLED", "RETURNED"] },
      },
      _sum: { totalAmount: true },
    }),
    prisma.order.count({
      where: {
        orderDate: { gte: start, lte: end },
        status: { notIn: ["CANCELLED", "RETURNED"] },
      },
    }),
    prisma.repairTicket.count({
      where: { receivedAt: { gte: start, lte: end } },
    }),
    prisma.repairTicket.count({
      where: { status: "READY" },
    }),
    prisma.rental.count({
      where: { status: { in: ["ACTIVE", "OVERDUE"] } },
    }),
  ]);

  return {
    salesCount,
    salesTotal: Number(salesAgg._sum.totalAmount ?? 0),
    repairReceived,
    pickupReady,
    activeRentals,
  };
}

export default async function PosHomePage() {
  const stats = await getTodayStats();

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">오늘</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile
          icon={<ShoppingCart className="h-5 w-5" />}
          label="오늘 판매"
          primary={`${stats.salesCount}건`}
          secondary={`₩${stats.salesTotal.toLocaleString("ko-KR")}`}
          tint="emerald"
        />
        <StatTile
          icon={<Wrench className="h-5 w-5" />}
          label="수리 접수"
          primary={`${stats.repairReceived}건`}
          secondary="오늘 신규"
          tint="amber"
        />
        <StatTile
          icon={<PackageCheck className="h-5 w-5" />}
          label="픽업 대기"
          primary={`${stats.pickupReady}건`}
          secondary="수리 완료"
          tint="blue"
        />
        <StatTile
          icon={<CalendarClock className="h-5 w-5" />}
          label="임대 중"
          primary={`${stats.activeRentals}건`}
          secondary="현재 대여 중"
          tint="violet"
        />
      </div>

      <h2 className="mt-10 mb-4 text-lg font-semibold tracking-tight">빠른 시작</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <QuickAction href="/pos/sales" icon={<ShoppingCart className="h-5 w-5" />} label="새 판매" />
        <QuickAction href="/pos/repair/new" icon={<Wrench className="h-5 w-5" />} label="수리 접수" />
        <QuickAction href="/pos/rental/new" icon={<CalendarClock className="h-5 w-5" />} label="임대 시작" />
        <QuickAction href="/pos/customers" icon={<Search className="h-5 w-5" />} label="고객 찾기" />
      </div>

      <h2 className="mt-10 mb-4 text-lg font-semibold tracking-tight">즐겨찾기</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <QuickAction href="/pos/catalog" icon={<Search className="h-5 w-5" />} label="상품 카탈로그" />
        <QuickAction href="/pos/customers/new" icon={<UserPlus className="h-5 w-5" />} label="고객 신규 등록" />
        <QuickAction href="/pos/reports/daily" icon={<BarChart3 className="h-5 w-5" />} label="일일 정산" />
      </div>
    </div>
  );
}

function StatTile({
  icon,
  label,
  primary,
  secondary,
  tint,
}: {
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary: string;
  tint: "emerald" | "amber" | "blue" | "violet";
}) {
  const tintMap = {
    emerald: "bg-primary/10 text-primary/80",
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-sky-100 text-sky-700",
    violet: "bg-violet-100 text-violet-700",
  } as const;

  return (
    <div className="rounded-xl border border-border bg-background p-5">
      <div className="flex items-center gap-2">
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tintMap[tint]}`}>
          {icon}
        </span>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="mt-4">
        <div className="text-2xl font-semibold tracking-tight">{primary}</div>
        <div className="mt-1 text-sm text-muted-foreground">{secondary}</div>
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-border bg-background p-5 transition-all hover:border-primary hover:bg-primary/5"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-foreground group-hover:bg-brand-muted group-hover:text-primary/80">
        {icon}
      </span>
      <span className="text-base font-medium">{label}</span>
    </Link>
  );
}
