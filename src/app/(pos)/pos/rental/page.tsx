import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Plus, Package } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  RESERVED: "예약",
  ACTIVE: "대여중",
  RETURNED: "반납완료",
  OVERDUE: "연체",
  CANCELLED: "취소",
};

const STATUS_COLORS: Record<string, string> = {
  RESERVED: "bg-sky-100 text-sky-700",
  ACTIVE: "bg-primary/20 text-primary/80",
  RETURNED: "bg-muted text-muted-foreground",
  OVERDUE: "bg-red-100 text-red-700",
  CANCELLED: "bg-muted text-muted-foreground",
};

const TABS: { id: string; label: string }[] = [
  { id: "ACTIVE", label: "대여중" },
  { id: "RESERVED", label: "예약" },
  { id: "OVERDUE", label: "연체" },
  { id: "RETURNED", label: "반납완료" },
  { id: "ALL", label: "전체" },
];

export default async function RentalListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const activeStatus = status || "ACTIVE";

  // 자동 overdue 갱신
  await prisma.rental.updateMany({
    where: { status: "ACTIVE", endDate: { lt: new Date() } },
    data: { status: "OVERDUE" },
  });

  const rentals = await prisma.rental.findMany({
    where: activeStatus === "ALL" ? {} : { status: activeStatus as never },
    include: {
      asset: { select: { assetNo: true, name: true } },
      customer: { select: { id: true, name: true, phone: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">임대</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/pos/rental/assets"
            className="flex h-11 items-center gap-1 rounded-lg border border-border bg-background px-4 text-sm font-medium hover:bg-muted/50"
          >
            <Package className="h-4 w-4" /> 자산 관리
          </Link>
          <Link
            href="/pos/rental/new"
            className="flex h-11 items-center gap-1 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> 임대 시작
          </Link>
        </div>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id === "ACTIVE" ? "/pos/rental" : `/pos/rental?status=${t.id}`}
            className={`relative whitespace-nowrap px-4 py-2.5 text-sm font-medium ${
              activeStatus === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {activeStatus === t.id ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" /> : null}
          </Link>
        ))}
      </div>

      {rentals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          해당 상태의 임대가 없습니다
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-background">
          {rentals.map((r) => (
            <li key={r.id}>
              <Link
                href={`/pos/rental/${r.id}`}
                className="flex items-center justify-between gap-4 p-4 hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-medium">{r.rentalNo}</span>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status] ?? ""}`}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {r.customer.name} · {r.asset.name} ({r.asset.assetNo})
                  </div>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  {new Date(r.startDate).toLocaleDateString("ko-KR")} ~ {new Date(r.endDate).toLocaleDateString("ko-KR")}
                  <div className="text-xs">₩{Number(r.rentalAmount).toLocaleString("ko-KR")}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
