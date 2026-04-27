"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useSessions } from "@/components/pos/sessions-context";
import { ShoppingCart } from "lucide-react";

interface Props {
  product: {
    id: string;
    name: string;
    sku: string;
    unitPrice: number;
    imageUrl: string | null;
  };
}

export function AddToCartButton({ product }: Props) {
  const { add } = useSessions();
  const router = useRouter();

  return (
    <div className="flex gap-2">
      <button
        className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-background text-base font-medium hover:bg-muted/50"
        onClick={() => {
          add({
            productId: product.id,
            itemType: "product",
            name: product.name,
            sku: product.sku,
            imageUrl: product.imageUrl,
            unitPrice: product.unitPrice,
          });
          toast.success("장바구니에 담았습니다");
        }}
      >
        <ShoppingCart className="h-5 w-5" />
        장바구니 담기
      </button>
      <button
        className="h-12 rounded-lg bg-primary px-6 text-base font-semibold text-white hover:bg-primary/90"
        onClick={() => {
          add({
            productId: product.id,
            itemType: "product",
            name: product.name,
            sku: product.sku,
            imageUrl: product.imageUrl,
            unitPrice: product.unitPrice,
          });
          router.push("/pos/sales");
        }}
      >
        바로 판매
      </button>
    </div>
  );
}
