import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

/**
 * 고객 상세 — POS v2 customer profile 페이지용 통합 API.
 *
 * 응답: 기본 정보 + 통계 + 최근 이력 5건씩 (구매/수리/임대/시리얼) + 메모 + 기기.
 * 미수금: CustomerLedger 의 잔액 합계 (CHARGE - PAYMENT - ADJUSTMENT.refund).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;

  const [
    customer,
    orderStats,
    repairStats,
    rentalStats,
    serialCount,
    recentOrders,
    recentRepairs,
    recentRentals,
    recentSerials,
    machines,
    notes,
    ledgerSum,
  ] = await Promise.all([
    prisma.customer.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        name: true,
        phone: true,
        businessNumber: true,
        ceo: true,
        fax: true,
        businessType: true,
        businessItem: true,
        email: true,
        address: true,
        shippingAddress: true,
        contactName: true,
        contactPhone: true,
        contactPosition: true,
        memo: true,
        isActive: true,
        createdAt: true,
      },
    }),
    prisma.order.aggregate({
      where: { customerId: id },
      _count: true,
      _sum: { totalAmount: true },
    }),
    prisma.repairTicket.aggregate({
      where: { customerId: id },
      _count: true,
      _sum: { finalAmount: true },
    }),
    prisma.rental.aggregate({
      where: { customerId: id },
      _count: true,
      _sum: { finalAmount: true },
    }),
    prisma.serialItem.count({ where: { customerId: id } }),
    prisma.order.findMany({
      where: { customerId: id },
      select: {
        id: true,
        orderNo: true,
        orderDate: true,
        status: true,
        totalAmount: true,
        paymentMethod: true,
      },
      orderBy: { orderDate: "desc" },
      take: 5,
    }),
    prisma.repairTicket.findMany({
      where: { customerId: id },
      select: {
        id: true,
        ticketNo: true,
        type: true,
        workKind: true,
        status: true,
        receivedAt: true,
        pickedUpAt: true,
        finalAmount: true,
      },
      orderBy: { receivedAt: "desc" },
      take: 5,
    }),
    prisma.rental.findMany({
      where: { customerId: id },
      select: {
        id: true,
        rentalNo: true,
        status: true,
        startDate: true,
        endDate: true,
        finalAmount: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.serialItem.findMany({
      where: { customerId: id },
      select: {
        id: true,
        code: true,
        source: true,
        soldAt: true,
        warrantyEnds: true,
        product: { select: { name: true, sku: true } },
      },
      orderBy: { soldAt: "desc" },
      take: 5,
    }),
    prisma.customerMachine.findMany({
      where: { customerId: id },
      select: { id: true, name: true, memo: true },
      orderBy: { createdAt: "desc" },
    }),
    // 업무 노트(Note) 통합 — 고객 노트는 sourceType=CUSTOMER 로 일원화 (구 CustomerNote 는 백필됨)
    prisma.note.findMany({
      where: { isActive: true, sourceType: "CUSTOMER", sourceId: id },
      select: { id: true, content: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    // 미수금 = 가장 최근 ledger row 의 누적 balance
    prisma.customerLedger.findFirst({
      where: { customerId: id },
      orderBy: { date: "desc" },
      select: { balance: true },
    }),
  ]);

  if (!customer) {
    return NextResponse.json({ error: "고객을 찾을 수 없습니다" }, { status: 404 });
  }

  // 미수금 = 가장 최근 ledger 의 누적 balance (없으면 0)
  const outstandingAmount = ledgerSum?.balance?.toString() ?? "0";

  // 수리·임대 finalAmount 는 세전(공급가액) 저장값. 손님 화면 표시는 VAT 포함 (×1.1)
  // 통일 — Order.totalAmount(VAT-incl) 와 시각적으로 동일한 의미로 보이도록.
  const toVatIncl = (raw: unknown) =>
    Math.round(Number(raw ?? 0) * 1.1).toString();

  return NextResponse.json({
    customer,
    stats: {
      orderCount: orderStats._count,
      orderTotal: orderStats._sum.totalAmount?.toString() ?? "0",
      repairCount: repairStats._count,
      repairTotal: toVatIncl(repairStats._sum.finalAmount),
      rentalCount: rentalStats._count,
      rentalTotal: toVatIncl(rentalStats._sum.finalAmount),
      serialCount,
      outstandingAmount,
    },
    recentOrders,
    recentRepairs: recentRepairs.map((r) => ({
      ...r,
      finalAmount: toVatIncl(r.finalAmount),
    })),
    recentRentals: recentRentals.map((r) => ({
      ...r,
      finalAmount: toVatIncl(r.finalAmount),
    })),
    recentSerials,
    machines,
    notes,
  });
}
