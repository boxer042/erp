import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { initialInventorySchema } from "@/lib/validators/initial-inventory";
import { computeMovingAverage } from "@/lib/cost";
import { guardAdmin } from "@/lib/api-auth";

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
  const [, deny] = await guardAdmin();
  if (deny) return deny;
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

  let results;
  try {
    results = await prisma.$transaction(async (tx) => {
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

    // Phase 1 — 기존 spId 일괄 조회 (존재 검증 + 매핑) — N+1 방지
    const existingSpIds = [...groupMap.entries()]
      .filter(([key]) => key.startsWith("existing:"))
      .map(([, rows]) => rows[0].supplierProductId!)
      .filter(Boolean);

    const existingSps = existingSpIds.length > 0
      ? await tx.supplierProduct.findMany({
          where: { id: { in: existingSpIds } },
          select: { id: true, name: true },
        })
      : [];
    const allMappings = existingSpIds.length > 0
      ? await tx.productMapping.findMany({
          where: { supplierProductId: { in: existingSpIds } },
          select: { supplierProductId: true, productId: true, conversionRate: true },
        })
      : [];

    const existingSpMap = new Map(existingSps.map((sp) => [sp.id, sp]));
    const missingSpId = existingSpIds.find((id) => !existingSpMap.has(id));
    if (missingSpId) {
      throw new Error(
        `선택한 공급상품을 찾을 수 없습니다 (id=${missingSpId}). 페이지를 새로고침한 후 다시 시도해주세요.`,
      );
    }

    const mappingsBySp = new Map<string, typeof allMappings>();
    for (const m of allMappings) {
      if (!mappingsBySp.has(m.supplierProductId)) mappingsBySp.set(m.supplierProductId, []);
      mappingsBySp.get(m.supplierProductId)!.push(m);
    }

    // Phase 2 — 그룹별 SP create/update (병렬)
    type GroupData = {
      supplierProductId: string;
      supplierProductName: string;
      mergedQty: number;
      mergedUnitPrice: number;
      mergedOriginalPrice: number | null;
      mergedDiscountAmount: number | null;
      memo: string | undefined;
    };

    const spOps: Promise<GroupData>[] = [];
    for (const [, rows] of groupMap) {
      const firstRow = rows[0];
      const mergedQty = rows.reduce((s, r) => s + r.qty, 0);
      const totalCost = rows.reduce((s, r) => s + r.qty * r.unitPrice, 0);
      const mergedUnitPrice = mergedQty > 0 ? totalCost / mergedQty : 0;
      // 단일 행일 때만 originalPrice/discountAmount 보존
      const mergedOriginalPrice = rows.length === 1 ? firstRow.originalPrice : null;
      const mergedDiscountAmount = rows.length === 1 ? firstRow.discountAmount : null;
      // listPrice 기준은 가장 비싼 행(정가), unitPrice는 가중평균(실제 원가)
      const canonicalRow = rows.reduce((best, r) => r.unitPrice > best.unitPrice ? r : best, firstRow);

      const base = {
        mergedQty,
        mergedUnitPrice,
        mergedOriginalPrice,
        mergedDiscountAmount,
        memo: firstRow.memo,
      };

      if (!firstRow.supplierProductId && firstRow.newSupplierProduct) {
        const newSp = firstRow.newSupplierProduct;
        spOps.push(
          tx.supplierProduct
            .create({
              data: {
                supplierId: firstRow.supplierId,
                name: newSp.name,
                spec: newSp.spec || null,
                supplierCode: newSp.supplierCode || null,
                unitOfMeasure: newSp.unitOfMeasure || "EA",
                listPrice: canonicalRow.originalPrice ?? canonicalRow.unitPrice,
                unitPrice: mergedUnitPrice,
                source: "INITIAL",
              },
            })
            .then((sp) => ({ ...base, supplierProductId: sp.id, supplierProductName: sp.name })),
        );
      } else if (firstRow.supplierProductId) {
        const spId = firstRow.supplierProductId;
        spOps.push(
          tx.supplierProduct
            .update({
              where: { id: spId },
              data: {
                unitPrice: mergedUnitPrice,
                ...(canonicalRow.originalPrice != null ? { listPrice: canonicalRow.originalPrice } : {}),
                ...(firstRow.spec !== undefined ? { spec: firstRow.spec || null } : {}),
              },
            })
            .then((sp) => ({ ...base, supplierProductId: sp.id, supplierProductName: sp.name })),
        );
      }
    }

    const groupResults = await Promise.all(spOps);
    const created: Array<{ supplierProductId: string; name: string }> = groupResults.map((g) => ({
      supplierProductId: g.supplierProductId,
      name: g.supplierProductName,
    }));

    // Phase 3 — 로트 plan (메모리만, 조회·생성 없음)
    type LotPlan = {
      supplierProductId: string;
      productId: string | null;
      addQty: number;
      addUnitCost: number;
      addOriginal: number | null;
      addDiscount: number | null;
      lotMemo: string;
      movementMemo: string;
    };
    const lotPlans: LotPlan[] = [];
    for (const g of groupResults) {
      // 수량 0 — 카탈로그용. 로트/Inventory/Movement 스킵.
      if (g.mergedQty === 0) continue;

      const mappings = mappingsBySp.get(g.supplierProductId) ?? [];
      const lotMemo = g.memo || "초기등록";
      const movementMemo = g.memo || `초기등록 ${g.supplierProductName}`;

      if (mappings.length === 0) {
        lotPlans.push({
          supplierProductId: g.supplierProductId,
          productId: null,
          addQty: g.mergedQty,
          addUnitCost: g.mergedUnitPrice,
          addOriginal: g.mergedOriginalPrice,
          addDiscount: g.mergedDiscountAmount,
          lotMemo,
          movementMemo,
        });
        continue;
      }

      for (const m of mappings) {
        const rate = Number(m.conversionRate);
        lotPlans.push({
          supplierProductId: g.supplierProductId,
          productId: m.productId,
          addQty: g.mergedQty * rate,
          addUnitCost: g.mergedUnitPrice / rate,
          addOriginal: g.mergedOriginalPrice != null ? g.mergedOriginalPrice / rate : null,
          addDiscount: g.mergedDiscountAmount != null ? g.mergedDiscountAmount / rate : null,
          lotMemo,
          movementMemo,
        });
      }
    }

    // Phase 4 — 모든 로트 1쿼리 createManyAndReturn
    const now = new Date();
    const createdLots = lotPlans.length > 0
      ? await tx.inventoryLot.createManyAndReturn({
          data: lotPlans.map((p) => ({
            productId: p.productId,
            supplierProductId: p.supplierProductId,
            receivedQty: p.addQty,
            remainingQty: p.addQty,
            unitCost: p.addUnitCost,
            originalPrice: p.addOriginal,
            discountAmount: p.addDiscount,
            receivedAt: now,
            source: "INITIAL" as const,
            memo: p.lotMemo,
          })),
          select: { id: true },
        })
      : [];
    const lotsCreated = createdLots.length;

    // Phase 5 — 상품 매핑된 plan 만 inventory 처리 (오르판은 끝)
    const productPlans = lotPlans
      .map((p, i) => ({ ...p, lotId: createdLots[i]!.id }))
      .filter((p): p is typeof p & { productId: string } => p.productId !== null);

    const productIds = Array.from(new Set(productPlans.map((p) => p.productId)));
    const existingInventories = productIds.length > 0
      ? await tx.inventory.findMany({
          where: { productId: { in: productIds } },
          select: { productId: true, quantity: true, avgCost: true },
        })
      : [];
    const inventoryByProduct = new Map(existingInventories.map((inv) => [inv.productId, inv]));

    // 같은 product 에 여러 lot 가 붙으면 운동 평균을 순차 누적 — 원본 동작과 동일
    const plansByProduct = new Map<string, typeof productPlans>();
    for (const p of productPlans) {
      if (!plansByProduct.has(p.productId)) plansByProduct.set(p.productId, []);
      plansByProduct.get(p.productId)!.push(p);
    }

    type MovementPayload = {
      inventoryId: string;
      type: "INITIAL";
      quantity: number;
      balanceAfter: number;
      referenceId: string;
      referenceType: string;
      memo: string;
    };

    const upsertOps: Promise<MovementPayload[]>[] = [];
    for (const [productId, plans] of plansByProduct) {
      const existing = inventoryByProduct.get(productId);
      const prevQty = existing ? Number(existing.quantity) : 0;
      const prevAvgCost = existing?.avgCost != null ? Number(existing.avgCost) : null;

      let runningQty = prevQty;
      let runningAvg = prevAvgCost;
      const partial: Omit<MovementPayload, "inventoryId">[] = [];
      for (const p of plans) {
        runningAvg = computeMovingAverage(runningQty, runningAvg, p.addQty, p.addUnitCost);
        runningQty += p.addQty;
        partial.push({
          type: "INITIAL",
          quantity: p.addQty,
          balanceAfter: runningQty,
          referenceId: p.lotId,
          referenceType: "INITIAL_REGISTRATION",
          memo: p.movementMemo,
        });
      }
      const totalAdd = runningQty - prevQty;

      upsertOps.push(
        tx.inventory
          .upsert({
            where: { productId },
            update: {
              quantity: { increment: totalAdd },
              avgCost: runningAvg,
              avgCostUpdatedAt: now,
            },
            create: {
              productId,
              quantity: totalAdd,
              avgCost: runningAvg,
              avgCostUpdatedAt: now,
            },
            select: { id: true },
          })
          .then((inv) => partial.map((m) => ({ ...m, inventoryId: inv.id }))),
      );
    }

    const movementsNested = await Promise.all(upsertOps);
    const allMovements = movementsNested.flat();

    if (allMovements.length > 0) {
      await tx.inventoryMovement.createMany({ data: allMovements });
    }
    const inventoryUpdates = allMovements.length;

    return { created, lotsCreated, inventoryUpdates };
    }, { timeout: 30000, maxWait: 10000 });
  } catch (e: unknown) {
    // 폼이 열린 상태에서 다른 경로로 SP 가 hard-delete 된 경우 등 — 사용자에게 친절한 메시지.
    const message = e instanceof Error ? e.message : "초기등록 처리 중 오류가 발생했습니다";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    count: results.created.length,
    items: results.created,
    lotsCreated: results.lotsCreated,
    inventoryUpdates: results.inventoryUpdates,
  });
}
