"use client";

import { useEffect } from "react";
import { formatBusinessNumber, formatPhone } from "@/lib/utils";

interface Data {
  paymentNo: string;
  paymentDate: string;
  company: {
    name: string;
    phone: string | null;
    businessNumber: string | null;
    address: string | null;
    ceo: string | null;
  };
  customer: {
    name: string;
    phone: string | null;
    businessNumber: string | null;
  };
  amount: number;
  method: string;
  kind: string; // MIXED / SUPPLY_ONLY / VAT_ONLY
  memo: string | null;
  receivedBy: string;
  /** 수금 후 미수 잔액 (음수면 선수금) */
  remainingBalance: number;
}

const METHOD_LABEL: Record<string, string> = {
  CASH: "현금",
  CASH_RECEIPT: "현금영수증",
  CARD: "카드",
  BANK_TRANSFER: "계좌이체",
  POINTS: "포인트",
  OTHER: "기타",
};

/**
 * 수금 영수증 (80mm 영수증 프린터 친화).
 * 외상 수금·잔금 수금·계약금 후 잔금 수금 모두 동일 템플릿.
 */
export function PaymentReceiptClient({
  data,
  auto,
}: {
  data: Data;
  auto: boolean;
}) {
  useEffect(() => {
    if (auto) {
      const t = setTimeout(() => window.print(), 200);
      return () => clearTimeout(t);
    }
  }, [auto]);

  const fmt = (n: number) => `₩${n.toLocaleString("ko-KR")}`;

  // 잔액 상태 — 0 이면 완납, 양수면 미수, 음수면 선수금
  const balanceLabel =
    data.remainingBalance > 0
      ? `미수 ${fmt(data.remainingBalance)}`
      : data.remainingBalance < 0
        ? `선수금 ${fmt(Math.abs(data.remainingBalance))}`
        : "완납";

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
        }
        .receipt .meta {
          text-align: center;
          font-size: 8pt;
          color: #555;
          line-height: 1.4;
          margin-bottom: 1mm;
        }
        .receipt hr {
          border: 0;
          border-top: 1px dashed #000;
          margin: 1.5mm 0;
        }
        .row { display: flex; justify-content: space-between; gap: 2mm; }
        .row .label { color: #333; }
        .row .val { font-weight: 600; }
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
          수금 영수증 (80mm)
        </span>
      </div>

      <div style={{ padding: "16px 0", background: "#f5f5f5" }}>
        <div className="receipt" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }}>
          <h1>{data.company.name}</h1>
          <div className="meta">
            {data.company.businessNumber && (
              <div>사업자 {formatBusinessNumber(data.company.businessNumber)}</div>
            )}
            {data.company.ceo && <div>대표 {data.company.ceo}</div>}
            {data.company.phone && <div>{formatPhone(data.company.phone)}</div>}
            {data.company.address && <div>{data.company.address}</div>}
          </div>

          {/* 영수증 종류 라벨 — 박스 강조 */}
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
            수금 영수증
          </div>

          <hr />

          <div className="row">
            <span className="label">영수번호</span>
            <span className="val">{data.paymentNo}</span>
          </div>
          <div className="row">
            <span className="label">수금일시</span>
            <span className="val">{data.paymentDate}</span>
          </div>
          <div className="row">
            <span className="label">고객</span>
            <span className="val">
              {data.customer.name}
              {data.customer.phone && ` ${formatPhone(data.customer.phone)}`}
            </span>
          </div>
          {data.customer.businessNumber && (
            <div className="row">
              <span className="label">사업자</span>
              <span className="val">
                {formatBusinessNumber(data.customer.businessNumber)}
              </span>
            </div>
          )}
          <div className="row">
            <span className="label">수금 방법</span>
            <span className="val">
              {METHOD_LABEL[data.method] ?? data.method}
            </span>
          </div>

          <hr />

          <div className="total-row">
            <span>수금액</span>
            <span>{fmt(data.amount)}</span>
          </div>

          <hr />

          <div className="row">
            <span className="label">수금 후 잔액</span>
            <span
              className="val"
              style={{
                color: data.remainingBalance > 0 ? "#c00" : "#000",
              }}
            >
              {balanceLabel}
            </span>
          </div>

          {data.memo && (
            <>
              <hr />
              <div style={{ fontSize: "8pt", color: "#555" }}>
                메모: {data.memo}
              </div>
            </>
          )}

          <div
            style={{
              textAlign: "center",
              marginTop: "3mm",
              fontSize: "8pt",
              color: "#666",
            }}
          >
            수령자: {data.receivedBy}
          </div>
          <div
            style={{
              textAlign: "center",
              marginTop: "1mm",
              fontSize: "8pt",
              color: "#666",
            }}
          >
            감사합니다
          </div>
        </div>
      </div>
    </>
  );
}
