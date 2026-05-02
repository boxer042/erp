"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { formatComma, parseComma } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface ExtraItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

interface LinkedOrder {
  id: string;
  orderNo: string;
  totalAmount: string;
  paymentMethod: string | null;
  status: string;
  createdAt: string;
}

interface Rental {
  id: string;
  rentalNo: string;
  status: string;
  startDate: string;
  endDate: string;
  actualReturnedAt: string | null;
  rateType: string;
  unitRate: string;
  totalUnits: number;
  rentalAmount: string;
  depositAmount: string;
  depositReturned: boolean;
  overdueAmount: string;
  finalAmount: string;
  paymentMethod: string | null;
  memo: string | null;
  asset: { id: string; assetNo: string; name: string; brand: string | null };
  customer: { id: string; name: string; phone: string };
  orders: LinkedOrder[];
}

const STATUS_LABEL: Record<string, string> = {
  RESERVED: "예약",
  ACTIVE: "대여중",
  RETURNED: "반납완료",
  OVERDUE: "연체",
  CANCELLED: "취소",
};

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "현금", CARD: "카드", TRANSFER: "계좌이체", UNPAID: "외상",
};

const RETURN_PAYMENTS = ["CASH", "CARD", "TRANSFER", "UNPAID"] as const;
type ReturnPayment = typeof RETURN_PAYMENTS[number];

