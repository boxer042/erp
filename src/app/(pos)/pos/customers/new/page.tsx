"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { digitsOnly, formatBusinessNumber, formatPhone } from "@/lib/utils";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export default function NewCustomerPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    businessNumber: "",
    ceo: "",
    email: "",
    address: "",
    memo: "",
  });

  const createMutation = useMutation({
    mutationFn: () => {
      if (!form.name.trim() || !form.phone.trim()) {
        throw new Error("이름과 전화번호는 필수입니다");
      }
      return apiMutate<{ id: string }>("/api/customers", "POST", {
        name: form.name.trim(),
        phone: digitsOnly(form.phone),
        businessNumber: digitsOnly(form.businessNumber) || undefined,
        ceo: form.ceo || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        memo: form.memo || undefined,
      });
    },
    onSuccess: (created) => {
      toast.success("등록 완료");
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      router.push(`/pos/customers/${created.id}`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : err.message || "등록 실패"),
  });
  const submitting = createMutation.isPending;
  const submit = () => createMutation.mutate();

  return (
    <div className="mx-auto max-w-xl p-6">
      <Link href="/pos/customers" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> 고객 목록
      </Link>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">고객 신규 등록</h1>

      <div className="space-y-4 rounded-xl border border-border bg-background p-6">
        <Field label="이름" required>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="전화번호" required>
          <Input
            value={formatPhone(form.phone)}
            onChange={(e) => setForm({ ...form, phone: digitsOnly(e.target.value) })}
            placeholder="010-0000-0000"
          />
        </Field>
        <Field label="사업자번호">
          <Input
            value={formatBusinessNumber(form.businessNumber)}
            onChange={(e) => setForm({ ...form, businessNumber: digitsOnly(e.target.value) })}
            placeholder="000-00-00000"
          />
        </Field>
        <Field label="대표자">
          <Input value={form.ceo} onChange={(e) => setForm({ ...form, ceo: e.target.value })} />
        </Field>
        <Field label="이메일">
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="주소">
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </Field>
        <Field label="메모">
          <Textarea
            rows={3}
            value={form.memo}
            onChange={(e) => setForm({ ...form, memo: e.target.value })}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => router.push("/pos/customers")}>취소</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            등록
          </Button>
        </div>
      </div>
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
