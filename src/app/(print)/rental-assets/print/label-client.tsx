"use client";

import { useEffect } from "react";

interface Label {
  code: string;
  name: string;
  brand: string | null;
  modelNo: string | null;
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
 * 임대 자산 라벨 — Brother QL 62mm × 35mm. 한 라벨 = 한 페이지.
 * 시리얼 라벨과 동일 폼팩터 — 매장 운영 단순화. 상호/연락처 헤더 + QR + 자산번호 + 자산명/모델.
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
          font-size: 10pt;
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
        .label-sub {
          font-size: 6.5pt;
          color: #222;
          line-height: 1.2;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
        }
        .label-asset-badge {
          display: inline-block;
          font-size: 6pt;
          font-weight: 700;
          line-height: 1;
          padding: 0.4mm 0.8mm;
          border: 0.2mm solid #000;
          border-radius: 0.6mm;
          margin-right: 1mm;
          vertical-align: middle;
          letter-spacing: 0.05em;
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
        {labels.map((l) => {
          const sub = [l.brand, l.modelNo].filter(Boolean).join(" · ");
          return (
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
                  <div className="label-code">
                    <span className="label-asset-badge">임대</span>
                    {l.code}
                  </div>
                  <div className="label-name">{l.name}</div>
                  {sub && <div className="label-sub">{sub}</div>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
