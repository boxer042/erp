import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { costTypeLabel, fmtNumber } from "./helpers";
import type { SellingCostItem } from "./types";

interface ProductSellingCostsTableProps {
  costs: SellingCostItem[];
  emptyMessage?: string;
  compact?: boolean;
}

export function ProductSellingCostsTable({
  costs,
  emptyMessage = "등록된 판매비용이 없습니다",
  compact = false,
}: ProductSellingCostsTableProps) {
  if (costs.length === 0) {
    return <p className="text-center py-6 text-muted-foreground text-sm">{emptyMessage}</p>;
  }
  const cellClass = compact ? "px-3 py-2" : "px-3 py-2.5";
  const headerClass = compact ? "h-8" : "h-9";
  return (
    <Table className="min-w-[640px]">
      <TableHeader>
        <TableRow>
          <TableHead className={`${headerClass} px-3 text-xs`}>비용항목</TableHead>
          <TableHead className={`${headerClass} px-3 text-xs`}>유형</TableHead>
          <TableHead className={`${headerClass} px-3 text-xs text-right`}>값</TableHead>
          <TableHead className={`${headerClass} px-3 text-xs`}>적용</TableHead>
          <TableHead className={`${headerClass} px-3 text-xs`}>과세</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {costs.map((c) => (
          <TableRow key={c.id}>
            <TableCell className={`${cellClass} font-medium`}>{c.name}</TableCell>
            <TableCell className={`${cellClass} text-muted-foreground`}>{costTypeLabel(c.costType)}</TableCell>
            <TableCell className={`${cellClass} text-right tabular-nums`}>
              {c.costType === "FIXED" ? `₩${fmtNumber(c.value)}` : `${c.value}%`}
            </TableCell>
            <TableCell className={`${cellClass} text-muted-foreground`}>{c.perUnit ? "개당" : "건당"}</TableCell>
            <TableCell className={`${cellClass} text-muted-foreground`}>{c.isTaxable ? "과세" : "면세"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
