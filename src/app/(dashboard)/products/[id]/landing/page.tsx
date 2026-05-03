"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Camera,
  ChevronDown,
  ChevronRight,
  ExternalLink,
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

import { BlockEditor } from "./_block-editor";
import { blockTitle, makeId, move } from "./_helpers";

interface LandingResponse {
  id: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  blocks: LandingBlock[];
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
];

export default function ProductLandingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  // 로컬 편집 상태. null = 서버 데이터를 그대로 사용 (편집 안 함). 첫 변경 시 fork.
  const [editState, setEditState] = useState<LandingBlock[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [shooting, setShooting] = useState(false);

  const landingQuery = useQuery({
    queryKey: queryKeys.products.landing(id),
    queryFn: () => apiGet<LandingResponse>(`/api/products/${id}/landing`),
  });

  const footerQuery = useQuery({
    queryKey: queryKeys.landingSettings.all,
    queryFn: () =>
      apiGet<{ footerBlocks: LandingBlock[] }>("/api/landing-settings"),
  });

  const saveMutation = useMutation({
    mutationFn: (next: LandingBlock[]) =>
      apiMutate(`/api/products/${id}/landing`, "PUT", { blocks: next }),
    onSuccess: () => {
      toast.success("저장되었습니다");
      setEditState(null); // 서버 데이터로 재정합
      queryClient.invalidateQueries({ queryKey: queryKeys.products.landing(id) });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  const serverBlocks = landingQuery.data?.blocks ?? [];
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

  if (landingQuery.isPending) {
    return <LoadingState />;
  }

  if (landingQuery.isError || !landingQuery.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">상품 정보를 불러올 수 없습니다</p>
        <Button variant="outline" onClick={() => landingQuery.refetch()}>다시 시도</Button>
      </div>
    );
  }

  const product = landingQuery.data;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-2.5">
        <Button
          variant="ghost"
          size="icon"
          aria-label="뒤로"
          onClick={() => router.push(`/products/${id}`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex flex-col">
          <span className="text-sm font-semibold">{product.name}</span>
          <span className="text-xs text-muted-foreground">상세페이지 편집 · {product.sku}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={shooting || dirty}
            onClick={async () => {
              setShooting(true);
              try {
                const res = await fetch(`/api/products/${id}/landing/screenshot`);
                if (!res.ok) {
                  const err = await res.json().catch(() => ({}));
                  throw new Error(err.error || "스크린샷 생성 실패");
                }
                const blob = await res.blob();
                const objectUrl = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = objectUrl;
                a.download = `landing-${product.sku}.png`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(objectUrl);
                toast.success("스크린샷이 다운로드되었습니다");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "스크린샷 실패");
              } finally {
                setShooting(false);
              }
            }}
            title={dirty ? "저장 후 스크린샷이 가능합니다" : "전체 페이지 스크린샷 다운로드"}
          >
            {shooting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            <span>{shooting ? "생성 중..." : "스크린샷"}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(`/products/${id}/landing/preview`, "_blank")}
          >
            <ExternalLink className="h-4 w-4" />
            <span>미리보기</span>
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

      <div className="flex flex-1 min-h-0">
        {/* 왼쪽: 블록 리스트 + 인라인 편집 */}
        <aside className="flex w-[420px] shrink-0 flex-col border-r border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">
              블록 추가 <span className="text-muted-foreground/70">(마우스 올리면 설명)</span>
            </p>
            <TooltipProvider delay={200}>
              <div className="mt-2 grid grid-cols-4 gap-1">
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
                      <TooltipContent side="bottom" className="max-w-[260px] whitespace-normal">
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
            <details className="mt-2 rounded-md bg-muted/40 px-2 py-1.5 text-[11px]">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                블록 종류별 설명 보기
              </summary>
              <ul className="mt-2 space-y-1.5">
                {BLOCK_TYPES.map((t) => {
                  const Icon = BLOCK_ICON[t];
                  const desc = BLOCK_DESCRIPTIONS[t];
                  return (
                    <li key={t} className="flex gap-1.5">
                      <Icon className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                      <div className="leading-snug">
                        <span className="font-medium">{desc.title}</span>
                        <span className="ml-1 text-muted-foreground">— {desc.body}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </details>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {blocks.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                위에서 블록을 추가하세요
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {blocks.map((block, idx) => {
                  const Icon = BLOCK_ICON[block.type];
                  const expanded = expandedId === block.id;
                  return (
                    <li key={block.id} className="bg-background">
                      <div className="flex items-center gap-2 px-3 py-2">
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
                          <span className="text-xs font-medium">{BLOCK_LABELS[block.type]}</span>
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
          </div>
        </aside>

        {/* 오른쪽: 라이브 프리뷰 */}
        <div className="flex flex-1 min-w-0 flex-col bg-muted/30">
          <div className="flex items-center gap-2 border-b border-border bg-background px-4 py-2">
            <span className="text-xs text-muted-foreground">미리보기</span>
            {dirty && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-900">
                저장되지 않은 변경사항
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="mx-auto max-w-[960px] bg-background shadow-sm">
              <LandingPageView blocks={blocks} productId={id} />
              {(footerQuery.data?.footerBlocks ?? []).length > 0 && (
                <>
                  <div className="border-t border-dashed border-border bg-muted/30 px-4 py-2 text-center text-[11px] text-muted-foreground">
                    ↓ 아래는 모든 상품에 공통으로 붙는 footer (설정 → 공통 footer)
                  </div>
                  <LandingPageView
                    blocks={(footerQuery.data?.footerBlocks ?? []).map((b) => ({
                      ...b,
                      id: `__footer__${b.id}`,
                    }))}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>블록을 삭제할까요?</DialogTitle>
            <DialogDescription>이 작업은 저장 전까지는 되돌릴 수 있습니다.</DialogDescription>
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
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-5 py-2.5">
        <Skeleton className="h-8 w-8 rounded-md" />
        <div className="space-y-1">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-16 rounded-md" />
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        <aside className="w-[420px] shrink-0 border-r border-border bg-card p-4">
          <Skeleton className="mb-3 h-3 w-16" />
          <div className="grid grid-cols-5 gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-md" />
            ))}
          </div>
          <div className="mt-6 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-md" />
            ))}
          </div>
        </aside>
        <div className="flex-1 bg-muted/30 p-6">
          <Skeleton className="mx-auto h-[420px] w-full max-w-[960px]" />
        </div>
      </div>
    </div>
  );
}
