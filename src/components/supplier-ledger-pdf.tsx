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
import { downloadPdfBlob } from "@/lib/pdf-download";

interface PartyInfo {
  name: string;
  businessNumber?: string | null;
  ceo?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

export interface LedgerRow {
  id: string;
  date: string;
  type: "PURCHASE" | "PAYMENT" | "ADJUSTMENT" | "REFUND";
  description: string;
  debitAmount: string | number;
  creditAmount: string | number;
  balance: string | number;
}

export interface SupplierLedgerPdfProps {
  company: PartyInfo; // 우리
  supplier: PartyInfo; // 거래처
  periodFrom?: string | null;
  periodTo?: string | null;
  openingBalance: number;
  entries: LedgerRow[]; // ASC by date
  autoPrint?: boolean;
  /** 공급가액만 (세액 제외) — true 면 모든 debit/credit/balance 를 ÷ 1.1 로 표시 */
  supplyOnly?: boolean;
}

const TYPE_LABELS = {
  PURCHASE: "매입",
  PAYMENT: "결제",
  ADJUSTMENT: "조정",
  REFUND: "환급",
} as const;

// supplyOnly 분기는 LedgerDocument 안에서 closure 로 적용. 여기는 raw 표시용 (사용 X).

const BORDER = "#000";
const BW = 0.6;

const s = StyleSheet.create({
  page: {
    padding: 24,
    fontFamily: "Pretendard",
    fontSize: 9,
    color: "#000",
    backgroundColor: "#fff",
  },
  row: { flexDirection: "row" },
  title: { fontSize: 18, fontWeight: "bold", letterSpacing: 1, textAlign: "center" },
  subtitle: { fontSize: 10, textAlign: "center", marginTop: 4, color: "#444" },
  partyBox: { borderWidth: BW, borderColor: BORDER, padding: 6, flex: 1 },
  partyLabel: { fontSize: 8, color: "#555", marginBottom: 2 },
  partyName: { fontSize: 11, fontWeight: "bold", marginBottom: 3 },
  partyDetail: { fontSize: 8, lineHeight: 1.4 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f0f0f0",
    borderWidth: BW,
    borderColor: BORDER,
    borderBottomWidth: 0,
  },
  th: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRightWidth: BW,
    borderColor: BORDER,
    fontSize: 8.5,
    fontWeight: "bold",
    textAlign: "center",
  },
  tr: {
    flexDirection: "row",
    borderLeftWidth: BW,
    borderRightWidth: BW,
    borderBottomWidth: BW,
    borderColor: BORDER,
  },
  td: {
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderRightWidth: BW,
    borderColor: BORDER,
    fontSize: 8.5,
  },
  tdRight: { textAlign: "right" },
  tdCenter: { textAlign: "center" },
  footerRow: {
    flexDirection: "row",
    borderLeftWidth: BW,
    borderRightWidth: BW,
    borderBottomWidth: BW,
    borderColor: BORDER,
    backgroundColor: "#fafafa",
  },
});

const COL = {
  date: "12%",
  type: "8%",
  desc: "40%",
  debit: "13%",
  credit: "13%",
  balance: "14%",
};

function PartyBlock({ label, party }: { label: string; party: PartyInfo }) {
  return (
    <View style={s.partyBox}>
      <Text style={s.partyLabel}>{label}</Text>
      <Text style={s.partyName}>{party.name || "-"}</Text>
      {party.businessNumber && (
        <Text style={s.partyDetail}>사업자: {party.businessNumber}</Text>
      )}
      {party.ceo && <Text style={s.partyDetail}>대표: {party.ceo}</Text>}
      {party.phone && <Text style={s.partyDetail}>전화: {party.phone}</Text>}
      {party.address && <Text style={s.partyDetail}>주소: {party.address}</Text>}
    </View>
  );
}

/** 기간 라벨 — "2026-01-01 ~ 2026-01-31" / 미지정은 "전체" */
function periodLabelOf(periodFrom?: string | null, periodTo?: string | null) {
  return (
    (periodFrom ? new Date(periodFrom).toISOString().slice(0, 10) : "전체") +
    " ~ " +
    (periodTo ? new Date(periodTo).toISOString().slice(0, 10) : "전체")
  );
}

/**
 * 파일명 — 다른 문서들(statement/quotation)과 동일한 "공급자_상대방_문서번호" 패턴.
 * 문서번호 위치엔 "원장_기간" 사용.
 */
function docTitleOf(props: SupplierLedgerPdfProps) {
  return `${props.company.name}_${props.supplier.name}_원장_${periodLabelOf(props.periodFrom, props.periodTo)}`;
}

