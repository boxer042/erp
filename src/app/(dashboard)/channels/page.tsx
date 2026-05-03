"use client";

import { useRef, useState } from "react";
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
import { Loader2, Pencil, Store, Trash2, Upload, X, Library } from "lucide-react";
import { MediaPickerDialog } from "@/components/media-picker-dialog";
import { ImageEditDialog } from "@/components/image-edit-dialog";
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
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const channelsQuery = useQuery({
    queryKey: queryKeys.channels.list(),
    queryFn: () => apiGet<SalesChannel[]>("/api/channels"),
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

  const uploadBlob = async (data: Blob | File, name: string) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", data, name);
      const res = await fetch("/api/channels/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "업로드 실패");
        return;
      }
      // 기존 로고 스토리지 삭제 X — /settings/media 에서 일괄 관리
      setForm((prev) => ({ ...prev, logoUrl: json.url, logoPath: json.path }));
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    if (file.type === "image/svg+xml") {
      uploadBlob(file, file.name);
      return;
    }
    setPendingFile(file);
  };

  const handleRemoveLogo = () => {
    // 스토리지 삭제는 /settings/media 에서 — 여기서는 분리만
    setForm((prev) => ({ ...prev, logoUrl: null, logoPath: null }));
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
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>로고</Label>
              <div className="flex items-center gap-3">
                {form.logoUrl ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form.logoUrl}
                      alt=""
                      className="h-16 w-16 rounded object-contain bg-card border border-border"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground inline-flex items-center justify-center"
                      aria-label="로고 제거"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="h-16 w-16 rounded border-2 border-dashed border-border flex items-center justify-center text-muted-foreground">
                    <Store className="h-5 w-5" />
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/svg+xml"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="flex flex-col gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5 mr-1" />
                    )}
                    {form.logoUrl ? "교체" : "업로드"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPickerOpen(true)}
                    disabled={uploading}
                  >
                    <Library className="h-3.5 w-3.5 mr-1" /> 라이브러리
                  </Button>
                </div>
              </div>
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
      <MediaPickerDialog
        open={pickerOpen}
        bucket="channel-logos"
        onSelect={({ url, path }) => {
          setForm((prev) => ({ ...prev, logoUrl: url, logoPath: path }));
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
      <ImageEditDialog
        open={pendingFile !== null}
        file={pendingFile}
        defaultAspect={16 / 9}
        onConfirm={async (blob, name) => {
          setPendingFile(null);
          await uploadBlob(blob, name);
        }}
        onCancel={() => setPendingFile(null)}
      />
    </>
  );
}
