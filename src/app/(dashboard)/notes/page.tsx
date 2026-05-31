"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Trash2,
  BellRing,
  CalendarClock,
  Pin,
  StickyNote,
} from "lucide-react";
import { toast } from "sonner";

import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  JmBadge,
  JmButton,
  JmCard,
  JmCheckbox,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmEmpty,
  JmIconButton,
  JmInput,
  JmSegmentedControl,
  JmSkeleton,
} from "@/jm";

import { KakaoConnect } from "./_kakao-connect";
import { NoteSheet } from "./_note-sheet";
import {
  type NoteDto,
  SOURCE_HREF,
  SOURCE_LABELS,
} from "./_types";

type TabValue = "all" | "todo" | "done" | "memo" | "source";

const TAB_OPTIONS: { value: TabValue; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "todo", label: "할 일" },
  { value: "done", label: "완료" },
  { value: "memo", label: "메모" },
  { value: "source", label: "출처별" },
];

function tabToParams(tab: TabValue): string {
  const p = new URLSearchParams();
  if (tab === "todo") {
    p.set("kind", "TODO");
    p.set("done", "0");
  } else if (tab === "done") {
    p.set("done", "1");
  } else if (tab === "memo") {
    p.set("kind", "MEMO");
  } else if (tab === "source") {
    p.set("hasSource", "1");
  }
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

export default function NotesPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabValue>("all");
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<NoteDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NoteDto | null>(null);
  const [sourceTarget, setSourceTarget] = useState<NoteDto | null>(null);

  const notesQuery = useQuery({
    queryKey: queryKeys.notes.list({ tab }),
    queryFn: ({ signal }) =>
      apiGet<NoteDto[]>(`/api/notes${tabToParams(tab)}`, undefined, signal),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.notes.all });

  const toggleMutation = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      apiMutate(`/api/notes/${id}`, "PUT", { done }),
    onSuccess: invalidate,
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "변경 실패"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/notes/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("삭제되었습니다");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "삭제 실패"),
  });

  const all = notesQuery.data ?? [];
  const q = search.trim().toLowerCase();
  const notes = q
    ? all.filter(
        (n) =>
          n.content.toLowerCase().includes(q) ||
          (n.title ?? "").toLowerCase().includes(q),
      )
    : all;

  const openNew = () => {
    setEditTarget(null);
    setSheetOpen(true);
  };
  const openEdit = (n: NoteDto) => {
    setEditTarget(n);
    setSheetOpen(true);
  };

  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="flex w-full flex-col gap-6 p-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-jm-lg font-semibold text-[var(--jm-text)]">
              업무 노트
            </h1>
            <p className="text-jm-sm text-[var(--jm-text-muted)]">
              할 일과 메모를 한곳에서. 체크하고 알림 받으세요.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <KakaoConnect />
            <JmButton variant="cta" onClick={openNew}>
              <Plus className="size-4" />
              추가
            </JmButton>
          </div>
        </div>

        {/* 탭 + 검색 */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <JmSegmentedControl<TabValue>
            size="sm"
            options={TAB_OPTIONS}
            value={tab}
            onChange={setTab}
          />
          <JmInput
            className="max-w-[260px]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="내용·제목 검색"
          />
        </div>

        {/* 리스트 */}
        <JmCard className="overflow-hidden p-0">
          {notesQuery.isPending ? (
            <div className="divide-y divide-[var(--jm-border)]">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-4">
                  <JmSkeleton className="size-5 rounded" />
                  <div className="flex-1 space-y-2">
                    <JmSkeleton className="h-4 w-1/3" />
                    <JmSkeleton className="h-3 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : notes.length === 0 ? (
            <JmEmpty
              icon={<StickyNote />}
              title={q ? "검색 결과가 없습니다" : "노트가 없습니다"}
              description={
                q
                  ? undefined
                  : tab === "source"
                    ? "주문·입고·수리·거래처 등에서 남긴 메모가 여기 모입니다."
                    : "오른쪽 위 추가 버튼으로 첫 노트를 만들어 보세요."
              }
            />
          ) : (
            <div className="divide-y divide-[var(--jm-border)]">
              {notes.map((n) => (
                <NoteRow
                  key={n.id}
                  note={n}
                  toggling={
                    toggleMutation.isPending &&
                    toggleMutation.variables?.id === n.id
                  }
                  onToggle={() =>
                    toggleMutation.mutate({ id: n.id, done: !n.done })
                  }
                  onEdit={() => openEdit(n)}
                  onDelete={() => setDeleteTarget(n)}
                  onSource={() => setSourceTarget(n)}
                />
              ))}
            </div>
          )}
        </JmCard>
      </div>

      <NoteSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editTarget={editTarget}
        onSaved={invalidate}
      />

      {/* 삭제 확인 */}
      <JmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
      >
        <JmDialogContent size="sm">
          <JmDialogHeader>
            <JmDialogTitle>노트 삭제</JmDialogTitle>
          </JmDialogHeader>
          <JmDialogBody>
            <p className="text-jm-sm text-[var(--jm-text)]">이 노트를 삭제할까요?</p>
            <p className="mt-1 line-clamp-2 text-jm-xs text-[var(--jm-text-muted)]">
              {deleteTarget?.title || deleteTarget?.content}
            </p>
          </JmDialogBody>
          <JmDialogFooter>
            <JmButton variant="outline" onClick={() => setDeleteTarget(null)}>
              취소
            </JmButton>
            <JmButton
              variant="danger"
              disabled={deleteMutation.isPending}
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget.id)
              }
            >
              삭제
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>

      {/* 출처 모달 */}
      <SourceDialog note={sourceTarget} onClose={() => setSourceTarget(null)} />
    </div>
  );
}

