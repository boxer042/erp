"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  MapPin,
  Package,
  Phone,
  Plus,
  QrCode,
  Trash2,
  Wrench,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";
import { SectionTitle } from "@/components/new-product-form/parts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatComma, parseComma } from "@/lib/utils";
import { useSessions } from "@/components/pos/sessions-context";
import { usePosShell } from "@/components/pos/pos-shell-context";

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
  customer: { id: string; name: string; phone: string | null } | null;
  customerMachine: { id: string; name: string } | null;
  serialItem: {
    id: string;
    code: string;
    soldAt: string;
    warrantyEnds: string | null;
    status: "ACTIVE" | "RETURNED" | "SCRAPPED";
    product: { id: string; name: string; sku: string; imageUrl: string | null };
    orderItem: {
      id: string;
      order: {
        id: string;
        orderNo: string;
        orderDate: string;
        totalAmount: string;
      };
    } | null;
  } | null;
  repairProduct: {
    id: string;
    name: string;
    sku: string;
    imageUrl: string | null;
  } | null;
  repairProductText: string | null;
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
}

const STATUS_LABEL: Record<RepairStatus, string> = {
  RECEIVED: "접수",
  DIAGNOSING: "진단중",
  QUOTED: "견적안내",
  APPROVED: "승인",
  REPAIRING: "수리중",
  READY: "완료대기",
  PICKED_UP: "픽업완료",
  CANCELLED: "취소",
};

const STATUS_VARIANT: Record<RepairStatus, "default" | "secondary" | "outline" | "destructive"> = {
  RECEIVED: "secondary",
  DIAGNOSING: "secondary",
  QUOTED: "outline",
  APPROVED: "outline",
  REPAIRING: "default",
  READY: "default",
  PICKED_UP: "secondary",
  CANCELLED: "destructive",
};

// USED 부속 + 공임 + 진단비 - 할인
function calcRepairFinalTotal(ticket: RepairTicketDetail): number {
  const usedParts = ticket.parts
    .filter((p) => p.status === "USED")
    .reduce((s, p) => s + Number(p.totalPrice), 0);
  const labors = ticket.labors.reduce((s, l) => s + Number(l.totalPrice), 0);
  const fee = Number(ticket.diagnosisFee || 0);
  const subtotal = usedParts + labors + fee;
  const td = ticket.totalDiscount || "0";
  const discount = td.endsWith("%")
    ? Math.round((subtotal * (parseFloat(td) || 0)) / 100)
    : parseInt(td.replace(/,/g, ""), 10) || 0;
  return Math.max(0, subtotal - discount);
}

// 상태 진행 버튼들 — 현재 상태에서 가능한 액션
function nextActions(status: RepairStatus, type: "ON_SITE" | "DROP_OFF") {
  const actions: { action: string; label: string; variant?: "default" | "outline" | "destructive" }[] = [];
  if (status === "RECEIVED") {
    if (type === "DROP_OFF") {
      actions.push({ action: "diagnose", label: "진단 시작" });
    }
    actions.push({ action: "start", label: "수리 시작" });
    actions.push({ action: "cancel", label: "취소", variant: "destructive" });
  } else if (status === "DIAGNOSING") {
    actions.push({ action: "quote", label: "견적 확정" });
    actions.push({ action: "cancel", label: "취소", variant: "destructive" });
  } else if (status === "QUOTED") {
    actions.push({ action: "approve", label: "고객 승인" });
    actions.push({ action: "cancel", label: "거절", variant: "destructive" });
  } else if (status === "APPROVED") {
    actions.push({ action: "start", label: "수리 시작" });
    actions.push({ action: "cancel", label: "취소", variant: "destructive" });
  } else if (status === "REPAIRING") {
    actions.push({ action: "ready", label: "수리 완료" });
  } else if (status === "READY") {
    actions.push({ action: "pickup", label: "픽업 / 결제" });
  }
  return actions;
}

// ──────── 메인 페이지 ────────

interface RepairWorkViewProps {
  ticketId: string;
  /** 좌측 ← 버튼 클릭 동작. 미제공이면 router.back() */
  onBack?: () => void;
  /** 헤더에서 ← 버튼 숨기고 싶을 때 (탭 안에 임베드되는 케이스) */
  hideBack?: boolean;
}

