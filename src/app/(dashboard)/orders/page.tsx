"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, Search, Eye, Trash2,
  Check, PackageCheck, Truck, CheckCircle, XCircle, RotateCcw, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { formatComma, parseComma } from "@/lib/utils";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

function OrdersSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16 rounded-md" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-5 w-12 rounded-full" /></TableCell>
          <TableCell className="text-right"><div className="flex justify-end"><Skeleton className="h-4 w-20" /></div></TableCell>
          <TableCell><Skeleton className="h-4 w-8" /></TableCell>
          <TableCell>
            <div className="flex gap-1">
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

interface Channel {
  id: string;
  name: string;
  code: string;
  commissionRate: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
  isCanonical?: boolean;
  canonicalProductId?: string | null;
  isBulk?: boolean;
  unitOfMeasure?: string;
  variants?: Array<{
    id: string;
    name: string;
    sku: string;
    inventory: { quantity: string } | null;
  }>;
}

interface Order {
  id: string;
  orderNo: string;
  channelOrderNo: string | null;
  status: string;
  customerName: string | null;
  orderDate: string;
  subtotalAmount: string;
  totalAmount: string;
  commissionAmount: string;
  channel: { name: string; code: string };
  createdBy: { name: string };
  _count: { items: number };
}

interface OrderDetail {
  id: string;
  orderNo: string;
  channelOrderNo: string | null;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  shippingAddress: string | null;
  orderDate: string;
  subtotalAmount: string;
  discountAmount: string;
  shippingFee: string;
  taxAmount: string;
  totalAmount: string;
  commissionAmount: string;
  memo: string | null;
  channel: { name: string; code: string; commissionRate: string };
  createdBy: { name: string };
  items: Array<{
    id: string;
    quantity: string;
    unitPrice: string;
    totalPrice: string;
    canonicalProductId: string | null;
    product: {
      id: string;
      name: string;
      sku: string;
      isSet: boolean;
      isCanonical: boolean;
      variants?: Array<{
        id: string;
        name: string;
        sku: string;
        inventory: { quantity: string } | null;
      }>;
    };
  }>;
}

interface OrderItemForm {
  productId: string;
  productName: string;
  sku: string;
  quantity: string;
  unitPrice: string;
  isBulk?: boolean;
  unitOfMeasure?: string;
}

const statusLabels: Record<string, string> = {
  PENDING: "접수",
  CONFIRMED: "확인",
  PREPARING: "준비",
  SHIPPED: "배송",
  DELIVERED: "완료",
  CANCELLED: "취소",
  RETURNED: "반품",
};

const statusVariants: Record<string, "default" | "secondary" | "destructive" | "outline" | "warning" | "success"> = {
  PENDING: "warning",
  CONFIRMED: "default",
  PREPARING: "secondary",
  SHIPPED: "default",
  DELIVERED: "success",
  CANCELLED: "destructive",
  RETURNED: "warning",
};

const nextActions: Record<string, { action: string; label: string; icon: typeof Check }[]> = {
  PENDING: [
    { action: "confirm", label: "주문 확인", icon: Check },
    { action: "cancel", label: "취소", icon: XCircle },
  ],
  CONFIRMED: [
    { action: "prepare", label: "준비 시작", icon: PackageCheck },
    { action: "cancel", label: "취소", icon: XCircle },
  ],
  PREPARING: [
    { action: "ship", label: "배송 시작", icon: Truck },
  ],
  SHIPPED: [
    { action: "deliver", label: "배송 완료", icon: CheckCircle },
  ],
  DELIVERED: [
    { action: "return", label: "반품 처리", icon: RotateCcw },
  ],
};

