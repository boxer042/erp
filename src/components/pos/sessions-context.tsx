"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export interface RepairMeta {
  deviceBrand?: string;
  deviceModel?: string;
  issueDescription?: string;
}

export interface RentalMeta {
  assetId: string;
  dailyRate: number;
  depositAmount?: number;
  startDate?: string;  // "yyyy-MM-dd" — 체크아웃 시 설정
  endDate?: string;    // "yyyy-MM-dd" — 체크아웃 시 설정
}

export interface CartItem {
  cartItemId: string;        // 카트 내 고유 식별자 (UUID)
  productId?: string;        // 상품 항목만 있음, 서비스 항목은 없음
  itemType: "product" | "repair" | "rental";
  name: string;
  sku?: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  discount: string; // "1000" 또는 "10%"
  taxType?: "TAXABLE" | "TAX_FREE" | "ZERO_RATE";
  isZeroRate?: boolean;  // 이번 거래에 영세율 적용 여부 (ZERO_RATE 상품만 해당, 기본 false)
  isBulk?: boolean;          // 벌크 SKU 여부 (소수점 수량 입력 허용)
  unitOfMeasure?: string;    // "EA", "mL", "g" 등 — UI 표시용
  isCanonical?: boolean;     // 대표 상품 여부 — true 면 결제 직전 변형 확정 필요
  repairMeta?: RepairMeta;
  rentalMeta?: RentalMeta;
}

export interface CartSession {
  id: string;
  label: string;
  customerId?: string;
  customerName?: string;
  items: CartItem[];
}

interface SessionsContextValue {
  sessions: CartSession[];
  activeId: string;
  active: CartSession;
  addSession: () => void;
  removeSession: (id: string) => void;
  switchSession: (id: string) => void;
  add: (item: Omit<CartItem, "cartItemId" | "quantity" | "discount"> & { quantity?: number }) => void;
  remove: (cartItemId: string) => void;
  updateQty: (cartItemId: string, qty: number) => void;
  updateDiscount: (cartItemId: string, discount: string) => void;
  updateRentalDates: (cartItemId: string, startDate: string, endDate: string, newUnitPrice: number) => void;
  assignVariant: (cartItemId: string, variant: { productId: string; name: string; sku?: string; unitPrice: number }) => void;
  toggleZeroRate: (cartItemId: string) => void;
  setCustomer: (id: string, name: string) => void;
  clearCustomer: () => void;
  clear: () => void;
  totalItemCount: number;
}

const SessionsContext = createContext<SessionsContextValue | null>(null);
const STORAGE_KEY = "pos.sessions.v1";

function makeSession(index: number): CartSession {
  return {
    id: `${Date.now()}-${index}`,
    label: `손님 ${index}`,
    items: [],
  };
}

function updateSession(
  sessions: CartSession[],
  id: string,
  updater: (s: CartSession) => CartSession
): CartSession[] {
  return sessions.map((s) => (s.id === id ? updater(s) : s));
}

