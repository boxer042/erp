import type { Customer, CustomerType } from "../_types";

export type OrderStatus =
  | "PENDING"
  | "PREPARING"
  | "SHIPPED"
  | "COMPLETED"
  | "RETURN_REQUESTED"
  | "RETURN_ACCEPTED"
  | "CANCELLED"
  | "RETURNED"
  | "EXCHANGED";

export type RepairStatus =
  | "RECEIVED"
  | "DIAGNOSING"
  | "QUOTED"
  | "APPROVED"
  | "REPAIRING"
  | "READY"
  | "PICKED_UP"
  | "CANCELLED";

export type RentalStatus =
  | "RESERVED"
  | "ACTIVE"
  | "RETURNED"
  | "OVERDUE"
  | "CANCELLED";

export type SerialSource = "SALE" | "REPAIR";
export type RepairType = "ON_SITE" | "DROP_OFF";

export interface RecentOrder {
  id: string;
  orderNo: string;
  orderDate: string;
  status: OrderStatus;
  totalAmount: string;
  paymentMethod: string | null;
}

export interface RecentRepair {
  id: string;
  ticketNo: string;
  type: RepairType;
  status: RepairStatus;
  receivedAt: string;
  pickedUpAt: string | null;
  finalAmount: string | null;
}

export interface RecentRental {
  id: string;
  rentalNo: string;
  status: RentalStatus;
  startDate: string;
  endDate: string | null;
  finalAmount: string | null;
}

export interface RecentSerial {
  id: string;
  code: string;
  source: SerialSource;
  soldAt: string | null;
  warrantyEnds: string | null;
  product: { name: string; sku: string } | null;
}

export interface CustomerMachineLite {
  id: string;
  name: string;
  memo: string | null;
}

export interface CustomerNote {
  id: string;
  content: string;
  createdAt: string;
}

export interface CustomerStats {
  orderCount: number;
  orderTotal: string;
  repairCount: number;
  repairTotal: string;
  rentalCount: number;
  rentalTotal: string;
  serialCount: number;
  outstandingAmount: string;
}

export interface CustomerDetail {
  customer: Customer & { type: CustomerType };
  stats: CustomerStats;
  recentOrders: RecentOrder[];
  recentRepairs: RecentRepair[];
  recentRentals: RecentRental[];
  recentSerials: RecentSerial[];
  machines: CustomerMachineLite[];
  notes: CustomerNote[];
}

// ─── 라벨 매핑 ───

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "접수",
  PREPARING: "준비 중",
  SHIPPED: "발송 중",
  COMPLETED: "완료",
  RETURN_REQUESTED: "반품 요청",
  RETURN_ACCEPTED: "회수 대기",
  CANCELLED: "취소",
  RETURNED: "반품 완료",
  EXCHANGED: "교환",
};

export const REPAIR_STATUS_LABELS: Record<RepairStatus, string> = {
  RECEIVED: "접수",
  DIAGNOSING: "진단 중",
  QUOTED: "견적",
  APPROVED: "승인",
  REPAIRING: "수리 중",
  READY: "픽업 대기",
  PICKED_UP: "픽업 완료",
  CANCELLED: "취소",
};

export const RENTAL_STATUS_LABELS: Record<RentalStatus, string> = {
  RESERVED: "예약",
  ACTIVE: "임대 중",
  RETURNED: "반납 완료",
  OVERDUE: "연체",
  CANCELLED: "취소",
};

export const REPAIR_TYPE_LABELS: Record<RepairType, string> = {
  ON_SITE: "즉시",
  DROP_OFF: "맡김",
};

type JmBadgeVariant =
  | "default"
  | "outline"
  | "solid"
  | "success"
  | "warning"
  | "danger"
  | "info";

/**
 * 주문 상태 배지 색 — orders 페이지의 STATUS_VISUAL 과 동일 정책.
 * SHIPPED 만 solid 로 시각 강조 (배송 중 = 가장 진행 강한 단계).
 */
export const ORDER_STATUS_VARIANTS: Record<OrderStatus, JmBadgeVariant> = {
  PENDING: "warning",
  PREPARING: "info",
  SHIPPED: "solid",
  COMPLETED: "success",
  RETURN_REQUESTED: "warning",
  RETURN_ACCEPTED: "info",
  CANCELLED: "outline",
  RETURNED: "outline",
  EXCHANGED: "outline",
};

export const REPAIR_STATUS_VARIANTS: Record<RepairStatus, JmBadgeVariant> = {
  RECEIVED: "warning",
  DIAGNOSING: "info",
  QUOTED: "info",
  APPROVED: "info",
  REPAIRING: "info",
  READY: "success",
  PICKED_UP: "success",
  CANCELLED: "default",
};

export const RENTAL_STATUS_VARIANTS: Record<RentalStatus, JmBadgeVariant> = {
  RESERVED: "warning",
  ACTIVE: "info",
  RETURNED: "success",
  OVERDUE: "danger",
  CANCELLED: "default",
};

// ─── 포맷터 ───

export const formatKRW = (v: string | number | null | undefined): string => {
  const n = typeof v === "number" ? v : parseFloat(v ?? "0");
  if (!Number.isFinite(n)) return "₩0";
  return `₩${n.toLocaleString("ko-KR")}`;
};

export const formatDateShort = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};
