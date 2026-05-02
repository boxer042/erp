"use client";

import { useState } from "react";
import { Plus, Minus, Trash2, Wrench, CalendarClock, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  calcDiscountPerUnit,
  formatDiscountDisplay,
  normalizeDiscountInput,
} from "@/lib/utils";
import { lineDisplayPrice } from "@/components/pos/cart-helpers";
import { useSessions, type CartItem } from "@/components/pos/sessions-context";

interface Props {
  item: CartItem;
  sessionId: string;
  netOnly?: boolean;
}

export function CartLineRow({ item, sessionId, netOnly = false }: Props) {
  const { remove, updateQty, updateDiscount } = useSessions();
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [discountDraft, setDiscountDraft] = useState("");
  const display = lineDisplayPrice(item);

  const Icon =
    item.itemType === "repair" ? Wrench : item.itemType === "rental" ? CalendarClock : Package;

  const isExempt = item.taxType === "TAX_FREE" || item.isZeroRate;
  const discountPerUnit = calcDiscountPerUnit(item.unitPrice, item.discount);
  const hasDiscount = discountPerUnit > 0;

  // 할인 전 gross total (VAT 포함)
  const originalNet = item.unitPrice * item.quantity;
  const originalVat = isExempt ? 0 : Math.round(originalNet * 0.1);
  const originalTotal = originalNet + originalVat;

  // 할인 배지 라벨 — 비율 입력은 그대로, 정액 입력은 비율로 환산
  const discountBadgeLabel = (() => {
    if (!hasDiscount) return null;
    const trimmed = item.discount.trim();
    if (trimmed.endsWith("%")) return trimmed;
    if (item.unitPrice <= 0) return null;
    const pct = Math.round((discountPerUnit / item.unitPrice) * 100);
    return pct > 0 ? `${pct}%` : null;
  })();

  const metaLine =
    item.itemType === "rental" && item.rentalMeta
      ? item.rentalMeta.startDate && item.rentalMeta.endDate
        ? `${item.rentalMeta.startDate} ~ ${item.rentalMeta.endDate}`
        : "기간 미설정"
      : item.itemType === "repair" && item.repairMeta?.deviceModel
        ? `${item.repairMeta.deviceBrand ?? ""} ${item.repairMeta.deviceModel}`.trim()
        : null;

  const subtitle = [item.sku, metaLine].filter(Boolean).join(" · ");

  const openDiscountDialog = () => {
    setDiscountDraft(item.discount);
    setDiscountDialogOpen(true);
  };

  const applyDiscount = () => {
    updateDiscount(item.cartItemId, discountDraft, sessionId);
    setDiscountDialogOpen(false);
  };

  const clearDiscount = () => {
    updateDiscount(item.cartItemId, "", sessionId);
    setDiscountDialogOpen(false);
  };

  return (
    <div className="flex items-center gap-3 border-b border-border bg-background p-3 last:border-b-0 sm:gap-4 sm:p-4">
      {/* 좌측: 상품 이미지 */}
      <div className="size-20 shrink-0 overflow-hidden rounded-lg bg-muted sm:size-24">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.name}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <Icon className="size-7 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* 중앙: 상품명 / SKU / 가격 */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start gap-1.5">
          <div className="line-clamp-1 flex-1 text-sm font-semibold leading-snug sm:text-base">
            {item.name}
          </div>
          {item.taxType === "TAX_FREE" && (
            <Badge variant="secondary" className="h-4 shrink-0 px-1 text-[10px]">면세</Badge>
          )}
          {item.isZeroRate && (
            <Badge variant="secondary" className="h-4 shrink-0 px-1 text-[10px]">영세</Badge>
          )}
        </div>

        {subtitle && (
          <div className="line-clamp-1 text-xs text-muted-foreground">{subtitle}</div>
        )}

        {/* 가격 줄 — 클릭 시 할인 다이얼로그 */}
        <button
          type="button"
          onClick={openDiscountDialog}
          className="group -mx-1 mt-0.5 flex items-baseline gap-2 self-start rounded-md px-1 transition-colors hover:bg-muted"
          aria-label="할인 입력"
        >
          {hasDiscount && (
            <span className="text-xs text-muted-foreground line-through tabular-nums sm:text-sm">
              ₩{(netOnly ? originalNet : originalTotal).toLocaleString("ko-KR")}
            </span>
          )}
          <span className="text-base font-bold tabular-nums underline-offset-4 group-hover:underline sm:text-lg">
            ₩{(netOnly ? display.net : display.total).toLocaleString("ko-KR")}
          </span>
          {hasDiscount && discountBadgeLabel && (
            <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-destructive-foreground">
              {discountBadgeLabel}
            </span>
          )}
        </button>
      </div>

      {/* 우측: 삭제 + 수량 스테퍼 */}
      <div className="flex shrink-0 flex-col items-end gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-destructive"
          onClick={() => remove(item.cartItemId, sessionId)}
          aria-label="삭제"
        >
          <Trash2 />
        </Button>

        <div className="flex h-9 items-center rounded-md border border-input">
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-r-none"
            onClick={() => updateQty(item.cartItemId, item.quantity - 1, sessionId)}
            disabled={item.quantity <= (item.isBulk ? 0.0001 : 1)}
            aria-label="수량 감소"
          >
            <Minus />
          </Button>
          <Input
            type="text"
            inputMode={item.isBulk ? "decimal" : "numeric"}
            value={item.quantity}
            onChange={(e) => {
              const v = parseFloat(e.target.value) || 0;
              updateQty(item.cartItemId, v, sessionId);
            }}
            onFocus={(e) => e.currentTarget.select()}
            className="h-9 w-10 border-0 px-1 text-center tabular-nums focus-visible:ring-0"
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-l-none"
            onClick={() => updateQty(item.cartItemId, item.quantity + 1, sessionId)}
            aria-label="수량 증가"
          >
            <Plus />
          </Button>
        </div>
      </div>

      {/* 할인 입력 다이얼로그 */}
      <Dialog open={discountDialogOpen} onOpenChange={setDiscountDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{item.name} 할인</DialogTitle>
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
            {item.discount && (
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
    </div>
  );
}
