import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { computeShippingPerUnitDisplay } from "@/lib/incoming-shipping";
import { computeSupplierProductAvgShipping } from "@/lib/cost-utils";
import {
  computeBaseUnitCost,
  computeAssemblyUnitCost,
  computeCurrentUnitCostForId,
  deriveCostAlert,
  isAssemblyLike,
} from "@/lib/product-cost";
import { productSchema } from "@/lib/validators/product";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      inventory: true,
      brandRef: { select: { id: true, name: true, logoUrl: true } },
      category: { select: { id: true, name: true } },
      bulkProduct: { select: { id: true, name: true, sku: true, containerSize: true, unitOfMeasure: true, sellingPrice: true } },
      productMappings: {
        include: {
          supplierProduct: {
            include: {
              supplier: { select: { id: true, name: true } },
              incomingCosts: { where: { isActive: true } },
            },
          },
        },
      },
      setComponents: {
        include: {
          component: { select: { id: true, name: true, sku: true, spec: true, isBulk: true } },
          slot: { select: { id: true, label: true, order: true } },
          slotLabel: { select: { id: true, name: true } },
        },
      },
      assemblyTemplate: {
        include: {
          slots: {
            orderBy: { order: "asc" },
            include: {
              defaultProduct: { select: { id: true, name: true, sku: true } },
              slotLabel: { select: { id: true, name: true } },
            },
          },
          presets: {
            where: { isActive: true },
            orderBy: { createdAt: "desc" },
            include: {
              items: {
                include: {
                  product: { select: { id: true, name: true, sku: true } },
                },
              },
            },
          },
        },
      },
      channelPricings: {
        include: { channel: { select: { id: true, name: true, code: true, logoUrl: true } } },
      },
      sellingCosts: { where: { isActive: true } },
      variants: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          sku: true,
          sellingPrice: true,
          inventory: { select: { quantity: true } },
          setComponents: {
            select: {
              componentId: true,
              slotId: true,
              slotLabelId: true,
              label: true,
              quantity: true,
              component: { select: { id: true, name: true, sku: true } },
            },
          },
        },
      },
      canonicalProduct: { select: { id: true, name: true, sku: true } },
      media: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      inventoryLots: {
        where: { remainingQty: { gt: 0 } },
        orderBy: { receivedAt: "asc" }, // FIFO 순서: 첫 행이 다음 소진 대상
        take: 10,
        include: {
          supplierProduct: { select: { id: true, name: true, supplier: { select: { name: true } } } },
          incomingItem: {
            select: {
              id: true,
              quantity: true,
              totalPrice: true,
              itemShippingCost: true,
              itemShippingIsTaxable: true,
              incoming: {
                select: {
                  id: true,
                  incomingNo: true,
                  shippingCost: true,
                  shippingIsTaxable: true,
                  shippingDeducted: true,
                  items: {
                    select: {
                      id: true,
                      totalPrice: true,
                      quantity: true,
                      itemShippingCost: true,
                      itemShippingIsTaxable: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      specValues: {
        include: { slot: true },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      },
      // 추가구매 추천 (BundleProduct) — 메인 상품과 함께 사면 좋은 단독 카탈로그 상품들
      bundles: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: {
          bundleProduct: {
            select: {
              id: true,
              name: true,
              sku: true,
              sellingPrice: true,
              listPrice: true,
              imageUrl: true,
              taxType: true,
              productType: true,
            },
          },
        },
      },
      // 고객 옵션 도메인 (variant 와 분리됨) — 옵션 슬롯 + 값 + 매핑
      productOptions: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: {
          values: {
            where: { isActive: true },
            orderBy: { sortOrder: "asc" },
            include: {
              // sellingPrice/listPrice 포함 — SWAP 시 카트 라인 단가/정가 갱신 위해 필수
              mappedProduct: { select: { id: true, name: true, sku: true, sellingPrice: true, listPrice: true, taxType: true } },
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

  // 기존 SetComponent.slotId lazy backfill — 슬롯 정보로 매칭 가능하면 한 번 채움
  if (product.assemblyTemplate?.slots && product.setComponents.length > 0) {
    const slotsByLabelId = new Map<string, { id: string }>();
    const slotsByLabel = new Map<string, { id: string }>();
    for (const s of product.assemblyTemplate.slots) {
      if (s.slotLabelId) slotsByLabelId.set(s.slotLabelId, { id: s.id });
      if (s.label && s.label.trim()) slotsByLabel.set(s.label.trim(), { id: s.id });
    }
    const backfillOps: Promise<unknown>[] = [];
    for (const sc of product.setComponents) {
      if (sc.slotId) continue;
      let matched: string | null = null;
      if (sc.slotLabelId && slotsByLabelId.has(sc.slotLabelId)) {
        matched = slotsByLabelId.get(sc.slotLabelId)!.id;
      } else if (sc.label && slotsByLabel.has(sc.label.trim())) {
        matched = slotsByLabel.get(sc.label.trim())!.id;
      }
      if (matched) {
        backfillOps.push(
          prisma.setComponent.update({
            where: { id: sc.id },
            data: { slotId: matched },
          }),
        );
        // 응답에도 반영
        sc.slotId = matched;
      }
    }
    if (backfillOps.length > 0) {
      await Promise.all(backfillOps);
    }
  }

  // 매핑별 conversionRate lookup (lot 단위 환산용)
  const convRateBySpId = new Map<string, number>();
  for (const m of product.productMappings ?? []) {
    convRateBySpId.set(m.supplierProductId, Number(m.conversionRate) || 1);
  }

  // canonical(대표) 이면 자식 변형들의 lot 합산해서 표시
  let baseLots: typeof product.inventoryLots = product.inventoryLots ?? [];
  const variantInfoById = new Map<string, { id: string; name: string; sku: string }>();
  if (product.isCanonical && (product.variants?.length ?? 0) > 0) {
    const variantIds = product.variants.map((v) => v.id);
    for (const v of product.variants) {
      variantInfoById.set(v.id, { id: v.id, name: v.name, sku: v.sku });
    }

    // 변형들의 매핑도 convRateBySpId 에 추가 — 자식 lot 의 shippingPerUnit 환산용
    const variantMappings = await prisma.productMapping.findMany({
      where: { productId: { in: variantIds } },
      select: { supplierProductId: true, conversionRate: true },
    });
    for (const m of variantMappings) {
      // canonical 자체 매핑이 우선 (이미 set 됨), 변형 매핑은 비어있는 spId 만 채움
      if (!convRateBySpId.has(m.supplierProductId)) {
        convRateBySpId.set(m.supplierProductId, Number(m.conversionRate) || 1);
      }
    }

    const childLots = await prisma.inventoryLot.findMany({
      where: { productId: { in: variantIds }, remainingQty: { gt: 0 } },
      orderBy: { receivedAt: "asc" },
      take: 20,
      include: {
        supplierProduct: { select: { id: true, name: true, supplier: { select: { name: true } } } },
        incomingItem: {
          select: {
            id: true,
            quantity: true,
            totalPrice: true,
            itemShippingCost: true,
            itemShippingIsTaxable: true,
            incoming: {
              select: {
                id: true,
                incomingNo: true,
                shippingCost: true,
                shippingIsTaxable: true,
                shippingDeducted: true,
                items: {
                  select: {
                    id: true,
                    totalPrice: true,
                    quantity: true,
                    itemShippingCost: true,
                    itemShippingIsTaxable: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    baseLots = childLots as typeof product.inventoryLots;
  }

  // 잔여 로트에 효과 배송비 + 출처 라벨 + FIFO 사용중 표시
  // shippingPerUnit 은 lot 단위(매핑된 lot 이면 product 단위)로 환산해 표시 — lot.unitCost 와 단위 일치
  const enrichedLots = (baseLots ?? []).map((lot, idx) => {
    let shippingPerUnit = 0;
    let shippingIsTaxable = false;
    let shippingSource: "ITEM" | "ALLOCATED" | "DEDUCTED" | "ZERO" = "ZERO";
    let incomingId: string | null = null;
    let incomingNo: string | null = null;

    if (lot.incomingItem) {
      const it = lot.incomingItem;
      incomingId = it.incoming.id;
      incomingNo = it.incoming.incomingNo;
      const sib = it.incoming.items.map((s) => ({
        id: s.id,
        quantity: Number(s.quantity),
        totalPrice: Number(s.totalPrice),
        itemShippingCost:
          s.itemShippingCost === null || s.itemShippingCost === undefined ? null : Number(s.itemShippingCost),
        itemShippingIsTaxable: s.itemShippingIsTaxable,
      }));
      const map = computeShippingPerUnitDisplay(sib, {
        shippingCost: Number(it.incoming.shippingCost),
        shippingIsTaxable: it.incoming.shippingIsTaxable,
        shippingDeducted: it.incoming.shippingDeducted,
      });
      const eff = map.get(it.id);
      if (eff) {
        // 매핑된 lot 이면 product 단위 환산, orphan lot 이면 그대로
        const conv = lot.productId && lot.supplierProductId
          ? convRateBySpId.get(lot.supplierProductId) ?? 1
          : 1;
        shippingPerUnit = eff.perUnit / conv;
        shippingIsTaxable = eff.isTaxable;
        shippingSource = eff.source;
      }
    }

    const { incomingItem: _ii, ...lotRest } = lot;
    return {
      ...lotRest,
      incomingId,
      incomingNo,
      shippingPerUnit,
      shippingIsTaxable,
      shippingSource,
      isCurrentlyConsuming: idx === 0,
      variant: lot.productId ? variantInfoById.get(lot.productId) ?? null : null,
    };
  });

  // BOM 기반 예상 원가 / 마진 (조립상품 한정)
  let estimatedUnitCost: number | null = null;
  let estimatedMargin: number | null = null;
  let estimatedMarginRate: number | null = null;
  type CostSource = "LOT" | "SUPPLIER" | "BULK_PARENT" | "NONE";
  const estimatedCostBreakdown: Array<{
    componentId: string;
    componentName: string;
    componentSku: string;
    componentSpec: string | null;
    label: string | null;
    quantity: number;
    unitCost: number;
    /** 분해 — 공급단가 (환산 후, 세전) */
    supplierUnitPrice: number;
    /** 분해 — 개당 배송비 (세전) */
    shippingPerUnit: number;
    /** 분해 — 개당 부대비용 (세전) */
    incomingCostPerUnit: number;
    subtotal: number;
    costSource: CostSource;
    /** 매핑 정보 — 별도 섹션 표시용 */
    supplierName?: string | null;
    supplierProductName?: string | null;
    incomingCostList?: Array<{ name: string; costType: string; value: number; isTaxable: boolean }>;
  }> = [];
  let missingCostCount = 0;

  if ((product.productType === "ASSEMBLED" || product.isSet) && product.setComponents.length > 0) {
    const componentIds = product.setComponents.map((c) => c.componentId);

    // batch 1: 구성품들의 잔여 lot 가중평균
    const lots = await prisma.inventoryLot.findMany({
      where: { productId: { in: componentIds }, remainingQty: { gt: 0 } },
      select: { productId: true, remainingQty: true, unitCost: true },
    });
    const lotAggByProduct = new Map<string, { qty: number; cost: number }>();
    for (const l of lots) {
      if (!l.productId) continue;
      const acc = lotAggByProduct.get(l.productId) ?? { qty: 0, cost: 0 };
      const remQty = Number(l.remainingQty);
      const uCost = Number(l.unitCost);
      acc.qty += remQty;
      acc.cost += remQty * uCost;
      lotAggByProduct.set(l.productId, acc);
    }

    // batch 2: 매핑 → supplierProduct 단가/배송비/부대비용 폴백 (lot 없을 때 + 분해 표시용)
    const mappings = await prisma.productMapping.findMany({
      where: { productId: { in: componentIds } },
      select: {
        productId: true,
        conversionRate: true,
        supplierProduct: {
          select: {
            id: true,
            name: true,
            unitPrice: true,
            supplier: { select: { id: true, name: true } },
            incomingCosts: {
              where: { isActive: true },
              select: { id: true, name: true, costType: true, value: true, isTaxable: true },
            },
            incomingItems: {
              where: { incoming: { status: "CONFIRMED" } },
              select: {
                id: true,
                totalPrice: true,
                quantity: true,
                itemShippingCost: true,
                itemShippingIsTaxable: true,
                incoming: {
                  select: {
                    shippingCost: true,
                    shippingIsTaxable: true,
                    shippingDeducted: true,
                    items: {
                      select: {
                        id: true,
                        totalPrice: true,
                        quantity: true,
                        itemShippingCost: true,
                        itemShippingIsTaxable: true,
                      },
                    },
                  },
                },
              },
              orderBy: { incoming: { incomingDate: "desc" } },
              take: 50,
            },
          },
        },
      },
    });
    type SupplierBreakdown = {
      unit: number;
      shippingNet: number;
      incomingCostNet: number;
      supplierName: string;
      supplierProductName: string;
      incomingCostList: Array<{ name: string; costType: string; value: number; isTaxable: boolean }>;
    };
    const supplierBreakByProduct = new Map<string, SupplierBreakdown>();
    for (const m of mappings) {
      if (supplierBreakByProduct.has(m.productId)) continue;
      const conv = Number(m.conversionRate) || 1;
      const sp = m.supplierProduct;
      const unit = Number(sp.unitPrice) / conv;

      // 부대비용 (FIXED + PERCENTAGE) 세전 환산
      let incomingCostNet = 0;
      for (const c of sp.incomingCosts) {
        const v = Number(c.value);
        if (c.costType === "FIXED") {
          const raw = v / conv;
          incomingCostNet += c.isTaxable ? raw / 1.1 : raw;
        } else {
          // PERCENTAGE — 공급단가의 % (이미 환산된 unit 기준)
          const raw = (Number(sp.unitPrice) * v) / 100 / conv;
          incomingCostNet += c.isTaxable ? raw / 1.1 : raw;
        }
      }

      // 배송비 평균 (computeSupplierProductAvgShipping → 세전 환산)
      const { avgShippingCost, avgShippingIsTaxable } = computeSupplierProductAvgShipping(sp.incomingItems);
      const avgShipRaw = avgShippingCost !== null ? avgShippingCost / conv : 0;
      const shippingNet = avgShippingIsTaxable ? avgShipRaw / 1.1 : avgShipRaw;

      supplierBreakByProduct.set(m.productId, {
        unit,
        shippingNet,
        incomingCostNet,
        supplierName: sp.supplier.name,
        supplierProductName: sp.name,
        incomingCostList: sp.incomingCosts.map((c) => ({
          name: c.name,
          costType: c.costType,
          value: Number(c.value),
          isTaxable: c.isTaxable,
        })),
      });
    }
    const supplierPriceByProduct = new Map<string, number>();
    for (const [pid, b] of supplierBreakByProduct) {
      supplierPriceByProduct.set(pid, b.unit + b.shippingNet + b.incomingCostNet);
    }

    // batch 3: 벌크 부모(병) lot + 매핑 폴백 — fifo.ensureBulkStock 와 같은 환산
    const bulkComponentIds = product.setComponents
      .filter((c) => c.component.isBulk)
      .map((c) => c.componentId);
    const bulkParentAvgCost = new Map<string, number>();
    if (bulkComponentIds.length > 0) {
      const parentBottles = await prisma.product.findMany({
        where: {
          bulkProductId: { in: bulkComponentIds },
          isBulk: false,
          containerSize: { gt: 0 },
        },
        select: {
          id: true,
          bulkProductId: true,
          containerSize: true,
          productMappings: {
            select: {
              conversionRate: true,
              supplierProduct: {
                select: {
                  id: true,
                  name: true,
                  unitPrice: true,
                  supplier: { select: { id: true, name: true } },
                  incomingCosts: {
                    where: { isActive: true },
                    select: { id: true, name: true, costType: true, value: true, isTaxable: true },
                  },
                  incomingItems: {
                    where: { incoming: { status: "CONFIRMED" } },
                    orderBy: { incoming: { incomingDate: "desc" } },
                    take: 50,
                    select: {
                      id: true,
                      totalPrice: true,
                      quantity: true,
                      itemShippingCost: true,
                      itemShippingIsTaxable: true,
                      incoming: {
                        select: {
                          shippingCost: true,
                          shippingIsTaxable: true,
                          shippingDeducted: true,
                          items: {
                            select: {
                              id: true,
                              totalPrice: true,
                              quantity: true,
                              itemShippingCost: true,
                              itemShippingIsTaxable: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (parentBottles.length > 0) {
        const bottleIds = parentBottles.map((p) => p.id);
        const bottleLots = await prisma.inventoryLot.findMany({
          where: { productId: { in: bottleIds }, remainingQty: { gt: 0 } },
          select: { productId: true, remainingQty: true, unitCost: true },
        });
        const bottleById = new Map(parentBottles.map((p) => [p.id, p]));
        const bulkAgg = new Map<string, { qty: number; cost: number }>();
        for (const lot of bottleLots) {
          if (!lot.productId) continue;
          const bottle = bottleById.get(lot.productId);
          if (!bottle || !bottle.bulkProductId) continue;
          const cs = Number(bottle.containerSize ?? 0);
          if (cs <= 0) continue;
          const remQty = Number(lot.remainingQty);
          const uCost = Number(lot.unitCost);
          const bulkUnit = uCost / cs;
          const bulkQty = remQty * cs;
          const acc = bulkAgg.get(bottle.bulkProductId) ?? { qty: 0, cost: 0 };
          acc.qty += bulkQty;
          acc.cost += bulkQty * bulkUnit;
          bulkAgg.set(bottle.bulkProductId, acc);
        }
        for (const [bulkId, agg] of bulkAgg) {
          if (agg.qty > 0) {
            bulkParentAvgCost.set(bulkId, agg.cost / agg.qty);
          }
        }

        // 부모 병 매핑 정보 → 벌크 부품 supplier 분해 폴백
        for (const bottle of parentBottles) {
          if (!bottle.bulkProductId) continue;
          if (supplierBreakByProduct.has(bottle.bulkProductId)) continue;
          const cs = Number(bottle.containerSize ?? 0);
          if (cs <= 0) continue;
          const firstMapping = bottle.productMappings[0];
          if (!firstMapping) continue;
          const sp = firstMapping.supplierProduct;
          const conv = Number(firstMapping.conversionRate) || 1;

          // 부모 병 단위로 계산 후 / cs 환산해서 벌크 단위로
          const bottleUnit = Number(sp.unitPrice) / conv;
          const supplierUnit = bottleUnit / cs;

          let bottleIncomingCost = 0;
          for (const c of sp.incomingCosts) {
            const v = Number(c.value);
            if (c.costType === "FIXED") {
              const raw = v / conv;
              bottleIncomingCost += c.isTaxable ? raw / 1.1 : raw;
            } else {
              const raw = (Number(sp.unitPrice) * v) / 100 / conv;
              bottleIncomingCost += c.isTaxable ? raw / 1.1 : raw;
            }
          }
          const incomingCostNet = bottleIncomingCost / cs;

          const { avgShippingCost, avgShippingIsTaxable } = computeSupplierProductAvgShipping(sp.incomingItems);
          const avgShipRaw = avgShippingCost !== null ? avgShippingCost / conv : 0;
          const bottleShipping = avgShippingIsTaxable ? avgShipRaw / 1.1 : avgShipRaw;
          const shippingNet = bottleShipping / cs;

          supplierBreakByProduct.set(bottle.bulkProductId, {
            unit: supplierUnit,
            shippingNet,
            incomingCostNet,
            supplierName: sp.supplier.name,
            supplierProductName: `${sp.name} (벌크 부모)`,
            incomingCostList: sp.incomingCosts.map((c) => ({
              name: c.name,
              costType: c.costType,
              // FIXED 는 컨테이너로 환산 표시, PERCENTAGE 는 비율 그대로
              value: c.costType === "FIXED" ? Number(c.value) / cs : Number(c.value),
              isTaxable: c.isTaxable,
            })),
          });
          // supplierPriceByProduct 도 갱신
          supplierPriceByProduct.set(bottle.bulkProductId, supplierUnit + shippingNet + incomingCostNet);
        }
      }
    }

    let totalComponentCost = 0;
    for (const c of product.setComponents) {
      const qty = Number(c.quantity);
      const lotData = lotAggByProduct.get(c.componentId);
      const supplierBreak = supplierBreakByProduct.get(c.componentId);
      let unitCost = 0;
      let costSource: CostSource = "NONE";
      let supplierUnitPrice = 0;
      let shippingPerUnit = 0;
      let incomingCostPerUnit = 0;

      if (lotData && lotData.qty > 0) {
        unitCost = lotData.cost / lotData.qty;
        costSource = "LOT";
        // 분해는 SupplierProduct 매핑 기준 (lot 단가의 정확한 분해는 lot 별로만 가능하므로 매핑값으로 대체)
        if (supplierBreak) {
          supplierUnitPrice = supplierBreak.unit;
          shippingPerUnit = supplierBreak.shippingNet;
          incomingCostPerUnit = supplierBreak.incomingCostNet;
        } else {
          // 매핑 없는 lot — 전체를 공급단가로 표시
          supplierUnitPrice = unitCost;
        }
      } else if (supplierBreak) {
        unitCost = supplierBreak.unit + supplierBreak.shippingNet + supplierBreak.incomingCostNet;
        supplierUnitPrice = supplierBreak.unit;
        shippingPerUnit = supplierBreak.shippingNet;
        incomingCostPerUnit = supplierBreak.incomingCostNet;
        costSource = "SUPPLIER";
      } else if (bulkParentAvgCost.has(c.componentId)) {
        unitCost = bulkParentAvgCost.get(c.componentId) ?? 0;
        // 벌크 부모 폴백은 부모 lot 평균 / containerSize 로 분해 어려우므로 전체를 공급단가로
        supplierUnitPrice = unitCost;
        costSource = "BULK_PARENT";
      } else {
        missingCostCount += 1;
      }
      const subtotal = unitCost * qty;
      totalComponentCost += subtotal;
      estimatedCostBreakdown.push({
        componentId: c.componentId,
        componentName: c.component.name,
        componentSku: c.component.sku,
        componentSpec: c.component.spec ?? null,
        label: c.label ?? null,
        quantity: qty,
        unitCost,
        supplierUnitPrice,
        shippingPerUnit,
        incomingCostPerUnit,
        subtotal,
        costSource,
        supplierName: supplierBreak?.supplierName ?? null,
        supplierProductName: supplierBreak?.supplierProductName ?? null,
        incomingCostList: supplierBreak?.incomingCostList ?? [],
      });
    }

    const laborCost = product.assemblyTemplate?.defaultLaborCost
      ? Number(product.assemblyTemplate.defaultLaborCost)
      : 0;
    estimatedUnitCost = totalComponentCost + laborCost;

    // 판매비용 (전사 공통) 합산 — VAT 정책 준수
    const sellingPrice = Number(product.sellingPrice);
    let sellingCostTotal = 0;
    for (const sc of product.sellingCosts ?? []) {
      if (sc.costType === "FIXED") {
        const v = Number(sc.value);
        sellingCostTotal += sc.isTaxable ? v / 1.1 : v;
      } else {
        sellingCostTotal += sellingPrice * (Number(sc.value) / 100);
      }
    }

    estimatedMargin = sellingPrice - estimatedUnitCost - sellingCostTotal;
    estimatedMarginRate =
      sellingPrice > 0 ? (estimatedMargin / sellingPrice) * 100 : null;
  }

  // 채널별 예상 마진 — ChannelPricing 가 있는 채널만 (조립상품 한정)
  const estimatedMarginByChannel: Array<{
    channelId: string;
    channelName: string;
    channelCode: string;
    channelSellingPrice: number;
    channelFeeTotal: number;
    estimatedMargin: number;
    estimatedMarginRate: number | null;
  }> = [];
  if (estimatedUnitCost !== null && (product.channelPricings ?? []).length > 0) {
    const channelIds = product.channelPricings.map((cp) => cp.channelId);
    const fees = await prisma.channelFee.findMany({
      where: { channelId: { in: channelIds }, isActive: true },
      select: { channelId: true, feeType: true, value: true },
    });
    const feesByChannel = new Map<string, typeof fees>();
    for (const f of fees) {
      const arr = feesByChannel.get(f.channelId) ?? [];
      arr.push(f);
      feesByChannel.set(f.channelId, arr);
    }
    // 전사 공통 판매비용 (위에서 이미 sellingCostTotal 로 계산했지만 채널 가격에 따라 % 비용은 재계산 필요)
    for (const cp of product.channelPricings) {
      const cPrice = Number(cp.sellingPrice);
      let cFee = 0;
      for (const f of feesByChannel.get(cp.channelId) ?? []) {
        const v = Number(f.value);
        cFee += f.feeType === "PERCENTAGE" ? cPrice * (v / 100) : v;
      }
      let cSellingCost = 0;
      for (const sc of product.sellingCosts ?? []) {
        if (sc.costType === "FIXED") {
          const v = Number(sc.value);
          cSellingCost += sc.isTaxable ? v / 1.1 : v;
        } else {
          cSellingCost += cPrice * (Number(sc.value) / 100);
        }
      }
      const margin = cPrice - estimatedUnitCost - cSellingCost - cFee;
      estimatedMarginByChannel.push({
        channelId: cp.channelId,
        channelName: cp.channel.name,
        channelCode: cp.channel.code,
        channelSellingPrice: cPrice,
        channelFeeTotal: cFee,
        estimatedMargin: margin,
        estimatedMarginRate: cPrice > 0 ? (margin / cPrice) * 100 : null,
      });
    }
  }

  // 변형별 "가변 슬롯 부품" 요약 + 변형의 평균 원가 (canonical 의 KPI 계산용)
  const variableSlotKeys = new Set<string>();
  for (const s of product.assemblyTemplate?.slots ?? []) {
    if (!s.isVariable) continue;
    if (s.id) variableSlotKeys.add(`SID:${s.id}`);
    if (s.slotLabelId) variableSlotKeys.add(`LID:${s.slotLabelId}`);
    if (s.label && s.label.trim()) variableSlotKeys.add(`LBL:${s.label.trim()}`);
  }
  // 부모(canonical/단일) 의 가변 슬롯 부품을 키별로 매핑 (= 비교 기준)
  const parentVariableByKey = new Map<string, { componentId: string; quantity: number }>();
  // slotId 가 있으면 그 슬롯에 정확히 핀된 SC — LID/LBL 폴백 금지.
  // (같은 label 의 가변/고정 슬롯이 공존할 때 고정 슬롯 SC 가 LID/LBL 키로 가변에 잘못 매칭되는 것을 막음)
  const matchSlotKeys = (sc: { slotId: string | null; slotLabelId: string | null; label: string | null }): string[] => {
    if (sc.slotId) {
      return variableSlotKeys.has(`SID:${sc.slotId}`) ? [`SID:${sc.slotId}`] : [];
    }
    const keys: string[] = [];
    if (sc.slotLabelId && variableSlotKeys.has(`LID:${sc.slotLabelId}`)) keys.push(`LID:${sc.slotLabelId}`);
    if (sc.label && sc.label.trim() && variableSlotKeys.has(`LBL:${sc.label.trim()}`)) keys.push(`LBL:${sc.label.trim()}`);
    return keys;
  };
  for (const sc of product.setComponents ?? []) {
    for (const k of matchSlotKeys(sc)) {
      if (!parentVariableByKey.has(k)) {
        parentVariableByKey.set(k, { componentId: sc.componentId, quantity: Number(sc.quantity) });
      }
    }
  }

  const variantIds = (product.variants ?? []).map((v) => v.id);
  const variantLots = variantIds.length > 0
    ? await prisma.inventoryLot.findMany({
        where: { productId: { in: variantIds }, remainingQty: { gt: 0 } },
        select: { productId: true, remainingQty: true, unitCost: true },
      })
    : [];
  const variantLotAgg = new Map<string, { qty: number; cost: number }>();
  for (const lot of variantLots) {
    if (!lot.productId) continue;
    const remQty = Number(lot.remainingQty);
    const uCost = Number(lot.unitCost);
    const acc = variantLotAgg.get(lot.productId) ?? { qty: 0, cost: 0 };
    acc.qty += remQty;
    acc.cost += remQty * uCost;
    variantLotAgg.set(lot.productId, acc);
  }

  const enrichedVariants = (product.variants ?? []).map((v) => {
    // 가변 슬롯 부품 중 "부모와 다른 것만" 추출
    const variableComponents = (v.setComponents ?? [])
      .map((sc) => ({ sc, keys: matchSlotKeys(sc) }))
      .filter(({ keys }) => keys.length > 0)
      .filter(({ sc, keys }) => {
        // 부모와 같은지 비교 — 어느 키 하나라도 부모 매핑에 있고 동일하면 "같음"
        for (const k of keys) {
          const parent = parentVariableByKey.get(k);
          if (parent && parent.componentId === sc.componentId && parent.quantity === Number(sc.quantity)) {
            return false; // 부모와 동일 → 제외
          }
        }
        return true;
      })
      .map(({ sc }) => ({
        slotLabel: sc.label,
        componentName: sc.component.name,
        componentSku: sc.component.sku,
        quantity: sc.quantity.toString(),
      }));
    const agg = variantLotAgg.get(v.id);
    const avgInboundUnitCost = agg && agg.qty > 0 ? agg.cost / agg.qty : 0;
    return { ...v, variableComponents, avgInboundUnitCost };
  });

  // canonical 의 합산값 — 자식 lot 들의 가중평균 + 재고 합
  let canonicalAggregatedUnitCost = 0;
  let canonicalAggregatedQty = 0;
  if (product.isCanonical) {
    let totalQty = 0;
    let totalCost = 0;
    for (const agg of variantLotAgg.values()) {
      totalQty += agg.qty;
      totalCost += agg.cost;
    }
    if (totalQty > 0) canonicalAggregatedUnitCost = totalCost / totalQty;
    for (const v of product.variants ?? []) {
      canonicalAggregatedQty += v.inventory ? Number(v.inventory.quantity) : 0;
    }
  }

  // 역방향 관계 — 이 상품을 구성품으로 쓰는 상위 세트/조립 상품
  const parentLinks = await prisma.setComponent.findMany({
    where: { componentId: id },
    select: {
      id: true,
      quantity: true,
      label: true,
      setProduct: {
        select: { id: true, name: true, sku: true, productType: true, isActive: true },
      },
    },
  });
  const parentProducts = parentLinks
    .filter((l) => l.setProduct.isActive)
    .map((l) => ({
      linkId: l.id,
      quantity: l.quantity.toString(),
      label: l.label,
      id: l.setProduct.id,
      name: l.setProduct.name,
      sku: l.setProduct.sku,
      productType: l.setProduct.productType,
    }));

  // 역방향 관계 — 이 상품이 부속으로 소진된 수리 이력 (최근 50건)
  const repairPartRows = await prisma.repairPart.findMany({
    where: { productId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      quantity: true,
      status: true,
      createdAt: true,
      repairTicket: {
        select: {
          id: true,
          ticketNo: true,
          status: true,
          createdAt: true,
          customer: { select: { name: true } },
        },
      },
    },
  });
  const repairUsages = repairPartRows.map((r) => ({
    id: r.id,
    quantity: r.quantity.toString(),
    partStatus: r.status,
    usedAt: r.createdAt,
    ticketId: r.repairTicket.id,
    ticketNo: r.repairTicket.ticketNo,
    ticketStatus: r.repairTicket.status,
    customerName: r.repairTicket.customer?.name ?? null,
  }));

  // 현재 supplier-base unitCost (list API 와 동일 공식) + costAlert.
  // estimatedUnitCost (lot 가중평균 + 배송비 포함) 와는 별개 —
  // 알림은 "최신 공급가 변동" 추적이 목적이므로 lot 평균보다 supplier 단가가 적절.
  const baseUnitCost = computeBaseUnitCost({
    productMappings: product.productMappings,
    salesContainers: [], // 상세 API 는 salesContainers 미로드 — 벌크 SKU 상세는 null
    isBulk: product.isBulk,
  });
  let currentUnitCost: number | null = baseUnitCost;

  // 자체 매핑이 없는 조립/세트만 구성품 합으로 산출
  if (
    baseUnitCost === null &&
    isAssemblyLike(product) &&
    product.setComponents.length > 0
  ) {
    const componentIds = product.setComponents.map((c) => c.componentId);
    const components = await prisma.product.findMany({
      where: { id: { in: componentIds } },
      select: {
        id: true,
        isBulk: true,
        productMappings: {
          include: {
            supplierProduct: {
              select: {
                unitPrice: true,
                incomingCosts: {
                  where: { isActive: true },
                  select: { costType: true, value: true, isTaxable: true },
                },
              },
            },
          },
        },
        salesContainers: {
          where: { isActive: true },
          take: 1,
          select: {
            containerSize: true,
            productMappings: {
              include: {
                supplierProduct: {
                  select: {
                    unitPrice: true,
                    incomingCosts: {
                      where: { isActive: true },
                      select: { costType: true, value: true, isTaxable: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const costById = new Map<string, number | null>();
    for (const c of components) {
      costById.set(
        c.id,
        computeBaseUnitCost({
          productMappings: c.productMappings,
          salesContainers: c.salesContainers,
          isBulk: c.isBulk,
        }),
      );
    }
    currentUnitCost = computeAssemblyUnitCost(product.setComponents, costById);
  }

  const costAlert = deriveCostAlert({
    currentUnitCost,
    acknowledgedUnitCost: product.acknowledgedUnitCost,
  });

  return NextResponse.json({
    ...product,
    variants: enrichedVariants,
    inventoryLots: enrichedLots,
    estimatedUnitCost,
    estimatedMargin,
    estimatedMarginRate,
    estimatedCostBreakdown,
    estimatedMarginByChannel,
    missingCostCount,
    canonicalAggregatedUnitCost,
    canonicalAggregatedQty,
    parentProducts,
    repairUsages,
    currentUnitCost,
    costAlert,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = productSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const user = await getCurrentUser();

  const isSet = data.productType === "SET" || data.productType === "ASSEMBLED";
  const isOptionParent = data.productType === "OPTION_PARENT";
  const newSellingPrice = isOptionParent ? 0 : parseFloat(data.sellingPrice);
  const newListPrice = isOptionParent
    ? 0
    : parseFloat(data.listPrice ?? data.sellingPrice);

  // 가격 변경 이력 — 현재 DB 값 미리 조회 (업데이트 후 diff 비교용)
  // name/isCanonical 도 같이 가져와서 대표 상품 이름 변경 시 자식 변형들에 cascade.
  // autoMapped + sku 는 자동 검토완료 트리거용 (SKU/이름/가격 편집 시 자동 해제).
  const before = await prisma.product.findUnique({
    where: { id },
    select: {
      listPrice: true,
      sellingPrice: true,
      name: true,
      sku: true,
      isCanonical: true,
      autoMapped: true,
    },
  });
  const oldListPrice = before ? Number(before.listPrice) : 0;
  const oldSellingPrice = before ? Number(before.sellingPrice) : 0;
  // 자동매핑(autoMapped) 상품의 SKU/이름/판매가/정가 가 바뀌면 사용자가 사실상 검토한 것 →
  // 자동매핑 표시 해제. 별도 [검토 완료] 버튼 안 눌러도 자동 처리.
  const shouldClearAutoMapped =
    !!before?.autoMapped &&
    (before.sku !== data.sku ||
      before.name !== data.name ||
      oldSellingPrice !== newSellingPrice ||
      oldListPrice !== newListPrice);
  const reason =
    typeof body.priceChangeReason === "string" && body.priceChangeReason.trim().length > 0
      ? body.priceChangeReason.trim()
      : null;

  // 판매가·정가 변경 = 원가 변동을 "조치 완료"로 본다 → acknowledgedUnitCost 동기화.
  // 인라인 [판매가 조정] 진입과 사이드시트 편집 양쪽 모두 이 경로를 거치므로 한 곳에서 처리.
  const priceChanged =
    oldSellingPrice !== newSellingPrice || oldListPrice !== newListPrice;
  const ackUnitCost = priceChanged
    ? await computeCurrentUnitCostForId(prisma, id)
    : null;

  const product = await prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({
      where: { id },
      data: {
        name: data.name,
        brand: data.brand || null,
        brandId: data.brandId || null,
        modelName: data.modelName || null,
        spec: data.spec || null,
        containerSize: data.containerSize ? parseFloat(data.containerSize) : null,
        sku: data.sku,
        description: data.description || null,
        unitOfMeasure: data.unitOfMeasure,
        productType: data.productType,
        taxType: data.taxType,
        taxRate: parseFloat(data.taxRate),
        listPrice: newListPrice,
        sellingPrice: newSellingPrice,
        isSet,
        isBulk: data.isBulk ?? false,
        bulkProductId: data.bulkProductId || null,
        imageUrl: data.imageUrl ?? null,
        memo: data.memo || null,
        categoryId: data.categoryId || null,
        assemblyTemplateId: isOptionParent ? null : data.assemblyTemplateId || null,
        zeroRateEligible: data.zeroRateEligible ?? false,
        trackable: data.trackable ?? false,
        warrantyMonths: data.warrantyMonths ?? null,
        catalogHidden: data.catalogHidden ?? false,
        countryOfOrigin: data.countryOfOrigin ?? null,
        manufacturer: data.manufacturer ?? null,
        importer: data.importer ?? null,
        certifications: data.certifications ?? null,
        manufactureDate: data.manufactureDate ?? null,
        warrantyPolicy: data.warrantyPolicy ?? null,
        asResponsible: data.asResponsible ?? null,
        ...(shouldClearAutoMapped ? { autoMapped: false } : {}),
        ...(priceChanged
          ? {
              acknowledgedUnitCost: ackUnitCost,
              acknowledgedAt: new Date(),
              acknowledgedById: user?.id ?? null,
            }
          : {}),
      },
    });

    // 가격 변경 이력 — listPrice / sellingPrice 가 실제로 바뀐 경우에만 row 생성.
    // 단, oldPrice === 0 은 "초기 미설정 → 첫 입력" 으로 보고 이력에서 제외 (자동매핑
    // 상품의 첫 가격 입력이 "0 → X 상승" 처럼 잘못 표시되던 버그 방지). 명시적으로
    // 0 으로 리셋한 경우(oldPrice > 0, newPrice = 0) 는 진짜 변경이라 이력 기록.
    const historyRows: Array<{
      productId: string;
      field: string;
      oldPrice: number;
      newPrice: number;
      changeAmount: number;
      changePercent: number;
      reason: string | null;
      changedById: string | null;
    }> = [];
    if (oldListPrice !== newListPrice && oldListPrice > 0) {
      const diff = newListPrice - oldListPrice;
      const pct = (diff / oldListPrice) * 100;
      historyRows.push({
        productId: id,
        field: "LIST",
        oldPrice: oldListPrice,
        newPrice: newListPrice,
        changeAmount: diff,
        changePercent: Math.round(pct * 100) / 100,
        reason,
        changedById: user?.id ?? null,
      });
    }
    if (oldSellingPrice !== newSellingPrice && oldSellingPrice > 0) {
      const diff = newSellingPrice - oldSellingPrice;
      const pct = (diff / oldSellingPrice) * 100;
      historyRows.push({
        productId: id,
        field: "SELLING",
        oldPrice: oldSellingPrice,
        newPrice: newSellingPrice,
        changeAmount: diff,
        changePercent: Math.round(pct * 100) / 100,
        reason,
        changedById: user?.id ?? null,
      });
    }
    if (historyRows.length > 0) {
      await tx.productPriceHistory.createMany({ data: historyRows });
    }

    // 벌크 SKU 가격 자동 동기화 — 병 가격 ÷ containerSize
    if (updated.bulkProductId && updated.containerSize) {
      const containerSize = Number(updated.containerSize);
      if (containerSize > 0) {
        const bulkPrice = newSellingPrice / containerSize;
        await tx.product.update({
          where: { id: updated.bulkProductId },
          data: { listPrice: bulkPrice, sellingPrice: bulkPrice },
        });
      }
    }

    // 대표(canonical) 저장 시 자식 변형들의 본질 식별 필드 모두 동기화.
    // 변형은 설계상 canonical 과 같은 상품 (조립 구성품 일부만 다름) — 시리얼발번·보증·브랜드·
    // 이미지·카테고리 등은 항상 동일해야 카탈로그·POS·인벤토리에서 일관 동작.
    // SKU·가격은 variant 마다 다를 수 있어 의도적으로 제외.
    // 변경 여부와 무관하게 매번 호출 — 과거 cascade 없이 누적된 stale 변형을 한 번의 재저장으로 복구.
    if (before?.isCanonical) {
      await tx.product.updateMany({
        where: { canonicalProductId: id },
        data: {
          name: updated.name,
          trackable: updated.trackable,
          warrantyMonths: updated.warrantyMonths,
          warrantyPolicy: updated.warrantyPolicy,
          brand: updated.brand,
          brandId: updated.brandId,
          modelName: updated.modelName,
          spec: updated.spec,
          imageUrl: updated.imageUrl,
          description: updated.description,
          categoryId: updated.categoryId,
          zeroRateEligible: updated.zeroRateEligible,
          countryOfOrigin: updated.countryOfOrigin,
          manufacturer: updated.manufacturer,
          importer: updated.importer,
          certifications: updated.certifications,
          asResponsible: updated.asResponsible,
          catalogHidden: updated.catalogHidden,
        },
      });
    }

    return updated;
  });

  return NextResponse.json(product);
}

// 가벼운 부분 업데이트 (sku 등 단일 필드 수정)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const data: {
    sku?: string;
    name?: string;
    imageUrl?: string | null;
    autoMapped?: boolean;
    trackable?: boolean;
    catalogHidden?: boolean;
    assemblyTemplateId?: string | null;
  } = {};
  if (typeof body.sku === "string" && body.sku.trim().length > 0) {
    data.sku = body.sku.trim();
  }
  if (typeof body.name === "string" && body.name.trim().length > 0) {
    data.name = body.name.trim();
  }
  if (typeof body.imageUrl === "string" || body.imageUrl === null) {
    data.imageUrl = body.imageUrl;
  }
  if (typeof body.autoMapped === "boolean") {
    data.autoMapped = body.autoMapped;
  }
  if (typeof body.trackable === "boolean") {
    data.trackable = body.trackable;
  }
  if (typeof body.catalogHidden === "boolean") {
    data.catalogHidden = body.catalogHidden;
  }
  if (typeof body.assemblyTemplateId === "string" || body.assemblyTemplateId === null) {
    data.assemblyTemplateId = body.assemblyTemplateId || null;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "수정할 필드가 없습니다" }, { status: 400 });
  }
  try {
    // canonical cascade 대상 필드 — name/imageUrl/trackable/catalogHidden.
    // sku 는 variant 별로 고유, autoMapped/assemblyTemplateId 는 기술적 식별값이라 제외.
    const cascadeFields = ["name", "imageUrl", "trackable", "catalogHidden"] as const;
    const hasCascadeField = cascadeFields.some((f) => f in data);
    if (hasCascadeField) {
      const updated = await prisma.$transaction(async (tx) => {
        const before = await tx.product.findUnique({
          where: { id },
          select: { isCanonical: true },
        });
        const row = await tx.product.update({ where: { id }, data });
        // PUT 과 동일 — 변경 여부 무관, canonical 이면 항상 cascade (stale 복구용)
        if (before?.isCanonical) {
          const cascadeData: Record<string, unknown> = {};
          if ("name" in data) cascadeData.name = row.name;
          if ("imageUrl" in data) cascadeData.imageUrl = row.imageUrl;
          if ("trackable" in data) cascadeData.trackable = row.trackable;
          if ("catalogHidden" in data) cascadeData.catalogHidden = row.catalogHidden;
          await tx.product.updateMany({
            where: { canonicalProductId: id },
            data: cascadeData,
          });
        }
        return row;
      });
      return NextResponse.json(updated);
    }
    const updated = await prisma.product.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "수정 실패";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.$transaction([
    // 관련 매핑 삭제
    prisma.productMapping.deleteMany({ where: { productId: id } }),
    // 상품 비활성화
    prisma.product.update({ where: { id }, data: { isActive: false } }),
  ]);
  return NextResponse.json({ success: true });
}
