// Edit mode submit logic — PUT product + diff sub-resources

import type {
  ChannelPriceRow,
  CostRow,
  ProductType,
  SetComponentRow,
} from "./types";

interface ProductFormState {
  name: string;
  brand: string;
  brandId: string;
  brandName: string;
  spec: string;
  sku: string;
  modelName: string;
  unitOfMeasure: string;
  taxType: "TAXABLE" | "TAX_FREE" | "ZERO_RATE";
  taxRate: string;
  listPrice: string;
  sellingPrice: string;
  memo: string;
  vatIncluded: boolean;
  categoryId: string;
}

interface MappingState {
  supplierId: string;
  supplierProductId: string;
  conversionRate: string;
  isProvisional: boolean;
}

export interface InitialEditData {
  productId: string;
  /** 기존 매핑 row id (변경 감지용) */
  initialMappingId: string | null;
  initialSupplierProductId: string | null;
  initialConversionRate: string | null;
}

export interface SubmitEditArgs {
  productId: string;
  productType: ProductType;
  form: ProductFormState;
  toNetPrice: (v: string) => string;
  mapping: MappingState;
  initialMappingId: string | null;
  initialSupplierProductId: string | null;
  initialConversionRate: string | null;
  incomingCosts: CostRow[];
  initialIncomingCostIds: string[];
  sellingCosts: CostRow[];
  initialSellingCostIds: string[]; // global only
  channelSellingCosts: Record<string, CostRow[]>;
  initialChannelSellingCostIds: Record<string, string[]>;
  channelPrices: ChannelPriceRow[];
  initialChannelPricings: Array<{ id: string; channelId: string }>;
  setComponents: SetComponentRow[];
  isBulk: boolean;
  containerSize: string;
  bulkProductId: string | null;
  imageUrl: string | null;
}

export interface SubmitEditResult {
  ok: boolean;
  errors: string[];
}

const j = (b: object) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(b),
});

/**
 * 수정 모드 제출.
 *
 * 1) PUT /api/products/{id} (product fields)
 * 2) Mapping diff (변경 시 DELETE + POST)
 * 3) IncomingCost diff (serverId 기반)
 * 4) SellingCost diff (전사 + 채널별, serverId 기반)
 * 5) ChannelPricing 동기화 (upsert + 사라진 row DELETE)
 * 6) SetComponent 전체 교체 (SET / ASSEMBLED)
 */
