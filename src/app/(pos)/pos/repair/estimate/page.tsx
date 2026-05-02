"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeft, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomerCombobox } from "@/components/customer-combobox";
import { QuickCustomerSheet } from "@/components/quick-register-sheets";
import { formatComma, parseComma } from "@/lib/utils";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────

interface CustomerLite {
  id: string;
  name: string;
  phone: string | null;
  businessNumber?: string | null;
}

interface MachineLite {
  id: string;
  name: string;
  brand: string | null;
  modelNo: string | null;
}

interface LaborPreset {
  id: string;
  name: string;
  unitRate: string;
}

interface PackageLabor {
  id: string;
  name: string;
  unitRate: string;
  quantity: number;
}

interface PackagePart {
  id: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  product: { id: string; name: string; sku: string };
}

interface RepairPackage {
  id: string;
  name: string;
  description: string | null;
  labors: PackageLabor[];
  parts: PackagePart[];
}

interface ProductLite {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
}

// Cart item types
interface CartLabor {
  _key: string;
  name: string;
  unitRate: string;
  quantity: string;
}

interface CartPart {
  _key: string;
  productId: string;
  productName: string;
  unitPrice: string;
  quantity: string;
}

let _keyCounter = 0;
const genKey = () => `k${++_keyCounter}`;

// ─── Page ─────────────────────────────────────────────────

