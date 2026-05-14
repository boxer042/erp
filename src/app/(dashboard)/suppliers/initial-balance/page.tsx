"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { focusCaretEnd } from "@/jm/lib/focus";
import { SupplierCombobox } from "@/components/supplier-combobox";
import { formatComma, parseComma } from "@/lib/utils";
import {
  JmBadge,
  JmButton,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmIconButton,
  JmScope,
  JmScrollArea,
  JmSegmentedControl,
  JmSkeleton,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
} from "@/jm";

interface Supplier {
  id: string;
  name: string;
  businessNumber?: string | null;
  paymentMethod?: string;
}

interface EntryForm {
  supplierId: string;
  supplierName: string;
  amount: string;
  date: string;
  memo: string;
}

interface HistoryItem {
  id: string;
  date: string;
  debitAmount: string;
  creditAmount: string;
  balance: string;
  description: string;
  createdAt: string;
  supplier: { id: string; name: string; paymentMethod: string };
}

function emptyRow(): EntryForm {
  const today = new Date().toISOString().slice(0, 10);
  return { supplierId: "", supplierName: "", amount: "", date: today, memo: "" };
}

function HistorySkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <JmTableRow key={i} className="hover:bg-transparent">
          <JmTableCell><JmSkeleton className="h-4 w-20" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-32" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-5 w-12 rounded-md" /></JmTableCell>
          <JmTableCell>
            <div className="flex justify-end">
              <JmSkeleton className="h-4 w-24" />
            </div>
          </JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-40" /></JmTableCell>
        </JmTableRow>
      ))}
    </>
  );
}

