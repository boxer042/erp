"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ListTodo, StickyNote } from "lucide-react";
import { toast } from "sonner";

import { apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  JmButton,
  JmDatePicker,
  JmDrawer,
  JmDrawerBody,
  JmDrawerContent,
  JmDrawerFooter,
  JmDrawerHeader,
  JmDrawerTitle,
  JmFormField,
  JmInput,
  JmSegmentedControl,
  JmSelect,
  JmSpinner,
  JmSwitch,
  JmTextarea,
} from "@/jm";

import {
  type NoteDto,
  type NoteKind,
  type NotePriority,
  PRIORITY_LABELS,
} from "./_types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editTarget?: NoteDto | null;
  onSaved?: () => void;
}

export function NoteSheet({ open, onOpenChange, editTarget, onSaved }: Props) {
  return (
    <JmDrawer open={open} onOpenChange={onOpenChange}>
      <JmDrawerContent side="right" size="md">
        {open && (
          <NoteSheetForm
            key={editTarget?.id ?? "new"}
            editTarget={editTarget ?? null}
            onClose={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        )}
      </JmDrawerContent>
    </JmDrawer>
  );
}

interface FormState {
  kind: NoteKind;
  content: string;
  title: string;
  priority: NotePriority;
  pinned: boolean;
  notify: boolean;
  dueDate: Date | undefined;
  notifyAt: Date | undefined;
}

function toForm(n: NoteDto | null): FormState {
  if (!n) {
    return {
      kind: "MEMO",
      content: "",
      title: "",
      priority: "NORMAL",
      pinned: false,
      notify: false,
      dueDate: undefined,
      notifyAt: undefined,
    };
  }
  return {
    kind: n.kind,
    content: n.content,
    title: n.title ?? "",
    priority: n.priority,
    pinned: n.pinned,
    notify: n.notify,
    dueDate: n.dueDate ? new Date(n.dueDate) : undefined,
    notifyAt: n.notifyAt ? new Date(n.notifyAt) : undefined,
  };
}

function NoteSheetForm({
  editTarget,
  onClose,
  onSaved,
}: {
  editTarget: NoteDto | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!editTarget;
  const [form, setForm] = useState<FormState>(() => toForm(editTarget));

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        kind: form.kind,
        content: form.content.trim(),
        title: form.title.trim() || null,
        priority: form.priority,
        pinned: form.pinned,
        notify: form.notify,
        dueDate:
          form.kind === "TODO" && form.dueDate ? form.dueDate.toISOString() : null,
        notifyAt: form.notify && form.notifyAt ? form.notifyAt.toISOString() : null,
      };
      return isEdit
        ? apiMutate(`/api/notes/${editTarget!.id}`, "PUT", payload)
        : apiMutate("/api/notes", "POST", payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? "수정되었습니다" : "추가되었습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.notes.all });
      onSaved?.();
      onClose();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  const canSubmit = form.content.trim().length > 0;

  return (
    <>
      <JmDrawerHeader>
        <JmDrawerTitle>{isEdit ? "노트 수정" : "새 업무 노트"}</JmDrawerTitle>
      </JmDrawerHeader>

      <JmDrawerBody className="space-y-6">
        <JmFormField label="유형">
          <JmSegmentedControl<NoteKind>
            fullWidth
            size="md"
            options={[
              {
                value: "TODO",
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <ListTodo className="size-3.5" />할 일
                  </span>
                ),
              },
              {
                value: "MEMO",
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <StickyNote className="size-3.5" />메모
                  </span>
                ),
              },
            ]}
            value={form.kind}
            onChange={(v) => update("kind", v)}
          />
        </JmFormField>

        <JmFormField label="제목" hint="선택">
          <JmInput
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="짧은 제목 (선택)"
          />
        </JmFormField>

        <JmFormField label="내용" required>
          <JmTextarea
            rows={4}
            value={form.content}
            onChange={(e) => update("content", e.target.value)}
            placeholder="메모 내용을 입력하세요"
          />
        </JmFormField>

        {form.kind === "TODO" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <JmFormField label="우선순위">
              <JmSelect
                value={form.priority}
                onChange={(v) => update("priority", v as NotePriority)}
                options={[
                  { value: "LOW", label: PRIORITY_LABELS.LOW },
                  { value: "NORMAL", label: PRIORITY_LABELS.NORMAL },
                  { value: "HIGH", label: PRIORITY_LABELS.HIGH },
                ]}
              />
            </JmFormField>
            <JmFormField label="마감일" hint="선택">
              <JmDatePicker
                value={form.dueDate}
                onChange={(d) => update("dueDate", d)}
                placeholder="마감일 선택"
              />
            </JmFormField>
          </div>
        )}

        <div className="space-y-3 rounded-[var(--jm-radius-md)] border border-[var(--jm-border)] p-3">
          <label className="flex items-center justify-between gap-3 text-jm-sm">
            <span className="font-medium text-[var(--jm-text)]">알림 받기</span>
            <JmSwitch
              checked={form.notify}
              onCheckedChange={(v) => update("notify", v)}
            />
          </label>
          {form.notify && (
            <JmFormField
              label="알림 일시"
              hint="카카오 알림은 후속 단계에서 발송됩니다"
            >
              <JmDatePicker
                value={form.notifyAt}
                onChange={(d) => update("notifyAt", d)}
                placeholder="알림 일시 선택"
              />
            </JmFormField>
          )}
        </div>

        <label className="flex items-center justify-between gap-3 text-jm-sm">
          <span className="font-medium text-[var(--jm-text)]">상단 고정</span>
          <JmSwitch
            checked={form.pinned}
            onCheckedChange={(v) => update("pinned", v)}
          />
        </label>
      </JmDrawerBody>

      <JmDrawerFooter>
        <JmButton
          variant="outline"
          onClick={onClose}
          disabled={saveMutation.isPending}
        >
          취소
        </JmButton>
        <JmButton
          variant="cta"
          onClick={() => saveMutation.mutate()}
          disabled={!canSubmit || saveMutation.isPending}
        >
          {saveMutation.isPending && <JmSpinner size="sm" />}
          {isEdit ? "수정" : "추가"}
        </JmButton>
      </JmDrawerFooter>
    </>
  );
}