function NoteRow({
  note,
  toggling,
  onToggle,
  onEdit,
  onDelete,
  onSource,
}: {
  note: NoteDto;
  toggling: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSource: () => void;
}) {
  const isTodo = note.kind === "TODO";
  const muted = note.done ? "text-[var(--jm-text-subtle)] line-through" : "";
  return (
    <div className="flex items-start gap-3 p-4 hover:bg-[var(--jm-surface-muted)]">
      <div className="pt-0.5">
        {isTodo ? (
          <JmCheckbox
            checked={note.done}
            disabled={toggling}
            onCheckedChange={onToggle}
          />
        ) : (
          <StickyNote className="size-4 text-[var(--jm-text-subtle)]" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {note.pinned && <Pin className="size-3.5 text-[var(--jm-text-muted)]" />}
          {note.title && (
            <span className={`text-jm-sm font-semibold text-[var(--jm-text)] ${muted}`}>
              {note.title}
            </span>
          )}
          {isTodo && note.priority === "HIGH" && (
            <JmBadge variant="danger" size="sm">
              높음
            </JmBadge>
          )}
          {note.sourceType && (
            <button type="button" className="cursor-pointer" onClick={onSource}>
              <JmBadge variant="outline" size="sm">
                {SOURCE_LABELS[note.sourceType]}
                {note.sourceLabel ? ` · ${note.sourceLabel}` : ""}
              </JmBadge>
            </button>
          )}
        </div>
        <p className={`whitespace-pre-wrap break-words text-jm-sm text-[var(--jm-text)] ${muted}`}>
          {note.content}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-jm-xs text-[var(--jm-text-muted)]">
          {note.dueDate && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3" />
              {new Date(note.dueDate).toLocaleDateString("ko-KR")}
            </span>
          )}
          {note.notify && (
            <span className="inline-flex items-center gap-1">
              <BellRing className="size-3" />
              알림
            </span>
          )}
          {note.createdBy?.name && <span>{note.createdBy.name}</span>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <JmIconButton aria-label="수정" variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="size-4" />
        </JmIconButton>
        <JmIconButton aria-label="삭제" variant="ghost" size="sm" onClick={onDelete}>
          <Trash2 className="size-4" />
        </JmIconButton>
      </div>
    </div>
  );
}

function SourceDialog({
  note,
  onClose,
}: {
  note: NoteDto | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const href =
    note?.sourceType && note.sourceId && SOURCE_HREF[note.sourceType]
      ? SOURCE_HREF[note.sourceType]!(note.sourceId)
      : null;

  return (
    <JmDialog open={!!note} onOpenChange={(v) => !v && onClose()}>
      <JmDialogContent size="sm">
        <JmDialogHeader>
          <JmDialogTitle>출처</JmDialogTitle>
        </JmDialogHeader>
        <JmDialogBody>
          {note?.sourceType && (
            <p className="text-jm-sm font-medium text-[var(--jm-text)]">
              {SOURCE_LABELS[note.sourceType]}
              {note.sourceLabel ? ` · ${note.sourceLabel}` : ""}
            </p>
          )}
          <p className="mt-2 whitespace-pre-wrap text-jm-sm text-[var(--jm-text-muted)]">
            {note?.content}
          </p>
        </JmDialogBody>
        <JmDialogFooter>
          <JmButton variant="outline" onClick={onClose}>
            닫기
          </JmButton>
          {href && (
            <JmButton
              variant="cta"
              onClick={() => {
                onClose();
                router.push(href);
              }}
            >
              원본으로 이동
            </JmButton>
          )}
        </JmDialogFooter>
      </JmDialogContent>
    </JmDialog>
  );
}
