"use client";

import { useState } from "react";
import { focusCaretEnd } from "@/jm/lib/focus";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { toast } from "sonner";
import { Loader2, Pencil, Trash2, Plus, X, RefreshCw } from "lucide-react";
import {
  JmButton,
  JmCard,
  JmInput,
  JmIconButton,
  JmSearchInput,
  JmSelect,
  JmSkeleton,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
  JmTableToolbar,
  JmTableToolbarActions,
  JmTableToolbarSearch,
  JmTabs,
  JmTabsList,
  JmTabsTrigger,
  JmTabsIndicator,
  JmTabsPanel,
  JmDrawer,
  JmDrawerBody,
  JmDrawerContent,
  JmDrawerFooter,
  JmDrawerHeader,
  JmDrawerTitle,
} from "@/jm";
import { formatComma, parseComma } from "@/lib/utils";

function RepairPresetsSkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <JmTableRow key={i} className="hover:bg-transparent">
          <JmTableCell><JmSkeleton className="h-4 w-32" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-48" /></JmTableCell>
          <JmTableCell><div className="flex justify-end"><JmSkeleton className="h-4 w-16" /></div></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-32" /></JmTableCell>
          <JmTableCell><div className="flex justify-end gap-1"><JmSkeleton className="h-7 w-7 rounded-md" /><JmSkeleton className="h-7 w-7 rounded-md" /></div></JmTableCell>
        </JmTableRow>
      ))}
    </>
  );
}

function RepairPackagesSkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <JmTableRow key={i} className="hover:bg-transparent">
          <JmTableCell><JmSkeleton className="h-4 w-32" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-48" /></JmTableCell>
          <JmTableCell><div className="flex justify-end"><JmSkeleton className="h-4 w-12" /></div></JmTableCell>
          <JmTableCell><div className="flex justify-end"><JmSkeleton className="h-4 w-12" /></div></JmTableCell>
          <JmTableCell><div className="flex justify-end gap-1"><JmSkeleton className="h-7 w-7 rounded-md" /><JmSkeleton className="h-7 w-7 rounded-md" /></div></JmTableCell>
        </JmTableRow>
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
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"presets" | "packages">("presets");

  // 공임 프리셋
  const [presetSearch, setPresetSearch] = useState("");
  const [presetSheet, setPresetSheet] = useState(false);
  const [presetEdit, setPresetEdit] = useState<LaborPreset | null>(null);
  const [presetForm, setPresetForm] = useState({ name: "", description: "", unitRate: "0", memo: "" });

  // 수리 패키지
  const [pkgSearch, setPkgSearch] = useState("");
  const [pkgSheet, setPkgSheet] = useState(false);
  const [pkgEdit, setPkgEdit] = useState<RepairPackage | null>(null);
  const [pkgForm, setPkgForm] = useState({ name: "", description: "", memo: "" });
  const [pkgLabors, setPkgLabors] = useState<PackageLaborItem[]>([]);
  const [pkgParts, setPkgParts] = useState<PackagePartItem[]>([]);

  // 패키지 Sheet 내 공임 추가 폼
  const [laborAddForm, setLaborAddForm] = useState({ laborPresetId: "", name: "", unitRate: "0", quantity: "1" });
  // 패키지 Sheet 내 부품 추가 폼
  const [partAddForm, setPartAddForm] = useState({ productId: "", quantity: "1", unitPrice: "0" });

  const presetsQuery = useQuery({
    queryKey: queryKeys.repairServices.presets({ search: presetSearch }),
    queryFn: () => apiGet<LaborPreset[]>(`/api/repair-labor-presets${presetSearch ? `?search=${encodeURIComponent(presetSearch)}` : ""}`),
  });
  const presets = presetsQuery.data ?? [];
  const presetLoading = presetsQuery.isPending;

  const packagesQuery = useQuery({
    queryKey: queryKeys.repairServices.packages({ search: pkgSearch }),
    queryFn: () => apiGet<RepairPackage[]>(`/api/repair-packages${pkgSearch ? `?search=${encodeURIComponent(pkgSearch)}` : ""}`),
  });
  const packages = packagesQuery.data ?? [];
  const pkgLoading = packagesQuery.isPending;

  const productsQuery = useQuery({
    queryKey: queryKeys.products.list({ scope: "repair-services" }),
    queryFn: async () => {
      const d = await apiGet<ProductLite[] | { items: ProductLite[] }>("/api/products");
      return Array.isArray(d) ? d : d.items ?? [];
    },
  });
  const products = productsQuery.data ?? [];

  const refreshPresets = () => queryClient.invalidateQueries({ queryKey: ["repair-services", "presets"] });
  const refreshPackages = () => queryClient.invalidateQueries({ queryKey: ["repair-services", "packages"] });
  const loadPresets = refreshPresets;
  const loadPackages = refreshPackages;

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

  const savePresetMutation = useMutation({
    mutationFn: () => {
      if (!presetForm.name.trim()) throw new Error("이름을 입력하세요");
      const body = {
        name: presetForm.name.trim(),
        description: presetForm.description || undefined,
        unitRate: parseFloat(parseComma(presetForm.unitRate)) || 0,
        memo: presetForm.memo || undefined,
      };
      return presetEdit
        ? apiMutate(`/api/repair-labor-presets/${presetEdit.id}`, "PUT", body)
        : apiMutate("/api/repair-labor-presets", "POST", body);
    },
    onSuccess: () => {
      toast.success(presetEdit ? "수정됐습니다" : "등록됐습니다");
      setPresetSheet(false);
      refreshPresets();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : err.message || "저장 실패"),
  });
  const presetSubmitting = savePresetMutation.isPending;
  const savePreset = () => savePresetMutation.mutate();

  const deletePresetMutation = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/repair-labor-presets/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("삭제됐습니다");
      refreshPresets();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "삭제 실패"),
  });
  const deletePreset = (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    deletePresetMutation.mutate(id);
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

  const savePkgMutation = useMutation({
    mutationFn: async () => {
      if (!pkgForm.name.trim()) throw new Error("패키지 이름을 입력하세요");
      const activeLabors = pkgLabors.filter((l) => !l._deleted);
      const activeParts = pkgParts.filter((p) => !p._deleted);

      if (pkgEdit) {
        // 기존 패키지 편집: 기본정보 PUT + 삭제된 항목 DELETE + 새 항목 POST
        await apiMutate(`/api/repair-packages/${pkgEdit.id}`, "PUT", {
          name: pkgForm.name.trim(),
          description: pkgForm.description || null,
          memo: pkgForm.memo || null,
        });

        const deletedLaborIds = pkgLabors.filter((l) => l._deleted && l.id).map((l) => l.id!);
        const deletedPartIds = pkgParts.filter((p) => p._deleted && p.id).map((p) => p.id!);
        await Promise.all([
          ...deletedLaborIds.map((lid) => apiMutate(`/api/repair-packages/${pkgEdit.id}/labors/${lid}`, "DELETE")),
          ...deletedPartIds.map((pid) => apiMutate(`/api/repair-packages/${pkgEdit.id}/parts/${pid}`, "DELETE")),
        ]);

        const newLabors = activeLabors.filter((l) => !l.id);
        const newParts = activeParts.filter((p) => !p.id);
        await Promise.all([
          ...newLabors.map((l) => apiMutate(`/api/repair-packages/${pkgEdit.id}/labors`, "POST", {
            laborPresetId: l.laborPresetId || null,
            name: l.name,
            unitRate: parseFloat(parseComma(l.unitRate)) || 0,
            quantity: parseInt(l.quantity) || 1,
          })),
          ...newParts.map((p) => apiMutate(`/api/repair-packages/${pkgEdit.id}/parts`, "POST", {
            productId: p.productId,
            quantity: parseFloat(p.quantity) || 1,
            unitPrice: parseFloat(parseComma(p.unitPrice)) || 0,
          })),
        ]);
      } else {
        await apiMutate("/api/repair-packages", "POST", {
          name: pkgForm.name.trim(),
          description: pkgForm.description || null,
          memo: pkgForm.memo || null,
          labors: activeLabors.map((l) => ({ laborPresetId: l.laborPresetId || null, name: l.name, unitRate: parseFloat(parseComma(l.unitRate)) || 0, quantity: parseInt(l.quantity) || 1 })),
          parts: activeParts.map((p) => ({ productId: p.productId, quantity: parseFloat(p.quantity) || 1, unitPrice: parseFloat(parseComma(p.unitPrice)) || 0 })),
        });
      }
    },
    onSuccess: () => {
      toast.success(pkgEdit ? "수정됐습니다" : "등록됐습니다");
      setPkgSheet(false);
      refreshPackages();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : err.message || "저장 실패"),
  });
  const pkgSubmitting = savePkgMutation.isPending;
  const savePkg = () => savePkgMutation.mutate();

  const deletePkgMutation = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/repair-packages/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("삭제됐습니다");
      refreshPackages();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "삭제 실패"),
  });
  const deletePkg = (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    deletePkgMutation.mutate(id);
  };

  // ── 렌더 ──────────────────────────────────────────────────

  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="flex w-full flex-col gap-6 p-4">
        {/* 탭 */}
        <JmTabs value={tab} onValueChange={(v) => setTab(v as "presets" | "packages")}>
          <JmTabsList variant="line">
            <JmTabsTrigger value="presets">공임 프리셋</JmTabsTrigger>
            <JmTabsTrigger value="packages">수리 패키지</JmTabsTrigger>
            <JmTabsIndicator />
          </JmTabsList>

          {/* ── 공임 프리셋 탭 ── */}
          <JmTabsPanel value="presets">
            <JmCard className="overflow-hidden p-0">
              <JmTableToolbar>
                <JmTableToolbarSearch>
                  <JmSearchInput
                    size="sm"
                    value={presetSearch}
                    onChange={(e) => setPresetSearch(e.target.value)}
                    onClear={() => setPresetSearch("")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) loadPresets();
                    }}
                    placeholder="이름 검색..."
                  />
                </JmTableToolbarSearch>
                <JmTableToolbarActions>
                  <JmIconButton
                    variant="outline"
                    size="sm"
                    aria-label="새로고침"
                    onClick={loadPresets}
                  >
                    <RefreshCw className={presetLoading ? "animate-spin" : ""} />
                  </JmIconButton>
                  <JmButton size="sm" onClick={openPresetCreate}>
                    <Plus className="size-3.5" />
                    공임 추가
                  </JmButton>
                </JmTableToolbarActions>
              </JmTableToolbar>

              <JmTable className="min-w-[640px]">
                <JmTableHeader>
                  <JmTableRow>
                    <JmTableHead>이름</JmTableHead>
                    <JmTableHead>설명</JmTableHead>
                    <JmTableHead className="text-right">단가</JmTableHead>
                    <JmTableHead>메모</JmTableHead>
                    <JmTableHead className="w-16"></JmTableHead>
                  </JmTableRow>
                </JmTableHeader>
                <JmTableBody>
                  {presetLoading ? (
                    <RepairPresetsSkeletonRows />
                  ) : presets.length === 0 ? (
                    <JmTableRow className="hover:bg-transparent"><JmTableCell colSpan={5} className="py-8 text-center text-[var(--jm-text-muted)]">등록된 공임 프리셋이 없습니다</JmTableCell></JmTableRow>
                  ) : presets.map((p) => (
                    <JmTableRow key={p.id} className="cursor-pointer" onClick={() => openPresetEdit(p)}>
                      <JmTableCell className="font-medium">{p.name}</JmTableCell>
                      <JmTableCell className="text-[var(--jm-text-muted)]">{p.description ?? "-"}</JmTableCell>
                      <JmTableCell className="text-right">₩{Number(p.unitRate).toLocaleString("ko-KR")}</JmTableCell>
                      <JmTableCell className="text-[var(--jm-text-muted)]">{p.memo ?? "-"}</JmTableCell>
                      <JmTableCell>
                        <div className="flex justify-end gap-1">
                          <JmIconButton variant="ghost" size="sm" aria-label="수정" className="size-7" onClick={(e) => { e.stopPropagation(); openPresetEdit(p); }}>
                            <Pencil className="size-3.5" />
                          </JmIconButton>
                          <JmIconButton variant="ghost" size="sm" aria-label="삭제" className="size-7 text-[var(--jm-danger-fg)] hover:text-[var(--jm-danger-fg)]" onClick={(e) => { e.stopPropagation(); deletePreset(p.id); }}>
                            <Trash2 className="size-3.5" />
                          </JmIconButton>
                        </div>
                      </JmTableCell>
                    </JmTableRow>
                  ))}
                </JmTableBody>
              </JmTable>
            </JmCard>
          </JmTabsPanel>

          {/* ── 수리 패키지 탭 ── */}
          <JmTabsPanel value="packages">
            <JmCard className="overflow-hidden p-0">
              <JmTableToolbar>
                <JmTableToolbarSearch>
                  <JmSearchInput
                    size="sm"
                    value={pkgSearch}
                    onChange={(e) => setPkgSearch(e.target.value)}
                    onClear={() => setPkgSearch("")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) loadPackages();
                    }}
                    placeholder="패키지명 검색..."
                  />
                </JmTableToolbarSearch>
                <JmTableToolbarActions>
                  <JmIconButton
                    variant="outline"
                    size="sm"
                    aria-label="새로고침"
                    onClick={loadPackages}
                  >
                    <RefreshCw className={pkgLoading ? "animate-spin" : ""} />
                  </JmIconButton>
                  <JmButton size="sm" onClick={openPkgCreate}>
                    <Plus className="size-3.5" />
                    패키지 추가
                  </JmButton>
                </JmTableToolbarActions>
              </JmTableToolbar>

              <JmTable className="min-w-[640px]">
                <JmTableHeader>
                  <JmTableRow>
                    <JmTableHead>패키지명</JmTableHead>
                    <JmTableHead>설명</JmTableHead>
                    <JmTableHead className="text-right">공임</JmTableHead>
                    <JmTableHead className="text-right">부품</JmTableHead>
                    <JmTableHead className="w-16"></JmTableHead>
                  </JmTableRow>
                </JmTableHeader>
                <JmTableBody>
                  {pkgLoading ? (
                    <RepairPackagesSkeletonRows />
                  ) : packages.length === 0 ? (
                    <JmTableRow className="hover:bg-transparent"><JmTableCell colSpan={5} className="py-8 text-center text-[var(--jm-text-muted)]">등록된 수리 패키지가 없습니다</JmTableCell></JmTableRow>
                  ) : packages.map((pkg) => (
                    <JmTableRow key={pkg.id} className="cursor-pointer" onClick={() => openPkgEdit(pkg)}>
                      <JmTableCell className="font-medium">{pkg.name}</JmTableCell>
                      <JmTableCell className="text-[var(--jm-text-muted)]">{pkg.description ?? "-"}</JmTableCell>
                      <JmTableCell className="text-right">{pkg.labors.length}건</JmTableCell>
                      <JmTableCell className="text-right">{pkg.parts.length}건</JmTableCell>
                      <JmTableCell>
                        <div className="flex justify-end gap-1">
                          <JmIconButton variant="ghost" size="sm" aria-label="수정" className="size-7" onClick={(e) => { e.stopPropagation(); openPkgEdit(pkg); }}>
                            <Pencil className="size-3.5" />
                          </JmIconButton>
                          <JmIconButton variant="ghost" size="sm" aria-label="삭제" className="size-7 text-[var(--jm-danger-fg)] hover:text-[var(--jm-danger-fg)]" onClick={(e) => { e.stopPropagation(); deletePkg(pkg.id); }}>
                            <Trash2 className="size-3.5" />
                          </JmIconButton>
                        </div>
                      </JmTableCell>
                    </JmTableRow>
                  ))}
                </JmTableBody>
              </JmTable>
            </JmCard>
          </JmTabsPanel>
        </JmTabs>
      </div>

      {/* ── 공임 프리셋 Sheet ── */}
      <JmDrawer open={presetSheet} onOpenChange={setPresetSheet}>
        <JmDrawerContent side="bottom" size="xl">
          <JmDrawerHeader>
            <JmDrawerTitle>{presetEdit ? "공임 수정" : "공임 프리셋 추가"}</JmDrawerTitle>
          </JmDrawerHeader>
          <JmDrawerBody>
            <div className="space-y-4">
              <FieldRow label="이름" required>
                <JmInput size="sm" value={presetForm.name} onChange={(e) => setPresetForm({ ...presetForm, name: e.target.value })} />
              </FieldRow>
              <FieldRow label="설명">
                <JmInput size="sm" value={presetForm.description} onChange={(e) => setPresetForm({ ...presetForm, description: e.target.value })} />
              </FieldRow>
              <FieldRow label="단가" required>
                <JmInput
                  size="sm"
                  type="text"
                  inputMode="numeric"
                  className="text-right"
                  value={formatComma(presetForm.unitRate)}
                  onChange={(e) => setPresetForm({ ...presetForm, unitRate: parseComma(e.target.value) })}
                  onFocus={focusCaretEnd}
                />
              </FieldRow>
              <FieldRow label="메모">
                <JmInput size="sm" value={presetForm.memo} onChange={(e) => setPresetForm({ ...presetForm, memo: e.target.value })} />
              </FieldRow>
            </div>
          </JmDrawerBody>
          <JmDrawerFooter>
            <JmButton variant="outline" size="sm" onClick={() => setPresetSheet(false)}>취소</JmButton>
            <JmButton size="sm" onClick={savePreset} disabled={presetSubmitting}>
              {presetSubmitting ? <Loader2 className="animate-spin" /> : null}
              {presetEdit ? "수정" : "등록"}
            </JmButton>
          </JmDrawerFooter>
        </JmDrawerContent>
      </JmDrawer>

      {/* ── 수리 패키지 Sheet ── */}
      <JmDrawer open={pkgSheet} onOpenChange={setPkgSheet}>
        <JmDrawerContent side="bottom" size="xl">
          <JmDrawerHeader>
            <JmDrawerTitle>{pkgEdit ? "패키지 수정" : "수리 패키지 추가"}</JmDrawerTitle>
          </JmDrawerHeader>
          <JmDrawerBody>
            <div className="space-y-5">
              {/* 기본 정보 */}
              <section>
                <div className="mb-3 text-jm-sm font-semibold">기본 정보</div>
                <div className="space-y-3">
                  <FieldRow label="패키지명" required>
                    <JmInput size="sm" value={pkgForm.name} onChange={(e) => setPkgForm({ ...pkgForm, name: e.target.value })} />
                  </FieldRow>
                  <FieldRow label="설명">
                    <JmInput size="sm" value={pkgForm.description} onChange={(e) => setPkgForm({ ...pkgForm, description: e.target.value })} />
                  </FieldRow>
                  <FieldRow label="메모">
                    <JmInput size="sm" value={pkgForm.memo} onChange={(e) => setPkgForm({ ...pkgForm, memo: e.target.value })} />
                  </FieldRow>
                </div>
              </section>

              {/* 공임 항목 */}
              <section>
                <div className="mb-2 text-jm-sm font-semibold">공임 항목</div>
                <div className="rounded-lg border border-[var(--jm-border)]">
                  {pkgLabors.filter((l) => !l._deleted).length > 0 ? (
                    <table className="w-full text-jm-sm">
                      <thead>
                        <tr className="border-b border-[var(--jm-border)] bg-[var(--jm-surface-muted)] text-jm-xs text-[var(--jm-text-muted)]">
                          <th className="px-3 py-2 text-left">이름</th>
                          <th className="px-3 py-2 text-right">수량</th>
                          <th className="px-3 py-2 text-right">단가</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {pkgLabors.map((l, idx) => l._deleted ? null : (
                          <tr key={idx} className="border-b border-[var(--jm-border)] last:border-0">
                            <td className="px-3 py-2">{l.name}</td>
                            <td className="px-3 py-2 text-right">{l.quantity}</td>
                            <td className="px-3 py-2 text-right">₩{Number(parseComma(l.unitRate)).toLocaleString("ko-KR")}</td>
                            <td className="px-3 py-2 text-right">
                              <button onClick={() => setPkgLabors(pkgLabors.map((item, i) => i === idx ? { ...item, _deleted: true } : item))}>
                                <X className="size-3.5 text-[var(--jm-text-muted)] hover:text-[var(--jm-danger-fg)]" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                  <div className="p-3">
                    <div className="mb-2 text-jm-xs text-[var(--jm-text-muted)]">공임 추가</div>
                    <div className="flex gap-2">
                      <JmSelect
                        size="sm"
                        className="flex-1"
                        placeholder="프리셋 선택 (선택사항)"
                        value={laborAddForm.laborPresetId}
                        onChange={(v) => {
                          const preset = presets.find((p) => p.id === v);
                          setLaborAddForm({ ...laborAddForm, laborPresetId: v, name: preset?.name ?? "", unitRate: preset ? String(preset.unitRate) : "0" });
                        }}
                        options={presets.map((p) => ({ value: p.id, label: p.name }))}
                      />
                      <JmInput
                        size="sm"
                        className="w-32"
                        placeholder="이름"
                        value={laborAddForm.name}
                        onChange={(e) => setLaborAddForm({ ...laborAddForm, name: e.target.value })}
                      />
                      <JmInput
                        size="sm"
                        className="w-24 text-right"
                        type="text"
                        inputMode="numeric"
                        value={formatComma(laborAddForm.unitRate)}
                        onChange={(e) => setLaborAddForm({ ...laborAddForm, unitRate: parseComma(e.target.value) })}
                        onFocus={focusCaretEnd}
                      />
                      <JmButton size="sm" variant="outline" onClick={addLaborToPkg}>
                        <Plus className="size-3.5" />
                      </JmButton>
                    </div>
                  </div>
                </div>
              </section>

              {/* 부품 항목 */}
              <section>
                <div className="mb-2 text-jm-sm font-semibold">부품 항목</div>
                <div className="rounded-lg border border-[var(--jm-border)]">
                  {pkgParts.filter((p) => !p._deleted).length > 0 ? (
                    <table className="w-full text-jm-sm">
                      <thead>
                        <tr className="border-b border-[var(--jm-border)] bg-[var(--jm-surface-muted)] text-jm-xs text-[var(--jm-text-muted)]">
                          <th className="px-3 py-2 text-left">상품명</th>
                          <th className="px-3 py-2 text-right">수량</th>
                          <th className="px-3 py-2 text-right">단가</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {pkgParts.map((p, idx) => p._deleted ? null : (
                          <tr key={idx} className="border-b border-[var(--jm-border)] last:border-0">
                            <td className="px-3 py-2">{p.productName}</td>
                            <td className="px-3 py-2 text-right">{p.quantity}</td>
                            <td className="px-3 py-2 text-right">₩{Number(parseComma(p.unitPrice)).toLocaleString("ko-KR")}</td>
                            <td className="px-3 py-2 text-right">
                              <button onClick={() => setPkgParts(pkgParts.map((item, i) => i === idx ? { ...item, _deleted: true } : item))}>
                                <X className="size-3.5 text-[var(--jm-text-muted)] hover:text-[var(--jm-danger-fg)]" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                  <div className="p-3">
                    <div className="mb-2 text-jm-xs text-[var(--jm-text-muted)]">부품 추가</div>
                    <div className="flex gap-2">
                      <JmSelect
                        size="sm"
                        className="flex-1"
                        placeholder="상품 선택..."
                        value={partAddForm.productId}
                        onChange={(v) => {
                          const prod = products.find((p) => p.id === v);
                          setPartAddForm({ ...partAddForm, productId: v, unitPrice: prod ? String(prod.sellingPrice) : "0" });
                        }}
                        options={products.map((p) => ({ value: p.id, label: `${p.name} (${p.sku})` }))}
                      />
                      <JmInput
                        size="sm"
                        className="w-16 text-right"
                        placeholder="수량"
                        value={partAddForm.quantity}
                        onChange={(e) => setPartAddForm({ ...partAddForm, quantity: e.target.value })}
                      />
                      <JmInput
                        size="sm"
                        className="w-24 text-right"
                        type="text"
                        inputMode="numeric"
                        value={formatComma(partAddForm.unitPrice)}
                        onChange={(e) => setPartAddForm({ ...partAddForm, unitPrice: parseComma(e.target.value) })}
                        onFocus={focusCaretEnd}
                      />
                      <JmButton size="sm" variant="outline" onClick={addPartToPkg}>
                        <Plus className="size-3.5" />
                      </JmButton>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </JmDrawerBody>
          <JmDrawerFooter>
            <JmButton variant="outline" size="sm" onClick={() => setPkgSheet(false)}>취소</JmButton>
            <JmButton size="sm" onClick={savePkg} disabled={pkgSubmitting}>
              {pkgSubmitting ? <Loader2 className="animate-spin" /> : null}
              {pkgEdit ? "수정" : "등록"}
            </JmButton>
          </JmDrawerFooter>
        </JmDrawerContent>
      </JmDrawer>
    </div>
  );
}

function FieldRow({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3">
      <span className="text-right text-jm-sm text-[var(--jm-text-muted)]">
        {label}{required ? <span className="ml-0.5 text-[var(--jm-danger-fg)]">*</span> : null}
      </span>
      {children}
    </div>
  );
}
