"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSessions } from "@/components/pos/sessions-context";

export default function PosLandingPage() {
  const router = useRouter();
  const { sessions, activeId, hydrated, addSession } = useSessions();

  useEffect(() => {
    if (!hydrated) return;
    const target = sessions.find((s) => s.id === activeId) ?? sessions[0];
    const sid = target?.id ?? addSession();
    if (sid) router.replace(`/pos/cart/${sid}?mode=product`);
  }, [hydrated, sessions, activeId, addSession, router]);

  return <div className="h-full" />;
}
