import { z } from "zod";

export const orderItemSchema = z.object({
  productId: z.string().min(1, "상품을 선택해주세요"),
  quantity: z.string().min(1, "수량을 입력해주세요"),
  unitPrice: z.string().min(1, "단가를 입력해주세요"),
});

export const orderSchema = z.object({
  channelId: z.string().min(1, "채널을 선택해주세요"),
  channelOrderNo: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  shippingAddress: z.string().optional(),
  orderDate: z.string().min(1, "주문일을 입력해주세요"),
  discountAmount: z.string().default("0"),
  shippingFee: z.string().default("0"),
  memo: z.string().optional(),
  items: z.array(orderItemSchema).min(1, "주문 항목을 추가해주세요"),
});

export type OrderInput = z.infer<typeof orderSchema>;
