import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtNumber, formatDateKo, MOVEMENT_TYPE_LABELS } from "./helpers";
import type { InventoryMovementItem } from "./types";

interface ProductMovementsTableProps {
  movements: InventoryMovementItem[] | undefined;
  isLoading?: boolean;
}

export function ProductMovementsTable({ movements, isLoading }: ProductMovementsTableProps) {
  return (
    <Table className="min-w-[820px]">
      <TableHeader>
        <TableRow>
          <TableHead className="h-9 px-3 text-xs">일시</TableHead>
          <TableHead className="h-9 px-3 text-xs">유형</TableHead>
          <TableHead className="h-9 px-3 text-xs text-right">수량</TableHead>
          <TableHead className="h-9 px-3 text-xs text-right">잔량</TableHead>
          <TableHead className="h-9 px-3 text-xs">사유</TableHead>
          <TableHead className="h-9 px-3 text-xs">메모</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell className="px-3 py-2.5"><Skeleton className="h-3 w-28" /></TableCell>
              <TableCell className="px-3 py-2.5"><Skeleton className="h-5 w-16 rounded-md" /></TableCell>
              <TableCell className="px-3 py-2.5"><div className="flex justify-end"><Skeleton className="h-3 w-12" /></div></TableCell>
              <TableCell className="px-3 py-2.5"><div className="flex justify-end"><Skeleton className="h-3 w-12" /></div></TableCell>
              <TableCell className="px-3 py-2.5"><Skeleton className="h-3 w-16" /></TableCell>
              <TableCell className="px-3 py-2.5"><Skeleton className="h-3 w-24" /></TableCell>
            </TableRow>
          ))
        ) : !movements || movements.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
              이동 이력이 없습니다
            </TableCell>
          </TableRow>
        ) : (
          movements.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="px-3 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                {formatDateKo(m.createdAt)}
              </TableCell>
              <TableCell className="px-3 py-2.5">
                <Badge variant="outline" className="text-[10px]">
                  {MOVEMENT_TYPE_LABELS[m.type] ?? m.type}
                </Badge>
              </TableCell>
              <TableCell className="px-3 py-2.5 text-right tabular-nums">{fmtNumber(m.quantity)}</TableCell>
              <TableCell className="px-3 py-2.5 text-right tabular-nums">{fmtNumber(m.balanceAfter)}</TableCell>
              <TableCell className="px-3 py-2.5 text-xs text-muted-foreground">{m.reason ?? "-"}</TableCell>
              <TableCell className="px-3 py-2.5 text-xs text-muted-foreground">{m.memo ?? "-"}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
