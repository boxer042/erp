"use client";

import { use, useState } from "react";
import { focusCaretEnd } from "@/jm/lib/focus";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  MapPin,
  Phone,
  Plus,
  QrCode,
  Trash2,
  User,
  Wrench,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import {
  JmBadge,
  JmButton,
  JmCard,
  JmCardContent,
  JmCardHeader,
  JmCardTitle,
  JmContainer,
  JmIconButton,
  JmInput,
  JmTextarea,
  JmSkeleton,
  JmSwitch,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogDescription,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
} from "@/jm";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";
import {
  cn,
  formatComma,
  parseComma,
  formatDiscountDisplay,
  normalizeDiscountInput,
} from "@/lib/utils";
import { calcRepairTotals } from "@/lib/repair";

// ──────── 타입 ────────

type RepairStatus =
  | "RECEIVED"
  | "DIAGNOSING"
  | "QUOTED"
  | "APPROVED"
  | "REPAIRING"
  | "READY"
  | "PICKED_UP"
  | "CANCELLED";

type RepairPartStatus = "USED" | "LOST";

interface RepairPart {
  id: string;
  productId: string;
  product: { id: string; name: string; sku: string };
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  discount: string;
  status: RepairPartStatus;
  consumedAt: string | null;
}

interface RepairLabor {
  id: string;
  name: string;
  hours: string;
  unitRate: string;
  totalPrice: string;
}

interface RepairTicketDetail {
  id: string;
  ticketNo: string;
  type: "ON_SITE" | "DROP_OFF";
  workKind: "REPAIR" | "CUSTOM_BUILD";
  status: RepairStatus;
  receivedAt: string;
  pickedUpAt: string | null;
  symptom: string | null;
  diagnosis: string | null;
  repairNotes: string | null;
  diagnosisFee: string;
  totalDiscount: string;
  finalAmount: string;
  repairWarrantyMonths: number | null;
  repairWarrantyEnds: string | null;
  // POS v2 가 미등록 손님 ticket 을 만들 수 있어 nullable. customer null + posSessionId 매핑.
  customer: { id: string; name: string; phone: string | null } | null;
  customerMachine: { id: string; name: string } | null;
  serialItem: {
    id: string;
    code: string;
    source: "SALE" | "REPAIR";
    displayName: string | null;
    product: { id: string; name: string; sku: string } | null;
  } | null;
  assignedTo: { id: string; name: string } | null;
  parentRepairTicket: {
    id: string;
    ticketNo: string;
    status: RepairStatus;
    repairWarrantyEnds: string | null;
  } | null;
  revisits: Array<{ id: string; ticketNo: string; status: RepairStatus; receivedAt: string }>;
  parts: RepairPart[];
  labors: RepairLabor[];
  // POS v2 추가 — 카테고리 + 취소 사유/메모
  repairCategory: { id: string; name: string } | null;
  cancelReason:
    | "CUSTOMER_DECLINED"
    | "CUSTOMER_NO_SHOW"
    | "SHOP_GAVE_UP"
    | "PARTS_UNAVAILABLE"
    | "SOLD_AS_PRODUCT"
    | "MISTAKE"
    | "OTHER"
    | null;
  cancelMemo: string | null;
  cancelledAt: string | null;
  quoteRejectReason:
    | "TOO_EXPENSIVE"
    | "NOT_WORTH_IT"
    | "WILL_SHOP_AROUND"
    | "CHANGED_MIND"
    | "PARTS_UNAVAILABLE"
    | "SHOP_DECLINED"
    | "OTHER"
    | null;
  quoteRejectMemo: string | null;
  quoteRejectedAt: string | null;
}

const STATUS_LABEL: Record<RepairStatus, string> = {
  RECEIVED: "접수",
  DIAGNOSING: "진단중",
  QUOTED: "견적대기",
  APPROVED: "승인",
  REPAIRING: "수리중",
  READY: "인계대기",
  PICKED_UP: "수리완료",
  CANCELLED: "취소",
};

const STATUS_VARIANT: Record<
  RepairStatus,
  "default" | "outline" | "solid" | "danger"
> = {
  RECEIVED: "default",
  DIAGNOSING: "default",
  QUOTED: "outline",
  APPROVED: "outline",
  REPAIRING: "solid",
  READY: "solid",
  PICKED_UP: "default",
  CANCELLED: "danger",
};

// USED 부속 + 공임 + 진단비 - 할인 (lib/repair.ts 의 calcRepairTotals 래퍼)
function calcRepairFinalTotal(ticket: RepairTicketDetail): number {
  return calcRepairTotals({
    parts: ticket.parts,
    labors: ticket.labors,
    diagnosisFee: ticket.diagnosisFee,
    totalDiscount: ticket.totalDiscount,
  }).finalTotal;
}

// 수리내역서 인쇄 다이얼로그 — 공급가액만 토글 포함
function RepairStatementDialog({
  open,
  onOpenChange,
  ticketId,
  ticketNo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string;
  ticketNo: string;
}) {
  const [supplyOnly, setSupplyOnly] = useState(false);
  const src = `/repairs/${ticketId}/print${supplyOnly ? "?supplyOnly=1" : ""}`;
  return (
    <JmDialog open={open} onOpenChange={onOpenChange}>
      <JmDialogContent className="flex h-[95vh] max-h-[95vh] w-[95vw] max-w-[95vw]! flex-col gap-0 p-0 sm:max-w-[95vw]!">
        <JmDialogHeader className="flex flex-row items-center justify-between gap-1 border-b border-[var(--jm-border)] p-4">
          <JmDialogTitle>수리내역서 — {ticketNo}</JmDialogTitle>
          <label className="mr-8 flex cursor-pointer items-center gap-2 text-jm-sm">
            <JmSwitch checked={supplyOnly} onCheckedChange={setSupplyOnly} />
            <span>공급가액만 (세액 제외)</span>
          </label>
        </JmDialogHeader>
        <iframe
          key={src}
          src={src}
          className="size-full flex-1 border-0"
          title="수리내역서"
        />
      </JmDialogContent>
    </JmDialog>
  );
}

