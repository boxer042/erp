import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fifoConsume } from "@/lib/inventory/fifo";
import { getCurrentUser } from "@/lib/auth";

const variantComponentSchema = z.object({
  componentId: z.string().min(1),
  quantity: z.string().min(1),
  label: z.string().nullable().optional(),
});

const variantSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  sellingPrice: z.string().optional(), // 빈값이면 canonical 가격 상속
  listPrice: z.string().optional(),
  spec: z.string().nullable().optional(),
  components: z.array(variantComponentSchema), // 변형별 구성품
  initialAssemblyQty: z.string().optional(),
  initialAssemblyDate: z.string().optional(),
  initialAssemblyLaborCost: z.string().optional(),
});

const groupedSchema = z.object({
  // 대표 상품
  canonicalName: z.string().min(1, "대표 상품명을 입력해주세요"),
  canonicalSku: z.string().min(1, "대표 SKU를 입력해주세요"),
  productType: z.enum(["FINISHED", "PARTS", "SET", "ASSEMBLED"]).default("ASSEMBLED"),
  unitOfMeasure: z.string().default("EA"),
  taxType: z.enum(["TAXABLE", "TAX_FREE", "ZERO_RATE"]).default("TAXABLE"),
  taxRate: z.string().default("0.1"),
  listPrice: z.string().default("0"),
  sellingPrice: z.string().default("0"),
  brand: z.string().optional(),
  brandId: z.string().nullable().optional(),
  modelName: z.string().nullable().optional(),
  spec: z.string().nullable().optional(),
  description: z.string().optional(),
  memo: z.string().optional(),
  // 변형 목록
  variants: z.array(variantSchema).min(1, "변형이 최소 1개 필요합니다"),
});

function generateAssemblyNo() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const r = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ASM${y}${m}${d}-${r}`;
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  const body = await request.json();
  const parsed = groupedSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  // SKU 중복 검사
  const allSkus = [data.canonicalSku, ...data.variants.map((v) => v.sku)];
  const uniqueSkus = new Set(allSkus);
  if (uniqueSkus.size !== allSkus.length) {
    return NextResponse.json({ error: "SKU가 중복됩니다" }, { status: 400 });
  }
  const existing = await prisma.product.findMany({
    where: { sku: { in: allSkus } },
    select: { sku: true },
  });
  if (existing.length > 0) {
    return NextResponse.json(
      { error: `이미 존재하는 SKU: ${existing.map((e) => e.sku).join(", ")}` },
      { status: 409 },
    );
  }

  const isSet = data.productType === "SET" || data.productType === "ASSEMBLED";

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // 1. 대표 상품 생성 (재고 row 없음)
        const canonical = await tx.product.create({
          data: {
            name: data.canonicalName,
            sku: data.canonicalSku,
            brand: data.brand || null,
            brandId: data.brandId || null,
            modelName: data.modelName || null,
            spec: data.spec || null,
            description: data.description || null,
            unitOfMeasure: data.unitOfMeasure,
            productType: data.productType,
            taxType: data.taxType,
            taxRate: parseFloat(data.taxRate),
            listPrice: parseFloat(data.listPrice || data.sellingPrice),
            sellingPrice: parseFloat(data.sellingPrice),
            isSet,
            isCanonical: true,
            memo: data.memo || null,
          },
        });

        const variantResults = [];

        // 2. 각 변형 생성
        for (const v of data.variants) {
          const variantSelling = v.sellingPrice
            ? parseFloat(v.sellingPrice)
            : parseFloat(data.sellingPrice);
          const variantList = v.listPrice
            ? parseFloat(v.listPrice)
            : parseFloat(data.listPrice || data.sellingPrice);

          const variant = await tx.product.create({
            data: {
              name: v.name,
              sku: v.sku,
              brand: data.brand || null,
              brandId: data.brandId || null,
              modelName: data.modelName || null,
              spec: v.spec ?? data.spec ?? null,
              unitOfMeasure: data.unitOfMeasure,
              productType: data.productType,
              taxType: data.taxType,
              taxRate: parseFloat(data.taxRate),
              listPrice: variantList,
              sellingPrice: variantSelling,
              isSet,
              isCanonical: false,
              canonicalProductId: canonical.id,
              inventory: { create: { quantity: 0, safetyStock: 1 } },
            },
          });

          // SetComponent 생성 (조립/세트인 경우)
          if (isSet && v.components.length > 0) {
            for (const comp of v.components) {
              await tx.setComponent.create({
                data: {
                  setProductId: variant.id,
                  componentId: comp.componentId,
                  quantity: parseFloat(comp.quantity),
                  label: comp.label?.trim() ? comp.label.trim() : null,
                },
              });
            }
          }

          // 초기 조립 실적 (선택)
          const initQty = v.initialAssemblyQty ? parseFloat(v.initialAssemblyQty) : 0;
          if (isSet && initQty > 0 && v.components.length > 0) {
            const laborCost = v.initialAssemblyLaborCost
              ? parseFloat(v.initialAssemblyLaborCost)
              : 0;
            const assemblyNo = generateAssemblyNo();
            const assembledAt = v.initialAssemblyDate
              ? new Date(v.initialAssemblyDate)
              : new Date();

            const assembly = await tx.assembly.create({
              data: {
                assemblyNo,
                productId: variant.id,
                quantity: initQty,
                type: "PRODUCE",
                laborCost: v.initialAssemblyLaborCost ? laborCost : null,
                assembledAt,
                createdBy: user?.id,
              },
            });

            let totalComponentCost = 0;
            for (const comp of v.components) {
              const compQty = parseFloat(comp.quantity);
              if (!Number.isFinite(compQty) || compQty <= 0) continue;
              const totalNeed = compQty * initQty;

              const compProduct = await tx.product.findUnique({
                where: { id: comp.componentId },
                select: { name: true },
              });
              const displayName = compProduct?.name ?? comp.componentId;

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

            const finishedUnitCost = (totalComponentCost + laborCost) / initQty;
            const lot = await tx.inventoryLot.create({
              data: {
                product: { connect: { id: variant.id } },
                receivedQty: initQty,
                remainingQty: initQty,
                unitCost: finishedUnitCost,
                receivedAt: assembledAt,
                source: "SET_PRODUCE",
              },
            });
            const finishedInv = await tx.inventory.update({
              where: { productId: variant.id },
              data: { quantity: { increment: initQty } },
            });
            await tx.inventoryMovement.create({
              data: {
                inventoryId: finishedInv.id,
                type: "SET_PRODUCE",
                quantity: initQty,
                balanceAfter: finishedInv.quantity,
                referenceId: assembly.id,
                referenceType: "ASSEMBLY",
                memo: `조립 ${assemblyNo} 완제품 생산`,
              },
            });
            await tx.assembly.update({
              where: { id: assembly.id },
              data: { producedLotId: lot.id },
            });
          }

          variantResults.push(variant);
        }

        return { canonical, variants: variantResults };
      },
      { timeout: 30000 },
    );

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "묶음 등록 실패";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
