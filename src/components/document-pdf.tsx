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
import { Button } from "@/components/ui/button";
import { Printer, Loader2 } from "lucide-react";

interface PartyInfo {
  name: string;
  businessNumber?: string | null;
  ceo?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  businessType?: string | null;
  businessItem?: string | null;
}

export interface DocumentPdfItem {
  name: string;
  spec?: string | null;
  unitOfMeasure: string;
  quantity: string | number;
  listPrice?: string | number;
  discountAmount?: string | number;
  unitPrice: string | number;
  totalPrice: string | number;
  isTaxable: boolean;
  memo?: string | null;
}

interface DocumentPdfProps {
  title: string;
  documentNo: string;
  issueDate: string;
  validUntil?: string | null;
  supplier: PartyInfo;
  buyer: PartyInfo;
  items: DocumentPdfItem[];
  subtotalAmount: string | number;
  taxAmount: string | number;
  totalAmount: string | number;
  memo?: string | null;
  terms?: string | null;
  autoPrint?: boolean;
  fillPage?: boolean;
  compactSupplier?: boolean;
  bankName?: string | null;
  bankHolder?: string | null;
  bankAccount?: string | null;
}

const fmt = (v: string | number) =>
  Math.round(parseFloat(String(v))).toLocaleString("ko-KR");

const BORDER = "#000";
const BW = 0.75;

const s = StyleSheet.create({
  page: {
    padding: 24,
    fontFamily: "Pretendard",
    fontSize: 9,
    color: "#000",
    backgroundColor: "#fff",
  },
  row: { flexDirection: "row" },
  title: { fontSize: 20, fontWeight: "bold", letterSpacing: 1 },
  bold: { fontWeight: "bold" },

  partyBox: { borderWidth: BW, borderColor: BORDER },
  partyHeader: {
    borderBottomWidth: BW,
    borderColor: BORDER,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 9,
    fontWeight: "bold",
  },
  tdLabel: {
    paddingHorizontal: 4,
    paddingVertical: 3,
    fontSize: 9,
    fontWeight: "bold",
  },
  tdValue: {
    paddingHorizontal: 5,
    paddingVertical: 3,
    fontSize: 9,
  },

  // item table
  itemTable: { borderWidth: BW, borderColor: BORDER },
  itemHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: BW,
    borderColor: BORDER,
    minHeight: 18,
  },
  itemRow: {
    flexDirection: "row",
    borderBottomWidth: BW,
    borderColor: BORDER,
    minHeight: 18,
  },
  itemCell: {
    paddingHorizontal: 3,
    paddingVertical: 4,
    fontSize: 8.5,
    borderRightWidth: BW,
    borderColor: BORDER,
    justifyContent: "center",
  },
  itemCellLast: {
    paddingHorizontal: 3,
    paddingVertical: 4,
    fontSize: 8.5,
    justifyContent: "center",
  },

  stampCircle: {
    width: 40,
    height: 40,
    borderWidth: BW,
    borderStyle: "dashed",
    borderColor: "#888",
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    right: 6,
    top: "50%",
    marginTop: -20,
    backgroundColor: "#fff",
  },
});

const COLS = [4, 17, 12, 6, 7, 11, 8, 11, 13, 11]; // percentages, sum=100

