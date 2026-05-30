"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ChevronLeft } from "lucide-react";
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
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--jm-bg)] p-6 text-center">
        <span className="text-jm-md font-semibold text-[var(--jm-text)]">
          고객을 찾을 수 없습니다
        </span>
        <button
          type="button"
          onClick={() => router.push("/pos")}
          className="h-10 rounded-full bg-[var(--jm-action)] px-5 text-jm-sm font-semibold text-white"
        >
          POS 로
        </button>
      </div>
    );
  }

  const d = detailQuery.data;
  const c = d.customer;

  return (
    <div className="flex h-full flex-col bg-[var(--jm-bg)]">
      {/* 헤더 */}
      <header className="shrink-0 border-b border-[var(--jm-border)] bg-[var(--jm-surface)]">
        <div className="flex items-center gap-2 px-3 py-2.5 sm:px-6">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)]"
            aria-label="뒤로"
          >
            <ChevronLeft className="size-5" />
          </button>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-1.5">
              {c.type === "BUSINESS" && (
                <span className="rounded-full bg-[var(--jm-warning-bg)] px-1.5 py-0.5 text-jm-3xs font-semibold text-[var(--jm-warning-fg)]">
                  기업
                </span>
              )}
              <span className="line-clamp-1 text-jm-lg font-bold text-[var(--jm-text)]">
                {c.name}
              </span>
            </div>
            <span className="font-mono text-jm-xs text-[var(--jm-text-muted)]">{c.phone}</span>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 p-4 sm:p-6">
          {/* 1. 기본 정보 */}
          <Section title="기본 정보">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-jm-sm">
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
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-jm-sm">
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
                    <span className="col-span-2 text-jm-xs text-[var(--jm-text-subtle)]">
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
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-jm-sm">
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
              <div className="flex flex-col gap-2 text-jm-sm">
                {c.address && (
                  <div className="flex flex-col">
                    <span className="text-jm-3xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
                      {c.type === "BUSINESS" ? "사업장 주소" : "주소"}
                    </span>
                    <span className="text-[var(--jm-text)]">{c.address}</span>
                  </div>
                )}
                {c.shippingAddress && (
                  <div className="flex flex-col">
                    <span className="text-jm-3xs font-semibold uppercase tracking-wider text-[var(--jm-success-fg)]">
                      배송지 주소 (다름)
                    </span>
                    <span className="text-[var(--jm-text)]">{c.shippingAddress}</span>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* 2. 잔액 */}
          <Section title="잔액">
            <div className="flex items-baseline justify-between">
              <span className="text-jm-sm text-[var(--jm-text-muted)]">미수금</span>
              <span
                className={`text-jm-2xl font-bold tabular-nums ${
                  Number(d.stats.outstandingAmount) > 0
                    ? "text-[var(--jm-danger-fg)]"
                    : "text-[var(--jm-text)]"
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
                    onClick={() => router.push(`/pos/repairs/${r.id}`)}
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
              <div className="mb-2 rounded-lg bg-[var(--jm-bg)] px-3 py-2 text-jm-sm text-[var(--jm-text)]">
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
    <section className="rounded-2xl bg-[var(--jm-surface)] p-4 border border-[var(--jm-border)]">
      <h3 className="mb-3 text-jm-xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
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
      <span className="text-jm-3xs uppercase tracking-wider text-[var(--jm-text-subtle)]">
        {label}
      </span>
      <span
        className={`line-clamp-1 text-jm-sm text-[var(--jm-text)] ${mono ? "font-mono" : ""}`}
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
    <div className="flex flex-col gap-0.5 rounded-2xl bg-[var(--jm-surface)] p-3 border border-[var(--jm-border)]">
      <span className="text-jm-3xs uppercase tracking-wider text-[var(--jm-text-subtle)]">
        {label}
      </span>
      <span className="text-jm-xl font-bold tabular-nums text-[var(--jm-text)]">
        {count.toLocaleString("ko-KR")}
        <span className="ml-0.5 text-jm-2xs font-normal text-[var(--jm-text-subtle)]">건</span>
      </span>
      {amount && (
        <span className="text-jm-2xs font-medium tabular-nums text-[var(--jm-text-muted)]">
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
        onClick ? "hover:bg-[var(--jm-bg)] active:bg-[var(--jm-surface-muted)]" : ""
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="line-clamp-1 text-jm-sm font-medium text-[var(--jm-text)]">
          {primary}
        </span>
        {secondary && (
          <span className="line-clamp-1 text-jm-2xs text-[var(--jm-text-muted)]">{secondary}</span>
        )}
      </div>
      {tail && (
        <span className="shrink-0 text-jm-xs font-semibold tabular-nums text-[var(--jm-text)]">
          {tail}
        </span>
      )}
    </Tag>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-[var(--jm-bg)] px-3 py-4 text-center text-jm-xs text-[var(--jm-text-subtle)]">
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
    <div className="flex h-full flex-col bg-[var(--jm-bg)]">
      <header className="shrink-0 border-b border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 py-2.5">
        <div className="h-10 w-40 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
      </header>
      <main className="flex-1 overflow-hidden p-4">
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-2xl bg-[var(--jm-surface)] border border-[var(--jm-border)]"
            />
          ))}
        </div>
      </main>
    </div>
  );
}
