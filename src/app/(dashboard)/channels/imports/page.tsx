"use client";

import { useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Inbox,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react";

import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  JmButton,
  JmIconButton,
  JmInput,
  JmBadge,
  JmCheckbox,
  JmEmpty,
  JmSkeleton,
  JmStat,
  JmTabs,
  JmTabsList,
  JmTabsTrigger,
  JmTabsIndicator,
  JmTabsPanel,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
  JmDialog,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmDialogBody,
  JmSelect,
  type JmSelectOption,
  JmFormField,
} from "@/jm";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";

// ─────────── 타입

interface Channel {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

interface MappingComponentRow {
  id: string;
  productId: string;
  quantity: string;
  product: { id: string; name: string; sku: string };
}

interface MappingRow {
  id: string;
  channelSku: string;
  channelName: string | null;
  /** 단일 매핑 — 다중 매핑이면 null */
  product: { id: string; name: string; sku: string } | null;
  /** 다중 매핑 — 비어있으면 단일 매핑 */
  components: MappingComponentRow[];
  updatedAt: string;
}

interface PendingRow {
  id: string;
  channelId: string;
  channelOrderNo: string;
  status:
    | "UNMAPPED_SKU"
    | "VALIDATION_FAILED"
    | "DUPLICATE"
    | "RESOLVED"
    | "DISCARDED";
  reason: string | null;
  rawPayload: {
    channelOrderNo?: string;
    buyer?: { name?: string };
    items?: Array<{
      channelSku: string;
      channelProductName?: string;
      quantity: number;
    }>;
  };
  createdAt: string;
  channel: { id: string; name: string; code: string };
  resolvedOrderId: string | null;
}

interface MappingSuggestion {
  productId: string;
  productName: string;
  productSku: string;
  score: number;
  reason: string;
}

interface ImportStats {
  pendingByStatus: Record<string, number>;
  last7Days: { imported: number; pending: number; resolved: number };
  missingSkuTop: Array<{
    channelSku: string;
    channelId: string;
    channelName: string;
    count: number;
  }>;
}

const PENDING_STATUS_LABEL: Record<PendingRow["status"], string> = {
  UNMAPPED_SKU: "매핑 누락",
  VALIDATION_FAILED: "검증 실패",
  DUPLICATE: "중복",
  RESOLVED: "변환됨",
  DISCARDED: "버림",
};

const PENDING_STATUS_VARIANT: Record<
  PendingRow["status"],
  "default" | "danger" | "solid" | "outline"
> = {
  UNMAPPED_SKU: "danger",
  VALIDATION_FAILED: "danger",
  DUPLICATE: "default",
  RESOLVED: "solid",
  DISCARDED: "outline",
};

// ─────────── 페이지

export default function ChannelImportsPage() {
  const queryClient = useQueryClient();

  const channelsQuery = useQuery({
    queryKey: queryKeys.channels.list(),
    queryFn: () => apiGet<Channel[]>("/api/channels"),
  });
  const channels = useMemo(
    () => (channelsQuery.data ?? []).filter((c) => c.isActive),
    [channelsQuery.data],
  );

  return (
    <div className="flex h-full flex-col bg-[var(--jm-bg)]">
      <div className="border-b border-[var(--jm-border)] px-5 py-3">
        <h1 className="text-jm-lg font-semibold text-[var(--jm-text)]">
          외부 채널 Import
        </h1>
        <p className="mt-0.5 text-jm-xs text-[var(--jm-text-muted)]">
          외부 채널의 주문을 ERP 로 가져오고, SKU 매핑·보류 큐를 관리합니다. (Phase
          1 — Mock 어댑터로 dev 검증 가능, 실 채널은 가입 후 어댑터 추가)
        </p>
      </div>

      <StatsBar />

      <JmTabs defaultValue="trigger" className="flex flex-1 flex-col gap-0">
        <div className="border-b border-[var(--jm-border)] px-5 py-2">
          <JmTabsList variant="line" className="border-b-0">
            <JmTabsTrigger value="trigger">Import 트리거</JmTabsTrigger>
            <JmTabsTrigger value="pending">보류 큐</JmTabsTrigger>
            <JmTabsTrigger value="mappings">SKU 매핑</JmTabsTrigger>
            <JmTabsIndicator />
          </JmTabsList>
        </div>

        <JmTabsPanel value="trigger" className="flex-1 overflow-auto p-5">
          <ImportTriggerSection
            channels={channels}
            loading={channelsQuery.isPending}
            onSuccess={() => {
              queryClient.invalidateQueries({
                queryKey: queryKeys.channels.pending(),
              });
              queryClient.invalidateQueries({
                queryKey: queryKeys.orders.all,
              });
            }}
          />
        </JmTabsPanel>

        <JmTabsPanel value="pending" className="flex-1 overflow-auto p-5">
          <PendingSection channels={channels} />
        </JmTabsPanel>

        <JmTabsPanel value="mappings" className="flex-1 overflow-auto p-5">
          <MappingSection channels={channels} />
        </JmTabsPanel>
      </JmTabs>
    </div>
  );
}

// ─────────── Import 트리거 (채널별 [import 시뮬레이션] 버튼)

function ImportTriggerSection({
  channels,
  loading,
  onSuccess,
}: {
  channels: Channel[];
  loading: boolean;
  onSuccess: () => void;
}) {
  const [configChannelId, setConfigChannelId] = useState<string | null>(null);
  const importMutation = useMutation({
    mutationFn: (channelId: string) =>
      apiMutate<{
        ordersCreated: number;
        pendingCreated: number;
        duplicates: number;
        failed: number;
        message: string;
      }>(`/api/channels/${channelId}/import`, "POST", {}),
    onSuccess: (data) => {
      toast.success(data.message);
      onSuccess();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Import 실패"),
  });

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <JmSkeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] p-8 text-center text-jm-sm text-[var(--jm-text-muted)]">
        활성 채널이 없습니다. 먼저 채널 페이지에서 채널을 등록하세요.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-jm-xs text-[var(--jm-text-muted)]">
        각 채널의 어댑터를 호출해 신규 주문을 가져옵니다. Mock 채널(채널 코드
        &quot;MOCK&quot;) 만 Phase 1 에서 동작 — 실 채널은 가입·API 키 후 어댑터를
        registry 에 추가하면 자동 활성화됩니다.
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        {channels.map((c) => {
          const isPending =
            importMutation.isPending && importMutation.variables === c.id;
          return (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-md border border-[var(--jm-border)] p-3"
            >
              <div className="flex flex-col">
                <span className="text-jm-base font-medium text-[var(--jm-text)]">
                  {c.name}
                </span>
                <span className="font-mono text-jm-2xs text-[var(--jm-text-muted)]">
                  {c.code}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <JmIconButton
                  size="sm"
                  variant="ghost"
                  aria-label="설정"
                  onClick={() => setConfigChannelId(c.id)}
                  title="설정"
                >
                  <Settings className="h-3.5 w-3.5" />
                </JmIconButton>
                <JmButton
                  size="xs"
                  onClick={() => importMutation.mutate(c.id)}
                  disabled={isPending}
                >
                  {isPending ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="mr-1 h-3 w-3" />
                  )}
                  Import 실행
                </JmButton>
              </div>
            </div>
          );
        })}
      </div>

