"use client";

/**
 * POS·ERP 공용 카트 비어있음 안내.
 *
 * - 점선 border 사용 안 함 (디자인 정책)
 * - `customerId` 가 있고 `onLoadQuotation` 콜백이 주어지면
 *   "이전 견적서에서 불러오기" 버튼 노출 (POS 카트시트와 동일)
 * - `hint` 로 메인 텍스트 커스터마이즈 (기본: "카트가 비어 있습니다")
 *
 * 한쪽 디자인을 바꾸면 양쪽에 자동 적용됨 (POS 카트시트 + ERP 신규주문).
 */
interface Props {
  /** 등록 고객 ID — 있으면 견적서 불러오기 버튼 노출 */
  customerId?: string | null;
  onLoadQuotation?: () => void;
  /** 메인 안내 문구 — 페이지 컨텍스트에 맞게 override 가능 */
  hint?: string;
}

export function CartEmptyState({
  customerId,
  onLoadQuotation,
  hint = "카트가 비어 있습니다",
}: Props) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-[var(--jm-bg)] px-5 py-12 text-center">
      <span className="text-[13px] text-[var(--jm-text-subtle)]">{hint}</span>
      {customerId && onLoadQuotation && (
        <button
          type="button"
          onClick={onLoadQuotation}
          className="rounded-full border border-[var(--jm-border)] bg-[var(--jm-surface)] px-4 py-2 text-[12px] font-semibold text-[var(--jm-text)] active:bg-[var(--jm-bg)]"
        >
          이전 견적서에서 불러오기
        </button>
      )}
    </div>
  );
}
