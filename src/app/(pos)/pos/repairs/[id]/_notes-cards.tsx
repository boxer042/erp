"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Search } from "lucide-react";
import { toast } from "sonner";

import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { JmBadge, JmComboboxDrawer, JmTextarea } from "@/jm";
import type { RepairTicketDetail } from "../_types";
import { Card } from "./_shared";

interface SymptomTemplate {
  id: string;
  text: string;
  categoryId: string | null;
  usageCount: number;
}

export function SymptomCard({
  ticket,
  readonly,
  onSaved,
}: {
  ticket: RepairTicketDetail;
  readonly: boolean;
  onSaved: () => void;
}) {
  const [picker, setPicker] = useState(false);
  const categoryId = ticket.repairCategory?.id ?? null;

  const templatesQuery = useQuery<SymptomTemplate[]>({
    queryKey: ["repairs", "symptom-templates", categoryId ?? "all"],
    queryFn: () =>
      apiGet<SymptomTemplate[]>(
        `/api/repair-symptom-templates${
          categoryId ? `?categoryId=${categoryId}` : ""
        }`,
      ),
    enabled: picker,
    staleTime: 1000 * 60,
  });

  const saveMutation = useMutation({
    mutationFn: (text: string) =>
      apiMutate(`/api/repair-tickets/${ticket.id}`, "PUT", {
        symptom: text,
      }),
    onSuccess: () => {
      toast.success("증상 저장됨");
      setPicker(false);
      onSaved();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  const clear = useMutation({
    mutationFn: () =>
      apiMutate(`/api/repair-tickets/${ticket.id}`, "PUT", { symptom: "" }),
    onSuccess: () => onSaved(),
  });

  return (
    <>
      <Card>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-jm-xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
              증상
            </span>
            <span className="text-jm-3xs text-[var(--jm-text-subtle)]">
              고객 호소
            </span>
          </div>
          {ticket.symptom ? (
            <button
              type="button"
              onClick={() => !readonly && setPicker(true)}
              disabled={readonly}
              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--jm-border)] bg-[var(--jm-bg)] px-4 py-3 text-left transition-colors hover:bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)] disabled:opacity-70"
            >
              <span className="line-clamp-2 text-jm-sm text-[var(--jm-text)]">
                {ticket.symptom}
              </span>
              {!readonly && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    clear.mutate();
                  }}
                  className="shrink-0 text-jm-2xs text-[var(--jm-text-subtle)] hover:text-[var(--jm-danger-fg)] hover:underline"
                >
                  지움
                </span>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => !readonly && setPicker(true)}
              disabled={readonly}
              className="flex h-11 items-center gap-2 rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 text-left text-jm-sm text-[var(--jm-text-subtle)] transition-colors hover:bg-[var(--jm-surface-muted)] hover:border-[var(--jm-border-strong)] disabled:opacity-70"
            >
              <Search className="size-4 text-[var(--jm-text-muted)]" />
              증상 선택·입력
            </button>
          )}
        </div>
      </Card>

      <JmComboboxDrawer<SymptomTemplate>
        open={picker}
        onOpenChange={setPicker}
        items={templatesQuery.data ?? []}
        loading={templatesQuery.isPending}
        getKey={(t) => t.id}
        title="증상 선택"
        placeholder="증상 검색 또는 새로 입력"
        filterFn={(t, q) => t.text.toLowerCase().includes(q.toLowerCase())}
        renderItem={(t) => (
          <div className="flex w-full items-center justify-between gap-3">
            <span className="line-clamp-2 text-jm-sm text-[var(--jm-text)]">
              {t.text}
            </span>
            {t.usageCount > 0 && (
              <span className="shrink-0 text-jm-2xs text-[var(--jm-text-subtle)]">
                {t.usageCount}회
              </span>
            )}
          </div>
        )}
        onSelect={(t) => saveMutation.mutate(t.text)}
        onCreate={(q) => saveMutation.mutate(q)}
        createLabel={(q) => `"${q}" 새로 등록`}
        emptyText="기존 증상 없음 — 입력해서 새로 등록"
      />
    </>
  );
}

// ──── 진단 카드 — 콤보박스. 증상 선택되어 있으면 그 증상에 자주 매칭된 진단 추천 ────
interface DiagnosisTemplate {
  id: string;
  text: string;
  categoryId: string | null;
  usageCount: number;
  isLinked: boolean;
  linkCount: number;
}

