"use client";

import "@/lib/pdf-fonts";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  PDFViewer,
  pdf,
} from "@react-pdf/renderer";
import { JmButton } from "@/jm";
import { Printer, Loader2 } from "lucide-react";

interface Issuer {
  name: string;
  ceo?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

interface SupplierInfo {
  name: string;
  representative?: string | null;
  businessNumber?: string | null;
}

export type ShippingMethodPdf =
  | "COURIER"
  | "DIRECT_DELIVERY"
  | "QUICK_OR_CARGO"
  | "OTHER_SUPPLIER"
  | "PICKUP";

const SHIPPING_LABELS_PDF: Record<ShippingMethodPdf, string> = {
  COURIER: "택배 출고",
  DIRECT_DELIVERY: "직접 배달",
  QUICK_OR_CARGO: "퀵 · 용달",
  OTHER_SUPPLIER: "다른 거래처 출고",
  PICKUP: "직접 수령 (매장 픽업)",
};

export interface PurchaseOrderPdfItem {
  name: string;
  spec?: string | null;
  supplierCode?: string | null;
  unitOfMeasure: string;
  priceUndetermined?: boolean;
  quantity: string | number;
  unitPrice: string | number;
  totalPrice: string | number;
}

export interface PurchaseOrderPdfProps {
  documentNo: string;
  orderDate: string;
  expectedDate?: string | null;
  shippingMethod?: ShippingMethodPdf | null;
  promisedDate?: string | null;
  shippingMemo?: string | null;
  issuer: Issuer | null;
  supplier: SupplierInfo;
  items: PurchaseOrderPdfItem[];
  subtotalAmount: string | number;
  taxAmount: string | number;
  totalAmount: string | number;
  memo?: string | null;
  autoPrint?: boolean;
}

const fmt = (v: string | number) =>
  Math.round(parseFloat(String(v))).toLocaleString("ko-KR");
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });

// 토큰 페이지 디자인 토큰을 PDF 색상 팔레트로 매핑
const C = {
  bg: "#f7f7f8",         // page bg (light)
  card: "#ffffff",       // card bg
  cardMuted: "#f4f4f5",  // table header / footer band
  border: "#e4e4e7",
  borderStrong: "#d4d4d8",
  text: "#111111",
  textMuted: "#6b7280",
  textSubtle: "#9ca3af",
  accent: "#111111",
};

const s = StyleSheet.create({
  page: {
    padding: 32,
    fontFamily: "Pretendard",
    fontSize: 10,
    color: C.text,
    backgroundColor: C.bg,
  },
  // 헤더
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: "bold", letterSpacing: 0.5 },

  // 카드
  card: {
    backgroundColor: C.card,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: C.border,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 0.5,
    borderColor: C.border,
  },
  cardHeaderTitle: { fontSize: 11, fontWeight: "bold", color: C.text },
  cardHeaderRight: { fontSize: 11, color: C.text, fontFamily: "Helvetica" },

  cardBody: { paddingHorizontal: 14, paddingVertical: 10 },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2.5,
  },
  rowLabel: { color: C.textMuted, fontSize: 10 },
  rowValue: { color: C.text, fontSize: 10 },
  rowValueBold: { color: C.text, fontSize: 10, fontWeight: "bold" },

  // 항목 표
  itemTable: {
    backgroundColor: C.card,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: C.border,
    overflow: "hidden",
    marginBottom: 12,
  },
  itemTableHeader: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderColor: C.border,
  },
  itemTableHeaderTitle: { fontSize: 11, fontWeight: "bold" },

  itemHeadRow: {
    flexDirection: "row",
    backgroundColor: C.cardMuted,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  itemHeadCell: {
    fontSize: 9,
    color: C.textMuted,
    fontWeight: "bold",
  },
  itemRow: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderTopWidth: 0.5,
    borderColor: C.border,
    minHeight: 22,
  },
  cellName: { width: "38%", paddingRight: 6 },
  cellCode: { width: "16%", paddingRight: 6 },
  cellQty: { width: "14%", textAlign: "right", paddingRight: 6 },
  cellUnitPrice: { width: "16%", textAlign: "right", paddingRight: 6 },
  cellTotal: { width: "16%", textAlign: "right" },

  itemName: { fontSize: 10, fontWeight: "bold", color: C.text },
  itemSpec: { fontSize: 8.5, color: C.textMuted, marginTop: 1 },

  // 합계
  totalsBand: {
    backgroundColor: C.cardMuted,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 0.5,
    borderColor: C.border,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 1.5,
  },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingTop: 6,
    marginTop: 4,
    borderTopWidth: 0.5,
    borderColor: C.border,
  },
  grandLabel: { fontSize: 10, fontWeight: "bold" },
  grandValue: { fontSize: 13, fontWeight: "bold", color: C.text },

  // 메모
  memoCard: {
    backgroundColor: C.card,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: C.border,
    padding: 12,
    marginBottom: 12,
  },
  memoTitle: { fontSize: 10, fontWeight: "bold", marginBottom: 4 },
  memoBody: { fontSize: 9.5, color: C.text, lineHeight: 1.4 },

  footer: {
    marginTop: 8,
    fontSize: 8,
    color: C.textSubtle,
    textAlign: "center",
  },
});