// 상태 진행 버튼들 — 현재 상태에서 가능한 액션
function nextActions(status: RepairStatus, type: "ON_SITE" | "DROP_OFF") {
  const actions: { action: string; label: string; variant?: "cta" | "outline" | "danger" }[] = [];
  if (status === "RECEIVED") {
    if (type === "DROP_OFF") {
      actions.push({ action: "diagnose", label: "진단 시작" });
    }
    actions.push({ action: "start", label: "수리 시작" });
    actions.push({ action: "cancel", label: "취소", variant: "danger" });
  } else if (status === "DIAGNOSING") {
    actions.push({ action: "quote", label: "견적 확정" });
    actions.push({ action: "cancel", label: "취소", variant: "danger" });
  } else if (status === "QUOTED") {
    actions.push({ action: "approve", label: "고객 승인" });
    actions.push({
      action: "reject_after_quote",
      label: "고객 거절 — 진단비만 청구",
      variant: "outline",
    });
    actions.push({ action: "cancel", label: "거절", variant: "danger" });
  } else if (status === "APPROVED") {
    actions.push({ action: "start", label: "수리 시작" });
    actions.push({ action: "cancel", label: "취소", variant: "danger" });
  } else if (status === "REPAIRING") {
    actions.push({ action: "cancel", label: "취소", variant: "danger" });
    actions.push({ action: "ready", label: "수리 완료" });
  } else if (status === "READY") {
    // 인계대기: 작업·부속·공임이 모두 확정된 상태 — 취소 불가, 픽업/결제만 가능
    actions.push({ action: "pickup", label: "픽업 / 결제" });
  }
  return actions;
}

// ──────── 메인 페이지 ────────

export default function RepairDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [statementOpen, setStatementOpen] = useState(false);

  const ticketQuery = useQuery({
    queryKey: ["repairs", "detail", id],
    queryFn: () => apiGet<RepairTicketDetail>(`/api/repair-tickets/${id}`),
  });

  if (ticketQuery.isPending) {
    return (
      <div className="flex h-full flex-col gap-3 bg-[var(--jm-bg)] p-4 sm:p-6">
        <JmSkeleton className="h-8 w-64" />
        <JmSkeleton className="h-32 w-full" />
        <JmSkeleton className="h-64 w-full" />
      </div>
    );
  }
  if (ticketQuery.isError || !ticketQuery.data) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--jm-bg)] text-[var(--jm-text-muted)]">
        수리 티켓을 찾을 수 없습니다
      </div>
    );
  }

  const t = ticketQuery.data;
  const readonly = t.status === "PICKED_UP" || t.status === "CANCELLED";

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["repairs", "detail", id] });
    queryClient.invalidateQueries({ queryKey: ["repairs", "list"] });
  };

  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      {/* 상단 헤더 */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-6 py-3">
        <JmIconButton
          aria-label="목록"
          size="sm"
          onClick={() => router.push("/repairs")}
        >
          <ArrowLeft />
        </JmIconButton>
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <span className="font-mono text-jm-sm font-semibold">{t.ticketNo}</span>
          <JmBadge variant="outline" size="sm">
            {t.type === "ON_SITE" ? (
              <><MapPin className="size-3" /> 즉시</>
            ) : (
              <><Wrench className="size-3" /> 맡김</>
            )}
          </JmBadge>
          {t.workKind === "CUSTOM_BUILD" && (
            <JmBadge variant="solid" size="sm">
              리빌드
            </JmBadge>
          )}
          <JmBadge variant={STATUS_VARIANT[t.status]}>{STATUS_LABEL[t.status]}</JmBadge>
          {t.parentRepairTicket && (
            <JmBadge variant="default" size="sm">
              재수리 (← {t.parentRepairTicket.ticketNo})
            </JmBadge>
          )}
          <span className="text-jm-xs text-[var(--jm-text-muted)]">
            접수 {format(new Date(t.receivedAt), "yyyy-MM-dd HH:mm")}
          </span>
        </div>
        <JmButton
          variant="outline"
          size="xs"
          onClick={() => setStatementOpen(true)}
        >
          <FileText className="size-3.5" />
          내역서 출력
        </JmButton>
      </div>

      <JmContainer width="default" padded={false} className="p-4 sm:p-6">
        <div className="flex flex-col gap-4">
          <CustomerSection ticket={t} />
          <SymptomSection ticket={t} readonly={readonly} onSaved={invalidate} />
          {!readonly && <PackagesSection ticket={t} onChanged={invalidate} />}
          <PartsSection ticket={t} readonly={readonly} onChanged={invalidate} />
          <LaborsSection ticket={t} readonly={readonly} onChanged={invalidate} />
          <FeesAndTotalsSection ticket={t} readonly={readonly} onChanged={invalidate} />
          <StatusActionsSection ticket={t} onChanged={invalidate} />
        </div>
      </JmContainer>

      {/* 내역서 출력 모달 */}
      <RepairStatementDialog
        open={statementOpen}
        onOpenChange={setStatementOpen}
        ticketId={t.id}
        ticketNo={t.ticketNo}
      />
    </div>
  );
}

// ──────── 고객 / 기기 정보 ────────

