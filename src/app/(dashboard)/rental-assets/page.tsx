"use client";

import { useMemo, useRef, useState } from "react";
import { focusCaretEnd } from "@/jm/lib/focus";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { BookOpen, ImagePlus, Loader2, Pencil, Printer, QrCode, Recycle, Trash2, X } from "lucide-react";
import {
  jmToast,
  JmBadge,
  JmButton,
  JmCheckbox,
  JmDatePicker,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmDrawer,
  JmDrawerContent,
  JmDrawerHeader,
  JmDrawerTitle,
  JmFormField,
  JmIconButton,
  JmInput,
  JmSelect,
  JmSkeleton,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
} from "@/jm";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { BrandCombobox, type BrandOption } from "@/components/brand-combobox";
import { QuickBrandSheet } from "@/components/quick-register-sheets";
import { formatComma, parseComma } from "@/lib/utils";
import { PriceInputDialog } from "@/app/(pos)/pos/_components/price-input-dialog";

const toYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// 임대 요율은 과세 — 세전 저장값을 VAT 포함 금액으로 변환해 표시.
const withVat = (net: number) => Math.round(net * 1.1);

function RentalAssetsSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <JmTableRow key={i} className="hover:bg-transparent">
          <JmTableCell><JmSkeleton className="size-10 rounded-md" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-20" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-32" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-20" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-32" /></JmTableCell>
          <JmTableCell><div className="flex justify-end"><JmSkeleton className="h-4 w-16" /></div></JmTableCell>
          <JmTableCell><div className="flex justify-end"><JmSkeleton className="h-4 w-16" /></div></JmTableCell>
          <JmTableCell><div className="flex justify-end"><JmSkeleton className="h-4 w-16" /></div></JmTableCell>
          <JmTableCell><JmSkeleton className="h-5 w-12 rounded-full" /></JmTableCell>
          <JmTableCell>
            <div className="flex justify-end gap-1">
              {Array.from({ length: 5 }).map((_, k) => (
                <JmSkeleton key={k} className="h-7 w-7 rounded-md" />
              ))}
            </div>
          </JmTableCell>
        </JmTableRow>
      ))}
    </>
  );
}

interface Asset {
  id: string;
  assetNo: string;
  name: string;
  brand: string | null;
  modelNo: string | null;
  imageUrl: string | null;
  dailyRate: string;
  monthlyRate: string;
  depositAmount: string;
  status: string;
  memo: string | null;
  acquiredAt: string | null;
}

type AssetStatus = "AVAILABLE" | "RENTED" | "MAINTENANCE" | "RETIRED";

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "대여가능",
  RENTED: "대여중",
  MAINTENANCE: "점검중",
  RETIRED: "폐기",
};

const STATUS_VARIANT: Record<string, "default" | "outline" | "solid" | "success" | "warning" | "danger" | "info" | "accent"> = {
  AVAILABLE: "success",
  RENTED: "info",
  MAINTENANCE: "warning",
  RETIRED: "danger",
};

const emptyForm = {
  name: "",
  brand: "",
  modelNo: "",
  imageUrl: "",
  dailyRate: "0",
  monthlyRate: "0",
  depositAmount: "0",
  memo: "",
  status: "AVAILABLE" as AssetStatus,
  acquiredAt: "",
};

