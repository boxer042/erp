"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export interface CartItem {
  productId: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  unitPrice: number;      // 세전(공급가액) 기준
  quantity: number;
  discount: string;       // "1000" 또는 "10%"
}

interface CartContextValue {
  items: CartItem[];
  add: (item: Omit<CartItem, "quantity" | "discount"> & { quantity?: number }) => void;
  remove: (productId: string) => void;
  updateQty: (productId: string, qty: number) => void;
  updateDiscount: (productId: string, discount: string) => void;
  clear: () => void;
  itemCount: number;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "pos.cart.v1";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {}
  }, [items, hydrated]);

  const add = useCallback<CartContextValue["add"]>((it) => {
    setItems((prev) => {
      const existing = prev.find((p) => p.productId === it.productId);
      if (existing) {
        return prev.map((p) =>
          p.productId === it.productId
            ? { ...p, quantity: p.quantity + (it.quantity ?? 1) }
            : p
        );
      }
      return [
        ...prev,
        {
          productId: it.productId,
          name: it.name,
          sku: it.sku,
          imageUrl: it.imageUrl,
          unitPrice: it.unitPrice,
          quantity: it.quantity ?? 1,
          discount: "0",
        },
      ];
    });
  }, []);

  const remove = useCallback((productId: string) => {
    setItems((prev) => prev.filter((p) => p.productId !== productId));
  }, []);

  const updateQty = useCallback((productId: string, qty: number) => {
    setItems((prev) =>
      prev.map((p) => (p.productId === productId ? { ...p, quantity: Math.max(1, qty) } : p))
    );
  }, []);

  const updateDiscount = useCallback((productId: string, discount: string) => {
    setItems((prev) =>
      prev.map((p) => (p.productId === productId ? { ...p, discount } : p))
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(
    () => ({
      items,
      add,
      remove,
      updateQty,
      updateDiscount,
      clear,
      itemCount: items.reduce((s, i) => s + i.quantity, 0),
    }),
    [items, add, remove, updateQty, updateDiscount, clear]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
