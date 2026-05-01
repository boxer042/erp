"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, X, Plus, Minus, Trash2, ShoppingCart, Wrench, Container } from "lucide-react";
import { useSessions, type CartItem, type RepairMeta } from "@/components/pos/sessions-context";
import { CustomerCombobox } from "@/components/customer-combobox";
import { Button } from "@/components/ui/button";
import { QuickCustomerSheet } from "@/components/quick-register-sheets";
import {
  ProductDescriptionBlock,
  ProductInfoCard,
  ProductMediaGallery,
} from "@/components/product";
import type { ProductDetail } from "@/components/product/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  calcDiscountPerUnit,
  formatDiscountDisplay,
  normalizeDiscountInput,
  formatComma,
  parseComma,
  cn,
} from "@/lib/utils";

// ─── 타입 ────────────────────────────────────────────────

interface ProductLite {
  id: string;
  name: string;
  sku: string;
  brand: string | null;
  sellingPrice: string;
  imageUrl: string | null;
  taxType: string;
  isBulk?: boolean;
  unitOfMeasure?: string;
  isCanonical?: boolean;
}

interface CustomerLite {
  id: string;
  name: string;
  phone: string | null;
  businessNumber: string | null;
}

interface RepairPackage {
  id: string;
  name: string;
  description: string | null;
  labors: { unitRate: string; quantity: number }[];
  parts: { unitPrice: string; quantity: string }[];
}

interface LaborPreset {
  id: string;
  name: string;
  unitRate: string;
}

interface RentalAsset {
  id: string;
  assetNo: string;
  name: string;
  brand: string | null;
  dailyRate: string;
  monthlyRate: string;
  depositAmount: string | null;
  status: string;
}

type Category = "product" | "repair" | "rental";

// ─── 메인 ────────────────────────────────────────────────

