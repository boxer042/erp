"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Trash2, ChevronRight, ChevronDown } from "lucide-react";

interface OrderItemComponent {
  id: string;
  label: string;
  componentName: string;
  componentSku: string;
  quantity: number;
}

interface OrderItemRow {
  id: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  productName: string;
  productSku: string;
  isSet: boolean;
  components: OrderItemComponent[];
}

interface OrderRow {
  id: string;
  orderNo: string;
  orderDate: string;
  totalAmount: number;
  status: string;
  itemCount: number;
  paymentMethod: string | null;
  items: OrderItemRow[];
}

interface QuotationRow {
  id: string;
  quotationNo: string;
  issueDate: string;
  totalAmount: number;
  status: string;
}

interface StatementRow {
  id: string;
  statementNo: string;
  issueDate: string;
  totalAmount: number;
}

interface Machine {
  id: string;
  name: string;
  brand: string | null;
  modelNo: string | null;
  serialNo: string | null;
  product: { id: string; name: string; sku: string } | null;
  purchasedFrom: string | null;
}

interface Note {
  id: string;
  content: string;
  createdAt: string;
  createdBy: { name: string };
}

type Tab = "orders" | "quotations" | "statements" | "repair" | "rental" | "machines" | "notes";
const TABS: { id: Tab; label: string }[] = [
  { id: "orders", label: "구매내역" },
  { id: "quotations", label: "견적서" },
  { id: "statements", label: "거래명세표" },
  { id: "repair", label: "수리내역" },
  { id: "rental", label: "임대내역" },
  { id: "machines", label: "보유장비" },
  { id: "notes", label: "방문메모" },
];

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  MIXED: "복합",
  UNPAID: "외상",
};

export function CustomerDetailTabs({
  customerId,
  orders,
  quotations,
  statements,
}: {
  customerId: string;
  orders: OrderRow[];
  quotations: QuotationRow[];
  statements: StatementRow[];
}) {
  const [tab, setTab] = useState<Tab>("orders");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [repairTickets, setRepairTickets] = useState<{ id: string; ticketNo: string; status: string; receivedAt: string; finalAmount: number }[]>([]);
  const [rentals, setRentals] = useState<{ id: string; rentalNo: string; status: string; startDate: string; endDate: string; finalAmount: number }[]>([]);

  useEffect(() => {
    fetch(`/api/customer-machines?customerId=${customerId}`).then((r) => r.ok ? r.json() : []).then(setMachines);
    fetch(`/api/customer-notes?customerId=${customerId}`).then((r) => r.ok ? r.json() : []).then(setNotes);
    fetch(`/api/repair-tickets?customerId=${customerId}`).then((r) => r.ok ? r.json() : []).then((d) => setRepairTickets(Array.isArray(d) ? d : []));
    fetch(`/api/rentals?customerId=${customerId}`).then((r) => r.ok ? r.json() : []).then((d) => setRentals(Array.isArray(d) ? d : []));
  }, [customerId]);

  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition ${
              tab === t.id
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {tab === t.id ? (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />
            ) : null}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-background p-4">
        {tab === "orders" && <OrdersPanel orders={orders} />}
        {tab === "quotations" && <QuotationsPanel rows={quotations} />}
        {tab === "statements" && <StatementsPanel rows={statements} />}
        {tab === "repair" && <RepairPanel rows={repairTickets} />}
        {tab === "rental" && <RentalPanel rows={rentals} />}
        {tab === "machines" && (
          <MachinesPanel
            customerId={customerId}
            machines={machines}
            onChange={setMachines}
          />
        )}
        {tab === "notes" && (
          <NotesPanel customerId={customerId} notes={notes} onChange={setNotes} />
        )}
      </div>
    </div>
  );
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: "대기",
  CONFIRMED: "확정",
  PREPARING: "준비중",
  SHIPPED: "배송중",
  DELIVERED: "배송완료",
  CANCELLED: "취소",
  RETURNED: "반품",
};