function PartyCompact({ label, info }: { label: string; info: PartyInfo }) {
  const rows: { label: string; value: string; bold?: boolean }[] = [];
  if (info.businessNumber) rows.push({ label: "등록번호", value: info.businessNumber });
  rows.push({ label: "사업장명", value: info.name, bold: true });
  if (info.ceo) rows.push({ label: "대표자", value: info.ceo });
  if (info.address) rows.push({ label: "사업자주소", value: info.address });
  if (info.businessType) rows.push({ label: "업태", value: info.businessType });
  if (info.businessItem) rows.push({ label: "종목", value: info.businessItem });
  if (info.phone) rows.push({ label: "연락처", value: info.phone });
  if (info.email) rows.push({ label: "이메일", value: info.email });

  return (
    <View style={[s.partyBox, { position: "relative" }]}>
      <Text style={s.partyHeader}>{label}</Text>
      {rows.map((r, i) => {
        const isLast = i === rows.length - 1;
        return (
          <View
            key={r.label}
            style={[
              s.row,
              !isLast ? { borderBottomWidth: BW, borderColor: BORDER } : {},
            ]}
          >
            <Text
              style={[
                s.tdLabel,
                {
                  width: "32%",
                  borderRightWidth: BW,
                  borderColor: BORDER,
                  fontSize: 11,
                },
              ]}
            >
              {r.label}
            </Text>
            <Text
              style={[
                s.tdValue,
                { width: "68%", fontSize: 11 },
                r.bold ? s.bold : {},
              ]}
            >
              {r.value}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function PartyStandard({ label, info }: { label: string; info: PartyInfo }) {
  const fullRow = (labelText: string, value: string, last?: boolean) => (
    <View
      key={labelText}
      style={[
        s.row,
        last ? {} : { borderBottomWidth: BW, borderColor: BORDER },
      ]}
    >
      <Text
        style={[
          s.tdLabel,
          { width: "18%", borderRightWidth: BW, borderColor: BORDER },
        ]}
      >
        {labelText}
      </Text>
      <Text style={[s.tdValue, { width: "82%" }]}>{value}</Text>
    </View>
  );

  const pairRow = (
    labelA: string,
    valueA: string,
    labelB: string,
    valueB: string,
    opts?: { boldA?: boolean; last?: boolean },
  ) => (
    <View
      key={labelA}
      style={[
        s.row,
        opts?.last ? {} : { borderBottomWidth: BW, borderColor: BORDER },
      ]}
    >
      <Text
        style={[
          s.tdLabel,
          { width: "18%", borderRightWidth: BW, borderColor: BORDER },
        ]}
      >
        {labelA}
      </Text>
      <Text
        style={[
          s.tdValue,
          opts?.boldA ? s.bold : {},
          { width: "32%", borderRightWidth: BW, borderColor: BORDER },
        ]}
      >
        {valueA}
      </Text>
      <Text
        style={[
          s.tdLabel,
          { width: "18%", borderRightWidth: BW, borderColor: BORDER },
        ]}
      >
        {labelB}
      </Text>
      <Text style={[s.tdValue, { width: "32%" }]}>{valueB}</Text>
    </View>
  );

  return (
    <View style={s.partyBox}>
      <Text style={s.partyHeader}>{label}</Text>
      <View>
        {fullRow("등록번호", info.businessNumber || "")}
        {pairRow("상호", info.name || "", "성명", info.ceo || "", { boldA: true })}
        {fullRow("사업자주소", info.address || "")}
        {pairRow("업태", info.businessType || "", "종목", info.businessItem || "")}
        {fullRow("연락처", info.phone || "")}
        {fullRow("이메일", info.email || "", true)}
      </View>
    </View>
  );
}

function ItemCell({
  widthPct,
  last,
  align,
  children,
}: {
  widthPct: number;
  last?: boolean;
  align?: "left" | "center" | "right";
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        last ? s.itemCellLast : s.itemCell,
        { width: `${widthPct}%` },
      ]}
    >
      <Text style={{ textAlign: align || "left", fontSize: 8.5 }}>
        {children}
      </Text>
    </View>
  );
}

function PdfContent(props: DocumentPdfProps) {
  const totalDiscount = props.items.reduce((sum, it) => {
    const disc = parseFloat(String(it.discountAmount ?? "0")) || 0;
    const qty = parseFloat(String(it.quantity));
    return sum + disc * qty;
  }, 0);

  const bankParts = [props.bankName, props.bankHolder, props.bankAccount].filter(
    Boolean,
  );
  const bankLine = bankParts.join(" ");

  const isCompact = !!props.compactSupplier;

  const docTitle = `${props.supplier.name}_${props.buyer.name}_${props.documentNo}`;

  return (
    <Document title={docTitle}>
      <Page size="A4" style={s.page}>
        {/* 상단 헤더 */}
        {isCompact ? (
          <View style={{ marginBottom: 14 }}>
            <View
              style={[
                s.row,
                { justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
              ]}
            >
              <Text style={s.title}>{props.title}</Text>
            </View>
            <View style={[s.row, { gap: 10 }]}>
              {/* 좌측 */}
              <View style={{ width: "58%" }}>
                <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 2 }}>
                  {props.buyer.name || ""} 귀중
                </Text>
                {props.buyer.phone ? (
                  <View style={[s.row, { marginBottom: 2 }]}>
                    <Text style={{ width: 56, fontSize: 11 }}>연락처</Text>
                    <Text style={{ fontSize: 11 }}>{props.buyer.phone}</Text>
                  </View>
                ) : null}
                <View
                  style={{
                    borderTopWidth: BW,
                    borderColor: BORDER,
                    marginBottom: 4,
                  }}
                />
                <Text style={{ fontSize: 11, marginBottom: 6 }}>
                  {props.title === "견적서"
                    ? "요청하신 상품에 대하여 아래와 같이 견적 합니다."
                    : "아래와 같이 거래 내역을 명세 합니다."}
                </Text>
                <InfoRow
                  label={props.title === "견적서" ? "견적번호" : "명세서번호"}
                  value={props.documentNo}
                />
                <InfoRow
                  label={props.title === "견적서" ? "견적일자" : "발행일자"}
                  value={props.issueDate.slice(0, 10)}
                />
                {props.validUntil ? (
                  <InfoRow label="유효기간" value={props.validUntil.slice(0, 10)} />
                ) : null}
                {props.terms ? (
                  <InfoRow label="결제/납기조건" value={props.terms} />
                ) : null}
              </View>
              {/* 우측 */}
              <View style={{ width: "42%" }}>
                <PartyCompact label="공급자" info={props.supplier} />
              </View>
            </View>
          </View>
        ) : (
          <View style={{ marginBottom: 14 }}>
            <View
              style={[
                s.row,
                { justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
              ]}
            >
              <Text style={s.title}>{props.title}</Text>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontSize: 10 }}>
                  <Text style={{ color: "#000" }}>문서번호 </Text>
                  {props.documentNo}
                </Text>
                <Text style={{ fontSize: 10 }}>
                  <Text style={{ color: "#000" }}>발행일자 </Text>
                  {props.issueDate.slice(0, 10)}
                </Text>
                {props.validUntil ? (
                  <Text style={{ fontSize: 10 }}>
                    <Text style={{ color: "#000" }}>유효기간 </Text>
                    {props.validUntil.slice(0, 10)}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={[s.row, { gap: 10 }]}>
              <View style={{ width: "50%" }}>
                <PartyStandard label="공급자" info={props.supplier} />
              </View>
              <View style={{ width: "50%" }}>
                <PartyStandard label="공급받는자" info={props.buyer} />
              </View>
            </View>
          </View>
        )}

        {/* 합계 금액 박스 */}
        <View
          style={{
            borderWidth: BW,
            borderColor: BORDER,
            flexDirection: "row",
            marginBottom: 10,
          }}
        >
          <View style={{ width: "40%", paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ fontSize: 10, fontWeight: "bold" }}>합계 금액</Text>
          </View>
          <View
            style={{
              width: "60%",
              paddingHorizontal: 10,
              paddingVertical: 6,
              flexDirection: "row",
              justifyContent: "flex-end",
              alignItems: "baseline",
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "bold", letterSpacing: 1 }}>
              ₩{fmt(props.totalAmount)}
            </Text>
            <Text style={{ marginLeft: 6, fontSize: 8 }}>(VAT 포함)</Text>
          </View>
        </View>

        {/* 품목 테이블 */}
        <View style={s.itemTable}>
          {/* Header */}
          <View style={s.itemHeaderRow}>
            <ItemCell widthPct={COLS[0]} align="center">#</ItemCell>
            <ItemCell widthPct={COLS[1]} align="left">품명</ItemCell>
            <ItemCell widthPct={COLS[2]} align="left">규격</ItemCell>
            <ItemCell widthPct={COLS[3]} align="center">단위</ItemCell>
            <ItemCell widthPct={COLS[4]} align="right">수량</ItemCell>
            <ItemCell widthPct={COLS[5]} align="right">단가</ItemCell>
            <ItemCell widthPct={COLS[6]} align="right">할인</ItemCell>
            <ItemCell widthPct={COLS[7]} align="right">실제단가</ItemCell>
            <ItemCell widthPct={COLS[8]} align="right">공급가액</ItemCell>
            <ItemCell widthPct={COLS[9]} align="right" last>세액</ItemCell>
          </View>

          {/* Body */}
          {props.items.map((it, idx) => {
            const qty = parseFloat(String(it.quantity));
            const supply = parseFloat(String(it.totalPrice));
            const taxAmount = it.isTaxable ? supply * 0.1 : 0;
            const disc = parseFloat(String(it.discountAmount ?? "0")) || 0;
            const list = parseFloat(String(it.listPrice ?? it.unitPrice)) || 0;
            const actual = parseFloat(String(it.unitPrice));
            const isLast = idx === props.items.length - 1;
            return (
              <View
                key={idx}
                style={[
                  s.itemRow,
                  isLast ? { borderBottomWidth: 0 } : {},
                ]}
              >
                <ItemCell widthPct={COLS[0]} align="center">{idx + 1}</ItemCell>
                <ItemCell widthPct={COLS[1]} align="left">{it.name}</ItemCell>
                <ItemCell widthPct={COLS[2]} align="left">{it.spec || ""}</ItemCell>
                <ItemCell widthPct={COLS[3]} align="center">{it.unitOfMeasure}</ItemCell>
                <ItemCell widthPct={COLS[4]} align="right">
                  {qty.toLocaleString("ko-KR")}
                </ItemCell>
                <ItemCell widthPct={COLS[5]} align="right">{fmt(list)}</ItemCell>
                <ItemCell widthPct={COLS[6]} align="right">
                  {disc > 0 ? fmt(disc) : ""}
                </ItemCell>
                <ItemCell widthPct={COLS[7]} align="right">{fmt(actual)}</ItemCell>
                <ItemCell widthPct={COLS[8]} align="right">{fmt(supply)}</ItemCell>
                <ItemCell widthPct={COLS[9]} align="right" last>
                  {taxAmount > 0 ? fmt(taxAmount) : ""}
                </ItemCell>
              </View>
            );
          })}
        </View>

        {/* fillPage filler */}
        {props.fillPage ? (
          <View
            style={{
              flexGrow: 1,
              borderLeftWidth: BW,
              borderRightWidth: BW,
              borderColor: BORDER,
            }}
          />
        ) : null}

        {/* 합계 5-column */}
        <View
          style={{
            flexDirection: "row",
            borderWidth: BW,
            borderColor: BORDER,
          }}
        >
          <SumCell label="품목수" value={`${props.items.length}건`} />
          <SumCell label="공급가액" value={`₩${fmt(props.subtotalAmount)}`} />
          <SumCell
            label="세액"
            value={
              parseFloat(String(props.taxAmount)) > 0
                ? `₩${fmt(props.taxAmount)}`
                : ""
            }
          />
          <SumCell
            label="할인합계"
            value={totalDiscount > 0 ? `-₩${fmt(totalDiscount)}` : ""}
          />
          <SumCell
            label="합계금액"
            value={`₩${fmt(props.totalAmount)}`}
            bold
            last
          />
        </View>

        {/* 비고 / 계좌번호 */}
        <View
          style={{
            flexDirection: "row",
            borderLeftWidth: BW,
            borderRightWidth: BW,
            borderBottomWidth: BW,
            borderColor: BORDER,
            minHeight: 24,
          }}
        >
          <View
            style={{
              width: "50%",
              borderRightWidth: BW,
              borderColor: BORDER,
              paddingHorizontal: 6,
              paddingVertical: 4,
            }}
          >
            <Text style={{ fontSize: 9 }}>비고 :</Text>
          </View>
          <View
            style={{
              width: "50%",
              paddingHorizontal: 6,
              paddingVertical: 4,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 9, marginRight: 3 }}>계좌번호 :</Text>
            <Text style={{ fontSize: 9 }}>{bankLine}</Text>
          </View>
        </View>

        {/* 하단 memo/terms (비컴팩트 전용) */}
        {!isCompact && (props.memo || props.terms) ? (
          <View style={{ marginTop: 12 }}>
            {props.terms ? (
              <Text style={{ fontSize: 10, marginBottom: 4 }}>
                결제/납기 조건: {props.terms}
              </Text>
            ) : null}
            {props.memo ? (
              <Text style={{ fontSize: 10 }}>비고: {props.memo}</Text>
            ) : null}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={[s.row, { marginBottom: 1 }]}>
      <Text style={{ width: 90, fontSize: 11 }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 11 }}>{value}</Text>
    </View>
  );
}

function SumCell({
  label,
  value,
  bold,
  last,
}: {
  label: string;
  value: string;
  bold?: boolean;
  last?: boolean;
}) {
  return (
    <View
      style={{
        width: "20%",
        paddingHorizontal: 5,
        paddingVertical: 4,
        borderRightWidth: last ? 0 : BW,
        borderColor: BORDER,
        flexDirection: "row",
        justifyContent: "space-between",
      }}
    >
      <Text style={{ fontSize: 9 }}>{label}</Text>
      <Text style={{ fontSize: 9, fontWeight: bold ? "bold" : "normal" }}>
        {value}
      </Text>
    </View>
  );
}

export function DocumentPdf(props: DocumentPdfProps) {
  const doc = useMemo(() => <PdfContent {...props} />, [JSON.stringify(props)]);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const autoPrintedRef = useRef(false);

  useEffect(() => {
    document.title = `${props.supplier.name}_${props.buyer.name}_${props.documentNo}`;
  }, [props.supplier.name, props.buyer.name, props.documentNo]);

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
        <Button
          onClick={handleExport}
          disabled={generating}
          className="bg-black text-white hover:bg-black/80"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Printer className="h-4 w-4 mr-2" />
          )}
          {generating ? "PDF 생성 중..." : "PDF 생성"}
        </Button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <PDFViewer width="100%" height="100%" showToolbar>
          {doc}
        </PDFViewer>
      </div>
    </div>
  );
}
