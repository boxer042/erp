"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { RefreshCw, Plus, X, Loader2, ChevronLeft, ChevronRight, Calculator, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { UNITS_OF_MEASURE } from "@/lib/constants";
import { formatComma, parseComma, cn } from "@/lib/utils";
import { SupplierCombobox } from "@/components/supplier-combobox";
import { SupplierProductCombobox } from "@/components/supplier-product-combobox";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";
import { AssemblyTemplateCombobox } from "@/components/assembly-template-combobox";
import { AssemblyPresetCombobox } from "@/components/assembly-preset-combobox";
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
} from "./new-product-form/parts";
import { submitEdit } from "./new-product-form/submit-edit";
import type { ProductDetail } from "@/components/product/types";

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
  /** 모드: "create" (default) | "edit" */
  mode?: "create" | "edit";
  /** edit 모드에서 PUT 대상 productId */
  productId?: string;
  /** edit 모드 초기 데이터 (GET /api/products/[id] 응답 + 매핑된 supplierProducts) */
  initialData?: {
    product: ProductDetail;
    /** 선택된 거래처의 공급상품 리스트 (mapping의 supplierId 기반으로 풀로드) */
    supplierProducts?: SupplierProduct[];
  };
}

// 편집 모드에서 GET 응답을 form state 초기값으로 변환
function buildEditInit(initial: NonNullable<NewProductFormProps["initialData"]>) {
  const p = initial.product;
  const m = p.productMappings?.[0] ?? null;
  const sp = m?.supplierProduct;

  const incomingCosts: CostRow[] =
    sp?.incomingCosts?.map((c) => ({
      id: Math.random().toString(36).slice(2),
      serverId: c.id,
      name: c.name,
      costType: c.costType as "FIXED" | "PERCENTAGE",
      value: String(c.value),
      perUnit: c.perUnit,
      isTaxable: c.isTaxable,
    })) ?? [];

  const allSelling = p.sellingCosts ?? [];
  const sellingCosts: CostRow[] = allSelling
    .filter((c) => c.channelId == null)
    .map((c) => ({
      id: Math.random().toString(36).slice(2),
      serverId: c.id,
      name: c.name,
      costType: c.costType as "FIXED" | "PERCENTAGE",
      value: String(c.value),
      perUnit: c.perUnit,
      isTaxable: c.isTaxable,
    }));

  const channelSellingCosts: Record<string, CostRow[]> = {};
  for (const c of allSelling) {
    if (!c.channelId) continue;
    (channelSellingCosts[c.channelId] ??= []).push({
      id: Math.random().toString(36).slice(2),
      serverId: c.id,
      name: c.name,
      costType: c.costType as "FIXED" | "PERCENTAGE",
      value: String(c.value),
      perUnit: c.perUnit,
      isTaxable: c.isTaxable,
    });
  }

  const setComponents: SetComponentRow[] = (p.setComponents ?? []).map((sc) => ({
    id: Math.random().toString(36).slice(2),
    product: {
      id: sc.component.id,
      name: sc.component.name,
      sku: sc.component.sku,
      sellingPrice: "0",
      unitCost: null,
      unitOfMeasure: "EA",
      isSet: false,
      isCanonical: false,
      canonicalProductId: null,
    },
    quantity: String(sc.quantity),
    label: sc.label ?? undefined,
  }));

  const initialChannelPricings: Array<{ id: string; channelId: string }> = (
    p.channelPricings ?? []
  ).map((cp) => ({ id: cp.id, channelId: cp.channelId }));

  return {
    productType: p.productType as ProductType,
    form: {
      name: p.name,
      brand: p.brand ?? "",
      brandId: p.brandId ?? "",
      brandName: p.brandRef?.name ?? p.brand ?? "",
      spec: p.spec ?? "",
      sku: p.sku,
      modelName: p.modelName ?? "",
      unitOfMeasure: p.unitOfMeasure,
      taxType: p.taxType as "TAXABLE" | "TAX_FREE" | "ZERO_RATE",
      taxRate: p.taxRate ?? "0.1",
      listPrice: p.listPrice ?? p.sellingPrice,
      sellingPrice: p.sellingPrice,
      memo: p.memo ?? "",
      vatIncluded: false, // DB는 항상 세전 — 편집 시작 시점도 세전 표시
      categoryId: p.categoryId ?? "",
    },
    mapping: {
      supplierId: sp?.supplier?.id ?? "",
      supplierProductId: sp?.id ?? "",
      conversionRate: m?.conversionRate ?? "1",
      isProvisional: sp?.isProvisional ?? false,
    },
    incomingCosts,
    sellingCosts,
    channelSellingCosts,
    setComponents,
    pricingsByChannel: new Map(
      (p.channelPricings ?? []).map((cp) => [cp.channelId, String(cp.sellingPrice)]),
    ),
    initialMappingId: m?.id ?? null,
    initialSupplierProductId: sp?.id ?? null,
    initialConversionRate: m?.conversionRate ?? null,
    initialIncomingCostIds: incomingCosts.map((c) => c.serverId!).filter(Boolean),
    initialSellingCostIds: sellingCosts.map((c) => c.serverId!).filter(Boolean),
    initialChannelSellingCostIds: Object.fromEntries(
      Object.entries(channelSellingCosts).map(([k, v]) => [
        k,
        v.map((c) => c.serverId!).filter(Boolean),
      ]),
    ),
    initialChannelPricings,
    isBulk: p.isBulk ?? false,
    initialContainerSize: p.containerSize ?? "",
    bulkProductId: p.bulkProductId ?? null,
    imageUrl: p.imageUrl ?? null,
  };
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
  mode = "create",
  productId,
  initialData,
}: NewProductFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetCanonicalId = searchParams?.get("canonicalProductId") ?? "";
  const presetSupplierId = searchParams?.get("supplierId") ?? "";
  const presetSupplierProductId = searchParams?.get("supplierProductId") ?? "";
  const isEdit = mode === "edit" && !!initialData;
  // edit 모드: 초기값 1회 계산 (initialData ref가 동일하므로 stable)
  const editInitRef = useRef(isEdit ? buildEditInit(initialData) : null);
  const editInit = editInitRef.current;
  const effectiveLockProductType = lockProductType || isEdit;
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [brands, setBrands] = useState<BrandOption[]>(initialBrands);
  const [quickBrandOpen, setQuickBrandOpen] = useState(false);
  const [quickBrandDefaultName, setQuickBrandDefaultName] = useState("");
  // 벌크 상품 옵션 (Phase 9)
  const [bulkUsable, setBulkUsable] = useState(false);
  const [containerSize, setContainerSize] = useState(editInit?.initialContainerSize ?? "");
  const [newBulkName, setNewBulkName] = useState("");
  const [newBulkUnit, setNewBulkUnit] = useState("mL");
  const bulkNameAutoSync = useRef(true);
  const [step, setStep] = useState<"type" | "form">(
    isEdit || defaultProductType || presetCanonicalId ? "form" : "type",
  );
  const [productType, setProductType] = useState<ProductType>(
    editInit?.productType ?? defaultProductType ?? "FINISHED",
  );

  const [form, setForm] = useState(
    editInit?.form ?? {
      name: "",
      brand: "",
      brandId: "",
      brandName: "",
      spec: "",
      sku: generateSku(),
      modelName: "",
      unitOfMeasure: "EA",
      taxType: "TAXABLE" as "TAXABLE" | "TAX_FREE" | "ZERO_RATE",
      taxRate: "0.1",
      listPrice: "0",
      sellingPrice: "0",
      memo: "",
      vatIncluded: false,
      categoryId: "",
    },
  );

  // 변형(variant) 연결 — URL `?canonicalProductId=<id>` 로 진입 시 자동 채움
  const [canonicalProductId] = useState<string>(
    isEdit ? initialData!.product.canonicalProductId ?? "" : presetCanonicalId,
  );

  const [mapping, setMapping] = useState(
    editInit?.mapping ?? {
      supplierId: presetSupplierId,
      supplierProductId: presetSupplierProductId,
      conversionRate: "1",
      isProvisional: false,
    },
  );
  const [supplierProducts, setSupplierProducts] = useState<SupplierProduct[]>(
    () => initialData?.supplierProducts ?? [],
  );
  const [loadingSupplierProducts, setLoadingSupplierProducts] = useState(false);

  const [quickSupplierOpen, setQuickSupplierOpen] = useState(false);
  const [quickSupplierDefaultName, setQuickSupplierDefaultName] = useState("");
  const [quickSupplierProductOpen, setQuickSupplierProductOpen] = useState(false);
  const [quickSupplierProductDefaultName, setQuickSupplierProductDefaultName] = useState("");

  const [incomingCosts, setIncomingCosts] = useState<CostRow[]>(
    editInit?.incomingCosts ?? [],
  );
  const [sellingCosts, setSellingCosts] = useState<CostRow[]>(
    editInit?.sellingCosts ?? [],
  );
  // 채널별 전용 판매비용 (key: channelId)
  const [channelSellingCosts, setChannelSellingCosts] = useState<Record<string, CostRow[]>>(
    editInit?.channelSellingCosts ?? {},
  );
  const [avgShippingCost, setAvgShippingCost] = useState<number | null>(null);
  const [avgShippingIsTaxable, setAvgShippingIsTaxable] = useState(false);
  const [avgIncomingCost, setAvgIncomingCost] = useState<number | null>(null);

  const [baseCost, setBaseCost] = useState("");
  const [targetMargin, setTargetMargin] = useState("20");
  const [targetMarginAmount, setTargetMarginAmount] = useState("");
  const [manualVatPrice, setManualVatPrice] = useState("");
  const [lastEdited, setLastEdited] = useState<"rate" | "amount" | "price" | null>(null);

  const [cardFeeRate, setCardFeeRate] = useState<number>(0);

  const [channelPrices, setChannelPrices] = useState<ChannelPriceRow[]>(() =>
    channels.map((ch) => {
      const existingPrice = editInit?.pricingsByChannel.get(ch.id);
      return {
        channelId: ch.id,
        price: existingPrice ?? "",
        enabled: !!existingPrice,
        lastEdited: existingPrice ? "price" : null,
        targetRate: "",
        targetAmount: "",
      };
    })
  );

  const [setComponents, setSetComponents] = useState<SetComponentRow[]>(
    editInit?.setComponents && editInit.setComponents.length > 0
      ? editInit.setComponents
      : [emptySetComponent()],
  );
  const [assemblyCosts, setAssemblyCosts] = useState<CostRow[]>([]);
  const [parentProducts, setParentProducts] = useState<ParentProductRow[]>([]);

  // ── 변형 등록 (멀티 변형 모드) ──
  type VariantRow = {
    id: string;
    name: string;
    sku: string;
    components: SetComponentRow[]; // 변형별 구성품 (기본은 위 setComponents 복사)
    initialQty: string;
    initialDate: Date;
    initialLabor: string;
  };
  const [variants, setVariants] = useState<VariantRow[]>([]);

  // 메인의 setComponents가 바뀌면 변형들의 components를 동기화
  // - 새 행 추가 → 변형에도 추가
  // - 행 삭제 → 변형에서도 같은 mainId 행 삭제
  // - 행 product 변경 → override=false인 변형 행만 갱신
  // - 라벨/수량 변경 → 항상 변형에 반영
  useEffect(() => {
    setVariants((prev) =>
      prev.map((v) => {
        const newComps: SetComponentRow[] = setComponents.map((mainRow) => {
          const existing = v.components.find((c) => c.mainId === mainRow.id);
          if (existing?.override) {
            return {
              ...existing,
              label: mainRow.label,
              quantity: mainRow.quantity,
            };
          }
          return {
            id: existing?.id ?? Math.random().toString(36).slice(2),
            mainId: mainRow.id,
            product: mainRow.product,
            quantity: mainRow.quantity,
            label: mainRow.label,
            override: false,
          };
        });
        return { ...v, components: newComps };
      }),
    );
  }, [setComponents]);

  // ── 조립 템플릿/프리셋 ──
  type TemplateSlot = {
    id: string;
    label: string;
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

  const stepItems = useMemo(() => [
    { id: 1, anchor: "np-step-1", label: "상품 정보" },
    { id: 2, anchor: "np-step-2", label: "공급원 & 원가" },
    { id: 3, anchor: "np-step-3", label: "가격 설정" },
    ...(channels.length > 0 ? [{ id: 4, anchor: "np-step-4", label: "채널별 가격" }] : []),
  ], [channels.length]);

  const getViewport = useCallback((): HTMLElement | null => {
    return scrollAreaRef.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]') ?? null;
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
      taxRate: "0.1",
      listPrice: "0",
      sellingPrice: "0",
      memo: "",
      vatIncluded: false,
      categoryId: "",
    });
    setMapping({ supplierId: "", supplierProductId: "", conversionRate: "1", isProvisional: false });
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
  }, [channels]);

  useEffect(() => {
    fetch("/api/card-fee-rate")
      .then((r) => r.json())
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
      channelPrices.some((r) => r.enabled || r.price) ||
      baseCost !== "" ||
      manualVatPrice !== "" ||
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
        const listRes = await fetch("/api/assembly-templates");
        if (!listRes.ok) return;
        const list = (await listRes.json()) as Array<{ id: string; isActive: boolean }>;
        const actives = list.filter((t) => t.isActive);
        const details = await Promise.all(
          actives.map(async (t) => {
            const r = await fetch(`/api/assembly-templates/${t.id}`);
            return r.ok ? (await r.json() as TemplateDetail) : null;
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
      const res = await fetch(`/api/assembly-templates/${templateId}/presets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: savePresetName,
          isActive: true,
          items,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(typeof err.error === "string" ? err.error : "저장 실패");
        return;
      }
      const newPreset = (await res.json()) as TemplatePreset;
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
    const res = await fetch(`/api/supplier-products?supplierId=${supplierId}`);
    if (res.ok) setSupplierProducts(await res.json());
    setLoadingSupplierProducts(false);
  }, []);

  const fetchIncomingCosts = useCallback(async (supplierProductId: string) => {
    const [costsRes, shippingRes, avgCostRes] = await Promise.all([
      fetch(`/api/supplier-products/${supplierProductId}/costs`),
      fetch(`/api/supplier-products/${supplierProductId}/avg-shipping`),
      fetch(`/api/supplier-products/${supplierProductId}/avg-cost`),
    ]);
    if (costsRes.ok) {
      const data = await costsRes.json();
      setIncomingCosts(data.map((c: SupplierProductCostItem) => ({
        id: Math.random().toString(36).slice(2),
        serverId: c.id,
        name: c.name,
        costType: c.costType,
        value: c.value.toString(),
        perUnit: c.perUnit,
        isTaxable: c.isTaxable,
      })));
    }
    if (shippingRes.ok) {
      const data = await shippingRes.json();
      setAvgShippingCost(data.avgShippingCost ?? null);
      setAvgShippingIsTaxable(data.avgShippingIsTaxable ?? false);
    } else {
      setAvgShippingCost(null);
      setAvgShippingIsTaxable(false);
    }
    if (avgCostRes.ok) {
      const data = await avgCostRes.json();
      setAvgIncomingCost(data.avgUnitCost ?? null);
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
    const qty = parseFloat(row.quantity || "1");
    return sum + cost * qty;
  }, 0);

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
    const taxRate = (form.taxType === "TAXABLE" || form.taxType === "ZERO_RATE") ? parseFloat(form.taxRate || "0.1") : 0;

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
      cardFeeAmount = vatPrice * cardFeeRate;
      marginAmount = sellingPrice - baseTotalCost - cardFeeAmount;
      marginRate = sellingPrice > 0 ? (marginAmount / sellingPrice) * 100 : 0;
    } else if (lastEdited === "amount") {
      const mAmount = parseFloat(targetMarginAmount || "0");
      const divisor = 1 - sellingPct - cardFeeRatio;
      sellingPrice = divisor > 0 ? (baseTotalCost + mAmount) / divisor : 0;
      vatPrice = Math.round(sellingPrice * (1 + taxRate));
      cardFeeAmount = vatPrice * cardFeeRate;
      marginAmount = sellingPrice - baseTotalCost - cardFeeAmount;
      marginRate = sellingPrice > 0 ? (marginAmount / sellingPrice) * 100 : 0;
    } else {
      vatPrice = parseFloat(manualVatPrice || "0");
      sellingPrice = taxRate > 0 ? vatPrice / (1 + taxRate) : vatPrice;
      cardFeeAmount = vatPrice * cardFeeRate;
      marginAmount = sellingPrice - baseTotalCost - cardFeeAmount;
      marginRate = sellingPrice > 0 ? (marginAmount / sellingPrice) * 100 : 0;
    }

    const totalCost = baseTotalCost + cardFeeAmount;

    return { unitCost, incomingTotal, sellingFixed, cardFeeAmount, totalCost, sellingPrice: Math.round(sellingPrice), vatPrice: Math.round(vatPrice), marginRate, marginAmount, avgShippingNet };
  })();

  const calcSetPrice = (() => {
    const baseTotalCost = componentsTotalCost + assemblyFixedCost;
    const taxRate = (form.taxType === "TAXABLE" || form.taxType === "ZERO_RATE") ? parseFloat(form.taxRate || "0.1") : 0;

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
      cardFeeAmount = vatPrice * cardFeeRate;
      marginAmount = sellingPrice - baseTotalCost - cardFeeAmount;
      marginRate = sellingPrice > 0 ? (marginAmount / sellingPrice) * 100 : 0;
    } else if (lastEdited === "amount") {
      const mAmount = parseFloat(targetMarginAmount || "0");
      const divisor = 1 - sellingPct - cardFeeRatio;
      sellingPrice = divisor > 0 ? (baseTotalCost + mAmount) / divisor : 0;
      vatPrice = Math.round(sellingPrice * (1 + taxRate));
      cardFeeAmount = vatPrice * cardFeeRate;
      marginAmount = sellingPrice - baseTotalCost - cardFeeAmount;
      marginRate = sellingPrice > 0 ? (marginAmount / sellingPrice) * 100 : 0;
    } else {
      vatPrice = parseFloat(manualVatPrice || "0");
      sellingPrice = taxRate > 0 ? vatPrice / (1 + taxRate) : vatPrice;
      cardFeeAmount = vatPrice * cardFeeRate;
      marginAmount = sellingPrice - baseTotalCost - cardFeeAmount;
      marginRate = sellingPrice > 0 ? (marginAmount / sellingPrice) * 100 : 0;
    }

    const totalCost = baseTotalCost + cardFeeAmount;

    return { totalCost, cardFeeAmount, sellingPrice: Math.round(sellingPrice), vatPrice: Math.round(vatPrice), marginRate, marginAmount };
  })();

  // DB는 항상 세전. vatIncluded 표시 중이면 역산.
  const toNetPrice = (v: string) => {
    const price = parseFloat(v || "0");
    const rate = parseFloat(form.taxRate || "0");
    if (form.vatIncluded && (form.taxType === "TAXABLE" || form.taxType === "ZERO_RATE") && rate > 0) {
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

    // ── EDIT 모드: PUT + diff ──
    if (isEdit && productId && editInit) {
      setSubmitting(true);
      try {
        const result = await submitEdit({
          productId,
          productType,
          form,
          toNetPrice,
          mapping,
          initialMappingId: editInit.initialMappingId,
          initialSupplierProductId: editInit.initialSupplierProductId,
          initialConversionRate: editInit.initialConversionRate,
          incomingCosts,
          initialIncomingCostIds: editInit.initialIncomingCostIds,
          sellingCosts,
          initialSellingCostIds: editInit.initialSellingCostIds,
          channelSellingCosts,
          initialChannelSellingCostIds: editInit.initialChannelSellingCostIds,
          channelPrices,
          initialChannelPricings: editInit.initialChannelPricings,
          setComponents,
          isBulk: editInit.isBulk,
          containerSize,
          bulkProductId: editInit.bulkProductId,
          imageUrl: editInit.imageUrl,
        });
        if (result.ok) {
          toast.success("저장되었습니다");
        } else {
          toast.warning(`저장됐으나 일부 실패: ${result.errors.join(", ")}`, {
            duration: 8000,
          });
        }
        router.push(`/products/${productId}`);
        router.refresh();
      } catch {
        toast.error("저장 중 오류가 발생했습니다");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // 변형이 있으면 묶음(canonical+variants) 모드로 전환
    if (productType === "ASSEMBLED" && variants.length > 0) {
      if (variants.some((v) => !v.name.trim() || !v.sku.trim())) {
        toast.error("모든 변형의 이름과 SKU를 입력해주세요");
        return;
      }
      if (variants.some((v) => v.components.some((c) => !c.product))) {
        toast.error("모든 변형의 구성 상품을 선택해주세요");
        return;
      }
      setSubmitting(true);
      try {
        const res = await fetch("/api/products/grouped", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            canonicalName: form.name,
            canonicalSku: form.sku,
            productType: "ASSEMBLED",
            unitOfMeasure: form.unitOfMeasure,
            taxType: form.taxType,
            taxRate: form.taxRate,
            listPrice: getSubmitListPrice(),
            sellingPrice: getSubmitPrice(),
            brand: form.brandName || form.brand || undefined,
            brandId: form.brandId || undefined,
            modelName: form.modelName || undefined,
            spec: form.spec || undefined,
            description: undefined,
            memo: form.memo || undefined,
            variants: variants.map((v) => ({
              name: v.name,
              sku: v.sku,
              sellingPrice: undefined,
              listPrice: undefined,
              components: v.components
                .filter((c) => c.product)
                .map((c) => ({
                  componentId: c.product!.id,
                  quantity: c.quantity,
                  label: c.label ?? null,
                })),
              initialAssemblyQty: v.initialQty || undefined,
              initialAssemblyDate: v.initialDate.toISOString(),
              initialAssemblyLaborCost: v.initialLabor || undefined,
            })),
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          toast.error(typeof err.error === "string" ? err.error : "묶음 등록 실패");
          return;
        }
        toast.success(`대표 + 변형 ${variants.length}개가 등록되었습니다`);
        router.push("/products");
        return;
      } finally {
        setSubmitting(false);
      }
    }

    setSubmitting(true);
    const errors: string[] = [];
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          productType,
          listPrice: getSubmitListPrice(),
          sellingPrice: getSubmitPrice(),
          canonicalProductId: canonicalProductId || null,
          containerSize: bulkUsable ? containerSize || null : null,
          createBulk:
            bulkUsable && newBulkName.trim()
              ? { name: newBulkName.trim(), unitOfMeasure: newBulkUnit }
              : null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(typeof err.error === "string" ? err.error : "저장에 실패했습니다");
        return;
      }

      const product = await res.json();
      const productId = product.id;

      if (productType === "FINISHED" || productType === "PARTS") {
        if (mapping.supplierId && mapping.supplierProductId) {
          const mapRes = await fetch("/api/products/mapping", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              productId,
              supplierProductId: mapping.supplierProductId,
              conversionRate: mapping.conversionRate || "1",
            }),
          });
          if (!mapRes.ok) errors.push("거래처 매핑");

          const existingCosts = incomingCosts.filter((c) => c.serverId);
          for (const cost of existingCosts) {
            const r = await fetch(`/api/supplier-products/${mapping.supplierProductId}/costs?costId=${cost.serverId}`, { method: "DELETE" });
            if (!r.ok) errors.push(`기존 입고비용 삭제 (${cost.name || cost.serverId})`);
          }
          for (const cost of incomingCosts.filter((c) => c.name && c.value)) {
            const r = await fetch(`/api/supplier-products/${mapping.supplierProductId}/costs`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: cost.name, costType: cost.costType, value: cost.value, perUnit: cost.perUnit }),
            });
            if (!r.ok) errors.push(`입고비용 등록 (${cost.name})`);
          }
        }

        for (const cost of sellingCosts.filter((c) => c.name && c.value)) {
          const r = await fetch(`/api/products/${productId}/costs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: cost.name,
              costType: cost.costType,
              value: cost.value,
              perUnit: cost.perUnit,
              isTaxable: cost.isTaxable,
              channelId: null,
            }),
          });
          if (!r.ok) errors.push(`판매비용 등록 (${cost.name})`);
        }

        for (const row of channelPrices.filter((r) => r.enabled && r.price)) {
          const r = await fetch(`/api/products/${productId}/channel-pricing`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channelId: row.channelId, sellingPrice: row.price }),
          });
          if (!r.ok) {
            const ch = channels.find((c) => c.id === row.channelId);
            errors.push(`채널 가격 등록 (${ch?.name ?? row.channelId})`);
          }
        }

        // 채널 전용 판매비용
        for (const row of channelPrices.filter((r) => r.enabled)) {
          const costs = channelSellingCosts[row.channelId] ?? [];
          for (const cost of costs.filter((c) => c.name && c.value)) {
            const r = await fetch(`/api/products/${productId}/costs`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: cost.name,
                costType: cost.costType,
                value: cost.value,
                perUnit: cost.perUnit,
                isTaxable: cost.isTaxable,
                channelId: row.channelId,
              }),
            });
            if (!r.ok) {
              const ch = channels.find((c) => c.id === row.channelId);
              errors.push(`채널 판매비용 등록 (${ch?.name ?? row.channelId} · ${cost.name})`);
            }
          }
        }

        if (productType === "PARTS" && parentProducts.length > 0) {
          for (const row of parentProducts.filter((r) => r.product)) {
            const parentRes = await fetch(`/api/products/${row.product!.id}?include=setComponents`);
            let existingComponents: { componentId: string; quantity: string; label: string | null }[] = [];
            if (parentRes.ok) {
              const parentData = await parentRes.json();
              existingComponents = (parentData.setComponents || []).map((sc: { componentId: string; quantity: string; label?: string | null }) => ({
                componentId: sc.componentId,
                quantity: sc.quantity,
                label: sc.label ?? null,
              }));
            } else {
              errors.push(`상위 상품 조회 (${row.product!.name})`);
              continue;
            }
            const alreadyIn = existingComponents.some((c) => c.componentId === productId);
            if (!alreadyIn) {
              const r = await fetch("/api/products/sets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  productId: row.product!.id,
                  components: [...existingComponents, { componentId: productId, quantity: row.quantity, label: null }],
                }),
              });
              if (!r.ok) errors.push(`상위 상품 연결 (${row.product!.name})`);
            }
          }
        }
      } else {
        const validComponents = setComponents.filter((c) => c.product);
        if (validComponents.length > 0) {
          const r = await fetch("/api/products/sets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              productId,
              components: validComponents.map((c) => ({ componentId: c.product!.id, quantity: c.quantity, label: c.label ?? null })),
            }),
          });
          if (!r.ok) errors.push("구성 상품 등록");
        }

        if (productType === "ASSEMBLED") {
          for (const cost of assemblyCosts.filter((c) => c.name && c.value)) {
            const r = await fetch(`/api/products/${productId}/costs`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: cost.name, costType: cost.costType, value: cost.value, perUnit: cost.perUnit }),
            });
            if (!r.ok) errors.push(`조립비용 등록 (${cost.name})`);
          }
        }

        for (const row of channelPrices.filter((r) => r.enabled && r.price)) {
          const r = await fetch(`/api/products/${productId}/channel-pricing`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channelId: row.channelId, sellingPrice: row.price }),
          });
          if (!r.ok) {
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
    const taxRate = (form.taxType === "TAXABLE" || form.taxType === "ZERO_RATE") ? parseFloat(form.taxRate || "0.1") : 0;
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
        <Card size="sm" className="py-0 gap-0">
        {/* ── 원가 요약 ── */}
        <table className="w-full text-[12px]">
          <tbody className="[&_tr]:border-b [&_tr]:border-border">
            {isSetOrAssembled ? (
              <>
                <tr>
                  <td className="px-3 py-2 text-muted-foreground">구성품 원가</td>
                  <td className="px-3 py-2 text-right tabular-nums">₩{Math.round(componentsTotalCost).toLocaleString("ko-KR")}</td>
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
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={formatComma(baseCost)}
                        onChange={(e) => setBaseCost(parseComma(e.target.value))}
                        onFocus={(e) => e.currentTarget.select()}
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
                  <td className="px-3 py-2 text-muted-foreground">입고비용</td>
                  <td className="px-3 py-2 text-right tabular-nums">₩{Math.round(calcPrice.incomingTotal).toLocaleString("ko-KR")}</td>
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
              <TooltipProvider delay={100}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button type="button" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="원가 계산식 보기">
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    }
                  />
                  <TooltipContent side="top" className="max-w-[280px] text-[11px] leading-relaxed">
                    {isSetOrAssembled ? (
                      <div className="space-y-1">
                        <div className="font-semibold">총원가 계산식</div>
                        <div>= 구성품 원가{productType === "ASSEMBLED" ? " + 조립비용" : ""}{cardFeeRate > 0 && " + 카드수수료"}</div>
                        <div className="pt-1 border-t border-border mt-1 space-y-0.5 text-[10px] text-muted-foreground">
                          <div>• 구성품 원가 = Σ(구성상품 원가 × 수량)</div>
                          {productType === "ASSEMBLED" && <div>• 조립비용(과세) ÷ 1.1 로 공급가액 환산</div>}
                          {cardFeeRate > 0 && <div>• 카드수수료 = 판매가(VAT포함) × {(cardFeeRate * 100).toFixed(2)}%</div>}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="font-semibold">총원가 계산식</div>
                        <div>= 원가 + 입고비용 + 판매비용{cardFeeRate > 0 && " + 카드수수료"}</div>
                        <div className="pt-1 border-t border-border mt-1 space-y-0.5 text-[10px] text-muted-foreground">
                          <div>• 원가 = 공급단가 ÷ 환산비율</div>
                          <div>• 과세 비용은 ÷ 1.1 로 공급가액 환산 후 합산</div>
                          <div>• PERCENTAGE 입고비용은 원가의 %로 적용</div>
                          {cardFeeRate > 0 && <div>• 카드수수료 = 판매가(VAT포함) × {(cardFeeRate * 100).toFixed(2)}%</div>}
                        </div>
                      </div>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
                </span>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-[13px] font-semibold">₩{Math.round(totalCost).toLocaleString("ko-KR")}</td>
            </tr>
          </tfoot>
        </table>

        <CardContent className="py-4 space-y-3 border-t border-border">
        {/* ── 마진율 ── */}
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground shrink-0 w-14">마진율</span>
          <div className="relative flex-1">
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              value={lastEdited === "rate" ? targetMargin : marginRate.toFixed(1)}
              onChange={(e) => { setTargetMargin(e.target.value); setLastEdited("rate"); }}
              onFocus={(e) => e.currentTarget.select()}
              className={`h-9 pr-6 text-right text-[13px] ${marginAmount < 0 ? "text-red-400" : ""}`}
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">%</span>
          </div>
        </div>

        {/* ── 마진금액 ── */}
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground shrink-0 w-14">마진금액</span>
          <Input
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={formatComma(lastEdited === "amount" ? targetMarginAmount : (marginAmount !== 0 ? Math.round(marginAmount).toString() : ""))}
            onChange={(e) => { setTargetMarginAmount(parseComma(e.target.value)); setLastEdited("amount"); }}
            onFocus={(e) => e.currentTarget.select()}
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
          <div className="px-2 py-3 text-center border-r border-border">
            <div className="text-[10px] text-muted-foreground mb-1">공급가액</div>
            <div className="text-[15px] font-bold tabular-nums">
              {supplyPrice > 0 ? `₩${supplyPrice.toLocaleString("ko-KR")}` : "—"}
            </div>
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
            <Input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={formatComma(lastEdited === "price" ? manualVatPrice : (vatPrice > 0 ? vatPrice.toString() : ""))}
              onChange={(e) => { setManualVatPrice(parseComma(e.target.value)); setLastEdited("price"); }}
              onFocus={(e) => e.currentTarget.select()}
              className="h-7 text-center text-[15px] font-bold border-0 bg-transparent focus-visible:ring-1 px-0"
            />
          </div>
        </div>
        </CardContent></Card>
      </section>
    );
  };

  // ── 채널별 가격 ──
  const ChannelPricingPanel = () => {
    const taxRate = (form.taxType === "TAXABLE" || form.taxType === "ZERO_RATE") ? parseFloat(form.taxRate || "0.1") : 0;
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
        <Card size="sm"><CardContent className="space-y-2">
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
                  <Checkbox
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
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={row.lastEdited === "rate" ? row.targetRate : realMarginRate.toFixed(1)}
                          onChange={(e) => updateRow(idx, { targetRate: e.target.value, lastEdited: "rate" })}
                          onFocus={(e) => e.currentTarget.select()}
                          className="h-8 pr-6 text-right text-[12px]"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">%</span>
                      </div>
                    </div>
                    {/* 마진금액 */}
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground w-14 shrink-0">마진금액</span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={formatComma(row.lastEdited === "amount" ? row.targetAmount : (realMargin > 0 ? Math.round(realMargin).toString() : ""))}
                        onChange={(e) => updateRow(idx, { targetAmount: parseComma(e.target.value), lastEdited: "amount" })}
                        onFocus={(e) => e.currentTarget.select()}
                        className="h-8 flex-1 text-right text-[12px]"
                      />
                    </div>
                    {/* 판매가 */}
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground w-14 shrink-0">판매가</span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder={offlineVatPrice > 0 ? formatComma(String(offlineVatPrice)) : "0"}
                        value={formatComma(row.lastEdited === "price" || row.lastEdited === null ? row.price : String(channelVatPrice))}
                        onChange={(e) => updateRow(idx, { price: parseComma(e.target.value), lastEdited: "price" })}
                        onFocus={(e) => e.currentTarget.select()}
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
        </CardContent></Card>
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
                    if (effectiveLockProductType) {
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
              <h1 className="text-base font-medium flex-1">{isEdit ? "상품 수정" : "새 상품 등록"}</h1>
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
          <ScrollArea ref={scrollAreaRef} className="flex-1 min-h-0">
            {step === "type" ? (
              <TypeSelectScreen onSelect={handleSelectType} />
            ) : (
              <fieldset disabled={submitting} className="contents">

                {/* ── 입력 폼 ── */}
                <div className="px-5 py-5 space-y-5">

                  <GroupHeader step="STEP 1" title="상품 정보" id="np-step-1" />

                  {/* 기본 정보 */}
                  <section>
                    <SectionTitle title="기본 정보" />
                    <Card size="sm"><CardContent className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="상품명" required>
                        <Input
                          autoFocus
                          placeholder="상품명을 입력하세요"
                          value={form.name}
                          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                          className="h-9"
                        />
                      </Field>
                      <Field label="규격">
                        <Input
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
                          <Input
                            placeholder="SKU"
                            value={form.sku}
                            onChange={(e) => {
                              setSkuManuallyEdited(true);
                              setForm((prev) => ({ ...prev, sku: e.target.value }));
                            }}
                            className="h-9 flex-1"
                          />
                          <Button
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
                          </Button>
                        </div>
                      </Field>
                    </div>

                    <Field label="단위">
                      <Select value={form.unitOfMeasure} onValueChange={(v) => setForm((prev) => ({ ...prev, unitOfMeasure: v ?? "EA" }))}>
                        <SelectTrigger className="!h-9 w-full">
                          <span>{UNITS_OF_MEASURE.find((u) => u.value === form.unitOfMeasure)?.label} ({form.unitOfMeasure})</span>
                        </SelectTrigger>
                        <SelectContent>
                          {UNITS_OF_MEASURE.map((u) => (
                            <SelectItem key={u.value} value={u.value}>{u.label} ({u.value})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="모델명">
                        <Input
                          placeholder="모델명 (선택)"
                          value={form.modelName}
                          onChange={(e) => setForm((prev) => ({ ...prev, modelName: e.target.value }))}
                          className="h-9"
                        />
                      </Field>
                      {categories.length > 0 && (
                        <Field label="카테고리">
                          <Select
                            value={form.categoryId || "__none__"}
                            onValueChange={(v) =>
                              setForm((prev) => ({ ...prev, categoryId: !v || v === "__none__" ? "" : v }))
                            }
                          >
                            <SelectTrigger className="!h-9 w-full">
                              <SelectValue>
                                {(() => {
                                  if (!form.categoryId) return "없음";
                                  for (const cat of categories) {
                                    if (cat.id === form.categoryId) return cat.name;
                                    const child = cat.children.find((c) => c.id === form.categoryId);
                                    if (child) return child.name;
                                  }
                                  return "카테고리 선택";
                                })()}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">없음</SelectItem>
                              {categories.map((cat) => (
                                cat.children.length > 0 ? (
                                  <SelectGroup key={cat.id}>
                                    <SelectLabel>{cat.name}</SelectLabel>
                                    {cat.children.map((child) => (
                                      <SelectItem key={child.id} value={child.id}>
                                        {child.name}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                ) : (
                                  <SelectItem key={cat.id} value={cat.id}>
                                    {cat.name}
                                  </SelectItem>
                                )
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      )}
                    </div>

                    {(productType === "FINISHED" || productType === "PARTS") && !isEdit && (
                      <div className="space-y-2 rounded-md border border-dashed border-border p-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
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
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="예: 4000"
                                  value={containerSize}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    if (v === "" || /^[0-9]*\.?[0-9]*$/.test(v)) setContainerSize(v);
                                  }}
                                  onFocus={(e) => e.currentTarget.select()}
                                  className="h-9 flex-1"
                                />
                                <Select value={newBulkUnit} onValueChange={(v) => setNewBulkUnit(v ?? "mL")}>
                                  <SelectTrigger className="!h-9 w-20">
                                    <span>{newBulkUnit}</span>
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="mL">mL</SelectItem>
                                    <SelectItem value="L">L</SelectItem>
                                    <SelectItem value="g">g</SelectItem>
                                    <SelectItem value="kg">kg</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </Field>
                            <Field label="벌크명">
                              <Input
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
                              taxType: prev.taxType === "ZERO_RATE" ? "TAXABLE" : "ZERO_RATE",
                            }))
                          }
                          className={cn(
                            "px-2 h-6 rounded text-[11px] border transition-colors",
                            form.taxType === "ZERO_RATE"
                              ? "bg-primary/10 border-primary/40 text-primary"
                              : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                          )}
                        >
                          영세율 가능
                        </button>
                      </div>
                    </Field>

                    <Field label="메모">
                      <Textarea
                        placeholder="메모 (선택)"
                        value={form.memo}
                        onChange={(e) => setForm((prev) => ({ ...prev, memo: e.target.value }))}
                        className="min-h-[60px] resize-none text-[13px]"
                      />
                    </Field>
                    </CardContent></Card>
                  </section>

                  {/* 변형 추가 인라인 진입 시 대표 연결 안내 배너 */}
                  {presetCanonicalId && canonicalProductId && (
                    <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[12px] text-foreground">
                      <span className="text-muted-foreground">대표 상품 변형으로 등록: </span>
                      <span className="font-medium">
                        {existingProducts.find((p) => p.id === canonicalProductId)?.name ?? "선택된 대표"}
                      </span>
                    </div>
                  )}

                  <GroupHeader step="STEP 2" title="공급원 & 원가" id="np-step-2" />

                  {/* 거래처 매핑 */}
                  {(productType === "FINISHED" || productType === "PARTS") && (
                    <section>
                      <SectionTitle
                        title="거래처 매핑"
                        badge={<span className="text-[11px] text-muted-foreground">선택사항</span>}
                      />
                      <Card size="sm"><CardContent className="space-y-3">
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
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={mapping.isProvisional}
                            onCheckedChange={(checked) => setMapping((prev) => ({ ...prev, isProvisional: !!checked }))}
                          />
                          <span className="text-[13px] text-muted-foreground">임시 등록 <span className="text-[11px]">(실제 입고 전 어림잡은 정보)</span></span>
                        </label>
                      )}

                      {mapping.supplierId && (
                        <Field label="공급상품">
                          <SupplierProductCombobox
                            supplierProducts={supplierProducts}
                            value={mapping.supplierProductId}
                            onChange={(sp) => {
                              setMapping((prev) => ({ ...prev, supplierProductId: sp.id }));
                              fetchIncomingCosts(sp.id);
                            }}
                            onCreateNew={(name) => {
                              setQuickSupplierProductDefaultName(name);
                              setQuickSupplierProductOpen(true);
                            }}
                            disabled={loadingSupplierProducts}
                            placeholder={loadingSupplierProducts ? "불러오는 중..." : "공급상품 선택..."}
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
                            <Input
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
                              onFocus={(e) => e.currentTarget.select()}
                              className="h-9 w-28"
                            />
                            <p className="text-[12px] text-muted-foreground">공급상품 1개 → 판매상품 <span className="text-foreground font-medium">{mapping.conversionRate || "1"}</span>개</p>
                          </div>
                        </Field>
                        );
                      })()}
                      </CardContent>
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
                      </Card>
                    </section>
                  )}

                  {/* 상위 상품 연결 (부속) */}
                  {productType === "PARTS" && !isEdit && (
                    <section>
                      <SectionTitle
                        title="상위 상품 연결"
                        badge={<span className="text-[11px] text-muted-foreground">선택사항</span>}
                      />
                      <Card size="sm" className="py-0">
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
                                <Input
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
                      </Card>
                    </section>
                  )}

                  {/* 조립 템플릿/프리셋 — ASSEMBLED일 때만 */}
                  {productType === "ASSEMBLED" && templates.length > 0 && (
                    <section>
                      <SectionTitle
                        title="조립 템플릿"
                        badge={<span className="text-[11px] text-muted-foreground">선택사항</span>}
                      />
                      <Card size="sm"><CardContent className="grid grid-cols-2 gap-3">
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
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!templateId}
                              onClick={() => setSavePresetOpen(true)}
                              className="shrink-0 h-9"
                            >
                              프리셋으로 저장
                            </Button>
                          </div>
                        </div>
                      </CardContent></Card>
                    </section>
                  )}

                  {/* 구성 상품 (세트/조립) */}
                  {isSetOrAssembled && (() => {
                    const showLabel = productType === "ASSEMBLED";
                    const colCount = showLabel ? 5 : 4;
                    return (
                    <section>
                      <SectionTitle title="구성 상품" />
                      <Card size="sm" className="py-0">
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
                                    <input
                                      value={row.label ?? ""}
                                      onChange={(e) => setSetComponents((prev) => prev.map((r, i) => i === idx ? { ...r, label: e.target.value } : r))}
                                      placeholder="예: 모터"
                                      className="w-full h-7 bg-transparent text-[12px] px-2 outline-none focus:bg-muted rounded"
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
                                  <Input
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
                      </Card>
                    </section>
                    );
                  })()}

                  {/* 변형 등록 (멀티 변형 모드) — ASSEMBLED 일 때만, edit 모드에서는 숨김 */}
                  {productType === "ASSEMBLED" && !isEdit && (
                    <section>
                      <SectionTitle
                        title="변형 등록"
                        badge={
                          <span className="text-[11px] text-muted-foreground">
                            선택사항 — 추가 시 위 상품이 대표가 되고 변형들이 함께 등록됩니다
                          </span>
                        }
                      />
                      <Card size="sm"><CardContent className="space-y-3">
                      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground leading-relaxed">
                        같은 구성이지만 일부 부품만 다른 상품을 함께 등록합니다.
                        <ul className="mt-1 ml-4 list-disc space-y-0.5">
                          <li>대표 상품은 고객 노출용 그룹 헤더 — 재고 없음</li>
                          <li>변형 상품은 실제 재고·로트 단위</li>
                          <li>위 구성을 자동 상속하며, 슬롯의 ● 표시는 직접 수정된 항목입니다</li>
                        </ul>
                      </div>
                      <div className="space-y-3">
                        {variants.length === 0 ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            onClick={() => {
                              const idx = variants.length + 1;
                              setVariants([
                                {
                                  id: Math.random().toString(36).slice(2),
                                  name: form.name ? `${form.name} 변형${idx}` : "",
                                  sku: form.sku ? `${form.sku}-V${idx}` : "",
                                  components: setComponents.map((c) => ({
                                    ...c,
                                    id: Math.random().toString(36).slice(2),
                                    mainId: c.id,
                                    override: false,
                                  })),
                                  initialQty: "0",
                                  initialDate: new Date(),
                                  initialLabor: "",
                                },
                              ]);
                            }}
                          >
                            <Plus data-icon="inline-start" />
                            변형 추가하기 (V벨트 사이즈만 다른 묶음 등록 시)
                          </Button>
                        ) : (
                          <>
                            {variants.map((v, vidx) => (
                              <div
                                key={v.id}
                                className="border border-border rounded-md p-3 space-y-2 bg-muted/10"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-semibold">변형 {vidx + 1}</span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setVariants((prev) => prev.filter((x) => x.id !== v.id))
                                    }
                                    className="text-muted-foreground hover:text-red-400 p-1"
                                  >
                                    <X className="size-3.5" />
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[11px] text-muted-foreground">이름 *</label>
                                    <Input
                                      value={v.name}
                                      onChange={(e) =>
                                        setVariants((prev) =>
                                          prev.map((x) =>
                                            x.id === v.id ? { ...x, name: e.target.value } : x,
                                          ),
                                        )
                                      }
                                      placeholder="예: 고압분무기 + V벨트 B-55"
                                      className="h-8 text-[13px]"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[11px] text-muted-foreground">SKU *</label>
                                    <Input
                                      value={v.sku}
                                      onChange={(e) =>
                                        setVariants((prev) =>
                                          prev.map((x) =>
                                            x.id === v.id ? { ...x, sku: e.target.value } : x,
                                          ),
                                        )
                                      }
                                      placeholder="예: PUMP-B55"
                                      className="h-8 text-[13px]"
                                    />
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[11px] text-muted-foreground">
                                    구성품 (위 상품 구성에서 복사됨, 슬롯별로 다르게 변경 가능)
                                  </label>
                                  <div className="border border-border rounded">
                                    <table className="w-full text-[12px]">
                                      <tbody>
                                        {v.components.map((c, cidx) => {
                                          const mainRow = setComponents[cidx];
                                          const changed =
                                            mainRow && mainRow.product?.id !== c.product?.id;
                                          return (
                                            <tr
                                              key={c.id}
                                              className="border-b border-border last:border-0"
                                            >
                                              <td className="px-2 py-1 text-muted-foreground w-[100px]">
                                                {c.label?.trim() ? (
                                                  <span className="text-foreground">{c.label}</span>
                                                ) : (
                                                  <span className="text-muted-foreground">
                                                    슬롯 #{cidx + 1}
                                                  </span>
                                                )}
                                                {changed && (
                                                  <span className="ml-1 text-[10px] text-primary">
                                                    ●
                                                  </span>
                                                )}
                                              </td>
                                              <td className="p-1">
                                                <ProductCombobox
                                                  products={existingProducts}
                                                  value={c.product?.id ?? ""}
                                                  onChange={(p) =>
                                                    setVariants((prev) =>
                                                      prev.map((x) => {
                                                        if (x.id !== v.id) return x;
                                                        const newComps = x.components.map((cc, i) =>
                                                          i === cidx
                                                            ? { ...cc, product: p, override: true }
                                                            : cc,
                                                        );
                                                        return { ...x, components: newComps };
                                                      }),
                                                    )
                                                  }
                                                  filterType="component"
                                                />
                                              </td>
                                              <td className="px-2 py-1 text-right text-muted-foreground w-[60px]">
                                                ×{c.quantity}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[11px] text-muted-foreground">
                                      초기 조립 수량
                                    </label>
                                    <Input
                                      type="text"
                                      inputMode="decimal"
                                      value={v.initialQty}
                                      onChange={(e) =>
                                        setVariants((prev) =>
                                          prev.map((x) =>
                                            x.id === v.id ? { ...x, initialQty: e.target.value } : x,
                                          ),
                                        )
                                      }
                                      onFocus={(e) => e.currentTarget.select()}
                                      className="h-8 text-[13px]"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[11px] text-muted-foreground">조립일</label>
                                    <Popover>
                                      <PopoverTrigger className="flex h-8 items-center rounded-lg border border-input bg-transparent px-2 text-[13px] hover:bg-accent/50">
                                        {format(v.initialDate, "yyyy-MM-dd", { locale: ko })}
                                      </PopoverTrigger>
                                      <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                          mode="single"
                                          selected={v.initialDate}
                                          onSelect={(d) =>
                                            d &&
                                            setVariants((prev) =>
                                              prev.map((x) =>
                                                x.id === v.id ? { ...x, initialDate: d } : x,
                                              ),
                                            )
                                          }
                                        />
                                      </PopoverContent>
                                    </Popover>
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[11px] text-muted-foreground">
                                      조립비 (총액)
                                    </label>
                                    <Input
                                      type="text"
                                      inputMode="numeric"
                                      value={formatComma(v.initialLabor)}
                                      onChange={(e) =>
                                        setVariants((prev) =>
                                          prev.map((x) =>
                                            x.id === v.id
                                              ? { ...x, initialLabor: parseComma(e.target.value) }
                                              : x,
                                          ),
                                        )
                                      }
                                      onFocus={(e) => e.currentTarget.select()}
                                      className="h-8 text-[13px]"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full"
                              onClick={() => {
                                const idx = variants.length + 1;
                                setVariants((prev) => [
                                  ...prev,
                                  {
                                    id: Math.random().toString(36).slice(2),
                                    name: form.name ? `${form.name} 변형${idx}` : "",
                                    sku: form.sku ? `${form.sku}-V${idx}` : "",
                                    components: setComponents.map((c) => ({
                                      ...c,
                                      id: Math.random().toString(36).slice(2),
                                      mainId: c.id,
                                      override: false,
                                    })),
                                    initialQty: "0",
                                    initialDate: new Date(),
                                    initialLabor: "",
                                  },
                                ]);
                              }}
                            >
                              <Plus data-icon="inline-start" />
                              변형 추가
                            </Button>
                          </>
                        )}
                      </div>
                      </CardContent></Card>
                    </section>
                  )}

                  {/* 조립 비용 */}
                  {productType === "ASSEMBLED" && (
                    <section>
                      <SectionTitle
                        title="조립 비용"
                        badge={<span className="text-[11px] text-muted-foreground">선택사항</span>}
                      />
                      <Card size="sm" className="py-0">
                        <CostList costs={assemblyCosts} onChange={setAssemblyCosts} addLabel="조립 비용 추가" />
                        {assemblyFixedCost > 0 && (
                          <div className="flex items-center justify-between px-3 py-2 border-t border-border text-[12px]">
                            <span className="text-muted-foreground">조립비용 합계</span>
                            <span className="font-semibold tabular-nums">₩{Math.round(assemblyFixedCost).toLocaleString("ko-KR")}</span>
                          </div>
                        )}
                      </Card>
                    </section>
                  )}

                  {/* 입고 비용 (완제품/부속, 매핑 있을 때) */}
                  {(productType === "FINISHED" || productType === "PARTS") && mapping.supplierProductId && (
                    <section>
                      <SectionTitle
                        title="입고 비용"
                        badge={<span className="text-[11px] text-muted-foreground">선택사항</span>}
                      />
                      <Card size="sm" className="py-0">
                        <CostList
                          costs={incomingCosts}
                          onChange={setIncomingCosts}
                          addLabel="입고 비용 추가"
                          avgShippingCost={avgShippingCost}
                          avgShippingIsTaxable={avgShippingIsTaxable}
                        />
                      </Card>
                    </section>
                  )}

                  {/* 판매 비용 (모든 유형) */}
                  <section>
                    <SectionTitle
                      title="판매 비용"
                      badge={<span className="text-[11px] text-muted-foreground">선택사항</span>}
                    />
                    <Card size="sm" className="py-0">
                      <CostList costs={sellingCosts} onChange={setSellingCosts} addLabel="판매 비용 추가" />
                    </Card>
                  </section>

                  <GroupHeader step="STEP 3" title="가격 설정" id="np-step-3" />

                  {/* 가격 계산기 */}
                  {PricePanel()}

                  {channels.length > 0 && (
                    <>
                      <GroupHeader step="STEP 4" title="채널별 가격" id="np-step-4" />
                      {ChannelPricingPanel()}
                    </>
                  )}
                </div>

              </fieldset>
            )}
        </ScrollArea>

        {/* 하단 버튼 */}
        <div className="border-t border-border px-5 py-3.5 flex justify-end gap-2 bg-background shrink-0">
          {step === "type" ? (
            <Button variant="outline" onClick={handleLeave}>취소</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleLeave} disabled={submitting}>취소</Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isEdit ? "저장" : "등록"}
              </Button>
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

      <Dialog open={savePresetOpen} onOpenChange={setSavePresetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>프리셋으로 저장</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label className="text-sm">프리셋명</label>
            <Input
              value={savePresetName}
              onChange={(e) => setSavePresetName(e.target.value)}
              placeholder="예: 3HP 기본형"
            />
            <p className="text-xs text-muted-foreground">
              현재 구성 상품 슬롯이 새 프리셋으로 저장됩니다.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSavePresetOpen(false)}
              disabled={savePresetSubmitting}
            >
              취소
            </Button>
            <Button onClick={submitSavePreset} disabled={savePresetSubmitting}>
              {savePresetSubmitting ? <Loader2 className="animate-spin" /> : null}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
