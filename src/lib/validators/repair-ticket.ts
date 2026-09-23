import { z } from "zod";

export const repairTicketCreateSchema = z.object({
  type: z.enum(["ON_SITE", "DROP_OFF"]).default("ON_SITE"),
  // 작업 성격 — 일반 수리(REPAIR, 기본) / 리빌드(CUSTOM_BUILD)
  workKind: z.enum(["REPAIR", "CUSTOM_BUILD"]).default("REPAIR"),
  customerId: z.string().nullable().optional(),
  customerMachineId: z.string().nullable().optional(),
  serialItemId: z.string().nullable().optional(),
  symptom: z.string().nullable().optional(),
  diagnosis: z.string().nullable().optional(),
  diagnosisFee: z.coerce.number().min(0).default(0),
  repairWarrantyMonths: z.coerce.number().int().min(0).nullable().optional(),
  parentRepairTicketId: z.string().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  // 미등록 손님 ticket 의 카트 세션 매핑 (sessions.repairTicketIds 추적 끊김 대비 DB 보존)
  posSessionId: z.string().nullable().optional(),
  // 수리 카테고리 (ProductCategory.id) — null 이면 "기타"
  repairCategoryId: z.string().nullable().optional(),
});

export type RepairTicketCreateInput = z.infer<typeof repairTicketCreateSchema>;

export const repairTicketUpdateSchema = z.object({
  type: z.enum(["ON_SITE", "DROP_OFF"]).optional(),
  workKind: z.enum(["REPAIR", "CUSTOM_BUILD"]).optional(),
  customerId: z.string().nullable().optional(),
  customerMachineId: z.string().nullable().optional(),
  serialItemId: z.string().nullable().optional(),
  repairProductId: z.string().nullable().optional(),
  repairProductText: z.string().nullable().optional(),
  symptom: z.string().nullable().optional(),
  diagnosis: z.string().nullable().optional(),
  /** 수리내용 — 무슨 조치를 했는지 (영수증·손님 안내용) */
  repairContent: z.string().nullable().optional(),
  /**
   * 복수 선택 — 증상/원인/수리내용을 여러 개 기록할 때 사용.
   * 지정 시 조인 테이블을 이 목록으로 replace 하고, 표시용 텍스트는 여기서 파생한다.
   * (단일 필드 symptom/diagnosis/repairContent 는 하위 호환으로 계속 동작)
   */
  symptoms: z.array(z.string().min(1)).optional(),
  diagnoses: z.array(z.string().min(1)).optional(),
  repairContents: z.array(z.string().min(1)).optional(),
  /** 특이사항 — 내부 기록 */
  repairNotes: z.string().nullable().optional(),
  diagnosisFee: z.coerce.number().min(0).optional(),
  totalDiscount: z.string().optional(),
  repairWarrantyMonths: z.coerce.number().int().min(0).nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  repairCategoryId: z.string().nullable().optional(),
  // 접수 일시 — 잘못 입력된 경우 수정 가능. ISO 문자열로 받아 Date 로 변환.
  receivedAt: z
    .string()
    .datetime({ offset: true })
    .or(z.string().datetime())
    .optional(),
});

export type RepairTicketUpdateInput = z.infer<typeof repairTicketUpdateSchema>;

export const repairPartCreateSchema = z
  .object({
    // 카탈로그 부속이면 productId, 미등록 자유부속이면 name(+규격) — 둘 중 하나 필수
    productId: z.string().nullish(),
    name: z.string().nullish(),
    spec: z.string().nullish(),
    /** 자유부속 선판매 마커 — "used"(미등록 중고) / "catalog"(미등록 내상품). productId 없을 때만 의미 */
    presaleKind: z.enum(["used", "catalog"]).nullish(),
    quantity: z.coerce.number().positive(),
    unitPrice: z.coerce.number().min(0),
    discount: z.string().default("0"),
    status: z.enum(["USED", "LOST"]).default("USED"),
  })
  .refine((v) => !!v.productId?.trim() || !!v.name?.trim(), {
    message: "상품을 선택하거나 부속명을 입력해주세요",
    path: ["productId"],
  });

export type RepairPartCreateInput = z.infer<typeof repairPartCreateSchema>;

export const repairPartUpdateSchema = z.object({
  quantity: z.coerce.number().positive().optional(),
  unitPrice: z.coerce.number().min(0).optional(),
  discount: z.string().optional(),
  status: z.enum(["USED", "LOST"]).optional(),
  billLost: z.boolean().optional(),
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
