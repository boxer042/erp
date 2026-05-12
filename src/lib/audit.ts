import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * 사용자 활동 로그 기록 헬퍼.
 *
 * 트랜잭션 안에서 호출 권장 — 다른 변경과 원자성 유지.
 * tx 미지정 시 prisma 직접 사용 (트랜잭션 외부 호출 가능).
 *
 * @example
 *   await recordAudit(tx, {
 *     userId: user.id,
 *     entity: "Order",
 *     entityId: order.id,
 *     action: "CONFIRM",
 *     meta: { from: "PENDING", to: "CONFIRMED", totalAmount: 100000 },
 *   });
 */
export async function recordAudit(
  txOrPrisma: Prisma.TransactionClient | typeof prisma,
  data: {
    userId?: string | null;
    entity: string;
    entityId?: string | null;
    action: AuditAction;
    before?: unknown;
    after?: unknown;
    meta?: unknown;
  }
) {
  return txOrPrisma.auditLog.create({
    data: {
      userId: data.userId ?? null,
      entity: data.entity,
      entityId: data.entityId ?? null,
      action: data.action,
      before: data.before == null ? undefined : (data.before as Prisma.InputJsonValue),
      after: data.after == null ? undefined : (data.after as Prisma.InputJsonValue),
      meta: data.meta == null ? undefined : (data.meta as Prisma.InputJsonValue),
    },
  });
}

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "CONFIRM"
  | "UNCONFIRM"
  | "CANCEL"
  | "STATUS_CHANGE"
  | "IMPORT";

export const AUDIT_ENTITIES = [
  "Order",
  "Incoming",
  "PurchaseOrder",
  "Supplier",
  "Customer",
  "Quotation",
  "Statement",
  "Rental",
  "RepairTicket",
  "SupplierReturn",
  "SupplierPayment",
  "CustomerPayment",
] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];
