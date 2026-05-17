"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  BookOpen,
  Wrench,
  Package,
  ChevronRight,
  ShoppingBag,
  ShieldCheck,
  Lock,
  Phone,
} from "lucide-react";
import {
  JmScope,
  JmButton,
  JmCard,
  JmCardContent,
  JmDrawer,
  JmDrawerContent,
  JmDrawerHeader,
  JmDrawerTitle,
  JmDrawerBody,
  JmDrawerFooter,
  JmInput,
  JmTextarea,
  JmFormField,
  JmSkeleton,
  JmBadge,
} from "@/jm";
import { ManualRenderer } from "@/components/manual-renderer";
import { parseManualBlocks } from "@/lib/manual-blocks";
import {
  type SerialAccessResponse,
  type PublicDevice,
  type PublicCompany,
  REPAIR_STATUS_LABEL,
} from "./_types";
import { WarrantyRing, BentoCard, formatDate } from "./_parts";

export function SerialPublicClient({ token }: { token: string }) {
  const [data, setData] = useState<SerialAccessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"main" | "manual" | "policy">("main");
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  // 매장 정보 — 1단계 응답에서 받아 보관 (2단계 full 응답엔 없음)
  const [company, setCompany] = useState<PublicCompany | null>(null);
  // 본인확인 통과 시 입력값 보관 — 수리 접수 신청에서 재사용
  const [creds, setCreds] = useState<{ name: string; phoneLast4: string } | null>(
    null,
  );

  useEffect(() => {
    let alive = true;
    fetch(`/api/public/serial-access/${token}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? "조회에 실패했습니다");
        return j as SerialAccessResponse;
      })
      .then((j) => {
        if (!alive) return;
        setData(j);
        if (j.mode !== "full" && j.company) setCompany(j.company);
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [token]);

  const onVerified = useCallback(
    (full: SerialAccessResponse, c: { name: string; phoneLast4: string }) => {
      setData(full);
      setCreds(c);
      setVerifyOpen(false);
    },
    [],
  );

  return (
    <JmScope theme="auto" data-jm-scope>
      <div className="min-h-dvh bg-[var(--jm-bg)] font-[family-name:var(--jm-font-sans)]">
        <div className="mx-auto max-w-[480px]">
          {loading ? (
            <LoadingView />
          ) : error ? (
            <ErrorView message={error} />
          ) : !data ? (
            <ErrorView message="조회에 실패했습니다" />
          ) : view === "manual" ? (
            <ManualView device={getDevice(data)} onBack={() => setView("main")} />
          ) : view === "policy" ? (
            <PolicyView onBack={() => setView("main")} />
          ) : (
            <MainView
              data={data}
              company={company}
              onOpenManual={() => setView("manual")}
              onOpenVerify={() => setVerifyOpen(true)}
              onOpenPolicy={() => setView("policy")}
              onOpenRepair={() => setRepairOpen(true)}
            />
          )}
        </div>
      </div>

      <VerifyDrawer
        token={token}
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        onVerified={onVerified}
      />

      {creds && (
        <RepairRequestDrawer
          token={token}
          creds={creds}
          open={repairOpen}
          onOpenChange={setRepairOpen}
        />
      )}
    </JmScope>
  );
}

function getDevice(data: SerialAccessResponse): PublicDevice | null {
  return data.device;
}

// ─────────────────────────────────────────────
// 메인 뷰
// ─────────────────────────────────────────────
function MainView({
  data,
  company,
  onOpenManual,
  onOpenVerify,
  onOpenPolicy,
  onOpenRepair,
}: {
  data: SerialAccessResponse;
  company: PublicCompany | null;
  onOpenManual: () => void;
  onOpenVerify: () => void;
  onOpenPolicy: () => void;
  onOpenRepair: () => void;
}) {
  const device = getDevice(data);

  return (
    <div className="flex flex-col gap-4 px-4 pb-10 pt-4">
      <Hero device={device} code={data.code} />

      {/* 보증 */}
      <JmCard>
        <JmCardContent className="flex flex-col items-center gap-3 py-6">
          <WarrantyRing
            daysLeft={data.warranty.daysLeft}
            totalDays={totalWarrantyDays(data.soldAt, data.warranty.ends)}
            warrantyEnds={data.warranty.ends}
          />
          <span className="text-jm-xs text-[var(--jm-text-muted)]">
            {formatDate(data.soldAt)} 구매
          </span>
        </JmCardContent>
      </JmCard>

      {/* bento */}
      <div className="grid grid-cols-2 gap-3">
        <BentoCard
          icon={<Wrench className="size-3.5" />}
          label="수리 이력"
          value={
            data.mode === "summary"
              ? `${data.repairCount}건`
              : `${data.repairs.length}건`
          }
        />
        <BentoCard
          icon={<BookOpen className="size-3.5" />}
          label="사용법"
          value={
            device?.hasManual ? (
              <span className="flex items-center gap-0.5 text-[var(--jm-accent-solid)]">
                보기 <ChevronRight className="size-3.5" />
              </span>
            ) : (
              "없음"
            )
          }
          onClick={device?.hasManual ? onOpenManual : undefined}
        />
      </div>

      {data.mode === "summary" ? (
        <SummaryBody data={data} onOpenVerify={onOpenVerify} />
      ) : (
        <FullBody data={data} onOpenRepair={onOpenRepair} />
      )}

      {/* 매장 정보 */}
      {company && (
        <div className="mt-1 flex flex-col gap-1.5 rounded-[var(--jm-radius-lg)] border border-[var(--jm-border)] bg-[var(--jm-surface)] p-3.5">
          <span className="text-jm-sm font-semibold text-[var(--jm-text)]">
            {company.name}
          </span>
          {company.address && (
            <span className="text-jm-xs text-[var(--jm-text-muted)]">
              {company.address}
            </span>
          )}
          {company.phone && (
            <a
              href={`tel:${company.phone}`}
              className="flex items-center gap-1.5 text-jm-sm font-medium text-[var(--jm-accent-solid)]"
            >
              <Phone className="size-3.5" />
              {company.phone}
            </a>
          )}
        </div>
      )}

      <div className="flex flex-col items-center gap-1.5 px-2 pt-2">
        <p className="text-center text-jm-xs leading-relaxed text-[var(--jm-text-muted)]">
          본 페이지는 제품 라벨 QR 을 통해 본인이 직접 조회하는 페이지입니다.
          <br />
          정보 정정·삭제 요청은 구매하신 매장으로 문의해주세요.
        </p>
        <button
          type="button"
          onClick={onOpenPolicy}
          className="text-jm-xs font-medium text-[var(--jm-accent-solid)] underline underline-offset-2"
        >
          개인정보 처리방침
        </button>
      </div>
    </div>
  );
}

function Hero({ device, code }: { device: PublicDevice | null; code: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-[16/10] w-full overflow-hidden rounded-[var(--jm-radius-lg)] bg-[var(--jm-surface-muted)]">
        {device?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={device.imageUrl}
            alt={device.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Package className="size-12 text-[var(--jm-text-muted)]" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <h1 className="text-jm-xl font-bold text-[var(--jm-text)]">
          {device?.name ?? "제품"}
        </h1>
        <div className="flex items-center gap-2">
          {device?.modelName && (
            <span className="text-jm-sm text-[var(--jm-text-muted)]">
              {device.modelName}
            </span>
          )}
          <span className="font-[family-name:var(--jm-font-mono)] text-jm-xs text-[var(--jm-text-muted)]">
            #{code}
          </span>
        </div>
      </div>
    </div>
  );
}

// 1단계 — 마스킹 본문 + 본인확인 CTA
function SummaryBody({
  data,
  onOpenVerify,
}: {
  data: Extract<SerialAccessResponse, { mode: "summary" }>;
  onOpenVerify: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {data.repairs.length > 0 && (
        <JmCard>
          <JmCardContent className="flex flex-col gap-2 py-4">
            <span className="text-jm-sm font-semibold text-[var(--jm-text)]">
              수리 이력
            </span>
            {data.repairs.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between border-b border-[var(--jm-border)] pb-2 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-col">
                  <span className="text-jm-sm text-[var(--jm-text)]">
                    {r.symptom ?? "수리"}
                  </span>
                  <span className="text-jm-xs text-[var(--jm-text-muted)]">
                    {formatDate(r.receivedAt)}
                  </span>
                </div>
                <JmBadge>{REPAIR_STATUS_LABEL[r.status] ?? r.status}</JmBadge>
              </div>
            ))}
          </JmCardContent>
        </JmCard>
      )}

      {data.verifiable ? (
        <>
          <JmButton variant="cta" onClick={onOpenVerify} className="w-full">
            <Lock className="size-4" />
            내 정보 자세히 보기
          </JmButton>
          <p className="text-center text-jm-xs text-[var(--jm-text-muted)]">
            구매·보증·수리 상세는 본인 확인 후 볼 수 있습니다.
          </p>
        </>
      ) : (
        <p className="text-center text-jm-xs text-[var(--jm-text-muted)]">
          이 제품은 구매자 정보가 등록되어 있지 않습니다.
        </p>
      )}
    </div>
  );
}

// 2단계 통과 — 풀공개 본문
function FullBody({
  data,
  onOpenRepair,
}: {
  data: Extract<SerialAccessResponse, { mode: "full" }>;
  onOpenRepair: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 rounded-[var(--jm-radius-md)] bg-[var(--jm-accent-bg)] px-3 py-2">
        <ShieldCheck className="size-4 text-[var(--jm-accent-fg)]" />
        <span className="text-jm-xs font-medium text-[var(--jm-text)]">
          본인 확인 완료 — 전체 정보가 표시됩니다
        </span>
      </div>

      {/* 구매 정보 */}
      {data.purchase && (
        <JmCard>
          <JmCardContent className="flex flex-col gap-2 py-4">
            <span className="flex items-center gap-1.5 text-jm-sm font-semibold text-[var(--jm-text)]">
              <ShoppingBag className="size-4" />
              구매 정보
            </span>
            <Row label="주문번호" value={data.purchase.orderNo} mono />
            <Row label="구매일" value={formatDate(data.purchase.orderedAt)} />
            {data.purchase.channel && (
              <Row label="구매처" value={data.purchase.channel} />
            )}
            {data.purchase.amount != null && (
              <Row
                label="결제금액"
                value={`₩${data.purchase.amount.toLocaleString("ko-KR")}`}
              />
            )}
          </JmCardContent>
        </JmCard>
      )}

      {/* 구매자 */}
      {data.customer && (
        <JmCard>
          <JmCardContent className="flex flex-col gap-2 py-4">
            <span className="text-jm-sm font-semibold text-[var(--jm-text)]">
              구매자
            </span>
            <Row label="이름" value={data.customer.name} />
            <Row label="연락처" value={data.customer.phone} />
            {data.customer.address && (
              <Row label="주소" value={data.customer.address} />
            )}
          </JmCardContent>
        </JmCard>
      )}

      {/* 수리 이력 */}
      {data.repairs.length > 0 && (
        <JmCard>
          <JmCardContent className="flex flex-col gap-2 py-4">
            <span className="flex items-center gap-1.5 text-jm-sm font-semibold text-[var(--jm-text)]">
              <Wrench className="size-4" />
              수리 이력 ({data.repairs.length}건)
            </span>
            {data.repairs.map((r) => (
              <details
                key={r.id}
                className="rounded-[var(--jm-radius-md)] border border-[var(--jm-border)] p-2.5"
              >
                <summary className="flex cursor-pointer items-center justify-between">
                  <span className="flex flex-col">
                    <span className="text-jm-sm text-[var(--jm-text)]">
                      {r.symptom ?? "수리"}
                    </span>
                    <span className="text-jm-xs text-[var(--jm-text-muted)]">
                      {formatDate(r.receivedAt)}
                      {r.completedAt && ` → ${formatDate(r.completedAt)}`}
                    </span>
                  </span>
                  <JmBadge>{REPAIR_STATUS_LABEL[r.status] ?? r.status}</JmBadge>
                </summary>
                <div className="mt-2.5 flex flex-col gap-1.5 border-t border-[var(--jm-border)] pt-2.5">
                  {r.diagnosis && (
                    <Row label="진단" value={r.diagnosis} />
                  )}
                  {r.parts.map((p, i) => (
                    <Row
                      key={`p${i}`}
                      label={`부품 · ${p.name}`}
                      value={
                        p.amount != null
                          ? `₩${p.amount.toLocaleString("ko-KR")}`
                          : `${p.quantity}개`
                      }
                    />
                  ))}
                  {r.labors.map((l, i) => (
                    <Row
                      key={`l${i}`}
                      label={`공임 · ${l.name}`}
                      value={
                        l.amount != null
                          ? `₩${l.amount.toLocaleString("ko-KR")}`
                          : "-"
                      }
                    />
                  ))}
                  {r.amount != null && (
                    <Row
                      label="합계"
                      value={`₩${r.amount.toLocaleString("ko-KR")}`}
                    />
                  )}
                  {r.warrantyEnds && (
                    <Row
                      label="수리 보증"
                      value={`${formatDate(r.warrantyEnds)} 까지`}
                    />
                  )}
                </div>
              </details>
            ))}
          </JmCardContent>
        </JmCard>
      )}

      {/* 수리 접수 신청 */}
      <JmButton variant="cta" onClick={onOpenRepair} className="w-full">
        <Wrench className="size-4" />
        수리 접수 신청
      </JmButton>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 text-jm-sm">
      <span className="shrink-0 text-[var(--jm-text-muted)]">{label}</span>
      <span
        className={`text-right text-[var(--jm-text)] ${
          mono ? "font-[family-name:var(--jm-font-mono)] text-jm-xs" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────
// 사용법 뷰
// ─────────────────────────────────────────────
function ManualView({
  device,
  onBack,
}: {
  device: PublicDevice | null;
  onBack: () => void;
}) {
  const blocks = parseManualBlocks(device?.manualBlocks);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-3 py-3">
        <button
          onClick={onBack}
          aria-label="뒤로"
          className="flex size-8 items-center justify-center rounded-[var(--jm-radius-md)] active:bg-[var(--jm-surface-muted)]"
        >
          <ArrowLeft className="size-5 text-[var(--jm-text)]" />
        </button>
        <span className="text-jm-base font-semibold text-[var(--jm-text)]">
          사용법 · {device?.name ?? "제품"}
        </span>
      </header>
      <div className="px-4 py-5">
        <ManualRenderer blocks={blocks} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 개인정보 처리방침 뷰
// ─────────────────────────────────────────────
function PolicyView({ onBack }: { onBack: () => void }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/public/privacy-policy")
      .then((r) => r.json())
      .then((j) => alive && setContent(j.content ?? ""))
      .catch(() => alive && setContent(""))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-3 py-3">
        <button
          onClick={onBack}
          aria-label="뒤로"
          className="flex size-8 items-center justify-center rounded-[var(--jm-radius-md)] active:bg-[var(--jm-surface-muted)]"
        >
          <ArrowLeft className="size-5 text-[var(--jm-text)]" />
        </button>
        <span className="text-jm-base font-semibold text-[var(--jm-text)]">
          개인정보 처리방침
        </span>
      </header>
      <div className="px-4 py-5">
        {loading ? (
          <JmSkeleton className="h-80 w-full" />
        ) : (
          <pre className="whitespace-pre-wrap font-[family-name:var(--jm-font-sans)] text-jm-sm leading-relaxed text-[var(--jm-text)]">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 본인확인 드로어
// ─────────────────────────────────────────────
function VerifyDrawer({
  token,
  open,
  onOpenChange,
  onVerified,
}: {
  token: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onVerified: (
    full: SerialAccessResponse,
    creds: { name: string; phoneLast4: string },
  ) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!name.trim() || phone.replace(/\D/g, "").length !== 4) {
      setErr("이름과 전화번호 끝 4자리를 입력해주세요");
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const r = await fetch(`/api/public/serial-access/${token}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phoneLast4: phone.replace(/\D/g, "") }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(
          (j.error ?? "확인에 실패했습니다") +
            (typeof j.remaining === "number" ? ` (남은 시도 ${j.remaining}회)` : ""),
        );
        return;
      }
      onVerified(j as SerialAccessResponse, {
        name: name.trim(),
        phoneLast4: phone.replace(/\D/g, ""),
      });
      setName("");
      setPhone("");
    } catch {
      setErr("오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <JmDrawer open={open} onOpenChange={onOpenChange}>
      <JmDrawerContent>
        <JmDrawerHeader>
          <JmDrawerTitle>본인 확인</JmDrawerTitle>
        </JmDrawerHeader>
        <JmDrawerBody className="flex flex-col gap-4">
          <p className="text-jm-sm text-[var(--jm-text-muted)]">
            구매하신 분의 정보로 확인합니다.
          </p>
          <JmFormField label="이름">
            <JmInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
            />
          </JmFormField>
          <JmFormField label="휴대폰 끝 4자리">
            <JmInput
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              placeholder="1234"
            />
          </JmFormField>
          {err && (
            <p className="text-jm-sm text-[var(--jm-danger-solid)]">{err}</p>
          )}
          <p className="text-jm-xs text-[var(--jm-text-muted)]">
            5회 실패 시 10분간 일시 잠금됩니다.
          </p>
        </JmDrawerBody>
        <JmDrawerFooter>
          <JmButton
            variant="cta"
            onClick={submit}
            disabled={submitting}
            className="w-full"
          >
            {submitting ? "확인 중..." : "확인"}
          </JmButton>
        </JmDrawerFooter>
      </JmDrawerContent>
    </JmDrawer>
  );
}

// ─────────────────────────────────────────────
// 수리 접수 신청 드로어
// ─────────────────────────────────────────────
function RepairRequestDrawer({
  token,
  creds,
  open,
  onOpenChange,
}: {
  token: string;
  creds: { name: string; phoneLast4: string };
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [symptom, setSymptom] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [doneTicket, setDoneTicket] = useState<string | null>(null);

  const submit = async () => {
    if (!symptom.trim()) {
      setErr("증상을 입력해주세요");
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const r = await fetch(
        `/api/public/serial-access/${token}/repair-request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...creds, symptom: symptom.trim() }),
        },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.error ?? "접수에 실패했습니다");
        return;
      }
      setDoneTicket(j.ticketNo ?? "");
    } catch {
      setErr("오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    onOpenChange(false);
    setSymptom("");
    setErr(null);
    setDoneTicket(null);
  };

  return (
    <JmDrawer open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <JmDrawerContent>
        <JmDrawerHeader>
          <JmDrawerTitle>수리 접수 신청</JmDrawerTitle>
        </JmDrawerHeader>
        <JmDrawerBody className="flex flex-col gap-4">
          {doneTicket !== null ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <ShieldCheck className="size-10 text-[var(--jm-accent-solid)]" />
              <span className="text-jm-base font-semibold text-[var(--jm-text)]">
                접수되었습니다
              </span>
              {doneTicket && (
                <span className="font-[family-name:var(--jm-font-mono)] text-jm-sm text-[var(--jm-text-muted)]">
                  {doneTicket}
                </span>
              )}
              <span className="text-jm-sm text-[var(--jm-text-muted)]">
                매장에서 확인 후 연락드립니다.
              </span>
            </div>
          ) : (
            <>
              <p className="text-jm-sm text-[var(--jm-text-muted)]">
                증상을 입력하시면 매장에 수리 접수가 신청됩니다.
              </p>
              <JmFormField label="증상">
                <JmTextarea
                  value={symptom}
                  onChange={(e) => setSymptom(e.target.value)}
                  rows={4}
                  placeholder="어떤 증상인지 자세히 적어주세요"
                />
              </JmFormField>
              {err && (
                <p className="text-jm-sm text-[var(--jm-danger-solid)]">{err}</p>
              )}
            </>
          )}
        </JmDrawerBody>
        <JmDrawerFooter>
          {doneTicket !== null ? (
            <JmButton variant="cta" onClick={close} className="w-full">
              확인
            </JmButton>
          ) : (
            <JmButton
              variant="cta"
              onClick={submit}
              disabled={submitting}
              className="w-full"
            >
              {submitting ? "접수 중..." : "수리 접수 신청"}
            </JmButton>
          )}
        </JmDrawerFooter>
      </JmDrawerContent>
    </JmDrawer>
  );
}

// ─────────────────────────────────────────────
// 로딩 / 에러
// ─────────────────────────────────────────────
function LoadingView() {
  return (
    <div className="flex flex-col gap-4 px-4 pb-10 pt-4">
      <JmSkeleton className="aspect-[16/10] w-full rounded-[var(--jm-radius-lg)]" />
      <JmSkeleton className="h-6 w-40" />
      <JmSkeleton className="h-48 w-full rounded-[var(--jm-radius-lg)]" />
      <div className="grid grid-cols-2 gap-3">
        <JmSkeleton className="h-20 w-full rounded-[var(--jm-radius-lg)]" />
        <JmSkeleton className="h-20 w-full rounded-[var(--jm-radius-lg)]" />
      </div>
    </div>
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <Package className="size-12 text-[var(--jm-text-muted)]" />
      <h1 className="text-jm-lg font-bold text-[var(--jm-text)]">{message}</h1>
      <p className="text-jm-sm text-[var(--jm-text-muted)]">
        QR 코드를 다시 스캔하거나 구매하신 매장으로 문의해주세요.
      </p>
    </div>
  );
}

function totalWarrantyDays(soldAt: string, ends: string | null): number | null {
  if (!ends) return null;
  return Math.ceil(
    (new Date(ends).getTime() - new Date(soldAt).getTime()) / 86_400_000,
  );
}
