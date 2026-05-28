"use client";

import { useEffect, useState } from "react";
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
  /** 결제 축 — UNPAID / PAID / PARTIAL_PAID / 환불 등 */
  paymentStatus?: string | null;
  /** 즉시 결제된 금액 — 부분 결제(PARTIAL_PAID) 시 < totalAmount. null 이면 전액 결제 */
  paidAmount?: number | null;
  /** 부분 결제 구분 — DEPOSIT(계약금) / PARTIAL(부분결제). 헤더 라벨 분기용 */
  partialPaymentKind?: "DEPOSIT" | "PARTIAL" | null;
  memo: string | null;
}

const PAYMENT_LABEL: Record<string, string> = {
  CARD: "카드",
  CASH: "현금",
  CASH_RECEIPT: "현금영수증",
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
 *
 * supplyOnly: true 면 부가세 행을 숨기고 합계도 공급가액 기준으로만 표시.
 */
export function ReceiptClient({
  data,
  auto,
  initialSupplyOnly = false,
}: {
  data: Data;
  auto: boolean;
  initialSupplyOnly?: boolean;
}) {
  const [supplyOnly, setSupplyOnly] = useState(initialSupplyOnly);

  useEffect(() => {
    if (auto) {
      const t = setTimeout(() => window.print(), 200);
      return () => clearTimeout(t);
    }
  }, [auto]);

  const fmt = (n: number) => `₩${n.toLocaleString("ko-KR")}`;
  const displayTotal = supplyOnly ? data.subtotal : data.totalAmount;

  return (
    <>
      <style>{`
        @page { size: 80mm auto; margin: 0; }
        @media print {
          html, body {
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 80mm;
            height: auto;
          }
          .receipt-toolbar { display: none !important; }
          .receipt-outer {
            padding: 0 !important;
            background: #fff !important;
          }
          .receipt {
            box-shadow: none !important;
            margin: 0 auto !important;
            page-break-after: avoid;
            page-break-inside: avoid;
          }
          .receipt :last-child { margin-bottom: 0 !important; }
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
          gap: 12,
          alignItems: "center",
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
        <span style={{ fontSize: 13, color: "#666" }}>80mm 영수증</span>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "#333",
            cursor: "pointer",
            marginLeft: "auto",
          }}
        >
          <input
            type="checkbox"
            checked={supplyOnly}
            onChange={(e) => setSupplyOnly(e.target.checked)}
          />
          공급가액만 (세액 제외)
        </label>
      </div>

      <div className="receipt-outer" style={{ padding: "16px 0", background: "#f5f5f5" }}>
        <div className="receipt" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }}>
          <h1>{data.company.name}</h1>
          <div className="meta">
            {data.company.businessNumber && <div>사업자 {formatBusinessNumber(data.company.businessNumber)}</div>}
            {data.company.ceo && <div>대표 {data.company.ceo}</div>}
            {data.company.phone && <div>{formatPhone(data.company.phone)}</div>}
            {data.company.address && <div>{data.company.address}</div>}
          </div>

          {/* 영수증 종류 라벨 — 부분 결제(계약금/부분결제) 케이스에 헤더 분기 */}
          {data.partialPaymentKind && (
            <div
              style={{
                textAlign: "center",
                marginTop: "2mm",
                padding: "1mm 2mm",
                border: "1.5px solid #000",
                fontSize: "10pt",
                fontWeight: 800,
                letterSpacing: "0.5mm",
              }}
            >
              {data.partialPaymentKind === "DEPOSIT"
                ? "계약금 영수증"
                : "부분 결제 영수증"}
            </div>
          )}

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
          {!supplyOnly && (
            <div className="row">
              <span className="label">부가세</span>
              <span className="val">{fmt(data.taxAmount)}</span>
            </div>
          )}
          <hr />
          <div className="total-row">
            <span>{supplyOnly ? "합계 (공급가액)" : "합계 (VAT 포함)"}</span>
            <span>{fmt(displayTotal)}</span>
          </div>

          {/* 부분 결제 — 즉시 결제 / 잔금(미수) 분리 표시 */}
          {data.partialPaymentKind &&
            data.paidAmount !== null &&
            data.paidAmount !== undefined && (
              <>
                <hr />
                <div className="row">
                  <span className="label">
                    {data.partialPaymentKind === "DEPOSIT"
                      ? "계약금 입금"
                      : "즉시 결제"}
                  </span>
                  <span className="val">{fmt(data.paidAmount)}</span>
                </div>
                <div
                  className="row"
                  style={{ fontSize: "10pt", fontWeight: 700 }}
                >
                  <span className="label">잔금 (미수)</span>
                  <span className="val">
                    {fmt(Math.max(0, data.totalAmount - data.paidAmount))}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: "1mm",
                    fontSize: "8pt",
                    color: "#555",
                    textAlign: "center",
                  }}
                >
                  {data.partialPaymentKind === "DEPOSIT"
                    ? "본 영수증은 계약금 수령 확인용입니다 — 잔금 결제 시 별도 영수증 발급"
                    : "잔금은 차후 결제 시 별도 영수증 발급"}
                </div>
              </>
            )}

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
