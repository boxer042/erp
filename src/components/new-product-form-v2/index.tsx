"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { focusCaretEnd } from "@/jm/lib/focus";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  JmButton,
  JmCard,
  JmCardContent,
  JmCheckbox,
  JmDialog,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmIconButton,
  JmInput,
  JmSelect,
  JmSwitch,
  JmTextarea,
  JmTooltipContent,
  JmTooltipProvider,
  JmTooltipRoot,
  JmTooltipTrigger,
} from "@/jm";
import { RefreshCw, Plus, X, Loader2, ChevronLeft, ChevronRight, Calculator, Info } from "lucide-react";
import { ComponentIncomingInfoSections } from "@/components/product";
import { toast } from "sonner";
import { UNITS_OF_MEASURE } from "@/lib/constants";
import { formatComma, parseComma } from "@/lib/utils";
import { SupplierCombobox } from "@/components/supplier-combobox";
import { SupplierProductCombobox } from "@/components/supplier-product-combobox";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";
import { AssemblyTemplateCombobox } from "@/components/assembly-template-combobox";
import { AssemblyPresetCombobox } from "@/components/assembly-preset-combobox";
import { PriceInputDialog } from "@/app/(pos)/pos/_components/price-input-dialog";
import { AssemblySlotLabelCombobox } from "@/components/assembly-slot-label-combobox";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { BrandCombobox, type BrandOption } from "@/components/brand-combobox";
import type { CategoryOption } from "@/components/new-product-form/types";
import {
  QuickSupplierSheet,
  QuickSupplierProductSheet,
  QuickBrandSheet,
} from "@/components/quick-register-sheets";
import {
  TYPE_ACCENT,
  generateSku,
  emptySetComponent,
  emptyParentRow,
  type Supplier,
  type SupplierProduct,
  type SupplierProductCostItem,
  type CostRow,
  type Channel,
  type ChannelPriceRow,
  type SetComponentRow,
  type ParentProductRow,
  type ProductType,
} from "../new-product-form/types";
import {
  Field,
  SectionTitle,
  CostList,
  TypeSelectScreen,
  PRODUCT_TYPE_CARDS,
  NameAutocomplete,
} from "../new-product-form/parts";
import { ShippingHistoryCard } from "@/components/shipping-history-card";
import { buildSteps, STEP_LABEL, type StepId } from "./steps";

// OPTION_PARENT 옵션값 한 줄 — 라벨 + 연결할 단품(SWAP 대상)
type OptionValueRow = {
  rowId: string;
  label: string;
  product: ProductOption | null;
};
const newOptionValueRow = (): OptionValueRow => ({
  rowId: Math.random().toString(36).slice(2),
  label: "",
  product: null,
});

export interface NewProductFormProps {
  suppliers: Supplier[];
  channels: Channel[];
  existingProducts: ProductOption[];
  brands: BrandOption[];
  categories?: CategoryOption[];
  /** 진입 시 미리 선택된 상품 유형 (생략 시 type selector 화면 노출) */
  defaultProductType?: ProductType;
  /** true면 상품 유형 변경 불가 (조립상품 전용 진입점에서 사용) */
  lockProductType?: boolean;
}

