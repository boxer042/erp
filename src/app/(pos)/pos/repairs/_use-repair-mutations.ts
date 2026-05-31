"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ApiError, apiMutate } from "@/lib/api-client";
import type {
  RepairLabor,
  RepairPart,
  RepairPartStatus,
  RepairTicketDetail,
} from "./_types";

/**
 * 수리 본문 mutation — 모두 optimistic (탭 즉시 반영) + 실패 시 롤백.
 *
 * 핵심: 동작마다 티켓 전체를 invalidate→refetch 하던 기존 방식 대신,
 * `setQueryData` 로 캐시를 직접 patch → 왕복 없이 화면 즉시 갱신, egress 절감.
 * 서버 응답(엔티티/필드)으로 onSuccess 에서 재조정해 temp id·계산 오차를 정리.
 *
 * Phase B 새 카드 + 기존 카드 양쪽이 이 훅을 공유 (데이터 계층 단일화).
 */
export function useRepairMutations(ticketId: string) {
  const qc = useQueryClient();
  const key = ["repairs", "detail", ticketId] as const;

  const patch = (fn: (t: RepairTicketDetail) => RepairTicketDetail) =>
    qc.setQueryData<RepairTicketDetail>(key, (old) => (old ? fn(old) : old));

  /** optimistic 공통 — 진행 중 refetch 취소 + 스냅샷 확보 */
  const begin = async () => {
    await qc.cancelQueries({ queryKey: key });
    return { prev: qc.getQueryData<RepairTicketDetail>(key) };
  };
  const rollback = (ctx: { prev?: RepairTicketDetail } | undefined, msg: string) => (e: unknown) => {
    if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    toast.error(e instanceof ApiError ? e.message : msg);
  };

  const num = (s: string | number) => (typeof s === "number" ? s : parseFloat(s) || 0);

  // ─── 부속 ───────────────────────────────────────────────────────────
  const addPart = useMutation({
    mutationFn: (p: {
      productId: string;
      name: string;
      sku: string;
      quantity: number;
      unitPrice: number;
      status?: RepairPartStatus;
    }) =>
      apiMutate<RepairPart>(`/api/repair-tickets/${ticketId}/parts`, "POST", {
        productId: p.productId,
        quantity: p.quantity,
        unitPrice: p.unitPrice,
        status: p.status ?? "USED",
      }),
    onMutate: async (p) => {
      const ctx = await begin();
      const status = p.status ?? "USED";
      patch((t) => {
        // 같은 상품+상태 행 있으면 수량 증가 (서버 merge 규칙 미러)
        const existing = t.parts.find(
          (x) => x.productId === p.productId && x.status === status,
        );
        if (existing) {
          const q = num(existing.quantity) + p.quantity;
          return {
            ...t,
            parts: t.parts.map((x) =>
              x.id === existing.id
                ? { ...x, quantity: String(q), totalPrice: String(q * num(existing.unitPrice)) }
                : x,
            ),
          };
        }
        const temp: RepairPart = {
          id: `tmp-${crypto.randomUUID()}`,
          productId: p.productId,
          product: { id: p.productId, name: p.name, sku: p.sku },
          quantity: String(p.quantity),
          unitPrice: String(p.unitPrice),
          totalPrice: String(p.quantity * p.unitPrice),
          discount: "0",
          status,
          billLost: false,
          consumedAt: null,
        };
        return { ...t, parts: [...t.parts, temp] };
      });
      return ctx;
    },
    onError: (e, _v, ctx) => rollback(ctx, "부속 추가 실패")(e),
    onSuccess: (serverPart) => {
      // temp/낙관 행을 서버 권위 행으로 교체 (실 id·총액)
      patch((t) => {
        const filtered = t.parts.filter(
          (x) =>
            x.id !== serverPart.id &&
            !(x.id.startsWith("tmp-") && x.productId === serverPart.productId && x.status === serverPart.status),
        );
        return { ...t, parts: [...filtered, serverPart] };
      });
    },
  });

  const updatePart = useMutation({
    mutationFn: (v: {
      partId: string;
      quantity?: number;
      unitPrice?: number;
      status?: RepairPartStatus;
      billLost?: boolean;
      discount?: string;
    }) =>
      apiMutate<RepairPart>(`/api/repair-tickets/${ticketId}/parts/${v.partId}`, "PATCH", {
        ...(v.quantity !== undefined ? { quantity: v.quantity } : {}),
        ...(v.unitPrice !== undefined ? { unitPrice: v.unitPrice } : {}),
        ...(v.status !== undefined ? { status: v.status } : {}),
        ...(v.billLost !== undefined ? { billLost: v.billLost } : {}),
        ...(v.discount !== undefined ? { discount: v.discount } : {}),
      }),
    onMutate: async (v) => {
      const ctx = await begin();
      patch((t) => ({
        ...t,
        parts: t.parts.map((x) => {
          if (x.id !== v.partId) return x;
          const q = v.quantity ?? num(x.quantity);
          const up = v.unitPrice ?? num(x.unitPrice);
          return {
            ...x,
            quantity: String(q),
            unitPrice: String(up),
            totalPrice: String(q * up),
            ...(v.status !== undefined ? { status: v.status } : {}),
            ...(v.billLost !== undefined ? { billLost: v.billLost } : {}),
            ...(v.discount !== undefined ? { discount: v.discount } : {}),
          };
        }),
      }));
      return ctx;
    },
    onError: (e, _v, ctx) => rollback(ctx, "부속 수정 실패")(e),
    onSuccess: (serverPart) =>
      patch((t) => ({
        ...t,
        parts: t.parts.map((x) => (x.id === serverPart.id ? serverPart : x)),
      })),
  });

  const deletePart = useMutation({
    mutationFn: (partId: string) =>
      apiMutate(`/api/repair-tickets/${ticketId}/parts/${partId}`, "DELETE"),
    onMutate: async (partId) => {
      const ctx = await begin();
      patch((t) => ({ ...t, parts: t.parts.filter((x) => x.id !== partId) }));
      return ctx;
    },
    onError: (e, _v, ctx) => rollback(ctx, "부속 삭제 실패")(e),
  });

  // ─── 공임 ───────────────────────────────────────────────────────────
  const addLabor = useMutation({
    mutationFn: (l: { name: string; unitRate: number; hours?: number }) =>
      apiMutate<RepairLabor>(`/api/repair-tickets/${ticketId}/labors`, "POST", {
        name: l.name,
        hours: l.hours ?? 1,
        unitRate: l.unitRate,
      }),
    onMutate: async (l) => {
      const ctx = await begin();
      const hours = l.hours ?? 1;
      const temp: RepairLabor = {
        id: `tmp-${crypto.randomUUID()}`,
        name: l.name,
        hours: String(hours),
        unitRate: String(l.unitRate),
        totalPrice: String(hours * l.unitRate),
      };
      patch((t) => ({ ...t, labors: [...t.labors, temp] }));
      return ctx;
    },
    onError: (e, _v, ctx) => rollback(ctx, "공임 추가 실패")(e),
    onSuccess: (serverLabor) =>
      patch((t) => ({
        ...t,
        labors: [...t.labors.filter((x) => !x.id.startsWith("tmp-") && x.id !== serverLabor.id), serverLabor],
      })),
  });

  const updateLabor = useMutation({
    mutationFn: (v: { laborId: string; unitRate?: number; name?: string; hours?: number }) =>
      apiMutate<RepairLabor>(`/api/repair-tickets/${ticketId}/labors/${v.laborId}`, "PATCH", {
        ...(v.unitRate !== undefined ? { unitRate: v.unitRate } : {}),
        ...(v.name !== undefined ? { name: v.name } : {}),
        ...(v.hours !== undefined ? { hours: v.hours } : {}),
      }),
    onMutate: async (v) => {
      const ctx = await begin();
      patch((t) => ({
        ...t,
        labors: t.labors.map((x) => {
          if (x.id !== v.laborId) return x;
          const hours = v.hours ?? num(x.hours);
          const rate = v.unitRate ?? num(x.unitRate);
          return {
            ...x,
            ...(v.name !== undefined ? { name: v.name } : {}),
            hours: String(hours),
            unitRate: String(rate),
            totalPrice: String(hours * rate),
          };
        }),
      }));
      return ctx;
    },
    onError: (e, _v, ctx) => rollback(ctx, "공임 수정 실패")(e),
    onSuccess: (serverLabor) =>
      patch((t) => ({
        ...t,
        labors: t.labors.map((x) => (x.id === serverLabor.id ? serverLabor : x)),
      })),
  });

  const deleteLabor = useMutation({
    mutationFn: (laborId: string) =>
      apiMutate(`/api/repair-tickets/${ticketId}/labors/${laborId}`, "DELETE"),
    onMutate: async (laborId) => {
      const ctx = await begin();
      patch((t) => ({ ...t, labors: t.labors.filter((x) => x.id !== laborId) }));
      return ctx;
    },
    onError: (e, _v, ctx) => rollback(ctx, "공임 삭제 실패")(e),
  });

  // ─── 티켓 필드 (증상·진단·메모·진단비·보증) ───────────────────────────
  // 증상/진단은 서버가 자유텍스트를 템플릿으로 정규화 → 응답에 templateId 포함.
  // 응답을 merge 해 추천(symptomTemplateId 의존)까지 동기화.
  type FieldPatch = Partial<
    Pick<
      RepairTicketDetail,
      "symptom" | "diagnosis" | "repairNotes" | "diagnosisFee" | "repairWarrantyMonths"
    >
  >;
  const setField = useMutation({
    mutationFn: (p: FieldPatch) =>
      apiMutate<Partial<RepairTicketDetail>>(`/api/repair-tickets/${ticketId}`, "PUT", p),
    onMutate: async (p) => {
      const ctx = await begin();
      patch((t) => ({ ...t, ...p }));
      return ctx;
    },
    onError: (e, _v, ctx) => rollback(ctx, "저장 실패")(e),
    onSuccess: (res) => patch((t) => ({ ...t, ...res })),
  });

  return {
    addPart,
    updatePart,
    deletePart,
    addLabor,
    updateLabor,
    deleteLabor,
    setField,
  };
}
