"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { apiGet } from "@/lib/api-client";

interface CustomerDetail {
  customer: {
    id: string;
    type: "INDIVIDUAL" | "BUSINESS";
    name: string;
    phone: string;
    businessNumber: string | null;
    ceo: string | null;
    fax: string | null;
    businessType: string | null;
    businessItem: string | null;
    email: string | null;
    address: string | null;
    shippingAddress: string | null;
    contactName: string | null;
    contactPhone: string | null;
    contactPosition: string | null;
    memo: string | null;
    isActive: boolean;
    createdAt: string;
  };
  stats: {
    orderCount: number;
    orderTotal: string;
    repairCount: number;
    repairTotal: string;
    rentalCount: number;
    rentalTotal: string;
    serialCount: number;
    outstandingAmount: string;
  };
  recentOrders: Array<{
    id: string;
    orderNo: string;
    orderDate: string;
    status: string;
    totalAmount: string;
    paymentMethod: string | null;
  }>;
  recentRepairs: Array<{
    id: string;
    ticketNo: string;
    type: string;
    status: string;
    receivedAt: string;
    pickedUpAt: string | null;
    finalAmount: string;
  }>;
  recentRentals: Array<{
    id: string;
    rentalNo: string;
    status: string;
    startDate: string;
    endDate: string;
    finalAmount: string;
  }>;
  recentSerials: Array<{
    id: string;
    code: string;
    source: string;
    soldAt: string;
    warrantyEnds: string | null;
    product: { name: string; sku: string } | null;
  }>;
  machines: Array<{ id: string; name: string; memo: string | null }>;
  notes: Array<{ id: string; content: string; createdAt: string }>;
}

