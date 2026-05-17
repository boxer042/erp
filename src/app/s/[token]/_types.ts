// 손님 공개 페이지 — /api/public/serial-access 응답 타입.

export interface PublicDevice {
  productId: string | null;
  name: string;
  modelName: string | null;
  imageUrl: string | null;
  hasManual: boolean;
  manualBlocks: unknown | null;
}

export interface PublicWarranty {
  ends: string | null;
  active: boolean;
  daysLeft: number | null;
}

export interface PublicCustomer {
  id: string | null;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
}

export interface PublicPurchase {
  orderId: string;
  orderNo: string;
  orderedAt: string;
  channel: string | null;
  amount: number | null;
}

export interface PublicRepair {
  id: string;
  ticketNo: string;
  status: string;
  receivedAt: string;
  completedAt: string | null;
  symptom: string | null;
  diagnosis: string | null;
  amount: number | null;
  warrantyEnds: string | null;
  parts: { name: string; quantity: number; amount: number | null }[];
  labors: { name: string; amount: number | null }[];
}

export interface PublicCompany {
  name: string;
  phone: string | null;
  address: string | null;
}

// 1단계 — 마스킹된 요약.
export interface SummaryResponse {
  mode: "summary";
  verifiable: boolean;
  code: string;
  soldAt: string;
  warranty: PublicWarranty;
  device: PublicDevice | null;
  customer: PublicCustomer | null;
  purchase: PublicPurchase | null;
  repairCount: number;
  repairs: Pick<
    PublicRepair,
    "id" | "receivedAt" | "completedAt" | "symptom" | "status"
  >[];
  company: PublicCompany | null;
}

// 2단계 통과 — 풀공개.
export interface FullResponse {
  mode: "full";
  code: string;
  status: string;
  source: string;
  soldAt: string;
  warranty: PublicWarranty;
  device: PublicDevice | null;
  customer: PublicCustomer | null;
  purchase: PublicPurchase | null;
  repairs: PublicRepair[];
  rentalAsset: { id: string; assetNo: string; name: string } | null;
}

export type SerialAccessResponse = SummaryResponse | FullResponse;

export const REPAIR_STATUS_LABEL: Record<string, string> = {
  RECEIVED: "접수",
  DIAGNOSING: "진단중",
  QUOTED: "견적완료",
  APPROVED: "승인됨",
  REPAIRING: "수리중",
  READY: "수리완료",
  PICKED_UP: "수령완료",
  CANCELLED: "취소",
};