      <ChannelConfigDialog
        channelId={configChannelId}
        onClose={() => setConfigChannelId(null)}
      />
    </div>
  );
}

// ─────────── 채널 설정 Dialog

interface ChannelConfig {
  pollingMinutes?: number;
  shipDateOffsetDays?: number;
  autoStockSync?: boolean;
  autoTrackingPush?: boolean;
  pendingThreshold?: number;
}

function ChannelConfigDialog({
  channelId,
  onClose,
}: {
  channelId: string | null;
  onClose: () => void;
}) {
  const open = !!channelId;
  const queryClient = useQueryClient();
  const configQuery = useQuery({
    queryKey: ["channel-config", channelId],
    queryFn: () =>
      apiGet<{ id: string; name: string; code: string; config: ChannelConfig | null }>(
        `/api/channels/${channelId}/config`,
      ),
    enabled: open,
  });

  const [form, setForm] = useState<ChannelConfig>({});
  const [initialized, setInitialized] = useState(false);

  // 데이터 도착 후 form 초기화
  if (configQuery.data && !initialized && open) {
    setForm(configQuery.data.config ?? {});
    setInitialized(true);
  }
  if (!open && initialized) {
    setForm({});
    setInitialized(false);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/channels/${channelId}/config`, "PATCH", form),
    onSuccess: () => {
      toast.success("채널 설정이 저장되었습니다");
      queryClient.invalidateQueries({ queryKey: ["channel-config", channelId] });
      onClose();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  return (
    <JmDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <JmDialogContent size="md">
        <JmDialogHeader>
          <JmDialogTitle>
            채널 설정 {configQuery.data ? `· ${configQuery.data.name}` : ""}
          </JmDialogTitle>
        </JmDialogHeader>
        <JmDialogBody className="space-y-4">
          <p className="text-jm-xs text-[var(--jm-text-muted)]">
            운영 정책 (credentials 는 보안상 환경변수에서 관리)
          </p>

          <JmFormField
            label="Polling 간격 (분)"
            hint="cron 라우트 호출 간격. 채널 rate limit 고려해 설정"
          >
            <JmInput
              size="sm"
              type="number"
              min={1}
              max={1440}
              value={form.pollingMinutes ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  pollingMinutes: e.target.value
                    ? parseInt(e.target.value, 10)
                    : undefined,
                })
              }
              placeholder="기본 10분"
            />
          </JmFormField>

          <JmFormField
            label="출고 예정일 offset (일)"
            hint="채널 정책상 주문일 기준 출고 시한"
          >
            <JmInput
              size="sm"
              type="number"
              min={0}
              max={30}
              value={form.shipDateOffsetDays ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  shipDateOffsetDays: e.target.value
                    ? parseInt(e.target.value, 10)
                    : undefined,
                })
              }
              placeholder="기본 1일 (D+1)"
            />
          </JmFormField>

          <JmFormField
            label="보류 큐 알림 임계값"
            hint="매핑 누락 보류가 이 수 초과 시 매장에 알림"
          >
            <JmInput
              size="sm"
              type="number"
              min={0}
              value={form.pendingThreshold ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  pendingThreshold: e.target.value
                    ? parseInt(e.target.value, 10)
                    : undefined,
                })
              }
              placeholder="예: 10"
            />
          </JmFormField>

          <div className="space-y-2 rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] p-2.5">
            <label className="flex cursor-pointer items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-jm-sm font-medium text-[var(--jm-text)]">
                  자동 송장 push
                </span>
                <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                  ERP [발송] 시 채널에 송장 자동 통보
                </span>
              </div>
              <JmCheckbox
                checked={form.autoTrackingPush ?? true}
                onCheckedChange={(v) =>
                  setForm({ ...form, autoTrackingPush: !!v })
                }
              />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-2 border-t border-[var(--jm-border)] pt-2">
              <div className="flex flex-col">
                <span className="text-jm-sm font-medium text-[var(--jm-text)]">
                  자동 재고 sync
                </span>
                <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                  Inventory 변동 시 채널에 가용 재고 push (Phase 2 필요)
                </span>
              </div>
              <JmCheckbox
                checked={form.autoStockSync ?? false}
                onCheckedChange={(v) =>
                  setForm({ ...form, autoStockSync: !!v })
                }
              />
            </label>
          </div>
        </JmDialogBody>
        <JmDialogFooter>
          <JmButton variant="outline" size="sm" onClick={onClose}>
            취소
          </JmButton>
          <JmButton
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending && (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            )}
            저장
          </JmButton>
        </JmDialogFooter>
      </JmDialogContent>
    </JmDialog>
  );
}

// ─────────── 보류 큐

function PendingSection({ channels }: { channels: Channel[] }) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"" | PendingRow["status"]>("");
  const [channelFilter, setChannelFilter] = useState<string>("");
  const [suggestionTarget, setSuggestionTarget] = useState<PendingRow | null>(
    null,
  );

  const pendingQuery = useQuery({
    queryKey: queryKeys.channels.pending({
      status: statusFilter,
      channel: channelFilter,
    }),
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (channelFilter) params.set("channelId", channelFilter);
      return apiGet<PendingRow[]>(
        `/api/channels/pending?${params.toString()}`,
      );
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) =>
      apiMutate(`/api/channels/pending/${id}`, "POST", { action: "resolve" }),
    onSuccess: () => {
      toast.success("정식 주문으로 변환되었습니다");
      queryClient.invalidateQueries({
        queryKey: queryKeys.channels.pending(),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "변환 실패"),
  });

  const discardMutation = useMutation({
    mutationFn: (id: string) =>
      apiMutate(`/api/channels/pending/${id}`, "POST", { action: "discard" }),
    onSuccess: () => {
      toast.success("보류 항목을 버렸습니다");
      queryClient.invalidateQueries({
        queryKey: queryKeys.channels.pending(),
      });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "처리 실패"),
  });

  const statusOptions: JmSelectOption[] = [
    { value: "all", label: "전체 상태" },
    { value: "UNMAPPED_SKU", label: "매핑 누락" },
    { value: "DUPLICATE", label: "중복" },
    { value: "RESOLVED", label: "변환됨" },
    { value: "DISCARDED", label: "버림" },
  ];
  const channelOptions: JmSelectOption[] = [
    { value: "all", label: "전체 채널" },
    ...channels.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <JmSelect
          size="sm"
          className="w-[180px]"
          placeholder="상태"
          options={statusOptions}
          value={statusFilter || "all"}
          onChange={(v) => {
            if (!v || v === "all") setStatusFilter("");
            else setStatusFilter(v as PendingRow["status"]);
          }}
        />
        <JmSelect
          size="sm"
          className="w-[180px]"
          placeholder="채널"
          options={channelOptions}
          value={channelFilter || "all"}
          onChange={(v) => setChannelFilter(!v || v === "all" ? "" : v)}
        />
        <JmButton
          variant="ghost"
          size="xs"
          onClick={() => pendingQuery.refetch()}
          disabled={pendingQuery.isFetching}
        >
          <RefreshCw
            className={`h-3 w-3 ${pendingQuery.isFetching ? "animate-spin" : ""}`}
          />
        </JmButton>
      </div>

      <JmTable className="min-w-[1000px]">
        <JmTableHeader>
          <JmTableRow>
            <JmTableHead className="w-[120px]">상태</JmTableHead>
            <JmTableHead className="w-[140px]">채널</JmTableHead>
            <JmTableHead className="w-[180px]">채널주문번호</JmTableHead>
            <JmTableHead>손님 / 항목</JmTableHead>
            <JmTableHead>사유</JmTableHead>
            <JmTableHead className="w-[110px]">접수일</JmTableHead>
            <JmTableHead className="w-[200px]" />
          </JmTableRow>
        </JmTableHeader>
        <JmTableBody>
          {pendingQuery.isPending ? (
            Array.from({ length: 5 }).map((_, i) => (
              <JmTableRow key={i}>
                {Array.from({ length: 7 }).map((_, j) => (
                  <JmTableCell key={j}>
                    <JmSkeleton className="h-4 w-full" />
                  </JmTableCell>
                ))}
              </JmTableRow>
            ))
          ) : (pendingQuery.data ?? []).length === 0 ? (
            <JmTableRow className="hover:bg-transparent">
              <JmTableCell colSpan={7} className="py-12">
                <JmEmpty
                  icon={<Inbox className="size-6" />}
                  title="보류 항목이 없습니다"
                  description="외부 채널에서 가져온 주문 중 매핑 누락·검증 실패 등으로 보류된 항목이 여기에 표시됩니다."
                />
              </JmTableCell>
            </JmTableRow>
          ) : (
            (pendingQuery.data ?? []).map((p) => {
              const buyer = p.rawPayload.buyer?.name ?? "—";
              const itemSummary = (p.rawPayload.items ?? [])
                .map((i) => `${i.channelSku} × ${i.quantity}`)
                .join(", ");
              const isOpen =
                p.status !== "RESOLVED" && p.status !== "DISCARDED";
              const isResolving =
                resolveMutation.isPending &&
                resolveMutation.variables === p.id;
              const isDiscarding =
                discardMutation.isPending &&
                discardMutation.variables === p.id;
              return (
                <JmTableRow key={p.id}>
                  <JmTableCell>
                    <JmBadge variant={PENDING_STATUS_VARIANT[p.status]}>
                      {PENDING_STATUS_LABEL[p.status]}
                    </JmBadge>
                  </JmTableCell>
                  <JmTableCell className="text-jm-sm">{p.channel.name}</JmTableCell>
                  <JmTableCell className="font-mono text-jm-xs">
                    {p.channelOrderNo}
                  </JmTableCell>
                  <JmTableCell className="text-jm-xs">
                    <div className="flex flex-col">
                      <span>{buyer}</span>
                      <span className="text-[var(--jm-text-muted)]">
                        {itemSummary}
                      </span>
                    </div>
                  </JmTableCell>
                  <JmTableCell className="text-jm-xs text-[var(--jm-text-muted)]">
                    {p.reason ?? "—"}
                  </JmTableCell>
                  <JmTableCell className="text-jm-xs text-[var(--jm-text-muted)]">
                    {new Date(p.createdAt).toLocaleDateString("ko-KR")}
                  </JmTableCell>
                  <JmTableCell>
                    {isOpen ? (
                      <div className="flex justify-end gap-1">
                        {p.status === "UNMAPPED_SKU" && (
                          <JmButton
                            size="xs"
                            variant="outline"
                            onClick={() => setSuggestionTarget(p)}
                          >
                            <Sparkles className="mr-0.5 h-3 w-3" />
                            추천
                          </JmButton>
                        )}
                        <JmButton
                          size="xs"
                          variant="ghost"
                          onClick={() => discardMutation.mutate(p.id)}
                          disabled={isDiscarding || isResolving}
                        >
                          {isDiscarding ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : null}
                          버림
                        </JmButton>
                        <JmButton
                          size="xs"
                          onClick={() => resolveMutation.mutate(p.id)}
                          disabled={isResolving || isDiscarding}
                        >
                          {isResolving ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : null}
                          변환
                        </JmButton>
                      </div>
                    ) : p.resolvedOrderId ? (
                      <a
                        href={`/orders?id=${p.resolvedOrderId}`}
                        className="text-jm-xs text-[var(--jm-action)] underline-offset-2 hover:underline"
                      >
                        주문 보기 →
                      </a>
                    ) : null}
                  </JmTableCell>
                </JmTableRow>
              );
            })
          )}
        </JmTableBody>
      </JmTable>

      <p className="text-jm-2xs text-[var(--jm-text-muted)]">
        매핑 누락 항목은 [추천] 으로 ERP 상품 매칭 후 매핑 → [변환] 클릭. 또는
        SKU 매핑 탭에서 직접 매핑 후 [변환].
      </p>

      <SuggestionDialog
        target={suggestionTarget}
        onClose={() => setSuggestionTarget(null)}
      />
    </div>
  );
}

// ─────────── 매핑 추천 Dialog (보류 큐의 UNMAPPED_SKU 항목 1클릭 매핑)

function SuggestionDialog({
  target,
  onClose,
}: {
  target: PendingRow | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const open = !!target;
  const items = target?.rawPayload.items ?? [];

  return (
    <JmDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <JmDialogContent size="xl">
        <JmDialogHeader>
          <JmDialogTitle>
            매핑 추천 {target ? `· ${target.channelOrderNo}` : ""}
          </JmDialogTitle>
        </JmDialogHeader>
        <JmDialogBody className="space-y-3">
          {items.map((it, idx) => (
            <SkuSuggestionRow
              key={`${it.channelSku}-${idx}`}
              channelId={target!.channelId}
              channelSku={it.channelSku}
              channelProductName={it.channelProductName}
              quantity={it.quantity}
              onMapped={() => {
                queryClient.invalidateQueries({
                  queryKey: queryKeys.channels.pending(),
                });
                queryClient.invalidateQueries({
                  queryKey: queryKeys.channels.mappings(target!.channelId),
                });
              }}
            />
          ))}
        </JmDialogBody>
        <JmDialogFooter>
          <p className="mr-auto text-jm-2xs text-[var(--jm-text-muted)]">
            매핑 등록 후 닫고 [변환] 버튼으로 정식 주문 승격
          </p>
          <JmButton variant="outline" size="sm" onClick={onClose}>
            닫기
          </JmButton>
        </JmDialogFooter>
      </JmDialogContent>
    </JmDialog>
  );
}

function SkuSuggestionRow({
  channelId,
  channelSku,
  channelProductName,
  quantity,
  onMapped,
}: {
  channelId: string;
  channelSku: string;
  channelProductName?: string;
  quantity: number;
  onMapped: () => void;
}) {
  const [mapped, setMapped] = useState(false);
  const suggestionsQuery = useQuery({
    queryKey: ["channel-suggest", channelId, channelSku],
    queryFn: () => {
      const params = new URLSearchParams({ sku: channelSku });
      if (channelProductName) params.set("name", channelProductName);
      return apiGet<MappingSuggestion[]>(
        `/api/channels/${channelId}/suggest?${params.toString()}`,
      );
    },
  });

  const mapMutation = useMutation({
    mutationFn: (productId: string) =>
      apiMutate(`/api/channels/${channelId}/mappings`, "POST", {
        channelSku,
        channelName: channelProductName,
        productId,
      }),
    onSuccess: () => {
      toast.success(`${channelSku} 매핑 등록됨`);
      setMapped(true);
      onMapped();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "매핑 실패"),
  });

  return (
    <div className="rounded-md border border-[var(--jm-border)] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex flex-col">
          <span className="font-mono text-jm-sm font-medium text-[var(--jm-text)]">
            {channelSku}
          </span>
          {channelProductName && (
            <span className="text-jm-2xs text-[var(--jm-text-muted)]">
              채널명: {channelProductName} · 수량 {quantity}
            </span>
          )}
        </div>
        {mapped && (
          <JmBadge variant="solid">
            <CheckCircle2 className="mr-0.5 h-3 w-3" />
            매핑됨
          </JmBadge>
        )}
      </div>
      {!mapped && (
        <div className="mt-2 space-y-1">
          {suggestionsQuery.isPending ? (
            <JmSkeleton className="h-12 w-full" />
          ) : (suggestionsQuery.data ?? []).length === 0 ? (
            <p className="text-jm-xs text-[var(--jm-text-muted)]">
              자동 추천 결과 없음 — SKU 매핑 탭에서 직접 등록하세요
            </p>
          ) : (
            (suggestionsQuery.data ?? []).map((s) => {
              const isThisPending =
                mapMutation.isPending && mapMutation.variables === s.productId;
              return (
                <div
                  key={s.productId}
                  className="flex items-center justify-between gap-2 rounded border border-[var(--jm-border)] p-2 text-jm-xs"
                >
                  <div className="flex flex-1 flex-col">
                    <span className="text-[var(--jm-text)]">{s.productName}</span>
                    <span className="font-mono text-jm-2xs text-[var(--jm-text-muted)]">
                      {s.productSku} · {s.reason}
                    </span>
                  </div>
                  <JmBadge variant="outline" className="shrink-0">
                    {s.score}점
                  </JmBadge>
                  <JmButton
                    size="xs"
                    className="shrink-0"
                    onClick={() => mapMutation.mutate(s.productId)}
                    disabled={mapMutation.isPending}
                  >
                    {isThisPending ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : null}
                    매핑
                  </JmButton>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─────────── 통계 바 (페이지 헤더 다음, 항상 노출)

function StatsBar() {
  const statsQuery = useQuery({
    queryKey: ["channels", "stats"],
    queryFn: () => apiGet<ImportStats>("/api/channels/stats"),
  });
  const data = statsQuery.data;

  return (
    <div className="border-b border-[var(--jm-border)] bg-[var(--jm-surface-muted)] px-5 py-2.5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <JmStat
          size="sm"
          icon={<AlertCircle className="size-4" />}
          label="매핑 누락 보류"
          value={
            statsQuery.isPending ? (
              <JmSkeleton className="h-7 w-12" />
            ) : (
              (data?.pendingByStatus.UNMAPPED_SKU ?? 0).toLocaleString("ko-KR")
            )
          }
          positiveIsGood={false}
        />
        <JmStat
          size="sm"
          icon={<Inbox className="size-4" />}
          label="최근 7일 import"
          value={
            statsQuery.isPending ? (
              <JmSkeleton className="h-7 w-12" />
            ) : (
              (data?.last7Days.imported ?? 0).toLocaleString("ko-KR")
            )
          }
        />
        <JmStat
          size="sm"
          icon={<Sparkles className="size-4" />}
          label="최근 7일 변환됨"
          value={
            statsQuery.isPending ? (
              <JmSkeleton className="h-7 w-12" />
            ) : (
              (data?.last7Days.resolved ?? 0).toLocaleString("ko-KR")
            )
          }
        />
        <JmStat
          size="sm"
          icon={<Package className="size-4" />}
          label="전체 보류"
          value={
            statsQuery.isPending ? (
              <JmSkeleton className="h-7 w-12" />
            ) : (
              (
                (data?.pendingByStatus.UNMAPPED_SKU ?? 0) +
                (data?.pendingByStatus.VALIDATION_FAILED ?? 0)
              ).toLocaleString("ko-KR")
            )
          }
        />
      </div>
      {data && data.missingSkuTop.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-jm-2xs">
          <span className="text-[var(--jm-text-muted)]">자주 누락 SKU:</span>
          {data.missingSkuTop.slice(0, 5).map((s) => (
            <JmBadge
              key={`${s.channelId}-${s.channelSku}`}
              variant="outline"
              className="font-mono"
            >
              {s.channelSku}
              <span className="ml-1 text-[var(--jm-text-muted)]">×{s.count}</span>
            </JmBadge>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────── SKU 매핑

function MappingSection({ channels }: { channels: Channel[] }) {
  const [selectedChannel, setSelectedChannel] = useState<string>(
    channels[0]?.id ?? "",
  );
  const [addOpen, setAddOpen] = useState(false);

  // channels 가 늦게 로드되면 default 동기화
  useMemo(() => {
    if (!selectedChannel && channels[0]?.id) {
      setSelectedChannel(channels[0].id);
    }
  }, [channels, selectedChannel]);

  const queryClient = useQueryClient();
  const mappingsQuery = useQuery({
    queryKey: queryKeys.channels.mappings(selectedChannel),
    queryFn: () =>
      apiGet<MappingRow[]>(
        `/api/channels/${selectedChannel}/mappings`,
      ),
    enabled: !!selectedChannel,
  });

  const deleteMutation = useMutation({
    mutationFn: (mappingId: string) =>
      apiMutate(
        `/api/channels/${selectedChannel}/mappings/${mappingId}`,
        "DELETE",
      ),
    onSuccess: () => {
      toast.success("매핑이 삭제되었습니다");
      queryClient.invalidateQueries({
        queryKey: queryKeys.channels.mappings(selectedChannel),
      });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "삭제 실패"),
  });

  if (channels.length === 0) {
    return (
      <div className="rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] p-8 text-center text-jm-sm text-[var(--jm-text-muted)]">
        활성 채널이 없습니다.
      </div>
    );
  }

  const channelOptions: JmSelectOption[] = channels.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <JmSelect
          size="sm"
          className="w-[200px]"
          placeholder="채널"
          options={channelOptions}
          value={selectedChannel}
          onChange={(v) => v && setSelectedChannel(v)}
        />
        <JmButton
          size="xs"
          onClick={() => setAddOpen(true)}
          disabled={!selectedChannel}
        >
          <Plus className="mr-1 h-3 w-3" />
          매핑 추가
        </JmButton>
      </div>

      <JmTable className="min-w-[800px]">
        <JmTableHeader>
          <JmTableRow>
            <JmTableHead className="w-[180px]">채널 SKU</JmTableHead>
            <JmTableHead>채널 상품명 (참고)</JmTableHead>
            <JmTableHead>ERP 상품</JmTableHead>
            <JmTableHead className="w-[140px]">ERP SKU</JmTableHead>
            <JmTableHead className="w-[80px]" />
          </JmTableRow>
        </JmTableHeader>
        <JmTableBody>
          {mappingsQuery.isPending ? (
            Array.from({ length: 4 }).map((_, i) => (
              <JmTableRow key={i}>
                {Array.from({ length: 5 }).map((_, j) => (
                  <JmTableCell key={j}>
                    <JmSkeleton className="h-4 w-full" />
                  </JmTableCell>
                ))}
              </JmTableRow>
            ))
          ) : (mappingsQuery.data ?? []).length === 0 ? (
            <JmTableRow className="hover:bg-transparent">
              <JmTableCell colSpan={5} className="py-12">
                <JmEmpty
                  icon={<Package className="size-6" />}
                  title="등록된 매핑이 없습니다"
                  description="채널 SKU 를 ERP 상품에 연결하면 import 시 자동으로 주문 항목이 매칭됩니다. [매핑 추가] 로 시작하세요."
                />
              </JmTableCell>
            </JmTableRow>
          ) : (
            (mappingsQuery.data ?? []).map((m) => {
              const isMulti = m.components.length > 0;
              return (
                <JmTableRow key={m.id}>
                  <JmTableCell className="font-mono text-jm-xs">
                    {m.channelSku}
                    {isMulti && (
                      <JmBadge variant="default" className="ml-1.5">
                        다중 ×{m.components.length}
                      </JmBadge>
                    )}
                  </JmTableCell>
                  <JmTableCell className="text-jm-xs text-[var(--jm-text-muted)]">
                    {m.channelName ?? "—"}
                  </JmTableCell>
                  <JmTableCell className="text-jm-sm">
                    {isMulti ? (
                      <div className="flex flex-col gap-0.5">
                        {m.components.map((c) => (
                          <span key={c.id}>
                            {c.product.name}{" "}
                            <span className="text-[var(--jm-text-muted)]">
                              × {Number(c.quantity).toLocaleString("ko-KR")}
                            </span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      m.product?.name ?? "—"
                    )}
                  </JmTableCell>
                  <JmTableCell className="font-mono text-jm-xs text-[var(--jm-text-muted)]">
                    {isMulti ? (
                      <div className="flex flex-col gap-0.5">
                        {m.components.map((c) => (
                          <span key={c.id}>{c.product.sku}</span>
                        ))}
                      </div>
                    ) : (
                      m.product?.sku ?? "—"
                    )}
                  </JmTableCell>
                  <JmTableCell>
                    <JmIconButton
                      size="sm"
                      variant="ghost"
                      aria-label="매핑 삭제"
                      onClick={() => {
                        if (!confirm("이 매핑을 삭제하시겠습니까?")) return;
                        deleteMutation.mutate(m.id);
                      }}
                      disabled={
                        deleteMutation.isPending &&
                        deleteMutation.variables === m.id
                      }
                    >
                      {deleteMutation.isPending &&
                      deleteMutation.variables === m.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </JmIconButton>
                  </JmTableCell>
                </JmTableRow>
              );
            })
          )}
        </JmTableBody>
      </JmTable>

      {selectedChannel && (
        <AddMappingDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          channelId={selectedChannel}
          onCreated={() =>
            queryClient.invalidateQueries({
              queryKey: queryKeys.channels.mappings(selectedChannel),
            })
          }
        />
      )}
    </div>
  );
}

function AddMappingDialog({
  open,
  onOpenChange,
  channelId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  channelId: string;
  onCreated: () => void;
}) {
  type MappingMode = "single" | "multi";
  const [mode, setMode] = useState<MappingMode>("single");
  const [channelSku, setChannelSku] = useState("");
  const [channelName, setChannelName] = useState("");
  const [productId, setProductId] = useState("");
  // 옵션값 매핑 — single 모드 한정. 채널 SKU 가 ERP 옵션값 (특정 색상/사이즈) 에 해당
  const [productOptionValueId, setProductOptionValueId] = useState<string>("");
  // 다중 매핑용 — components 배열. lineRole 로 메인+옵션+추가구매 동시 매핑 가능.
  //   MAIN: 기본 라인 (세트 풀이 또는 메인 상품)
  //   OPTION: 옵션 매핑된 라인 (OrderItem.lineRole=OPTION_REF)
  //   ADDON: 추가구매 (사은품 등). OrderItem.lineRole=ADDON
  // 모두 MAIN 이면 기존 세트 풀이 동작 유지.
  type ComponentRole = "MAIN" | "OPTION" | "ADDON";
  const [components, setComponents] = useState<
    Array<{ productId: string; quantity: string; lineRole: ComponentRole }>
  >([{ productId: "", quantity: "1", lineRole: "MAIN" }]);

  const productsQuery = useQuery({
    queryKey: queryKeys.products.list({ for: "mapping" }),
    queryFn: () => apiGet<ProductOption[]>("/api/products?isBulk=all&includeHidden=1"),
    enabled: open,
  });
  const products = productsQuery.data ?? [];

  // 선택된 productId 의 옵션 슬롯 fetch — productOptionValueId picker 데이터 source
  const selectedProductOptionsQuery = useQuery<
    Array<{
      id: string;
      name: string;
      values: Array<{
        id: string;
        label: string;
        mappedMode: "SWAP" | "ADDON";
        mappedProduct: { id: string; name: string; sku: string } | null;
      }>;
    }>
  >({
    queryKey: ["product-options", productId],
    queryFn: () => apiGet(`/api/products/${productId}/options`),
    enabled: open && mode === "single" && !!productId,
  });
  const optionSlots = selectedProductOptionsQuery.data ?? [];
  const hasOptions = optionSlots.length > 0;

  const reset = () => {
    setMode("single");
    setChannelSku("");
    setChannelName("");
    setProductId("");
    setProductOptionValueId("");
    setComponents([{ productId: "", quantity: "1", lineRole: "MAIN" }]);
  };

  const createMutation = useMutation({
    mutationFn: () => {
      const body =
        mode === "single"
          ? {
              channelSku: channelSku.trim(),
              channelName: channelName.trim() || undefined,
              productId,
              productOptionValueId: productOptionValueId || undefined,
            }
          : {
              channelSku: channelSku.trim(),
              channelName: channelName.trim() || undefined,
              components: components
                .filter((c) => c.productId)
                .map((c) => ({
                  productId: c.productId,
                  quantity: parseFloat(c.quantity) || 1,
                  lineRole: c.lineRole,
                })),
            };
      return apiMutate(`/api/channels/${channelId}/mappings`, "POST", body);
    },
    onSuccess: () => {
      toast.success("매핑이 추가되었습니다");
      reset();
      onOpenChange(false);
      onCreated();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "추가 실패"),
  });

  const handleSubmit = () => {
    if (!channelSku.trim()) {
      toast.error("채널 SKU 를 입력해주세요");
      return;
    }
    if (mode === "single") {
      if (!productId) {
        toast.error("ERP 상품을 선택해주세요");
        return;
      }
    } else {
      const valid = components.filter((c) => c.productId);
      if (valid.length === 0) {
        toast.error("최소 1개 ERP 상품을 추가해주세요");
        return;
      }
      for (const c of valid) {
        const q = parseFloat(c.quantity);
        if (!Number.isFinite(q) || q <= 0) {
          toast.error("수량은 0보다 커야 합니다");
          return;
        }
      }
    }
    createMutation.mutate();
  };

  return (
    <JmDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <JmDialogContent size="lg">
        <JmDialogHeader>
          <JmDialogTitle>SKU 매핑 추가</JmDialogTitle>
        </JmDialogHeader>
        <JmDialogBody className="space-y-3">
          {/* 모드 토글 */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("single")}
              className={`flex-1 rounded-md border px-3 py-2 text-jm-xs transition-colors ${
                mode === "single"
                  ? "border-[var(--jm-action)] bg-[var(--jm-accent-bg)] font-medium"
                  : "border-[var(--jm-border)] bg-[var(--jm-bg)] hover:border-[var(--jm-border-strong)]"
              }`}
            >
              <div className="font-medium text-[var(--jm-text)]">단일 매핑</div>
              <div className="text-jm-2xs text-[var(--jm-text-muted)]">
                채널 SKU 1개 → ERP 상품 1개
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMode("multi")}
              className={`flex-1 rounded-md border px-3 py-2 text-jm-xs transition-colors ${
                mode === "multi"
                  ? "border-[var(--jm-action)] bg-[var(--jm-accent-bg)] font-medium"
                  : "border-[var(--jm-border)] bg-[var(--jm-bg)] hover:border-[var(--jm-border-strong)]"
              }`}
            >
              <div className="font-medium text-[var(--jm-text)]">
                다중 매핑 (세트)
              </div>
              <div className="text-jm-2xs text-[var(--jm-text-muted)]">
                채널 SKU 1개 → ERP 상품 N개
              </div>
            </button>
          </div>

          <JmFormField label="채널 SKU">
            <JmInput
              size="sm"
              value={channelSku}
              onChange={(e) => setChannelSku(e.target.value)}
              placeholder="채널이 보내는 상품 코드"
            />
          </JmFormField>
          <JmFormField
            label={
              <>
                채널 상품명{" "}
                <span className="text-[var(--jm-text-subtle)]">
                  (참고용, 선택)
                </span>
              </>
            }
          >
            <JmInput
              size="sm"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="채널 측 표시명 (안 적어도 됨)"
            />
          </JmFormField>

          {mode === "single" ? (
            <>
              <JmFormField label="ERP 상품">
                <ProductCombobox
                  products={products}
                  value={productId}
                  onChange={(p) => {
                    setProductId(p.id);
                    setProductOptionValueId(""); // 상품 변경 시 옵션 선택 리셋
                  }}
                  filterType="component"
                  placeholder="ERP 상품 선택..."
                />
              </JmFormField>
              {/* 옵션값 매핑 — 선택된 상품에 옵션 슬롯이 있을 때만 노출 */}
              {hasOptions && (
                <JmFormField
                  label={
                    <>
                      옵션값 매핑{" "}
                      <span className="text-[var(--jm-text-subtle)]">
                        (선택사항 — 채널 SKU 가 특정 옵션값에 해당할 때)
                      </span>
                    </>
                  }
                  hint="선택 시 import 된 OrderItem 의 productId 가 옵션값의 매핑된 SKU 로 적용됨 (SWAP 모드). optionSnapshot 도 자동 채움. entryProductId = 위 ERP 상품 (funnel)."
                >
                  <JmSelect
                    size="sm"
                    value={productOptionValueId}
                    onChange={(v) => setProductOptionValueId(v)}
                    options={[
                      { value: "", label: "— 매핑 안 함 (대표 상품 그대로) —" },
                      ...optionSlots.flatMap((slot) =>
                        slot.values.map((v) => ({
                          value: v.id,
                          label: `${slot.name}: ${v.label}${
                            v.mappedProduct ? ` → ${v.mappedProduct.name}` : ""
                          }${v.mappedMode ? ` [${v.mappedMode}]` : ""}`,
                        })),
                      ),
                    ]}
                  />
                </JmFormField>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <label className="text-jm-xs font-medium text-[var(--jm-text-muted)]">
                ERP 상품 구성 (채널 SKU 1개당)
              </label>
              <div className="space-y-1.5">
                {components.map((c, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <div className="w-[78px]">
                      <JmSelect<ComponentRole>
                        size="sm"
                        className="w-full"
                        value={c.lineRole}
                        onChange={(v) => {
                          const next = [...components];
                          next[idx] = {
                            ...next[idx],
                            lineRole: v,
                          };
                          setComponents(next);
                        }}
                        options={[
                          { value: "MAIN", label: "메인" },
                          { value: "OPTION", label: "옵션" },
                          { value: "ADDON", label: "추가" },
                        ]}
                      />
                    </div>
                    <div className="flex-1">
                      <ProductCombobox
                        products={products}
                        value={c.productId}
                        onChange={(p) => {
                          const next = [...components];
                          next[idx] = { ...next[idx], productId: p.id };
                          setComponents(next);
                        }}
                        filterType="component"
                        placeholder="ERP 상품 선택..."
                      />
                    </div>
                    <div className="w-[60px]">
                      <JmInput
                        size="sm"
                        value={c.quantity}
                        onChange={(e) => {
                          const next = [...components];
                          next[idx] = { ...next[idx], quantity: e.target.value };
                          setComponents(next);
                        }}
                        placeholder="수량"
                        className="text-right"
                      />
                    </div>
                    <JmIconButton
                      variant="ghost"
                      size="sm"
                      aria-label="구성품 삭제"
                      className="h-9 w-9"
                      onClick={() =>
                        setComponents(components.filter((_, i) => i !== idx))
                      }
                      disabled={components.length === 1}
                    >
                      <Trash2 className="h-3 w-3" />
                    </JmIconButton>
                  </div>
                ))}
              </div>
              <JmButton
                variant="outline"
                size="xs"
                onClick={() =>
                  setComponents([
                    ...components,
                    { productId: "", quantity: "1", lineRole: "MAIN" },
                  ])
                }
              >
                <Plus className="mr-1 h-3 w-3" />
                구성품 추가
              </JmButton>
              <p className="text-jm-2xs text-[var(--jm-text-muted)]">
                <strong>메인</strong>: 기본 라인 (세트 풀이는 모두 메인) ·{" "}
                <strong>옵션</strong>: 옵션 매핑된 라인 (OrderItem.lineRole=OPTION_REF) ·{" "}
                <strong>추가</strong>: 추가구매·사은품 (OrderItem.lineRole=ADDON, 첫 메인의 자식 라인). 채널 raw 단가는 sellingPrice 비례로 분배.
              </p>
            </div>
          )}
        </JmDialogBody>
        <JmDialogFooter>
          <JmButton
            variant="outline"
            size="sm"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            취소
          </JmButton>
          <JmButton
            size="sm"
            onClick={handleSubmit}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Package className="mr-1 h-3 w-3" />
            )}
            추가
          </JmButton>
        </JmDialogFooter>
      </JmDialogContent>
    </JmDialog>
  );
}
