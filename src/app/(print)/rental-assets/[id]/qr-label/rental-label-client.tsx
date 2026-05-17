"use client";

import { useEffect } from "react";

interface Props {
  assetNo: string;
  name: string;
  qrDataUrl: string;
  company: { name: string; phone: string | null };
  auto: boolean;
}

/**
 * 임대 자산 QR 라벨 — 62mm × 35mm. 기기에 영구 부착.
 * QR 은 /r/[token] 사용설명서 페이지를 가리킴.
 */
export function RentalLabelClient({
  assetNo,
  name,
  qrDataUrl,
  company,
  auto,
}: Props) {
  useEffect(() => {
    if (auto) {
      const t = setTimeout(() => window.print(), 200);
      return () => clearTimeout(t);
    }
  }, [auto]);

  return (
    <>
      <style>{`
        @page { size: 62mm 35mm; margin: 0; }
        @media print {
          html, body { background: #fff; margin: 0; padding: 0; }
          .print-toolbar { display: none !important; }
          .label-page { page-break-after: always; }
        }
        .label-page {
          width: 62mm; height: 35mm; padding: 2mm;
          box-sizing: border-box; display: flex; flex-direction: column;
          font-family: ui-sans-serif, system-ui, sans-serif;
          color: #000; background: #fff; break-inside: avoid;
        }
        .label-header {
          text-align: center; padding-bottom: 1.2mm;
          border-bottom: 0.3mm solid #000;
        }
        .label-shop { font-size: 11pt; font-weight: 800; line-height: 1.05; }
        .label-phone { font-size: 9pt; font-weight: 700; margin-top: 0.6mm; }
        .label-body {
          flex: 1; display: flex; gap: 2mm; padding-top: 1.5mm; align-items: center;
        }
        .label-qr { width: 19mm; height: 19mm; flex-shrink: 0; }
        .label-qr img { width: 100%; height: 100%; display: block; }
        .label-text {
          flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.7mm;
        }
        .label-asset {
          font-family: ui-monospace, "SF Mono", monospace;
          font-size: 11pt; font-weight: 700; line-height: 1;
        }
        .label-name {
          font-size: 8pt; font-weight: 600; line-height: 1.15;
          overflow: hidden; display: -webkit-box;
          -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        }
        .label-hint { font-size: 5.5pt; color: #444; margin-top: 0.4mm; }
        .label-badge {
          display: inline-block; font-size: 6pt; font-weight: 700;
          padding: 0.4mm 0.8mm; border: 0.2mm solid #000;
          border-radius: 0.6mm; margin-right: 1mm; vertical-align: middle;
        }
      `}</style>

      <div
        className="print-toolbar"
        style={{
          position: "sticky",
          top: 0,
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
          임대 자산 QR 라벨 — 62mm × 35mm
        </span>
      </div>

      <div style={{ padding: 16, background: "#f5f5f5" }}>
        <div
          className="label-page"
          style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }}
        >
          <div className="label-header">
            <div className="label-shop">{company.name}</div>
            {company.phone && <div className="label-phone">{company.phone}</div>}
          </div>
          <div className="label-body">
            <div className="label-qr">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt={assetNo} />
            </div>
            <div className="label-text">
              <div className="label-asset">
                <span className="label-badge">임대</span>
                {assetNo}
              </div>
              <div className="label-name">{name}</div>
              <div className="label-hint">QR 스캔 → 사용설명서</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
