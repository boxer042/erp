import { z } from "zod";
import { isValidBusinessNumber } from "@/lib/utils";

/**
 * 고객 폼 검증 — 개인/기업 분기.
 * - INDIVIDUAL: 전화 필수, 이름 선택 (손님 이름을 모르는 경우 비워둘 수 있음 — API 가 전화번호로 폴백)
 * - BUSINESS: 상호(name) + 전화 필수, 사업자번호 권장 (강제 X — 무허가 거래 케이스)
 */
export const customerSchema = z
  .object({
    type: z.enum(["INDIVIDUAL", "BUSINESS"]).default("INDIVIDUAL"),
    name: z.string().optional().default(""),
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
    /** 시리얼 기반 보증·수리·구매내역 조회 서비스 이용 동의 (PIPA) */
    serialServiceConsent: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    // 기업은 상호(name) 필수 — 개인은 이름 없이도 등록 가능 (전화번호로 식별)
    if (v.type === "BUSINESS" && !v.name.trim()) {
      ctx.addIssue({
        path: ["name"],
        code: z.ZodIssueCode.custom,
        message: "상호를 입력해주세요",
      });
    }
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
      } else if (!isValidBusinessNumber(digits)) {
        ctx.addIssue({
          path: ["businessNumber"],
          code: z.ZodIssueCode.custom,
          message: "사업자번호 체크섬이 올바르지 않습니다 (입력 오류일 수 있음)",
        });
      }
    }
  });

export type CustomerInput = z.infer<typeof customerSchema>;
