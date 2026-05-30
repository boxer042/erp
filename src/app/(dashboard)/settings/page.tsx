"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  JmCard, JmCardContent, JmCardDescription, JmCardHeader, JmCardTitle,
} from "@/jm";
import {
  JmBadge, JmButton, JmIconButton, JmInput, JmSwitch, JmSkeleton, JmSelect, JmFormField,
} from "@/jm";
import {
  JmTable, JmTableBody, JmTableCell, JmTableHead, JmTableHeader, JmTableRow,
} from "@/jm";
import {
  JmDialog, JmDialogContent, JmDialogFooter, JmDialogHeader, JmDialogTitle, JmDialogBody,
} from "@/jm";
import {
  Package, Store, Truck, ShoppingCart, Warehouse, ChevronDown, ChevronUp, Plus,
  Pencil, Trash2, Loader2, Building2, Landmark, Star, Layout, ChevronRight, Images,
  ShieldCheck, Wrench,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatComma, parseComma } from "@/lib/utils";

interface Stats {
  products: number;
  suppliers: number;
  channels: number;
  orders: number;
  inventoryItems: number;
}

interface BankAccount {
  id: string;
  bankName: string;
  holder: string;
  account: string;
  isPrimary: boolean;
  sortOrder: number;
}

interface CompanyInfoData {
  id: string;
  name: string;
  businessNumber: string | null;
  ceo: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  businessType: string | null;
  businessItem: string | null;
  defaultRepairWarrantyMonths: number | null;
  defaultDiagnosisFee: string | number | null;
  allowNegativeStock: boolean;
  bankAccounts: BankAccount[];
}

const emptyCompanyForm = {
  name: "",
  businessNumber: "",
  ceo: "",
  phone: "",
  email: "",
  address: "",
  businessType: "",
  businessItem: "",
  defaultRepairWarrantyMonths: "",
  defaultDiagnosisFee: "",
  allowNegativeStock: true,
};

