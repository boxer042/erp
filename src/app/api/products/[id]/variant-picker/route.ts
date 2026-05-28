import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POS 카트 변형/옵션 선택 시트 전용 슬림 엔드포인트.
 *
 * 기존 /api/products/[id] 는 inventoryLots / productMappings / channelPricings / specValues /
 * bundles 등 1242 줄 분량의 deep include 라 변형 picker 진입 시 1~3초씩 걸림.
 * 이 라우트는 variant 선택에 필요한 최소 필드만 반환:
 *   - id, name, isCanonical
 *   - variants[]: id, name, sku, sellingPrice, imageUrl, variableComponents (부모와 다른 가변 부품만)
 *   - productOptions[]: id, name, required, values[]
 *
 * 응답 shape 은 _variant-select-sheet.tsx 의 ProductDetailResponse 와 일치.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      isCanonical: true,
      // 부모 set components — 변형의 "달라진" 부품 비교 기준
      setComponents: {
        select: {
          componentId: true,
          slotId: true,
          slotLabelId: true,
          label: true,
          quantity: true,
        },
      },
      // 가변 슬롯 key 추출용
      assemblyTemplate: {
        select: {
          slots: {
            select: { id: true, slotLabelId: true, label: true, isVariable: true },
          },
        },
      },
      // 변형 자식들
      variants: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          sku: true,
          sellingPrice: true,
          imageUrl: true,
          setComponents: {
            select: {
              componentId: true,
              slotId: true,
              slotLabelId: true,
              label: true,
              quantity: true,
              component: { select: { name: true } },
            },
          },
        },
      },
      // 옵션
      productOptions: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          required: true,
          values: {
            where: { isActive: true },
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              label: true,
              addPrice: true,
              mappedMode: true,
              mappedProduct: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  sellingPrice: true,
                  listPrice: true,
                  taxType: true,
                },
              },
              mappedVariant: { select: { id: true, name: true, sku: true } },
            },
          },
        },
      },
    },
  });

  if (!product) {
    return NextResponse.json({ error: "상품을 찾을 수 없습니다" }, { status: 404 });
  }

  // 가변 슬롯 키 집합 — slot id / label id / label 텍스트 셋 다 인덱싱
  const variableSlotKeys = new Set<string>();
  for (const s of product.assemblyTemplate?.slots ?? []) {
    if (!s.isVariable) continue;
    if (s.id) variableSlotKeys.add(`SID:${s.id}`);
    if (s.slotLabelId) variableSlotKeys.add(`LID:${s.slotLabelId}`);
    if (s.label && s.label.trim()) variableSlotKeys.add(`LBL:${s.label.trim()}`);
  }

  // slotId 핀이 있으면 그것만, 없으면 LID/LBL 폴백
  const matchSlotKeys = (sc: {
    slotId: string | null;
    slotLabelId: string | null;
    label: string | null;
  }): string[] => {
    if (sc.slotId) {
      return variableSlotKeys.has(`SID:${sc.slotId}`) ? [`SID:${sc.slotId}`] : [];
    }
    const keys: string[] = [];
    if (sc.slotLabelId && variableSlotKeys.has(`LID:${sc.slotLabelId}`))
      keys.push(`LID:${sc.slotLabelId}`);
    if (sc.label && sc.label.trim() && variableSlotKeys.has(`LBL:${sc.label.trim()}`))
      keys.push(`LBL:${sc.label.trim()}`);
    return keys;
  };

  const parentVariableByKey = new Map<
    string,
    { componentId: string; quantity: number }
  >();
  for (const sc of product.setComponents ?? []) {
    for (const k of matchSlotKeys(sc)) {
      if (!parentVariableByKey.has(k)) {
        parentVariableByKey.set(k, {
          componentId: sc.componentId,
          quantity: Number(sc.quantity),
        });
      }
    }
  }

  const variants = (product.variants ?? []).map((v) => {
    const variableComponents = (v.setComponents ?? [])
      .map((sc) => ({ sc, keys: matchSlotKeys(sc) }))
      .filter(({ keys }) => keys.length > 0)
      .filter(({ sc, keys }) => {
        for (const k of keys) {
          const parent = parentVariableByKey.get(k);
          if (
            parent &&
            parent.componentId === sc.componentId &&
            parent.quantity === Number(sc.quantity)
          ) {
            return false; // 부모와 동일 → 제외
          }
        }
        return true;
      })
      .map(({ sc }) => ({
        slotLabel: sc.label ?? "",
        componentName: sc.component.name,
      }));
    return {
      id: v.id,
      name: v.name,
      sku: v.sku,
      sellingPrice: v.sellingPrice.toString(),
      imageUrl: v.imageUrl,
      variableComponents,
    };
  });

  const productOptions = (product.productOptions ?? []).map((opt) => ({
    id: opt.id,
    name: opt.name,
    required: opt.required,
    values: opt.values.map((val) => ({
      id: val.id,
      label: val.label,
      addPrice: val.addPrice.toString(),
      mappedMode: val.mappedMode,
      mappedProduct: val.mappedProduct
        ? {
            id: val.mappedProduct.id,
            name: val.mappedProduct.name,
            sku: val.mappedProduct.sku,
            sellingPrice: val.mappedProduct.sellingPrice?.toString(),
            listPrice: val.mappedProduct.listPrice?.toString(),
            taxType: val.mappedProduct.taxType,
          }
        : null,
      mappedVariant: val.mappedVariant,
    })),
  }));

  return NextResponse.json({
    id: product.id,
    name: product.name,
    isCanonical: product.isCanonical,
    variants,
    productOptions,
  });
}
