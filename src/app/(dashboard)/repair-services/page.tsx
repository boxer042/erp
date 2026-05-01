"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Trash2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { formatComma, parseComma } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

function RepairPresetsSkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-48" /></TableCell>
          <TableCell><div className="flex justify-end"><Skeleton className="h-4 w-16" /></div></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><div className="flex justify-end gap-1"><Skeleton className="h-7 w-7 rounded-md" /><Skeleton className="h-7 w-7 rounded-md" /></div></TableCell>
        </TableRow>
      ))}
    </>
  );
}

function RepairPackagesSkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-48" /></TableCell>
          <TableCell><div className="flex justify-end"><Skeleton className="h-4 w-12" /></div></TableCell>
          <TableCell><div className="flex justify-end"><Skeleton className="h-4 w-12" /></div></TableCell>
          <TableCell><div className="flex justify-end gap-1"><Skeleton className="h-7 w-7 rounded-md" /><Skeleton className="h-7 w-7 rounded-md" /></div></TableCell>
        </TableRow>
      ))}
    </>
  );
}

// ─── 타입 ────────────────────────────────────────────────────

interface LaborPreset {
  id: string;
  name: string;
  description: string | null;
  unitRate: string;
  memo: string | null;
}

interface PackageLaborItem {
  id?: string;
  laborPresetId: string;
  name: string;
  unitRate: string;
  quantity: string;
  _deleted?: boolean;
}

interface PackagePartItem {
  id?: string;
  productId: string;
  productName: string;
  unitPrice: string;
  quantity: string;
  _deleted?: boolean;
}

interface RepairPackage {
  id: string;
  name: string;
  description: string | null;
  memo: string | null;
  labors: { id: string; laborPresetId: string | null; name: string; unitRate: string; quantity: number; laborPreset: LaborPreset | null }[];
  parts: { id: string; productId: string; quantity: string; unitPrice: string; product: { id: string; name: string; sku: string } }[];
}

interface ProductLite {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
}

// ─── 메인 ────────────────────────────────────────────────────

