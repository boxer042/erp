"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, Loader2, Package, Wrench } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError, apiMutate } from "@/lib/api-client";

export interface LabelCandidate {
  code: string; // dryRun 일 때는 "(미발번)"
  productId: string | null;
  displayName: string;
  source: "SALE" | "REPAIR";
  repairTicketId: string | null;
  newlyIssued: boolean;
}

interface LabelIssueRequestBody {
  customerId: string | null;
  productItems: { productId: string; quantity: number }[];
  repairTicketIds: string[];
  skipRepairTicketIds?: string[];
  dryRun?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 발번 요청 파라미터 */
  request: LabelIssueRequestBody;
  /** 발번 성공 시 호출 — 출력 가능한 모든 코드 리스트 (재출력 + 신규) */
  onIssued: (codes: string[]) => void;
}

/**
 * 라벨 발번 다이얼로그.
 * - 열릴 때 dryRun 으로 후보 분석 → 사용자에게 표시
 * - 수리 항목 중 기존 라벨 있는 건 "재출력" 디폴트 체크 / 해제하면 skip
 * - 신규 발번 항목은 항상 출력 (스킵 불가, 발번하지 않으면 의미 없음)
 * - 출력 누르면 실제 발번 → 모든 출력 코드 onIssued 로 전달
 */
export function LabelIssueDialog({
  open,
  onOpenChange,
  request,
  onIssued,
}: Props) {
  const [candidates, setCandidates] = useState<LabelCandidate[] | null>(null);
  const [skipTicketIds, setSkipTicketIds] = useState<Set<string>>(new Set());

  // 다이얼로그 열릴 때 dryRun 호출
  const previewMutation = useMutation<{ labels: LabelCandidate[] }, Error>({
    mutationFn: () =>
      apiMutate<{ labels: LabelCandidate[] }>("/api/serial-items/issue", "POST", {
        ...request,
        dryRun: true,
      }),
    onSuccess: (data) => {
      setCandidates(data.labels);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : err.message || "라벨 분석 실패"),
  });

  useEffect(() => {
    if (open) {
      setCandidates(null);
      setSkipTicketIds(new Set());
      previewMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const issueMutation = useMutation<{ labels: LabelCandidate[] }, Error>({
    mutationFn: () =>
      apiMutate<{ labels: LabelCandidate[] }>("/api/serial-items/issue", "POST", {
        ...request,
        skipRepairTicketIds: Array.from(skipTicketIds),
      }),
    onSuccess: (data) => {
      const codes = data.labels.map((l) => l.code);
      if (codes.length === 0) {
        toast.warning("출력할 라벨이 없습니다");
        onOpenChange(false);
        return;
      }
      onIssued(codes);
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : err.message || "라벨 발번 실패"),
  });

  const grouped = useMemo(() => {
    if (!candidates) return { sale: [], repairExisting: [], repairNew: [] };
    return {
      sale: candidates.filter((c) => c.source === "SALE"),
      repairExisting: candidates.filter(
        (c) => c.source === "REPAIR" && !c.newlyIssued,
      ),
      repairNew: candidates.filter(
        (c) => c.source === "REPAIR" && c.newlyIssued,
      ),
    };
  }, [candidates]);

  const toggleSkip = (ticketId: string | null) => {
    if (!ticketId) return;
    setSkipTicketIds((prev) => {
      const next = new Set(prev);
      if (next.has(ticketId)) next.delete(ticketId);
      else next.add(ticketId);
      return next;
    });
  };

  const totalToPrint =
    grouped.sale.length +
    grouped.repairExisting.filter(
      (c) => c.repairTicketId && !skipTicketIds.has(c.repairTicketId),
    ).length +
    grouped.repairNew.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>라벨 발번 / 출력</DialogTitle>
          <DialogDescription>
            카트 항목별 라벨을 확인하세요. 기존 라벨이 있는 수리 항목은 재출력 여부를 선택할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto py-2">
          {previewMutation.isPending || !candidates ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              분석 중...
            </div>
          ) : candidates.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
              <AlertCircle className="size-5" />
              발번 가능한 라벨이 없습니다
              <span className="text-xs">개별추적 상품이나 기기 정보가 채워진 수리가 필요합니다</span>
            </div>
          ) : (
            <>
              {grouped.sale.length > 0 && (
                <Section
                  title="상품 라벨 (신규 발번)"
                  icon={<Package className="size-3.5" />}
                  count={grouped.sale.length}
                >
                  {grouped.sale.map((c, i) => (
                    <Row key={`sale-${i}`} icon="new">
                      <span className="text-sm">{c.displayName}</span>
                    </Row>
                  ))}
                </Section>
              )}

              {grouped.repairNew.length > 0 && (
                <Section
                  title="수리 라벨 (신규 발번)"
                  icon={<Wrench className="size-3.5" />}
                  count={grouped.repairNew.length}
                >
                  {grouped.repairNew.map((c) => (
                    <Row key={c.repairTicketId ?? c.displayName} icon="new">
                      <span className="text-sm">{c.displayName}</span>
                    </Row>
                  ))}
                </Section>
              )}

              {grouped.repairExisting.length > 0 && (
                <Section
                  title="기존 수리 라벨 (재출력 선택)"
                  icon={<Wrench className="size-3.5" />}
                  count={grouped.repairExisting.length}
                >
                  {grouped.repairExisting.map((c) => {
                    const ticketId = c.repairTicketId!;
                    const willPrint = !skipTicketIds.has(ticketId);
                    return (
                      <label
                        key={ticketId}
                        className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card p-2 text-sm"
                      >
                        <Checkbox
                          checked={willPrint}
                          onCheckedChange={() => toggleSkip(ticketId)}
                        />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="line-clamp-1">{c.displayName}</span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {c.code}
                          </span>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {willPrint ? "재출력" : "건너뜀"}
                        </span>
                      </label>
                    );
                  })}
                </Section>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={issueMutation.isPending}
          >
            취소
          </Button>
          <Button
            onClick={() => issueMutation.mutate()}
            disabled={
              previewMutation.isPending ||
              !candidates ||
              candidates.length === 0 ||
              totalToPrint === 0 ||
              issueMutation.isPending
            }
          >
            {issueMutation.isPending && (
              <Loader2 className="size-4 animate-spin" />
            )}
            {totalToPrint}장 발번 / 출력
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        {icon}
        <span>{title}</span>
        <Badge variant="outline" className="text-[10px]">
          {count}
        </Badge>
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

function Row({
  icon,
  children,
}: {
  icon: "new" | "existing";
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card p-2">
      <Badge variant={icon === "new" ? "default" : "secondary"} className="text-[10px]">
        {icon === "new" ? "신규" : "기존"}
      </Badge>
      {children}
    </div>
  );
}
