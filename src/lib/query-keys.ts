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
    landing: (id: string) => ["products", "landing", id] as const,
    manual: (id: string) => ["products", "manual", id] as const,
    priceHistory: (id: string) => ["products", "price-history", id] as const,
    salesStats: (id: string) => ["products", "sales-stats", id] as const,
    costCause: (id: string) => ["products", "cost-cause", id] as const,
  },
  incoming: {
    all: ["incoming"] as const,
    list: (params?: Record<string, unknown>) => ["incoming", "list", params ?? {}] as const,
    detail: (id: string) => ["incoming", "detail", id] as const,
  },
  purchaseOrders: {
    all: ["purchase-orders"] as const,
    list: (params?: Record<string, unknown>) => ["purchase-orders", "list", params ?? {}] as const,
    detail: (id: string) => ["purchase-orders", "detail", id] as const,
  },
  orders: {
    all: ["orders"] as const,
    list: (params?: Record<string, unknown>) => ["orders", "list", params ?? {}] as const,
    board: (params?: Record<string, unknown>) => ["orders", "board", params ?? {}] as const,
    detail: (id: string) => ["orders", "detail", id] as const,
  },
  sales: {
    all: ["sales"] as const,
    history: (params?: Record<string, unknown>) =>
      ["sales", "history", params ?? {}] as const,
  },
  expenses: {
    all: ["expenses"] as const,
    list: (params?: Record<string, unknown>) => ["expenses", "list", params ?? {}] as const,
  },
  inventory: {
    all: ["inventory"] as const,
    list: (params?: Record<string, unknown>) => ["inventory", "list", params ?? {}] as const,
    initial: {
      all: ["inventory", "initial"] as const,
      history: (params?: Record<string, unknown>) =>
        ["inventory", "initial", "history", params ?? {}] as const,
    },
  },
  channels: {
    all: ["channels"] as const,
    list: () => ["channels", "list"] as const,
    mappings: (channelId: string) => ["channels", "mappings", channelId] as const,
    pending: (params?: Record<string, unknown>) => ["channels", "pending", params ?? {}] as const,
  },
  categories: {
    all: ["categories"] as const,
    list: (params?: Record<string, unknown>) => ["categories", "list", params ?? {}] as const,
    detail: (id: string) => ["categories", "detail", id] as const,
  },
  assemblySlotLabels: {
    all: ["assembly-slot-labels"] as const,
    list: (params?: Record<string, unknown>) => ["assembly-slot-labels", "list", params ?? {}] as const,
  },
  companyInfo: {
    all: ["company-info"] as const,
  },
  landingSettings: {
    all: ["landing-settings"] as const,
  },
  cardFeeRate: {
    all: ["card-fee-rate"] as const,
  },
  cardCompanyFees: {
    all: ["card-company-fees"] as const,
  },
  serviceFeePresets: {
    all: ["service-fee-presets"] as const,
  },
  customers: {
    all: ["customers"] as const,
    list: (params?: Record<string, unknown>) => ["customers", "list", params ?? {}] as const,
    detail: (id: string) => ["customers", "detail", id] as const,
  },
  brands: {
    all: ["brands"] as const,
    list: (params?: Record<string, unknown>) => ["brands", "list", params ?? {}] as const,
  },
  statements: {
    all: ["statements"] as const,
    list: (params?: Record<string, unknown>) => ["statements", "list", params ?? {}] as const,
    detail: (id: string) => ["statements", "detail", id] as const,
  },
  quotations: {
    all: ["quotations"] as const,
    list: (params?: Record<string, unknown>) => ["quotations", "list", params ?? {}] as const,
    detail: (id: string) => ["quotations", "detail", id] as const,
  },
  rentalAssets: {
    all: ["rental-assets"] as const,
    list: (params?: Record<string, unknown>) => ["rental-assets", "list", params ?? {}] as const,
    manual: (id: string) => ["rental-assets", "manual", id] as const,
    detail: (id: string) => ["rental-assets", "detail", id] as const,
  },
  usedItems: {
    all: ["used-items"] as const,
    list: (params?: Record<string, unknown>) => ["used-items", "list", params ?? {}] as const,
    detail: (id: string) => ["used-items", "detail", id] as const,
  },
  presale: {
    all: ["presale"] as const,
    list: (params?: Record<string, unknown>) => ["presale", "list", params ?? {}] as const,
  },
  rentals: {
    all: ["rentals"] as const,
    list: (params?: Record<string, unknown>) => ["rentals", "list", params ?? {}] as const,
    detail: (id: string) => ["rentals", "detail", id] as const,
  },
  repairServices: {
    all: ["repair-services"] as const,
    presets: (params?: Record<string, unknown>) => ["repair-services", "presets", params ?? {}] as const,
    packages: (params?: Record<string, unknown>) => ["repair-services", "packages", params ?? {}] as const,
  },
  repairTickets: {
    all: ["repair-tickets"] as const,
    list: (params?: Record<string, unknown>) => ["repair-tickets", "list", params ?? {}] as const,
    detail: (id: string) => ["repair-tickets", "detail", id] as const,
  },
  lots: {
    all: ["lots"] as const,
    list: (params?: Record<string, unknown>) => ["lots", "list", params ?? {}] as const,
  },
  stocktake: {
    all: ["stocktake"] as const,
    list: (params?: Record<string, unknown>) => ["stocktake", "list", params ?? {}] as const,
  },
  returns: {
    all: ["returns"] as const,
    list: (params?: Record<string, unknown>) => ["returns", "list", params ?? {}] as const,
    detail: (id: string) => ["returns", "detail", id] as const,
  },
  assembly: {
    all: ["assembly"] as const,
    list: (params?: Record<string, unknown>) => ["assembly", "list", params ?? {}] as const,
    templates: (params?: Record<string, unknown>) => ["assembly", "templates", params ?? {}] as const,
    detail: (id: string) => ["assembly", "detail", id] as const,
  },
  reports: {
    all: ["reports"] as const,
    margin: (params?: Record<string, unknown>) => ["reports", "margin", params ?? {}] as const,
    optionFunnel: (params?: Record<string, unknown>) =>
      ["reports", "option-funnel", params ?? {}] as const,
    incomeStatement: (params?: Record<string, unknown>) =>
      ["reports", "income-statement", params ?? {}] as const,
    incomeStatementDeductions: (params?: Record<string, unknown>) =>
      ["reports", "income-statement", "deductions", params ?? {}] as const,
    incomeStatementMonthly: (params?: Record<string, unknown>) =>
      ["reports", "income-statement", "monthly", params ?? {}] as const,
    balanceSheet: (params?: Record<string, unknown>) =>
      ["reports", "balance-sheet", params ?? {}] as const,
    vatFiling: (params?: Record<string, unknown>) =>
      ["reports", "vat-filing", params ?? {}] as const,
  },
  manualBalance: {
    all: ["manual-balance"] as const,
  },
  ledger: {
    suppliers: (params?: Record<string, unknown>) => ["ledger", "suppliers", params ?? {}] as const,
    customers: (params?: Record<string, unknown>) => ["ledger", "customers", params ?? {}] as const,
  },
  auditLogs: {
    all: ["audit-logs"] as const,
    list: (params?: Record<string, unknown>) => ["audit-logs", "list", params ?? {}] as const,
  },
  serialItems: {
    all: ["serial-items"] as const,
    list: (params?: Record<string, unknown>) => ["serial-items", "list", params ?? {}] as const,
    detail: (code: string) => ["serial-items", "detail", code] as const,
  },
  notes: {
    all: ["notes"] as const,
    list: (params?: Record<string, unknown>) => ["notes", "list", params ?? {}] as const,
    detail: (id: string) => ["notes", "detail", id] as const,
  },
} as const;
