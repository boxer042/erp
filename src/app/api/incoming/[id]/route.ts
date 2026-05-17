import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeMovingAverage } from "@/lib/cost";
import { rebalanceSupplierLedger } from "@/lib/supplier-ledger";
import { incomingSchema } from "@/lib/validators/incoming";
import { computeShippingNetPerUnit } from "@/lib/incoming-shipping";
import { recalcIncomingExpense } from "@/lib/incoming-recalc";
import { recalcPurchaseOrderProgress } from "@/lib/purchase-order";
import { recordAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import {
  restorePriceHistoryForIncoming,
  cleanupOrphanedSupplierProduct,
} from "@/lib/incoming-cleanup";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const incoming = await prisma.incoming.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, name: true, paymentMethod: true } },
      createdBy: { select: { name: true } },
      items: {
        include: {
          supplierProduct: {
            select: {
              id: true, name: true, supplierCode: true, spec: true, unitOfMeasure: true, unitPrice: true, isTaxable: true,
              productMappings: {
                select: {
                  id: true,
                  product: { select: { id: true, name: true, sku: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!incoming) {
    return NextResponse.json({ error: "입고를 찾을 수 없습니다" }, { status: 404 });
  }

  return NextResponse.json(incoming);
}

// 입고 확인/취소/수정
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { action } = body as { action?: "confirm" | "cancel" | "update" | "update-shipping" | "unconfirm" };

  const incoming = await prisma.incoming.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          supplierProduct: {
            include: {
              productMappings: { select: { productId: true, conversionRate: true } },
              incomingCosts: { where: { isActive: true } },
            },
          },
        },
      },
      supplier: { select: { paymentMethod: true } },
    },
  });

  if (!incoming) {
    return NextResponse.json({ error: "입고를 찾을 수 없습니다" }, { status: 404 });
  }

  // === CONFIRMED 입고 택배비 후기입 ===
  if (action === "update-shipping") {
    if (incoming.status !== "CONFIRMED") {
      return NextResponse.json({ error: "확인된 입고만 택배비를 수정할 수 있습니다" }, { status: 400 });
    }

    const { shippingCost: rawCost, shippingIsTaxable, shippingDeducted, items: itemOverrides } = body as {
      shippingCost: string;
      shippingIsTaxable: boolean;
      shippingDeducted: boolean;
      items?: Array<{ id: string; itemShippingCost: string | null; itemShippingIsTaxable?: boolean }>;
    };
    const newShippingCost = parseFloat(rawCost) || 0;

    await prisma.$transaction(async (tx) => {
      // 1. Incoming 택배비 필드 업데이트
      await tx.incoming.update({
        where: { id },
        data: { shippingCost: newShippingCost, shippingIsTaxable, shippingDeducted },
      });

      // 1b. 품목별 itemShippingCost 업데이트 (있을 때만)
      const overrideById = new Map<string, { value: number | null; taxable: boolean }>();
      if (Array.isArray(itemOverrides)) {
        for (const o of itemOverrides) {
          const raw = o.itemShippingCost;
          const value = raw === null || raw === "" || raw === undefined
            ? null
            : (parseFloat(raw) || 0);
          overrideById.set(o.id, { value, taxable: o.itemShippingIsTaxable ?? true });
        }
        await Promise.all(
          Array.from(overrideById.entries()).map(([itemId, ov]) =>
            tx.incomingItem.update({
              where: { id: itemId },
              data: {
                itemShippingCost: ov.value,
                itemShippingIsTaxable: ov.taxable,
              },
            })
          )
        );
      }

      // 2. 각 IncomingItem unitCostSnapshot 재계산 + InventoryLot unitCost 갱신
      const itemsForCalc = incoming.items.map((item) => {
        const ov = overrideById.get(item.id);
        const effItemShipping = ov
          ? ov.value
          : (item.itemShippingCost === null || item.itemShippingCost === undefined
              ? null
              : Number(item.itemShippingCost));
        const effItemTaxable = ov ? ov.taxable : item.itemShippingIsTaxable;
        return { ...item, _effItemShipping: effItemShipping, _effItemTaxable: effItemTaxable };
      });

      const shippingNetMap = computeShippingNetPerUnit(
        itemsForCalc.map((i) => ({
          id: i.id,
          quantity: Number(i.quantity),
          totalPrice: Number(i.totalPrice),
          itemShippingCost: i._effItemShipping,
          itemShippingIsTaxable: i._effItemTaxable,
        })),
        { shippingCost: newShippingCost, shippingIsTaxable, shippingDeducted }
      );

      // Step A: 아이템별 기본 원가 계산
      const baseCalcs = itemsForCalc.map((item) => {
        const qty = Number(item.quantity);
        const unitPrice = Number(item.unitPrice);
        const shippingNetPerUnit = shippingNetMap.get(item.id) ?? 0;

        const incomingCostPerUnit = item.supplierProduct.incomingCosts
          .filter((c) => c.perUnit)
          .reduce((sum, c) => {
            const raw = c.costType === "FIXED"
              ? Number(c.value)
              : unitPrice * Number(c.value) / 100;
            return sum + (c.isTaxable ? raw / 1.1 : raw);
          }, 0);

        const baseSnapshot = unitPrice + shippingNetPerUnit + incomingCostPerUnit;
        return { item, qty, baseSnapshot };
      });

      // Step B: 같은 supplierProductId끼리 가중평균 (10+1 프로모션 지원)
      const groupAvgBySpId = new Map<string, number>();
      const groups = new Map<string, typeof baseCalcs>();
      for (const calc of baseCalcs) {
        const key = calc.item.supplierProductId;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(calc);
      }
      for (const [spId, rows] of groups) {
        const totalQty = rows.reduce((s, r) => s + r.qty, 0);
        const totalCost = rows.reduce((s, r) => s + r.qty * r.baseSnapshot, 0);
        groupAvgBySpId.set(spId, totalQty > 0 ? totalCost / totalQty : 0);
      }

      const itemSnapshots = baseCalcs.map(({ item }) => ({
        item,
        newUnitCostSnapshot: groupAvgBySpId.get(item.supplierProductId)!,
      }));

      // 모든 IncomingItem 업데이트 + 관련 InventoryLot 일괄 조회를 병렬로
      const itemIds = itemSnapshots.map((s) => s.item.id);
      const [, allLots] = await Promise.all([
        Promise.all(
          itemSnapshots.map(({ item, newUnitCostSnapshot }) =>
            tx.incomingItem.update({
              where: { id: item.id },
              data: { unitCostSnapshot: newUnitCostSnapshot },
            })
          )
        ),
        tx.inventoryLot.findMany({
          where: { incomingItemId: { in: itemIds } },
          select: { id: true, productId: true, incomingItemId: true },
        }),
      ]);

      // 메모리에서 lot별 새 unitCost 계산 후 병렬 update
      const snapshotByItemId = new Map(itemSnapshots.map((s) => [s.item.id, s]));
      await Promise.all(
        allLots.map((lot) => {
          const snap = lot.incomingItemId ? snapshotByItemId.get(lot.incomingItemId) : undefined;
          if (!snap) return Promise.resolve();
          let lotUnitCost = snap.newUnitCostSnapshot;
          if (lot.productId) {
            const mapping = snap.item.supplierProduct.productMappings.find(
              (m) => m.productId === lot.productId
            );
            if (mapping) {
              lotUnitCost = snap.newUnitCostSnapshot / Number(mapping.conversionRate);
            }
          }
          return tx.inventoryLot.update({
            where: { id: lot.id },
            data: { unitCost: lotUnitCost },
          });
        })
      );

      // 3. 배송비 차감 원장 처리 (paymentMethod 무관)
      {
        const existingAdj = await tx.supplierLedger.findFirst({
          where: {
            referenceId: id,
            referenceType: "INCOMING",
            type: "ADJUSTMENT",
            description: { contains: "배송비 차감" },
          },
        });

        if (existingAdj) {
          if (shippingDeducted && newShippingCost > 0) {
            await tx.supplierLedger.update({
              where: { id: existingAdj.id },
              data: { creditAmount: newShippingCost },
            });
          } else {
            await tx.supplierLedger.delete({ where: { id: existingAdj.id } });
          }
        } else if (shippingDeducted && newShippingCost > 0) {
          const lastLedger = await tx.supplierLedger.findFirst({
            where: { supplierId: incoming.supplierId },
            orderBy: { createdAt: "desc" },
          });
          const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;
          await tx.supplierLedger.create({
            data: {
              supplierId: incoming.supplierId,
              date: incoming.incomingDate,
              type: "ADJUSTMENT",
              description: `배송비 차감 (입고 ${incoming.incomingNo})`,
              debitAmount: 0,
              creditAmount: newShippingCost,
              balance: prevBalance - newShippingCost,
              referenceId: id,
              referenceType: "INCOMING",
            },
          });
        }

        await rebalanceSupplierLedger(tx, incoming.supplierId);
      }

      // 4. 경비 레코드 — 헤더 + 품목 직접 운임 합산 통합 헬퍼
      await recalcIncomingExpense(tx, incoming.id);
    });

    const updated = await prisma.incoming.findUnique({
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
                    product: { select: { id: true, name: true, sku: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    return NextResponse.json(updated);
  }

  // === 확인된 입고 되돌리기 (CONFIRMED → PENDING) ===
  if (action === "unconfirm") {
    if (incoming.status !== "CONFIRMED") {
      return NextResponse.json({ error: "확인된 입고만 되돌릴 수 있습니다" }, { status: 400 });
    }

    const itemIds = incoming.items.map((i) => i.id);

    // 가드 1: 이 입고가 만든 로트 — 소진/차감 흔적 없어야 함
    const ownLots = await prisma.inventoryLot.findMany({
      where: { incomingItemId: { in: itemIds } },
      select: {
        id: true,
        productId: true,
        supplierProductId: true,
        receivedQty: true,
        remainingQty: true,
        unitCost: true,
        _count: { select: { consumptions: true } },
      },
    });

    for (const lot of ownLots) {
      if (lot._count.consumptions > 0) {
        return NextResponse.json(
          { error: "이 입고의 재고가 이미 출고·수리에 사용되었습니다. 되돌릴 수 없습니다" },
          { status: 400 }
        );
      }
      if (Number(lot.remainingQty) !== Number(lot.receivedQty)) {
        return NextResponse.json(
          { error: "이 입고의 재고가 반품·실사로 변경되었습니다. 먼저 그 처리를 되돌려 주세요" },
          { status: 400 }
        );
      }
    }

    // 가드 2: 자동 매핑 트리거 흔적 식별 — confirm 시점 ±2초 이내 생성된 ProductMapping
    const confirmAudit = await prisma.auditLog.findFirst({
      where: { entity: "Incoming", entityId: id, action: "CONFIRM" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const confirmAt = confirmAudit?.createdAt ?? incoming.updatedAt;
    const windowStart = new Date(confirmAt.getTime() - 2000);
    const windowEnd = new Date(confirmAt.getTime() + 2000);
    const supplierProductIds = Array.from(new Set(incoming.items.map((i) => i.supplierProductId)));
    const autoMappings = await prisma.productMapping.findMany({
      where: {
        supplierProductId: { in: supplierProductIds },
        createdAt: { gte: windowStart, lte: windowEnd },
      },
      select: {
        id: true,
        supplierProductId: true,
        productId: true,
        conversionRate: true,
        product: { select: { id: true, name: true, sku: true, autoMapped: true } },
      },
    });

    // 가드 3: 자동 매핑의 conversionRate 가 1 이 아니면 사용자가 손댄 흔적 → 거부
    for (const m of autoMappings) {
      if (Number(m.conversionRate) !== 1) {
        return NextResponse.json(
          {
            error: `자동 생성된 매핑의 환산비율이 변경되었습니다 (${m.product.sku} ${m.product.name} · 현재 ${Number(m.conversionRate)}). 매핑을 수동 정리해 주세요`,
          },
          { status: 400 }
        );
      }
    }

    // 가드 4: 자동 매핑에 의해 흡수된 과거 오르판 lot 들 — 이 입고 외에 같은 productId 를 가진 lot
    const autoProductIds = autoMappings.map((m) => m.productId);
    const absorbedLots = autoProductIds.length === 0
      ? []
      : await prisma.inventoryLot.findMany({
          where: {
            productId: { in: autoProductIds },
            id: { notIn: ownLots.map((l) => l.id) },
          },
          select: {
            id: true,
            productId: true,
            supplierProductId: true,
            receivedQty: true,
            remainingQty: true,
            unitCost: true,
            _count: { select: { consumptions: true } },
          },
        });

    for (const lot of absorbedLots) {
      if (lot._count.consumptions > 0) {
        return NextResponse.json(
          {
            error: "이 입고 확정 시 흡수된 과거 입고의 재고가 이미 출고·수리에 사용되었습니다. 되돌릴 수 없습니다",
          },
          { status: 400 }
        );
      }
      if (Number(lot.remainingQty) !== Number(lot.receivedQty)) {
        return NextResponse.json(
          {
            error: "이 입고 확정 시 흡수된 과거 입고의 재고가 반품·실사로 변경되었습니다. 먼저 그 처리를 되돌려 주세요",
          },
          { status: 400 }
        );
      }
    }

    // === 복원 트랜잭션 ===
    const auditUser = await getCurrentUser();
    await prisma.$transaction(async (tx) => {
      // 1. 이 입고 lot productId 별 합산 (Inventory 감소량)
      const ownDecByProductId = new Map<string, number>();
      for (const lot of ownLots) {
        if (!lot.productId) continue;
        ownDecByProductId.set(
          lot.productId,
          (ownDecByProductId.get(lot.productId) ?? 0) + Number(lot.receivedQty)
        );
      }

      // 2. 흡수된 오르판 lot productId 별 합산 (Inventory 감소량) — 이 입고 분과 별도로 모음
      const absorbedDecByProductId = new Map<string, number>();
      for (const lot of absorbedLots) {
        if (!lot.productId) continue;
        absorbedDecByProductId.set(
          lot.productId,
          (absorbedDecByProductId.get(lot.productId) ?? 0) + Number(lot.remainingQty)
        );
      }

      // 3. 이 입고 lot 삭제
      await tx.inventoryLot.deleteMany({ where: { incomingItemId: { in: itemIds } } });

      // 4. 흡수된 오르판 lot 들 → productId=null 로 되돌림 (rate=1 보장됐으므로 qty/unitCost 그대로)
      if (absorbedLots.length > 0) {
        await tx.inventoryLot.updateMany({
          where: { id: { in: absorbedLots.map((l) => l.id) } },
          data: { productId: null },
        });
      }

      // 5. Inventory 감소 + avgCost 재계산 (자동 Product 인지 일반 Product 인지 구분 없이 동일 처리)
      const allDecByProductId = new Map<string, number>();
      for (const [pid, dec] of ownDecByProductId) {
        allDecByProductId.set(pid, (allDecByProductId.get(pid) ?? 0) + dec);
      }
      for (const [pid, dec] of absorbedDecByProductId) {
        allDecByProductId.set(pid, (allDecByProductId.get(pid) ?? 0) + dec);
      }

      await Promise.all(
        Array.from(allDecByProductId.entries()).map(async ([productId, decQty]) => {
          const remainingLots = await tx.inventoryLot.findMany({
            where: { productId, remainingQty: { gt: 0 } },
            select: { remainingQty: true, unitCost: true },
          });
          let avgCost: number | null = null;
          if (remainingLots.length > 0) {
            let totalQty = 0;
            let totalCost = 0;
            for (const l of remainingLots) {
              const q = Number(l.remainingQty);
              totalQty += q;
              totalCost += q * Number(l.unitCost);
            }
            avgCost = totalQty > 0 ? totalCost / totalQty : null;
          }
          await tx.inventory.update({
            where: { productId },
            data: {
              quantity: { decrement: decQty },
              avgCost: avgCost as never,
              avgCostUpdatedAt: new Date(),
            },
          });
        })
      );

      // 6. InventoryMovement 삭제 — 이 입고의 INCOMING + 자동 매핑의 MAPPING_BACKFILL
      await tx.inventoryMovement.deleteMany({
        where: { referenceId: incoming.id, referenceType: "INCOMING" },
      });
      if (autoMappings.length > 0) {
        await tx.inventoryMovement.deleteMany({
          where: {
            referenceId: { in: autoMappings.map((m) => m.id) },
            referenceType: "MAPPING_BACKFILL",
          },
        });
      }

      // 7. 자동 ProductMapping 삭제 (자동 Product 자체는 유지 — 사용자가 /products 에서 수동 정리)
      if (autoMappings.length > 0) {
        await tx.productMapping.deleteMany({
          where: { id: { in: autoMappings.map((m) => m.id) } },
        });
      }

      // 8. SupplierLedger 삭제 (PURCHASE + 배송비차감 ADJUSTMENT) + rebalance
      await tx.supplierLedger.deleteMany({
        where: { referenceId: incoming.id, referenceType: "INCOMING" },
      });
      await rebalanceSupplierLedger(tx, incoming.supplierId);

      // 9. Expense(SHIPPING) 삭제
      await tx.expense.deleteMany({
        where: { referenceId: incoming.id, referenceType: "INCOMING" },
      });

      // 10. IncomingItem.unitCostSnapshot 리셋 (재확인 시 새로 계산됨)
      await tx.incomingItem.updateMany({
        where: { incomingId: id },
        data: { unitCostSnapshot: 0 },
      });

      // 11. Incoming.status = PENDING — paymentStatus 도 UNPAID 로 리셋
      //    (unconfirm 시 매칭됐던 결제는 잔액에만 남고 다른 외상 입고로 자동 재매칭되지 않음.
      //     관리자가 결제 삭제·재등록으로 명시 처리)
      await tx.incoming.update({
        where: { id },
        data: { status: "PENDING", paymentStatus: "UNPAID" },
      });

      // 12. 발주 기반이면 진행률 재계산 (CONFIRMED 가 빠지므로 receivedQty 감소)
      if (incoming.purchaseOrderId) {
        await recalcPurchaseOrderProgress(tx, incoming.purchaseOrderId);
      }

      // 12-b. SP 가격 원복 — 이 입고로 인해 SP.unitPrice/listPrice 가 변경됐다면 입고 직전 값으로 되돌림
      await restorePriceHistoryForIncoming(tx, id);

      // 13. 감사 로그
      await recordAudit(tx, {
        userId: auditUser?.id ?? null,
        entity: "Incoming",
        entityId: id,
        action: "UNCONFIRM",
        meta: {
          from: "CONFIRMED",
          to: "PENDING",
          incomingNo: incoming.incomingNo,
          autoMappingsRemoved: autoMappings.map((m) => ({
            mappingId: m.id,
            productId: m.productId,
            sku: m.product.sku,
            name: m.product.name,
          })),
          absorbedLotsRestored: absorbedLots.length,
        },
      });
    }, { timeout: 30000, maxWait: 10000 });

    const updated = await prisma.incoming.findUnique({
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
                    product: { select: { id: true, name: true, sku: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    return NextResponse.json(updated);
  }

  if (incoming.status !== "PENDING") {
    return NextResponse.json({ error: "대기 상태의 입고만 처리할 수 있습니다" }, { status: 400 });
  }

  // === 필드 수정 ===
  if (!action || action === "update") {
    const parsed = incomingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;
    const newItems = data.items.map((item) => {
      const qty = parseFloat(item.quantity);
      const price = parseFloat(item.unitPrice);
      const sentTotal = item.totalPrice ? parseFloat(item.totalPrice) : NaN;
      const totalPrice = Number.isFinite(sentTotal) && sentTotal > 0 ? sentTotal : qty * price;
      const originalPrice = item.originalPrice ? parseFloat(item.originalPrice) : undefined;
      const discountAmount = item.discountAmount ? parseFloat(item.discountAmount) : undefined;
      const rawShipping = item.itemShippingCost;
      const itemShippingCost = rawShipping === null || rawShipping === undefined || rawShipping === ""
        ? null
        : (parseFloat(rawShipping) || 0);
      return {
        supplierProductId: item.supplierProductId,
        quantity: qty,
        unitPrice: price,
        totalPrice,
        originalPrice,
        discountAmount,
        itemShippingCost,
        itemShippingIsTaxable: item.itemShippingIsTaxable ?? true,
      };
    });
    const totalAmount = newItems.reduce((sum, i) => sum + i.totalPrice, 0);

    await prisma.$transaction(async (tx) => {
      await tx.incoming.update({
        where: { id },
        data: {
          supplierId: data.supplierId,
          incomingDate: new Date(data.incomingDate),
          memo: data.memo || null,
          shippingCost: data.shippingCost ? parseFloat(data.shippingCost) : 0,
          shippingIsTaxable: data.shippingIsTaxable ?? false,
          shippingDeducted: data.shippingDeducted ?? false,
          totalAmount,
        },
      });

      // 교체 전후 SP 비교 — IncomingItem 재생성 후 미참조 SP 자동 정리
      const previousSupplierProductIds = new Set(incoming.items.map((i) => i.supplierProductId));
      const newSupplierProductIds = new Set(newItems.map((i) => i.supplierProductId));
      const removedSpIds = Array.from(previousSupplierProductIds).filter((id) => !newSupplierProductIds.has(id));

      await tx.incomingItem.deleteMany({ where: { incomingId: id } });

      await tx.incomingItem.createMany({
        data: newItems.map((i) => ({
          incomingId: id,
          supplierProductId: i.supplierProductId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          totalPrice: i.totalPrice,
          originalPrice: i.originalPrice ?? null,
          discountAmount: i.discountAmount ?? null,
          itemShippingCost: i.itemShippingCost,
          itemShippingIsTaxable: i.itemShippingIsTaxable,
        })),
      });

      // SupplierProduct 가격 변동 검사 — 일괄 조회 후 변경분만 병렬 처리
      const supplierProductIds = Array.from(new Set(newItems.map((i) => i.supplierProductId)));
      const sps = await tx.supplierProduct.findMany({
        where: { id: { in: supplierProductIds } },
        select: { id: true, unitPrice: true, listPrice: true },
      });
      const spById = new Map(sps.map((sp) => [sp.id, sp]));

      // 입고날짜 기준 — 더 최신 입고가 이미 있으면 SP.unitPrice를 덮어쓰지 않음
      const laterIncomings = await tx.incomingItem.findMany({
        where: {
          supplierProductId: { in: supplierProductIds },
          incomingId: { not: id },
          incoming: { incomingDate: { gt: new Date(data.incomingDate) } },
        },
        select: { supplierProductId: true },
      });
      const spsWithLater = new Set(laterIncomings.map((r) => r.supplierProductId));

      // supplierProductId별 그룹화 → 가중평균 단가 계산 (10+1 등 동일 SP 복수 행 대응)
      type NewItemType = typeof newItems[number];
      const groupsBySpId = new Map<string, NewItemType[]>();
      for (const item of newItems) {
        if (!groupsBySpId.has(item.supplierProductId)) groupsBySpId.set(item.supplierProductId, []);
        groupsBySpId.get(item.supplierProductId)!.push(item);
      }

      const priceOps: Promise<unknown>[] = [];
      for (const [spId, group] of groupsBySpId) {
        const sp = spById.get(spId);
        if (!sp) continue;
        if (spsWithLater.has(spId)) continue;

        const totalQty = group.reduce((s, i) => s + i.quantity, 0);
        const totalAmount = group.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
        const weightedUnitPrice = totalQty > 0 ? totalAmount / totalQty : 0;

        const canonical = group.reduce((a, b) => b.unitPrice > a.unitPrice ? b : a);
        const originalPrice = canonical.originalPrice;
        const discountAmount = canonical.discountAmount ?? 0;

        const currentPrice = Number(sp.unitPrice);
        const priceChanged = currentPrice !== weightedUnitPrice;
        const listPriceChanged = originalPrice !== undefined && Number(sp.listPrice) !== originalPrice;

        if (priceChanged || listPriceChanged) {
          const changeAmount = weightedUnitPrice - currentPrice;
          const changePercent = currentPrice !== 0 ? (changeAmount / currentPrice) * 100 : 0;

          priceOps.push(
            tx.supplierProductPriceHistory.create({
              data: {
                supplierProductId: spId,
                oldPrice: currentPrice,
                newPrice: weightedUnitPrice,
                changeAmount,
                changePercent,
                originalPrice: originalPrice ?? null,
                discountAmount: discountAmount > 0 ? discountAmount : null,
                reason: `입고 ${incoming.incomingNo} 수정`,
                incomingId: id,
              },
            }),
            tx.supplierProduct.update({
              where: { id: spId },
              data: {
                unitPrice: weightedUnitPrice,
                ...(listPriceChanged ? { listPrice: originalPrice! } : {}),
              },
            })
          );
        }
      }
      await Promise.all(priceOps);

      // 교체로 미참조된 SP 자동 정리 (자동 매핑된 Product 도 함께)
      for (const spId of removedSpIds) {
        await cleanupOrphanedSupplierProduct(tx, spId);
      }
    });

    const updated = await prisma.incoming.findUnique({
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
                    product: { select: { id: true, name: true, sku: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    return NextResponse.json(updated);
  }

  if (action === "cancel") {
    const auditUser = await getCurrentUser();
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.incoming.update({
        where: { id },
        data: { status: "CANCELLED" },
      });
      // 발주 기반 입고면 receivedQty 복원 + status 재계산
      if (incoming.purchaseOrderId) {
        await recalcPurchaseOrderProgress(tx, incoming.purchaseOrderId);
      }
      await recordAudit(tx, {
        userId: auditUser?.id ?? null,
        entity: "Incoming",
        entityId: id,
        action: "CANCEL",
        meta: { from: incoming.status, to: "CANCELLED", incomingNo: incoming.incomingNo },
      });
      return u;
    });
    return NextResponse.json(updated);
  }

  // === 입고 확인 트랜잭션 ===
  const shippingCost = Number(incoming.shippingCost);
  const shippingIsTaxable = incoming.shippingIsTaxable;
  const shippingDeducted = incoming.shippingDeducted;

  // 품목별 배송비(공급가액 기준 개당) — itemShippingCost override 우선, 나머지는 분배
  const shippingNetMap = computeShippingNetPerUnit(
    incoming.items.map((i) => ({
      id: i.id,
      quantity: Number(i.quantity),
      totalPrice: Number(i.totalPrice),
      itemShippingCost: i.itemShippingCost === null || i.itemShippingCost === undefined
        ? null
        : Number(i.itemShippingCost),
      itemShippingIsTaxable: i.itemShippingIsTaxable,
    })),
    { shippingCost, shippingIsTaxable, shippingDeducted }
  );

  await prisma.$transaction(async (tx) => {
    // 트랜잭션 시작 시점의 매핑 상태를 다시 조회 (incoming.items 캐시는 stale 가능)
    const spIdsForRefresh = Array.from(new Set(incoming.items.map((i) => i.supplierProductId)));
    const refreshedSps = await tx.supplierProduct.findMany({
      where: { id: { in: spIdsForRefresh } },
      select: {
        id: true,
        productMappings: { select: { productId: true, conversionRate: true } },
      },
    });
    const mappingsBySpId = new Map(refreshedSps.map((sp) => [sp.id, sp.productMappings]));

    // 1. 상태 변경 — paymentStatus 는 항상 UNPAID 로 시작.
    //    SupplierPayment 등록 시 recomputeIncomingPaymentStatus 가 FIFO 매칭으로 PAID 마킹.
    //    (paymentMethod 는 라벨일 뿐 원장·결제 흐름에 영향 없음)
    await tx.incoming.update({
      where: { id },
      data: {
        status: "CONFIRMED",
        paymentStatus: "UNPAID",
      },
    });

    // 2. 재고 증가 (매핑된 판매 상품 기준) + 원가 스냅샷 저장
    // Step A: 아이템별 기본 원가 계산 (shipping + incomingCosts 포함)
    const itemCalcs = incoming.items.map((item) => {
      const qty = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      const shippingNetPerUnit = shippingNetMap.get(item.id) ?? 0;

      const incomingCostPerUnit = item.supplierProduct.incomingCosts
        .filter((c) => c.perUnit)
        .reduce((sum, c) => {
          const raw = c.costType === "FIXED"
            ? Number(c.value)
            : unitPrice * Number(c.value) / 100;
          return sum + (c.isTaxable ? raw / 1.1 : raw);
        }, 0);

      const baseSnapshot = unitPrice + shippingNetPerUnit + incomingCostPerUnit;
      return { item, qty, baseSnapshot };
    });

    // Step B: 같은 supplierProductId끼리 그룹화 → 가중평균 원가 계산 (10+1 프로모션 지원)
    const groupAvgBySpId = new Map<string, number>();
    const groups = new Map<string, typeof itemCalcs>();
    for (const calc of itemCalcs) {
      const key = calc.item.supplierProductId;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(calc);
    }
    for (const [spId, rows] of groups) {
      const totalQty = rows.reduce((s, r) => s + r.qty, 0);
      const totalCost = rows.reduce((s, r) => s + r.qty * r.baseSnapshot, 0);
      groupAvgBySpId.set(spId, totalQty > 0 ? totalCost / totalQty : 0);
    }

    // Step C: 모든 아이템 스냅샷 저장 (병렬)
    await Promise.all(
      itemCalcs.map(({ item }) =>
        tx.incomingItem.update({
          where: { id: item.id },
          data: { unitCostSnapshot: groupAvgBySpId.get(item.supplierProductId)! },
        })
      )
    );

    // Step D: 그룹별 로트 생성 — N+1 방지 위해 batch 패턴 사용
    // (1) 작업 항목 수집: 매핑 없으면 오르판 로트, 있으면 매핑별 work item
    type MappedWork = {
      productId: string;
      supplierProductId: string;
      addQty: number;
      addUnitCost: number;
      canonicalItemId: string;
    };
    const orphanLots: Array<{ supplierProductId: string; totalQty: number; unitCost: number; canonicalItemId: string }> = [];
    const mappedWorks: MappedWork[] = [];

    for (const [supplierProductId, rows] of groups) {
      const totalQty = rows.reduce((s, r) => s + r.qty, 0);
      const unitCostSnapshot = groupAvgBySpId.get(supplierProductId)!;
      const canonicalItem = rows[0].item;
      const mappings = mappingsBySpId.get(supplierProductId) ?? canonicalItem.supplierProduct.productMappings;

      if (mappings.length === 0) {
        orphanLots.push({ supplierProductId, totalQty, unitCost: unitCostSnapshot, canonicalItemId: canonicalItem.id });
        continue;
      }
      for (const mapping of mappings) {
        mappedWorks.push({
          productId: mapping.productId,
          supplierProductId,
          addQty: totalQty * Number(mapping.conversionRate),
          addUnitCost: unitCostSnapshot / Number(mapping.conversionRate),
          canonicalItemId: canonicalItem.id,
        });
      }
    }

    // (2) 관련 inventory 일괄 조회
    const productIdsForInv = Array.from(new Set(mappedWorks.map((w) => w.productId)));
    const existingInventories = productIdsForInv.length > 0
      ? await tx.inventory.findMany({ where: { productId: { in: productIdsForInv } } })
      : [];
    const invByProductId = new Map(existingInventories.map((inv) => [inv.productId, inv]));

    // (3) productId당 누적 신규 수량/원가 계산 (같은 product에 매핑이 여러 spId에서 들어올 수 있음)
    const aggByProductId = new Map<string, { addQty: number; addCost: number }>();
    for (const w of mappedWorks) {
      const cur = aggByProductId.get(w.productId) ?? { addQty: 0, addCost: 0 };
      cur.addQty += w.addQty;
      cur.addCost += w.addQty * w.addUnitCost;
      aggByProductId.set(w.productId, cur);
    }

    // (4) inventory upsert를 병렬로 실행 (각 productId당 1회)
    const upsertedInvByProductId = new Map<string, { id: string; quantity: unknown }>();
    await Promise.all(
      Array.from(aggByProductId.entries()).map(async ([productId, agg]) => {
        const existing = invByProductId.get(productId);
        const prevQty = existing ? Number(existing.quantity) : 0;
        const prevAvgCost = existing?.avgCost != null ? Number(existing.avgCost) : null;
        const addAvgUnitCost = agg.addQty > 0 ? agg.addCost / agg.addQty : 0;
        const newAvgCost = computeMovingAverage(prevQty, prevAvgCost, agg.addQty, addAvgUnitCost);

        const inv = await tx.inventory.upsert({
          where: { productId },
          update: {
            quantity: { increment: agg.addQty },
            avgCost: newAvgCost,
            avgCostUpdatedAt: new Date(),
          },
          create: {
            productId,
            quantity: agg.addQty,
            avgCost: newAvgCost,
            avgCostUpdatedAt: new Date(),
          },
        });
        upsertedInvByProductId.set(productId, { id: inv.id, quantity: inv.quantity });
      })
    );

    // (5) InventoryLot batch 생성 (오르판 + 매핑된 것 모두)
    if (orphanLots.length > 0 || mappedWorks.length > 0) {
      await tx.inventoryLot.createMany({
        data: [
          ...orphanLots.map((o) => ({
            supplierProductId: o.supplierProductId,
            receivedQty: o.totalQty,
            remainingQty: o.totalQty,
            unitCost: o.unitCost,
            receivedAt: incoming.incomingDate,
            source: "INCOMING" as const,
            incomingItemId: o.canonicalItemId,
            memo: `입고 ${incoming.incomingNo}`,
          })),
          ...mappedWorks.map((w) => ({
            productId: w.productId,
            supplierProductId: w.supplierProductId,
            receivedQty: w.addQty,
            remainingQty: w.addQty,
            unitCost: w.addUnitCost,
            receivedAt: incoming.incomingDate,
            source: "INCOMING" as const,
            incomingItemId: w.canonicalItemId,
            memo: `입고 ${incoming.incomingNo}`,
          })),
        ],
      });
    }

    // (6) InventoryMovement batch 생성 (매핑된 work만 — 오르판은 inventory 영향 없음)
    if (mappedWorks.length > 0) {
      await tx.inventoryMovement.createMany({
        data: mappedWorks.map((w) => {
          const inv = upsertedInvByProductId.get(w.productId)!;
          return {
            inventoryId: inv.id,
            type: "INCOMING" as const,
            quantity: w.addQty,
            balanceAfter: inv.quantity as never,
            referenceId: incoming.id,
            referenceType: "INCOMING",
            memo: `입고 ${incoming.incomingNo}`,
          };
        }),
      });
    }

    // 3. 거래처 원장에 PURCHASE 기록 (VAT 포함 금액).
    //    paymentMethod 와 무관하게 모든 입고는 원장에 남는다 — 선결제 여부는 라벨일 뿐
    //    실제 결제는 SupplierPayment 로 별도 등록.
    {
      const totalWithTax = incoming.items.reduce((sum, item) => {
        const supply = Number(item.totalPrice);
        const tax = item.supplierProduct.isTaxable ? Math.round(supply * 0.1) : 0;
        return sum + supply + tax;
      }, 0);

      // 최근 잔액 조회
      const lastLedger = await tx.supplierLedger.findFirst({
        where: { supplierId: incoming.supplierId },
        orderBy: { createdAt: "desc" },
      });
      const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;
      const newBalance = prevBalance + totalWithTax;

      await tx.supplierLedger.create({
        data: {
          supplierId: incoming.supplierId,
          date: incoming.incomingDate,
          type: "PURCHASE",
          description: `입고 ${incoming.incomingNo}`,
          debitAmount: totalWithTax,
          creditAmount: 0,
          balance: newBalance,
          referenceId: incoming.id,
          referenceType: "INCOMING",
        },
      });

      // 배송비 차감결제 원장 기록
      const shippingCost = Number(incoming.shippingCost);
      if (incoming.shippingDeducted && shippingCost > 0) {
        const shippingBalance = newBalance - shippingCost;
        await tx.supplierLedger.create({
          data: {
            supplierId: incoming.supplierId,
            date: incoming.incomingDate,
            type: "ADJUSTMENT",
            description: `배송비 차감 (입고 ${incoming.incomingNo})`,
            debitAmount: 0,
            creditAmount: shippingCost,
            balance: shippingBalance,
            referenceId: incoming.id,
            referenceType: "INCOMING",
          },
        });
      }

      // 백-입력된 입고일에도 잔액이 일관되도록 재계산
      await rebalanceSupplierLedger(tx, incoming.supplierId);
    }

    // 4. 택배비 경비 자동 기록 — 헤더 운임 + 품목 직접 운임 합산 통합 헬퍼 호출
    await recalcIncomingExpense(tx, incoming.id);

    // 5. 발주 기반 입고면 발주 진행률 재계산 (CONFIRMED 시점에 반영)
    if (incoming.purchaseOrderId) {
      await recalcPurchaseOrderProgress(tx, incoming.purchaseOrderId);
    }

    // 6. 활동 로그
    const auditUser = await getCurrentUser();
    await recordAudit(tx, {
      userId: auditUser?.id ?? null,
      entity: "Incoming",
      entityId: incoming.id,
      action: "CONFIRM",
      meta: {
        from: "PENDING",
        to: "CONFIRMED",
        incomingNo: incoming.incomingNo,
        totalAmount: Number(incoming.totalAmount),
      },
    });
  }, { timeout: 30000, maxWait: 10000 });

  const updated = await prisma.incoming.findUnique({
    where: { id },
    include: {
      supplier: { select: { name: true } },
      items: {
        include: { supplierProduct: { select: { name: true } } },
      },
    },
  });

  return NextResponse.json(updated);
}

// 입고 삭제 (PENDING 상태만)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const incoming = await prisma.incoming.findUnique({
    where: { id },
    include: { items: { select: { supplierProductId: true } } },
  });

  if (!incoming) {
    return NextResponse.json({ error: "입고를 찾을 수 없습니다" }, { status: 404 });
  }

  if (incoming.status !== "PENDING") {
    return NextResponse.json({ error: "대기 상태의 입고만 삭제할 수 있습니다" }, { status: 400 });
  }

  const referencedSpIds = Array.from(new Set(incoming.items.map((i) => i.supplierProductId)));

  await prisma.$transaction(async (tx) => {
    await tx.incoming.delete({ where: { id } });
    // PENDING 입고도 발주 status 에는 반영되어 있으므로 (PARTIAL → ?), 삭제 후 재계산
    if (incoming.purchaseOrderId) {
      await recalcPurchaseOrderProgress(tx, incoming.purchaseOrderId);
    }
    // 이 입고만 참조하던 SP/자동 Product 자동 정리
    for (const spId of referencedSpIds) {
      await cleanupOrphanedSupplierProduct(tx, spId);
    }
  });
  return NextResponse.json({ success: true });
}