export default function RentalAssetsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  // 요율 입력 드로워 — 어느 요율 필드를 편집 중인지
  const [priceEdit, setPriceEdit] = useState<"daily" | "monthly" | null>(null);
  const [sheet, setSheet] = useState(false);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [form, setForm] = useState(emptyForm);

  const assetsQuery = useQuery({
    queryKey: queryKeys.rentalAssets.list(),
    queryFn: () => apiGet<Asset[]>("/api/rental-assets"),
  });
  const loading = assetsQuery.isPending;

  // 브랜드 — 상품등록과 동일하게 콤보박스로 선택. 신규는 QuickBrandSheet 로 등록.
  const brandsQuery = useQuery({
    queryKey: queryKeys.brands.all,
    queryFn: () => apiGet<BrandOption[]>("/api/brands"),
  });
  const [quickBrandOpen, setQuickBrandOpen] = useState(false);
  const [quickBrandDefaultName, setQuickBrandDefaultName] = useState("");
  // RentalAsset.brand 는 자유입력 문자열 — Brand 테이블에 없는 레거시 값도 옵션으로 합성해 선택 상태 유지
  const brandOptions = useMemo<BrandOption[]>(() => {
    const list = brandsQuery.data ?? [];
    if (form.brand && !list.some((b) => b.name === form.brand)) {
      return [{ id: `__freetext__${form.brand}`, name: form.brand }, ...list];
    }
    return list;
  }, [brandsQuery.data, form.brand]);
  const selectedBrandId = useMemo(
    () => brandOptions.find((b) => b.name === form.brand)?.id ?? "",
    [brandOptions, form.brand],
  );
  const assets = useMemo(() => {
    const data = assetsQuery.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((a) =>
      a.name.toLowerCase().includes(q) ||
      (a.brand ?? "").toLowerCase().includes(q) ||
      (a.assetNo ?? "").toLowerCase().includes(q)
    );
  }, [assetsQuery.data, search]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.rentalAssets.all });

  const openCreate = () => {
    setEditAsset(null);
    setForm(emptyForm);
    setSheet(true);
  };

  const openEdit = (a: Asset) => {
    setEditAsset(a);
    setForm({
      name: a.name,
      brand: a.brand ?? "",
      modelNo: a.modelNo ?? "",
      imageUrl: a.imageUrl ?? "",
      dailyRate: String(a.dailyRate),
      monthlyRate: String(a.monthlyRate),
      depositAmount: String(a.depositAmount),
      memo: a.memo ?? "",
      status: a.status as AssetStatus,
      acquiredAt: a.acquiredAt ? a.acquiredAt.slice(0, 10) : "",
    });
    setSheet(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!form.name.trim()) throw new Error("자산명을 입력하세요");
      const body = {
        name: form.name.trim(),
        brand: form.brand.trim() || null,
        modelNo: form.modelNo.trim() || null,
        imageUrl: form.imageUrl.trim() || null,
        dailyRate: parseFloat(parseComma(form.dailyRate)) || 0,
        monthlyRate: parseFloat(parseComma(form.monthlyRate)) || 0,
        depositAmount: parseFloat(parseComma(form.depositAmount)) || 0,
        memo: form.memo.trim() || null,
        status: form.status,
        acquiredAt: form.acquiredAt || null,
      };
      return editAsset
        ? apiMutate(`/api/rental-assets/${editAsset.id}`, "PUT", body)
        : apiMutate("/api/rental-assets", "POST", body);
    },
    onSuccess: () => {
      toast.success(editAsset ? "수정됐습니다" : "등록됐습니다");
      setSheet(false);
      refresh();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : err.message || "저장 실패"),
  });

  // 이미지 업로드 — Supabase Storage product-images 버킷 재사용
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const handleImagePick = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      const res = await fetch("/api/products/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error || "업로드 실패");
        return;
      }
      const { url } = (await res.json()) as { url: string };
      setForm((prev) => ({ ...prev, imageUrl: url }));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // 라벨 출력 — 자산번호 = 라벨 코드. 새 탭으로 인쇄 미리보기 (?auto=1 자동 인쇄).
  const printLabel = (assetNo: string) => {
    window.open(
      `/rental-assets/print?codes=${encodeURIComponent(assetNo)}&auto=1`,
      "_blank",
      "noopener",
    );
  };

  // 임대 QR 라벨 — 토큰 발급(없으면 생성) 후 사용설명서 QR 라벨 인쇄 탭 오픈
  const qrMutation = useMutation({
    mutationFn: (id: string) =>
      apiMutate<{ accessToken: string }>(`/api/rental-assets/${id}/qr`, "POST"),
    onSuccess: (_, id) => {
      window.open(
        `/rental-assets/${id}/qr-label?auto=1`,
        "_blank",
        "noopener",
      );
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "QR 발급에 실패했습니다"),
  });

  // 중고 전환 — 임대 lifecycle 종료 후 UsedItem 으로 핸드오프
  const [convertTarget, setConvertTarget] = useState<Asset | null>(null);
  const [convertForm, setConvertForm] = useState({
    acquiredCost: "0",
    issueSerial: false,
    warrantyMonths: 0,
    memo: "",
  });

  const openConvert = (a: Asset) => {
    setConvertTarget(a);
    setConvertForm({
      acquiredCost: "0",
      issueSerial: false,
      warrantyMonths: 0,
      memo: "",
    });
  };

  const convertMutation = useMutation({
    mutationFn: () => {
      if (!convertTarget) throw new Error("자산이 선택되지 않았습니다");
      return apiMutate<{ id: string; internalCode: string }>(
        `/api/rental-assets/${convertTarget.id}/convert-to-used`,
        "POST",
        {
          acquiredCost: convertForm.acquiredCost || "0",
          issueSerial: convertForm.issueSerial,
          warrantyMonths: convertForm.issueSerial ? convertForm.warrantyMonths : 0,
          memo: convertForm.memo || null,
        },
      );
    },
    onSuccess: (created) => {
      jmToast.success(`중고 단품으로 전환되었습니다 (${created.internalCode})`);
      setConvertTarget(null);
      refresh();
      router.push(`/inventory/used-items/${created.id}`);
    },
    onError: (e) =>
      jmToast.error(e instanceof ApiError ? e.message : "중고 전환에 실패했습니다"),
  });

  const submitting = saveMutation.isPending;
  const save = () => saveMutation.mutate();

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/rental-assets/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("비활성화됐습니다");
      refresh();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "삭제 실패"),
  });
  const remove = (id: string) => {
    if (!confirm("비활성화하시겠습니까?")) return;
    removeMutation.mutate(id);
  };

  return (
    <div className="flex h-full flex-col bg-[var(--jm-bg)]">
      <DataTableToolbar
        search={{ value: search, onChange: setSearch, onSearch: () => {}, placeholder: "자산명, 브랜드, 자산번호 검색..." }}
        onRefresh={refresh}
        onAdd={openCreate}
        addLabel="자산 추가"
        loading={loading}
      />

      <div className="flex-1 overflow-y-auto min-h-0">
        <JmTable className="min-w-[1000px]">
          <JmTableHeader>
            <JmTableRow>
              <JmTableHead className="w-16" />
              <JmTableHead>자산번호</JmTableHead>
              <JmTableHead>자산명</JmTableHead>
              <JmTableHead>브랜드</JmTableHead>
              <JmTableHead>모델번호</JmTableHead>
              <JmTableHead className="text-right">일 요율 (VAT 포함)</JmTableHead>
              <JmTableHead className="text-right">월 요율 (VAT 포함)</JmTableHead>
              <JmTableHead className="text-right">보증금</JmTableHead>
              <JmTableHead>상태</JmTableHead>
              <JmTableHead className="w-24" />
            </JmTableRow>
          </JmTableHeader>
          <JmTableBody>
            {loading ? (
              <RentalAssetsSkeletonRows />
            ) : assets.length === 0 ? (
              <JmTableRow className="hover:bg-transparent">
                <JmTableCell colSpan={10} className="py-8 text-center text-[var(--jm-text-muted)]">
                  등록된 임대 자산이 없습니다
                </JmTableCell>
              </JmTableRow>
            ) : assets.map((a) => (
              <JmTableRow
                key={a.id}
                className="cursor-pointer"
                onClick={() => openEdit(a)}
              >
                <JmTableCell>
                  {a.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.imageUrl}
                      alt={a.name}
                      className="size-10 rounded-md border border-[var(--jm-border)] object-cover"
                    />
                  ) : (
                    <div className="flex size-10 items-center justify-center rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] text-jm-xs font-semibold text-[var(--jm-text-muted)]">
                      {a.name.charAt(0)}
                    </div>
                  )}
                </JmTableCell>
                <JmTableCell className="font-[family-name:var(--jm-font-mono)] text-jm-xs">
                  {a.assetNo}
                </JmTableCell>
                <JmTableCell className="font-medium">{a.name}</JmTableCell>
                <JmTableCell className="text-[var(--jm-text-muted)]">{a.brand ?? "-"}</JmTableCell>
                <JmTableCell className="text-jm-xs text-[var(--jm-text-muted)]">
                  {a.modelNo || "-"}
                </JmTableCell>
                <JmTableCell className="text-right tabular-nums">
                  ₩{withVat(Number(a.dailyRate)).toLocaleString("ko-KR")}
                </JmTableCell>
                <JmTableCell className="text-right tabular-nums">
                  ₩{withVat(Number(a.monthlyRate)).toLocaleString("ko-KR")}
                </JmTableCell>
                <JmTableCell className="text-right tabular-nums">
                  ₩{Number(a.depositAmount).toLocaleString("ko-KR")}
                </JmTableCell>
                <JmTableCell>
                  <JmBadge variant={STATUS_VARIANT[a.status] ?? "outline"} size="sm">
                    {STATUS_LABEL[a.status] ?? a.status}
                  </JmBadge>
                </JmTableCell>
                <JmTableCell>
                  <div className="flex justify-end gap-1">
                    <JmIconButton
                      variant="ghost"
                      size="sm"
                      aria-label="라벨 인쇄"
                      onClick={(e) => { e.stopPropagation(); printLabel(a.assetNo); }}
                    >
                      <Printer />
                    </JmIconButton>
                    <JmIconButton
                      variant="ghost"
                      size="sm"
                      aria-label="사용설명서"
                      onClick={(e) => { e.stopPropagation(); router.push(`/rental-assets/${a.id}/manual`); }}
                    >
                      <BookOpen />
                    </JmIconButton>
                    <JmIconButton
                      variant="ghost"
                      size="sm"
                      aria-label="QR 라벨"
                      onClick={(e) => { e.stopPropagation(); qrMutation.mutate(a.id); }}
                    >
                      <QrCode />
                    </JmIconButton>
                    <JmIconButton
                      variant="ghost"
                      size="sm"
                      aria-label="수정"
                      onClick={(e) => { e.stopPropagation(); openEdit(a); }}
                    >
                      <Pencil />
                    </JmIconButton>
                    {a.status !== "RENTED" && a.status !== "RETIRED" && (
                      <JmIconButton
                        variant="ghost"
                        size="sm"
                        aria-label="중고로 전환"
                        onClick={(e) => { e.stopPropagation(); openConvert(a); }}
                      >
                        <Recycle />
                      </JmIconButton>
                    )}
                    <JmIconButton
                      variant="ghost"
                      size="sm"
                      aria-label="삭제"
                      className="text-[var(--jm-danger-fg)]"
                      onClick={(e) => { e.stopPropagation(); remove(a.id); }}
                    >
                      <Trash2 />
                    </JmIconButton>
                  </div>
                </JmTableCell>
              </JmTableRow>
            ))}
          </JmTableBody>
        </JmTable>
      </div>

      <JmDrawer open={sheet} onOpenChange={setSheet}>
        <JmDrawerContent side="bottom" size="xl" className="flex flex-col p-0" dragHandle={false}>
          <JmDrawerHeader className="border-b border-[var(--jm-border)] px-5 py-4 flex-shrink-0">
            <JmDrawerTitle>{editAsset ? "임대 자산 수정" : "임대 자산 추가"}</JmDrawerTitle>
          </JmDrawerHeader>

          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="mx-auto max-w-2xl px-5 py-5 space-y-6">
              {/* ── 자산번호 — 자동 발번. 생성 시엔 저장 후 부여됨 ── */}
              <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] px-4 py-2.5">
                <span className="text-jm-xs font-semibold text-[var(--jm-text-muted)]">
                  자산번호
                </span>
                {editAsset ? (
                  <span className="font-[family-name:var(--jm-font-mono)] text-jm-sm font-semibold text-[var(--jm-text)]">
                    {editAsset.assetNo}
                  </span>
                ) : (
                  <span className="text-jm-xs text-[var(--jm-text-subtle)]">
                    저장 시 자동 생성 · RA-YYMMDD-NNNN
                  </span>
                )}
              </div>

              {/* ── 사진 + 자산명 (헤더 블록) ── */}
              <div className="flex items-start gap-4">
                <div className="shrink-0">
                  {form.imageUrl ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={form.imageUrl}
                        alt="자산 사진"
                        className="size-24 rounded-lg border border-[var(--jm-border)] object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, imageUrl: "" })}
                        className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-[var(--jm-danger-solid)] text-white shadow hover:scale-110 transition-transform"
                        aria-label="이미지 제거"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex size-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--jm-border)] bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface)] transition-colors disabled:opacity-50"
                      disabled={uploading}
                      aria-label="이미지 업로드"
                    >
                      {uploading ? (
                        <Loader2 className="size-5 animate-spin" />
                      ) : (
                        <>
                          <ImagePlus className="size-5" />
                          <span className="text-jm-2xs">사진 추가</span>
                        </>
                      )}
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImagePick(f);
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0 space-y-3">
                  <Field label="자산명" required>
                    <JmInput
                      size="sm"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="예: 카메라 본체 A세트"
                    />
                  </Field>
                  {form.imageUrl && (
                    <JmButton
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus />}
                      <span>사진 변경</span>
                    </JmButton>
                  )}
                </div>
              </div>

              {/* ── 식별 정보 ── */}
              <section className="space-y-3">
                <SectionTitle>식별 정보</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="브랜드">
                    <BrandCombobox
                      brands={brandOptions}
                      value={selectedBrandId}
                      onChange={(_id, name) => setForm({ ...form, brand: name })}
                      onCreateNew={(name) => {
                        setQuickBrandDefaultName(name);
                        setQuickBrandOpen(true);
                      }}
                    />
                  </Field>
                  <Field label="모델번호">
                    <JmInput
                      size="sm"
                      value={form.modelNo}
                      onChange={(e) => setForm({ ...form, modelNo: e.target.value })}
                    />
                  </Field>
                </div>
              </section>

              {/* ── 요율 ── */}
              <section className="space-y-3">
                <SectionTitle>요율 · 보증금</SectionTitle>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="일 요율 (VAT 포함)">
                    <RateButton
                      net={parseFloat(parseComma(form.dailyRate)) || 0}
                      onClick={() => setPriceEdit("daily")}
                    />
                  </Field>
                  <Field label="월 요율 (VAT 포함)">
                    <RateButton
                      net={parseFloat(parseComma(form.monthlyRate)) || 0}
                      onClick={() => setPriceEdit("monthly")}
                    />
                  </Field>
                  <Field label="보증금">
                    <JmInput
                      size="sm"
                      type="text"
                      inputMode="numeric"
                      className="text-right"
                      value={formatComma(form.depositAmount)}
                      onChange={(e) => setForm({ ...form, depositAmount: parseComma(e.target.value) })}
                      onFocus={focusCaretEnd}
                    />
                  </Field>
                </div>
                <p className="text-jm-2xs text-[var(--jm-text-muted)]">
                  요율은 VAT 포함 금액으로 표시·입력됩니다. 보증금은 부가세 대상이 아닙니다.
                </p>
              </section>

              {/* ── 관리 ── */}
              <section className="space-y-3">
                <SectionTitle>관리</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="취득일">
                    <JmDatePicker
                      size="sm"
                      value={form.acquiredAt ? new Date(`${form.acquiredAt}T00:00:00`) : undefined}
                      onChange={(d) => setForm({ ...form, acquiredAt: d ? toYmd(d) : "" })}
                      placeholder="취득일 선택"
                    />
                  </Field>
                  <Field label="상태">
                    <JmSelect
                      size="sm"
                      value={form.status}
                      onChange={(v) => setForm({ ...form, status: v as AssetStatus })}
                      options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))}
                    />
                  </Field>
                </div>
                <Field label="메모">
                  <JmInput
                    size="sm"
                    value={form.memo}
                    onChange={(e) => setForm({ ...form, memo: e.target.value })}
                    placeholder="특이사항 (선택)"
                  />
                </Field>
              </section>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-[var(--jm-border)] bg-[var(--jm-bg)] px-5 py-4 flex-shrink-0">
            <div>
              {editAsset && (
                <JmButton
                  type="button"
                  variant="outline"
                  onClick={() => printLabel(editAsset.assetNo)}
                >
                  <Printer />
                  <span>라벨 인쇄</span>
                </JmButton>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <JmButton variant="ghost" onClick={() => setSheet(false)} disabled={submitting}>
                취소
              </JmButton>
              <JmButton variant="cta" onClick={save} disabled={submitting}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
                <span>{editAsset ? "수정" : "등록"}</span>
              </JmButton>
            </div>
          </div>
        </JmDrawerContent>
      </JmDrawer>

      <QuickBrandSheet
        open={quickBrandOpen}
        onOpenChange={setQuickBrandOpen}
        defaultName={quickBrandDefaultName}
        onCreated={(brand) => {
          setForm((prev) => ({ ...prev, brand: brand.name }));
          queryClient.invalidateQueries({ queryKey: queryKeys.brands.all });
          setQuickBrandOpen(false);
        }}
      />

      {/* 중고 전환 다이얼로그 */}
      <JmDialog
        open={!!convertTarget}
        onOpenChange={(v) => !v && setConvertTarget(null)}
      >
        <JmDialogContent size="md">
          <JmDialogHeader>
            <JmDialogTitle>임대 자산 → 중고 전환</JmDialogTitle>
          </JmDialogHeader>
          <JmDialogBody>
            {convertTarget && (
              <div className="space-y-3">
                <div className="rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] p-3">
                  <div className="font-medium text-[var(--jm-text)]">
                    {convertTarget.name}
                  </div>
                  <div className="mt-0.5 font-[family-name:var(--jm-font-mono)] text-jm-xs text-[var(--jm-text-muted)]">
                    {convertTarget.assetNo}
                  </div>
                </div>

                <JmFormField
                  label="매입가 (감가상각 잔존가)"
                  hint="0 입력 가능 — 감가상각 끝난 자산"
                >
                  <div className="flex items-center gap-2">
                    <JmInput
                      type="text"
                      inputMode="numeric"
                      value={formatComma(convertForm.acquiredCost)}
                      onChange={(e) =>
                        setConvertForm({
                          ...convertForm,
                          acquiredCost: parseComma(e.target.value),
                        })
                      }
                      onFocus={focusCaretEnd}
                    />
                    <span className="shrink-0 text-jm-sm text-[var(--jm-text-muted)]">
                      원
                    </span>
                  </div>
                </JmFormField>

                <label className="flex cursor-pointer items-center gap-2 text-jm-sm">
                  <JmCheckbox
                    checked={convertForm.issueSerial}
                    onCheckedChange={(c) =>
                      setConvertForm({
                        ...convertForm,
                        issueSerial: c === true,
                      })
                    }
                  />
                  <span>시리얼 라벨 발번</span>
                  <span className="text-jm-xs text-[var(--jm-text-muted)]">
                    — 단품 판매 예정이면 ON
                  </span>
                </label>

                {convertForm.issueSerial && (
                  <JmFormField label="보증 기간 (개월)" hint="0 = 보증 없음">
                    <div className="flex items-center gap-2">
                      <JmInput
                        type="number"
                        min={0}
                        max={120}
                        value={String(convertForm.warrantyMonths)}
                        onChange={(e) =>
                          setConvertForm({
                            ...convertForm,
                            warrantyMonths: Math.max(
                              0,
                              Math.min(120, parseInt(e.target.value, 10) || 0),
                            ),
                          })
                        }
                        className="w-32"
                      />
                      <span className="text-jm-sm text-[var(--jm-text-muted)]">
                        개월
                      </span>
                    </div>
                  </JmFormField>
                )}

                <JmFormField label="메모">
                  <JmInput
                    value={convertForm.memo}
                    onChange={(e) =>
                      setConvertForm({ ...convertForm, memo: e.target.value })
                    }
                    placeholder="(선택) 자산 사용 이력 등"
                  />
                </JmFormField>
              </div>
            )}
          </JmDialogBody>
          <JmDialogFooter>
            <JmButton variant="ghost" onClick={() => setConvertTarget(null)}>
              취소
            </JmButton>
            <JmButton
              variant="cta"
              onClick={() => convertMutation.mutate()}
              disabled={convertMutation.isPending}
            >
              {convertMutation.isPending && (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              전환
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>

      {priceEdit && (
        <PriceInputDialog
          open
          onOpenChange={(v) => !v && setPriceEdit(null)}
          initialNet={
            parseFloat(
              parseComma(priceEdit === "daily" ? form.dailyRate : form.monthlyRate),
            ) || 0
          }
          taxType="TAXABLE"
          title={priceEdit === "daily" ? "일 요율 입력" : "월 요율 입력"}
          onSubmit={(net) =>
            setForm((f) => ({
              ...f,
              [priceEdit === "daily" ? "dailyRate" : "monthlyRate"]: String(net),
            }))
          }
        />
      )}
    </div>
  );
}

// 요율 입력 트리거 — VAT 포함 금액 표시, 클릭 시 가격 입력 드로워
function RateButton({ net, onClick }: { net: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 w-full items-center justify-end rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 text-jm-sm tabular-nums text-[var(--jm-text)] transition-colors hover:bg-[var(--jm-surface-muted)]"
    >
      ₩{withVat(net).toLocaleString("ko-KR")}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-jm-xs font-semibold text-[var(--jm-text-muted)]">{children}</span>
      <div className="h-px flex-1 bg-[var(--jm-border)]" />
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-jm-xs text-[var(--jm-text-muted)]">
        {label}
        {required ? <span className="ml-0.5 text-[var(--jm-danger-fg)]">*</span> : null}
      </label>
      {children}
    </div>
  );
}
