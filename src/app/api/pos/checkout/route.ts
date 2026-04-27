import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ensureBulkStock } from "@/lib/inventory/fifo";

type Action = "order" | "quotation" | "statement";

interface CheckoutItem {
  productId?: string;      // 상품 항목만 있음, 서비스 항목(수리/임대)은 없음
  quantity: number;
  unitPrice: number;       // 할인 전 단가(세전)
  discountPerUnit: number; // 개당 할인액 (세전)
  name: string;
  sku?: string;
  taxType?: string;
  isZeroRate?: boolean;
}

interface RepairTicketData {
  symptom?: string;
  deviceBrand?: string;
  deviceModel?: string;
  labors: { name: string; unitRate: number }[];
}

interface RentalRecord {
  assetId: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  unitRate: number;
  rentalAmount: number;
  depositAmount?: number;
}

interface CheckoutBody {
  action: Action;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  paymentMethod?: "CASH" | "CARD" | "TRANSFER" | "MIXED" | "UNPAID" | null;
  taxInvoiceRequested?: boolean;
  memo?: string | null;
  items: CheckoutItem[];
  repairTicketId?: string | null;
  rentalId?: string | null;
  repairTicketData?: RepairTicketData | null;
  rentalRecords?: RentalRecord[] | null;
}

function genNo(prefix: string) {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const r = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${y}${m}${d}-${r}`;
}

// 오프라인 매출은 channelId IS NULL 로 표현 (베이스라인). 별도 SalesChannel row 불필요.

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const body = (await request.json()) as CheckoutBody;
  if (!body.action || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "action과 items는 필수입니다" }, { status: 400 });
  }

  const items = body.items.map((it) => {
    const net = Math.max(0, it.unitPrice - (it.discountPerUnit ?? 0));
    return {
      ...it,
      netUnitPrice: net,
      lineSubtotal: net * it.quantity,
    };
  });

  const subtotal = items.reduce((s, i) => s + i.lineSubtotal, 0);
  const taxableSubtotal = items
    .filter((i) => !(i.isZeroRate || i.taxType === "TAX_FREE"))
    .reduce((s, i) => s + i.lineSubtotal, 0);
  const taxAmount = Math.round(taxableSubtotal * 0.1);
  const totalAmount = subtotal + taxAmount;

  if (body.action === "quotation") {
    const q = await prisma.quotation.create({
      data: {
        quotationNo: genNo("QUO"),
        type: "SALES",
        status: "DRAFT",
        issueDate: new Date(),
        customerId: body.customerId || null,
        subtotalAmount: subtotal,
        taxAmount,
        totalAmount,
        memo: body.memo || null,
        createdById: user.id,
        items: {
          create: items.map((it, idx) => ({
            productId: it.productId,
            name: it.name,
            quantity: it.quantity,
            listPrice: it.unitPrice,
            discountAmount: it.discountPerUnit ?? 0,
            unitPrice: it.netUnitPrice,
            totalPrice: it.lineSubtotal,
            sortOrder: idx,
          })),
        },
      },
    });
    return NextResponse.json({ kind: "quotation", id: q.id, no: q.quotationNo }, { status: 201 });
  }

  if (body.action === "statement") {
    const customer = body.customerId
      ? await prisma.customer.findUnique({ where: { id: body.customerId } })
      : null;
    const s = await prisma.statement.create({
      data: {
        statementNo: genNo("STM"),
        status: "ISSUED",
        issueDate: new Date(),
        customerId: body.customerId || null,
        customerNameSnapshot: customer?.name ?? body.customerName ?? null,
        customerPhoneSnapshot: customer?.phone ?? body.customerPhone ?? null,
        customerAddressSnapshot: customer?.address ?? null,
        customerBusinessNumberSnapshot: customer?.businessNumber ?? null,
        subtotalAmount: subtotal,
        taxAmount,
        totalAmount,
        memo: body.memo || null,
        createdById: user.id,
        items: {
          create: items.map((it, idx) => ({
            productId: it.productId,
            name: it.name,
            quantity: it.quantity,
            listPrice: it.unitPrice,
            discountAmount: it.discountPerUnit ?? 0,
            unitPrice: it.netUnitPrice,
            totalPrice: it.lineSubtotal,
            sortOrder: idx,
          })),
        },
      },
    });
    return NextResponse.json({ kind: "statement", id: s.id, no: s.statementNo }, { status: 201 });
  }

  // action === "order" — 주문 확정 + FIFO 소진 (오프라인 매출이라 channelId 는 null)
  const productIds = items.map((i) => i.productId).filter((id): id is string => !!id);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: {
      setComponents: { include: { component: { select: { id: true, name: true } } } },
    },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  try {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderNo: genNo("ORD"),
          channelId: null,
          status: "CONFIRMED",
          customerId: body.customerId || null,
          customerName: body.customerName || null,
          customerPhone: body.customerPhone || null,
          orderDate: new Date(),
          subtotalAmount: subtotal,
          discountAmount: 0,
          shippingFee: 0,
          taxAmount,
          totalAmount,
          commissionAmount: 0,
          paymentMethod: body.paymentMethod ?? null,
          taxInvoiceRequested: !!body.taxInvoiceRequested,
          memo: body.memo || null,
          repairTicketId: body.repairTicketId || null,
          rentalId: body.rentalId || null,
          createdById: user.id,
          items: {
            create: items.map((it) => ({
              productId: it.productId ?? null,
              serviceName: it.productId ? null : it.name,
              quantity: it.quantity,
              unitPrice: it.netUnitPrice,
              totalPrice: it.lineSubtotal,
            })),
          },
        },
        include: { items: true },
      });

      const fifoConsume = async (productId: string, orderItemId: string, qty: number, name: string) => {
        await ensureBulkStock(tx, productId, qty, name);
        const lots = await tx.inventoryLot.findMany({
          where: { productId, remainingQty: { gt: 0 } },
          orderBy: { receivedAt: "asc" },
        });
        const available = lots.reduce((s, l) => s + Number(l.remainingQty), 0);
        if (available < qty) {
          throw new Error(`재고 부족 (${name}): 필요 ${qty}, 가용 ${available}`);
        }
        let need = qty;
        let totalCost = 0;
        for (const lot of lots) {
          if (need <= 0) break;
          const take = Math.min(need, Number(lot.remainingQty));
          await tx.inventoryLot.update({
            where: { id: lot.id },
            data: { remainingQty: { decrement: take } },
          });
          await tx.lotConsumption.create({
            data: { orderItemId, lotId: lot.id, quantity: take, unitCost: lot.unitCost },
          });
          totalCost += take * Number(lot.unitCost);
          need -= take;
        }
        return totalCost / qty;
      };

      for (const item of order.items) {
        // 서비스 항목(productId 없음)은 재고 소진 스킵
        if (!item.productId) continue;

        const product = productMap.get(item.productId)!;
        let unitCostSnapshot: number | null = null;

        if (product.isSet && product.setComponents.length > 0) {
          let setUnitCost = 0;
          for (const comp of product.setComponents) {
            const deductQty = Number(item.quantity) * Number(comp.quantity);
            const cuc = await fifoConsume(comp.componentId, item.id, deductQty, `세트 ${comp.component.name}`);
            setUnitCost += cuc * Number(comp.quantity);
            const inv = await tx.inventory.update({
              where: { productId: comp.componentId },
              data: { quantity: { decrement: deductQty } },
            });
            await tx.inventoryMovement.create({
              data: {
                inventoryId: inv.id,
                type: "SET_CONSUME",
                quantity: deductQty,
                balanceAfter: inv.quantity,
                referenceId: order.id,
                referenceType: "ORDER",
                memo: `POS 주문 ${order.orderNo}`,
              },
            });
          }
          unitCostSnapshot = setUnitCost;
        } else {
          unitCostSnapshot = await fifoConsume(product.id, item.id, Number(item.quantity), product.name);
          const inv = await tx.inventory.update({
            where: { productId: product.id },
            data: { quantity: { decrement: Number(item.quantity) } },
          });
          await tx.inventoryMovement.create({
            data: {
              inventoryId: inv.id,
              type: "OUTGOING",
              quantity: Number(item.quantity),
              balanceAfter: inv.quantity,
              referenceId: order.id,
              referenceType: "ORDER",
              memo: `POS 주문 ${order.orderNo}`,
            },
          });
        }

        await tx.orderItem.update({
          where: { id: item.id },
          data: { unitCostSnapshot },
        });
      }

      // RepairTicket 생성 (수리 항목 + 고객 있을 때)
      if (body.repairTicketData && body.customerId) {
        const rd = body.repairTicketData;
        const symptomParts = [rd.deviceBrand, rd.deviceModel].filter(Boolean).join(" ");
        const symptomFull = [symptomParts, rd.symptom].filter(Boolean).join(" — ") || null;
        const ticket = await tx.repairTicket.create({
          data: {
            ticketNo: genNo("TKT"),
            customerId: body.customerId,
            symptom: symptomFull,
            status: "RECEIVED",
            receivedAt: new Date(),
            createdById: user.id,
            labors: {
              create: rd.labors.map((l) => ({
                name: l.name,
                hours: 1,
                unitRate: l.unitRate,
                totalPrice: l.unitRate,
              })),
            },
          },
        });
        await tx.order.update({ where: { id: order.id }, data: { repairTicketId: ticket.id } });
      }

      // Rental 생성 (임대 항목 + 고객 있을 때)
      if (body.rentalRecords && body.rentalRecords.length > 0 && body.customerId) {
        let firstRentalId: string | null = null;
        for (const r of body.rentalRecords) {
          const rental = await tx.rental.create({
            data: {
              rentalNo: genNo("RNT"),
              assetId: r.assetId,
              customerId: body.customerId,
              status: "ACTIVE",
              startDate: new Date(r.startDate),
              endDate: new Date(r.endDate),
              rateType: "DAILY",
              unitRate: r.unitRate,
              totalUnits: r.totalDays,
              rentalAmount: r.rentalAmount,
              depositAmount: r.depositAmount ?? 0,
              depositReturned: false,
              overdueAmount: 0,
              finalAmount: r.rentalAmount,
              paymentMethod: body.paymentMethod ?? null,
              createdById: user.id,
            },
          });
          if (!firstRentalId) {
            firstRentalId = rental.id;
            await tx.order.update({ where: { id: order.id }, data: { rentalId: rental.id } });
          }
          await tx.rentalAsset.update({ where: { id: r.assetId }, data: { status: "RENTED" } });
        }
      }

      // CustomerLedger — 외상(UNPAID)이면 매출(debit) 기록
      if (body.customerId && body.paymentMethod === "UNPAID") {
        const last = await tx.customerLedger.findFirst({
          where: { customerId: body.customerId },
          orderBy: { date: "desc" },
        });
        const prevBalance = last ? Number(last.balance) : 0;
        await tx.customerLedger.create({
          data: {
            customerId: body.customerId,
            type: "SALE",
            description: `POS 주문 ${order.orderNo}`,
            debitAmount: totalAmount,
            creditAmount: 0,
            balance: prevBalance + totalAmount,
            referenceId: order.id,
            referenceType: "ORDER",
          },
        });
      }

      return order;
    });

    return NextResponse.json({ kind: "order", id: result.id, no: result.orderNo }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "주문 확정 실패";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
