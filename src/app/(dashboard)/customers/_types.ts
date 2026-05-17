export type CustomerType = "INDIVIDUAL" | "BUSINESS";

export interface Customer {
  id: string;
  type: CustomerType;
  name: string;
  phone: string;
  businessNumber: string | null;
  ceo: string | null;
  fax: string | null;
  businessType: string | null;
  businessItem: string | null;
  email: string | null;
  address: string | null;
  shippingAddress: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactPosition: string | null;
  memo: string | null;
  serialServiceConsent?: boolean;
  isActive: boolean;
  createdAt?: string;
}

export interface CustomerFormState {
  id?: string;
  type: CustomerType;
  name: string;
  phone: string;
  email: string;
  memo: string;
  businessNumber: string;
  ceo: string;
  fax: string;
  businessType: string;
  businessItem: string;
  address: string;
  shippingAddress: string;
  contactName: string;
  contactPhone: string;
  contactPosition: string;
  serialServiceConsent: boolean;
}

export const emptyCustomerForm = (): CustomerFormState => ({
  type: "INDIVIDUAL",
  name: "",
  phone: "",
  email: "",
  memo: "",
  businessNumber: "",
  ceo: "",
  fax: "",
  businessType: "",
  businessItem: "",
  address: "",
  shippingAddress: "",
  contactName: "",
  contactPhone: "",
  contactPosition: "",
  serialServiceConsent: true,
});

export const customerToForm = (c: Customer): CustomerFormState => ({
  id: c.id,
  type: c.type,
  name: c.name,
  phone: c.phone,
  email: c.email ?? "",
  memo: c.memo ?? "",
  businessNumber: c.businessNumber ?? "",
  ceo: c.ceo ?? "",
  fax: c.fax ?? "",
  businessType: c.businessType ?? "",
  businessItem: c.businessItem ?? "",
  address: c.address ?? "",
  shippingAddress: c.shippingAddress ?? "",
  contactName: c.contactName ?? "",
  contactPhone: c.contactPhone ?? "",
  contactPosition: c.contactPosition ?? "",
  serialServiceConsent: c.serialServiceConsent ?? false,
});