export function DiagnosisCard({
  ticket,
  readonly,
  onSaved,
}: {
  ticket: RepairTicketDetail;
  readonly: boolean;
  onSaved: () => void;
}) {
  const [picker, setPicker] = useState(false);
  const categoryId = ticket.repairCategory?.id ?? null;
  const symptomTemplateId = ticket.symptomTemplateId;

  const templatesQuery = useQuery<DiagnosisTemplate[]>({
    queryKey: [
      "repairs",
      "diagnosis-templates",
      categoryId ?? "all",
      symptomTemplateId ?? "no-symptom",
    ],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (categoryId) sp.set("categoryId", categoryId);
      if (symptomTemplateId) sp.set("symptomId", symptomTemplateId);
      return apiGet<DiagnosisTemplate[]>(
        `/api/repair-diagnosis-templates?${sp.toString()}`,
      );
    },
    enabled: picker,
    staleTime: 1000 * 30,
  });

  const saveMutation = useMutation({
    mutationFn: (text: string) =>
      apiMutate(`/api/repair-tickets/${ticket.id}`, "PUT", {
        diagnosis: text,
      }),
    onSuccess: () => {
      toast.success("진단 저장됨");
      setPicker(false);
      onSaved();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  const clear = useMutation({
    mutationFn: () =>
      apiMutate(`/api/repair-tickets/${ticket.id}`, "PUT", { diagnosis: "" }),
    onSuccess: () => onSaved(),
  });

  return (
    <>
      <Card>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-jm-xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
              진단
            </span>
            <span className="text-jm-3xs text-[var(--jm-text-subtle)]">
              {symptomTemplateId ? "증상 기반 추천" : "직원 확인"}
            </span>
          </div>
          {ticket.diagnosis ? (
            <button
              type="button"
              onClick={() => !readonly && setPicker(true)}
              disabled={readonly}
              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--jm-border)] bg-[var(--jm-bg)] px-4 py-3 text-left transition-colors hover:bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)] disabled:opacity-70"
            >
              <span className="line-clamp-2 text-jm-sm text-[var(--jm-text)]">
                {ticket.diagnosis}
              </span>
              {!readonly && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    clear.mutate();
                  }}
                  className="shrink-0 text-jm-2xs text-[var(--jm-text-subtle)] hover:text-[var(--jm-danger-fg)] hover:underline"
                >
                  지움
                </span>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => !readonly && setPicker(true)}
              disabled={readonly}
              className="flex h-11 items-center gap-2 rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 text-left text-jm-sm text-[var(--jm-text-subtle)] transition-colors hover:bg-[var(--jm-surface-muted)] hover:border-[var(--jm-border-strong)] disabled:opacity-70"
            >
              <Search className="size-4 text-[var(--jm-text-muted)]" />
              진단 선택·입력
            </button>
          )}
        </div>
      </Card>

      <JmComboboxDrawer<DiagnosisTemplate>
        open={picker}
        onOpenChange={setPicker}
        items={templatesQuery.data ?? []}
        loading={templatesQuery.isPending}
        getKey={(t) => t.id}
        title="진단 선택"
        placeholder="진단 검색 또는 새로 입력"
        filterFn={(t, q) => t.text.toLowerCase().includes(q.toLowerCase())}
        renderItem={(t) => (
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {t.isLinked && (
                <JmBadge variant="accent" size="sm">
                  추천
                </JmBadge>
              )}
              <span className="line-clamp-2 text-jm-sm text-[var(--jm-text)]">
                {t.text}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 text-jm-2xs text-[var(--jm-text-subtle)]">
              {t.isLinked && t.linkCount > 0 && (
                <span className="text-[var(--jm-accent-fg)]">
                  매칭 {t.linkCount}회
                </span>
              )}
              {t.usageCount > 0 && <span>{t.usageCount}회</span>}
            </div>
          </div>
        )}
        onSelect={(t) => saveMutation.mutate(t.text)}
        onCreate={(q) => saveMutation.mutate(q)}
        createLabel={(q) => `"${q}" 새로 등록`}
        emptyText="기존 진단 없음 — 입력해서 새로 등록"
      />
    </>
  );
}

// ──── 수리 메모 카드 — 자유 텍스트 (체계화 대상 아님) ────
export function NotesCard({
  ticket,
  readonly,
  onSaved,
}: {
  ticket: RepairTicketDetail;
  readonly: boolean;
  onSaved: () => void;
}) {
  const [repairNotes, setRepairNotes] = useState(ticket.repairNotes ?? "");
  const [savedFlash, setSavedFlash] = useState(false);

  const dirty = repairNotes !== (ticket.repairNotes ?? "");

  const saveMutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/repair-tickets/${ticket.id}`, "PUT", {
        repairNotes,
      }),
    onSuccess: () => {
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 3000);
      onSaved();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  const handleBlur = () => {
    if (readonly) return;
    if (saveMutation.isPending) return;
    if (!dirty) return;
    saveMutation.mutate();
  };

  const status: "idle" | "saving" | "saved" | "dirty" = saveMutation.isPending
    ? "saving"
    : savedFlash
      ? "saved"
      : dirty
        ? "dirty"
        : "idle";

  return (
    <Card>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-jm-xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
            수리 메모
          </span>
          <span className="text-jm-3xs text-[var(--jm-text-subtle)]">
            내부 작업 메모
          </span>
        </div>
        <JmTextarea
          value={repairNotes}
          onChange={(e) => setRepairNotes(e.target.value)}
          onBlur={handleBlur}
          disabled={readonly}
          placeholder="작업 메모 (분해 순서, 주의사항 등)"
          rows={2}
        />
        {!readonly && (
          <div className="flex h-4 items-center justify-end">
            {status !== "idle" && <SaveStatus status={status} />}
          </div>
        )}
      </div>
    </Card>
  );
}

function SaveStatus({
  status,
}: {
  status: "saving" | "saved" | "dirty";
}) {
  if (status === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-jm-2xs text-[var(--jm-text-muted)]">
        <span className="size-1.5 animate-pulse rounded-full bg-[var(--jm-text-subtle)]" />
        저장 중…
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="flex items-center gap-1.5 text-jm-2xs text-[var(--jm-success-fg)]">
        <Check className="size-3" />
        저장됨
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-jm-2xs text-[var(--jm-warning-fg)]">
      <span className="size-1.5 rounded-full bg-[var(--jm-warning-solid)]" />
      입력 후 다른 곳을 누르면 저장됩니다
    </span>
  );
}
