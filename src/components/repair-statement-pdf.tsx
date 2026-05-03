"use client";

import "@/lib/pdf-fonts";
import { useEffect } from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  PDFViewer,
  pdf,
} from "@react-pdf/renderer";

interface CompanyInfo {
  name: string;
  businessNumber?: string | null;
  ceo?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

export interface RepairStatementPart {
  name: string;
  sku?: string | null;
  quantity: string | number;
  unitPrice: string | number;
  totalPrice: string | number;
}

export interface RepairStatementLabor {
  name: string;
  unitRate: string | number;
  hours: string | number;
  totalPrice: string | number;
}

export interface RepairStatementData {
  ticketNo: string;
  type: "ON_SITE" | "DROP_OFF";
  receivedAt: string;
  pickedUpAt: string | null;
  customerName: string;
  customerPhone: string | null;
  deviceLine: string | null;
  serialCode: string | null;
  symptom: string | null;
  diagnosis: string | null;
  repairNotes: string | null;
  parts: RepairStatementPart[];
  labors: RepairStatementLabor[];
  diagnosisFee: number;
  totalDiscount: number;
  finalAmount: number;
  repairWarrantyMonths: number | null;
  repairWarrantyEnds: string | null;
}

interface Props {
  company: CompanyInfo;
  repair: RepairStatementData;
  autoPrint?: boolean;
}

const fmt = (v: string | number) =>
  Math.round(parseFloat(String(v))).toLocaleString("ko-KR");

const BORDER = "#000";
const BW = 0.6;
const SUBTLE = "#444";

const s = StyleSheet.create({
  page: {
    padding: 28,
    fontFamily: "Pretendard",
    fontSize: 9,
    color: "#000",
    backgroundColor: "#fff",
  },
  row: { flexDirection: "row" },
  bold: { fontWeight: "bold" },

  // 헤더
  shop: { fontSize: 14, fontWeight: "bold", marginBottom: 2 },
  shopMeta: { fontSize: 8, color: SUBTLE, marginBottom: 1 },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    letterSpacing: 4,
    textAlign: "center",
    marginTop: 14,
    marginBottom: 4,
  },
  ticketNo: {
    fontSize: 10,
    fontFamily: "Pretendard",
    textAlign: "center",
    marginBottom: 12,
    color: SUBTLE,
  },

  // 기본 표 (라벨 - 값 형식)
  infoBox: {
    borderWidth: BW,
    borderColor: BORDER,
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: "row",
    borderBottomWidth: BW,
    borderColor: BORDER,
  },
  infoRowLast: {
    flexDirection: "row",
  },
  infoLabel: {
    width: "20%",
    backgroundColor: "#f5f5f5",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRightWidth: BW,
    borderColor: BORDER,
    fontSize: 8,
  },
  infoValue: {
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontSize: 9,
  },

  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginTop: 6,
    marginBottom: 4,
  },

  // 명세 표
  table: {
    borderWidth: BW,
    borderColor: BORDER,
    marginBottom: 8,
  },
  thead: {
    flexDirection: "row",
    backgroundColor: "#f0f0f0",
    borderBottomWidth: BW,
    borderColor: BORDER,
  },
  th: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRightWidth: BW,
    borderColor: BORDER,
    fontSize: 8,
    fontWeight: "bold",
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: BW,
    borderColor: BORDER,
  },
  trLast: { flexDirection: "row" },
  td: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRightWidth: BW,
    borderColor: BORDER,
    fontSize: 9,
  },

  totalRow: {
    flexDirection: "row",
    borderWidth: BW,
    borderColor: BORDER,
    backgroundColor: "#fafafa",
    padding: 6,
    marginTop: 4,
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: { fontSize: 11, fontWeight: "bold" },
  totalValue: { fontSize: 16, fontWeight: "bold" },

  warrantyBox: {
    marginTop: 8,
    padding: 6,
    borderWidth: BW,
    borderColor: BORDER,
    fontSize: 9,
    backgroundColor: "#f9f9f9",
  },
  footerNote: {
    marginTop: 12,
    fontSize: 8,
    color: SUBTLE,
    textAlign: "center",
  },
});

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={last ? s.infoRowLast : s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value || "-"}</Text>
    </View>
  );
}

