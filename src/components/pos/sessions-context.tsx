"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export interface RepairMeta {
  deviceBrand?: string;
  deviceModel?: string;
  issueDescription?: string;
  serialItemId?: string; // 시리얼 라벨 연결 (선택)
  repairTicketId?: string; // 기존 RepairTicket 픽업 결제용
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
  taxType?: "TAXABLE" | "TAX_FREE";
  zeroRateEligible?: boolean; // 영세율 적용 가능 상품 여부 (Product.zeroRateEligible 미러)
  isZeroRate?: boolean;  // 이번 거래에 영세율 적용 여부 (zeroRateEligible 상품만 해당, 기본 false)
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
  customerPhone?: string;
  items: CartItem[];
  totalDiscount: string; // "1000" 또는 "10%" — 세션 전체 할인
  shippingCost: string;  // 세전 공급가액 기준, 정수 문자열
  quotationId?: string;            // 마지막 발행 견적서 ID
  quotationFingerprint?: string;   // 발행 시점 카트 지문 — 카트 변경 감지용
  labelCodes?: string[];           // 마지막 발번 라벨 코드 목록
  labelFingerprint?: string;       // 발번 시점 카트 지문
  repairTicketIds?: string[];      // 이 세션에서 시작한 수리 티켓 ID들 (미등록 고객 추적용)
}

interface AddOptions {
  sessionId?: string; // 명시 시 active 무시하고 해당 세션에 추가
}

interface SessionsContextValue {
  sessions: CartSession[];
  activeId: string;
  active: CartSession;
  hydrated: boolean;
  addSession: () => string; // 생성된 새 세션 id 반환
  removeSession: (id: string) => void;
  switchSession: (id: string) => void;
  add: (item: Omit<CartItem, "cartItemId" | "quantity" | "discount"> & { quantity?: number }, opts?: AddOptions) => void;
  remove: (cartItemId: string, sessionId?: string) => void;
  updateQty: (cartItemId: string, qty: number, sessionId?: string) => void;
  updateDiscount: (cartItemId: string, discount: string, sessionId?: string) => void;
  updateRentalDates: (cartItemId: string, startDate: string, endDate: string, newUnitPrice: number, sessionId?: string) => void;
  assignVariant: (cartItemId: string, variant: { productId: string; name: string; sku?: string; unitPrice: number }, sessionId?: string) => void;
  toggleZeroRate: (cartItemId: string, sessionId?: string) => void;
  setCustomer: (id: string, name: string, phone?: string, sessionId?: string) => void;
  clearCustomer: (sessionId?: string) => void;
  setSessionDiscount: (discount: string, sessionId?: string) => void;
  setSessionShipping: (amount: string, sessionId?: string) => void;
  setSessionQuotation: (quotationId: string, fingerprint: string, sessionId?: string) => void;
  setSessionLabels: (codes: string[], fingerprint: string, sessionId?: string) => void;
  addSessionRepairTicket: (ticketId: string, sessionId?: string) => void;
  clear: (sessionId?: string) => void;
  totalItemCount: number;
  getSession: (id: string) => CartSession | undefined;
}

const SessionsContext = createContext<SessionsContextValue | null>(null);
const STORAGE_KEY = "pos.sessions.v1";

function makeSession(index: number): CartSession {
  return {
    id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    label: `고객 ${index}`,
    items: [],
    totalDiscount: "0",
    shippingCost: "0",
  };
}

