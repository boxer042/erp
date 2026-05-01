"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatComma, parseComma } from "@/lib/utils";
import { PAYMENT_METHODS, UNITS_OF_MEASURE } from "@/lib/constants";
import { SupplierPaymentDialog } from "@/components/supplier-payment-dialog";
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
    type: string;
    description: string;
    debitAmount: string;
    creditAmount: string;
    balance: string;
  }>;
}

const ledgerTypeLabels: Record<string, string> = {
  PURCHASE: "매입",
  PAYMENT: "결제",
  ADJUSTMENT: "조정",
  REFUND: "환불",
};

const emptyProductForm = {
  name: "",
  supplierCode: "",
  unitOfMeasure: "EA",
  unitPrice: "0",
  currency: "KRW",
  leadTimeDays: "",
  minOrderQty: "1",
  memo: "",
  vatIncluded: false,
};

export default function SupplierDetailPage() {
  const params = useParams();
  const router = useRouter();
  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/suppliers");
    }
  };
  const [supplier, setSupplier] = useState<SupplierDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<SupplierProduct | null>(null);
  const [productForm, setProductForm] = useState(emptyProductForm);

  // 결제 등록 Dialog (원장 탭에서 사용)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

  const fetchSupplier = useCallback(async () => {
    const res = await fetch(`/api/suppliers/${params.id}`);
    if (res.ok) {
      setSupplier(await res.json());
    }
    setLoading(false);
  }, [params.id]);

  useEffect(() => { fetchSupplier(); }, [fetchSupplier]);

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
    return productForm.unitPrice;
  };

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingProduct
      ? `/api/supplier-products/${editingProduct.id}`
      : "/api/supplier-products";
    const method = editingProduct ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...productForm,
        unitPrice: getProductSubmitPrice(),
        supplierId: params.id,
        leadTimeDays: productForm.leadTimeDays ? parseInt(productForm.leadTimeDays) : undefined,
        minOrderQty: parseInt(productForm.minOrderQty),
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      toast.error(typeof err.error === "string" ? err.error : "저장에 실패했습니다");
      return;
    }

    toast.success(editingProduct ? "상품이 수정되었습니다" : "상품이 등록되었습니다");
    setProductDialogOpen(false);
    fetchSupplier();
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    const res = await fetch(`/api/supplier-products/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("삭제에 실패했습니다"); return; }
    toast.success("상품이 비활성화되었습니다");
    fetchSupplier();
  };

  if (loading) return <Loading />;
  if (!supplier) return <div className="p-6">거래처를 찾을 수 없습니다</div>;

  const paymentLabel =
    PAYMENT_METHODS.find((m) => m.value === supplier.paymentMethod)?.label ||
    supplier.paymentMethod;

  const formatAmount = (amount: string) =>
    parseFloat(amount).toLocaleString("ko-KR");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={handleBack} aria-label="뒤로가기">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold">{supplier.name}</h2>
        <Badge
          variant={
            supplier.paymentMethod === "CREDIT" ? "destructive" : "default"
          }
        >
          {paymentLabel}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>미지급 잔액</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₩{formatAmount(supplier.outstandingBalance)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>결제 기한</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {supplier.paymentTermDays}일
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>등록 상품</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {supplier.supplierProducts.length}개
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>기본 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">사업자번호</dt>
              <dd>{supplier.businessNumber || "-"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">대표자</dt>
              <dd>{supplier.representative || "-"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">전화번호</dt>
              <dd>{supplier.phone || "-"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">FAX</dt>
              <dd>{supplier.fax || "-"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">이메일</dt>
              <dd>{supplier.email || "-"}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted-foreground">주소</dt>
              <dd>{supplier.address || "-"}</dd>
            </div>
            {(supplier.bankName || supplier.bankAccount) && (
              <div className="col-span-2">
                <dt className="text-muted-foreground">계좌정보</dt>
                <dd>{[supplier.bankName, supplier.bankAccount, supplier.bankHolder].filter(Boolean).join(" / ") || "-"}</dd>
              </div>
            )}
            {supplier.memo && (
              <div className="col-span-2">
                <dt className="text-muted-foreground">메모</dt>
                <dd>{supplier.memo}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* 담당자 */}
      {supplier.contacts && supplier.contacts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>담당자</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>휴대폰</TableHead>
                  <TableHead>직책</TableHead>
                  <TableHead>이메일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplier.contacts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.phone || "-"}</TableCell>
                    <TableCell>{c.position || "-"}</TableCell>
                    <TableCell>{c.email || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">공급 상품</TabsTrigger>
          <TabsTrigger value="ledger">거래 원장</TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>공급 상품 목록</CardTitle>
                <Button size="sm" onClick={openCreateProduct}>
                  <Plus className="mr-2 h-4 w-4" />
                  상품 추가
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>상품명</TableHead>
                    <TableHead>품번</TableHead>
                    <TableHead>단위</TableHead>
                    <TableHead className="text-right">단가</TableHead>
                    <TableHead>리드타임</TableHead>
                    <TableHead>최소주문</TableHead>
                    <TableHead className="w-[100px]">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supplier.supplierProducts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        등록된 공급 상품이 없습니다
                      </TableCell>
                    </TableRow>
                  ) : (
                    supplier.supplierProducts.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">
                          {product.name}
                        </TableCell>
                        <TableCell>{product.supplierCode || "-"}</TableCell>
                        <TableCell>{product.unitOfMeasure}</TableCell>
                        <TableCell className="text-right">
                          ₩{formatAmount(product.unitPrice)}
                        </TableCell>
                        <TableCell>
                          {product.leadTimeDays ? `${product.leadTimeDays}일` : "-"}
                        </TableCell>
                        <TableCell>{product.minOrderQty}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditProduct(product)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteProduct(product.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ledger">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">거래 원장</CardTitle>
              <Button size="sm" onClick={() => setPaymentDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />결제 등록
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>일자</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>설명</TableHead>
                    <TableHead className="text-right">차변 (매입)</TableHead>
                    <TableHead className="text-right">대변 (결제)</TableHead>
                    <TableHead className="text-right">잔액</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supplier.balanceLedger.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        거래 내역이 없습니다
                      </TableCell>
                    </TableRow>
                  ) : (
                    supplier.balanceLedger.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          {new Date(entry.date).toLocaleDateString("ko-KR")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {ledgerTypeLabels[entry.type] || entry.type}
                          </Badge>
                        </TableCell>
                        <TableCell>{entry.description}</TableCell>
                        <TableCell className="text-right">
                          {parseFloat(entry.debitAmount) > 0
                            ? `₩${formatAmount(entry.debitAmount)}`
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {parseFloat(entry.creditAmount) > 0
                            ? `₩${formatAmount(entry.creditAmount)}`
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ₩{formatAmount(entry.balance)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {/* 결제 등록 다이얼로그 (거래처 고정) */}
      <SupplierPaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        fixedSupplier={supplier ? { id: supplier.id, name: supplier.name } : undefined}
        onSaved={fetchSupplier}
      />

      {/* 공급 상품 등록/수정 다이얼로그 */}
      <Dialog open={productDialogOpen} onOpenChange={(open) => { setProductDialogOpen(open); if (!open) setEditingProduct(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "공급 상품 수정" : "공급 상품 등록"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleProductSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>상품명 *</Label>
              <Input value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>품번 (공급자 코드)</Label>
                <Input value={productForm.supplierCode} onChange={(e) => setProductForm({ ...productForm, supplierCode: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>단위</Label>
                <Select value={productForm.unitOfMeasure} onValueChange={(v) => setProductForm({ ...productForm, unitOfMeasure: v ?? "EA" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS_OF_MEASURE.map((u) => (
                      <SelectItem key={u.value} value={u.value}>{u.label} ({u.value})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>단가 (원)</Label>
                <div className="flex h-[28px] rounded-md border border-border bg-card text-[12px]">
                  <button
                    type="button"
                    className={`px-2.5 rounded-l-md transition-colors ${productForm.vatIncluded ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => setProductForm({ ...productForm, vatIncluded: true })}
                  >
                    VAT 포함
                  </button>
                  <button
                    type="button"
                    className={`px-2.5 rounded-r-md transition-colors ${!productForm.vatIncluded ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => setProductForm({ ...productForm, vatIncluded: false })}
                  >
                    VAT 별도
                  </button>
                </div>
              </div>
              <Input
                type="text"
                inputMode="numeric"
                value={formatComma(productForm.unitPrice)}
                onChange={(e) => setProductForm({ ...productForm, unitPrice: parseComma(e.target.value) })}
                onFocus={(e) => e.currentTarget.select()}
              />
              {parseFloat(productForm.unitPrice || "0") > 0 && (
                <div className="flex gap-4 text-xs text-muted-foreground bg-card rounded-md px-3 py-2">
                  {productForm.vatIncluded ? (
                    <>
                      <span>공급가액: ₩{parseFloat(String(Math.round(parseFloat(productForm.unitPrice) / 1.1))).toLocaleString("ko-KR")}</span>
                      <span>세액: ₩{(parseFloat(productForm.unitPrice) - Math.round(parseFloat(productForm.unitPrice) / 1.1)).toLocaleString("ko-KR")}</span>
                    </>
                  ) : (
                    <>
                      <span>공급가액: ₩{parseFloat(productForm.unitPrice).toLocaleString("ko-KR")}</span>
                      <span>세액: ₩{Math.round(parseFloat(productForm.unitPrice) * 0.1).toLocaleString("ko-KR")}</span>
                      <span className="font-medium text-foreground">합계: ₩{Math.round(parseFloat(productForm.unitPrice) * 1.1).toLocaleString("ko-KR")}</span>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>통화</Label>
                <Select value={productForm.currency} onValueChange={(v) => setProductForm({ ...productForm, currency: v ?? "KRW" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="KRW">KRW (원)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="CNY">CNY (¥)</SelectItem>
                    <SelectItem value="JPY">JPY (¥)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>리드타임 (일)</Label>
                <Input type="number" value={productForm.leadTimeDays} onChange={(e) => setProductForm({ ...productForm, leadTimeDays: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>최소 주문 수량</Label>
                <Input type="number" value={productForm.minOrderQty} onChange={(e) => setProductForm({ ...productForm, minOrderQty: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>메모</Label>
              <Textarea value={productForm.memo} onChange={(e) => setProductForm({ ...productForm, memo: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="submit">{editingProduct ? "수정" : "등록"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
