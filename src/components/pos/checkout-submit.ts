import { apiMutate } from "@/lib/api-client";
import { calcDiscountPerUnit } from "@/lib/utils";
import type { CartSession } from "@/components/pos/sessions-context";

export type CheckoutAction = "order" | "quotation" | "statement";

export interface CheckoutPayloadOptions {
  action: CheckoutAction;
  paymentMethod?: "CASH" | "CARD" | "TRANSFER" | "MIXED" | "UNPAID" | null;
  taxInvoiceRequested?: boolean;
  memo?: string | null;
}

export function buildCheckoutPayload(session: CartSession, opts: CheckoutPayloadOptions) {
  const repairItems = session.items.filter((i) => i.itemType === "repair");
  const rentalItems = session.items.filter((i) => i.itemType === "rental");
  const customerId = session.customerId ?? null;

  const firstRepairMeta = repairItems[0]?.repairMeta;
  const repairTicketData =
    repairItems.length > 0 && customerId
      ? {
          symptom: firstRepairMeta?.issueDescription,
          deviceBrand: firstRepairMeta?.deviceBrand,
          deviceModel: firstRepairMeta?.deviceModel,
          serialItemId: firstRepairMeta?.serialItemId ?? null,
          labors: repairItems.map((i) => ({ name: i.name, unitRate: i.unitPrice })),
        }
      : undefined;

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

  return {
    action: opts.action,
    customerId,
    customerName: session.customerName ?? null,
    customerPhone: session.customerPhone ?? null,
    paymentMethod: opts.action === "order" ? opts.paymentMethod ?? null : null,
    taxInvoiceRequested: opts.action === "order" ? !!opts.taxInvoiceRequested : false,
    memo: opts.memo ?? null,
    items: session.items.map((i) => ({
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
  };
}

export async function submitCheckout(session: CartSession, opts: CheckoutPayloadOptions) {
  const payload = buildCheckoutPayload(session, opts);
  return apiMutate<{ id: string; no: string }>("/api/pos/checkout", "POST", payload);
}
