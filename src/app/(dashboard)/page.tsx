import Link from "next/link";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, TrendingUp, ShoppingCart, ArrowRight,
  PackageOpen, Wrench, Container,
} from "lucide-react";
import { prisma } from "@/lib/prisma";

const statusBadge = {
  PENDING:   { label: "접수",   variant: "warning" },
  CONFIRMED: { label: "확인",   variant: "default" },
  PREPARING: { label: "준비",   variant: "default" },
  SHIPPED:   { label: "배송",   variant: "secondary" },
  DELIVERED: { label: "완료",   variant: "success" },
  CANCELLED: { label: "취소",   variant: "destructive" },
  RETURNED:  { label: "반품",   variant: "warning" },
} as const;

export default async function DashboardPage() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthLabel = `${now.getMonth() + 1}월`;

  const [
    pendingOrders,
    recentOrders,
    lowStockItems,
    unpaidSuppliers,
    unpaidCustomers,
    monthlyChannelSales,
    pendingIncoming,
    activeRepairs,
    activeRentals,
  ] = await Promise.all([
    prisma.order.count({ where: { status: "PENDING" } }),

    prisma.order.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { channel: { select: { name: true } } },
    }),

    prisma.inventory.findMany({
      where: { safetyStock: { gt: 0 }, product: { isActive: true } },
      include: { product: { select: { name: true, sku: true } } },
    }).then((items) => items.filter((i) => Number(i.quantity) <= Number(i.safetyStock))),

    // 거래처 미지급
    prisma.supplierLedger.groupBy({
      by: ["supplierId"],
      _sum: { debitAmount: true, creditAmount: true },
    }).then(async (groups) => {
      const withBalance = groups
        .map((g) => ({
          supplierId: g.supplierId,
          balance: Number(g._sum.debitAmount ?? 0) - Number(g._sum.creditAmount ?? 0),
        }))
        .filter((g) => g.balance > 0)
        .sort((a, b) => b.balance - a.balance);

      if (withBalance.length === 0) return [];

      const suppliers = await prisma.supplier.findMany({
        where: { id: { in: withBalance.map((g) => g.supplierId) } },
        select: { id: true, name: true },
      });

      return withBalance.map((g) => ({
        ...g,
        name: suppliers.find((s) => s.id === g.supplierId)?.name ?? "",
      }));
    }),

    // 고객 미수금
    prisma.customerLedger.groupBy({
      by: ["customerId"],
      _sum: { debitAmount: true, creditAmount: true },
    }).then(async (groups) => {
      const withBalance = groups
        .map((g) => ({
          customerId: g.customerId,
          balance: Number(g._sum.debitAmount ?? 0) - Number(g._sum.creditAmount ?? 0),
        }))
        .filter((g) => g.balance > 0)
        .sort((a, b) => b.balance - a.balance);

      if (withBalance.length === 0) return [];

      const customers = await prisma.customer.findMany({
        where: { id: { in: withBalance.map((g) => g.customerId) } },
        select: { id: true, name: true },
      });

      return withBalance.map((g) => ({
        ...g,
        name: customers.find((c) => c.id === g.customerId)?.name ?? "",
      }));
    }),

    // 이번 달 채널별 매출
    prisma.order.groupBy({
      by: ["channelId"],
      where: {
        status: { in: ["CONFIRMED", "PREPARING", "SHIPPED", "DELIVERED"] },
        orderDate: { gte: startOfMonth },
      },
      _sum: { totalAmount: true, commissionAmount: true },
      _count: true,
    }).then(async (groups) => {
      const channels = await prisma.salesChannel.findMany({
        where: { id: { in: groups.map((g) => g.channelId) } },
        select: { id: true, name: true },
      });
      return groups
        .map((g) => ({
          channelName: channels.find((c) => c.id === g.channelId)?.name ?? "",
          orderCount: g._count,
          totalAmount: Number(g._sum.totalAmount ?? 0),
          commissionAmount: Number(g._sum.commissionAmount ?? 0),
        }))
        .sort((a, b) => b.totalAmount - a.totalAmount);
    }),

    prisma.incoming.count({ where: { status: "PENDING" } }),

    prisma.repairTicket.count({
      where: { status: { notIn: ["PICKED_UP", "CANCELLED"] } },
    }),

    prisma.rental.count({
      where: { status: { in: ["ACTIVE", "OVERDUE"] } },
    }),
  ]);

  const totalMonthlySales = monthlyChannelSales.reduce((s, c) => s + c.totalAmount, 0);
  const totalMonthlyCommission = monthlyChannelSales.reduce((s, c) => s + c.commissionAmount, 0);
  const totalUnpaidSuppliers = unpaidSuppliers.reduce((s, u) => s + u.balance, 0);
  const totalUnpaidCustomers = unpaidCustomers.reduce((s, u) => s + u.balance, 0);

  const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR");

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">대시보드</h1>
        <p className="text-sm text-muted-foreground mt-0.5">비즈니스 현황을 한눈에 확인하세요</p>
      </div>

      {/* KPI 카드 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">{monthLabel} 매출</p>
                <p className="text-2xl font-semibold mt-1 tabular-nums">₩{fmt(totalMonthlySales)}</p>
                <p className="text-xs text-muted-foreground mt-1.5">수수료 ₩{fmt(totalMonthlyCommission)}</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-muted">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">대기 주문</p>
                <p className={`text-2xl font-semibold mt-1 tabular-nums ${pendingOrders > 0 ? "text-warning" : ""}`}>
                  {pendingOrders}건
                </p>
                <p className="text-xs text-muted-foreground mt-1.5">처리 대기 중</p>
              </div>
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${pendingOrders > 0 ? "bg-warning/15" : "bg-muted"}`}>
                <ShoppingCart className={`h-5 w-5 ${pendingOrders > 0 ? "text-warning" : "text-muted-foreground"}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={lowStockItems.length > 0 ? "border-destructive/30" : ""}>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">재고 경고</p>
                <p className={`text-2xl font-semibold mt-1 tabular-nums ${lowStockItems.length > 0 ? "text-destructive" : ""}`}>
                  {lowStockItems.length}건
                </p>
                <p className="text-xs text-muted-foreground mt-1.5">안전재고 미달</p>
              </div>
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${lowStockItems.length > 0 ? "bg-destructive/10" : "bg-muted"}`}>
                <AlertTriangle className={`h-5 w-5 ${lowStockItems.length > 0 ? "text-destructive" : "text-muted-foreground"}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">대기 입고</p>
                <p className={`text-2xl font-semibold mt-1 tabular-nums ${pendingIncoming > 0 ? "text-warning" : ""}`}>
                  {pendingIncoming}건
                </p>
                <p className="text-xs text-muted-foreground mt-1.5">확정 대기 중</p>
              </div>
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${pendingIncoming > 0 ? "bg-warning/15" : "bg-muted"}`}>
                <PackageOpen className={`h-5 w-5 ${pendingIncoming > 0 ? "text-warning" : "text-muted-foreground"}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">진행 중 수리</p>
                <p className="text-2xl font-semibold mt-1 tabular-nums">{activeRepairs}건</p>
                <p className="text-xs text-muted-foreground mt-1.5">접수 ~ 수령 대기</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Wrench className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">임대 중</p>
                <p className="text-2xl font-semibold mt-1 tabular-nums">{activeRentals}건</p>
                <p className="text-xs text-muted-foreground mt-1.5">연체 포함</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Container className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 테이블 섹션 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 최근 주문 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-medium">최근 주문</CardTitle>
            <Link href="/orders">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1">
                전체 보기 <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="px-0 pt-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className="text-muted-foreground text-xs">주문번호</TableHead>
                  <TableHead className="text-muted-foreground text-xs">채널</TableHead>
                  <TableHead className="text-muted-foreground text-xs">상태</TableHead>
                  <TableHead className="text-muted-foreground text-xs text-right">금액</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">주문이 없습니다</TableCell>
                  </TableRow>
                ) : (
                  recentOrders.map((order) => {
                    const s = statusBadge[order.status as keyof typeof statusBadge]
                      ?? { label: order.status, variant: "secondary" as const };
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.orderNo}</TableCell>
                        <TableCell>{order.channel.name}</TableCell>
                        <TableCell>
                          <Badge variant={s.variant}>{s.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          ₩{Number(order.totalAmount).toLocaleString("ko-KR")}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* 이번 달 채널별 매출 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{monthLabel} 채널별 매출</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pt-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className="text-muted-foreground text-xs">채널</TableHead>
                  <TableHead className="text-muted-foreground text-xs text-right">주문</TableHead>
                  <TableHead className="text-muted-foreground text-xs text-right">매출</TableHead>
                  <TableHead className="text-muted-foreground text-xs text-right">수수료</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyChannelSales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">이번 달 매출 없음</TableCell>
                  </TableRow>
                ) : (
                  monthlyChannelSales.map((cs) => (
                    <TableRow key={cs.channelName}>
                      <TableCell className="font-medium">{cs.channelName}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{cs.orderCount}건</TableCell>
                      <TableCell className="text-right tabular-nums">₩{fmt(cs.totalAmount)}</TableCell>
                      <TableCell className="text-right tabular-nums text-destructive">₩{fmt(cs.commissionAmount)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* 재고 부족 경고 */}
        <Card className={lowStockItems.length > 0 ? "border-destructive/30" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-medium">재고 부족 경고</CardTitle>
            <Link href="/inventory/lots">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1">
                로트 현황 <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="px-0 pt-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className="text-muted-foreground text-xs">상품</TableHead>
                  <TableHead className="text-muted-foreground text-xs">SKU</TableHead>
                  <TableHead className="text-muted-foreground text-xs text-right">현재고</TableHead>
                  <TableHead className="text-muted-foreground text-xs text-right">안전재고</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowStockItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-primary">모든 재고 정상</TableCell>
                  </TableRow>
                ) : (
                  lowStockItems.slice(0, 5).map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.product.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{inv.product.sku}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-destructive font-medium">
                        {Number(inv.quantity).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {Number(inv.safetyStock).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* 거래처 미지급 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-medium">거래처 미지급</CardTitle>
              {totalUnpaidSuppliers > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">₩{fmt(totalUnpaidSuppliers)}</span>
              )}
            </div>
            <Link href="/suppliers/ledger">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1">
                원장 <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="px-0 pt-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className="text-muted-foreground text-xs">거래처</TableHead>
                  <TableHead className="text-muted-foreground text-xs text-right">미지급 잔액</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unpaidSuppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">미지급 없음</TableCell>
                  </TableRow>
                ) : (
                  unpaidSuppliers.slice(0, 5).map((s) => (
                    <TableRow key={s.supplierId}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right tabular-nums text-warning font-medium">
                        ₩{fmt(s.balance)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* 고객 미수금 */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-medium">고객 미수금</CardTitle>
              {totalUnpaidCustomers > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">₩{fmt(totalUnpaidCustomers)}</span>
              )}
            </div>
            <Link href="/customers/ledger">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1">
                원장 <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="px-0 pt-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className="text-muted-foreground text-xs">고객</TableHead>
                  <TableHead className="text-muted-foreground text-xs text-right">미수금 잔액</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unpaidCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">미수금 없음</TableCell>
                  </TableRow>
                ) : (
                  unpaidCustomers.slice(0, 5).map((c) => (
                    <TableRow key={c.customerId}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-right tabular-nums text-warning font-medium">
                        ₩{fmt(c.balance)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
