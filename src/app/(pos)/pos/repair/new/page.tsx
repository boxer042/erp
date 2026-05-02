"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeft, Loader2 } from "lucide-react";
import { CustomerCombobox } from "@/components/customer-combobox";
import { QuickCustomerSheet } from "@/components/quick-register-sheets";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface CustomerLite {
  id: string;
  name: string;
  phone: string | null;
  businessNumber: string | null;
}

interface MachineLite {
  id: string;
  name: string;
  brand: string | null;
  modelNo: string | null;
}

export default function NewRepairPage() {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [machineId, setMachineId] = useState("");
  const [newMachine, setNewMachine] = useState({ name: "", brand: "", modelNo: "", serialNo: "" });
  const [useNewMachine, setUseNewMachine] = useState(false);
  const [symptom, setSymptom] = useState("");
  const [memo, setMemo] = useState("");
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [quickDefaultName, setQuickDefaultName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const customersQuery = useQuery({
    queryKey: ["customers", "list-pos"],
    queryFn: () => apiGet<CustomerLite[]>("/api/customers"),
  });
  const customers = customersQuery.data ?? [];

  const machinesQuery = useQuery({
    queryKey: ["customer-machines", customerId],
    queryFn: () => apiGet<MachineLite[]>(`/api/customer-machines?customerId=${customerId}`),
    enabled: !!customerId,
  });
  const machines = machinesQuery.data ?? [];

  useEffect(() => {
    if (!customerId) setMachineId("");
  }, [customerId]);

  const submit = async () => {
    if (!customerId) {
      toast.error("고객을 선택하세요");
      return;
    }
    setSubmitting(true);
    try {
      let finalMachineId = machineId || null;
      if (useNewMachine && newMachine.name.trim()) {
        try {
          const m = await apiMutate<{ id: string }>("/api/customer-machines", "POST", {
            customerId,
            ...newMachine,
          });
          finalMachineId = m.id;
        } catch {
          // ignore — proceed without machine
        }
      }
      const ticket = await apiMutate<{ id: string; ticketNo: string }>("/api/repair-tickets", "POST", {
        customerId,
        customerMachineId: finalMachineId,
        symptom,
        memo,
      });
      toast.success(`수리 접수 완료 — ${ticket.ticketNo}`);
      router.push(`/pos/repair/${ticket.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "접수 실패");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Link href="/pos/repair" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> 수리 목록
      </Link>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">수리 접수</h1>

      <div className="space-y-5 rounded-xl border border-border bg-background p-6">
        <div>
          <label className="mb-1 block text-sm font-medium">고객 *</label>
          <CustomerCombobox
            customers={customers}
            value={customerId}
            onChange={(id) => setCustomerId(id)}
            onCreateNew={(name) => {
              setQuickDefaultName(name);
              setQuickCustomerOpen(true);
            }}
          />
        </div>

        {customerId ? (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-sm font-medium">기계</label>
              <button
                onClick={() => setUseNewMachine(!useNewMachine)}
                className="text-xs text-primary/80 hover:underline"
              >
                {useNewMachine ? "기존 장비에서 선택" : "신규 장비 등록"}
              </button>
            </div>
            {useNewMachine ? (
              <div className="grid grid-cols-2 gap-2">
                <Input className="h-10" placeholder="기계명*" value={newMachine.name} onChange={(e) => setNewMachine({ ...newMachine, name: e.target.value })} />
                <Input className="h-10" placeholder="브랜드" value={newMachine.brand} onChange={(e) => setNewMachine({ ...newMachine, brand: e.target.value })} />
                <Input className="h-10" placeholder="모델번호" value={newMachine.modelNo} onChange={(e) => setNewMachine({ ...newMachine, modelNo: e.target.value })} />
                <Input className="h-10" placeholder="시리얼" value={newMachine.serialNo} onChange={(e) => setNewMachine({ ...newMachine, serialNo: e.target.value })} />
              </div>
            ) : (
              <Select value={machineId || "__none"} onValueChange={(v) => setMachineId(!v || v === "__none" ? "" : v)}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="선택 안 함" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">선택 안 함</SelectItem>
                  {machines.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}{m.brand ? ` (${m.brand}${m.modelNo ? ` ${m.modelNo}` : ""})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        ) : null}

        <div>
          <label className="mb-1 block text-sm font-medium">증상</label>
          <Textarea
            rows={3}
            value={symptom}
            onChange={(e) => setSymptom(e.target.value)}
            placeholder="고객이 설명한 증상"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">메모</label>
          <Textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => router.push("/pos/repair")}>취소</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            접수
          </Button>
        </div>
      </div>

      <QuickCustomerSheet
        open={quickCustomerOpen}
        onOpenChange={setQuickCustomerOpen}
        defaultName={quickDefaultName}
        onCreated={(c) => {
          customersQuery.refetch();
          setCustomerId(c.id);
        }}
      />
    </div>
  );
}
