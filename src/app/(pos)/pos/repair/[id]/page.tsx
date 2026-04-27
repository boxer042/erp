"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, Loader2, Plus, Trash2, Copy, Link as LinkIcon } from "lucide-react";
import { formatComma, parseComma } from "@/lib/utils";

interface ExtraItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

interface LinkedOrder {
  id: string;
  orderNo: string;
  totalAmount: string;
  paymentMethod: string | null;
  status: string;
  createdAt: string;
}

interface Ticket {
  id: string;
  ticketNo: string;
  status: string;
  receivedAt: string;
  symptom: string | null;
  diagnosis: string | null;
  repairNotes: string | null;
  quotedLaborAmount: string;
  quotedPartsAmount: string;
  quotedTotalAmount: string;
  approvalMethod: string | null;
  approvalToken: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  finalAmount: string;
  paymentMethod: string | null;
  customer: { id: string; name: string; phone: string };
  customerMachine: { id: string; name: string; brand: string | null; modelNo: string | null } | null;
  parts: {
    id: string;
    quantity: string;
    unitPrice: string;
    totalPrice: string;
    consumedAt: string | null;
    product: { id: string; name: string; sku: string };
  }[];
  labors: {
    id: string;
    name: string;
    hours: string;
    unitRate: string;
    totalPrice: string;
  }[];
  orders: LinkedOrder[];
}

const STATUS_LABEL: Record<string, string> = {
  RECEIVED: "접수",
  DIAGNOSING: "진단중",
  QUOTED: "견적제시",
  APPROVED: "승인됨",
  REPAIRING: "수리중",
  READY: "픽업대기",
  PICKED_UP: "완료",
  CANCELLED: "취소",
};

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "현금", CARD: "카드", TRANSFER: "계좌이체", UNPAID: "외상",
};

const PICKUP_PAYMENTS = ["CASH", "CARD", "TRANSFER", "UNPAID"] as const;
type PickupPayment = typeof PICKUP_PAYMENTS[number];

