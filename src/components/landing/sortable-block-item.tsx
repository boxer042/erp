"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, Copy, GripVertical, Lock, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BLOCK_LABELS, type BlockType, type LandingBlock } from "@/lib/validators/landing-block";
import { cn } from "@/lib/utils";

import { BlockEditor } from "@/app/(dashboard)/products/[id]/landing/_block-editor";
import { blockTitle } from "@/app/(dashboard)/products/[id]/landing/_helpers";

interface Props {
  block: LandingBlock;
  expanded: boolean;
  iconMap: Record<BlockType, React.ComponentType<{ className?: string }>>;
  onToggle: () => void;
  onUpdate: (next: LandingBlock) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  /** true 면 드래그·삭제·복제 버튼 비활성. 항상 첫 위치에 고정되어야 하는 블록 (product-hero) 용 */
  locked?: boolean;
}

/** drag-and-drop 가능한 블록 리스트 항목. 상품/footer 양쪽 페이지에서 공유 사용 */
export function SortableBlockItem({
  block,
  expanded,
  iconMap,
  onToggle,
  onUpdate,
  onDelete,
  onDuplicate,
  locked = false,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id, disabled: locked });
  const Icon = iconMap[block.type];
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.6 : undefined,
  };

  return (
    <li ref={setNodeRef} style={style} className={cn("bg-background", locked && "bg-muted/40")}>
      <div className="flex items-center gap-2 px-3 py-2">
        {locked ? (
          <span
            className="flex h-7 w-5 items-center justify-center text-muted-foreground/60"
            title="고정 블록 — 순서 변경 불가"
          >
            <Lock className="h-3.5 w-3.5" />
          </span>
        ) : (
          <button
            type="button"
            className="flex h-7 w-5 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
            {...attributes}
            {...listeners}
            aria-label="드래그해서 순서 변경"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          className="flex flex-1 items-center gap-2 text-left"
          onClick={onToggle}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium">{BLOCK_LABELS[block.type]}</span>
          <span className="truncate text-xs text-muted-foreground">{blockTitle(block)}</span>
          {locked && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              필수
            </span>
          )}
        </button>
        {!locked && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onDuplicate}
              title="복제"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onDelete}
              title="삭제"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
      {expanded && (
        <div className="border-t border-border bg-muted/30 px-4 py-3">
          <BlockEditor block={block} onChange={onUpdate} />
        </div>
      )}
    </li>
  );
}
