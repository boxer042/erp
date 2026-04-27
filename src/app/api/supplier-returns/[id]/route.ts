import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rebalanceSupplierLedger } from "@/lib/supplier-ledger";
import { getCurrentUser } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supplierReturn = await prisma.supplierReturn.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, name: true, paymentMethod: true } },
      createdBy: { select: { name: true } },
      items: {
        include: {
          supplierProduct: {
            select: {
              id: true, name: true, supplierCode: true, unitOfMeasure: true, unitPrice: true,
              productMappings: {
                select: {
                  id: true,
                  productId: true,
                  conversionRate: true,
                  product: { select: { id: true, name: true, sku: true } },
                },
              },
            },
          },
        },
      },
      exchangeIncoming: { select: { id: true, incomingNo: true, status: true } },
    },
  });

  if (!supplierReturn) {
    return NextResponse.json({ error: "반품을 찾을 수 없습니다" }, { status: 404 });
  }

  return NextResponse.json(supplierReturn);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { action } = body as { action: "confirm" | "cancel" };

  const supplierReturn = await prisma.supplierReturn.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          supplierProduct: {
            include: {
              productMappings: { select: { productId: true, conversionRate: true } },
            },
          },
        },
      },
      supplier: { select: { paymentMethod: true } },
    },
  });

  if (!supplierReturn) {
    return NextResponse.json({ error: "반품을 찾을 수 없습니다" }, { status: 404 });
  }

  if (supplierReturn.status !== "PENDING") {
    return NextResponse.json({ error: "대기 상태의 반품만 처리할 수 있습니다" }, { status: 400 });
  }

  if (action === "cancel") {
    const updated = await prisma.supplierReturn.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    return NextResponse.json(updated);
  }

  // === 반품 확정 트랜잭션 ===
  try {
    await prisma.$transaction(async (tx) => {
      // 1. 상태 변경
      await tx.supplierReturn.update({
        where: { id },
        data: { status: "CONFIRMED" },
      });

      // 2. 로트 FIFO 차감 + 재고 감소
      for (const item of supplierReturn.items) {
        // 2-a. 공급상품 기준 로트에서 반품 수량만큼 FIFO 차감
        const returnQty = Number(item.quantity);
        const lots = await tx.inventoryLot.findMany({
          where: {
            supplierProductId: item.supplierProductId,
            remainingQty: { gt: 0 },
          },
          orderBy: { receivedAt: "asc" },
        });
        const available = lots.reduce((s, l) => s + Number(l.remainingQty), 0);
        if (available < returnQty) {
          throw new Error(
            `공급상품 로트 잔량 부족 (${item.supplierProduct.name}): 필요 ${returnQty}, 가용 ${available}. 이미 판매된 수량이 포함되어 반품할 수 없습니다.`,
          );
        }
        let need = returnQty;
        for (const lot of lots) {
          if (need <= 0) break;
          const take = Math.min(need, Number(lot.remainingQty));
          await tx.inventoryLot.update({
            where: { id: lot.id },
            data: { remainingQty: { decrement: take } },
          });
          need -= take;
        }

        // 2-b. 매핑된 판매상품 재고도 차감 (화면 Inventory 캐시 유지)
        const mappings = item.supplierProduct.productMappings;
        for (const mapping of mappings) {
          const removeQty = Number(item.quantity) * Number(mapping.conversionRate);

          const inventory = await tx.inventory.upsert({
            where: { productId: mapping.productId },
            update: { quantity: { decrement: removeQty } },
            create: { productId: mapping.productId, quantity: -removeQty },
          });

          await tx.inventoryMovement.create({
            data: {
              inventoryId: inventory.id,
              type: "RETURN",
              quantity: -removeQty,
              balanceAfter: inventory.quantity,
              referenceId: supplierReturn.id,
              referenceType: "SUPPLIER_RETURN",
              memo: `반품 ${supplierReturn.returnNo}`,
            },
          });
        }
      }

    // 3. 외상 거래처면 원장에 REFUND 기록 (VAT 포함 금액)
    if (supplierReturn.supplier.paymentMethod === "CREDIT") {
      const goodsAmount = supplierReturn.items.reduce((sum, item) => {
        const supply = Number(item.totalPrice);
        const tax = item.supplierProduct.isTaxable ? Math.round(supply * 0.1) : 0;
        return sum + supply + tax;
      }, 0);

      const returnCost = Number(supplierReturn.returnCost ?? 0);
      const costType = supplierReturn.returnCostType;
      let refundAmount = goodsAmount;
      if (returnCost > 0) {
        if (costType === "ADD") refundAmount = goodsAmount + returnCost;
        else if (costType === "DEDUCT") refundAmount = goodsAmount - returnCost;
      }

      const lastLedger = await tx.supplierLedger.findFirst({
        where: { supplierId: supplierReturn.supplierId },
        orderBy: { createdAt: "desc" },
      });
      const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;
      const newBalance = prevBalance - refundAmount;

      const costLabel = returnCost > 0 && costType
        ? costType === "ADD" ? ` (반품비용 청구 포함 +₩${returnCost.toLocaleString()})` : costType === "DEDUCT" ? ` (반품비용 차감 -₩${returnCost.toLocaleString()})` : ""
        : "";

      await tx.supplierLedger.create({
        data: {
          supplierId: supplierReturn.supplierId,
          date: supplierReturn.returnDate,
          type: "REFUND",
          description: `반품 ${supplierReturn.returnNo}${costLabel}`,
          debitAmount: 0,
          creditAmount: refundAmount,
          balance: newBalance,
          referenceId: supplierReturn.id,
          referenceType: "SUPPLIER_RETURN",
        },
      });

      await rebalanceSupplierLedger(tx, supplierReturn.supplierId);
    }

    // 4. 반품 비용 경비 기록 (ADD: 회수가능, SEPARATE: 우리 부담)
    const returnCost = Number(supplierReturn.returnCost ?? 0);
    const costType = supplierReturn.returnCostType;
    if (returnCost > 0 && (costType === "ADD" || costType === "SEPARATE")) {
      const user = await getCurrentUser();
      await tx.expense.create({
        data: {
          date: supplierReturn.returnDate,
          amount: returnCost,
          category: "SHIPPING",
          isTaxable: supplierReturn.returnCostIsTaxable,
          description: supplierReturn.returnCostNote
            ? `반품 비용 — ${supplierReturn.returnCostNote} (반품 ${supplierReturn.returnNo})`
            : `반품 비용 (반품 ${supplierReturn.returnNo})`,
          supplierId: supplierReturn.supplierId,
          referenceId: supplierReturn.id,
          referenceType: "SUPPLIER_RETURN",
          recoverable: costType === "ADD",
          memo: costType === "ADD" ? "거래처 청구" : null,
          createdById: user?.id ?? null,
        },
      });
    }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "반품 확정 실패";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const updated = await prisma.supplierReturn.findUnique({
    where: { id },
    include: {
      supplier: { select: { name: true } },
      items: {
        include: { supplierProduct: { select: { name: true } } },
      },
      exchangeIncoming: { select: { id: true, incomingNo: true, status: true } },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supplierReturn = await prisma.supplierReturn.findUnique({ where: { id } });

  if (!supplierReturn) {
    return NextResponse.json({ error: "반품을 찾을 수 없습니다" }, { status: 404 });
  }

  if (supplierReturn.status !== "PENDING") {
    return NextResponse.json({ error: "대기 상태의 반품만 삭제할 수 있습니다" }, { status: 400 });
  }

  await prisma.supplierReturn.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
