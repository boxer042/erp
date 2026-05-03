"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserMinus, UserPlus } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CustomerCombobox } from "@/components/customer-combobox";
import { QuickCustomerSheet } from "@/components/quick-register-sheets";
import { apiGet } from "@/lib/api-client";
import { useSessions } from "@/components/pos/sessions-context";

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  businessNumber: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
}

export function CustomerLinkSheet({ open, onOpenChange, sessionId }: Props) {
  const { getSession, setCustomer, clearCustomer } = useSessions();
  const session = getSession(sessionId);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickDefaultName, setQuickDefaultName] = useState("");

  const customersQuery = useQuery({
    queryKey: ["pos", "customers"],
    queryFn: () => apiGet<Customer[]>("/api/customers"),
    enabled: open,
  });
  const customers = customersQuery.data ?? [];

  if (!session) return null;
  const displayName = session.customerName ?? session.label;
  const initial = displayName.charAt(0);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-auto max-h-[80vh] gap-0">
          <SheetHeader className="border-b border-border">
            <SheetTitle>고객 정보</SheetTitle>
            <SheetDescription>등록된 고객을 연결하거나 신규 등록할 수 있습니다.</SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-5 p-5">
            {/* 현재 고객 표시 */}
            <div className="flex items-center gap-3 rounded-xl border border-border p-4">
              <Avatar size="lg" className="size-12">
                <AvatarFallback className="text-base font-semibold">{initial}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="line-clamp-1 font-semibold">{displayName}</div>
                {session.customerPhone ? (
                  <div className="text-sm text-muted-foreground">{session.customerPhone}</div>
                ) : (
                  <div className="text-sm text-muted-foreground">미등록 고객</div>
                )}
              </div>
              {session.customerId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => clearCustomer(sessionId)}
                >
                  <UserMinus data-icon="inline-start" />
                  연결 해제
                </Button>
              )}
            </div>

            {/* 고객 검색 */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">등록된 고객 검색</label>
              <CustomerCombobox
                customers={customers}
                value={session.customerId ?? ""}
                onChange={(id, c) => {
                  setCustomer(id, c.name, c.phone ?? undefined, sessionId);
                  onOpenChange(false);
                }}
                onCreateNew={(name) => {
                  setQuickDefaultName(name);
                  setQuickOpen(true);
                }}
                placeholder="이름·전화번호로 검색"
              />
              <Button
                variant="outline"
                onClick={() => {
                  setQuickDefaultName("");
                  setQuickOpen(true);
                }}
              >
                <UserPlus data-icon="inline-start" />
                새 고객 등록
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <QuickCustomerSheet
        open={quickOpen}
        onOpenChange={setQuickOpen}
        defaultName={quickDefaultName}
        onCreated={(c) => {
          setCustomer(c.id, c.name, c.phone ?? undefined, sessionId);
          setQuickOpen(false);
          onOpenChange(false);
          customersQuery.refetch();
        }}
      />
    </>
  );
}
