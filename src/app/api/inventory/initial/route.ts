import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { initialInventorySchema } from "@/lib/validators/initial-inventory";
import { computeMovingAverage } from "@/lib/cost";

// 초기 등록 이력 조회
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const supplierId = searchParams.get("supplierId");

  const products = await prisma.supplierProduct.findMany({
    where: {
      source: "INITIAL",
      isActive: true,
      ...(supplierId ? { supplierId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { supplierCode: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    include: { supplier: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(products);
}

// 초기 등록 일괄 처리 — 공급상품 마스터 + 기초재고 로트 생성
export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = initialInventorySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { items } = parsed.data;

  // 1회성 가드 사전 검사 — 기존 공급상품 중 이미 INITIAL 로트가 있는 것
  const existingSupplierProductIds = items
    .map((i) => i.supplierProductId)
    .filter((id): id is string => !!id);

  let duplicates: Array<{ supplierProductId: string; name: string }> = [];
  if (existingSupplierProductIds.length > 0) {
    const duplicateLots = await prisma.inventoryLot.findMany({
      where: {
        supplierProductId: { in: existingSupplierProductIds },
        source: "INITIAL",
      },
      select: {
        supplierProductId: true,
        supplierProduct: { select: { name: true } },
      },
    });

    const seen = new Set<string>();
    duplicates = duplicateLots
      .filter((l) => {
        if (!l.supplierProductId || seen.has(l.supplierProductId)) return false;
        seen.add(l.supplierProductId);
        return true;
      })
      .map((l) => ({
        supplierProductId: l.supplierProductId!,
        name: l.supplierProduct?.name ?? "",
      }));
  }

  if (duplicates.length > 0) {
    return NextResponse.json(
      {
        error: "다음 공급상품은 이미 초기등록되어 있습니다. 해당 행을 제거하고 다시 시도해주세요.",
        duplicates,
      },
      { status: 409 },
    );
  }

  const results = await prisma.$transaction(async (tx) => {
    const created: Array<{ supplierProductId: string; name: string }> = [];
    let lotsCreated = 0;
    let inventoryUpdates = 0;

    // 같은 공급상품(기존 spId 또는 신규 name+spec)끼리 묶어 1로트로 합산
    type ParsedRow = {
      qty: number;
      unitPrice: number;
      originalPrice: number | null;
      discountAmount: number | null;
      supplierProductId?: string;
      supplierId: string;
      newSupplierProduct?: { name: string; spec?: string; supplierCode?: string; unitOfMeasure?: string };
      spec?: string;
      memo?: string;
    };
    const groupMap = new Map<string, ParsedRow[]>();
    for (const item of items) {
      const key = item.supplierProductId
        ? `existing:${item.supplierProductId}`
        : `new:${item.newSupplierProduct?.name || ""}||${item.newSupplierProduct?.spec || ""}`;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push({
        qty: parseFloat(item.quantity),
        unitPrice: parseFloat(item.unitPrice),
        originalPrice: item.originalPrice && item.originalPrice !== "" ? parseFloat(item.originalPrice) : null,
        discountAmount: item.discountAmount && item.discountAmount !== "" ? parseFloat(item.discountAmount) : null,
        supplierProductId: item.supplierProductId,
        supplierId: item.supplierId,
        newSupplierProduct: item.newSupplierProduct,
        spec: item.spec,
        memo: item.memo,
      });
    }

    // 매핑 일괄 조회 (N+1 방지) — 기존 spId 그룹만 해당
    const existingSpIds = [...groupMap.entries()]
      .filter(([key]) => key.startsWith("existing:"))
      .map(([, rows]) => rows[0].supplierProductId!)
      .filter(Boolean);
    const allMappings = existingSpIds.length > 0
      ? await tx.productMapping.findMany({
          where: { supplierProductId: { in: existingSpIds } },
          select: { supplierProductId: true, productId: true, conversionRate: true },
        })
      : [];
    const mappingsBySp = new Map<string, typeof allMappings>();
    for (const m of allMappings) {
      if (!mappingsBySp.has(m.supplierProductId)) mappingsBySp.set(m.supplierProductId, []);
      mappingsBySp.get(m.supplierProductId)!.push(m);
    }

    for (const [, rows] of groupMap) {
      const firstRow = rows[0];

      // 합산 수량 및 가중평균 단가
      const mergedQty = rows.reduce((s, r) => s + r.qty, 0);
      const totalCost = rows.reduce((s, r) => s + r.qty * r.unitPrice, 0);
      const mergedUnitPrice = mergedQty > 0 ? totalCost / mergedQty : 0;
      // 단일 행일 때만 originalPrice/discountAmount 보존
      const mergedOriginalPrice = rows.length === 1 ? firstRow.originalPrice : null;
      const mergedDiscountAmount = rows.length === 1 ? firstRow.discountAmount : null;
      // listPrice 기준은 가장 비싼 행(정가), unitPrice는 가중평균(실제 원가)
      const canonicalRow = rows.reduce((best, r) => r.unitPrice > best.unitPrice ? r : best, firstRow);

      let supplierProductId = firstRow.supplierProductId;
      let supplierProductName = "";

      if (!supplierProductId && firstRow.newSupplierProduct) {
        const sp = await tx.supplierProduct.create({
          data: {
            supplierId: firstRow.supplierId,
            name: firstRow.newSupplierProduct.name,
            spec: firstRow.newSupplierProduct.spec || null,
            supplierCode: firstRow.newSupplierProduct.supplierCode || null,
            unitOfMeasure: firstRow.newSupplierProduct.unitOfMeasure || "EA",
            listPrice: canonicalRow.originalPrice ?? canonicalRow.unitPrice,
            unitPrice: mergedUnitPrice,
            source: "INITIAL",
          },
        });
        supplierProductId = sp.id;
        supplierProductName = sp.name;
        created.push({ supplierProductId: sp.id, name: sp.name });
      } else if (supplierProductId) {
        const sp = await tx.supplierProduct.update({
          where: { id: supplierProductId },
          data: {
            unitPrice: mergedUnitPrice,
            ...(canonicalRow.originalPrice != null ? { listPrice: canonicalRow.originalPrice } : {}),
            ...(firstRow.spec !== undefined ? { spec: firstRow.spec || null } : {}),
          },
        });
        supplierProductName = sp.name;
        created.push({ supplierProductId: sp.id, name: sp.name });
      }

      if (!supplierProductId) continue;

      const mappings = supplierProductId && mappingsBySp.has(supplierProductId)
        ? mappingsBySp.get(supplierProductId)!
        : await tx.productMapping.findMany({
            where: { supplierProductId },
            select: { productId: true, conversionRate: true },
          });

      if (mappings.length === 0) {
        await tx.inventoryLot.create({
          data: {
            supplierProduct: { connect: { id: supplierProductId } },
            receivedQty: mergedQty,
            remainingQty: mergedQty,
            unitCost: mergedUnitPrice,
            originalPrice: mergedOriginalPrice,
            discountAmount: mergedDiscountAmount,
            receivedAt: new Date(),
            source: "INITIAL",
            memo: firstRow.memo || "초기등록",
          },
        });
        lotsCreated++;
        continue;
      }

      for (const mapping of mappings) {
        const rate = Number(mapping.conversionRate);
        const addQty = mergedQty * rate;
        const addUnitCost = mergedUnitPrice / rate;
        const addOriginal = mergedOriginalPrice != null ? mergedOriginalPrice / rate : null;
        const addDiscount = mergedDiscountAmount != null ? mergedDiscountAmount / rate : null;

        const lot = await tx.inventoryLot.create({
          data: {
            product: { connect: { id: mapping.productId } },
            supplierProduct: { connect: { id: supplierProductId } },
            receivedQty: addQty,
            remainingQty: addQty,
            unitCost: addUnitCost,
            originalPrice: addOriginal,
            discountAmount: addDiscount,
            receivedAt: new Date(),
            source: "INITIAL",
            memo: firstRow.memo || "초기등록",
          },
        });
        lotsCreated++;

        const existingInv = await tx.inventory.findUnique({
          where: { productId: mapping.productId },
        });
        const prevQty = existingInv ? Number(existingInv.quantity) : 0;
        const prevAvgCost = existingInv?.avgCost != null ? Number(existingInv.avgCost) : null;
        const newAvgCost = computeMovingAverage(prevQty, prevAvgCost, addQty, addUnitCost);

        const inventory = await tx.inventory.upsert({
          where: { productId: mapping.productId },
          update: {
            quantity: { increment: addQty },
            avgCost: newAvgCost,
            avgCostUpdatedAt: new Date(),
          },
          create: {
            productId: mapping.productId,
            quantity: addQty,
            avgCost: newAvgCost,
            avgCostUpdatedAt: new Date(),
          },
        });

        await tx.inventoryMovement.create({
          data: {
            inventoryId: inventory.id,
            type: "INITIAL",
            quantity: addQty,
            balanceAfter: inventory.quantity,
            referenceId: lot.id,
            referenceType: "INITIAL_REGISTRATION",
            memo: firstRow.memo || `초기등록 ${supplierProductName}`,
          },
        });
        inventoryUpdates++;
      }
    }

    return { created, lotsCreated, inventoryUpdates };
  });

  return NextResponse.json({
    success: true,
    count: results.created.length,
    items: results.created,
    lotsCreated: results.lotsCreated,
    inventoryUpdates: results.inventoryUpdates,
  });
}
