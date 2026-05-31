"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check } from "lucide-react";
import { format } from "date-fns";

import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatComma, parseComma } from "@/lib/utils";
import { focusCaretEnd } from "@/jm/lib/focus";
import {
  jmToast as toast,
  JmAlert,
  JmButton,
  JmCard,
  JmCardContent,
  JmCardHeader,
  JmCardTitle,
  JmContainer,
  JmFormField,
  JmInput,
  JmSkeleton,
  JmTextarea,
} from "@/jm";

interface PendingPresaleItem {
  id: string;
  serviceName: string | null;
  /** "used"=미등록 중고(활성). 향후 "catalog"(내상품)·수리 등. */
  presaleKind: string | null;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  order: {
    id: string;
    orderNo: string;
    orderDate: string;
    customerId: string | null;
    customerName: string | null;
  };
}

// 선판매 종류별 표시 (확장 지점) — 현재 "used"만 활성.
const PRESALE_KIND_META: Record<
  string,
  { label: string; active: boolean }
> = {
  used: { label: "중고", active: true },
  catalog: { label: "내상품", active: false },
};

interface RegisterFormValue {
  orderItemId: string;
  displayName: string;
  acquiredCost: string;
  sourceMemo: string;
  memo: string;
}

const EMPTY_FORM: RegisterFormValue = {
  orderItemId: "",
  displayName: "",
  acquiredCost: "",
  sourceMemo: "",
  memo: "",
};