// ── 메인 컴포넌트 ──
export function NewProductForm({
  suppliers: initialSuppliers,
  channels,
  existingProducts,
  brands: initialBrands,
  categories = [],
  defaultProductType,
  lockProductType = false,
}: NewProductFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetCanonicalId = searchParams?.get("canonicalProductId") ?? "";
  const presetSupplierId = searchParams?.get("supplierId") ?? "";
  const presetSupplierProductId = searchParams?.get("supplierProductId") ?? "";
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [brands, setBrands] = useState<BrandOption[]>(initialBrands);
  const [quickBrandOpen, setQuickBrandOpen] = useState(false);
  const [quickBrandDefaultName, setQuickBrandDefaultName] = useState("");
  // 벌크 상품 옵션 (Phase 9)
  const [bulkUsable, setBulkUsable] = useState(false);
  const [containerSize, setContainerSize] = useState("");
  const [newBulkName, setNewBulkName] = useState("");
  const [newBulkUnit, setNewBulkUnit] = useState("mL");
  const bulkNameAutoSync = useRef(true);
  const [productType, setProductType] = useState<ProductType>(
    defaultProductType ?? "FINISHED",
  );
  // 스텝 마법사 — 0=type, 1=basic, ... 마지막=review
  const [currentStepIdx, setCurrentStepIdx] = useState(
    defaultProductType || presetCanonicalId ? 1 : 0,
  );

  const [form, setForm] = useState({
    name: "",
    brand: "",
    brandId: "",
    brandName: "",
    spec: "",
    sku: generateSku(),
    modelName: "",
    unitOfMeasure: "EA",
    taxType: "TAXABLE" as "TAXABLE" | "TAX_FREE",
    zeroRateEligible: false,
    taxRate: "0.1",
    listPrice: "0",
    sellingPrice: "0",
    memo: "",
    vatIncluded: false,
    categoryId: "",
    trackable: false,
    warrantyMonths: "",
    /** 카탈로그 비노출 — 옵션 swap 대상 SKU 단독 노출 차단 (P006 가습기-블랙 같은 케이스) */
    catalogHidden: false,
  });

  // 변형(variant) 연결 — URL `?canonicalProductId=<id>` 로 진입 시 자동 채움
  const [canonicalProductId] = useState<string>(presetCanonicalId);

  const [mapping, setMapping] = useState({
    supplierId: presetSupplierId,
    supplierProductId: presetSupplierProductId,
    conversionRate: "1",
    isProvisional: false,
    syncName: false,
  });
  const [supplierProducts, setSupplierProducts] = useState<SupplierProduct[]>([]);
  const [loadingSupplierProducts, setLoadingSupplierProducts] = useState(false);

  const [quickSupplierOpen, setQuickSupplierOpen] = useState(false);
  const [quickSupplierDefaultName, setQuickSupplierDefaultName] = useState("");
  const [quickSupplierProductOpen, setQuickSupplierProductOpen] = useState(false);
  const [quickSupplierProductDefaultName, setQuickSupplierProductDefaultName] = useState("");

  const [incomingCosts, setIncomingCosts] = useState<CostRow[]>([]);
  const [sellingCosts, setSellingCosts] = useState<CostRow[]>([]);
  // 채널별 전용 판매비용 (key: channelId)
  const [channelSellingCosts, setChannelSellingCosts] = useState<Record<string, CostRow[]>>({});
  const [avgShippingCost, setAvgShippingCost] = useState<number | null>(null);
  const [avgShippingIsTaxable, setAvgShippingIsTaxable] = useState(false);
  const [avgIncomingCost, setAvgIncomingCost] = useState<number | null>(null);

  const [baseCost, setBaseCost] = useState("");
  const [targetMargin, setTargetMargin] = useState("20");
  const [targetMarginAmount, setTargetMarginAmount] = useState("");
  const [manualVatPrice, setManualVatPrice] = useState("");
  const [manualSupplyPrice, setManualSupplyPrice] = useState("");
  const [lastEdited, setLastEdited] = useState<"rate" | "amount" | "price" | "supply" | null>(null);
  const [listPriceDialogOpen, setListPriceDialogOpen] = useState(false);
  // 할인% / 할인금액 입력 — 타이핑 중에는 raw 입력값, 블러 후에는 계산된 값 표시
  const [discountPctInput, setDiscountPctInput] = useState("");
  const [discountAmtInput, setDiscountAmtInput] = useState("");
  const [discountInputActive, setDiscountInputActive] = useState<"pct" | "amt" | null>(null);

  const [cardFeeRate, setCardFeeRate] = useState<number>(0);

  const [channelPrices, setChannelPrices] = useState<ChannelPriceRow[]>(() =>
    channels.map((ch) => ({
      channelId: ch.id,
      price: "",
      enabled: false,
      lastEdited: null,
      targetRate: "",
      targetAmount: "",
    })),
  );

  const [setComponents, setSetComponents] = useState<SetComponentRow[]>([emptySetComponent()]);
  const [assemblyCosts, setAssemblyCosts] = useState<CostRow[]>([]);
  const [parentProducts, setParentProducts] = useState<ParentProductRow[]>([]);

  // OPTION_PARENT — 옵션 슬롯명 + 옵션값(연결 단품) 행들
  const [optionSlotName, setOptionSlotName] = useState("색상");
  const [optionParentValues, setOptionParentValues] = useState<OptionValueRow[]>([
    newOptionValueRow(),
  ]);

  // 조립 슬롯 라벨 마스터 — 구성상품 라벨 콤보박스에서 선택/생성
  const queryClient = useQueryClient();
  const slotLabelsQuery = useQuery({
    queryKey: queryKeys.assemblySlotLabels.list(),
    queryFn: () => apiGet<Array<{ id: string; name: string; isActive: boolean }>>("/api/assembly-slot-labels"),
    enabled: productType === "ASSEMBLED",
  });
  const slotLabels = useMemo(
    () => (slotLabelsQuery.data ?? []).filter((l) => l.isActive),
    [slotLabelsQuery.data],
  );
  const productNameItems = useMemo(
    () => existingProducts.map((p) => ({ id: p.id, name: p.name, badge: p.sku })),
    [existingProducts],
  );
  const createSlotLabelMutation = useMutation({
    mutationFn: (payload: { name: string; rowIdx: number }) =>
      apiMutate<{ id: string; name: string }>("/api/assembly-slot-labels", "POST", { name: payload.name }).then(
        (label) => ({ label, rowIdx: payload.rowIdx }),
      ),
    onSuccess: ({ label, rowIdx }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.assemblySlotLabels.all });
      setSetComponents((prev) =>
        prev.map((r, i) => (i === rowIdx ? { ...r, slotLabelId: label.id, label: label.name } : r)),
      );
    },
    onError: () => toast.error("라벨 생성 실패"),
  });

  // ── 조립 템플릿/프리셋 ──
  type TemplateSlot = {
    id: string;
    label: string;
    slotLabelId: string | null;
    order: number;
    defaultProductId: string | null;
    defaultQuantity: string;
  };
  type TemplatePreset = {
    id: string;
    name: string;
    items: Array<{ slotId: string; productId: string; quantity: string }>;
  };
  type TemplateDetail = {
    id: string;
    name: string;
    defaultLaborCost: string | null;
    isActive: boolean;
    slots: TemplateSlot[];
    presets: TemplatePreset[];
  };
  const [templates, setTemplates] = useState<TemplateDetail[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [presetId, setPresetId] = useState<string>("");
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const [savePresetName, setSavePresetName] = useState("");
  const [savePresetSubmitting, setSavePresetSubmitting] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  // ── 스텝 마법사 ──
  const steps = useMemo<StepId[]>(
    () => buildSteps(productType, channels.length > 0),
    [productType, channels.length],
  );
  // productType 변경으로 스텝 수가 줄면 인덱스 클램프
  const safeStepIdx = Math.min(currentStepIdx, steps.length - 1);
  const currentStep = steps[safeStepIdx];

  // 스텝 이동 시 본문 스크롤 맨 위로
  useEffect(() => {
    scrollAreaRef.current?.scrollTo({ top: 0 });
  }, [safeStepIdx]);

  const resetAll = useCallback(() => {
    setCurrentStepIdx(0);
    setProductType("FINISHED");
    setForm({
      name: "",
      brand: "",
      brandId: "",
      brandName: "",
      spec: "",
      sku: generateSku(),
      modelName: "",
      unitOfMeasure: "EA",
      taxType: "TAXABLE",
      zeroRateEligible: false,
      taxRate: "0.1",
      listPrice: "0",
      sellingPrice: "0",
      memo: "",
      vatIncluded: false,
      categoryId: "",
      trackable: false,
      warrantyMonths: "",
      catalogHidden: false,
    });
    setMapping({ supplierId: "", supplierProductId: "", conversionRate: "1", isProvisional: false, syncName: false });
    setSupplierProducts([]);
    setSkuManuallyEdited(false);
    setIncomingCosts([]);
    setSellingCosts([]);
    setChannelSellingCosts({});
    setAvgShippingCost(null);
    setAvgShippingIsTaxable(false);
    setAvgIncomingCost(null);
    setBaseCost("");
    setTargetMargin("20");
    setTargetMarginAmount("");
    setManualVatPrice("");
    setLastEdited(null);
    setChannelPrices(channels.map((ch) => ({ channelId: ch.id, price: "", enabled: false, lastEdited: null, targetRate: "", targetAmount: "" })));
    setSetComponents([emptySetComponent()]);
    setAssemblyCosts([]);
    setParentProducts([]);
    setOptionSlotName("색상");
    setOptionParentValues([newOptionValueRow()]);
  }, [channels]);

  useEffect(() => {
    apiGet<{ current?: { rate: string } | null }>("/api/card-fee-rate")
      .then((d) => setCardFeeRate(d?.current ? parseFloat(d.current.rate) : 0))
      .catch(() => {});
  }, []);

  // channels prop이 비동기로 로드되므로, 변경 시 channelPrices 동기화
  useEffect(() => {
    setChannelPrices((prev) => {
      const byId = new Map(prev.map((r) => [r.channelId, r]));
      return channels.map((ch) => byId.get(ch.id) ?? {
        channelId: ch.id, price: "", enabled: false, lastEdited: null, targetRate: "", targetAmount: "",
      });
    });
  }, [channels]);

  const isDirty = (
    currentStepIdx > 0 && (
      form.name.trim() !== "" ||
      form.brand.trim() !== "" ||
      form.modelName.trim() !== "" ||
      form.memo.trim() !== "" ||
      skuManuallyEdited ||
      mapping.supplierId !== "" ||
      mapping.supplierProductId !== "" ||
      incomingCosts.some((c) => c.name || c.value) ||
      sellingCosts.some((c) => c.name || c.value) ||
      Object.values(channelSellingCosts).some((list) => list.some((c) => c.name || c.value)) ||
      assemblyCosts.some((c) => c.name || c.value) ||
      setComponents.some((c) => c.product) ||
      parentProducts.some((c) => c.product) ||
      optionParentValues.some((v) => v.label || v.product) ||
      channelPrices.some((r) => r.enabled || r.price) ||
      baseCost !== "" ||
      manualVatPrice !== "" ||
      manualSupplyPrice !== "" ||
      targetMarginAmount !== ""
    )
  );

  const handleLeave = () => {
    if (isDirty && !window.confirm("입력한 내용이 사라집니다. 나갈까요?")) return;
    router.push("/products");
  };

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const handleSelectType = (type: ProductType) => {
    setProductType(type);
    setCurrentStepIdx(1);
  };

  // 현재 스텝의 필수값 검증 — 통과 시 true
  const validateStep = (stepId: StepId): boolean => {
    if (stepId === "basic") {
      if (!form.name.trim()) {
        toast.error("상품명을 입력해주세요");
        return false;
      }
      if (!form.sku.trim()) {
        toast.error("SKU를 입력해주세요");
        return false;
      }
    }
    if (stepId === "components") {
      if (setComponents.some((c) => !c.product)) {
        toast.error("구성 상품을 모두 선택해주세요");
        return false;
      }
      const seen = new Set<string>();
      for (const c of setComponents) {
        const id = c.product!.id;
        if (seen.has(id)) {
          toast.error("구성 상품이 중복됩니다");
          return false;
        }
        seen.add(id);
      }
    }
    if (stepId === "options") {
      if (!optionSlotName.trim()) {
        toast.error("옵션 슬롯명을 입력해주세요");
        return false;
      }
      const filled = optionParentValues.filter((v) => v.label.trim() && v.product);
      if (filled.length === 0) {
        toast.error("옵션값을 1개 이상 단품에 연결해주세요");
        return false;
      }
      const seenOpt = new Set<string>();
      for (const v of filled) {
        if (seenOpt.has(v.product!.id)) {
          toast.error("같은 단품이 옵션값에 중복 연결되어 있습니다");
          return false;
        }
        seenOpt.add(v.product!.id);
      }
    }
    return true;
  };

  const goNextStep = () => {
    if (!validateStep(currentStep)) return;
    setCurrentStepIdx((i) => Math.min(i + 1, steps.length - 1));
  };
  const goPrevStep = () => setCurrentStepIdx((i) => Math.max(i - 1, 0));
  // review 에서 항목 "수정" → 해당 스텝으로 점프
  const jumpToStep = (stepId: StepId) => {
    const idx = steps.indexOf(stepId);
    if (idx >= 0) setCurrentStepIdx(idx);
  };

  // ASSEMBLED일 때 템플릿 목록을 불러온다 (각 템플릿 상세까지 한 번에 조회)
  useEffect(() => {
    if (productType !== "ASSEMBLED") return;
    if (templates.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await apiGet<Array<{ id: string; isActive: boolean }>>("/api/assembly-templates");
        const actives = list.filter((t) => t.isActive);
        const details = await Promise.all(
          actives.map(async (t) => {
            try {
              return await apiGet<TemplateDetail>(`/api/assembly-templates/${t.id}`);
            } catch {
              return null;
            }
          }),
        );
        if (!cancelled) {
          setTemplates(details.filter((d): d is TemplateDetail => !!d));
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productType, templates.length]);

  // 템플릿 선택 시: setComponents를 슬롯 기본값으로 채우고 조립비 자동 설정
  const applyTemplate = (tid: string) => {
    setTemplateId(tid);
    setPresetId("");
    const t = templates.find((x) => x.id === tid);
    if (!t) return;
    setSetComponents(
      t.slots
        .sort((a, b) => a.order - b.order)
        .map((s) => {
          const product = s.defaultProductId
            ? existingProducts.find((p) => p.id === s.defaultProductId) ?? null
            : null;
          return {
            id: Math.random().toString(36).slice(2),
            product,
            quantity: s.defaultQuantity?.toString() ?? "1",
            label: s.label,
            slotLabelId: s.slotLabelId ?? null,
            slotId: s.id,
          };
        }),
    );
    if (t.defaultLaborCost && parseFloat(t.defaultLaborCost) > 0) {
      setAssemblyCosts([
        {
          id: Math.random().toString(36).slice(2),
          name: "조립비",
          costType: "FIXED",
          value: t.defaultLaborCost.toString(),
          perUnit: false,
          isTaxable: false,
        },
      ]);
    }
  };

  // 프리셋 선택 시: 슬롯별 상품/수량을 프리셋 값으로 덮어쓰기
  const applyPreset = (pid: string) => {
    setPresetId(pid);
    const t = templates.find((x) => x.id === templateId);
    if (!t) return;
    const preset = t.presets.find((p) => p.id === pid);
    if (!preset) return;
    setSetComponents(
      t.slots
        .sort((a, b) => a.order - b.order)
        .map((s) => {
          const item = preset.items.find((i) => i.slotId === s.id);
          const productId = item?.productId ?? s.defaultProductId ?? null;
          const product = productId
            ? existingProducts.find((p) => p.id === productId) ?? null
            : null;
          const qty = item?.quantity ?? s.defaultQuantity ?? "1";
          return {
            id: Math.random().toString(36).slice(2),
            product,
            quantity: qty.toString(),
            label: s.label,
            slotLabelId: s.slotLabelId ?? null,
            slotId: s.id,
          };
        }),
    );
  };

  const submitSavePreset = async () => {
    if (!templateId) {
      toast.error("먼저 템플릿을 선택해주세요");
      return;
    }
    if (!savePresetName.trim()) {
      toast.error("프리셋명을 입력해주세요");
      return;
    }
    const t = templates.find((x) => x.id === templateId);
    if (!t) return;
    // setComponents의 각 행을 슬롯 순서대로 매칭
    const sortedSlots = [...t.slots].sort((a, b) => a.order - b.order);
    const items: Array<{ slotId: string; productId: string; quantity: string }> = [];
    for (let i = 0; i < sortedSlots.length && i < setComponents.length; i++) {
      const slot = sortedSlots[i];
      const row = setComponents[i];
      if (row?.product?.id && row.quantity) {
        items.push({
          slotId: slot.id,
          productId: row.product.id,
          quantity: row.quantity,
        });
      }
    }
    if (items.length === 0) {
      toast.error("저장할 슬롯이 없습니다");
      return;
    }
    setSavePresetSubmitting(true);
    try {
      let newPreset: TemplatePreset;
      try {
        newPreset = await apiMutate<TemplatePreset>(
          `/api/assembly-templates/${templateId}/presets`,
          "POST",
          { name: savePresetName, isActive: true, items },
        );
      } catch (err) {
        toast.error((err as Error)?.message || "저장 실패");
        return;
      }
      // 메모리 templates에 새 프리셋 추가
      setTemplates((prev) =>
        prev.map((x) =>
          x.id === templateId ? { ...x, presets: [...x.presets, newPreset] } : x,
        ),
      );
      setPresetId(newPreset.id);
      toast.success("프리셋으로 저장되었습니다");
      setSavePresetOpen(false);
      setSavePresetName("");
    } finally {
      setSavePresetSubmitting(false);
    }
  };

  const fetchSupplierProducts = useCallback(async (supplierId: string) => {
    if (!supplierId) { setSupplierProducts([]); return; }
    setLoadingSupplierProducts(true);
    try {
      setSupplierProducts(await apiGet(`/api/supplier-products?supplierId=${supplierId}`));
    } catch {
      // ignore
    } finally {
      setLoadingSupplierProducts(false);
    }
  }, []);

  const fetchIncomingCosts = useCallback(async (supplierProductId: string) => {
    const [costs, shipping, avgCost] = await Promise.allSettled([
      apiGet<SupplierProductCostItem[]>(`/api/supplier-products/${supplierProductId}/costs`),
      apiGet<{ avgShippingCost: number | null; avgShippingIsTaxable: boolean | null }>(`/api/supplier-products/${supplierProductId}/avg-shipping`),
      apiGet<{ avgUnitCost: number | null }>(`/api/supplier-products/${supplierProductId}/avg-cost`),
    ]);
    if (costs.status === "fulfilled") {
      const fromServer: CostRow[] = costs.value.map((c) => ({
        id: Math.random().toString(36).slice(2),
        serverId: c.id,
        name: c.name,
        costType: c.costType,
        value: c.value.toString(),
        perUnit: c.perUnit,
        isTaxable: c.isTaxable,
      }));
      setIncomingCosts((prev) => {
        const manual = prev.filter((c) => !c.serverId && (c.name || c.value));
        return [...fromServer, ...manual];
      });
    }
    if (shipping.status === "fulfilled") {
      setAvgShippingCost(shipping.value.avgShippingCost ?? null);
      setAvgShippingIsTaxable(shipping.value.avgShippingIsTaxable ?? false);
    } else {
      setAvgShippingCost(null);
      setAvgShippingIsTaxable(false);
    }
    if (avgCost.status === "fulfilled") {
      setAvgIncomingCost(avgCost.value.avgUnitCost ?? null);
    } else {
      setAvgIncomingCost(null);
    }
  }, []);

  // preset으로 진입 시 거래처 공급상품 목록 + 입고비용 초기 로드
  useEffect(() => {
    if (presetSupplierId) fetchSupplierProducts(presetSupplierId);
    if (presetSupplierProductId) fetchIncomingCosts(presetSupplierProductId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 상품명 변경 시 벌크명 자동 동기화 (사용자가 직접 수정하지 않은 경우만)
  useEffect(() => {
    if (bulkUsable && bulkNameAutoSync.current) {
      setNewBulkName(form.name ? `${form.name} (벌크)` : "");
    }
  }, [form.name, bulkUsable]);

  const componentsTotalCost = setComponents.reduce((sum, row) => {
    if (!row.product) return sum;
    const cost = parseFloat(row.product.unitCost || "0");
    const ship = Number(row.product.shippingPerUnit ?? 0);
    const qty = parseFloat(row.quantity || "1");
    return sum + (cost + ship) * qty;
  }, 0);

  const componentsBreakdown = setComponents.reduce(
    (acc, row) => {
      if (!row.product) return acc;
      const qty = parseFloat(row.quantity || "1");
      const sup = Number(row.product.supplierUnitPrice ?? 0);
      const ship = Number(row.product.shippingPerUnit ?? 0);
      const inc = Number(row.product.incomingCostPerUnit ?? 0);
      acc.supplier += sup * qty;
      acc.shipping += ship * qty;
      acc.incoming += inc * qty;
      return acc;
    },
    { supplier: 0, shipping: 0, incoming: 0 },
  );

  const assemblyFixedCost = assemblyCosts
    .filter((c) => c.costType === "FIXED" && c.value)
    .reduce((sum, c) => sum + parseFloat(c.value), 0);

  const calcPrice = (() => {
    const selectedSp = supplierProducts.find((sp) => sp.id === mapping.supplierProductId);
    const convRate = parseFloat(mapping.conversionRate || "1") || 1;
    const unitCost = selectedSp
      ? parseFloat(selectedSp.unitPrice) / convRate
      : parseFloat(baseCost || "0");

    const incomingFixed = incomingCosts
      .filter((c) => c.costType === "FIXED" && c.value)
      .reduce((sum, c) => {
        const raw = parseFloat(c.value) / convRate;
        return sum + (c.isTaxable ? raw / 1.1 : raw);
      }, 0);
    const incomingPct = incomingCosts
      .filter((c) => c.costType === "PERCENTAGE" && c.value)
      .reduce((sum, c) => {
        const raw = (unitCost * parseFloat(c.value)) / 100;
        return sum + (c.isTaxable ? raw / 1.1 : raw);
      }, 0);

    const avgShippingRaw = avgShippingCost !== null ? avgShippingCost / convRate : 0;
    const avgShippingNet = avgShippingIsTaxable ? avgShippingRaw / 1.1 : avgShippingRaw;
    const incomingTotal = incomingFixed + incomingPct + avgShippingNet;

    const sellingFixed = sellingCosts
      .filter((c) => c.costType === "FIXED" && c.value)
      .reduce((sum, c) => {
        const raw = parseFloat(c.value);
        return sum + (c.isTaxable ? raw / 1.1 : raw);
      }, 0);
    const sellingPct = sellingCosts
      .filter((c) => c.costType === "PERCENTAGE" && c.value)
      .reduce((sum, c) => sum + parseFloat(c.value) / 100, 0);

    const baseTotalCost = unitCost + incomingTotal + sellingFixed;
    const taxRate = (form.taxType !== "TAX_FREE") ? parseFloat(form.taxRate || "0.1") : 0;

    let vatPrice = 0;
    let sellingPrice = 0;
    let marginRate = 0;
    let marginAmount = 0;
    let cardFeeAmount = 0;

    // 카드수수료는 판매가(VAT포함=vatPrice) 기준으로 부과
    // cardFeeAmount/sellingPrice = (1 + taxRate) * cardFeeRate
    const cardFeeRatio = (1 + taxRate) * cardFeeRate;

    if (lastEdited === "rate" || lastEdited === null) {
      const margin = parseFloat(targetMargin || "0") / 100;
      const divisor = 1 - margin - sellingPct - cardFeeRatio;
      sellingPrice = divisor > 0 && baseTotalCost > 0 ? baseTotalCost / divisor : 0;
      vatPrice = Math.round(sellingPrice * (1 + taxRate));
    } else if (lastEdited === "amount") {
      const mAmount = parseFloat(targetMarginAmount || "0");
      const divisor = 1 - sellingPct - cardFeeRatio;
      sellingPrice = divisor > 0 ? (baseTotalCost + mAmount) / divisor : 0;
      vatPrice = Math.round(sellingPrice * (1 + taxRate));
    } else if (lastEdited === "supply") {
      sellingPrice = parseFloat(manualSupplyPrice || "0");
      vatPrice = Math.round(sellingPrice * (1 + taxRate));
    } else {
      vatPrice = parseFloat(manualVatPrice || "0");
      sellingPrice = taxRate > 0 ? vatPrice / (1 + taxRate) : vatPrice;
    }
    cardFeeAmount = vatPrice * cardFeeRate;
    marginAmount = sellingPrice - baseTotalCost - cardFeeAmount;
    marginRate = sellingPrice > 0 ? (marginAmount / sellingPrice) * 100 : 0;

    const totalCost = baseTotalCost + cardFeeAmount;

    return { unitCost, incomingTotal, sellingFixed, cardFeeAmount, totalCost, sellingPrice: Math.round(sellingPrice), vatPrice: Math.round(vatPrice), marginRate, marginAmount, avgShippingNet };
  })();

  const calcSetPrice = (() => {
    const baseTotalCost = componentsTotalCost + assemblyFixedCost;
    const taxRate = (form.taxType !== "TAX_FREE") ? parseFloat(form.taxRate || "0.1") : 0;

    const sellingPct = sellingCosts
      .filter((c) => c.costType === "PERCENTAGE" && c.value)
      .reduce((sum, c) => sum + parseFloat(c.value) / 100, 0);

    let vatPrice = 0;
    let sellingPrice = 0;
    let marginRate = 0;
    let marginAmount = 0;
    let cardFeeAmount = 0;

    // 카드수수료는 판매가(VAT포함) 기준
    const cardFeeRatio = (1 + taxRate) * cardFeeRate;

    if (lastEdited === "rate" || lastEdited === null) {
      const margin = parseFloat(targetMargin || "0") / 100;
      const divisor = 1 - margin - sellingPct - cardFeeRatio;
      sellingPrice = divisor > 0 && baseTotalCost > 0 ? baseTotalCost / divisor : 0;
      vatPrice = Math.round(sellingPrice * (1 + taxRate));
    } else if (lastEdited === "amount") {
      const mAmount = parseFloat(targetMarginAmount || "0");
      const divisor = 1 - sellingPct - cardFeeRatio;
      sellingPrice = divisor > 0 ? (baseTotalCost + mAmount) / divisor : 0;
      vatPrice = Math.round(sellingPrice * (1 + taxRate));
    } else if (lastEdited === "supply") {
      sellingPrice = parseFloat(manualSupplyPrice || "0");
      vatPrice = Math.round(sellingPrice * (1 + taxRate));
    } else {
      vatPrice = parseFloat(manualVatPrice || "0");
      sellingPrice = taxRate > 0 ? vatPrice / (1 + taxRate) : vatPrice;
    }
    cardFeeAmount = vatPrice * cardFeeRate;
    marginAmount = sellingPrice - baseTotalCost - cardFeeAmount;
    marginRate = sellingPrice > 0 ? (marginAmount / sellingPrice) * 100 : 0;

    const totalCost = baseTotalCost + cardFeeAmount;

    return { totalCost, cardFeeAmount, sellingPrice: Math.round(sellingPrice), vatPrice: Math.round(vatPrice), marginRate, marginAmount };
  })();

  // DB는 항상 세전. vatIncluded 표시 중이면 역산.
  const toNetPrice = (v: string) => {
    const price = parseFloat(v || "0");
    const rate = parseFloat(form.taxRate || "0");
    if (form.vatIncluded && (form.taxType !== "TAX_FREE") && rate > 0) {
      return String(Math.round(price / (1 + rate)));
    }
    return v;
  };
  const getSubmitPrice = () => toNetPrice(form.sellingPrice);
  // 정가는 항상 VAT 포함으로 저장 (PriceInputDialog 입출력 통일 — vatIncluded 모드와 독립)
  // 빈 값/0 이면 그대로 "0" → DB listPrice=0 (정가 미설정 = 할인 표시 안 함)
  const getSubmitListPrice = () => {
    const v = parseFloat(form.listPrice || "0");
    if (v <= 0) return "0";
    const rate = parseFloat(form.taxRate || "0.1");
    const isTaxable = form.taxType !== "TAX_FREE" && !form.zeroRateEligible;
    return isTaxable && rate > 0 ? String(Math.round(v / (1 + rate))) : String(v);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error("상품명을 입력해주세요"); return; }
    if (!form.sku.trim()) { toast.error("SKU를 입력해주세요"); return; }

    if (productType === "SET" || productType === "ASSEMBLED") {
      if (setComponents.some((c) => !c.product)) {
        toast.error("구성 상품을 모두 선택해주세요");
        return;
      }
      const seen = new Set<string>();
      for (const c of setComponents) {
        const id = c.product!.id;
        if (seen.has(id)) {
          toast.error("구성 상품이 중복됩니다");
          return;
        }
        seen.add(id);
      }
    }

    // OPTION_PARENT — 자체 가격/매핑은 무관(서버가 sellingPrice=0 강제).
    // 단 옵션 슬롯 + 연결 단품은 필수 — 빈 OPTION_PARENT 는 카탈로그에서 선택 불가.
    if (productType === "OPTION_PARENT") {
      if (!optionSlotName.trim()) {
        toast.error("옵션 슬롯명을 입력해주세요");
        return;
      }
      const filledOptions = optionParentValues.filter((v) => v.label.trim() && v.product);
      if (filledOptions.length === 0) {
        toast.error("옵션값을 1개 이상 단품에 연결해주세요");
        return;
      }
      const seenOpt = new Set<string>();
      for (const v of filledOptions) {
        if (seenOpt.has(v.product!.id)) {
          toast.error("같은 단품이 옵션값에 중복 연결되어 있습니다");
          return;
        }
        seenOpt.add(v.product!.id);
      }
    }

    setSubmitting(true);
    const errors: string[] = [];
    try {
      let product: { id: string };
      try {
        product = await apiMutate<{ id: string }>("/api/products", "POST", {
          ...form,
          productType,
          listPrice: getSubmitListPrice(),
          sellingPrice: getSubmitPrice(),
          canonicalProductId: canonicalProductId || null,
          containerSize: bulkUsable ? containerSize || null : null,
          assemblyTemplateId: productType === "ASSEMBLED" && templateId ? templateId : null,
          warrantyMonths: form.warrantyMonths ? parseInt(form.warrantyMonths, 10) : null,
          createBulk:
            bulkUsable && newBulkName.trim()
              ? { name: newBulkName.trim(), unitOfMeasure: newBulkUnit }
              : null,
        });
      } catch (err) {
        toast.error((err as Error)?.message || "저장에 실패했습니다");
        return;
      }
      const productId = product.id;

      if (productType === "FINISHED" || productType === "PARTS") {
        if (mapping.supplierId && mapping.supplierProductId) {
          try {
            await apiMutate("/api/products/mapping", "POST", {
              productId,
              supplierProductId: mapping.supplierProductId,
              conversionRate: mapping.conversionRate || "1",
              isProvisional: mapping.isProvisional,
            });
          } catch {
            errors.push("거래처 매핑");
          }
        }

        for (const cost of sellingCosts.filter((c) => c.name && c.value)) {
          try {
            await apiMutate(`/api/products/${productId}/costs`, "POST", {
              name: cost.name,
              costType: cost.costType,
              value: cost.value,
              perUnit: cost.perUnit,
              isTaxable: cost.isTaxable,
              channelId: null,
            });
          } catch {
            errors.push(`판매비용 등록 (${cost.name})`);
          }
        }

        for (const row of channelPrices.filter((r) => r.enabled && r.price)) {
          try {
            await apiMutate(`/api/products/${productId}/channel-pricing`, "POST", {
              channelId: row.channelId,
              sellingPrice: row.price,
            });
          } catch {
            const ch = channels.find((c) => c.id === row.channelId);
            errors.push(`채널 가격 등록 (${ch?.name ?? row.channelId})`);
          }
        }

        // 채널 전용 판매비용
        for (const row of channelPrices.filter((r) => r.enabled)) {
          const costs = channelSellingCosts[row.channelId] ?? [];
          for (const cost of costs.filter((c) => c.name && c.value)) {
            try {
              await apiMutate(`/api/products/${productId}/costs`, "POST", {
                name: cost.name,
                costType: cost.costType,
                value: cost.value,
                perUnit: cost.perUnit,
                isTaxable: cost.isTaxable,
                channelId: row.channelId,
              });
            } catch {
              const ch = channels.find((c) => c.id === row.channelId);
              errors.push(`채널 판매비용 등록 (${ch?.name ?? row.channelId} · ${cost.name})`);
            }
          }
        }

        if (productType === "PARTS" && parentProducts.length > 0) {
          for (const row of parentProducts.filter((r) => r.product)) {
            let existingComponents: { componentId: string; quantity: string; label: string | null }[] = [];
            try {
              const parentData = await apiGet<{ setComponents?: Array<{ componentId: string; quantity: string; label?: string | null }> }>(
                `/api/products/${row.product!.id}?include=setComponents`,
              );
              existingComponents = (parentData.setComponents || []).map((sc) => ({
                componentId: sc.componentId,
                quantity: sc.quantity,
                label: sc.label ?? null,
              }));
            } catch {
              errors.push(`상위 상품 조회 (${row.product!.name})`);
              continue;
            }
            const alreadyIn = existingComponents.some((c) => c.componentId === productId);
            if (!alreadyIn) {
              try {
                await apiMutate("/api/products/sets", "POST", {
                  productId: row.product!.id,
                  components: [...existingComponents, { componentId: productId, quantity: row.quantity, label: null }],
                });
              } catch {
                errors.push(`상위 상품 연결 (${row.product!.name})`);
              }
            }
          }
        }
      } else if (productType === "OPTION_PARENT") {
        // 옵션 슬롯 + SWAP 매핑 단품 등록 — 검증은 위에서 완료
        try {
          await apiMutate(`/api/products/${productId}/options`, "POST", {
            name: optionSlotName.trim(),
            required: true,
            sortOrder: 0,
            isActive: true,
            values: optionParentValues
              .filter((v) => v.label.trim() && v.product)
              .map((v, i) => ({
                label: v.label.trim(),
                addPrice: 0,
                sortOrder: i,
                isActive: true,
                mappedProductId: v.product!.id,
                mappedMode: "SWAP" as const,
              })),
          });
        } catch {
          errors.push("옵션 구성 등록");
        }
      } else {
        const validComponents = setComponents.filter((c) => c.product);
        if (validComponents.length > 0) {
          try {
            await apiMutate("/api/products/sets", "POST", {
              productId,
              components: validComponents.map((c) => ({ componentId: c.product!.id, quantity: c.quantity, label: c.label ?? null, slotLabelId: c.slotLabelId ?? null, slotId: c.slotId ?? null })),
            });
          } catch {
            errors.push("구성 상품 등록");
          }
        }

        if (productType === "ASSEMBLED") {
          for (const cost of assemblyCosts.filter((c) => c.name && c.value)) {
            try {
              await apiMutate(`/api/products/${productId}/costs`, "POST", {
                name: cost.name,
                costType: cost.costType,
                value: cost.value,
                perUnit: cost.perUnit,
              });
            } catch {
              errors.push(`조립비용 등록 (${cost.name})`);
            }
          }
        }

        for (const row of channelPrices.filter((r) => r.enabled && r.price)) {
          try {
            await apiMutate(`/api/products/${productId}/channel-pricing`, "POST", {
              channelId: row.channelId,
              sellingPrice: row.price,
            });
          } catch {
            const ch = channels.find((c) => c.id === row.channelId);
            errors.push(`채널 가격 등록 (${ch?.name ?? row.channelId})`);
          }
        }
      }

      if (errors.length === 0) {
        toast.success("상품이 등록되었습니다");
      } else {
        toast.warning(
          `상품은 등록됐으나 일부 작업 실패: ${errors.join(", ")}`,
          { duration: 8000 }
        );
      }
      router.push(`/products/${productId}`);
      router.refresh();
    } catch {
      toast.error("오류가 발생했습니다");
    } finally {
      setSubmitting(false);
    }
  };

  const isSetOrAssembled = productType === "SET" || productType === "ASSEMBLED";
  const activeCalcPrice = isSetOrAssembled ? calcSetPrice : calcPrice;
  const currentTypeCard = PRODUCT_TYPE_CARDS.find((c) => c.type === productType);
  const typeAccent = TYPE_ACCENT[productType];

  // 가격 계산기 결과 → form.sellingPrice 자동 sync (VAT 포함 가격)
  useEffect(() => {
    if (activeCalcPrice.vatPrice > 0) {
      const next = String(activeCalcPrice.vatPrice);
      setForm((prev) =>
        prev.sellingPrice === next && prev.vatIncluded
          ? prev
          : { ...prev, sellingPrice: next, vatIncluded: true }
      );
    }
  }, [activeCalcPrice.vatPrice]);

  // ── 가격 계산기 ──
  const PricePanel = () => {
    const taxRate = (form.taxType !== "TAX_FREE") ? parseFloat(form.taxRate || "0.1") : 0;
    const totalCost = activeCalcPrice.totalCost;
    const supplyPrice = activeCalcPrice.sellingPrice; // 공급가액(VAT 별도)
    const vatPrice = activeCalcPrice.vatPrice;        // VAT 포함 판매가
    const marginAmount = activeCalcPrice.marginAmount;
    const marginRate = activeCalcPrice.marginRate;

    const cardFeeLabel = (
      <>
        카드수수료{" "}
        <span className="text-jm-3xs">
          (판매가 {(cardFeeRate * 100).toFixed(2)}%)
        </span>
      </>
    );
    return (
      <section>
        <SectionTitle
          icon={<Calculator className="h-4 w-4 text-[var(--jm-text-muted)]" />}
          title="가격 계산기"
          badge={
            <span className="text-jm-2xs text-[var(--jm-text-muted)]">
              공급가액 기준
            </span>
          }
        />
        <JmCard className="overflow-hidden">
          {/* 원가 요약 */}
          <div className="divide-y divide-[var(--jm-border)] text-jm-xs">
            {isSetOrAssembled ? (
              <>
                <CostLine label="구성품 공급단가 합" value={componentsBreakdown.supplier} />
                <CostLine label="구성품 입고 평균 배송비" value={componentsBreakdown.shipping} />
                <CostLine label="구성품 입고 부대비용" value={componentsBreakdown.incoming} />
                {productType === "ASSEMBLED" && (
                  <CostLine label="조립비용" value={assemblyFixedCost} />
                )}
                {cardFeeRate > 0 && (
                  <CostLine label={cardFeeLabel} value={calcSetPrice.cardFeeAmount} />
                )}
              </>
            ) : (
              <>
                {!mapping.supplierProductId ? (
                  <div className="flex items-center justify-between px-3 py-1.5">
                    <span className="text-[var(--jm-text-muted)]">원가 직접 입력</span>
                    <JmInput
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={formatComma(baseCost)}
                      onChange={(e) => setBaseCost(parseComma(e.target.value))}
                      onFocus={focusCaretEnd}
                      className="h-8 w-32 text-right"
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="text-[var(--jm-text-muted)]">
                      공급단가 ÷ 환산비율
                      {avgIncomingCost !== null && (
                        <span
                          className="ml-1.5 text-jm-3xs"
                          title="최근 입고 50건의 수량 가중평균. 실제 출고 원가와 다를 수 있습니다 (참고값)."
                        >
                          (최근 입고 평균 ₩
                          {Math.round(
                            avgIncomingCost /
                              (parseFloat(mapping.conversionRate || "1") || 1),
                          ).toLocaleString("ko-KR")}
                          )
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums text-[var(--jm-text)]">
                      ₩{Math.round(calcPrice.unitCost).toLocaleString("ko-KR")}
                    </span>
                  </div>
                )}
                <CostLine label="입고 평균 배송비" value={calcPrice.avgShippingNet} />
                <CostLine
                  label="입고 부대비용"
                  value={calcPrice.incomingTotal - calcPrice.avgShippingNet}
                />
                <CostLine label="판매비용" value={calcPrice.sellingFixed} />
                {cardFeeRate > 0 && (
                  <CostLine label={cardFeeLabel} value={calcPrice.cardFeeAmount} />
                )}
              </>
            )}
            {/* 총원가 */}
            <div className="flex items-center justify-between bg-[var(--jm-surface-muted)] px-3 py-2.5">
              <span className="flex items-center gap-1.5 text-jm-sm font-semibold text-[var(--jm-text)]">
                총원가
                <JmTooltipProvider delay={100}>
                  <JmTooltipRoot>
                    <JmTooltipTrigger
                      render={
                        <button
                          type="button"
                          className="text-[var(--jm-text-muted)] transition-colors hover:text-[var(--jm-text)]"
                          aria-label="원가 계산식 보기"
                        >
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      }
                    />
                    <JmTooltipContent side="top" className="max-w-[280px] text-jm-2xs leading-relaxed">
                      {isSetOrAssembled ? (
                        <div className="space-y-1">
                          <div className="font-semibold">총원가 계산식</div>
                          <div>= 구성품 공급단가 + 입고 평균 배송비 + 입고 부대비용{productType === "ASSEMBLED" ? " + 조립비용" : ""}{cardFeeRate > 0 && " + 카드수수료"}</div>
                          <div className="mt-1 space-y-0.5 border-t border-[var(--jm-border)] pt-1 text-jm-3xs opacity-80">
                            <div>• 각 구성품의 공급단가/배송비/부대비용을 (수량 × 단위) 로 합산</div>
                            <div>• 배송비/부대비용 과세분 ÷ 1.1 로 공급가액 환산</div>
                            {productType === "ASSEMBLED" && <div>• 조립비용(과세) ÷ 1.1 로 공급가액 환산</div>}
                            {cardFeeRate > 0 && <div>• 카드수수료 = 판매가(VAT포함) × {(cardFeeRate * 100).toFixed(2)}%</div>}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="font-semibold">총원가 계산식</div>
                          <div>= 원가 + 입고 평균 배송비 + 입고 부대비용 + 판매비용{cardFeeRate > 0 && " + 카드수수료"}</div>
                          <div className="mt-1 space-y-0.5 border-t border-[var(--jm-border)] pt-1 text-jm-3xs opacity-80">
                            <div>• 원가 = 공급단가 ÷ 환산비율</div>
                            <div>• 과세 비용은 ÷ 1.1 로 공급가액 환산 후 합산</div>
                            <div>• PERCENTAGE 부대비용은 원가의 %로 적용</div>
                            {cardFeeRate > 0 && <div>• 카드수수료 = 판매가(VAT포함) × {(cardFeeRate * 100).toFixed(2)}%</div>}
                          </div>
                        </div>
                      )}
                    </JmTooltipContent>
                  </JmTooltipRoot>
                </JmTooltipProvider>
              </span>
              <span className="text-jm-sm font-semibold tabular-nums text-[var(--jm-text)]">
                ₩{Math.round(totalCost).toLocaleString("ko-KR")}
              </span>
            </div>
          </div>

          {/* 마진·가격 */}
          <JmCardContent className="space-y-3 border-t border-[var(--jm-border)]">
            {/* 마진율 */}
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-jm-xs text-[var(--jm-text-muted)]">
                마진율
              </span>
              <div className="relative flex-1">
                <JmInput
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="100"
                  value={lastEdited === "rate" ? targetMargin : marginRate.toFixed(1)}
                  onChange={(e) => { setTargetMargin(e.target.value); setLastEdited("rate"); }}
                  onFocus={focusCaretEnd}
                  className={`h-9 pr-7 text-right ${marginAmount < 0 ? "text-[var(--jm-danger-fg)]" : ""}`}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-jm-xs text-[var(--jm-text-muted)]">
                  %
                </span>
              </div>
            </div>
            {/* 마진금액 */}
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-jm-xs text-[var(--jm-text-muted)]">
                마진금액
              </span>
              <JmInput
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={formatComma(lastEdited === "amount" ? targetMarginAmount : (marginAmount !== 0 ? Math.round(marginAmount).toString() : ""))}
                onChange={(e) => { setTargetMarginAmount(parseComma(e.target.value)); setLastEdited("amount"); }}
                onFocus={focusCaretEnd}
                className={`h-9 flex-1 text-right ${marginAmount < 0 ? "text-[var(--jm-danger-fg)]" : ""}`}
              />
            </div>
            {marginAmount < 0 && vatPrice > 0 && (
              <div className="flex items-center gap-1 text-jm-xs text-[var(--jm-danger-fg)]">
                <span>⚠</span>
                <span>카드수수료·비용을 반영하면 마진이 음수입니다</span>
              </div>
            )}

            {/* 가격 결과 — 공급가액 / 세액 / 판매가 */}
            <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-[var(--jm-border)]">
              <div className="border-r border-[var(--jm-border)] px-2 py-2 text-center">
                <div className="mb-1 text-jm-2xs text-[var(--jm-text-muted)]">공급가액</div>
                <JmInput
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={formatComma(lastEdited === "supply" ? manualSupplyPrice : (supplyPrice > 0 ? supplyPrice.toString() : ""))}
                  onChange={(e) => { setManualSupplyPrice(parseComma(e.target.value)); setLastEdited("supply"); }}
                  onFocus={focusCaretEnd}
                  className="h-8 border-0 bg-transparent px-0 text-center text-jm-md font-bold"
                />
              </div>
              <div className="border-r border-[var(--jm-border)] px-2 py-2 text-center">
                <div className="mb-1 text-jm-2xs text-[var(--jm-text-muted)]">세액</div>
                <div className="text-jm-md font-bold leading-8 tabular-nums text-[var(--jm-text)]">
                  {supplyPrice > 0 && taxRate > 0
                    ? `₩${Math.round(supplyPrice * taxRate).toLocaleString("ko-KR")}`
                    : "—"}
                </div>
              </div>
              <div className="px-2 py-2 text-center">
                <div className="mb-1 text-jm-2xs text-[var(--jm-text-muted)]">판매가</div>
                <JmInput
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={formatComma(lastEdited === "price" ? manualVatPrice : (vatPrice > 0 ? vatPrice.toString() : ""))}
                  onChange={(e) => { setManualVatPrice(parseComma(e.target.value)); setLastEdited("price"); }}
                  onFocus={focusCaretEnd}
                  className="h-8 border-0 bg-transparent px-0 text-center text-jm-md font-bold"
                />
              </div>
            </div>
          </JmCardContent>
        </JmCard>
      </section>
    );
  };

  // ── 채널별 가격 ──
  const ChannelPricingPanel = () => {
    const taxRate = (form.taxType !== "TAX_FREE") ? parseFloat(form.taxRate || "0.1") : 0;
    // 카드수수료 제외한 base 원가 (채널수수료와 중복 방지)
    const baseTotalCost = activeCalcPrice.totalCost - activeCalcPrice.cardFeeAmount;
    const offlineVatPrice = activeCalcPrice.vatPrice;

    // 채널별 vatPrice 계산 (3-way 편집 반영)
    const computeChannelVatPrice = (row: ChannelPriceRow, commRate: number): number => {
      const commRatio = (1 + taxRate) * commRate;
      if (row.lastEdited === "rate" && row.targetRate !== "") {
        const m = parseFloat(row.targetRate) / 100;
        const divisor = 1 - m - commRatio;
        const supply = divisor > 0 && baseTotalCost > 0 ? baseTotalCost / divisor : 0;
        return Math.round(supply * (1 + taxRate));
      }
      if (row.lastEdited === "amount" && row.targetAmount !== "") {
        const a = parseFloat(row.targetAmount) || 0;
        const divisor = 1 - commRatio;
        const supply = divisor > 0 ? (baseTotalCost + a) / divisor : 0;
        return Math.round(supply * (1 + taxRate));
      }
      const inputPrice = row.price ? parseFloat(row.price) : 0;
      return inputPrice > 0 ? inputPrice : offlineVatPrice;
    };

    // 행 편집 헬퍼: 새 vatPrice 계산해서 row.price도 함께 갱신 (저장용)
    const updateRow = (idx: number, patch: Partial<ChannelPriceRow>) => {
      setChannelPrices((prev) =>
        prev.map((r, i) => {
          if (i !== idx) return r;
          const next: ChannelPriceRow = { ...r, ...patch };
          // lastEdited가 rate/amount면 가격 재계산해서 price 동기화
          const ch = channels[i];
          const commRate = parseFloat(ch?.commissionRate || "0");
          const newVat = computeChannelVatPrice(next, commRate);
          if (next.lastEdited === "rate" || next.lastEdited === "amount") {
            next.price = newVat > 0 ? String(newVat) : "";
          }
          return next;
        })
      );
    };

    return (
      <section>
        <SectionTitle
          title="채널별 가격"
          badge={<span className="text-jm-2xs text-[var(--jm-text-muted)]">선택사항</span>}
        />
        <JmCard><JmCardContent className="space-y-2">
          {channels.map((ch, idx) => {
            const row = channelPrices[idx];
            if (!row) return null;
            const commRate = parseFloat(ch.commissionRate || "0");
            const channelVatPrice = computeChannelVatPrice(row, commRate);
            const channelSupplyPrice = taxRate > 0 ? channelVatPrice / (1 + taxRate) : channelVatPrice;
            const taxAmount = channelVatPrice - channelSupplyPrice;
            const commissionAmount = channelVatPrice * commRate;
            const realMargin = channelSupplyPrice - baseTotalCost - commissionAmount;
            const realMarginRate = channelSupplyPrice > 0 ? (realMargin / channelSupplyPrice) * 100 : 0;
            const marginColor = realMargin >= 0 ? "text-[var(--jm-success-fg)]" : "text-[var(--jm-danger-fg)]";

            return (
              <div key={ch.id} className="rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] overflow-hidden">
                <label className="flex items-center gap-2.5 px-3 py-2 cursor-pointer">
                  <JmCheckbox
                    checked={row.enabled}
                    onCheckedChange={(checked) => {
                      const enabled = !!checked;
                      setChannelPrices((prev) => prev.map((r, i) =>
                        i === idx
                          ? { ...r, enabled, price: enabled && !r.price && offlineVatPrice > 0 ? String(offlineVatPrice) : r.price }
                          : r
                      ));
                    }}
                  />
                  <span className="text-jm-sm font-medium flex-1 truncate">{ch.name}</span>
                  <span className="text-jm-2xs text-[var(--jm-text-muted)] shrink-0">수수료 {(commRate * 100).toFixed(2)}%</span>
                </label>
                {row.enabled && (
                  <div className="px-3 pb-3 pt-1 space-y-3 border-t border-[var(--jm-border)]">
                    {/* 마진율 */}
                    <div className="flex items-center gap-2">
                      <span className="text-jm-2xs text-[var(--jm-text-muted)] w-14 shrink-0">마진율</span>
                      <div className="relative flex-1">
                        <JmInput
                          type="text"
                          inputMode="decimal"
                          value={row.lastEdited === "rate" ? row.targetRate : realMarginRate.toFixed(1)}
                          onChange={(e) => updateRow(idx, { targetRate: e.target.value, lastEdited: "rate" })}
                          onFocus={focusCaretEnd}
                          className="h-8 pr-6 text-right text-jm-xs"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-jm-2xs text-[var(--jm-text-muted)] pointer-events-none">%</span>
                      </div>
                    </div>
                    {/* 마진금액 */}
                    <div className="flex items-center gap-2">
                      <span className="text-jm-2xs text-[var(--jm-text-muted)] w-14 shrink-0">마진금액</span>
                      <JmInput
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={formatComma(row.lastEdited === "amount" ? row.targetAmount : (realMargin > 0 ? Math.round(realMargin).toString() : ""))}
                        onChange={(e) => updateRow(idx, { targetAmount: parseComma(e.target.value), lastEdited: "amount" })}
                        onFocus={focusCaretEnd}
                        className="h-8 flex-1 text-right text-jm-xs"
                      />
                    </div>
                    {/* 판매가 */}
                    <div className="flex items-center gap-2">
                      <span className="text-jm-2xs text-[var(--jm-text-muted)] w-14 shrink-0">판매가</span>
                      <JmInput
                        type="text"
                        inputMode="numeric"
                        placeholder={offlineVatPrice > 0 ? formatComma(String(offlineVatPrice)) : "0"}
                        value={formatComma(row.lastEdited === "price" || row.lastEdited === null ? row.price : String(channelVatPrice))}
                        onChange={(e) => updateRow(idx, { price: parseComma(e.target.value), lastEdited: "price" })}
                        onFocus={focusCaretEnd}
                        className="h-8 flex-1 text-right text-jm-xs font-medium"
                      />
                    </div>
                    {/* 채널 전용 판매비용 */}
                    <div className="rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface)]">
                      <div className="px-2.5 py-1.5 border-b border-[var(--jm-border)] flex items-center justify-between">
                        <span className="text-jm-2xs text-[var(--jm-text-muted)]">{ch.name} 전용 판매비용</span>
                        <span className="text-jm-3xs text-[var(--jm-text-muted)]">전사 공통 비용은 위 &quot;판매 비용&quot; 섹션에서 관리</span>
                      </div>
                      <CostList
                        costs={channelSellingCosts[ch.id] ?? []}
                        onChange={(updater) =>
                          setChannelSellingCosts((prev) => {
                            const current = prev[ch.id] ?? [];
                            const next = typeof updater === "function" ? (updater as (p: CostRow[]) => CostRow[])(current) : updater;
                            return { ...prev, [ch.id]: next };
                          })
                        }
                        addLabel={`${ch.name} 판매비용 추가`}
                      />
                    </div>
                    {/* 결과 */}
                    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-[var(--jm-border)] bg-[var(--jm-border)] text-jm-2xs sm:grid-cols-4">
                      <div className="bg-[var(--jm-surface)] px-2 py-1.5 text-center">
                        <div className="text-jm-3xs text-[var(--jm-text-muted)]">공급가</div>
                        <div className="tabular-nums">₩{Math.round(channelSupplyPrice).toLocaleString("ko-KR")}</div>
                      </div>
                      <div className="bg-[var(--jm-surface)] px-2 py-1.5 text-center">
                        <div className="text-jm-3xs text-[var(--jm-text-muted)]">세액</div>
                        <div className="tabular-nums">₩{Math.round(taxAmount).toLocaleString("ko-KR")}</div>
                      </div>
                      <div className="bg-[var(--jm-surface)] px-2 py-1.5 text-center">
                        <div className="text-jm-3xs text-[var(--jm-text-muted)]">수수료</div>
                        <div className="tabular-nums">₩{Math.round(commissionAmount).toLocaleString("ko-KR")}</div>
                      </div>
                      <div className="bg-[var(--jm-surface)] px-2 py-1.5 text-center">
                        <div className="text-jm-3xs text-[var(--jm-text-muted)]">실마진</div>
                        <div className={`tabular-nums font-medium ${marginColor}`}>
                          ₩{Math.round(realMargin).toLocaleString("ko-KR")}
                          <span className="ml-1 text-jm-3xs">({realMarginRate.toFixed(1)}%)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </JmCardContent></JmCard>
      </section>
    );
  };

  // 스텝 진행바에 노출할 스텝(type 제외 — 유형 선택 후 표시)
  const navSteps = steps.filter((s) => s !== "type");

  return (
    <>
      <div className="flex h-full flex-col bg-[var(--jm-bg)]">
        {/* 헤더 */}
        <header className="border-b border-[var(--jm-border)] px-5 py-3.5 shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="뒤로가기"
                className="text-[var(--jm-text-muted)] hover:text-[var(--jm-text)] transition-colors"
                onClick={() => {
                  if (currentStepIdx > 0) {
                    if (lockProductType && currentStep === "basic") {
                      handleLeave();
                      return;
                    }
                    if (currentStepIdx === 1 && lockProductType) {
                      handleLeave();
                      return;
                    }
                    if (currentStepIdx === 1) {
                      if (isDirty && !window.confirm("입력한 내용이 사라집니다. 상품 유형 선택으로 돌아갈까요?")) return;
                      resetAll();
                    } else {
                      goPrevStep();
                    }
                  } else {
                    handleLeave();
                  }
                }}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <h1 className="text-base font-medium flex-1">새 상품 등록</h1>
              {currentStepIdx > 0 && currentTypeCard && (
                <div
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-jm-xs font-medium leading-none"
                  style={{
                    borderColor: `${typeAccent}40`,
                    color: typeAccent,
                    backgroundColor: `${typeAccent}10`,
                  }}
                >
                  <currentTypeCard.Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{currentTypeCard.label}</span>
                </div>
              )}
            </div>
        </header>

          {/* 진행도 — 스텝 칩 */}
          {currentStepIdx > 0 && (
            <nav
              aria-label="등록 단계"
              className="border-b border-[var(--jm-border)] px-4 py-2 shrink-0 overflow-x-auto"
            >
              <ol className="flex items-center gap-1 min-w-max">
                {navSteps.map((s, i) => {
                  const stepIdx = steps.indexOf(s);
                  const isActive = stepIdx === safeStepIdx;
                  const isDone = stepIdx < safeStepIdx;
                  return (
                    <li key={s} className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={!isDone}
                        onClick={() => isDone && setCurrentStepIdx(stepIdx)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-jm-2xs font-medium transition-colors ${
                          isActive
                            ? "bg-[var(--jm-surface-muted)] text-[var(--jm-text)]"
                            : isDone
                            ? "text-[var(--jm-action)] hover:bg-[var(--jm-surface-muted)]/50 cursor-pointer"
                            : "text-[var(--jm-text-muted)] cursor-default"
                        }`}
                      >
                        <span
                          className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-jm-3xs font-bold leading-none ${
                            isActive
                              ? "bg-[var(--jm-action)] text-[var(--jm-action-fg)]"
                              : isDone
                              ? "bg-[var(--jm-action)]/15 text-[var(--jm-action)]"
                              : "bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)]"
                          }`}
                        >
                          {i + 1}
                        </span>
                        {STEP_LABEL[s]}
                      </button>
                      {i < navSteps.length - 1 && (
                        <ChevronRight className="h-3 w-3 text-[var(--jm-text-muted)]/50" />
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}

          {/* 본문 */}
          <div ref={scrollAreaRef} className="flex-1 min-h-0 overflow-y-auto">
            {currentStep === "type" ? (
              <TypeSelectScreen onSelect={handleSelectType} />
            ) : (
              <fieldset disabled={submitting} className="contents">

                {/* ── 입력 폼 (한 스텝만 표시) ── */}
                <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">

                  {/* 변형 추가 인라인 진입 시 대표 연결 안내 배너 */}
                  {presetCanonicalId && canonicalProductId && (
                    <div className="rounded-md border border-[var(--jm-info-fg)]/30 bg-[var(--jm-info-bg)] px-3 py-2 text-jm-xs text-[var(--jm-info-fg)]">
                      <span className="text-[var(--jm-text-muted)]">대표 상품 변형으로 등록: </span>
                      <span className="font-medium">
                        {existingProducts.find((p) => p.id === canonicalProductId)?.name ?? "선택된 대표"}
                      </span>
                    </div>
                  )}

                  {/* 거래처 연결 */}
                  {currentStep === "supplier" && (productType === "FINISHED" || productType === "PARTS") && (
                    <section>
                      <SectionTitle
                        title="거래처 연결"
                        badge={
                          <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                            선택
                          </span>
                        }
                      />
                      <JmCard>
                        <JmCardContent className="space-y-4">
                          <Field label="거래처">
                            <SupplierCombobox
                              suppliers={suppliers}
                              value={mapping.supplierId}
                              onChange={(id) => {
                                setMapping((prev) => ({ ...prev, supplierId: id, supplierProductId: "" }));
                                fetchSupplierProducts(id);
                              }}
                              onCreateNew={(name) => {
                                setQuickSupplierDefaultName(name);
                                setQuickSupplierOpen(true);
                              }}
                            />
                          </Field>

                          {mapping.supplierId && (
                            <div className="space-y-2.5">
                              <ToggleField
                                label="임시 등록"
                                desc="실제 입고 전 어림잡은 정보"
                                checked={mapping.isProvisional}
                                onChange={(v) =>
                                  setMapping((prev) => ({ ...prev, isProvisional: v }))
                                }
                              />
                              <ToggleField
                                label="상품명 동일"
                                desc="공급상품명을 판매상품명으로 그대로 사용"
                                checked={mapping.syncName}
                                onChange={(next) => {
                                  setMapping((prev) => ({ ...prev, syncName: next }));
                                  if (next) {
                                    const sp = mapping.supplierProductId
                                      ? supplierProducts.find((s) => s.id === mapping.supplierProductId)
                                      : null;
                                    if (sp) setForm((prev) => ({ ...prev, name: sp.name, spec: sp.spec || "" }));
                                  } else {
                                    setForm((prev) => ({ ...prev, name: "", spec: "" }));
                                  }
                                }}
                              />
                            </div>
                          )}

                          {mapping.supplierId && (
                            <Field label="공급상품">
                              <SupplierProductCombobox
                                supplierProducts={supplierProducts}
                                value={mapping.supplierProductId}
                                onChange={(sp) => {
                                  setMapping((prev) => ({ ...prev, supplierProductId: sp.id }));
                                  // 거래처상품 데이터로 기본 정보 자동 채움
                                  // (사용자가 이미 입력/수정한 값은 보존 — 빈 값/기본값일 때만 채움)
                                  setForm((prev) => ({
                                    ...prev,
                                    name: prev.name || sp.name,
                                    spec: prev.spec || sp.spec || "",
                                    unitOfMeasure:
                                      prev.unitOfMeasure === "EA" && sp.unitOfMeasure
                                        ? sp.unitOfMeasure
                                        : prev.unitOfMeasure,
                                    taxType:
                                      prev.taxType === "TAXABLE" && sp.isTaxable === false
                                        ? "TAX_FREE"
                                        : prev.taxType,
                                  }));
                                  if (mapping.syncName) {
                                    setForm((prev) => ({ ...prev, name: sp.name, spec: sp.spec || "" }));
                                  }
                                  fetchIncomingCosts(sp.id);
                                }}
                                onCreateNew={(name) => {
                                  setQuickSupplierProductDefaultName(name);
                                  setQuickSupplierProductOpen(true);
                                }}
                                disabled={loadingSupplierProducts}
                                placeholder="공급상품 선택..."
                              />
                            </Field>
                          )}

                          {mapping.supplierProductId && (() => {
                            const selectedSp = supplierProducts.find((sp) => sp.id === mapping.supplierProductId);
                            const unitMismatch = !!selectedSp && selectedSp.unitOfMeasure !== form.unitOfMeasure;
                            return (
                              <Field
                                label="환산비율"
                                hint={unitMismatch ? `공급상품 단위(${selectedSp!.unitOfMeasure})와 판매상품 단위(${form.unitOfMeasure})가 다릅니다. 환산비율을 확인하세요.` : undefined}
                              >
                                <div className="flex items-center gap-3">
                                  <JmInput
                                    type="text"
                                    inputMode="decimal"
                                    value={mapping.conversionRate}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      if (v === "" || /^[0-9]*\.?[0-9]*$/.test(v)) {
                                        setMapping((prev) => ({ ...prev, conversionRate: v }));
                                      }
                                    }}
                                    onBlur={(e) => {
                                      const n = parseFloat(e.target.value);
                                      if (!isFinite(n) || n <= 0) {
                                        setMapping((prev) => ({ ...prev, conversionRate: "1" }));
                                      }
                                    }}
                                    onFocus={focusCaretEnd}
                                    className="h-9 w-28"
                                  />
                                  <p className="text-jm-xs text-[var(--jm-text-muted)]">
                                    공급상품 1개 → 판매상품{" "}
                                    <span className="font-medium text-[var(--jm-text)]">
                                      {mapping.conversionRate || "1"}
                                    </span>
                                    개
                                  </p>
                                </div>
                              </Field>
                            );
                          })()}
                        </JmCardContent>

                        {/* 선택한 공급상품 정보 — 모바일 친화 key·value 그리드 */}
                        {mapping.supplierProductId && (() => {
                          const sp = supplierProducts.find((s) => s.id === mapping.supplierProductId);
                          if (!sp) return null;
                          const listPrice = parseFloat(sp.listPrice) || 0;
                          const unitPrice = parseFloat(sp.unitPrice) || 0;
                          const discount = listPrice - unitPrice;
                          const taxAmt = sp.isTaxable ? Math.round(unitPrice * 0.1) : 0;
                          const rows: Array<{ label: string; value: string; strong?: boolean }> = [
                            { label: "품번", value: sp.supplierCode || "-" },
                            { label: "규격", value: sp.spec || "-" },
                            { label: "단위", value: sp.unitOfMeasure },
                            { label: "정가", value: listPrice > 0 ? `₩${listPrice.toLocaleString("ko-KR")}` : "-" },
                            { label: "할인", value: discount > 0 ? `₩${discount.toLocaleString("ko-KR")}` : "-" },
                            { label: "실제단가", value: `₩${unitPrice.toLocaleString("ko-KR")}`, strong: true },
                            { label: "공급가액", value: `₩${unitPrice.toLocaleString("ko-KR")}` },
                            { label: "세액", value: taxAmt > 0 ? `₩${taxAmt.toLocaleString("ko-KR")}` : "-" },
                          ];
                          return (
                            <div className="border-t border-[var(--jm-border)] bg-[var(--jm-surface-muted)] px-5 py-3">
                              <p className="mb-2 text-jm-2xs font-medium text-[var(--jm-text-muted)]">
                                선택한 공급상품 정보
                              </p>
                              {sp.productMappings && sp.productMappings.length > 0 && (
                                <div className="mb-3 rounded-md border border-[var(--jm-warning-fg)]/30 bg-[var(--jm-warning-bg)] px-3 py-2 text-jm-xs leading-relaxed text-[var(--jm-warning-fg)]">
                                  이 거래처상품은 이미{" "}
                                  <span className="font-semibold">
                                    {sp.productMappings.length}개 판매상품
                                  </span>
                                  에 매핑돼 있어요:{" "}
                                  {sp.productMappings.map((m, i) => (
                                    <span key={m.id}>
                                      {i > 0 ? ", " : ""}
                                      <Link
                                        href={`/products/${m.product.id}`}
                                        target="_blank"
                                        className="font-medium underline"
                                      >
                                        {m.product.name}
                                      </Link>
                                    </span>
                                  ))}
                                  . 새 판매상품에 다시 매핑하면 환산비율이 달라
                                  재고·원가가 분리될 수 있습니다.
                                </div>
                              )}
                              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                                {rows.map((r) => (
                                  <div key={r.label}>
                                    <dt className="text-jm-2xs text-[var(--jm-text-muted)]">
                                      {r.label}
                                    </dt>
                                    <dd
                                      className={
                                        r.strong
                                          ? "text-jm-sm font-semibold tabular-nums text-[var(--jm-text)]"
                                          : "text-jm-sm tabular-nums text-[var(--jm-text)]"
                                      }
                                    >
                                      {r.value}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                              {sp.memo && (
                                <div className="mt-2">
                                  <dt className="text-jm-2xs text-[var(--jm-text-muted)]">
                                    비고
                                  </dt>
                                  <dd className="text-jm-sm text-[var(--jm-text)]">
                                    {sp.memo}
                                  </dd>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </JmCard>
                    </section>
                  )}

                  {/* 기본 정보 */}
                  {currentStep === "basic" && (
                  <div className="space-y-5">
                    {/* 기본 정보 */}
                    <section>
                      <SectionTitle title="기본 정보" />
                      <JmCard>
                        <JmCardContent className="space-y-4">
                          <Field label="상품명" required>
                            <NameAutocomplete
                              value={form.name}
                              onChange={(name) => setForm((prev) => ({ ...prev, name }))}
                              items={productNameItems}
                            />
                          </Field>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field label="규격">
                              <JmInput
                                placeholder="예: B-55, 3HP (선택)"
                                value={form.spec}
                                onChange={(e) => setForm((prev) => ({ ...prev, spec: e.target.value }))}
                                className="h-9"
                              />
                            </Field>
                            <Field label="모델명">
                              <JmInput
                                placeholder="모델명 (선택)"
                                value={form.modelName}
                                onChange={(e) => setForm((prev) => ({ ...prev, modelName: e.target.value }))}
                                className="h-9"
                              />
                            </Field>
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field label="브랜드">
                              <BrandCombobox
                                brands={brands}
                                value={form.brandId}
                                onChange={(id, name) =>
                                  setForm((prev) => ({ ...prev, brandId: id, brandName: name }))
                                }
                                onCreateNew={(name) => {
                                  setQuickBrandDefaultName(name);
                                  setQuickBrandOpen(true);
                                }}
                              />
                            </Field>
                            <Field label="SKU" required>
                              <div className="flex gap-1.5">
                                <JmInput
                                  placeholder="SKU"
                                  value={form.sku}
                                  onChange={(e) => {
                                    setSkuManuallyEdited(true);
                                    setForm((prev) => ({ ...prev, sku: e.target.value }));
                                  }}
                                  className="h-9 flex-1"
                                />
                                <JmButton
                                  type="button"
                                  variant="outline"
                                  className="h-9 w-9 shrink-0 p-0"
                                  onClick={() => {
                                    if (skuManuallyEdited && !window.confirm("입력한 SKU가 덮어써집니다. 재생성할까요?")) return;
                                    setForm((prev) => ({ ...prev, sku: generateSku() }));
                                    setSkuManuallyEdited(false);
                                  }}
                                  title="자동 생성"
                                >
                                  <RefreshCw className="h-3.5 w-3.5" />
                                </JmButton>
                              </div>
                            </Field>
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field label="단위">
                              <JmSelect
                                size="sm"
                                value={form.unitOfMeasure}
                                onChange={(v) => setForm((prev) => ({ ...prev, unitOfMeasure: v || "EA" }))}
                                options={UNITS_OF_MEASURE.map((u) => ({
                                  value: u.value,
                                  label: `${u.label} (${u.value})`,
                                }))}
                              />
                            </Field>
                            {categories.length > 0 && (
                              <Field label="카테고리">
                                <JmSelect
                                  size="sm"
                                  value={form.categoryId || "__none__"}
                                  onChange={(v) =>
                                    setForm((prev) => ({ ...prev, categoryId: !v || v === "__none__" ? "" : v }))
                                  }
                                  options={[
                                    { value: "__none__", label: "없음" },
                                    ...categories.flatMap((cat) =>
                                      cat.children.length > 0
                                        ? cat.children.map((child) => ({
                                            value: child.id,
                                            label: `${cat.name} > ${child.name}`,
                                          }))
                                        : [{ value: cat.id, label: cat.name }],
                                    ),
                                  ]}
                                />
                              </Field>
                            )}
                          </div>
                        </JmCardContent>
                      </JmCard>
                    </section>

                    {/* 세금·노출 */}
                    <section>
                      <SectionTitle title="세금 · 노출" />
                      <JmCard>
                        <JmCardContent className="space-y-3.5">
                          <ToggleField
                            label="영세율 적용 가능"
                            desc="과세 상품 — 영세율 대상이면 켜기"
                            checked={form.zeroRateEligible}
                            onChange={(v) =>
                              setForm((prev) => ({ ...prev, zeroRateEligible: v }))
                            }
                          />
                          <div className="h-px bg-[var(--jm-border)]" />
                          <div className="space-y-2.5">
                            <ToggleField
                              label="시리얼 라벨 발번 (개별추적)"
                              desc="개별 시리얼 코드로 추적·보증 관리"
                              checked={form.trackable}
                              onChange={(v) =>
                                setForm((prev) => ({ ...prev, trackable: v }))
                              }
                            />
                            {form.trackable && (
                              <div className="flex items-center gap-2 pl-14">
                                <JmInput
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="0"
                                  value={form.warrantyMonths}
                                  onChange={(e) =>
                                    setForm((prev) => ({
                                      ...prev,
                                      warrantyMonths: e.target.value.replace(/\D/g, ""),
                                    }))
                                  }
                                  onFocus={focusCaretEnd}
                                  className="h-8 w-20 text-right"
                                />
                                <span className="text-jm-xs text-[var(--jm-text-muted)]">
                                  개월 보증
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="h-px bg-[var(--jm-border)]" />
                          <ToggleField
                            label="카탈로그 노출 차단"
                            desc="옵션 SWAP 대상 SKU — 카탈로그에 단독 노출 안 함"
                            checked={form.catalogHidden}
                            onChange={(v) =>
                              setForm((prev) => ({ ...prev, catalogHidden: v }))
                            }
                          />
                        </JmCardContent>
                      </JmCard>
                    </section>

                    {/* 분할 사용 — 완제품·부속 */}
                    {(productType === "FINISHED" || productType === "PARTS") && (
                      <section>
                        <SectionTitle
                          title="분할 사용"
                          badge={
                            <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                              선택
                            </span>
                          }
                        />
                        <JmCard>
                          <JmCardContent className="space-y-3">
                            <ToggleField
                              label="분할 사용 가능"
                              desc="병·통 단위로 입고하고 소량 단위로 소모"
                              checked={bulkUsable}
                              onChange={(checked) => {
                                setBulkUsable(checked);
                                if (!checked) {
                                  setContainerSize("");
                                  setNewBulkName("");
                                  bulkNameAutoSync.current = true;
                                } else {
                                  bulkNameAutoSync.current = true;
                                  setNewBulkName(form.name ? `${form.name} (벌크)` : "");
                                }
                              }}
                            />
                            {bulkUsable && (
                              <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                                <Field label="용기 용량">
                                  <div className="flex items-center gap-1.5">
                                    <JmInput
                                      type="text"
                                      inputMode="decimal"
                                      placeholder="예: 4000"
                                      value={containerSize}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        if (v === "" || /^[0-9]*\.?[0-9]*$/.test(v)) setContainerSize(v);
                                      }}
                                      onFocus={focusCaretEnd}
                                      className="h-9 flex-1"
                                    />
                                    <JmSelect
                                      size="sm"
                                      className="w-20"
                                      value={newBulkUnit}
                                      onChange={(v) => setNewBulkUnit(v || "mL")}
                                      options={[
                                        { value: "mL", label: "mL" },
                                        { value: "L", label: "L" },
                                        { value: "g", label: "g" },
                                        { value: "kg", label: "kg" },
                                        { value: "m", label: "m" },
                                        { value: "cm", label: "cm" },
                                        { value: "mm", label: "mm" },
                                      ]}
                                    />
                                  </div>
                                </Field>
                                <Field label="벌크명">
                                  <JmInput
                                    placeholder="예: 엔진오일 5W-30 (벌크)"
                                    value={newBulkName}
                                    onChange={(e) => {
                                      bulkNameAutoSync.current = false;
                                      setNewBulkName(e.target.value);
                                    }}
                                    className="h-9"
                                  />
                                </Field>
                              </div>
                            )}
                          </JmCardContent>
                        </JmCard>
                      </section>
                    )}

                    {/* 메모 */}
                    <section>
                      <SectionTitle
                        title="메모"
                        badge={
                          <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                            선택
                          </span>
                        }
                      />
                      <JmCard>
                        <JmCardContent>
                          <JmTextarea
                            placeholder="메모 (선택)"
                            value={form.memo}
                            onChange={(e) => setForm((prev) => ({ ...prev, memo: e.target.value }))}
                            className="min-h-[72px] resize-none"
                          />
                        </JmCardContent>
                      </JmCard>
                    </section>
                  </div>
                  )}

                  {/* 상위 상품 연결 (부속) */}
                  {currentStep === "parents" && productType === "PARTS" && (
                    <section>
                      <SectionTitle
                        title="상위 상품 연결"
                        badge={
                          <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                            선택
                          </span>
                        }
                      />
                      <JmCard>
                        <JmCardContent className="space-y-2">
                          <p className="text-jm-xs text-[var(--jm-text-muted)]">
                            이 부속이 들어가는 상위 세트·조립 상품을 연결합니다.
                          </p>
                          {parentProducts.map((row, idx) => (
                            <div
                              key={row.id}
                              className="flex items-center gap-2 rounded-md border border-[var(--jm-border)] bg-[var(--jm-bg)] p-2"
                            >
                              <div className="min-w-0 flex-1">
                                <ProductCombobox
                                  products={existingProducts}
                                  value={row.product?.id ?? ""}
                                  onChange={(p) =>
                                    setParentProducts((prev) =>
                                      prev.map((r, i) => (i === idx ? { ...r, product: p } : r)),
                                    )
                                  }
                                  filterType="set"
                                  placeholder="상위 세트/조립 상품 선택..."
                                />
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                                  수량
                                </span>
                                <JmInput
                                  type="number"
                                  inputMode="decimal"
                                  min="0.0001"
                                  step="0.01"
                                  value={row.quantity}
                                  onChange={(e) =>
                                    setParentProducts((prev) =>
                                      prev.map((r, i) =>
                                        i === idx ? { ...r, quantity: e.target.value } : r,
                                      ),
                                    )
                                  }
                                  className="h-9 w-16 text-right"
                                />
                              </div>
                              <JmIconButton
                                type="button"
                                size="sm"
                                variant="ghost"
                                aria-label="상위 상품 삭제"
                                className="text-[var(--jm-danger-fg)]"
                                onClick={() =>
                                  setParentProducts((prev) => prev.filter((_, i) => i !== idx))
                                }
                              >
                                <X />
                              </JmIconButton>
                            </div>
                          ))}
                          <JmButton
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() =>
                              setParentProducts((prev) => [...prev, emptyParentRow()])
                            }
                          >
                            <Plus />
                            <span>상위 상품 추가</span>
                          </JmButton>
                        </JmCardContent>
                      </JmCard>
                    </section>
                  )}

                  {/* 조립 템플릿/프리셋 — ASSEMBLED일 때만 */}
                  {currentStep === "components" && productType === "ASSEMBLED" && templates.length > 0 && (
                    <section>
                      <SectionTitle
                        title="조립 템플릿"
                        badge={<span className="text-jm-2xs text-[var(--jm-text-muted)]">선택사항</span>}
                      />
                      <JmCard><JmCardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-jm-xs text-[var(--jm-text-muted)]">템플릿</label>
                          <AssemblyTemplateCombobox
                            templates={templates.map((t) => ({ id: t.id, name: t.name }))}
                            value={templateId}
                            onChange={(id) => {
                              if (id) applyTemplate(id);
                              else {
                                setTemplateId("");
                                setPresetId("");
                              }
                            }}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-jm-xs text-[var(--jm-text-muted)]">프리셋</label>
                          <div className="flex gap-2">
                            <AssemblyPresetCombobox
                              presets={
                                (templates.find((t) => t.id === templateId)?.presets ?? []).map(
                                  (p) => ({ id: p.id, name: p.name }),
                                )
                              }
                              value={presetId}
                              onChange={(id) => {
                                if (id) applyPreset(id);
                                else setPresetId("");
                              }}
                              disabled={
                                !templateId ||
                                (templates.find((t) => t.id === templateId)?.presets.length ?? 0) === 0
                              }
                            />
                            <JmButton
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!templateId}
                              onClick={() => setSavePresetOpen(true)}
                              className="shrink-0 h-9"
                            >
                              프리셋으로 저장
                            </JmButton>
                          </div>
                        </div>
                      </JmCardContent></JmCard>
                    </section>
                  )}

                  {/* 구성 상품 (세트/조립) */}
                  {currentStep === "components" && isSetOrAssembled && (() => {
                    const showLabel = productType === "ASSEMBLED";
                    return (
                    <section>
                      <SectionTitle title="구성 상품" />
                      <JmCard>
                        <JmCardContent className="space-y-2">
                          {setComponents.map((row, idx) => {
                            const hasCost = row.product && row.product.unitCost != null;
                            const lineTotal = hasCost
                              ? parseFloat(row.product!.unitCost || "0") * parseFloat(row.quantity || "1")
                              : 0;
                            return (
                              <div
                                key={row.id}
                                className="space-y-2 rounded-md border border-[var(--jm-border)] bg-[var(--jm-bg)] p-2.5"
                              >
                                {showLabel && (
                                  <AssemblySlotLabelCombobox
                                    labels={slotLabels.map((l) => ({ id: l.id, name: l.name }))}
                                    value={row.slotLabelId ?? ""}
                                    onChange={(id, name) =>
                                      setSetComponents((prev) =>
                                        prev.map((r, i) =>
                                          i === idx ? { ...r, slotLabelId: id || null, label: name } : r,
                                        ),
                                      )
                                    }
                                    onCreateNew={(name) =>
                                      createSlotLabelMutation.mutate({ name, rowIdx: idx })
                                    }
                                    placeholder={
                                      row.label && !row.slotLabelId
                                        ? `${row.label} (재선택 필요)`
                                        : "라벨 선택..."
                                    }
                                  />
                                )}
                                <ProductCombobox
                                  products={existingProducts}
                                  value={row.product?.id ?? ""}
                                  onChange={(p) =>
                                    setSetComponents((prev) =>
                                      prev.map((r, i) => (i === idx ? { ...r, product: p } : r)),
                                    )
                                  }
                                  placeholder="구성 상품 선택..."
                                />
                                <div className="flex items-center gap-2">
                                  <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                                    수량
                                  </span>
                                  <JmInput
                                    type="number"
                                    inputMode="decimal"
                                    min="0.0001"
                                    step="0.01"
                                    value={row.quantity}
                                    onChange={(e) =>
                                      setSetComponents((prev) =>
                                        prev.map((r, i) =>
                                          i === idx ? { ...r, quantity: e.target.value } : r,
                                        ),
                                      )
                                    }
                                    className="h-9 w-20 text-right"
                                  />
                                  <span className="ml-auto text-jm-sm tabular-nums text-[var(--jm-text)]">
                                    {hasCost
                                      ? `소계 ₩${Math.round(lineTotal).toLocaleString("ko-KR")}`
                                      : ""}
                                  </span>
                                  {setComponents.length > 1 && (
                                    <JmIconButton
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      aria-label="구성 상품 삭제"
                                      className="text-[var(--jm-danger-fg)]"
                                      onClick={() =>
                                        setSetComponents((prev) =>
                                          prev.filter((_, i) => i !== idx),
                                        )
                                      }
                                    >
                                      <X />
                                    </JmIconButton>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          <JmButton
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() =>
                              setSetComponents((prev) => [...prev, emptySetComponent()])
                            }
                          >
                            <Plus />
                            <span>구성 상품 추가</span>
                          </JmButton>
                          {componentsTotalCost > 0 && (
                            <div className="flex items-center justify-between rounded-md bg-[var(--jm-surface-muted)] px-3 py-2">
                              <span className="text-jm-sm text-[var(--jm-text-muted)]">
                                구성품 원가 합계
                              </span>
                              <span className="text-jm-md font-semibold tabular-nums text-[var(--jm-text)]">
                                ₩{Math.round(componentsTotalCost).toLocaleString("ko-KR")}
                              </span>
                            </div>
                          )}
                        </JmCardContent>
                      </JmCard>
                    </section>
                    );
                  })()}

                  {/* ── 가격·비용 스텝 ── */}
                  {currentStep === "pricing" && (
                  <>

                  {/* 조립 비용 */}
                  {productType === "ASSEMBLED" && (
                    <section>
                      <SectionTitle
                        title="조립 비용"
                        badge={<span className="text-jm-2xs text-[var(--jm-text-muted)]">선택사항</span>}
                      />
                      <JmCard className="overflow-hidden">
                        <CostList costs={assemblyCosts} onChange={setAssemblyCosts} addLabel="조립 비용 추가" />
                        {assemblyFixedCost > 0 && (
                          <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--jm-border)] text-jm-xs">
                            <span className="text-[var(--jm-text-muted)]">조립비용 합계</span>
                            <span className="font-semibold tabular-nums">₩{Math.round(assemblyFixedCost).toLocaleString("ko-KR")}</span>
                          </div>
                        )}
                      </JmCard>
                    </section>
                  )}

                  {/* 조립/세트 — 구성품 입고 배송비 + 부대비용 (read-only 집계) */}
                  {isSetOrAssembled && setComponents.some((r) => r.product) && (
                    <ComponentIncomingInfoSections
                      rows={setComponents
                        .filter((r) => r.product)
                        .map((r) => ({
                          componentId: r.product!.id,
                          componentName: r.product!.name,
                          componentSku: r.product!.sku,
                          label: r.label ?? null,
                          quantity: parseFloat(r.quantity || "1"),
                          shippingPerUnit: Number(r.product!.shippingPerUnit ?? 0),
                          incomingCostPerUnit: Number(r.product!.incomingCostPerUnit ?? 0),
                          supplierName: r.product!.supplierName ?? null,
                          supplierProductName: r.product!.supplierProductName ?? null,
                          incomingCostList: r.product!.incomingCostList ?? [],
                        }))}
                    />
                  )}

                  {/* 입고 비용 (완제품/부속) — 매핑 미선택 시에도 항상 표시 */}
                  {(productType === "FINISHED" || productType === "PARTS") && mapping.supplierProductId && (
                    <>
                      <section>
                        <SectionTitle
                          title="입고 배송비"
                          badge={
                            <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                              과거 입고 이력 기준. 평균값을 가격계산기에 반영
                            </span>
                          }
                        />
                        <ShippingHistoryCard
                          supplierProductId={mapping.supplierProductId}
                          readOnly
                          limit={5}
                          hideTitle
                        />
                      </section>

                      <section>
                        <SectionTitle
                          title="입고 부대비용"
                          badge={
                            <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                              거래처상품 상세에서 등록·수정 (이 화면 표시 전용)
                            </span>
                          }
                        />
                        <JmCard className="overflow-hidden">
                          <CostList
                            costs={incomingCosts}
                            onChange={setIncomingCosts}
                            addLabel="입고 비용 추가"
                            readOnly
                            emptyLabel="해당 거래처 상품에 등록된 부대비용이 없습니다"
                          />
                        </JmCard>
                      </section>
                    </>
                  )}

                  {/* 판매 비용 (모든 유형) */}
                  <section>
                    <SectionTitle
                      title="판매 비용"
                      badge={<span className="text-jm-2xs text-[var(--jm-text-muted)]">선택사항</span>}
                    />
                    <JmCard className="overflow-hidden">
                      <CostList costs={sellingCosts} onChange={setSellingCosts} addLabel="판매 비용 추가" />
                    </JmCard>
                  </section>

                  {/* 가격 계산기 */}
                  {productType !== "OPTION_PARENT" && PricePanel()}

                  {/* 정가 & 할인 — 선택. 카탈로그에 strikethrough 정가 노출하고 싶을 때만 입력 */}
                  {productType !== "OPTION_PARENT" && (() => {
                    const lpVat = parseFloat(form.listPrice || "0");
                    const spRaw = parseFloat(form.sellingPrice || "0");
                    const rate = parseFloat(form.taxRate || "0.1");
                    const isTaxable = form.taxType !== "TAX_FREE" && !form.zeroRateEligible;
                    const spVat = form.vatIncluded
                      ? spRaw
                      : isTaxable && rate > 0
                        ? Math.round(spRaw * (1 + rate))
                        : spRaw;
                    const hasList = lpVat > 0;
                    const discountAmt = hasList && lpVat > spVat ? lpVat - spVat : 0;
                    const discountPct = hasList && lpVat > 0 && discountAmt > 0
                      ? ((discountAmt / lpVat) * 100).toFixed(1)
                      : null;
                    return (
                      <section>
                        <SectionTitle
                          title="정가 & 할인"
                          badge={
                            <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                              선택 — 카탈로그 할인 노출용
                            </span>
                          }
                        />
                        <JmCard className="overflow-hidden">
                          <JmCardContent className="space-y-3">
                            {/* 정가 입력 */}
                            <div className="flex items-center gap-3">
                              <span className="w-16 shrink-0 text-jm-xs text-[var(--jm-text-muted)]">
                                정가
                              </span>
                              <button
                                type="button"
                                onClick={() => setListPriceDialogOpen(true)}
                                className="flex-1 rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 py-2 text-right text-jm-sm tabular-nums transition-colors hover:bg-[var(--jm-surface-muted)]"
                              >
                                {hasList ? (
                                  <span className="font-semibold text-[var(--jm-text)]">
                                    ₩{formatComma(String(lpVat))}
                                  </span>
                                ) : (
                                  <span className="text-jm-xs text-[var(--jm-text-muted)]">
                                    탭하여 입력
                                  </span>
                                )}
                              </button>
                              {hasList && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setForm((prev) => ({ ...prev, listPrice: "0" }))
                                  }
                                  className="text-jm-xs text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
                                >
                                  지우기
                                </button>
                              )}
                            </div>

                            {/* 할인 표시 (read-only, 자동 계산) */}
                            {!hasList ? (
                              <p className="text-jm-2xs text-[var(--jm-text-muted)] leading-relaxed">
                                정가를 입력하면 카탈로그에 strikethrough 로 할인 노출됩니다 (정가
                                ↘ 판매가). 비워두면 할인 표시 없음.
                              </p>
                            ) : discountAmt === 0 ? (
                              <div className="rounded-md border border-[var(--jm-warning-fg)]/30 bg-[var(--jm-warning-bg)] px-3 py-2 text-jm-2xs text-[var(--jm-warning-fg)]">
                                정가가 판매가({formatComma(String(spVat))}원) 이하라 할인이
                                표시되지 않습니다. 정가를 판매가보다 높게 입력하세요.
                              </div>
                            ) : (
                              <div className="rounded-md bg-[var(--jm-success-bg)] px-3 py-2 text-jm-sm font-semibold tabular-nums text-[var(--jm-success-fg)]">
                                할인 ₩{formatComma(String(discountAmt))} ({discountPct}% off)
                              </div>
                            )}

                            {/* 할인% / 할인금액 자유 입력 — 양방향. 정가 설정 시에만 노출 */}
                            {hasList && (
                              <div className="grid grid-cols-2 gap-2">
                                <div className="relative">
                                  <JmInput
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="할인%"
                                    value={
                                      discountInputActive === "pct"
                                        ? discountPctInput
                                        : discountPct ?? ""
                                    }
                                    onFocus={(e) => {
                                      setDiscountInputActive("pct");
                                      setDiscountPctInput(discountPct ?? "");
                                      focusCaretEnd(e);
                                    }}
                                    onBlur={() => setDiscountInputActive(null)}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setDiscountPctInput(v);
                                      setDiscountInputActive("pct");
                                      const pct = parseFloat(v);
                                      if (
                                        !isNaN(pct) &&
                                        pct >= 0 &&
                                        pct <= 100
                                      ) {
                                        const newSpVat = Math.round(
                                          lpVat * (1 - pct / 100),
                                        );
                                        setManualVatPrice(String(newSpVat));
                                        setLastEdited("price");
                                      }
                                    }}
                                    className="h-9 pr-7 text-right"
                                  />
                                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-jm-xs text-[var(--jm-text-muted)]">
                                    %
                                  </span>
                                </div>
                                <div className="relative">
                                  <JmInput
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="할인금액"
                                    value={
                                      discountInputActive === "amt"
                                        ? formatComma(discountAmtInput)
                                        : discountAmt > 0
                                          ? formatComma(String(discountAmt))
                                          : ""
                                    }
                                    onFocus={(e) => {
                                      setDiscountInputActive("amt");
                                      setDiscountAmtInput(
                                        discountAmt > 0 ? String(discountAmt) : "",
                                      );
                                      focusCaretEnd(e);
                                    }}
                                    onBlur={() => setDiscountInputActive(null)}
                                    onChange={(e) => {
                                      const raw = parseComma(e.target.value);
                                      setDiscountAmtInput(raw);
                                      setDiscountInputActive("amt");
                                      const amt = parseFloat(raw);
                                      if (!isNaN(amt) && amt >= 0 && amt <= lpVat) {
                                        const newSpVat = Math.max(0, lpVat - amt);
                                        setManualVatPrice(String(newSpVat));
                                        setLastEdited("price");
                                      }
                                    }}
                                    className="h-9 pr-8 text-right"
                                  />
                                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-jm-xs text-[var(--jm-text-muted)]">
                                    원
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* 빠른 할인% 칩 — 자유 입력과 병행 (탭 한 번 단축) */}
                            {hasList && (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                                  빠른 할인%:
                                </span>
                                {[5, 10, 15, 20, 30].map((pct) => {
                                  const newSpVat = Math.round(lpVat * (1 - pct / 100));
                                  return (
                                    <button
                                      key={pct}
                                      type="button"
                                      onClick={() => {
                                        setManualVatPrice(String(newSpVat));
                                        setLastEdited("price");
                                      }}
                                      className="rounded-full border border-[var(--jm-border)] bg-[var(--jm-surface)] px-2 py-0.5 text-jm-2xs text-[var(--jm-text)] transition-colors hover:bg-[var(--jm-surface-muted)]"
                                    >
                                      {pct}%
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                          </JmCardContent>
                        </JmCard>
                      </section>
                    );
                  })()}

                  </>
                  )}

                  {/* ── 채널별 가격 스텝 ── */}
                  {currentStep === "channels" && productType !== "OPTION_PARENT" && channels.length > 0 && (
                    ChannelPricingPanel()
                  )}

                  {/* OPTION_PARENT — 옵션 슬롯 + 연결 단품(SWAP) 구성 */}
                  {currentStep === "options" && productType === "OPTION_PARENT" && (
                    <>
                      <section>
                        <SectionTitle
                          title="고객 옵션"
                          badge={
                            <span className="text-jm-2xs text-[var(--jm-danger-fg)]">
                              필수
                            </span>
                          }
                        />
                        <JmCard>
                          <JmCardContent className="space-y-3">
                            <div className="rounded-md border border-[var(--jm-info-fg)]/30 bg-[var(--jm-info-bg)] px-3 py-2 text-jm-xs text-[var(--jm-info-fg)] leading-relaxed">
                              고객이 카탈로그·POS 에서 이 대표상품을 고르면 옵션값 하나를
                              선택 → 연결된 단품 SKU 로 주문·재고 차감됩니다. 대표상품
                              자체는 재고·가격이 없습니다.
                            </div>
                            <Field label="옵션 슬롯명">
                              <JmInput
                                value={optionSlotName}
                                onChange={(e) => setOptionSlotName(e.target.value)}
                                placeholder="예: 색상, 사이즈"
                                className="h-9"
                              />
                            </Field>
                            <div className="space-y-2">
                              {optionParentValues.map((v) => (
                                <div
                                  key={v.rowId}
                                  className="grid grid-cols-1 gap-2 rounded-md border border-[var(--jm-border)] bg-[var(--jm-bg)] p-2 sm:grid-cols-[150px_1fr_auto] sm:items-center"
                                >
                                  <JmInput
                                    value={v.label}
                                    onChange={(e) =>
                                      setOptionParentValues((prev) =>
                                        prev.map((r) =>
                                          r.rowId === v.rowId
                                            ? { ...r, label: e.target.value }
                                            : r,
                                        ),
                                      )
                                    }
                                    placeholder="옵션값 (예: 화이트)"
                                    className="h-9"
                                  />
                                  <ProductCombobox
                                    products={existingProducts}
                                    value={v.product?.id ?? ""}
                                    onChange={(p) =>
                                      setOptionParentValues((prev) =>
                                        prev.map((r) =>
                                          r.rowId === v.rowId ? { ...r, product: p } : r,
                                        ),
                                      )
                                    }
                                    filterType="component"
                                    placeholder="연결할 단품 선택..."
                                  />
                                  <JmIconButton
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    aria-label="옵션값 삭제"
                                    className="justify-self-end text-[var(--jm-danger-fg)]"
                                    disabled={optionParentValues.length <= 1}
                                    onClick={() =>
                                      setOptionParentValues((prev) =>
                                        prev.filter((r) => r.rowId !== v.rowId),
                                      )
                                    }
                                  >
                                    <X />
                                  </JmIconButton>
                                </div>
                              ))}
                              <JmButton
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={() =>
                                  setOptionParentValues((prev) => [
                                    ...prev,
                                    newOptionValueRow(),
                                  ])
                                }
                              >
                                <Plus />
                                <span>옵션값 추가</span>
                              </JmButton>
                            </div>
                          </JmCardContent>
                        </JmCard>
                      </section>
                    </>
                  )}

                  {/* ── 확인 스텝 ── */}
                  {currentStep === "review" && (() => {
                    const ReviewRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
                      <div className="flex items-start justify-between gap-3 border-b border-[var(--jm-border)] py-2 text-jm-sm last:border-0">
                        <span className="shrink-0 text-[var(--jm-text-muted)]">{label}</span>
                        <span className="break-words text-right text-[var(--jm-text)]">{value || "—"}</span>
                      </div>
                    );
                    const EditButton = ({ to }: { to: StepId }) => (
                      <JmButton type="button" variant="outline" size="sm" className="h-7 text-jm-xs" onClick={() => jumpToStep(to)}>
                        수정
                      </JmButton>
                    );
                    const brandName =
                      brands.find((b) => b.id === form.brandId)?.name || form.brandName || "";
                    const categoryName = (() => {
                      for (const cat of categories) {
                        if (cat.id === form.categoryId) return cat.name;
                        const child = cat.children.find((c) => c.id === form.categoryId);
                        if (child) return `${cat.name} > ${child.name}`;
                      }
                      return "";
                    })();
                    const supplierName = suppliers.find((s) => s.id === mapping.supplierId)?.name || "";
                    const supplierProductName =
                      supplierProducts.find((sp) => sp.id === mapping.supplierProductId)?.name || "";
                    const enabledChannels = channelPrices.filter((r) => r.enabled && r.price);
                    return (
                      <div className="space-y-4">
                        <section>
                          <SectionTitle title="기본 정보" />
                          <JmCard><JmCardContent>
                            <div className="flex items-center justify-between">
                              <span className="text-jm-xs text-[var(--jm-text-muted)]">유형 / 기본</span>
                              <EditButton to="basic" />
                            </div>
                            <ReviewRow label="상품 유형" value={currentTypeCard?.label} />
                            <ReviewRow label="상품명" value={form.name} />
                            <ReviewRow label="SKU" value={form.sku} />
                            <ReviewRow label="규격" value={form.spec} />
                            <ReviewRow label="브랜드" value={brandName} />
                            <ReviewRow label="카테고리" value={categoryName} />
                            <ReviewRow label="단위" value={form.unitOfMeasure} />
                          </JmCardContent></JmCard>
                        </section>

                        {(productType === "FINISHED" || productType === "PARTS") && (
                          <section>
                            <SectionTitle title="거래처 연결" />
                            <JmCard><JmCardContent>
                              <div className="flex items-center justify-between">
                                <span className="text-jm-xs text-[var(--jm-text-muted)]">매핑</span>
                                <EditButton to="supplier" />
                              </div>
                              <ReviewRow label="거래처" value={supplierName} />
                              <ReviewRow label="공급상품" value={supplierProductName} />
                              {mapping.supplierProductId && (
                                <ReviewRow label="환산비율" value={mapping.conversionRate || "1"} />
                              )}
                            </JmCardContent></JmCard>
                          </section>
                        )}

                        {isSetOrAssembled && (
                          <section>
                            <SectionTitle title="구성 상품" />
                            <JmCard><JmCardContent>
                              <div className="flex items-center justify-between">
                                <span className="text-jm-xs text-[var(--jm-text-muted)]">구성</span>
                                <EditButton to="components" />
                              </div>
                              {setComponents.filter((c) => c.product).length === 0 ? (
                                <p className="py-1.5 text-jm-sm text-[var(--jm-text-muted)]">구성 상품 없음</p>
                              ) : (
                                setComponents
                                  .filter((c) => c.product)
                                  .map((c) => (
                                    <ReviewRow
                                      key={c.id}
                                      label={c.product!.name}
                                      value={`${c.quantity || "1"} ${c.product!.unitOfMeasure ?? ""}`}
                                    />
                                  ))
                              )}
                            </JmCardContent></JmCard>
                          </section>
                        )}

                        {productType === "OPTION_PARENT" && (
                          <section>
                            <SectionTitle title="옵션 구성" />
                            <JmCard><JmCardContent>
                              <div className="flex items-center justify-between">
                                <span className="text-jm-xs text-[var(--jm-text-muted)]">{optionSlotName}</span>
                                <EditButton to="options" />
                              </div>
                              {optionParentValues
                                .filter((v) => v.label.trim() && v.product)
                                .map((v) => (
                                  <ReviewRow key={v.rowId} label={v.label} value={v.product!.name} />
                                ))}
                            </JmCardContent></JmCard>
                          </section>
                        )}

                        {productType !== "OPTION_PARENT" && (
                          <section>
                            <SectionTitle title="가격" />
                            <JmCard><JmCardContent>
                              <div className="flex items-center justify-between">
                                <span className="text-jm-xs text-[var(--jm-text-muted)]">판매가·마진</span>
                                <EditButton to="pricing" />
                              </div>
                              <ReviewRow
                                label="판매가 (VAT 포함)"
                                value={`₩${(parseFloat(form.sellingPrice || "0")).toLocaleString("ko-KR")}`}
                              />
                              <ReviewRow
                                label="원가"
                                value={`₩${Math.round(activeCalcPrice.totalCost).toLocaleString("ko-KR")}`}
                              />
                            </JmCardContent></JmCard>
                          </section>
                        )}

                        {productType !== "OPTION_PARENT" && channels.length > 0 && (
                          <section>
                            <SectionTitle title="채널 가격" />
                            <JmCard><JmCardContent>
                              <div className="flex items-center justify-between">
                                <span className="text-jm-xs text-[var(--jm-text-muted)]">활성 채널</span>
                                <EditButton to="channels" />
                              </div>
                              {enabledChannels.length === 0 ? (
                                <p className="py-1.5 text-jm-sm text-[var(--jm-text-muted)]">설정한 채널 가격 없음</p>
                              ) : (
                                enabledChannels.map((r) => (
                                  <ReviewRow
                                    key={r.channelId}
                                    label={channels.find((c) => c.id === r.channelId)?.name ?? r.channelId}
                                    value={`₩${(parseFloat(r.price || "0")).toLocaleString("ko-KR")}`}
                                  />
                                ))
                              )}
                            </JmCardContent></JmCard>
                          </section>
                        )}
                      </div>
                    );
                  })()}
                </div>

              </fieldset>
            )}
        </div>

        {/* 하단 네비게이션 */}
        <div className="border-t border-[var(--jm-border)] px-5 py-3.5 flex items-center justify-between gap-2 bg-[var(--jm-bg)] shrink-0">
          {currentStepIdx > 0 && currentStep !== "type" ? (
            <JmButton
              variant="outline"
              onClick={() => {
                if (currentStepIdx === 1) {
                  if (lockProductType) { handleLeave(); return; }
                  if (isDirty && !window.confirm("입력한 내용이 사라집니다. 상품 유형 선택으로 돌아갈까요?")) return;
                  resetAll();
                } else {
                  goPrevStep();
                }
              }}
              disabled={submitting}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              이전
            </JmButton>
          ) : (
            <span />
          )}
          {currentStep === "type" ? (
            <JmButton variant="outline" onClick={handleLeave}>취소</JmButton>
          ) : currentStep === "review" ? (
            <div className="flex gap-2">
              <JmButton variant="outline" onClick={handleLeave} disabled={submitting}>취소</JmButton>
              <JmButton onClick={handleSubmit} disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                등록
              </JmButton>
            </div>
          ) : (
            <JmButton onClick={goNextStep} disabled={submitting}>
              다음
              <ChevronRight className="h-4 w-4 ml-1" />
            </JmButton>
          )}
        </div>
      </div>

      <QuickSupplierSheet
        open={quickSupplierOpen}
        onOpenChange={setQuickSupplierOpen}
        defaultName={quickSupplierDefaultName}
        onCreated={(supplier) => {
          setSuppliers((prev) => prev.some((s) => s.id === supplier.id) ? prev : [...prev, { id: supplier.id, name: supplier.name }]);
          setMapping((prev) => ({ ...prev, supplierId: supplier.id, supplierProductId: "" }));
          fetchSupplierProducts(supplier.id);
        }}
      />

      <QuickSupplierProductSheet
        open={quickSupplierProductOpen}
        onOpenChange={setQuickSupplierProductOpen}
        supplierId={mapping.supplierId}
        supplierName={suppliers.find((s) => s.id === mapping.supplierId)?.name || ""}
        defaultName={quickSupplierProductDefaultName}
        isProvisional={mapping.isProvisional}
        onCreated={(sp) => {
          fetchSupplierProducts(mapping.supplierId);
          setMapping((prev) => ({ ...prev, supplierProductId: sp.id }));
          if (mapping.syncName) {
            setForm((prev) => ({ ...prev, name: sp.name }));
          }
        }}
      />

      <QuickBrandSheet
        open={quickBrandOpen}
        onOpenChange={setQuickBrandOpen}
        defaultName={quickBrandDefaultName}
        onCreated={(brand) => {
          setBrands((prev) => prev.some((b) => b.id === brand.id) ? prev : [...prev, brand]);
          setForm((prev) => ({
            ...prev,
            brandId: brand.id,
            brandName: brand.name,
          }));
        }}
      />

      {/* 정가 입력 드로워 — 최상위 fragment 에 두어 transform 가진 조상 영향 받지 않음 */}
      {(() => {
        const lpVat = parseFloat(form.listPrice || "0");
        const spRaw = parseFloat(form.sellingPrice || "0");
        const rate = parseFloat(form.taxRate || "0.1");
        const isTaxable = form.taxType !== "TAX_FREE" && !form.zeroRateEligible;
        const spVat = form.vatIncluded
          ? spRaw
          : isTaxable && rate > 0
            ? Math.round(spRaw * (1 + rate))
            : spRaw;
        const lpNet =
          isTaxable && rate > 0 && lpVat > 0 ? Math.round(lpVat / (1 + rate)) : lpVat;
        const spNet =
          isTaxable && rate > 0 && spVat > 0 ? Math.round(spVat / (1 + rate)) : spVat;
        return (
          <PriceInputDialog
            open={listPriceDialogOpen}
            onOpenChange={setListPriceDialogOpen}
            title="정가 입력"
            initialNet={lpNet}
            taxType={form.taxType as "TAXABLE" | "TAX_FREE"}
            isZeroRate={form.zeroRateEligible}
            originalPrice={spNet > 0 ? spNet : undefined}
            onSubmit={(netInput) => {
              if (netInput <= 0) {
                setForm((prev) => ({ ...prev, listPrice: "0" }));
                return;
              }
              const vat =
                isTaxable && rate > 0 ? Math.round(netInput * (1 + rate)) : netInput;
              setForm((prev) => ({ ...prev, listPrice: String(vat) }));
            }}
          />
        );
      })()}

      <JmDialog open={savePresetOpen} onOpenChange={setSavePresetOpen}>
        <JmDialogContent>
          <JmDialogHeader>
            <JmDialogTitle>프리셋으로 저장</JmDialogTitle>
          </JmDialogHeader>
          <div className="flex flex-col gap-2 px-6 py-4">
            <label className="text-jm-sm">프리셋명</label>
            <JmInput
              value={savePresetName}
              onChange={(e) => setSavePresetName(e.target.value)}
              placeholder="예: 3HP 기본형"
            />
            <p className="text-jm-xs text-[var(--jm-text-muted)]">
              현재 구성 상품 슬롯이 새 프리셋으로 저장됩니다.
            </p>
          </div>
          <JmDialogFooter>
            <JmButton
              variant="outline"
              onClick={() => setSavePresetOpen(false)}
              disabled={savePresetSubmitting}
            >
              취소
            </JmButton>
            <JmButton onClick={submitSavePreset} disabled={savePresetSubmitting}>
              {savePresetSubmitting ? <Loader2 className="animate-spin" /> : null}
              저장
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>
    </>
  );
}

/** 가격 계산기 원가 요약 한 줄 — 라벨 + 금액 */
function CostLine({
  label,
  value,
}: {
  label: React.ReactNode;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-[var(--jm-text-muted)]">{label}</span>
      <span className="tabular-nums text-[var(--jm-text)]">
        ₩{Math.round(value).toLocaleString("ko-KR")}
      </span>
    </div>
  );
}

/** 스위치 + 라벨/설명 한 줄 — 세금·노출·분할 등 on/off 설정용 */
function ToggleField({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <JmSwitch
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        className="mt-0.5 shrink-0"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-jm-sm text-[var(--jm-text)]">{label}</span>
        {desc && (
          <span className="block text-jm-2xs text-[var(--jm-text-muted)]">
            {desc}
          </span>
        )}
      </span>
    </label>
  );
}