function LedgerDocument(props: SupplierLedgerPdfProps) {
  const { company, supplier, periodFrom, periodTo, openingBalance, entries, supplyOnly } = props;

  const adj = (v: number) => (supplyOnly ? Math.round(v / 1.1) : Math.round(v));
  const fmt = (v: string | number) => adj(parseFloat(String(v))).toLocaleString("ko-KR");

  const totalDebit = entries.reduce((s, e) => s + parseFloat(String(e.debitAmount)), 0);
  const totalCredit = entries.reduce((s, e) => s + parseFloat(String(e.creditAmount)), 0);
  const endingBalance =
    entries.length > 0 ? parseFloat(String(entries[entries.length - 1].balance)) : openingBalance;

  const periodLabel = periodLabelOf(periodFrom, periodTo);
  const docTitle = docTitleOf(props);

  return (
    <Document title={docTitle}>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>거 래 처 원 장</Text>
        <Text style={s.subtitle}>
          기간: {periodLabel}
          {supplyOnly ? " · 공급가액만 (세액 제외)" : ""}
        </Text>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 12, marginBottom: 10 }}>
          <PartyBlock label="공급자 (우리)" party={company} />
          <PartyBlock label="거래처" party={supplier} />
        </View>

        {/* 테이블 헤더 */}
        <View style={s.tableHeader}>
          <Text style={[s.th, { width: COL.date }]}>일자</Text>
          <Text style={[s.th, { width: COL.type }]}>유형</Text>
          <Text style={[s.th, { width: COL.desc }]}>적요</Text>
          <Text style={[s.th, { width: COL.debit }]}>차변(매입)</Text>
          <Text style={[s.th, { width: COL.credit }]}>대변(결제)</Text>
          <Text style={[s.th, { width: COL.balance, borderRightWidth: 0 }]}>잔액</Text>
        </View>

        {/* 이월 잔액 */}
        <View style={s.tr}>
          <Text style={[s.td, { width: COL.date }, s.tdCenter]}>
            {periodFrom ? new Date(periodFrom).toISOString().slice(0, 10) : "—"}
          </Text>
          <Text style={[s.td, { width: COL.type }, s.tdCenter]}>이월</Text>
          <Text style={[s.td, { width: COL.desc }]}>이월 잔액</Text>
          <Text style={[s.td, { width: COL.debit }, s.tdRight]}>-</Text>
          <Text style={[s.td, { width: COL.credit }, s.tdRight]}>-</Text>
          <Text style={[s.td, { width: COL.balance, borderRightWidth: 0 }, s.tdRight]}>
            {fmt(openingBalance)}
          </Text>
        </View>

        {/* 엔트리 */}
        {entries.map((e) => (
          <View key={e.id} style={s.tr} wrap={false}>
            <Text style={[s.td, { width: COL.date }, s.tdCenter]}>
              {new Date(e.date).toISOString().slice(0, 10)}
            </Text>
            <Text style={[s.td, { width: COL.type }, s.tdCenter]}>
              {TYPE_LABELS[e.type]}
            </Text>
            <Text style={[s.td, { width: COL.desc }]}>{e.description}</Text>
            <Text style={[s.td, { width: COL.debit }, s.tdRight]}>
              {parseFloat(String(e.debitAmount)) > 0 ? fmt(e.debitAmount) : "-"}
            </Text>
            <Text style={[s.td, { width: COL.credit }, s.tdRight]}>
              {parseFloat(String(e.creditAmount)) > 0 ? fmt(e.creditAmount) : "-"}
            </Text>
            <Text style={[s.td, { width: COL.balance, borderRightWidth: 0 }, s.tdRight]}>
              {fmt(e.balance)}
            </Text>
          </View>
        ))}

        {/* 합계 */}
        <View style={s.footerRow}>
          <Text style={[s.td, { width: COL.date, fontWeight: "bold" }, s.tdCenter]}>
            합계
          </Text>
          <Text style={[s.td, { width: COL.type }]}> </Text>
          <Text style={[s.td, { width: COL.desc }]}> </Text>
          <Text style={[s.td, { width: COL.debit, fontWeight: "bold" }, s.tdRight]}>
            {fmt(totalDebit)}
          </Text>
          <Text style={[s.td, { width: COL.credit, fontWeight: "bold" }, s.tdRight]}>
            {fmt(totalCredit)}
          </Text>
          <Text
            style={[
              s.td,
              { width: COL.balance, borderRightWidth: 0, fontWeight: "bold" },
              s.tdRight,
            ]}
          >
            {fmt(endingBalance)}
          </Text>
        </View>

        <Text style={{ marginTop: 12, fontSize: 8, color: "#555" }}>
          * 잔액이 양수이면 미지급금(우리가 거래처에 지급할 금액)입니다.
        </Text>
      </Page>
    </Document>
  );
}

export function SupplierLedgerPdf(props: SupplierLedgerPdfProps) {
  const docTitle = docTitleOf(props);

  // 새 탭 인쇄 → 브라우저 "PDF로 저장" 기본 파일명이 document.title 이다
  useEffect(() => {
    document.title = docTitle;
  }, [docTitle]);

  useEffect(() => {
    if (!props.autoPrint) return;
    let cancelled = false;
    (async () => {
      const blob = await pdf(<LedgerDocument {...props} />).toBlob();
      if (cancelled) return;
      downloadPdfBlob(blob, docTitle);
    })();
    return () => {
      cancelled = true;
    };
  }, [props, docTitle]);

  return (
    <PDFViewer style={{ width: "100%", height: "100vh", border: "none" }}>
      <LedgerDocument {...props} />
    </PDFViewer>
  );
}
