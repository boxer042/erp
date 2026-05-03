"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Calculator,
  Camera,
  Code2,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  Film,
  Image as ImageIcon,
  Images,
  Layers,
  Layout,
  ListChecks,
  Loader2,
  Monitor,
  Mountain,
  Smartphone,
  Sparkles,
  Table2,
  Tablet,
  Trash2,
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
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import {
  BLOCK_DESCRIPTIONS,
  BLOCK_LABELS,
  landingBlocksSchema,
  type BlockType,
  type LandingBlock,
  makeEmptyBlock,
} from "@/lib/validators/landing-block";

import { LandingPageView } from "@/components/landing/landing-page-view";
import { SingleHtmlPreview } from "@/components/landing/single-html-preview";
import { SortableBlockItem } from "@/components/landing/sortable-block-item";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { BlockEditor } from "./_block-editor";
import { blockTitle, duplicateAt, makeId } from "./_helpers";

type LandingMode = "BLOCKS" | "SINGLE_HTML";

interface LandingResponse {
  id: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  blocks: LandingBlock[];
  landingMode: LandingMode;
  singleHtmlUrl: string | null;
}

interface EditState {
  blocks: LandingBlock[];
  landingMode: LandingMode;
  singleHtmlUrl: string | null;
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
  callout: AlertCircle,
  "info-grid": ListChecks,
  "product-info": FileText,
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
  "callout",
  "info-grid",
  "product-info",
  "html-embed",
];

