export const queryKeys = {
  suppliers: {
    all: ["suppliers"] as const,
    list: (params?: Record<string, unknown>) => ["suppliers", "list", params ?? {}] as const,
    detail: (id: string) => ["suppliers", "detail", id] as const,
  },
  supplierProducts: {
    all: ["supplier-products"] as const,
    list: (params?: Record<string, unknown>) => ["supplier-products", "list", params ?? {}] as const,
    detail: (id: string) => ["supplier-products", "detail", id] as const,
  },
  products: {
    all: ["products"] as const,
    list: (params?: Record<string, unknown>) => ["products", "list", params ?? {}] as const,
    detail: (id: string) => ["products", "detail", id] as const,
    costs: (id: string) => ["products", "costs", id] as const,
    movements: (id: string) => ["products", "movements", id] as const,
  },
  incoming: {
    all: ["incoming"] as const,
    list: (params?: Record<string, unknown>) => ["incoming", "list", params ?? {}] as const,
    detail: (id: string) => ["incoming", "detail", id] as const,
  },
  orders: {
    all: ["orders"] as const,
    list: (params?: Record<string, unknown>) => ["orders", "list", params ?? {}] as const,
    detail: (id: string) => ["orders", "detail", id] as const,
  },
  expenses: {
    all: ["expenses"] as const,
    list: (params?: Record<string, unknown>) => ["expenses", "list", params ?? {}] as const,
  },
  inventory: {
    all: ["inventory"] as const,
    list: (params?: Record<string, unknown>) => ["inventory", "list", params ?? {}] as const,
  },
  channels: {
    all: ["channels"] as const,
    list: () => ["channels", "list"] as const,
  },
  categories: {
    all: ["categories"] as const,
    list: (params?: Record<string, unknown>) => ["categories", "list", params ?? {}] as const,
    detail: (id: string) => ["categories", "detail", id] as const,
  },
} as const;