export function SessionsProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<CartSession[]>(() => [makeSession(1)]);
  const [activeId, setActiveId] = useState<string>(() => "");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: { sessions: CartSession[]; activeId: string } = JSON.parse(raw);
        if (parsed.sessions?.length) {
          setSessions(parsed.sessions);
          setActiveId(parsed.activeId || parsed.sessions[0].id);
          setHydrated(true);
          return;
        }
      }
    } catch {}
    const initial = makeSession(1);
    setSessions([initial]);
    setActiveId(initial.id);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ sessions, activeId }));
    } catch {}
  }, [sessions, activeId, hydrated]);

  const addSession = useCallback(() => {
    setSessions((prev) => {
      const next = makeSession(prev.length + 1);
      setActiveId(next.id);
      return [...prev, next];
    });
  }, []);

  const removeSession = useCallback((id: string) => {
    setSessions((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((s) => s.id !== id);
      setActiveId((cur) => (cur === id ? next[Math.max(0, prev.findIndex((s) => s.id === id) - 1)].id : cur));
      return next;
    });
  }, []);

  const switchSession = useCallback((id: string) => setActiveId(id), []);

  const add = useCallback(
    (it: Omit<CartItem, "cartItemId" | "quantity" | "discount"> & { quantity?: number }) => {
      setSessions((prev) =>
        updateSession(prev, activeId, (s) => {
          // 상품 항목만 productId 기준으로 중복 체크해서 수량 증가
          if (it.productId && it.itemType === "product") {
            const existing = s.items.find((p) => p.productId === it.productId);
            if (existing) {
              return {
                ...s,
                items: s.items.map((p) =>
                  p.productId === it.productId
                    ? { ...p, quantity: p.quantity + (it.quantity ?? 1) }
                    : p
                ),
              };
            }
          }
          return {
            ...s,
            items: [
              ...s.items,
              {
                cartItemId: crypto.randomUUID(),
                productId: it.productId,
                itemType: it.itemType,
                name: it.name,
                sku: it.sku,
                imageUrl: it.imageUrl,
                unitPrice: it.unitPrice,
                quantity: it.quantity ?? 1,
                discount: "0",
                taxType: it.taxType,
                isZeroRate: it.isZeroRate,
                isBulk: it.isBulk,
                unitOfMeasure: it.unitOfMeasure,
                isCanonical: it.isCanonical,
                repairMeta: it.repairMeta,
                rentalMeta: it.rentalMeta,
              },
            ],
          };
        })
      );
    },
    [activeId]
  );

  const remove = useCallback(
    (cartItemId: string) => {
      setSessions((prev) =>
        updateSession(prev, activeId, (s) => ({
          ...s,
          items: s.items.filter((p) => p.cartItemId !== cartItemId),
        }))
      );
    },
    [activeId]
  );

  const updateQty = useCallback(
    (cartItemId: string, qty: number) => {
      setSessions((prev) =>
        updateSession(prev, activeId, (s) => ({
          ...s,
          items: s.items.map((p) => {
            if (p.cartItemId !== cartItemId) return p;
            // 벌크 SKU는 소수점 허용 (최소 0.0001), 일반은 정수 최소 1
            const min = p.isBulk ? 0.0001 : 1;
            return { ...p, quantity: Math.max(min, qty) };
          }),
        }))
      );
    },
    [activeId]
  );

  const updateDiscount = useCallback(
    (cartItemId: string, discount: string) => {
      setSessions((prev) =>
        updateSession(prev, activeId, (s) => ({
          ...s,
          items: s.items.map((p) => (p.cartItemId === cartItemId ? { ...p, discount } : p)),
        }))
      );
    },
    [activeId]
  );

  const toggleZeroRate = useCallback(
    (cartItemId: string) => {
      setSessions((prev) =>
        updateSession(prev, activeId, (s) => ({
          ...s,
          items: s.items.map((p) =>
            p.cartItemId === cartItemId ? { ...p, isZeroRate: !p.isZeroRate } : p
          ),
        }))
      );
    },
    [activeId]
  );

  const updateRentalDates = useCallback(
    (cartItemId: string, startDate: string, endDate: string, newUnitPrice: number) => {
      setSessions((prev) =>
        updateSession(prev, activeId, (s) => ({
          ...s,
          items: s.items.map((p) =>
            p.cartItemId === cartItemId
              ? {
                  ...p,
                  unitPrice: newUnitPrice,
                  rentalMeta: p.rentalMeta ? { ...p.rentalMeta, startDate, endDate } : p.rentalMeta,
                }
              : p
          ),
        }))
      );
    },
    [activeId]
  );

  const assignVariant = useCallback(
    (
      cartItemId: string,
      variant: { productId: string; name: string; sku?: string; unitPrice: number },
    ) => {
      setSessions((prev) =>
        updateSession(prev, activeId, (s) => ({
          ...s,
          items: s.items.map((p) =>
            p.cartItemId === cartItemId
              ? {
                  ...p,
                  productId: variant.productId,
                  name: variant.name,
                  sku: variant.sku,
                  unitPrice: variant.unitPrice,
                  isCanonical: false,
                }
              : p,
          ),
        })),
      );
    },
    [activeId],
  );

  const setCustomer = useCallback(
    (id: string, name: string) => {
      setSessions((prev) =>
        updateSession(prev, activeId, (s) => ({ ...s, customerId: id, customerName: name }))
      );
    },
    [activeId]
  );

  const clearCustomer = useCallback(() => {
    setSessions((prev) =>
      updateSession(prev, activeId, (s) => ({
        ...s,
        customerId: undefined,
        customerName: undefined,
      }))
    );
  }, [activeId]);

  const clear = useCallback(() => {
    setSessions((prev) =>
      updateSession(prev, activeId, (s) => ({
        ...s,
        items: [],
        customerId: undefined,
        customerName: undefined,
      }))
    );
  }, [activeId]);

  const active = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? sessions[0],
    [sessions, activeId]
  );

  const totalItemCount = useMemo(
    () => sessions.reduce((sum, s) => sum + s.items.reduce((a, i) => a + i.quantity, 0), 0),
    [sessions]
  );

  const value = useMemo(
    () => ({
      sessions,
      activeId,
      active,
      addSession,
      removeSession,
      switchSession,
      add,
      remove,
      updateQty,
      updateDiscount,
      updateRentalDates,
      assignVariant,
      toggleZeroRate,
      setCustomer,
      clearCustomer,
      clear,
      totalItemCount,
    }),
    [sessions, activeId, active, addSession, removeSession, switchSession, add, remove, updateQty, updateDiscount, updateRentalDates, assignVariant, toggleZeroRate, setCustomer, clearCustomer, clear, totalItemCount]
  );

  return <SessionsContext.Provider value={value}>{children}</SessionsContext.Provider>;
}

export function useSessions() {
  const ctx = useContext(SessionsContext);
  if (!ctx) throw new Error("useSessions must be used within SessionsProvider");
  return ctx;
}
