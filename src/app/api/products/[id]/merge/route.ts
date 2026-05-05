import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

// GET: 합치기 영향 미리보기
// /api/products/[id]/merge?targetId=xxx
//   id     = source (흡수당하는 쪽)
//   target = 흡수하는 쪽 (이쪽으로 데이터 이전)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await guardUser();
  if (deny) return deny;
  const { id: sourceId } = await params;
  const { searchParams } = new URL(request.url);
  const targetId = searchParams.get("targetId");
  if (!targetId) {
    return NextResponse.json({ error: "targetId가 필요합니다" }, { status: 400 });
  }
  if (sourceId === targetId) {
    return NextResponse.json({ error: "같은 상품과 합칠 수 없습니다" }, { status: 400 });
  }

  const [source, target] = await Promise.all([
    prisma.product.findUnique({
      where: { id: sourceId },
      select: {
        id: true, name: true, sku: true, isCanonical: true, isBulk: true,
        canonicalProductId: true, bulkProductId: true,
        inventory: { select: { quantity: true } },
        _count: {
          select: {
            productMappings: true, inventoryLots: true, orderItems: true,
            quotationItems: true, statementItems: true, channelPricings: true,
            sellingCosts: true, media: true, variants: true, salesContainers: true,
            setComponents: true, partOfSets: true,
          },
        },
      },
    }),
    prisma.product.findUnique({
      where: { id: targetId },
      select: {
        id: true, name: true, sku: true, isCanonical: true, isBulk: true,
        inventory: { select: { quantity: true } },
      },
    }),
  ]);

  if (!source) return NextResponse.json({ error: "원본 상품을 찾을 수 없습니다" }, { status: 404 });
  if (!target) return NextResponse.json({ error: "대상 상품을 찾을 수 없습니다" }, { status: 404 });

  const blockers: string[] = [];
  if (source.isCanonical || target.isCanonical) blockers.push("그룹(canonical) 상품은 합칠 수 없습니다");
  if (source.canonicalProductId || source.bulkProductId) blockers.push("변형 또는 벌크 상품은 합칠 수 없습니다");
  if (source._count.variants > 0) blockers.push("원본에 변형 상품이 있습니다");
  if (source._count.salesContainers > 0) blockers.push("원본에 판매용기 관계가 있습니다");
  if (source._count.partOfSets > 0) blockers.push("원본이 다른 세트의 구성품입니다 (수동 정리 필요)");
  if (source._count.setComponents > 0) blockers.push("원본 자체가 세트입니다 (수동 정리 필요)");

  return NextResponse.json({
    source: {
      id: source.id, name: source.name, sku: source.sku,
      inventoryQty: source.inventory ? Number(source.inventory.quantity) : 0,
    },
    target: {
      id: target.id, name: target.name, sku: target.sku,
      inventoryQty: target.inventory ? Number(target.inventory.quantity) : 0,
    },
    impact: {
      mappings: source._count.productMappings,
      lots: source._count.inventoryLots,
      orderItems: source._count.orderItems,
      quotationItems: source._count.quotationItems,
      statementItems: source._count.statementItems,
      channelPricings: source._count.channelPricings,
      sellingCosts: source._count.sellingCosts,
      media: source._count.media,
    },
    blockers,
  });
}

