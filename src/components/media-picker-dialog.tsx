"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ImageOff, Search } from "lucide-react";

import { apiGet } from "@/lib/api-client";
import {
  JmBadge,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogHeader,
  JmDialogTitle,
  JmSkeleton,
} from "@/jm";

export type MediaBucket =
  | "brand-logos"
  | "category-images"
  | "channel-logos"
  | "product-images";

const BUCKET_LABEL: Record<MediaBucket, string> = {
  "brand-logos": "브랜드 로고",
  "category-images": "카테고리 이미지",
  "channel-logos": "채널 로고",
  "product-images": "상품 이미지",
};

interface MediaItem {
  path: string;
  name: string;
  url: string;
  size: number | null;
  createdAt: string | null;
  refs: { kind: string; id: string; name: string }[];
}

export interface MediaPickerSelection {
  url: string;
  path: string;
  name: string;
}

interface Props {
  open: boolean;
  bucket: MediaBucket;
  onSelect: (item: MediaPickerSelection) => void;
  onClose: () => void;
}

export function MediaPickerDialog({ open, bucket, onSelect, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "used" | "orphan">("all");

  const listQuery = useQuery({
    queryKey: ["media", bucket],
    queryFn: () =>
      apiGet<{ items: MediaItem[] }>(`/api/media/list?bucket=${bucket}`),
    enabled: open,
  });

  const all = listQuery.data?.items ?? [];
  const items = all.filter((it) => {
    if (filter === "used" && it.refs.length === 0) return false;
    if (filter === "orphan" && it.refs.length > 0) return false;
    if (search && !it.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const usedCount = all.filter((it) => it.refs.length > 0).length;
  const orphanCount = all.length - usedCount;

  return (
    <JmDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <JmDialogContent size="xl">
        <JmDialogHeader>
          <JmDialogTitle>{BUCKET_LABEL[bucket]} 라이브러리에서 선택</JmDialogTitle>
          <p className="text-jm-sm text-[var(--jm-text-muted)]">
            이전에 업로드한 이미지를 선택하면 같은 파일을 재사용합니다.
          </p>
        </JmDialogHeader>

        <JmDialogBody>
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 size-4 text-[var(--jm-text-muted)]" />
              <input
                placeholder="파일명 검색..."
                className="w-full h-9 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] pl-9 pr-3 text-jm-sm outline-none placeholder:text-[var(--jm-text-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--jm-ring)]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex h-9 rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface)] text-jm-sm overflow-hidden shrink-0">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`px-3 transition-colors ${
                  filter === "all"
                    ? "bg-[var(--jm-surface-muted)] text-[var(--jm-text)]"
                    : "text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface-muted)]/50"
                }`}
              >
                전체 {all.length}
              </button>
              <button
                type="button"
                onClick={() => setFilter("used")}
                className={`px-3 transition-colors border-l border-[var(--jm-border)] ${
                  filter === "used"
                    ? "bg-[var(--jm-surface-muted)] text-[var(--jm-text)]"
                    : "text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface-muted)]/50"
                }`}
              >
                사용중 {usedCount}
              </button>
              <button
                type="button"
                onClick={() => setFilter("orphan")}
                className={`px-3 transition-colors border-l border-[var(--jm-border)] ${
                  filter === "orphan"
                    ? "bg-[var(--jm-surface-muted)] text-[var(--jm-text)]"
                    : "text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface-muted)]/50"
                }`}
              >
                고아 {orphanCount}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-[60vh] overflow-y-auto">
            {listQuery.isPending ? (
              Array.from({ length: 10 }).map((_, i) => (
                <JmSkeleton key={i} className="aspect-square rounded-md" />
              ))
            ) : items.length === 0 ? (
              <div className="col-span-full py-12 text-center text-jm-sm text-[var(--jm-text-muted)]">
                <ImageOff className="size-8 mx-auto mb-2 opacity-50" />
                {search || filter !== "all"
                  ? "조건에 맞는 이미지가 없습니다"
                  : "라이브러리가 비어있습니다 — 먼저 업로드해주세요"}
              </div>
            ) : (
              items.map((item) => {
                const isOrphan = item.refs.length === 0;
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() =>
                      onSelect({ url: item.url, path: item.path, name: item.name })
                    }
                    className="group relative aspect-square rounded-md overflow-hidden border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] hover:ring-2 hover:ring-[var(--jm-info-fg)] transition-all"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt={item.name}
                      className="w-full h-full object-contain"
                      loading="lazy"
                    />
                    <div className="absolute top-1 left-1">
                      {isOrphan ? (
                        <JmBadge
                          variant="default"
                          size="sm"
                          shape="square"
                          className="bg-[var(--jm-bg)]/90 text-jm-2xs h-4 px-1"
                        >
                          고아
                        </JmBadge>
                      ) : (
                        <JmBadge
                          variant="success"
                          size="sm"
                          shape="square"
                          className="bg-[var(--jm-bg)]/90 text-jm-2xs h-4 px-1"
                        >
                          {item.refs.length}
                        </JmBadge>
                      )}
                    </div>
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                      <CheckCircle2 className="size-7 text-white" />
                    </span>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent text-jm-2xs text-white p-1 truncate font-[family-name:var(--jm-font-mono)]">
                      {item.name}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </JmDialogBody>
      </JmDialogContent>
    </JmDialog>
  );
}
