// 상품 상세페이지 인라인/Sheet 편집에서 사용하는 mutation 헬퍼
// — 각 함수는 단일 도메인 변경을 담당하며, useMutation 의 mutationFn 으로 호출
// — 에러는 throw 로 전파 (apiMutate 의 ApiError 또는 일반 Error)

import { apiMutate, ApiError } from "@/lib/api-client";

// ───────── 공통 타입 (UI ↔ 서버 양쪽에서 사용) ─────────

export interface CostInput {
  /** 신규 행은 undefined, 기존 행은 SellingCost.id */
  serverId?: string;
  name: string;
  costType: "FIXED" | "PERCENTAGE";
  value: string;
  perUnit: boolean;
  isTaxable: boolean;
}

export interface SetComponentInput {
  componentId: string;
  quantity: string;
  label?: string | null;
}

// ───────── 1. 상품 필드 PUT ─────────

export interface ProductFieldsInput {
  name: string;
  sku: string;
  brand?: string | null;
  brandId?: string | null;
  modelName?: string | null;
  spec?: string | null;
  description?: string | null;
  unitOfMeasure: string;
  productType: "FINISHED" | "PARTS" | "SET" | "ASSEMBLED";
  taxType: "TAXABLE" | "TAX_FREE";
  zeroRateEligible: boolean;
  taxRate: string;
  listPrice: string;
  sellingPrice: string;
  isSet?: boolean;
  isBulk?: boolean;
  containerSize?: string | null;
  bulkProductId?: string | null;
  imageUrl?: string | null;
  memo?: string | null;
  categoryId?: string | null;
  assemblyTemplateId?: string | null;
  trackable?: boolean;
  warrantyMonths?: number | null;
}

export async function updateProductFields(
  productId: string,
  fields: ProductFieldsInput,
): Promise<void> {
  await apiMutate(`/api/products/${productId}`, "PUT", fields);
}

// ───────── 2. 공급자 매핑 (변경 시 DELETE → POST) ─────────

export interface MappingState {
  mappingId: string | null;
  supplierProductId: string | null;
  conversionRate: string;
}

/**
 * 변경된 경우에만 기존 매핑 삭제 후 신규 등록.
 * - prev.supplierProductId === next.supplierProductId && prev.conversionRate === next.conversionRate → no-op
 * - next.supplierProductId === null → DELETE only
 * - prev.mappingId === null → POST only
 */
export async function replaceProductMapping(
  productId: string,
  prev: MappingState,
  next: { supplierProductId: string | null; conversionRate: string },
): Promise<{ mappingId: string | null }> {
  const noChange =
    prev.supplierProductId === next.supplierProductId &&
    (prev.conversionRate || "1") === (next.conversionRate || "1");
  if (noChange) return { mappingId: prev.mappingId };

  if (prev.mappingId) {
    await apiMutate(`/api/products/mapping?id=${prev.mappingId}`, "DELETE");
  }
  if (next.supplierProductId) {
    const created = await apiMutate<{ id: string }>("/api/products/mapping", "POST", {
      productId,
      supplierProductId: next.supplierProductId,
      conversionRate: next.conversionRate || "1",
    });
    return { mappingId: created?.id ?? null };
  }
  return { mappingId: null };
}

// ───────── 2b. ProductMapping diff (다중 매핑) ─────────

export interface ProductMappingRow {
  /** null = 신규 행 (POST), 값 있음 = 기존 매핑 */
  mappingId: string | null;
  supplierProductId: string;
  conversionRate: string;
}

export interface ExistingProductMapping {
  mappingId: string;
  supplierProductId: string;
  conversionRate: string;
}

/**
 * 다중 매핑 diff:
 * - prev 의 mappingId 가 next 에 없음 → DELETE
 * - next 의 mappingId 없음 (신규) → POST
 * - 같은 mappingId 인데 SP 또는 conversionRate 변경됨 → DELETE + POST (PUT API 미존재로 재생성)
 *
 * 같은 supplierProductId 가 next 에 두 번 들어가면 호출 측에서 사전 차단해야 한다 (POST 시 409).
 */
export async function diffProductMappings(
  productId: string,
  prev: ExistingProductMapping[],
  next: ProductMappingRow[],
): Promise<{ failed: string[] }> {
  const failed: string[] = [];
  const nextById = new Map(
    next.filter((r) => r.mappingId).map((r) => [r.mappingId!, r]),
  );

  // 1) 삭제: prev 에 있는데 next 에 없음
  for (const p of prev) {
    if (!nextById.has(p.mappingId)) {
      try {
        await apiMutate(`/api/products/mapping?id=${p.mappingId}`, "DELETE");
      } catch (e) {
        failed.push(`매핑 삭제 (${p.mappingId})`);
        if (!(e instanceof ApiError)) throw e;
      }
    }
  }

  // 2) 변경: 같은 mappingId 인데 SP/rate 다름 → DELETE + POST
  for (const n of next) {
    if (!n.mappingId) continue;
    const before = prev.find((p) => p.mappingId === n.mappingId);
    if (!before) continue;
    const unchanged =
      before.supplierProductId === n.supplierProductId &&
      (before.conversionRate || "1") === (n.conversionRate || "1");
    if (unchanged) continue;
    try {
      await apiMutate(`/api/products/mapping?id=${n.mappingId}`, "DELETE");
    } catch (e) {
      failed.push("매핑 갱신 삭제");
      if (!(e instanceof ApiError)) throw e;
      continue;
    }
    try {
      await apiMutate("/api/products/mapping", "POST", {
        productId,
        supplierProductId: n.supplierProductId,
        conversionRate: n.conversionRate || "1",
      });
    } catch (e) {
      failed.push("매핑 갱신 등록");
      if (!(e instanceof ApiError)) throw e;
    }
  }

  // 3) 신규: mappingId 없음
  for (const n of next) {
    if (n.mappingId) continue;
    if (!n.supplierProductId) continue;
    try {
      await apiMutate("/api/products/mapping", "POST", {
        productId,
        supplierProductId: n.supplierProductId,
        conversionRate: n.conversionRate || "1",
      });
    } catch (e) {
      failed.push("매핑 추가");
      if (!(e instanceof ApiError)) throw e;
    }
  }

  return { failed };
}