export default function SalesPage() {
  const router = useRouter();
  const {
    sessions, activeId, active, addSession, removeSession, switchSession,
    add, remove, updateQty, updateDiscount, toggleZeroRate, setCustomer, clearCustomer, clear,
  } = useSessions();

  const [category, setCategory] = useState<Category>("product");

  // 수리 Sheet
  const [repairSheetOpen, setRepairSheetOpen] = useState(false);
  const [pendingRepairItem, setPendingRepairItem] = useState<{ name: string; unitPrice: number; isFreeForm?: boolean } | null>(null);
  const [repairMetaForm, setRepairMetaForm] = useState({
    deviceBrand: "", deviceModel: "", issueDescription: "",
    freeFormName: "", freeFormPrice: "",
  });

  // 상품
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [search, setSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  // 수리
  const [repairPackages, setRepairPackages] = useState<RepairPackage[]>([]);
  const [laborPresets, setLaborPresets] = useState<LaborPreset[]>([]);
  const repairLoaded = useRef(false);

  // 임대
  const [rentalAssets, setRentalAssets] = useState<RentalAsset[]>([]);
  const rentalLoaded = useRef(false);

  // 고객
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [quickDefaultName, setQuickDefaultName] = useState("");

  useEffect(() => {
    fetch("/api/customers").then((r) => r.json()).then(setCustomers);
  }, []);

  // 상품 로드
  const loadProducts = useCallback(async (q: string) => {
    const url = q.trim() ? `/api/products?isBulk=all&search=${encodeURIComponent(q)}` : "/api/products?isBulk=all";
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : data.items ?? []);
    }
  }, []);

  useEffect(() => { loadProducts(""); }, [loadProducts]);

  // 수리 탭 진입 시 lazy 로드
  useEffect(() => {
    if (category !== "repair" || repairLoaded.current) return;
    repairLoaded.current = true;
    Promise.all([
      fetch("/api/repair-packages").then((r) => r.json()),
      fetch("/api/repair-labor-presets").then((r) => r.json()),
    ]).then(([pkgs, lbrs]) => {
      setRepairPackages(Array.isArray(pkgs) ? pkgs : []);
      setLaborPresets(Array.isArray(lbrs) ? lbrs : []);
    });
  }, [category]);

  // 임대 탭 진입 시 lazy 로드
  useEffect(() => {
    if (category !== "rental" || rentalLoaded.current) return;
    rentalLoaded.current = true;
    fetch("/api/rental-assets").then((r) => r.json()).then((d) => {
      setRentalAssets(Array.isArray(d) ? d : []);
    });
  }, [category]);

  // ── 카트 추가 핸들러 ─────────────────────────────────────

  const handleSearchSubmit = (v: string) => {
    loadProducts(v);
  };

  const handleQuickAdd = (p: ProductLite) => {
    add({ productId: p.id, itemType: "product", name: p.name, sku: p.sku, imageUrl: p.imageUrl, unitPrice: parseFloat(p.sellingPrice), taxType: p.taxType as CartItem["taxType"], isBulk: p.isBulk, unitOfMeasure: p.unitOfMeasure, isCanonical: p.isCanonical });
    if (p.isCanonical) {
      toast.success(`${p.name} 담음 (결제 시 변형 선택 필요)`);
    } else {
      toast.success(`${p.name} 담음`);
    }
  };

  const openRepairSheet = (name: string, unitPrice: number, isFreeForm = false) => {
    setPendingRepairItem({ name, unitPrice, isFreeForm });
    setRepairMetaForm({
      deviceBrand: "", deviceModel: "", issueDescription: "",
      freeFormName: isFreeForm ? "" : name,
      freeFormPrice: isFreeForm ? "" : String(unitPrice),
    });
    setRepairSheetOpen(true);
  };

  const confirmRepairAdd = () => {
    if (!pendingRepairItem) return;
    const name = pendingRepairItem.isFreeForm
      ? repairMetaForm.freeFormName.trim()
      : pendingRepairItem.name;
    const unitPrice = pendingRepairItem.isFreeForm
      ? parseFloat(parseComma(repairMetaForm.freeFormPrice)) || 0
      : pendingRepairItem.unitPrice;
    if (!name) { toast.error("수리 내용을 입력해주세요"); return; }
    add({
      itemType: "repair",
      name,
      imageUrl: null,
      unitPrice,
      repairMeta: {
        deviceBrand: repairMetaForm.deviceBrand || undefined,
        deviceModel: repairMetaForm.deviceModel || undefined,
        issueDescription: repairMetaForm.issueDescription || undefined,
      },
    });
    toast.success(`"${name}" 담음`);
    setRepairSheetOpen(false);
    setPendingRepairItem(null);
  };

  const addPackageToCart = (pkg: RepairPackage) => {
    const laborTotal = pkg.labors.reduce((s, l) => s + parseFloat(l.unitRate) * l.quantity, 0);
    const partTotal = pkg.parts.reduce((s, p) => s + parseFloat(p.unitPrice) * parseFloat(p.quantity), 0);
    openRepairSheet(pkg.name, laborTotal + partTotal);
  };

  const addLaborToCart = (l: LaborPreset) => {
    openRepairSheet(l.name, parseFloat(l.unitRate));
  };

  const addRentalToCart = (a: RentalAsset) => {
    add({
      itemType: "rental",
      name: a.name,
      imageUrl: null,
      unitPrice: parseFloat(a.dailyRate),
      rentalMeta: {
        assetId: a.id,
        dailyRate: parseFloat(a.dailyRate),
        depositAmount: a.depositAmount ? parseFloat(a.depositAmount) : undefined,
      },
    });
    toast.success(`"${a.name}" 담음`);
  };

  const cartTotal = active.items.reduce((s, i) => {
    const lineNet = (i.unitPrice - calcDiscountPerUnit(i.unitPrice, i.discount)) * i.quantity;
    const vatExempt = i.taxType === "TAX_FREE" || i.isZeroRate;
    return s + lineNet * (vatExempt ? 1 : 1.1);
  }, 0);

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        {/* 세션 탭 */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-background px-4 py-2">
          {sessions.map((s) => {
            const isActive = s.id === activeId;
            return (
              <button
                key={s.id}
                onClick={() => switchSession(s.id)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {isActive && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                {s.customerName ? s.customerName : s.label}
                {s.items.length > 0 && (
                  <span className="ml-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[11px] font-semibold text-primary/80">
                    {s.items.reduce((a, i) => a + i.quantity, 0)}
                  </span>
                )}
                {sessions.length > 1 && (
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); removeSession(s.id); }}
                    className="ml-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </span>
                )}
              </button>
            );
          })}
          <button
            onClick={addSession}
            className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus className="size-3.5" /> 손님 추가
          </button>
        </div>

        {/* 메인 레이아웃 */}
        <div className="grid flex-1 grid-cols-[1fr_400px] overflow-hidden">
          {/* 왼쪽: 카테고리 + 그리드 */}
          <div className="flex flex-col overflow-hidden border-r border-border">
            {/* 카테고리 탭 */}
            <div className="flex border-b border-border">
              {([
                { key: "product", label: "상품" },
                { key: "repair", label: "수리" },
                { key: "rental", label: "임대" },
              ] as { key: Category; label: string }[]).map((c) => (
                <button
                  key={c.key}
                  onClick={() => setCategory(c.key)}
                  className={cn(
                    "flex-1 py-2.5 text-sm font-medium transition-colors",
                    category === c.key
                      ? "border-b-2 border-primary text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* 상품 탭 */}
            {category === "product" && (
              <>
                <div className="flex items-center gap-2 border-b border-border p-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSearchSubmit(search);
                      }}
                      placeholder="이름·SKU·바코드 검색 (Enter)"
                      className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-4 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-4">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                    {products.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => setSelectedProductId(p.id)}
                        className="group relative cursor-pointer overflow-hidden rounded-xl border border-border bg-background transition-all hover:border-primary hover:shadow-sm"
                      >
                        <div className="aspect-square w-full bg-muted">
                          {p.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                              이미지 없음
                            </div>
                          )}
                        </div>
                        <div className="p-3 pb-10">
                          <div className="line-clamp-2 text-sm font-medium leading-snug">{p.name}</div>
                          <div className="mt-1.5 text-base font-semibold">
                            ₩{Math.round(Number(p.sellingPrice) * (p.taxType === "TAX_FREE" ? 1 : 1.1)).toLocaleString("ko-KR")}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleQuickAdd(p); }}
                          className="absolute bottom-2.5 right-2.5 flex size-8 items-center justify-center rounded-full bg-primary text-white shadow-md opacity-0 transition-opacity group-hover:opacity-100 hover:bg-primary/90"
                          title="바로 담기"
                        >
                          <Plus className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {products.length === 0 && (
                    <div className="py-16 text-center text-sm text-muted-foreground">상품이 없습니다</div>
                  )}
                </div>
              </>
            )}

            {/* 수리 탭 */}
            {category === "repair" && (
              <div className="flex-1 overflow-auto p-4 space-y-5">
                {/* 직접 입력 카드 — 항상 최상단 */}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => openRepairSheet("", 0, true)}
                    className="col-span-2 h-auto p-5 md:col-span-3 xl:col-span-4"
                  >
                    <Plus data-icon="inline-start" />
                    직접 입력
                  </Button>
                </div>

                {/* 수리 패키지 */}
                {repairPackages.length > 0 && (
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">수리 패키지</div>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                      {repairPackages.map((pkg) => {
                        const laborTotal = pkg.labors.reduce((s, l) => s + parseFloat(l.unitRate) * l.quantity, 0);
                        const partTotal = pkg.parts.reduce((s, p) => s + parseFloat(p.unitPrice) * parseFloat(p.quantity), 0);
                        const total = laborTotal + partTotal;
                        return (
                          <div
                            key={pkg.id}
                            onClick={() => addPackageToCart(pkg)}
                            className="group relative cursor-pointer overflow-hidden rounded-xl border border-border bg-background transition-all hover:border-primary hover:shadow-sm"
                          >
                            <div className="flex aspect-square w-full items-center justify-center bg-muted">
                              <Wrench className="size-10 text-muted-foreground/40" />
                            </div>
                            <div className="p-3 pb-10">
                              <div className="line-clamp-2 text-sm font-medium leading-snug">{pkg.name}</div>
                              {pkg.description && (
                                <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{pkg.description}</div>
                              )}
                              <div className="mt-1.5 text-base font-semibold">
                                ₩{Math.round(total * 1.1).toLocaleString("ko-KR")}
                              </div>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); addPackageToCart(pkg); }}
                              className="absolute bottom-2.5 right-2.5 flex size-8 items-center justify-center rounded-full bg-primary text-white shadow-md opacity-0 transition-opacity group-hover:opacity-100 hover:bg-primary/90"
                            >
                              <Plus className="size-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 공임 프리셋 */}
                {laborPresets.length > 0 && (
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">공임</div>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                      {laborPresets.map((l) => (
                        <div
                          key={l.id}
                          onClick={() => addLaborToCart(l)}
                          className="group relative cursor-pointer overflow-hidden rounded-xl border border-border bg-background transition-all hover:border-primary hover:shadow-sm"
                        >
                          <div className="flex aspect-square w-full items-center justify-center bg-muted">
                            <Wrench className="size-10 text-muted-foreground/40" />
                          </div>
                          <div className="p-3 pb-10">
                            <div className="line-clamp-2 text-sm font-medium leading-snug">{l.name}</div>
                            <div className="mt-1.5 text-base font-semibold">
                              ₩{Math.round(Number(l.unitRate) * 1.1).toLocaleString("ko-KR")}
                            </div>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); addLaborToCart(l); }}
                            className="absolute bottom-2.5 right-2.5 flex size-8 items-center justify-center rounded-full bg-primary text-white shadow-md opacity-0 transition-opacity group-hover:opacity-100 hover:bg-primary/90"
                          >
                            <Plus className="size-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {repairPackages.length === 0 && laborPresets.length === 0 && (
                  <div className="py-16 text-center text-sm text-muted-foreground">등록된 수리 서비스가 없습니다</div>
                )}
              </div>
            )}

            {/* 임대 탭 */}
            {category === "rental" && (
              <div className="flex-1 overflow-auto p-4">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                  {rentalAssets.map((a) => (
                    <div
                      key={a.id}
                      onClick={() => addRentalToCart(a)}
                      className="group relative cursor-pointer overflow-hidden rounded-xl border border-border bg-background transition-all hover:border-primary hover:shadow-sm"
                    >
                      <div className="flex aspect-square w-full items-center justify-center bg-muted">
                        <Container className="size-10 text-muted-foreground/40" />
                      </div>
                      <div className="p-3 pb-10">
                        <div className="line-clamp-2 text-sm font-medium leading-snug">{a.name}</div>
                        {a.brand && <div className="mt-0.5 text-xs text-muted-foreground">{a.brand}</div>}
                        <div className="mt-1.5 text-base font-semibold">
                          ₩{Math.round(Number(a.dailyRate) * 1.1).toLocaleString("ko-KR")}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">/ 일</span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); addRentalToCart(a); }}
                        className="absolute bottom-2.5 right-2.5 flex size-8 items-center justify-center rounded-full bg-primary text-white shadow-md opacity-0 transition-opacity group-hover:opacity-100 hover:bg-primary/90"
                      >
                        <Plus className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
                {rentalAssets.length === 0 && (
                  <div className="py-16 text-center text-sm text-muted-foreground">등록된 임대 자산이 없습니다</div>
                )}
              </div>
            )}
          </div>

          {/* 카트 패널 */}
          <div className="flex flex-col overflow-hidden">
            <div className="border-b border-border p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">고객</span>
                {active.customerId && (
                  <button onClick={clearCustomer} className="text-xs text-muted-foreground hover:text-foreground">
                    해제
                  </button>
                )}
              </div>
              <CustomerCombobox
                customers={customers}
                value={active.customerId ?? ""}
                onChange={(id, customer) => setCustomer(id, customer.name)}
                onCreateNew={(name) => { setQuickDefaultName(name); setQuickCustomerOpen(true); }}
              />
            </div>

            <div className="flex-1 overflow-auto">
              {active.items.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                  <ShoppingCart className="size-10" />
                  <div className="text-sm">상품을 선택하세요</div>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {active.items.map((item) => (
                    <CartRow
                      key={item.cartItemId}
                      item={item}
                      onUpdateQty={(qty) => updateQty(item.cartItemId, qty)}
                      onUpdateDiscount={(d) => updateDiscount(item.cartItemId, d)}
                      onRemove={() => remove(item.cartItemId)}
                      onToggleZeroRate={item.taxType === "ZERO_RATE" ? () => toggleZeroRate(item.cartItemId) : undefined}
                    />
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-border bg-background p-4">
              <div className="mb-4 flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">합계</span>
                <span className="text-2xl font-semibold tracking-tight">
                  ₩{Math.round(cartTotal).toLocaleString("ko-KR")}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={clear}
                  disabled={active.items.length === 0}
                  className="h-11 rounded-lg border border-border text-sm font-medium hover:bg-muted disabled:opacity-40"
                >
                  비우기
                </button>
                <button
                  onClick={() => {
                    if (active.items.length === 0) return;
                    const qs = active.customerId ? `?customerId=${active.customerId}` : "";
                    router.push(`/pos/sales/checkout${qs}`);
                  }}
                  disabled={active.items.length === 0}
                  className="h-11 rounded-lg bg-primary text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-40"
                >
                  계산하기 →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 상품 상세 모달 */}
      <ProductDetailModal
        productId={selectedProductId}
        onClose={() => setSelectedProductId(null)}
        onAdd={(detail) => {
          add({ productId: detail.id, itemType: "product", name: detail.name, sku: detail.sku, imageUrl: detail.imageUrl, unitPrice: parseFloat(detail.sellingPrice), taxType: detail.taxType as CartItem["taxType"], isBulk: detail.isBulk, unitOfMeasure: detail.unitOfMeasure });
          toast.success(`${detail.name} 담음`);
          setSelectedProductId(null);
        }}
      />

      <QuickCustomerSheet
        open={quickCustomerOpen}
        onOpenChange={setQuickCustomerOpen}
        defaultName={quickDefaultName}
        onCreated={(c) => {
          fetch("/api/customers").then((r) => r.json()).then((list) => {
            setCustomers(list);
            setCustomer(c.id, c.name);
          });
        }}
      />

      <Dialog open={repairSheetOpen && !!pendingRepairItem} onOpenChange={(o) => !o && setRepairSheetOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {pendingRepairItem?.isFreeForm ? "수리 항목 직접 입력" : pendingRepairItem?.name}
            </DialogTitle>
            {pendingRepairItem && !pendingRepairItem.isFreeForm && (
              <div className="text-sm text-muted-foreground">
                ₩{Math.round(pendingRepairItem.unitPrice * 1.1).toLocaleString("ko-KR")}
              </div>
            )}
          </DialogHeader>
          {pendingRepairItem && (
            <div className="space-y-4">
              {pendingRepairItem.isFreeForm && (
                <>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">수리 내용 *</label>
                    <input
                      type="text"
                      value={repairMetaForm.freeFormName}
                      onChange={(e) => setRepairMetaForm((p) => ({ ...p, freeFormName: e.target.value }))}
                      placeholder="예: 액정 교체, 배터리 교환"
                      className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">금액</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatComma(repairMetaForm.freeFormPrice)}
                      onChange={(e) => setRepairMetaForm((p) => ({ ...p, freeFormPrice: parseComma(e.target.value) }))}
                      onFocus={(e) => e.currentTarget.select()}
                      placeholder="0"
                      className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <div className="border-t border-border" />
                </>
              )}
              <div className="text-sm font-medium text-muted-foreground">기기 정보 (선택사항)</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">브랜드</label>
                  <input
                    type="text"
                    value={repairMetaForm.deviceBrand ?? ""}
                    onChange={(e) => setRepairMetaForm((p) => ({ ...p, deviceBrand: e.target.value }))}
                    placeholder="예: Apple, Samsung"
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">모델명</label>
                  <input
                    type="text"
                    value={repairMetaForm.deviceModel ?? ""}
                    onChange={(e) => setRepairMetaForm((p) => ({ ...p, deviceModel: e.target.value }))}
                    placeholder="예: iPhone 15, Galaxy S24"
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">증상</label>
                <textarea
                  value={repairMetaForm.issueDescription ?? ""}
                  onChange={(e) => setRepairMetaForm((p) => ({ ...p, issueDescription: e.target.value }))}
                  placeholder="증상을 간략히 입력하세요"
                  rows={3}
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRepairSheetOpen(false)}>취소</Button>
            <Button onClick={confirmRepairAdd}>장바구니 담기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── ProductDetailModal ──────────────────────────────────

function ProductDetailModal({
  productId,
  onClose,
  onAdd,
}: {
  productId: string | null;
  onClose: () => void;
  onAdd: (detail: ProductDetail) => void;
}) {
  const [detail, setDetail] = useState<ProductDetail | null>(null);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    fetch(`/api/products/${productId}`)
      .then((r) => r.json())
      .then((prod) => {
        if (cancelled) return;
        setDetail(prod);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  // detail이 현재 productId의 결과인지 확인 (이전 productId의 데이터를 보여주지 않도록)
  const showLoading = !!productId && detail?.id !== productId;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <Sheet open={!!productId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="h-[92vh] p-0 flex flex-col">
        <SheetHeader className="border-b border-border px-5 py-3 flex-shrink-0">
          <SheetTitle className="text-sm font-medium text-muted-foreground">상품 상세</SheetTitle>
          <SheetDescription className="sr-only">선택한 상품의 상세 정보</SheetDescription>
        </SheetHeader>

        {showLoading || !detail ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="grid gap-6 md:grid-cols-2">
              <Skeleton className="aspect-square w-full rounded-md" />
              <div className="space-y-3">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-20 w-full rounded-md" />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="grid gap-6 p-6 md:grid-cols-2">
              <ProductMediaGallery
                imageUrl={detail.imageUrl}
                media={detail.media}
                productName={detail.name}
                variant="customer"
                bare
              />

              <div className="flex flex-col gap-4">
                <ProductInfoCard product={detail} variant="customer" />
                <button
                  onClick={() => onAdd(detail)}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-white hover:bg-primary/90"
                >
                  <ShoppingCart className="size-5" />
                  카트에 담기
                </button>
                {detail.description && (
                  <ProductDescriptionBlock product={detail} showMemo={false} />
                )}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── CartRow ─────────────────────────────────────────────

function CartRow({
  item,
  onUpdateQty,
  onUpdateDiscount,
  onRemove,
  onToggleZeroRate,
}: {
  item: CartItem;
  onUpdateQty: (qty: number) => void;
  onUpdateDiscount: (discount: string) => void;
  onRemove: () => void;
  onToggleZeroRate?: () => void;
}) {
  const discountPerUnit = calcDiscountPerUnit(item.unitPrice, item.discount);
  const lineNet = (item.unitPrice - discountPerUnit) * item.quantity;
  const vatExempt = item.taxType === "TAX_FREE" || item.isZeroRate;
  const lineTotal = lineNet * (vatExempt ? 1 : 1.1);

  return (
    <li className="bg-background p-4">
      <div className="flex items-start gap-3">
        <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
          ) : item.itemType === "repair" ? (
            <div className="flex h-full items-center justify-center">
              <Wrench className="size-5 text-muted-foreground/50" />
            </div>
          ) : item.itemType === "rental" ? (
            <div className="flex h-full items-center justify-center">
              <Container className="size-5 text-muted-foreground/50" />
            </div>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="line-clamp-2 text-sm font-medium leading-snug">{item.name}</div>
            {item.itemType === "repair" && (
              <span className="shrink-0 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-600">수리</span>
            )}
            {item.itemType === "rental" && (
              <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">임대</span>
            )}
            {item.taxType === "ZERO_RATE" && onToggleZeroRate && (
              <button
                onClick={onToggleZeroRate}
                className={cn(
                  "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                  item.isZeroRate
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-muted text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700"
                )}
              >
                영세율
              </button>
            )}
          </div>
          {item.repairMeta && (item.repairMeta.deviceBrand || item.repairMeta.deviceModel) && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              {[item.repairMeta.deviceBrand, item.repairMeta.deviceModel].filter(Boolean).join(" ")}
            </div>
          )}
          {item.rentalMeta?.startDate && item.rentalMeta?.endDate ? (
            <div className="mt-0.5 text-xs text-muted-foreground">
              {item.rentalMeta.startDate} ~ {item.rentalMeta.endDate}
            </div>
          ) : item.itemType === "rental" ? (
            <div className="mt-0.5 text-xs text-orange-500">날짜 미설정 — 계산 시 입력</div>
          ) : null}
          <div className="mt-0.5 text-xs text-muted-foreground">
            ₩{Math.round(item.unitPrice * (vatExempt ? 1 : 1.1)).toLocaleString("ko-KR")}
            {item.taxType === "TAX_FREE" && <span className="ml-1">면세</span>}
          </div>
        </div>
        <button className="text-muted-foreground hover:text-destructive" onClick={onRemove}>
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="flex h-8 items-center rounded-md border border-border">
          <button className="flex h-full w-8 items-center justify-center hover:bg-muted/50" onClick={() => onUpdateQty(item.quantity - 1)}>
            <Minus className="size-3" />
          </button>
          <input
            type="text"
            inputMode={item.isBulk ? "decimal" : "numeric"}
            value={item.quantity}
            onChange={(e) => {
              if (item.isBulk) {
                const cleaned = e.target.value.replace(/[^\d.]/g, "");
                const v = parseFloat(cleaned);
                onUpdateQty(isNaN(v) ? 0.0001 : v);
              } else {
                const v = parseInt(e.target.value.replace(/\D/g, ""), 10) || 1;
                onUpdateQty(v);
              }
            }}
            className={`h-full ${item.isBulk ? "w-16" : "w-10"} border-x border-border text-center text-sm outline-none`}
          />
          <button className="flex h-full w-8 items-center justify-center hover:bg-muted/50" onClick={() => onUpdateQty(item.quantity + 1)}>
            <Plus className="size-3" />
          </button>
        </div>
        {item.isBulk && item.unitOfMeasure && (
          <span className="text-xs text-muted-foreground">{item.unitOfMeasure}</span>
        )}

        <input
          type="text"
          inputMode={item.discount.endsWith("%") ? "decimal" : "numeric"}
          value={formatDiscountDisplay(item.discount)}
          onChange={(e) => onUpdateDiscount(normalizeDiscountInput(e.target.value))}
          onFocus={(e) => e.currentTarget.select()}
          placeholder="할인"
          className="h-8 w-24 rounded-md border border-border px-2 text-right text-sm outline-none focus:border-primary"
        />

        <div className="ml-auto text-sm font-semibold">
          ₩{Math.round(lineTotal).toLocaleString("ko-KR")}
        </div>
      </div>
    </li>
  );
}
