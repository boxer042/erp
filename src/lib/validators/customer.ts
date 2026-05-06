import { z } from "zod";

/**
 * 고객 폼 검증 — 개인/기업 분기.
 * - INDIVIDUAL: 이름 + 전화 필수, 사업자 fields 무시
 * - BUSINESS: 상호(name) + 전화 + 사업자번호 권장 (강제 X — 무허가 거래 케이스)
 */
export const customerSchema = z
  .object({
    type: z.enum(["INDIVIDUAL", "BUSINESS"]).default("INDIVIDUAL"),
    name: z.string().min(1, "이름/상호를 입력해주세요"),
    phone: z.string().min(1, "연락처를 입력해주세요"),
    email: z.string().email("이메일 형식이 올바르지 않습니다").optional().or(z.literal("")),
    memo: z.string().optional(),
    // 기업 전용
    businessNumber: z.string().optional(),
    ceo: z.string().optional(),
    fax: z.string().optional(),
    businessType: z.string().optional(),
    businessItem: z.string().optional(),
    // 주소
    address: z.string().optional(),
    shippingAddress: z.string().optional(),
    // 기업 담당자
    contactName: z.string().optional(),
    contactPhone: z.string().optional(),
    contactPosition: z.string().optional(),
    /** true 시 phone 중복 체크 우회 — 사용자가 "동명이인 새로 등록" 선택할 때 */
    allowDuplicatePhone: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    // 기업이면 상호(name) 가 사실상 사업자 등록 상호여야 함 — 별도 강제는 안 하지만 안내
    if (v.type === "BUSINESS" && v.businessNumber) {
      // 사업자번호 형식 — 10자리 숫자 또는 000-00-00000
      const digits = v.businessNumber.replace(/[^\d]/g, "");
      if (digits.length !== 10) {
        ctx.addIssue({
          path: ["businessNumber"],
          code: z.ZodIssueCode.custom,
          message: "사업자번호는 10자리 숫자여야 합니다 (000-00-00000)",
        });
      }
    }
  });

export type CustomerInput = z.infer<typeof customerSchema>;
