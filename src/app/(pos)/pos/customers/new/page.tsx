"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { digitsOnly, formatBusinessNumber, formatPhone } from "@/lib/utils";
import { ChevronLeft, Loader2 } from "lucide-react";

export default function NewCustomerPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    businessNumber: "",
    ceo: "",
    email: "",
    address: "",
    memo: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error("이름과 전화번호는 필수입니다");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: digitsOnly(form.phone),
          businessNumber: digitsOnly(form.businessNumber) || undefined,
          ceo: form.ceo || undefined,
          email: form.email || undefined,
          address: form.address || undefined,
          memo: form.memo || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      toast.success("등록 완료");
      router.push(`/pos/customers/${created.id}`);
    } catch {
      toast.error("등록 실패");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl p-6">
      <Link href="/pos/customers" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> 고객 목록
      </Link>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">고객 신규 등록</h1>

      <div className="space-y-4 rounded-xl border border-border bg-background p-6">
        <Field label="이름" required>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="전화번호" required>
          <input
            className="input"
            value={formatPhone(form.phone)}
            onChange={(e) => setForm({ ...form, phone: digitsOnly(e.target.value) })}
            placeholder="010-0000-0000"
          />
        </Field>
        <Field label="사업자번호">
          <input
            className="input"
            value={formatBusinessNumber(form.businessNumber)}
            onChange={(e) => setForm({ ...form, businessNumber: digitsOnly(e.target.value) })}
            placeholder="000-00-00000"
          />
        </Field>
        <Field label="대표자">
          <input className="input" value={form.ceo} onChange={(e) => setForm({ ...form, ceo: e.target.value })} />
        </Field>
        <Field label="이메일">
          <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="주소">
          <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </Field>
        <Field label="메모">
          <textarea
            rows={3}
            className="input"
            value={form.memo}
            onChange={(e) => setForm({ ...form, memo: e.target.value })}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Link
            href="/pos/customers"
            className="flex h-11 items-center rounded-lg border border-border px-4 text-sm hover:bg-muted/50"
          >
            취소
          </Link>
          <button
            onClick={submit}
            disabled={submitting}
            className="flex h-11 items-center gap-1 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            등록
          </button>
        </div>
      </div>

      <style jsx>{`
        :global(.input) {
          display: block;
          width: 100%;
          height: 2.5rem;
          border-radius: 0.5rem;
          border: 1px solid var(--border);
          padding: 0 0.75rem;
          font-size: 0.95rem;
          outline: none;
          background: var(--background);
          color: var(--foreground);
        }
        :global(.input:focus) {
          border-color: var(--primary);
        }
        :global(textarea.input) {
          height: auto;
          padding: 0.5rem 0.75rem;
        }
      `}</style>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_1fr] items-start gap-3">
      <label className="pt-2 text-sm font-medium">
        {label}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </label>
      <div>{children}</div>
    </div>
  );
}
