"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { AssemblyRegisterSheet } from "@/components/assembly/assembly-register-sheet";

function AssembliesSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell>
            <div className="flex flex-col gap-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-20" />
            </div>
          </TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end"><Skeleton className="h-4 w-12" /></div>
          </TableCell>
          <TableCell><Skeleton className="h-5 w-12 rounded-md" /></TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end"><Skeleton className="h-4 w-16" /></div>
          </TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end"><Skeleton className="h-7 w-16 rounded-md" /></div>
          </TableCell>
        </TableRow>
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
  const [rows, setRows] = useState<AssemblyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [initialProductId, setInitialProductId] = useState<string | undefined>(undefined);

  // 역조립 다이얼로그
  const [disOpen, setDisOpen] = useState(false);
  const [disTarget, setDisTarget] = useState<AssemblyRow | null>(null);
  const [disSubmitting, setDisSubmitting] = useState(false);

  const fetchAssemblies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/assemblies");
      if (res.ok) setRows(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssemblies();
  }, [fetchAssemblies]);

  // ?productId=X 쿼리로 진입 → 자동으로 sheet 열기 (한 번만)
  const searchParams = useSearchParams();
  const autoTriggeredRef = useRef(false);
  useEffect(() => {
    const pid = searchParams.get("productId");
    if (!pid || autoTriggeredRef.current) return;
    autoTriggeredRef.current = true;
    setInitialProductId(pid);
    setSheetOpen(true);
  }, [searchParams]);

  const openRegister = () => {
    setInitialProductId(undefined);
    setSheetOpen(true);
  };

  const confirmDisassemble = async () => {
    if (!disTarget) return;
    setDisSubmitting(true);
    try {
      const res = await fetch(`/api/assemblies/${disTarget.id}/disassemble`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        toast.error(typeof err.error === "string" ? err.error : "역조립 실패");
        return;
      }
      toast.success("역조립이 완료되었습니다");
      setDisOpen(false);
      setDisTarget(null);
      fetchAssemblies();
    } finally {
      setDisSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <DataTableToolbar
        onRefresh={fetchAssemblies}
        onAdd={openRegister}
        addLabel="조립 실적 등록"
        loading={loading}
      />

      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>조립번호</TableHead>
              <TableHead>조립상품</TableHead>
              <TableHead className="text-right">수량</TableHead>
              <TableHead>유형</TableHead>
              <TableHead className="text-right">조립비</TableHead>
              <TableHead>조립일</TableHead>
              <TableHead>메모</TableHead>
              <TableHead className="w-28"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <AssembliesSkeletonRows />
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  등록된 조립 실적이 없습니다
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.assemblyNo}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{r.product.name}</span>
                      <span className="text-xs text-muted-foreground">{r.product.sku}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {Number(r.quantity).toLocaleString("ko-KR")}
                  </TableCell>
                  <TableCell>
                    {r.type === "PRODUCE" ? (
                      <Badge variant="default">조립</Badge>
                    ) : (
                      <Badge variant="destructive">역조립</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.laborCost
                      ? `₩${Number(r.laborCost).toLocaleString("ko-KR")}`
                      : "-"}
                  </TableCell>
                  <TableCell>{format(new Date(r.assembledAt), "yyyy-MM-dd")}</TableCell>
                  <TableCell className="max-w-xs truncate">{r.memo ?? "-"}</TableCell>
                  <TableCell className="text-right">
                    {r.type === "PRODUCE" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[12px]"
                        onClick={() => {
                          setDisTarget(r);
                          setDisOpen(true);
                        }}
                      >
                        <Undo2 data-icon="inline-start" />
                        역조립
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AssemblyRegisterSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        initialProductId={initialProductId}
        onSuccess={fetchAssemblies}
      />

      <Dialog open={disOpen} onOpenChange={setDisOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>역조립 확인</DialogTitle>
            <DialogDescription>
              {disTarget && (
                <>
                  <span className="block">
                    조립번호 {disTarget.assemblyNo} 을(를) 역조립하면 완제품 재고가
                    차감되고 구성품 재고가 원래 로트로 복원됩니다.
                  </span>
                  <span className="block mt-2 font-medium">진행하시겠습니까?</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisOpen(false)}>
              취소
            </Button>
            <Button variant="destructive" onClick={confirmDisassemble} disabled={disSubmitting}>
              {disSubmitting ? <Loader2 className="animate-spin" /> : null}
              역조립
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
