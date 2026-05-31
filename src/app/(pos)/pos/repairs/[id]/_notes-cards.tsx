"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { JmBadge, JmComboboxDrawer, JmTextarea } from "@/jm";
import type { RepairTicketDetail } from "../_types";
import { useRepairMutations } from "../_use-repair-mutations";
import { Card } from "./_shared";

/** 가로 칩 — 단일선택 (증상·진단 공용) */
function Chip({
  selected,
  onClick,
  children,
  badge,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-jm-sm transition-colors ${
        selected
          ? "bg-[var(--jm-cta)] text-[var(--jm-cta-foreground)]"
          : "border border-[var(--jm-border)] bg-[var(--jm-surface)] text-[var(--jm-text)] active:bg-[var(--jm-surface-muted)]"
      }`}
    >
      {badge}
      <span className="line-clamp-1 max-w-[200px]">{children}</span>
      {selected && <X className="size-3.5 shrink-0 opacity-70" />}
    </button>
  );
}

function AddChip({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 items-center gap-1 rounded-full border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] px-3 py-2 text-jm-sm text-[var(--jm-text-muted)] transition-colors active:bg-[var(--jm-border)]"
    >
      <Plus className="size-3.5" />
      직접입력
    </button>
  );
}

const CHIP_ROW = "flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

interface SymptomTemplate {
  id: string;
  text: string;
  categoryId: string | null;
  usageCount: number;
}

export function SymptomCard({
  ticket,
  readonly,
}: {
  ticket: RepairTicketDetail;
  readonly: boolean;
  onSaved?: () => void;
}) {
  const m = useRepairMutations(ticket.id);
  const [picker, setPicker] = useState(false);
  const categoryId = ticket.repairCategory?.id ?? null;
  const current = ticket.symptom;

  const templatesQuery = useQuery<SymptomTemplate[]>({
    queryKey: ["repairs", "symptom-templates", categoryId ?? "all"],
    queryFn: () =>
      apiGet<SymptomTemplate[]>(
        `/api/repair-symptom-templates${categoryId ? `?categoryId=${categoryId}` : ""}`,
      ),
    enabled: !readonly,
    staleTime: 1000 * 60,
  });

  const templates = templatesQuery.data ?? [];
  const topChips = templates.slice(0, 12);
  const currentInChips = !!current && topChips.some((t) => t.text === current);

  const set = (text: string) => m.setField.mutate({ symptom: text });

  return (
    <Card>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-jm-xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
            증상
          </span>
          <span className="text-jm-3xs text-[var(--jm-text-subtle)]">고객 호소 · 한 개</span>
        </div>

        {readonly ? (
          <p className="text-jm-sm text-[var(--jm-text)]">{current || "—"}</p>
        ) : (
          <div className={CHIP_ROW}>
            <AddChip onClick={() => setPicker(true)} />
            {current && !currentInChips && (
              <Chip selected onClick={() => set("")}>
                {current}
              </Chip>
            )}
            {topChips.map((t) => (
              <Chip key={t.id} selected={t.text === current} onClick={() => set(t.text === current ? "" : t.text)}>
                {t.text}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <JmComboboxDrawer<SymptomTemplate>
        open={picker}
        onOpenChange={setPicker}
        items={templates}
        loading={templatesQuery.isPending}
        getKey={(t) => t.id}
        title="증상 선택"
        placeholder="증상 검색 또는 새로 입력"
        filterFn={(t, q) => t.text.toLowerCase().includes(q.toLowerCase())}
        renderItem={(t) => (
          <div className="flex w-full items-center justify-between gap-3">
            <span className="line-clamp-2 text-jm-sm text-[var(--jm-text)]">{t.text}</span>
            {t.usageCount > 0 && (
              <span className="shrink-0 text-jm-2xs text-[var(--jm-text-subtle)]">{t.usageCount}회</span>
            )}
          </div>
        )}
        onSelect={(t) => {
          set(t.text);
          setPicker(false);
        }}
        onCreate={(q) => {
          set(q);
          setPicker(false);
        }}
        createLabel={(q) => `"${q}" 새로 등록`}
        emptyText="기존 증상 없음 — 입력해서 새로 등록"
      />
    </Card>
  );
}

// ──── 진단·수리내용 칩 — 증상 매칭 진단 우선 추천 ────
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
}: {
  ticket: RepairTicketDetail;
  readonly: boolean;
  onSaved?: () => void;
}) {
  const m = useRepairMutations(ticket.id);
  const [picker, setPicker] = useState(false);
  const categoryId = ticket.repairCategory?.id ?? null;
  const symptomTemplateId = ticket.symptomTemplateId;
  const current = ticket.diagnosis;

  const templatesQuery = useQuery<DiagnosisTemplate[]>({
    queryKey: ["repairs", "diagnosis-templates", categoryId ?? "all", symptomTemplateId ?? "no-symptom"],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (categoryId) sp.set("categoryId", categoryId);
      if (symptomTemplateId) sp.set("symptomId", symptomTemplateId);
      return apiGet<DiagnosisTemplate[]>(`/api/repair-diagnosis-templates?${sp.toString()}`);
    },
    enabled: !readonly,
    staleTime: 1000 * 30,
  });

  const templates = templatesQuery.data ?? [];
  const topChips = templates.slice(0, 12);
  const currentInChips = !!current && topChips.some((t) => t.text === current);

  const set = (text: string) => m.setField.mutate({ diagnosis: text });

  return (
    <Card>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-jm-xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
            진단·수리내용
          </span>
          <span className="text-jm-3xs text-[var(--jm-text-subtle)]">
            {symptomTemplateId ? "증상 기반 추천 · 한 개" : "한 개"}
          </span>
        </div>

        {readonly ? (
          <p className="text-jm-sm text-[var(--jm-text)]">{current || "—"}</p>
        ) : (
          <div className={CHIP_ROW}>
            <AddChip onClick={() => setPicker(true)} />
            {current && !currentInChips && (
              <Chip selected onClick={() => set("")}>
                {current}
              </Chip>
            )}
            {topChips.map((t) => (
              <Chip
                key={t.id}
                selected={t.text === current}
                onClick={() => set(t.text === current ? "" : t.text)}
                badge={
                  t.isLinked && t.text !== current ? (
                    <span className="rounded bg-[var(--jm-accent-bg)] px-1 text-jm-3xs font-semibold text-[var(--jm-accent-fg)]">
                      추천
                    </span>
                  ) : undefined
                }
              >
                {t.text}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <JmComboboxDrawer<DiagnosisTemplate>
        open={picker}
        onOpenChange={setPicker}
        items={templates}
        loading={templatesQuery.isPending}
        getKey={(t) => t.id}
        title="진단·수리내용"
        placeholder="진단·수리내용 검색 또는 새로 입력"
        filterFn={(t, q) => t.text.toLowerCase().includes(q.toLowerCase())}
        renderItem={(t) => (
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {t.isLinked && (
                <JmBadge variant="accent" size="sm">
                  추천
                </JmBadge>
              )}
              <span className="line-clamp-2 text-jm-sm text-[var(--jm-text)]">{t.text}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 text-jm-2xs text-[var(--jm-text-subtle)]">
              {t.isLinked && t.linkCount > 0 && (
                <span className="text-[var(--jm-accent-fg)]">매칭 {t.linkCount}회</span>
              )}
              {t.usageCount > 0 && <span>{t.usageCount}회</span>}
            </div>
          </div>
        )}
        onSelect={(t) => {
          set(t.text);
          setPicker(false);
        }}
        onCreate={(q) => {
          set(q);
          setPicker(false);
        }}
        createLabel={(q) => `"${q}" 새로 등록`}
        emptyText="기존 진단 없음 — 입력해서 새로 등록"
      />
    </Card>
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
    mutationFn: () => apiMutate(`/api/repair-tickets/${ticket.id}`, "PUT", { repairNotes }),
    onSuccess: () => {
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 3000);
      onSaved();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  const handleBlur = () => {
    if (readonly || saveMutation.isPending || !dirty) return;
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
          <span className="text-jm-3xs text-[var(--jm-text-subtle)]">내부 작업 메모</span>
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

function SaveStatus({ status }: { status: "saving" | "saved" | "dirty" }) {
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
