import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { usedItemBuildSchema } from "@/lib/validators/used-item";
import { nextUsedItemCode } from "@/lib/used-item-code";
import { nextSerialItemCode } from "@/lib/serial-item-code";
import {
  ensureBulkStock,
  fifoConsume,
  isOversellAllowed,
} from "@/lib/inventory/fifo";
import { randomBytes } from "crypto";

function newToken() {
  return randomBytes(16).toString("base64url");
}

/**
 * POST /api/used-items/build — 중고 조립 (케이스 B)
 *
 * 여러 중고 단품 + (선택) 신품 부품을 합쳐 새 단품(source=BUILT)을 만든다.
 * 카탈로그 Product 를 만들지 않아 더미 SKU 가 안 생긴다.
 *
 * 처리 (트랜잭션):
 *  1. 재료 중고 검증 (모두 IN_STOCK) → 누적원가 합산 + status=ASSEMBLED_INTO
 *  2. 신품 부품 → FIFO lot 차감 + Inventory 감소 + 원가 합산
 *  3. 결과 UsedItem 생성 (acquiredCost = 재료합 + 부품합 + 공임)
 *  4. UsedItemBuild + Source/Part lineage 기록
 *  5. (선택) 시리얼 발번
 */
export async function POST(request: NextRequest) {
  const [user, deny] = await guardUser();
  if (deny) return deny;

  const body = await request.json();
  const parsed = usedItemBuildSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const builtAt = new Date(data.builtAt);
  if (isNaN(builtAt.getTime())) {
    return NextResponse.json({ error: "조립일이 올바르지 않습니다" }, { status: 400 });
  }

  // 카탈로그 매칭 검증
  if (data.productId) {
    const exists = await prisma.product.findUnique({
      where: { id: data.productId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ error: "카탈로그 상품을 찾을 수 없습니다" }, { status: 400 });
    }
  }

  const allowOversell = await isOversellAllowed();
  const laborCost = parseFloat(data.laborCost) || 0;

  try {
    const slotByUsedId = new Map(
      data.sources.map((s) => [s.usedItemId, s.slotLabel ?? null]),
    );
    const sourceIds = data.sources.map((s) => s.usedItemId);

    const result = await prisma.$transaction(async (tx) => {
      // ── 1. 재료 중고 검증 + 누적원가 ─────────────────────────
      const sources = await tx.usedItem.findMany({
        where: { id: { in: sourceIds } },
        include: { addedCosts: { select: { amount: true } } },
      });
      if (sources.length !== sourceIds.length) {
        throw new Error("일부 중고 재료를 찾을 수 없습니다");
      }
      for (const s of sources) {
        if (s.status !== "IN_STOCK") {
          throw new Error(
            `중고 재료 ${s.internalCode} 은 보관 중 상태가 아닙니다 (${s.status})`,
          );
        }
      }

      let totalCost = laborCost;
      const sourceSnapshots = sources.map((s) => {
        const cost =
          Number(s.acquiredCost) +
          s.addedCosts.reduce((sum, c) => sum + Number(c.amount), 0);
        totalCost += cost;
        return {
          usedItemId: s.id,
          costSnapshot: cost,
          slotLabel: slotByUsedId.get(s.id) ?? null,
        };
      });

      // ── 2. 신품 부품 FIFO 차감 ──────────────────────────────
      const compIds = Array.from(new Set(data.parts.map((p) => p.componentId)));
      const compProducts = compIds.length
        ? await tx.product.findMany({
            where: { id: { in: compIds } },
            select: { id: true, name: true, isBulk: true },
          })
        : [];
      const compById = new Map(compProducts.map((p) => [p.id, p]));

      const partRecords: Array<{
        componentId: string;
        lotId: string;
        quantity: number;
        unitCost: number;
        slotLabel: string | null;
      }> = [];

      for (const part of data.parts) {
        const qty = parseFloat(part.quantity);
        if (!Number.isFinite(qty) || qty <= 0) continue;
        const comp = compById.get(part.componentId);
        if (!comp) throw new Error(`부품을 찾을 수 없습니다 (${part.componentId})`);

        if (comp.isBulk) {
          await ensureBulkStock(tx, comp.id, qty, comp.name, allowOversell);
        }
        const { consumptions } = await fifoConsume(
          tx,
          comp.id,
          qty,
          comp.name,
          allowOversell,
        );
        for (const c of consumptions) {
          totalCost += c.quantity * c.unitCost;
          partRecords.push({
            componentId: comp.id,
            lotId: c.lotId,
            quantity: c.quantity,
            unitCost: c.unitCost,
            slotLabel: part.slotLabel ?? null,
          });
        }

        const inv = await tx.inventory.update({
          where: { productId: comp.id },
          data: { quantity: { decrement: qty } },
        });
        await tx.inventoryMovement.create({
          data: {
            inventoryId: inv.id,
            type: "SET_CONSUME",
            quantity: qty,
            balanceAfter: inv.quantity,
            referenceType: "USED_ITEM_BUILD",
            memo: `중고 조립 재료 ${comp.name} 차감`,
          },
        });
      }

      // ── 3. 시리얼 발번 (선택) ───────────────────────────────
      let serialItemId: string | null = null;
      if (data.issueSerial) {
        const code = await nextSerialItemCode(tx, builtAt);
        const warrantyMonths = data.warrantyMonths ?? 0;
        const warrantyEnds = warrantyMonths
          ? new Date(
              builtAt.getFullYear(),
              builtAt.getMonth() + warrantyMonths,
              builtAt.getDate(),
            )
          : null;
        const serial = await tx.serialItem.create({
          data: {
            code,
            accessToken: newToken(),
            productId: data.productId ?? null,
            displayName: data.productId ? null : data.displayName,
            customerId: null,
            source: "USED_INTAKE",
            soldAt: null,
            warrantyEnds,
            status: "ACTIVE",
          },
        });
        serialItemId = serial.id;
      }

      // ── 4. 결과 UsedItem 생성 ──────────────────────────────
      const internalCode = await nextUsedItemCode(tx, builtAt);
      const resultUsedItem = await tx.usedItem.create({
        data: {
          internalCode,
          displayName: data.displayName,
          productId: data.productId ?? null,
          acquiredFrom: "BUILT",
          acquiredCost: totalCost,
          isAcquiredTaxable: false,
          acquiredAt: builtAt,
          status: "IN_STOCK",
          spec: data.spec ?? null,
          imageUrls: data.imageUrls ?? undefined,
          memo: data.memo ?? null,
          serialItemId,
          createdById: user!.id,
        },
      });

      // ── 5. 재료 소진 + lineage ─────────────────────────────
      const build = await tx.usedItemBuild.create({
        data: {
          resultUsedItemId: resultUsedItem.id,
          assemblyTemplateId: data.assemblyTemplateId ?? null,
          laborCost,
          builtAt,
          memo: data.memo ?? null,
          createdById: user!.id,
        },
      });

      // 재료 중고 → ASSEMBLED_INTO + source 기록
      await Promise.all(
        sourceSnapshots.map((s) =>
          tx.usedItem.update({
            where: { id: s.usedItemId },
            data: { status: "ASSEMBLED_INTO" },
          }),
        ),
      );
      await tx.usedItemBuildSource.createMany({
        data: sourceSnapshots.map((s) => ({
          buildId: build.id,
          usedItemId: s.usedItemId,
          costSnapshot: s.costSnapshot,
          slotLabel: s.slotLabel,
        })),
      });

      // 신품 부품 lot 소진 기록
      if (partRecords.length > 0) {
        await tx.usedItemBuildPart.createMany({
          data: partRecords.map((p) => ({
            buildId: build.id,
            componentId: p.componentId,
            lotId: p.lotId,
            quantity: p.quantity,
            unitCost: p.unitCost,
            slotLabel: p.slotLabel,
          })),
        });
      }

      return { id: resultUsedItem.id, internalCode: resultUsedItem.internalCode };
    }, { timeout: 30000, maxWait: 10000 });

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "중고 조립에 실패했습니다";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
