"use client";

import { useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Download,
  Loader2,
  Package,
  Plus,
  RefreshCw,
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

interface MappingRow {
  id: string;
  channelSku: string;
  channelName: string | null;
  product: { id: string; name: string; sku: string };
  updatedAt: string;
}

interface PendingRow {
  id: string;
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
    items?: Array<{ channelSku: string; quantity: number }>;
  };
  createdAt: string;
  channel: { id: string; name: string; code: string };
  resolvedOrderId: string | null;
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
          );
        })}
      </div>
    </div>
  );
}

// ─────────── 보류 큐

function PendingSection({ channels }: { channels: Channel[] }) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"" | PendingRow["status"]>("");
  const [channelFilter, setChannelFilter] = useState<string>("");

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
        매핑 누락 항목은 SKU 매핑 탭에서 매핑을 등록한 뒤 [변환] 클릭. 매핑이
        여전히 누락이면 reason 만 갱신되고 보류 유지.
      </p>
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
            (mappingsQuery.data ?? []).map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-mono text-[12px]">
                  {m.channelSku}
                </TableCell>
                <TableCell className="text-[12px] text-muted-foreground">
                  {m.channelName ?? "—"}
                </TableCell>
                <TableCell className="text-[13px]">{m.product.name}</TableCell>
                <TableCell className="font-mono text-[12px] text-muted-foreground">
                  {m.product.sku}
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
            ))
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
  const [channelSku, setChannelSku] = useState("");
  const [channelName, setChannelName] = useState("");
  const [productId, setProductId] = useState("");

  const productsQuery = useQuery({
    queryKey: queryKeys.products.list({ for: "mapping" }),
    queryFn: () => apiGet<ProductOption[]>("/api/products?isBulk=all"),
    enabled: open,
  });
  const products = productsQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/channels/${channelId}/mappings`, "POST", {
        channelSku: channelSku.trim(),
        channelName: channelName.trim() || undefined,
        productId,
      }),
    onSuccess: () => {
      toast.success("매핑이 추가되었습니다");
      setChannelSku("");
      setChannelName("");
      setProductId("");
      onOpenChange(false);
      onCreated();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "추가 실패"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>SKU 매핑 추가</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 px-1">
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
          <div className="space-y-1.5">
            <Label className="text-[12px]">ERP 상품</Label>
            <ProductCombobox
              products={products}
              value={productId}
              onChange={(p) => setProductId(p.id)}
              filterType="component"
              placeholder="ERP 상품 선택..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={() => {
              if (!channelSku.trim() || !productId) {
                toast.error("채널 SKU 와 ERP 상품을 모두 선택해주세요");
                return;
              }
              createMutation.mutate();
            }}
            disabled={createMutation.isPending}
          >
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
