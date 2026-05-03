"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Calculator,
  Code2,
  FileCode2,
  Film,
  Image as ImageIcon,
  Images,
  Layers,
  Layout,
  Loader2,
  Monitor,
  Mountain,
  Smartphone,
  Sparkles,
  Table2,
  Tablet,
  Type,
  Video,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

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
  landingBlocksSchema,
  type BlockType,
  type LandingBlock,
  makeEmptyBlock,
} from "@/lib/validators/landing-block";
import { Textarea } from "@/components/ui/textarea";

import { LandingPageView } from "@/components/landing/landing-page-view";
import { SortableBlockItem } from "@/components/landing/sortable-block-item";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { duplicateAt, makeId } from "../../products/[id]/landing/_helpers";

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
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [previewWidth, setPreviewWidth] = useState<"desktop" | "tablet" | "mobile">("desktop");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    dispatch((prev) => {
      const oldIdx = prev.findIndex((b) => b.id === active.id);
      const newIdx = prev.findIndex((b) => b.id === over.id);
      if (oldIdx < 0 || newIdx < 0) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  };

  const duplicateBlock = (idx: number) => {
    const newId = makeId();
    dispatch((prev) => duplicateAt(prev, idx, newId).next);
    setExpandedId(newId);
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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setJsonText(JSON.stringify(blocks, null, 2));
              setJsonError(null);
              setJsonOpen(true);
            }}
            title="JSON 가져오기/내보내기 — Claude Code 등으로 만든 JSON 적용"
          >
            <Code2 className="h-4 w-4" />
            <span>JSON</span>
          </Button>
          <Button
            size="sm"
            disabled={!dirty || saveMutation.isPending}
            onClick={() => saveMutation.mutate(blocks)}
          >
            {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>{saveMutation.isPending ? "저장 중..." : "저장"}</span>
          </Button>
        </div>
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
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext
                items={blocks.map((b) => b.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="divide-y divide-border border-y border-border">
                  {blocks.map((block) => (
                    <SortableBlockItem
                      key={block.id}
                      block={block}
                      iconMap={BLOCK_ICON}
                      expanded={expandedId === block.id}
                      onToggle={() =>
                        setExpandedId(expandedId === block.id ? null : block.id)
                      }
                      onUpdate={updateBlock}
                      onDelete={() => setDeleteId(block.id)}
                      onDuplicate={() =>
                        duplicateBlock(blocks.findIndex((b) => b.id === block.id))
                      }
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>미리보기</CardTitle>
          <div className="flex h-7 rounded-md border border-border bg-background text-[12px]">
            <button
              type="button"
              className={cn(
                "flex items-center px-2",
                previewWidth === "desktop"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setPreviewWidth("desktop")}
              title="데스크톱 폭"
            >
              <Monitor className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className={cn(
                "flex items-center border-l border-border px-2",
                previewWidth === "tablet"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setPreviewWidth("tablet")}
              title="태블릿 폭 (768px)"
            >
              <Tablet className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className={cn(
                "flex items-center border-l border-border px-2",
                previewWidth === "mobile"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setPreviewWidth("mobile")}
              title="모바일 폭 (375px)"
            >
              <Smartphone className="h-3.5 w-3.5" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="bg-muted/30 p-0">
          <div className="border-t border-border">
            <div
              className={cn(
                "mx-auto bg-background",
                previewWidth === "desktop" && "max-w-[960px]",
                previewWidth === "tablet" && "max-w-[768px]",
                previewWidth === "mobile" && "max-w-[375px]",
              )}
            >
              <LandingPageView blocks={blocks} emptyMessage="블록을 추가하면 여기에 표시됩니다" />
            </div>
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

      <Dialog open={jsonOpen} onOpenChange={setJsonOpen}>
        <DialogContent className="flex max-h-[90vh] w-[min(1100px,95vw)] max-w-none flex-col gap-3 sm:max-w-none">
          <DialogHeader>
            <DialogTitle>Footer JSON 가져오기 / 내보내기</DialogTitle>
            <DialogDescription>
              Claude Code 등으로 만든 footer 블록 JSON 을 붙여넣고 <b>가져오기</b> 누르면 미리보기에 즉시 반영됩니다 (저장은 헤더의 &ldquo;저장&rdquo; 버튼).
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <Textarea
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value);
                setJsonError(null);
              }}
              className="min-h-0 flex-1 resize-none font-mono text-[11px] leading-snug"
              spellCheck={false}
            />
            {jsonError && (
              <p className="rounded-md bg-destructive/15 px-2 py-1.5 text-xs text-destructive">
                {jsonError}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              스키마: <code className="rounded bg-muted px-1">LandingBlock[]</code> · 자세한 스펙은{" "}
              <code className="rounded bg-muted px-1">src/lib/validators/landing-block.ts</code>{" "}
              참고
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(jsonText);
                  toast.success("클립보드에 복사되었습니다");
                } catch {
                  toast.error("클립보드 복사 실패 — 직접 선택해 복사하세요");
                }
              }}
            >
              클립보드로 복사
            </Button>
            <div className="flex-1" />
            <Button variant="outline" onClick={() => setJsonOpen(false)}>닫기</Button>
            <Button
              onClick={() => {
                try {
                  const parsedRaw = JSON.parse(jsonText);
                  const parsed = landingBlocksSchema.safeParse(parsedRaw);
                  if (!parsed.success) {
                    const first = parsed.error.issues[0];
                    setJsonError(
                      `검증 실패: ${first?.path.join(".") || "root"} — ${first?.message ?? "알 수 없는 오류"}`,
                    );
                    return;
                  }
                  setEditState(parsed.data);
                  setJsonOpen(false);
                  setJsonError(null);
                  toast.success(
                    `${parsed.data.length}개 블록을 가져왔습니다 — 헤더의 "저장"을 눌러 확정하세요`,
                  );
                } catch (e) {
                  setJsonError(
                    `JSON 파싱 실패: ${e instanceof Error ? e.message : "알 수 없는 오류"}`,
                  );
                }
              }}
            >
              가져오기 (미리보기에 반영)
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
