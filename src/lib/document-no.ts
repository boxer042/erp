export const DOC_PREFIX = {
  ORDER: "ORD",
  INCOMING: "IN",
  QUOTATION: "QUO",
  STATEMENT: "STM",
} as const;

export function generateDocumentNo(prefix: string, date: Date = new Date()): string {
  const y = date.getFullYear().toString().slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const r = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${y}${m}${d}-${r}`;
}

export const generateQuotationNo = (date?: Date) => generateDocumentNo(DOC_PREFIX.QUOTATION, date);
export const generateStatementNo = (date?: Date) => generateDocumentNo(DOC_PREFIX.STATEMENT, date);