export function RepairWorkView({ ticketId, onBack, hideBack = false }: RepairWorkViewProps) {
  const id = ticketId;
  const router = useRouter();
  const queryClient = useQueryClient();

  const [statementOpen, setStatementOpen] = useState(false);

  const ticketQuery = useQuery({
    queryKey: ["repairs", "detail", id],
    queryFn: () => apiGet<RepairTicketDetail>(`/api/repair-tickets/${id}`),
  });

  if (ticketQuery.isPending) {
    return (
      <div className="flex h-full flex-col gap-3 p-4 sm:p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (ticketQuery.isError || !ticketQuery.data) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
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
    <div className="flex h-full flex-col">
      {/* 상단 헤더 */}
      <div className="flex items-center gap-3 border-b border-border bg-background px-4 py-3 sm:px-6">
        {!hideBack && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => (onBack ? onBack() : router.push("/pos"))}
            aria-label="뒤로"
          >
            <ArrowLeft />
          </Button>
        )}
        <div className="flex flex-1 items-center gap-2">
          <span className="font-mono text-sm font-semibold">{t.ticketNo}</span>
          <Badge variant="outline" className="text-[10px]">
            {t.type === "ON_SITE" ? (
              <><MapPin className="size-3" /> 즉시</>
            ) : (
              <><Wrench className="size-3" /> 맡김</>
            )}
          </Badge>
          <Badge variant={STATUS_VARIANT[t.status]}>{STATUS_LABEL[t.status]}</Badge>
          {t.parentRepairTicket && (
            <Badge variant="secondary" className="text-[10px]">
              재수리 (← {t.parentRepairTicket.ticketNo})
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            접수 {format(new Date(t.receivedAt), "yyyy-MM-dd HH:mm")}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => setStatementOpen(true)}
        >
          <FileText className="size-3.5" />
          내역서 출력
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="flex flex-col gap-4">
          <CustomerSection ticket={t} />
          <ProductSection ticket={t} readonly={readonly} onChanged={invalidate} />
          <SymptomSection ticket={t} readonly={readonly} onSaved={invalidate} />
          {!readonly && <PackagesSection ticket={t} onChanged={invalidate} />}
          <PartsSection ticket={t} readonly={readonly} onChanged={invalidate} />
          <LaborsSection ticket={t} readonly={readonly} onChanged={invalidate} />
          <FeesAndTotalsSection ticket={t} readonly={readonly} onChanged={invalidate} />
          <StatusActionsSection ticket={t} onChanged={invalidate} />
        </div>
      </div>

      {/* 내역서 출력 모달 */}
      <Dialog open={statementOpen} onOpenChange={setStatementOpen}>
        <DialogContent className="flex h-[95vh] max-h-[95vh] w-[95vw] max-w-[95vw]! flex-col gap-0 p-0 sm:max-w-[95vw]!">
          <DialogHeader className="border-b border-border p-4">
            <DialogTitle>수리내역서 — {t.ticketNo}</DialogTitle>
          </DialogHeader>
          <iframe
            src={`/repairs/${t.id}/print`}
            className="size-full flex-1 border-0"
            title="수리내역서"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ──────── 고객 정보 ────────

function CustomerSection({ ticket }: { ticket: RepairTicketDetail }) {
  const { sessions } = useSessions();
  // 미등록 고객일 때, 이 티켓을 추적하는 세션의 라벨 사용 (예: "고객 1")
  const sessionLabel = ticket.customer
    ? null
    : (sessions.find((s) => s.repairTicketIds?.includes(ticket.id))?.label ?? "미등록 고객");

  const displayName = ticket.customer?.name ?? sessionLabel;
  const initial = (displayName ?? "?").charAt(0);

  return (
    <section>
      <SectionTitle title="고객" />
      <Card size="sm">
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* 이름 */}
        <div className="flex items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-base font-semibold">
            {initial}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              이름
            </span>
            <span className="line-clamp-1 text-base font-semibold">{displayName}</span>
            {!ticket.customer && (
              <span className="text-[11px] text-muted-foreground">결제 시 등록</span>
            )}
          </div>
        </div>

        {/* 연락처 */}
        <div className="flex items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted">
            <Phone className="size-5 text-muted-foreground" />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              연락처
            </span>
            {ticket.customer?.phone ? (
              <span className="text-base font-semibold tabular-nums">
                {ticket.customer.phone}
              </span>
            ) : (
              <span className="text-base text-muted-foreground">-</span>
            )}
          </div>
        </div>

        {/* 담당자 */}
        <div className="flex items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted">
            <Wrench className="size-5 text-muted-foreground" />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              담당자
            </span>
            <span className="text-base font-semibold">
              {ticket.assignedTo?.name ?? (
                <span className="text-muted-foreground">미지정</span>
              )}
            </span>
          </div>
        </div>
        </CardContent>
      </Card>
    </section>
  );
}

// ──────── 상품 (가져온 기기) ────────

type ProductMode = "SERIAL" | "SEARCH" | "TEXT";

function ProductSection({
  ticket,
  readonly,
  onChanged,
}: {
  ticket: RepairTicketDetail;
  readonly: boolean;
  onChanged: () => void;
}) {
  const initialMode: ProductMode = ticket.serialItem
    ? "SERIAL"
    : ticket.repairProduct
      ? "SEARCH"
      : ticket.repairProductText
        ? "TEXT"
        : "SERIAL";
  const [mode, setMode] = useState<ProductMode>(initialMode);
  const [serialCode, setSerialCode] = useState(ticket.serialItem?.code ?? "");
  const [textValue, setTextValue] = useState(ticket.repairProductText ?? "");

  const productsQuery = useQuery({
    queryKey: ["repairs", "products"],
    queryFn: () =>
      apiGet<ProductOption[]>("/api/products?isBulk=all&excludeVariants=true"),
    enabled: mode === "SEARCH" && !readonly,
  });

  const serialLookup = useMutation({
    mutationFn: async () => {
      const list = await apiGet<
        Array<{ id: string; code: string; product: { name: string } }>
      >(`/api/serial-items?search=${encodeURIComponent(serialCode)}`);
      const exact = list.find((i) => i.code === serialCode.trim());
      if (!exact) throw new Error("해당 라벨 코드를 찾을 수 없습니다");
      await apiMutate(`/api/repair-tickets/${ticket.id}`, "PUT", {
        serialItemId: exact.id,
        repairProductId: null,
        repairProductText: null,
      });
      return exact;
    },
    onSuccess: (item) => {
      toast.success(`${item.code} — ${item.product.name} 연결됨`);
      onChanged();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : err.message || "조회 실패"),
  });

  const setProductMutation = useMutation({
    mutationFn: (p: ProductOption) =>
      apiMutate(`/api/repair-tickets/${ticket.id}`, "PUT", {
        serialItemId: null,
        repairProductId: p.id,
        repairProductText: null,
      }),
    onSuccess: () => {
      toast.success("상품 연결됨");
      onChanged();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  const setTextMutation = useMutation({
    mutationFn: (text: string) =>
      apiMutate(`/api/repair-tickets/${ticket.id}`, "PUT", {
        serialItemId: null,
        repairProductId: null,
        repairProductText: text.trim() || null,
      }),
    onSuccess: () => {
      toast.success("저장됨");
      onChanged();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  const clearProductMutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/repair-tickets/${ticket.id}`, "PUT", {
        serialItemId: null,
        repairProductId: null,
        repairProductText: null,
      }),
    onSuccess: () => {
      toast.success("상품 정보 초기화");
      setSerialCode("");
      setTextValue("");
      onChanged();
    },
  });

  // hasDisplay flag for clear button
  const hasDisplay =
    !!ticket.serialItem || !!ticket.repairProduct || !!ticket.repairProductText;

  return (
    <section>
      <SectionTitle
        title="상품 (가져온 기기)"
        badge={
          hasDisplay && !readonly ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => clearProductMutation.mutate()}
            >
              초기화
            </Button>
          ) : null
        }
      />
      <Card size="sm">
        <CardContent className="flex flex-col gap-3">
        {ticket.serialItem ? (
          <SerialItemDisplay serialItem={ticket.serialItem} />
        ) : ticket.repairProduct ? (
          <SearchedProductDisplay product={ticket.repairProduct} />
        ) : ticket.repairProductText ? (
          <TextProductDisplay text={ticket.repairProductText} />
        ) : (
          <div className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
            연결된 상품이 없습니다 — 아래에서 시리얼/검색/직접입력으로 연결하세요
          </div>
        )}

        {!readonly && (
          <>
            {/* 입력 모드 토글 */}
            <div className="flex gap-1">
              {(
                [
                  { v: "SERIAL", label: "시리얼 코드" },
                  { v: "SEARCH", label: "상품 검색" },
                  { v: "TEXT", label: "직접 입력" },
                ] as const
              ).map((b) => (
                <button
                  key={b.v}
                  type="button"
                  onClick={() => setMode(b.v)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs transition-colors",
                    mode === b.v
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  {b.label}
                </button>
              ))}
            </div>

            {/* 입력 영역 */}
            {mode === "SERIAL" && (
              <div className="flex gap-2">
                <Input
                  value={serialCode}
                  onChange={(e) => setSerialCode(e.target.value)}
                  placeholder="예: 241125-0042"
                  className="font-mono"
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.nativeEvent.isComposing &&
                      serialCode.trim()
                    ) {
                      serialLookup.mutate();
                    }
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => serialLookup.mutate()}
                  disabled={!serialCode.trim() || serialLookup.isPending}
                >
                  {serialLookup.isPending && <Loader2 className="size-4 animate-spin" />}
                  조회·연결
                </Button>
              </div>
            )}

            {mode === "SEARCH" && (
              <ProductCombobox
                products={productsQuery.data ?? []}
                value=""
                onChange={(p) => {
                  if (p?.id) setProductMutation.mutate(p);
                }}
                filterType="component"
                placeholder="상품명 또는 SKU 검색..."
              />
            )}

            {mode === "TEXT" && (
              <div className="flex gap-2">
                <Input
                  value={textValue}
                  onChange={(e) => setTextValue(e.target.value)}
                  placeholder="예: Sony A7M4 (Black) — 카탈로그에 없을 때"
                />
                <Button
                  variant="outline"
                  onClick={() => setTextMutation.mutate(textValue)}
                  disabled={!textValue.trim() || setTextMutation.isPending}
                >
                  {setTextMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                  저장
                </Button>
              </div>
            )}
          </>
        )}
        </CardContent>
      </Card>
    </section>
  );
}

// 시리얼 모드 — 우리가 판매한 상품. 구매일·보증·주문번호까지 표시.
function SerialItemDisplay({
  serialItem,
}: {
  serialItem: NonNullable<RepairTicketDetail["serialItem"]>;
}) {
  const warrantyActive =
    serialItem.warrantyEnds && new Date(serialItem.warrantyEnds) > new Date();
  return (
    <div className="flex flex-col gap-2 rounded-md bg-primary/5 p-3 ring-1 ring-primary/20">
      <div className="flex items-center gap-3">
        {serialItem.product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={serialItem.product.imageUrl}
            alt={serialItem.product.name}
            className="size-14 rounded-md object-cover"
          />
        ) : (
          <div className="flex size-14 items-center justify-center rounded-md bg-background">
            <Package className="size-6 text-muted-foreground" />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1 font-mono text-xs font-semibold text-primary">
            <QrCode className="size-3" /> {serialItem.code}
          </span>
          <span className="line-clamp-1 text-sm font-semibold">
            {serialItem.product.name}
          </span>
          <span className="text-xs text-muted-foreground">
            {serialItem.product.sku}
          </span>
        </div>
        <Badge variant="secondary" className="self-start text-[10px]">
          우리 판매
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-primary/20 pt-2 text-xs sm:grid-cols-3">
        <div>
          <span className="text-muted-foreground">구매일</span>
          <div className="font-medium">
            {format(new Date(serialItem.soldAt), "yyyy-MM-dd")}
          </div>
        </div>
        <div>
          <span className="text-muted-foreground">제품 보증</span>
          <div className="font-medium">
            {serialItem.warrantyEnds ? (
              <span className={warrantyActive ? "text-primary" : "text-destructive"}>
                ~{format(new Date(serialItem.warrantyEnds), "yyyy-MM-dd")}
                {warrantyActive ? " (유효)" : " (만료)"}
              </span>
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </div>
        </div>
        {serialItem.orderItem?.order && (
          <div>
            <span className="text-muted-foreground">주문번호</span>
            <div className="font-mono text-[11px] font-medium">
              {serialItem.orderItem.order.orderNo}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// 검색 모드 — 카탈로그에 있는 상품. 우리가 판 건 아님.
function SearchedProductDisplay({
  product,
}: {
  product: NonNullable<RepairTicketDetail["repairProduct"]>;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-muted/50 p-3">
      {product.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.imageUrl}
          alt={product.name}
          className="size-14 rounded-md object-cover"
        />
      ) : (
        <div className="flex size-14 items-center justify-center rounded-md bg-background">
          <Package className="size-6 text-muted-foreground" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="line-clamp-1 text-sm font-semibold">{product.name}</span>
        <span className="text-xs text-muted-foreground">{product.sku}</span>
      </div>
      <Badge variant="outline" className="self-start text-[10px]">
        카탈로그 매칭
      </Badge>
    </div>
  );
}

// 직접 입력 모드 — 우리 카탈로그에 없는 상품. 텍스트만.
function TextProductDisplay({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-muted/30 p-3">
      <div className="flex size-14 items-center justify-center rounded-md border border-dashed border-border">
        <Package className="size-6 text-muted-foreground" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="line-clamp-2 text-sm font-medium">{text}</span>
      </div>
      <Badge variant="outline" className="self-start text-[10px] text-muted-foreground">
        직접 입력
      </Badge>
    </div>
  );
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
    <section>
      <SectionTitle title="증상 · 진단 · 메모" />
      <Card size="sm">
        <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">증상 (고객 호소)</label>
          <Textarea
            value={symptom}
            onChange={(e) => setSymptom(e.target.value)}
            disabled={readonly}
            className="min-h-[60px] resize-none text-sm"
            placeholder="예: 누수 발생, 호스 연결부 새는 듯"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">진단 (직원 확인)</label>
          <Textarea
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            disabled={readonly}
            className="min-h-[60px] resize-none text-sm"
            placeholder="예: 체크밸브 마모 확인"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">수리 메모 (내부)</label>
          <Textarea
            value={repairNotes}
            onChange={(e) => setRepairNotes(e.target.value)}
            disabled={readonly}
            className="min-h-[60px] resize-none text-sm"
          />
        </div>
        {!readonly && dirty && (
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              저장
            </Button>
          </div>
        )}
        </CardContent>
      </Card>
    </section>
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
      <section>
        <SectionTitle title="패키지 빠른 추가" />
        <Card size="sm">
          <CardContent className="flex items-center gap-2 py-3">
            <Skeleton className="h-7 w-32 rounded-full" />
            <Skeleton className="h-7 w-28 rounded-full" />
            <Skeleton className="h-7 w-36 rounded-full" />
          </CardContent>
        </Card>
      </section>
    );
  }
  if (packages.length === 0) return null;

  return (
    <section>
      <SectionTitle title="패키지 빠른 추가" />
      <Card size="sm">
        <CardContent className="flex flex-wrap gap-1.5">
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
                "inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs",
                "transition-colors hover:border-primary hover:bg-primary/5",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <Plus className="size-3" />
              <span className="font-medium">{p.name}</span>
              <span className="text-muted-foreground">
                ({partsCount > 0 && `부속 ${partsCount}`}
                {partsCount > 0 && laborsCount > 0 && " · "}
                {laborsCount > 0 && `공임 ${laborsCount}`})
              </span>
            </button>
          );
        })}
        </CardContent>
      </Card>
    </section>
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
    <section>
      <SectionTitle
        title="사용 부속"
        badge={
          !readonly ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setAdding((v) => !v)}
            >
              <Plus className="size-3.5" />
              부속 검색/추가
            </Button>
          ) : null
        }
      />
      <Card size="sm">
        <CardContent className="flex flex-col gap-3 p-0">
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

        <div className="border-y border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">부속명</TableHead>
                <TableHead className="w-32">수량</TableHead>
                <TableHead className="w-28 text-right">단가</TableHead>
                <TableHead className="w-28 text-right">소계</TableHead>
                <TableHead className="w-24">상태</TableHead>
                <TableHead className="w-12 pr-6"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ticket.parts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    추가된 부속이 없습니다
                  </TableCell>
                </TableRow>
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
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-end gap-4 px-6 pb-2 text-sm">
          {lostTotal > 0 && (
            <span className="text-destructive">
              손실 ₩{lostTotal.toLocaleString("ko-KR")}
            </span>
          )}
          <span>
            <span className="text-muted-foreground">청구 부속</span>{" "}
            <span className="font-semibold tabular-nums">
              ₩{usedTotal.toLocaleString("ko-KR")}
            </span>
          </span>
        </div>
        </CardContent>
      </Card>
    </section>
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
    <TableRow className={cn(isLost && "opacity-70")}>
      <TableCell className="pl-6">
        <div className="flex flex-col">
          <span className={cn("text-sm", isLost && "line-through")}>
            {part.product.name}
          </span>
          <span className="text-xs text-muted-foreground">{part.product.sku}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={readonly || updateMutation.isPending || Number(qty) <= 1}
            onClick={() => {
              const next = Math.max(1, Number(qty) - 1);
              setQty(String(next));
              updateMutation.mutate({ quantity: next });
            }}
          >
            −
          </Button>
          <Input
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
            className="h-7 w-12 text-center text-sm tabular-nums"
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={readonly || updateMutation.isPending}
            onClick={() => {
              const next = Number(qty) + 1;
              setQty(String(next));
              updateMutation.mutate({ quantity: next });
            }}
          >
            +
          </Button>
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        ₩{Number(part.unitPrice).toLocaleString("ko-KR")}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        ₩{Number(part.totalPrice).toLocaleString("ko-KR")}
      </TableCell>
      <TableCell>
        <button
          type="button"
          disabled={readonly}
          onClick={() =>
            updateMutation.mutate({ status: isLost ? "USED" : "LOST" })
          }
          className={cn(
            "inline-flex h-6 items-center rounded px-2 text-[11px] font-medium transition-colors",
            isLost
              ? "bg-destructive/10 text-destructive"
              : "bg-secondary text-secondary-foreground",
            readonly && "cursor-not-allowed opacity-50",
          )}
        >
          {isLost ? "LOST" : "USED"}
        </button>
      </TableCell>
      <TableCell className="pr-6 text-right">
        {!readonly && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-destructive"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </TableCell>
    </TableRow>
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
    <section>
      <SectionTitle
        title="공임"
        badge={
          !readonly ? (
            <Button size="sm" variant="outline" className="h-8" onClick={() => setAdding(!adding)}>
              <Plus className="size-3.5" />
              공임 추가
            </Button>
          ) : null
        }
      />
      <Card size="sm">
        <CardContent className="flex flex-col gap-2 p-0">
        {adding && (
          <div className="flex items-center gap-2 px-6">
            <Input
              placeholder="공임명 (예: 분해/조립)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 flex-1 text-sm"
            />
            <Input
              placeholder="금액"
              inputMode="numeric"
              value={formatComma(rate)}
              onChange={(e) => setRate(parseComma(e.target.value))}
              className="h-9 w-32 text-right text-sm tabular-nums"
            />
            <Button
              size="sm"
              onClick={() => addMutation.mutate()}
              disabled={!name.trim() || !rate || addMutation.isPending}
            >
              추가
            </Button>
          </div>
        )}

        <div className="border-y border-border">
          <Table>
            <TableBody>
              {ticket.labors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-4 text-center text-sm text-muted-foreground">
                    추가된 공임이 없습니다
                  </TableCell>
                </TableRow>
              ) : (
                ticket.labors.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="pl-6">{l.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      ₩{Number(l.totalPrice).toLocaleString("ko-KR")}
                    </TableCell>
                    <TableCell className="w-12 pr-6 text-right">
                      {!readonly && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteMutation.mutate(l.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-end px-6 pb-2 text-sm">
          <span>
            <span className="text-muted-foreground">공임 합계</span>{" "}
            <span className="font-semibold tabular-nums">
              ₩{total.toLocaleString("ko-KR")}
            </span>
          </span>
        </div>
        </CardContent>
      </Card>
    </section>
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

  // 합계 계산 (USED 부속 + 공임 + 진단비 - 할인)
  const usedParts = ticket.parts
    .filter((p) => p.status === "USED")
    .reduce((s, p) => s + Number(p.totalPrice), 0);
  const labors = ticket.labors.reduce((s, l) => s + Number(l.totalPrice), 0);
  const fee = parseInt(diagnosisFee, 10) || 0;
  const subtotal = usedParts + labors + fee;
  const discountAmount = totalDiscount.endsWith("%")
    ? Math.round((subtotal * (parseFloat(totalDiscount) || 0)) / 100)
    : parseInt(totalDiscount.replace(/,/g, ""), 10) || 0;
  const finalTotal = Math.max(0, subtotal - discountAmount);

  return (
    <section>
      <SectionTitle title="진단비 · 할인 · 합계" />
      <Card size="sm">
        <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">
              진단비 (수리 거절 시에도 청구)
            </label>
            <Input
              inputMode="numeric"
              value={formatComma(diagnosisFee)}
              onChange={(e) => setDiagnosisFee(parseComma(e.target.value))}
              disabled={readonly}
              className="h-9 text-right tabular-nums"
              placeholder="0"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">
              전체 할인 (정액 또는 비율 — 예: 5000 / 10%)
            </label>
            <Input
              value={totalDiscount}
              onChange={(e) => setTotalDiscount(e.target.value)}
              disabled={readonly}
              className="h-9 text-right tabular-nums"
              placeholder="0"
            />
          </div>
        </div>

        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <Row label="청구 부속" value={usedParts} />
          <Row label="공임" value={labors} />
          {fee > 0 && <Row label="진단비" value={fee} />}
          {discountAmount > 0 && (
            <Row label="할인" value={-discountAmount} className="text-destructive" />
          )}
          <div className="my-1 border-t border-border" />
          <div className="flex items-baseline justify-between">
            <span className="text-base font-semibold">최종 청구</span>
            <span className="text-2xl font-bold tabular-nums">
              ₩{finalTotal.toLocaleString("ko-KR")}
            </span>
          </div>
        </div>

        {!readonly && dirty && (
          <div className="flex justify-end">
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              저장
            </Button>
          </div>
        )}
        </CardContent>
      </Card>
    </section>
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
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">₩{value.toLocaleString("ko-KR")}</span>
    </div>
  );
}

// ──────── 상태 진행 액션 ────────

function StatusActionsSection({
  ticket,
  onChanged,
}: {
  ticket: RepairTicketDetail;
  onChanged: () => void;
}) {
  const router = useRouter();
  const actions = nextActions(ticket.status, ticket.type);
  const { sessions, addSession, add, setCustomer, switchSession } = useSessions();
  const { setCartOpen } = usePosShell();

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
        cancel: "취소 처리됨",
      };
      toast.success(labels[vars.action] ?? "처리되었습니다");
      onChanged();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "처리 실패"),
  });

  const finalAmount = calcRepairFinalTotal(ticket);

  // 픽업 → 카트로 이동 (수리비를 카트 라인으로 추가, 일반 상품과 함께 결제 가능)
  const sendToCart = () => {
    if (finalAmount <= 0) {
      toast.error("청구할 금액이 없습니다");
      return;
    }
    // 고객 세션 찾기 — 등록된 고객이면 그 세션 재사용, 미등록이면 새 세션
    let targetSessionId = ticket.customer
      ? sessions.find((s) => s.customerId === ticket.customer!.id)?.id
      : undefined;
    if (!targetSessionId) {
      targetSessionId = addSession();
      if (ticket.customer) {
        setCustomer(
          ticket.customer.id,
          ticket.customer.name,
          ticket.customer.phone ?? undefined,
          targetSessionId,
        );
      }
    }
    // 수리 라인 추가 (repairTicketId 연결)
    add(
      {
        itemType: "repair",
        name: `수리 ${ticket.ticketNo}`,
        imageUrl: null,
        unitPrice: finalAmount,
        taxType: "TAXABLE",
        repairMeta: {
          repairTicketId: ticket.id,
          deviceModel:
            ticket.serialItem?.product?.name ??
            ticket.customerMachine?.name ??
            undefined,
          issueDescription: ticket.symptom ?? undefined,
        },
      },
      { sessionId: targetSessionId },
    );
    switchSession(targetSessionId);
    toast.success("카트에 수리비가 추가되었습니다");
    router.push(`/pos/cart/${targetSessionId}`);
    setCartOpen(true);
  };

  if (actions.length === 0) {
    return (
      <section>
        <SectionTitle title="상태" />
        <Card size="sm">
          <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
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
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section>
      <SectionTitle title="상태 진행" />
      <Card size="sm">
        <CardContent className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button
            key={a.action}
            variant={a.variant ?? "default"}
            size="sm"
            disabled={transitionMutation.isPending}
            onClick={() => {
              if (a.action === "pickup") {
                sendToCart();
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
          </Button>
        ))}
        </CardContent>
      </Card>
    </section>
  );
}
