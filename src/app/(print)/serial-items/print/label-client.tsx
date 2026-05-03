"use client";

import { useEffect } from "react";

interface Label {
  code: string;
  productName: string;
  soldAt: string;
  warrantyEnds: string | null;
  qrDataUrl: string;
  qrUrl: string;
}

interface CompanyInfo {
  name: string;
  phone: string | null;
}

interface Props {
  labels: Label[];
  company: CompanyInfo;
  auto: boolean;
}

/**
 * Brother QL 62mm × 35mm 라벨 (변경 가능). 한 라벨 = 한 페이지.
 * 강조 우선순위: 상호명 → 연락처 → 코드 → 상품명/날짜
 */
export function LabelClient({ labels, company, auto }: Props) {
  useEffect(() => {
    if (auto) {
      const t = setTimeout(() => window.print(), 200);
      return () => clearTimeout(t);
    }
  }, [auto]);

  return (
    <>
      <style>{`
        @page {
          size: 62mm 35mm;
          margin: 0;
        }
        @media print {
          html, body { background: #fff; margin: 0; padding: 0; }
          .print-root { background: #fff !important; }
          .print-toolbar { display: none !important; }
          .label-page { page-break-after: always; }
          .label-page:last-child { page-break-after: auto; }
        }
        .label-page {
          width: 62mm;
          height: 35mm;
          padding: 2mm;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          font-family: ui-sans-serif, system-ui, sans-serif;
          color: #000;
          background: #fff;
          break-inside: avoid;
        }
        .label-header {
          text-align: center;
          padding-bottom: 1.2mm;
          border-bottom: 0.3mm solid #000;
        }
        .label-shop {
          font-size: 11pt;
          font-weight: 800;
          line-height: 1.05;
          letter-spacing: -0.01em;
        }
        .label-phone {
          font-size: 9pt;
          font-weight: 700;
          line-height: 1.1;
          margin-top: 0.6mm;
          letter-spacing: 0.02em;
        }
        .label-body {
          flex: 1;
          display: flex;
          gap: 2mm;
          padding-top: 1.5mm;
          align-items: center;
        }
        .label-qr {
          width: 19mm;
          height: 19mm;
          flex-shrink: 0;
        }
        .label-qr img {
          width: 100%;
          height: 100%;
          display: block;
        }
        .label-text {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.7mm;
        }
        .label-code {
          font-family: ui-monospace, "SF Mono", monospace;
          font-size: 11pt;
          font-weight: 700;
          line-height: 1;
          letter-spacing: 0.02em;
        }
        .label-name {
          font-size: 8pt;
          font-weight: 600;
          line-height: 1.15;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
        }
        .label-date {
          font-size: 6.5pt;
          color: #222;
          line-height: 1.2;
        }
      `}</style>

      {/* 화면 미리보기용 툴바 — 인쇄 시 자동 숨김 */}
      <div
        className="print-toolbar"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          gap: "8px",
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
          {labels.length}장 — 라벨 프린터에서 62mm × 35mm로 출력됩니다
        </span>
      </div>

      <div style={{ padding: "16px", background: "#f5f5f5" }}>
        {labels.map((l) => (
          <div
            key={l.code}
            className="label-page"
            style={{
              boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
              marginBottom: 12,
            }}
          >
            <div className="label-header">
              <div className="label-shop">{company.name}</div>
              {company.phone && <div className="label-phone">{company.phone}</div>}
            </div>
            <div className="label-body">
              <div className="label-qr">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.qrDataUrl} alt={l.code} />
              </div>
              <div className="label-text">
                <div className="label-code">{l.code}</div>
                <div className="label-name">{l.productName}</div>
                <div className="label-date">구매일 : {l.soldAt}</div>
                {l.warrantyEnds && (
                  <div className="label-date">보증일 : {l.warrantyEnds} 까지</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
