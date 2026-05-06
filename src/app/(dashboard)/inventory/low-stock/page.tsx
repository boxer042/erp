"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { AlertTriangle, PackageX, Package, Search, PackagePlus, ExternalLink, ClipboardSignature } from "lucide-react";
import { toast } from "sonner";

import { apiGet } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface LowStockMapping {
  supplierId: string;
  supplierName: string;
  supplierProductId: string;
  supplierProductName: string;
  supplierCode: string | null;
  unitPrice: string;
  conversionRate: number;
  suggestedQty: number;
}

interface LowStockItem {
  productId: string;
  name: string;
  sku: string;
  brand: string | null;
  spec: string | null;
  quantity: number;
  safetyStock: number;
  shortage: number;
  unitOfMeasure: string;
  categoryId: string | null;
  categoryName: string | null;
  isOut: boolean;
  mappings: LowStockMapping[];
}

interface Response {
  items: LowStockItem[];
  summary: {
    totalCount: number;
    outOfStockCount: number;
    lowStockCount: number;
  };
}

export default function LowStockPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "out" | "low">("all");

  const dataQuery = useQuery<Response>({
    queryKey: ["inventory-low-stock"],
    queryFn: () => apiGet<Response>("/api/inventory/low-stock"),
    staleTime: 1000 * 30,
  });

  const all = dataQuery.data?.items ?? [];
  const summary = dataQuery.data?.summary;

  const items = all.filter((i) => {
    if (filter === "out" && !i.isOut) return false;
    if (filter === "low" && i.isOut) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !i.name.toLowerCase().includes(q) &&
        !i.sku.toLowerCase().includes(q) &&
        !(i.brand?.toLowerCase().includes(q) ?? false)
      )
        return false;
    }
    return true;
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <h1 className="text-lg font-semibold">재고 부족 알림</h1>
        <span className="text-[12px] text-muted-foreground">
          안전재고 미달 상품
        </span>
        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => router.push("/inventory/incoming")}
          >
            <PackagePlus className="size-3.5" />
            입고 등록
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          <SummaryCard
            icon={<AlertTriangle className="size-4" />}
            label="전체"
            value={summary?.totalCount ?? 0}
            tone="default"
            active={filter === "all"}
            onClick={() => setFilter("all")}
            loading={dataQuery.isPending}
          />
          <SummaryCard
            icon={<PackageX className="size-4" />}
            label="결품 (재고 0)"
            value={summary?.outOfStockCount ?? 0}
            tone="danger"
            active={filter === "out"}
            onClick={() => setFilter("out")}
            loading={dataQuery.isPending}
          />
          <SummaryCard
            icon={<Package className="size-4" />}
            label="부족"
            value={summary?.lowStockCount ?? 0}
            tone="warn"
            active={filter === "low"}
            onClick={() => setFilter("low")}
            loading={dataQuery.isPending}
          />
        </div>

        <div className="mb-3 flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="상품명·SKU·브랜드"
              className="h-[30px] w-[280px] pl-8 text-[13px]"
            />
          </div>
        </div>

        <Card>
          <CardContent className="px-0">
            <Table className="min-w-[800px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">상태</TableHead>
                  <TableHead>상품</TableHead>
                  <TableHead className="w-[120px]">SKU</TableHead>
                  <TableHead className="w-[120px]">카테고리</TableHead>
                  <TableHead className="w-[90px] text-right">현재고</TableHead>
                  <TableHead className="w-[90px] text-right">안전재고</TableHead>
                  <TableHead className="w-[90px] text-right">부족분</TableHead>
                  <TableHead className="w-[160px]">동작</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dataQuery.isPending ? (
                  <SkeletonRows />
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-12 text-center text-muted-foreground"
                    >
                      {search || filter !== "all"
                        ? "조건에 맞는 상품이 없습니다"
                        : "재고가 부족한 상품이 없습니다"}
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((it) => (
                    <TableRow
                      key={it.productId}
                      className="cursor-pointer"
                      onClick={() => router.push(`/products/${it.productId}`)}
                    >
                      <TableCell>
                        {it.isOut ? (
                          <Badge variant="destructive">결품</Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-amber-300 bg-amber-50 text-amber-800"
                          >
                            부족
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{it.name}</span>
                          {it.spec && (
                            <span className="text-[11px] text-muted-foreground">
                              {it.spec}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-[12px]">
                        {it.sku}
                      </TableCell>
                      <TableCell className="text-[13px] text-muted-foreground">
                        {it.categoryName ?? "-"}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums font-semibold ${
                          it.isOut ? "text-rose-700" : ""
                        }`}
                      >
                        {it.quantity.toLocaleString("ko-KR")} {it.unitOfMeasure}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {it.safetyStock.toLocaleString("ko-KR")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-rose-700">
                        −{it.shortage.toLocaleString("ko-KR")}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <PurchaseOrderButton item={it} router={router} />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 px-2 text-[12px]"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/products/${it.productId}`);
                            }}
                          >
                            <ExternalLink className="size-3" />
                            상세
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
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
  active,
  onClick,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "default" | "warn" | "danger";
  active: boolean;
  onClick: () => void;
  loading: boolean;
}) {
  const ringClass = active
    ? tone === "danger"
      ? "ring-2 ring-rose-300"
      : tone === "warn"
        ? "ring-2 ring-amber-300"
        : "ring-2 ring-zinc-300"
    : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left transition-shadow ${ringClass} rounded-xl`}
    >
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
          <CardTitle className="text-[12px] font-medium text-muted-foreground">
            {label}
          </CardTitle>
          <span
            className={
              tone === "danger"
                ? "text-rose-600"
                : tone === "warn"
                  ? "text-amber-600"
                  : "text-muted-foreground"
            }
          >
            {icon}
          </span>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <div className="text-2xl font-bold tabular-nums">{value}</div>
          )}
        </CardContent>
      </Card>
    </button>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell>
            <Skeleton className="h-5 w-12 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-40" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end">
              <Skeleton className="h-4 w-16" />
            </div>
          </TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end">
              <Skeleton className="h-4 w-16" />
            </div>
          </TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end">
              <Skeleton className="h-4 w-16" />
            </div>
          </TableCell>
          <TableCell>
            <Skeleton className="h-7 w-28 rounded-md" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function PurchaseOrderButton({
  item,
  router,
}: {
  item: LowStockItem;
  router: ReturnType<typeof useRouter>;
}) {
  const [open, setOpen] = useState(false);

  const navigate = (m: LowStockMapping) => {
    const params = new URLSearchParams({
      prefillSupplierId: m.supplierId,
      prefillSupplierName: m.supplierName,
      prefillSpId: m.supplierProductId,
      prefillSpName: m.supplierProductName,
      prefillQty: String(m.suggestedQty),
      prefillUnitPrice: m.unitPrice,
    });
    router.push(`/purchase-orders?${params.toString()}`);
  };

  if (item.mappings.length === 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1 px-2 text-[12px]"
        onClick={(e) => {
          e.stopPropagation();
          toast.info("매핑된 거래처가 없습니다. 상품 상세에서 매핑을 먼저 등록하세요.");
          router.push(`/products/${item.productId}`);
        }}
      >
        <ClipboardSignature className="size-3" />
        발주
      </Button>
    );
  }

  if (item.mappings.length === 1) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1 px-2 text-[12px]"
        onClick={(e) => {
          e.stopPropagation();
          navigate(item.mappings[0]);
        }}
      >
        <ClipboardSignature className="size-3" />
        발주
      </Button>
    );
  }

  // 매핑 2개+ — popover 로 거래처 선택
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-[12px]"
            onClick={(e) => e.stopPropagation()}
          />
        }
      >
        <ClipboardSignature className="size-3" />
        발주
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-1" onClick={(e) => e.stopPropagation()}>
        <div className="px-2 py-1.5 text-[11px] text-muted-foreground">발주할 거래처 선택</div>
        {item.mappings.map((m, i) => (
          <button
            key={`${m.supplierId}-${m.supplierProductId}-${i}`}
            type="button"
            className="w-full text-left px-2 py-1.5 rounded-md text-[13px] hover:bg-muted/50 flex items-center justify-between gap-2"
            onClick={() => {
              setOpen(false);
              navigate(m);
            }}
          >
            <div className="flex flex-col min-w-0">
              <span className="truncate font-medium">{m.supplierName}</span>
              <span className="text-[11px] text-muted-foreground truncate">
                {m.supplierProductName}{m.supplierCode ? ` · ${m.supplierCode}` : ""}
              </span>
            </div>
            <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
              {m.suggestedQty.toLocaleString("ko-KR")}개
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
