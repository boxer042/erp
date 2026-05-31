// 업무 노트(Note) 공유 클라이언트 타입 + 라벨. 설계: docs/NOTES_SYSTEM.md
// 서버는 prisma 생성 타입을 쓰고, 클라이언트(페이지·위젯·NoteTimeline)는 이 모듈을 공유한다.

export type NoteKind = "TODO" | "MEMO";
export type NotePriority = "LOW" | "NORMAL" | "HIGH";
export type NoteSourceType =
  | "ORDER"
  | "INCOMING"
  | "PURCHASE_ORDER"
  | "REPAIR"
  | "CUSTOMER"
  | "SUPPLIER"
  | "PAYMENT"
  | "GENERAL";

export interface NoteDto {
  id: string;
  kind: NoteKind;
  content: string;
  title: string | null;
  done: boolean;
  doneAt: string | null;
  dueDate: string | null;
  priority: NotePriority;
  notify: boolean;
  notifyAt: string | null;
  notifiedAt: string | null;
  sourceType: NoteSourceType | null;
  sourceId: string | null;
  sourceLabel: string | null;
  pinned: boolean;
  createdById: string;
  createdBy?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export const PRIORITY_LABELS: Record<NotePriority, string> = {
  LOW: "낮음",
  NORMAL: "보통",
  HIGH: "높음",
};

export const SOURCE_LABELS: Record<NoteSourceType, string> = {
  ORDER: "주문",
  INCOMING: "입고",
  PURCHASE_ORDER: "발주",
  REPAIR: "수리",
  CUSTOMER: "고객",
  SUPPLIER: "거래처",
  PAYMENT: "결제",
  GENERAL: "일반",
};

// 출처 → 해당 도메인 페이지 딥링크. Phase 1 통합 진행에 따라 채워짐.
export const SOURCE_HREF: Partial<Record<NoteSourceType, (id: string) => string>> = {
  ORDER: (id) => `/orders?id=${id}`,
  PURCHASE_ORDER: (id) => `/purchase-orders/${id}`,
  REPAIR: (id) => `/repairs/${id}`,
  CUSTOMER: (id) => `/customers/${id}`,
  SUPPLIER: (id) => `/suppliers/${id}`,
  INCOMING: (id) => `/inventory/incoming?id=${id}`,
};
