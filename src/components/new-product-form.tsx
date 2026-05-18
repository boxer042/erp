"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { focusCaretEnd } from "@/jm/lib/focus";
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
import { formatComma, parseComma, cn } from "@/lib/utils";
import { SupplierCombobox } from "@/components/supplier-combobox";
import { SupplierProductCombobox } from "@/components/supplier-product-combobox";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";
import { AssemblyTemplateCombobox } from "@/components/assembly-template-combobox";
import { AssemblyPresetCombobox } from "@/components/assembly-preset-combobox";
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
} from "./new-product-form/types";
import {
  Field,
  GroupHeader,
  SectionTitle,
  CostList,
  TypeSelectScreen,
  PRODUCT_TYPE_CARDS,
  NameAutocomplete,
} from "./new-product-form/parts";
import { ShippingHistoryCard } from "@/components/shipping-history-card";

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
  const [step, setStep] = useState<"type" | "form">(
    defaultProductType || presetCanonicalId ? "form" : "type",
  );
  const [productType, setProductType] = useState<ProductType>(
    defaultProductType ?? "FINISHED",
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
  const [activeStep, setActiveStep] = useState(1);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const suppressScrollUpdateRef = useRef(false);

  const stepItems = useMemo(() => {
    const items = [
      { id: 1, anchor: "np-step-1", label: "거래처 매핑" },
      { id: 2, anchor: "np-step-2", label: "상품 정보" },
      { id: 3, anchor: "np-step-3", label: "비용" },
    ];
    // OPTION_PARENT 는 자체 가격/매핑 없음 — 가격/채널 대신 옵션 구성 STEP
    if (productType === "OPTION_PARENT") {
      items.push({ id: 4, anchor: "np-step-opt", label: "옵션 구성" });
    } else {
      items.push({ id: 4, anchor: "np-step-4", label: "가격 설정" });
      if (channels.length > 0) {
        items.push({ id: 5, anchor: "np-step-5", label: "채널별 가격" });
      }
    }
    return items;
  }, [channels.length, productType]);

  const getViewport = useCallback((): HTMLElement | null => {
    return scrollAreaRef.current;
  }, []);

  const scrollToStep = useCallback((anchor: string) => {
    const viewport = getViewport();
    const target = viewport?.querySelector<HTMLElement>(`#${anchor}`);
    if (viewport && target) {
      viewport.scrollTo({ top: target.offsetTop - 8, behavior: "smooth" });
    }
  }, [getViewport]);

  useEffect(() => {
    if (step !== "form") return;
    const viewport = getViewport();
    if (!viewport) return;

    const getAnchorPairs = () =>
      stepItems
        .map((s) => ({ id: s.id, el: viewport.querySelector<HTMLElement>(`#${s.anchor}`) }))
        .filter((x): x is { id: number; el: HTMLElement } => !!x.el);

    const update = () => {
      if (suppressScrollUpdateRef.current) return;
      const pairs = getAnchorPairs();
      if (pairs.length === 0) return;
      const scrollTop = viewport.scrollTop;
      // 바닥 근처면 마지막 STEP 강제 (마지막 섹션이 짧아 threshold를 못 넘기는 케이스 방지)
      const atBottom =
        viewport.scrollHeight - scrollTop - viewport.clientHeight < 8;
      if (atBottom) {
        setActiveStep(pairs[pairs.length - 1].id);
        return;
      }
      const threshold = 60;
      let current = pairs[0].id;
      for (const p of pairs) {
        if (p.el.offsetTop - threshold <= scrollTop) {
          current = p.id;
        }
      }
      setActiveStep(current);
    };

    const setFromInteraction = (stepId: number) => {
      suppressScrollUpdateRef.current = true;
      setActiveStep(stepId);
      window.setTimeout(() => {
        suppressScrollUpdateRef.current = false;
      }, 400);
    };

    const resolveStep = (y: number): number | null => {
      const pairs = getAnchorPairs();
      if (pairs.length === 0) return null;
      let current = pairs[0].id;
      for (const p of pairs) {
        if (p.el.offsetTop <= y) current = p.id;
      }
      return current;
    };

    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !viewport.contains(t)) return;
      // label → 내부 input 으로 재발행되는 synthetic click은 clientX/Y가 (0, 0)임.
      // 실제 사용자 좌표가 없으면 이 이벤트는 무시.
      if (e.clientX === 0 && e.clientY === 0) return;
      const vpTop = viewport.getBoundingClientRect().top;
      const y = e.clientY - vpTop + viewport.scrollTop;
      const s = resolveStep(y);
      if (s != null) setFromInteraction(s);
    };

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !viewport.contains(t)) return;
      // 실제 visible한 focusable 엘리먼트(가장 가까운 label/button/input/textarea/select)의 rect 기준
      const focusable = (t.closest("label, button, a, select, textarea") as HTMLElement | null) ?? t;
      const rect = focusable.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const vpTop = viewport.getBoundingClientRect().top;
      const y = rect.top - vpTop + viewport.scrollTop;
      const s = resolveStep(y);
      if (s != null) setFromInteraction(s);
    };

    update();
    viewport.addEventListener("scroll", update, { passive: true });
    viewport.addEventListener("focusin", onFocusIn as EventListener);
    viewport.addEventListener("click", onClick as EventListener);
    return () => {
      viewport.removeEventListener("scroll", update);
      viewport.removeEventListener("focusin", onFocusIn as EventListener);
      viewport.removeEventListener("click", onClick as EventListener);
    };
  }, [step, channels.length, productType, mapping.supplierId, mapping.supplierProductId, getViewport, stepItems]);

  const resetAll = useCallback(() => {
    setStep("type");
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
    step === "form" && (
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
    setStep("form");
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
  const getSubmitListPrice = () => toNetPrice(form.listPrice || form.sellingPrice);

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

    return (
      <section>
        <SectionTitle
          icon={<Calculator className="h-4 w-4 text-muted-foreground" />}
          title="가격 계산기"
          badge={<span className="text-[11px] text-muted-foreground">공급가액 기준</span>}
        />
        <JmCard className="overflow-hidden">
        {/* ── 원가 요약 ── */}
        <table className="w-full text-[12px]">
          <tbody className="[&_tr]:border-b [&_tr]:border-border">
            {isSetOrAssembled ? (
              <>
                <tr>
                  <td className="px-3 py-2 text-muted-foreground">구성품 공급단가 합</td>
                  <td className="px-3 py-2 text-right tabular-nums">₩{Math.round(componentsBreakdown.supplier).toLocaleString("ko-KR")}</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 text-muted-foreground">구성품 입고 평균 배송비</td>
                  <td className="px-3 py-2 text-right tabular-nums">₩{Math.round(componentsBreakdown.shipping).toLocaleString("ko-KR")}</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 text-muted-foreground">구성품 입고 부대비용</td>
                  <td className="px-3 py-2 text-right tabular-nums">₩{Math.round(componentsBreakdown.incoming).toLocaleString("ko-KR")}</td>
                </tr>
                {productType === "ASSEMBLED" && (
                  <tr>
                    <td className="px-3 py-2 text-muted-foreground">조립비용</td>
                    <td className="px-3 py-2 text-right tabular-nums">₩{Math.round(assemblyFixedCost).toLocaleString("ko-KR")}</td>
                  </tr>
                )}
                {cardFeeRate > 0 && (
                  <tr>
                    <td className="px-3 py-2 text-muted-foreground">카드수수료 <span className="text-[10px]">(판매가 {(cardFeeRate * 100).toFixed(2)}%)</span></td>
                    <td className="px-3 py-2 text-right tabular-nums">₩{Math.round(calcSetPrice.cardFeeAmount).toLocaleString("ko-KR")}</td>
                  </tr>
                )}
              </>
            ) : (
              <>
                {!mapping.supplierProductId ? (
                  <tr>
                    <td className="px-3 py-2 text-muted-foreground">원가 직접 입력</td>
                    <td className="px-3 py-1 text-right">
                      <JmInput
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={formatComma(baseCost)}
                        onChange={(e) => setBaseCost(parseComma(e.target.value))}
                        onFocus={focusCaretEnd}
                        className="h-7 w-28 ml-auto text-right text-[12px]"
                      />
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td className="px-3 py-2 text-muted-foreground">
                      공급단가 ÷ 환산비율
                      {avgIncomingCost !== null && (
                        <span
                          className="ml-1.5 text-[10px] text-muted-foreground"
                          title="최근 입고 50건의 수량 가중평균. 실제 출고 원가와 다를 수 있습니다 (참고값)."
                        >
                          (최근 입고 평균 ₩{Math.round(avgIncomingCost / (parseFloat(mapping.conversionRate || "1") || 1)).toLocaleString("ko-KR")})
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">₩{Math.round(calcPrice.unitCost).toLocaleString("ko-KR")}</td>
                  </tr>
                )}
                <tr>
                  <td className="px-3 py-2 text-muted-foreground">입고 평균 배송비</td>
                  <td className="px-3 py-2 text-right tabular-nums">₩{Math.round(calcPrice.avgShippingNet).toLocaleString("ko-KR")}</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 text-muted-foreground">입고 부대비용</td>
                  <td className="px-3 py-2 text-right tabular-nums">₩{Math.round(calcPrice.incomingTotal - calcPrice.avgShippingNet).toLocaleString("ko-KR")}</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 text-muted-foreground">판매비용</td>
                  <td className="px-3 py-2 text-right tabular-nums">₩{Math.round(calcPrice.sellingFixed).toLocaleString("ko-KR")}</td>
                </tr>
                {cardFeeRate > 0 && (
                  <tr>
                    <td className="px-3 py-2 text-muted-foreground">카드수수료 <span className="text-[10px]">(판매가 {(cardFeeRate * 100).toFixed(2)}%)</span></td>
                    <td className="px-3 py-2 text-right tabular-nums">₩{Math.round(calcPrice.cardFeeAmount).toLocaleString("ko-KR")}</td>
                  </tr>
                )}
              </>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-muted/30">
              <td className="px-3 py-2.5 text-[13px] font-semibold">
                <span className="flex items-center gap-1.5">
                  총원가
              <JmTooltipProvider delay={100}>
                <JmTooltipRoot>
                  <JmTooltipTrigger
                    render={
                      <button type="button" className="text-[var(--jm-text-muted)] hover:text-[var(--jm-text)] transition-colors" aria-label="원가 계산식 보기">
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    }
                  />
                  <JmTooltipContent side="top" className="max-w-[280px] text-jm-2xs leading-relaxed">
                    {isSetOrAssembled ? (
                      <div className="space-y-1">
                        <div className="font-semibold">총원가 계산식</div>
                        <div>= 구성품 공급단가 + 입고 평균 배송비 + 입고 부대비용{productType === "ASSEMBLED" ? " + 조립비용" : ""}{cardFeeRate > 0 && " + 카드수수료"}</div>
                        <div className="pt-1 border-t border-[var(--jm-border)] mt-1 space-y-0.5 text-[10px] opacity-80">
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
                        <div className="pt-1 border-t border-[var(--jm-border)] mt-1 space-y-0.5 text-[10px] opacity-80">
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
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-[13px] font-semibold">₩{Math.round(totalCost).toLocaleString("ko-KR")}</td>
            </tr>
          </tfoot>
        </table>

        <JmCardContent className="py-4 space-y-3 border-t border-border">
        {/* ── 마진율 ── */}
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground shrink-0 w-14">마진율</span>
          <div className="relative flex-1">
            <JmInput
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              value={lastEdited === "rate" ? targetMargin : marginRate.toFixed(1)}
              onChange={(e) => { setTargetMargin(e.target.value); setLastEdited("rate"); }}
              onFocus={focusCaretEnd}
              className={`h-9 pr-6 text-right text-[13px] ${marginAmount < 0 ? "text-red-400" : ""}`}
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">%</span>
          </div>
        </div>

        {/* ── 마진금액 ── */}
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground shrink-0 w-14">마진금액</span>
          <JmInput
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={formatComma(lastEdited === "amount" ? targetMarginAmount : (marginAmount !== 0 ? Math.round(marginAmount).toString() : ""))}
            onChange={(e) => { setTargetMarginAmount(parseComma(e.target.value)); setLastEdited("amount"); }}
            onFocus={focusCaretEnd}
            className={`h-9 flex-1 text-right text-[13px] ${marginAmount < 0 ? "text-red-400" : ""}`}
          />
        </div>
        {marginAmount < 0 && vatPrice > 0 && (
          <div className="text-[11px] text-red-400 flex items-center gap-1">
            <span>⚠</span>
            <span>카드수수료·비용을 반영하면 마진이 음수입니다</span>
          </div>
        )}

        {/* ── 가격 결과 (3컬럼 삼등분) ── */}
        <div className="grid grid-cols-3 rounded-lg border border-border overflow-hidden bg-card">
          {/* 공급가액 */}
          <div className="px-2 py-2 text-center border-r border-border">
            <div className="text-[10px] text-muted-foreground mb-1">공급가액</div>
            <JmInput
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={formatComma(lastEdited === "supply" ? manualSupplyPrice : (supplyPrice > 0 ? supplyPrice.toString() : ""))}
              onChange={(e) => { setManualSupplyPrice(parseComma(e.target.value)); setLastEdited("supply"); }}
              onFocus={focusCaretEnd}
              className="h-7 text-center text-[15px] font-bold border-0 bg-transparent focus-visible:ring-1 px-0"
            />
          </div>
          {/* 세액 */}
          <div className="px-2 py-3 text-center border-r border-border">
            <div className="text-[10px] text-muted-foreground mb-1">세액</div>
            <div className="text-[15px] font-bold tabular-nums">
              {supplyPrice > 0 && taxRate > 0
                ? `₩${Math.round(supplyPrice * taxRate).toLocaleString("ko-KR")}`
                : "—"}
            </div>
          </div>
          {/* 판매가 */}
          <div className="px-2 py-2 text-center">
            <div className="text-[10px] text-muted-foreground mb-1">판매가</div>
            <JmInput
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={formatComma(lastEdited === "price" ? manualVatPrice : (vatPrice > 0 ? vatPrice.toString() : ""))}
              onChange={(e) => { setManualVatPrice(parseComma(e.target.value)); setLastEdited("price"); }}
              onFocus={focusCaretEnd}
              className="h-7 text-center text-[15px] font-bold border-0 bg-transparent focus-visible:ring-1 px-0"
            />
          </div>
        </div>
        </JmCardContent></JmCard>
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
          badge={<span className="text-[11px] text-muted-foreground">선택사항</span>}
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
            const marginColor = realMargin >= 0 ? "text-primary" : "text-red-400";

            return (
              <div key={ch.id} className="rounded-lg border border-border bg-card overflow-hidden">
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
                  <span className="text-[13px] font-medium flex-1 truncate">{ch.name}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0">수수료 {(commRate * 100).toFixed(2)}%</span>
                </label>
                {row.enabled && (
                  <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border">
                    {/* 마진율 */}
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground w-14 shrink-0">마진율</span>
                      <div className="relative flex-1">
                        <JmInput
                          type="text"
                          inputMode="decimal"
                          value={row.lastEdited === "rate" ? row.targetRate : realMarginRate.toFixed(1)}
                          onChange={(e) => updateRow(idx, { targetRate: e.target.value, lastEdited: "rate" })}
                          onFocus={focusCaretEnd}
                          className="h-8 pr-6 text-right text-[12px]"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">%</span>
                      </div>
                    </div>
                    {/* 마진금액 */}
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground w-14 shrink-0">마진금액</span>
                      <JmInput
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={formatComma(row.lastEdited === "amount" ? row.targetAmount : (realMargin > 0 ? Math.round(realMargin).toString() : ""))}
                        onChange={(e) => updateRow(idx, { targetAmount: parseComma(e.target.value), lastEdited: "amount" })}
                        onFocus={focusCaretEnd}
                        className="h-8 flex-1 text-right text-[12px]"
                      />
                    </div>
                    {/* 판매가 */}
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground w-14 shrink-0">판매가</span>
                      <JmInput
                        type="text"
                        inputMode="numeric"
                        placeholder={offlineVatPrice > 0 ? formatComma(String(offlineVatPrice)) : "0"}
                        value={formatComma(row.lastEdited === "price" || row.lastEdited === null ? row.price : String(channelVatPrice))}
                        onChange={(e) => updateRow(idx, { price: parseComma(e.target.value), lastEdited: "price" })}
                        onFocus={focusCaretEnd}
                        className="h-8 flex-1 text-right text-[12px] font-medium"
                      />
                    </div>
                    {/* 채널 전용 판매비용 */}
                    <div className="rounded-md border border-border bg-card">
                      <div className="px-2.5 py-1.5 border-b border-border flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">{ch.name} 전용 판매비용</span>
                        <span className="text-[10px] text-muted-foreground">전사 공통 비용은 위 &quot;판매 비용&quot; 섹션에서 관리</span>
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
                    <div className="grid grid-cols-4 rounded-md border border-border overflow-hidden text-[11px] bg-card">
                      <div className="px-2 py-1.5 text-center border-r border-border">
                        <div className="text-[10px] text-muted-foreground">공급가</div>
                        <div className="tabular-nums">₩{Math.round(channelSupplyPrice).toLocaleString("ko-KR")}</div>
                      </div>
                      <div className="px-2 py-1.5 text-center border-r border-border">
                        <div className="text-[10px] text-muted-foreground">세액</div>
                        <div className="tabular-nums">₩{Math.round(taxAmount).toLocaleString("ko-KR")}</div>
                      </div>
                      <div className="px-2 py-1.5 text-center border-r border-border">
                        <div className="text-[10px] text-muted-foreground">수수료</div>
                        <div className="tabular-nums">₩{Math.round(commissionAmount).toLocaleString("ko-KR")}</div>
                      </div>
                      <div className="px-2 py-1.5 text-center">
                        <div className="text-[10px] text-muted-foreground">실마진</div>
                        <div className={`tabular-nums font-medium ${marginColor}`}>
                          ₩{Math.round(realMargin).toLocaleString("ko-KR")}
                          <span className="ml-1 text-[10px]">({realMarginRate.toFixed(1)}%)</span>
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

  return (
    <>
      <div className="flex h-full flex-col bg-background">
        {/* 헤더 */}
        <header className="border-b border-border px-5 py-3.5 shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="뒤로가기"
                className="text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => {
                  if (step === "form") {
                    if (lockProductType) {
                      handleLeave();
                      return;
                    }
                    if (isDirty && !window.confirm("입력한 내용이 사라집니다. 상품 유형 선택으로 돌아갈까요?")) return;
                    resetAll();
                  } else {
                    handleLeave();
                  }
                }}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <h1 className="text-base font-medium flex-1">새 상품 등록</h1>
              {step === "form" && currentTypeCard && (
                <div
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[12px] font-medium leading-none"
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

          {/* 진행도 */}
          {step === "form" && (
            <nav
              aria-label="등록 단계"
              className="border-b border-border px-4 py-2 shrink-0 overflow-x-auto"
            >
              <ol className="flex items-center gap-1 min-w-max">
                {stepItems.map((s, i) => {
                  const isActive = activeStep === s.id;
                  const isDone = activeStep > s.id;
                  return (
                    <li key={s.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => scrollToStep(s.anchor)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                          isActive
                            ? "bg-secondary text-foreground"
                            : isDone
                            ? "text-primary hover:bg-muted/50"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        }`}
                      >
                        <span
                          className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold leading-none ${
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : isDone
                              ? "bg-primary/20 text-primary"
                              : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {s.id}
                        </span>
                        {s.label}
                      </button>
                      {i < stepItems.length - 1 && (
                        <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}

          {/* 본문 */}
          <div ref={scrollAreaRef} className="flex-1 min-h-0 overflow-y-auto">
            {step === "type" ? (
              <TypeSelectScreen onSelect={handleSelectType} />
            ) : (
              <fieldset disabled={submitting} className="contents">

                {/* ── 입력 폼 ── */}
                <div className="px-5 py-5 space-y-5">

                  {/* 변형 추가 인라인 진입 시 대표 연결 안내 배너 */}
                  {presetCanonicalId && canonicalProductId && (
                    <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[12px] text-foreground">
                      <span className="text-muted-foreground">대표 상품 변형으로 등록: </span>
                      <span className="font-medium">
                        {existingProducts.find((p) => p.id === canonicalProductId)?.name ?? "선택된 대표"}
                      </span>
                    </div>
                  )}

                  {/* 거래처 매핑 (STEP 1) */}
                  {(productType === "FINISHED" || productType === "PARTS") && (
                    <>
                      <GroupHeader step="STEP 1" title="거래처 매핑" id="np-step-1" />
                      <section>
                        <SectionTitle
                          title="거래처 매핑"
                          badge={<span className="text-[11px] text-muted-foreground">선택사항</span>}
                        />
                        <JmCard><JmCardContent className="space-y-3">
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
                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <JmCheckbox
                                checked={mapping.isProvisional}
                                onCheckedChange={(checked) => setMapping((prev) => ({ ...prev, isProvisional: !!checked }))}
                              />
                              <span className="text-[13px] text-muted-foreground">임시 등록 <span className="text-[11px]">(실제 입고 전 어림잡은 정보)</span></span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <JmCheckbox
                                checked={mapping.syncName}
                                onCheckedChange={(checked) => {
                                  const next = !!checked;
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
                              <span className="text-[13px] text-muted-foreground">상품명 동일 <span className="text-[11px]">(공급상품명을 그대로 사용)</span></span>
                            </label>
                          </div>
                        )}

                        {mapping.supplierId && (
                          <Field label="공급상품">
                            <SupplierProductCombobox
                              supplierProducts={supplierProducts}
                              value={mapping.supplierProductId}
                              onChange={(sp) => {
                                setMapping((prev) => ({ ...prev, supplierProductId: sp.id }));
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
                              <p className="text-[12px] text-muted-foreground">공급상품 1개 → 판매상품 <span className="text-foreground font-medium">{mapping.conversionRate || "1"}</span>개</p>
                            </div>
                          </Field>
                          );
                        })()}
                        </JmCardContent>
                        {mapping.supplierProductId && (() => {
                          const sp = supplierProducts.find((s) => s.id === mapping.supplierProductId);
                          if (!sp) return null;
                          const listPrice = parseFloat(sp.listPrice) || 0;
                          const unitPrice = parseFloat(sp.unitPrice) || 0;
                          const discount = listPrice - unitPrice;
                          const supplyAmt = unitPrice * 1;
                          const taxAmt = sp.isTaxable ? Math.round(supplyAmt * 0.1) : 0;
                          return (
                            <table className="w-full text-[12px] border-t border-border">
                              <thead>
                                <tr className="bg-muted text-muted-foreground">
                                  <th className="border-r border-b border-border py-1.5 px-2 text-left font-medium whitespace-nowrap w-28">품번</th>
                                  <th className="border-r border-b border-border py-1.5 px-2 text-left font-medium whitespace-nowrap">규격</th>
                                  <th className="border-r border-b border-border py-1.5 px-2 text-center font-medium whitespace-nowrap">단위</th>
                                  <th className="border-r border-b border-border py-1.5 px-2 text-center font-medium whitespace-nowrap">수량</th>
                                  <th className="border-r border-b border-border py-1.5 px-2 text-right font-medium whitespace-nowrap">단가</th>
                                  <th className="border-r border-b border-border py-1.5 px-2 text-right font-medium whitespace-nowrap">할인</th>
                                  <th className="border-r border-b border-border py-1.5 px-2 text-right font-medium whitespace-nowrap">실제단가</th>
                                  <th className="border-r border-b border-border py-1.5 px-2 text-right font-medium whitespace-nowrap">공급가액</th>
                                  <th className="border-r border-b border-border py-1.5 px-2 text-right font-medium whitespace-nowrap">세액</th>
                                  <th className="border-b border-border py-1.5 px-2 text-left font-medium whitespace-nowrap">비고</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="border-b border-border">
                                  <td className="border-r border-border py-1.5 px-2 text-muted-foreground w-28 max-w-28 truncate">{sp.supplierCode || "-"}</td>
                                  <td className="border-r border-border py-1.5 px-2 text-muted-foreground">{sp.spec || "-"}</td>
                                  <td className="border-r border-border py-1.5 px-2 text-center">{sp.unitOfMeasure}</td>
                                  <td className="border-r border-border py-1.5 px-2 text-center">1</td>
                                  <td className="border-r border-border py-1.5 px-2 text-right">{listPrice > 0 ? `₩${listPrice.toLocaleString("ko-KR")}` : "-"}</td>
                                  <td className="border-r border-border py-1.5 px-2 text-right">{discount > 0 ? `₩${discount.toLocaleString("ko-KR")}` : "-"}</td>
                                  <td className="border-r border-border py-1.5 px-2 text-right font-medium">₩{unitPrice.toLocaleString("ko-KR")}</td>
                                  <td className="border-r border-border py-1.5 px-2 text-right">₩{supplyAmt.toLocaleString("ko-KR")}</td>
                                  <td className="border-r border-border py-1.5 px-2 text-right">{taxAmt > 0 ? `₩${taxAmt.toLocaleString("ko-KR")}` : "-"}</td>
                                  <td className="border-border py-1.5 px-2 text-muted-foreground">{sp.memo || "-"}</td>
                                </tr>
                              </tbody>
                            </table>
                          );
                        })()}
                        </JmCard>
                      </section>
                    </>
                  )}

                  <GroupHeader step="STEP 2" title="상품 정보" id="np-step-2" />

                  {/* 기본 정보 */}
                  <section>
                    <SectionTitle title="기본 정보" />
                    <JmCard><JmCardContent className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="상품명" required>
                        <NameAutocomplete
                          value={form.name}
                          onChange={(name) => setForm((prev) => ({ ...prev, name }))}
                          items={productNameItems}
                        />
                      </Field>
                      <Field label="규격">
                        <JmInput
                          placeholder="예: B-55, 3HP (선택)"
                          value={form.spec}
                          onChange={(e) => setForm((prev) => ({ ...prev, spec: e.target.value }))}
                          className="h-9"
                        />
                      </Field>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="브랜드">
                        <BrandCombobox
                          brands={brands}
                          value={form.brandId}
                          onChange={(id, name) =>
                            setForm((prev) => ({
                              ...prev,
                              brandId: id,
                              brandName: name,
                            }))
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
                            className="shrink-0 h-9 w-9 p-0"
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="모델명">
                        <JmInput
                          placeholder="모델명 (선택)"
                          value={form.modelName}
                          onChange={(e) => setForm((prev) => ({ ...prev, modelName: e.target.value }))}
                          className="h-9"
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

                    {(productType === "FINISHED" || productType === "PARTS") && true && (
                      <div className="space-y-2 rounded-md border border-dashed border-border p-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <JmCheckbox
                            checked={bulkUsable}
                            onCheckedChange={(v) => {
                              const checked = !!v;
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
                          <span className="text-[13px]">분할 사용 가능 (병·통 단위 입고, 소량 단위 소모)</span>
                        </label>
                        {bulkUsable && (
                          <div className="space-y-2 pl-6">
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
                      </div>
                    )}

                    <Field label="세금 유형">
                      <div className="flex gap-1">
                        <span
                          className="px-2 h-6 rounded text-[11px] border transition-colors bg-primary/10 border-primary/40 text-primary inline-flex items-center"
                        >
                          과세
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              zeroRateEligible: !prev.zeroRateEligible,
                            }))
                          }
                          className={cn(
                            "px-2 h-6 rounded text-[11px] border transition-colors",
                            form.zeroRateEligible
                              ? "bg-primary/10 border-primary/40 text-primary"
                              : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                          )}
                        >
                          영세율 가능
                        </button>
                      </div>
                    </Field>

                    <Field label="개별추적">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({ ...prev, trackable: !prev.trackable }))
                          }
                          className={cn(
                            "px-2 h-6 rounded text-[11px] border transition-colors",
                            form.trackable
                              ? "bg-primary/10 border-primary/40 text-primary"
                              : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                          )}
                        >
                          시리얼 라벨 발번
                        </button>
                        {form.trackable && (
                          <div className="flex items-center gap-1.5">
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
                              className="h-7 w-16 text-right text-[13px]"
                            />
                            <span className="text-[11px] text-muted-foreground">개월 보증</span>
                          </div>
                        )}
                      </div>
                    </Field>

                    <Field label="카탈로그">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              catalogHidden: !prev.catalogHidden,
                            }))
                          }
                          className={cn(
                            "px-2 h-6 rounded text-[11px] border transition-colors",
                            form.catalogHidden
                              ? "bg-amber-100 border-amber-300 text-amber-900 dark:bg-amber-500/15 dark:border-amber-500/40 dark:text-amber-300"
                              : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                          )}
                          title="ON: 자사몰/POS 카탈로그에서 단독 노출 안 됨. 다른 상품의 옵션 SWAP 으로만 도달 가능 (가습기-블랙 같은 케이스)"
                        >
                          {form.catalogHidden ? "노출 차단" : "정상 노출"}
                        </button>
                        {form.catalogHidden && (
                          <span className="text-[10px] text-muted-foreground">
                            옵션 SWAP 대상 SKU 운영 시 사용
                          </span>
                        )}
                      </div>
                    </Field>

                    <Field label="메모">
                      <JmTextarea
                        placeholder="메모 (선택)"
                        value={form.memo}
                        onChange={(e) => setForm((prev) => ({ ...prev, memo: e.target.value }))}
                        className="min-h-[60px] resize-none text-[13px]"
                      />
                    </Field>
                    </JmCardContent></JmCard>
                  </section>

                  {/* 상위 상품 연결 (부속) */}
                  {productType === "PARTS" && true && (
                    <section>
                      <SectionTitle
                        title="상위 상품 연결"
                        badge={<span className="text-[11px] text-muted-foreground">선택사항</span>}
                      />
                      <JmCard className="overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted text-muted-foreground text-xs">
                            <th className="border-r border-b border-border py-1.5 px-2 text-left font-medium">상위 세트/조립 상품</th>
                            <th className="border-r border-b border-border w-[80px] py-1.5 px-2 text-center font-medium">수량</th>
                            <th className="border-b border-border w-[32px]" />
                          </tr>
                        </thead>
                        <tbody>
                          {parentProducts.map((row, idx) => (
                            <tr key={row.id} className="border-b border-border hover:bg-muted/50">
                              <td className="border-r border-border px-1 py-0.5">
                                <ProductCombobox
                                  products={existingProducts}
                                  value={row.product?.id ?? ""}
                                  onChange={(p) => setParentProducts((prev) => prev.map((r, i) => i === idx ? { ...r, product: p } : r))}
                                  filterType="set"
                                  placeholder="상위 세트/조립 상품 선택..."
                                />
                              </td>
                              <td className="border-r border-border px-1 py-0.5">
                                <JmInput
                                  type="number"
                                  inputMode="decimal"
                                  min="0.0001"
                                  step="0.01"
                                  value={row.quantity}
                                  onChange={(e) => setParentProducts((prev) => prev.map((r, i) => i === idx ? { ...r, quantity: e.target.value } : r))}
                                  className="h-7 text-[12px] text-right border-0 bg-transparent focus-visible:ring-0 px-1"
                                />
                              </td>
                              <td className="text-center">
                                <button
                                  type="button"
                                  className="text-muted-foreground hover:text-red-400 transition-colors p-1"
                                  onClick={() => setParentProducts((prev) => prev.filter((_, i) => i !== idx))}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </td>
                            </tr>
                          ))}
                          <tr>
                            <td colSpan={3} className="px-2 py-1.5">
                              <button
                                type="button"
                                onClick={() => setParentProducts((prev) => [...prev, emptyParentRow()])}
                                className="flex items-center gap-1.5 text-muted-foreground text-[12px] hover:text-primary transition-colors"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                상위 상품 추가
                              </button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      </JmCard>
                    </section>
                  )}

                  {/* 조립 템플릿/프리셋 — ASSEMBLED일 때만 */}
                  {productType === "ASSEMBLED" && templates.length > 0 && (
                    <section>
                      <SectionTitle
                        title="조립 템플릿"
                        badge={<span className="text-[11px] text-muted-foreground">선택사항</span>}
                      />
                      <JmCard><JmCardContent className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[12px] text-muted-foreground">템플릿</label>
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
                          <label className="text-[12px] text-muted-foreground">프리셋</label>
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
                  {isSetOrAssembled && (() => {
                    const showLabel = productType === "ASSEMBLED";
                    const colCount = showLabel ? 5 : 4;
                    return (
                    <section>
                      <SectionTitle title="구성 상품" />
                      <JmCard className="overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted text-muted-foreground text-xs">
                            {showLabel && (
                              <th className="border-r border-b border-border w-[110px] py-1.5 px-2 text-left font-medium">라벨</th>
                            )}
                            <th className="border-r border-b border-border py-1.5 px-2 text-left font-medium">상품</th>
                            <th className="border-r border-b border-border w-[72px] py-1.5 px-2 text-center font-medium">수량</th>
                            <th className="border-r border-b border-border w-[110px] py-1.5 px-2 text-center font-medium">소계</th>
                            <th className="border-b border-border w-[32px]" />
                          </tr>
                        </thead>
                        <tbody>
                          {setComponents.map((row, idx) => {
                            const hasCost = row.product && row.product.unitCost != null;
                            const lineTotal = hasCost
                              ? parseFloat(row.product!.unitCost || "0") * parseFloat(row.quantity || "1")
                              : 0;
                            return (
                              <tr key={row.id} className="border-b border-border hover:bg-muted/50">
                                {showLabel && (
                                  <td className="border-r border-border p-0.5">
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
                                  </td>
                                )}
                                <td className="border-r border-border px-1 py-0.5">
                                  <ProductCombobox
                                    products={existingProducts}
                                    value={row.product?.id ?? ""}
                                    onChange={(p) => setSetComponents((prev) => prev.map((r, i) => i === idx ? { ...r, product: p } : r))}
                                    placeholder="구성 상품 선택..."
                                  />
                                </td>
                                <td className="border-r border-border px-1 py-0.5">
                                  <JmInput
                                    type="number"
                                    inputMode="decimal"
                                    min="0.0001"
                                    step="0.01"
                                    value={row.quantity}
                                    onChange={(e) => setSetComponents((prev) => prev.map((r, i) => i === idx ? { ...r, quantity: e.target.value } : r))}
                                    className="h-7 text-[12px] text-right border-0 bg-transparent focus-visible:ring-0 px-1"
                                  />
                                </td>
                                <td className="border-r border-border px-2 py-1 text-right text-[12px] tabular-nums text-primary">
                                  {hasCost ? `₩${Math.round(lineTotal).toLocaleString("ko-KR")}` : "—"}
                                </td>
                                <td className="text-center">
                                  {setComponents.length > 1 && (
                                    <button
                                      type="button"
                                      className="text-muted-foreground hover:text-red-400 transition-colors p-1"
                                      onClick={() => setSetComponents((prev) => prev.filter((_, i) => i !== idx))}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                          <tr className={componentsTotalCost > 0 ? "border-b border-border" : ""}>
                            <td colSpan={colCount} className="px-2 py-1.5">
                              <button
                                type="button"
                                onClick={() => setSetComponents((prev) => [...prev, emptySetComponent()])}
                                className="flex items-center gap-1.5 text-muted-foreground text-[12px] hover:text-primary transition-colors"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                구성 상품 추가
                              </button>
                            </td>
                          </tr>
                          {componentsTotalCost > 0 && (
                            <tr>
                              <td colSpan={showLabel ? 3 : 2} className="px-2 py-2 text-[12px] text-muted-foreground">구성품 원가 합계</td>
                              <td className="px-2 py-2 text-right text-[13px] font-semibold tabular-nums" colSpan={2}>
                                ₩{Math.round(componentsTotalCost).toLocaleString("ko-KR")}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                      </JmCard>
                    </section>
                    );
                  })()}

                  <GroupHeader step="STEP 3" title="비용" id="np-step-3" />

                  {/* 조립 비용 */}
                  {productType === "ASSEMBLED" && (
                    <section>
                      <SectionTitle
                        title="조립 비용"
                        badge={<span className="text-[11px] text-muted-foreground">선택사항</span>}
                      />
                      <JmCard className="overflow-hidden">
                        <CostList costs={assemblyCosts} onChange={setAssemblyCosts} addLabel="조립 비용 추가" />
                        {assemblyFixedCost > 0 && (
                          <div className="flex items-center justify-between px-3 py-2 border-t border-border text-[12px]">
                            <span className="text-muted-foreground">조립비용 합계</span>
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
                            <span className="text-[11px] text-muted-foreground">
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
                            <span className="text-[11px] text-muted-foreground">
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
                      badge={<span className="text-[11px] text-muted-foreground">선택사항</span>}
                    />
                    <JmCard className="overflow-hidden">
                      <CostList costs={sellingCosts} onChange={setSellingCosts} addLabel="판매 비용 추가" />
                    </JmCard>
                  </section>

                  {productType !== "OPTION_PARENT" && (
                    <>
                      <GroupHeader step="STEP 4" title="가격 설정" id="np-step-4" />

                      {/* 가격 계산기 */}
                      {PricePanel()}

                      {channels.length > 0 && (
                        <>
                          <GroupHeader step="STEP 5" title="채널별 가격" id="np-step-5" />
                          {ChannelPricingPanel()}
                        </>
                      )}
                    </>
                  )}

                  {/* OPTION_PARENT — 옵션 슬롯 + 연결 단품(SWAP) 구성 */}
                  {productType === "OPTION_PARENT" && (
                    <>
                      <GroupHeader step="STEP 4" title="옵션 구성" id="np-step-opt" />
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
                                  className="grid grid-cols-1 gap-2 sm:grid-cols-[150px_1fr_auto] sm:items-center"
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
                </div>

              </fieldset>
            )}
        </div>

        {/* 하단 버튼 */}
        <div className="border-t border-border px-5 py-3.5 flex justify-end gap-2 bg-background shrink-0">
          {step === "type" ? (
            <JmButton variant="outline" onClick={handleLeave}>취소</JmButton>
          ) : (
            <>
              <JmButton variant="outline" onClick={handleLeave} disabled={submitting}>취소</JmButton>
              <JmButton onClick={handleSubmit} disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                등록
              </JmButton>
            </>
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
