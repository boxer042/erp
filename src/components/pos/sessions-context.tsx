"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { genClientId } from "@/lib/utils";

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
  /** 카트 추가 시점 ISO timestamp — Rental.checkoutAt 으로 저장됨 (시간대별 임대 트래픽 분석용) */
  checkoutAt?: string;
}

export interface CartItem {
  cartItemId: string;        // 카트 내 고유 식별자 (UUID)
  productId?: string;        // 상품 항목만 있음, 서비스 항목은 없음
  itemType: "product" | "repair" | "rental";
  name: string;
  sku?: string;
  imageUrl: string | null;
  unitPrice: number;
  /** 정가(세전) — 가격 다이얼로그에서 입력가와 비교용. 미지정 시 비교 영역 안 보여줌. */
  listPrice?: number;
  quantity: number;
  discount: string; // "1000" 또는 "10%"
  taxType?: "TAXABLE" | "TAX_FREE";
  zeroRateEligible?: boolean; // 영세율 적용 가능 상품 여부 (Product.zeroRateEligible 미러)
  isZeroRate?: boolean;  // 이번 거래에 영세율 적용 여부 (zeroRateEligible 상품만 해당, 기본 false)
  isBulk?: boolean;          // 벌크 SKU 여부 (소수점 수량 입력 허용)
  unitOfMeasure?: string;    // "EA", "mL", "g" 등 — UI 표시용
  isCanonical?: boolean;     // 대표 상품 여부 — true 면 결제 직전 변형 확정 필요
  /**
   * OPTION_PARENT 상품 여부 — 자체 재고 없는 옵션 placeholder.
   * 결제 전 SWAP 옵션값 선택으로 productId 가 실제 SKU 로 교체돼야 함.
   * applySelections.swap 적용 시 이 플래그 자동 해제 (productId 가 실제 SKU 로 swap 됐으니).
   */
  isOptionParent?: boolean;
  /** 상품에 ProductOption 슬롯이 등록돼 있는지 — 카트에서 "옵션 선택" 트리거 노출용 */
  hasProductOptions?: boolean;
  /**
   * 선택한 옵션값 ID들. mappedProductId 가 있는 옵션값은 결제 시 OPTION_REF 자식 라인으로 분리됨.
   * 서버에 그대로 전달하면 /api/pos/checkout 이 optionSnapshot + OPTION_REF 자동 생성.
   */
  optionValueIds?: string[];
  /** 화면 표시용 옵션 라벨 매핑 — 상품명 옆 부속 텍스트 (예: "(화이트 · L)"). 비매핑 옵션값만 포함 */
  optionSnapshot?: Record<string, string>;
  /**
   * 비매핑 옵션값(단순 텍스트 / mappedVariantId)의 addPrice 합계 — 메인 unitPrice 안에 포함된 금액.
   * 서버 전달 시 unitPrice - optionAddPriceSum 으로 base 환산해 server 가 다시 addPrice 적용 시 이중 합산 방지.
   * mappedProduct 옵션값의 addPrice 는 optionRefs 자식 라인의 addPrice 로 별도 보관 (메인 unitPrice 무관).
   */
  optionAddPriceSum?: number;
  /**
   * mappedProductId 옵션값 — 카트에서 별도 자식 행으로 표시 + 결제 시 서버가 OPTION_REF OrderItem 생성.
   * 서버 전달은 optionValueIds 로 그대로 (서버가 mappedProductId 보고 자식 라인 자동 생성).
   * 카트 라인 전용 표시 데이터.
   */
  optionRefs?: Array<{
    optionValueId: string;
    productId: string;
    name: string;
    sku?: string;
    /** 자식 라인의 단가 (세전) = optionValue.addPrice 또는 mappedProduct.sellingPrice */
    addPrice: number;
    taxType?: "TAXABLE" | "TAX_FREE";
    isZeroRate?: boolean;
  }>;
  /**
   * 추가구매 자식 라인 — 메인 라인의 parentCartItemId 가 이 라인의 cartItemId 가리킴 (cascade 삭제용).
   * 카트 표시는 메인 라인 아래 들여쓰기. 결제 시 OrderItem.lineRole=ADDON, parentItemId=메인.id 로 생성.
   */
  parentCartItemId?: string;
  /** ADDON 자식 라인이면 true — 메인 카트 추가 후 BundleProduct 모달 또는 직접 추천에서 추가됨 */
  isAddon?: boolean;
  /** 추가구매 BundleProduct.id — 메인-자식 관계 추적용 (서버에 안 보내고 카트 내부 관리) */
  bundleId?: string;
  repairMeta?: RepairMeta;
  rentalMeta?: RentalMeta;
}

