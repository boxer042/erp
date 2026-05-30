"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  JmButton,
  JmIconButton,
  JmInput,
  JmTextarea,
  JmBadge,
  JmSwitch,
  JmSkeleton,
  JmFormField,
  JmCard,
  JmTable,
  JmTableHeader,
  JmTableBody,
  JmTableRow,
  JmTableHead,
  JmTableCell,
  JmTableToolbar,
  JmTableToolbarActions,
  JmEmpty,
  JmDialog,
  JmDialogContent,
  JmDialogHeader,
  JmDialogTitle,
  JmDialogBody,
  JmDialogFooter,
  JmSpinner,
} from "@/jm";
import { Pencil, Plus, RefreshCw, Settings2, Store, Trash2 } from "lucide-react";
import { ImageInput } from "@/components/image-input";

function ChannelsSkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <JmTableRow key={i}>
          <JmTableCell><JmSkeleton className="h-8 w-8 rounded-md" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-32" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-20" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-12" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-5 w-12 rounded-md" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-32" /></JmTableCell>
          <JmTableCell><div className="flex gap-1"><JmSkeleton className="h-8 w-8 rounded-md" /><JmSkeleton className="h-8 w-8 rounded-md" /></div></JmTableCell>
        </JmTableRow>
      ))}
    </>
  );
}
import { toast } from "sonner";

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
      <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
        <div className="flex w-full flex-col gap-6 p-4">
          <JmCard className="overflow-hidden p-0">
            <JmTableToolbar>
              <JmTableToolbarActions>
                <JmIconButton
                  variant="ghost"
                  size="sm"
                  aria-label="새로고침"
                  onClick={refresh}
                  disabled={loading}
                >
                  <RefreshCw className={loading ? "animate-spin" : ""} />
                </JmIconButton>
                <JmButton size="sm" variant="cta" onClick={() => setDialogOpen(true)}>
                  <Plus />
                  <span>채널 추가</span>
                </JmButton>
              </JmTableToolbarActions>
            </JmTableToolbar>
            <JmTable className="min-w-[900px]">
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead className="w-[60px]">로고</JmTableHead>
                  <JmTableHead>채널명</JmTableHead>
                  <JmTableHead>코드</JmTableHead>
                  <JmTableHead>수수료율</JmTableHead>
                  <JmTableHead>상태</JmTableHead>
                  <JmTableHead>메모</JmTableHead>
                  <JmTableHead className="w-[100px]">관리</JmTableHead>
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {loading ? (
                  <ChannelsSkeletonRows />
                ) : channels.length === 0 ? (
                  <JmTableRow className="hover:bg-transparent">
                    <JmTableCell colSpan={7} className="py-12">
                      <JmEmpty
                        icon={<Store className="size-6" />}
                        title="등록된 채널이 없습니다"
                        description="쿠팡·네이버 등 외부 판매채널을 추가하세요."
                      />
                    </JmTableCell>
                  </JmTableRow>
                ) : (
                  channels.map((channel) => (
                  <JmTableRow key={channel.id}>
                    <JmTableCell>
                      {channel.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={channel.logoUrl}
                          alt=""
                          className="h-8 w-8 rounded object-contain bg-[var(--jm-surface)] border border-[var(--jm-border)]"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] flex items-center justify-center">
                          <Store className="h-4 w-4 text-[var(--jm-text-muted)]" />
                        </div>
                      )}
                    </JmTableCell>
                    <JmTableCell className="font-medium">{channel.name}</JmTableCell>
                    <JmTableCell>
                      <JmBadge variant="outline" shape="square">{channel.code}</JmBadge>
                    </JmTableCell>
                    <JmTableCell>
                      {(parseFloat(channel.commissionRate) * 100).toFixed(2)}%
                    </JmTableCell>
                    <JmTableCell>
                      <JmBadge variant={channel.isActive ? "solid" : "default"}>
                        {channel.isActive ? "활성" : "비활성"}
                      </JmBadge>
                    </JmTableCell>
                    <JmTableCell className="text-[var(--jm-text-muted)]">
                      {channel.memo || "-"}
                    </JmTableCell>
                    <JmTableCell>
                      <div className="flex gap-1">
                        <JmIconButton
                          variant="ghost"
                          size="sm"
                          aria-label="운영 정책 설정"
                          onClick={() => setConfigChannel(channel)}
                          title="운영 정책 설정"
                        >
                          <Settings2 className="h-4 w-4" />
                        </JmIconButton>
                        <JmIconButton
                          variant="ghost"
                          size="sm"
                          aria-label="수정"
                          onClick={() => openEditDialog(channel)}
                        >
                          <Pencil className="h-4 w-4" />
                        </JmIconButton>
                        <JmIconButton
                          variant="ghost"
                          size="sm"
                          aria-label="삭제"
                          onClick={() => handleDelete(channel.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </JmIconButton>
                      </div>
                    </JmTableCell>
                  </JmTableRow>
                ))
              )}
            </JmTableBody>
          </JmTable>
          </JmCard>
        </div>
      </div>

      <JmDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <JmDialogContent>
          <JmDialogHeader>
            <JmDialogTitle>
              {editingChannel ? "채널 수정" : "새 채널 추가"}
            </JmDialogTitle>
          </JmDialogHeader>
          <JmDialogBody>
            {!editingChannel && (
              <div className="rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] px-3 py-2 text-jm-xs text-[var(--jm-text-muted)]">
                <strong className="text-[var(--jm-text)]">외부 판매채널 전용</strong> —
                쿠팡·네이버 등. 오프라인·POS·매장 판매는 등록 불필요 (channelId=null
                로 자동 처리). 코드 OFFLINE/POS/STORE/MANUAL/INTERNAL/EXTERNAL 은 예약어로 거부됩니다.
              </div>
            )}
            <form id="channel-form" onSubmit={handleSubmit} className="space-y-4 mt-4">
              <JmFormField label="로고" hint="JPG/PNG/WebP/SVG · 최대 5MB">
                <ImageInput
                  value={form.logoUrl}
                  onChange={(url) => setForm((prev) => ({ ...prev, logoUrl: url }))}
                  onPathChange={(path) => setForm((prev) => ({ ...prev, logoPath: path }))}
                  context="channel"
                  allowSvgRaw
                  size={64}
                />
              </JmFormField>
              <JmFormField label="채널명" htmlFor="name">
                <JmInput
                  id="name"
                  value={form.name}
                  onChange={(e) =>
                    setForm({ ...form, name: e.target.value })
                  }
                  placeholder="예: 쿠팡"
                  required
                />
              </JmFormField>
              <JmFormField label="채널 코드" htmlFor="code">
                <JmInput
                  id="code"
                  value={form.code}
                  onChange={(e) =>
                    setForm({ ...form, code: e.target.value.toUpperCase() })
                  }
                  placeholder="예: COUPANG"
                  required
                />
              </JmFormField>
              <JmFormField label="수수료율 (%)" htmlFor="commissionRate">
                <JmInput
                  id="commissionRate"
                  type="number"
                  step="0.01"
                  value={form.commissionRate}
                  onChange={(e) =>
                    setForm({ ...form, commissionRate: e.target.value })
                  }
                  placeholder="예: 10.8"
                />
              </JmFormField>
              <JmFormField label="메모" htmlFor="memo">
                <JmTextarea
                  id="memo"
                  value={form.memo}
                  onChange={(e) =>
                    setForm({ ...form, memo: e.target.value })
                  }
                />
              </JmFormField>
            </form>
          </JmDialogBody>
          <JmDialogFooter>
            <JmButton type="submit" form="channel-form" variant="cta">
              {editingChannel ? "수정" : "추가"}
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>
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
    <JmDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <JmDialogContent>
        <JmDialogHeader>
          <JmDialogTitle>
            운영 정책 — {channel?.name ?? ""}
          </JmDialogTitle>
        </JmDialogHeader>
        <JmDialogBody>
          {configQuery.isPending ? (
            <div className="flex items-center justify-center py-10 text-[var(--jm-text-muted)]">
              <JmSpinner size="sm" />
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
        </JmDialogBody>
        <JmDialogFooter>
          <JmButton variant="outline" onClick={onClose}>
            닫기
          </JmButton>
          <JmButton
            variant="cta"
            onClick={() => saveMutation.mutate()}
            disabled={configQuery.isPending || saveMutation.isPending}
          >
            {saveMutation.isPending && (
              <JmSpinner size="sm" className="mr-1" />
            )}
            저장
          </JmButton>
        </JmDialogFooter>
      </JmDialogContent>
    </JmDialog>
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
    <label className="flex w-full cursor-pointer items-start gap-3 rounded-md border border-[var(--jm-border)] p-3 text-left transition-colors hover:bg-[var(--jm-surface-muted)]">
      <JmSwitch
        size="sm"
        checked={value}
        onCheckedChange={onChange}
        className="mt-0.5"
      />
      <div className="flex flex-col">
        <span className="text-jm-sm font-medium text-[var(--jm-text)]">{label}</span>
        {hint && (
          <span className="text-jm-xs text-[var(--jm-text-muted)]">{hint}</span>
        )}
      </div>
    </label>
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
    <JmFormField label={label} hint={hint}>
      <JmInput
        size="sm"
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
      />
    </JmFormField>
  );
}
