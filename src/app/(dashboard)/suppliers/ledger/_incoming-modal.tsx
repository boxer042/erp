"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { computeShippingPerUnitDisplay } from "@/lib/incoming-shipping";
import {
  JmDialog,
  JmDialogContent,
  JmDialogHeader,
  JmDialogTitle,
  JmBadge,
  JmSkeleton,
} from "@/jm";
import type { IncomingDetail } from "@/app/(dashboard)/inventory/incoming/_types";
import {
  statusJmVariants,
  statusLabels,
} from "@/app/(dashboard)/inventory/incoming/_helpers";

const formatPrice = (price: string | number) =>
  (typeof price === "string" ? parseFloat(price) : price).toLocaleString("ko-KR");

/** 입고 거래명세서 — 입고 페이지 상세 패널과 동일한 레이아웃 (읽기 전용) */
function StatementBody({ detail }: { detail: IncomingDetail }) {
  const shippingMap = computeShippingPerUnitDisplay(
    detail.items.map((i) => ({
      id: i.id,
      quantity: parseFloat(i.quantity),
      totalPrice: parseFloat(i.totalPrice),
      itemShippingCost:
        i.itemShippingCost == null || i.itemShippingCost === ""
          ? null
          : parseFloat(i.itemShippingCost),
      itemShippingIsTaxable: i.itemShippingIsTaxable,
    })),
    {
      shippingCost: parseFloat(detail.shippingCost) || 0,
      shippingIsTaxable: detail.shippingIsTaxable,
      shippingDeducted: detail.shippingDeducted,
    },
  );
  const itemOverrideTotal = detail.items.reduce((sum, it) => {
    const v =
      it.itemShippingCost == null || it.itemShippingCost === ""
        ? 0
        : parseFloat(it.itemShippingCost);
    return sum + (v > 0 ? v : 0);
  }, 0);
  const dSupply = detail.items.reduce(
    (s, i) => s + parseFloat(i.quantity) * parseFloat(i.unitPrice),
    0,
  );
  const dTax = Math.round(dSupply * 0.1);
  const dDiscount = detail.items.reduce((s, i) => {
    const discPerUnit = i.discountAmount ? parseFloat(i.discountAmount) : 0;
    return s + discPerUnit * parseFloat(i.quantity);
  }, 0);

  return (
    <div className="border border-[var(--jm-border)] rounded-lg overflow-hidden min-w-[1200px]">
      <div className="grid grid-cols-2 border-b border-[var(--jm-border)]">
        <div className="border-r border-[var(--jm-border)]">
          <div className="bg-[var(--jm-surface-muted)] px-3 py-1.5 text-xs text-[var(--jm-text-muted)] font-medium border-b border-[var(--jm-border)]">공급자 (거래처)</div>
          <div className="p-3">
            <p className="text-base font-bold">{detail.supplier.name}</p>
            <p className="text-xs text-[var(--jm-text-muted)] mt-0.5">{detail.supplier.paymentMethod === "CREDIT" ? "외상" : "선불"}</p>
          </div>
        </div>
        <div>
          <div className="bg-[var(--jm-surface-muted)] px-3 py-1.5 text-xs text-[var(--jm-text-muted)] font-medium border-b border-[var(--jm-border)]">입고 정보</div>
          <div className="p-3 space-y-1.5 text-sm">
            <div className="flex items-center gap-2"><span className="text-xs text-[var(--jm-text-muted)] w-14 shrink-0">입고번호</span><span>{detail.incomingNo}</span></div>
            <div className="flex items-center gap-2"><span className="text-xs text-[var(--jm-text-muted)] w-14 shrink-0">입고일</span><span>{new Date(detail.incomingDate).toLocaleDateString("ko-KR")}</span></div>
            <div className="flex items-center gap-2"><span className="text-xs text-[var(--jm-text-muted)] w-14 shrink-0">등록자</span><span>{detail.createdBy.name}</span></div>
            {detail.memo && <div className="flex items-center gap-2"><span className="text-xs text-[var(--jm-text-muted)] w-14 shrink-0">비고</span><span>{detail.memo}</span></div>}
          </div>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs">
            <th className="border-r border-b border-[var(--jm-border)] w-[36px] py-2 text-center font-medium">번호</th>
            <th className="border-r border-b border-[var(--jm-border)] w-[130px] py-2 px-2 text-left font-medium">품번</th>
            <th className="border-r border-b border-[var(--jm-border)] py-2 px-2 text-left font-medium" style={{ width: "20%" }}>품명</th>
            <th className="border-r border-b border-[var(--jm-border)] py-2 px-2 text-left font-medium" style={{ width: "12%" }}>규격</th>
            <th className="border-r border-b border-[var(--jm-border)] w-[56px] py-2 text-center font-medium">단위</th>
            <th className="border-r border-b border-[var(--jm-border)] w-[80px] py-2 text-center font-medium">수량</th>
            <th className="border-r border-b border-[var(--jm-border)] w-[110px] py-2 text-center font-medium">단가</th>
            <th className="border-r border-b border-[var(--jm-border)] w-[90px] py-2 text-center font-medium">할인</th>
            <th className="border-r border-b border-[var(--jm-border)] w-[110px] py-2 text-center font-medium">실제단가</th>
            <th className="border-r border-b border-[var(--jm-border)] w-[120px] py-2 text-center font-medium">공급가액</th>
            <th className="border-r border-b border-[var(--jm-border)] w-[100px] py-2 text-center font-medium">세액</th>
            <th className="border-r border-b border-[var(--jm-border)] w-[140px] py-2 text-center font-medium">배송비(개당)</th>
            <th className="border-r border-b border-[var(--jm-border)] w-[80px] py-2 px-2 text-center font-medium">비고</th>
            <th className="border-b border-[var(--jm-border)] w-[60px] py-2 text-center font-medium">매핑</th>
          </tr>
        </thead>
        <tbody>
          {detail.items.map((item, idx) => {
            const qty = parseFloat(item.quantity);
            const up = parseFloat(item.unitPrice);
            const discPerUnit = item.discountAmount ? parseFloat(item.discountAmount) : 0;
            const origPrice = item.originalPrice ? parseFloat(item.originalPrice) : up + discPerUnit;
            const supplyLine = up * qty;
            const taxLine = Math.round(supplyLine * 0.1);
            const shipDisplay = shippingMap.get(item.id);
            return (
              <tr key={item.id} className="border-b border-[var(--jm-border)] last:border-b-0 hover:bg-[var(--jm-surface-muted)]/60">
                <td className="border-r border-[var(--jm-border)] text-center text-[var(--jm-text-muted)] py-1.5">{idx + 1}</td>
                <td className="border-r border-[var(--jm-border)] px-2 py-1.5 text-[var(--jm-text-muted)] text-xs">{item.supplierProduct.supplierCode || ""}</td>
                <td className="border-r border-[var(--jm-border)] px-2 py-1.5 font-medium">{item.supplierProduct.name}</td>
                <td className="border-r border-[var(--jm-border)] px-2 py-1.5 text-[var(--jm-text-muted)]">{item.supplierProduct.spec || ""}</td>
                <td className="border-r border-[var(--jm-border)] text-center text-[var(--jm-text-muted)] py-1.5">{item.supplierProduct.unitOfMeasure}</td>
                <td className="border-r border-[var(--jm-border)] text-right px-2 py-1.5 tabular-nums">{qty.toLocaleString()}</td>
                <td className="border-r border-[var(--jm-border)] text-right px-2 py-1.5 tabular-nums">{formatPrice(origPrice)}</td>
                <td className="border-r border-[var(--jm-border)] text-right px-2 py-1.5 tabular-nums">{discPerUnit > 0 && <span className="text-[var(--jm-danger-fg)]">-{formatPrice(discPerUnit)}</span>}</td>
                <td className="border-r border-[var(--jm-border)] text-right px-2 py-1.5 tabular-nums">{formatPrice(up)}</td>
                <td className="border-r border-[var(--jm-border)] text-right px-2 py-1.5 tabular-nums">{formatPrice(supplyLine)}</td>
                <td className="border-r border-[var(--jm-border)] text-right px-2 py-1.5 text-[var(--jm-text-muted)] tabular-nums">{formatPrice(taxLine)}</td>
                <td className="border-r border-[var(--jm-border)] px-2 py-1.5 text-right tabular-nums">
                  {shipDisplay && shipDisplay.perUnit > 0 ? (
                    <div className="flex items-center justify-end gap-1.5">
                      <span>₩{formatPrice(Math.round(shipDisplay.perUnit))}</span>
                      <span
                        className={`text-jm-3xs px-1 py-0.5 rounded ${
                          shipDisplay.source === "ITEM"
                            ? "bg-[var(--jm-info-bg)] text-[var(--jm-info-fg)]"
                            : shipDisplay.source === "ALLOCATED"
                              ? "bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)]"
                              : "bg-[var(--jm-warning-bg)] text-[var(--jm-warning-fg)]"
                        }`}
                      >
                        {shipDisplay.source === "ITEM"
                          ? "직접"
                          : shipDisplay.source === "ALLOCATED"
                            ? "분배"
                            : "차감"}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-[var(--jm-text-muted)]">
                      {shipDisplay?.source === "DEDUCTED" ? "차감(0)" : "—"}
                    </span>
                  )}
                </td>
                <td className="border-r border-[var(--jm-border)] px-2 py-1.5 text-[var(--jm-text-muted)]">{item.memo || ""}</td>
                <td className="text-center py-1.5">
                  {item.supplierProduct.productMappings && item.supplierProduct.productMappings.length > 0 ? (
                    <span className="text-xs text-[var(--jm-success-fg)]">&#10003;</span>
                  ) : (
                    <span className="text-xs text-[var(--jm-warning-fg)]">&#9888;</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="border-t border-[var(--jm-border)] bg-[var(--jm-surface-muted)]">
        <div className="grid grid-cols-5 text-sm">
          <div className="border-r border-[var(--jm-border)] px-3 py-2.5 flex items-center justify-between"><span className="text-xs text-[var(--jm-text-muted)]">품목수</span><span>{detail.items.length}건</span></div>
          <div className="border-r border-[var(--jm-border)] px-3 py-2.5 flex items-center justify-between"><span className="text-xs text-[var(--jm-text-muted)]">공급가액</span><span className="tabular-nums">₩{formatPrice(dSupply)}</span></div>
          <div className="border-r border-[var(--jm-border)] px-3 py-2.5 flex items-center justify-between"><span className="text-xs text-[var(--jm-text-muted)]">세액</span><span className="tabular-nums">{dTax > 0 ? `₩${formatPrice(dTax)}` : ""}</span></div>
          <div className="border-r border-[var(--jm-border)] px-3 py-2.5 flex items-center justify-between"><span className="text-xs text-[var(--jm-text-muted)]">할인합계</span><span className={`tabular-nums ${dDiscount > 0 ? "text-[var(--jm-danger-fg)]" : ""}`}>{dDiscount > 0 ? `-₩${formatPrice(dDiscount)}` : ""}</span></div>
          <div className="px-3 py-2.5 flex items-center justify-between"><span className="text-xs text-[var(--jm-text-muted)]">합계금액</span><span className="font-bold text-base tabular-nums">₩{formatPrice(dSupply + dTax)}</span></div>
        </div>
        {parseFloat(detail.shippingCost) > 0 && (
          <div className="border-t border-[var(--jm-border)] px-3 py-2 flex items-center justify-between text-sm">
            <span className="text-xs text-[var(--jm-text-muted)]">
              택배비{detail.shippingIsTaxable ? " (과세)" : " (면세)"}
              {detail.shippingDeducted && " · 차감"}
            </span>
            <span className="tabular-nums">₩{formatPrice(parseFloat(detail.shippingCost))}</span>
          </div>
        )}
        {itemOverrideTotal > 0 && (
          <div className="border-t border-[var(--jm-border)] px-3 py-2 flex items-center justify-between text-sm">
            <span className="text-xs text-[var(--jm-text-muted)]">품목 직접 운임 합계 (분배 제외)</span>
            <span className="tabular-nums">₩{formatPrice(itemOverrideTotal)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export interface IncomingStatementModalProps {
  incomingId: string | null;
  onClose: () => void;
}

/** 거래처 원장 품목별 뷰 — 품명 클릭 시 해당 입고 거래명세서를 모달로 표시 */
export function IncomingStatementModal({
  incomingId,
  onClose,
}: IncomingStatementModalProps) {
  const query = useQuery({
    queryKey: queryKeys.incoming.detail(incomingId ?? ""),
    queryFn: () => apiGet<IncomingDetail>(`/api/incoming/${incomingId}`),
    enabled: !!incomingId,
  });
  const detail = query.data ?? null;
  const loading = query.isFetching && !detail;

  return (
    <JmDialog open={!!incomingId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <JmDialogContent
        size="xl"
        className="max-w-[1280px] p-0"
        aria-describedby={undefined}
      >
        <JmDialogHeader className="border-b border-[var(--jm-border)] px-5 pb-3 pt-4 pr-12">
          <JmDialogTitle className="flex items-center gap-2 text-jm-sm">
            {detail ? (
              <>
                <span>{detail.incomingNo}</span>
                <JmBadge
                  variant={statusJmVariants[detail.status]}
                  size="sm"
                  shape="square"
                >
                  {statusLabels[detail.status]}
                </JmBadge>
              </>
            ) : (
              "거래명세서"
            )}
          </JmDialogTitle>
        </JmDialogHeader>
        <div className="flex-1 min-h-0 overflow-auto p-5">
          {loading ? (
            <JmSkeleton className="h-[420px] w-full rounded-lg" />
          ) : !detail ? (
            <p className="py-10 text-center text-jm-sm text-[var(--jm-text-muted)]">
              명세서를 불러올 수 없습니다
            </p>
          ) : (
            <StatementBody detail={detail} />
          )}
        </div>
      </JmDialogContent>
    </JmDialog>
  );
}
