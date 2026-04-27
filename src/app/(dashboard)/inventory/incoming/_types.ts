export interface Supplier {
  id: string;
  name: string;
  businessNumber?: string | null;
  representative?: string | null;
  phone?: string | null;
}

export interface SupplierProduct {
  id: string;
  name: string;
  spec: string | null;
  supplierCode: string | null;
  unitPrice: string;
  unitOfMeasure: string;
}

export interface Incoming {
  id: string;
  incomingNo: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  incomingDate: string;
  totalAmount: string;
  memo: string | null;
  supplier: { name: string };
  createdBy: { name: string };
  _count: { items: number };
  items: Array<{
    id: string;
    supplierProduct: {
      id: string;
      name: string;
      _count: { productMappings: number };
    };
  }>;
}

export interface IncomingDetail {
  id: string;
  incomingNo: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  incomingDate: string;
  totalAmount: string;
  taxAmount: string;
  shippingCost: string;
  shippingIsTaxable: boolean;
  shippingDeducted: boolean;
  memo: string | null;
  supplier: { id: string; name: string; paymentMethod: string };
  createdBy: { name: string };
  items: Array<{
    id: string;
    quantity: string;
    unitPrice: string;
    originalPrice: string | null;
    discountAmount: string | null;
    totalPrice: string;
    memo: string | null;
    supplierProduct: {
      id: string; name: string; supplierCode: string | null; spec: string | null; unitOfMeasure: string; unitPrice: string;
      productMappings?: Array<{ id: string; product: { id: string; name: string; sku: string } }>;
    };
  }>;
}

export interface IncomingItemForm {
  supplierProductId: string;
  supplierProductName: string;
  supplierCode: string;
  spec: string;
  unitOfMeasure: string;
  quantity: string;
  unitPrice: string;
  supplyAmount: string;
  discount: string;
  originalPrice: string;
  memo: string;
  isNew?: boolean;
}
