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

interface ComponentInput {
  componentId: string;
  quantity: string;
  slotId?: string | null;
  slotLabelId?: string | null;
  slotLabel?: string | null;
}

// 매칭 우선순위: slotId > slotLabelId > label 텍스트
function slotKeyOf(
  slotId: string | null | undefined,
  slotLabelId: string | null | undefined,
  label: string | null | undefined,
): string | null {
  if (slotId) return `SID:${slotId}`;
  if (slotLabelId) return `LID:${slotLabelId}`;
  if (label && label.trim()) return `LBL:${label.trim()}`;
  return null;
}

function makeVariantKey(
  items: Array<{ key: string | null; componentId: string; quantity: unknown }>,
) {
  return items
    .filter((i) => i.key)
    .map((i) => `${i.key}:${i.componentId}:${Number(i.quantity)}`)
    .sort()
    .join("|");
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

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. 사용자가 선택한 상품 (parent 후보) 로드
      const selected = await tx.product.findUnique({
        where: { id: data.productId },
        select: {
          id: true,
          name: true,
          sku: true,
          unitOfMeasure: true,
          sellingPrice: true,
          listPrice: true,
          taxType: true,
          taxRate: true,
          isCanonical: true,
          canonicalProductId: true,
          assemblyTemplateId: true,
          inventory: { select: { id: true, quantity: true, safetyStock: true } },
          channelPricings: {
            where: { isActive: true },
            select: { channelId: true, sellingPrice: true },
          },
          setComponents: {
            select: {
              componentId: true,
              quantity: true,
              slotId: true,
              slotLabelId: true,
              label: true,
            },
          },
          assemblyTemplate: {
            select: {
              slots: {
                select: { id: true, slotLabelId: true, isVariable: true, label: true },
              },
            },
          },
          variants: {
            select: {
              id: true,
              name: true,
              sku: true,
              setComponents: {
                select: { componentId: true, quantity: true, slotId: true, slotLabelId: true, label: true },
              },
            },
          },
        },
      });
      if (!selected) {
        throw new Error("조립상품을 찾을 수 없습니다");
      }

      // 2. 매칭/생성 로직: variant 직접 선택했으면 그대로, 아니면 매칭/생성
      let targetProductId = selected.id;
      let createdVariant: { id: string; name: string; sku: string } | null = null;

      const isParentCandidate = !selected.canonicalProductId; // canonical 또는 단일 상품
      // 슬롯 메타: SID/LID/LBL 키 모두 등록 (구버전 SetComponent 호환)
      const slotMetaByKey = new Map<string, { isVariable: boolean; label: string }>();
      for (const s of selected.assemblyTemplate?.slots ?? []) {
        slotMetaByKey.set(`SID:${s.id}`, { isVariable: s.isVariable, label: s.label });
        if (s.slotLabelId) slotMetaByKey.set(`LID:${s.slotLabelId}`, { isVariable: s.isVariable, label: s.label });
        if (s.label && s.label.trim()) slotMetaByKey.set(`LBL:${s.label.trim()}`, { isVariable: s.isVariable, label: s.label });
      }

      if (isParentCandidate) {
        const inputs = data.components as ComponentInput[];

        // 입력 행마다 통합 키 계산
        const inputsWithKey = inputs.map((i) => ({
          ...i,
          key: slotKeyOf(i.slotId, i.slotLabelId, i.slotLabel),
        }));

        // 고정 슬롯 변경 검증
        for (const inp of inputsWithKey) {
          if (!inp.key) continue;
          const meta = slotMetaByKey.get(inp.key);
          if (!meta || meta.isVariable) continue;
          // 고정 슬롯 → 부모 SetComponent 와 일치해야
          const parentComp = selected.setComponents.find(
            (sc) => slotKeyOf(sc.slotId, sc.slotLabelId, sc.label) === inp.key,
          );
          if (parentComp && parentComp.componentId !== inp.componentId) {
            throw new Error(
              `고정 슬롯 "${parentComp.label ?? meta.label}" 의 부품은 변경할 수 없습니다`,
            );
          }
        }

        // 가변 키 계산
        const variableInputs = inputsWithKey.filter(
          (i) => i.key && slotMetaByKey.get(i.key)?.isVariable,
        );
        const inputKey = makeVariantKey(variableInputs);

        // 기존 variant 매칭
        let matched: { id: string; name: string; sku: string } | null = null;
        for (const v of selected.variants) {
          const vVariableComps = v.setComponents
            .map((sc) => ({
              componentId: sc.componentId,
              quantity: sc.quantity,
              key: slotKeyOf(sc.slotId, sc.slotLabelId, sc.label),
            }))
            .filter((sc) => sc.key && slotMetaByKey.get(sc.key)?.isVariable);
          const vKey = makeVariantKey(vVariableComps);
          if (vKey === inputKey) {
            matched = { id: v.id, name: v.name, sku: v.sku };
            break;
          }
        }

        if (matched) {
          targetProductId = matched.id;
        } else {
          // 새 variant 생성. 단일 상품(canonical 아님)이면 안전장치 + 격상.
          if (!selected.isCanonical) {
            const invQty = selected.inventory ? Number(selected.inventory.quantity) : 0;
            const lotsCount = await tx.inventoryLot.count({
              where: { productId: selected.id, remainingQty: { gt: 0 } },
            });
            const ordersCount = await tx.orderItem.count({
              where: { productId: selected.id },
            });
            if (invQty > 0 || lotsCount > 0 || ordersCount > 0) {
              throw new Error(
                "기존 재고/주문 이력이 있어 변형 체계로 자동 격상할 수 없습니다. 관리자에게 문의하세요.",
              );
            }
          }

          // 자동 SKU 채번 — `{부모SKU}-숫자` 패턴 중 max+1.
          // 사용자가 임의 SKU 로 바꿔서 충돌하면 다음 빈 자리로 이동 (안전 한계 100회).
          const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const skuPattern = new RegExp(`^${escapeRegex(selected.sku)}-(\\d+)$`);
          const usedSeqs = selected.variants
            .map((v) => v.sku.match(skuPattern)?.[1])
            .filter((s): s is string => !!s)
            .map((s) => parseInt(s, 10));
          let seq = (usedSeqs.length > 0 ? Math.max(...usedSeqs) : 0) + 1;
          let newSku = `${selected.sku}-${seq}`;
          // 임의 SKU 로 인한 우연한 충돌 방지: 100회 한계로 빈 자리 찾기
          for (let guard = 0; guard < 100; guard++) {
            const conflict = await tx.product.findUnique({
              where: { sku: newSku },
              select: { id: true },
            });
            if (!conflict) break;
            seq += 1;
            newSku = `${selected.sku}-${seq}`;
          }

          const safety = selected.inventory ? Number(selected.inventory.safetyStock) : 0;

          const newVariant = await tx.product.create({
            data: {
              name: selected.name,
              sku: newSku,
              unitOfMeasure: selected.unitOfMeasure,
              productType: "ASSEMBLED",
              taxType: selected.taxType,
              taxRate: selected.taxRate,
              listPrice: selected.listPrice,
              sellingPrice: selected.sellingPrice,
              isSet: true,
              isCanonical: false,
              canonicalProductId: selected.id,
              assemblyTemplateId: selected.assemblyTemplateId,
              inventory: { create: { quantity: 0, safetyStock: safety } },
            },
            select: { id: true, name: true, sku: true },
          });

          // SetComponent 구성: 부모 SetComponent 기반, 가변 슬롯은 입력값 덮어쓰기
          const seenSlotKeys = new Set<string>();
          const newComps: Array<{
            setProductId: string;
            componentId: string;
            quantity: number;
            slotId: string | null;
            slotLabelId: string | null;
            label: string | null;
          }> = [];
          for (const parentSc of selected.setComponents) {
            const parentKey = slotKeyOf(parentSc.slotId, parentSc.slotLabelId, parentSc.label);
            const meta = parentKey ? slotMetaByKey.get(parentKey) : null;
            const isVar = !!meta?.isVariable;
            if (isVar && parentKey) {
              const inputRow = variableInputs.find((vi) => vi.key === parentKey);
              if (inputRow) {
                newComps.push({
                  setProductId: newVariant.id,
                  componentId: inputRow.componentId,
                  quantity: Number(inputRow.quantity),
                  slotId: parentSc.slotId,
                  slotLabelId: parentSc.slotLabelId,
                  label: parentSc.label,
                });
                seenSlotKeys.add(parentKey);
                continue;
              }
            }
            newComps.push({
              setProductId: newVariant.id,
              componentId: parentSc.componentId,
              quantity: Number(parentSc.quantity),
              slotId: parentSc.slotId,
              slotLabelId: parentSc.slotLabelId,
              label: parentSc.label,
            });
            if (parentKey) seenSlotKeys.add(parentKey);
          }
          // 수동 추가된 (슬롯 정보 없는) 입력 row 도 SetComponent 로 추가
          for (const inp of inputsWithKey) {
            if (inp.key) continue;
            newComps.push({
              setProductId: newVariant.id,
              componentId: inp.componentId,
              quantity: Number(inp.quantity),
              slotId: null,
              slotLabelId: null,
              label: null,
            });
          }
          if (newComps.length > 0) {
            await tx.setComponent.createMany({ data: newComps });
          }

          // 부모의 ChannelPricing 자동 복사 — 변형마다 채널가 재등록 부담 줄이기
          if (selected.channelPricings.length > 0) {
            await tx.channelPricing.createMany({
              data: selected.channelPricings.map((cp) => ({
                productId: newVariant.id,
                channelId: cp.channelId,
                sellingPrice: cp.sellingPrice,
              })),
              skipDuplicates: true,
            });
          }

          // 부모 → canonical 격상 (이미 canonical 이면 skip)
          if (!selected.isCanonical) {
            await tx.product.update({
              where: { id: selected.id },
              data: { isCanonical: true },
            });
            if (selected.inventory) {
              await tx.inventory.delete({ where: { id: selected.inventory.id } });
            }
          }

          targetProductId = newVariant.id;
          createdVariant = newVariant;
        }
      }

      // 3. 기존 조립 로직 — targetProductId 에 적재
      const assemblyNo = generateAssemblyNo();
      const assembly = await tx.assembly.create({
        data: {
          assemblyNo,
          productId: targetProductId,
          quantity,
          type: "PRODUCE",
          laborCost: data.laborCost ? laborCost : null,
          assembledAt: new Date(data.assembledAt),
          memo: data.memo,
          createdBy: user?.id,
        },
      });

      // batch: 구성품 정보 한 번에 조회 (N+1 방지)
      const componentIds = Array.from(
        new Set(data.components.map((c) => c.componentId)),
      );
      const compProducts = await tx.product.findMany({
        where: { id: { in: componentIds } },
        select: { id: true, name: true, isBulk: true },
      });
      const compById = new Map(compProducts.map((p) => [p.id, p]));

      let totalComponentCost = 0;
      for (const comp of data.components) {
        const compQty = parseFloat(comp.quantity);
        if (!Number.isFinite(compQty) || compQty <= 0) continue;
        const totalNeed = compQty * quantity;

        const compProduct = compById.get(comp.componentId);
        const displayName = compProduct?.name ?? comp.componentId;

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

      const finishedInv = await tx.inventory.upsert({
        where: { productId: targetProductId },
        update: {},
        create: { productId: targetProductId, quantity: 0 },
      });

      const lot = await tx.inventoryLot.create({
        data: {
          product: { connect: { id: targetProductId } },
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

      const finalAssembly = await tx.assembly.update({
        where: { id: assembly.id },
        data: { producedLotId: lot.id },
      });

      return { assembly: finalAssembly, newVariant: createdVariant };
    }, { timeout: 30000, maxWait: 10000 });

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    let msg = e instanceof Error ? e.message : "조립 실적 등록 실패";
    // Prisma unique constraint (P2002) — 주로 변형 SKU 충돌
    if (typeof msg === "string" && msg.includes("Unique constraint") && msg.includes("sku")) {
      msg = "변형 SKU 가 이미 존재합니다. 다시 시도하거나 SKU 를 직접 지정해주세요.";
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
