"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Calculator,
  ChevronDown,
  ChevronRight,
  FileCode2,
  Film,
  Image as ImageIcon,
  Images,
  Layers,
  Layout,
  Loader2,
  Mountain,
  Sparkles,
  Table2,
  Trash2,
  Type,
  Video,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  BLOCK_DESCRIPTIONS,
  BLOCK_LABELS,
  type BlockType,
  type LandingBlock,
  makeEmptyBlock,
} from "@/lib/validators/landing-block";

import { LandingPageView } from "@/components/landing/landing-page-view";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { BlockEditor } from "../../products/[id]/landing/_block-editor";
import { blockTitle, makeId, move } from "../../products/[id]/landing/_helpers";

interface LandingSettingsResponse {
  footerBlocks: LandingBlock[];
}

const BLOCK_ICON: Record<BlockType, React.ComponentType<{ className?: string }>> = {
  hero: Layout,
  image: ImageIcon,
  text: Type,
  video: Video,
  gallery: Images,
  "scrolly-hero": Sparkles,
  "sticky-feature": Layers,
  parallax: Mountain,
  "spec-table": Wrench,
  "ambient-video": Film,
  table: Table2,
  chart: BarChart3,
  "stats-grid": Calculator,
  "html-embed": FileCode2,
};

const BLOCK_TYPES: BlockType[] = [
  "hero",
  "image",
  "text",
  "video",
  "gallery",
  "scrolly-hero",
  "sticky-feature",
  "parallax",
  "spec-table",
  "ambient-video",
  "table",
  "chart",
  "stats-grid",
  "html-embed",
];

export default function LandingSettingsPage() {
  const queryClient = useQueryClient();
  const [editState, setEditState] = useState<LandingBlock[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: queryKeys.landingSettings.all,
    queryFn: () => apiGet<LandingSettingsResponse>("/api/landing-settings"),
  });

  const saveMutation = useMutation({
    mutationFn: (next: LandingBlock[]) =>
      apiMutate("/api/landing-settings", "PUT", { footerBlocks: next }),
    onSuccess: () => {
      toast.success("저장되었습니다");
      setEditState(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.landingSettings.all });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  if (settingsQuery.isPending) return <LoadingState />;

  const serverBlocks = settingsQuery.data?.footerBlocks ?? [];
  const blocks = editState ?? serverBlocks;
  const dirty = editState !== null;

  const dispatch = (updater: (prev: LandingBlock[]) => LandingBlock[]) => {
    setEditState((prev) => updater(prev ?? serverBlocks));
  };

  const addBlock = (type: BlockType) => {
    const newId = makeId();
    dispatch((prev) => [...prev, makeEmptyBlock(type, newId)]);
    setExpandedId(newId);
  };

  const updateBlock = (next: LandingBlock) => {
    dispatch((prev) => prev.map((b) => (b.id === next.id ? next : b)));
  };

  const removeBlock = (blockId: string) => {
    dispatch((prev) => prev.filter((b) => b.id !== blockId));
    if (expandedId === blockId) setExpandedId(null);
    setDeleteId(null);
  };

  const moveBlock = (idx: number, dir: -1 | 1) => {
    dispatch((prev) => move(prev, idx, idx + dir));
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">공통 상세페이지 footer</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            모든 상품 상세페이지 하단에 자동으로 표시되는 블록입니다. 배송/환불/AS 안내, 사업자 정보 등 공통 내용을 한 곳에서 관리하세요.
          </p>
        </div>
        <Button
          size="sm"
          disabled={!dirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate(blocks)}
        >
          {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          <span>{saveMutation.isPending ? "저장 중..." : "저장"}</span>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>블록 추가</CardTitle>
          <CardDescription>
            아래 블록 종류를 클릭하면 footer 끝에 추가됩니다. 각 블록 위에 마우스를 올리면 어떤 용도인지 설명이 표시됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <TooltipProvider delay={200}>
            <div className="grid grid-cols-4 gap-2 md:grid-cols-8">
              {BLOCK_TYPES.map((t) => {
                const Icon = BLOCK_ICON[t];
                const desc = BLOCK_DESCRIPTIONS[t];
                return (
                  <Tooltip key={t}>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="flex h-auto flex-col gap-1 py-2 text-[11px]"
                          onClick={() => addBlock(t)}
                        >
                          <Icon className="h-4 w-4" />
                          <span>{BLOCK_LABELS[t]}</span>
                        </Button>
                      }
                    />
                    <TooltipContent side="bottom" className="max-w-[280px] whitespace-normal">
                      <div className="space-y-1.5 text-left">
                        <div className="text-[12px] font-semibold">{desc.title}</div>
                        <div className="text-[11px] leading-snug opacity-90">{desc.body}</div>
                        <div className="text-[10px] italic opacity-70">{desc.example}</div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
          {/* 모바일/터치 환경에서도 볼 수 있도록 인라인 설명 카드 */}
          <details className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              블록 종류별 설명 보기 (터치 환경 대안)
            </summary>
            <ul className="mt-2 space-y-2">
              {BLOCK_TYPES.map((t) => {
                const Icon = BLOCK_ICON[t];
                const desc = BLOCK_DESCRIPTIONS[t];
                return (
                  <li key={t} className="flex gap-2">
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div>
                      <span className="font-medium">{desc.title}</span>
                      <span className="ml-1 text-muted-foreground">— {desc.body}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>블록 목록</CardTitle>
          <CardDescription>
            위에서 아래 순서로 모든 상품 상세페이지 끝에 붙습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {blocks.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              아직 등록된 footer 블록이 없습니다
            </div>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {blocks.map((block, idx) => {
                const Icon = BLOCK_ICON[block.type];
                const expanded = expandedId === block.id;
                return (
                  <li key={block.id} className="bg-background">
                    <div className="flex items-center gap-2 px-4 py-3">
                      <button
                        type="button"
                        className="flex flex-1 items-center gap-2 text-left"
                        onClick={() => setExpandedId(expanded ? null : block.id)}
                      >
                        {expanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{BLOCK_LABELS[block.type]}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {blockTitle(block)}
                        </span>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={idx === 0}
                        onClick={() => moveBlock(idx, -1)}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={idx === blocks.length - 1}
                        onClick={() => moveBlock(idx, 1)}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setDeleteId(block.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {expanded && (
                      <div className="border-t border-border bg-muted/30 px-4 py-3">
                        <BlockEditor block={block} onChange={updateBlock} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>미리보기</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-y border-border">
            <LandingPageView blocks={blocks} emptyMessage="블록을 추가하면 여기에 표시됩니다" />
          </div>
        </CardContent>
      </Card>

      <Dialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>블록을 삭제할까요?</DialogTitle>
            <DialogDescription>
              저장 전까지는 페이지를 새로고침하면 되돌릴 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>취소</Button>
            <Button variant="destructive" onClick={() => deleteId && removeBlock(deleteId)}>
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-6 w-48" />
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-20" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-2 md:grid-cols-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-md" />
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
