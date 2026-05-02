"use client";

import { Plus, Minus, Trash2, Wrench, CalendarClock, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  formatComma,
  formatDiscountDisplay,
  normalizeDiscountInput,
} from "@/lib/utils";
import { lineDisplayPrice } from "@/components/pos/cart-helpers";
import { useSessions, type CartItem } from "@/components/pos/sessions-context";

interface Props {
  item: CartItem;
  sessionId: string;
}

export function CartLineRow({ item, sessionId }: Props) {
  const { remove, updateQty, updateDiscount } = useSessions();
  const display = lineDisplayPrice(item);

  const Icon =
    item.itemType === "repair" ? Wrench : item.itemType === "rental" ? CalendarClock : Package;

  return (
    <div className="flex flex-col gap-2 border-b border-border bg-background p-3 last:border-b-0 sm:p-4">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 text-sm font-medium leading-snug">{item.name}</div>
              {item.sku && (
                <div className="mt-0.5 text-xs text-muted-foreground">{item.sku}</div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => remove(item.cartItemId, sessionId)}
              aria-label="삭제"
            >
              <Trash2 />
            </Button>
          </div>

          {item.itemType === "rental" && item.rentalMeta && (
            <div className="mt-1 text-xs text-muted-foreground">
              {item.rentalMeta.startDate && item.rentalMeta.endDate
                ? `${item.rentalMeta.startDate} ~ ${item.rentalMeta.endDate}`
                : "기간 미설정"}
            </div>
          )}
          {item.itemType === "repair" && item.repairMeta?.deviceModel && (
            <div className="mt-1 text-xs text-muted-foreground">
              {item.repairMeta.deviceBrand} {item.repairMeta.deviceModel}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[auto_1fr_auto]">
        {/* 수량 */}
        <div className="flex h-9 items-center rounded-md border border-input">
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-r-none"
            onClick={() => updateQty(item.cartItemId, item.quantity - 1, sessionId)}
            disabled={item.quantity <= (item.isBulk ? 0.0001 : 1)}
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
            className="h-9 w-14 border-0 px-1 text-center tabular-nums focus-visible:ring-0"
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-l-none"
            onClick={() => updateQty(item.cartItemId, item.quantity + 1, sessionId)}
          >
            <Plus />
          </Button>
        </div>

        {/* 할인 */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">할인</span>
          <Input
            type="text"
            inputMode={item.discount.trim().endsWith("%") ? "decimal" : "numeric"}
            value={formatDiscountDisplay(item.discount)}
            onChange={(e) => updateDiscount(item.cartItemId, normalizeDiscountInput(e.target.value), sessionId)}
            onFocus={(e) => e.currentTarget.select()}
            placeholder="0"
            className="h-9 flex-1 text-right tabular-nums"
          />
        </div>

        {/* 라인 합계 (모바일 전체폭, 태블릿 우측) */}
        <div className="col-span-2 flex items-baseline justify-end gap-1 sm:col-span-1">
          <span className="text-xs text-muted-foreground">
            ₩{formatComma(String(item.unitPrice))} × {item.quantity}
          </span>
          {item.taxType === "TAX_FREE" && <Badge variant="secondary">면세</Badge>}
          {item.isZeroRate && <Badge variant="secondary">영세</Badge>}
          <span className="ml-1 text-base font-semibold tabular-nums">
            ₩{display.total.toLocaleString("ko-KR")}
          </span>
        </div>
      </div>
    </div>
  );
}