export default function OrdersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // 등록 다이얼로그
  const [createOpen, setCreateOpen] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [channelOrderNo, setChannelOrderNo] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [shippingFee, setShippingFee] = useState("0");
  const [orderMemo, setOrderMemo] = useState("");
  const [items, setItems] = useState<OrderItemForm[]>([]);
  const [addProductId, setAddProductId] = useState("");
  const [variantPickerOpen, setVariantPickerOpen] = useState(false);
  const [variantPickerCanonical, setVariantPickerCanonical] = useState<Product | null>(null);

  // 주문 상세 화면에서의 변형 확정용
  const [detailVariantPickerOpen, setDetailVariantPickerOpen] = useState(false);
  const [detailVariantPickerCanonical, setDetailVariantPickerCanonical] = useState<Product | null>(null);
  const [detailVariantTargetItemId, setDetailVariantTargetItemId] = useState<string | null>(null);
  const [detailVariantSubmitting, setDetailVariantSubmitting] = useState(false);

  // 상세 다이얼로그
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<OrderDetail | null>(null);

  const ordersQuery = useQuery({
    queryKey: queryKeys.orders.list({ search: appliedSearch, status: filterStatus }),
    queryFn: () => {
      const params = new URLSearchParams();
      if (appliedSearch) params.set("search", appliedSearch);
      if (filterStatus) params.set("status", filterStatus);
      return apiGet<Order[]>(`/api/orders?${params}`);
    },
  });

  const orders = ordersQuery.data ?? [];
  const loading = ordersQuery.isPending;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });

  const openCreateDialog = async () => {
    const [chs, prs] = await Promise.all([
      apiGet<Channel[]>("/api/channels"),
      apiGet<Product[]>("/api/products?isBulk=all"),
    ]);
    setChannels(chs);
    setProducts(prs);
    setSelectedChannelId("");
    setOrderDate(new Date().toISOString().split("T")[0]);
    setChannelOrderNo("");
    setCustomerName("");
    setCustomerPhone("");
    setShippingAddress("");
    setDiscountAmount("0");
    setShippingFee("0");
    setOrderMemo("");
    setItems([]);
    setAddProductId("");
    setCreateOpen(true);
  };

  const addItem = () => {
    if (!addProductId) return;
    const p = products.find((pr) => pr.id === addProductId);
    if (!p) return;

    // 대표 상품: 변형 선택 다이얼로그 노출
    if (p.isCanonical) {
      setVariantPickerCanonical(p);
      setVariantPickerOpen(true);
      return;
    }

    if (items.some((i) => i.productId === addProductId)) {
      toast.error("이미 추가된 상품입니다");
      return;
    }
    setItems([...items, {
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      quantity: "1",
      unitPrice: p.sellingPrice,
      isBulk: p.isBulk,
      unitOfMeasure: p.unitOfMeasure,
    }]);
    setAddProductId("");
  };

  const pickVariant = (variant: { id: string; name: string; sku: string }) => {
    if (items.some((i) => i.productId === variant.id)) {
      toast.error("이미 추가된 상품입니다");
      return;
    }
    const fullVariant = products.find((pr) => pr.id === variant.id);
    setItems([...items, {
      productId: variant.id,
      productName: variant.name,
      sku: variant.sku,
      quantity: "1",
      unitPrice: fullVariant?.sellingPrice ?? variantPickerCanonical?.sellingPrice ?? "0",
      isBulk: fullVariant?.isBulk,
      unitOfMeasure: fullVariant?.unitOfMeasure,
    }]);
    setVariantPickerOpen(false);
    setVariantPickerCanonical(null);
    setAddProductId("");
  };

  const updateItem = (index: number, field: "quantity" | "unitPrice", value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const subtotal = items.reduce(
    (sum, i) => sum + parseFloat(i.quantity || "0") * parseFloat(i.unitPrice || "0"),
    0
  );
  const selectedChannel = channels.find((c) => c.id === selectedChannelId);
  const commission = selectedChannel ? Math.round(subtotal * Number(selectedChannel.commissionRate)) : 0;

  const createMutation = useMutation({
    mutationFn: () =>
      apiMutate("/api/orders", "POST", {
        channelId: selectedChannelId,
        channelOrderNo,
        customerName,
        customerPhone,
        shippingAddress,
        orderDate,
        discountAmount,
        shippingFee,
        memo: orderMemo,
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
      }),
    onSuccess: () => {
      toast.success("주문이 등록되었습니다");
      setCreateOpen(false);
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "등록 실패"),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      toast.error("주문 항목을 추가해주세요");
      return;
    }
    createMutation.mutate();
  };

  const openDetail = async (id: string) => {
    try {
      const data = await apiGet<OrderDetail>(`/api/orders/${id}`);
      setDetail(data);
      setDetailOpen(true);
    } catch {
      /* swallow — UI doesn't open */
    }
  };

  const reloadDetail = async () => {
    if (!detail) return;
    try {
      const data = await apiGet<OrderDetail>(`/api/orders/${detail.id}`);
      setDetail(data);
    } catch {
      /* ignore */
    }
  };

  const confirmDetailVariant = async (variantId: string) => {
    if (!detail || !detailVariantTargetItemId) return;
    setDetailVariantSubmitting(true);
    try {
      const res = await fetch(
        `/api/orders/${detail.id}/items/${detailVariantTargetItemId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ variantProductId: variantId }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(typeof err.error === "string" ? err.error : "변형 변경 실패");
        return;
      }
      toast.success("변형이 확정되었습니다");
      setDetailVariantPickerOpen(false);
      setDetailVariantPickerCanonical(null);
      setDetailVariantTargetItemId(null);
      await reloadDetail();
      invalidate();
    } finally {
      setDetailVariantSubmitting(false);
    }
  };

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string; label: string }) =>
      apiMutate(`/api/orders/${id}`, "PUT", { action }),
    onSuccess: (_data, { label }) => {
      toast.success(`${label} 처리되었습니다`);
      setDetailOpen(false);
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "처리 실패"),
  });

  const handleAction = (id: string, action: string, label: string) => {
    const messages: Record<string, string> = {
      confirm: "주문을 확인하시겠습니까? 재고가 차감됩니다.",
      cancel: "주문을 취소하시겠습니까? 재고가 복원됩니다.",
      return: "반품 처리하시겠습니까? 재고가 복원됩니다.",
    };
    if (messages[action] && !confirm(messages[action])) return;
    if (!messages[action] && !confirm(`${label} 처리하시겠습니까?`)) return;
    actionMutation.mutate({ id, action, label });
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/orders/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("주문이 삭제되었습니다");
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "삭제 실패"),
  });

  const handleDelete = (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    deleteMutation.mutate(id);
  };

  const formatPrice = (price: string) => parseFloat(price).toLocaleString("ko-KR");

  return (
    <div className="flex h-full flex-col">
      <DataTableToolbar
        search={{
          value: search,
          onChange: setSearch,
          onSearch: () => setAppliedSearch(search),
          placeholder: "주문번호, 채널주문번호, 고객명 검색",
        }}
        onRefresh={() => ordersQuery.refetch()}
        onAdd={openCreateDialog}
        addLabel="주문 등록"
        loading={loading}
        filters={
          <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v === "ALL" ? "" : (v ?? "")); }}>
            <SelectTrigger className="h-[30px] w-[120px] text-[13px] bg-card border-border">
              <SelectValue placeholder="전체 상태" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">전체</SelectItem>
              {Object.entries(statusLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      <ScrollArea className="flex-1 min-h-0">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow>
              <TableHead>주문번호</TableHead>
              <TableHead>채널</TableHead>
              <TableHead>고객명</TableHead>
              <TableHead>주문일</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">총액</TableHead>
              <TableHead>품목</TableHead>
              <TableHead className="w-[120px]">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <OrdersSkeletonRows />
            ) : orders.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8">주문이 없습니다</TableCell></TableRow>
            ) : (
              orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.orderNo}</TableCell>
                  <TableCell><Badge variant="outline">{order.channel.name}</Badge></TableCell>
                  <TableCell>{order.customerName || "-"}</TableCell>
                  <TableCell>{new Date(order.orderDate).toLocaleDateString("ko-KR")}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariants[order.status]}>{statusLabels[order.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right">₩{formatPrice(order.totalAmount)}</TableCell>
                  <TableCell>{order._count.items}건</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openDetail(order.id)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {order.status === "PENDING" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(order.id)}
                          disabled={deleteMutation.isPending && deleteMutation.variables === order.id}
                        >
                          {deleteMutation.isPending && deleteMutation.variables === order.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ScrollArea>

      {/* 주문 등록 다이얼로그 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>주문 등록</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>판매 채널 *</Label>
                <Select value={selectedChannelId} onValueChange={(v) => setSelectedChannelId(v ?? "")}>
                  <SelectTrigger><SelectValue placeholder="채널 선택..." /></SelectTrigger>
                  <SelectContent>
                    {channels.map((ch) => (
                      <SelectItem key={ch.id} value={ch.id}>{ch.name} ({ch.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>주문일 *</Label>
                <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>채널 주문번호</Label>
                <Input value={channelOrderNo} onChange={(e) => setChannelOrderNo(e.target.value)} placeholder="외부 채널 주문번호" />
              </div>
              <div className="space-y-2">
                <Label>고객명</Label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>연락처</Label>
                <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>배송지</Label>
                <Input value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} />
              </div>
            </div>

            {/* 상품 추가 */}
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-2">
                <Label>상품 추가</Label>
                <Select value={addProductId} onValueChange={(v) => setAddProductId(v ?? "")}>
                  <SelectTrigger><SelectValue placeholder="판매 상품 선택..." /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" variant="outline" onClick={addItem}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {items.length > 0 && (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>상품</TableHead>
                      <TableHead className="w-[100px]">수량</TableHead>
                      <TableHead className="w-[130px]">단가</TableHead>
                      <TableHead className="text-right">소계</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => (
                      <TableRow key={item.productId}>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span>{item.productName}</span>
                            {item.isBulk && <Badge variant="secondary" className="text-[10px]">벌크</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground">{item.sku}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="text"
                              inputMode={item.isBulk ? "decimal" : "numeric"}
                              value={item.quantity}
                              onChange={(e) => {
                                const v = item.isBulk
                                  ? e.target.value.replace(/[^\d.]/g, "")
                                  : e.target.value.replace(/\D/g, "");
                                updateItem(idx, "quantity", v);
                              }}
                              className="h-8"
                            />
                            {item.isBulk && item.unitOfMeasure && (
                              <span className="text-xs text-muted-foreground whitespace-nowrap">{item.unitOfMeasure}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={formatComma(item.unitPrice)}
                            onChange={(e) => updateItem(idx, "unitPrice", parseComma(e.target.value))}
                            onFocus={(e) => e.currentTarget.select()}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          ₩{(parseFloat(item.quantity || "0") * parseFloat(item.unitPrice || "0")).toLocaleString("ko-KR")}
                        </TableCell>
                        <TableCell>
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>할인 금액</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={formatComma(discountAmount)}
                  onChange={(e) => setDiscountAmount(parseComma(e.target.value))}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
              <div className="space-y-2">
                <Label>배송비</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={formatComma(shippingFee)}
                  onChange={(e) => setShippingFee(parseComma(e.target.value))}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
            </div>

            {selectedChannel && items.length > 0 && (
              <Card>
                <CardContent className="pt-4">
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">상품 합계</span>
                      <p className="font-medium">₩{subtotal.toLocaleString("ko-KR")}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">채널 수수료 ({(Number(selectedChannel.commissionRate) * 100).toFixed(1)}%)</span>
                      <p className="font-medium text-red-500">₩{commission.toLocaleString("ko-KR")}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">예상 순이익</span>
                      <p className="font-bold">₩{(subtotal - commission - parseFloat(discountAmount || "0")).toLocaleString("ko-KR")}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              <Label>메모</Label>
              <Textarea value={orderMemo} onChange={(e) => setOrderMemo(e.target.value)} />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={items.length === 0 || !selectedChannelId || createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                주문 등록
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 주문 상세 다이얼로그 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  주문 {detail.orderNo}
                  <Badge variant={statusVariants[detail.status]}>{statusLabels[detail.status]}</Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">채널</span>
                    <p className="font-medium">{detail.channel.name}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">주문일</span>
                    <p className="font-medium">{new Date(detail.orderDate).toLocaleDateString("ko-KR")}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">고객</span>
                    <p className="font-medium">{detail.customerName || "-"}</p>
                  </div>
                </div>

                {detail.channelOrderNo && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">채널 주문번호: </span>
                    <span className="font-medium">{detail.channelOrderNo}</span>
                  </div>
                )}

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>상품</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">수량</TableHead>
                        <TableHead className="text-right">단가</TableHead>
                        <TableHead className="text-right">소계</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">
                            <div className="flex flex-col gap-1">
                              <span className="inline-flex items-center gap-1.5">
                                {item.product.name}
                                {item.product.isSet && <Badge variant="secondary">세트</Badge>}
                                {item.product.isCanonical && (
                                  <Badge variant="destructive" className="text-[10px]">변형 미확정</Badge>
                                )}
                              </span>
                              {item.product.isCanonical && detail.status === "PENDING" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[12px] w-fit"
                                  onClick={() => {
                                    setDetailVariantTargetItemId(item.id);
                                    setDetailVariantPickerCanonical({
                                      id: item.product.id,
                                      name: item.product.name,
                                      sku: item.product.sku,
                                      sellingPrice: item.unitPrice,
                                      variants: item.product.variants,
                                    });
                                    setDetailVariantPickerOpen(true);
                                  }}
                                >
                                  변형 선택
                                </Button>
                              )}
                            </div>
                          </TableCell>
                          <TableCell><Badge variant="outline">{item.product.sku}</Badge></TableCell>
                          <TableCell className="text-right">{parseFloat(item.quantity).toLocaleString()}</TableCell>
                          <TableCell className="text-right">₩{formatPrice(item.unitPrice)}</TableCell>
                          <TableCell className="text-right">₩{formatPrice(item.totalPrice)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <Card>
                  <CardContent className="pt-4">
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>상품 합계</span>
                        <span>₩{formatPrice(detail.subtotalAmount)}</span>
                      </div>
                      {parseFloat(detail.discountAmount) > 0 && (
                        <div className="flex justify-between text-red-500">
                          <span>할인</span>
                          <span>-₩{formatPrice(detail.discountAmount)}</span>
                        </div>
                      )}
                      {parseFloat(detail.shippingFee) > 0 && (
                        <div className="flex justify-between">
                          <span>배송비</span>
                          <span>₩{formatPrice(detail.shippingFee)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>세금</span>
                        <span>₩{formatPrice(detail.taxAmount)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-base border-t pt-1">
                        <span>총액</span>
                        <span>₩{formatPrice(detail.totalAmount)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>수수료 ({(Number(detail.channel.commissionRate) * 100).toFixed(1)}%)</span>
                        <span>₩{formatPrice(detail.commissionAmount)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {detail.memo && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">메모: </span>{detail.memo}
                  </div>
                )}

                {nextActions[detail.status] && (
                  <DialogFooter className="gap-2">
                    {nextActions[detail.status].map(({ action, label, icon: Icon }) => {
                      const pending = actionMutation.isPending && actionMutation.variables?.id === detail.id && actionMutation.variables?.action === action;
                      return (
                      <Button
                        key={action}
                        variant={action === "cancel" ? "destructive" : "default"}
                        onClick={() => handleAction(detail.id, action, label)}
                        disabled={actionMutation.isPending}
                      >
                        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Icon className="mr-2 h-4 w-4" />}
                        {label}
                      </Button>
                      );
                    })}
                  </DialogFooter>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={variantPickerOpen} onOpenChange={(v) => { setVariantPickerOpen(v); if (!v) setVariantPickerCanonical(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>변형 선택 — {variantPickerCanonical?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto">
            {(variantPickerCanonical?.variants ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                등록된 변형이 없습니다
              </p>
            ) : (
              (variantPickerCanonical?.variants ?? []).map((v) => {
                const stock = v.inventory ? parseFloat(v.inventory.quantity) : 0;
                return (
                  <button
                    key={v.id}
                    type="button"
                    className="flex items-center justify-between border border-border rounded-md px-3 py-2 hover:bg-muted/50 text-left"
                    onClick={() => pickVariant(v)}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm">{v.name}</span>
                      <span className="text-xs text-muted-foreground">{v.sku}</span>
                    </div>
                    <div className="text-right">
                      <span className={`text-sm tabular-nums ${stock <= 0 ? "text-red-400" : ""}`}>
                        재고 {stock.toLocaleString("ko-KR")}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVariantPickerOpen(false)}>
              취소
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={detailVariantPickerOpen}
        onOpenChange={(v) => {
          setDetailVariantPickerOpen(v);
          if (!v) {
            setDetailVariantPickerCanonical(null);
            setDetailVariantTargetItemId(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>출고 변형 확정 — {detailVariantPickerCanonical?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto">
            {(detailVariantPickerCanonical?.variants ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                등록된 변형이 없습니다
              </p>
            ) : (
              (detailVariantPickerCanonical?.variants ?? []).map((v) => {
                const stock = v.inventory ? parseFloat(v.inventory.quantity) : 0;
                return (
                  <button
                    key={v.id}
                    type="button"
                    disabled={detailVariantSubmitting}
                    className="flex items-center justify-between border border-border rounded-md px-3 py-2 hover:bg-muted/50 text-left disabled:opacity-50"
                    onClick={() => confirmDetailVariant(v.id)}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm">{v.name}</span>
                      <span className="text-xs text-muted-foreground">{v.sku}</span>
                    </div>
                    <span className={`text-sm tabular-nums ${stock <= 0 ? "text-red-400" : ""}`}>
                      재고 {stock.toLocaleString("ko-KR")}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDetailVariantPickerOpen(false)}
              disabled={detailVariantSubmitting}
            >
              취소
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
