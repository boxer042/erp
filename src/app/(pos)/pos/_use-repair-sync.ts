"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { useSessions, type CartSession } from "@/components/pos/sessions-context";
import type { RepairTicketRow } from "@/app/(pos)/pos/repair-v2/_types";

/**
 * 손님의 수리 티켓을 fetch + sessions 동기화.
 * - openRepairCount = (PICKED_UP/CANCELLED 제외) 진행중 카운트
 * - 카트에 추가된 수리 라인은 RepairTicket 자체는 아직 READY 라 진행중에 포함됨 → 이중 카운트 방지 위해
 *   카트의 repair line(repairTicketId) 은 진행중에서 제외
 *
 * 추적 방식:
 * - 등록 손님: customerId 로 직접 fetch (DB 의 customerId 컬럼 매칭)
 * - 미등록 손님: posSessionId 로 fetch (RepairTicket.posSessionId 컬럼 매칭) — 클라이언트 추적 끊겨도 DB 보존
 *
 * RepairMode 와 customer page 두 곳에서 호출. queryKey 가 같으니 react-query 가 한 번만 fetch.
 * session 이 null/undefined 면 noop (rules-of-hooks 회피).
 */
export function useRepairSync(session: CartSession | undefined) {
  const { setSessionOpenRepairCount } = useSessions();

  const customerId = session?.customerId;
  const sessionId = session?.id ?? "";

  const ticketsQuery = useQuery<RepairTicketRow[]>({
    queryKey: customerId
      ? ["pos-v2", "repairs", "by-customer", customerId]
      : ["pos-v2", "repairs", "by-session", sessionId],
    queryFn: () => {
      if (customerId) {
        return apiGet<RepairTicketRow[]>(
          `/api/repair-tickets?customerId=${customerId}`,
        );
      }
      // 미등록 손님 — RepairTicket.posSessionId 매칭. DB 가 단일 출처라 stale 추적 없음.
      return apiGet<RepairTicketRow[]>(
        `/api/repair-tickets?posSessionId=${sessionId}`,
      );
    },
    enabled: !!session,
    staleTime: 1000 * 30,
  });

  // 카트에 이미 추가된 repair 라인의 ticketId — 진행중 카운트에서 제외
  const cartRepairTicketIds = useMemo(() => {
    const ids = new Set<string>();
    for (const it of session?.items ?? []) {
      if (it.itemType === "repair" && it.repairMeta?.repairTicketId) {
        ids.add(it.repairMeta.repairTicketId);
      }
    }
    return ids;
  }, [session?.items]);

  const openTickets = useMemo(
    () =>
      (ticketsQuery.data ?? []).filter(
        (t) =>
          t.status !== "PICKED_UP" &&
          t.status !== "CANCELLED" &&
          !cartRepairTicketIds.has(t.id),
      ),
    [ticketsQuery.data, cartRepairTicketIds],
  );

  const closedTickets = useMemo(
    () =>
      (ticketsQuery.data ?? []).filter(
        (t) => t.status === "PICKED_UP" || t.status === "CANCELLED",
      ),
    [ticketsQuery.data],
  );

  // openRepairCount 동기화 — 손님카드 배지 / 탭바 배지용
  useEffect(() => {
    if (!session) return;
    if (!ticketsQuery.data) return;
    setSessionOpenRepairCount(openTickets.length, sessionId);
  }, [openTickets.length, ticketsQuery.data, session, sessionId, setSessionOpenRepairCount]);

  return {
    ticketsQuery,
    openTickets,
    closedTickets,
    isLoading: !!session && ticketsQuery.isPending,
  };
}