export default function RentalDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const queryClient = useQueryClient();

  const [extraItems, setExtraItems] = useState<ExtraItem[]>([]);
  const [extraForm, setExtraForm] = useState({ productId: "", quantity: "1", unitPrice: "0" });

  const [returnDialog, setReturnDialog] = useState(false);
  const [returnPayment, setReturnPayment] = useState<ReturnPayment>("CARD");
  const [depositReturned, setDepositReturned] = useState(false);
  const [doingReturn, setDoingReturn] = useState(false);

  const rentalQuery = useQuery({
    queryKey: queryKeys.rentals.detail(id),
    queryFn: () => apiGet<Rental>(`/api/rentals/${id}`),
    enabled: !!id,
  });
  const rental = rentalQuery.data ?? null;
  const loading = rentalQuery.isPending;
  const load = () => queryClient.invalidateQueries({ queryKey: queryKeys.rentals.detail(id) });

  type ProductLite = { id: string; name: string; sku: string; sellingPrice: string };
  const productsQuery = useQuery({
    queryKey: queryKeys.products.list({ scope: "rental-detail" }),
    queryFn: async () => {
      const d = await apiGet<ProductLite[] | { items: ProductLite[] }>("/api/products");
      return Array.isArray(d) ? d : d.items ?? [];
    },
  });
  const products = productsQuery.data ?? [];

  if (loading || !rental) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Skeleton className="mb-4 h-5 w-24" />
        <div className="mb-6 rounded-xl border border-border bg-background p-5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-5 w-12 rounded-md" />
          </div>
          <Skeleton className="mt-3 h-4 w-48" />
        </div>
        {[
          { titleW: "w-12", lines: 2 },
          { titleW: "w-12", lines: 2 },
          { titleW: "w-12", lines: 4 },
        ].map((s, i) => (
          <div key={i} className="mb-4 rounded-xl border border-border bg-background p-5">
            <Skeleton className={`mb-3 h-4 ${s.titleW}`} />
            <div className="space-y-2">
              {Array.from({ length: s.lines }).map((_, j) => (
                <Skeleton key={j} className="h-4 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const addExtraItem = () => {
    const prod = products.find((p) => p.id === extraForm.productId);
    if (!prod) { toast.error("상품을 선택하세요"); return; }
    setExtraItems([...extraItems, {
      productId: extraForm.productId,
      name: prod.name,
      quantity: parseFloat(extraForm.quantity) || 1,
      unitPrice: parseFloat(parseComma(extraForm.unitPrice)) || 0,
    }]);
    setExtraForm({ productId: "", quantity: "1", unitPrice: "0" });
  };

  const doReturn = async () => {
    if (!rental) return;
    setDoingReturn(true);
    try {
      if (extraItems.length > 0) {
        try {
          await apiMutate("/api/pos/checkout", "POST", {
            action: "order",
            rentalId: rental.id,
            customerId: rental.customer.id,
            paymentMethod: returnPayment,
            items: extraItems.map((i) => ({
              productId: i.productId,
              name: i.name,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              discountPerUnit: 0,
            })),
          });
        } catch (err) {
          throw new Error(err instanceof ApiError ? err.message : "추가 상품 결제 실패");
        }
      }

      const data = await apiMutate<{ finalAmount: string }>(`/api/rentals/${id}/return`, "POST", {
        paymentMethod: returnPayment,
        depositReturned,
      });
      toast.success(`반납 완료 (최종 ₩${Number(data.finalAmount).toLocaleString("ko-KR")})`);
      setReturnDialog(false);
      setExtraItems([]);
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "실패");
    } finally {
      setDoingReturn(false);
    }
  };

  const daysInRange = Math.ceil(
    (new Date(rental.endDate).getTime() - new Date(rental.startDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  const extraTotal = extraItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const canReturn = ["ACTIVE", "OVERDUE", "RESERVED"].includes(rental.status);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link href="/pos/rental" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> 임대 목록
      </Link>

      <div className="mb-6 rounded-xl border border-border bg-background p-5">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{rental.rentalNo}</h1>
          <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">
            {STATUS_LABEL[rental.status]}
          </span>
        </div>
        <div className="mt-2 text-sm text-muted-foreground">
          <Link href={`/pos/customers/${rental.customer.id}`} className="hover:underline">
            {rental.customer.name}
          </Link>
          {rental.customer.phone ? <span className="ml-2">· {rental.customer.phone}</span> : null}
        </div>
      </div>

      <Section title="자산">
        <div className="text-sm">
          <div className="font-medium">{rental.asset.name}</div>
          <div className="mt-0.5 text-muted-foreground">
            {rental.asset.assetNo}
            {rental.asset.brand ? <span className="ml-2">· {rental.asset.brand}</span> : null}
          </div>
        </div>
      </Section>

      <Section title="기간">
        <div className="text-sm">
          <div>
            {new Date(rental.startDate).toLocaleDateString("ko-KR")} ~ {new Date(rental.endDate).toLocaleDateString("ko-KR")} ({daysInRange}일)
          </div>
          {rental.actualReturnedAt ? (
            <div className="mt-1 text-muted-foreground">
              실제 반납: {new Date(rental.actualReturnedAt).toLocaleString("ko-KR")}
            </div>
          ) : null}
        </div>
      </Section>

      <Section title="요금">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span>{rental.rateType === "DAILY" ? "일" : "월"} 요율 × {rental.totalUnits}{rental.rateType === "DAILY" ? "일" : "개월"}</span>
            <span>₩{Number(rental.rentalAmount).toLocaleString("ko-KR")}</span>
          </div>
          {Number(rental.overdueAmount) > 0 ? (
            <div className="flex justify-between text-destructive">
              <span>연체료</span>
              <span>₩{Number(rental.overdueAmount).toLocaleString("ko-KR")}</span>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-border pt-2 font-semibold">
            <span>최종 금액</span>
            <span className="text-lg">₩{Number(rental.finalAmount).toLocaleString("ko-KR")}</span>
          </div>
          <div className="mt-2 flex justify-between text-muted-foreground">
            <span>보증금 {rental.depositReturned ? "(환급됨)" : ""}</span>
            <span>₩{Number(rental.depositAmount).toLocaleString("ko-KR")}</span>
          </div>
          <div className="text-muted-foreground">결제수단: {rental.paymentMethod ? (PAYMENT_LABEL[rental.paymentMethod] ?? rental.paymentMethod) : "-"}</div>
        </div>
      </Section>

      {rental.memo ? (
        <Section title="메모">
          <div className="whitespace-pre-wrap text-sm">{rental.memo}</div>
        </Section>
      ) : null}

      {/* 추가 판매 상품 */}
      {canReturn ? (
        <Section title="추가 판매 상품">
          <p className="mb-3 text-xs text-muted-foreground">반납 처리 시 재고에서 차감하고 별도 판매 주문으로 저장됩니다.</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="p-2">상품명</th>
                <th className="p-2 text-right">수량</th>
                <th className="p-2 text-right">단가</th>
                <th className="p-2 text-right">합계</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {extraItems.map((item, idx) => (
                <tr key={idx} className="border-b border-border">
                  <td className="p-2">{item.name}</td>
                  <td className="p-2 text-right">{item.quantity}</td>
                  <td className="p-2 text-right">₩{item.unitPrice.toLocaleString("ko-KR")}</td>
                  <td className="p-2 text-right font-medium">₩{(item.unitPrice * item.quantity).toLocaleString("ko-KR")}</td>
                  <td className="p-2 text-right">
                    <button className="text-muted-foreground hover:text-destructive" onClick={() => setExtraItems(extraItems.filter((_, i) => i !== idx))}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td className="p-2">
                  <Select
                    value={extraForm.productId || "__none"}
                    onValueChange={(v) => {
                      const id = !v || v === "__none" ? "" : v;
                      const prod = products.find((p) => p.id === id);
                      setExtraForm({ ...extraForm, productId: id, unitPrice: prod?.sellingPrice ?? "0" });
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="상품 선택..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">상품 선택...</SelectItem>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-2 text-right">
                  <Input className="h-9 w-16 text-right" inputMode="numeric" value={extraForm.quantity} onChange={(e) => setExtraForm({ ...extraForm, quantity: e.target.value })} />
                </td>
                <td className="p-2 text-right">
                  <Input
                    className="h-9 w-28 text-right"
                    inputMode="numeric"
                    value={formatComma(extraForm.unitPrice)}
                    onChange={(e) => setExtraForm({ ...extraForm, unitPrice: parseComma(e.target.value) })}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </td>
                <td className="p-2 text-right text-xs text-muted-foreground">
                  ₩{((parseFloat(extraForm.quantity) || 0) * (parseFloat(parseComma(extraForm.unitPrice)) || 0)).toLocaleString("ko-KR")}
                </td>
                <td>
                  <Button onClick={addExtraItem} size="sm" variant="outline">
                    <Plus className="h-3 w-3" /> 담기
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
          {extraItems.length > 0 ? (
            <div className="mt-2 flex justify-end text-sm font-medium">
              추가 상품 소계: ₩{extraTotal.toLocaleString("ko-KR")}
            </div>
          ) : null}
        </Section>
      ) : null}

      {/* 완료된 연결 주문 */}
      {rental.orders.length > 0 ? (
        <Section title="연결된 판매 주문">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="p-2">주문번호</th>
                <th className="p-2">결제수단</th>
                <th className="p-2 text-right">금액</th>
                <th className="p-2">일시</th>
              </tr>
            </thead>
            <tbody>
              {rental.orders.map((o) => (
                <tr key={o.id} className="border-b border-border">
                  <td className="p-2 font-medium">{o.orderNo}</td>
                  <td className="p-2">{o.paymentMethod ? (PAYMENT_LABEL[o.paymentMethod] ?? o.paymentMethod) : "-"}</td>
                  <td className="p-2 text-right">₩{Number(o.totalAmount).toLocaleString("ko-KR")}</td>
                  <td className="p-2 text-muted-foreground">{new Date(o.createdAt).toLocaleString("ko-KR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ) : null}

      {canReturn ? (
        <div className="flex justify-end pt-4">
          <button
            onClick={() => setReturnDialog(true)}
            className="h-12 rounded-lg bg-primary px-6 text-base font-semibold text-white hover:bg-primary/90"
          >
            반납 처리
          </button>
        </div>
      ) : null}

      <Dialog open={returnDialog} onOpenChange={setReturnDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>반납 처리</DialogTitle>
          </DialogHeader>

          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">임대비</span><span>₩{Number(rental.finalAmount).toLocaleString("ko-KR")}</span></div>
            {extraItems.length > 0 ? (
              <div className="flex justify-between text-primary/80">
                <span>추가 판매 ({extraItems.length}건)</span>
                <span>₩{extraTotal.toLocaleString("ko-KR")}</span>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-border pt-2 font-semibold">
              <span>합계</span>
              <span className="text-xl">₩{(Number(rental.finalAmount) + extraTotal).toLocaleString("ko-KR")}</span>
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium">결제수단</div>
            <div className="grid grid-cols-2 gap-2">
              {RETURN_PAYMENTS.map((pm) => (
                <button
                  key={pm}
                  onClick={() => setReturnPayment(pm)}
                  className={`h-10 rounded-md border text-sm font-medium ${returnPayment === pm ? "border-primary bg-primary/10 text-primary/80" : "border-border hover:bg-muted/50"}`}
                >
                  {PAYMENT_LABEL[pm]}
                </button>
              ))}
            </div>
          </div>

          {Number(rental.depositAmount) > 0 ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={depositReturned}
                onCheckedChange={(c) => setDepositReturned(c === true)}
              />
              보증금 환급 (₩{Number(rental.depositAmount).toLocaleString("ko-KR")})
            </label>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnDialog(false)}>취소</Button>
            <Button onClick={doReturn} disabled={doingReturn}>
              {doingReturn ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              확정
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-xl border border-border bg-background p-5">
      <div className="mb-2 text-sm font-semibold">{title}</div>
      {children}
    </div>
  );
}
