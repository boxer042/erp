"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";

import { apiGet, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  jmToast as toast,
  JmButton,
  JmCard,
  JmIconButton,
  JmPill,
  JmSearchInput,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
  JmTableToolbar,
  JmTableToolbarActions,
  JmTableToolbarFilters,
  JmTableToolbarSearch,
} from "@/jm";

import { PurchaseOrderCreateSheet } from "./_create-sheet";
import {
  EmptyTableCell,
  FILTER_STATUSES,
  PoStatusBadge,
  ProgressMini,
  TableRowSkeleton,
} from "./_parts";
import {
  emptyItem,
  type PurchaseOrderListRow,
  type PurchaseOrderStatus,
  type PurchaseOrderFormState,
} from "./_types";
import { calcReceiveProgress, todayIso, isoToKr } from "./_helpers";

function emptyForm(): PurchaseOrderFormState {
  return {
    supplierId: "",
    supplierName: "",
    orderDate: todayIso(),
    expectedDate: "",
    memo: "",
    shippingMethod: "",
    requirePriceReview: false,
    items: [emptyItem()],
  };
}

export default function PurchaseOrdersPage() {
  return (
    <Suspense fallback={null}>
      <PurchaseOrdersPageInner />
    </Suspense>
  );
}

function PurchaseOrdersPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PurchaseOrderStatus>("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState<PurchaseOrderFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState<PurchaseOrderStatus | null>(null);

  // 딥링크 prefill — low-stock 발주 버튼에서 보내는 query
  const prefillSupplierId = searchParams.get("prefillSupplierId");
  const prefillSpId = searchParams.get("prefillSpId");
  const prefillQty = searchParams.get("prefillQty");
  const prefillUnitPrice = searchParams.get("prefillUnitPrice");
  const prefillSupplierName = searchParams.get("prefillSupplierName");
  const prefillSpName = searchParams.get("prefillSpName");
  const editId = searchParams.get("editId");

  useEffect(() => {
    if (!prefillSupplierId || !prefillSpId) return;
    const qty = prefillQty ? String(parseFloat(prefillQty) || 1) : "1";
    const price = prefillUnitPrice ? String(Math.round(parseFloat(prefillUnitPrice))) : "";
    setEditingId(null);
    setEditingStatus(null);
    setForm({
      supplierId: prefillSupplierId,
      supplierName: prefillSupplierName ?? "",
      orderDate: todayIso(),
      expectedDate: "",
      memo: "",
      shippingMethod: "",
      requirePriceReview: false,
      items: [
        {
          ...emptyItem(),
          supplierProductId: prefillSpId,
          supplierProductName: prefillSpName ?? "",
          quantity: qty,
          unitPrice: price,
          totalPrice: price && qty ? String(Math.round(parseFloat(qty) * parseFloat(price))) : "",
        },
      ],
    });
    setSheetOpen(true);
    router.replace("/purchase-orders");
  }, [prefillSupplierId, prefillSpId, prefillQty, prefillUnitPrice, prefillSupplierName, prefillSpName, router]);

  // 편집 모드 — ?editId=X
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    (async () => {
      try {
        const po = await apiGet<{
          id: string;
          status: PurchaseOrderStatus;
          orderDate: string;
          expectedDate: string | null;
          memo: string | null;
          shippingMethod: string | null;
          requirePriceReview: boolean;
          supplier: { id: string; name: string };
          items: Array<{
            id: string;
            name: string | null;
            priceUndetermined: boolean;
            quantity: string;
            unitPrice: string;
            totalPrice: string;
            memo: string | null;
            supplierProduct: {
              id: string;
              name: string;
              spec: string | null;
              supplierCode: string | null;
              unitOfMeasure: string;
            } | null;
          }>;
        }>(`/api/purchase-orders/${editId}`);
        if (cancelled) return;
        // 입고 시작 전인 비종결 status 모두 수정 허용. 차단은 API 가 동시에 검증.
        const EDITABLE_STATUSES = ["DRAFT", "SENT", "CONFIRMED", "COUNTER_OFFER", "PARTIAL_RESENT", "PARTIAL_REACCEPTED"];
        if (!EDITABLE_STATUSES.includes(po.status)) {
          toast.error("이 상태의 발주는 수정할 수 없습니다");
          router.replace("/purchase-orders");
          return;
        }
        setEditingId(po.id);
        setEditingStatus(po.status);
        setForm({
          supplierId: po.supplier.id,
          supplierName: po.supplier.name,
          orderDate: po.orderDate.split("T")[0],
          expectedDate: po.expectedDate ? po.expectedDate.split("T")[0] : "",
          memo: po.memo ?? "",
          shippingMethod: (po.shippingMethod ?? "") as PurchaseOrderFormState["shippingMethod"],
          requirePriceReview: po.requirePriceReview,
          items: po.items.map((it) => ({
            rowType: (it.supplierProduct ? "product" : "free") as "product" | "free",
            supplierProductId: it.supplierProduct?.id ?? "",
            supplierProductName: it.supplierProduct?.name ?? "",
            supplierCode: it.supplierProduct?.supplierCode ?? null,
            unitOfMeasure: it.supplierProduct?.unitOfMeasure ?? "EA",
            quantity: String(parseFloat(it.quantity)),
            unitPrice: String(Math.round(parseFloat(it.unitPrice))),
            totalPrice: String(Math.round(parseFloat(it.totalPrice))),
            memo: it.memo ?? "",
            name: it.name ?? "",
            priceUndetermined: it.priceUndetermined,
          })),
        });
        setSheetOpen(true);
        router.replace("/purchase-orders");
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "발주서를 불러오지 못했습니다");
        router.replace("/purchase-orders");
      }
    })();
    return () => { cancelled = true; };
  }, [editId, router]);

  const listQuery = useQuery<PurchaseOrderListRow[]>({
    queryKey: queryKeys.purchaseOrders.list({ status: statusFilter }),
    queryFn: () => {
      const qs = statusFilter === "all" ? "" : `?status=${statusFilter}`;
      return apiGet<PurchaseOrderListRow[]>(`/api/purchase-orders${qs}`);
    },
    staleTime: 1000 * 30,
  });

  const filtered = useMemo(() => {
    const all = listQuery.data ?? [];
    if (!search.trim()) return all;
    const q = search.trim().toLowerCase();
    return all.filter(
      (r) =>
        r.poNo.toLowerCase().includes(q) ||
        r.supplier.name.toLowerCase().includes(q) ||
        (r.memo?.toLowerCase().includes(q) ?? false)
    );
  }, [listQuery.data, search]);

  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="flex w-full flex-col gap-6 p-4">
        <JmCard className="overflow-hidden p-0">
          <JmTableToolbar>
            <JmTableToolbarSearch>
              <JmSearchInput
                size="sm"
                placeholder="발주번호·거래처·메모"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClear={() => setSearch("")}
              />
            </JmTableToolbarSearch>
            <JmTableToolbarFilters>
              {FILTER_STATUSES.map((f) => (
                <JmPill
                  key={f.value}
                  size="sm"
                  active={statusFilter === f.value}
                  onClick={() => setStatusFilter(f.value)}
                >
                  {f.label}
                </JmPill>
              ))}
            </JmTableToolbarFilters>
            <JmTableToolbarActions>
              <JmIconButton
                aria-label="새로고침"
                onClick={() => listQuery.refetch()}
                disabled={listQuery.isFetching}
              >
                <RefreshCw className={listQuery.isFetching ? "animate-spin" : ""} />
              </JmIconButton>
              <JmButton
                size="sm"
                onClick={() => {
                  setEditingId(null);
                  setEditingStatus(null);
                  setForm(emptyForm());
                  setSheetOpen(true);
                }}
              >
                <Plus />
                발주 등록
              </JmButton>
            </JmTableToolbarActions>
          </JmTableToolbar>

          <JmTable className="min-w-[1100px]">
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead className="w-[140px] whitespace-nowrap">발주번호</JmTableHead>
                  <JmTableHead className="w-[180px] whitespace-nowrap">거래처</JmTableHead>
                  <JmTableHead className="w-[120px] whitespace-nowrap">발주일</JmTableHead>
                  <JmTableHead className="w-[120px] whitespace-nowrap">예상입고</JmTableHead>
                  <JmTableHead className="w-[120px] whitespace-nowrap">상태</JmTableHead>
                  <JmTableHead className="w-[120px] text-right whitespace-nowrap">금액</JmTableHead>
                  <JmTableHead className="w-[60px] text-right">품목</JmTableHead>
                  <JmTableHead className="w-[160px]">진행</JmTableHead>
                  <JmTableHead>메모</JmTableHead>
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {listQuery.isPending ? (
                  Array.from({ length: 8 }).map((_, i) => <TableRowSkeleton key={i} cols={9} />)
                ) : filtered.length === 0 ? (
                  <EmptyTableCell
                    colSpan={9}
                    message={
                      search || statusFilter !== "all"
                        ? "조건에 맞는 발주가 없습니다"
                        : "등록된 발주가 없습니다"
                    }
                  />
                ) : (
                  filtered.map((row) => {
                    const progress = calcReceiveProgress(row);
                    return (
                      <JmTableRow
                        key={row.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/purchase-orders/${row.id}`)}
                      >
                        <JmTableCell className="whitespace-nowrap font-[family-name:var(--jm-font-mono)] text-jm-xs">
                          {row.poNo}
                        </JmTableCell>
                        <JmTableCell className="font-medium">{row.supplier.name}</JmTableCell>
                        <JmTableCell className="whitespace-nowrap text-jm-sm">{isoToKr(row.orderDate)}</JmTableCell>
                        <JmTableCell className="whitespace-nowrap text-jm-sm text-[var(--jm-text-muted)]">
                          {isoToKr(row.expectedDate)}
                        </JmTableCell>
                        <JmTableCell>
                          <PoStatusBadge status={row.status} />
                        </JmTableCell>
                        <JmTableCell className="text-right tabular-nums">
                          ₩{parseFloat(row.totalAmount).toLocaleString("ko-KR")}
                        </JmTableCell>
                        <JmTableCell className="text-right tabular-nums text-[var(--jm-text-muted)]">
                          {row._count.items}
                        </JmTableCell>
                        <JmTableCell>
                          <ProgressMini progress={progress} />
                        </JmTableCell>
                        <JmTableCell className="max-w-[280px] truncate text-jm-sm text-[var(--jm-text-muted)]">
                          {row.memo ?? "-"}
                        </JmTableCell>
                      </JmTableRow>
                    );
                  })
                )}
              </JmTableBody>
            </JmTable>
        </JmCard>
      </div>

      <PurchaseOrderCreateSheet
        open={sheetOpen}
        onOpenChange={(v) => {
          setSheetOpen(v);
          if (!v) {
            setEditingId(null);
            setEditingStatus(null);
          }
        }}
        form={form}
        setForm={setForm}
        editingId={editingId}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
          if (editingId) {
            queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(editingId) });
          }
          setSheetOpen(false);
          setEditingId(null);
          setEditingStatus(null);
          setForm(emptyForm());
        }}
        editingStatus={editingStatus}
      />
    </div>
  );
}
