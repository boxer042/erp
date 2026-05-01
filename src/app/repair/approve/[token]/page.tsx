"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

interface Approval {
  id: string;
  ticketNo: string;
  status: string;
  customerName: string;
  machineName: string | null;
  symptom: string | null;
  diagnosis: string | null;
  quotedLaborAmount: number;
  quotedPartsAmount: number;
  quotedTotalAmount: number;
  approvedAt: string | null;
  parts: { name: string; quantity: number; unitPrice: number; totalPrice: number }[];
  labors: { name: string; hours: number; unitRate: number; totalPrice: number }[];
}

export default function ApprovePage() {
  const params = useParams();
  const token = params?.token as string;
  const [data, setData] = useState<Approval | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [approvedName, setApprovedName] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/public/repair/approve/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json();
          throw new Error(j?.error ?? "오류");
        }
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [token]);

  const approve = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/repair/approve/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: approvedName.trim() || null }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j?.error ?? "승인 실패");
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return (
      <div className="mx-auto max-w-md p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-md p-8 space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-32 w-full rounded-md" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
    );
  }

  if (done || data.approvedAt) {
    return (
      <div className="mx-auto max-w-md p-8">
        <div className="rounded-xl border border-[#3ECF8E] bg-primary/10 p-6 text-center text-primary/80">
          ✓ 승인이 완료되었습니다.
          <div className="mt-2 text-sm">수리 번호 {data.ticketNo}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl p-6">
      <div className="mb-4 text-center">
        <div className="text-sm text-muted-foreground">수리 견적 승인</div>
        <div className="text-xl font-semibold">{data.ticketNo}</div>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-background p-5">
        <div>
          <div className="text-xs text-muted-foreground">고객</div>
          <div className="text-sm">{data.customerName}</div>
        </div>
        {data.machineName ? (
          <div>
            <div className="text-xs text-muted-foreground">기계</div>
            <div className="text-sm">{data.machineName}</div>
          </div>
        ) : null}
        {data.symptom ? (
          <div>
            <div className="text-xs text-muted-foreground">증상</div>
            <div className="text-sm whitespace-pre-wrap">{data.symptom}</div>
          </div>
        ) : null}
        {data.diagnosis ? (
          <div>
            <div className="text-xs text-muted-foreground">진단</div>
            <div className="text-sm whitespace-pre-wrap">{data.diagnosis}</div>
          </div>
        ) : null}

        {data.parts.length > 0 ? (
          <div>
            <div className="mb-1 text-xs text-muted-foreground">부품</div>
            <ul className="space-y-1 text-sm">
              {data.parts.map((p, i) => (
                <li key={i} className="flex justify-between">
                  <span>{p.name} × {p.quantity}</span>
                  <span>₩{p.totalPrice.toLocaleString("ko-KR")}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {data.labors.length > 0 ? (
          <div>
            <div className="mb-1 text-xs text-muted-foreground">공임</div>
            <ul className="space-y-1 text-sm">
              {data.labors.map((l, i) => (
                <li key={i} className="flex justify-between">
                  <span>{l.name} ({l.hours}h)</span>
                  <span>₩{l.totalPrice.toLocaleString("ko-KR")}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="border-t border-border pt-3">
          <div className="flex justify-between text-sm">
            <span>부품</span>
            <span>₩{data.quotedPartsAmount.toLocaleString("ko-KR")}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>공임</span>
            <span>₩{data.quotedLaborAmount.toLocaleString("ko-KR")}</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-base font-medium">총액</span>
            <span className="text-2xl font-semibold">
              ₩{data.quotedTotalAmount.toLocaleString("ko-KR")}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-3 rounded-xl border border-border bg-background p-5">
        <label className="block text-sm font-medium">승인자 이름 (선택)</label>
        <input
          className="h-11 w-full rounded-lg border border-border px-3 text-base outline-none focus:border-primary"
          value={approvedName}
          onChange={(e) => setApprovedName(e.target.value)}
          placeholder="본인 이름"
        />
        <button
          onClick={approve}
          disabled={submitting}
          className="h-12 w-full rounded-lg bg-primary text-base font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? "처리 중..." : "견적 승인"}
        </button>
        <p className="text-center text-xs text-muted-foreground">승인 후 수리에 착수됩니다.</p>
      </div>
    </div>
  );
}