export default function InitialBalancePage() {
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const [tab, setTab] = useState<"register" | "history">("register");
  const [entries, setEntries] = useState<EntryForm[]>([emptyRow()]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [duplicateIds, setDuplicateIds] = useState<Set<string>>(new Set());

  const suppliersQuery = useQuery({
    queryKey: queryKeys.suppliers.list(),
    queryFn: () => apiGet<Supplier[]>("/api/suppliers"),
  });
  const suppliers = suppliersQuery.data ?? [];

  const historyQuery = useQuery({
    queryKey: ["suppliers", "initial-balance"] as const,
    queryFn: () => apiGet<HistoryItem[]>("/api/suppliers/initial-balance"),
    enabled: tab === "history",
  });
  const historyItems = historyQuery.data ?? [];
  const historyLoading = historyQuery.isPending && tab === "history";
  const refreshHistory = () =>
    queryClient.invalidateQueries({ queryKey: ["suppliers", "initial-balance"] as const });

  const setEntry = (idx: number, updates: Partial<EntryForm>) => {
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...updates } : e)));
    if (updates.supplierId === undefined) return;
    const row = entries[idx];
    if (row?.supplierId && duplicateIds.has(row.supplierId)) {
      setDuplicateIds((prev) => {
        const next = new Set(prev);
        next.delete(row.supplierId);
        return next;
      });
    }
  };

  const addRow = () => setEntries((prev) => [...prev, emptyRow()]);

  const removeRow = (idx: number) => {
    const row = entries[idx];
    if (row?.supplierId && duplicateIds.has(row.supplierId)) {
      setDuplicateIds((prev) => {
        const next = new Set(prev);
        next.delete(row.supplierId);
        return next;
      });
    }
    setEntries((prev) => prev.filter((_, i) => i !== idx));
  };

  const validEntries = entries.filter(
    (e) => e.supplierId && parseFloat(e.amount || "0") > 0,
  );
  const totalAmount = validEntries.reduce(
    (s, e) => s + parseFloat(e.amount || "0"),
    0,
  );

  const submitMutation = useMutation({
    mutationFn: () => {
      const payload = validEntries.map((e) => ({
        supplierId: e.supplierId,
        amount: e.amount,
        date: e.date || undefined,
        memo: e.memo || undefined,
      }));
      if (payload.length === 0) throw new Error("등록할 항목이 없습니다");
      return apiMutate<{ count: number }>(
        "/api/suppliers/initial-balance",
        "POST",
        { entries: payload },
      );
    },
    onSuccess: (result) => {
      toast.success(`기초 미지급금 ${result.count}건 등록 완료`);
      setConfirmOpen(false);
      setDuplicateIds(new Set());
      setEntries([emptyRow()]);
      refreshHistory();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.details as
          | { duplicates?: Array<{ supplierId: string }> }
          | undefined;
        if (body?.duplicates && Array.isArray(body.duplicates)) {
          const ids = new Set<string>(body.duplicates.map((d) => d.supplierId));
          setDuplicateIds(ids);
          setConfirmOpen(false);
          toast.error(`${body.duplicates.length}건 중복 — 강조된 행을 제거해주세요`);
          return;
        }
      }
      toast.error(err instanceof ApiError ? err.message : err.message || "등록 실패");
    },
  });
  const submitting = submitMutation.isPending;
  const handleSubmit = () => submitMutation.mutate();

  return (
    <JmScope theme={resolvedTheme === "dark" ? "dark" : "light"} className="contents">
      <div className="flex h-full flex-col bg-[var(--jm-bg)]">
        {/* 툴바 */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-4 py-2 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-jm-sm font-medium text-[var(--jm-text)]">
              기초 미지급금
            </h2>
            <JmSegmentedControl
              size="sm"
              ariaLabel="탭"
              value={tab}
              onChange={(v) => setTab(v as typeof tab)}
              options={[
                { value: "register", label: "등록" },
                { value: "history", label: "이력" },
              ]}
            />
          </div>
          <div className="flex items-center gap-2">
            {tab === "register" && validEntries.length > 0 && (
              <span className="text-jm-xs text-[var(--jm-text-muted)] tabular-nums">
                {validEntries.length}건 · ₩{formatComma(String(Math.round(totalAmount)))}
              </span>
            )}
            {tab === "register" && (
              <JmButton
                size="sm"
                variant="cta"
                disabled={validEntries.length === 0 || submitting}
                onClick={() => setConfirmOpen(true)}
              >
                {submitting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                <span>일괄 등록</span>
              </JmButton>
            )}
          </div>
        </div>

        {/* 등록 탭 */}
        {tab === "register" && (
          <JmScrollArea className="flex-1 min-h-0">
            <table className="w-full text-jm-sm">
              <thead>
                <tr className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-jm-xs">
                  <th className="border-r border-b border-[var(--jm-border)] w-[36px] py-2 text-center font-medium">
                    #
                  </th>
                  <th
                    className="border-r border-b border-[var(--jm-border)] py-2 px-2 text-left font-medium"
                    style={{ width: "30%" }}
                  >
                    거래처
                  </th>
                  <th className="border-r border-b border-[var(--jm-border)] w-[170px] py-2 text-center font-medium">
                    기초 잔액
                    <span className="ml-1 text-[10px] text-[var(--jm-text-muted)] font-normal">
                      (VAT 포함 총액)
                    </span>
                  </th>
                  <th className="border-r border-b border-[var(--jm-border)] w-[140px] py-2 text-center font-medium">
                    기준일
                  </th>
                  <th className="border-b border-[var(--jm-border)] py-2 px-2 text-center font-medium">
                    메모
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, idx) => {
                  const isDuplicate =
                    entry.supplierId && duplicateIds.has(entry.supplierId);
                  return (
                    <tr
                      key={`row-${idx}`}
                      className={`group border-b border-[var(--jm-border)] ${
                        isDuplicate
                          ? "bg-[var(--jm-danger-bg)]/40 hover:bg-[var(--jm-danger-bg)]/60"
                          : "hover:bg-[var(--jm-surface-muted)]/60"
                      }`}
                    >
                      <td className="border-r border-[var(--jm-border)] text-center text-[var(--jm-text-muted)] py-1 tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="border-r border-[var(--jm-border)] px-1 py-0.5">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 min-w-0">
                            <SupplierCombobox
                              suppliers={suppliers}
                              value={entry.supplierId}
                              onChange={(id, name) =>
                                setEntry(idx, { supplierId: id, supplierName: name })
                              }
                              onCreateNew={() =>
                                toast.info("거래처는 '거래처' 메뉴에서 등록하세요")
                              }
                              placeholder="거래처 선택..."
                            />
                          </div>
                          {isDuplicate && (
                            <JmBadge
                              variant="danger"
                              size="sm"
                              shape="square"
                              className="shrink-0"
                            >
                              이미 등록됨
                            </JmBadge>
                          )}
                        </div>
                      </td>
                      <td className="border-r border-[var(--jm-border)] p-0.5">
                        <input
                          value={formatComma(entry.amount)}
                          onChange={(e) =>
                            setEntry(idx, { amount: parseComma(e.target.value) })
                          }
                          onFocus={focusCaretEnd}
                          inputMode="numeric"
                          className="w-full h-7 bg-transparent text-right text-jm-sm tabular-nums px-2 outline-none focus:bg-[var(--jm-surface-muted)] rounded text-[var(--jm-text)]"
                        />
                      </td>
                      <td className="border-r border-[var(--jm-border)] p-0.5">
                        <input
                          type="date"
                          value={entry.date}
                          onChange={(e) => setEntry(idx, { date: e.target.value })}
                          className="w-full h-7 bg-transparent text-jm-sm px-2 outline-none focus:bg-[var(--jm-surface-muted)] rounded text-[var(--jm-text)]"
                        />
                      </td>
                      <td className="p-0.5">
                        <div className="flex items-center gap-0.5">
                          <input
                            value={entry.memo}
                            onChange={(e) => setEntry(idx, { memo: e.target.value })}
                            className="flex-1 h-7 bg-transparent text-jm-sm px-2 outline-none focus:bg-[var(--jm-surface-muted)] rounded text-[var(--jm-text)]"
                          />
                          <JmIconButton
                            aria-label="행 삭제"
                            size="sm"
                            variant="ghost"
                            onClick={() => removeRow(idx)}
                          >
                            <Trash2 />
                          </JmIconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-[var(--jm-border)] px-3 py-2">
              <button
                type="button"
                className="flex items-center gap-1.5 text-jm-sm text-[var(--jm-info-fg)] hover:underline"
                onClick={addRow}
              >
                <Plus className="size-4" />
                행 추가
              </button>
              <div className="text-jm-sm text-[var(--jm-text-muted)]">
                합계:{" "}
                <span className="font-medium text-[var(--jm-text)] tabular-nums">
                  ₩{Math.round(totalAmount).toLocaleString("ko-KR")}
                </span>
              </div>
            </div>
          </JmScrollArea>
        )}

        {/* 이력 탭 */}
        {tab === "history" && (
          <div className="flex-1 overflow-y-auto min-h-0">
            <JmTable>
              <JmTableHeader className="sticky top-0 z-10">
                <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
                  <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
                    등록일
                  </JmTableHead>
                  <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
                    거래처
                  </JmTableHead>
                  <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
                    결제방식
                  </JmTableHead>
                  <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
                    기초 잔액 (VAT 포함)
                  </JmTableHead>
                  <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
                    설명
                  </JmTableHead>
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {historyLoading ? (
                  <HistorySkeletonRows />
                ) : historyItems.length === 0 ? (
                  <JmTableRow className="hover:bg-transparent">
                    <JmTableCell
                      colSpan={5}
                      className="text-center py-10 text-[var(--jm-text-muted)] text-sm"
                    >
                      기초 미지급금 이력이 없습니다
                    </JmTableCell>
                  </JmTableRow>
                ) : (
                  historyItems.map((h) => (
                    <JmTableRow key={h.id}>
                      <JmTableCell className="px-3 py-2 text-[var(--jm-text-muted)] tabular-nums">
                        {new Date(h.date).toLocaleDateString("ko-KR")}
                      </JmTableCell>
                      <JmTableCell className="px-3 py-2 font-medium text-[var(--jm-text)]">
                        {h.supplier.name}
                      </JmTableCell>
                      <JmTableCell className="px-3 py-2">
                        <JmBadge
                          variant={
                            h.supplier.paymentMethod === "CREDIT"
                              ? "danger"
                              : "default"
                          }
                          size="sm"
                          shape="square"
                        >
                          {h.supplier.paymentMethod === "CREDIT" ? "외상" : "선결제"}
                        </JmBadge>
                      </JmTableCell>
                      <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
                        ₩{Math.round(parseFloat(h.debitAmount)).toLocaleString("ko-KR")}
                      </JmTableCell>
                      <JmTableCell className="px-3 py-2 text-[var(--jm-text-muted)] text-jm-xs">
                        {h.description}
                      </JmTableCell>
                    </JmTableRow>
                  ))
                )}
              </JmTableBody>
            </JmTable>
          </div>
        )}
      </div>

      {/* 등록 확인 다이얼로그 */}
      <JmDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <JmDialogContent size="md">
          <JmDialogHeader>
            <JmDialogTitle>기초 미지급금 등록 확인</JmDialogTitle>
          </JmDialogHeader>
          <JmDialogBody>
            <div className="space-y-3 text-jm-sm text-[var(--jm-text)]">
              <p>
                <strong>{validEntries.length}건</strong>의 기초 미지급금을 등록합니다.
              </p>
              <p className="text-[var(--jm-text-muted)]">
                총액:{" "}
                <strong className="text-[var(--jm-text)] tabular-nums">
                  ₩{Math.round(totalAmount).toLocaleString("ko-KR")}
                </strong>
              </p>
              <div className="rounded-md bg-[var(--jm-surface-muted)] border border-[var(--jm-border)] p-3 text-jm-xs text-[var(--jm-text-muted)] space-y-1">
                <p>
                  · <strong>금액은 VAT 포함 총액</strong> (실제 지급해야 할 미수 금액)
                </p>
                <p>· 각 거래처의 거래원장에 ADJUSTMENT 1건이 기록됩니다</p>
                <p>
                  · 1회성 작업입니다. 동일 거래처에 이미 기초 미지급금이 있으면 거부됩니다
                </p>
                <p>· 재고에는 영향이 없습니다</p>
              </div>
            </div>
          </JmDialogBody>
          <JmDialogFooter>
            <JmButton variant="ghost" onClick={() => setConfirmOpen(false)}>
              취소
            </JmButton>
            <JmButton variant="cta" onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              <span>등록</span>
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>
    </JmScope>
  );
}
