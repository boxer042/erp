import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

function generateAssemblyNo() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const r = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `DIS${y}${m}${d}-${r}`;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();

  const original = await prisma.assembly.findUnique({
    where: { id },
    include: {
      product: { select: { id: true, name: true } },
      consumptions: { include: { component: { select: { name: true } } } },
    },
  });
  if (!original) {
    return NextResponse.json({ error: "원본 조립 실적을 찾을 수 없습니다" }, { status: 404 });
  }
  if (original.type !== "PRODUCE") {
    return NextResponse.json({ error: "PRODUCE 실적만 역조립할 수 있습니다" }, { status: 400 });
  }
  if (!original.producedLotId) {
    return NextResponse.json({ error: "원본에 연결된 완제품 로트가 없습니다" }, { status: 400 });
  }

  // 이미 역조립된 적 있는지 확인
  const existingReverse = await prisma.assembly.findUnique({
    where: { reverseOfId: id },
  });
  if (existingReverse) {
    return NextResponse.json({ error: "이미 역조립된 실적입니다" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const originalQty = Number(original.quantity);
      const producedLot = await tx.inventoryLot.findUnique({
        where: { id: original.producedLotId! },
      });
      if (!producedLot) {
        throw new Error("완제품 로트를 찾을 수 없습니다");
      }
      if (Number(producedLot.remainingQty) < originalQty) {
        throw new Error(
          `완제품 로트 잔량 부족: 필요 ${originalQty}, 남은 ${Number(producedLot.remainingQty)}`,
        );
      }

      // 1. 완제품 로트 차감
      await tx.inventoryLot.update({
        where: { id: producedLot.id },
        data: { remainingQty: { decrement: originalQty } },
      });

      const assemblyNo = generateAssemblyNo();

      // 2. 역조립 Assembly 레코드 생성 (먼저 만들어서 id 확보)
      const reverse = await tx.assembly.create({
        data: {
          assemblyNo,
          productId: original.productId,
          quantity: originalQty,
          type: "DISASSEMBLE",
          assembledAt: new Date(),
          memo: `역조립: ${original.assemblyNo}`,
          reverseOfId: original.id,
          createdBy: user?.id,
        },
      });

      // 3. 완제품 Inventory 감소 + 이동 기록
      const finishedInv = await tx.inventory.update({
        where: { productId: original.productId },
        data: { quantity: { decrement: originalQty } },
      });
      await tx.inventoryMovement.create({
        data: {
          inventoryId: finishedInv.id,
          type: "ADJUSTMENT_MINUS",
          quantity: originalQty,
          balanceAfter: finishedInv.quantity,
          referenceId: reverse.id,
          referenceType: "ASSEMBLY_DISASSEMBLE",
          memo: `역조립 ${assemblyNo} 완제품 회수`,
        },
      });

      // 4. 원본 구성품 로트 remainingQty 복원 + 구성품 Inventory 증가
      const perComponent = new Map<string, number>();
      for (const c of original.consumptions) {
        await tx.inventoryLot.update({
          where: { id: c.lotId },
          data: { remainingQty: { increment: c.quantity } },
        });
        perComponent.set(
          c.componentId,
          (perComponent.get(c.componentId) ?? 0) + Number(c.quantity),
        );
      }
      for (const [componentId, qty] of perComponent) {
        const inv = await tx.inventory.update({
          where: { productId: componentId },
          data: { quantity: { increment: qty } },
        });
        await tx.inventoryMovement.create({
          data: {
            inventoryId: inv.id,
            type: "ADJUSTMENT_PLUS",
            quantity: qty,
            balanceAfter: inv.quantity,
            referenceId: reverse.id,
            referenceType: "ASSEMBLY_DISASSEMBLE",
            memo: `역조립 ${assemblyNo} 구성품 복원`,
          },
        });
      }

      return reverse;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "역조립 실패";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
