"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Package, Store, Truck, ShoppingCart, Warehouse, ChevronDown, ChevronUp, Plus,
  Pencil, Trash2, Loader2, Building2, Landmark, Star, Layout, ChevronRight, Images,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { Skeleton } from "@/components/ui/skeleton";

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
    <div className="p-6 space-y-6">
      <h2 className="text-lg font-semibold">설정</h2>

      <Card>
        <CardHeader>
          <CardTitle>시스템 정보</CardTitle>
          <CardDescription>JAEWOOMADE ERP 현황</CardDescription>
        </CardHeader>
        <CardContent>
          {stats ? (
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" /> 등록 상품
                  </TableCell>
                  <TableCell className="text-right font-medium">{stats.products}개</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-muted-foreground" /> 거래처
                  </TableCell>
                  <TableCell className="text-right font-medium">{stats.suppliers}개</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="flex items-center gap-2">
                    <Store className="h-4 w-4 text-muted-foreground" /> 판매 채널
                  </TableCell>
                  <TableCell className="text-right font-medium">{stats.channels}개</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-muted-foreground" /> 총 주문
                  </TableCell>
                  <TableCell className="text-right font-medium">{stats.orders}건</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="flex items-center gap-2">
                    <Warehouse className="h-4 w-4 text-muted-foreground" /> 재고 품목
                  </TableCell>
                  <TableCell className="text-right font-medium">{stats.inventoryItems}개</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-12" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card
        onClick={() => router.push("/settings/landing")}
        className="cursor-pointer transition-shadow hover:shadow-md"
      >
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Layout className="h-4 w-4" /> 상세페이지 공통 영역 (상단 공지·푸터)
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </CardTitle>
          <CardDescription>
            모든 상품 상세페이지 최상단의 공지·배너와 하단의 배송/환불/AS 안내 등 공통 블록을 한 곳에서 관리합니다.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card
        onClick={() => router.push("/settings/media")}
        className="cursor-pointer transition-shadow hover:shadow-md"
      >
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Images className="h-4 w-4" /> 이미지 관리
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </CardTitle>
          <CardDescription>
            업로드한 이미지를 한 곳에서 확인합니다. 사용 중/고아 상태를 한눈에 보고, 안 쓰는 파일만 영구 삭제할 수 있습니다.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>기본 설정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">기본 세율</span>
            <Badge variant="outline">10%</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">기본 통화</span>
            <Badge variant="outline">KRW (원)</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">기본 단위</span>
            <Badge variant="outline">EA (개)</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" /> 사업자 정보
          </CardTitle>
          <CardDescription>견적서·거래명세표 등 PDF에 표시되는 우리 사업자 정보입니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[13px]">
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
            <div className="md:col-span-2">
              <CompanyField label="주소" value={companyForm.address} onChange={(v) => setCompanyField("address", v)} />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              className="h-8 text-[13px]"
              onClick={() => updateCompany.mutate()}
              disabled={updateCompany.isPending || !companyDirty}
            >
              {updateCompany.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              저장
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-4 w-4" /> 계좌 관리
            </CardTitle>
            <CardDescription>여러 통장을 등록하고 PDF에 노출할 기본 통장을 지정할 수 있습니다.</CardDescription>
          </div>
          <Button size="sm" variant="outline" className="h-8 text-[13px] gap-1.5" onClick={openCreateBank}>
            <Plus className="h-3.5 w-3.5" />
            통장 추가
          </Button>
        </CardHeader>
        <CardContent>
          {bankAccounts.length === 0 ? (
            <p className="text-[13px] text-muted-foreground py-6 text-center">등록된 통장이 없습니다.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>은행</TableHead>
                  <TableHead>예금주</TableHead>
                  <TableHead>계좌번호</TableHead>
                  <TableHead className="w-20">기본</TableHead>
                  <TableHead className="w-28 text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bankAccounts.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.bankName}</TableCell>
                    <TableCell>{b.holder}</TableCell>
                    <TableCell className="tabular-nums">{b.account}</TableCell>
                    <TableCell>
                      {b.isPrimary && (
                        <Badge variant="default" className="gap-1">
                          <Star className="h-3 w-3" /> 기본
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditBank(b)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setBankDeleteId(b.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={bankDialogOpen} onOpenChange={setBankDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{bankEditingId ? "통장 수정" : "통장 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-[13px]">
            <BankField label="은행" required value={bankForm.bankName} onChange={(v) => setBankForm((p) => ({ ...p, bankName: v }))} placeholder="예: 농협" />
            <BankField label="예금주" required value={bankForm.holder} onChange={(v) => setBankForm((p) => ({ ...p, holder: v }))} />
            <BankField label="계좌번호" required value={bankForm.account} onChange={(v) => setBankForm((p) => ({ ...p, account: v }))} placeholder="예: 407-01-144656" />
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <div>
                <div className="font-medium">기본 통장으로 지정</div>
                <div className="text-[11px] text-muted-foreground">PDF에 이 통장이 표시됩니다</div>
              </div>
              <Switch
                checked={bankForm.isPrimary}
                onCheckedChange={(v) => setBankForm((p) => ({ ...p, isPrimary: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={() => setBankDialogOpen(false)}>
              취소
            </Button>
            <Button
              size="sm"
              className="h-8 text-[13px]"
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
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!bankDeleteId} onOpenChange={(v) => !v && setBankDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>통장 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 통장을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (bankDeleteId) deleteBank.mutate(bankDeleteId);
              }}
              disabled={deleteBank.isPending}
            >
              {deleteBank.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CardFeeSection />
    </div>
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
    <div className="space-y-1">
      <label className="text-[11px] text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 text-[13px]"
      />
    </div>
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
    <div className="space-y-1">
      <label className="text-[11px] text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 text-[13px]"
      />
    </div>
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
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>카드 가맹점 수수료</CardTitle>
            <CardDescription>
              카드사를 추가/수정/삭제하면 신용카드율의 평균이 즉시 적용 카드수수료율로 반영됩니다.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" className="h-8 text-[13px] gap-1.5" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />
            카드사 추가
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[13px]">
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 space-y-1">
              <div className="text-[11px] text-muted-foreground">현재 적용 평균</div>
              <div className="text-lg font-bold text-primary tabular-nums">
                {rateQuery.data?.current ? fmtRate(rateQuery.data.current.rate) : "—"}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {rateQuery.data?.current ? `적용 ${fmtDate(rateQuery.data.current.appliedFrom)}` : "미적용"}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 space-y-1">
              <div className="text-[11px] text-muted-foreground">미리보기 (현재 입력 기준)</div>
              <div className="text-lg font-bold tabular-nums">
                {previewAvg != null ? `${(previewAvg * 100).toFixed(2)}%` : "—"}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {previewAvg != null ? `카드사 ${items.length}개 신용카드율 평균` : "카드사 미등록"}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 space-y-1">
              <div className="text-[11px] text-muted-foreground">가맹점 구분</div>
              <div className="flex gap-1">
                <select
                  value={tier}
                  onChange={(e) => {
                    setTier(e.target.value);
                    setTierDirty(true);
                  }}
                  className="h-8 flex-1 rounded-md border border-input bg-transparent px-2 text-[13px]"
                >
                  <option value="">선택 안 함</option>
                  {TIER_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[12px] px-2"
                  onClick={() => saveTier.mutate()}
                  disabled={!tierDirty || saveTier.isPending}
                >
                  {saveTier.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  저장
                </Button>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {merchant?.appliedFrom ? `최근 적용 ${fmtDate(merchant.appliedFrom)}` : "—"}
              </div>
            </div>
          </div>

          {items.length === 0 ? (
            <p className="text-[13px] text-muted-foreground py-6 text-center">등록된 카드사가 없습니다.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>카드사</TableHead>
                  <TableHead>가맹점번호</TableHead>
                  <TableHead>결제은행</TableHead>
                  <TableHead>결제계좌</TableHead>
                  <TableHead className="text-right">신용카드</TableHead>
                  <TableHead className="text-right">체크(은행계)</TableHead>
                  <TableHead className="text-right">체크(전문계)</TableHead>
                  <TableHead className="text-right">대금주기</TableHead>
                  <TableHead className="w-24 text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">{it.companyName}</TableCell>
                    <TableCell className="text-muted-foreground">{it.merchantNo ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{it.settlementBank ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{it.settlementAccount ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtRate(it.creditRate)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{fmtRate(it.checkBankRate)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{fmtRate(it.checkSpecialRate)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {it.paymentDays != null ? `${it.paymentDays}일` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(it)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteFeeId(it.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {rateQuery.data && rateQuery.data.history.length > 1 && (
            <div>
              <button
                type="button"
                className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowHistory((v) => !v)}
              >
                {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                적용 이력 ({rateQuery.data.history.length - 1}건)
              </button>
              {showHistory && (
                <div className="mt-2 rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-muted text-muted-foreground">
                        <th className="px-3 py-2 text-left font-medium border-b border-border">평균 수수료율</th>
                        <th className="px-3 py-2 text-left font-medium border-b border-border">적용 시작일</th>
                        <th className="px-3 py-2 text-left font-medium border-b border-border">메모</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rateQuery.data.history.slice(1).map((r) => (
                        <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                          <td className="px-3 py-2 tabular-nums">{fmtRate(r.rate)}</td>
                          <td className="px-3 py-2">{fmtDate(r.appliedFrom)}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.memo ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={feeDialogOpen} onOpenChange={setFeeDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingFeeId ? "카드사 수정" : "카드사 추가"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <FeeField label="카드사" required value={feeForm.companyName} onChange={(v) => setFeeForm((p) => ({ ...p, companyName: v }))} placeholder="예: KB카드" />
            <FeeField label="가맹점번호" value={feeForm.merchantNo} onChange={(v) => setFeeForm((p) => ({ ...p, merchantNo: v }))} />
            <FeeField label="결제은행" value={feeForm.settlementBank} onChange={(v) => setFeeForm((p) => ({ ...p, settlementBank: v }))} placeholder="예: 국민은행" />
            <FeeField label="결제계좌번호" value={feeForm.settlementAccount} onChange={(v) => setFeeForm((p) => ({ ...p, settlementAccount: v }))} />
            <FeeField label="신용카드 수수료율 (%)" required value={feeForm.creditRate} onChange={(v) => setFeeForm((p) => ({ ...p, creditRate: v }))} placeholder="예: 0.40" />
            <FeeField label="대금지급주기 (영업일)" value={feeForm.paymentDays} onChange={(v) => setFeeForm((p) => ({ ...p, paymentDays: v }))} placeholder="예: 1" />
            <FeeField label="체크카드 은행계 (%)" value={feeForm.checkBankRate} onChange={(v) => setFeeForm((p) => ({ ...p, checkBankRate: v }))} placeholder="예: 0.15" />
            <FeeField label="체크카드 전문계 (%)" value={feeForm.checkSpecialRate} onChange={(v) => setFeeForm((p) => ({ ...p, checkSpecialRate: v }))} placeholder="예: 0.15" />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={() => setFeeDialogOpen(false)}>
              취소
            </Button>
            <Button
              size="sm"
              className="h-8 text-[13px]"
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
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteFeeId} onOpenChange={(v) => !v && setDeleteFeeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>카드사 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 카드사 정보를 삭제하시겠습니까? 이미 적용된 수수료율 이력에는 영향이 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleteFeeId) deleteFee.mutate(deleteFeeId);
              }}
              disabled={deleteFee.isPending}
            >
              {deleteFee.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
    <div className="space-y-1">
      <label className="text-[11px] text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <Input
        type={type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 text-[13px]"
      />
    </div>
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
