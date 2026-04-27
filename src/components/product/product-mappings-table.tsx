import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtNumber } from "./helpers";
import type { ProductMappingItem } from "./types";

interface ProductMappingsTableProps {
  mappings: ProductMappingItem[];
}

export function ProductMappingsTable({ mappings }: ProductMappingsTableProps) {
  if (mappings.length === 0) {
    return (
      <p className="text-center py-8 text-muted-foreground text-sm">
        매핑된 공급자 상품이 없습니다
      </p>
    );
  }

  return (
    <Table className="min-w-[720px]">
      <TableHeader>
        <TableRow>
          <TableHead className="h-9 px-3 text-xs">거래처</TableHead>
          <TableHead className="h-9 px-3 text-xs">공급자 상품명</TableHead>
          <TableHead className="h-9 px-3 text-xs">품번</TableHead>
          <TableHead className="h-9 px-3 text-xs text-right">단가</TableHead>
          <TableHead className="h-9 px-3 text-xs text-right">변환비율</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {mappings.map((m) => (
          <TableRow key={m.id}>
            <TableCell className="px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                {m.supplierProduct.supplier.name}
                {m.supplierProduct.isProvisional && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0">임시</Badge>
                )}
              </div>
            </TableCell>
            <TableCell className="px-3 py-2.5 font-medium">{m.supplierProduct.name}</TableCell>
            <TableCell className="px-3 py-2.5 text-muted-foreground">
              {m.supplierProduct.supplierCode || "-"}
            </TableCell>
            <TableCell className="px-3 py-2.5 text-right tabular-nums">
              ₩{fmtNumber(m.supplierProduct.unitPrice)}
            </TableCell>
            <TableCell className="px-3 py-2.5 text-right tabular-nums">{m.conversionRate}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
