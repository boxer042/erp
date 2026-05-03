"use client";

import { use, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSessions } from "@/components/pos/sessions-context";
import { ProductBrowser } from "@/components/pos/product-browser";
import { RepairWorkspace } from "@/components/pos/repair-workspace";
import { RentalForm } from "@/components/pos/rental-form";
import type { CartMode } from "@/components/pos/pos-sidebar";

export default function CartWorkspacePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getSession, hydrated } = useSessions();
  const session = getSession(sessionId);

  const mode = (searchParams.get("mode") ?? "product") as CartMode;

  useEffect(() => {
    if (hydrated && !session) {
      router.replace("/pos");
    }
  }, [hydrated, session, router]);

  if (!hydrated || !session) {
    return <div className="h-full" />;
  }

  return (
    <div className="h-full overflow-hidden">
      {mode === "product" && <ProductBrowser sessionId={sessionId} enabled />}
      {mode === "repair" && <RepairWorkspace sessionId={sessionId} />}
      {mode === "rental" && (
        <div className="h-full overflow-y-auto">
          <RentalForm sessionId={sessionId} enabled />
        </div>
      )}
    </div>
  );
}
