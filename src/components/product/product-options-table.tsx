import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { ProductOptionItem } from "./types";

interface Props {
  options: ProductOptionItem[];
}

/**
 * 고객 옵션 표시 — 슬롯·값·매핑 한눈에. 편집은 별도 Sheet.
 */
export function ProductOptionsTable({ options }: Props) {
  if (options.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        등록된 고객 옵션이 없습니다
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="h-9 px-3 text-xs w-[160px]">슬롯</TableHead>
          <TableHead className="h-9 px-3 text-xs">값</TableHead>
          <TableHead className="h-9 px-3 text-xs w-[100px] text-right">
            추가가
          </TableHead>
          <TableHead className="h-9 px-3 text-xs w-[200px]">매핑</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {options.flatMap((opt) =>
          opt.values.map((v, idx) => (
            <TableRow key={v.id}>
              <TableCell className="px-3 py-2.5">
                {idx === 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{opt.name}</span>
                    {opt.required && (
                      <Badge variant="outline" className="text-[10px]">
                        필수
                      </Badge>
                    )}
                  </div>
                ) : null}
              </TableCell>
              <TableCell className="px-3 py-2.5 text-sm">{v.label}</TableCell>
              <TableCell className="px-3 py-2.5 text-sm tabular-nums text-right">
                {Number(v.addPrice) > 0
                  ? `+₩${Number(v.addPrice).toLocaleString("ko-KR")}`
                  : "—"}
              </TableCell>
              <TableCell className="px-3 py-2.5 text-xs">
                {v.mappedProduct ? (
                  <span className="inline-flex items-center gap-1">
                    <Badge
                      variant="outline"
                      className="text-[10px] border-blue-200 text-blue-700"
                    >
                      Product
                    </Badge>
                    <span className="font-mono">{v.mappedProduct.sku}</span>
                  </span>
                ) : v.mappedVariant ? (
                  <span className="inline-flex items-center gap-1">
                    <Badge
                      variant="outline"
                      className="text-[10px] border-purple-200 text-purple-700"
                    >
                      Variant
                    </Badge>
                    <span className="font-mono">{v.mappedVariant.sku}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">단순 텍스트</span>
                )}
              </TableCell>
            </TableRow>
          )),
        )}
      </TableBody>
    </Table>
  );
}
