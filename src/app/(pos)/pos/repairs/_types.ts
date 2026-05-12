// 수리 v2 페이지에서 공유하는 타입.
// 기존 src/components/pos/repair-work-view.tsx 의 타입을 그대로 가져와 정리.

export type RepairStatus =
  | "RECEIVED"
  | "DIAGNOSING"
  | "QUOTED"
  | "APPROVED"
  | "REPAIRING"
  | "READY"
  | "PICKED_UP"
  | "CANCELLED";

export type RepairType = "ON_SITE" | "DROP_OFF";

export type RepairPartStatus = "USED" | "LOST";

export interface RepairTicketRow {
  id: string;
  ticketNo: string;
  type: RepairType;
  status: RepairStatus;
  receivedAt: string;
  pickedUpAt: string | null;
  symptom: string | null;
  customer: { id: string; name: string; phone: string | null } | null;
  customerMachine: { id: string; name: string } | null;
  serialItem: {
    id: string;
    code: string;
    source: "SALE" | "REPAIR";
    displayName: string | null;
  } | null;
  assignedTo: { id: string; name: string } | null;
  repairCategory: { id: string; name: string } | null;
  // 취소 정보 — status === "CANCELLED" 일 때만 의미
  cancelReason:
    | "CUSTOMER_DECLINED"
    | "CUSTOMER_NO_SHOW"
    | "SHOP_GAVE_UP"
    | "PARTS_UNAVAILABLE"
    | "SOLD_AS_PRODUCT"
    | "MISTAKE"
    | "OTHER"
    | null;
  cancelMemo: string | null;
  cancelledAt: string | null;
  _count: { parts: number; labors: number };
}

export interface RepairPart {
  id: string;
  productId: string;
  product: { id: string; name: string; sku: string };
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  discount: string;
  status: RepairPartStatus;
  /** LOST 상태일 때만 의미 — true 면 고객에게 청구 (합계 포함) */
  billLost: boolean;
  consumedAt: string | null;
}

export interface RepairLabor {
  id: string;
  name: string;
  hours: string;
  unitRate: string;
  totalPrice: string;
}

export interface RepairTicketDetail {
  id: string;
  ticketNo: string;
  type: RepairType;
  status: RepairStatus;
  receivedAt: string;
  pickedUpAt: string | null;
  symptom: string | null;
  diagnosis: string | null;
  repairNotes: string | null;
  diagnosisFee: string;
  totalDiscount: string;
  finalAmount: string;
  cancelReason:
    | "CUSTOMER_DECLINED"
    | "CUSTOMER_NO_SHOW"
    | "SHOP_GAVE_UP"
    | "PARTS_UNAVAILABLE"
    | "SOLD_AS_PRODUCT"
    | "MISTAKE"
    | "OTHER"
    | null;
  cancelMemo: string | null;
  cancelledAt: string | null;
  repairWarrantyMonths: number | null;
  repairWarrantyEnds: string | null;
  customer: { id: string; name: string; phone: string | null } | null;
  customerMachine: { id: string; name: string } | null;
  serialItem: {
    id: string;
    code: string;
    source: "SALE" | "REPAIR";
    displayName: string | null;
    soldAt: string;
    warrantyEnds: string | null;
    product: { id: string; name: string; sku: string; imageUrl: string | null } | null;
  } | null;
  repairProduct: {
    id: string;
    name: string;
    sku: string;
    imageUrl: string | null;
  } | null;
  repairProductText: string | null;
  // 수리 카테고리 — 새 수리 접수 시 선택. null = "기타"
  repairCategory: { id: string; name: string } | null;
  assignedTo: { id: string; name: string } | null;
  parentRepairTicket: {
    id: string;
    ticketNo: string;
    status: RepairStatus;
    repairWarrantyEnds: string | null;
  } | null;
  revisits: Array<{
    id: string;
    ticketNo: string;
    status: RepairStatus;
    receivedAt: string;
  }>;
  parts: RepairPart[];
  labors: RepairLabor[];
}

// 상태별 라벨 + 닷 색상 (Tailwind 직접 — shadcn variant 안 씀)
export const STATUS_META: Record<
  RepairStatus,
  { label: string; dot: string; tint: string; ring: string }
> = {
  RECEIVED: {
    label: "접수",
    dot: "bg-zinc-400",
    tint: "bg-zinc-100 text-zinc-900",
    ring: "ring-zinc-200",
  },
  DIAGNOSING: {
    label: "진단중",
    dot: "bg-amber-500",
    tint: "bg-amber-50 text-amber-900",
    ring: "ring-amber-200",
  },
  QUOTED: {
    label: "견적대기",
    dot: "bg-amber-500",
    tint: "bg-amber-50 text-amber-900",
    ring: "ring-amber-200",
  },
  APPROVED: {
    label: "승인",
    dot: "bg-blue-500",
    tint: "bg-blue-50 text-blue-900",
    ring: "ring-blue-200",
  },
  REPAIRING: {
    label: "수리중",
    dot: "bg-blue-600",
    tint: "bg-blue-50 text-blue-900",
    ring: "ring-blue-300",
  },
  READY: {
    label: "인계대기",
    dot: "bg-emerald-500",
    tint: "bg-emerald-50 text-emerald-900",
    ring: "ring-emerald-200",
  },
  PICKED_UP: {
    label: "수리완료",
    dot: "bg-zinc-400",
    tint: "bg-zinc-100 text-zinc-600",
    ring: "ring-zinc-200",
  },
  CANCELLED: {
    label: "취소",
    dot: "bg-rose-500",
    tint: "bg-rose-50 text-rose-900",
    ring: "ring-rose-200",
  },
};

export type StatusFilter = RepairStatus | "OPEN" | "ALL";

export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "OPEN", label: "진행중" },
  { value: "RECEIVED", label: "접수" },
  { value: "REPAIRING", label: "수리중" },
  { value: "READY", label: "인계대기" },
  { value: "PICKED_UP", label: "완료" },
  { value: "ALL", label: "전체" },
];