function migrateSession(s: CartSession): CartSession {
  return {
    ...s,
    totalDiscount: s.totalDiscount ?? "0",
    shippingCost: s.shippingCost ?? "0",
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
  // SSR/CSR 일치를 위해 초기엔 빈 배열. 클라이언트 마운트 후 sessionStorage 또는 신규 세션 생성.
  const [sessions, setSessions] = useState<CartSession[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: { sessions: CartSession[]; activeId: string } = JSON.parse(raw);
        if (parsed.sessions?.length) {
          setSessions(parsed.sessions.map(migrateSession));
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
    let createdId = "";
    setSessions((prev) => {
      const next = makeSession(prev.length + 1);
      createdId = next.id;
      setActiveId(next.id);
      return [...prev, next];
    });
    return createdId;
  }, []);

  const removeSession = useCallback((id: string) => {
    setSessions((prev) => {
      if (prev.length <= 1) {
        // 마지막 세션이면 비우기만
        return prev.map((s) =>
          s.id === id
            ? { ...s, items: [], customerId: undefined, customerName: undefined, customerPhone: undefined, totalDiscount: "0", shippingCost: "0", quotationId: undefined, quotationFingerprint: undefined, labelCodes: undefined, labelFingerprint: undefined }
            : s
        );
      }
      const next = prev.filter((s) => s.id !== id);
      setActiveId((cur) => (cur === id ? next[Math.max(0, prev.findIndex((s) => s.id === id) - 1)].id : cur));
      return next;
    });
  }, []);

  const switchSession = useCallback((id: string) => setActiveId(id), []);

  const add = useCallback(
    (
      it: Omit<CartItem, "cartItemId" | "quantity" | "discount"> & { quantity?: number },
      opts?: AddOptions
    ) => {
      const targetId = opts?.sessionId ?? activeId;
      setSessions((prev) =>
        updateSession(prev, targetId, (s) => {
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
    (cartItemId: string, sessionId?: string) => {
      const targetId = sessionId ?? activeId;
      setSessions((prev) =>
        updateSession(prev, targetId, (s) => ({
          ...s,
          items: s.items.filter((p) => p.cartItemId !== cartItemId),
        }))
      );
    },
    [activeId]
  );

  const updateQty = useCallback(
    (cartItemId: string, qty: number, sessionId?: string) => {
      const targetId = sessionId ?? activeId;
      setSessions((prev) =>
        updateSession(prev, targetId, (s) => ({
          ...s,
          items: s.items.map((p) => {
            if (p.cartItemId !== cartItemId) return p;
            const min = p.isBulk ? 0.0001 : 1;
            return { ...p, quantity: Math.max(min, qty) };
          }),
        }))
      );
    },
    [activeId]
  );

  const updateDiscount = useCallback(
    (cartItemId: string, discount: string, sessionId?: string) => {
      const targetId = sessionId ?? activeId;
      setSessions((prev) =>
        updateSession(prev, targetId, (s) => ({
          ...s,
          items: s.items.map((p) => (p.cartItemId === cartItemId ? { ...p, discount } : p)),
        }))
      );
    },
    [activeId]
  );

  const toggleZeroRate = useCallback(
    (cartItemId: string, sessionId?: string) => {
      const targetId = sessionId ?? activeId;
      setSessions((prev) =>
        updateSession(prev, targetId, (s) => ({
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
    (cartItemId: string, startDate: string, endDate: string, newUnitPrice: number, sessionId?: string) => {
      const targetId = sessionId ?? activeId;
      setSessions((prev) =>
        updateSession(prev, targetId, (s) => ({
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
      sessionId?: string
    ) => {
      const targetId = sessionId ?? activeId;
      setSessions((prev) =>
        updateSession(prev, targetId, (s) => ({
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
    (id: string, name: string, phone?: string, sessionId?: string) => {
      const targetId = sessionId ?? activeId;
      setSessions((prev) =>
        updateSession(prev, targetId, (s) => ({
          ...s,
          customerId: id,
          customerName: name,
          customerPhone: phone,
        }))
      );
    },
    [activeId]
  );

  const clearCustomer = useCallback(
    (sessionId?: string) => {
      const targetId = sessionId ?? activeId;
      setSessions((prev) =>
        updateSession(prev, targetId, (s) => ({
          ...s,
          customerId: undefined,
          customerName: undefined,
          customerPhone: undefined,
        }))
      );
    },
    [activeId]
  );

  const setSessionDiscount = useCallback(
    (discount: string, sessionId?: string) => {
      const targetId = sessionId ?? activeId;
      setSessions((prev) =>
        updateSession(prev, targetId, (s) => ({ ...s, totalDiscount: discount }))
      );
    },
    [activeId]
  );

  const setSessionShipping = useCallback(
    (amount: string, sessionId?: string) => {
      const targetId = sessionId ?? activeId;
      setSessions((prev) =>
        updateSession(prev, targetId, (s) => ({ ...s, shippingCost: amount }))
      );
    },
    [activeId]
  );

  const setSessionQuotation = useCallback(
    (quotationId: string, fingerprint: string, sessionId?: string) => {
      const targetId = sessionId ?? activeId;
      setSessions((prev) =>
        updateSession(prev, targetId, (s) => ({
          ...s,
          quotationId,
          quotationFingerprint: fingerprint,
        }))
      );
    },
    [activeId]
  );

  const setSessionLabels = useCallback(
    (codes: string[], fingerprint: string, sessionId?: string) => {
      const targetId = sessionId ?? activeId;
      setSessions((prev) =>
        updateSession(prev, targetId, (s) => ({
          ...s,
          labelCodes: codes,
          labelFingerprint: fingerprint,
        }))
      );
    },
    [activeId]
  );

  const addSessionRepairTicket = useCallback(
    (ticketId: string, sessionId?: string) => {
      const targetId = sessionId ?? activeId;
      setSessions((prev) =>
        updateSession(prev, targetId, (s) => ({
          ...s,
          repairTicketIds: [...(s.repairTicketIds ?? []), ticketId],
        }))
      );
    },
    [activeId]
  );

  const clear = useCallback(
    (sessionId?: string) => {
      const targetId = sessionId ?? activeId;
      setSessions((prev) =>
        updateSession(prev, targetId, (s) => ({
          ...s,
          items: [],
          customerId: undefined,
          customerName: undefined,
          customerPhone: undefined,
          totalDiscount: "0",
          shippingCost: "0",
          quotationId: undefined,
          quotationFingerprint: undefined,
          labelCodes: undefined,
          labelFingerprint: undefined,
        }))
      );
    },
    [activeId]
  );

  const getSession = useCallback(
    (id: string) => sessions.find((s) => s.id === id),
    [sessions]
  );

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
      hydrated,
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
      setSessionDiscount,
      setSessionShipping,
      setSessionQuotation,
      setSessionLabels,
      addSessionRepairTicket,
      clear,
      totalItemCount,
      getSession,
    }),
    [sessions, activeId, active, hydrated, addSession, removeSession, switchSession, add, remove, updateQty, updateDiscount, updateRentalDates, assignVariant, toggleZeroRate, setCustomer, clearCustomer, setSessionDiscount, setSessionShipping, setSessionQuotation, setSessionLabels, addSessionRepairTicket, clear, totalItemCount, getSession]
  );

  return <SessionsContext.Provider value={value}>{children}</SessionsContext.Provider>;
}

export function useSessions() {
  const ctx = useContext(SessionsContext);
  if (!ctx) throw new Error("useSessions must be used within SessionsProvider");
  return ctx;
}
