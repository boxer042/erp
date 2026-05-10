import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { BundleProductItem } from "./types";

interface Props {
  bundles: BundleProductItem[];
}

/**
 * 추가구매 추천 표시 — 메인 상품 페이지에 함께 노출되는 단독 카탈로그 상품들.
 * 편집은 별도 Sheet.
 */
export function ProductBundlesTable({ bundles }: Props) {
  if (bundles.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        등록된 추가구매가 없습니다 — 함께 사면 좋은 단독 상품을 추천으로 등록해보세요
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="h-9 px-3 text-xs">추천 상품</TableHead>
          <TableHead className="h-9 px-3 text-xs w-[120px]">SKU</TableHead>
          <TableHead className="h-9 px-3 text-xs w-[80px] text-right">기본 수량</TableHead>
          <TableHead className="h-9 px-3 text-xs w-[110px] text-right">정가</TableHead>
          <TableHead className="h-9 px-3 text-xs w-[110px] text-right">번들 할인</TableHead>
          <TableHead className="h-9 px-3 text-xs w-[110px] text-right">최종가</TableHead>
          <TableHead className="h-9 px-3 text-xs">추천 카피</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {bundles.map((b) => {
          const sellingPrice = Number(b.bundleProduct.sellingPrice ?? 0);
          const discount = Number(b.discountAmount ?? 0);
          const finalPrice = Math.max(0, sellingPrice - discount);
          return (
            <TableRow key={b.id}>
              <TableCell className="px-3 py-2.5 text-sm">
                <span className="font-medium">{b.bundleProduct.name}</span>
              </TableCell>
              <TableCell className="px-3 py-2.5 font-mono text-xs">
                {b.bundleProduct.sku}
              </TableCell>
              <TableCell className="px-3 py-2.5 text-sm tabular-nums text-right">
                {Number(b.defaultQuantity).toLocaleString("ko-KR")}
              </TableCell>
              <TableCell className="px-3 py-2.5 text-sm tabular-nums text-right">
                ₩{sellingPrice.toLocaleString("ko-KR")}
              </TableCell>
              <TableCell className="px-3 py-2.5 text-sm tabular-nums text-right">
                {discount > 0 ? (
                  <Badge variant="secondary" className="text-[10px]">
                    −₩{discount.toLocaleString("ko-KR")}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="px-3 py-2.5 text-sm tabular-nums text-right font-semibold">
                ₩{finalPrice.toLocaleString("ko-KR")}
              </TableCell>
              <TableCell className="px-3 py-2.5 text-xs text-muted-foreground">
                {b.recommendMessage ?? "—"}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