export async function submitEdit(args: SubmitEditArgs): Promise<SubmitEditResult> {
  const errors: string[] = [];
  const {
    productId,
    productType,
    form,
    toNetPrice,
    mapping,
    initialMappingId,
    initialSupplierProductId,
    initialConversionRate,
    incomingCosts,
    initialIncomingCostIds,
    sellingCosts,
    initialSellingCostIds,
    channelSellingCosts,
    initialChannelSellingCostIds,
    channelPrices,
    initialChannelPricings,
    setComponents,
    isBulk,
    containerSize,
    bulkProductId,
    imageUrl,
  } = args;

  // 1) PUT product
  const productBody = {
    name: form.name,
    brand: form.brandName || form.brand || "",
    brandId: form.brandId || null,
    modelName: form.modelName || null,
    spec: form.spec || null,
    sku: form.sku,
    description: undefined,
    unitOfMeasure: form.unitOfMeasure,
    productType,
    taxType: form.taxType,
    taxRate: form.taxRate,
    listPrice: toNetPrice(form.listPrice || form.sellingPrice),
    sellingPrice: toNetPrice(form.sellingPrice),
    isSet: productType === "SET" || productType === "ASSEMBLED",
    memo: form.memo || null,
    categoryId: form.categoryId || null,
    isBulk,
    containerSize: containerSize || null,
    bulkProductId,
    imageUrl,
  };
  const putRes = await fetch(`/api/products/${productId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(productBody),
  });
  if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}));
    return {
      ok: false,
      errors: [typeof err.error === "string" ? err.error : "상품 정보 저장 실패"],
    };
  }

  // 2) Mapping diff (FINISHED / PARTS 만)
  if (productType === "FINISHED" || productType === "PARTS") {
    const wantsMapping = !!(mapping.supplierId && mapping.supplierProductId);
    const mappingChanged =
      initialSupplierProductId !== mapping.supplierProductId ||
      (initialConversionRate ?? "1") !== (mapping.conversionRate || "1");

    if (initialMappingId && (!wantsMapping || mappingChanged)) {
      const r = await fetch(`/api/products/mapping?id=${initialMappingId}`, {
        method: "DELETE",
      });
      if (!r.ok) errors.push("기존 매핑 삭제");
    }
    if (wantsMapping && (!initialMappingId || mappingChanged)) {
      const r = await fetch("/api/products/mapping", j({
        productId,
        supplierProductId: mapping.supplierProductId,
        conversionRate: mapping.conversionRate || "1",
      }));
      if (!r.ok) errors.push("매핑 등록");
    }

    // 3) IncomingCost diff — supplierProduct 단위
    if (mapping.supplierProductId) {
      const currentIds = new Set(
        incomingCosts.map((c) => c.serverId).filter((x): x is string => !!x),
      );
      // 사라진 비용 삭제
      for (const id of initialIncomingCostIds) {
        if (!currentIds.has(id)) {
          const r = await fetch(
            `/api/supplier-products/${mapping.supplierProductId}/costs?costId=${id}`,
            { method: "DELETE" },
          );
          if (!r.ok) errors.push(`입고비용 삭제 (${id})`);
        }
      }
      // 신규 비용 등록
      for (const cost of incomingCosts.filter((c) => !c.serverId && c.name && c.value)) {
        const r = await fetch(
          `/api/supplier-products/${mapping.supplierProductId}/costs`,
          j({
            name: cost.name,
            costType: cost.costType,
            value: cost.value,
            perUnit: cost.perUnit,
          }),
        );
        if (!r.ok) errors.push(`입고비용 등록 (${cost.name})`);
      }
      // 기존 비용 변경 — 현재 API에 PUT 없음. DELETE + POST 로 교체
      for (const cost of incomingCosts.filter((c) => c.serverId && c.name && c.value)) {
        // 변경됐는지 알기 어려우므로 안전하게 모두 교체
        const delRes = await fetch(
          `/api/supplier-products/${mapping.supplierProductId}/costs?costId=${cost.serverId}`,
          { method: "DELETE" },
        );
        if (!delRes.ok) {
          errors.push(`입고비용 갱신 삭제 (${cost.name})`);
          continue;
        }
        const postRes = await fetch(
          `/api/supplier-products/${mapping.supplierProductId}/costs`,
          j({
            name: cost.name,
            costType: cost.costType,
            value: cost.value,
            perUnit: cost.perUnit,
          }),
        );
        if (!postRes.ok) errors.push(`입고비용 갱신 등록 (${cost.name})`);
      }
    }
  }

  // 4) SellingCost diff — 전사 + 채널별
  await diffSellingCosts({
    productId,
    channelId: null,
    rows: sellingCosts,
    initialIds: initialSellingCostIds,
    errors,
    label: "판매비용",
  });

  for (const channelId of new Set([
    ...Object.keys(channelSellingCosts),
    ...Object.keys(initialChannelSellingCostIds),
  ])) {
    await diffSellingCosts({
      productId,
      channelId,
      rows: channelSellingCosts[channelId] ?? [],
      initialIds: initialChannelSellingCostIds[channelId] ?? [],
      errors,
      label: `채널 판매비용 (${channelId})`,
    });
  }

  // 5) ChannelPricing 동기화
  // upsert: 활성화된 채널은 POST (서버에서 upsert)
  for (const row of channelPrices.filter((r) => r.enabled && r.price)) {
    const r = await fetch(`/api/products/${productId}/channel-pricing`, j({
      channelId: row.channelId,
      sellingPrice: row.price,
    }));
    if (!r.ok) errors.push(`채널 가격 등록 (${row.channelId})`);
  }
  // disabled 채널: 기존에 있었다면 DELETE
  const enabledIds = new Set(
    channelPrices.filter((r) => r.enabled && r.price).map((r) => r.channelId),
  );
  for (const ip of initialChannelPricings) {
    if (!enabledIds.has(ip.channelId)) {
      const r = await fetch(
        `/api/products/${productId}/channel-pricing?pricingId=${ip.id}`,
        { method: "DELETE" },
      );
      if (!r.ok) errors.push(`채널 가격 삭제 (${ip.channelId})`);
    }
  }

  // 6) SetComponent — SET / ASSEMBLED 일 때 전체 교체
  if (productType === "SET" || productType === "ASSEMBLED") {
    const validComponents = setComponents.filter((c) => c.product);
    const r = await fetch("/api/products/sets", j({
      productId,
      components: validComponents.map((c) => ({
        componentId: c.product!.id,
        quantity: c.quantity,
        label: c.label ?? null,
      })),
    }));
    if (!r.ok) errors.push("구성 상품 갱신");
  }

  return { ok: errors.length === 0, errors };
}

async function diffSellingCosts({
  productId,
  channelId,
  rows,
  initialIds,
  errors,
  label,
}: {
  productId: string;
  channelId: string | null;
  rows: CostRow[];
  initialIds: string[];
  errors: string[];
  label: string;
}) {
  const currentIds = new Set(rows.map((r) => r.serverId).filter((x): x is string => !!x));

  // 삭제
  for (const id of initialIds) {
    if (!currentIds.has(id)) {
      const r = await fetch(
        `/api/products/${productId}/costs?costId=${id}`,
        { method: "DELETE" },
      );
      if (!r.ok) errors.push(`${label} 삭제 (${id})`);
    }
  }
  // 신규 등록
  for (const cost of rows.filter((c) => !c.serverId && c.name && c.value)) {
    const r = await fetch(`/api/products/${productId}/costs`, j({
      name: cost.name,
      costType: cost.costType,
      value: cost.value,
      perUnit: cost.perUnit,
      isTaxable: cost.isTaxable,
      channelId,
    }));
    if (!r.ok) errors.push(`${label} 등록 (${cost.name})`);
  }
  // 기존 변경 — DELETE + POST 로 교체 (PUT 없음)
  for (const cost of rows.filter((c) => c.serverId && c.name && c.value)) {
    const delRes = await fetch(
      `/api/products/${productId}/costs?costId=${cost.serverId}`,
      { method: "DELETE" },
    );
    if (!delRes.ok) {
      errors.push(`${label} 갱신 삭제 (${cost.name})`);
      continue;
    }
    const postRes = await fetch(`/api/products/${productId}/costs`, j({
      name: cost.name,
      costType: cost.costType,
      value: cost.value,
      perUnit: cost.perUnit,
      isTaxable: cost.isTaxable,
      channelId,
    }));
    if (!postRes.ok) errors.push(`${label} 갱신 등록 (${cost.name})`);
  }
}