export default function RepairDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [diagnosis, setDiagnosis] = useState("");
  const [repairNotes, setRepairNotes] = useState("");

  const [partForm, setPartForm] = useState({ productId: "", name: "", quantity: "1", unitPrice: "0" });
  const [laborForm, setLaborForm] = useState({ name: "", hours: "1", unitRate: "0" });
  const [products, setProducts] = useState<{ id: string; name: string; sku: string; sellingPrice: string; isBulk?: boolean; unitOfMeasure?: string }[]>([]);

  const [extraItems, setExtraItems] = useState<ExtraItem[]>([]);
  const [extraForm, setExtraForm] = useState({ productId: "", quantity: "1", unitPrice: "0" });

  const [pickupDialog, setPickupDialog] = useState(false);
  const [pickupPayment, setPickupPayment] = useState<PickupPayment>("CARD");
  const [doingPickup, setDoingPickup] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/repair-tickets/${id}`);
    if (res.ok) {
      const data = await res.json();
      setTicket(data);
      setDiagnosis(data.diagnosis ?? "");
      setRepairNotes(data.repairNotes ?? "");
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    fetch("/api/products?isBulk=all").then((r) => r.ok ? r.json() : []).then((d) => {
      setProducts(Array.isArray(d) ? d : d.items ?? []);
    });
  }, [load]);

  if (loading || !ticket) {
    return <div className="p-8 text-center text-muted-foreground">로딩 중...</div>;
  }

  const saveDiagnosis = async () => {
    setSaving(true);
    try {
      await fetch(`/api/repair-tickets/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagnosis, repairNotes }),
      });
      toast.success("저장됐습니다");
      load();
    } finally {
      setSaving(false);
    }
  };

  const addPart = async () => {
    if (!partForm.productId) { toast.error("부품을 선택하세요"); return; }
    const res = await fetch(`/api/repair-tickets/${id}/parts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: partForm.productId,
        quantity: parseFloat(partForm.quantity) || 1,
        unitPrice: parseFloat(parseComma(partForm.unitPrice)) || 0,
      }),
    });
    if (res.ok) {
      setPartForm({ productId: "", name: "", quantity: "1", unitPrice: "0" });
      load();
    } else {
      toast.error("부품 추가 실패");
    }
  };

  const removePart = async (pid: string) => {
    const res = await fetch(`/api/repair-tickets/${id}/parts/${pid}`, { method: "DELETE" });
    if (res.ok) load();
    else {
      const data = await res.json();
      toast.error(data?.error ?? "삭제 실패");
    }
  };

  const addLabor = async () => {
    if (!laborForm.name.trim()) { toast.error("공임 항목명 필수"); return; }
    const res = await fetch(`/api/repair-tickets/${id}/labors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: laborForm.name.trim(),
        hours: parseFloat(laborForm.hours) || 1,
        unitRate: parseFloat(parseComma(laborForm.unitRate)) || 0,
      }),
    });
    if (res.ok) {
      setLaborForm({ name: "", hours: "1", unitRate: "0" });
      load();
    } else {
      toast.error("공임 추가 실패");
    }
  };

  const removeLabor = async (lid: string) => {
    await fetch(`/api/repair-tickets/${id}/labors/${lid}`, { method: "DELETE" });
    load();
  };

  const transition = async (action: string, body?: Record<string, unknown>) => {
    const res = await fetch(`/api/repair-tickets/${id}/transition?action=${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data?.error ?? "실패"); return null; }
    load();
    return data;
  };

  const requestApprovalLink = async () => {
    const data = await transition("request-approval");
    if (data?.approvalUrl) {
      await navigator.clipboard.writeText(data.approvalUrl);
      toast.success("승인 링크가 복사되었습니다");
    }
  };

  const addExtraItem = () => {
    const prod = products.find((p) => p.id === extraForm.productId);
    if (!prod) { toast.error("상품을 선택하세요"); return; }
    setExtraItems([...extraItems, {
      productId: extraForm.productId,
      name: prod.name,
      quantity: parseFloat(extraForm.quantity) || 1,
      unitPrice: parseFloat(parseComma(extraForm.unitPrice)) || 0,
    }]);
    setExtraForm({ productId: "", quantity: "1", unitPrice: "0" });
  };

  const doPickup = async () => {
    setDoingPickup(true);
    try {
      if (extraItems.length > 0) {
        const res = await fetch("/api/pos/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "order",
            repairTicketId: ticket.id,
            customerId: ticket.customer.id,
            paymentMethod: pickupPayment,
            items: extraItems.map((i) => ({
              productId: i.productId,
              name: i.name,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              discountPerUnit: 0,
            })),
          }),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d?.error ?? "추가 상품 결제 실패");
        }
      }
      await transition("pickup", { paymentMethod: pickupPayment, finalAmount: total });
      setPickupDialog(false);
      setExtraItems([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "실패");
    } finally {
      setDoingPickup(false);
    }
  };

  const partsAmount = ticket.parts.reduce((s, p) => s + Number(p.totalPrice), 0);
  const laborAmount = ticket.labors.reduce((s, l) => s + Number(l.totalPrice), 0);
  const total = partsAmount + laborAmount;
  const extraTotal = extraItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  const canEdit = !["PICKED_UP", "CANCELLED"].includes(ticket.status);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link href="/pos/repair" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> 수리 목록
      </Link>

      <div className="mb-6 rounded-xl border border-border bg-background p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{ticket.ticketNo}</h1>
              <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                {STATUS_LABEL[ticket.status]}
              </span>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              <Link href={`/pos/customers/${ticket.customer.id}`} className="hover:underline">
                {ticket.customer.name}
              </Link>
              {ticket.customer.phone ? <span className="ml-2">· {ticket.customer.phone}</span> : null}
              {ticket.customerMachine ? <span className="ml-2">· {ticket.customerMachine.name}</span> : null}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              접수 {new Date(ticket.receivedAt).toLocaleString("ko-KR")}
            </div>
          </div>
        </div>

        {ticket.symptom ? (
          <div className="mt-4 rounded-md bg-muted/30 p-3 text-sm">
            <div className="mb-1 text-xs font-medium text-muted-foreground">고객 증상</div>
            {ticket.symptom}
          </div>
        ) : null}
      </div>

      {/* 진단 / 수리 내용 */}
      <Section title="진단 / 수리 내용">
        <textarea
          className="input"
          rows={3}
          placeholder="진단 결과"
          value={diagnosis}
          onChange={(e) => setDiagnosis(e.target.value)}
          disabled={!canEdit}
        />
        <textarea
          className="input mt-2"
          rows={3}
          placeholder="수리 내용 (완료 후 기록)"
          value={repairNotes}
          onChange={(e) => setRepairNotes(e.target.value)}
          disabled={!canEdit}
        />
        {canEdit ? (
          <div className="mt-2 flex justify-end">
            <button
              onClick={saveDiagnosis}
              disabled={saving}
              className="h-9 rounded-md bg-foreground px-4 text-sm text-background disabled:opacity-50"
            >
              저장
            </button>
          </div>
        ) : null}
      </Section>

      {/* 부품 */}
      <Section title={`부품 (₩${partsAmount.toLocaleString("ko-KR")})`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="p-2">부품명</th>
              <th className="p-2 text-right">수량</th>
              <th className="p-2 text-right">단가</th>
              <th className="p-2 text-right">합계</th>
              <th className="p-2">차감</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {ticket.parts.map((p) => (
              <tr key={p.id} className="border-b border-border">
                <td className="p-2">{p.product.name}</td>
                <td className="p-2 text-right">{Number(p.quantity)}</td>
                <td className="p-2 text-right">₩{Number(p.unitPrice).toLocaleString("ko-KR")}</td>
                <td className="p-2 text-right font-medium">₩{Number(p.totalPrice).toLocaleString("ko-KR")}</td>
                <td className="p-2 text-xs">{p.consumedAt ? "✓" : "-"}</td>
                <td className="p-2 text-right">
                  {!p.consumedAt ? (
                    <button className="text-muted-foreground hover:text-destructive" onClick={() => removePart(p.id)}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {canEdit ? (
              <tr>
                <td className="p-2">
                  <select
                    className="input h-9"
                    value={partForm.productId}
                    onChange={(e) => {
                      const prod = products.find((p) => p.id === e.target.value);
                      setPartForm({ ...partForm, productId: e.target.value, name: prod?.name ?? "", unitPrice: prod?.sellingPrice ?? "0" });
                    }}
                  >
                    <option value="">부품 선택...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku}){p.isBulk ? ` · ${p.unitOfMeasure ?? "벌크"}` : ""}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2 text-right">
                  <input
                    className="input h-9 w-20 text-right"
                    inputMode={products.find((p) => p.id === partForm.productId)?.isBulk ? "decimal" : "numeric"}
                    value={partForm.quantity}
                    onChange={(e) => setPartForm({ ...partForm, quantity: e.target.value })}
                  />
                </td>
                <td className="p-2 text-right">
                  <input
                    className="input h-9 w-28 text-right"
                    value={formatComma(partForm.unitPrice)}
                    onChange={(e) => setPartForm({ ...partForm, unitPrice: parseComma(e.target.value) })}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </td>
                <td className="p-2 text-right text-xs text-muted-foreground">
                  ₩{((parseFloat(partForm.quantity) || 0) * (parseFloat(parseComma(partForm.unitPrice)) || 0)).toLocaleString("ko-KR")}
                </td>
                <td colSpan={2}>
                  <button onClick={addPart} className="flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-xs font-semibold text-white">
                    <Plus className="h-3 w-3" /> 추가
                  </button>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Section>

      {/* 공임 */}
      <Section title={`공임 (₩${laborAmount.toLocaleString("ko-KR")})`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="p-2">항목</th>
              <th className="p-2 text-right">시간</th>
              <th className="p-2 text-right">단가</th>
              <th className="p-2 text-right">합계</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {ticket.labors.map((l) => (
              <tr key={l.id} className="border-b border-border">
                <td className="p-2">{l.name}</td>
                <td className="p-2 text-right">{Number(l.hours)}h</td>
                <td className="p-2 text-right">₩{Number(l.unitRate).toLocaleString("ko-KR")}</td>
                <td className="p-2 text-right font-medium">₩{Number(l.totalPrice).toLocaleString("ko-KR")}</td>
                <td className="p-2 text-right">
                  <button className="text-muted-foreground hover:text-destructive" onClick={() => removeLabor(l.id)}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </td>
              </tr>
            ))}
            {canEdit ? (
              <tr>
                <td className="p-2">
                  <input className="input h-9" placeholder="항목명" value={laborForm.name} onChange={(e) => setLaborForm({ ...laborForm, name: e.target.value })} />
                </td>
                <td className="p-2 text-right">
                  <input className="input h-9 w-16 text-right" value={laborForm.hours} onChange={(e) => setLaborForm({ ...laborForm, hours: e.target.value })} />
                </td>
                <td className="p-2 text-right">
                  <input className="input h-9 w-28 text-right" value={formatComma(laborForm.unitRate)} onChange={(e) => setLaborForm({ ...laborForm, unitRate: parseComma(e.target.value) })} onFocus={(e) => e.currentTarget.select()} />
                </td>
                <td className="p-2 text-right text-xs text-muted-foreground">
                  ₩{((parseFloat(laborForm.hours) || 0) * (parseFloat(parseComma(laborForm.unitRate)) || 0)).toLocaleString("ko-KR")}
                </td>
                <td>
                  <button onClick={addLabor} className="flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-xs font-semibold text-white">
                    <Plus className="h-3 w-3" /> 추가
                  </button>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Section>

      {/* 추가 판매 상품 */}
      {canEdit ? (
        <Section title="추가 판매 상품">
          <p className="mb-3 text-xs text-muted-foreground">수령 처리 시 재고에서 차감하고 별도 판매 주문으로 저장됩니다.</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="p-2">상품명</th>
                <th className="p-2 text-right">수량</th>
                <th className="p-2 text-right">단가</th>
                <th className="p-2 text-right">합계</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {extraItems.map((item, idx) => (
                <tr key={idx} className="border-b border-border">
                  <td className="p-2">{item.name}</td>
                  <td className="p-2 text-right">{item.quantity}</td>
                  <td className="p-2 text-right">₩{item.unitPrice.toLocaleString("ko-KR")}</td>
                  <td className="p-2 text-right font-medium">₩{(item.unitPrice * item.quantity).toLocaleString("ko-KR")}</td>
                  <td className="p-2 text-right">
                    <button className="text-muted-foreground hover:text-destructive" onClick={() => setExtraItems(extraItems.filter((_, i) => i !== idx))}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td className="p-2">
                  <select
                    className="input h-9"
                    value={extraForm.productId}
                    onChange={(e) => {
                      const prod = products.find((p) => p.id === e.target.value);
                      setExtraForm({ ...extraForm, productId: e.target.value, unitPrice: prod?.sellingPrice ?? "0" });
                    }}
                  >
                    <option value="">상품 선택...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                    ))}
                  </select>
                </td>
                <td className="p-2 text-right">
                  <input className="input h-9 w-16 text-right" value={extraForm.quantity} onChange={(e) => setExtraForm({ ...extraForm, quantity: e.target.value })} />
                </td>
                <td className="p-2 text-right">
                  <input
                    className="input h-9 w-28 text-right"
                    value={formatComma(extraForm.unitPrice)}
                    onChange={(e) => setExtraForm({ ...extraForm, unitPrice: parseComma(e.target.value) })}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </td>
                <td className="p-2 text-right text-xs text-muted-foreground">
                  ₩{((parseFloat(extraForm.quantity) || 0) * (parseFloat(parseComma(extraForm.unitPrice)) || 0)).toLocaleString("ko-KR")}
                </td>
                <td>
                  <button onClick={addExtraItem} className="flex h-9 items-center gap-1 rounded-md border border-primary px-3 text-xs font-semibold text-primary hover:bg-primary/5">
                    <Plus className="h-3 w-3" /> 담기
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          {extraItems.length > 0 ? (
            <div className="mt-2 flex justify-end text-sm font-medium">
              추가 상품 소계: ₩{extraTotal.toLocaleString("ko-KR")}
            </div>
          ) : null}
        </Section>
      ) : null}

      {/* 완료된 연결 주문 */}
      {ticket.orders.length > 0 ? (
        <Section title="연결된 판매 주문">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="p-2">주문번호</th>
                <th className="p-2">결제수단</th>
                <th className="p-2 text-right">금액</th>
                <th className="p-2">일시</th>
              </tr>
            </thead>
            <tbody>
              {ticket.orders.map((o) => (
                <tr key={o.id} className="border-b border-border">
                  <td className="p-2 font-medium">{o.orderNo}</td>
                  <td className="p-2">{o.paymentMethod ? (PAYMENT_LABEL[o.paymentMethod] ?? o.paymentMethod) : "-"}</td>
                  <td className="p-2 text-right">₩{Number(o.totalAmount).toLocaleString("ko-KR")}</td>
                  <td className="p-2 text-muted-foreground">{new Date(o.createdAt).toLocaleString("ko-KR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ) : null}

      {/* 견적 합계 */}
      <Section title="견적 합계">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between"><span>부품</span><span>₩{partsAmount.toLocaleString("ko-KR")}</span></div>
          <div className="flex justify-between"><span>공임</span><span>₩{laborAmount.toLocaleString("ko-KR")}</span></div>
          <div className="mt-2 border-t border-border pt-2 flex justify-between font-semibold">
            <span>합계</span>
            <span className="text-xl">₩{total.toLocaleString("ko-KR")}</span>
          </div>
          {ticket.approvedAt ? (
            <div className="mt-3 rounded-md bg-primary/10 p-2 text-xs text-primary/80">
              {ticket.approvalMethod === "REMOTE" ? "원격 승인됨" : "현장 승인됨"}
              {ticket.approvedByName ? ` · ${ticket.approvedByName}` : ""}
              {" · "}{new Date(ticket.approvedAt).toLocaleString("ko-KR")}
            </div>
          ) : null}
        </div>
      </Section>

      {/* 상태 전이 버튼 */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-5">
        {["RECEIVED", "DIAGNOSING", "QUOTED"].includes(ticket.status) ? (
          <button onClick={() => transition("quote")} className="h-11 rounded-lg border border-border bg-background px-4 text-sm font-medium hover:bg-muted/50">
            견적 확정
          </button>
        ) : null}

        {ticket.status === "QUOTED" ? (
          <>
            <button
              onClick={() => { const name = prompt("승인자 이름(선택)") ?? ""; transition("approve", { approvedByName: name }); }}
              className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white"
            >
              현장 승인
            </button>
            <button
              onClick={requestApprovalLink}
              className="flex h-11 items-center gap-1 rounded-lg border border-border bg-background px-4 text-sm font-medium hover:bg-muted/50"
            >
              <LinkIcon className="h-4 w-4" /> 원격 승인 링크 생성·복사
            </button>
          </>
        ) : null}

        {ticket.status === "QUOTED" && ticket.approvalToken ? (
          <button
            onClick={async () => {
              const url = `${window.location.origin}/repair/approve/${ticket.approvalToken}`;
              await navigator.clipboard.writeText(url);
              toast.success("링크가 복사되었습니다");
            }}
            className="flex h-11 items-center gap-1 rounded-lg border border-border bg-background px-4 text-sm text-muted-foreground hover:bg-muted/50"
          >
            <Copy className="h-4 w-4" /> 기존 링크 복사
          </button>
        ) : null}

        {ticket.status === "APPROVED" ? (
          <button onClick={() => transition("start")} className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white">
            수리 착수 (부품 차감)
          </button>
        ) : null}

        {ticket.status === "REPAIRING" ? (
          <button onClick={() => transition("ready")} className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white">
            픽업 준비 완료
          </button>
        ) : null}

        {ticket.status === "READY" ? (
          <button onClick={() => setPickupDialog(true)} className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white">
            픽업 완료 + 결제
          </button>
        ) : null}

        {!["PICKED_UP", "CANCELLED"].includes(ticket.status) ? (
          <button
            onClick={() => { if (!confirm("취소하시겠습니까? (차감된 부품 재고는 복원됩니다)")) return; transition("cancel"); }}
            className="h-11 rounded-lg border border-destructive/30 px-4 text-sm text-destructive hover:bg-destructive/5"
          >
            취소
          </button>
        ) : null}
      </div>

      {/* 픽업 결제 다이얼로그 */}
      {pickupDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setPickupDialog(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">픽업 완료 + 결제</h2>

            <div className="mb-4 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">수리비</span><span>₩{total.toLocaleString("ko-KR")}</span></div>
              {extraItems.length > 0 ? (
                <div className="flex justify-between text-primary/80">
                  <span>추가 판매 ({extraItems.length}건)</span>
                  <span>₩{extraTotal.toLocaleString("ko-KR")}</span>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-border pt-2 font-semibold">
                <span>합계</span>
                <span className="text-xl">₩{(total + extraTotal).toLocaleString("ko-KR")}</span>
              </div>
            </div>

            <div className="mb-5">
              <div className="mb-2 text-sm font-medium">결제수단</div>
              <div className="grid grid-cols-2 gap-2">
                {PICKUP_PAYMENTS.map((pm) => (
                  <button
                    key={pm}
                    onClick={() => setPickupPayment(pm)}
                    className={`h-10 rounded-md border text-sm font-medium ${pickupPayment === pm ? "border-primary bg-primary/10 text-primary/80" : "border-border hover:bg-muted/50"}`}
                  >
                    {PAYMENT_LABEL[pm]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setPickupDialog(false)} className="h-10 rounded-md border border-border px-4 text-sm hover:bg-muted/50">
                취소
              </button>
              <button
                onClick={doPickup}
                disabled={doingPickup}
                className="flex h-10 items-center gap-1 rounded-md bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {doingPickup ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                확정
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        :global(.input) {
          display: block;
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid var(--border);
          padding: 0.5rem 0.75rem;
          font-size: 0.9rem;
          outline: none;
          background: var(--background);
          color: var(--foreground);
        }
        :global(.input:focus) {
          border-color: var(--primary);
        }
      `}</style>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 rounded-xl border border-border bg-background p-5">
      <div className="mb-3 text-sm font-semibold">{title}</div>
      {children}
    </div>
  );
}
