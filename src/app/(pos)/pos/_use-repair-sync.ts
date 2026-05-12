"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { useSessions, type CartSession } from "@/components/pos/sessions-context";
import type { RepairTicketRow } from "@/app/(pos)/pos/repairs/_types";

/**
 * 고객의 수리 티켓을 fetch + sessions 동기화.
 * - openRepairCount = (PICKED_UP/CANCELLED 제외) 진행중 카운트
 * - READY 티켓이 결제 카트에 들어가 있어도 실제 픽업 전까지는 "진행중(픽업 대기)" 으로 분류 — 카트 라인은
 *   결제 의도일 뿐, ticket status 의 단일 출처가 진행 여부를 결정한다.
 *
 * 추적 방식:
 * - 등록 고객: customerId 로 직접 fetch (DB 의 customerId 컬럼 매칭)
 * - 미등록 고객: posSessionId 로 fetch (RepairTicket.posSessionId 컬럼 매칭) — 클라이언트 추적 끊겨도 DB 보존
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
      // 미등록 고객 — RepairTicket.posSessionId 매칭. DB 가 단일 출처라 stale 추적 없음.
      return apiGet<RepairTicketRow[]>(
        `/api/repair-tickets?posSessionId=${sessionId}`,
      );
    },
    enabled: !!session,
    staleTime: 1000 * 30,
  });

  const openTickets = useMemo(
    () =>
      (ticketsQuery.data ?? []).filter(
        (t) => t.status !== "PICKED_UP" && t.status !== "CANCELLED",
      ),
    [ticketsQuery.data],
  );

  const closedTickets = useMemo(
    () =>
      (ticketsQuery.data ?? []).filter(
        (t) => t.status === "PICKED_UP" || t.status === "CANCELLED",
      ),
    [ticketsQuery.data],
  );

  // openRepairCount 동기화 — 고객카드 배지 / 탭바 배지용
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
