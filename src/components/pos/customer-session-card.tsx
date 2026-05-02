"use client";

import { X, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { calcCartTotals, summarizeItems } from "@/components/pos/cart-helpers";
import { useSessions, type CartSession } from "@/components/pos/sessions-context";

interface Props {
  session: CartSession;
}

export function CustomerSessionCard({ session }: Props) {
  const router = useRouter();
  const { removeSession } = useSessions();
  const totals = calcCartTotals(session);
  const summary = summarizeItems(session.items);
  const displayName = session.customerName ?? session.label;
  const initial = displayName.charAt(0);

  return (
    <Card
      onClick={() => router.push(`/pos/cart/${session.id}`)}
      className="group relative flex aspect-square cursor-pointer flex-col gap-3 p-4 transition-shadow hover:shadow-md"
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation();
          removeSession(session.id);
        }}
        className="absolute right-1.5 top-1.5 size-7 opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="손님 비우기"
      >
        <X />
      </Button>

      <div className="flex flex-col items-center gap-1.5">
        <Avatar size="lg" className="size-12">
          <AvatarFallback className="text-base font-semibold">{initial}</AvatarFallback>
        </Avatar>
        <div className="w-full text-center">
          <div className="line-clamp-1 h-5 text-sm font-semibold leading-5">{displayName}</div>
          <div className="line-clamp-1 h-4 text-xs leading-4 text-muted-foreground">
            {session.customerPhone ?? " "}
          </div>
        </div>
      </div>

      <ul className="flex h-[44px] flex-col gap-0.5 overflow-hidden text-xs text-muted-foreground">
        {session.items.length === 0 ? (
          <li className="text-center">비어있음</li>
        ) : (
          <>
            {summary.labels.map((label, idx) => (
              <li key={idx} className="truncate leading-[14px]">
                {label}
              </li>
            ))}
            {summary.more > 0 && (
              <li className="leading-[14px] text-muted-foreground/80">외 {summary.more}개</li>
            )}
          </>
        )}
      </ul>

      <div className="mt-auto text-center text-base font-semibold tabular-nums">
        ₩{totals.total.toLocaleString("ko-KR")}
      </div>
    </Card>
  );
}

interface AddProps {
  onAdd: () => void;
}

export function AddCustomerCard({ onAdd }: AddProps) {
  return (
    <Card
      onClick={onAdd}
      className={cn(
        "group flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 p-4 text-muted-foreground transition-colors",
        "hover:border-foreground/20 hover:bg-muted/40 hover:text-foreground"
      )}
    >
      <Plus className="size-8" />
      <div className="text-sm font-medium">손님 추가</div>
    </Card>
  );
}
