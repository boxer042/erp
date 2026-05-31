"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CalendarClock, Plus, StickyNote, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { type NoteDto, type NoteKind, type NoteSourceType } from "@/lib/notes";
import {
  JmBadge,
  JmButton,
  JmCheckbox,
  JmIconButton,
  JmInput,
  JmSegmentedControl,
  JmSkeleton,
  JmSpinner,
} from "@/jm";

interface Props {
  sourceType: NoteSourceType;
  sourceId: string;
  /** 출처 라벨 스냅샷 (예: "ORD260531-0001"). 허브 목록·출처 모달에 표시됨. */
  sourceLabel?: string | null;
  className?: string;
}

/**
 * 특정 엔티티(주문·발주·수리·고객·거래처 등)에 붙는 메모·할일 타임라인.
 * 여기서 추가한 노트는 sourceType/sourceId 로 연결되어 "업무 노트" 허브(/notes)에도 출처와 함께 모인다.
 * 인쇄되는 "대표 비고"(엔티티 자체 memo 필드)와는 별개 — 이 컴포넌트는 내부 작업 메모/할일 전용.
 */
export function NoteTimeline({ sourceType, sourceId, sourceLabel, className }: Props) {
  const queryClient = useQueryClient();
  const listKey = queryKeys.notes.list({ sourceType, sourceId });

  const query = useQuery({
    queryKey: listKey,
    queryFn: ({ signal }) =>
      apiGet<NoteDto[]>(
        `/api/notes?sourceType=${sourceType}&sourceId=${encodeURIComponent(sourceId)}`,
        undefined,
        signal,
      ),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.notes.all });

  const [content, setContent] = useState("");
  const [kind, setKind] = useState<NoteKind>("MEMO");

  const addMutation = useMutation({
    mutationFn: () =>
      apiMutate("/api/notes", "POST", {
        kind,
        content: content.trim(),
        sourceType,
        sourceId,
        sourceLabel: sourceLabel ?? null,
      }),
    onSuccess: () => {
      setContent("");
      setKind("MEMO");
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "추가 실패"),
  });

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
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "삭제 실패"),
  });

  const notes = query.data ?? [];
  const canAdd = content.trim().length > 0;

  return (
    <div className={className}>
      {/* 입력 composer */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex-1">
          <JmInput
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.nativeEvent.isComposing &&
                canAdd &&
                !addMutation.isPending
              ) {
                addMutation.mutate();
              }
            }}
            placeholder="메모 또는 할 일 추가"
          />
        </div>
        <JmSegmentedControl<NoteKind>
          size="sm"
          options={[
            { value: "MEMO", label: "메모" },
            { value: "TODO", label: "할 일" },
          ]}
          value={kind}
          onChange={setKind}
        />
        <JmButton
          variant="cta"
          size="sm"
          disabled={!canAdd || addMutation.isPending}
          onClick={() => addMutation.mutate()}
        >
          {addMutation.isPending ? <JmSpinner size="sm" /> : <Plus className="size-4" />}
          추가
        </JmButton>
      </div>

      {/* 리스트 */}
      <div className="mt-3">
        {query.isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <JmSkeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : notes.length === 0 ? (
          <p className="py-3 text-center text-jm-xs text-[var(--jm-text-muted)]">
            등록된 메모·할 일이 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--jm-border)] rounded-[var(--jm-radius-md)] border border-[var(--jm-border)]">
            {notes.map((n) => {
              const isTodo = n.kind === "TODO";
              const muted = n.done
                ? "text-[var(--jm-text-subtle)] line-through"
                : "text-[var(--jm-text)]";
              const toggling =
                toggleMutation.isPending && toggleMutation.variables?.id === n.id;
              const deleting =
                deleteMutation.isPending && deleteMutation.variables === n.id;
              return (
                <li key={n.id} className="flex items-start gap-2 px-3 py-2">
                  <div className="pt-0.5">
                    {isTodo ? (
                      <JmCheckbox
                        checked={n.done}
                        disabled={toggling}
                        onCheckedChange={() =>
                          toggleMutation.mutate({ id: n.id, done: !n.done })
                        }
                      />
                    ) : (
                      <StickyNote className="size-3.5 text-[var(--jm-text-subtle)]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`whitespace-pre-wrap break-words text-jm-sm ${muted}`}>
                      {n.content}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-jm-xs text-[var(--jm-text-muted)]">
                      {isTodo && (
                        <JmBadge variant="outline" size="sm">
                          할 일
                        </JmBadge>
                      )}
                      {n.dueDate && (
                        <span className="inline-flex items-center gap-0.5">
                          <CalendarClock className="size-3" />
                          {new Date(n.dueDate).toLocaleDateString("ko-KR")}
                        </span>
                      )}
                      {n.notify && <BellRing className="size-3" />}
                      {n.createdBy?.name && <span>{n.createdBy.name}</span>}
                    </div>
                  </div>
                  <JmIconButton
                    aria-label="삭제"
                    variant="ghost"
                    size="sm"
                    disabled={deleting}
                    onClick={() => deleteMutation.mutate(n.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </JmIconButton>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
