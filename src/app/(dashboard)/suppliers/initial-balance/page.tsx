"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Loader2, Check } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { SupplierCombobox } from "@/components/supplier-combobox";
import { formatComma, parseComma } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

function InitialBalanceHistorySkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-5 w-12 rounded-md" /></TableCell>
          <TableCell><div className="flex justify-end"><Skeleton className="h-4 w-24" /></div></TableCell>
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

interface Supplier {
  id: string;
  name: string;
  businessNumber?: string | null;
  paymentMethod?: string;
}

interface EntryForm {
  supplierId: string;
  supplierName: string;
  amount: string;
  date: string;
  memo: string;
}

interface HistoryItem {
  id: string;
  date: string;
  debitAmount: string;
  creditAmount: string;
  balance: string;
  description: string;
  createdAt: string;
  supplier: { id: string; name: string; paymentMethod: string };
}

function emptyRow(): EntryForm {
  const today = new Date().toISOString().slice(0, 10);
  return { supplierId: "", supplierName: "", amount: "", date: today, memo: "" };
}

export default function InitialBalancePage() {
  const [tab, setTab] = useState<"register" | "history">("register");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [entries, setEntries] = useState<EntryForm[]>([emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [duplicateIds, setDuplicateIds] = useState<Set<string>>(new Set());

  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchSuppliers = useCallback(async () => {
    const res = await fetch("/api/suppliers");
    if (res.ok) setSuppliers(await res.json());
  }, []);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    const res = await fetch("/api/suppliers/initial-balance");
    if (res.ok) setHistoryItems(await res.json());
    setHistoryLoading(false);
  }, []);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);
  useEffect(() => { if (tab === "history") fetchHistory(); }, [tab, fetchHistory]);

  const setEntry = (idx: number, updates: Partial<EntryForm>) => {
    setEntries((prev) => prev.map((e, i) => i === idx ? { ...e, ...updates } : e));
    if (updates.supplierId === undefined) return;
    const row = entries[idx];
    if (row?.supplierId && duplicateIds.has(row.supplierId)) {
      setDuplicateIds((prev) => {
        const next = new Set(prev);
        next.delete(row.supplierId);
        return next;
      });
    }
  };

  const addRow = () => setEntries((prev) => [...prev, emptyRow()]);

  const removeRow = (idx: number) => {
    const row = entries[idx];
    if (row?.supplierId && duplicateIds.has(row.supplierId)) {
      setDuplicateIds((prev) => {
        const next = new Set(prev);
        next.delete(row.supplierId);
        return next;
      });
    }
    setEntries((prev) => prev.filter((_, i) => i !== idx));
  };

  const validEntries = entries.filter((e) => e.supplierId && parseFloat(e.amount || "0") > 0);
  const totalAmount = validEntries.reduce((s, e) => s + parseFloat(e.amount || "0"), 0);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload = validEntries.map((e) => ({
        supplierId: e.supplierId,
        amount: e.amount,
        date: e.date || undefined,
        memo: e.memo || undefined,
      }));

      if (payload.length === 0) {
        toast.error("등록할 항목이 없습니다");
        return;
      }

      const res = await fetch("/api/suppliers/initial-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: payload }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        if (res.status === 409 && Array.isArray(err?.duplicates)) {
          const ids = new Set<string>(err.duplicates.map((d: { supplierId: string }) => d.supplierId));
          setDuplicateIds(ids);
          setConfirmOpen(false);
          toast.error(`${err.duplicates.length}건 중복 — 강조된 행을 제거해주세요`);
          return;
        }
        toast.error(typeof err?.error === "string" ? err.error : "등록 실패");
        return;
      }

      const result = await res.json();
      toast.success(`기초 미지급금 ${result.count}건 등록 완료`);
      setConfirmOpen(false);
      setDuplicateIds(new Set());
      setEntries([emptyRow()]);
    } catch {
      toast.error("오류가 발생했습니다");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex h-full flex-col gap-0">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-2.5">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium">기초 미지급금</h2>
            <TabsList className="h-[30px] text-[13px]">
              <TabsTrigger value="register">등록</TabsTrigger>
              <TabsTrigger value="history">이력</TabsTrigger>
            </TabsList>
          </div>
          <div className="flex items-center gap-2">
            {tab === "register" && validEntries.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {validEntries.length}건 · ₩{formatComma(String(Math.round(totalAmount)))}
              </span>
            )}
            {tab === "register" && (
              <Button
                size="sm"
                className="h-[30px] text-[13px]"
                disabled={validEntries.length === 0 || submitting}
                onClick={() => setConfirmOpen(true)}
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
                일괄 등록
              </Button>
            )}
          </div>
        </div>

        <TabsContent value="register" className="flex-1 mt-0">
          <ScrollArea className="h-full">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-muted-foreground text-xs">
                  <th className="border-r border-b border-border w-[36px] py-2 text-center font-medium">#</th>
                  <th className="border-r border-b border-border py-2 px-2 text-left font-medium" style={{ width: "30%" }}>거래처</th>
                  <th className="border-r border-b border-border w-[170px] py-2 text-center font-medium">
                    기초 잔액
                    <span className="ml-1 text-[10px] text-muted-foreground font-normal">(VAT 포함 총액)</span>
                  </th>
                  <th className="border-r border-b border-border w-[140px] py-2 text-center font-medium">기준일</th>
                  <th className="border-b border-border py-2 px-2 text-center font-medium">메모</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, idx) => {
                  const isDuplicate = entry.supplierId && duplicateIds.has(entry.supplierId);
                  return (
                    <tr key={`row-${idx}`} className={`group border-b border-border ${isDuplicate ? "bg-destructive/20 hover:bg-destructive/30" : "hover:bg-muted/50"}`}>
                      <td className="border-r border-border text-center text-muted-foreground py-1">{idx + 1}</td>
                      <td className="border-r border-border px-1 py-0.5">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 min-w-0">
                            <SupplierCombobox
                              suppliers={suppliers}
                              value={entry.supplierId}
                              onChange={(id, name) => setEntry(idx, { supplierId: id, supplierName: name })}
                              onCreateNew={() => toast.info("거래처는 '거래처' 메뉴에서 등록하세요")}
                              placeholder="거래처 선택..."
                            />
                          </div>
                          {isDuplicate && (
                            <Badge variant="destructive" className="text-[10px] shrink-0">이미 등록됨</Badge>
                          )}
                        </div>
                      </td>
                      <td className="border-r border-border p-0.5">
                        <input
                          value={formatComma(entry.amount)}
                          onChange={(e) => setEntry(idx, { amount: parseComma(e.target.value) })}
                          onFocus={(e) => e.currentTarget.select()}
                          inputMode="numeric"
                          className="w-full h-7 bg-transparent text-right text-sm px-2 outline-none focus:bg-muted rounded"
                        />
                      </td>
                      <td className="border-r border-border p-0.5">
                        <input
                          type="date"
                          value={entry.date}
                          onChange={(e) => setEntry(idx, { date: e.target.value })}
                          className="w-full h-7 bg-transparent text-sm px-2 outline-none focus:bg-muted rounded"
                        />
                      </td>
                      <td className="p-0.5">
                        <div className="flex items-center gap-0.5">
                          <input
                            value={entry.memo}
                            onChange={(e) => setEntry(idx, { memo: e.target.value })}
                            className="flex-1 h-7 bg-transparent text-sm px-2 outline-none focus:bg-muted rounded"
                          />
                          <button
                            className="h-7 w-7 flex items-center justify-center rounded hover:bg-secondary shrink-0"
                            onClick={() => removeRow(idx)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-border px-3 py-2">
              <button
                className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                onClick={addRow}
              >
                <Plus className="size-4" />행 추가
              </button>
              <div className="text-sm text-muted-foreground">
                합계: <span className="font-medium text-foreground">₩{Math.round(totalAmount).toLocaleString("ko-KR")}</span>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="history" className="flex-1 mt-0">
          <ScrollArea className="h-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>등록일</TableHead>
                  <TableHead>거래처</TableHead>
                  <TableHead>결제방식</TableHead>
                  <TableHead className="text-right">기초 잔액 (VAT 포함)</TableHead>
                  <TableHead>설명</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyLoading ? (
                  <InitialBalanceHistorySkeletonRows />
                ) : historyItems.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">기초 미지급금 이력이 없습니다</TableCell></TableRow>
                ) : (
                  historyItems.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-muted-foreground">
                        {new Date(h.date).toLocaleDateString("ko-KR")}
                      </TableCell>
                      <TableCell className="font-medium">{h.supplier.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {h.supplier.paymentMethod === "CREDIT" ? "외상" : "선결제"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        ₩{Math.round(parseFloat(h.debitAmount)).toLocaleString("ko-KR")}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{h.description}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>기초 미지급금 등록 확인</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              <strong>{validEntries.length}건</strong>의 기초 미지급금을 등록합니다.
            </p>
            <p className="text-muted-foreground">
              총액: <strong>₩{Math.round(totalAmount).toLocaleString("ko-KR")}</strong>
            </p>
            <div className="rounded-md bg-card border border-border p-3 text-xs text-muted-foreground space-y-1">
              <p>· <strong>금액은 VAT 포함 총액</strong> (실제 지급해야 할 미수 금액)</p>
              <p>· 각 거래처의 거래원장에 ADJUSTMENT 1건이 기록됩니다</p>
              <p>· 1회성 작업입니다. 동일 거래처에 이미 기초 미지급금이 있으면 거부됩니다</p>
              <p>· 재고에는 영향이 없습니다</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>취소</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              등록
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