function CustomerSection({ ticket }: { ticket: RepairTicketDetail }) {
  return (
    <JmCard>
      <JmCardHeader className="border-b-0 pb-3">
        <JmCardTitle className="text-jm-sm">고객 / 기기</JmCardTitle>
      </JmCardHeader>
      <JmCardContent className="grid grid-cols-1 gap-3 pt-0 text-jm-sm md:grid-cols-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-jm-xs text-[var(--jm-text-muted)]">고객</span>
          {ticket.customer ? (
            <>
              <span className="flex items-center gap-1 font-medium">
                <User className="size-3.5 text-[var(--jm-text-muted)]" />
                {ticket.customer.name}
              </span>
              {ticket.customer.phone && (
                <span className="flex items-center gap-1 text-jm-xs text-[var(--jm-text-muted)]">
                  <Phone className="size-3" />
                  {ticket.customer.phone}
                </span>
              )}
            </>
          ) : (
            <span className="flex items-center gap-1 text-[var(--jm-text-muted)]">
              <User className="size-3.5" /> 미등록
            </span>
          )}
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-jm-xs text-[var(--jm-text-muted)]">카테고리</span>
          <span className="font-medium">
            {ticket.repairCategory?.name ?? (
              <span className="text-[var(--jm-text-muted)]">기타</span>
            )}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-jm-xs text-[var(--jm-text-muted)]">기기 / 시리얼</span>
          {ticket.serialItem ? (
            <>
              <span className="flex items-center gap-1 font-medium">
                <QrCode className="size-3.5 text-[var(--jm-text-muted)]" />
                <span className="font-mono">{ticket.serialItem.code}</span>
              </span>
              <span className="text-jm-xs text-[var(--jm-text-muted)]">
                {ticket.serialItem.product?.name ?? ticket.serialItem.displayName ?? "(미상)"}
              </span>
            </>
          ) : ticket.customerMachine ? (
            <span className="font-medium">{ticket.customerMachine.name}</span>
          ) : (
            <span className="text-[var(--jm-text-muted)]">-</span>
          )}
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-jm-xs text-[var(--jm-text-muted)]">담당</span>
          <span className="font-medium">
            {ticket.assignedTo?.name ?? <span className="text-[var(--jm-text-muted)]">미지정</span>}
          </span>
          {ticket.repairWarrantyEnds && (
            <span className="text-jm-xs text-[var(--jm-text-muted)]">
              수리 보증 ~{format(new Date(ticket.repairWarrantyEnds), "yyyy-MM-dd")}
            </span>
          )}
        </div>
      </JmCardContent>
      {/* 취소 정보 — CANCELLED 상태일 때만 */}
      {ticket.status === "CANCELLED" && (ticket.cancelReason || ticket.cancelMemo) && (
        <JmCardContent className="border-t border-[var(--jm-border)] pt-3">
          <div className="flex items-start gap-2 rounded-md bg-[var(--jm-surface-muted)] px-3 py-2 text-jm-xs">
            <XCircle className="size-3.5 shrink-0 text-[var(--jm-danger-solid)]" />
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold">취소 사유</span>
              <span className="text-[var(--jm-text-muted)]">
                {ticket.cancelReason ? cancelReasonLabel(ticket.cancelReason) : null}
                {ticket.cancelReason && ticket.cancelMemo ? " — " : null}
                {ticket.cancelMemo}
                {ticket.cancelledAt && (
                  <span className="ml-2 font-mono text-jm-3xs">
                    {format(new Date(ticket.cancelledAt), "yyyy-MM-dd HH:mm")}
                  </span>
                )}
              </span>
            </div>
          </div>
        </JmCardContent>
      )}
      {/* 거절 정보 — quoteRejectReason 있으면 (READY 직행 or PICKED_UP 후 진단비만 청구된 케이스) */}
      {ticket.quoteRejectReason && (
        <JmCardContent className="border-t border-[var(--jm-border)] pt-3">
          <div className="flex items-start gap-2 rounded-md bg-[var(--jm-warning-bg)] px-3 py-2 text-jm-xs">
            <XCircle className="size-3.5 shrink-0 text-[var(--jm-warning-fg)]" />
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-[var(--jm-warning-fg)]">거절 · 진단비만 청구</span>
              <span className="text-[var(--jm-warning-fg)]">
                {quoteRejectReasonLabel(ticket.quoteRejectReason)}
                {ticket.quoteRejectMemo ? ` — ${ticket.quoteRejectMemo}` : null}
                {ticket.quoteRejectedAt && (
                  <span className="ml-2 font-mono text-jm-3xs opacity-70">
                    {format(new Date(ticket.quoteRejectedAt), "yyyy-MM-dd HH:mm")}
                  </span>
                )}
              </span>
            </div>
          </div>
        </JmCardContent>
      )}
    </JmCard>
  );
}

function cancelReasonLabel(reason: string): string {
  const map: Record<string, string> = {
    CUSTOMER_DECLINED: "손님 거절",
    CUSTOMER_NO_SHOW: "손님 미반환",
    SHOP_GAVE_UP: "매장 포기",
    PARTS_UNAVAILABLE: "부속 수급 불가",
    SOLD_AS_PRODUCT: "상품 구매로 전환",
    MISTAKE: "잘못 생성",
    OTHER: "기타",
  };
  return map[reason] ?? reason;
}

// 진단비만 청구 거절 사유 — POS RejectSheet 와 enum 동기화.
type QuoteRejectReasonValue =
  | "TOO_EXPENSIVE"
  | "NOT_WORTH_IT"
  | "WILL_SHOP_AROUND"
  | "CHANGED_MIND"
  | "PARTS_UNAVAILABLE"
  | "SHOP_DECLINED"
  | "OTHER";