// ───────── 3. SellingCost diff (전사 + 채널별) ─────────

/**
 * SellingCost 그룹(전사 또는 한 채널)을 diff 적용:
 * - prev에 있는데 next에 없는 serverId → DELETE
 * - next에 serverId 있는데 변경됨 → DELETE + POST (PUT API 미존재로 교체)
 * - next에 serverId 없음 (신규) + name/value 모두 채워짐 → POST
 *
 * 주의: 호출 측에서 prev 비용 목록을 정확히 알아야 한다 (서버 응답에서 가져옴).
 */
export async function diffSellingCosts(
  productId: string,
  channelId: string | null,
  prev: CostInput[],
  next: CostInput[],
): Promise<{ failed: string[] }> {
  const failed: string[] = [];
  const nextById = new Map(
    next.filter((c) => c.serverId).map((c) => [c.serverId!, c]),
  );

  // 삭제: prev 의 serverId 가 next 에 없음
  for (const p of prev) {
    if (!p.serverId) continue;
    if (!nextById.has(p.serverId)) {
      try {
        await apiMutate(
          `/api/products/${productId}/costs?costId=${p.serverId}`,
          "DELETE",
        );
      } catch (e) {
        failed.push(`${p.name} 삭제`);
        if (!(e instanceof ApiError)) throw e;
      }
    }
  }

  // 신규/변경
  for (const n of next) {
    if (!n.name.trim() || !n.value) continue; // 빈 행 스킵
    if (n.serverId) {
      // 기존 행 — DELETE + POST 로 교체 (PUT API 미존재)
      const before = prev.find((p) => p.serverId === n.serverId);
      const unchanged =
        before &&
        before.name === n.name &&
        before.costType === n.costType &&
        before.value === n.value &&
        before.perUnit === n.perUnit &&
        before.isTaxable === n.isTaxable;
      if (unchanged) continue;
      try {
        await apiMutate(
          `/api/products/${productId}/costs?costId=${n.serverId}`,
          "DELETE",
        );
      } catch (e) {
        failed.push(`${n.name} 갱신 삭제`);
        if (!(e instanceof ApiError)) throw e;
        continue;
      }
      try {
        await apiMutate(`/api/products/${productId}/costs`, "POST", {
          name: n.name,
          costType: n.costType,
          value: n.value,
          perUnit: n.perUnit,
          isTaxable: n.isTaxable,
          channelId,
        });
      } catch (e) {
        failed.push(`${n.name} 갱신 등록`);
        if (!(e instanceof ApiError)) throw e;
      }
    } else {
      try {
        await apiMutate(`/api/products/${productId}/costs`, "POST", {
          name: n.name,
          costType: n.costType,
          value: n.value,
          perUnit: n.perUnit,
          isTaxable: n.isTaxable,
          channelId,
        });
      } catch (e) {
        failed.push(`${n.name} 등록`);
        if (!(e instanceof ApiError)) throw e;
      }
    }
  }

  return { failed };
}

// ───────── 4. ChannelPricing 동기화 ─────────

export interface ChannelPriceState {
  channelId: string;
  /** undefined → 비활성, "0"/숫자 → 활성 */
  price: string | null;
}

export interface ChannelPricingExisting {
  pricingId: string;
  channelId: string;
}

/**
 * 채널 가격 일괄 동기화:
 * - next 활성: POST (서버 upsert)
 * - prev 에 있던 channel 이 next 에서 비활성/누락 → DELETE
 */
export async function syncChannelPricings(
  productId: string,
  prev: ChannelPricingExisting[],
  next: ChannelPriceState[],
): Promise<{ failed: string[] }> {
  const failed: string[] = [];
  const enabledIds = new Set(
    next.filter((n) => n.price != null && n.price !== "").map((n) => n.channelId),
  );

  // upsert
  for (const n of next) {
    if (n.price == null || n.price === "") continue;
    try {
      await apiMutate(`/api/products/${productId}/channel-pricing`, "POST", {
        channelId: n.channelId,
        sellingPrice: n.price,
      });
    } catch (e) {
      failed.push(`채널 ${n.channelId} 가격 저장`);
      if (!(e instanceof ApiError)) throw e;
    }
  }

  // disable
  for (const p of prev) {
    if (!enabledIds.has(p.channelId)) {
      try {
        await apiMutate(
          `/api/products/${productId}/channel-pricing?pricingId=${p.pricingId}`,
          "DELETE",
        );
      } catch (e) {
        failed.push(`채널 ${p.channelId} 가격 삭제`);
        if (!(e instanceof ApiError)) throw e;
      }
    }
  }

  return { failed };
}

// ───────── 5. SetComponent 전체 교체 ─────────

export async function replaceSetComponents(
  productId: string,
  components: SetComponentInput[],
): Promise<void> {
  await apiMutate("/api/products/sets", "POST", {
    productId,
    components: components.map((c) => ({
      componentId: c.componentId,
      quantity: c.quantity,
      label: c.label ?? null,
    })),
  });
}
