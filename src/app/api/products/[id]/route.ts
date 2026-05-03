import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeShippingPerUnitDisplay } from "@/lib/incoming-shipping";
import { computeSupplierProductAvgShipping } from "@/lib/cost-utils";
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
        include: { component: { select: { id: true, name: true, sku: true, isBulk: true } } },
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
  const matchSlotKeys = (sc: { slotId: string | null; slotLabelId: string | null; label: string | null }): string[] => {
    const keys: string[] = [];
    if (sc.slotId && variableSlotKeys.has(`SID:${sc.slotId}`)) keys.push(`SID:${sc.slotId}`);
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

  const isSet = data.productType === "SET" || data.productType === "ASSEMBLED";
  const newSellingPrice = parseFloat(data.sellingPrice);

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
        listPrice: parseFloat(data.listPrice ?? data.sellingPrice),
        sellingPrice: newSellingPrice,
        isSet,
        isBulk: data.isBulk ?? false,
        bulkProductId: data.bulkProductId || null,
        imageUrl: data.imageUrl ?? null,
        memo: data.memo || null,
        categoryId: data.categoryId || null,
        assemblyTemplateId: data.assemblyTemplateId || null,
        zeroRateEligible: data.zeroRateEligible ?? false,
        trackable: data.trackable ?? false,
        warrantyMonths: data.warrantyMonths ?? null,
      },
    });

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
  const data: { sku?: string; name?: string; imageUrl?: string | null } = {};
  if (typeof body.sku === "string" && body.sku.trim().length > 0) {
    data.sku = body.sku.trim();
  }
  if (typeof body.name === "string" && body.name.trim().length > 0) {
    data.name = body.name.trim();
  }
  if (typeof body.imageUrl === "string" || body.imageUrl === null) {
    data.imageUrl = body.imageUrl;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "수정할 필드가 없습니다" }, { status: 400 });
  }
  try {
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