export default function CustomerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const detailQuery = useQuery<CustomerDetail>({
    queryKey: ["pos", "customer-detail", id],
    queryFn: () => apiGet<CustomerDetail>(`/api/customers/${id}/detail`),
  });

  if (detailQuery.isPending) {
    return <ProfileSkeleton />;
  }
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-50 p-6 text-center">
        <span className="text-[15px] font-semibold text-zinc-900">
          고객을 찾을 수 없습니다
        </span>
        <button
          type="button"
          onClick={() => router.push("/pos")}
          className="h-10 rounded-full bg-zinc-900 px-5 text-[13px] font-semibold text-white"
        >
          POS 로
        </button>
      </div>
    );
  }

  const d = detailQuery.data;
  const c = d.customer;

  return (
    <div className="flex h-full flex-col bg-zinc-50">
      {/* 헤더 */}
      <header className="shrink-0 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2.5 sm:px-6">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-100"
            aria-label="뒤로"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M12 4l-6 6 6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-1.5">
              {c.type === "BUSINESS" && (
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                  기업
                </span>
              )}
              <span className="line-clamp-1 text-[16px] font-bold text-zinc-900">
                {c.name}
              </span>
            </div>
            <span className="font-mono text-[12px] text-zinc-500">{c.phone}</span>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4 sm:p-6">
          {/* 1. 기본 정보 */}
          <Section title="기본 정보">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
              <Field label={c.type === "BUSINESS" ? "상호" : "이름"} value={c.name} />
              <Field
                label={c.type === "BUSINESS" ? "대표 전화" : "전화"}
                value={c.phone}
                mono
              />
              {c.email && <Field label="이메일" value={c.email} mono />}
              <Field
                label="등록일"
                value={format(new Date(c.createdAt), "yyyy-MM-dd")}
                mono
              />
            </div>
          </Section>

          {/* 1.5 사업자 정보 — 기업일 때만 */}
          {c.type === "BUSINESS" && (
            <Section title="사업자 정보">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                {c.businessNumber && (
                  <Field label="사업자번호" value={c.businessNumber} mono />
                )}
                {c.ceo && <Field label="대표자" value={c.ceo} />}
                {c.fax && <Field label="팩스" value={c.fax} mono />}
                {c.businessType && <Field label="업태" value={c.businessType} />}
                {c.businessItem && <Field label="종목" value={c.businessItem} />}
                {!c.businessNumber &&
                  !c.ceo &&
                  !c.fax &&
                  !c.businessType &&
                  !c.businessItem && (
                    <span className="col-span-2 text-[12px] text-zinc-400">
                      추가 사업자 정보 없음 — 어드민에서 입력 가능
                    </span>
                  )}
              </div>
            </Section>
          )}

          {/* 1.6 담당자 — 기업이고 정보 있을 때만 */}
          {c.type === "BUSINESS" &&
            (c.contactName || c.contactPhone || c.contactPosition) && (
              <Section title="실무 담당자">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                  {c.contactName && <Field label="이름" value={c.contactName} />}
                  {c.contactPhone && (
                    <Field label="전화" value={c.contactPhone} mono />
                  )}
                  {c.contactPosition && (
                    <Field label="직책" value={c.contactPosition} />
                  )}
                </div>
              </Section>
            )}

          {/* 1.7 주소 */}
          {(c.address || c.shippingAddress) && (
            <Section title="주소">
              <div className="flex flex-col gap-2 text-[13px]">
                {c.address && (
                  <div className="flex flex-col">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      {c.type === "BUSINESS" ? "사업장 주소" : "주소"}
                    </span>
                    <span className="text-zinc-900">{c.address}</span>
                  </div>
                )}
                {c.shippingAddress && (
                  <div className="flex flex-col">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                      배송지 주소 (다름)
                    </span>
                    <span className="text-zinc-900">{c.shippingAddress}</span>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* 2. 잔액 */}
          <Section title="잔액">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-zinc-600">미수금</span>
              <span
                className={`text-[20px] font-bold tabular-nums ${
                  Number(d.stats.outstandingAmount) > 0
                    ? "text-rose-600"
                    : "text-zinc-900"
                }`}
              >
                ₩{Number(d.stats.outstandingAmount).toLocaleString("ko-KR")}
              </span>
            </div>
          </Section>

          {/* 통계 카드 4 — 빠른 요약 */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label="구매" count={d.stats.orderCount} amount={d.stats.orderTotal} />
            <StatCard label="수리" count={d.stats.repairCount} amount={d.stats.repairTotal} />
            <StatCard label="임대" count={d.stats.rentalCount} amount={d.stats.rentalTotal} />
            <StatCard label="시리얼" count={d.stats.serialCount} amount={null} />
          </div>

          {/* 3. 구매 이력 (최근 5) */}
          <Section title="구매 이력 (최근 5건)">
            {d.recentOrders.length === 0 ? (
              <Empty>구매 이력이 없습니다</Empty>
            ) : (
              <div className="flex flex-col gap-1">
                {d.recentOrders.map((o) => (
                  <Row
                    key={o.id}
                    primary={o.orderNo}
                    secondary={format(new Date(o.orderDate), "yyyy-MM-dd")}
                    tail={`₩${Number(o.totalAmount).toLocaleString("ko-KR")}`}
                  />
                ))}
              </div>
            )}
          </Section>

          {/* 4. 수리 이력 */}
          <Section title="수리 이력 (최근 5건)">
            {d.recentRepairs.length === 0 ? (
              <Empty>수리 이력이 없습니다</Empty>
            ) : (
              <div className="flex flex-col gap-1">
                {d.recentRepairs.map((r) => (
                  <Row
                    key={r.id}
                    primary={r.ticketNo}
                    secondary={`${repairStatusLabel(r.status)} · ${format(new Date(r.receivedAt), "yyyy-MM-dd")}`}
                    tail={`₩${Number(r.finalAmount).toLocaleString("ko-KR")}`}
                    onClick={() => router.push(`/pos/repair-v2/${r.id}`)}
                  />
                ))}
              </div>
            )}
          </Section>

          {/* 5. 임대 이력 */}
          <Section title="임대 이력 (최근 5건)">
            {d.recentRentals.length === 0 ? (
              <Empty>임대 이력이 없습니다</Empty>
            ) : (
              <div className="flex flex-col gap-1">
                {d.recentRentals.map((r) => (
                  <Row
                    key={r.id}
                    primary={r.rentalNo}
                    secondary={`${format(new Date(r.startDate), "MM-dd")} ~ ${format(new Date(r.endDate), "MM-dd")}`}
                    tail={`₩${Number(r.finalAmount).toLocaleString("ko-KR")}`}
                  />
                ))}
              </div>
            )}
          </Section>

          {/* 6. 시리얼 */}
          <Section title="시리얼 (최근 5)">
            {d.recentSerials.length === 0 ? (
              <Empty>시리얼 이력이 없습니다</Empty>
            ) : (
              <div className="flex flex-col gap-1">
                {d.recentSerials.map((s) => (
                  <Row
                    key={s.id}
                    primary={s.code}
                    secondary={s.product?.name ?? "(미상)"}
                    tail={s.warrantyEnds
                      ? `보증 ~${format(new Date(s.warrantyEnds), "yyyy-MM-dd")}`
                      : ""}
                  />
                ))}
              </div>
            )}
          </Section>

          {/* 7. 기기 */}
          <Section title="등록 기기">
            {d.machines.length === 0 ? (
              <Empty>등록된 기기가 없습니다</Empty>
            ) : (
              <div className="flex flex-col gap-1">
                {d.machines.map((m) => (
                  <Row
                    key={m.id}
                    primary={m.name}
                    secondary={m.memo ?? ""}
                  />
                ))}
              </div>
            )}
          </Section>

          {/* 8. 메모 */}
          <Section title="메모">
            {c.memo && (
              <div className="mb-2 rounded-lg bg-zinc-50 px-3 py-2 text-[13px] text-zinc-700">
                {c.memo}
              </div>
            )}
            {d.notes.length === 0 ? (
              c.memo ? null : <Empty>메모가 없습니다</Empty>
            ) : (
              <div className="flex flex-col gap-1">
                {d.notes.map((n) => (
                  <Row
                    key={n.id}
                    primary={n.content}
                    secondary={format(new Date(n.createdAt), "yyyy-MM-dd HH:mm")}
                  />
                ))}
              </div>
            )}
          </Section>

          <div className="h-8" />
        </div>
      </main>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-100">
      <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  mono,
  fullWidth,
}: {
  label: string;
  value: string;
  mono?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-0.5 ${fullWidth ? "col-span-2" : ""}`}>
      <span className="text-[10px] uppercase tracking-wider text-zinc-400">
        {label}
      </span>
      <span
        className={`line-clamp-1 text-[13px] text-zinc-900 ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function StatCard({
  label,
  count,
  amount,
}: {
  label: string;
  count: number;
  amount: string | null;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl bg-white p-3 ring-1 ring-zinc-100">
      <span className="text-[10px] uppercase tracking-wider text-zinc-400">
        {label}
      </span>
      <span className="text-[18px] font-bold tabular-nums text-zinc-900">
        {count.toLocaleString("ko-KR")}
        <span className="ml-0.5 text-[11px] font-normal text-zinc-400">건</span>
      </span>
      {amount && (
        <span className="text-[11px] font-medium tabular-nums text-zinc-500">
          ₩{Number(amount).toLocaleString("ko-KR")}
        </span>
      )}
    </div>
  );
}

function Row({
  primary,
  secondary,
  tail,
  onClick,
}: {
  primary: string;
  secondary?: string;
  tail?: string;
  onClick?: () => void;
}) {
  const Tag: keyof React.JSX.IntrinsicElements = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
        onClick ? "hover:bg-zinc-50 active:bg-zinc-100" : ""
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="line-clamp-1 text-[13px] font-medium text-zinc-900">
          {primary}
        </span>
        {secondary && (
          <span className="line-clamp-1 text-[11px] text-zinc-500">{secondary}</span>
        )}
      </div>
      {tail && (
        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-zinc-700">
          {tail}
        </span>
      )}
    </Tag>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-4 text-center text-[12px] text-zinc-400">
      {children}
    </div>
  );
}

function repairStatusLabel(status: string): string {
  const map: Record<string, string> = {
    RECEIVED: "접수",
    DIAGNOSING: "진단중",
    QUOTED: "견적대기",
    APPROVED: "승인",
    REPAIRING: "수리중",
    READY: "인계대기",
    PICKED_UP: "완료",
    CANCELLED: "취소",
  };
  return map[status] ?? status;
}

function ProfileSkeleton() {
  return (
    <div className="flex h-full flex-col bg-zinc-50">
      <header className="shrink-0 border-b border-zinc-200 bg-white px-3 py-2.5">
        <div className="h-10 w-40 animate-pulse rounded bg-zinc-100" />
      </header>
      <main className="flex-1 overflow-hidden p-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-2xl bg-white ring-1 ring-zinc-100"
            />
          ))}
        </div>
      </main>
    </div>
  );
}
