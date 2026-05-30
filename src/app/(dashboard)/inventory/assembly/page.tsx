"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, Package, Plus, RefreshCw, Undo2 } from "lucide-react";
import {
  JmBadge,
  JmButton,
  JmCard,
  JmDialog,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmDialogDescription,
  JmEmpty,
  JmIconButton,
  JmSpinner,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
  JmTableToolbar,
  JmTableToolbarActions,
  JmSkeleton,
  JmTextarea,
} from "@/jm";
import { AssemblyRegisterSheet } from "@/components/assembly/assembly-register-sheet";
import { AssemblyDetailSheet } from "@/components/assembly/assembly-detail-sheet";

function AssembliesSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <JmTableRow key={i}>
          <JmTableCell><JmSkeleton className="h-4 w-24" /></JmTableCell>
          <JmTableCell>
            <div className="flex flex-col gap-1">
              <JmSkeleton className="h-4 w-40" />
              <JmSkeleton className="h-3 w-20" />
            </div>
          </JmTableCell>
          <JmTableCell className="text-right">
            <div className="flex justify-end"><JmSkeleton className="h-4 w-12" /></div>
          </JmTableCell>
          <JmTableCell><JmSkeleton className="h-5 w-12 rounded-md" /></JmTableCell>
          <JmTableCell className="text-right">
            <div className="flex justify-end"><JmSkeleton className="h-4 w-16" /></div>
          </JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-20" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-32" /></JmTableCell>
          <JmTableCell className="text-right">
            <div className="flex justify-end"><JmSkeleton className="h-7 w-16 rounded-md" /></div>
          </JmTableCell>
        </JmTableRow>
      ))}
    </>
  );
}

interface AssemblyRow {
  id: string;
  assemblyNo: string;
  productId: string;
  product: { id: string; name: string; sku: string };
  quantity: string;
  type: "PRODUCE" | "DISASSEMBLE";
  laborCost: string | null;
  assembledAt: string;
  memo: string | null;
  reverseOfId: string | null;
  _count: { consumptions: number };
}