// POST: 합치기 실행
// body: { targetId: string }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await guardUser();
  if (deny) return deny;
  const { id: sourceId } = await params;
  const body = await request.json();
  const targetId: string | undefined = body?.targetId;
  if (!targetId) {
    return NextResponse.json({ error: "targetId가 필요합니다" }, { status: 400 });
  }
  if (sourceId === targetId) {
    return NextResponse.json({ error: "같은 상품과 합칠 수 없습니다" }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const [source, target] = await Promise.all([
        tx.product.findUnique({
          where: { id: sourceId },
          include: { inventory: true },
        }),
        tx.product.findUnique({
          where: { id: targetId },
          include: { inventory: true },
        }),
      ]);
      if (!source) throw new Error("원본 상품을 찾을 수 없습니다");
      if (!target) throw new Error("대상 상품을 찾을 수 없습니다");
      if (source.isCanonical || target.isCanonical) {
        throw new Error("그룹(canonical) 상품은 합칠 수 없습니다");
      }
      if (source.canonicalProductId || source.bulkProductId) {
        throw new Error("변형 또는 벌크 상품은 합칠 수 없습니다");
      }

      // 1. ProductMapping — 충돌 시 source 매핑 삭제, 아니면 productId 재할당
      const targetMappings = await tx.productMapping.findMany({
        where: { productId: targetId },
        select: { supplierProductId: true },
      });
      const targetSpIds = new Set(targetMappings.map((m) => m.supplierProductId));
      const sourceMappings = await tx.productMapping.findMany({
        where: { productId: sourceId },
        select: { id: true, supplierProductId: true },
      });
      for (const m of sourceMappings) {
        if (targetSpIds.has(m.supplierProductId)) {
          await tx.productMapping.delete({ where: { id: m.id } });
        } else {
          await tx.productMapping.update({
            where: { id: m.id },
            data: { productId: targetId },
          });
        }
      }

      // 2. InventoryLot productId 재할당
      await tx.inventoryLot.updateMany({
        where: { productId: sourceId },
        data: { productId: targetId },
      });

      // 3. Inventory 합산
      if (source.inventory) {
        const srcQty = Number(source.inventory.quantity);
        const srcAvg = source.inventory.avgCost != null ? Number(source.inventory.avgCost) : null;
        if (target.inventory) {
          const tgtQty = Number(target.inventory.quantity);
          const tgtAvg = target.inventory.avgCost != null ? Number(target.inventory.avgCost) : null;
          const totalQty = srcQty + tgtQty;
          let newAvgCost: number | null = tgtAvg;
          if (totalQty > 0 && (srcAvg != null || tgtAvg != null)) {
            const sa = srcAvg ?? 0;
            const ta = tgtAvg ?? 0;
            newAvgCost = (srcQty * sa + tgtQty * ta) / totalQty;
          }
          await tx.inventory.update({
            where: { id: target.inventory.id },
            data: {
              quantity: totalQty,
              avgCost: newAvgCost,
              avgCostUpdatedAt: new Date(),
            },
          });
          // source inventory에 매달린 movements를 target으로 이전 (FK 제약 보존)
          await tx.inventoryMovement.updateMany({
            where: { inventoryId: source.inventory.id },
            data: { inventoryId: target.inventory.id },
          });
          await tx.inventory.delete({ where: { id: source.inventory.id } });
        } else {
          await tx.inventory.update({
            where: { id: source.inventory.id },
            data: { productId: targetId },
          });
        }
      }

      // 4. 부속 테이블 productId 재할당 (병렬, unique 충돌 가능성 있는 건 개별 처리)
      const safeUpdates = [
        tx.orderItem.updateMany({ where: { productId: sourceId }, data: { productId: targetId } }),
        tx.quotationItem.updateMany({ where: { productId: sourceId }, data: { productId: targetId } }),
        tx.statementItem.updateMany({ where: { productId: sourceId }, data: { productId: targetId } }),
        tx.repairPackagePart.updateMany({ where: { productId: sourceId }, data: { productId: targetId } }),
        tx.productMedia.updateMany({ where: { productId: sourceId }, data: { productId: targetId } }),
        tx.sellingCost.updateMany({ where: { productId: sourceId }, data: { productId: targetId } }),
        tx.repairPart.updateMany({ where: { productId: sourceId }, data: { productId: targetId } }),
        tx.rentalAsset.updateMany({ where: { productId: sourceId }, data: { productId: targetId } }),
        tx.serialItem.updateMany({ where: { productId: sourceId }, data: { productId: targetId } }),
        tx.assemblyComponentConsumption.updateMany({ where: { componentId: sourceId }, data: { componentId: targetId } }),
        tx.assemblyPresetItem.updateMany({ where: { productId: sourceId }, data: { productId: targetId } }),
        tx.productSpecValue.updateMany({ where: { productId: sourceId }, data: { productId: targetId } }),
        tx.customerMachine.updateMany({ where: { productId: sourceId }, data: { productId: targetId } }),
        tx.assembly.updateMany({ where: { productId: sourceId }, data: { productId: targetId } }),
        tx.repairTicket.updateMany({ where: { repairProductId: sourceId }, data: { repairProductId: targetId } }),
        tx.setComponent.updateMany({ where: { componentId: sourceId }, data: { componentId: targetId } }),
      ];
      await Promise.all(safeUpdates);

      // 5. ChannelPricing — (channelId, productId) unique 충돌 처리
      const sourceCps = await tx.channelPricing.findMany({
        where: { productId: sourceId },
        select: { id: true, channelId: true },
      });
      const targetCps = await tx.channelPricing.findMany({
        where: { productId: targetId },
        select: { channelId: true },
      });
      const targetChannelIds = new Set(targetCps.map((c) => c.channelId));
      for (const cp of sourceCps) {
        if (targetChannelIds.has(cp.channelId)) {
          await tx.channelPricing.delete({ where: { id: cp.id } });
        } else {
          await tx.channelPricing.update({
            where: { id: cp.id },
            data: { productId: targetId },
          });
        }
      }

      // 6. AssemblyTemplateSlot.defaultProductId — 단순 재할당 (unique 없음)
      await tx.assemblyTemplateSlot.updateMany({
        where: { defaultProductId: sourceId },
        data: { defaultProductId: targetId },
      });

      // 7. source 비활성 + 이름에 마커
      await tx.product.update({
        where: { id: sourceId },
        data: {
          isActive: false,
          name: source.name.endsWith(" (병합됨)") ? source.name : `${source.name} (병합됨)`,
        },
      });
    }, { timeout: 30000, maxWait: 10000 });

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "합치기 실패";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