const QUOTE_REJECT_REASONS: {
  value: QuoteRejectReasonValue;
  label: string;
  group: "customer" | "shop" | "other";
}[] = [
  { value: "TOO_EXPENSIVE", label: "가격 부담", group: "customer" },
  { value: "NOT_WORTH_IT", label: "가성비 문제 (새 제품이 나음)", group: "customer" },
  { value: "WILL_SHOP_AROUND", label: "다른 매장 비교", group: "customer" },
  { value: "CHANGED_MIND", label: "단순 변심", group: "customer" },
  { value: "PARTS_UNAVAILABLE", label: "부속 수급 불가", group: "shop" },
  { value: "SHOP_DECLINED", label: "매장 포기 (장비·시간·복잡도)", group: "shop" },
  { value: "OTHER", label: "기타", group: "other" },
];

function quoteRejectReasonLabel(reason: string): string {
  return QUOTE_REJECT_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

// ──────── 증상 / 진단 / 수리메모 ────────

function SymptomSection({
  ticket,
  readonly,
  onSaved,
}: {
  ticket: RepairTicketDetail;
  readonly: boolean;
  onSaved: () => void;
}) {
  const [symptom, setSymptom] = useState(ticket.symptom ?? "");
  const [diagnosis, setDiagnosis] = useState(ticket.diagnosis ?? "");
  const [repairNotes, setRepairNotes] = useState(ticket.repairNotes ?? "");

  const dirty =
    symptom !== (ticket.symptom ?? "") ||
    diagnosis !== (ticket.diagnosis ?? "") ||
    repairNotes !== (ticket.repairNotes ?? "");

  const saveMutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/repair-tickets/${ticket.id}`, "PUT", {
        symptom,
        diagnosis,
        repairNotes,
      }),
    onSuccess: () => {
      toast.success("저장되었습니다");
      onSaved();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  return (
    <JmCard>
      <JmCardHeader className="border-b-0 pb-3">
        <JmCardTitle className="text-jm-sm">증상 · 진단 · 메모</JmCardTitle>
      </JmCardHeader>
      <JmCardContent className="flex flex-col gap-3 pt-0">
        <div className="flex flex-col gap-1">
          <label className="text-jm-xs text-[var(--jm-text-muted)]">증상 (고객 호소)</label>
          <JmTextarea
            value={symptom}
            onChange={(e) => setSymptom(e.target.value)}
            disabled={readonly}
            className="min-h-[60px] resize-none text-jm-sm"
            placeholder="예: 누수 발생, 호스 연결부 새는 듯"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-jm-xs text-[var(--jm-text-muted)]">진단 (직원 확인)</label>
          <JmTextarea
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            disabled={readonly}
            className="min-h-[60px] resize-none text-jm-sm"
            placeholder="예: 체크밸브 마모 확인"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-jm-xs text-[var(--jm-text-muted)]">수리 메모 (내부)</label>
          <JmTextarea
            value={repairNotes}
            onChange={(e) => setRepairNotes(e.target.value)}
            disabled={readonly}
            className="min-h-[60px] resize-none text-jm-sm"
          />
        </div>
        {!readonly && dirty && (
          <div className="flex justify-end">
            <JmButton
              size="xs"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              저장
            </JmButton>
          </div>
        )}
      </JmCardContent>
    </JmCard>
  );
}

// ──────── 패키지 빠른 추가 ────────

interface RepairPackageRow {
  id: string;
  name: string;
  description: string | null;
  parts: Array<{ id: string; quantity: string; unitPrice: string }>;
  labors: Array<{ id: string; name: string; unitRate: string }>;
}

function PackagesSection({
  ticket,
  onChanged,
}: {
  ticket: RepairTicketDetail;
  onChanged: () => void;
}) {
  const packagesQuery = useQuery({
    queryKey: ["repairs", "packages"],
    queryFn: () => apiGet<RepairPackageRow[]>("/api/repair-packages"),
  });

  const applyMutation = useMutation({
    mutationFn: (packageId: string) =>
      apiMutate(`/api/repair-tickets/${ticket.id}/apply-package`, "POST", {
        packageId,
      }),
    onSuccess: (_, packageId) => {
      const pkg = packagesQuery.data?.find((p) => p.id === packageId);
      toast.success(`${pkg?.name ?? "패키지"} 적용됨`);
      onChanged();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "패키지 적용 실패"),
  });

  const packages = packagesQuery.data ?? [];
  if (packagesQuery.isPending) {
    return (
      <JmCard>
        <JmCardContent className="flex items-center gap-2 py-3">
          <JmSkeleton className="h-7 w-32 rounded-full" />
          <JmSkeleton className="h-7 w-28 rounded-full" />
          <JmSkeleton className="h-7 w-36 rounded-full" />
        </JmCardContent>
      </JmCard>
    );
  }
  if (packages.length === 0) return null;

  return (
    <JmCard>
      <JmCardHeader className="border-b-0 pb-2">
        <JmCardTitle className="text-jm-sm">패키지 빠른 추가</JmCardTitle>
      </JmCardHeader>
      <JmCardContent className="flex flex-wrap gap-1.5 pt-0">
        {packages.map((p) => {
          const partsCount = p.parts.length;
          const laborsCount = p.labors.length;
          return (
            <button
              key={p.id}
              type="button"
              disabled={applyMutation.isPending}
              onClick={() => applyMutation.mutate(p.id)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 py-1 text-jm-xs",
                "transition-colors hover:border-[var(--jm-accent-solid)] hover:bg-[var(--jm-accent-bg)]",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <Plus className="size-3" />
              <span className="font-medium">{p.name}</span>
              <span className="text-[var(--jm-text-muted)]">
                ({partsCount > 0 && `부속 ${partsCount}`}
                {partsCount > 0 && laborsCount > 0 && " · "}
                {laborsCount > 0 && `공임 ${laborsCount}`})
              </span>
            </button>
          );
        })}
      </JmCardContent>
    </JmCard>
  );
}

// ──────── 부속 ────────

function PartsSection({
  ticket,
  readonly,
  onChanged,
}: {
  ticket: RepairTicketDetail;
  readonly: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);

  // 부속 검색용 상품 리스트 (전체 가져옴)
  const productsQuery = useQuery({
    queryKey: ["repairs", "products"],
    queryFn: () =>
      apiGet<ProductOption[]>("/api/products?isBulk=all&excludeVariants=true"),
    enabled: adding,
  });

  const addMutation = useMutation({
    mutationFn: (p: ProductOption) =>
      apiMutate(`/api/repair-tickets/${ticket.id}/parts`, "POST", {
        productId: p.id,
        quantity: 1,
        unitPrice: parseFloat(p.sellingPrice) || 0,
      }),
    onSuccess: (_, p) => {
      toast.success(`${p.name} 추가됨`);
      onChanged();
      setAdding(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "추가 실패"),
  });

  const usedTotal = ticket.parts
    .filter((p) => p.status === "USED")
    .reduce((s, p) => s + Number(p.totalPrice), 0);
  const lostTotal = ticket.parts
    .filter((p) => p.status === "LOST")
    .reduce((s, p) => s + Number(p.totalPrice), 0);

  return (
    <JmCard>
      <JmCardHeader className="flex flex-row items-center justify-between border-b-0 pb-3">
        <JmCardTitle className="text-jm-sm">사용 부속</JmCardTitle>
        {!readonly && (
          <JmButton
            size="xs"
            variant="outline"
            onClick={() => setAdding((v) => !v)}
          >
            <Plus className="size-3.5" />
            부속 검색/추가
          </JmButton>
        )}
      </JmCardHeader>
      <JmCardContent className="flex flex-col gap-3 p-0">
        {adding && (
          <div className="px-6">
            <ProductCombobox
              products={productsQuery.data ?? []}
              value=""
              onChange={(p) => {
                if (p?.id) addMutation.mutate(p);
              }}
              filterType="component"
              placeholder="상품명 또는 SKU 검색..."
            />
          </div>
        )}

        <div className="border-y border-[var(--jm-border)]">
          <JmTable>
            <JmTableHeader>
              <JmTableRow>
                <JmTableHead className="pl-6">부속명</JmTableHead>
                <JmTableHead className="w-32">수량</JmTableHead>
                <JmTableHead className="w-28 text-right">단가</JmTableHead>
                <JmTableHead className="w-28 text-right">소계</JmTableHead>
                <JmTableHead className="w-24">상태</JmTableHead>
                <JmTableHead className="w-12 pr-6"></JmTableHead>
              </JmTableRow>
            </JmTableHeader>
            <JmTableBody>
              {ticket.parts.length === 0 ? (
                <JmTableRow>
                  <JmTableCell colSpan={6} className="py-6 text-center text-[var(--jm-text-muted)]">
                    추가된 부속이 없습니다
                  </JmTableCell>
                </JmTableRow>
              ) : (
                ticket.parts.map((p) => (
                  <PartRow
                    key={p.id}
                    ticketId={ticket.id}
                    part={p}
                    readonly={readonly}
                    onChanged={onChanged}
                  />
                ))
              )}
            </JmTableBody>
          </JmTable>
        </div>

        <div className="flex justify-end gap-4 px-6 pb-2 text-jm-sm">
          {lostTotal > 0 && (
            <span className="text-[var(--jm-danger-fg)]">
              손실 ₩{lostTotal.toLocaleString("ko-KR")}
            </span>
          )}
          <span>
            <span className="text-[var(--jm-text-muted)]">청구 부속</span>{" "}
            <span className="font-semibold tabular-nums">
              ₩{usedTotal.toLocaleString("ko-KR")}
            </span>
          </span>
        </div>
      </JmCardContent>
    </JmCard>
  );
}

function PartRow({
  ticketId,
  part,
  readonly,
  onChanged,
}: {
  ticketId: string;
  part: RepairPart;
  readonly: boolean;
  onChanged: () => void;
}) {
  const [qty, setQty] = useState(String(part.quantity));

  const updateMutation = useMutation({
    mutationFn: (data: Partial<{ quantity: number; status: RepairPartStatus }>) =>
      apiMutate(`/api/repair-tickets/${ticketId}/parts/${part.id}`, "PATCH", data),
    onSuccess: () => {
      onChanged();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "수정 실패"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiMutate(`/api/repair-tickets/${ticketId}/parts/${part.id}`, "DELETE"),
    onSuccess: () => {
      toast.success("삭제되었습니다");
      onChanged();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "삭제 실패"),
  });

  const isLost = part.status === "LOST";

  return (
    <JmTableRow className={cn(isLost && "opacity-70")}>
      <JmTableCell className="pl-6">
        <div className="flex flex-col">
          <span className={cn("text-jm-sm", isLost && "line-through")}>
            {part.product.name}
          </span>
          <span className="text-jm-xs text-[var(--jm-text-muted)]">{part.product.sku}</span>
        </div>
      </JmTableCell>
      <JmTableCell>
        <div className="flex items-center gap-1">
          <JmButton
            variant="ghost"
            className="size-7 rounded-lg p-0"
            disabled={readonly || updateMutation.isPending || Number(qty) <= 1}
            onClick={() => {
              const next = Math.max(1, Number(qty) - 1);
              setQty(String(next));
              updateMutation.mutate({ quantity: next });
            }}
          >
            −
          </JmButton>
          <JmInput
            type="text"
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
            onBlur={() => {
              const n = Math.max(1, parseInt(qty, 10) || 1);
              setQty(String(n));
              if (n !== Number(part.quantity)) updateMutation.mutate({ quantity: n });
            }}
            disabled={readonly}
            className="h-7 w-12 rounded-lg px-0 text-center text-jm-sm tabular-nums"
          />
          <JmButton
            variant="ghost"
            className="size-7 rounded-lg p-0"
            disabled={readonly || updateMutation.isPending}
            onClick={() => {
              const next = Number(qty) + 1;
              setQty(String(next));
              updateMutation.mutate({ quantity: next });
            }}
          >
            +
          </JmButton>
        </div>
      </JmTableCell>
      <JmTableCell className="text-right tabular-nums">
        ₩{Number(part.unitPrice).toLocaleString("ko-KR")}
      </JmTableCell>
      <JmTableCell className="text-right tabular-nums">
        ₩{Number(part.totalPrice).toLocaleString("ko-KR")}
      </JmTableCell>
      <JmTableCell>
        <button
          type="button"
          disabled={readonly}
          onClick={() =>
            updateMutation.mutate({ status: isLost ? "USED" : "LOST" })
          }
          className={cn(
            "inline-flex h-6 items-center rounded px-2 text-jm-2xs font-medium transition-colors",
            isLost
              ? "bg-[var(--jm-danger-bg)] text-[var(--jm-danger-fg)]"
              : "bg-[var(--jm-surface-muted)] text-[var(--jm-text)]",
            readonly && "cursor-not-allowed opacity-50",
          )}
        >
          {isLost ? "LOST" : "USED"}
        </button>
      </JmTableCell>
      <JmTableCell className="pr-6 text-right">
        {!readonly && (
          <JmIconButton
            aria-label="삭제"
            variant="ghost"
            size="sm"
            className="size-7 hover:text-[var(--jm-danger-fg)]"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="size-3.5" />
          </JmIconButton>
        )}
      </JmTableCell>
    </JmTableRow>
  );
}

// ──────── 공임 ────────

function LaborsSection({
  ticket,
  readonly,
  onChanged,
}: {
  ticket: RepairTicketDetail;
  readonly: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");

  const addMutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/repair-tickets/${ticket.id}/labors`, "POST", {
        name,
        hours: 1,
        unitRate: parseInt(rate, 10) || 0,
      }),
    onSuccess: () => {
      toast.success("공임 추가됨");
      setName("");
      setRate("");
      setAdding(false);
      onChanged();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "추가 실패"),
  });

  const deleteMutation = useMutation({
    mutationFn: (laborId: string) =>
      apiMutate(`/api/repair-tickets/${ticket.id}/labors/${laborId}`, "DELETE"),
    onSuccess: () => onChanged(),
  });

  const total = ticket.labors.reduce((s, l) => s + Number(l.totalPrice), 0);

  return (
    <JmCard>
      <JmCardHeader className="flex flex-row items-center justify-between border-b-0 pb-3">
        <JmCardTitle className="text-jm-sm">공임</JmCardTitle>
        {!readonly && (
          <JmButton size="xs" variant="outline" onClick={() => setAdding(!adding)}>
            <Plus className="size-3.5" />
            공임 추가
          </JmButton>
        )}
      </JmCardHeader>
      <JmCardContent className="flex flex-col gap-2 p-0">
        {adding && (
          <div className="flex items-center gap-2 px-6">
            <JmInput
              size="sm"
              placeholder="공임명 (예: 분해/조립)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1"
            />
            <JmInput
              size="sm"
              placeholder="금액"
              inputMode="numeric"
              value={formatComma(rate)}
              onChange={(e) => setRate(parseComma(e.target.value))}
              className="w-32 text-right tabular-nums"
            />
            <JmButton
              size="sm"
              onClick={() => addMutation.mutate()}
              disabled={!name.trim() || !rate || addMutation.isPending}
            >
              추가
            </JmButton>
          </div>
        )}

        <div className="border-y border-[var(--jm-border)]">
          <JmTable>
            <JmTableBody>
              {ticket.labors.length === 0 ? (
                <JmTableRow>
                  <JmTableCell colSpan={3} className="py-4 text-center text-jm-sm text-[var(--jm-text-muted)]">
                    추가된 공임이 없습니다
                  </JmTableCell>
                </JmTableRow>
              ) : (
                ticket.labors.map((l) => (
                  <JmTableRow key={l.id}>
                    <JmTableCell className="pl-6">{l.name}</JmTableCell>
                    <JmTableCell className="text-right tabular-nums">
                      ₩{Number(l.totalPrice).toLocaleString("ko-KR")}
                    </JmTableCell>
                    <JmTableCell className="w-12 pr-6 text-right">
                      {!readonly && (
                        <JmIconButton
                          aria-label="삭제"
                          variant="ghost"
                          size="sm"
                          className="size-7 hover:text-[var(--jm-danger-fg)]"
                          onClick={() => deleteMutation.mutate(l.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </JmIconButton>
                      )}
                    </JmTableCell>
                  </JmTableRow>
                ))
              )}
            </JmTableBody>
          </JmTable>
        </div>

        <div className="flex justify-end px-6 pb-2 text-jm-sm">
          <span>
            <span className="text-[var(--jm-text-muted)]">공임 합계</span>{" "}
            <span className="font-semibold tabular-nums">
              ₩{total.toLocaleString("ko-KR")}
            </span>
          </span>
        </div>
      </JmCardContent>
    </JmCard>
  );
}

// ──────── 진단비 / 할인 / 합계 ────────

function FeesAndTotalsSection({
  ticket,
  readonly,
  onChanged,
}: {
  ticket: RepairTicketDetail;
  readonly: boolean;
  onChanged: () => void;
}) {
  const [diagnosisFee, setDiagnosisFee] = useState(String(ticket.diagnosisFee || ""));
  const [totalDiscount, setTotalDiscount] = useState(ticket.totalDiscount || "0");

  const dirty =
    diagnosisFee !== String(ticket.diagnosisFee || "") ||
    totalDiscount !== (ticket.totalDiscount || "0");

  const saveMutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/repair-tickets/${ticket.id}`, "PUT", {
        diagnosisFee: parseInt(diagnosisFee, 10) || 0,
        totalDiscount,
      }),
    onSuccess: () => {
      toast.success("저장되었습니다");
      onChanged();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  // 합계 계산 — lib/repair.ts 의 calcRepairTotals 사용 (서버 pickup 과 동일 로직)
  const totals = calcRepairTotals({
    parts: ticket.parts,
    labors: ticket.labors,
    diagnosisFee: parseInt(diagnosisFee, 10) || 0,
    totalDiscount,
  });
  const { usedPartsTotal: usedParts, laborTotal: labors, diagnosisFee: fee, discountAmount, finalTotal } = totals;

  return (
    <JmCard>
      <JmCardHeader className="border-b-0 pb-3">
        <JmCardTitle className="text-jm-sm">진단비 · 할인 · 합계</JmCardTitle>
      </JmCardHeader>
      <JmCardContent className="flex flex-col gap-3 pt-0">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-jm-xs text-[var(--jm-text-muted)]">
              진단비 (수리 거절 시에도 청구)
            </label>
            <JmInput
              size="sm"
              inputMode="numeric"
              value={formatComma(diagnosisFee)}
              onChange={(e) => setDiagnosisFee(parseComma(e.target.value))}
              disabled={readonly}
              className="text-right tabular-nums"
              placeholder="0"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-jm-xs text-[var(--jm-text-muted)]">
              전체 할인 (정액 또는 비율 — 예: 5000 / 10%)
            </label>
            <JmInput
              size="sm"
              inputMode={totalDiscount.trim().endsWith("%") ? "decimal" : "numeric"}
              value={formatDiscountDisplay(totalDiscount)}
              onChange={(e) => setTotalDiscount(normalizeDiscountInput(e.target.value))}
              onFocus={focusCaretEnd}
              disabled={readonly}
              className="text-right tabular-nums"
              placeholder="0"
            />
          </div>
        </div>

        <div className="rounded-lg bg-[var(--jm-surface-muted)] p-3 text-jm-sm">
          <Row label="청구 부속" value={usedParts} />
          <Row label="공임" value={labors} />
          {fee > 0 && <Row label="진단비" value={fee} />}
          {discountAmount > 0 && (
            <Row label="할인" value={-discountAmount} className="text-[var(--jm-danger-fg)]" />
          )}
          <div className="my-1 border-t border-[var(--jm-border)]" />
          <div className="flex items-baseline justify-between">
            <span className="text-jm-lg font-semibold">최종 청구</span>
            <span className="text-jm-2xl font-bold tabular-nums">
              ₩{finalTotal.toLocaleString("ko-KR")}
            </span>
          </div>
        </div>

        {!readonly && dirty && (
          <div className="flex justify-end">
            <JmButton size="xs" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              저장
            </JmButton>
          </div>
        )}
      </JmCardContent>
    </JmCard>
  );
}

function Row({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between", className)}>
      <span className="text-[var(--jm-text-muted)]">{label}</span>
      <span className="tabular-nums">₩{value.toLocaleString("ko-KR")}</span>
    </div>
  );
}

// ──────── 상태 진행 액션 ────────

type PaymentMethod = "CASH" | "CASH_RECEIPT" | "CARD" | "TRANSFER" | "UNPAID";
const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  CASH: "현금",
  CASH_RECEIPT: "현금영수증",
  CARD: "카드",
  TRANSFER: "계좌",
  UNPAID: "외상",
};

function StatusActionsSection({
  ticket,
  onChanged,
}: {
  ticket: RepairTicketDetail;
  onChanged: () => void;
}) {
  const actions = nextActions(ticket.status, ticket.type);
  const [pickupOpen, setPickupOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState<QuoteRejectReasonValue>("TOO_EXPENSIVE");
  const [rejectMemo, setRejectMemo] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CARD");

  const transitionMutation = useMutation({
    mutationFn: (vars: { action: string; payload?: Record<string, unknown> }) =>
      apiMutate(`/api/repair-tickets/${ticket.id}/transition`, "POST", {
        action: vars.action,
        ...(vars.payload ?? {}),
      }),
    onSuccess: (_, vars) => {
      const labels: Record<string, string> = {
        diagnose: "진단 시작",
        quote: "견적 확정",
        approve: "승인 완료",
        start: "수리 시작",
        ready: "수리 완료",
        pickup: "픽업/결제 완료",
        cancel: "취소 처리됨",
        reject_after_quote: "진단비만 청구로 진행합니다",
      };
      toast.success(labels[vars.action] ?? "처리되었습니다");
      setPickupOpen(false);
      setRejectOpen(false);
      setRejectMemo("");
      onChanged();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "처리 실패"),
  });

  const finalAmount = calcRepairFinalTotal(ticket);

  if (actions.length === 0) {
    return (
      <JmCard>
        <JmCardContent className="flex items-center gap-2 py-4 text-jm-sm text-[var(--jm-text-muted)]">
          {ticket.status === "PICKED_UP" ? (
            <>
              <CheckCircle2 className="size-4" /> 수리 완료 — 픽업/결제 완료 (
              ₩{Number(ticket.finalAmount).toLocaleString("ko-KR")})
            </>
          ) : (
            <>
              <XCircle className="size-4" /> 취소된 수리
            </>
          )}
        </JmCardContent>
      </JmCard>
    );
  }

  return (
    <>
      <JmCard>
        <JmCardHeader className="border-b-0 pb-3">
          <JmCardTitle className="text-jm-sm">상태 진행</JmCardTitle>
        </JmCardHeader>
        <JmCardContent className="flex flex-wrap gap-2 pt-0">
          {actions.map((a) => (
            <JmButton
              key={a.action}
              variant={a.variant ?? "cta"}
              size="sm"
              disabled={transitionMutation.isPending}
              onClick={() => {
                if (a.action === "pickup") {
                  setPickupOpen(true);
                  return;
                }
                if (a.action === "reject_after_quote") {
                  setRejectOpen(true);
                  return;
                }
                if (
                  a.action === "cancel" &&
                  !confirm("정말 취소하시겠습니까? 부속은 재고로 복원됩니다.")
                ) {
                  return;
                }
                transitionMutation.mutate({ action: a.action });
              }}
            >
              {a.label}
            </JmButton>
          ))}
        </JmCardContent>
      </JmCard>

      {/* 픽업/결제 다이얼로그 */}
      <JmDialog open={pickupOpen} onOpenChange={setPickupOpen}>
        <JmDialogContent size="md">
          <JmDialogHeader>
            <JmDialogTitle>픽업 / 결제</JmDialogTitle>
            <JmDialogDescription>
              결제수단을 선택하면 수리가 완료 처리되고 보증 만료일이 설정됩니다.
            </JmDialogDescription>
          </JmDialogHeader>

          <JmDialogBody className="flex flex-col gap-4">
            <div className="rounded-lg bg-[var(--jm-surface-muted)] p-4 text-center">
              <div className="text-jm-xs text-[var(--jm-text-muted)]">최종 청구 금액</div>
              <div className="mt-1 text-jm-4xl font-bold tabular-nums">
                ₩{finalAmount.toLocaleString("ko-KR")}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {(["CASH", "CARD", "TRANSFER", "UNPAID"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={cn(
                    "flex h-12 items-center justify-center rounded-md border text-jm-sm font-medium transition-colors",
                    paymentMethod === m
                      ? "border-[var(--jm-action)] bg-[var(--jm-action)] text-[var(--jm-action-fg)]"
                      : "border-[var(--jm-border)] bg-[var(--jm-bg)] text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface-muted)]",
                  )}
                >
                  {PAYMENT_LABEL[m]}
                </button>
              ))}
            </div>

            {ticket.repairWarrantyMonths != null && ticket.repairWarrantyMonths > 0 && (
              <div className="text-jm-xs text-[var(--jm-text-muted)]">
                ✓ 수리 보증 {ticket.repairWarrantyMonths}개월 자동 적용
              </div>
            )}
          </JmDialogBody>

          <JmDialogFooter>
            <JmButton
              variant="outline"
              onClick={() => setPickupOpen(false)}
              disabled={transitionMutation.isPending}
            >
              취소
            </JmButton>
            <JmButton
              onClick={() =>
                transitionMutation.mutate({
                  action: "pickup",
                  payload: { paymentMethod, finalAmount },
                })
              }
              disabled={transitionMutation.isPending}
            >
              {transitionMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              결제 완료
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>

      {/* 진단비만 청구 (손님 거절 / 매장 포기) 다이얼로그 */}
      <JmDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <JmDialogContent size="md">
          <JmDialogHeader>
            <JmDialogTitle>진단비만 청구</JmDialogTitle>
            <JmDialogDescription>
              부속/공임 없이 진단비만 청구하고 인계대기로 이동합니다. 픽업/결제 흐름은 그대로.
            </JmDialogDescription>
          </JmDialogHeader>

          <JmDialogBody className="flex flex-col gap-4">
            <div className="rounded-lg bg-[var(--jm-surface-muted)] px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-jm-xs font-medium text-[var(--jm-text-muted)]">청구 예정 진단비 (VAT 포함)</span>
                <span className="tabular-nums text-jm-lg font-bold">
                  ₩{Math.round(Number(ticket.diagnosisFee) * 1.1).toLocaleString("ko-KR")}
                </span>
              </div>
              {Number(ticket.diagnosisFee) === 0 && (
                <p className="mt-1 text-jm-xs text-[var(--jm-warning-fg)]">
                  ⚠ 진단비가 0 으로 설정되어 있습니다. 위 진단비 카드에서 금액을 먼저 입력하세요.
                </p>
              )}
            </div>

            {(["customer", "shop", "other"] as const).map((g) => (
              <div key={g} className="flex flex-col gap-1.5">
                <span className="text-jm-xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
                  {g === "customer" ? "손님 사유" : g === "shop" ? "매장 사유" : "기타"}
                </span>
                <div className="flex flex-col gap-1.5">
                  {QUOTE_REJECT_REASONS.filter((r) => r.group === g).map((r) => {
                    const active = rejectReason === r.value;
                    return (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setRejectReason(r.value)}
                        className={cn(
                          "flex items-center gap-2 rounded-md border-2 px-3 py-2 text-left text-jm-sm transition-colors",
                          active
                            ? "border-[var(--jm-accent-solid)] bg-[var(--jm-accent-bg)]"
                            : "border-[var(--jm-border)] hover:border-[var(--jm-border-strong)]",
                        )}
                      >
                        <span className="font-medium">{r.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="flex flex-col gap-1.5">
              <span className="text-jm-xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
                메모 {rejectReason === "OTHER" && <span className="text-[var(--jm-danger-fg)]">(필수)</span>}
              </span>
              <JmTextarea
                value={rejectMemo}
                onChange={(e) => setRejectMemo(e.target.value)}
                placeholder="추가 설명 (선택)"
                rows={2}
              />
            </div>
          </JmDialogBody>

          <JmDialogFooter>
            <JmButton
              variant="outline"
              onClick={() => setRejectOpen(false)}
              disabled={transitionMutation.isPending}
            >
              취소
            </JmButton>
            <JmButton
              onClick={() =>
                transitionMutation.mutate({
                  action: "reject_after_quote",
                  payload: {
                    quoteRejectReason: rejectReason,
                    quoteRejectMemo: rejectMemo,
                  },
                })
              }
              disabled={
                transitionMutation.isPending ||
                (rejectReason === "OTHER" && !rejectMemo.trim())
              }
            >
              {transitionMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              진단비 청구로 진행
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>
    </>
  );
}
