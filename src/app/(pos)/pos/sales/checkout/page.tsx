"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useSessions, type CartItem } from "@/components/pos/sessions-context";
import { calcDiscountPerUnit } from "@/lib/utils";
import { Banknote, CreditCard, ArrowLeftRight, FileText, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Payment = "CASH" | "CARD" | "TRANSFER" | "MIXED" | "UNPAID";
const PAYMENT_OPTIONS: { value: Payment; label: string; icon: React.ReactNode }[] = [
  { value: "CASH", label: "현금", icon: <Banknote className="h-5 w-5" /> },
  { value: "CARD", label: "카드", icon: <CreditCard className="h-5 w-5" /> },
  { value: "TRANSFER", label: "계좌이체", icon: <ArrowLeftRight className="h-5 w-5" /> },
  { value: "MIXED", label: "복합결제", icon: <FileText className="h-5 w-5" /> },
  { value: "UNPAID", label: "외상", icon: <Clock className="h-5 w-5" /> },
];

interface CustomerLite {
  id: string;
  name: string;
  phone: string | null;
}

interface VariantOption {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
  inventory: { quantity: string } | null;
}

export default function CheckoutPage() {
  const { active: cart, clear: clearCart, updateRentalDates, assignVariant } = useSessions();
  const router = useRouter();
  const params = useSearchParams();
  const customerId = params.get("customerId") ?? "";
  const [customer, setCustomer] = useState<CustomerLite | null>(null);
  const [payment, setPayment] = useState<Payment>("CARD");
  const [taxInvoice, setTaxInvoice] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 변형 선택 다이얼로그
  const [variantPickerFor, setVariantPickerFor] = useState<CartItem | null>(null);
  const [variantOptions, setVariantOptions] = useState<VariantOption[]>([]);
  const [variantLoading, setVariantLoading] = useState(false);

  const openVariantPicker = async (item: CartItem) => {
    if (!item.productId) return;
    setVariantPickerFor(item);
    setVariantOptions([]);
    setVariantLoading(true);
    try {
      const res = await fetch(`/api/products/${item.productId}`);
      if (res.ok) {
        const detail = await res.json();
        setVariantOptions(detail.variants ?? []);
      }
    } finally {
      setVariantLoading(false);
    }
  };

  const pickVariant = (v: VariantOption) => {
    if (!variantPickerFor) return;
    assignVariant(variantPickerFor.cartItemId, {
      productId: v.id,
      name: v.name,
      sku: v.sku,
      unitPrice: parseFloat(v.sellingPrice),
    });
    setVariantPickerFor(null);
    setVariantOptions([]);
  };

  const unsetCanonicalItems = cart.items.filter(
    (i) => i.itemType === "product" && i.isCanonical,
  );
  const hasUnsetVariants = unsetCanonicalItems.length > 0;

  useEffect(() => {
    if (!customerId) return;
    fetch(`/api/customers/${customerId}`).then((r) => (r.ok ? r.json() : null)).then(setCustomer);
  }, [customerId]);

  const subtotalNet = cart.items.reduce((s: number, i: CartItem) => {
    const d = calcDiscountPerUnit(i.unitPrice, i.discount);
    return s + (i.unitPrice - d) * i.quantity;
  }, 0);
  const taxableNet = cart.items.reduce((s: number, i: CartItem) => {
    if (i.taxType === "TAX_FREE" || i.isZeroRate) return s;
    const d = calcDiscountPerUnit(i.unitPrice, i.discount);
    return s + (i.unitPrice - d) * i.quantity;
  }, 0);
  const tax = Math.round(taxableNet * 0.1);
  const total = subtotalNet + tax;

  const rentalItems = cart.items.filter((i) => i.itemType === "rental");
  const repairItems = cart.items.filter((i) => i.itemType === "repair");
  const hasUnsetRentalDates = rentalItems.some(
    (i) => !i.rentalMeta?.startDate || !i.rentalMeta?.endDate
  );

  const submit = async (action: "order" | "quotation" | "statement") => {
    if (cart.items.length === 0) return;
    if (action === "order" && hasUnsetRentalDates) {
      toast.error("임대 항목의 날짜를 모두 설정해주세요");
      return;
    }
    if (hasUnsetVariants) {
      toast.error("변형이 확정되지 않은 항목이 있습니다");
      return;
    }
    setSubmitting(true);
    try {
      // 수리 티켓 데이터
      const firstRepairMeta = repairItems[0]?.repairMeta;
      const repairTicketData =
        repairItems.length > 0 && customerId
          ? {
              symptom: firstRepairMeta?.issueDescription,
              deviceBrand: firstRepairMeta?.deviceBrand,
              deviceModel: firstRepairMeta?.deviceModel,
              labors: repairItems.map((i) => ({ name: i.name, unitRate: i.unitPrice })),
            }
          : undefined;

      // 임대 레코드 데이터
      const rentalRecords =
        rentalItems.length > 0 && customerId
          ? rentalItems
              .filter((i) => i.rentalMeta?.startDate && i.rentalMeta?.endDate)
              .map((i) => {
                const days = Math.max(
                  1,
                  Math.round(
                    (new Date(i.rentalMeta!.endDate!).getTime() -
                      new Date(i.rentalMeta!.startDate!).getTime()) /
                      86400000
                  )
                );
                return {
                  assetId: i.rentalMeta!.assetId,
                  startDate: i.rentalMeta!.startDate!,
                  endDate: i.rentalMeta!.endDate!,
                  totalDays: days,
                  unitRate: i.rentalMeta!.dailyRate,
                  rentalAmount: i.unitPrice * i.quantity,
                  depositAmount: i.rentalMeta!.depositAmount,
                };
              })
          : undefined;

      const res = await fetch("/api/pos/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          customerId: customerId || null,
          customerName: customer?.name ?? null,
          customerPhone: customer?.phone ?? null,
          paymentMethod: action === "order" ? payment : null,
          taxInvoiceRequested: action === "order" ? taxInvoice : false,
          items: cart.items.map((i) => ({
            productId: i.productId,
            name: i.name,
            sku: i.sku,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            discountPerUnit: calcDiscountPerUnit(i.unitPrice, i.discount),
            taxType: i.taxType,
            isZeroRate: i.isZeroRate ?? false,
          })),
          repairTicketData,
          rentalRecords,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "처리 실패");
      clearCart();
      toast.success(`${actionLabel(action)} 완료 — ${data.no}`);
      if (action === "statement") {
        window.open(`/statements/${data.id}/print?auto=1`, "_blank");
      } else if (action === "quotation") {
        window.open(`/quotations/${data.id}/print?auto=1`, "_blank");
      }
      router.push("/pos");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "처리 실패");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link href="/pos/sales" className="mb-4 inline-block text-sm text-muted-foreground hover:text-foreground">
        ← 판매 화면으로
      </Link>

      <h1 className="mb-6 text-2xl font-semibold tracking-tight">계산</h1>

      <div className="grid gap-6 md:grid-cols-[1fr_360px]">
        <div>
          <div className="rounded-xl border border-border bg-background">
            <div className="border-b border-border p-4 font-medium">고객</div>
            <div className="p-4">
              {customer ? (
                <div>
                  <div className="text-base font-medium">{customer.name}</div>
                  {customer.phone ? <div className="text-sm text-muted-foreground">{customer.phone}</div> : null}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">선택된 고객 없음 (비회원)</div>
              )}
            </div>
          </div>

          {/* 임대 날짜 설정 */}
          {rentalItems.length > 0 && (
            <div className="mt-6 rounded-xl border border-border bg-background">
              <div className="border-b border-border p-4 font-medium">
                임대 날짜 설정
                {!customerId && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    (고객 선택 시 임대 계약 자동 생성)
                  </span>
                )}
              </div>
              <div className="divide-y divide-border">
                {rentalItems.map((item) => (
                  <RentalDateRow
                    key={item.cartItemId}
                    item={item}
                    onDatesChange={(startDate, endDate) => {
                      const days = Math.max(
                        1,
                        Math.round(
                          (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000
                        )
                      );
                      const newUnitPrice = (item.rentalMeta?.dailyRate ?? item.unitPrice) * days;
                      updateRentalDates(item.cartItemId, startDate, endDate, newUnitPrice);
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 rounded-xl border border-border bg-background">
            <div className="flex items-center justify-between border-b border-border p-4">
              <span className="font-medium">세금계산서 발행</span>
              <button
                onClick={() => setTaxInvoice(!taxInvoice)}
                className={`relative h-6 w-11 rounded-full transition ${taxInvoice ? "bg-primary" : "bg-neutral-300"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-background transition ${taxInvoice ? "left-5" : "left-0.5"}`} />
              </button>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-border bg-background">
            <div className="border-b border-border p-4 font-medium">결제수단</div>
            <div className="grid grid-cols-3 gap-2 p-4 md:grid-cols-5">
              {PAYMENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPayment(opt.value)}
                  className={`flex h-20 flex-col items-center justify-center gap-1 rounded-lg border text-sm font-medium transition ${
                    payment === opt.value
                      ? "border-primary bg-primary/10 text-primary/80"
                      : "border-border bg-background text-foreground hover:bg-muted/50"
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>공급가액</span>
                <span>₩{Math.round(subtotalNet).toLocaleString("ko-KR")}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>부가세 (10%)</span>
                <span>₩{tax.toLocaleString("ko-KR")}</span>
              </div>
              <div className="my-2 border-t border-border" />
              <div className="flex justify-between">
                <span className="font-medium">합계</span>
                <span className="text-2xl font-semibold tracking-tight">
                  ₩{total.toLocaleString("ko-KR")}
                </span>
              </div>
            </div>
          </div>

          {/* 변형 미확정 항목 */}
          {hasUnsetVariants && (
            <div className="rounded-xl border border-orange-500/40 bg-orange-500/5 p-4 space-y-2">
              <div className="text-sm font-medium text-orange-700">
                변형 확정이 필요한 항목 ({unsetCanonicalItems.length}개)
              </div>
              <div className="space-y-1.5">
                {unsetCanonicalItems.map((it) => (
                  <div key={it.cartItemId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{it.name}</span>
                    <button
                      onClick={() => openVariantPicker(it)}
                      className="rounded-md bg-orange-500 px-3 py-1 text-xs text-white hover:bg-orange-600"
                    >
                      변형 선택
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <button
              onClick={() => submit("order")}
              disabled={submitting || cart.items.length === 0 || hasUnsetRentalDates || hasUnsetVariants}
              className="h-14 w-full rounded-lg bg-primary text-lg font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              주문 확정 + 결제
            </button>
            {hasUnsetRentalDates && (
              <div className="text-center text-xs text-orange-500">임대 날짜를 모두 설정해주세요</div>
            )}
            {hasUnsetVariants && (
              <div className="text-center text-xs text-orange-500">변형 확정이 필요합니다</div>
            )}
            <button
              onClick={() => submit("statement")}
              disabled={submitting || cart.items.length === 0 || hasUnsetVariants}
              className="h-12 w-full rounded-lg border border-border text-base font-medium hover:bg-muted/50 disabled:opacity-50"
            >
              거래명세표로 저장 + 출력
            </button>
            <button
              onClick={() => submit("quotation")}
              disabled={submitting || cart.items.length === 0 || hasUnsetVariants}
              className="h-12 w-full rounded-lg border border-border text-base font-medium hover:bg-muted/50 disabled:opacity-50"
            >
              견적서로 저장 + 출력
            </button>
          </div>
        </div>
      </div>

      <Dialog open={!!variantPickerFor} onOpenChange={(o) => !o && setVariantPickerFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{variantPickerFor?.name} — 변형 선택</DialogTitle>
          </DialogHeader>
          {variantLoading ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : variantOptions.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              등록된 변형이 없습니다. 조립실적을 먼저 등록해 변형을 만들어주세요.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
              {variantOptions.map((v) => {
                const qty = v.inventory ? Number(v.inventory.quantity) : 0;
                const outOfStock = qty <= 0;
                return (
                  <button
                    key={v.id}
                    onClick={() => pickVariant(v)}
                    disabled={outOfStock}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-border p-3 text-left hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{v.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {v.sku} · 재고 {qty.toLocaleString("ko-KR")}
                      </div>
                    </div>
                    <div className="text-sm tabular-nums">
                      ₩{Math.round(parseFloat(v.sellingPrice)).toLocaleString("ko-KR")}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setVariantPickerFor(null)}>취소</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RentalDateRow({
  item,
  onDatesChange,
}: {
  item: CartItem;
  onDatesChange: (start: string, end: string) => void;
}) {
  const [start, setStart] = useState(item.rentalMeta?.startDate ?? "");
  const [end, setEnd] = useState(item.rentalMeta?.endDate ?? "");

  const handleChange = (s: string, e: string) => {
    if (s && e && s <= e) onDatesChange(s, e);
  };

  const days =
    start && end && start <= end
      ? Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000))
      : null;

  return (
    <div className="p-4">
      <div className="mb-2 text-sm font-medium">{item.name}</div>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={start}
          onChange={(e) => {
            setStart(e.target.value);
            handleChange(e.target.value, end);
          }}
          className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
        />
        <span className="text-sm text-muted-foreground">~</span>
        <input
          type="date"
          value={end}
          min={start}
          onChange={(e) => {
            setEnd(e.target.value);
            handleChange(start, e.target.value);
          }}
          className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
        />
      </div>
      {days !== null && (
        <div className="mt-1.5 text-xs text-muted-foreground">
          {days}일 · ₩{Math.round((item.rentalMeta?.dailyRate ?? item.unitPrice) * 1.1).toLocaleString("ko-KR")} / 일
          · 합계 ₩{Math.round((item.rentalMeta?.dailyRate ?? item.unitPrice) * days * 1.1).toLocaleString("ko-KR")}
        </div>
      )}
    </div>
  );
}

function actionLabel(a: string) {
  return a === "order" ? "주문" : a === "statement" ? "명세표" : "견적서";
}
