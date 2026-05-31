"use client";

import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ListTodo, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { JmBadge, JmCard, JmCheckbox, JmSkeleton } from "@/jm";

import { type NoteDto } from "../notes/_types";

export function TodoMemosWidget() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.notes.list({ widget: "todo", done: "0" }),
    queryFn: ({ signal }) =>
      apiGet<NoteDto[]>("/api/notes?kind=TODO&done=0&limit=6", undefined, signal),
  });

  const toggle = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/notes/${id}`, "PUT", { done: true }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.notes.all }),
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "변경 실패"),
  });

  const todos = query.data ?? [];

  return (
    <JmCard className="p-0">
      <div className="flex items-center justify-between border-b border-[var(--jm-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <ListTodo className="size-4 text-[var(--jm-text-muted)]" />
          <span className="text-jm-sm font-semibold text-[var(--jm-text)]">
            업무 노트 · 할 일
          </span>
          {todos.length > 0 && (
            <JmBadge variant="accent" size="sm">
              {todos.length}
            </JmBadge>
          )}
        </div>
        <Link
          href="/notes"
          className="inline-flex items-center gap-0.5 text-jm-xs text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
        >
          전체 보기 <ChevronRight className="size-3.5" />
        </Link>
      </div>

      {query.isPending ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <JmSkeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : todos.length === 0 ? (
        <p className="px-4 py-6 text-center text-jm-sm text-[var(--jm-text-muted)]">
          미완료 할 일이 없습니다.
        </p>
      ) : (
        <div className="divide-y divide-[var(--jm-border)]">
          {todos.map((n) => (
            <label
              key={n.id}
              className="flex cursor-pointer items-start gap-2.5 px-4 py-2.5 text-jm-sm hover:bg-[var(--jm-surface-muted)]"
            >
              <JmCheckbox
                checked={false}
                disabled={toggle.isPending && toggle.variables === n.id}
                onCheckedChange={() => toggle.mutate(n.id)}
              />
              <span className="min-w-0 flex-1 truncate text-[var(--jm-text)]">
                {n.title || n.content}
              </span>
              {n.priority === "HIGH" && (
                <JmBadge variant="danger" size="sm">
                  높음
                </JmBadge>
              )}
              {n.dueDate && (
                <span className="shrink-0 text-jm-xs text-[var(--jm-text-muted)]">
                  {new Date(n.dueDate).toLocaleDateString("ko-KR", {
                    month: "numeric",
                    day: "numeric",
                  })}
                </span>
              )}
            </label>
          ))}
        </div>
      )}
    </JmCard>
  );
}
