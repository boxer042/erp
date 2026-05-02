"use client";

import { useRouter } from "next/navigation";
import { useSessions } from "@/components/pos/sessions-context";
import {
  CustomerSessionCard,
  AddCustomerCard,
} from "@/components/pos/customer-session-card";

export default function PosAllCustomersPage() {
  const router = useRouter();
  const { sessions, addSession, hydrated } = useSessions();

  const handleAdd = () => {
    const id = addSession();
    if (id) router.push(`/pos/cart/${id}`);
  };

  return (
    <div className="mx-auto h-full max-w-6xl overflow-y-auto p-4 sm:p-6">
      <div className="mb-4 flex items-end justify-between sm:mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">손님</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            현재 {hydrated ? sessions.length : 0}팀
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
        {hydrated &&
          sessions.map((s) => <CustomerSessionCard key={s.id} session={s} />)}
        {hydrated && <AddCustomerCard onAdd={handleAdd} />}
      </div>
    </div>
  );
}
