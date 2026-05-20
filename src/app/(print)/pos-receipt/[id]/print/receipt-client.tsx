"use client";

import { useEffect } from "react";
import { formatBusinessNumber, formatPhone } from "@/lib/utils";

interface Line {
  name: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface Data {
  orderNo: string;
  orderDate: string;
  company: {
    name: string;
    phone: string | null;
    businessNumber: string | null;
    address: string | null;
    ceo: string | null;
  };
  customer: { name: string; phone: string } | null;
  channel: string;
  fulfillmentType: "IN_STORE" | "PICKUP" | "DELIVERY" | "QUICK" | "SHIPPING";
  shippingAddress: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  expectedShipDate: string | null;
  lines: Line[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  paymentMethod: string | null;
  memo: string | null;
}

const PAYMENT_LABEL: Record<string, string> = {
  CARD: "카드",
  CASH: "현금",
  TRANSFER: "계좌이체",
  UNPAID: "외상 (미수금)",
  MIXED: "복합",
};

const FULFILLMENT_LABEL: Record<string, string> = {
  PICKUP: "매장 수령",
  DELIVERY: "배달",
  SHIPPING: "택배",
};

/**
 * POS 영수증 — 80mm 영수증 프린터 친화. 좁은 폭, 모노 스페이스.
 * @page size 80mm × auto.
 */
export function ReceiptClient({ data, auto }: { data: Data; auto: boolean }) {
  useEffect(() => {
    if (auto) {
      const t = setTimeout(() => window.print(), 200);
      return () => clearTimeout(t);
    }
  }, [auto]);

  const fmt = (n: number) => `₩${n.toLocaleString("ko-KR")}`;

  return (
    <>
      <style>{`
        @page { size: 80mm auto; margin: 0; }
        @media print {
          html, body { background: #fff; margin: 0; padding: 0; }
          .receipt-toolbar { display: none !important; }
        }
        .receipt {
          width: 76mm;
          padding: 2mm;
          margin: 0 auto;
          font-family: ui-monospace, "SF Mono", monospace;
          color: #000;
          background: #fff;
          font-size: 9pt;
          line-height: 1.35;
        }
        .receipt h1 {
          font-size: 12pt;
          font-weight: 800;
          text-align: center;
          margin: 0 0 1mm;
          letter-spacing: -0.02em;
        }
        .receipt .meta { text-align: center; font-size: 8pt; }
        .receipt hr {
          border: 0;
          border-top: 1px dashed #000;
          margin: 1.5mm 0;
        }
        .row { display: flex; justify-content: space-between; gap: 2mm; }
        .row .label { color: #333; }
        .row .val { font-weight: 600; }
        .line {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 1mm;
          padding: 0.5mm 0;
        }
        .line-name { font-weight: 600; }
        .line-detail {
          font-size: 8pt;
          color: #555;
          font-variant-numeric: tabular-nums;
        }
        .total-row {
          display: flex;
          justify-content: space-between;
          font-size: 11pt;
          font-weight: 800;
          padding: 1mm 0;
        }
      `}</style>

      {/* 화면용 툴바 */}
      <div
        className="receipt-toolbar"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          gap: 8,
          padding: "12px 16px",
          background: "#f5f5f5",
          borderBottom: "1px solid #ddd",
        }}
      >
        <button
          type="button"
          onClick={() => window.print()}
          style={{
            padding: "6px 14px",
            fontSize: 13,
            background: "#000",
            color: "#fff",
            border: 0,
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          인쇄
        </button>
        <span style={{ fontSize: 13, color: "#666", alignSelf: "center" }}>
          80mm 영수증
        </span>
      </div>

      <div style={{ padding: "16px 0", background: "#f5f5f5" }}>
        <div className="receipt" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }}>
          <h1>{data.company.name}</h1>
          <div className="meta">
            {data.company.businessNumber && <div>사업자 {formatBusinessNumber(data.company.businessNumber)}</div>}
            {data.company.ceo && <div>대표 {data.company.ceo}</div>}
            {data.company.phone && <div>{formatPhone(data.company.phone)}</div>}
            {data.company.address && <div>{data.company.address}</div>}
          </div>

          <hr />

          <div className="row">
            <span className="label">주문번호</span>
            <span className="val">{data.orderNo}</span>
          </div>
          <div className="row">
            <span className="label">결제일시</span>
            <span className="val">{data.orderDate}</span>
          </div>
          {data.customer && (
            <div className="row">
              <span className="label">고객</span>
              <span className="val">
                {data.customer.name} {formatPhone(data.customer.phone)}
              </span>
            </div>
          )}
          {data.paymentMethod && (
            <div className="row">
              <span className="label">결제수단</span>
              <span className="val">
                {PAYMENT_LABEL[data.paymentMethod] ?? data.paymentMethod}
              </span>
            </div>
          )}
          <div className="row">
            <span className="label">출고</span>
            <span className="val">
              {FULFILLMENT_LABEL[data.fulfillmentType] ?? data.fulfillmentType}
            </span>
          </div>

          {/* 배달/택배 — 받는사람·연락처·주소·출고예정일 (매장 인도 IN_STORE/PICKUP 은 제외) */}
          {data.fulfillmentType !== "IN_STORE" && data.fulfillmentType !== "PICKUP" && (
            <>
              {data.expectedShipDate && (
                <div className="row">
                  <span className="label">출고예정</span>
                  <span className="val">{data.expectedShipDate}</span>
                </div>
              )}
              {(data.recipientName || data.recipientPhone) && (
                <div className="row">
                  <span className="label">받는분</span>
                  <span className="val">
                    {[
                      data.recipientName,
                      data.recipientPhone ? formatPhone(data.recipientPhone) : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  </span>
                </div>
              )}
              {data.shippingAddress && (
                <div style={{ marginTop: "1mm", fontSize: "8pt" }}>
                  <div style={{ color: "#333" }}>배송지</div>
                  <div style={{ fontWeight: 600 }}>{data.shippingAddress}</div>
                </div>
              )}
            </>
          )}

          <hr />

          {data.lines.map((l, i) => {
            const showDiscount = false; // OrderItem 에 discountAmount 없음
            return (
              <div key={i} className="line">
                <div className="line-name">{l.name}</div>
                <div className="line-detail">{fmt(l.totalPrice)}</div>
                <div className="line-detail" style={{ gridColumn: "1 / -1" }}>
                  {l.quantity} × {fmt(l.unitPrice)}
                  {showDiscount && " (할인 적용)"}
                </div>
              </div>
            );
          })}

          <hr />

          <div className="row">
            <span className="label">공급가액</span>
            <span className="val">{fmt(data.subtotal)}</span>
          </div>
          <div className="row">
            <span className="label">부가세</span>
            <span className="val">{fmt(data.taxAmount)}</span>
          </div>
          <hr />
          <div className="total-row">
            <span>합계</span>
            <span>{fmt(data.totalAmount)}</span>
          </div>

          {data.memo && (
            <>
              <hr />
              <div style={{ fontSize: "8pt", color: "#555" }}>{data.memo}</div>
            </>
          )}

          <div style={{ textAlign: "center", marginTop: "3mm", fontSize: "8pt", color: "#666" }}>
            감사합니다
          </div>
          <div style={{ textAlign: "center", marginTop: "1.5mm", fontSize: "7pt", color: "#888", lineHeight: 1.4 }}>
            제품 시리얼 라벨의 QR 코드로 본인 인증 후
            <br />
            보증·수리·구매 내역을 조회할 수 있습니다
          </div>
        </div>
      </div>
    </>
  );
}