export default function ProductLandingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  // 로컬 편집 상태. null = 서버 데이터를 그대로 사용 (편집 안 함). 첫 변경 시 fork.
  const [editState, setEditState] = useState<EditState | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [shooting, setShooting] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [singleUploading, setSingleUploading] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const pendingNavRef = useRef<(() => void) | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
    mutationFn: (next: EditState) =>
      apiMutate(`/api/products/${id}/landing`, "PUT", {
        blocks: next.blocks,
        landingMode: next.landingMode,
        singleHtmlUrl: next.singleHtmlUrl,
      }),
    onSuccess: () => {
      toast.success("저장되었습니다");
      setEditState(null); // 서버 데이터로 재정합
      queryClient.invalidateQueries({ queryKey: queryKeys.products.landing(id) });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  const serverState: EditState = {
    blocks: landingQuery.data?.blocks ?? [],
    landingMode: landingQuery.data?.landingMode ?? "BLOCKS",
    singleHtmlUrl: landingQuery.data?.singleHtmlUrl ?? null,
  };
  const current: EditState = editState ?? serverState;
  const blocks = current.blocks;
  const landingMode = current.landingMode;
  const singleHtmlUrl = current.singleHtmlUrl;
  const dirty = editState !== null;

  // 저장 안 된 변경 사항 있을 때 브라우저 탭 닫기 / 새로고침 / 외부 이동 차단
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // 일부 브라우저는 returnValue 가 설정되어야 표시
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // dirty 면 dialog 열고 confirm 후 이동, 아니면 즉시
  const navigateAway = (target: () => void) => {
    if (dirty) {
      setLeaveDialogOpen(true);
      pendingNavRef.current = target;
    } else {
      target();
    }
  };

  const updateState = (patch: Partial<EditState>) => {
    setEditState((prev) => ({ ...(prev ?? serverState), ...patch }));
  };

  const dispatchBlocks = (updater: (prev: LandingBlock[]) => LandingBlock[]) => {
    setEditState((prev) => {
      const base = prev ?? serverState;
      return { ...base, blocks: updater(base.blocks) };
    });
  };

  const addBlock = (type: BlockType) => {
    const newId = makeId();
    dispatchBlocks((prev) => [...prev, makeEmptyBlock(type, newId)]);
    setExpandedId(newId);
  };

  const updateBlock = (next: LandingBlock) => {
    dispatchBlocks((prev) => prev.map((b) => (b.id === next.id ? next : b)));
  };

  const removeBlock = (blockId: string) => {
    dispatchBlocks((prev) => prev.filter((b) => b.id !== blockId));
    if (expandedId === blockId) setExpandedId(null);
    setDeleteId(null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    dispatchBlocks((prev) => {
      const oldIdx = prev.findIndex((b) => b.id === active.id);
      const newIdx = prev.findIndex((b) => b.id === over.id);
      if (oldIdx < 0 || newIdx < 0) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  };

  const duplicateBlock = (idx: number) => {
    const newId = makeId();
    dispatchBlocks((prev) => duplicateAt(prev, idx, newId).next);
    setExpandedId(newId);
  };

  const onUploadSingleHtml = async (file: File) => {
    setSingleUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/products/upload-html", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "업로드 실패");
      }
      const { url } = (await res.json()) as { url: string };
      updateState({ singleHtmlUrl: url });
      toast.success("HTML 파일이 업로드되었습니다");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setSingleUploading(false);
    }
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
          onClick={() => navigateAway(() => router.push(`/products/${id}`))}
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
            onClick={() => {
              setJsonText(JSON.stringify(blocks, null, 2));
              setJsonError(null);
              setJsonOpen(true);
            }}
            title="JSON 구조 보기 / Claude Code로 만든 JSON 붙여넣기"
          >
            <Code2 className="h-4 w-4" />
            <span>JSON</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={landingMode === "SINGLE_HTML" || dirty}
            onClick={() => window.open(`/api/products/${id}/landing/export?format=html`, "_blank")}
            title={
              landingMode === "SINGLE_HTML"
                ? "단일 HTML 모드는 export 불필요 (HTML 파일 자체 사용)"
                : dirty
                  ? "저장 후 export 가능"
                  : "외부 채널(쿠팡/네이버 등) 복붙용 HTML 다운로드"
            }
          >
            <Download className="h-4 w-4" />
            <span>HTML</span>
          </Button>
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
            onClick={() => saveMutation.mutate(current)}
          >
            {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>{saveMutation.isPending ? "저장 중..." : "저장"}</span>
          </Button>
        </div>
      </div>

      {/* 모드 토글 */}
      <div className="flex items-center gap-2 border-b border-border bg-card px-5 py-2">
        <span className="text-xs text-muted-foreground">모드:</span>
        <div className="flex h-7 rounded-md border border-border bg-background text-[12px]">
          <button
            type="button"
            className={cn(
              "px-3 transition-colors",
              landingMode === "BLOCKS"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => updateState({ landingMode: "BLOCKS" })}
          >
            블록 모드
          </button>
          <button
            type="button"
            className={cn(
              "px-3 transition-colors",
              landingMode === "SINGLE_HTML"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => updateState({ landingMode: "SINGLE_HTML" })}
          >
            단일 HTML
          </button>
        </div>
        <span className="ml-2 text-[11px] text-muted-foreground">
          {landingMode === "BLOCKS"
            ? "블록을 조합해서 페이지 구성 + 공통 footer 자동 연결"
            : "업로드한 HTML 파일 1개를 통째로 페이지 전체로 (footer 미적용)"}
        </span>
      </div>

      {landingMode === "SINGLE_HTML" ? (
        <SingleHtmlEditorBody
          singleHtmlUrl={singleHtmlUrl}
          uploading={singleUploading}
          onUpload={onUploadSingleHtml}
          onClear={() => updateState({ singleHtmlUrl: null })}
          dirty={dirty}
        />
      ) : (
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
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext
                  items={blocks.map((b) => b.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="divide-y divide-border">
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
                        onDuplicate={() => duplicateBlock(blocks.findIndex((b) => b.id === block.id))}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
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
            <div className="ml-auto flex h-7 rounded-md border border-border bg-background text-[12px]">
              <button
                type="button"
                className={cn(
                  "flex items-center gap-1 px-2",
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
                  "flex items-center gap-1 border-l border-border px-2",
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
                  "flex items-center gap-1 border-l border-border px-2",
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
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            <div
              className={cn(
                "mx-auto bg-background shadow-sm",
                previewWidth === "desktop" && "max-w-[960px]",
                previewWidth === "tablet" && "max-w-[768px]",
                previewWidth === "mobile" && "max-w-[375px]",
              )}
            >
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
      )}

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

      <Dialog
        open={leaveDialogOpen}
        onOpenChange={(o) => {
          if (!o) {
            pendingNavRef.current = null;
            setLeaveDialogOpen(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>저장하지 않은 변경사항이 있습니다</DialogTitle>
            <DialogDescription>
              지금 페이지를 나가면 저장하지 않은 변경 내용이 사라집니다. 정말 나가시겠어요?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                pendingNavRef.current = null;
                setLeaveDialogOpen(false);
              }}
            >
              취소 (계속 편집)
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const fn = pendingNavRef.current;
                pendingNavRef.current = null;
                setLeaveDialogOpen(false);
                if (fn) fn();
              }}
            >
              나가기 (변경 버림)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={jsonOpen} onOpenChange={setJsonOpen}>
        <DialogContent className="flex max-h-[90vh] w-[min(1100px,95vw)] max-w-none flex-col gap-3 sm:max-w-none">
          <DialogHeader>
            <DialogTitle>JSON 가져오기 / 내보내기</DialogTitle>
            <DialogDescription>
              로컬 Claude Code 등으로 만든 JSON을 붙여넣고 <b>가져오기</b>를 누르면 미리보기에 즉시 반영됩니다 (저장은 헤더의 &ldquo;저장&rdquo; 버튼).
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
                  updateState({ blocks: parsed.data });
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

function resolveHtmlSrc(url: string): string {
  const m = url.match(/\/storage\/v1\/object\/public\/product-html\/(.+)$/);
  if (m) return `/api/products/landing-html/${m[1]}`;
  return url;
}

function SingleHtmlEditorBody({
  singleHtmlUrl,
  uploading,
  onUpload,
  onClear,
  dirty,
}: {
  singleHtmlUrl: string | null;
  uploading: boolean;
  onUpload: (file: File) => void;
  onClear: () => void;
  dirty: boolean;
}) {
  return (
    <div className="flex flex-1 min-h-0">
      <aside className="flex w-[420px] shrink-0 flex-col gap-3 border-r border-border bg-card p-4">
        <p className="rounded-md bg-muted px-3 py-2 text-[12px] text-muted-foreground">
          이 모드는 업로드한 HTML 파일을 페이지 전체로 통째 보여줍니다. 블록과 공통 footer 는 적용되지 않으며, sandboxed iframe 안에 격리되어 렌더링됩니다.
        </p>

        <div className="space-y-2">
          <p className="text-xs font-medium">HTML 파일</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".html,.htm,text/html";
                input.onchange = () => {
                  const f = input.files?.[0];
                  if (f) onUpload(f);
                };
                input.click();
              }}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCode2 className="h-4 w-4" />}
              <span>{uploading ? "업로드 중..." : singleHtmlUrl ? "다른 파일로 교체" : "파일 업로드"}</span>
            </Button>
            {singleHtmlUrl && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(resolveHtmlSrc(singleHtmlUrl), "_blank")}
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>새 탭에서 열기</span>
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={onClear}>
                  <Trash2 className="h-4 w-4" />
                  <span>제거</span>
                </Button>
              </>
            )}
          </div>
          {singleHtmlUrl && (
            <Input
              value={singleHtmlUrl}
              readOnly
              className="h-8 text-[11px] text-muted-foreground"
              onFocus={(e) => e.currentTarget.select()}
            />
          )}
        </div>

        <p className="text-[11px] text-muted-foreground">
          ⚠️ HTML 안의 <code className="rounded bg-muted px-1">{`<img>`}</code> 는 절대 URL 또는 base64 권장. 상대 경로는 storage 경로 기준이라 깨질 수 있습니다.
        </p>
      </aside>

      <div className="flex flex-1 min-w-0 flex-col bg-muted/30">
        <div className="flex items-center gap-2 border-b border-border bg-background px-4 py-2">
          <span className="text-xs text-muted-foreground">미리보기</span>
          {dirty && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-900">
              저장되지 않은 변경사항
            </span>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto bg-background">
          {singleHtmlUrl ? (
            <SingleHtmlPreview src={resolveHtmlSrc(singleHtmlUrl)} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              왼쪽에서 HTML 파일을 업로드하세요
            </div>
          )}
        </div>
      </div>
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
