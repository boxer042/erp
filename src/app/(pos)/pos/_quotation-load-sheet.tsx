"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { apiGet, ApiError } from "@/lib/api-client";
import {
  useSessions,
  type CartItem,
} from "@/components/pos/sessions-context";
import { genClientId } from "@/lib/utils";
import { BottomSheet } from "./_components/bottom-sheet";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 카트 세션 — customerId 로 견적서 필터, items replace 대상 */
  sessionId: string;
  customerId: string;
  /** 현재 카트 아이템 수 — 비어있지 않으면 confirm 노출 */
  cartItemCount: number;
}

interface QuotationListItem {
  id: string;
  quotationNo: string;
  status:
    | "DRAFT"
    | "SENT"
    | "ACCEPTED"
    | "REJECTED"
    | "EXPIRED"
    | "CONVERTED";
  issueDate: string;
  totalAmount: string;
  title: string | null;
  _count: { items: number };
  customer?: { name: string } | null;
}

interface QuotationDetailItem {
  id: string;
  productId: string | null;
  name: string;
  spec: string | null;
  unitOfMeasure: string;
  quantity: string;
  listPrice: string;
  discountAmount: string;
  unitPrice: string;
  isTaxable: boolean;
  product: {
    id: string;
    name: string;
    sku: string;
    taxType: "TAXABLE" | "TAX_FREE";
    zeroRateEligible: boolean;
    isBulk: boolean;
    unitOfMeasure: string;
    productType:
      | "FINISHED"
      | "PARTS"
      | "SET"
      | "ASSEMBLED"
      | "OPTION_PARENT";
    media: Array<{ url: string }>;
  } | null;
}

interface QuotationDetail {
  id: string;
  quotationNo: string;
  items: QuotationDetailItem[];
}

const STATUS_LABEL: Record<QuotationListItem["status"], string> = {
  DRAFT: "임시",
  SENT: "발송",
  ACCEPTED: "승인",
  REJECTED: "거절",
  EXPIRED: "만료",
  CONVERTED: "전환됨",
};

/**
 * 견적서 → 카트 로드 시트.
 * 고객의 SALES 견적서 목록을 보여주고, 선택 시 카트 라인을 일괄 교체한다.
 *  - free-text 라인(productId 없음) 은 스킵 (POS 카트는 product 라인 only)
 *  - OPTION_PARENT 라인은 그대로 카트에 추가 (결제 직전 SWAP 옵션 선택 강제)
 *  - 할인은 quotation discountAmount 가 있으면 정액 문자열로 그대로 적용
 */
export function QuotationLoadSheet(props: Props) {
  if (!props.open) return null;
  return <Body {...props} />;
}

function Body({
  onOpenChange,
  sessionId,
  customerId,
  cartItemCount,
}: Props) {
  const { replaceItems } = useSessions();
  const [pickingId, setPickingId] = useState<string | null>(null);

  const listQuery = useQuery<QuotationListItem[]>({
    queryKey: ["pos", "quotation-load", customerId],
    queryFn: () =>
      apiGet<QuotationListItem[]>(
        `/api/quotations?type=SALES&customerId=${encodeURIComponent(
          customerId,
        )}`,
      ),
    staleTime: 1000 * 30,
  });

  const list = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  const handlePick = async (id: string) => {
    if (cartItemCount > 0) {
      const ok = window.confirm(
        "현재 카트의 라인이 모두 교체됩니다. 계속할까요?",
      );
      if (!ok) return;
    }
    setPickingId(id);
    try {
      const detail = await apiGet<QuotationDetail>(`/api/quotations/${id}`);
      const items: CartItem[] = [];
      let skipped = 0;
      for (const it of detail.items) {
        if (!it.productId || !it.product) {
          skipped++;
          continue;
        }
        const qtyNum = Number(it.quantity);
        const unitPriceNum = Number(it.unitPrice);
        const listPriceNum = Number(it.listPrice);
        const discount = Number(it.discountAmount) > 0
          ? String(Math.round(Number(it.discountAmount)))
          : "0";
        items.push({
          cartItemId: genClientId(),
          productId: it.product.id,
          itemType: "product",
          name: it.product.name,
          sku: it.product.sku,
          imageUrl: it.product.media[0]?.url ?? null,
          unitPrice: Math.round(unitPriceNum),
          listPrice:
            listPriceNum > 0 ? Math.round(listPriceNum) : undefined,
          quantity: qtyNum,
          discount,
          taxType: it.product.taxType,
          zeroRateEligible: it.product.zeroRateEligible,
          isBulk: it.product.isBulk,
          unitOfMeasure: it.product.unitOfMeasure,
          isOptionParent: it.product.productType === "OPTION_PARENT",
        });
      }
      if (items.length === 0) {
        toast.error(
          "이 견적서엔 카트로 옮길 수 있는 상품 라인이 없습니다",
        );
        setPickingId(null);
        return;
      }
      replaceItems(items, sessionId);
      toast.success(
        `${detail.quotationNo} — ${items.length}개 라인 카트로 불러옴` +
          (skipped > 0 ? ` (자유입력 ${skipped}개 스킵)` : ""),
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "견적서 불러오기 실패",
      );
    } finally {
      setPickingId(null);
    }
  };

  return (
    <BottomSheet
      open
      onOpenChange={onOpenChange}
      title="견적서 불러오기"
      maxHeight="85vh"
      footer={
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          disabled={pickingId !== null}
          className="h-12 w-full rounded-2xl bg-[var(--jm-surface)] text-[14px] font-semibold text-[var(--jm-text)] border border-[var(--jm-border)] transition-colors active:bg-[var(--jm-bg)] disabled:opacity-50"
        >
          닫기
        </button>
      }
    >
      <div className="flex flex-col gap-2 pb-2">
        {listQuery.isPending ? (
          <SkeletonList />
        ) : list.length === 0 ? (
          <div className="px-4 py-12 text-center text-[13px] text-[var(--jm-text-subtle)]">
            이 고객으로 발행된 견적서가 없습니다
          </div>
        ) : (
          list.map((q) => (
            <button
              key={q.id}
              type="button"
              disabled={pickingId !== null}
              onClick={() => handlePick(q.id)}
              className="flex flex-col gap-1 rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] px-4 py-3 text-left transition-colors active:bg-[var(--jm-surface-muted)] disabled:opacity-50 sm:hover:bg-[var(--jm-bg)]"
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[13px] font-semibold text-[var(--jm-text)]">
                    {q.quotationNo}
                  </span>
                  <span className="rounded-full bg-[var(--jm-surface-muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--jm-text-muted)]">
                    {STATUS_LABEL[q.status]}
                  </span>
                </div>
                <span className="tabular-nums text-[15px] font-bold text-[var(--jm-text)]">
                  ₩{Math.round(Number(q.totalAmount)).toLocaleString("ko-KR")}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[12px] text-[var(--jm-text-muted)]">
                <span>
                  {format(new Date(q.issueDate), "yyyy년 M월 d일", {
                    locale: ko,
                  })}
                  {" · "}
                  {q._count.items}개 라인
                </span>
                {pickingId === q.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
              </div>
              {q.title ? (
                <span className="line-clamp-1 text-[12px] text-[var(--jm-text-subtle)]">
                  {q.title}
                </span>
              ) : null}
            </button>
          ))
        )}
      </div>
    </BottomSheet>
  );
}

function SkeletonList() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex h-20 animate-pulse flex-col gap-2 rounded-2xl bg-[var(--jm-surface-muted)] px-4 py-3"
        />
      ))}
    </>
  );
}
