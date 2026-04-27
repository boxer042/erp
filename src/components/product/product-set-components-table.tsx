import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtNumber } from "./helpers";
import type { SetComponentItem } from "./types";

interface ProductSetComponentsTableProps {
  components: SetComponentItem[];
}

export function ProductSetComponentsTable({ components }: ProductSetComponentsTableProps) {
  if (components.length === 0) {
    return (
      <p className="text-center py-8 text-muted-foreground text-sm">
        구성품이 없습니다
      </p>
    );
  }
  return (
    <Table className="min-w-[640px]">
      <TableHeader>
        <TableRow>
          <TableHead className="h-9 px-3 text-xs">라벨</TableHead>
          <TableHead className="h-9 px-3 text-xs">구성품</TableHead>
          <TableHead className="h-9 px-3 text-xs">SKU</TableHead>
          <TableHead className="h-9 px-3 text-xs text-right">수량</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {components.map((sc) => (
          <TableRow key={sc.id}>
            <TableCell className="px-3 py-2.5 text-muted-foreground">
              {sc.label?.trim() ? sc.label : "-"}
            </TableCell>
            <TableCell className="px-3 py-2.5 font-medium">{sc.component.name}</TableCell>
            <TableCell className="px-3 py-2.5">
              <Badge variant="outline">{sc.component.sku}</Badge>
            </TableCell>
            <TableCell className="px-3 py-2.5 text-right tabular-nums">
              {fmtNumber(sc.quantity)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
