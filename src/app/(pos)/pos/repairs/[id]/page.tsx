"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import { useSessions } from "@/components/pos/sessions-context";

/**
 * 외부/직접 URL 진입 시 카트 워크스페이스의 수리 모드 + 해당 티켓 탭으로 자동 이동.
 * 등록된 고객이면 그 고객 세션 사용, 미등록이면 신규 세션을 만들고 티켓 ID를 추적.
 */
export default function RepairDirectAccessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const {
    sessions,
    addSession,
    setCustomer,
    switchSession,
    addSessionRepairTicket,
    hydrated,
  } = useSessions();

  const ticketQuery = useQuery({
    queryKey: ["repairs", "detail-redirect", id],
    queryFn: () =>
      apiGet<{
        id: string;
        ticketNo: string;
        customer: { id: string; name: string; phone: string | null } | null;
      }>(`/api/repair-tickets/${id}`),
  });

  useEffect(() => {
    if (!hydrated || !ticketQuery.data) return;
    const ticket = ticketQuery.data;
    // 등록 고객: 그 고객 세션 찾기/생성. 미등록: 이 티켓 ID를 가진 세션 찾기/신규
    let target: string | undefined = ticket.customer
      ? sessions.find((s) => s.customerId === ticket.customer!.id)?.id
      : sessions.find((s) => s.repairTicketIds?.includes(ticket.id))?.id;
    if (!target) {
      target = addSession();
      if (ticket.customer) {
        setCustomer(
          ticket.customer.id,
          ticket.customer.name,
          ticket.customer.phone ?? undefined,
          target,
        );
      } else {
        addSessionRepairTicket(ticket.id, target);
      }
    }
    switchSession(target);
    router.replace(`/pos/cart/${target}?mode=repair&ticket=${ticket.id}`);
  }, [
    hydrated,
    ticketQuery.data,
    sessions,
    addSession,
    setCustomer,
    switchSession,
    addSessionRepairTicket,
    router,
  ]);

  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}
