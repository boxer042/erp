import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Plus } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  RECEIVED: "접수",
  DIAGNOSING: "진단중",
  QUOTED: "견적제시",
  APPROVED: "승인됨",
  REPAIRING: "수리중",
  READY: "픽업대기",
  PICKED_UP: "완료",
  CANCELLED: "취소",
};

const STATUS_COLORS: Record<string, string> = {
  RECEIVED: "bg-muted text-foreground",
  DIAGNOSING: "bg-amber-100 text-amber-700",
  QUOTED: "bg-sky-100 text-sky-700",
  APPROVED: "bg-violet-100 text-violet-700",
  REPAIRING: "bg-amber-100 text-amber-700",
  READY: "bg-primary/20 text-primary/80",
  PICKED_UP: "bg-muted text-muted-foreground",
  CANCELLED: "bg-red-100 text-red-700",
};

const TABS: { id: string; label: string }[] = [
  { id: "ALL", label: "전체" },
  { id: "RECEIVED", label: "접수" },
  { id: "QUOTED", label: "승인대기" },
  { id: "APPROVED", label: "수리대기" },
  { id: "REPAIRING", label: "수리중" },
  { id: "READY", label: "픽업대기" },
  { id: "PICKED_UP", label: "완료" },
];

export default async function RepairListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const activeStatus = status || "ALL";

  const tickets = await prisma.repairTicket.findMany({
    where: activeStatus === "ALL" ? {} : { status: activeStatus as never },
    include: {
      customer: { select: { name: true, phone: true } },
      customerMachine: { select: { name: true } },
    },
    orderBy: { receivedAt: "desc" },
    take: 200,
  });

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">수리</h1>
        <div className="flex gap-2">
          <Link
            href="/pos/repair/estimate"
            className="flex h-11 items-center gap-1 rounded-lg border border-border bg-background px-4 text-sm font-semibold hover:bg-muted/50"
          >
            <Plus className="h-4 w-4" /> 견적 접수
          </Link>
          <Link
            href="/pos/repair/new"
            className="flex h-11 items-center gap-1 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> 수리 접수
          </Link>
        </div>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id === "ALL" ? "/pos/repair" : `/pos/repair?status=${t.id}`}
            className={`relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition ${
              activeStatus === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {activeStatus === t.id ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" /> : null}
          </Link>
        ))}
      </div>

      {tickets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          접수된 수리가 없습니다
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-background">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link
                href={`/pos/repair/${t.id}`}
                className="flex items-center justify-between gap-4 p-4 hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-medium">{t.ticketNo}</span>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[t.status] ?? ""}`}
                    >
                      {STATUS_LABEL[t.status]}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {t.customer.name}
                    {t.customer.phone ? <span className="ml-2">· {t.customer.phone}</span> : null}
                    {t.customerMachine ? <span className="ml-2">· {t.customerMachine.name}</span> : null}
                  </div>
                  {t.symptom ? (
                    <div className="mt-1 line-clamp-1 text-sm text-muted-foreground">{t.symptom}</div>
                  ) : null}
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  {new Date(t.receivedAt).toLocaleDateString("ko-KR")}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
