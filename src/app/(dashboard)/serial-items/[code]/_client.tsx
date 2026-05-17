"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  Printer,
  ExternalLink,
  Pencil,
  ShieldCheck,
  Wrench,
  CalendarClock,
  Coins,
  KeyRound,
} from "lucide-react";
import {
  JmContainer,
  JmCard,
  JmCardContent,
  JmStat,
  JmBadge,
  JmButton,
  JmIconButton,
  JmDialog,
  JmDialogContent,
  JmDialogHeader,
  JmDialogTitle,
  JmDialogBody,
  JmDialogFooter,
  JmTextarea,
  JmSelect,
  JmSkeleton,
  JmFormField,
  jmToast,
} from "@/jm";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { CustomerCombobox } from "@/components/customer-combobox";
import { SerialItemsThemeScope } from "../_theme-scope";
import {
  type SerialDetail,
  ACCESS_STAGE_LABEL,
  ACCESS_FAIL_LABEL,
  SERIAL_STATUS_LABEL,
  SERIAL_SOURCE_LABEL,
  REPAIR_STATUS_LABEL,
} from "./_types";

interface CustomerLite {
  id: string;
  name: string;
  phone?: string | null;
  businessNumber?: string | null;
  type?: "INDIVIDUAL" | "BUSINESS";
}

const fmtDate = (iso: string | null) =>
  iso ? format(new Date(iso), "yyyy-MM-dd") : "-";
const fmtDateTime = (iso: string) => format(new Date(iso), "yyyy-MM-dd HH:mm");
const won = (n: number) => `₩${n.toLocaleString("ko-KR")}`;

