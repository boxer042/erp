"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeft, Loader2 } from "lucide-react";
import { CustomerCombobox } from "@/components/customer-combobox";
import { QuickCustomerSheet } from "@/components/quick-register-sheets";

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
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [machines, setMachines] = useState<MachineLite[]>([]);
  const [machineId, setMachineId] = useState("");
  const [newMachine, setNewMachine] = useState({ name: "", brand: "", modelNo: "", serialNo: "" });
  const [useNewMachine, setUseNewMachine] = useState(false);
  const [symptom, setSymptom] = useState("");
  const [memo, setMemo] = useState("");
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [quickDefaultName, setQuickDefaultName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/customers").then((r) => r.json()).then(setCustomers);
  }, []);

  useEffect(() => {
    if (!customerId) { setMachines([]); setMachineId(""); return; }
    fetch(`/api/customer-machines?customerId=${customerId}`).then((r) => r.json()).then(setMachines);
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
        const mres = await fetch("/api/customer-machines", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerId, ...newMachine }),
        });
        if (mres.ok) {
          const m = await mres.json();
          finalMachineId = m.id;
        }
      }
      const res = await fetch("/api/repair-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          customerMachineId: finalMachineId,
          symptom,
          memo,
        }),
      });
      if (!res.ok) throw new Error();
      const ticket = await res.json();
      toast.success(`수리 접수 완료 — ${ticket.ticketNo}`);
      router.push(`/pos/repair/${ticket.id}`);
    } catch {
      toast.error("접수 실패");
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
                <input className="input h-10" placeholder="기계명*" value={newMachine.name} onChange={(e) => setNewMachine({ ...newMachine, name: e.target.value })} />
                <input className="input h-10" placeholder="브랜드" value={newMachine.brand} onChange={(e) => setNewMachine({ ...newMachine, brand: e.target.value })} />
                <input className="input h-10" placeholder="모델번호" value={newMachine.modelNo} onChange={(e) => setNewMachine({ ...newMachine, modelNo: e.target.value })} />
                <input className="input h-10" placeholder="시리얼" value={newMachine.serialNo} onChange={(e) => setNewMachine({ ...newMachine, serialNo: e.target.value })} />
              </div>
            ) : (
              <select
                className="input h-11"
                value={machineId}
                onChange={(e) => setMachineId(e.target.value)}
              >
                <option value="">선택 안 함</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}{m.brand ? ` (${m.brand}${m.modelNo ? ` ${m.modelNo}` : ""})` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : null}

        <div>
          <label className="mb-1 block text-sm font-medium">증상</label>
          <textarea
            className="input"
            rows={3}
            value={symptom}
            onChange={(e) => setSymptom(e.target.value)}
            placeholder="고객이 설명한 증상"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">메모</label>
          <textarea
            className="input"
            rows={2}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Link href="/pos/repair" className="flex h-11 items-center rounded-lg border border-border px-4 text-sm hover:bg-muted/50">
            취소
          </Link>
          <button
            onClick={submit}
            disabled={submitting}
            className="flex h-11 items-center gap-1 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            접수
          </button>
        </div>
      </div>

      <QuickCustomerSheet
        open={quickCustomerOpen}
        onOpenChange={setQuickCustomerOpen}
        defaultName={quickDefaultName}
        onCreated={(c) => {
          fetch("/api/customers").then((r) => r.json()).then((list) => {
            setCustomers(list);
            setCustomerId(c.id);
          });
        }}
      />

      <style jsx>{`
        :global(.input) {
          display: block;
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid var(--border);
          padding: 0.5rem 0.75rem;
          font-size: 0.95rem;
          outline: none;
          background: var(--background);
          color: var(--foreground);
        }
        :global(.input:focus) {
          border-color: var(--primary);
        }
      `}</style>
    </div>
  );
}
