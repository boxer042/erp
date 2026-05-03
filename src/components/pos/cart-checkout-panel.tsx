"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, ShoppingCart, Tag, Trash2, Truck, User } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import {
  formatComma,
  formatDiscountDisplay,
  normalizeDiscountInput,
  parseComma,
  cn,
} from "@/lib/utils";
import { ApiError, apiMutate } from "@/lib/api-client";
import { useSessions, type CartSession } from "@/components/pos/sessions-context";
import { CartLineRow } from "@/components/pos/cart-line-row";
import { calcCartTotals } from "@/components/pos/cart-helpers";
import { submitCheckout } from "@/components/pos/checkout-submit";
import { CustomerLinkSheet } from "@/components/pos/customer-link-sheet";

interface Props {
  session: CartSession;
  onSwitchToProducts?: () => void;
  netOnly?: boolean;
}

function computeQuotationFingerprint(session: CartSession): string {
  return JSON.stringify({
    items: session.items.map((i) => ({
      p: i.productId,
      n: i.name,
      sk: i.sku,
      q: i.quantity,
      u: i.unitPrice,
      d: i.discount,
      t: i.taxType,
      z: i.isZeroRate,
    })),
    c: session.customerId ?? null,
    cn: session.customerName ?? null,
    s: session.shippingCost,
    td: session.totalDiscount,
  });
}

// 라벨 발번 지문 — 손님과 trackable 상품 수량 변화에만 영향. 단가/할인 등은 무관.
function computeLabelFingerprint(session: CartSession): string {
  return JSON.stringify({
    items: session.items
      .filter((i) => i.itemType === "product" && i.productId)
      .map((i) => ({ p: i.productId, q: i.quantity })),
    c: session.customerId ?? null,
  });
}