export default function RepairEstimatePage() {
  const router = useRouter();
  const [tab, setTab] = useState<"packages" | "labors" | "parts">("packages");

  // Data
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [packages, setPackages] = useState<RepairPackage[]>([]);
  const [labors, setLabors] = useState<LaborPreset[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);

  // Customer/machine selection
  const [customerId, setCustomerId] = useState("");
  const [machines, setMachines] = useState<MachineLite[]>([]);
  const [machineId, setMachineId] = useState("");
  const [symptom, setSymptom] = useState("");
  const [memo, setMemo] = useState("");

  // Cart
  const [cartLabors, setCartLabors] = useState<CartLabor[]>([]);
  const [cartParts, setCartParts] = useState<CartPart[]>([]);

  // Part add (Parts tab)
  const [partProductId, setPartProductId] = useState("");
  const [partQty, setPartQty] = useState("1");

  // Free-form direct entry
  const [freeName, setFreeName] = useState("");
  const [freePrice, setFreePrice] = useState("0");
  const [freeQty, setFreeQty] = useState("1");

  // Quick customer
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [quickDefaultName, setQuickDefaultName] = useState("");

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      apiGet<CustomerLite[]>("/api/customers"),
      apiGet<RepairPackage[]>("/api/repair-packages"),
      apiGet<LaborPreset[]>("/api/repair-labor-presets"),
      apiGet<ProductLite[] | { items: ProductLite[] }>("/api/products"),
    ]).then(([c, pkg, lbr, prd]) => {
      setCustomers(Array.isArray(c) ? c : []);
      setPackages(Array.isArray(pkg) ? pkg : []);
      setLabors(Array.isArray(lbr) ? lbr : []);
      const items = Array.isArray(prd) ? prd : (prd?.items ?? []);
      setProducts(items);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!customerId) { setMachines([]); setMachineId(""); return; }
    apiGet<MachineLite[]>(`/api/customer-machines?customerId=${customerId}`)
      .then(setMachines)
      .catch(() => {});
  }, [customerId]);

  // ── Cart helpers ─────────────────────────────────────────

  const addPackageToCart = (pkg: RepairPackage) => {
    const newLabors = pkg.labors.map((l) => ({
      _key: genKey(),
      name: l.name,
      unitRate: String(l.unitRate),
      quantity: String(l.quantity),
    }));
    const newParts = pkg.parts.map((p) => ({
      _key: genKey(),
      productId: p.productId,
      productName: p.product.name,
      unitPrice: String(p.unitPrice),
      quantity: String(p.quantity),
    }));
    setCartLabors((prev) => [...prev, ...newLabors]);
    setCartParts((prev) => [...prev, ...newParts]);
    toast.success(`"${pkg.name}" 패키지를 추가했습니다`);
  };

  const addLaborPresetToCart = (preset: LaborPreset) => {
    setCartLabors((prev) => {
      const existing = prev.find((l) => l.name === preset.name && l.unitRate === String(preset.unitRate));
      if (existing) {
        return prev.map((l) => l._key === existing._key
          ? { ...l, quantity: String(parseInt(l.quantity) + 1) }
          : l
        );
      }
      return [...prev, { _key: genKey(), name: preset.name, unitRate: String(preset.unitRate), quantity: "1" }];
    });
  };

  const addPartToCart = () => {
    const prod = products.find((p) => p.id === partProductId);
    if (!prod) { toast.error("상품을 선택하세요"); return; }
    setCartParts((prev) => [...prev, {
      _key: genKey(),
      productId: prod.id,
      productName: prod.name,
      unitPrice: String(prod.sellingPrice),
      quantity: partQty || "1",
    }]);
    setPartProductId("");
    setPartQty("1");
  };

  const addFreeItemToCart = () => {
    if (!freeName.trim()) { toast.error("내용을 입력하세요"); return; }
    setCartLabors((prev) => [...prev, {
      _key: genKey(),
      name: freeName.trim(),
      unitRate: parseComma(freePrice) || "0",
      quantity: freeQty || "1",
    }]);
    setFreeName("");
    setFreePrice("0");
    setFreeQty("1");
  };

  // ── Totals ───────────────────────────────────────────────

  const laborTotal = cartLabors.reduce(
    (s, l) => s + (parseFloat(parseComma(l.unitRate)) || 0) * (parseInt(l.quantity) || 1),
    0
  );
  const partTotal = cartParts.reduce(
    (s, p) => s + (parseFloat(parseComma(p.unitPrice)) || 0) * (parseFloat(p.quantity) || 1),
    0
  );
  const total = laborTotal + partTotal;

  // ── Submit ───────────────────────────────────────────────

  const submit = async () => {
    if (!customerId) { toast.error("고객을 선택하세요"); return; }
    setSubmitting(true);
    try {
      const ticket = await apiMutate<{ id: string; ticketNo: string }>("/api/repair-tickets", "POST", {
        customerId,
        customerMachineId: machineId || null,
        symptom: symptom.trim() || null,
        memo: memo.trim() || null,
        labors: cartLabors.map((l) => ({
          name: l.name,
          hours: parseInt(l.quantity) || 1,
          unitRate: parseFloat(parseComma(l.unitRate)) || 0,
        })),
        parts: cartParts.map((p) => ({
          productId: p.productId,
          quantity: parseFloat(p.quantity) || 1,
          unitPrice: parseFloat(parseComma(p.unitPrice)) || 0,
        })),
      });
      toast.success(`수리 접수 완료 — ${ticket.ticketNo}`);
      router.push(`/pos/repair/${ticket.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "접수 실패");
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <Link href="/pos/repair" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          수리 목록
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">수리 견적</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── 왼쪽: 서비스 선택 ── */}
        <div className="flex w-1/2 flex-col border-r border-border">
          {/* 탭 */}
          <div className="flex border-b border-border">
            {(["packages", "labors", "parts"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 py-2.5 text-sm font-medium transition-colors",
                  tab === t
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "packages" ? "수리 패키지" : t === "labors" ? "공임" : "부품"}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {/* 수리 패키지 탭 */}
            {tab === "packages" && (
              <div className="grid grid-cols-2 gap-2">
                {/* 직접 입력 카드 — 항상 첫 번째 */}
                <div className="col-span-2 rounded-lg border border-dashed border-border bg-muted/30 p-3 space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground">직접 입력</div>
                  <div className="flex gap-1.5">
                    <Input
                      className="h-8 flex-1 text-sm"
                      placeholder="내용 입력..."
                      value={freeName}
                      onChange={(e) => setFreeName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) addFreeItemToCart(); }}
                    />
                    <Input
                      className="h-8 w-14 text-center text-sm"
                      placeholder="수량"
                      value={freeQty}
                      onChange={(e) => setFreeQty(e.target.value)}
                    />
                    <Input
                      className="h-8 w-28 text-right text-sm"
                      type="text"
                      inputMode="numeric"
                      placeholder="단가"
                      value={formatComma(freePrice)}
                      onChange={(e) => setFreePrice(parseComma(e.target.value))}
                      onFocus={(e) => e.currentTarget.select()}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) addFreeItemToCart(); }}
                    />
                    <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={addFreeItemToCart}>
                      <Plus className="h-3.5 w-3.5" />
                      추가
                    </Button>
                  </div>
                </div>

                {packages.length === 0 ? (
                  <div className="col-span-2 py-6 text-center text-sm text-muted-foreground">등록된 수리 패키지가 없습니다</div>
                ) : packages.map((pkg) => (
                  <button
                    key={pkg.id}
                    onClick={() => addPackageToCart(pkg)}
                    className="rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50 active:scale-[0.98]"
                  >
                    <div className="text-sm font-semibold">{pkg.name}</div>
                    {pkg.description && (
                      <div className="mt-0.5 text-xs text-muted-foreground">{pkg.description}</div>
                    )}
                    <div className="mt-1.5 text-xs text-muted-foreground">
                      공임 {pkg.labors.length}건 · 부품 {pkg.parts.length}건
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* 공임 탭 */}
            {tab === "labors" && (
              <div className="grid grid-cols-2 gap-2">
                {labors.length === 0 ? (
                  <div className="col-span-2 py-8 text-center text-sm text-muted-foreground">등록된 공임 프리셋이 없습니다</div>
                ) : labors.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => addLaborPresetToCart(l)}
                    className="rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50 active:scale-[0.98]"
                  >
                    <div className="text-sm font-semibold">{l.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      ₩{Number(l.unitRate).toLocaleString("ko-KR")}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* 부품 탭 */}
            {tab === "parts" && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <select
                    className="h-9 flex-1 rounded-md border border-border bg-background px-2 text-sm"
                    value={partProductId}
                    onChange={(e) => setPartProductId(e.target.value)}
                  >
                    <option value="">상품 선택...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                    ))}
                  </select>
                  <Input
                    className="h-9 w-16 text-right"
                    placeholder="수량"
                    value={partQty}
                    onChange={(e) => setPartQty(e.target.value)}
                  />
                  <Button size="sm" variant="outline" onClick={addPartToCart}>
                    <Plus className="h-4 w-4" />
                    담기
                  </Button>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* ── 오른쪽: 견적 카트 ── */}
        <div className="flex w-1/2 flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* 고객/기기 */}
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">고객 정보</div>
              <CustomerCombobox
                customers={customers}
                value={customerId}
                onChange={(id) => setCustomerId(id)}
                onCreateNew={(name) => { setQuickDefaultName(name); setQuickCustomerOpen(true); }}
              />
              {customerId && machines.length > 0 && (
                <select
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                  value={machineId}
                  onChange={(e) => setMachineId(e.target.value)}
                >
                  <option value="">기기 선택 (선택사항)</option>
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}{m.brand ? ` (${m.brand})` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">증상 / 메모</div>
              <Input
                placeholder="증상 입력..."
                value={symptom}
                onChange={(e) => setSymptom(e.target.value)}
              />
              <Input
                placeholder="메모 (선택사항)"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </div>

            {/* 공임 카트 */}
            {cartLabors.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">공임</div>
                <div className="rounded-lg border border-border">
                  {cartLabors.map((l) => (
                    <div key={l._key} className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-0">
                      <div className="flex-1 text-sm">{l.name}</div>
                      <Input
                        className="h-7 w-14 text-right text-xs"
                        value={l.quantity}
                        onChange={(e) => setCartLabors((prev) =>
                          prev.map((item) => item._key === l._key ? { ...item, quantity: e.target.value } : item)
                        )}
                      />
                      <Input
                        className="h-7 w-24 text-right text-xs"
                        type="text"
                        inputMode="numeric"
                        value={formatComma(l.unitRate)}
                        onChange={(e) => setCartLabors((prev) =>
                          prev.map((item) => item._key === l._key ? { ...item, unitRate: parseComma(e.target.value) } : item)
                        )}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <button onClick={() => setCartLabors((prev) => prev.filter((item) => item._key !== l._key))}>
                        <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 부품 카트 */}
            {cartParts.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">부품</div>
                <div className="rounded-lg border border-border">
                  {cartParts.map((p) => (
                    <div key={p._key} className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-0">
                      <div className="flex-1 text-sm">{p.productName}</div>
                      <Input
                        className="h-7 w-14 text-right text-xs"
                        value={p.quantity}
                        onChange={(e) => setCartParts((prev) =>
                          prev.map((item) => item._key === p._key ? { ...item, quantity: e.target.value } : item)
                        )}
                      />
                      <Input
                        className="h-7 w-24 text-right text-xs"
                        type="text"
                        inputMode="numeric"
                        value={formatComma(p.unitPrice)}
                        onChange={(e) => setCartParts((prev) =>
                          prev.map((item) => item._key === p._key ? { ...item, unitPrice: parseComma(e.target.value) } : item)
                        )}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <button onClick={() => setCartParts((prev) => prev.filter((item) => item._key !== p._key))}>
                        <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {cartLabors.length === 0 && cartParts.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                왼쪽에서 패키지나 항목을 선택하세요
              </div>
            )}
          </div>

          {/* 합계 + 접수 버튼 */}
          <div className="border-t border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">공임 합계</span>
              <span className="text-sm">₩{laborTotal.toLocaleString("ko-KR")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">부품 합계</span>
              <span className="text-sm">₩{partTotal.toLocaleString("ko-KR")}</span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2">
              <span className="font-semibold">총 견적</span>
              <span className="text-lg font-bold">₩{total.toLocaleString("ko-KR")}</span>
            </div>
            <Button
              className="w-full"
              onClick={submit}
              disabled={submitting || !customerId}
            >
              {submitting ? <Loader2 className="animate-spin" /> : null}
              수리 접수하기
            </Button>
          </div>
        </div>
      </div>

      <QuickCustomerSheet
        open={quickCustomerOpen}
        onOpenChange={setQuickCustomerOpen}
        defaultName={quickDefaultName}
        onCreated={(customer) => {
          setCustomers((prev) => [{ ...customer, businessNumber: null }, ...prev]);
          setCustomerId(customer.id);
        }}
      />
    </div>
  );
}
