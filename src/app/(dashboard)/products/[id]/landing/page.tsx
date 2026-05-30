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
  ShoppingBag,
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

import {
  JmButton,
  JmIconButton,
  JmDialog,
  JmDialogContent,
  JmDialogHeader,
  JmDialogTitle,
  JmDialogDescription,
  JmDialogFooter,
  JmSkeleton,
  JmTextarea,
  JmInput,
  JmTooltipProvider,
  JmTooltipRoot,
  JmTooltipTrigger,
  JmTooltipContent,
} from "@/jm";
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

import { duplicateAt, makeId } from "./_helpers";

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
  "product-hero": ShoppingBag,
  "product-info": FileText,
  "html-embed": FileCode2,
};

const BLOCK_TYPES: BlockType[] = [
  "product-hero",
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
      apiGet<{ headerBlocks: LandingBlock[]; footerBlocks: LandingBlock[] }>(
        "/api/landing-settings",
      ),
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

  // product-hero 는 항상 첫 블록으로 존재해야 하는 필수 블록.
  // 첫 로드 시 (1) 없으면 prepend (2) 첫 위치가 아니면 0번으로 이동.
  // 페이지당 1회만 동작 (이후 dirty 발생해도 재동기화 안 함).
  const autoSeededRef = useRef(false);
  useEffect(() => {
    if (autoSeededRef.current) return;
    if (!landingQuery.data) return;
    if (editState !== null) return;
    if (landingQuery.data.landingMode !== "BLOCKS") return;
    autoSeededRef.current = true;

    const serverBlocks = landingQuery.data.blocks;
    const heroIdx = serverBlocks.findIndex((b) => b.type === "product-hero");

    if (heroIdx === -1) {
      // 없음 → prepend
      setEditState({
        blocks: [makeEmptyBlock("product-hero", makeId()), ...serverBlocks],
        landingMode: "BLOCKS",
        singleHtmlUrl: landingQuery.data.singleHtmlUrl,
      });
    } else if (heroIdx !== 0) {
      // 첫 위치가 아님 → 0번으로 이동
      const reordered = [
        serverBlocks[heroIdx],
        ...serverBlocks.slice(0, heroIdx),
        ...serverBlocks.slice(heroIdx + 1),
      ];
      setEditState({
        blocks: reordered,
        landingMode: "BLOCKS",
        singleHtmlUrl: landingQuery.data.singleHtmlUrl,
      });
    }
    // 이미 0번에 product-hero → 아무것도 안 함 (dirty 발생 X)
  }, [landingQuery.data, editState]);

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
    // product-hero 는 자동 추가되는 필수 블록 — 중복 추가 차단
    if (type === "product-hero" && blocks.some((b) => b.type === "product-hero")) {
      toast.error("상품 메인은 이미 첫 블록으로 존재합니다 (1개만 허용)");
      return;
    }
    const newId = makeId();
    dispatchBlocks((prev) => [...prev, makeEmptyBlock(type, newId)]);
    setExpandedId(newId);
  };

  const updateBlock = (next: LandingBlock) => {
    dispatchBlocks((prev) => prev.map((b) => (b.id === next.id ? next : b)));
  };

  const removeBlock = (blockId: string) => {
    // product-hero 는 필수 블록 — 삭제 차단
    const target = blocks.find((b) => b.id === blockId);
    if (target?.type === "product-hero") {
      toast.error("상품 메인은 필수 블록이라 삭제할 수 없습니다");
      setDeleteId(null);
      return;
    }
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
      // product-hero 는 항상 0번 위치 고정 — 자기 자신 이동 + 다른 블록의 0번 자리 침범 모두 차단
      if (prev[oldIdx].type === "product-hero") return prev;
      if (newIdx === 0 && prev[0]?.type === "product-hero") return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  };

  const duplicateBlock = (idx: number) => {
    // product-hero 는 1개만 — 복제 차단
    if (blocks[idx]?.type === "product-hero") {
      toast.error("상품 메인은 1개만 존재할 수 있어 복제할 수 없습니다");
      return;
    }
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
        <p className="text-sm text-[var(--jm-text-muted)]">상품 정보를 불러올 수 없습니다</p>
        <JmButton variant="outline" size="sm" onClick={() => landingQuery.refetch()}>다시 시도</JmButton>
      </div>
    );
  }

  const product = landingQuery.data;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--jm-border)] px-5 py-2.5">
        <JmIconButton
          variant="ghost"
          size="sm"
          aria-label="뒤로"
          onClick={() => navigateAway(() => router.push(`/products/${id}`))}
        >
          <ArrowLeft className="h-4 w-4" />
        </JmIconButton>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-[var(--jm-text)]">{product.name}</span>
          <span className="text-xs text-[var(--jm-text-muted)]">상세페이지 편집 · {product.sku}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <JmButton
            variant="outline"
            size="xs"
            onClick={() => {
              setJsonText(JSON.stringify(blocks, null, 2));
              setJsonError(null);
              setJsonOpen(true);
            }}
            title="JSON 구조 보기 / Claude Code로 만든 JSON 붙여넣기"
          >
            <Code2 className="h-4 w-4" />
            <span>JSON</span>
          </JmButton>
          <JmButton
            variant="outline"
            size="xs"
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
          </JmButton>
          <JmButton
            variant="outline"
            size="xs"
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
          </JmButton>
          <JmButton
            variant="outline"
            size="xs"
            onClick={() => window.open(`/products/${id}/landing/preview`, "_blank")}
          >
            <ExternalLink className="h-4 w-4" />
            <span>미리보기</span>
          </JmButton>
          <JmButton
            variant="cta"
            size="xs"
            disabled={!dirty || saveMutation.isPending}
            onClick={() => saveMutation.mutate(current)}
          >
            {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>{saveMutation.isPending ? "저장 중..." : "저장"}</span>
          </JmButton>
        </div>
      </div>

      {/* 모드 토글 */}
      <div className="flex items-center gap-2 border-b border-[var(--jm-border)] bg-[var(--jm-surface)] px-5 py-2">
        <span className="text-xs text-[var(--jm-text-muted)]">모드:</span>
        <div className="flex h-7 rounded-md border border-[var(--jm-border)] bg-[var(--jm-bg)] text-jm-xs">
          <button
            type="button"
            className={cn(
              "px-3 transition-colors",
              landingMode === "BLOCKS"
                ? "bg-[var(--jm-surface-muted)] text-[var(--jm-text)]"
                : "text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]",
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
                ? "bg-[var(--jm-surface-muted)] text-[var(--jm-text)]"
                : "text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]",
            )}
            onClick={() => updateState({ landingMode: "SINGLE_HTML" })}
          >
            단일 HTML
          </button>
        </div>
        <span className="ml-2 text-jm-2xs text-[var(--jm-text-muted)]">
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
        <aside className="flex w-[420px] shrink-0 flex-col border-r border-[var(--jm-border)] bg-[var(--jm-surface)]">
          <div className="border-b border-[var(--jm-border)] px-4 py-3">
            <p className="text-xs font-medium text-[var(--jm-text-muted)]">
              블록 추가 <span className="text-[var(--jm-text-muted)]/70">(마우스 올리면 설명)</span>
            </p>
            <JmTooltipProvider delay={200}>
              <div className="mt-2 grid grid-cols-4 gap-1">
                {BLOCK_TYPES.map((t) => {
                  const Icon = BLOCK_ICON[t];
                  const desc = BLOCK_DESCRIPTIONS[t];
                  const alreadyHasHero = t === "product-hero" && blocks.some((b) => b.type === "product-hero");
                  return (
                    <JmTooltipRoot key={t}>
                      <JmTooltipTrigger
                        render={
                          <JmButton
                            type="button"
                            variant="outline"
                            size="xs"
                            disabled={alreadyHasHero}
                            className="flex h-auto flex-col gap-1 py-2 text-jm-2xs"
                            onClick={() => addBlock(t)}
                          >
                            <Icon className="h-4 w-4" />
                            <span>{BLOCK_LABELS[t]}</span>
                          </JmButton>
                        }
                      />
                      <JmTooltipContent side="bottom" className="max-w-[260px] whitespace-normal">
                        <div className="space-y-1.5 text-left">
                          <div className="text-jm-xs font-semibold">{desc.title}</div>
                          <div className="text-jm-2xs leading-snug opacity-90">{desc.body}</div>
                          <div className="text-jm-3xs italic opacity-70">{desc.example}</div>
                        </div>
                      </JmTooltipContent>
                    </JmTooltipRoot>
                  );
                })}
              </div>
            </JmTooltipProvider>
            <details className="mt-2 rounded-md bg-[var(--jm-surface-muted)]/40 px-2 py-1.5 text-jm-2xs">
              <summary className="cursor-pointer text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]">
                블록 종류별 설명 보기
              </summary>
              <ul className="mt-2 space-y-1.5">
                {BLOCK_TYPES.map((t) => {
                  const Icon = BLOCK_ICON[t];
                  const desc = BLOCK_DESCRIPTIONS[t];
                  return (
                    <li key={t} className="flex gap-1.5">
                      <Icon className="mt-0.5 h-3 w-3 shrink-0 text-[var(--jm-text-muted)]" />
                      <div className="leading-snug">
                        <span className="font-medium">{desc.title}</span>
                        <span className="ml-1 text-[var(--jm-text-muted)]">— {desc.body}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </details>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {blocks.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-[var(--jm-text-muted)]">
                위에서 블록을 추가하세요
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext
                  items={blocks.map((b) => b.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="divide-y divide-[var(--jm-border)]">
                    {blocks.map((block) => (
                      <SortableBlockItem
                        key={block.id}
                        block={block}
                        iconMap={BLOCK_ICON}
                        expanded={expandedId === block.id}
                        locked={block.type === "product-hero"}
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
        <div className="flex flex-1 min-w-0 flex-col bg-[var(--jm-surface-muted)]/30">
          <div className="flex items-center gap-2 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-4 py-2">
            <span className="text-xs text-[var(--jm-text-muted)]">미리보기</span>
            {dirty && (
              <span className="rounded-full bg-[var(--jm-warning-bg)] px-2 py-0.5 text-jm-3xs text-[var(--jm-warning-fg)]">
                저장되지 않은 변경사항
              </span>
            )}
            <div className="ml-auto flex h-7 rounded-md border border-[var(--jm-border)] bg-[var(--jm-bg)] text-jm-xs">
              <button
                type="button"
                className={cn(
                  "flex items-center gap-1 px-2",
                  previewWidth === "desktop"
                    ? "bg-[var(--jm-surface-muted)] text-[var(--jm-text)]"
                    : "text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]",
                )}
                onClick={() => setPreviewWidth("desktop")}
                title="데스크톱 폭"
              >
                <Monitor className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className={cn(
                  "flex items-center gap-1 border-l border-[var(--jm-border)] px-2",
                  previewWidth === "tablet"
                    ? "bg-[var(--jm-surface-muted)] text-[var(--jm-text)]"
                    : "text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]",
                )}
                onClick={() => setPreviewWidth("tablet")}
                title="태블릿 폭 (768px)"
              >
                <Tablet className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className={cn(
                  "flex items-center gap-1 border-l border-[var(--jm-border)] px-2",
                  previewWidth === "mobile"
                    ? "bg-[var(--jm-surface-muted)] text-[var(--jm-text)]"
                    : "text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]",
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
                "mx-auto bg-[var(--jm-bg)] shadow-[var(--jm-shadow-sm)]",
                previewWidth === "desktop" && "max-w-[960px]",
                previewWidth === "tablet" && "max-w-[768px]",
                previewWidth === "mobile" && "max-w-[375px]",
              )}
            >
              {(footerQuery.data?.headerBlocks ?? []).length > 0 && (
                <>
                  <div className="border-b border-[var(--jm-border)] bg-[var(--jm-surface-muted)]/30 px-4 py-2 text-center text-jm-2xs text-[var(--jm-text-muted)]">
                    ↑ 위는 모든 상품에 공통으로 붙는 상단 공지/배너 (설정 → 상단 공지/배너)
                  </div>
                  <LandingPageView
                    blocks={(footerQuery.data?.headerBlocks ?? []).map((b) => ({
                      ...b,
                      id: `__header__${b.id}`,
                    }))}
                    productId={id}
                  />
                </>
              )}
              <LandingPageView blocks={blocks} productId={id} />
              {(footerQuery.data?.footerBlocks ?? []).length > 0 && (
                <>
                  <div className="border-t border-[var(--jm-border)] bg-[var(--jm-surface-muted)]/30 px-4 py-2 text-center text-jm-2xs text-[var(--jm-text-muted)]">
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

      <JmDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <JmDialogContent>
          <JmDialogHeader>
            <JmDialogTitle>블록을 삭제할까요?</JmDialogTitle>
            <JmDialogDescription>이 작업은 저장 전까지는 되돌릴 수 있습니다.</JmDialogDescription>
          </JmDialogHeader>
          <JmDialogFooter>
            <JmButton variant="outline" size="sm" onClick={() => setDeleteId(null)}>취소</JmButton>
            <JmButton variant="danger" size="sm" onClick={() => deleteId && removeBlock(deleteId)}>
              삭제
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>

      <JmDialog
        open={leaveDialogOpen}
        onOpenChange={(o) => {
          if (!o) {
            pendingNavRef.current = null;
            setLeaveDialogOpen(false);
          }
        }}
      >
        <JmDialogContent>
          <JmDialogHeader>
            <JmDialogTitle>저장하지 않은 변경사항이 있습니다</JmDialogTitle>
            <JmDialogDescription>
              지금 페이지를 나가면 저장하지 않은 변경 내용이 사라집니다. 정말 나가시겠어요?
            </JmDialogDescription>
          </JmDialogHeader>
          <JmDialogFooter>
            <JmButton
              variant="outline"
              size="sm"
              onClick={() => {
                pendingNavRef.current = null;
                setLeaveDialogOpen(false);
              }}
            >
              취소 (계속 편집)
            </JmButton>
            <JmButton
              variant="danger"
              size="sm"
              onClick={() => {
                const fn = pendingNavRef.current;
                pendingNavRef.current = null;
                setLeaveDialogOpen(false);
                if (fn) fn();
              }}
            >
              나가기 (변경 버림)
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>

      <JmDialog open={jsonOpen} onOpenChange={setJsonOpen}>
        <JmDialogContent
          size="xl"
          className="flex max-h-[90vh] w-[min(1100px,95vw)] max-w-none flex-col gap-3"
        >
          <JmDialogHeader>
            <JmDialogTitle>JSON 가져오기 / 내보내기</JmDialogTitle>
            <JmDialogDescription>
              로컬 Claude Code 등으로 만든 JSON을 붙여넣고 <b>가져오기</b>를 누르면 미리보기에 즉시 반영됩니다 (저장은 헤더의 &ldquo;저장&rdquo; 버튼).
            </JmDialogDescription>
          </JmDialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-2 px-5">
            <JmTextarea
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value);
                setJsonError(null);
              }}
              className="min-h-0 flex-1 resize-none font-mono text-jm-2xs leading-snug"
              spellCheck={false}
            />
            {jsonError && (
              <p className="rounded-md bg-[var(--jm-danger-bg)] px-2 py-1.5 text-xs text-[var(--jm-danger-fg)]">
                {jsonError}
              </p>
            )}
            <p className="text-jm-2xs text-[var(--jm-text-muted)]">
              스키마: <code className="rounded bg-[var(--jm-surface-muted)] px-1">LandingBlock[]</code> · 자세한 스펙은{" "}
              <code className="rounded bg-[var(--jm-surface-muted)] px-1">src/lib/validators/landing-block.ts</code>{" "}
              참고
            </p>
          </div>
          <JmDialogFooter className="gap-2">
            <JmButton
              variant="outline"
              size="sm"
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
            </JmButton>
            <div className="flex-1" />
            <JmButton variant="outline" size="sm" onClick={() => setJsonOpen(false)}>닫기</JmButton>
            <JmButton
              variant="cta"
              size="sm"
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
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>
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
      <aside className="flex w-[420px] shrink-0 flex-col gap-3 border-r border-[var(--jm-border)] bg-[var(--jm-surface)] p-4">
        <p className="rounded-md bg-[var(--jm-surface-muted)] px-3 py-2 text-jm-xs text-[var(--jm-text-muted)]">
          이 모드는 업로드한 HTML 파일을 페이지 전체로 통째 보여줍니다. 블록과 공통 footer 는 적용되지 않으며, sandboxed iframe 안에 격리되어 렌더링됩니다.
        </p>

        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--jm-text)]">HTML 파일</p>
          <div className="flex flex-wrap gap-2">
            <JmButton
              type="button"
              variant="outline"
              size="xs"
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
            </JmButton>
            {singleHtmlUrl && (
              <>
                <JmButton
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => window.open(resolveHtmlSrc(singleHtmlUrl), "_blank")}
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>새 탭에서 열기</span>
                </JmButton>
                <JmButton type="button" variant="ghost" size="xs" onClick={onClear}>
                  <Trash2 className="h-4 w-4" />
                  <span>제거</span>
                </JmButton>
              </>
            )}
          </div>
          {singleHtmlUrl && (
            <JmInput
              value={singleHtmlUrl}
              readOnly
              className="h-8 text-jm-2xs text-[var(--jm-text-muted)]"
              onFocus={(e) => e.currentTarget.select()}
            />
          )}
        </div>

        <p className="text-jm-2xs text-[var(--jm-text-muted)]">
          ⚠️ HTML 안의 <code className="rounded bg-[var(--jm-surface-muted)] px-1">{`<img>`}</code> 는 절대 URL 또는 base64 권장. 상대 경로는 storage 경로 기준이라 깨질 수 있습니다.
        </p>
      </aside>

      <div className="flex flex-1 min-w-0 flex-col bg-[var(--jm-surface-muted)]/30">
        <div className="flex items-center gap-2 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-4 py-2">
          <span className="text-xs text-[var(--jm-text-muted)]">미리보기</span>
          {dirty && (
            <span className="rounded-full bg-[var(--jm-warning-bg)] px-2 py-0.5 text-jm-3xs text-[var(--jm-warning-fg)]">
              저장되지 않은 변경사항
            </span>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto bg-[var(--jm-bg)]">
          {singleHtmlUrl ? (
            <SingleHtmlPreview src={resolveHtmlSrc(singleHtmlUrl)} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--jm-text-muted)]">
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
      <div className="flex items-center gap-3 border-b border-[var(--jm-border)] px-5 py-2.5">
        <JmSkeleton className="h-8 w-8 rounded-md" />
        <div className="space-y-1">
          <JmSkeleton className="h-4 w-40" />
          <JmSkeleton className="h-3 w-32" />
        </div>
        <div className="ml-auto flex gap-2">
          <JmSkeleton className="h-8 w-20 rounded-md" />
          <JmSkeleton className="h-8 w-16 rounded-md" />
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        <aside className="w-[420px] shrink-0 border-r border-[var(--jm-border)] bg-[var(--jm-surface)] p-4">
          <JmSkeleton className="mb-3 h-3 w-16" />
          <div className="grid grid-cols-5 gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <JmSkeleton key={i} className="h-12 rounded-md" />
            ))}
          </div>
          <div className="mt-6 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <JmSkeleton key={i} className="h-9 w-full rounded-md" />
            ))}
          </div>
        </aside>
        <div className="flex-1 bg-[var(--jm-surface-muted)]/30 p-6">
          <JmSkeleton className="mx-auto h-[420px] w-full max-w-[960px]" />
        </div>
      </div>
    </div>
  );
}