export function CartCheckoutPanel({ session, onSwitchToProducts, netOnly = false }: Props) {
  const router = useRouter();
  const { setSessionDiscount, setSessionShipping, setSessionQuotation, setSessionLabels, clear } = useSessions();
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [discountDraft, setDiscountDraft] = useState("");
  const [customerSheetOpen, setCustomerSheetOpen] = useState(false);
  const [shippingDialogOpen, setShippingDialogOpen] = useState(false);
  const [shippingDraft, setShippingDraft] = useState("");
  const [quotationPreviewId, setQuotationPreviewId] = useState<string | null>(null);
  const [labelPreviewCodes, setLabelPreviewCodes] = useState<string[] | null>(null);
  const sessionId = session.id;

  const checkoutMutation = useMutation({
    mutationFn: () => {
      if (session.items.length === 0) throw new Error("카트가 비어있습니다");
      const hasUnsetRentalDates = session.items.some(
        (i) => i.itemType === "rental" && (!i.rentalMeta?.startDate || !i.rentalMeta?.endDate)
      );
      if (hasUnsetRentalDates) throw new Error("임대 항목의 날짜를 설정해주세요");
      const hasRepairOrRental = session.items.some(
        (i) => i.itemType === "repair" || i.itemType === "rental"
      );
      if (hasRepairOrRental && !session.customerId) {
        throw new Error("수리/임대는 손님 연결이 필요합니다");
      }
      return submitCheckout(session, { action: "order", paymentMethod: "CARD" });
    },
    onSuccess: (data) => {
      toast.success(`결제 완료 — ${data.no}`);
      clear(sessionId);
      router.push("/pos");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : err.message || "결제 실패"),
  });

  const totals = calcCartTotals(session);

  const openDiscountDialog = () => {
    setDiscountDraft(session.totalDiscount);
    setDiscountDialogOpen(true);
  };

  const applyDiscount = () => {
    setSessionDiscount(discountDraft, sessionId);
    setDiscountDialogOpen(false);
  };

  const clearDiscount = () => {
    setSessionDiscount("", sessionId);
    setDiscountDialogOpen(false);
  };

  const openShippingDialog = () => {
    setShippingDraft(session.shippingCost === "0" ? "" : session.shippingCost);
    setShippingDialogOpen(true);
  };

  const applyShipping = () => {
    setSessionShipping(shippingDraft || "0", sessionId);
    setShippingDialogOpen(false);
  };

  const clearShipping = () => {
    setSessionShipping("0", sessionId);
    setShippingDialogOpen(false);
  };

  // 견적서 생성/업데이트 → 모달로 미리보기
  const quotationMutation = useMutation<{ id: string; fingerprint: string }, Error>({
    mutationFn: async () => {
      if (session.items.length === 0) throw new Error("카트가 비어있습니다");
      if (!session.customerId) throw new Error("견적서 발행은 손님 연결이 필요합니다");

      const fingerprint = computeQuotationFingerprint(session);

      // 동일 카트로 이미 생성된 견적서 → 그대로 재사용
      if (session.quotationId && session.quotationFingerprint === fingerprint) {
        return { id: session.quotationId, fingerprint };
      }

      type QItem = {
        productId?: string;
        name: string;
        unitOfMeasure: string;
        quantity: string;
        listPrice: string;
        unitPrice: string;
        discountAmount: string;
        isTaxable: boolean;
        sortOrder: number;
      };
      const items: QItem[] = session.items.map((it, idx) => ({
        productId: it.productId,
        name: it.name,
        unitOfMeasure: it.unitOfMeasure ?? "EA",
        quantity: it.quantity.toString(),
        listPrice: it.unitPrice.toString(),
        unitPrice: it.unitPrice.toString(),
        discountAmount: "0",
        isTaxable: !(it.taxType === "TAX_FREE" || it.isZeroRate),
        sortOrder: idx,
      }));
      // 배송비 라인 추가 (있을 때)
      const shipNet = parseFloat((session.shippingCost ?? "0").replace(/,/g, "")) || 0;
      if (shipNet > 0) {
        items.push({
          name: "배송비",
          unitOfMeasure: "EA",
          quantity: "1",
          listPrice: shipNet.toString(),
          unitPrice: shipNet.toString(),
          discountAmount: "0",
          isTaxable: true,
          sortOrder: items.length,
        });
      }
      const today = new Date().toISOString().slice(0, 10);
      const body = {
        type: "SALES" as const,
        status: "DRAFT" as const,
        issueDate: today,
        customerId: session.customerId,
        title: session.customerName ?? session.label,
        items,
      };

      // 기존 견적서가 있으면 PUT으로 갱신, 없으면 POST 신규 발행
      if (session.quotationId) {
        await apiMutate(`/api/quotations/${session.quotationId}`, "PUT", body);
        return { id: session.quotationId, fingerprint };
      }
      const res = await apiMutate<{ id: string }>("/api/quotations", "POST", body);
      return { id: res.id, fingerprint };
    },
    onSuccess: (data) => {
      setSessionQuotation(data.id, data.fingerprint, sessionId);
      setQuotationPreviewId(data.id);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : err.message || "견적서 생성 실패"),
  });

  // 시리얼 라벨 발번 — trackable 상품에 한해 수량만큼 코드 생성
  const labelMutation = useMutation<{ codes: string[]; fingerprint: string }, Error>({
    mutationFn: async () => {
      if (session.items.length === 0) throw new Error("카트가 비어있습니다");
      const fingerprint = computeLabelFingerprint(session);

      // 동일 카트 → 기존 코드 재사용
      if (
        session.labelCodes &&
        session.labelCodes.length > 0 &&
        session.labelFingerprint === fingerprint
      ) {
        return { codes: session.labelCodes, fingerprint };
      }

      const items = session.items
        .filter((i) => i.itemType === "product" && i.productId)
        .map((i) => ({ productId: i.productId!, quantity: Math.max(1, Math.round(i.quantity)) }));

      if (items.length === 0) throw new Error("발번할 상품이 없습니다");

      const res = await apiMutate<{ codes: { code: string }[] }>(
        "/api/serial-items/issue",
        "POST",
        { customerId: session.customerId ?? null, items }
      );
      const codes = res.codes.map((c) => c.code);
      if (codes.length === 0) {
        throw new Error("개별추적(trackable) 설정된 상품이 없습니다");
      }
      return { codes, fingerprint };
    },
    onSuccess: (data) => {
      setSessionLabels(data.codes, data.fingerprint, sessionId);
      setLabelPreviewCodes(data.codes);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : err.message || "라벨 발번 실패"),
  });

  return (
    <div className="flex h-full w-full flex-col">
      {/* 라인 리스트 */}
      <div className="flex-1 overflow-y-auto">
        {session.items.length === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShoppingCart />
              </EmptyMedia>
              <EmptyTitle>비어있는 장바구니</EmptyTitle>
              <EmptyDescription>좌측에서 상품/수리/임대를 추가해주세요.</EmptyDescription>
            </EmptyHeader>
            {onSwitchToProducts && (
              <Button onClick={onSwitchToProducts} className="mt-4">
                상품 보기
              </Button>
            )}
          </Empty>
        ) : (
          <>
            {session.items.map((item) => (
              <CartLineRow
                key={item.cartItemId}
                item={item}
                sessionId={sessionId}
                netOnly={netOnly}
              />
            ))}
            {totals.shippingNet > 0 && (
              <CartShippingRow
                amount={netOnly ? totals.shippingNet : totals.shippingNet + totals.shippingVat}
                onClickAmount={openShippingDialog}
                onRemove={() => setSessionShipping("0", sessionId)}
              />
            )}
          </>
        )}
      </div>

      {/* 손님 / 견적서 / 배송비 / 라벨 — 4그리드 버튼 */}
      <div className="grid shrink-0 grid-cols-4 gap-px border-t border-border bg-border">
        <ActionTile
          icon={<User className="size-7" />}
          label="손님"
          value={session.customerName ?? `${session.label} 연결`}
          subValue={null}
          onClick={() => setCustomerSheetOpen(true)}
        />
        <ActionTile
          icon={<FileText className="size-7" />}
          label="견적서"
          value={quotationMutation.isPending ? "처리 중..." : "출력"}
          subValue={null}
          onClick={() => quotationMutation.mutate()}
          disabled={quotationMutation.isPending || session.items.length === 0}
        />
        <ActionTile
          icon={<Truck className="size-7" />}
          label="배송비"
          value={
            totals.shippingNet > 0
              ? `₩${totals.shippingNet.toLocaleString("ko-KR")}`
              : "추가"
          }
          subValue={null}
          onClick={openShippingDialog}
        />
        <ActionTile
          icon={<Tag className="size-7" />}
          label="라벨"
          value={labelMutation.isPending ? "처리 중..." : "출력"}
          subValue={null}
          onClick={() => labelMutation.mutate()}
          disabled={labelMutation.isPending || session.items.length === 0}
        />
      </div>

      {/* 합계 + 결제 */}
      <div className="shrink-0 border-t border-border bg-background">
        <div className="flex flex-col gap-2 px-3 py-3 sm:px-4">
          {/* 합계 — 판매가격 클릭 시 할인 다이얼로그 */}
          <button
            type="button"
            onClick={openDiscountDialog}
            disabled={session.items.length === 0}
            className="group -mx-1 flex flex-col gap-1 rounded-md p-1 text-left text-sm transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {!netOnly && (
              <>
                <Row label="공급가액" value={totals.net} />
                <Row label="세액 (VAT)" value={totals.vat} />
              </>
            )}
            {totals.sessionDiscountAmount > 0 && (
              <Row
                label="전체 할인"
                value={-totals.sessionDiscountAmount}
                className="text-destructive"
              />
            )}
            <div className="-mx-4 mt-1 h-px bg-border sm:-mx-5" />
            <div className="flex items-baseline justify-between pt-2">
              <span className="text-base font-semibold">판매가격</span>
              <span className="text-2xl font-bold tabular-nums underline-offset-4 group-hover:underline">
                ₩{(netOnly ? totals.net : totals.total).toLocaleString("ko-KR")}
              </span>
            </div>
          </button>

          <Button
            size="lg"
            className="h-14 text-base font-semibold"
            onClick={() => checkoutMutation.mutate()}
            disabled={checkoutMutation.isPending || session.items.length === 0}
          >
            {checkoutMutation.isPending
              ? "처리 중..."
              : `결제하기 · ₩${(netOnly ? totals.net : totals.total).toLocaleString("ko-KR")}`}
          </Button>
        </div>
      </div>

      {/* 할인 입력 다이얼로그 */}
      <Dialog open={discountDialogOpen} onOpenChange={setDiscountDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>전체 할인</DialogTitle>
            <DialogDescription>
              정액(예: 3000) 또는 비율(예: 10%)로 입력하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Input
              autoFocus
              type="text"
              inputMode={discountDraft.trim().endsWith("%") ? "decimal" : "numeric"}
              value={formatDiscountDisplay(discountDraft)}
              onChange={(e) => setDiscountDraft(normalizeDiscountInput(e.target.value))}
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  applyDiscount();
                }
              }}
              placeholder="0 또는 10%"
              className="h-11 text-right text-base tabular-nums"
            />
          </div>
          <DialogFooter>
            {session.totalDiscount && (
              <Button variant="outline" onClick={clearDiscount}>
                할인 제거
              </Button>
            )}
            <Button variant="outline" onClick={() => setDiscountDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={applyDiscount}>적용</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 배송비 입력 다이얼로그 */}
      <Dialog open={shippingDialogOpen} onOpenChange={setShippingDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>배송비</DialogTitle>
            <DialogDescription>
              세전 공급가액으로 입력하세요. 부가세 10%가 자동으로 추가됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Input
              autoFocus
              type="text"
              inputMode="numeric"
              value={formatComma(shippingDraft)}
              onChange={(e) => setShippingDraft(parseComma(e.target.value))}
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  applyShipping();
                }
              }}
              placeholder="0"
              className="h-11 text-right text-base tabular-nums"
            />
          </div>
          <DialogFooter>
            {totals.shippingNet > 0 && (
              <Button variant="outline" onClick={clearShipping}>
                배송비 제거
              </Button>
            )}
            <Button variant="outline" onClick={() => setShippingDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={applyShipping}>적용</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 손님 연결 시트 */}
      <CustomerLinkSheet
        open={customerSheetOpen}
        onOpenChange={setCustomerSheetOpen}
        sessionId={sessionId}
      />

      {/* 견적서 미리보기 모달 */}
      <Dialog
        open={!!quotationPreviewId}
        onOpenChange={(o) => {
          if (!o) setQuotationPreviewId(null);
        }}
      >
        <DialogContent className="flex h-[95vh] max-h-[95vh] w-[95vw] max-w-[95vw]! flex-col gap-0 p-0 sm:max-w-[95vw]!">
          <DialogHeader className="border-b border-border p-4">
            <DialogTitle>견적서 미리보기</DialogTitle>
          </DialogHeader>
          {quotationPreviewId && (
            <iframe
              src={`/quotations/${quotationPreviewId}/print`}
              className="size-full flex-1 border-0"
              title="견적서 미리보기"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* 라벨 미리보기 모달 */}
      <Dialog
        open={!!labelPreviewCodes}
        onOpenChange={(o) => {
          if (!o) setLabelPreviewCodes(null);
        }}
      >
        <DialogContent className="flex h-[95vh] max-h-[95vh] w-[95vw] max-w-[95vw]! flex-col gap-0 p-0 sm:max-w-[95vw]!">
          <DialogHeader className="border-b border-border p-4">
            <DialogTitle>라벨 미리보기 ({labelPreviewCodes?.length ?? 0}장)</DialogTitle>
          </DialogHeader>
          {labelPreviewCodes && labelPreviewCodes.length > 0 && (
            <iframe
              src={`/serial-items/print?codes=${labelPreviewCodes.join(",")}`}
              className="size-full flex-1 border-0"
              title="라벨 미리보기"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between", className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">₩{value.toLocaleString("ko-KR")}</span>
    </div>
  );
}

function CartShippingRow({
  amount,
  onClickAmount,
  onRemove,
}: {
  amount: number;
  onClickAmount: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border bg-background p-3 last:border-b-0 sm:gap-4 sm:p-4">
      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted sm:size-24">
        <Truck className="size-7 text-muted-foreground" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="text-sm font-semibold leading-snug sm:text-base">배송비</div>
        <button
          type="button"
          onClick={onClickAmount}
          className="group -mx-1 mt-0.5 flex items-baseline gap-2 self-start rounded-md px-1 transition-colors hover:bg-muted"
          aria-label="배송비 수정"
        >
          <span className="text-base font-bold tabular-nums underline-offset-4 group-hover:underline sm:text-lg">
            ₩{amount.toLocaleString("ko-KR")}
          </span>
        </button>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        aria-label="배송비 삭제"
      >
        <Trash2 />
      </Button>
    </div>
  );
}

function ActionTile({
  icon,
  label,
  value,
  subValue,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string | null;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2.5 bg-background px-3 py-2.5 text-left transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="line-clamp-1 text-sm font-semibold tabular-nums">{value}</span>
        {subValue && (
          <span className="line-clamp-1 text-[11px] text-muted-foreground">
            {subValue}
          </span>
        )}
      </div>
    </button>
  );
}
