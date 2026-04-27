import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ChevronLeft } from "lucide-react";

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  MIXED: "복합",
  UNPAID: "외상",
};

function parseDate(s: string | undefined) {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s);
  return new Date();
}

export default async function DailyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateStr } = await searchParams;
  const baseDate = parseDate(dateStr);
  const start = new Date(baseDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(baseDate);
  end.setHours(23, 59, 59, 999);

  const [orders, repairs, rentals] = await Promise.all([
    prisma.order.findMany({
      where: {
        orderDate: { gte: start, lte: end },
        status: { notIn: ["CANCELLED", "RETURNED"] },
      },
      select: { id: true, orderNo: true, totalAmount: true, paymentMethod: true, customerName: true },
    }),
    prisma.repairTicket.findMany({
      where: {
        pickedUpAt: { gte: start, lte: end },
      },
      select: { id: true, ticketNo: true, finalAmount: true, paymentMethod: true, customer: { select: { name: true } } },
    }),
    prisma.rental.findMany({
      where: {
        OR: [
          { createdAt: { gte: start, lte: end } },
          { actualReturnedAt: { gte: start, lte: end } },
        ],
      },
      select: { id: true, rentalNo: true, finalAmount: true, paymentMethod: true, customer: { select: { name: true } } },
    }),
  ]);

  const totals: Record<string, number> = { CASH: 0, CARD: 0, TRANSFER: 0, MIXED: 0, UNPAID: 0, UNKNOWN: 0 };
  const addToTotal = (amount: number, pm: string | null) => {
    const k = pm && totals[pm] !== undefined ? pm : "UNKNOWN";
    totals[k] += amount;
  };
  orders.forEach((o) => addToTotal(Number(o.totalAmount), o.paymentMethod));
  repairs.forEach((r) => addToTotal(Number(r.finalAmount), r.paymentMethod));
  rentals.forEach((r) => addToTotal(Number(r.finalAmount), r.paymentMethod));

  const grand = Object.values(totals).reduce((s, v) => s + v, 0);
  const dateISO = start.toISOString().slice(0, 10);
  const yesterday = new Date(start); yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(start); tomorrow.setDate(tomorrow.getDate() + 1);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <Link href="/pos" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> 홈
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">일일 정산</h1>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/pos/reports/daily?date=${yesterday.toISOString().slice(0, 10)}`} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted/50">◀</Link>
          <span className="font-medium">{dateISO}</span>
          <Link href={`/pos/reports/daily?date=${tomorrow.toISOString().slice(0, 10)}`} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted/50">▶</Link>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {["CASH", "CARD", "TRANSFER", "MIXED", "UNPAID"].map((pm) => (
          <div key={pm} className="rounded-xl border border-border bg-background p-4">
            <div className="text-sm text-muted-foreground">{PAYMENT_LABEL[pm]}</div>
            <div className="mt-1 text-xl font-semibold tracking-tight">
              ₩{totals[pm].toLocaleString("ko-KR")}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-6 rounded-xl border border-primary bg-primary/10 p-4 text-primary/80">
        <div className="text-sm">당일 총액</div>
        <div className="text-3xl font-bold tracking-tight">₩{grand.toLocaleString("ko-KR")}</div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Section title={`판매 (${orders.length})`}>
          {orders.length === 0 ? <Empty /> : (
            <ul className="space-y-1 text-sm">
              {orders.map((o) => (
                <li key={o.id} className="flex justify-between">
                  <span>{o.orderNo} · {o.customerName ?? "비회원"}</span>
                  <span>₩{Number(o.totalAmount).toLocaleString("ko-KR")}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title={`수리 (${repairs.length})`}>
          {repairs.length === 0 ? <Empty /> : (
            <ul className="space-y-1 text-sm">
              {repairs.map((r) => (
                <li key={r.id} className="flex justify-between">
                  <span>{r.ticketNo} · {r.customer.name}</span>
                  <span>₩{Number(r.finalAmount).toLocaleString("ko-KR")}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title={`임대 (${rentals.length})`}>
          {rentals.length === 0 ? <Empty /> : (
            <ul className="space-y-1 text-sm">
              {rentals.map((r) => (
                <li key={r.id} className="flex justify-between">
                  <span>{r.rentalNo} · {r.customer.name}</span>
                  <span>₩{Number(r.finalAmount).toLocaleString("ko-KR")}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="mb-2 text-sm font-semibold">{title}</div>
      {children}
    </div>
  );
}

function Empty() {
  return <div className="py-6 text-center text-xs text-muted-foreground">없음</div>;
}
