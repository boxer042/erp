"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { useParams } from "next/navigation";
import { Loader2, CheckCircle2 } from "lucide-react";
import { JmCard, JmSkeleton, JmInput, JmButton, JmScope } from "@/jm";

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
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [approvedName, setApprovedName] = useState("");
  const [done, setDone] = useState(false);

  const dataQuery = useQuery({
    queryKey: ["public-repair-approve", token],
    queryFn: () => apiGet<Approval>(`/api/public/repair/approve/${token}`),
    enabled: !!token,
  });
  const data = dataQuery.data ?? null;

  const queryError = dataQuery.error instanceof ApiError ? dataQuery.error.message : dataQuery.error?.message;
  const displayError = error || queryError;

  const approveMutation = useMutation({
    mutationFn: () => apiMutate(`/api/public/repair/approve/${token}`, "POST", { name: approvedName.trim() || null }),
    onSuccess: () => {
      setDone(true);
      queryClient.invalidateQueries({ queryKey: ["public-repair-approve", token] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : err.message || "승인 실패"),
  });
  const submitting = approveMutation.isPending;
  const approve = () => approveMutation.mutate();

  if (displayError) {
    return (
      <JmScope theme="auto" className="min-h-screen">
        <div className="mx-auto max-w-md p-8">
          <div className="rounded-2xl border border-[var(--jm-danger-solid)] bg-[var(--jm-danger-bg)] p-6 text-center text-jm-base text-[var(--jm-danger-fg)]">
            {displayError}
          </div>
        </div>
      </JmScope>
    );
  }

  if (!data) {
    return (
      <JmScope theme="auto" className="min-h-screen">
        <div className="mx-auto max-w-md p-8 space-y-4">
          <JmSkeleton className="h-6 w-48" />
          <JmSkeleton className="h-32 w-full rounded-md" />
          <JmSkeleton className="h-10 w-full rounded-md" />
        </div>
      </JmScope>
    );
  }

  if (done || data.approvedAt) {
    return (
      <JmScope theme="auto" className="min-h-screen">
        <div className="mx-auto max-w-md p-8">
          <div className="rounded-2xl border border-[var(--jm-success-solid)] bg-[var(--jm-success-bg)] p-6 text-center text-jm-base text-[var(--jm-success-fg)]">
            <CheckCircle2 className="mx-auto mb-1 size-6" />
            승인이 완료되었습니다.
            <div className="mt-2 text-jm-sm">수리 번호 {data.ticketNo}</div>
          </div>
        </div>
      </JmScope>
    );
  }

  return (
    <JmScope theme="auto" className="min-h-screen">
      <div className="mx-auto max-w-xl p-6">
        <div className="mb-4 text-center">
          <div className="text-jm-sm text-[var(--jm-text-muted)]">수리 견적 승인</div>
          <div className="text-jm-xl font-semibold text-[var(--jm-text)]">{data.ticketNo}</div>
        </div>

        <JmCard className="space-y-4 p-5">
          <div>
            <div className="text-jm-xs text-[var(--jm-text-muted)]">고객</div>
            <div className="text-jm-sm text-[var(--jm-text)]">{data.customerName}</div>
          </div>
          {data.machineName ? (
            <div>
              <div className="text-jm-xs text-[var(--jm-text-muted)]">기계</div>
              <div className="text-jm-sm text-[var(--jm-text)]">{data.machineName}</div>
            </div>
          ) : null}
          {data.symptom ? (
            <div>
              <div className="text-jm-xs text-[var(--jm-text-muted)]">증상</div>
              <div className="text-jm-sm whitespace-pre-wrap text-[var(--jm-text)]">{data.symptom}</div>
            </div>
          ) : null}
          {data.diagnosis ? (
            <div>
              <div className="text-jm-xs text-[var(--jm-text-muted)]">진단·수리내용</div>
              <div className="text-jm-sm whitespace-pre-wrap text-[var(--jm-text)]">{data.diagnosis}</div>
            </div>
          ) : null}

          {data.parts.length > 0 ? (
            <div>
              <div className="mb-1 text-jm-xs text-[var(--jm-text-muted)]">부품</div>
              <ul className="space-y-1 text-jm-sm text-[var(--jm-text)]">
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
              <div className="mb-1 text-jm-xs text-[var(--jm-text-muted)]">공임</div>
              <ul className="space-y-1 text-jm-sm text-[var(--jm-text)]">
                {data.labors.map((l, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{l.name} ({l.hours}h)</span>
                    <span>₩{l.totalPrice.toLocaleString("ko-KR")}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="border-t border-[var(--jm-border)] pt-3">
            <div className="flex justify-between text-jm-sm text-[var(--jm-text)]">
              <span>부품</span>
              <span>₩{data.quotedPartsAmount.toLocaleString("ko-KR")}</span>
            </div>
            <div className="flex justify-between text-jm-sm text-[var(--jm-text)]">
              <span>공임</span>
              <span>₩{data.quotedLaborAmount.toLocaleString("ko-KR")}</span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-jm-base font-medium text-[var(--jm-text)]">총액</span>
              <span className="text-jm-2xl font-semibold text-[var(--jm-text)]">
                ₩{data.quotedTotalAmount.toLocaleString("ko-KR")}
              </span>
            </div>
          </div>
        </JmCard>

        <JmCard className="mt-5 space-y-3 p-5">
          <label className="block text-jm-sm font-medium text-[var(--jm-text)]">승인자 이름 (선택)</label>
          <JmInput
            size="lg"
            value={approvedName}
            onChange={(e) => setApprovedName(e.target.value)}
            placeholder="본인 이름"
          />
          <JmButton
            variant="cta"
            size="lg"
            onClick={approve}
            disabled={submitting}
            className="w-full"
          >
            {submitting ? (
              <>
                <Loader2 className="animate-spin" />
                처리 중...
              </>
            ) : (
              "견적 승인"
            )}
          </JmButton>
          <p className="text-center text-jm-xs text-[var(--jm-text-muted)]">승인 후 수리에 착수됩니다.</p>
        </JmCard>
      </div>
    </JmScope>
  );
}