export default function RepairServicesPage() {
  const [tab, setTab] = useState<"presets" | "packages">("presets");

  // 공임 프리셋
  const [presets, setPresets] = useState<LaborPreset[]>([]);
  const [presetSearch, setPresetSearch] = useState("");
  const [presetLoading, setPresetLoading] = useState(false);
  const [presetSheet, setPresetSheet] = useState(false);
  const [presetEdit, setPresetEdit] = useState<LaborPreset | null>(null);
  const [presetForm, setPresetForm] = useState({ name: "", description: "", unitRate: "0", memo: "" });
  const [presetSubmitting, setPresetSubmitting] = useState(false);

  // 수리 패키지
  const [packages, setPackages] = useState<RepairPackage[]>([]);
  const [pkgSearch, setPkgSearch] = useState("");
  const [pkgLoading, setPkgLoading] = useState(false);
  const [pkgSheet, setPkgSheet] = useState(false);
  const [pkgEdit, setPkgEdit] = useState<RepairPackage | null>(null);
  const [pkgForm, setPkgForm] = useState({ name: "", description: "", memo: "" });
  const [pkgLabors, setPkgLabors] = useState<PackageLaborItem[]>([]);
  const [pkgParts, setPkgParts] = useState<PackagePartItem[]>([]);
  const [pkgSubmitting, setPkgSubmitting] = useState(false);

  // 패키지 Sheet 내 공임 추가 폼
  const [laborAddForm, setLaborAddForm] = useState({ laborPresetId: "", name: "", unitRate: "0", quantity: "1" });
  // 패키지 Sheet 내 부품 추가 폼
  const [partAddForm, setPartAddForm] = useState({ productId: "", quantity: "1", unitPrice: "0" });

  const [products, setProducts] = useState<ProductLite[]>([]);

  const loadPresets = useCallback(async () => {
    setPresetLoading(true);
    const res = await fetch(`/api/repair-labor-presets${presetSearch ? `?search=${encodeURIComponent(presetSearch)}` : ""}`);
    if (res.ok) setPresets(await res.json());
    setPresetLoading(false);
  }, [presetSearch]);

  const loadPackages = useCallback(async () => {
    setPkgLoading(true);
    const res = await fetch(`/api/repair-packages${pkgSearch ? `?search=${encodeURIComponent(pkgSearch)}` : ""}`);
    if (res.ok) setPackages(await res.json());
    setPkgLoading(false);
  }, [pkgSearch]);

  useEffect(() => { loadPresets(); }, [loadPresets]);
  useEffect(() => { loadPackages(); }, [loadPackages]);
  useEffect(() => {
    fetch("/api/products").then((r) => r.ok ? r.json() : []).then((d) => {
      setProducts(Array.isArray(d) ? d : d.items ?? []);
    });
  }, []);

  // ── 공임 프리셋 CRUD ──────────────────────────────────────

  const openPresetCreate = () => {
    setPresetEdit(null);
    setPresetForm({ name: "", description: "", unitRate: "0", memo: "" });
    setPresetSheet(true);
  };

  const openPresetEdit = (p: LaborPreset) => {
    setPresetEdit(p);
    setPresetForm({ name: p.name, description: p.description ?? "", unitRate: String(p.unitRate), memo: p.memo ?? "" });
    setPresetSheet(true);
  };

  const savePreset = async () => {
    if (!presetForm.name.trim()) { toast.error("이름을 입력하세요"); return; }
    setPresetSubmitting(true);
    try {
      const body = {
        name: presetForm.name.trim(),
        description: presetForm.description || undefined,
        unitRate: parseFloat(parseComma(presetForm.unitRate)) || 0,
        memo: presetForm.memo || undefined,
      };
      const res = presetEdit
        ? await fetch(`/api/repair-labor-presets/${presetEdit.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/repair-labor-presets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      toast.success(presetEdit ? "수정됐습니다" : "등록됐습니다");
      setPresetSheet(false);
      loadPresets();
    } catch {
      toast.error("저장 실패");
    } finally {
      setPresetSubmitting(false);
    }
  };

  const deletePreset = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    const res = await fetch(`/api/repair-labor-presets/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("삭제됐습니다"); loadPresets(); }
    else toast.error("삭제 실패");
  };

  // ── 수리 패키지 CRUD ──────────────────────────────────────

  const openPkgCreate = () => {
    setPkgEdit(null);
    setPkgForm({ name: "", description: "", memo: "" });
    setPkgLabors([]);
    setPkgParts([]);
    setLaborAddForm({ laborPresetId: "", name: "", unitRate: "0", quantity: "1" });
    setPartAddForm({ productId: "", quantity: "1", unitPrice: "0" });
    setPkgSheet(true);
  };

  const openPkgEdit = (pkg: RepairPackage) => {
    setPkgEdit(pkg);
    setPkgForm({ name: pkg.name, description: pkg.description ?? "", memo: pkg.memo ?? "" });
    setPkgLabors(pkg.labors.map((l) => ({
      id: l.id,
      laborPresetId: l.laborPresetId ?? "",
      name: l.name,
      unitRate: String(l.unitRate),
      quantity: String(l.quantity),
    })));
    setPkgParts(pkg.parts.map((p) => ({
      id: p.id,
      productId: p.productId,
      productName: p.product.name,
      unitPrice: String(p.unitPrice),
      quantity: String(p.quantity),
    })));
    setLaborAddForm({ laborPresetId: "", name: "", unitRate: "0", quantity: "1" });
    setPartAddForm({ productId: "", quantity: "1", unitPrice: "0" });
    setPkgSheet(true);
  };

  const addLaborToPkg = () => {
    const name = laborAddForm.name.trim() || presets.find((p) => p.id === laborAddForm.laborPresetId)?.name;
    if (!name) { toast.error("공임 이름을 입력하세요"); return; }
    setPkgLabors([...pkgLabors, {
      laborPresetId: laborAddForm.laborPresetId,
      name,
      unitRate: laborAddForm.unitRate,
      quantity: laborAddForm.quantity,
    }]);
    setLaborAddForm({ laborPresetId: "", name: "", unitRate: "0", quantity: "1" });
  };

  const addPartToPkg = () => {
    const prod = products.find((p) => p.id === partAddForm.productId);
    if (!prod) { toast.error("상품을 선택하세요"); return; }
    setPkgParts([...pkgParts, {
      productId: prod.id,
      productName: prod.name,
      unitPrice: partAddForm.unitPrice,
      quantity: partAddForm.quantity,
    }]);
    setPartAddForm({ productId: "", quantity: "1", unitPrice: "0" });
  };

  const savePkg = async () => {
    if (!pkgForm.name.trim()) { toast.error("패키지 이름을 입력하세요"); return; }
    setPkgSubmitting(true);
    try {
      const activeLabors = pkgLabors.filter((l) => !l._deleted);
      const activeParts = pkgParts.filter((p) => !p._deleted);

      if (pkgEdit) {
        // 기존 패키지 편집: 기본정보 PUT + 삭제된 항목 DELETE + 새 항목 POST
        await fetch(`/api/repair-packages/${pkgEdit.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: pkgForm.name.trim(), description: pkgForm.description || null, memo: pkgForm.memo || null }),
        });

        const deletedLaborIds = pkgLabors.filter((l) => l._deleted && l.id).map((l) => l.id!);
        const deletedPartIds = pkgParts.filter((p) => p._deleted && p.id).map((p) => p.id!);
        await Promise.all([
          ...deletedLaborIds.map((lid) => fetch(`/api/repair-packages/${pkgEdit.id}/labors/${lid}`, { method: "DELETE" })),
          ...deletedPartIds.map((pid) => fetch(`/api/repair-packages/${pkgEdit.id}/parts/${pid}`, { method: "DELETE" })),
        ]);

        const newLabors = activeLabors.filter((l) => !l.id);
        const newParts = activeParts.filter((p) => !p.id);
        await Promise.all([
          ...newLabors.map((l) => fetch(`/api/repair-packages/${pkgEdit.id}/labors`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ laborPresetId: l.laborPresetId || null, name: l.name, unitRate: parseFloat(parseComma(l.unitRate)) || 0, quantity: parseInt(l.quantity) || 1 }),
          })),
          ...newParts.map((p) => fetch(`/api/repair-packages/${pkgEdit.id}/parts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId: p.productId, quantity: parseFloat(p.quantity) || 1, unitPrice: parseFloat(parseComma(p.unitPrice)) || 0 }),
          })),
        ]);
      } else {
        await fetch("/api/repair-packages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: pkgForm.name.trim(),
            description: pkgForm.description || null,
            memo: pkgForm.memo || null,
            labors: activeLabors.map((l) => ({ laborPresetId: l.laborPresetId || null, name: l.name, unitRate: parseFloat(parseComma(l.unitRate)) || 0, quantity: parseInt(l.quantity) || 1 })),
            parts: activeParts.map((p) => ({ productId: p.productId, quantity: parseFloat(p.quantity) || 1, unitPrice: parseFloat(parseComma(p.unitPrice)) || 0 })),
          }),
        });
      }

      toast.success(pkgEdit ? "수정됐습니다" : "등록됐습니다");
      setPkgSheet(false);
      loadPackages();
    } catch {
      toast.error("저장 실패");
    } finally {
      setPkgSubmitting(false);
    }
  };

  const deletePkg = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    const res = await fetch(`/api/repair-packages/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("삭제됐습니다"); loadPackages(); }
    else toast.error("삭제 실패");
  };

  // ── 렌더 ──────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      {/* 탭 */}
      <div className="flex items-center gap-1 border-b border-border px-5 py-2">
        {(["presets", "packages"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${tab === t ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
          >
            {t === "presets" ? "공임 프리셋" : "수리 패키지"}
          </button>
        ))}
      </div>

      {/* ── 공임 프리셋 탭 ── */}
      {tab === "presets" && (
        <>
          <DataTableToolbar
            search={{ value: presetSearch, onChange: setPresetSearch, onSearch: loadPresets, placeholder: "이름 검색..." }}
            onRefresh={loadPresets}
            onAdd={openPresetCreate}
            addLabel="공임 추가"
            loading={presetLoading}
          />
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>설명</TableHead>
                  <TableHead className="text-right">단가</TableHead>
                  <TableHead>메모</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {presetLoading ? (
                  <RepairPresetsSkeletonRows />
                ) : presets.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">등록된 공임 프리셋이 없습니다</TableCell></TableRow>
                ) : presets.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openPresetEdit(p)}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-muted-foreground">{p.description ?? "-"}</TableCell>
                    <TableCell className="text-right">₩{Number(p.unitRate).toLocaleString("ko-KR")}</TableCell>
                    <TableCell className="text-muted-foreground">{p.memo ?? "-"}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openPresetEdit(p); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); deletePreset(p.id); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* ── 수리 패키지 탭 ── */}
      {tab === "packages" && (
        <>
          <DataTableToolbar
            search={{ value: pkgSearch, onChange: setPkgSearch, onSearch: loadPackages, placeholder: "패키지명 검색..." }}
            onRefresh={loadPackages}
            onAdd={openPkgCreate}
            addLabel="패키지 추가"
            loading={pkgLoading}
          />
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>패키지명</TableHead>
                  <TableHead>설명</TableHead>
                  <TableHead className="text-right">공임</TableHead>
                  <TableHead className="text-right">부품</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pkgLoading ? (
                  <RepairPackagesSkeletonRows />
                ) : packages.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">등록된 수리 패키지가 없습니다</TableCell></TableRow>
                ) : packages.map((pkg) => (
                  <TableRow key={pkg.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openPkgEdit(pkg)}>
                    <TableCell className="font-medium">{pkg.name}</TableCell>
                    <TableCell className="text-muted-foreground">{pkg.description ?? "-"}</TableCell>
                    <TableCell className="text-right">{pkg.labors.length}건</TableCell>
                    <TableCell className="text-right">{pkg.parts.length}건</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openPkgEdit(pkg); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); deletePkg(pkg.id); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* ── 공임 프리셋 Sheet ── */}
      <Sheet open={presetSheet} onOpenChange={setPresetSheet}>
        <SheetContent side="bottom" className="flex h-[90vh] flex-col p-0">
          <SheetHeader className="border-b border-border px-5 py-4">
            <SheetTitle>{presetEdit ? "공임 수정" : "공임 프리셋 추가"}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-4 p-5">
              <FieldRow label="이름" required>
                <Input value={presetForm.name} onChange={(e) => setPresetForm({ ...presetForm, name: e.target.value })} />
              </FieldRow>
              <FieldRow label="설명">
                <Input value={presetForm.description} onChange={(e) => setPresetForm({ ...presetForm, description: e.target.value })} />
              </FieldRow>
              <FieldRow label="단가" required>
                <Input
                  type="text"
                  inputMode="numeric"
                  className="text-right"
                  value={formatComma(presetForm.unitRate)}
                  onChange={(e) => setPresetForm({ ...presetForm, unitRate: parseComma(e.target.value) })}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </FieldRow>
              <FieldRow label="메모">
                <Input value={presetForm.memo} onChange={(e) => setPresetForm({ ...presetForm, memo: e.target.value })} />
              </FieldRow>
            </div>
          </ScrollArea>
          <div className="flex justify-end gap-2 border-t border-border bg-background px-5 py-4">
            <Button variant="outline" onClick={() => setPresetSheet(false)}>취소</Button>
            <Button onClick={savePreset} disabled={presetSubmitting}>
              {presetSubmitting ? <Loader2 className="animate-spin" /> : null}
              {presetEdit ? "수정" : "등록"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── 수리 패키지 Sheet ── */}
      <Sheet open={pkgSheet} onOpenChange={setPkgSheet}>
        <SheetContent side="bottom" className="flex h-[90vh] flex-col p-0">
          <SheetHeader className="border-b border-border px-5 py-4">
            <SheetTitle>{pkgEdit ? "패키지 수정" : "수리 패키지 추가"}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-5 p-5">
              {/* 기본 정보 */}
              <section>
                <div className="mb-3 text-sm font-semibold">기본 정보</div>
                <div className="space-y-3">
                  <FieldRow label="패키지명" required>
                    <Input value={pkgForm.name} onChange={(e) => setPkgForm({ ...pkgForm, name: e.target.value })} />
                  </FieldRow>
                  <FieldRow label="설명">
                    <Input value={pkgForm.description} onChange={(e) => setPkgForm({ ...pkgForm, description: e.target.value })} />
                  </FieldRow>
                  <FieldRow label="메모">
                    <Input value={pkgForm.memo} onChange={(e) => setPkgForm({ ...pkgForm, memo: e.target.value })} />
                  </FieldRow>
                </div>
              </section>

              {/* 공임 항목 */}
              <section>
                <div className="mb-2 text-sm font-semibold">공임 항목</div>
                <div className="rounded-lg border border-border">
                  {pkgLabors.filter((l) => !l._deleted).length > 0 ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted text-xs text-muted-foreground">
                          <th className="px-3 py-2 text-left">이름</th>
                          <th className="px-3 py-2 text-right">수량</th>
                          <th className="px-3 py-2 text-right">단가</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {pkgLabors.map((l, idx) => l._deleted ? null : (
                          <tr key={idx} className="border-b border-border last:border-0">
                            <td className="px-3 py-2">{l.name}</td>
                            <td className="px-3 py-2 text-right">{l.quantity}</td>
                            <td className="px-3 py-2 text-right">₩{Number(parseComma(l.unitRate)).toLocaleString("ko-KR")}</td>
                            <td className="px-3 py-2 text-right">
                              <button onClick={() => setPkgLabors(pkgLabors.map((item, i) => i === idx ? { ...item, _deleted: true } : item))}>
                                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                  <div className="p-3">
                    <div className="mb-2 text-xs text-muted-foreground">공임 추가</div>
                    <div className="flex gap-2">
                      <select
                        className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm"
                        value={laborAddForm.laborPresetId}
                        onChange={(e) => {
                          const preset = presets.find((p) => p.id === e.target.value);
                          setLaborAddForm({ ...laborAddForm, laborPresetId: e.target.value, name: preset?.name ?? "", unitRate: preset ? String(preset.unitRate) : "0" });
                        }}
                      >
                        <option value="">프리셋 선택 (선택사항)</option>
                        {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <Input
                        className="h-8 w-32"
                        placeholder="이름"
                        value={laborAddForm.name}
                        onChange={(e) => setLaborAddForm({ ...laborAddForm, name: e.target.value })}
                      />
                      <Input
                        className="h-8 w-24 text-right"
                        type="text"
                        inputMode="numeric"
                        value={formatComma(laborAddForm.unitRate)}
                        onChange={(e) => setLaborAddForm({ ...laborAddForm, unitRate: parseComma(e.target.value) })}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <Button size="sm" variant="outline" className="h-8" onClick={addLaborToPkg}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </section>

              {/* 부품 항목 */}
              <section>
                <div className="mb-2 text-sm font-semibold">부품 항목</div>
                <div className="rounded-lg border border-border">
                  {pkgParts.filter((p) => !p._deleted).length > 0 ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted text-xs text-muted-foreground">
                          <th className="px-3 py-2 text-left">상품명</th>
                          <th className="px-3 py-2 text-right">수량</th>
                          <th className="px-3 py-2 text-right">단가</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {pkgParts.map((p, idx) => p._deleted ? null : (
                          <tr key={idx} className="border-b border-border last:border-0">
                            <td className="px-3 py-2">{p.productName}</td>
                            <td className="px-3 py-2 text-right">{p.quantity}</td>
                            <td className="px-3 py-2 text-right">₩{Number(parseComma(p.unitPrice)).toLocaleString("ko-KR")}</td>
                            <td className="px-3 py-2 text-right">
                              <button onClick={() => setPkgParts(pkgParts.map((item, i) => i === idx ? { ...item, _deleted: true } : item))}>
                                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                  <div className="p-3">
                    <div className="mb-2 text-xs text-muted-foreground">부품 추가</div>
                    <div className="flex gap-2">
                      <select
                        className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm"
                        value={partAddForm.productId}
                        onChange={(e) => {
                          const prod = products.find((p) => p.id === e.target.value);
                          setPartAddForm({ ...partAddForm, productId: e.target.value, unitPrice: prod ? String(prod.sellingPrice) : "0" });
                        }}
                      >
                        <option value="">상품 선택...</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                      </select>
                      <Input
                        className="h-8 w-16 text-right"
                        placeholder="수량"
                        value={partAddForm.quantity}
                        onChange={(e) => setPartAddForm({ ...partAddForm, quantity: e.target.value })}
                      />
                      <Input
                        className="h-8 w-24 text-right"
                        type="text"
                        inputMode="numeric"
                        value={formatComma(partAddForm.unitPrice)}
                        onChange={(e) => setPartAddForm({ ...partAddForm, unitPrice: parseComma(e.target.value) })}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <Button size="sm" variant="outline" className="h-8" onClick={addPartToPkg}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </ScrollArea>
          <div className="flex justify-end gap-2 border-t border-border bg-background px-5 py-4">
            <Button variant="outline" onClick={() => setPkgSheet(false)}>취소</Button>
            <Button onClick={savePkg} disabled={pkgSubmitting}>
              {pkgSubmitting ? <Loader2 className="animate-spin" /> : null}
              {pkgEdit ? "수정" : "등록"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FieldRow({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3">
      <span className="text-right text-sm text-muted-foreground">
        {label}{required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </span>
      {children}
    </div>
  );
}
