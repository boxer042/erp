"use client";

import "@/lib/pdf-fonts";
import { useEffect, useState } from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  PDFViewer,
  pdf,
} from "@react-pdf/renderer";
import { Loader2 } from "lucide-react";

interface PartyInfo {
  name: string;
  businessNumber?: string | null;
  ceo?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

export interface ItemRow {
  id: string;
  kind: "item";
  date: string;
  incomingNo: string;
  productName: string;
  supplierCode?: string | null;
  spec?: string | null;
  unitOfMeasure: string;
  quantity: string | number;
  unitPrice: string | number;
  discountPerUnit: number;
  totalWithTax: number; // 화면과 동일하게 VAT 포함 합계
}

export interface PaymentRow {
  id: string;
  kind: "payment";
  date: string;
  typeLabel: string; // "결제" | "조정" | "환급"
  description: string;
  debitAmount: string | number;
  creditAmount: string | number;
}

export type ItemsPdfRow = ItemRow | PaymentRow;

export interface SupplierItemsPdfProps {
  company: PartyInfo;
  supplier: PartyInfo;
  periodFrom?: string | null;
  periodTo?: string | null;
  openingBalance: number;
  endingBalance: number;
  rows: ItemsPdfRow[]; // ASC by date
  autoPrint?: boolean;
}

const fmt = (v: string | number) =>
  Math.round(parseFloat(String(v))).toLocaleString("ko-KR");

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
    paddingHorizontal: 3,
    borderRightWidth: BW,
    borderColor: BORDER,
    fontSize: 8,
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
  trPayment: {
    flexDirection: "row",
    borderLeftWidth: BW,
    borderRightWidth: BW,
    borderBottomWidth: BW,
    borderColor: BORDER,
    backgroundColor: "#eef7f2",
  },
  td: {
    paddingVertical: 3,
    paddingHorizontal: 3,
    borderRightWidth: BW,
    borderColor: BORDER,
    fontSize: 8,
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

// 8 columns: 일자 / 품명(규격) / 단위 / 수량 / 단가 / 할인 / 합계(VAT) / 입금
const COL = {
  date: "10%",
  product: "34%",
  unit: "6%",
  qty: "8%",
  unitPrice: "11%",
  discount: "9%",
  total: "12%",
  payment: "10%",
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

function ItemsDocument(props: SupplierItemsPdfProps) {
  const { company, supplier, periodFrom, periodTo, openingBalance, endingBalance, rows } = props;

  const itemRows = rows.filter((r): r is ItemRow => r.kind === "item");
  const paymentRows = rows.filter((r): r is PaymentRow => r.kind === "payment");

  const totalQty = itemRows.reduce((s, r) => s + parseFloat(String(r.quantity)), 0);
  const totalAmount = itemRows.reduce((s, r) => s + r.totalWithTax, 0);
  const totalPayment = paymentRows.reduce(
    (s, r) => s + parseFloat(String(r.creditAmount)) - parseFloat(String(r.debitAmount)),
    0,
  );

  const periodLabel =
    (periodFrom ? new Date(periodFrom).toISOString().slice(0, 10) : "전체") +
    " ~ " +
    (periodTo ? new Date(periodTo).toISOString().slice(0, 10) : "전체");

  return (
    <Document title={`${supplier.name}_품목원장_${periodLabel}`}>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>품 목 별 거 래 원 장</Text>
        <Text style={s.subtitle}>기간: {periodLabel}</Text>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 12, marginBottom: 10 }}>
          <PartyBlock label="공급자 (우리)" party={company} />
          <PartyBlock label="거래처" party={supplier} />
        </View>

        {/* 이월 잔액 박스 */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            borderWidth: BW,
            borderColor: BORDER,
            padding: 6,
            marginBottom: 6,
            backgroundColor: "#f7f7f7",
          }}
        >
          <Text style={{ fontSize: 9 }}>
            이월 잔액: <Text style={{ fontWeight: "bold" }}>{fmt(openingBalance)}</Text>
          </Text>
          <Text style={{ fontSize: 9 }}>
            기말 잔액: <Text style={{ fontWeight: "bold" }}>{fmt(endingBalance)}</Text>
          </Text>
        </View>

        {/* 테이블 헤더 */}
        <View style={s.tableHeader}>
          <Text style={[s.th, { width: COL.date }]}>일자</Text>
          <Text style={[s.th, { width: COL.product }]}>품명 / 규격</Text>
          <Text style={[s.th, { width: COL.unit }]}>단위</Text>
          <Text style={[s.th, { width: COL.qty }]}>수량</Text>
          <Text style={[s.th, { width: COL.unitPrice }]}>단가</Text>
          <Text style={[s.th, { width: COL.discount }]}>할인</Text>
          <Text style={[s.th, { width: COL.total }]}>합계(VAT)</Text>
          <Text style={[s.th, { width: COL.payment, borderRightWidth: 0 }]}>입금</Text>
        </View>

        {/* 엔트리 */}
        {rows.length === 0 ? (
          <View style={s.tr}>
            <Text
              style={[
                s.td,
                { width: "100%", textAlign: "center", color: "#888", borderRightWidth: 0 },
              ]}
            >
              내역이 없습니다
            </Text>
          </View>
        ) : (
          rows.map((r) => {
            if (r.kind === "payment") {
              const debit = parseFloat(String(r.debitAmount));
              const credit = parseFloat(String(r.creditAmount));
              const amountText =
                credit > 0 ? fmt(credit) : debit > 0 ? `-${fmt(debit)}` : "—";
              return (
                <View key={r.id} style={s.trPayment} wrap={false}>
                  <Text style={[s.td, { width: COL.date }, s.tdCenter]}>
                    {new Date(r.date).toISOString().slice(0, 10)}
                  </Text>
                  <Text style={[s.td, { width: COL.product }]}>
                    [{r.typeLabel}] {r.description}
                  </Text>
                  <Text style={[s.td, { width: COL.unit }, s.tdCenter]}>—</Text>
                  <Text style={[s.td, { width: COL.qty }, s.tdRight]}>—</Text>
                  <Text style={[s.td, { width: COL.unitPrice }, s.tdRight]}>—</Text>
                  <Text style={[s.td, { width: COL.discount }, s.tdRight]}>—</Text>
                  <Text style={[s.td, { width: COL.total }, s.tdRight]}>—</Text>
                  <Text
                    style={[
                      s.td,
                      { width: COL.payment, borderRightWidth: 0, fontWeight: "bold" },
                      s.tdRight,
                    ]}
                  >
                    {amountText}
                  </Text>
                </View>
              );
            }
            const qty = parseFloat(String(r.quantity));
            return (
              <View key={r.id} style={s.tr} wrap={false}>
                <Text style={[s.td, { width: COL.date }, s.tdCenter]}>
                  {new Date(r.date).toISOString().slice(0, 10)}
                </Text>
                <Text style={[s.td, { width: COL.product }]}>
                  {r.productName}
                  {r.supplierCode ? ` (${r.supplierCode})` : ""}
                  {r.spec ? ` / ${r.spec}` : ""}
                </Text>
                <Text style={[s.td, { width: COL.unit }, s.tdCenter]}>
                  {r.unitOfMeasure}
                </Text>
                <Text style={[s.td, { width: COL.qty }, s.tdRight]}>
                  {qty.toLocaleString("ko-KR")}
                </Text>
                <Text style={[s.td, { width: COL.unitPrice }, s.tdRight]}>
                  {fmt(r.unitPrice)}
                </Text>
                <Text style={[s.td, { width: COL.discount }, s.tdRight]}>
                  {r.discountPerUnit > 0 ? `-${fmt(r.discountPerUnit)}` : ""}
                </Text>
                <Text style={[s.td, { width: COL.total }, s.tdRight]}>
                  {fmt(r.totalWithTax)}
                </Text>
                <Text
                  style={[s.td, { width: COL.payment, borderRightWidth: 0 }, s.tdRight]}
                >
                  —
                </Text>
              </View>
            );
          })
        )}

        {/* 합계 */}
        <View style={s.footerRow}>
          <Text
            style={[s.td, { width: COL.date, fontWeight: "bold" }, s.tdCenter]}
          >
            합계
          </Text>
          <Text style={[s.td, { width: COL.product }]}> </Text>
          <Text style={[s.td, { width: COL.unit }]}> </Text>
          <Text style={[s.td, { width: COL.qty, fontWeight: "bold" }, s.tdRight]}>
            {totalQty.toLocaleString("ko-KR")}
          </Text>
          <Text style={[s.td, { width: COL.unitPrice }]}> </Text>
          <Text style={[s.td, { width: COL.discount }]}> </Text>
          <Text style={[s.td, { width: COL.total, fontWeight: "bold" }, s.tdRight]}>
            {fmt(totalAmount)}
          </Text>
          <Text
            style={[
              s.td,
              { width: COL.payment, borderRightWidth: 0, fontWeight: "bold" },
              s.tdRight,
            ]}
          >
            {fmt(totalPayment)}
          </Text>
        </View>

        <Text style={{ marginTop: 12, fontSize: 8, color: "#555" }}>
          * 합계(VAT) 컬럼은 과세 품목의 부가세를 포함한 총액입니다.
        </Text>
      </Page>
    </Document>
  );
}

export function SupplierItemsPdf(props: SupplierItemsPdfProps) {
  const [autoLoading, setAutoLoading] = useState(props.autoPrint);

  useEffect(() => {
    if (!props.autoPrint) return;
    let cancelled = false;
    (async () => {
      const blob = await pdf(<ItemsDocument {...props} />).toBlob();
      if (cancelled) return;
      const url = URL.createObjectURL(blob);
      window.location.href = url;
      setAutoLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [props]);

  if (props.autoPrint) {
    return (
      <div className="flex h-screen items-center justify-center">
        {autoLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Loader2 className="h-4 w-4 animate-spin" /> PDF 생성 중...
          </div>
        )}
      </div>
    );
  }

  return (
    <PDFViewer style={{ width: "100%", height: "100vh", border: "none" }}>
      <ItemsDocument {...props} />
    </PDFViewer>
  );
}
