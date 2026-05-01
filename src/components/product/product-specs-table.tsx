import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { ProductSpecValueItem } from "./types";

interface ProductSpecsTableProps {
  values: ProductSpecValueItem[];
}

export function ProductSpecsTable({ values }: ProductSpecsTableProps) {
  if (values.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        등록된 스펙이 없습니다
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="h-9 px-3 text-xs w-[200px]">슬롯</TableHead>
          <TableHead className="h-9 px-3 text-xs">값</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {values.map((v) => (
          <TableRow key={v.id}>
            <TableCell className="px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{v.slot.name}</span>
                {v.slot.type === "ENUM" && (
                  <Badge variant="outline" className="text-[10px]">선택지</Badge>
                )}
              </div>
            </TableCell>
            <TableCell className="px-3 py-2.5 text-sm tabular-nums">
              {v.value}
              {v.slot.type === "NUMBER" && v.slot.unit && (
                <span className="ml-1 text-muted-foreground">{v.slot.unit}</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
