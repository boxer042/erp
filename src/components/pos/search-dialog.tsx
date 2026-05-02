"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api-client";
import { useSessions } from "@/components/pos/sessions-context";
import { usePosShell } from "@/components/pos/pos-shell-context";
import type { ProductLite } from "@/components/pos/product-grid";

function useDebounced<T>(value: T, delay = 200) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function SearchDialog() {
  const { searchOpen, setSearchOpen, pickedSessionId } = usePosShell();
  const { add } = useSessions();
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 200);

  // 다이얼로그 닫힐 때 검색어 초기화
  useEffect(() => {
    if (!searchOpen) setSearch("");
  }, [searchOpen]);

  const productsQuery = useQuery({
    queryKey: ["pos", "search", debounced],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debounced) params.set("search", debounced);
      return apiGet<ProductLite[]>(`/api/products?${params}`);
    },
    enabled: searchOpen,
  });

  const products = productsQuery.data ?? [];

  const handleSelect = (p: ProductLite) => {
    if (!pickedSessionId) {
      toast.error("세션을 찾을 수 없습니다");
      return;
    }
    add(
      {
        productId: p.id,
        itemType: "product",
        name: p.name,
        sku: p.sku,
        imageUrl: p.imageUrl,
        unitPrice: Number(p.sellingPrice),
        taxType: p.taxType === "TAX_FREE" ? "TAX_FREE" : "TAXABLE",
        zeroRateEligible: p.zeroRateEligible,
        isBulk: p.isBulk,
        unitOfMeasure: p.unitOfMeasure,
        isCanonical: p.isCanonical,
      },
      { sessionId: pickedSessionId }
    );
    toast.success(`${p.name} 추가됨`);
    setSearchOpen(false);
  };

  return (
    <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-2xl">
        <DialogTitle className="sr-only">상품 검색</DialogTitle>
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="상품명·SKU·바코드 검색"
          />
          <CommandList className="max-h-[60vh]">
            {productsQuery.isFetching ? (
              <div className="flex flex-col gap-2 p-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-md" />
                ))}
              </div>
            ) : (
              <>
                <CommandEmpty>검색 결과가 없습니다</CommandEmpty>
                {products.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.id}
                    onSelect={() => handleSelect(p)}
                    className="flex items-center gap-3"
                  >
                    <div className="size-10 shrink-0 overflow-hidden rounded-md bg-muted">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          className="size-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-1 text-sm font-medium">{p.name}</div>
                      {p.sku && (
                        <div className="text-xs text-muted-foreground">{p.sku}</div>
                      )}
                    </div>
                    <div className="shrink-0 text-sm font-semibold tabular-nums">
                      ₩
                      {Math.round(
                        Number(p.sellingPrice) * (p.taxType === "TAX_FREE" ? 1 : 1.1)
                      ).toLocaleString("ko-KR")}
                    </div>
                  </CommandItem>
                ))}
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
