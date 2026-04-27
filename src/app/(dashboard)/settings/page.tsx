"use client";

import { useEffect, useState } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Package, Store, Truck, ShoppingCart, Warehouse, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

interface Stats {
  products: number;
  suppliers: number;
  channels: number;
  orders: number;
  inventoryItems: number;
}

interface CardFeeRateRecord {
  id: string;
  rate: string;
  memo: string | null;
  appliedFrom: string;
  createdAt: string;
}

interface CardFeeRateData {
  current: CardFeeRateRecord | null;
  history: CardFeeRateRecord[];
}

export default function SettingsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [cardFee, setCardFee] = useState<CardFeeRateData | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ rate: "", appliedFrom: "", memo: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/products").then((r) => r.json()),
      fetch("/api/suppliers").then((r) => r.json()),
      fetch("/api/channels").then((r) => r.json()),
      fetch("/api/orders").then((r) => r.json()),
    ]).then(([p, s, c, o]) => {
      setStats({
        products: p.length,
        suppliers: s.length,
        channels: c.length,
        orders: o.length,
        inventoryItems: p.filter((x: { inventory?: unknown }) => x.inventory).length,
      });
    });

    fetchCardFeeRate();
  }, []);

  const fetchCardFeeRate = () => {
    fetch("/api/card-fee-rate")
      .then((r) => r.json())
      .then(setCardFee);
  };

  const handleSubmit = async () => {
    if (!form.rate || !form.appliedFrom) {
      toast.error("수수료율과 적용 시작일을 입력하세요");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/card-fee-rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rate: String(parseFloat(form.rate) / 100),
          appliedFrom: form.appliedFrom,
          memo: form.memo,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "저장에 실패했습니다");
        return;
      }
      toast.success("카드수수료율이 등록되었습니다");
      setForm({ rate: "", appliedFrom: "", memo: "" });
      setShowForm(false);
      fetchCardFeeRate();
    } finally {
      setSubmitting(false);
    }
  };

  const fmtDate = (s: string) => format(new Date(s), "yyyy-MM-dd", { locale: ko });
  const fmtRate = (r: string) => `${(parseFloat(r) * 100).toFixed(2)}%`;

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-lg font-semibold">설정</h2>

      <Card>
        <CardHeader>
          <CardTitle>시스템 정보</CardTitle>
          <CardDescription>JAEWOOMADE ERP 현황</CardDescription>
        </CardHeader>
        <CardContent>
          {stats ? (
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" /> 등록 상품
                  </TableCell>
                  <TableCell className="text-right font-medium">{stats.products}개</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-muted-foreground" /> 거래처
                  </TableCell>
                  <TableCell className="text-right font-medium">{stats.suppliers}개</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="flex items-center gap-2">
                    <Store className="h-4 w-4 text-muted-foreground" /> 판매 채널
                  </TableCell>
                  <TableCell className="text-right font-medium">{stats.channels}개</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-muted-foreground" /> 총 주문
                  </TableCell>
                  <TableCell className="text-right font-medium">{stats.orders}건</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="flex items-center gap-2">
                    <Warehouse className="h-4 w-4 text-muted-foreground" /> 재고 품목
                  </TableCell>
                  <TableCell className="text-right font-medium">{stats.inventoryItems}개</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground">로딩 중...</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>기본 설정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">기본 세율</span>
            <Badge variant="outline">10%</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">기본 통화</span>
            <Badge variant="outline">KRW (원)</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">기본 단위</span>
            <Badge variant="outline">EA (개)</Badge>
          </div>
        </CardContent>
      </Card>

      {/* 카드수수료 관리 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>카드수수료</CardTitle>
            <CardDescription>오프라인 판매 기준 평균 카드수수료율</CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-[13px] gap-1.5"
            onClick={() => setShowForm((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5" />
            새 수수료율 등록
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 현재 적용 수수료율 */}
          {cardFee?.current ? (
            <div className="rounded-lg border border-border bg-card px-4 py-3 space-y-2 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">현재 적용 수수료율</span>
                <span className="text-xl font-bold text-primary">{fmtRate(cardFee.current.rate)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">적용 시작일</span>
                <span>{fmtDate(cardFee.current.appliedFrom)}</span>
              </div>
              {cardFee.current.memo && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">메모</span>
                  <span>{cardFee.current.memo}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">등록된 카드수수료율이 없습니다.</p>
          )}

          {/* 등록 폼 */}
          {showForm && (
            <div className="rounded-lg border border-border bg-card px-4 py-3 space-y-3 text-[13px]">
              <p className="font-medium">새 수수료율 등록</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">수수료율 (%)</label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="예: 3.20"
                    value={form.rate}
                    onChange={(e) => setForm((p) => ({ ...p, rate: e.target.value }))}
                    className="h-8 text-[13px]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">적용 시작일</label>
                  <Input
                    type="date"
                    value={form.appliedFrom}
                    onChange={(e) => setForm((p) => ({ ...p, appliedFrom: e.target.value }))}
                    className="h-8 text-[13px]"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">메모 (선택)</label>
                <Input
                  placeholder="예: 2025년 상반기"
                  value={form.memo}
                  onChange={(e) => setForm((p) => ({ ...p, memo: e.target.value }))}
                  className="h-8 text-[13px]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={() => setShowForm(false)}>취소</Button>
                <Button size="sm" className="h-8 text-[13px]" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? "저장 중..." : "저장"}
                </Button>
              </div>
            </div>
          )}

          {/* 이력 */}
          {cardFee && cardFee.history.length > 1 && (
            <div>
              <button
                type="button"
                className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowHistory((v) => !v)}
              >
                {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                이전 이력 ({cardFee.history.length - 1}건)
              </button>
              {showHistory && (
                <div className="mt-2 rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-muted text-muted-foreground">
                        <th className="px-3 py-2 text-left font-medium border-b border-border">수수료율</th>
                        <th className="px-3 py-2 text-left font-medium border-b border-border">적용 시작일</th>
                        <th className="px-3 py-2 text-left font-medium border-b border-border">메모</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cardFee.history.slice(1).map((r) => (
                        <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                          <td className="px-3 py-2 tabular-nums">{fmtRate(r.rate)}</td>
                          <td className="px-3 py-2">{fmtDate(r.appliedFrom)}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.memo ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