function OrdersPanel({ orders }: { orders: OrderRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (orders.length === 0) return <Empty text="구매내역이 없습니다" />;

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted-foreground">
          <th className="p-2 w-6"></th>
          <th className="p-2">주문번호</th>
          <th className="p-2">일자</th>
          <th className="p-2">품목수</th>
          <th className="p-2">결제</th>
          <th className="p-2">상태</th>
          <th className="p-2 text-right">합계</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => {
          const isOpen = expanded.has(o.id);
          return (
            <React.Fragment key={o.id}>
              <tr
                className="border-b border-neutral-100 hover:bg-muted/30 cursor-pointer"
                onClick={() => toggle(o.id)}
              >
                <td className="p-2 text-muted-foreground">
                  {isOpen
                    ? <ChevronDown className="h-3.5 w-3.5" />
                    : <ChevronRight className="h-3.5 w-3.5" />}
                </td>
                <td className="p-2 font-medium">{o.orderNo}</td>
                <td className="p-2 text-muted-foreground">{new Date(o.orderDate).toLocaleDateString("ko-KR")}</td>
                <td className="p-2">{o.itemCount}개</td>
                <td className="p-2">{o.paymentMethod ? PAYMENT_LABEL[o.paymentMethod] ?? o.paymentMethod : "-"}</td>
                <td className="p-2">{ORDER_STATUS_LABEL[o.status] ?? o.status}</td>
                <td className="p-2 text-right">₩{o.totalAmount.toLocaleString("ko-KR")}</td>
              </tr>
              {isOpen && o.items.map((item) => (
                <React.Fragment key={item.id}>
                  <tr className="bg-muted/20 border-b border-neutral-50">
                    <td className="p-2" />
                    <td className="p-2 pl-5" colSpan={4}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.productName}</span>
                        <span className="text-xs text-muted-foreground">{item.productSku}</span>
                        {item.isSet && (
                          <span className="text-[10px] rounded bg-secondary px-1 py-0.5 text-muted-foreground">조립</span>
                        )}
                      </div>
                    </td>
                    <td className="p-2 text-muted-foreground">× {item.quantity}</td>
                    <td className="p-2 text-right text-muted-foreground">₩{item.totalPrice.toLocaleString("ko-KR")}</td>
                  </tr>
                  {item.isSet && item.components.map((comp) => (
                    <tr key={comp.id} className="bg-muted/10 border-b border-neutral-50 text-xs text-muted-foreground">
                      <td className="p-1.5" />
                      <td className="p-1.5 pl-10" colSpan={4}>
                        <span className="mr-1 text-muted-foreground/50">└</span>
                        <span>{comp.label !== comp.componentName ? `${comp.label}: ` : ""}{comp.componentName}</span>
                        <span className="ml-1.5 text-muted-foreground/60">{comp.componentSku}</span>
                      </td>
                      <td className="p-1.5 text-muted-foreground">× {comp.quantity}</td>
                      <td className="p-1.5" />
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function QuotationsPanel({ rows }: { rows: QuotationRow[] }) {
  if (rows.length === 0) return <Empty text="견적서가 없습니다" />;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted-foreground">
          <th className="p-2">견적번호</th>
          <th className="p-2">일자</th>
          <th className="p-2">상태</th>
          <th className="p-2 text-right">합계</th>
          <th className="p-2"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-neutral-100">
            <td className="p-2 font-medium">{r.quotationNo}</td>
            <td className="p-2 text-muted-foreground">{new Date(r.issueDate).toLocaleDateString("ko-KR")}</td>
            <td className="p-2">{r.status}</td>
            <td className="p-2 text-right">₩{r.totalAmount.toLocaleString("ko-KR")}</td>
            <td className="p-2 text-right">
              <Link href={`/quotations/${r.id}/print`} target="_blank" className="text-primary/80 hover:underline">
                출력
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StatementsPanel({ rows }: { rows: StatementRow[] }) {
  if (rows.length === 0) return <Empty text="거래명세표가 없습니다" />;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted-foreground">
          <th className="p-2">명세번호</th>
          <th className="p-2">일자</th>
          <th className="p-2 text-right">합계</th>
          <th className="p-2"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-neutral-100">
            <td className="p-2 font-medium">{r.statementNo}</td>
            <td className="p-2 text-muted-foreground">{new Date(r.issueDate).toLocaleDateString("ko-KR")}</td>
            <td className="p-2 text-right">₩{r.totalAmount.toLocaleString("ko-KR")}</td>
            <td className="p-2 text-right">
              <Link href={`/statements/${r.id}/print`} target="_blank" className="text-primary/80 hover:underline">
                출력
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RepairPanel({ rows }: { rows: { id: string; ticketNo: string; status: string; receivedAt: string; finalAmount: number }[] }) {
  if (rows.length === 0) return <Empty text="수리내역이 없습니다" />;
  return (
    <ul className="divide-y divide-neutral-100">
      {rows.map((r) => (
        <li key={r.id} className="py-2">
          <Link href={`/pos/repair/${r.id}`} className="flex justify-between hover:underline">
            <span className="font-medium">{r.ticketNo}</span>
            <span className="text-sm text-muted-foreground">{r.status} · {new Date(r.receivedAt).toLocaleDateString("ko-KR")}</span>
            <span className="text-sm">₩{Number(r.finalAmount).toLocaleString("ko-KR")}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function RentalPanel({ rows }: { rows: { id: string; rentalNo: string; status: string; startDate: string; endDate: string; finalAmount: number }[] }) {
  if (rows.length === 0) return <Empty text="임대내역이 없습니다" />;
  return (
    <ul className="divide-y divide-neutral-100">
      {rows.map((r) => (
        <li key={r.id} className="py-2">
          <Link href={`/pos/rental/${r.id}`} className="flex justify-between hover:underline">
            <span className="font-medium">{r.rentalNo}</span>
            <span className="text-sm text-muted-foreground">
              {r.status} · {new Date(r.startDate).toLocaleDateString("ko-KR")}~{new Date(r.endDate).toLocaleDateString("ko-KR")}
            </span>
            <span className="text-sm">₩{Number(r.finalAmount).toLocaleString("ko-KR")}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function MachinesPanel({
  customerId,
  machines,
  onChange,
}: {
  customerId: string;
  machines: Machine[];
  onChange: (m: Machine[]) => void;
}) {
  const [form, setForm] = useState({ name: "", brand: "", modelNo: "", serialNo: "", purchasedFrom: "" });
  const [submitting, setSubmitting] = useState(false);

  const add = async () => {
    if (!form.name.trim()) {
      toast.error("기계명 필수");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/customer-machines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, ...form }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      onChange([created, ...machines]);
      setForm({ name: "", brand: "", modelNo: "", serialNo: "", purchasedFrom: "" });
      toast.success("등록되었습니다");
    } catch {
      toast.error("등록 실패");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await fetch(`/api/customer-machines/${id}`, { method: "DELETE" });
    onChange(machines.filter((m) => m.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-2">
        <input className="h-10 rounded-md border border-border px-2 text-sm" placeholder="기계명*" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="h-10 rounded-md border border-border px-2 text-sm" placeholder="브랜드" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
        <input className="h-10 rounded-md border border-border px-2 text-sm" placeholder="모델번호" value={form.modelNo} onChange={(e) => setForm({ ...form, modelNo: e.target.value })} />
        <input className="h-10 rounded-md border border-border px-2 text-sm" placeholder="시리얼" value={form.serialNo} onChange={(e) => setForm({ ...form, serialNo: e.target.value })} />
        <button
          onClick={add}
          disabled={submitting}
          className="flex h-10 items-center justify-center gap-1 rounded-md bg-primary text-sm font-semibold text-white disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> 추가
        </button>
      </div>

      {machines.length === 0 ? (
        <Empty text="등록된 장비가 없습니다" />
      ) : (
        <ul className="divide-y divide-neutral-100">
          {machines.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <span className="font-medium">{m.name}</span>
                {m.brand ? <span className="ml-2 text-muted-foreground">{m.brand}</span> : null}
                {m.modelNo ? <span className="ml-2 text-muted-foreground">· {m.modelNo}</span> : null}
                {m.serialNo ? <span className="ml-2 text-muted-foreground">· S/N {m.serialNo}</span> : null}
              </div>
              <button className="text-muted-foreground hover:text-red-500" onClick={() => remove(m.id)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotesPanel({
  customerId,
  notes,
  onChange,
}: {
  customerId: string;
  notes: Note[];
  onChange: (n: Note[]) => void;
}) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const add = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/customer-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, content }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      onChange([created, ...notes]);
      setContent("");
    } catch {
      toast.error("저장 실패");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await fetch(`/api/customer-notes/${id}`, { method: "DELETE" });
    onChange(notes.filter((n) => n.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <textarea
          rows={2}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="방문·상담 메모 추가"
          className="flex-1 rounded-md border border-border p-2 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={add}
          disabled={submitting || !content.trim()}
          className="self-start rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          추가
        </button>
      </div>
      {notes.length === 0 ? (
        <Empty text="메모가 없습니다" />
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="rounded-md border border-border p-3 text-sm">
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>{n.createdBy?.name ?? ""} · {new Date(n.createdAt).toLocaleString("ko-KR")}</span>
                <button onClick={() => remove(n.id)} className="hover:text-red-500">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <div className="whitespace-pre-wrap">{n.content}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{text}</div>;
}
