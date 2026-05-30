"use client";

import React, { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import {
  ArrowLeft,
  Building2,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Plus,
  Receipt,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { PAYMENT_METHODS, UNITS_OF_MEASURE } from "@/lib/constants";
import { formatComma, parseComma } from "@/lib/utils";
import { focusCaretEnd } from "@/jm/lib/focus";
import { SupplierPaymentDialog } from "@/components/supplier-payment-dialog";
import {
  SupplierLedgerTable,
  type SupplierLedgerEntry,
} from "@/components/supplier-ledger-table";
import { NameAutocomplete } from "@/components/new-product-form/parts";
import {
  JmBadge,
  JmButton,
  JmCard,
  JmCardContent,
  JmCardHeader,
  JmCardTitle,
  JmContainer,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmFormField,
  JmIconButton,
  JmInput,
  JmScope,
  JmSelect,
  JmStat,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
  JmTabs,
  JmTabsList,
  JmTabsPanel,
  JmTabsTrigger,
  JmTextarea,
} from "@/jm";
import Loading from "./loading";

interface SupplierProduct {
  id: string;
  name: string;
  supplierCode: string | null;
  unitPrice: string;
  unitOfMeasure: string;
  currency: string;
  leadTimeDays: number | null;
  minOrderQty: number;
  memo: string | null;
}

interface SupplierContact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  position: string | null;
}

interface SupplierDetail {
  id: string;
  name: string;
  businessNumber: string | null;
  representative: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  address: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
  paymentMethod: string;
  paymentTermDays: number;
  memo: string | null;
  contacts?: SupplierContact[];
  outstandingBalance: string;
  supplierProducts: SupplierProduct[];
  balanceLedger: Array<{
    id: string;
    date: string;
    createdAt: string;
    type: "PURCHASE" | "PAYMENT" | "ADJUSTMENT" | "REFUND";
    description: string;
    debitAmount: string;
    creditAmount: string;
    balance: string;
    referenceId: string | null;
    referenceType: string | null;
  }>;
}

const emptyProductForm = {
  name: "",
  supplierCode: "",
  unitOfMeasure: "EA",
  unitPrice: "",
  currency: "KRW",
  leadTimeDays: "",
  minOrderQty: "1",
  memo: "",
  vatIncluded: false,
};

const UNIT_OPTIONS = UNITS_OF_MEASURE.map((u) => ({
  value: u.value,
  label: `${u.label} (${u.value})`,
}));

const CURRENCY_OPTIONS = [
  { value: "KRW", label: "KRW (원)" },
  { value: "USD", label: "USD ($)" },
  { value: "CNY", label: "CNY (¥)" },
  { value: "JPY", label: "JPY (¥)" },
];

function formatAmount(amount: string | number) {
  const v = typeof amount === "string" ? parseFloat(amount) : amount;
  return Math.round(v).toLocaleString("ko-KR");
}

function formatKRW(amount: string | number) {
  return `₩${formatAmount(amount)}`;
}

export default function SupplierDetailPage() {
  const params = useParams();
  const supplierId = String(params.id ?? "");
  const router = useRouter();
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/suppliers");
    }
  };

  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<SupplierProduct | null>(null);
  const [productForm, setProductForm] = useState(emptyProductForm);

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

  const supplierQuery = useQuery({
    queryKey: queryKeys.suppliers.detail(supplierId),
    queryFn: () => apiGet<SupplierDetail>(`/api/suppliers/${supplierId}`),
  });
  const supplier = supplierQuery.data ?? null;
  const loading = supplierQuery.isPending;
  const fetchSupplier = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.detail(supplierId) });

  const productNameItems = useMemo(
    () =>
      (supplier?.supplierProducts ?? [])
        .filter((sp) => sp.id !== editingProduct?.id)
        .map((sp) => ({ id: sp.id, name: sp.name, badge: sp.supplierCode })),
    [supplier?.supplierProducts, editingProduct?.id],
  );

  const openCreateProduct = () => {
    setEditingProduct(null);
    setProductForm(emptyProductForm);
    setProductDialogOpen(true);
  };

  const openEditProduct = (product: SupplierProduct) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name,
      supplierCode: product.supplierCode || "",
      unitOfMeasure: product.unitOfMeasure,
      unitPrice: product.unitPrice,
      currency: product.currency,
      leadTimeDays: product.leadTimeDays?.toString() || "",
      minOrderQty: product.minOrderQty.toString(),
      memo: product.memo || "",
      vatIncluded: true,
    });
    setProductDialogOpen(true);
  };

  // VAT 포함 가격 → 공급가액으로 변환하여 저장
  const getProductSubmitPrice = () => {
    const price = parseFloat(productForm.unitPrice || "0");
    if (productForm.vatIncluded && price > 0) {
      return String(Math.round(price / 1.1));
    }
    // 빈값은 서버 parseFloat("")=NaN 방지를 위해 "0" 으로 환산
    return productForm.unitPrice || "0";
  };

  const productSubmitMutation = useMutation({
    mutationFn: async () => {
      const url = editingProduct
        ? `/api/supplier-products/${editingProduct.id}`
        : "/api/supplier-products";
      const method = editingProduct ? "PUT" : "POST";
      return apiMutate(url, method, {
        ...productForm,
        unitPrice: getProductSubmitPrice(),
        supplierId,
        leadTimeDays: productForm.leadTimeDays
          ? parseInt(productForm.leadTimeDays)
          : undefined,
        minOrderQty: parseInt(productForm.minOrderQty),
      });
    },
    onSuccess: () => {
      toast.success(editingProduct ? "상품이 수정되었습니다" : "상품이 등록되었습니다");
      setProductDialogOpen(false);
      fetchSupplier();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장에 실패했습니다"),
  });

  const handleProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    productSubmitMutation.mutate();
  };

  const deleteProductMutation = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/supplier-products/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("상품이 비활성화되었습니다");
      fetchSupplier();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "삭제에 실패했습니다"),
  });
  const handleDeleteProduct = (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    deleteProductMutation.mutate(id);
  };

  if (loading) return <Loading />;
  if (!supplier) return <div className="p-6">거래처를 찾을 수 없습니다</div>;

  const paymentLabel =
    PAYMENT_METHODS.find((m) => m.value === supplier.paymentMethod)?.label ||
    supplier.paymentMethod;

  const outstandingNum = parseFloat(supplier.outstandingBalance);
  // 잔액 색상 룰 — 거래처원장과 통일: 양수(미지급)는 정상, 음수(과지급)만 빨강
  const outstandingHint =
    outstandingNum > 0
      ? "갚을 돈"
      : outstandingNum < 0
        ? "과지급"
        : "잔액 없음";

  return (
    <JmScope theme={resolvedTheme === "dark" ? "dark" : "light"} className="contents">
      <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
        {/* 스티키 헤더 */}
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-6 py-3">
          <JmIconButton
            aria-label="뒤로"
            size="sm"
            variant="ghost"
            onClick={handleBack}
          >
            <ArrowLeft />
          </JmIconButton>
          <span className="text-jm-base font-semibold text-[var(--jm-text)] truncate">
            {supplier.name}
          </span>
          <JmBadge
            variant={supplier.paymentMethod === "CREDIT" ? "danger" : "default"}
            size="sm"
            shape="square"
          >
            {paymentLabel}
          </JmBadge>
        </div>

        <JmContainer width="default" padded={false} className="space-y-6 p-6">
          {/* 메타 정보 — 전화/이메일/사업자번호 inline */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-jm-sm text-[var(--jm-text-muted)]">
            {supplier.phone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="size-3.5" />
                <span className="tabular-nums">{supplier.phone}</span>
              </span>
            )}
            {supplier.email && (
              <span className="inline-flex items-center gap-1.5">
                <Mail className="size-3.5" />
                {supplier.email}
              </span>
            )}
            {supplier.businessNumber && (
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="size-3.5" />
                <span className="tabular-nums">{supplier.businessNumber}</span>
              </span>
            )}
          </div>

          {/* KPI */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <JmStat
              label="미지급 잔액"
              value={formatKRW(supplier.outstandingBalance)}
              icon={<Wallet className="size-4" />}
              hint={outstandingHint}
              size="sm"
              positiveIsGood={false}
              // 과지급(음수) 만 위험 강조
              className={
                outstandingNum < 0
                  ? "ring-2 ring-[var(--jm-danger-fg)]/30"
                  : undefined
              }
            />
            <JmStat
              label="결제 기한"
              value={`${supplier.paymentTermDays}일`}
              icon={<Receipt className="size-4" />}
              size="sm"
            />
            <JmStat
              label="등록 상품"
              value={`${supplier.supplierProducts.length}개`}
              size="sm"
            />
          </div>

          {/* 기본 정보 */}
          <JmCard>
            <JmCardHeader>
              <JmCardTitle>기본 정보</JmCardTitle>
            </JmCardHeader>
            <JmCardContent>
              <dl className="grid grid-cols-2 gap-4 text-jm-sm">
                <InfoRow label="사업자번호" value={supplier.businessNumber} />
                <InfoRow label="대표자" value={supplier.representative} />
                <InfoRow label="전화번호" value={supplier.phone} />
                <InfoRow label="FAX" value={supplier.fax} />
                <InfoRow label="이메일" value={supplier.email} />
                <InfoRow
                  label="주소"
                  value={supplier.address}
                  className="col-span-2"
                />
                {(supplier.bankName || supplier.bankAccount) && (
                  <InfoRow
                    label="계좌정보"
                    value={
                      [supplier.bankName, supplier.bankAccount, supplier.bankHolder]
                        .filter(Boolean)
                        .join(" / ") || null
                    }
                    className="col-span-2"
                  />
                )}
                {supplier.memo && (
                  <InfoRow
                    label="메모"
                    value={supplier.memo}
                    className="col-span-2"
                  />
                )}
              </dl>
            </JmCardContent>
          </JmCard>

          {/* 담당자 */}
          {supplier.contacts && supplier.contacts.length > 0 && (
            <JmCard>
              <JmCardHeader>
                <JmCardTitle>담당자</JmCardTitle>
              </JmCardHeader>
              <JmCardContent className="px-0 pb-0">
                <JmTable>
                  <JmTableHeader>
                    <JmTableRow>
                      <JmTableHead>이름</JmTableHead>
                      <JmTableHead>휴대폰</JmTableHead>
                      <JmTableHead>직책</JmTableHead>
                      <JmTableHead>이메일</JmTableHead>
                    </JmTableRow>
                  </JmTableHeader>
                  <JmTableBody>
                    {supplier.contacts.map((c) => (
                      <JmTableRow key={c.id}>
                        <JmTableCell className="px-3 py-2 font-medium text-[var(--jm-text)]">{c.name}</JmTableCell>
                        <JmTableCell className="px-3 py-2 text-[var(--jm-text-muted)]">{c.phone || "-"}</JmTableCell>
                        <JmTableCell className="px-3 py-2 text-[var(--jm-text-muted)]">{c.position || "-"}</JmTableCell>
                        <JmTableCell className="px-3 py-2 text-[var(--jm-text-muted)]">{c.email || "-"}</JmTableCell>
                      </JmTableRow>
                    ))}
                  </JmTableBody>
                </JmTable>
              </JmCardContent>
            </JmCard>
          )}

          {/* 탭 — 공급 상품 / 거래 원장 */}
          <JmTabs defaultValue="products">
            <JmTabsList variant="line" className="overflow-x-auto">
              <JmTabsTrigger value="products">
                공급 상품
                <span className="ml-1 tabular-nums text-[var(--jm-text-subtle)]">
                  {supplier.supplierProducts.length}
                </span>
              </JmTabsTrigger>
              <JmTabsTrigger value="ledger">
                거래 원장
                <span className="ml-1 tabular-nums text-[var(--jm-text-subtle)]">
                  {supplier.balanceLedger.length}
                </span>
              </JmTabsTrigger>
            </JmTabsList>

            <JmTabsPanel value="products">
              <JmCard>
                <JmCardHeader>
                  <div className="flex items-center justify-between">
                    <JmCardTitle>공급 상품 목록</JmCardTitle>
                    <JmButton size="sm" variant="cta" onClick={openCreateProduct}>
                      <Plus />
                      <span>상품 추가</span>
                    </JmButton>
                  </div>
                </JmCardHeader>
                <JmCardContent className="px-0 pb-0">
                  <JmTable>
                    <JmTableHeader>
                      <JmTableRow>
                        <JmTableHead>상품명</JmTableHead>
                        <JmTableHead>품번</JmTableHead>
                        <JmTableHead>단위</JmTableHead>
                        <JmTableHead className="text-right">단가</JmTableHead>
                        <JmTableHead>리드타임</JmTableHead>
                        <JmTableHead>최소주문</JmTableHead>
                        <JmTableHead className="w-[100px]">관리</JmTableHead>
                      </JmTableRow>
                    </JmTableHeader>
                    <JmTableBody>
                      {supplier.supplierProducts.length === 0 ? (
                        <JmTableRow className="hover:bg-transparent">
                          <JmTableCell colSpan={7} className="text-center py-8 text-[var(--jm-text-muted)]">
                            등록된 공급 상품이 없습니다
                          </JmTableCell>
                        </JmTableRow>
                      ) : (
                        supplier.supplierProducts.map((product) => (
                          <JmTableRow key={product.id}>
                            <JmTableCell className="px-3 py-2 font-medium text-[var(--jm-text)]">
                              {product.name}
                            </JmTableCell>
                            <JmTableCell className="px-3 py-2 text-[var(--jm-text-muted)]">
                              {product.supplierCode || "-"}
                            </JmTableCell>
                            <JmTableCell className="px-3 py-2 text-[var(--jm-text-muted)]">
                              {product.unitOfMeasure}
                            </JmTableCell>
                            <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
                              ₩{formatAmount(product.unitPrice)}
                            </JmTableCell>
                            <JmTableCell className="px-3 py-2 text-[var(--jm-text-muted)]">
                              {product.leadTimeDays ? `${product.leadTimeDays}일` : "-"}
                            </JmTableCell>
                            <JmTableCell className="px-3 py-2 text-[var(--jm-text-muted)] tabular-nums">
                              {product.minOrderQty}
                            </JmTableCell>
                            <JmTableCell className="px-3 py-2">
                              <div className="flex gap-1">
                                <JmIconButton
                                  aria-label="수정"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openEditProduct(product)}
                                >
                                  <Pencil />
                                </JmIconButton>
                                <JmIconButton
                                  aria-label="삭제"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteProduct(product.id)}
                                  disabled={
                                    deleteProductMutation.isPending &&
                                    deleteProductMutation.variables === product.id
                                  }
                                >
                                  {deleteProductMutation.isPending &&
                                  deleteProductMutation.variables === product.id ? (
                                    <Loader2 className="animate-spin" />
                                  ) : (
                                    <Trash2 />
                                  )}
                                </JmIconButton>
                              </div>
                            </JmTableCell>
                          </JmTableRow>
                        ))
                      )}
                    </JmTableBody>
                  </JmTable>
                </JmCardContent>
              </JmCard>
            </JmTabsPanel>

            <JmTabsPanel value="ledger">
              <JmCard>
                <JmCardHeader>
                  <div className="flex items-center justify-between">
                    <JmCardTitle>거래 원장</JmCardTitle>
                    <JmButton
                      size="sm"
                      variant="cta"
                      onClick={() => setPaymentDialogOpen(true)}
                    >
                      <Plus />
                      <span>결제 등록</span>
                    </JmButton>
                  </div>
                </JmCardHeader>
                <JmCardContent className="px-0 pb-0">
                  <SupplierLedgerTable
                    entries={supplier.balanceLedger as SupplierLedgerEntry[]}
                    showSupplierColumn={false}
                    emptyState={
                      <p className="text-center py-8 text-[var(--jm-text-muted)] text-jm-sm">
                        거래 내역이 없습니다
                      </p>
                    }
                  />
                </JmCardContent>
              </JmCard>
            </JmTabsPanel>
          </JmTabs>
        </JmContainer>
      </div>

      {/* 결제 등록 다이얼로그 (거래처 고정) */}
      <SupplierPaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        fixedSupplier={{ id: supplier.id, name: supplier.name }}
        onSaved={fetchSupplier}
      />

      {/* 공급 상품 등록/수정 다이얼로그 */}
      <JmDialog
        open={productDialogOpen}
        onOpenChange={(open) => {
          setProductDialogOpen(open);
          if (!open) setEditingProduct(null);
        }}
      >
        <JmDialogContent size="lg">
          <JmDialogHeader>
            <JmDialogTitle>
              {editingProduct ? "공급 상품 수정" : "공급 상품 등록"}
            </JmDialogTitle>
          </JmDialogHeader>
          <form onSubmit={handleProductSubmit}>
            <JmDialogBody>
              <div className="space-y-4 text-jm-sm">
                <JmFormField label="상품명" required>
                  <NameAutocomplete
                    value={productForm.name}
                    onChange={(name) => setProductForm({ ...productForm, name })}
                    items={productNameItems}
                    placeholder="공급상품명을 입력하세요"
                    warningLabel="이미 등록된 공급상품"
                    inputClassName=""
                  />
                </JmFormField>
                <div className="grid grid-cols-2 gap-3">
                  <JmFormField label="품번 (공급자 코드)">
                    <JmInput
                      size="sm"
                      value={productForm.supplierCode}
                      onChange={(e) =>
                        setProductForm({ ...productForm, supplierCode: e.target.value })
                      }
                      onFocus={focusCaretEnd}
                    />
                  </JmFormField>
                  <JmFormField label="단위">
                    <JmSelect
                      size="sm"
                      options={UNIT_OPTIONS}
                      value={productForm.unitOfMeasure}
                      onChange={(v) =>
                        setProductForm({ ...productForm, unitOfMeasure: v })
                      }
                    />
                  </JmFormField>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-jm-xs font-medium text-[var(--jm-text-muted)]">
                      단가 (원)
                    </label>
                    <div className="flex h-7 rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface)] text-jm-2xs overflow-hidden">
                      <button
                        type="button"
                        className={`px-2.5 transition-colors ${
                          productForm.vatIncluded
                            ? "bg-[var(--jm-surface-muted)] text-[var(--jm-text)]"
                            : "text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
                        }`}
                        onClick={() =>
                          setProductForm({ ...productForm, vatIncluded: true })
                        }
                      >
                        VAT 포함
                      </button>
                      <button
                        type="button"
                        className={`px-2.5 transition-colors border-l border-[var(--jm-border)] ${
                          !productForm.vatIncluded
                            ? "bg-[var(--jm-surface-muted)] text-[var(--jm-text)]"
                            : "text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
                        }`}
                        onClick={() =>
                          setProductForm({ ...productForm, vatIncluded: false })
                        }
                      >
                        VAT 별도
                      </button>
                    </div>
                  </div>
                  <JmInput
                    size="sm"
                    inputMode="numeric"
                    placeholder="0"
                    value={formatComma(productForm.unitPrice)}
                    onChange={(e) =>
                      setProductForm({ ...productForm, unitPrice: parseComma(e.target.value) })
                    }
                    onFocus={focusCaretEnd}
                    className="text-right tabular-nums font-semibold"
                  />
                  {parseFloat(productForm.unitPrice || "0") > 0 && (
                    <div className="flex gap-4 text-jm-2xs text-[var(--jm-text-muted)] bg-[var(--jm-surface-muted)] rounded-md px-3 py-2">
                      {productForm.vatIncluded ? (
                        <>
                          <span>
                            공급가액: ₩
                            {formatAmount(Math.round(parseFloat(productForm.unitPrice) / 1.1))}
                          </span>
                          <span>
                            세액: ₩
                            {formatAmount(
                              parseFloat(productForm.unitPrice) -
                                Math.round(parseFloat(productForm.unitPrice) / 1.1),
                            )}
                          </span>
                        </>
                      ) : (
                        <>
                          <span>공급가액: ₩{formatAmount(productForm.unitPrice)}</span>
                          <span>
                            세액: ₩
                            {formatAmount(Math.round(parseFloat(productForm.unitPrice) * 0.1))}
                          </span>
                          <span className="font-medium text-[var(--jm-text)]">
                            합계: ₩
                            {formatAmount(Math.round(parseFloat(productForm.unitPrice) * 1.1))}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <JmFormField label="통화">
                    <JmSelect
                      size="sm"
                      options={CURRENCY_OPTIONS}
                      value={productForm.currency}
                      onChange={(v) => setProductForm({ ...productForm, currency: v })}
                    />
                  </JmFormField>
                  <JmFormField label="리드타임 (일)">
                    <JmInput
                      size="sm"
                      type="number"
                      value={productForm.leadTimeDays}
                      onChange={(e) =>
                        setProductForm({ ...productForm, leadTimeDays: e.target.value })
                      }
                    />
                  </JmFormField>
                  <JmFormField label="최소 주문 수량">
                    <JmInput
                      size="sm"
                      type="number"
                      value={productForm.minOrderQty}
                      onChange={(e) =>
                        setProductForm({ ...productForm, minOrderQty: e.target.value })
                      }
                    />
                  </JmFormField>
                </div>
                <JmFormField label="메모">
                  <JmTextarea
                    value={productForm.memo}
                    onChange={(e) =>
                      setProductForm({ ...productForm, memo: e.target.value })
                    }
                    rows={3}
                  />
                </JmFormField>
              </div>
            </JmDialogBody>
            <JmDialogFooter>
              <JmButton
                type="button"
                variant="ghost"
                onClick={() => setProductDialogOpen(false)}
              >
                취소
              </JmButton>
              <JmButton
                type="submit"
                variant="cta"
                disabled={productSubmitMutation.isPending}
              >
                {productSubmitMutation.isPending && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                <span>{editingProduct ? "수정" : "등록"}</span>
              </JmButton>
            </JmDialogFooter>
          </form>
        </JmDialogContent>
      </JmDialog>
    </JmScope>
  );
}

// ─── helpers ───────────────────────────────────────────────────────────

function InfoRow({
  label,
  value,
  className,
}: {
  label: string;
  value: string | null | undefined;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[var(--jm-text-muted)] text-jm-xs">{label}</dt>
      <dd className="text-[var(--jm-text)] mt-0.5">{value || "-"}</dd>
    </div>
  );
}
