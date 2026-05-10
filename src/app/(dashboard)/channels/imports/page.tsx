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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  "secondary" | "destructive" | "default" | "outline"
> = {
  UNMAPPED_SKU: "destructive",
  VALIDATION_FAILED: "destructive",
  DUPLICATE: "secondary",
  RESOLVED: "default",
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
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-3">
        <h1 className="text-base font-semibold">외부 채널 Import</h1>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          외부 채널의 주문을 ERP 로 가져오고, SKU 매핑·보류 큐를 관리합니다. (Phase
          1 — Mock 어댑터로 dev 검증 가능, 실 채널은 가입 후 어댑터 추가)
        </p>
      </div>

      <StatsBar />

      <Tabs defaultValue="trigger" className="flex flex-1 flex-col">
        <div className="border-b border-border px-5 py-2">
          <TabsList>
            <TabsTrigger value="trigger">Import 트리거</TabsTrigger>
            <TabsTrigger value="pending">보류 큐</TabsTrigger>
            <TabsTrigger value="mappings">SKU 매핑</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="trigger" className="flex-1 overflow-auto p-5">
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
        </TabsContent>

        <TabsContent value="pending" className="flex-1 overflow-auto p-5">
          <PendingSection channels={channels} />
        </TabsContent>

        <TabsContent value="mappings" className="flex-1 overflow-auto p-5">
          <MappingSection channels={channels} />
        </TabsContent>
      </Tabs>
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
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-8 text-center text-[13px] text-muted-foreground">
        활성 채널이 없습니다. 먼저 채널 페이지에서 채널을 등록하세요.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[12px] text-muted-foreground">
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
              className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
            >
              <div className="flex flex-col">
                <span className="text-[14px] font-medium">{c.name}</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {c.code}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={() => setConfigChannelId(c.id)}
                  title="설정"
                >
                  <Settings className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  onClick={() => importMutation.mutate(c.id)}
                  disabled={isPending}
                >
                  {isPending ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="mr-1 h-3 w-3" />
                  )}
                  Import 실행
                </Button>
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
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            채널 설정 {configQuery.data ? `· ${configQuery.data.name}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-1 py-2">
          <p className="text-[12px] text-muted-foreground">
            운영 정책 (credentials 는 보안상 환경변수에서 관리)
          </p>

          <div className="space-y-1.5">
            <Label className="text-[12px]">Polling 간격 (분)</Label>
            <Input
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
            <p className="text-[11px] text-muted-foreground">
              cron 라우트 호출 간격. 채널 rate limit 고려해 설정
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[12px]">출고 예정일 offset (일)</Label>
            <Input
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
            <p className="text-[11px] text-muted-foreground">
              채널 정책상 주문일 기준 출고 시한
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[12px]">보류 큐 알림 임계값</Label>
            <Input
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
            <p className="text-[11px] text-muted-foreground">
              매핑 누락 보류가 이 수 초과 시 매장에 알림
            </p>
          </div>

          <div className="space-y-2 rounded-md border border-border bg-muted/30 p-2.5">
            <label className="flex cursor-pointer items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-[13px] font-medium">자동 송장 push</span>
                <span className="text-[11px] text-muted-foreground">
                  ERP [발송] 시 채널에 송장 자동 통보
                </span>
              </div>
              <input
                type="checkbox"
                checked={form.autoTrackingPush ?? true}
                onChange={(e) =>
                  setForm({ ...form, autoTrackingPush: e.target.checked })
                }
                className="size-4"
              />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-2 border-t border-border pt-2">
              <div className="flex flex-col">
                <span className="text-[13px] font-medium">자동 재고 sync</span>
                <span className="text-[11px] text-muted-foreground">
                  Inventory 변동 시 채널에 가용 재고 push (Phase 2 필요)
                </span>
              </div>
              <input
                type="checkbox"
                checked={form.autoStockSync ?? false}
                onChange={(e) =>
                  setForm({ ...form, autoStockSync: e.target.checked })
                }
                className="size-4"
              />
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending && (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            )}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={statusFilter || "all"}
          onValueChange={(v) => {
            if (!v || v === "all") setStatusFilter("");
            else setStatusFilter(v as PendingRow["status"]);
          }}
        >
          <SelectTrigger className="h-8 w-[180px] text-[12px]">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            <SelectItem value="UNMAPPED_SKU">매핑 누락</SelectItem>
            <SelectItem value="DUPLICATE">중복</SelectItem>
            <SelectItem value="RESOLVED">변환됨</SelectItem>
            <SelectItem value="DISCARDED">버림</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={channelFilter || "all"}
          onValueChange={(v) => setChannelFilter(!v || v === "all" ? "" : v)}
        >
          <SelectTrigger className="h-8 w-[180px] text-[12px]">
            <SelectValue placeholder="채널" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 채널</SelectItem>
            {channels.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => pendingQuery.refetch()}
          disabled={pendingQuery.isFetching}
          className="h-8"
        >
          <RefreshCw
            className={`h-3 w-3 ${pendingQuery.isFetching ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      <Table className="min-w-[1000px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[120px]">상태</TableHead>
            <TableHead className="w-[140px]">채널</TableHead>
            <TableHead className="w-[180px]">채널주문번호</TableHead>
            <TableHead>손님 / 항목</TableHead>
            <TableHead>사유</TableHead>
            <TableHead className="w-[110px]">접수일</TableHead>
            <TableHead className="w-[200px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {pendingQuery.isPending ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 7 }).map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (pendingQuery.data ?? []).length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-[13px]">
                보류 항목이 없습니다
              </TableCell>
            </TableRow>
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
                <TableRow key={p.id}>
                  <TableCell>
                    <Badge variant={PENDING_STATUS_VARIANT[p.status]}>
                      {PENDING_STATUS_LABEL[p.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[13px]">{p.channel.name}</TableCell>
                  <TableCell className="font-mono text-[12px]">
                    {p.channelOrderNo}
                  </TableCell>
                  <TableCell className="text-[12px]">
                    <div className="flex flex-col">
                      <span>{buyer}</span>
                      <span className="text-muted-foreground">
                        {itemSummary}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-[12px] text-muted-foreground">
                    {p.reason ?? "—"}
                  </TableCell>
                  <TableCell className="text-[12px] text-muted-foreground">
                    {new Date(p.createdAt).toLocaleDateString("ko-KR")}
                  </TableCell>
                  <TableCell>
                    {isOpen ? (
                      <div className="flex justify-end gap-1">
                        {p.status === "UNMAPPED_SKU" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[12px]"
                            onClick={() => setSuggestionTarget(p)}
                          >
                            <Sparkles className="mr-0.5 h-3 w-3" />
                            추천
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[12px]"
                          onClick={() => discardMutation.mutate(p.id)}
                          disabled={isDiscarding || isResolving}
                        >
                          {isDiscarding ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : null}
                          버림
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-[12px]"
                          onClick={() => resolveMutation.mutate(p.id)}
                          disabled={isResolving || isDiscarding}
                        >
                          {isResolving ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : null}
                          변환
                        </Button>
                      </div>
                    ) : p.resolvedOrderId ? (
                      <a
                        href={`/orders?id=${p.resolvedOrderId}`}
                        className="text-[12px] text-primary underline-offset-2 hover:underline"
                      >
                        주문 보기 →
                      </a>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <p className="text-[11px] text-muted-foreground">
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
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            매핑 추천 {target ? `· ${target.channelOrderNo}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-auto px-1">
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
        </div>
        <DialogFooter>
          <p className="mr-auto text-[11px] text-muted-foreground">
            매핑 등록 후 닫고 [변환] 버튼으로 정식 주문 승격
          </p>
          <Button variant="outline" onClick={onClose}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    <div className="rounded-md border border-border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex flex-col">
          <span className="font-mono text-[13px] font-medium">{channelSku}</span>
          {channelProductName && (
            <span className="text-[11px] text-muted-foreground">
              채널명: {channelProductName} · 수량 {quantity}
            </span>
          )}
        </div>
        {mapped && (
          <Badge variant="default">
            <CheckCircle2 className="mr-0.5 h-3 w-3" />
            매핑됨
          </Badge>
        )}
      </div>
      {!mapped && (
        <div className="mt-2 space-y-1">
          {suggestionsQuery.isPending ? (
            <Skeleton className="h-12 w-full" />
          ) : (suggestionsQuery.data ?? []).length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              자동 추천 결과 없음 — SKU 매핑 탭에서 직접 등록하세요
            </p>
          ) : (
            (suggestionsQuery.data ?? []).map((s) => {
              const isThisPending =
                mapMutation.isPending && mapMutation.variables === s.productId;
              return (
                <div
                  key={s.productId}
                  className="flex items-center justify-between gap-2 rounded border border-border-subtle p-2 text-[12px]"
                >
                  <div className="flex flex-1 flex-col">
                    <span className="text-foreground">{s.productName}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {s.productSku} · {s.reason}
                    </span>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {s.score}점
                  </Badge>
                  <Button
                    size="sm"
                    className="h-7 shrink-0 text-[12px]"
                    onClick={() => mapMutation.mutate(s.productId)}
                    disabled={mapMutation.isPending}
                  >
                    {isThisPending ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : null}
                    매핑
                  </Button>
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
    <div className="border-b border-border bg-muted/30 px-5 py-2.5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={<AlertCircle className="h-3.5 w-3.5" />}
          label="매핑 누락 보류"
          value={data?.pendingByStatus.UNMAPPED_SKU ?? 0}
          loading={statsQuery.isPending}
          tone={
            (data?.pendingByStatus.UNMAPPED_SKU ?? 0) > 0
              ? "warning"
              : "default"
          }
        />
        <StatCard
          icon={<Inbox className="h-3.5 w-3.5" />}
          label="최근 7일 import"
          value={data?.last7Days.imported ?? 0}
          loading={statsQuery.isPending}
        />
        <StatCard
          icon={<Sparkles className="h-3.5 w-3.5" />}
          label="최근 7일 변환됨"
          value={data?.last7Days.resolved ?? 0}
          loading={statsQuery.isPending}
        />
        <StatCard
          icon={<Package className="h-3.5 w-3.5" />}
          label="전체 보류"
          value={
            (data?.pendingByStatus.UNMAPPED_SKU ?? 0) +
            (data?.pendingByStatus.VALIDATION_FAILED ?? 0)
          }
          loading={statsQuery.isPending}
        />
      </div>
      {data && data.missingSkuTop.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-muted-foreground">자주 누락 SKU:</span>
          {data.missingSkuTop.slice(0, 5).map((s) => (
            <Badge
              key={`${s.channelId}-${s.channelSku}`}
              variant="outline"
              className="font-mono"
            >
              {s.channelSku}
              <span className="ml-1 text-muted-foreground">×{s.count}</span>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  loading,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  loading: boolean;
  tone?: "default" | "warning";
}) {
  return (
    <div
      className={`rounded-md border bg-card p-2.5 ${
        tone === "warning"
          ? "border-[var(--jm-warning-bg, #fef3c7)]"
          : "border-border"
      }`}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={`mt-1 text-[18px] font-semibold tabular-nums ${
          tone === "warning" ? "text-amber-600 dark:text-amber-500" : ""
        }`}
      >
        {loading ? <Skeleton className="h-5 w-12" /> : value.toLocaleString("ko-KR")}
      </div>
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
      <div className="rounded-md border border-border bg-muted/30 p-8 text-center text-[13px] text-muted-foreground">
        활성 채널이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={selectedChannel}
          onValueChange={(v) => v && setSelectedChannel(v)}
        >
          <SelectTrigger className="h-8 w-[200px] text-[12px]">
            <SelectValue placeholder="채널" />
          </SelectTrigger>
          <SelectContent>
            {channels.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="h-8 text-[12px]"
          onClick={() => setAddOpen(true)}
          disabled={!selectedChannel}
        >
          <Plus className="mr-1 h-3 w-3" />
          매핑 추가
        </Button>
      </div>

      <Table className="min-w-[800px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">채널 SKU</TableHead>
            <TableHead>채널 상품명 (참고)</TableHead>
            <TableHead>ERP 상품</TableHead>
            <TableHead className="w-[140px]">ERP SKU</TableHead>
            <TableHead className="w-[80px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {mappingsQuery.isPending ? (
            Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 5 }).map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (mappingsQuery.data ?? []).length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-8 text-[13px]">
                등록된 매핑이 없습니다
              </TableCell>
            </TableRow>
          ) : (
            (mappingsQuery.data ?? []).map((m) => {
              const isMulti = m.components.length > 0;
              return (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-[12px]">
                    {m.channelSku}
                    {isMulti && (
                      <Badge variant="secondary" className="ml-1.5">
                        다중 ×{m.components.length}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-[12px] text-muted-foreground">
                    {m.channelName ?? "—"}
                  </TableCell>
                  <TableCell className="text-[13px]">
                    {isMulti ? (
                      <div className="flex flex-col gap-0.5">
                        {m.components.map((c) => (
                          <span key={c.id}>
                            {c.product.name}{" "}
                            <span className="text-muted-foreground">
                              × {Number(c.quantity).toLocaleString("ko-KR")}
                            </span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      m.product?.name ?? "—"
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-[12px] text-muted-foreground">
                    {isMulti ? (
                      <div className="flex flex-col gap-0.5">
                        {m.components.map((c) => (
                          <span key={c.id}>{c.product.sku}</span>
                        ))}
                      </div>
                    ) : (
                      m.product?.sku ?? "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
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
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

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
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>SKU 매핑 추가</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 px-1">
          {/* 모드 토글 */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("single")}
              className={`flex-1 rounded-md border px-3 py-2 text-[12px] transition-colors ${
                mode === "single"
                  ? "border-primary bg-primary/5 font-medium"
                  : "border-border bg-background hover:border-foreground/30"
              }`}
            >
              <div className="font-medium">단일 매핑</div>
              <div className="text-[11px] text-muted-foreground">
                채널 SKU 1개 → ERP 상품 1개
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMode("multi")}
              className={`flex-1 rounded-md border px-3 py-2 text-[12px] transition-colors ${
                mode === "multi"
                  ? "border-primary bg-primary/5 font-medium"
                  : "border-border bg-background hover:border-foreground/30"
              }`}
            >
              <div className="font-medium">다중 매핑 (세트)</div>
              <div className="text-[11px] text-muted-foreground">
                채널 SKU 1개 → ERP 상품 N개
              </div>
            </button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[12px]">채널 SKU</Label>
            <Input
              value={channelSku}
              onChange={(e) => setChannelSku(e.target.value)}
              placeholder="채널이 보내는 상품 코드"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">
              채널 상품명{" "}
              <span className="text-muted-foreground">(참고용, 선택)</span>
            </Label>
            <Input
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="채널 측 표시명 (안 적어도 됨)"
            />
          </div>

          {mode === "single" ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-[12px]">ERP 상품</Label>
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
              </div>
              {/* 옵션값 매핑 — 선택된 상품에 옵션 슬롯이 있을 때만 노출 */}
              {hasOptions && (
                <div className="space-y-1.5">
                  <Label className="text-[12px]">
                    옵션값 매핑{" "}
                    <span className="text-muted-foreground">
                      (선택사항 — 채널 SKU 가 특정 옵션값에 해당할 때)
                    </span>
                  </Label>
                  <select
                    value={productOptionValueId}
                    onChange={(e) => setProductOptionValueId(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-[13px]"
                  >
                    <option value="">— 매핑 안 함 (대표 상품 그대로) —</option>
                    {optionSlots.flatMap((slot) =>
                      slot.values.map((v) => (
                        <option key={v.id} value={v.id}>
                          {slot.name}: {v.label}
                          {v.mappedProduct ? ` → ${v.mappedProduct.name}` : ""}
                          {v.mappedMode ? ` [${v.mappedMode}]` : ""}
                        </option>
                      )),
                    )}
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    선택 시 import 된 OrderItem 의 productId 가 옵션값의 매핑된 SKU 로 적용됨 (SWAP 모드).
                    optionSnapshot 도 자동 채움. entryProductId = 위 ERP 상품 (funnel).
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <Label className="text-[12px]">
                ERP 상품 구성 (채널 SKU 1개당)
              </Label>
              <div className="space-y-1.5">
                {components.map((c, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <div className="w-[78px]">
                      <select
                        value={c.lineRole}
                        onChange={(e) => {
                          const next = [...components];
                          next[idx] = {
                            ...next[idx],
                            lineRole: e.target.value as ComponentRole,
                          };
                          setComponents(next);
                        }}
                        className="h-9 w-full rounded-md border border-input bg-transparent px-1.5 text-[12px]"
                        title="MAIN: 기본 라인 / OPTION: 옵션 매핑 / ADDON: 추가구매·사은품"
                      >
                        <option value="MAIN">메인</option>
                        <option value="OPTION">옵션</option>
                        <option value="ADDON">추가</option>
                      </select>
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
                      <Input
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0"
                      onClick={() =>
                        setComponents(components.filter((_, i) => i !== idx))
                      }
                      disabled={components.length === 1}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setComponents([
                    ...components,
                    { productId: "", quantity: "1", lineRole: "MAIN" },
                  ])
                }
              >
                <Plus className="mr-1 h-3 w-3" />
                구성품 추가
              </Button>
              <p className="text-[11px] text-muted-foreground">
                <strong>메인</strong>: 기본 라인 (세트 풀이는 모두 메인) ·{" "}
                <strong>옵션</strong>: 옵션 매핑된 라인 (OrderItem.lineRole=OPTION_REF) ·{" "}
                <strong>추가</strong>: 추가구매·사은품 (OrderItem.lineRole=ADDON, 첫 메인의 자식 라인). 채널 raw 단가는 sellingPrice 비례로 분배.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Package className="mr-1 h-3 w-3" />
            )}
            추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
