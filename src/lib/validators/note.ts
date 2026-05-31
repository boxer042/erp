import { z } from "zod";

export const NOTE_KINDS = ["TODO", "MEMO"] as const;
export const NOTE_PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const;
export const NOTE_SOURCE_TYPES = [
  "ORDER",
  "INCOMING",
  "PURCHASE_ORDER",
  "REPAIR",
  "CUSTOMER",
  "SUPPLIER",
  "PAYMENT",
  "GENERAL",
] as const;

// ISO 문자열 → Date 자동 변환. 값이 없으면 클라이언트는 null 을 보낸다(빈 문자열 금지).
const dateField = z.coerce.date().nullable().optional();

export const noteCreateSchema = z.object({
  kind: z.enum(NOTE_KINDS).default("MEMO"),
  content: z.string().trim().min(1, "내용을 입력해주세요"),
  title: z.string().trim().nullable().optional(),
  done: z.boolean().default(false),
  dueDate: dateField,
  priority: z.enum(NOTE_PRIORITIES).default("NORMAL"),
  notify: z.boolean().default(false),
  notifyAt: dateField,
  sourceType: z.enum(NOTE_SOURCE_TYPES).nullable().optional(),
  sourceId: z.string().nullable().optional(),
  sourceLabel: z.string().nullable().optional(),
  pinned: z.boolean().default(false),
});

export const noteUpdateSchema = z.object({
  kind: z.enum(NOTE_KINDS).optional(),
  content: z.string().trim().min(1, "내용을 입력해주세요").optional(),
  title: z.string().trim().nullable().optional(),
  done: z.boolean().optional(),
  dueDate: dateField,
  priority: z.enum(NOTE_PRIORITIES).optional(),
  notify: z.boolean().optional(),
  notifyAt: dateField,
  sourceType: z.enum(NOTE_SOURCE_TYPES).nullable().optional(),
  sourceId: z.string().nullable().optional(),
  sourceLabel: z.string().nullable().optional(),
  pinned: z.boolean().optional(),
});

export type NoteCreateInput = z.infer<typeof noteCreateSchema>;
export type NoteUpdateInput = z.infer<typeof noteUpdateSchema>;
