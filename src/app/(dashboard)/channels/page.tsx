"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Pencil, Settings2, Store, Trash2 } from "lucide-react";
import { ImageInput } from "@/components/image-input";
import { Skeleton } from "@/components/ui/skeleton";

function ChannelsSkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-8 w-8 rounded-md" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
          <TableCell><Skeleton className="h-5 w-12 rounded-md" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><div className="flex gap-1"><Skeleton className="h-8 w-8 rounded-md" /><Skeleton className="h-8 w-8 rounded-md" /></div></TableCell>
        </TableRow>
      ))}
    </>
  );
}
import { toast } from "sonner";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SalesChannel {
  id: string;
  name: string;
  code: string;
  commissionRate: string;
  isActive: boolean;
  memo: string | null;
  logoUrl: string | null;
  logoPath: string | null;
}

export default function ChannelsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<SalesChannel | null>(
    null
  );
  const [form, setForm] = useState({
    name: "",
    code: "",
    commissionRate: "0",
    memo: "",
    logoUrl: null as string | null,
    logoPath: null as string | null,
  });
  const [configChannel, setConfigChannel] = useState<SalesChannel | null>(null);

  const channelsQuery = useQuery({
    queryKey: queryKeys.channels.list(),
    // 관리 페이지는 비활성 채널도 표시 (재활성화/삭제 가능하게)
    queryFn: () => apiGet<SalesChannel[]>("/api/channels?includeInactive=1"),
  });
  const channels = channelsQuery.data ?? [];
  const loading = channelsQuery.isPending;
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.channels.all });

  const resetForm = () => {
    setForm({ name: "", code: "", commissionRate: "0", memo: "", logoUrl: null, logoPath: null });
    setEditingChannel(null);
  };

  const openEditDialog = (channel: SalesChannel) => {
    setEditingChannel(channel);
    setForm({
      name: channel.name,
      code: channel.code,
      commissionRate: (parseFloat(channel.commissionRate) * 100).toString(),
      memo: channel.memo || "",
      logoUrl: channel.logoUrl,
      logoPath: channel.logoPath,
    });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const url = editingChannel ? `/api/channels/${editingChannel.id}` : "/api/channels";
      const method = editingChannel ? "PUT" : "POST";
      return apiMutate(url, method, form);
    },
    onSuccess: () => {
      toast.success(editingChannel ? "채널이 수정되었습니다" : "채널이 추가되었습니다");
      setDialogOpen(false);
      resetForm();
      refresh();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "저장에 실패했습니다"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/channels/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("채널이 삭제되었습니다");
      refresh();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "삭제에 실패했습니다"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate();
  };

  const handleDelete = (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    deleteMutation.mutate(id);
  };

  return (
    <>
      <div className="flex h-full flex-col">
        <DataTableToolbar
          onRefresh={refresh}
          onAdd={() => setDialogOpen(true)}
          addLabel="채널 추가"
          loading={loading}
        />
        <ScrollArea className="flex-1 min-h-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">로고</TableHead>
                <TableHead>채널명</TableHead>
                <TableHead>코드</TableHead>
                <TableHead>수수료율</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>메모</TableHead>
                <TableHead className="w-[100px]">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <ChannelsSkeletonRows />
              ) : channels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    등록된 채널이 없습니다
                  </TableCell>
                </TableRow>
              ) : (
                channels.map((channel) => (
                  <TableRow key={channel.id}>
                    <TableCell>
                      {channel.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={channel.logoUrl}
                          alt=""
                          className="h-8 w-8 rounded object-contain bg-card border border-border"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded border border-border bg-muted flex items-center justify-center">
                          <Store className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{channel.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{channel.code}</Badge>
                    </TableCell>
                    <TableCell>
                      {(parseFloat(channel.commissionRate) * 100).toFixed(2)}%
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={channel.isActive ? "default" : "secondary"}
                      >
                        {channel.isActive ? "활성" : "비활성"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {channel.memo || "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setConfigChannel(channel)}
                          title="운영 정책 설정"
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(channel)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(channel.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingChannel ? "채널 수정" : "새 채널 추가"}
            </DialogTitle>
          </DialogHeader>
          {!editingChannel && (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground">
              <strong className="text-foreground">외부 판매채널 전용</strong> —
              쿠팡·네이버 등. 오프라인·POS·매장 판매는 등록 불필요 (channelId=null
              로 자동 처리). 코드 OFFLINE/POS/STORE/MANUAL/INTERNAL/EXTERNAL 은 예약어로 거부됩니다.
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>로고</Label>
              <ImageInput
                value={form.logoUrl}
                onChange={(url) => setForm((prev) => ({ ...prev, logoUrl: url }))}
                onPathChange={(path) => setForm((prev) => ({ ...prev, logoPath: path }))}
                context="channel"
                allowSvgRaw
                size={64}
              />
              <p className="text-[11px] text-muted-foreground">JPG/PNG/WebP/SVG · 최대 5MB</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">채널명</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value })
                }
                placeholder="예: 쿠팡"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">채널 코드</Label>
              <Input
                id="code"
                value={form.code}
                onChange={(e) =>
                  setForm({ ...form, code: e.target.value.toUpperCase() })
                }
                placeholder="예: COUPANG"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="commissionRate">수수료율 (%)</Label>
              <Input
                id="commissionRate"
                type="number"
                step="0.01"
                value={form.commissionRate}
                onChange={(e) =>
                  setForm({ ...form, commissionRate: e.target.value })
                }
                placeholder="예: 10.8"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="memo">메모</Label>
              <Textarea
                id="memo"
                value={form.memo}
                onChange={(e) =>
                  setForm({ ...form, memo: e.target.value })
                }
              />
            </div>
            <DialogFooter>
              <Button type="submit">
                {editingChannel ? "수정" : "추가"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ChannelConfigDialog
        channel={configChannel}
        onClose={() => setConfigChannel(null)}
      />
    </>
  );
}

interface ChannelConfig {
  pollingMinutes?: number;
  shipDateOffsetDays?: number;
  autoStockSync?: boolean;
  autoTrackingPush?: boolean;
  pendingThreshold?: number;
}

/**
 * 채널 운영 정책 다이얼로그.
 * - 자동 재고 sync / 송장 자동 push 토글
 * - polling 간격, 출고 예정일 offset, 보류 큐 임계값 숫자 입력
 * - PATCH /api/channels/[id]/config 으로 저장 (병합 형태)
 */
function ChannelConfigDialog({
  channel,
  onClose,
}: {
  channel: SalesChannel | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const open = !!channel;
  const configQuery = useQuery({
    queryKey: ["channel-config", channel?.id],
    queryFn: () =>
      apiGet<{ id: string; name: string; code: string; config: ChannelConfig | null }>(
        `/api/channels/${channel!.id}/config`,
      ),
    enabled: open,
  });

  const [autoStockSync, setAutoStockSync] = useState(false);
  const [autoTrackingPush, setAutoTrackingPush] = useState(true);
  const [pollingMinutes, setPollingMinutes] = useState("10");
  const [shipDateOffsetDays, setShipDateOffsetDays] = useState("1");
  const [pendingThreshold, setPendingThreshold] = useState("5");

  // config fetch 후 폼 prefill — channel 변경 또는 query 데이터 갱신 시
  useEffect(() => {
    const cfg = configQuery.data?.config ?? null;
    if (!cfg) return;
    setAutoStockSync(!!cfg.autoStockSync);
    setAutoTrackingPush(cfg.autoTrackingPush !== false);
    if (typeof cfg.pollingMinutes === "number")
      setPollingMinutes(String(cfg.pollingMinutes));
    if (typeof cfg.shipDateOffsetDays === "number")
      setShipDateOffsetDays(String(cfg.shipDateOffsetDays));
    if (typeof cfg.pendingThreshold === "number")
      setPendingThreshold(String(cfg.pendingThreshold));
  }, [configQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/channels/${channel!.id}/config`, "PATCH", {
        autoStockSync,
        autoTrackingPush,
        pollingMinutes: parseInt(pollingMinutes, 10) || 10,
        shipDateOffsetDays: parseInt(shipDateOffsetDays, 10) || 0,
        pendingThreshold: parseInt(pendingThreshold, 10) || 0,
      }),
    onSuccess: () => {
      toast.success("운영 정책이 저장되었습니다");
      queryClient.invalidateQueries({ queryKey: ["channel-config", channel?.id] });
      onClose();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            운영 정책 — {channel?.name ?? ""}
          </DialogTitle>
        </DialogHeader>
        {configQuery.isPending ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <ToggleRow
              label="송장 자동 push"
              hint="발송 처리 시 채널에 송장번호 자동 통보 (어댑터 지원 시)"
              value={autoTrackingPush}
              onChange={setAutoTrackingPush}
            />
            <ToggleRow
              label="재고 자동 sync"
              hint="재고 변동 시 채널에 가용 재고 자동 push (단일·세트 매핑 모두)"
              value={autoStockSync}
              onChange={setAutoStockSync}
            />
            <div className="grid grid-cols-3 gap-3">
              <NumField
                label="Polling (분)"
                hint="cron 호출 간격"
                value={pollingMinutes}
                onChange={setPollingMinutes}
              />
              <NumField
                label="출고 offset (일)"
                hint="주문일 + N일"
                value={shipDateOffsetDays}
                onChange={setShipDateOffsetDays}
              />
              <NumField
                label="보류 큐 임계값"
                hint="N건 초과 시 매장 알림"
                value={pendingThreshold}
                onChange={setPendingThreshold}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            닫기
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={configQuery.isPending || saveMutation.isPending}
          >
            {saveMutation.isPending && (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            )}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex w-full items-start gap-3 rounded-md border border-border p-3 text-left transition-colors hover:bg-muted/50"
    >
      <div
        className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          value ? "bg-cta" : "bg-muted"
        }`}
      >
        <span
          className={`size-4 rounded-full bg-background transition-transform ${
            value ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {hint && (
          <span className="text-xs text-muted-foreground">{hint}</span>
        )}
      </div>
    </button>
  );
}

function NumField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
      />
      {hint && (
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      )}
    </div>
  );
}
