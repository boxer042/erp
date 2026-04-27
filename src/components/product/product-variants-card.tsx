import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtNumber, fmtPrice, toVatPrice } from "./helpers";
import { ProductSection } from "./product-section";
import type { VariantItem } from "./types";

interface ProductVariantsCardProps {
  productId: string;
  taxType: string;
  variants: VariantItem[];
}

export function ProductVariantsCard({ productId, taxType, variants }: ProductVariantsCardProps) {
  return (
    <ProductSection
      title={`변형 (${variants.length}개)`}
      description="대표 상품의 실제 출고 단위. 재고는 변형별로 관리됩니다."
      actions={
        <Link href={`/products/new?canonicalProductId=${productId}`}>
          <Button size="sm" className="h-8">
            <Plus className="h-3.5 w-3.5 mr-1.5" />변형 추가
          </Button>
        </Link>
      }
      noPadding
    >
      {variants.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center px-3">
          등록된 변형이 없습니다. &quot;변형 추가&quot;로 시작하세요.
        </p>
      ) : (
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead className="h-9 px-3 text-xs">이름</TableHead>
              <TableHead className="h-9 px-3 text-xs">SKU</TableHead>
              <TableHead className="h-9 px-3 text-xs text-right">판매가</TableHead>
              <TableHead className="h-9 px-3 text-xs text-right">재고</TableHead>
              <TableHead className="h-9 px-3 w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="px-3 py-2.5">{v.name}</TableCell>
                <TableCell className="px-3 py-2.5">
                  <Badge variant="outline">{v.sku}</Badge>
                </TableCell>
                <TableCell className="px-3 py-2.5 text-right tabular-nums">
                  {v.sellingPrice ? `₩${fmtPrice(toVatPrice(v.sellingPrice, taxType))}` : "-"}
                </TableCell>
                <TableCell className="px-3 py-2.5 text-right tabular-nums">
                  {v.inventory ? fmtNumber(v.inventory.quantity) : "0"}
                </TableCell>
                <TableCell className="px-3 py-2.5">
                  <Link href={`/products/${v.id}`}>
                    <Button variant="ghost" size="sm" className="h-7 text-[12px]">상세</Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </ProductSection>
  );
}