export default function PresalePage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<RegisterFormValue>(EMPTY_FORM);
  const [selectedKind, setSelectedKind] = useState<string | null>(null);

  const pendingQuery = useQuery<PendingPresaleItem[]>({
    queryKey: queryKeys.presale.list({ days: 30 }),
    queryFn: () => apiGet<PendingPresaleItem[]>("/api/presale?days=30"),
  });

  const registerMutation = useMutation({
    mutationFn: () =>
      apiMutate("/api/presale", "POST", {
        orderItemId: form.orderItemId,
        displayName: form.displayName,
        acquiredCost: form.acquiredCost || "0",
        sourceMemo: form.sourceMemo || null,
        memo: form.memo || null,
      }),
    onSuccess: () => {
      toast.success("선판매 항목이 등록되었습니다");
      setForm(EMPTY_FORM);
      setSelectedKind(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.presale.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.usedItems.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "등록 실패"),
  });

  const select = (item: PendingPresaleItem) => {
    setSelectedKind(item.presaleKind);
    setForm({
      orderItemId: item.id,
      displayName: item.serviceName ?? "",
      acquiredCost: "",
      sourceMemo: "",
      memo: "",
    });
  };

  const handleSubmit = () => {
    if (!form.orderItemId) {
      toast.error("먼저 선판매 항목을 선택하세요");
      return;
    }
    if (!form.displayName.trim()) {
      toast.error("품명을 입력해주세요");
      return;
    }
    registerMutation.mutate();
  };

  const pending = pendingQuery.data ?? [];
  // 선택한 라인이 현재 등록 가능한 종류(used)인지
  const selectedActive = selectedKind ? PRESALE_KIND_META[selectedKind]?.active : false;

  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-6 py-3">
        <span className="text-jm-base font-semibold">선판매 정리</span>
        <span className="text-jm-xs text-[var(--jm-text-muted)]">
          (등록 전 먼저 팔린 라인 → 중고품 등록·연결)
        </span>
      </div>

      <JmContainer width="default" padded={false} className="p-6">
        <JmAlert variant="info" className="mb-4">
          [선판매] 로 결제된 미등록 라인입니다. 매입 정보를 등록하면 중고품으로
          연결되고 원가가 보정돼 마진 리포트 정합성이 회복됩니다. 최근 30일. (내상품·수리
          연결은 준비 중)
        </JmAlert>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* 좌: 미등록 선판매 목록 */}
          <JmCard>
            <JmCardHeader>
              <JmCardTitle>미등록 선판매 ({pending.length})</JmCardTitle>
            </JmCardHeader>
            <JmCardContent className="space-y-2 max-h-[600px] overflow-y-auto">
              {pendingQuery.isPending ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <JmSkeleton key={i} className="h-16 w-full rounded-lg" />
                ))
              ) : pending.length === 0 ? (
                <p className="py-8 text-center text-jm-sm text-[var(--jm-text-muted)]">
                  미등록 선판매 항목이 없습니다
                </p>
              ) : (
                pending.map((item) => {
                  const selected = form.orderItemId === item.id;
                  const meta = item.presaleKind
                    ? PRESALE_KIND_META[item.presaleKind]
                    : undefined;
                  return (
                    <button
                      key={item.id}
                      onClick={() => select(item)}
                      className={`flex w-full flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                        selected
                          ? "border-[var(--jm-cta)] bg-[var(--jm-cta-bg)]"
                          : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:bg-[var(--jm-surface-muted)]"
                      }`}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-jm-2xs font-semibold ${
                              meta?.active
                                ? "bg-[var(--jm-success-bg)] text-[var(--jm-success-fg)]"
                                : "bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)]"
                            }`}
                          >
                            선판매 {meta?.label ?? "기타"}
                          </span>
                          <span className="truncate font-medium text-[var(--jm-text)]">
                            {item.serviceName ?? "(이름 없음)"}
                          </span>
                        </span>
                        {selected && (
                          <Check className="size-4 shrink-0 text-[var(--jm-cta)]" />
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-jm-xs text-[var(--jm-text-muted)]">
                        <Link
                          href={`/orders?id=${item.order.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-[family-name:var(--jm-font-mono)] hover:underline"
                        >
                          {item.order.orderNo}
                        </Link>
                        <span>·</span>
                        <span>{format(new Date(item.order.orderDate), "yyyy-MM-dd")}</span>
                        <span>·</span>
                        <span>{item.order.customerName ?? "비회원"}</span>
                        <span className="ml-auto tabular-nums">
                          ₩{parseFloat(item.totalPrice).toLocaleString("ko-KR")}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </JmCardContent>
          </JmCard>

          {/* 우: 등록 폼 (종류별 분기 — 현재 중고만 활성) */}
          <JmCard>
            <JmCardHeader>
              <JmCardTitle>매입 정보 등록</JmCardTitle>
            </JmCardHeader>
            <JmCardContent className="space-y-3">
              {!form.orderItemId ? (
                <p className="py-8 text-center text-jm-sm text-[var(--jm-text-muted)]">
                  좌측 목록에서 항목을 선택하세요
                </p>
              ) : !selectedActive ? (
                <JmAlert variant="warning">
                  {selectedKind === "catalog"
                    ? "내상품 선판매 등록은 준비 중입니다."
                    : "이 유형의 선판매 등록은 아직 지원하지 않습니다."}
                </JmAlert>
              ) : (
                <>
                  <JmFormField label="품명" required>
                    <JmInput
                      value={form.displayName}
                      onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                      placeholder="예: 중고 엔진"
                    />
                  </JmFormField>
                  <JmFormField label="매입가">
                    <div className="flex items-center gap-2">
                      <JmInput
                        type="text"
                        inputMode="numeric"
                        value={formatComma(form.acquiredCost)}
                        onChange={(e) =>
                          setForm({ ...form, acquiredCost: parseComma(e.target.value) })
                        }
                        placeholder="0"
                        onFocus={focusCaretEnd}
                      />
                      <span className="shrink-0 text-jm-sm text-[var(--jm-text-muted)]">
                        원
                      </span>
                    </div>
                  </JmFormField>
                  <JmFormField label="매입처 메모">
                    <JmInput
                      value={form.sourceMemo}
                      onChange={(e) => setForm({ ...form, sourceMemo: e.target.value })}
                      placeholder="(선택) 박OO 등"
                    />
                  </JmFormField>
                  <JmFormField label="메모">
                    <JmTextarea
                      value={form.memo}
                      onChange={(e) => setForm({ ...form, memo: e.target.value })}
                      placeholder="(선택) 상태·이력 등"
                      rows={2}
                    />
                  </JmFormField>
                  <div className="flex justify-end gap-2 pt-2">
                    <JmButton variant="ghost" onClick={() => { setForm(EMPTY_FORM); setSelectedKind(null); }}>
                      취소
                    </JmButton>
                    <JmButton
                      variant="cta"
                      onClick={handleSubmit}
                      disabled={registerMutation.isPending}
                    >
                      {registerMutation.isPending && (
                        <Loader2 className="size-3.5 animate-spin" />
                      )}
                      등록
                    </JmButton>
                  </div>
                </>
              )}
            </JmCardContent>
          </JmCard>
        </div>
      </JmContainer>
    </div>
  );
}
