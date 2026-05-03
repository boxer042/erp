"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { format } from "date-fns";

import { apiGet } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";

interface SerialItemRow {
  id: string;
  code: string;
  status: "ACTIVE" | "RETURNED" | "SCRAPPED";
  soldAt: string;
  warrantyEnds: string | null;
  product: { id: string; name: string; sku: string } | null;
  customer: { id: string; name: string; phone: string | null } | null;
  createdAt: string;
}

function statusVariant(status: SerialItemRow["status"]) {
  switch (status) {
    case "ACTIVE":
      return "default" as const;
    case "RETURNED":
      return "secondary" as const;
    case "SCRAPPED":
      return "destructive" as const;
  }
}
function statusLabel(status: SerialItemRow["status"]) {
  return status === "ACTIVE" ? "활성" : status === "RETURNED" ? "반품" : "폐기";
}

function SerialSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="size-4 rounded" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-5 w-12 rounded-md" /></TableCell>
          <TableCell><Skeleton className="h-8 w-8 rounded-md" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

export default function SerialItemsPage() {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printCodes, setPrintCodes] = useState<string[] | null>(null);

  const itemsQuery = useQuery({
    queryKey: ["serial-items", search],
    queryFn: () =>
      apiGet<SerialItemRow[]>(
        `/api/serial-items?search=${encodeURIComponent(search)}`
      ),
  });

  const items = itemsQuery.data ?? [];
  const allSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  const selectedCodes = useMemo(
    () => items.filter((i) => selectedIds.has(i.id)).map((i) => i.code),
    [items, selectedIds]
  );

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map((i) => i.id)));
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const printOne = (code: string) => setPrintCodes([code]);
  const printSelected = () => {
    if (selectedCodes.length === 0) return;
    setPrintCodes(selectedCodes);
  };

  return (
    <div className="flex h-full flex-col">
      <DataTableToolbar
        search={{
          value: search,
          onChange: setSearch,
          placeholder: "코드·상품명·손님 검색",
        }}
        onRefresh={() => itemsQuery.refetch()}
        loading={itemsQuery.isFetching}
        filters={
          selectedCodes.length > 0 ? (
            <Button
              size="sm"
              onClick={printSelected}
              className="h-[30px] text-[13px]"
            >
              <Printer />
              선택 {selectedCodes.length}장 재출력
            </Button>
          ) : null
        }
      />
      <div className="flex-1 overflow-y-auto">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead>코드</TableHead>
              <TableHead>상품</TableHead>
              <TableHead>손님</TableHead>
              <TableHead>판매일</TableHead>
              <TableHead>보증만료</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">재출력</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itemsQuery.isPending ? (
              <SerialSkeletonRows />
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  발번된 라벨이 없습니다
                </TableCell>
              </TableRow>
            ) : (
              items.map((it) => (
                <TableRow key={it.id} className="hover:bg-muted/50">
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(it.id)}
                      onCheckedChange={() => toggleOne(it.id)}
                    />
                  </TableCell>
                  <TableCell className="font-mono">{it.code}</TableCell>
                  <TableCell>
                    {it.product ? (
                      <div className="flex flex-col">
                        <span>{it.product.name}</span>
                        <span className="text-xs text-muted-foreground">{it.product.sku}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {it.customer ? (
                      <div className="flex flex-col">
                        <span>{it.customer.name}</span>
                        {it.customer.phone && (
                          <span className="text-xs text-muted-foreground">
                            {it.customer.phone}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>{format(new Date(it.soldAt), "yyyy-MM-dd")}</TableCell>
                  <TableCell>
                    {it.warrantyEnds ? format(new Date(it.warrantyEnds), "yyyy-MM-dd") : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(it.status)}>{statusLabel(it.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => printOne(it.code)}
                      aria-label="재출력"
                    >
                      <Printer />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!printCodes} onOpenChange={(o) => !o && setPrintCodes(null)}>
        <DialogContent className="flex h-[95vh] max-h-[95vh] w-[95vw] max-w-[95vw]! flex-col gap-0 p-0 sm:max-w-[95vw]!">
          <DialogHeader className="border-b border-border p-4">
            <DialogTitle>라벨 재출력 ({printCodes?.length ?? 0}장)</DialogTitle>
          </DialogHeader>
          {printCodes && (
            <iframe
              src={`/serial-items/print?codes=${printCodes.join(",")}`}
              className="size-full flex-1 border-0"
              title="라벨 재출력"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
