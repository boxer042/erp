"use client";

import { useEffect } from "react";

interface Label {
  code: string;
  productName: string;
  source: "SALE" | "REPAIR";
  soldAt: string;
  warrantyEnds: string | null;
  qrDataUrl: string | null;
  qrUrl: string | null;
}

interface CompanyInfo {
  name: string;
  phone: string | null;
}

export type LabelSize = "small" | "standard" | "large";

interface Props {
  labels: Label[];
  company: CompanyInfo;
  auto: boolean;
  size: LabelSize;
}

const SOURCE_BADGE: Record<Label["source"], string | null> = {
  SALE: null,
  REPAIR: "수리",
};

/**
 * 라벨 사이즈 프리셋 (mm / pt). 한 라벨 = 한 페이지.
 * 라벨 프린터 용지 규격에 맞춰 선택 — 실제 출력 후 미세조정 가능.
 */
const SIZE_PRESETS: Record<
  LabelSize,
  {
    label: string;
    w: number;
    h: number;
    pad: number;
    qr: number;
    shop: number;
    phone: number;
    code: number;
    name: number;
    date: number;
    hint: number;
    badge: number;
  }
> = {
  small: {
    label: "소형 38×25mm",
    w: 38,
    h: 25,
    pad: 1.5,
    qr: 13,
    shop: 7,
    phone: 6,
    code: 8,
    name: 6,
    date: 5,
    hint: 4.5,
    badge: 4.5,
  },
  standard: {
    label: "표준 62×35mm",
    w: 62,
    h: 35,
    pad: 2,
    qr: 19,
    shop: 11,
    phone: 9,
    code: 11,
    name: 8,
    date: 6.5,
    hint: 5.5,
    badge: 6,
  },
  large: {
    label: "대형 90×50mm",
    w: 90,
    h: 50,
    pad: 3,
    qr: 28,
    shop: 15,
    phone: 12,
    code: 15,
    name: 11,
    date: 9,
    hint: 7.5,
    badge: 8,
  },
};

export function LabelClient({ labels, company, auto, size }: Props) {
  useEffect(() => {
    if (auto) {
      const t = setTimeout(() => window.print(), 200);
      return () => clearTimeout(t);
    }
  }, [auto]);

  const s = SIZE_PRESETS[size];

  return (
    <>
      <style>{`
        @page {
          size: ${s.w}mm ${s.h}mm;
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
          width: ${s.w}mm;
          height: ${s.h}mm;
          padding: ${s.pad}mm;
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
          font-size: ${s.shop}pt;
          font-weight: 800;
          line-height: 1.05;
          letter-spacing: -0.01em;
        }
        .label-phone {
          font-size: ${s.phone}pt;
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
          width: ${s.qr}mm;
          height: ${s.qr}mm;
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
          font-size: ${s.code}pt;
          font-weight: 700;
          line-height: 1;
          letter-spacing: 0.02em;
        }
        .label-name {
          font-size: ${s.name}pt;
          font-weight: 600;
          line-height: 1.15;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
        }
        .label-date {
          font-size: ${s.date}pt;
          color: #222;
          line-height: 1.2;
        }
        .label-hint {
          font-size: ${s.hint}pt;
          color: #444;
          line-height: 1.2;
          margin-top: 0.4mm;
        }
        .label-source-badge {
          display: inline-block;
          font-size: ${s.badge}pt;
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
          {labels.length}장 — {s.label} 로 출력됩니다
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
              {l.qrDataUrl && (
                <div className="label-qr">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={l.qrDataUrl} alt={l.code} />
                </div>
              )}
              <div className="label-text">
                <div className="label-code">
                  {SOURCE_BADGE[l.source] && (
                    <span className="label-source-badge">
                      {SOURCE_BADGE[l.source]}
                    </span>
                  )}
                  {l.code}
                </div>
                <div className="label-name">{l.productName}</div>
                <div className="label-date">
                  {l.source === "REPAIR" ? "접수일" : "구매일"} : {l.soldAt}
                </div>
                {l.warrantyEnds && (
                  <div className="label-date">보증일 : {l.warrantyEnds} 까지</div>
                )}
                {l.qrDataUrl && (
                  <div className="label-hint">QR 스캔 → 보증·수리 조회</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
