import type { Prisma } from "@prisma/client";
import { maskName, maskPhone } from "@/lib/serial-token";

// 매장 직원용 상세 + 손님 공개 페이지 공용 — SerialItem 조회 include.
export const serialDetailInclude = {
  product: {
    select: {
      id: true,
      name: true,
      modelName: true,
      imageUrl: true,
      hasManual: true,
      manualBlocks: true,
      warrantyMonths: true,
    },
  },
  customer: {
    select: { id: true, name: true, phone: true, email: true, address: true },
  },
  orderItem: {
    select: {
      id: true,
      quantity: true,
      totalPrice: true,
      order: {
        select: {
          id: true,
          orderNo: true,
          orderDate: true,
          channel: { select: { name: true } },
        },
      },
    },
  },
  repairTickets: {
    orderBy: { receivedAt: "desc" as const },
    select: {
      id: true,
      ticketNo: true,
      status: true,
      type: true,
      receivedAt: true,
      readyAt: true,
      pickedUpAt: true,
      symptom: true,
      diagnosis: true,
      finalAmount: true,
      repairWarrantyEnds: true,
      parts: {
        select: {
          id: true,
          quantity: true,
          totalPrice: true,
          product: { select: { name: true } },
        },
      },
      labors: { select: { id: true, name: true, totalPrice: true } },
    },
  },
} satisfies Prisma.SerialItemInclude;

export type SerialDetailRaw = Prisma.SerialItemGetPayload<{
  include: typeof serialDetailInclude;
}>;

// 보증 잔여 계산.
export function warrantyInfo(warrantyEnds: Date | null, now = new Date()) {
  if (!warrantyEnds) return { active: false, daysLeft: null as number | null };
  const daysLeft = Math.ceil((warrantyEnds.getTime() - now.getTime()) / 86_400_000);
  return { active: daysLeft > 0, daysLeft };
}

export interface SerialProfile {
  code: string;
  status: SerialDetailRaw["status"];
  source: SerialDetailRaw["source"];
  masked: boolean;
  soldAt: string;
  warranty: { ends: string | null; active: boolean; daysLeft: number | null };
  device: {
    productId: string | null;
    name: string;
    modelName: string | null;
    imageUrl: string | null;
    hasManual: boolean;
    // manualBlocks 는 손님 페이지 사용법 렌더 전용 — 무거우면 라우트에서 제거 가능
    manualBlocks: unknown | null;
  } | null;
  customer: {
    id: string | null;
    name: string;
    phone: string;
    email: string | null;
    address: string | null;
  } | null;
  purchase: {
    orderId: string;
    orderNo: string;
    orderedAt: string;
    channel: string | null;
    amount: number | null;
  } | null;
  repairs: Array<{
    id: string;
    ticketNo: string;
    status: SerialDetailRaw["repairTickets"][number]["status"];
    receivedAt: string;
    completedAt: string | null;
    symptom: string | null;
    diagnosis: string | null;
    amount: number | null;
    warrantyEnds: string | null;
    parts: Array<{ name: string; quantity: number; amount: number | null }>;
    labors: Array<{ name: string; amount: number | null }>;
  }>;
}

// raw SerialItem → 정규화된 프로파일.
// masked=true (손님 1단계): 손님 개인정보·금액 가림. masked=false (매장·손님 2단계): 풀공개.
export function buildSerialProfile(
  raw: SerialDetailRaw,
  opts: { masked: boolean },
): SerialProfile {
  const masked = opts.masked;
  const w = warrantyInfo(raw.warrantyEnds);

  const baseProduct = raw.product;

  const device: SerialProfile["device"] = baseProduct
    ? {
        productId: baseProduct.id,
        name: baseProduct.name,
        modelName: baseProduct.modelName,
        imageUrl: baseProduct.imageUrl,
        hasManual: baseProduct.hasManual,
        manualBlocks: baseProduct.hasManual ? baseProduct.manualBlocks : null,
      }
    : raw.displayName
      ? {
          productId: null,
          name: raw.displayName,
          modelName: null,
          imageUrl: null,
          hasManual: false,
          manualBlocks: null,
        }
      : null;

  const customer: SerialProfile["customer"] = raw.customer
    ? {
        id: masked ? null : raw.customer.id,
        name: masked ? maskName(raw.customer.name) : raw.customer.name,
        phone: masked ? maskPhone(raw.customer.phone) : raw.customer.phone,
        email: masked ? null : raw.customer.email,
        address: masked ? null : raw.customer.address,
      }
    : null;

  const purchase: SerialProfile["purchase"] = raw.orderItem?.order
    ? {
        orderId: raw.orderItem.order.id,
        orderNo: raw.orderItem.order.orderNo,
        orderedAt: raw.orderItem.order.orderDate.toISOString(),
        channel: raw.orderItem.order.channel?.name ?? null,
        amount: masked ? null : Number(raw.orderItem.totalPrice),
      }
    : null;

  const repairs: SerialProfile["repairs"] = raw.repairTickets.map((t) => ({
    id: t.id,
    ticketNo: t.ticketNo,
    status: t.status,
    receivedAt: t.receivedAt.toISOString(),
    completedAt: (t.pickedUpAt ?? t.readyAt)?.toISOString() ?? null,
    symptom: t.symptom,
    diagnosis: masked ? null : t.diagnosis,
    amount: masked ? null : Number(t.finalAmount),
    warrantyEnds: t.repairWarrantyEnds?.toISOString() ?? null,
    parts: t.parts.map((p) => ({
      name: p.product.name,
      quantity: Number(p.quantity),
      amount: masked ? null : Number(p.totalPrice),
    })),
    labors: t.labors.map((l) => ({
      name: l.name,
      amount: masked ? null : Number(l.totalPrice),
    })),
  }));

  return {
    code: raw.code,
    status: raw.status,
    source: raw.source,
    masked,
    soldAt: raw.soldAt.toISOString(),
    warranty: {
      ends: raw.warrantyEnds?.toISOString() ?? null,
      active: w.active,
      daysLeft: w.daysLeft,
    },
    device,
    customer,
    purchase,
    repairs,
  };
}