const emptyBankForm = {
  bankName: "",
  holder: "",
  account: "",
  isPrimary: false,
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();

  const [stats, setStats] = useState<Stats | null>(null);

  const companyQuery = useQuery({
    queryKey: queryKeys.companyInfo.all,
    queryFn: () => apiGet<CompanyInfoData>("/api/company-info"),
  });
  const [companyForm, setCompanyForm] = useState(emptyCompanyForm);
  const [companyDirty, setCompanyDirty] = useState(false);

  useEffect(() => {
    if (companyQuery.data && !companyDirty) {
      setCompanyForm({
        name: companyQuery.data.name ?? "",
        businessNumber: companyQuery.data.businessNumber ?? "",
        ceo: companyQuery.data.ceo ?? "",
        phone: companyQuery.data.phone ?? "",
        email: companyQuery.data.email ?? "",
        address: companyQuery.data.address ?? "",
        businessType: companyQuery.data.businessType ?? "",
        businessItem: companyQuery.data.businessItem ?? "",
        defaultRepairWarrantyMonths:
          companyQuery.data.defaultRepairWarrantyMonths != null
            ? String(companyQuery.data.defaultRepairWarrantyMonths)
            : "",
        defaultDiagnosisFee:
          companyQuery.data.defaultDiagnosisFee != null
            ? String(companyQuery.data.defaultDiagnosisFee)
            : "",
        allowNegativeStock: companyQuery.data.allowNegativeStock ?? true,
      });
    }
  }, [companyQuery.data, companyDirty]);

  const updateCompany = useMutation({
    mutationFn: () =>
      apiMutate("/api/company-info", "PUT", {
        ...companyForm,
        defaultRepairWarrantyMonths: companyForm.defaultRepairWarrantyMonths
          ? parseInt(companyForm.defaultRepairWarrantyMonths, 10)
          : null,
        defaultDiagnosisFee: companyForm.defaultDiagnosisFee
          ? parseInt(
              companyForm.defaultDiagnosisFee.replace(/[^\d]/g, ""),
              10,
            )
          : null,
      }),
    onSuccess: () => {
      toast.success("사업자 정보가 저장되었습니다");
      setCompanyDirty(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.companyInfo.all });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "저장에 실패했습니다"),
  });

  const [bankDialogOpen, setBankDialogOpen] = useState(false);
  const [bankEditingId, setBankEditingId] = useState<string | null>(null);
  const [bankForm, setBankForm] = useState(emptyBankForm);
  const [bankDeleteId, setBankDeleteId] = useState<string | null>(null);

  const bankAccounts = companyQuery.data?.bankAccounts ?? [];

  const openCreateBank = () => {
    setBankEditingId(null);
    setBankForm(emptyBankForm);
    setBankDialogOpen(true);
  };
  const openEditBank = (b: BankAccount) => {
    setBankEditingId(b.id);
    setBankForm({ bankName: b.bankName, holder: b.holder, account: b.account, isPrimary: b.isPrimary });
    setBankDialogOpen(true);
  };

  const saveBank = useMutation({
    mutationFn: () => {
      if (bankEditingId) {
        return apiMutate(`/api/company-info/bank-accounts/${bankEditingId}`, "PUT", bankForm);
      }
      return apiMutate("/api/company-info/bank-accounts", "POST", bankForm);
    },
    onSuccess: () => {
      toast.success(bankEditingId ? "통장이 수정되었습니다" : "통장이 추가되었습니다");
      setBankDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.companyInfo.all });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "저장에 실패했습니다"),
  });

  const deleteBank = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/company-info/bank-accounts/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("통장이 삭제되었습니다");
      setBankDeleteId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.companyInfo.all });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "삭제에 실패했습니다"),
  });

  const statsQuery = useQuery({
    queryKey: ["settings", "stats"],
    queryFn: async () => {
      type ProductLite = { inventory?: unknown };
      const [p, s, c, o] = await Promise.all([
        apiGet<ProductLite[]>("/api/products"),
        apiGet<unknown[]>("/api/suppliers"),
        apiGet<unknown[]>("/api/channels"),
        apiGet<unknown[]>("/api/orders"),
      ]);
      return {
        products: p.length,
        suppliers: s.length,
        channels: c.length,
        orders: o.length,
        inventoryItems: p.filter((x) => x.inventory).length,
      } as Stats;
    },
  });

  useEffect(() => {
    if (statsQuery.data) setStats(statsQuery.data);
  }, [statsQuery.data]);

  const setCompanyField = (key: keyof typeof companyForm, value: string) => {
    setCompanyForm((p) => ({ ...p, [key]: value }));
    setCompanyDirty(true);
  };

  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="flex w-full flex-col gap-6 p-4">
        <h2 className="text-jm-lg font-semibold text-[var(--jm-text)]">설정</h2>

        <JmCard>
          <JmCardHeader>
            <JmCardTitle>시스템 정보</JmCardTitle>
            <JmCardDescription>JAEWOOMADE ERP 현황</JmCardDescription>
          </JmCardHeader>
          <JmCardContent>
            {stats ? (
              <JmTable>
                <JmTableBody>
                  <JmTableRow>
                    <JmTableCell className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-[var(--jm-text-muted)]" /> 등록 상품
                    </JmTableCell>
                    <JmTableCell className="text-right font-medium">{stats.products}개</JmTableCell>
                  </JmTableRow>
                  <JmTableRow>
                    <JmTableCell className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-[var(--jm-text-muted)]" /> 거래처
                    </JmTableCell>
                    <JmTableCell className="text-right font-medium">{stats.suppliers}개</JmTableCell>
                  </JmTableRow>
                  <JmTableRow>
                    <JmTableCell className="flex items-center gap-2">
                      <Store className="h-4 w-4 text-[var(--jm-text-muted)]" /> 판매 채널
                    </JmTableCell>
                    <JmTableCell className="text-right font-medium">{stats.channels}개</JmTableCell>
                  </JmTableRow>
                  <JmTableRow>
                    <JmTableCell className="flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4 text-[var(--jm-text-muted)]" /> 총 주문
                    </JmTableCell>
                    <JmTableCell className="text-right font-medium">{stats.orders}건</JmTableCell>
                  </JmTableRow>
                  <JmTableRow>
                    <JmTableCell className="flex items-center gap-2">
                      <Warehouse className="h-4 w-4 text-[var(--jm-text-muted)]" /> 재고 품목
                    </JmTableCell>
                    <JmTableCell className="text-right font-medium">{stats.inventoryItems}개</JmTableCell>
                  </JmTableRow>
                </JmTableBody>
              </JmTable>
            ) : (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <JmSkeleton className="h-4 w-24" />
                    <JmSkeleton className="h-4 w-12" />
                  </div>
                ))}
              </div>
            )}
          </JmCardContent>
        </JmCard>

        <JmCard
          onClick={() => router.push("/settings/landing")}
          className="cursor-pointer transition-shadow hover:shadow-md"
        >
          <JmCardHeader>
            <JmCardTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Layout className="h-4 w-4" /> 상세페이지 공통 영역 (상단 공지·푸터)
              </span>
              <ChevronRight className="h-4 w-4 text-[var(--jm-text-muted)]" />
            </JmCardTitle>
            <JmCardDescription>
              모든 상품 상세페이지 최상단의 공지·배너와 하단의 배송/환불/AS 안내 등 공통 블록을 한 곳에서 관리합니다.
            </JmCardDescription>
          </JmCardHeader>
        </JmCard>

        <JmCard
          onClick={() => router.push("/settings/media")}
          className="cursor-pointer transition-shadow hover:shadow-md"
        >
          <JmCardHeader>
            <JmCardTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Images className="h-4 w-4" /> 이미지 관리
              </span>
              <ChevronRight className="h-4 w-4 text-[var(--jm-text-muted)]" />
            </JmCardTitle>
            <JmCardDescription>
              업로드한 이미지를 한 곳에서 확인합니다. 사용 중/고아 상태를 한눈에 보고, 안 쓰는 파일만 영구 삭제할 수 있습니다.
            </JmCardDescription>
          </JmCardHeader>
        </JmCard>

        <JmCard
          onClick={() => router.push("/settings/privacy-policy")}
          className="cursor-pointer transition-shadow hover:shadow-md"
        >
          <JmCardHeader>
            <JmCardTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> 시리얼 조회 서비스 약관
              </span>
              <ChevronRight className="h-4 w-4 text-[var(--jm-text-muted)]" />
            </JmCardTitle>
            <JmCardDescription>
              시리얼번호 기반 보증·수리 조회 서비스의 개인정보 처리방침을 관리합니다. 손님 동의 화면과 공개 페이지에 노출됩니다.
            </JmCardDescription>
          </JmCardHeader>
        </JmCard>

        <JmCard>
          <JmCardHeader>
            <JmCardTitle>기본 설정</JmCardTitle>
          </JmCardHeader>
          <JmCardContent className="space-y-4 text-jm-sm">
            <div className="flex justify-between">
              <span className="text-[var(--jm-text-muted)]">기본 세율</span>
              <JmBadge variant="outline">10%</JmBadge>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--jm-text-muted)]">기본 통화</span>
              <JmBadge variant="outline">KRW (원)</JmBadge>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--jm-text-muted)]">기본 단위</span>
              <JmBadge variant="outline">EA (개)</JmBadge>
            </div>
          </JmCardContent>
        </JmCard>

        <JmCard>
          <JmCardHeader>
            <JmCardTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4" /> 사업자 정보
            </JmCardTitle>
            <JmCardDescription>견적서·거래명세표 등 PDF에 표시되는 우리 사업자 정보입니다.</JmCardDescription>
          </JmCardHeader>
          <JmCardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-jm-sm">
              <CompanyField label="상호" required value={companyForm.name} onChange={(v) => setCompanyField("name", v)} />
              <CompanyField label="사업자등록번호" value={companyForm.businessNumber} onChange={(v) => setCompanyField("businessNumber", v)} placeholder="000-00-00000" />
              <CompanyField label="대표자" value={companyForm.ceo} onChange={(v) => setCompanyField("ceo", v)} />
              <CompanyField label="전화" value={companyForm.phone} onChange={(v) => setCompanyField("phone", v)} />
              <CompanyField label="이메일" value={companyForm.email} onChange={(v) => setCompanyField("email", v)} />
              <CompanyField label="업태" value={companyForm.businessType} onChange={(v) => setCompanyField("businessType", v)} />
              <CompanyField label="종목" value={companyForm.businessItem} onChange={(v) => setCompanyField("businessItem", v)} />
              <CompanyField
                label="수리 보증 기본값 (개월)"
                value={companyForm.defaultRepairWarrantyMonths}
                onChange={(v) =>
                  setCompanyField("defaultRepairWarrantyMonths", v.replace(/\D/g, ""))
                }
                placeholder="예: 1"
              />
              <CompanyField
                label="진단비 기본값 (₩)"
                value={
                  companyForm.defaultDiagnosisFee
                    ? Number(companyForm.defaultDiagnosisFee).toLocaleString("ko-KR")
                    : ""
                }
                onChange={(v) =>
                  setCompanyField("defaultDiagnosisFee", v.replace(/\D/g, ""))
                }
                placeholder="예: 10,000"
              />
              <div className="md:col-span-2">
                <CompanyField label="주소" value={companyForm.address} onChange={(v) => setCompanyField("address", v)} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border border-[var(--jm-border)] px-3 py-2.5">
              <div className="space-y-0.5 pr-4">
                <div className="text-jm-sm font-medium text-[var(--jm-text)]">재고 부족 시에도 판매 허용</div>
                <div className="text-jm-2xs text-[var(--jm-text-muted)]">
                  켜면 재고가 없어도 POS 결제·주문 출고대기·수리 부속 차감이 막히지 않습니다.
                  부족분은 음수 재고로 기록되며, 추후 재고조정(실사보정)으로 정산하세요.
                </div>
              </div>
              <JmSwitch
                checked={companyForm.allowNegativeStock}
                onCheckedChange={(v) => {
                  setCompanyForm((p) => ({ ...p, allowNegativeStock: v }));
                  setCompanyDirty(true);
                }}
              />
            </div>
            <div className="flex justify-end">
              <JmButton
                variant="cta"
                size="xs"
                onClick={() => updateCompany.mutate()}
                disabled={updateCompany.isPending || !companyDirty}
              >
                {updateCompany.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                저장
              </JmButton>
            </div>
          </JmCardContent>
        </JmCard>

        <JmCard>
          <JmCardHeader className="flex flex-row items-center justify-between">
            <div>
              <JmCardTitle className="flex items-center gap-2">
                <Landmark className="h-4 w-4" /> 계좌 관리
              </JmCardTitle>
              <JmCardDescription>여러 통장을 등록하고 PDF에 노출할 기본 통장을 지정할 수 있습니다.</JmCardDescription>
            </div>
            <JmButton variant="outline" size="xs" className="gap-1.5" onClick={openCreateBank}>
              <Plus className="h-3.5 w-3.5" />
              통장 추가
            </JmButton>
          </JmCardHeader>
          <JmCardContent>
            {bankAccounts.length === 0 ? (
              <p className="text-jm-sm text-[var(--jm-text-muted)] py-6 text-center">등록된 통장이 없습니다.</p>
            ) : (
              <JmTable>
                <JmTableHeader>
                  <JmTableRow>
                    <JmTableHead>은행</JmTableHead>
                    <JmTableHead>예금주</JmTableHead>
                    <JmTableHead>계좌번호</JmTableHead>
                    <JmTableHead className="w-20">기본</JmTableHead>
                    <JmTableHead className="w-28 text-right">액션</JmTableHead>
                  </JmTableRow>
                </JmTableHeader>
                <JmTableBody>
                  {bankAccounts.map((b) => (
                    <JmTableRow key={b.id}>
                      <JmTableCell className="font-medium">{b.bankName}</JmTableCell>
                      <JmTableCell>{b.holder}</JmTableCell>
                      <JmTableCell className="tabular-nums">{b.account}</JmTableCell>
                      <JmTableCell>
                        {b.isPrimary && (
                          <JmBadge variant="solid" className="gap-1">
                            <Star className="h-3 w-3" /> 기본
                          </JmBadge>
                        )}
                      </JmTableCell>
                      <JmTableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <JmIconButton aria-label="통장 수정" variant="ghost" size="sm" className="size-7" onClick={() => openEditBank(b)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </JmIconButton>
                          <JmIconButton
                            aria-label="통장 삭제"
                            variant="ghost"
                            size="sm"
                            className="size-7 text-[var(--jm-danger-fg)] hover:text-[var(--jm-danger-fg)]"
                            onClick={() => setBankDeleteId(b.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </JmIconButton>
                        </div>
                      </JmTableCell>
                    </JmTableRow>
                  ))}
                </JmTableBody>
              </JmTable>
            )}
          </JmCardContent>
        </JmCard>

        <JmDialog open={bankDialogOpen} onOpenChange={setBankDialogOpen}>
          <JmDialogContent>
            <JmDialogHeader>
              <JmDialogTitle>{bankEditingId ? "통장 수정" : "통장 추가"}</JmDialogTitle>
            </JmDialogHeader>
            <JmDialogBody className="space-y-3 text-jm-sm">
              <BankField label="은행" required value={bankForm.bankName} onChange={(v) => setBankForm((p) => ({ ...p, bankName: v }))} placeholder="예: 농협" />
              <BankField label="예금주" required value={bankForm.holder} onChange={(v) => setBankForm((p) => ({ ...p, holder: v }))} />
              <BankField label="계좌번호" required value={bankForm.account} onChange={(v) => setBankForm((p) => ({ ...p, account: v }))} placeholder="예: 407-01-144656" />
              <div className="flex items-center justify-between rounded-md border border-[var(--jm-border)] px-3 py-2">
                <div>
                  <div className="font-medium text-[var(--jm-text)]">기본 통장으로 지정</div>
                  <div className="text-jm-2xs text-[var(--jm-text-muted)]">PDF에 이 통장이 표시됩니다</div>
                </div>
                <JmSwitch
                  checked={bankForm.isPrimary}
                  onCheckedChange={(v) => setBankForm((p) => ({ ...p, isPrimary: v }))}
                />
              </div>
            </JmDialogBody>
            <JmDialogFooter>
              <JmButton variant="outline" size="xs" onClick={() => setBankDialogOpen(false)}>
                취소
              </JmButton>
              <JmButton
                variant="cta"
                size="xs"
                onClick={() => {
                  if (!bankForm.bankName || !bankForm.holder || !bankForm.account) {
                    toast.error("은행, 예금주, 계좌번호는 필수입니다");
                    return;
                  }
                  saveBank.mutate();
                }}
                disabled={saveBank.isPending}
              >
                {saveBank.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                {bankEditingId ? "수정" : "추가"}
              </JmButton>
            </JmDialogFooter>
          </JmDialogContent>
        </JmDialog>

        <JmDialog open={!!bankDeleteId} onOpenChange={(v) => !v && setBankDeleteId(null)}>
          <JmDialogContent size="sm">
            <JmDialogHeader>
              <JmDialogTitle>통장 삭제</JmDialogTitle>
            </JmDialogHeader>
            <JmDialogBody>
              <p className="text-jm-sm text-[var(--jm-text-muted)]">
                이 통장을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
              </p>
            </JmDialogBody>
            <JmDialogFooter>
              <JmButton variant="outline" size="xs" onClick={() => setBankDeleteId(null)}>
                취소
              </JmButton>
              <JmButton
                variant="danger"
                size="xs"
                onClick={() => {
                  if (bankDeleteId) deleteBank.mutate(bankDeleteId);
                }}
                disabled={deleteBank.isPending}
              >
                {deleteBank.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                삭제
              </JmButton>
            </JmDialogFooter>
          </JmDialogContent>
        </JmDialog>

        <CardFeeSection />

        <ServiceFeePresetSection />
      </div>
    </div>
  );
}

interface ServiceFeePreset {
  id: string;
  name: string;
  unitPrice: string | number;
  memo: string | null;
}

const emptyServiceFeeForm = { name: "", unitPrice: "", memo: "" };

function ServiceFeePresetSection() {
  const queryClient = useQueryClient();

  const presetsQuery = useQuery({
    queryKey: queryKeys.serviceFeePresets.all,
    queryFn: () => apiGet<ServiceFeePreset[]>("/api/service-fee-presets"),
  });
  const presets = presetsQuery.data ?? [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyServiceFeeForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyServiceFeeForm);
    setDialogOpen(true);
  };
  const openEdit = (p: ServiceFeePreset) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      unitPrice: String(Math.round(Number(p.unitPrice))),
      memo: p.memo ?? "",
    });
    setDialogOpen(true);
  };

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        unitPrice: parseComma(form.unitPrice) || "0",
        memo: form.memo.trim() || null,
      };
      return editingId
        ? apiMutate(`/api/service-fee-presets/${editingId}`, "PUT", payload)
        : apiMutate("/api/service-fee-presets", "POST", payload);
    },
    onSuccess: () => {
      toast.success(editingId ? "수정되었습니다" : "추가되었습니다");
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceFeePresets.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장에 실패했습니다"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/service-fee-presets/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("삭제되었습니다");
      setDeleteId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceFeePresets.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "삭제에 실패했습니다"),
  });

  return (
    <>
      <JmCard>
        <JmCardHeader className="flex flex-row items-center justify-between">
          <div>
            <JmCardTitle className="flex items-center gap-2">
              <Wrench className="h-4 w-4" /> 기술료 / 공임 프리셋
            </JmCardTitle>
            <JmCardDescription>
              상품 판매 시 장착·설치 등 추가 청구하는 기술료입니다. POS 카트와 주문 등록에서 빠르게 선택할 수 있습니다. 금액은 세전(공급가액) 기준 — 항상 과세.
            </JmCardDescription>
          </div>
          <JmButton variant="outline" size="xs" className="gap-1.5" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />
            기술료 추가
          </JmButton>
        </JmCardHeader>
        <JmCardContent>
          {presetsQuery.isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <JmSkeleton className="h-4 w-32" />
                  <JmSkeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : presets.length === 0 ? (
            <p className="text-jm-sm text-[var(--jm-text-muted)] py-6 text-center">
              등록된 기술료 프리셋이 없습니다.
            </p>
          ) : (
            <JmTable>
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead>이름</JmTableHead>
                  <JmTableHead className="text-right">금액 (세전)</JmTableHead>
                  <JmTableHead>메모</JmTableHead>
                  <JmTableHead className="w-28 text-right">액션</JmTableHead>
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {presets.map((p) => (
                  <JmTableRow key={p.id}>
                    <JmTableCell className="font-medium">{p.name}</JmTableCell>
                    <JmTableCell className="text-right tabular-nums">
                      ₩{Number(p.unitPrice).toLocaleString("ko-KR")}
                    </JmTableCell>
                    <JmTableCell className="text-[var(--jm-text-muted)]">{p.memo ?? "—"}</JmTableCell>
                    <JmTableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <JmIconButton aria-label="기술료 수정" variant="ghost" size="sm" className="size-7" onClick={() => openEdit(p)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </JmIconButton>
                        <JmIconButton
                          aria-label="기술료 삭제"
                          variant="ghost"
                          size="sm"
                          className="size-7 text-[var(--jm-danger-fg)] hover:text-[var(--jm-danger-fg)]"
                          onClick={() => setDeleteId(p.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </JmIconButton>
                      </div>
                    </JmTableCell>
                  </JmTableRow>
                ))}
              </JmTableBody>
            </JmTable>
          )}
        </JmCardContent>
      </JmCard>

      <JmDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <JmDialogContent>
          <JmDialogHeader>
            <JmDialogTitle>{editingId ? "기술료 수정" : "기술료 추가"}</JmDialogTitle>
          </JmDialogHeader>
          <JmDialogBody className="space-y-3 text-jm-sm">
            <JmFormField label="이름" required>
              <JmInput
                size="sm"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="예: 장착비, 출장 설치비"
                className="h-8"
              />
            </JmFormField>
            <JmFormField label="금액 (세전)" required>
              <JmInput
                type="text"
                inputMode="numeric"
                size="sm"
                value={formatComma(form.unitPrice)}
                onChange={(e) =>
                  setForm((p) => ({ ...p, unitPrice: parseComma(e.target.value) }))
                }
                onFocus={(e) => e.currentTarget.select()}
                placeholder="예: 20,000"
                className="h-8"
              />
            </JmFormField>
            <JmFormField label="메모">
              <JmInput
                size="sm"
                value={form.memo}
                onChange={(e) => setForm((p) => ({ ...p, memo: e.target.value }))}
                placeholder="선택"
                className="h-8"
              />
            </JmFormField>
          </JmDialogBody>
          <JmDialogFooter>
            <JmButton variant="outline" size="xs" onClick={() => setDialogOpen(false)}>
              취소
            </JmButton>
            <JmButton
              variant="cta"
              size="xs"
              onClick={() => {
                if (!form.name.trim()) {
                  toast.error("이름은 필수입니다");
                  return;
                }
                save.mutate();
              }}
              disabled={save.isPending}
            >
              {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              {editingId ? "수정" : "추가"}
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>

      <JmDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <JmDialogContent size="sm">
          <JmDialogHeader>
            <JmDialogTitle>기술료 프리셋 삭제</JmDialogTitle>
          </JmDialogHeader>
          <JmDialogBody>
            <p className="text-jm-sm text-[var(--jm-text-muted)]">
              이 프리셋을 삭제하시겠습니까? 이미 등록된 주문에는 영향이 없습니다.
            </p>
          </JmDialogBody>
          <JmDialogFooter>
            <JmButton variant="outline" size="xs" onClick={() => setDeleteId(null)}>
              취소
            </JmButton>
            <JmButton
              variant="danger"
              size="xs"
              onClick={() => {
                if (deleteId) remove.mutate(deleteId);
              }}
              disabled={remove.isPending}
            >
              {remove.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              삭제
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>
    </>
  );
}

function CompanyField({
  label, value, onChange, required, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <JmFormField label={label} required={required}>
      <JmInput
        size="sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8"
      />
    </JmFormField>
  );
}

function BankField({
  label, value, onChange, required, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <JmFormField label={label} required={required}>
      <JmInput
        size="sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8"
      />
    </JmFormField>
  );
}

interface CardCompanyFeeRecord {
  id: string;
  companyName: string;
  merchantNo: string | null;
  settlementBank: string | null;
  settlementAccount: string | null;
  creditRate: string;
  checkBankRate: string | null;
  checkSpecialRate: string | null;
  paymentDays: number | null;
  sortOrder: number;
}

interface CardMerchantInfoRecord {
  id: string;
  merchantTier: string | null;
  appliedFrom: string | null;
}

interface CardCompanyFeesData {
  merchant: CardMerchantInfoRecord | null;
  items: CardCompanyFeeRecord[];
}

interface CardFeeRateRecord {
  id: string;
  rate: string;
  memo: string | null;
  appliedFrom: string;
  createdAt: string;
}

interface CardFeeRateData {
  current: CardFeeRateRecord | null;
  history: CardFeeRateRecord[];
}

const emptyCardCompanyForm = {
  companyName: "",
  merchantNo: "",
  settlementBank: "",
  settlementAccount: "",
  creditRate: "",
  checkBankRate: "",
  checkSpecialRate: "",
  paymentDays: "",
};

const TIER_OPTIONS = ["영세", "중소1", "중소2", "중소3", "일반"];

function CardFeeSection() {
  const queryClient = useQueryClient();

  const feesQuery = useQuery({
    queryKey: queryKeys.cardCompanyFees.all,
    queryFn: () => apiGet<CardCompanyFeesData>("/api/card-company-fees"),
  });
  const rateQuery = useQuery({
    queryKey: queryKeys.cardFeeRate.all,
    queryFn: () => apiGet<CardFeeRateData>("/api/card-fee-rate"),
  });

  const items = feesQuery.data?.items ?? [];
  const merchant = feesQuery.data?.merchant ?? null;

  const [tier, setTier] = useState<string>("");
  const [tierDirty, setTierDirty] = useState(false);

  useEffect(() => {
    if (merchant && !tierDirty) setTier(merchant.merchantTier ?? "");
  }, [merchant, tierDirty]);

  const saveTier = useMutation({
    mutationFn: () =>
      apiMutate("/api/card-company-fees/merchant", "PUT", { merchantTier: tier }),
    onSuccess: () => {
      toast.success("가맹점 구분이 저장되었습니다");
      setTierDirty(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.cardCompanyFees.all });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "저장에 실패했습니다"),
  });

  const [feeDialogOpen, setFeeDialogOpen] = useState(false);
  const [editingFeeId, setEditingFeeId] = useState<string | null>(null);
  const [feeForm, setFeeForm] = useState(emptyCardCompanyForm);
  const [deleteFeeId, setDeleteFeeId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const openCreate = () => {
    setEditingFeeId(null);
    setFeeForm(emptyCardCompanyForm);
    setFeeDialogOpen(true);
  };
  const openEdit = (it: CardCompanyFeeRecord) => {
    setEditingFeeId(it.id);
    setFeeForm({
      companyName: it.companyName,
      merchantNo: it.merchantNo ?? "",
      settlementBank: it.settlementBank ?? "",
      settlementAccount: it.settlementAccount ?? "",
      creditRate: rateToPercent(it.creditRate),
      checkBankRate: rateToPercent(it.checkBankRate),
      checkSpecialRate: rateToPercent(it.checkSpecialRate),
      paymentDays: it.paymentDays != null ? String(it.paymentDays) : "",
    });
    setFeeDialogOpen(true);
  };

  const saveFee = useMutation({
    mutationFn: () => {
      const payload = {
        companyName: feeForm.companyName,
        merchantNo: feeForm.merchantNo,
        settlementBank: feeForm.settlementBank,
        settlementAccount: feeForm.settlementAccount,
        creditRate: percentToRate(feeForm.creditRate),
        checkBankRate: feeForm.checkBankRate ? percentToRate(feeForm.checkBankRate) : "",
        checkSpecialRate: feeForm.checkSpecialRate ? percentToRate(feeForm.checkSpecialRate) : "",
        paymentDays: feeForm.paymentDays ? parseInt(feeForm.paymentDays, 10) : null,
      };
      if (editingFeeId) {
        return apiMutate(`/api/card-company-fees/${editingFeeId}`, "PUT", payload);
      }
      return apiMutate("/api/card-company-fees", "POST", payload);
    },
    onSuccess: () => {
      toast.success(editingFeeId ? "수정되었습니다" : "추가되었습니다");
      setFeeDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.cardCompanyFees.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.cardFeeRate.all });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "저장에 실패했습니다"),
  });

  const deleteFee = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/card-company-fees/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("삭제되었습니다");
      setDeleteFeeId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.cardCompanyFees.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.cardFeeRate.all });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "삭제에 실패했습니다"),
  });

  const fmtDate = (s: string) => format(new Date(s), "yyyy-MM-dd", { locale: ko });
  const fmtRate = (r: string | null) =>
    r != null ? `${(parseFloat(r) * 100).toFixed(2)}%` : "—";

  // 미리보기 평균 (신용카드율만)
  const previewAvg =
    items.length > 0
      ? items.reduce((acc, it) => acc + parseFloat(it.creditRate), 0) / items.length
      : null;

  return (
    <>
      <JmCard>
        <JmCardHeader className="flex flex-row items-center justify-between">
          <div>
            <JmCardTitle>카드 가맹점 수수료</JmCardTitle>
            <JmCardDescription>
              카드사를 추가/수정/삭제하면 신용카드율의 평균이 즉시 적용 카드수수료율로 반영됩니다.
            </JmCardDescription>
          </div>
          <JmButton variant="outline" size="xs" className="gap-1.5" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />
            카드사 추가
          </JmButton>
        </JmCardHeader>
        <JmCardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-jm-sm">
            <div className="rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface-muted)]/30 px-3 py-2 space-y-1">
              <div className="text-jm-2xs text-[var(--jm-text-muted)]">현재 적용 평균</div>
              <div className="text-jm-lg font-bold text-[var(--jm-accent-fg)] tabular-nums">
                {rateQuery.data?.current ? fmtRate(rateQuery.data.current.rate) : "—"}
              </div>
              <div className="text-jm-2xs text-[var(--jm-text-muted)]">
                {rateQuery.data?.current ? `적용 ${fmtDate(rateQuery.data.current.appliedFrom)}` : "미적용"}
              </div>
            </div>
            <div className="rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface-muted)]/30 px-3 py-2 space-y-1">
              <div className="text-jm-2xs text-[var(--jm-text-muted)]">미리보기 (현재 입력 기준)</div>
              <div className="text-jm-lg font-bold tabular-nums text-[var(--jm-text)]">
                {previewAvg != null ? `${(previewAvg * 100).toFixed(2)}%` : "—"}
              </div>
              <div className="text-jm-2xs text-[var(--jm-text-muted)]">
                {previewAvg != null ? `카드사 ${items.length}개 신용카드율 평균` : "카드사 미등록"}
              </div>
            </div>
            <div className="rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface-muted)]/30 px-3 py-2 space-y-1">
              <div className="text-jm-2xs text-[var(--jm-text-muted)]">가맹점 구분</div>
              <div className="flex gap-1">
                <JmSelect
                  size="sm"
                  className="h-8 flex-1"
                  placeholder="선택 안 함"
                  value={tier}
                  onChange={(v) => {
                    setTier(v);
                    setTierDirty(true);
                  }}
                  options={TIER_OPTIONS.map((t) => ({ value: t, label: t }))}
                />
                <JmButton
                  variant="outline"
                  size="xs"
                  className="px-2"
                  onClick={() => saveTier.mutate()}
                  disabled={!tierDirty || saveTier.isPending}
                >
                  {saveTier.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  저장
                </JmButton>
              </div>
              <div className="text-jm-2xs text-[var(--jm-text-muted)]">
                {merchant?.appliedFrom ? `최근 적용 ${fmtDate(merchant.appliedFrom)}` : "—"}
              </div>
            </div>
          </div>

          {items.length === 0 ? (
            <p className="text-jm-sm text-[var(--jm-text-muted)] py-6 text-center">등록된 카드사가 없습니다.</p>
          ) : (
            <JmTable>
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead>카드사</JmTableHead>
                  <JmTableHead>가맹점번호</JmTableHead>
                  <JmTableHead>결제은행</JmTableHead>
                  <JmTableHead>결제계좌</JmTableHead>
                  <JmTableHead className="text-right">신용카드</JmTableHead>
                  <JmTableHead className="text-right">체크(은행계)</JmTableHead>
                  <JmTableHead className="text-right">체크(전문계)</JmTableHead>
                  <JmTableHead className="text-right">대금주기</JmTableHead>
                  <JmTableHead className="w-24 text-right">액션</JmTableHead>
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {items.map((it) => (
                  <JmTableRow key={it.id}>
                    <JmTableCell className="font-medium">{it.companyName}</JmTableCell>
                    <JmTableCell className="text-[var(--jm-text-muted)]">{it.merchantNo ?? "—"}</JmTableCell>
                    <JmTableCell className="text-[var(--jm-text-muted)]">{it.settlementBank ?? "—"}</JmTableCell>
                    <JmTableCell className="text-[var(--jm-text-muted)] tabular-nums">{it.settlementAccount ?? "—"}</JmTableCell>
                    <JmTableCell className="text-right tabular-nums">{fmtRate(it.creditRate)}</JmTableCell>
                    <JmTableCell className="text-right tabular-nums text-[var(--jm-text-muted)]">{fmtRate(it.checkBankRate)}</JmTableCell>
                    <JmTableCell className="text-right tabular-nums text-[var(--jm-text-muted)]">{fmtRate(it.checkSpecialRate)}</JmTableCell>
                    <JmTableCell className="text-right text-[var(--jm-text-muted)]">
                      {it.paymentDays != null ? `${it.paymentDays}일` : "—"}
                    </JmTableCell>
                    <JmTableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <JmIconButton aria-label="카드사 수정" variant="ghost" size="sm" className="size-7" onClick={() => openEdit(it)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </JmIconButton>
                        <JmIconButton
                          aria-label="카드사 삭제"
                          variant="ghost"
                          size="sm"
                          className="size-7 text-[var(--jm-danger-fg)] hover:text-[var(--jm-danger-fg)]"
                          onClick={() => setDeleteFeeId(it.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </JmIconButton>
                      </div>
                    </JmTableCell>
                  </JmTableRow>
                ))}
              </JmTableBody>
            </JmTable>
          )}

          {rateQuery.data && rateQuery.data.history.length > 1 && (
            <div>
              <button
                type="button"
                className="flex items-center gap-1 text-jm-xs text-[var(--jm-text-muted)] hover:text-[var(--jm-text)] transition-colors"
                onClick={() => setShowHistory((v) => !v)}
              >
                {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                적용 이력 ({rateQuery.data.history.length - 1}건)
              </button>
              {showHistory && (
                <div className="mt-2 rounded-lg border border-[var(--jm-border)] overflow-hidden">
                  <table className="w-full text-jm-xs">
                    <thead>
                      <tr className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)]">
                        <th className="px-3 py-2 text-left font-medium border-b border-[var(--jm-border)]">평균 수수료율</th>
                        <th className="px-3 py-2 text-left font-medium border-b border-[var(--jm-border)]">적용 시작일</th>
                        <th className="px-3 py-2 text-left font-medium border-b border-[var(--jm-border)]">메모</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rateQuery.data.history.slice(1).map((r) => (
                        <tr key={r.id} className="border-b border-[var(--jm-border)] last:border-0 hover:bg-[var(--jm-surface-muted)]">
                          <td className="px-3 py-2 tabular-nums">{fmtRate(r.rate)}</td>
                          <td className="px-3 py-2">{fmtDate(r.appliedFrom)}</td>
                          <td className="px-3 py-2 text-[var(--jm-text-muted)]">{r.memo ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </JmCardContent>
      </JmCard>

      <JmDialog open={feeDialogOpen} onOpenChange={setFeeDialogOpen}>
        <JmDialogContent size="xl">
          <JmDialogHeader>
            <JmDialogTitle>{editingFeeId ? "카드사 수정" : "카드사 추가"}</JmDialogTitle>
          </JmDialogHeader>
          <JmDialogBody className="grid grid-cols-2 gap-3 text-jm-sm">
            <FeeField label="카드사" required value={feeForm.companyName} onChange={(v) => setFeeForm((p) => ({ ...p, companyName: v }))} placeholder="예: KB카드" />
            <FeeField label="가맹점번호" value={feeForm.merchantNo} onChange={(v) => setFeeForm((p) => ({ ...p, merchantNo: v }))} />
            <FeeField label="결제은행" value={feeForm.settlementBank} onChange={(v) => setFeeForm((p) => ({ ...p, settlementBank: v }))} placeholder="예: 국민은행" />
            <FeeField label="결제계좌번호" value={feeForm.settlementAccount} onChange={(v) => setFeeForm((p) => ({ ...p, settlementAccount: v }))} />
            <FeeField label="신용카드 수수료율 (%)" required value={feeForm.creditRate} onChange={(v) => setFeeForm((p) => ({ ...p, creditRate: v }))} placeholder="예: 0.40" />
            <FeeField label="대금지급주기 (영업일)" value={feeForm.paymentDays} onChange={(v) => setFeeForm((p) => ({ ...p, paymentDays: v }))} placeholder="예: 1" />
            <FeeField label="체크카드 은행계 (%)" value={feeForm.checkBankRate} onChange={(v) => setFeeForm((p) => ({ ...p, checkBankRate: v }))} placeholder="예: 0.15" />
            <FeeField label="체크카드 전문계 (%)" value={feeForm.checkSpecialRate} onChange={(v) => setFeeForm((p) => ({ ...p, checkSpecialRate: v }))} placeholder="예: 0.15" />
          </JmDialogBody>
          <JmDialogFooter>
            <JmButton variant="outline" size="xs" onClick={() => setFeeDialogOpen(false)}>
              취소
            </JmButton>
            <JmButton
              variant="cta"
              size="xs"
              onClick={() => {
                if (!feeForm.companyName || !feeForm.creditRate) {
                  toast.error("카드사명과 신용카드 수수료율은 필수입니다");
                  return;
                }
                saveFee.mutate();
              }}
              disabled={saveFee.isPending}
            >
              {saveFee.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              {editingFeeId ? "수정" : "추가"}
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>

      <JmDialog open={!!deleteFeeId} onOpenChange={(v) => !v && setDeleteFeeId(null)}>
        <JmDialogContent size="sm">
          <JmDialogHeader>
            <JmDialogTitle>카드사 삭제</JmDialogTitle>
          </JmDialogHeader>
          <JmDialogBody>
            <p className="text-jm-sm text-[var(--jm-text-muted)]">
              이 카드사 정보를 삭제하시겠습니까? 이미 적용된 수수료율 이력에는 영향이 없습니다.
            </p>
          </JmDialogBody>
          <JmDialogFooter>
            <JmButton variant="outline" size="xs" onClick={() => setDeleteFeeId(null)}>
              취소
            </JmButton>
            <JmButton
              variant="danger"
              size="xs"
              onClick={() => {
                if (deleteFeeId) deleteFee.mutate(deleteFeeId);
              }}
              disabled={deleteFee.isPending}
            >
              {deleteFee.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              삭제
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>
    </>
  );
}

function FeeField({
  label, value, onChange, required, placeholder, type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
}) {
  return (
    <JmFormField label={label} required={required}>
      <JmInput
        type={type ?? "text"}
        size="sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8"
      />
    </JmFormField>
  );
}

function rateToPercent(r: string | null): string {
  if (r == null || r === "") return "";
  return (parseFloat(r) * 100).toFixed(2);
}

function percentToRate(p: string): string {
  const num = parseFloat(p);
  if (isNaN(num)) return "0";
  return String(num / 100);
}
