// 라우트 전용 타입은 공용 모듈에서 재내보내기
export type {
  ProductDetail,
  ProductMappingItem,
  SetComponentItem,
  ChannelPricingItem,
  SellingCostItem,
  VariantItem,
  InventoryLotItem,
  InventoryMovementItem,
  ProductMediaItem,
} from "@/components/product/types";

// 상세 페이지에서만 쓰이는 fetch shape
export interface Movement {
  id: string;
  type: string;
  quantity: string;
  balanceAfter: string;
  reason: string | null;
  referenceType: string | null;
  memo: string | null;
  createdAt: string;
}
