import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtNumber, formatDateOnly, LOT_SOURCE_LABELS } from "./helpers";
import type { InventoryLotItem } from "./types";

interface ProductInventoryLotsTableProps {
  lots: InventoryLotItem[];
  limit?: number;
}

export function ProductInventoryLotsTable({ lots, limit = 5 }: ProductInventoryLotsTableProps) {
  const slice = lots.slice(0, limit);
  if (slice.length === 0) {
    return (
      <p className="text-center py-6 text-muted-foreground text-sm">
        잔여 재고 로트가 없습니다
      </p>
    );
  }
  return (
    <Table className="min-w-[700px]">
      <TableHeader>
        <TableRow>
          <TableHead className="h-9 px-3 text-xs">입고일</TableHead>
          <TableHead className="h-9 px-3 text-xs">출처</TableHead>
          <TableHead className="h-9 px-3 text-xs">공급자</TableHead>
          <TableHead className="h-9 px-3 text-xs text-right">입고수량</TableHead>
          <TableHead className="h-9 px-3 text-xs text-right">잔량</TableHead>
          <TableHead className="h-9 px-3 text-xs text-right">단가</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {slice.map((lot) => (
          <TableRow key={lot.id}>
            <TableCell className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
              {formatDateOnly(lot.receivedAt)}
            </TableCell>
            <TableCell className="px-3 py-2.5">
              <Badge variant="outline" className="text-[10px]">
                {LOT_SOURCE_LABELS[lot.source] ?? lot.source}
              </Badge>
            </TableCell>
            <TableCell className="px-3 py-2.5 text-xs text-muted-foreground">
              {lot.supplierProduct?.supplier.name ?? "-"}
            </TableCell>
            <TableCell className="px-3 py-2.5 text-right tabular-nums">
              {fmtNumber(lot.receivedQty)}
            </TableCell>
            <TableCell className="px-3 py-2.5 text-right tabular-nums font-medium">
              {fmtNumber(lot.remainingQty)}
            </TableCell>
            <TableCell className="px-3 py-2.5 text-right tabular-nums">
              ₩{fmtNumber(lot.unitCost)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
