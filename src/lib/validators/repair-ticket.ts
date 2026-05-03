import { z } from "zod";

export const repairTicketCreateSchema = z.object({
  type: z.enum(["ON_SITE", "DROP_OFF"]).default("ON_SITE"),
  customerId: z.string().nullable().optional(),
  customerMachineId: z.string().nullable().optional(),
  serialItemId: z.string().nullable().optional(),
  symptom: z.string().nullable().optional(),
  diagnosis: z.string().nullable().optional(),
  diagnosisFee: z.coerce.number().min(0).default(0),
  repairWarrantyMonths: z.coerce.number().int().min(0).nullable().optional(),
  parentRepairTicketId: z.string().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  memo: z.string().nullable().optional(),
});

export type RepairTicketCreateInput = z.infer<typeof repairTicketCreateSchema>;

export const repairTicketUpdateSchema = z.object({
  type: z.enum(["ON_SITE", "DROP_OFF"]).optional(),
  customerId: z.string().nullable().optional(),
  customerMachineId: z.string().nullable().optional(),
  serialItemId: z.string().nullable().optional(),
  repairProductId: z.string().nullable().optional(),
  repairProductText: z.string().nullable().optional(),
  symptom: z.string().nullable().optional(),
  diagnosis: z.string().nullable().optional(),
  repairNotes: z.string().nullable().optional(),
  diagnosisFee: z.coerce.number().min(0).optional(),
  totalDiscount: z.string().optional(),
  repairWarrantyMonths: z.coerce.number().int().min(0).nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  memo: z.string().nullable().optional(),
});

export type RepairTicketUpdateInput = z.infer<typeof repairTicketUpdateSchema>;

export const repairPartCreateSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
  discount: z.string().default("0"),
  status: z.enum(["USED", "LOST"]).default("USED"),
});

export type RepairPartCreateInput = z.infer<typeof repairPartCreateSchema>;

export const repairPartUpdateSchema = z.object({
  quantity: z.coerce.number().positive().optional(),
  unitPrice: z.coerce.number().min(0).optional(),
  discount: z.string().optional(),
  status: z.enum(["USED", "LOST"]).optional(),
});

export type RepairPartUpdateInput = z.infer<typeof repairPartUpdateSchema>;

export const repairLaborSchema = z.object({
  name: z.string().min(1, "공임명을 입력해주세요"),
  hours: z.coerce.number().positive().default(1),
  unitRate: z.coerce.number().min(0),
});

export type RepairLaborInput = z.infer<typeof repairLaborSchema>;

export const repairStatusTransitionSchema = z.object({
  to: z.enum([
    "RECEIVED",
    "DIAGNOSING",
    "QUOTED",
    "APPROVED",
    "REPAIRING",
    "READY",
    "PICKED_UP",
    "CANCELLED",
  ]),
  // QUOTED 단계에서 보내는 견적 금액
  quotedLaborAmount: z.coerce.number().min(0).optional(),
  quotedPartsAmount: z.coerce.number().min(0).optional(),
  // CANCELLED 시 사유
  reason: z.string().nullable().optional(),
});

export type RepairStatusTransitionInput = z.infer<typeof repairStatusTransitionSchema>;