function PdfDoc(props: PurchaseOrderPdfProps) {
  const subtotal = parseFloat(String(props.subtotalAmount));
  const tax = parseFloat(String(props.taxAmount));
  const grand = parseFloat(String(props.totalAmount));

  return (
    <Document title={`발주서_${props.supplier.name}_${props.documentNo}`}>
      <Page size="A4" style={s.page}>
        {/* 헤더 */}
        <View style={s.header}>
          <Text style={s.title}>발주서</Text>
        </View>

        {/* 발주번호 / 일자 */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardHeaderTitle}>발주번호</Text>
            <Text style={s.cardHeaderRight}>{props.documentNo}</Text>
          </View>
          <View style={s.cardBody}>
            <View style={s.row}>
              <Text style={s.rowLabel}>발주일</Text>
              <Text style={s.rowValue}>{fmtDate(props.orderDate)}</Text>
            </View>
            {props.expectedDate && (
              <View style={s.row}>
                <Text style={s.rowLabel}>입고 희망일</Text>
                <Text style={s.rowValue}>{fmtDate(props.expectedDate)}</Text>
              </View>
            )}
            {props.shippingMethod && (
              <View style={s.row}>
                <Text style={s.rowLabel}>출고 방법</Text>
                <Text style={s.rowValue}>{SHIPPING_LABELS_PDF[props.shippingMethod]}</Text>
              </View>
            )}
            {props.promisedDate && (
              <View style={s.row}>
                <Text style={s.rowLabel}>납기일</Text>
                <Text style={s.rowValue}>{fmtDate(props.promisedDate)}</Text>
              </View>
            )}
            {props.shippingMemo && (
              <View style={s.row}>
                <Text style={s.rowLabel}>출고 메모</Text>
                <Text style={s.rowValue}>{props.shippingMemo}</Text>
              </View>
            )}
          </View>
        </View>

        {/* 발주자 */}
        {props.issuer && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Text style={s.cardHeaderTitle}>발주자</Text>
            </View>
            <View style={s.cardBody}>
              <View style={s.row}>
                <Text style={s.rowLabel}>상호</Text>
                <Text style={s.rowValueBold}>{props.issuer.name}</Text>
              </View>
              {props.issuer.ceo && (
                <View style={s.row}>
                  <Text style={s.rowLabel}>대표자</Text>
                  <Text style={s.rowValue}>{props.issuer.ceo}</Text>
                </View>
              )}
              {props.issuer.phone && (
                <View style={s.row}>
                  <Text style={s.rowLabel}>연락처</Text>
                  <Text style={s.rowValue}>{props.issuer.phone}</Text>
                </View>
              )}
              {props.issuer.address && (
                <View style={s.row}>
                  <Text style={s.rowLabel}>주소</Text>
                  <Text style={s.rowValue}>{props.issuer.address}</Text>
                </View>
              )}
              {props.issuer.email && (
                <View style={s.row}>
                  <Text style={s.rowLabel}>이메일</Text>
                  <Text style={s.rowValue}>{props.issuer.email}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* 수신자 */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardHeaderTitle}>수신자 (귀사)</Text>
          </View>
          <View style={s.cardBody}>
            <View style={s.row}>
              <Text style={s.rowLabel}>상호</Text>
              <Text style={s.rowValueBold}>{props.supplier.name}</Text>
            </View>
            {props.supplier.representative && (
              <View style={s.row}>
                <Text style={s.rowLabel}>대표자</Text>
                <Text style={s.rowValue}>{props.supplier.representative}</Text>
              </View>
            )}
            {props.supplier.businessNumber && (
              <View style={s.row}>
                <Text style={s.rowLabel}>사업자번호</Text>
                <Text style={s.rowValue}>{props.supplier.businessNumber}</Text>
              </View>
            )}
          </View>
        </View>

        {/* 항목 */}
        <View style={s.itemTable}>
          <View style={s.itemTableHeader}>
            <Text style={s.itemTableHeaderTitle}>발주 항목 ({props.items.length}건)</Text>
          </View>
          <View style={s.itemHeadRow}>
            <Text style={[s.itemHeadCell, s.cellName]}>품명</Text>
            <Text style={[s.itemHeadCell, s.cellCode]}>품번</Text>
            <Text style={[s.itemHeadCell, s.cellQty]}>수량</Text>
            <Text style={[s.itemHeadCell, s.cellUnitPrice]}>단가</Text>
            <Text style={[s.itemHeadCell, s.cellTotal]}>금액</Text>
          </View>
          {props.items.map((it, i) => (
            <View key={i} style={s.itemRow}>
              <View style={s.cellName}>
                <Text style={s.itemName}>{it.name}</Text>
                {it.spec && <Text style={s.itemSpec}>{it.spec}</Text>}
              </View>
              <Text style={[s.cellCode, { fontSize: 9, color: C.textMuted }]}>
                {it.supplierCode ?? "-"}
              </Text>
              <Text style={s.cellQty}>
                {fmt(it.quantity)} {it.unitOfMeasure}
              </Text>
              <Text style={s.cellUnitPrice}>
                {it.priceUndetermined ? "가격 미정" : `₩${fmt(it.unitPrice)}`}
              </Text>
              <Text style={s.cellTotal}>
                {it.priceUndetermined ? "미정" : `₩${fmt(it.totalPrice)}`}
              </Text>
            </View>
          ))}

          <View style={s.totalsBand}>
            <View style={s.totalRow}>
              <Text style={s.rowLabel}>공급가액</Text>
              <Text style={s.rowValue}>₩{fmt(subtotal)}</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={s.rowLabel}>부가세 (10%)</Text>
              <Text style={s.rowValue}>₩{fmt(tax)}</Text>
            </View>
            <View style={s.grandRow}>
              <Text style={s.grandLabel}>합계</Text>
              <Text style={s.grandValue}>₩{fmt(grand)}</Text>
            </View>
          </View>
        </View>

        {/* 메모 */}
        {props.memo && (
          <View style={s.memoCard}>
            <Text style={s.memoTitle}>메모</Text>
            <Text style={s.memoBody}>{props.memo}</Text>
          </View>
        )}

        <Text style={s.footer}>발주번호 {props.documentNo} · 발주일 {fmtDate(props.orderDate)}</Text>
      </Page>
    </Document>
  );
}

export function PurchaseOrderPdf(props: PurchaseOrderPdfProps) {
  const doc = useMemo(() => <PdfDoc {...props} />, [JSON.stringify(props)]);
  const [generating, setGenerating] = useState(false);
  const autoPrintedRef = useRef(false);

  useEffect(() => {
    document.title = `발주서_${props.supplier.name}_${props.documentNo}`;
  }, [props.supplier.name, props.documentNo]);

  const buildBlob = async () => {
    const instance = pdf();
    instance.updateContainer(doc);
    const blob = await instance.toBlob();
    return URL.createObjectURL(blob);
  };

  const handleExport = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const url = await buildBlob();
      window.open(url, "_blank");
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.error("PDF 생성 실패", e);
      alert("PDF 생성에 실패했습니다");
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    if (!props.autoPrint || autoPrintedRef.current) return;
    autoPrintedRef.current = true;
    const t = setTimeout(async () => {
      try {
        const url = await buildBlob();
        window.location.href = url;
      } catch (e) {
        if (process.env.NODE_ENV !== "production") console.error("PDF 자동 생성 실패", e);
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.autoPrint]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: 12,
          backgroundColor: "#fff",
          borderBottom: "1px solid #ddd",
        }}
      >
        <JmButton
          variant="cta"
          onClick={handleExport}
          disabled={generating}
        >
          {generating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Printer className="h-4 w-4 mr-2" />
          )}
          {generating ? "PDF 생성 중..." : "PDF 생성"}
        </JmButton>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <PDFViewer width="100%" height="100%" showToolbar>
          {doc}
        </PDFViewer>
      </div>
    </div>
  );
}
