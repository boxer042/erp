"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import {
  JmBadge,
  JmButton,
  JmCard,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmInput,
  JmSearchInput,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
  JmTabs,
  JmTabsList,
  JmTabsPanel,
  JmTabsTrigger,
} from "@/jm";

interface Template {
  id: string;
  text: string;
  categoryId: string | null;
  usageCount: number;
}

interface Category {
  id: string;
  name: string;
}

type Kind = "symptom" | "diagnosis";

export default function RepairTemplatesPage() {
  const [kind, setKind] = useState<Kind>("symptom");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [editing, setEditing] = useState<Template | null>(null);
  const [confirming, setConfirming] = useState<Template | null>(null);

  const categoriesQuery = useQuery<Category[]>({
    queryKey: ["product-categories"],
    queryFn: () => apiGet<Category[]>("/api/categories"),
    staleTime: 1000 * 60 * 5,
  });

  const templatesQuery = useQuery<Template[]>({
    queryKey: ["repair-templates", kind],
    queryFn: () =>
      apiGet<Template[]>(
        kind === "symptom"
          ? "/api/repair-symptom-templates"
          : "/api/repair-diagnosis-templates",
      ),
    staleTime: 1000 * 30,
  });

  const templates = templatesQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates
      .filter((t) => {
        if (categoryFilter === "all") return true;
        if (categoryFilter === "uncategorized") return t.categoryId === null;
        return t.categoryId === categoryFilter;
      })
      .filter((t) => (q ? t.text.toLowerCase().includes(q) : true));
  }, [templates, categoryFilter, search]);

  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="flex w-full flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-jm-xl font-bold text-[var(--jm-text)]">
            수리 템플릿 관리
          </h1>
          <p className="text-jm-sm text-[var(--jm-text-muted)]">
            자유 입력으로 쌓인 증상·진단 마스터를 정리. 텍스트 수정 시 연결된
            티켓의 본문도 같이 갱신됩니다. 삭제 시 티켓의 본문 텍스트는 그대로
            보존되고 마스터 link 만 해제 (이력 유지).
          </p>
        </div>

        <JmTabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
          <JmTabsList>
            <JmTabsTrigger value="symptom">증상</JmTabsTrigger>
            <JmTabsTrigger value="diagnosis">진단</JmTabsTrigger>
          </JmTabsList>

          {(["symptom", "diagnosis"] as const).map((k) => (
            <JmTabsPanel key={k} value={k}>
              <JmCard className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 border-b border-[var(--jm-border)] p-3">
                  <JmSearchInput
                    placeholder={
                      k === "symptom" ? "증상 텍스트 검색" : "진단 텍스트 검색"
                    }
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full sm:w-72"
                  />
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="h-10 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 text-jm-sm text-[var(--jm-text)] outline-none focus:border-[var(--jm-border-strong)]"
                  >
                    <option value="all">전체 카테고리</option>
                    <option value="uncategorized">미지정 (공통)</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <span className="ml-auto text-jm-2xs text-[var(--jm-text-subtle)]">
                    {filtered.length} / {templates.length} 개
                  </span>
                </div>

                <JmTable>
                  <JmTableHeader>
                    <JmTableRow>
                      <JmTableHead>텍스트</JmTableHead>
                      <JmTableHead>카테고리</JmTableHead>
                      <JmTableHead className="text-right">사용 횟수</JmTableHead>
                      <JmTableHead className="w-[120px]"></JmTableHead>
                    </JmTableRow>
                  </JmTableHeader>
                  <JmTableBody>
                    {templatesQuery.isPending ? (
                      <JmTableRow>
                        <JmTableCell
                          colSpan={4}
                          className="py-8 text-center text-jm-sm text-[var(--jm-text-subtle)]"
                        >
                          로딩 중...
                        </JmTableCell>
                      </JmTableRow>
                    ) : filtered.length === 0 ? (
                      <JmTableRow>
                        <JmTableCell
                          colSpan={4}
                          className="py-8 text-center text-jm-sm text-[var(--jm-text-subtle)]"
                        >
                          {search || categoryFilter !== "all"
                            ? "조건에 맞는 템플릿이 없습니다"
                            : "등록된 템플릿이 없습니다 — 수리 작성 시 자동 생성"}
                        </JmTableCell>
                      </JmTableRow>
                    ) : (
                      filtered.map((t) => (
                        <JmTableRow key={t.id}>
                          <JmTableCell className="font-medium text-[var(--jm-text)]">
                            {t.text}
                          </JmTableCell>
                          <JmTableCell>
                            {t.categoryId ? (
                              <JmBadge variant="default" size="sm">
                                {categoryById.get(t.categoryId) ?? "—"}
                              </JmBadge>
                            ) : (
                              <span className="text-jm-2xs text-[var(--jm-text-subtle)]">
                                공통
                              </span>
                            )}
                          </JmTableCell>
                          <JmTableCell className="text-right tabular-nums text-[var(--jm-text)]">
                            {t.usageCount}
                          </JmTableCell>
                          <JmTableCell>
                            <div className="flex items-center justify-end gap-1">
                              <JmButton
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditing(t)}
                                aria-label="수정"
                              >
                                <Pencil className="size-3.5" />
                              </JmButton>
                              <JmButton
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirming(t)}
                                aria-label="삭제"
                              >
                                <Trash2 className="size-3.5 text-[var(--jm-danger-fg)]" />
                              </JmButton>
                            </div>
                          </JmTableCell>
                        </JmTableRow>
                      ))
                    )}
                  </JmTableBody>
                </JmTable>
              </JmCard>
            </JmTabsPanel>
          ))}
        </JmTabs>
      </div>

      {/* 수정 다이얼로그 */}
      {editing && (
        <EditDialog
          kind={kind}
          template={editing}
          onClose={() => setEditing(null)}
        />
      )}

      {/* 삭제 확인 다이얼로그 */}
      {confirming && (
        <DeleteDialog
          kind={kind}
          template={confirming}
          onClose={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

function EditDialog({
  kind,
  template,
  onClose,
}: {
  kind: Kind;
  template: Template;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState(template.text);
  const dirty = text.trim() !== template.text.trim();

  const update = useMutation({
    mutationFn: () =>
      apiMutate(
        kind === "symptom"
          ? `/api/repair-symptom-templates/${template.id}`
          : `/api/repair-diagnosis-templates/${template.id}`,
        "PATCH",
        { text: text.trim() },
      ),
    onSuccess: () => {
      toast.success("수정됨");
      qc.invalidateQueries({ queryKey: ["repair-templates"] });
      qc.invalidateQueries({ queryKey: ["repairs"] });
      onClose();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "수정 실패"),
  });

  return (
    <JmDialog open onOpenChange={(o) => !o && onClose()}>
      <JmDialogContent>
        <JmDialogHeader>
          <JmDialogTitle>
            {kind === "symptom" ? "증상" : "진단"} 템플릿 수정
          </JmDialogTitle>
        </JmDialogHeader>
        <JmDialogBody>
          <div className="flex flex-col gap-2">
            <span className="text-jm-2xs font-medium text-[var(--jm-text-muted)]">
              텍스트
            </span>
            <JmInput
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
            <p className="text-jm-2xs text-[var(--jm-text-subtle)]">
              연결된 모든 수리 티켓의 본문도 자동 동기화됩니다. 같은 카테고리에
              같은 텍스트가 이미 있으면 거부됩니다.
            </p>
          </div>
        </JmDialogBody>
        <JmDialogFooter>
          <JmButton variant="ghost" onClick={onClose}>
            취소
          </JmButton>
          <JmButton
            variant="cta"
            onClick={() => update.mutate()}
            disabled={!dirty || !text.trim() || update.isPending}
          >
            {update.isPending ? "저장 중..." : "저장"}
          </JmButton>
        </JmDialogFooter>
      </JmDialogContent>
    </JmDialog>
  );
}

function DeleteDialog({
  kind,
  template,
  onClose,
}: {
  kind: Kind;
  template: Template;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () =>
      apiMutate(
        kind === "symptom"
          ? `/api/repair-symptom-templates/${template.id}`
          : `/api/repair-diagnosis-templates/${template.id}`,
        "DELETE",
      ),
    onSuccess: () => {
      toast.success("삭제됨");
      qc.invalidateQueries({ queryKey: ["repair-templates"] });
      qc.invalidateQueries({ queryKey: ["repairs"] });
      onClose();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "삭제 실패"),
  });

  return (
    <JmDialog open onOpenChange={(o) => !o && onClose()}>
      <JmDialogContent>
        <JmDialogHeader>
          <JmDialogTitle>템플릿 삭제</JmDialogTitle>
        </JmDialogHeader>
        <JmDialogBody>
          <p className="text-jm-sm text-[var(--jm-text)]">
            <span className="font-semibold">&ldquo;{template.text}&rdquo;</span>{" "}
            템플릿을 삭제할까요?
          </p>
          <p className="mt-2 text-jm-2xs text-[var(--jm-text-muted)]">
            연결된 {template.usageCount}건의 수리 티켓에서 마스터 link 만 끊기고,
            티켓의 본문 텍스트는 그대로 보존됩니다.{" "}
            {kind === "diagnosis" && (
              <>
                연결된{" "}
                <strong>증상-진단 페어, 부속/공임 빈도, 세트</strong> 통계도
                같이 삭제됩니다.
              </>
            )}
          </p>
        </JmDialogBody>
        <JmDialogFooter>
          <JmButton variant="ghost" onClick={onClose}>
            취소
          </JmButton>
          <JmButton
            variant="danger"
            onClick={() => del.mutate()}
            disabled={del.isPending}
          >
            {del.isPending ? "삭제 중..." : "삭제"}
          </JmButton>
        </JmDialogFooter>
      </JmDialogContent>
    </JmDialog>
  );
}
