"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Smartphone,
} from "lucide-react";
import {
  JmButton,
  JmIconButton,
  JmInput,
  JmTextarea,
  JmSelect,
  JmCard,
  JmFormField,
  JmSkeleton,
  jmToast,
} from "@/jm";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import {
  type ManualBlock,
  type ManualBlockType,
  MANUAL_BLOCK_LABELS,
  createManualBlock,
  parseManualBlocks,
} from "@/lib/manual-blocks";
import { ManualRenderer } from "@/components/manual-renderer";
import { ImageUploadField } from "@/app/(dashboard)/products/[id]/landing/_image-upload";

interface ManualData {
  id: string;
  name: string;
  blocks: ManualBlock[];
}

const BLOCK_ORDER: ManualBlockType[] = [
  "heading",
  "paragraph",
  "image",
  "gallery",
  "video",
  "steps",
  "spec",
  "callout",
  "faq",
  "pdf",
];

/**
 * 사용설명서(매뉴얼) 블록 에디터 — Product·RentalAsset 공용.
 * apiPath 는 GET/PUT 둘 다 처리하는 매뉴얼 엔드포인트.
 */
export function ManualEditor({
  apiPath,
  queryKey,
  backHref,
}: {
  apiPath: string;
  queryKey: readonly unknown[];
  backHref: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [blocks, setBlocks] = useState<ManualBlock[] | null>(null);

  const dataQuery = useQuery({
    queryKey,
    queryFn: () => apiGet<ManualData>(apiPath),
  });

  // 최초 로드 시 1회 blocks 초기화 (렌더 중 비교 패턴)
  if (blocks === null && dataQuery.data) {
    setBlocks(parseManualBlocks(dataQuery.data.blocks));
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      apiMutate(apiPath, "PUT", { blocks: blocks ?? [] }),
    onSuccess: () => {
      jmToast.success("사용설명서가 저장되었습니다");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (e) =>
      jmToast.error(e instanceof ApiError ? e.message : "저장 실패"),
  });

  if (dataQuery.isPending || blocks === null) {
    return (
      <div className="flex flex-1 gap-4 p-4">
        <JmSkeleton className="h-[70vh] w-[380px] rounded-[var(--jm-radius-lg)]" />
        <JmSkeleton className="h-[70vh] flex-1 rounded-[var(--jm-radius-lg)]" />
      </div>
    );
  }
  if (dataQuery.isError || !dataQuery.data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-jm-base text-[var(--jm-text)]">
          찾을 수 없습니다
        </p>
      </div>
    );
  }

  const data = dataQuery.data;

  const addBlock = (type: ManualBlockType) =>
    setBlocks((prev) => [...(prev ?? []), createManualBlock(type)]);

  const updateBlock = (block: ManualBlock) =>
    setBlocks((prev) =>
      (prev ?? []).map((b) => (b.id === block.id ? block : b)),
    );

  const removeBlock = (id: string) =>
    setBlocks((prev) => (prev ?? []).filter((b) => b.id !== id));

  const moveBlock = (id: string, dir: -1 | 1) =>
    setBlocks((prev) => {
      const arr = [...(prev ?? [])];
      const i = arr.indexOf(arr.find((b) => b.id === id)!);
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });

  return (
    <div className="flex h-full flex-col bg-[var(--jm-bg)]">
      {/* 헤더 */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--jm-border)] px-4 py-3">
        <JmIconButton aria-label="뒤로" onClick={() => router.push(backHref)}>
          <ArrowLeft />
        </JmIconButton>
        <div className="flex flex-col">
          <span className="text-jm-base font-semibold text-[var(--jm-text)]">
            사용설명서 편집
          </span>
          <span className="text-jm-xs text-[var(--jm-text-muted)]">
            {data.name}
          </span>
        </div>
        <div className="ml-auto">
          <JmButton
            variant="cta"
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "저장 중..." : "저장"}
          </JmButton>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 미리보기 */}
        <aside className="hidden w-[400px] shrink-0 overflow-y-auto border-r border-[var(--jm-border)] bg-[var(--jm-surface-muted)] p-5 lg:block">
          <div className="mb-3 flex items-center gap-1.5 text-jm-xs text-[var(--jm-text-muted)]">
            <Smartphone className="size-3.5" />
            손님 화면 미리보기
          </div>
          <div className="mx-auto max-w-[340px] rounded-[var(--jm-radius-lg)] bg-[var(--jm-bg)] p-4">
            <ManualRenderer blocks={blocks} />
          </div>
        </aside>

        {/* 편집 */}
        <main className="flex-1 overflow-y-auto p-5">
          <div className="mx-auto flex max-w-[640px] flex-col gap-4">
            {/* 블록 추가 */}
            <div className="flex flex-wrap gap-1.5">
              {BLOCK_ORDER.map((type) => (
                <JmButton
                  key={type}
                  variant="outline"
                  size="xs"
                  onClick={() => addBlock(type)}
                >
                  <Plus className="size-3.5" />
                  {MANUAL_BLOCK_LABELS[type]}
                </JmButton>
              ))}
            </div>

            {blocks.length === 0 ? (
              <div className="rounded-[var(--jm-radius-lg)] border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] py-12 text-center text-jm-sm text-[var(--jm-text-muted)]">
                위 버튼으로 블록을 추가해 사용설명서를 작성하세요.
              </div>
            ) : (
              blocks.map((block, i) => (
                <JmCard key={block.id}>
                  <div className="flex items-center justify-between border-b border-[var(--jm-border)] px-3 py-2">
                    <span className="text-jm-xs font-semibold text-[var(--jm-text-muted)]">
                      {MANUAL_BLOCK_LABELS[block.type]}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <JmIconButton
                        aria-label="위로"
                        size="sm"
                        disabled={i === 0}
                        onClick={() => moveBlock(block.id, -1)}
                      >
                        <ChevronUp />
                      </JmIconButton>
                      <JmIconButton
                        aria-label="아래로"
                        size="sm"
                        disabled={i === blocks.length - 1}
                        onClick={() => moveBlock(block.id, 1)}
                      >
                        <ChevronDown />
                      </JmIconButton>
                      <JmIconButton
                        aria-label="삭제"
                        size="sm"
                        onClick={() => removeBlock(block.id)}
                      >
                        <Trash2 />
                      </JmIconButton>
                    </div>
                  </div>
                  <div className="p-3">
                    <BlockForm block={block} onChange={updateBlock} />
                  </div>
                </JmCard>
              ))
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 블록별 편집 폼
// ─────────────────────────────────────────────
function BlockForm({
  block,
  onChange,
}: {
  block: ManualBlock;
  onChange: (b: ManualBlock) => void;
}) {
  switch (block.type) {
    case "heading":
      return (
        <div className="flex gap-2">
          <div className="w-28 shrink-0">
            <JmSelect
              value={String(block.level)}
              onChange={(v) =>
                onChange({ ...block, level: Number(v) as 2 | 3 })
              }
              options={[
                { value: "2", label: "큰 제목" },
                { value: "3", label: "작은 제목" },
              ]}
            />
          </div>
          <JmInput
            className="flex-1"
            value={block.text}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
            placeholder="제목 텍스트"
          />
        </div>
      );

    case "paragraph":
      return (
        <JmTextarea
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          rows={4}
          placeholder="본문 내용"
        />
      );

    case "image":
      return (
        <div className="flex flex-col gap-2">
          <ImageUploadField
            value={block.url}
            onChange={(url) => onChange({ ...block, url })}
          />
          <JmInput
            value={block.caption ?? ""}
            onChange={(e) => onChange({ ...block, caption: e.target.value })}
            placeholder="이미지 설명 (선택)"
          />
        </div>
      );

    case "gallery":
      return (
        <ItemList
          items={block.items}
          onChange={(items) => onChange({ ...block, items })}
          empty={{ url: "", caption: "" }}
          render={(it, upd) => (
            <div className="flex flex-col gap-2">
              <ImageUploadField
                value={it.url}
                onChange={(url) => upd({ url })}
              />
              <JmInput
                value={it.caption ?? ""}
                onChange={(e) => upd({ caption: e.target.value })}
                placeholder="설명 (선택)"
              />
            </div>
          )}
        />
      );

    case "video":
      return (
        <div className="flex flex-col gap-2">
          <div className="w-32">
            <JmSelect
              value={block.provider}
              onChange={(v) =>
                onChange({
                  ...block,
                  provider: v as "youtube" | "vimeo" | "self",
                })
              }
              options={[
                { value: "youtube", label: "YouTube" },
                { value: "vimeo", label: "Vimeo" },
                { value: "self", label: "직접 호스팅" },
              ]}
            />
          </div>
          <JmInput
            value={block.url}
            onChange={(e) => onChange({ ...block, url: e.target.value })}
            placeholder="동영상 URL"
          />
        </div>
      );

    case "steps":
      return (
        <ItemList
          items={block.items}
          onChange={(items) => onChange({ ...block, items })}
          empty={{ title: "", body: "" }}
          render={(it, upd) => (
            <div className="flex flex-col gap-2">
              <JmInput
                value={it.title}
                onChange={(e) => upd({ title: e.target.value })}
                placeholder="단계 제목"
              />
              <JmTextarea
                value={it.body}
                onChange={(e) => upd({ body: e.target.value })}
                rows={2}
                placeholder="설명"
              />
              <ImageUploadField
                value={it.imageUrl ?? ""}
                onChange={(url) => upd({ imageUrl: url })}
              />
            </div>
          )}
        />
      );

    case "spec":
      return (
        <ItemList
          items={block.rows}
          onChange={(rows) => onChange({ ...block, rows })}
          empty={{ label: "", value: "" }}
          render={(it, upd) => (
            <div className="flex gap-2">
              <JmInput
                className="w-1/3"
                value={it.label}
                onChange={(e) => upd({ label: e.target.value })}
                placeholder="항목"
              />
              <JmInput
                className="flex-1"
                value={it.value}
                onChange={(e) => upd({ value: e.target.value })}
                placeholder="값"
              />
            </div>
          )}
        />
      );

    case "callout":
      return (
        <div className="flex flex-col gap-2">
          <div className="w-32">
            <JmSelect
              value={block.variant}
              onChange={(v) =>
                onChange({
                  ...block,
                  variant: v as "info" | "warning" | "danger",
                })
              }
              options={[
                { value: "info", label: "안내" },
                { value: "warning", label: "주의" },
                { value: "danger", label: "경고" },
              ]}
            />
          </div>
          <JmInput
            value={block.title ?? ""}
            onChange={(e) => onChange({ ...block, title: e.target.value })}
            placeholder="제목 (선택)"
          />
          <JmTextarea
            value={block.body}
            onChange={(e) => onChange({ ...block, body: e.target.value })}
            rows={2}
            placeholder="내용"
          />
        </div>
      );

    case "faq":
      return (
        <ItemList
          items={block.items}
          onChange={(items) => onChange({ ...block, items })}
          empty={{ q: "", a: "" }}
          render={(it, upd) => (
            <div className="flex flex-col gap-2">
              <JmInput
                value={it.q}
                onChange={(e) => upd({ q: e.target.value })}
                placeholder="질문"
              />
              <JmTextarea
                value={it.a}
                onChange={(e) => upd({ a: e.target.value })}
                rows={2}
                placeholder="답변"
              />
            </div>
          )}
        />
      );

    case "pdf":
      return (
        <div className="flex flex-col gap-2">
          <JmFormField label="표시 이름">
            <JmInput
              value={block.label}
              onChange={(e) => onChange({ ...block, label: e.target.value })}
              placeholder="사용설명서"
            />
          </JmFormField>
          <JmFormField label="PDF URL">
            <JmInput
              value={block.url}
              onChange={(e) => onChange({ ...block, url: e.target.value })}
              placeholder="https://..."
            />
          </JmFormField>
        </div>
      );
  }
}

// 배열 항목(items/rows) 편집 — 추가·삭제·수정 공용.
function ItemList<T>({
  items,
  onChange,
  empty,
  render,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  empty: T;
  render: (item: T, update: (patch: Partial<T>) => void) => React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((it, i) => (
        <div
          key={i}
          className="flex gap-2 rounded-[var(--jm-radius-md)] border border-[var(--jm-border)] p-2"
        >
          <div className="flex-1">
            {render(it, (patch) =>
              onChange(items.map((x, idx) => (idx === i ? { ...x, ...patch } : x))),
            )}
          </div>
          <JmIconButton
            aria-label="항목 삭제"
            size="sm"
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
          >
            <Trash2 />
          </JmIconButton>
        </div>
      ))}
      <JmButton
        variant="outline"
        size="xs"
        onClick={() => onChange([...items, { ...empty }])}
      >
        <Plus className="size-3.5" />
        항목 추가
      </JmButton>
    </div>
  );
}
