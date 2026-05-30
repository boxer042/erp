"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { Loader2, Trash2, ExternalLink, ImageOff, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

interface UsageRef {
  kind: string;
  id: string;
  name: string;
  label: string;
}

interface MediaItem {
  bucket: string;
  path: string;
  name: string;
  url: string;
  size: number | null;
  createdAt: string | null;
  usages: UsageRef[];
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

function usageLabels(item: MediaItem): string[] {
  return Array.from(new Set(item.usages.map((u) => u.label)));
}

function MediaSkeleton({ count = 12 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="overflow-hidden p-0">
          <Skeleton className="aspect-square w-full rounded-none" />
          <CardContent className="p-2 space-y-1">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </CardContent>
        </Card>
      ))}
    </>
  );
}

const MEDIA_KEY = ["media", "library"] as const;

export default function MediaLibraryPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "used" | "unused">("all");
  const [search, setSearch] = useState("");
  const [refsTarget, setRefsTarget] = useState<MediaItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null);

  const listQuery = useQuery({
    queryKey: MEDIA_KEY,
    queryFn: () => apiGet<{ items: MediaItem[] }>(`/api/media/library`),
  });

  const deleteMutation = useMutation({
    mutationFn: (item: MediaItem) =>
      apiMutate("/api/media/purge", "DELETE", { bucket: item.bucket, path: item.path }),
    onSuccess: () => {
      toast.success("스토리지에서 삭제되었습니다");
      qc.invalidateQueries({ queryKey: MEDIA_KEY });
      setDeleteTarget(null);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        toast.error("사용 중인 이미지는 삭제할 수 없습니다");
      } else {
        toast.error(err instanceof ApiError ? err.message : "삭제 실패");
      }
      setDeleteTarget(null);
    },
  });

  const all = listQuery.data?.items ?? [];
  const filtered = all.filter((it) => {
    if (filter === "used" && it.usages.length === 0) return false;
    if (filter === "unused" && it.usages.length > 0) return false;
    if (search && !it.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const usedCount = all.filter((it) => it.usages.length > 0).length;
  const unusedCount = all.length - usedCount;

  return (
    <div className="flex h-full flex-col">
      <DataTableToolbar
        search={{
          value: search,
          onChange: setSearch,
          onSearch: () => {},
          placeholder: "파일명 검색...",
        }}
        loading={listQuery.isFetching}
        onRefresh={() => qc.invalidateQueries({ queryKey: MEDIA_KEY })}
        filters={
          <div className="flex h-[30px] rounded-md border border-border bg-card text-[13px] overflow-hidden">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 ${filter === "all" ? "bg-secondary" : "text-muted-foreground hover:bg-muted/50"}`}
            >
              전체 {all.length}
            </button>
            <button
              onClick={() => setFilter("used")}
              className={`px-3 ${filter === "used" ? "bg-secondary" : "text-muted-foreground hover:bg-muted/50"}`}
            >
              사용중 {usedCount}
            </button>
            <button
              onClick={() => setFilter("unused")}
              className={`px-3 ${filter === "unused" ? "bg-secondary" : "text-muted-foreground hover:bg-muted/50"}`}
            >
              미사용 {unusedCount}
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {listQuery.isPending ? (
            <MediaSkeleton />
          ) : filtered.length === 0 ? (
            <div className="col-span-full text-center py-16 text-muted-foreground text-sm">
              <ImageOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
              {search || filter !== "all" ? "조건에 맞는 이미지가 없습니다" : "업로드된 이미지가 없습니다"}
            </div>
          ) : (
            filtered.map((item) => {
              const isUnused = item.usages.length === 0;
              const labels = usageLabels(item);
              return (
                <Card key={`${item.bucket}/${item.path}`} className="overflow-hidden p-0 group">
                  <div className="relative aspect-square bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt={item.name}
                      className="w-full h-full object-contain"
                      loading="lazy"
                    />
                    {/* 상태 배지 */}
                    <div className="absolute top-1.5 left-1.5">
                      {isUnused ? (
                        <Badge variant="outline" className="bg-background/90 text-[10px] h-5">
                          미사용
                        </Badge>
                      ) : (
                        <Badge variant="success" className="bg-background/90 text-[10px] h-5">
                          사용중 {item.usages.length}
                        </Badge>
                      )}
                    </div>
                    {/* 호버 액션 */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8"
                        onClick={() => setRefsTarget(item)}
                      >
                        사용처
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8"
                        onClick={() => window.open(item.url, "_blank", "noreferrer")}
                        title="원본 열기"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-8"
                        onClick={() => setDeleteTarget(item)}
                        disabled={!isUnused}
                        title={isUnused ? "영구 삭제" : "사용 중이라 삭제 불가"}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <CardContent className="p-2 text-[11px] space-y-0.5">
                    <div className="truncate font-mono text-foreground" title={item.name}>
                      {item.name}
                    </div>
                    {/* 사용처 — 어디어디 쓰는지 / 미사용 */}
                    <div
                      className={`truncate ${isUnused ? "text-muted-foreground italic" : "text-foreground"}`}
                      title={labels.join(", ")}
                    >
                      {isUnused ? "미사용" : labels.join(", ")}
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>{formatSize(item.size)}</span>
                      <span>
                        {item.createdAt ? format(new Date(item.createdAt), "yy-MM-dd") : "-"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* 사용처 Dialog */}
      <Dialog open={refsTarget !== null} onOpenChange={(o) => !o && setRefsTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>사용처</DialogTitle>
            <DialogDescription className="font-mono text-xs break-all">
              {refsTarget?.name}
            </DialogDescription>
          </DialogHeader>
          {refsTarget?.usages.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground text-sm">
              어디에서도 사용되지 않는 미사용 파일입니다.
            </div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto divide-y divide-border">
              {refsTarget?.usages.map((ref, i) => (
                <div key={i} className="py-2 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {ref.label}
                    </Badge>
                    <span>{ref.name}</span>
                  </div>
                  <code className="text-[11px] text-muted-foreground">{ref.id.slice(0, 8)}</code>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 Dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              영구 삭제
            </DialogTitle>
            <DialogDescription>
              이 파일을 스토리지에서 영구히 삭제합니다. <strong>되돌릴 수 없습니다.</strong>
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="bg-muted rounded-md p-3 flex gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={deleteTarget.url}
                alt=""
                className="h-16 w-16 object-contain rounded bg-card border border-border"
              />
              <div className="text-xs space-y-0.5 min-w-0 flex-1">
                <div className="font-mono truncate">{deleteTarget.name}</div>
                <div className="text-muted-foreground">{formatSize(deleteTarget.size)}</div>
                <div className="text-muted-foreground">
                  {deleteTarget.createdAt ? format(new Date(deleteTarget.createdAt), "yyyy-MM-dd HH:mm") : ""}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              영구 삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
