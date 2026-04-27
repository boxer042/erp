import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stocktakeSchema } from "@/lib/validators/stocktake";

// 모든 활성 판매상품 + 재고 + 매핑된 공급상품 목록 조회 (실사 입력용)
export async function GET() {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      sku: true,
      unitOfMeasure: true,
      isSet: true,
      inventory: { select: { id: true, quantity: true, safetyStock: true } },
      productMappings: {
        select: {
          id: true,
          conversionRate: true,
          supplierProduct: {
            select: {
              id: true,
              name: true,
              supplierCode: true,
              supplier: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const result = products.map((p) => ({
    id: p.inventory?.id || "",
    productId: p.id,
    quantity: p.inventory?.quantity?.toString() || "0",
    safetyStock: p.inventory?.safetyStock?.toString() || "0",
    product: { id: p.id, name: p.name, sku: p.sku, unitOfMeasure: p.unitOfMeasure, isSet: p.isSet },
    mappings: p.productMappings.map((m) => ({
      id: m.id,
      supplierProductId: m.supplierProduct.id,
      supplierProductName: m.supplierProduct.name,
      supplierName: m.supplierProduct.supplier.name,
    })),
  }));

  return NextResponse.json(result);
}

// 실사 보정 일괄 적용 (로트 연동)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = stocktakeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { items } = parsed.data;

  try {
    const results = await prisma.$transaction(async (tx) => {
      const adjusted: Array<{
        productId: string;
        productName: string;
        before: number;
        after: number;
        diff: number;
      }> = [];

      for (const item of items) {
        const actualQty = parseFloat(item.actualQuantity);

        const inventory = await tx.inventory.findUnique({
          where: { productId: item.productId },
          include: { product: { select: { name: true } } },
        });

        const currentQty = inventory ? Number(inventory.quantity) : 0;
        const diff = actualQty - currentQty;

        if (Math.abs(diff) < 0.0001) continue;

        // 재고 absolute set
        const updated = await tx.inventory.upsert({
          where: { productId: item.productId },
          update: { quantity: actualQty },
          create: { productId: item.productId, quantity: actualQty },
        });

        if (diff > 0) {
          // 증가: ADJUSTMENT 로트 생성 (거래처 선택 필수)
          if (!item.supplierProductId) {
            throw new Error(
              `재고 증가 시 공급상품 선택이 필요합니다 (${inventory?.product.name || item.productId})`,
            );
          }

          // 현재 잔여 로트 가중평균 원가 계산
          const lots = await tx.inventoryLot.findMany({
            where: { productId: item.productId, remainingQty: { gt: 0 } },
            select: { remainingQty: true, unitCost: true },
          });
          const totalRemaining = lots.reduce((s, l) => s + Number(l.remainingQty), 0);
          const totalValue = lots.reduce(
            (s, l) => s + Number(l.remainingQty) * Number(l.unitCost),
            0,
          );
          const defaultUnitCost = totalRemaining > 0 ? totalValue / totalRemaining : 0;

          await tx.inventoryLot.create({
            data: {
              product: { connect: { id: item.productId } },
              ...(item.supplierProductId ? { supplierProduct: { connect: { id: item.supplierProductId } } } : {}),
              receivedQty: diff,
              remainingQty: diff,
              unitCost: defaultUnitCost,
              receivedAt: new Date(),
              source: "ADJUSTMENT",
              memo: item.memo || "실사보정 증가",
            },
          });
        } else {
          // 감소: FIFO로 로트 remainingQty 차감
          const removeQty = Math.abs(diff);
          const lots = await tx.inventoryLot.findMany({
            where: { productId: item.productId, remainingQty: { gt: 0 } },
            orderBy: { receivedAt: "asc" },
          });
          const available = lots.reduce((s, l) => s + Number(l.remainingQty), 0);
          if (available < removeQty) {
            throw new Error(
              `로트 잔량 부족 (${inventory?.product.name || item.productId}): 로트 합계 ${available}, 감소 필요 ${removeQty}. 데이터 불일치 — 먼저 입고/기초등록을 확인해주세요.`,
            );
          }
          let need = removeQty;
          for (const lot of lots) {
            if (need <= 0) break;
            const take = Math.min(need, Number(lot.remainingQty));
            await tx.inventoryLot.update({
              where: { id: lot.id },
              data: { remainingQty: { decrement: take } },
            });
            need -= take;
          }
        }

        await tx.inventoryMovement.create({
          data: {
            inventoryId: updated.id,
            type: diff > 0 ? "STOCKTAKE_PLUS" : "STOCKTAKE_MINUS",
            quantity: Math.abs(diff),
            balanceAfter: actualQty,
            reason: item.reason,
            referenceType: "STOCKTAKE",
            memo: item.memo || "실사 보정",
          },
        });

        adjusted.push({
          productId: item.productId,
          productName: inventory?.product.name || "",
          before: currentQty,
          after: actualQty,
          diff,
        });
      }

      return adjusted;
    });

    return NextResponse.json({
      success: true,
      count: results.length,
      items: results,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "실사 보정 실패";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