function RepairStatementDocument({ company, repair }: Props) {
  const totalParts = repair.parts.reduce(
    (acc, p) => acc + Math.round(parseFloat(String(p.totalPrice))),
    0,
  );
  const totalLabor = repair.labors.reduce(
    (acc, l) => acc + Math.round(parseFloat(String(l.totalPrice))),
    0,
  );

  return (
    <Document title={`수리내역서_${repair.ticketNo}`}>
      <Page size="A4" style={s.page}>
        {/* 회사 헤더 */}
        <Text style={s.shop}>{company.name}</Text>
        <Text style={s.shopMeta}>
          {[
            company.businessNumber && `사업자등록번호 ${company.businessNumber}`,
            company.ceo && `대표 ${company.ceo}`,
          ]
            .filter(Boolean)
            .join("  ·  ")}
        </Text>
        <Text style={s.shopMeta}>
          {[company.phone, company.email].filter(Boolean).join("  ·  ")}
        </Text>
        {company.address && <Text style={s.shopMeta}>{company.address}</Text>}

        <Text style={s.title}>수리내역서</Text>
        <Text style={s.ticketNo}>{repair.ticketNo}</Text>

        {/* 손님/기기 */}
        <Text style={s.sectionTitle}>손님 / 기기</Text>
        <View style={s.infoBox}>
          <InfoRow label="손님" value={repair.customerName} />
          <InfoRow label="연락처" value={repair.customerPhone ?? "-"} />
          <InfoRow
            label="기기"
            value={
              [repair.deviceLine, repair.serialCode && `(${repair.serialCode})`]
                .filter(Boolean)
                .join(" ") || "-"
            }
          />
          <InfoRow
            label="접수일"
            value={repair.receivedAt}
          />
          <InfoRow
            label="픽업일"
            value={repair.pickedUpAt ?? "-"}
            last
          />
        </View>

        {/* 증상/진단/수리내용 */}
        <Text style={s.sectionTitle}>증상 · 진단 · 수리내용</Text>
        <View style={s.infoBox}>
          <InfoRow label="증상" value={repair.symptom ?? "-"} />
          <InfoRow label="진단" value={repair.diagnosis ?? "-"} />
          <InfoRow label="수리내용" value={repair.repairNotes ?? "-"} last />
        </View>

        {/* 부속 명세 */}
        {repair.parts.length > 0 && (
          <>
            <Text style={s.sectionTitle}>사용 부속</Text>
            <View style={s.table}>
              <View style={s.thead}>
                <Text style={[s.th, { width: "55%" }]}>부속명</Text>
                <Text style={[s.th, { width: "12%", textAlign: "right" }]}>수량</Text>
                <Text style={[s.th, { width: "16%", textAlign: "right" }]}>단가</Text>
                <Text style={[s.th, { width: "17%", textAlign: "right", borderRightWidth: 0 }]}>
                  소계
                </Text>
              </View>
              {repair.parts.map((p, i) => (
                <View
                  key={i}
                  style={i === repair.parts.length - 1 ? s.trLast : s.tr}
                >
                  <Text style={[s.td, { width: "55%" }]}>
                    {p.name}
                    {p.sku ? ` (${p.sku})` : ""}
                  </Text>
                  <Text style={[s.td, { width: "12%", textAlign: "right" }]}>
                    {fmt(p.quantity)}
                  </Text>
                  <Text style={[s.td, { width: "16%", textAlign: "right" }]}>
                    ₩{fmt(p.unitPrice)}
                  </Text>
                  <Text
                    style={[s.td, { width: "17%", textAlign: "right", borderRightWidth: 0 }]}
                  >
                    ₩{fmt(p.totalPrice)}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={{ textAlign: "right", marginBottom: 4 }}>
              부속 합계 ₩{fmt(totalParts)}
            </Text>
          </>
        )}

        {/* 공임 */}
        {repair.labors.length > 0 && (
          <>
            <Text style={s.sectionTitle}>공임</Text>
            <View style={s.table}>
              <View style={s.thead}>
                <Text style={[s.th, { width: "70%" }]}>항목</Text>
                <Text style={[s.th, { width: "30%", textAlign: "right", borderRightWidth: 0 }]}>
                  금액
                </Text>
              </View>
              {repair.labors.map((l, i) => (
                <View
                  key={i}
                  style={i === repair.labors.length - 1 ? s.trLast : s.tr}
                >
                  <Text style={[s.td, { width: "70%" }]}>{l.name}</Text>
                  <Text
                    style={[s.td, { width: "30%", textAlign: "right", borderRightWidth: 0 }]}
                  >
                    ₩{fmt(l.totalPrice)}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={{ textAlign: "right", marginBottom: 4 }}>
              공임 합계 ₩{fmt(totalLabor)}
            </Text>
          </>
        )}

        {/* 진단비 / 할인 */}
        {(repair.diagnosisFee > 0 || repair.totalDiscount > 0) && (
          <View style={s.infoBox}>
            {repair.diagnosisFee > 0 && (
              <InfoRow label="진단비" value={`₩${fmt(repair.diagnosisFee)}`} />
            )}
            {repair.totalDiscount > 0 && (
              <InfoRow
                label="할인"
                value={`-₩${fmt(repair.totalDiscount)}`}
                last
              />
            )}
          </View>
        )}

        {/* 합계 */}
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>최종 청구</Text>
          <Text style={s.totalValue}>₩{fmt(repair.finalAmount)}</Text>
        </View>

        {/* 보증 안내 */}
        {repair.repairWarrantyMonths != null && repair.repairWarrantyMonths > 0 && (
          <View style={s.warrantyBox}>
            <Text style={s.bold}>
              수리 보증 {repair.repairWarrantyMonths}개월
            </Text>
            {repair.repairWarrantyEnds && (
              <Text style={{ marginTop: 2 }}>
                보증 만료일: {repair.repairWarrantyEnds}
              </Text>
            )}
            <Text style={{ marginTop: 2, color: SUBTLE }}>
              · 본 수리에 대해 동일 증상 재발 시 무상 재수리 (소모품·외부 충격 제외)
            </Text>
          </View>
        )}

        <Text style={s.footerNote}>
          이 내역서를 보관하여 보증 청구 시 제시해 주세요.
        </Text>
      </Page>
    </Document>
  );
}

export function RepairStatementPdf({ company, repair, autoPrint }: Props) {
  useEffect(() => {
    if (!autoPrint) return;
    let canceled = false;
    (async () => {
      const blob = await pdf(<RepairStatementDocument company={company} repair={repair} />).toBlob();
      if (canceled) return;
      const url = URL.createObjectURL(blob);
      window.location.href = url;
    })();
    return () => {
      canceled = true;
    };
  }, [autoPrint, company, repair]);

  if (autoPrint) return null;

  return (
    <PDFViewer style={{ width: "100%", height: "100%", border: 0 }}>
      <RepairStatementDocument company={company} repair={repair} />
    </PDFViewer>
  );
}
