import { randomBytes } from "crypto";

export function genTicketNo() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const r = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `R${y}${m}${d}-${r}`;
}

export function genApprovalToken() {
  return randomBytes(24).toString("base64url");
}