export default function AssemblyPage() {
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [initialProductId, setInitialProductId] = useState<string | undefined>(undefined);

  // 역조립 다이얼로그
  const [disOpen, setDisOpen] = useState(false);
  const [disTarget, setDisTarget] = useState<AssemblyRow | null>(null);
  const [disReason, setDisReason] = useState("");

  // 상세 Sheet
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const assembliesQuery = useQuery({
    queryKey: queryKeys.assembly.list(),
    queryFn: () => apiGet<AssemblyRow[]>("/api/assemblies"),
  });
  const rows = assembliesQuery.data ?? [];
  const loading = assembliesQuery.isPending;
  const fetchAssemblies = () => queryClient.invalidateQueries({ queryKey: queryKeys.assembly.all });

  // ?productId=X 쿼리로 진입 → 자동으로 sheet 열기 (한 번만)
  const searchParams = useSearchParams();
  const autoTriggeredRef = useRef(false);
  useEffect(() => {
    const pid = searchParams.get("productId");
    if (!pid || autoTriggeredRef.current) return;
    autoTriggeredRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 의도된 동기화/리셋 이펙트 (서버데이터→편집폼 seed / 닫힐때 리셋 / URL prefill 등). 파생값 아님
    setInitialProductId(pid);
    setSheetOpen(true);
  }, [searchParams]);

  const openRegister = () => {
    setInitialProductId(undefined);
    setSheetOpen(true);
  };

  const disassembleMutation = useMutation({
    mutationFn: () => {
      if (!disTarget) throw new Error("대상이 없습니다");
      const reason = disReason.trim();
      if (!reason) throw new Error("역조립 사유를 입력해주세요");
      return apiMutate(`/api/assemblies/${disTarget.id}/disassemble`, "POST", { memo: reason });
    },
    onSuccess: () => {
      toast.success("역조립이 완료되었습니다");
      setDisOpen(false);
      setDisTarget(null);
      setDisReason("");
      fetchAssemblies();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : err.message || "역조립 실패"),
  });
  const disSubmitting = disassembleMutation.isPending;
  const confirmDisassemble = () => disassembleMutation.mutate();

  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="flex w-full flex-col gap-6 p-4">
        <JmCard className="overflow-hidden p-0">
          <JmTableToolbar>
            <JmTableToolbarActions>
              <JmIconButton
                variant="ghost"
                size="sm"
                aria-label="새로고침"
                onClick={fetchAssemblies}
                disabled={assembliesQuery.isFetching}
              >
                {assembliesQuery.isFetching ? (
                  <JmSpinner size="sm" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
              </JmIconButton>
              <JmButton size="sm" onClick={openRegister}>
                <Plus className="size-4" />
                조립 실적 등록
              </JmButton>
            </JmTableToolbarActions>
          </JmTableToolbar>

          <JmTable>
            <JmTableHeader>
              <JmTableRow>
                <JmTableHead>조립번호</JmTableHead>
                <JmTableHead>조립상품</JmTableHead>
                <JmTableHead className="text-right">수량</JmTableHead>
                <JmTableHead>유형</JmTableHead>
                <JmTableHead className="text-right">조립비</JmTableHead>
                <JmTableHead>조립일</JmTableHead>
                <JmTableHead>메모</JmTableHead>
                <JmTableHead className="w-28"></JmTableHead>
              </JmTableRow>
            </JmTableHeader>
            <JmTableBody>
              {loading ? (
                <AssembliesSkeletonRows />
              ) : rows.length === 0 ? (
                <JmTableRow className="hover:bg-transparent">
                  <JmTableCell colSpan={8} className="py-12">
                    <JmEmpty
                      icon={<Package className="size-8" />}
                      title="등록된 조립 실적이 없습니다"
                      description="조립 실적을 등록하면 완제품 재고가 늘고 구성품 재고가 차감됩니다"
                    />
                  </JmTableCell>
                </JmTableRow>
              ) : (
              rows.map((r) => (
                <JmTableRow key={r.id}>
                  <JmTableCell className="font-mono text-jm-xs">
                    <button
                      type="button"
                      className="text-[var(--jm-accent-fg)] hover:underline cursor-pointer"
                      onClick={() => {
                        setDetailId(r.id);
                        setDetailOpen(true);
                      }}
                    >
                      {r.assemblyNo}
                    </button>
                  </JmTableCell>
                  <JmTableCell>
                    <div className="flex flex-col">
                      <span>{r.product.name}</span>
                      <span className="text-jm-xs text-[var(--jm-text-muted)]">{r.product.sku}</span>
                    </div>
                  </JmTableCell>
                  <JmTableCell className="text-right">
                    {Number(r.quantity).toLocaleString("ko-KR")}
                  </JmTableCell>
                  <JmTableCell>
                    {r.type === "PRODUCE" ? (
                      <JmBadge variant="solid">조립</JmBadge>
                    ) : (
                      <JmBadge variant="danger">역조립</JmBadge>
                    )}
                  </JmTableCell>
                  <JmTableCell className="text-right">
                    {r.laborCost
                      ? `₩${Number(r.laborCost).toLocaleString("ko-KR")}`
                      : "-"}
                  </JmTableCell>
                  <JmTableCell>{format(new Date(r.assembledAt), "yyyy-MM-dd")}</JmTableCell>
                  <JmTableCell className="max-w-xs truncate">{r.memo ?? "-"}</JmTableCell>
                  <JmTableCell className="text-right">
                    {r.type === "PRODUCE" && (
                      <JmButton
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          setDisTarget(r);
                          setDisOpen(true);
                        }}
                      >
                        <Undo2 />
                        역조립
                      </JmButton>
                    )}
                  </JmTableCell>
                </JmTableRow>
              ))
            )}
            </JmTableBody>
          </JmTable>
        </JmCard>
      </div>

      <AssemblyRegisterSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        initialProductId={initialProductId}
        onSuccess={fetchAssemblies}
      />

      <AssemblyDetailSheet
        assemblyId={detailId}
        open={detailOpen}
        onOpenChange={(o) => {
          setDetailOpen(o);
          if (!o) setDetailId(null);
        }}
      />

      <JmDialog
        open={disOpen}
        onOpenChange={(o) => {
          setDisOpen(o);
          if (!o) {
            setDisTarget(null);
            setDisReason("");
          }
        }}
      >
        <JmDialogContent>
          <JmDialogHeader>
            <JmDialogTitle>역조립 확인</JmDialogTitle>
            <JmDialogDescription>
              {disTarget && (
                <>
                  <span className="block">
                    조립번호 {disTarget.assemblyNo} 을(를) 역조립하면 완제품 재고가
                    차감되고 구성품 재고가 원래 로트로 복원됩니다.
                  </span>
                </>
              )}
            </JmDialogDescription>
          </JmDialogHeader>
          <div className="space-y-2 px-5 py-2">
            <label className="text-jm-sm font-medium text-[var(--jm-text)]">
              역조립 사유 <span className="text-[var(--jm-danger-fg)]">*</span>
            </label>
            <JmTextarea
              value={disReason}
              onChange={(e) => setDisReason(e.target.value)}
              placeholder="예: 부품 오선택, 수량 입력 오류 등"
              rows={3}
              autoFocus
            />
          </div>
          <JmDialogFooter>
            <JmButton variant="outline" onClick={() => setDisOpen(false)}>
              취소
            </JmButton>
            <JmButton
              variant="danger"
              onClick={confirmDisassemble}
              disabled={disSubmitting || !disReason.trim()}
            >
              {disSubmitting ? <Loader2 className="animate-spin" /> : null}
              역조립
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>
    </div>
  );
}
