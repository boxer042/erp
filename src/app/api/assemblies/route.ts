import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assemblySchema } from "@/lib/validators/assembly";
import { fifoConsume, ensureBulkStock } from "@/lib/inventory/fifo";
import { getCurrentUser } from "@/lib/auth";

function generateAssemblyNo() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const r = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ASM${y}${m}${d}-${r}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");
  const type = searchParams.get("type");

  const assemblies = await prisma.assembly.findMany({
    where: {
      ...(productId ? { productId } : {}),
      ...(type ? { type: type as "PRODUCE" | "DISASSEMBLE" } : {}),
    },
    include: {
      product: { select: { id: true, name: true, sku: true } },
      _count: { select: { consumptions: true } },
    },
    orderBy: { assembledAt: "desc" },
  });

  return NextResponse.json(assemblies);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  const body = await request.json();
  const parsed = assemblySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const quantity = parseFloat(data.quantity);
  const laborCost = data.laborCost ? parseFloat(data.laborCost) : 0;
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "조립 수량이 올바르지 않습니다" }, { status: 400 });
  }

  const product = await prisma.product.findUnique({
    where: { id: data.productId },
    select: { id: true, name: true, isSet: true },
  });
  if (!product) {
    return NextResponse.json({ error: "조립상품을 찾을 수 없습니다" }, { status: 404 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const assemblyNo = generateAssemblyNo();

      // 1. Assembly 헤더 먼저 생성 (producedLotId는 나중에 update)
      const assembly = await tx.assembly.create({
        data: {
          assemblyNo,
          productId: product.id,
          quantity,
          type: "PRODUCE",
          laborCost: data.laborCost ? laborCost : null,
          assembledAt: new Date(data.assembledAt),
          memo: data.memo,
          createdBy: user?.id,
        },
      });

      // 2. 구성품 FIFO 차감 + 소비 기록 + 재고 이동
      let totalComponentCost = 0;
      for (const comp of data.components) {
        const compQty = parseFloat(comp.quantity);
        if (!Number.isFinite(compQty) || compQty <= 0) continue;
        const totalNeed = compQty * quantity;

        const compProduct = await tx.product.findUnique({
          where: { id: comp.componentId },
          select: { name: true, isBulk: true },
        });
        const displayName = compProduct?.name ?? comp.componentId;

        // 벌크 SKU면 부족 시 자동 병 따기
        if (compProduct?.isBulk) {
          await ensureBulkStock(tx, comp.componentId, totalNeed, displayName);
        }

        const { consumptions, unitCostAvg } = await fifoConsume(
          tx,
          comp.componentId,
          totalNeed,
          displayName,
        );
        totalComponentCost += unitCostAvg * totalNeed;

        for (const c of consumptions) {
          await tx.assemblyComponentConsumption.create({
            data: {
              assemblyId: assembly.id,
              componentId: comp.componentId,
              lotId: c.lotId,
              quantity: c.quantity,
              unitCost: c.unitCost,
            },
          });
        }

        const compInv = await tx.inventory.update({
          where: { productId: comp.componentId },
          data: { quantity: { decrement: totalNeed } },
        });
        await tx.inventoryMovement.create({
          data: {
            inventoryId: compInv.id,
            type: "SET_CONSUME",
            quantity: totalNeed,
            balanceAfter: compInv.quantity,
            referenceId: assembly.id,
            referenceType: "ASSEMBLY",
            memo: `조립 ${assemblyNo} 구성품 ${displayName} 차감`,
          },
        });
      }

      const finishedUnitCost = (totalComponentCost + laborCost) / quantity;

      // 3. 완제품 Inventory row 보장 후 로트 생성
      const finishedInv = await tx.inventory.upsert({
        where: { productId: product.id },
        update: {},
        create: { productId: product.id, quantity: 0 },
      });

      const lot = await tx.inventoryLot.create({
        data: {
          product: { connect: { id: product.id } },
          receivedQty: quantity,
          remainingQty: quantity,
          unitCost: finishedUnitCost,
          receivedAt: new Date(data.assembledAt),
          source: "SET_PRODUCE",
        },
      });

      const updatedInv = await tx.inventory.update({
        where: { id: finishedInv.id },
        data: { quantity: { increment: quantity } },
      });
      await tx.inventoryMovement.create({
        data: {
          inventoryId: updatedInv.id,
          type: "SET_PRODUCE",
          quantity,
          balanceAfter: updatedInv.quantity,
          referenceId: assembly.id,
          referenceType: "ASSEMBLY",
          memo: `조립 ${assemblyNo} 완제품 생산`,
        },
      });

      // 4. Assembly.producedLotId 업데이트
      const finalAssembly = await tx.assembly.update({
        where: { id: assembly.id },
        data: { producedLotId: lot.id },
      });

      return finalAssembly;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "조립 실적 등록 실패";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