export function SerialDetailClient({ code }: { code: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [printSize, setPrintSize] = useState<"small" | "standard" | "large">(
    "standard",
  );

  const detailQuery = useQuery({
    queryKey: queryKeys.serialItems.detail(code),
    queryFn: () => apiGet<SerialDetail>(`/api/serial-items/${encodeURIComponent(code)}`),
  });

  const regenMutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/serial-items/${encodeURIComponent(code)}/regenerate-token`, "POST"),
    onSuccess: () => {
      jmToast.success("새 토큰이 발급되었습니다. 라벨을 재출력하세요.");
      queryClient.invalidateQueries({ queryKey: queryKeys.serialItems.detail(code) });
    },
    onError: (e) =>
      jmToast.error(e instanceof ApiError ? e.message : "토큰 재발급 실패"),
  });

  const detail = detailQuery.data;

  if (detailQuery.isPending) {
    return (
      <SerialItemsThemeScope>
        <DetailSkeleton />
      </SerialItemsThemeScope>
    );
  }
  if (detailQuery.isError || !detail) {
    return (
      <SerialItemsThemeScope>
        <div className="flex min-h-full flex-col items-center justify-center gap-3 bg-[var(--jm-bg)] p-10">
          <p className="text-jm-base text-[var(--jm-text)]">
            시리얼을 찾을 수 없습니다
          </p>
          <JmButton variant="ghost" onClick={() => router.push("/serial-items")}>
            목록으로
          </JmButton>
        </div>
      </SerialItemsThemeScope>
    );
  }

  const deviceName = detail.device?.name ?? "기기 미상";
  const totalRepairCost = detail.repairs.reduce(
    (s, r) => s + (r.amount ?? 0),
    0,
  );
  const lastRepair = detail.repairs[0];

  return (
    <SerialItemsThemeScope>
      <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
        {/* 스티키 헤더 */}
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-6 py-3">
          <JmIconButton
            aria-label="뒤로"
            onClick={() => router.push("/serial-items")}
          >
            <ArrowLeft />
          </JmIconButton>
          <div className="flex items-center gap-2">
            <span className="font-[family-name:var(--jm-font-mono)] text-jm-base font-semibold text-[var(--jm-text)]">
              {detail.code}
            </span>
            <JmBadge variant="outline">
              {SERIAL_SOURCE_LABEL[detail.source] ?? detail.source}
            </JmBadge>
            <JmBadge
              variant={
                detail.status === "ACTIVE"
                  ? "success"
                  : detail.status === "SCRAPPED"
                    ? "danger"
                    : "default"
              }
            >
              {SERIAL_STATUS_LABEL[detail.status] ?? detail.status}
            </JmBadge>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {detail.accessToken && !detail.accessTokenRevokedAt && (
              <JmButton
                variant="ghost"
                size="sm"
                onClick={() => window.open(`/s/${detail.accessToken}`, "_blank")}
              >
                <ExternalLink className="size-4" />
                손님 페이지
              </JmButton>
            )}
            <JmButton
              variant="ghost"
              size="sm"
              onClick={() => regenMutation.mutate()}
              disabled={regenMutation.isPending}
            >
              <KeyRound className="size-4" />
              토큰 재발급
            </JmButton>
            <JmButton
              variant="ghost"
              size="sm"
              onClick={() => setPrintOpen(true)}
            >
              <Printer className="size-4" />
              라벨 재출력
            </JmButton>
            <JmButton variant="cta" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" />
              편집
            </JmButton>
          </div>
        </div>

        <JmContainer width="default" padded={false} className="space-y-6 p-6">
          {/* KPI */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <JmStat
              label="보증 잔여"
              value={
                detail.warranty.daysLeft == null
                  ? "—"
                  : detail.warranty.active
                    ? `${detail.warranty.daysLeft}일`
                    : "만료"
              }
              icon={<ShieldCheck className="size-4" />}
              hint={detail.warranty.ends ? fmtDate(detail.warranty.ends) : ""}
              size="sm"
            />
            <JmStat
              label="수리 이력"
              value={`${detail.repairs.length}건`}
              icon={<Wrench className="size-4" />}
              size="sm"
            />
            <JmStat
              label="마지막 수리"
              value={lastRepair ? fmtDate(lastRepair.receivedAt) : "—"}
              icon={<CalendarClock className="size-4" />}
              size="sm"
            />
            <JmStat
              label="총 수리 금액"
              value={won(totalRepairCost)}
              icon={<Coins className="size-4" />}
              size="sm"
            />
          </div>

          {/* 기기 + 손님 + 구매 */}
          <div className="grid gap-4 md:grid-cols-2">
            <InfoCard title="기기 정보">
              <Row label="제품명" value={deviceName} />
              {detail.device?.modelName && (
                <Row label="모델" value={detail.device.modelName} />
              )}
              <Row
                label="발급일"
                value={fmtDate(detail.soldAt)}
              />
              {detail.memo && <Row label="메모" value={detail.memo} />}
            </InfoCard>

            <InfoCard title="구매자">
              {detail.customer ? (
                <>
                  <Row label="이름" value={detail.customer.name} />
                  <Row label="연락처" value={detail.customer.phone} />
                  {detail.customer.address && (
                    <Row label="주소" value={detail.customer.address} />
                  )}
                  {detail.customer.email && (
                    <Row label="이메일" value={detail.customer.email} />
                  )}
                </>
              ) : (
                <p className="text-jm-sm text-[var(--jm-text-muted)]">
                  연결된 구매자가 없습니다. [편집]에서 손님을 연결하세요.
                </p>
              )}
            </InfoCard>
          </div>

          {/* 구매 정보 */}
          {detail.purchase && (
            <InfoCard title="구매 정보">
              <div className="grid gap-x-8 gap-y-2 md:grid-cols-2">
                <Row label="주문번호" value={detail.purchase.orderNo} mono />
                <Row label="구매일" value={fmtDate(detail.purchase.orderedAt)} />
                {detail.purchase.channel && (
                  <Row label="구매처" value={detail.purchase.channel} />
                )}
                {detail.purchase.amount != null && (
                  <Row label="결제금액" value={won(detail.purchase.amount)} />
                )}
              </div>
            </InfoCard>
          )}

          {/* 수리 이력 */}
          <InfoCard title={`수리 이력 (${detail.repairs.length}건)`}>
            {detail.repairs.length === 0 ? (
              <p className="text-jm-sm text-[var(--jm-text-muted)]">
                수리 이력이 없습니다.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {detail.repairs.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-[var(--jm-radius-md)] border border-[var(--jm-border)] p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-[family-name:var(--jm-font-mono)] text-jm-sm text-[var(--jm-text)]">
                        {r.ticketNo}
                      </span>
                      <JmBadge variant="outline">
                        {REPAIR_STATUS_LABEL[r.status] ?? r.status}
                      </JmBadge>
                    </div>
                    <div className="mt-1.5 flex flex-col gap-1 text-jm-sm">
                      <Row label="증상" value={r.symptom ?? "-"} />
                      {r.diagnosis && <Row label="진단" value={r.diagnosis} />}
                      <Row
                        label="기간"
                        value={`${fmtDate(r.receivedAt)}${r.completedAt ? ` → ${fmtDate(r.completedAt)}` : ""}`}
                      />
                      {r.amount != null && (
                        <Row label="금액" value={won(r.amount)} />
                      )}
                      {r.warrantyEnds && (
                        <Row
                          label="수리 보증"
                          value={`${fmtDate(r.warrantyEnds)} 까지`}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </InfoCard>

          {/* 접근 로그 */}
          <InfoCard title={`손님 페이지 접근 기록 (${detail.accessLogs.length})`}>
            {detail.accessLogs.length === 0 ? (
              <p className="text-jm-sm text-[var(--jm-text-muted)]">
                접근 기록이 없습니다.
              </p>
            ) : (
              <div className="flex flex-col">
                {detail.accessLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between border-b border-[var(--jm-border)] py-2 text-jm-sm last:border-b-0"
                  >
                    <span className="text-[var(--jm-text)]">
                      {ACCESS_STAGE_LABEL[log.stage]}
                      {log.failReason && (
                        <span className="ml-1.5 text-[var(--jm-danger-solid)]">
                          ({ACCESS_FAIL_LABEL[log.failReason]})
                        </span>
                      )}
                    </span>
                    <span className="text-[var(--jm-text-muted)]">
                      {fmtDateTime(log.accessedAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </InfoCard>
        </JmContainer>
      </div>

      {editOpen && (
        <EditDialog
          code={code}
          detail={detail}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            queryClient.invalidateQueries({
              queryKey: queryKeys.serialItems.detail(code),
            });
          }}
        />
      )}

      <JmDialog open={printOpen} onOpenChange={setPrintOpen}>
        <JmDialogContent className="flex h-[90vh] w-[95vw] max-w-[95vw] flex-col p-0">
          <JmDialogHeader>
            <JmDialogTitle>라벨 재출력</JmDialogTitle>
          </JmDialogHeader>
          <div className="flex gap-1.5 px-4 pb-3">
            {(["small", "standard", "large"] as const).map((sz) => (
              <JmButton
                key={sz}
                variant={printSize === sz ? "cta" : "outline"}
                size="xs"
                onClick={() => setPrintSize(sz)}
              >
                {sz === "small" ? "소형" : sz === "standard" ? "표준" : "대형"}
              </JmButton>
            ))}
          </div>
          <iframe
            key={printSize}
            src={`/serial-items/print?codes=${encodeURIComponent(detail.code)}&size=${printSize}`}
            className="size-full flex-1 border-0"
            title="라벨 재출력"
          />
        </JmDialogContent>
      </JmDialog>
    </SerialItemsThemeScope>
  );
}

// ─────────────────────────────────────────────
function InfoCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <JmCard>
      <JmCardContent className="flex flex-col gap-2.5 py-4">
        <span className="text-jm-sm font-semibold text-[var(--jm-text)]">
          {title}
        </span>
        {children}
      </JmCardContent>
    </JmCard>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 text-jm-sm">
      <span className="shrink-0 text-[var(--jm-text-muted)]">{label}</span>
      <span
        className={`text-right text-[var(--jm-text)] ${
          mono ? "font-[family-name:var(--jm-font-mono)]" : ""
        }`}
      >
        {value ?? "-"}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────
function EditDialog({
  code,
  detail,
  onClose,
  onSaved,
}: {
  code: string;
  detail: SerialDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [customerId, setCustomerId] = useState(detail.customer?.id ?? "");
  const [memo, setMemo] = useState(detail.memo ?? "");
  const [status, setStatus] = useState(detail.status);
  const [customerSearch] = useState("");

  const customersQuery = useQuery({
    queryKey: queryKeys.customers.list({ search: customerSearch }),
    queryFn: () =>
      apiGet<CustomerLite[]>(
        `/api/customers?search=${encodeURIComponent(customerSearch)}`,
      ),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/serial-items/${encodeURIComponent(code)}`, "PATCH", {
        customerId: customerId || null,
        memo: memo || null,
        status,
      }),
    onSuccess: () => {
      jmToast.success("저장되었습니다");
      onSaved();
    },
    onError: (e) =>
      jmToast.error(e instanceof ApiError ? e.message : "저장 실패"),
  });

  return (
    <JmDialog open onOpenChange={(o) => !o && onClose()}>
      <JmDialogContent className="w-[440px] max-w-[92vw]">
        <JmDialogHeader>
          <JmDialogTitle>시리얼 편집</JmDialogTitle>
        </JmDialogHeader>
        <JmDialogBody className="flex flex-col gap-4">
          <JmFormField label="구매자 (손님 이전)">
            <CustomerCombobox
              customers={customersQuery.data ?? []}
              value={customerId}
              onChange={(id) => setCustomerId(id)}
              onCreateNew={() => {}}
              placeholder="손님 검색·선택"
            />
          </JmFormField>
          <JmFormField label="상태">
            <JmSelect
              value={status}
              onChange={(v) => setStatus(v as SerialDetail["status"])}
              options={[
                { value: "ACTIVE", label: "활성" },
                { value: "RETURNED", label: "반품" },
                { value: "SCRAPPED", label: "폐기" },
              ]}
            />
          </JmFormField>
          <JmFormField label="메모">
            <JmTextarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={3}
              placeholder="내부 메모"
            />
          </JmFormField>
          {status !== "ACTIVE" && (
            <p className="text-jm-xs text-[var(--jm-warning-solid)]">
              활성이 아닌 시리얼은 손님 공개 페이지 접근이 차단됩니다.
            </p>
          )}
        </JmDialogBody>
        <JmDialogFooter>
          <JmButton variant="ghost" onClick={onClose}>
            취소
          </JmButton>
          <JmButton
            variant="cta"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "저장 중..." : "저장"}
          </JmButton>
        </JmDialogFooter>
      </JmDialogContent>
    </JmDialog>
  );
}

// ─────────────────────────────────────────────
function DetailSkeleton() {
  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="flex items-center gap-3 border-b border-[var(--jm-border)] px-6 py-3">
        <JmSkeleton className="size-8 rounded-md" />
        <JmSkeleton className="h-5 w-32" />
      </div>
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <JmSkeleton key={i} className="h-20 w-full rounded-[var(--jm-radius-lg)]" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <JmSkeleton className="h-40 w-full rounded-[var(--jm-radius-lg)]" />
          <JmSkeleton className="h-40 w-full rounded-[var(--jm-radius-lg)]" />
        </div>
        <JmSkeleton className="h-48 w-full rounded-[var(--jm-radius-lg)]" />
      </div>
    </div>
  );
}