export interface CartSession {
  id: string;
  label: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  /** 고객 타입 — 기업이면 상호 강조 등 UI 분기용. 미설정 시 INDIVIDUAL 로 취급. */
  customerType?: "INDIVIDUAL" | "BUSINESS";
  /** 기업 고객일 때 사업자번호 — 카트 헤더/결제시트 등 표시용 */
  customerBusinessNumber?: string | null;
  items: CartItem[];
  totalDiscount: string; // "1000" 또는 "10%" — 세션 전체 할인
  shippingCost: string;  // 세전 공급가액 기준, 정수 문자열
  quotationId?: string;            // 마지막 발행 견적서 ID
  quotationFingerprint?: string;   // 발행 시점 카트 지문 — 카트 변경 감지용
  labelCodes?: string[];           // 마지막 발번 라벨 코드 목록
  labelFingerprint?: string;       // 발번 시점 카트 지문
  repairTicketIds?: string[];      // deprecated — RepairTicket.posSessionId 로 이관됨
  openRepairCount?: number;        // 진행중 수리 건수 — 워크스페이스가 동기화 (헤더 표시용)
  /**
   * 마지막 client mutation 시각 — server 의 last-write-wins 비교에 사용.
   * 다른 기기가 polling 으로 자기 옛 상태를 server 에 덮어쓰는 것을 방지하는 핵심 필드.
   * mutation 안 한 다른 기기는 이 값 그대로 server 에 보냄 → server 는 자기 updatedAt 과 같으니 update 거부.
   */
  updatedAt?: string;
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
  /** 닫은 세션 그대로 복원 — undo 토스트용. removedIds 도 함께 정리해 server 삭제 cancel */
  restoreSession: (session: CartSession) => void;
  switchSession: (id: string) => void;
  add: (item: Omit<CartItem, "cartItemId" | "quantity" | "discount"> & { quantity?: number; cartItemId?: string }, opts?: AddOptions) => void;
  /**
   * 카트 라인 일괄 교체 — 견적서 불러오기 같은 흐름에 사용. 세션 단위 할인/배송비/customer 는 보존.
   * 견적서 ref(quotationId/Fingerprint) 는 새 카트 상태와 더 이상 연동되지 않으므로 함께 리셋.
   */
  replaceItems: (items: CartItem[], sessionId?: string) => void;
  remove: (cartItemId: string, sessionId?: string) => void;
  updateQty: (cartItemId: string, qty: number, sessionId?: string) => void;
  updateUnitPrice: (cartItemId: string, unitPrice: number, sessionId?: string) => void;
  updateDiscount: (cartItemId: string, discount: string, sessionId?: string) => void;
  updateRentalDates: (cartItemId: string, startDate: string, endDate: string, newUnitPrice: number, sessionId?: string) => void;
  assignVariant: (cartItemId: string, variant: { productId: string; name: string; sku?: string; unitPrice: number }, sessionId?: string) => void;
  /**
   * variant 선택 + 고객 옵션값 선택을 한 번에 적용 — VariantSelectSheet 의 confirm 액션.
   * 옵션 처리 모드별 동작:
   *  - SWAP 옵션값(swap 인자): 카트 라인의 productId/name/sku/단가를 mapped SKU 로 교체 (OPTION_PARENT → 실제 SKU)
   *  - ADDON 옵션값(optionRefs): 카트 별도 자식 행 + 결제 시 OPTION_REF OrderItem 생성
   *  - 비매핑 옵션값(nonMappedAddPriceSum): 메인 라인 unitPrice 에 addPrice 가산
   * 우선순위: variant 있음 > swap 있음 > 그 외 (기존 base 유지). 옵션은 항상 갱신.
   */
  applySelections: (
    cartItemId: string,
    payload: {
      variant?: { productId: string; name: string; sku?: string; unitPrice: number };
      /** SWAP 옵션값 — 메인 라인 SKU 교체 (OPTION_PARENT 결제 강제용 등) */
      swap?: {
        optionValueId: string;
        productId: string;
        name: string;
        sku?: string;
        sellingPrice: number;
        listPrice?: number;
        taxType?: "TAXABLE" | "TAX_FREE";
      };
      optionValueIds: string[];
      optionSnapshot: Record<string, string>;
      /** 비매핑 옵션 addPrice 합계 — 메인 unitPrice 에 가산 */
      nonMappedAddPriceSum: number;
      /** ADDON 매핑 옵션값들 — 카트 별도 자식 행 */
      optionRefs: Array<{
        optionValueId: string;
        productId: string;
        name: string;
        sku?: string;
        addPrice: number;
        taxType?: "TAXABLE" | "TAX_FREE";
        isZeroRate?: boolean;
      }>;
    },
    sessionId?: string,
  ) => void;
  toggleZeroRate: (cartItemId: string, sessionId?: string) => void;
  setCustomer: (
    id: string,
    name: string,
    phone?: string,
    sessionId?: string,
    extras?: { type?: "INDIVIDUAL" | "BUSINESS"; businessNumber?: string | null },
  ) => void;
  clearCustomer: (sessionId?: string) => void;
  setSessionDiscount: (discount: string, sessionId?: string) => void;
  setSessionShipping: (amount: string, sessionId?: string) => void;
  setSessionQuotation: (quotationId: string, fingerprint: string, sessionId?: string) => void;
  setSessionLabels: (codes: string[], fingerprint: string, sessionId?: string) => void;
  addSessionRepairTicket: (ticketId: string, sessionId?: string) => void;
  /** 전체 목록 동기화 — 서버 ticketsQuery 의 결과로 stale ID 제거용 */
  setSessionRepairTicketIds: (ticketIds: string[], sessionId?: string) => void;
  setSessionOpenRepairCount: (count: number, sessionId?: string) => void;
  clear: (sessionId?: string) => void;
  totalItemCount: number;
  getSession: (id: string) => CartSession | undefined;
  /** 서버 상태를 즉시 가져와 로컬 sessions 에 반영. 부활/주차 후 navigation 직전에 호출. */
  forceSync: () => Promise<void>;
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
  // 서버 sync 용 — 삭제된 세션 ID 추적 (다음 sync 에 보냄)
  const removedIdsRef = useRef<Set<string>>(new Set());
  // 첫 서버 fetch 완료 여부 — 그 전엔 push 안 함 (덮어쓰기 방지)
  const serverHydratedRef = useRef(false);
  // sessions 의 최신 ref — polling/debounce 안에서 stale state 방지
  const sessionsRef = useRef<CartSession[]>([]);
  sessionsRef.current = sessions;
  // 클라이언트 mutation counter — sync 도중 sessions 가 변경되었는지 비교용 (race guard).
  // setState 의 비동기 schedule 로 sessionsRef 가 즉시 업데이트되지 않을 수 있어,
  // 모든 mutation 함수가 호출 즉시 increment 하는 wrapper 를 거치게 해서 race window 를 차단.
  const mutationCountRef = useRef(0);
  // 사용자 mutation 전용 setSessions — sync 응답 처리는 직접 setSessions 사용.
  // 핵심: 변경/신규 session 의 updatedAt 자동 갱신 → server last-write-wins 가 정확히 동작.
  // 다른 기기가 polling 으로 자기 옛 상태 보낼 때, 그 session 의 updatedAt 은 옛 값 → server 거부.
  const mutateSessions = useCallback(
    (updater: (prev: CartSession[]) => CartSession[]) => {
      mutationCountRef.current++;
      setSessions((prev) => {
        const next = updater(prev);
        const now = new Date().toISOString();
        return next.map((s) => {
          const old = prev.find((p) => p.id === s.id);
          // 신규(old 없음) 이거나 reference 가 다르면(변경됨) updatedAt 갱신
          if (!old || old !== s) return { ...s, updatedAt: now };
          return s;
        });
      });
    },
    [],
  );

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
    // 빈 상태로 시작 — 사용자가 명시적으로 새 고객을 만들 때만 세션 생성.
    // 자동 makeSession 은 새 기기/브라우저 진입마다 빈 미등록 세션이 서버에 push 되어
    // 다른 기기에 sync 되는 부작용이 있어 제거. v1 의 사이드바·카트 흐름은 ensureSessionId()
    // 가 사용자가 메뉴 클릭한 시점에 addSession 을 호출하므로 영향 없음.
    setSessions([]);
    setActiveId("");
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ sessions, activeId }));
    } catch {}
  }, [sessions, activeId, hydrated]);

  // ── 서버 sync ─────────────────────────────────────────
  // 디바이스간 공유. 마운트 시 GET 한 번 + 변경 시 debounced POST + 5초 polling.
  // 실패해도 localStorage 가 fallback 이라 graceful.
  useEffect(() => {
    if (!hydrated) return;

    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    // unmount/페이지 이동 시 in-flight 요청 cancel 신호 — 서버 ECONNRESET 노이즈 방지
    const abortController = new AbortController();

    const sync = async () => {
      try {
        const beforeMutationCount = mutationCountRef.current;
        const body = {
          sessions: sessionsRef.current,
          deletedIds: Array.from(removedIdsRef.current),
        };
        const sentDeleted = body.deletedIds;
        const res = await fetch("/api/pos/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: abortController.signal,
        });
        if (!res.ok) return;
        const payload = (await res.json()) as {
          sessions: (CartSession & { updatedAt?: string })[];
          rejectedIds: string[];
        };
        if (cancelled) return;

        if (mutationCountRef.current !== beforeMutationCount) {
          debouncePushRef.current?.();
          return;
        }

        for (const id of sentDeleted) removedIdsRef.current.delete(id);

        // 다른 기기가 삭제한 세션 — 클라이언트 sessionStorage 에서도 제거 (부활 방지)
        if (payload.rejectedIds && payload.rejectedIds.length > 0) {
          for (const id of payload.rejectedIds) removedIdsRef.current.delete(id);
        }

        serverHydratedRef.current = true;

        const local = sessionsRef.current;
        const serverNormalized = payload.sessions.map(migrateSession);
        const sameAsLocal =
          JSON.stringify(local) === JSON.stringify(serverNormalized);
        if (!sameAsLocal) {
          setSessions(serverNormalized);
          const stillExists = payload.sessions.some(
            (s) => s.id === activeIdRef.current,
          );
          if (!stillExists && payload.sessions.length > 0) {
            setActiveId(payload.sessions[0].id);
          } else if (payload.sessions.length === 0) {
            setActiveId("");
          }
        }
      } catch {
        /* 네트워크 실패 — silent. localStorage 에 의존 */
      }
    };

    // 1) 마운트 직후 첫 sync
    sync();

    // 외부 forceSync 노출 — 부활/주차 직후 호출용
    forceSyncRef.current = sync;

    // 2) 5초 polling
    pollTimer = setInterval(sync, 5000);

    // 3) sessions 변경 시 debounced sync — 다른 useEffect 가 sessions 변화 감지해서 호출
    //    (이 effect 안에선 sessions deps 안 잡음 — 무한루프 방지)
    debouncePushRef.current = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (!serverHydratedRef.current) return; // 첫 fetch 전엔 skip
        sync();
      }, 800);
    };

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (pollTimer) clearInterval(pollTimer);
      // unmount 시 in-flight 요청 cancel — 서버가 ECONNRESET 안 받게
      abortController.abort();
      debouncePushRef.current = null;
      forceSyncRef.current = null;
    };
  }, [hydrated]);

  const forceSync = useCallback(async () => {
    if (forceSyncRef.current) await forceSyncRef.current();
  }, []);

  // sessions 변경 → debounced push trigger
  const debouncePushRef = useRef<(() => void) | null>(null);
  // 외부에서 호출 가능한 즉시 sync — useEffect 내부의 sync() 를 가리킴
  const forceSyncRef = useRef<(() => Promise<void>) | null>(null);
  const activeIdRef = useRef<string>("");
  // eslint-disable-next-line react-hooks/immutability
  activeIdRef.current = activeId;
  useEffect(() => {
    if (!hydrated) return;
    debouncePushRef.current?.();
  }, [sessions, hydrated]);

  const addSession = useCallback(() => {
    let createdId = "";
    mutateSessions((prev) => {
      const next = makeSession(prev.length + 1);
      createdId = next.id;
      setActiveId(next.id);
      return [...prev, next];
    });
    return createdId;
  }, []);

  const removeSession = useCallback((id: string) => {
    mutateSessions((prev) => {
      // 서버에서도 삭제 — 다음 sync 에 deletedIds 로 보냄. 마지막 세션이어도 진짜 삭제 (빈 그리드 허용).
      removedIdsRef.current.add(id);
      const next = prev.filter((s) => s.id !== id);
      setActiveId((cur) => {
        if (cur !== id) return cur;
        if (next.length === 0) return "";
        const idx = prev.findIndex((s) => s.id === id);
        return next[Math.max(0, idx - 1)]?.id ?? next[0].id;
      });
      return next;
    });
  }, []);

  /**
   * 닫은 고객 카드를 그대로 복원 — undo 토스트용.
   * 서버 sync 에 deletedIds 로 보내기 전(debounce 800ms) 에 호출하면 server 삭제 자체가 cancel.
   * 그 이후에 호출되면 server 측에선 새 row 로 다시 생성됨 (id 보존).
   */
  const restoreSession = useCallback((session: CartSession) => {
    removedIdsRef.current.delete(session.id);
    mutateSessions((prev) => {
      // 이미 같은 id 가 sync 로 돌아왔으면 중복 추가 방지
      if (prev.some((s) => s.id === session.id)) return prev;
      setActiveId(session.id);
      return [...prev, session];
    });
  }, []);

  const switchSession = useCallback((id: string) => setActiveId(id), []);

  const add = useCallback(
    (
      it: Omit<CartItem, "cartItemId" | "quantity" | "discount"> & { quantity?: number; cartItemId?: string },
      opts?: AddOptions
    ) => {
      const targetId = opts?.sessionId ?? activeId;
      const optKey = (it.optionValueIds ?? []).slice().sort().join(",");
      mutateSessions((prev) =>
        updateSession(prev, targetId, (s) => {
          // ADDON 자식 라인은 항상 새 라인 (메인-자식 트리 보존, 같은 productId merge 안 함)
          if (!it.isAddon && it.productId && it.itemType === "product") {
            // 같은 productId + 같은 옵션 조합이면 수량만 +1 (옵션 다르면 별도 라인)
            const existing = s.items.find((p) => {
              if (p.productId !== it.productId) return false;
              if (p.isAddon) return false; // 메인-자식 트리 충돌 회피
              const pKey = (p.optionValueIds ?? []).slice().sort().join(",");
              return pKey === optKey;
            });
            if (existing) {
              return {
                ...s,
                items: s.items.map((p) =>
                  p === existing
                    ? {
                        ...p,
                        quantity: p.quantity + (it.quantity ?? 1),
                        listPrice: p.listPrice ?? it.listPrice,
                      }
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
                cartItemId: it.cartItemId ?? genClientId(),
                productId: it.productId,
                itemType: it.itemType,
                name: it.name,
                sku: it.sku,
                imageUrl: it.imageUrl,
                unitPrice: it.unitPrice,
                listPrice: it.listPrice,
                quantity: it.quantity ?? 1,
                discount: "0",
                taxType: it.taxType,
                isZeroRate: it.isZeroRate,
                isBulk: it.isBulk,
                unitOfMeasure: it.unitOfMeasure,
                isCanonical: it.isCanonical,
                isOptionParent: it.isOptionParent,
                hasProductOptions: it.hasProductOptions,
                // 옵션 정보 — 카탈로그 추가 시점에 미리 선택했으면 그대로 보존 (cart-line-row 에서 변경 가능)
                optionValueIds: it.optionValueIds,
                optionSnapshot: it.optionSnapshot,
                optionAddPriceSum: it.optionAddPriceSum,
                optionRefs: it.optionRefs,
                // 추가구매 자식 라인 — parentCartItemId 로 메인 라인과 트리 연결 + cascade 삭제용
                parentCartItemId: it.parentCartItemId,
                isAddon: it.isAddon,
                bundleId: it.bundleId,
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

  const replaceItems = useCallback(
    (items: CartItem[], sessionId?: string) => {
      const targetId = sessionId ?? activeId;
      mutateSessions((prev) =>
        updateSession(prev, targetId, (s) => ({
          ...s,
          items,
          quotationId: undefined,
          quotationFingerprint: undefined,
        })),
      );
    },
    [activeId],
  );

  const remove = useCallback(
    (cartItemId: string, sessionId?: string) => {
      const targetId = sessionId ?? activeId;
      mutateSessions((prev) =>
        updateSession(prev, targetId, (s) => ({
          ...s,
          // 메인 라인 삭제 시 그 자식 ADDON 라인도 cascade — 추가구매는 메인의 부산물
          items: s.items.filter(
            (p) => p.cartItemId !== cartItemId && p.parentCartItemId !== cartItemId,
          ),
        }))
      );
    },
    [activeId]
  );

  const updateQty = useCallback(
    (cartItemId: string, qty: number, sessionId?: string) => {
      const targetId = sessionId ?? activeId;
      mutateSessions((prev) =>
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

  const updateUnitPrice = useCallback(
    (cartItemId: string, unitPrice: number, sessionId?: string) => {
      const targetId = sessionId ?? activeId;
      mutateSessions((prev) =>
        updateSession(prev, targetId, (s) => ({
          ...s,
          items: s.items.map((p) =>
            p.cartItemId === cartItemId
              ? { ...p, unitPrice: Math.max(0, Math.round(unitPrice)) }
              : p,
          ),
        }))
      );
    },
    [activeId]
  );

  const updateDiscount = useCallback(
    (cartItemId: string, discount: string, sessionId?: string) => {
      const targetId = sessionId ?? activeId;
      mutateSessions((prev) =>
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
      mutateSessions((prev) =>
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
      mutateSessions((prev) =>
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
      mutateSessions((prev) =>
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

  const applySelections = useCallback(
    (
      cartItemId: string,
      payload: {
        variant?: { productId: string; name: string; sku?: string; unitPrice: number };
        swap?: {
          optionValueId: string;
          productId: string;
          name: string;
          sku?: string;
          sellingPrice: number;
          listPrice?: number;
          taxType?: "TAXABLE" | "TAX_FREE";
        };
        optionValueIds: string[];
        optionSnapshot: Record<string, string>;
        nonMappedAddPriceSum: number;
        optionRefs: Array<{
          optionValueId: string;
          productId: string;
          name: string;
          sku?: string;
          addPrice: number;
          taxType?: "TAXABLE" | "TAX_FREE";
          isZeroRate?: boolean;
        }>;
      },
      sessionId?: string,
    ) => {
      const targetId = sessionId ?? activeId;
      mutateSessions((prev) =>
        updateSession(prev, targetId, (s) => ({
          ...s,
          items: s.items.map((p) => {
            if (p.cartItemId !== cartItemId) return p;
            // base 단가 결정: variant > swap > 기존 unitPrice 에서 비매핑 addPrice 빼서 환산
            const base = payload.variant
              ? payload.variant.unitPrice
              : payload.swap
                ? payload.swap.sellingPrice
                : Math.max(0, p.unitPrice - (p.optionAddPriceSum ?? 0));
            const finalUnit = base + payload.nonMappedAddPriceSum;
            // 메인 라인 SKU/이름/정가/세금: variant > swap > 기존
            const newProductMeta = payload.variant
              ? {
                  productId: payload.variant.productId,
                  name: payload.variant.name,
                  sku: payload.variant.sku,
                  isCanonical: false,
                }
              : payload.swap
                ? {
                    productId: payload.swap.productId,
                    name: payload.swap.name,
                    sku: payload.swap.sku,
                    // SWAP 적용 → OPTION_PARENT 해제 (실제 SKU 로 swap 된 상태라 결제 차단 풀림)
                    isOptionParent: false,
                    // listPrice 도 swap 된 SKU 기준으로 갱신 — 단가 비교 표시 (정가/할인) 일치
                    ...(payload.swap.listPrice !== undefined
                      ? { listPrice: payload.swap.listPrice }
                      : {}),
                    // taxType 갱신 — swap 된 SKU 의 과세/면세 적용
                    ...(payload.swap.taxType
                      ? { taxType: payload.swap.taxType }
                      : {}),
                  }
                : {};
            return {
              ...p,
              ...newProductMeta,
              optionValueIds:
                payload.optionValueIds.length > 0 ? payload.optionValueIds : undefined,
              optionSnapshot:
                Object.keys(payload.optionSnapshot).length > 0
                  ? payload.optionSnapshot
                  : undefined,
              optionAddPriceSum:
                payload.nonMappedAddPriceSum > 0 ? payload.nonMappedAddPriceSum : undefined,
              optionRefs: payload.optionRefs.length > 0 ? payload.optionRefs : undefined,
              unitPrice: Math.round(finalUnit),
            };
          }),
        })),
      );
    },
    [activeId],
  );

  const setCustomer = useCallback(
    (
      id: string,
      name: string,
      phone?: string,
      sessionId?: string,
      extras?: { type?: "INDIVIDUAL" | "BUSINESS"; businessNumber?: string | null },
    ) => {
      const targetId = sessionId ?? activeId;
      let ticketIdsToUpgrade: string[] = [];
      mutateSessions((prev) =>
        updateSession(prev, targetId, (s) => {
          // 이 세션이 만들었던 미등록 수리 티켓들 — 결제 전이면 customerId 자동 채워줌
          ticketIdsToUpgrade = s.repairTicketIds ?? [];
          return {
            ...s,
            customerId: id,
            customerName: name,
            customerPhone: phone,
            customerType: extras?.type,
            customerBusinessNumber: extras?.businessNumber ?? null,
          };
        })
      );
      // 미등록으로 만들었던 RepairTicket들에 customerId PUT (best-effort, 실패해도 무시)
      if (ticketIdsToUpgrade.length > 0) {
        for (const ticketId of ticketIdsToUpgrade) {
          fetch(`/api/repair-tickets/${ticketId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ customerId: id }),
          }).catch(() => {});
        }
      }
    },
    [activeId]
  );

  const clearCustomer = useCallback(
    (sessionId?: string) => {
      const targetId = sessionId ?? activeId;
      mutateSessions((prev) =>
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
      mutateSessions((prev) =>
        updateSession(prev, targetId, (s) => ({ ...s, totalDiscount: discount }))
      );
    },
    [activeId]
  );

  const setSessionShipping = useCallback(
    (amount: string, sessionId?: string) => {
      const targetId = sessionId ?? activeId;
      mutateSessions((prev) =>
        updateSession(prev, targetId, (s) => ({ ...s, shippingCost: amount }))
      );
    },
    [activeId]
  );

  const setSessionQuotation = useCallback(
    (quotationId: string, fingerprint: string, sessionId?: string) => {
      const targetId = sessionId ?? activeId;
      mutateSessions((prev) =>
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
      mutateSessions((prev) =>
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
      mutateSessions((prev) =>
        updateSession(prev, targetId, (s) => {
          const existing = s.repairTicketIds ?? [];
          if (existing.includes(ticketId)) return s;
          return { ...s, repairTicketIds: [...existing, ticketId] };
        })
      );
    },
    [activeId]
  );

  const setSessionRepairTicketIds = useCallback(
    (ticketIds: string[], sessionId?: string) => {
      const targetId = sessionId ?? activeId;
      mutateSessions((prev) =>
        updateSession(prev, targetId, (s) => {
          const existing = s.repairTicketIds ?? [];
          // 같은 집합이면 no-op
          if (
            existing.length === ticketIds.length &&
            existing.every((id) => ticketIds.includes(id))
          )
            return s;
          return { ...s, repairTicketIds: ticketIds };
        }),
      );
    },
    [activeId],
  );

  const setSessionOpenRepairCount = useCallback(
    (count: number, sessionId?: string) => {
      const targetId = sessionId ?? activeId;
      mutateSessions((prev) =>
        updateSession(prev, targetId, (s) => {
          if (s.openRepairCount === count) return s;
          return { ...s, openRepairCount: count };
        })
      );
    },
    [activeId]
  );

  const clear = useCallback(
    (sessionId?: string) => {
      const targetId = sessionId ?? activeId;
      mutateSessions((prev) =>
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
      restoreSession,
      switchSession,
      add,
      replaceItems,
      remove,
      updateQty,
      updateUnitPrice,
      updateDiscount,
      updateRentalDates,
      assignVariant,
      applySelections,
      toggleZeroRate,
      setCustomer,
      clearCustomer,
      setSessionDiscount,
      setSessionShipping,
      setSessionQuotation,
      setSessionLabels,
      addSessionRepairTicket,
      setSessionRepairTicketIds,
      setSessionOpenRepairCount,
      clear,
      totalItemCount,
      getSession,
      forceSync,
    }),
    [sessions, activeId, active, hydrated, addSession, removeSession, restoreSession, switchSession, add, replaceItems, remove, updateQty, updateUnitPrice, updateDiscount, updateRentalDates, assignVariant, applySelections, toggleZeroRate, setCustomer, clearCustomer, setSessionDiscount, setSessionShipping, setSessionQuotation, setSessionLabels, addSessionRepairTicket, setSessionRepairTicketIds, setSessionOpenRepairCount, clear, totalItemCount, getSession, forceSync]
  );

  return <SessionsContext.Provider value={value}>{children}</SessionsContext.Provider>;
}

export function useSessions() {
  const ctx = useContext(SessionsContext);
  if (!ctx) throw new Error("useSessions must be used within SessionsProvider");
  return ctx;
}
