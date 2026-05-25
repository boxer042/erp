"use client";

import {
  deriveTempCode,
  deriveTempColor,
} from "@/components/pos/temp-customer";

/**
 * POS·ERP 공용 고객 카드 데이터.
 * `id` 는 미등록 임시 코드/컬러 시드용 — POS 세션 ID 또는 ERP 의 draft slot ID 사용.
 * `activeCount`/`updatedAt` 은 POS 다중 세션 흐름 한정 (ERP 는 생략 가능).
 */
export interface CustomerCardData {
  /** 임시 코드 시드 — POS 세션 ID 또는 ERP draft 식별자 */
  id: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerType?: "INDIVIDUAL" | "BUSINESS";
  customerBusinessNumber?: string | null;
  /** 진행중 카운트 — POS 만 의미. ERP 에선 undefined (영역 자체 hidden) */
  activeCount?: { product: number; repair: number; rental: number };
  /** 마지막 활동 ISO — POS 다중 세션 한정 표시 */
  updatedAt?: string;
}

interface Props {
  data: CustomerCardData;
  onClick?: () => void;
  /** 추가 모드 — 우측 상단에 X 버튼 표시 (POS 다중 세션 닫기용) */
  onClose?: () => void;
  /** activeCount/updatedAt/카운트 영역 숨기기 — ERP 단일 흐름에서 사용 */
  hideMeta?: boolean;
}

/** 마지막 활동 시각을 상대 표현으로 ("방금"/"5분 전"/"2시간 전"/"3일 전") */
function relativeTime(iso?: string): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  const diffMs = Date.now() - t;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "방금";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}일 전`;
  return null;
}

/**
 * 고객 카드. 등록·미등록 모두 처리. POS·ERP 양쪽에서 사용 (공용).
 *  - 등록: 아바타(기업 빌딩 / 개인 첫글자) + 이름 + 사업자번호/전화
 *  - 미등록: 컬러 코드 아바타 + #코드 + "미등록"
 *  - hideMeta=false (기본): 진행 카운트 + 활동 시각 노출 (POS)
 *  - hideMeta=true        : 카운트·시각 영역 숨김 (ERP 단일 흐름)
 *
 * 한쪽 디자인 수정 시 양쪽에 자동 적용.
 */
export function CustomerSummaryCard({ data, onClick, onClose, hideMeta }: Props) {
  const isRegistered = !!data.customerId;
  const code = deriveTempCode(data.id);
  const palette = deriveTempColor(data.id);

  const productCount = data.activeCount?.product ?? 0;
  const repairCount = data.activeCount?.repair ?? 0;
  const rentalCount = data.activeCount?.rental ?? 0;
  const totalActive = productCount + repairCount + rentalCount;
  const activityLabel = relativeTime(data.updatedAt);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full flex-col gap-3 rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-4 text-left transition-all active:scale-[0.99] sm:hover:border-[var(--jm-border-strong)] sm:hover:shadow-sm"
      >
        <div className="flex items-start gap-3">
          {/* 아바타 */}
          {isRegistered ? (
            data.customerType === "BUSINESS" ? (
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--jm-warning-bg)] text-[var(--jm-warning-fg)]">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M3 21V7l9-4 9 4v14M9 21V11h6v10"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            ) : (
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--jm-surface-muted)] text-[18px] font-bold text-[var(--jm-text)]">
                {(data.customerName ?? "?").charAt(0)}
              </div>
            )
          ) : (
            <div
              className={`flex size-12 shrink-0 items-center justify-center rounded-full text-white ${palette.bg}`}
            >
              <span className="font-mono text-[13px] font-bold tracking-wider">
                {code}
              </span>
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            {isRegistered ? (
              <>
                <div className="flex items-center gap-1.5">
                  {data.customerType === "BUSINESS" && (
                    <span className="rounded-full bg-[var(--jm-warning-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--jm-warning-fg)]">
                      기업
                    </span>
                  )}
                  <span className="line-clamp-1 text-[16px] font-semibold text-[var(--jm-text)]">
                    {data.customerName}
                  </span>
                </div>
                {data.customerType === "BUSINESS" && data.customerBusinessNumber ? (
                  <span className="font-mono text-[12px] text-[var(--jm-text-muted)]">
                    {data.customerBusinessNumber}
                  </span>
                ) : data.customerPhone ? (
                  <span className="font-mono text-[12px] text-[var(--jm-text-muted)]">
                    {data.customerPhone}
                  </span>
                ) : null}
              </>
            ) : (
              <>
                <span className="text-[16px] font-semibold text-[var(--jm-text)]">
                  미등록
                </span>
                <span className="font-mono text-[12px] text-[var(--jm-text-muted)]">
                  #{code}
                </span>
              </>
            )}
          </div>
        </div>

        {/* 카운트 + 활동 시각 — POS 다중 세션 한정. hideMeta=true 시 숨김 */}
        {!hideMeta && (
          <div className="flex min-h-7 items-center justify-between gap-2">
            {totalActive > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {productCount > 0 && <Pill label="상품" count={productCount} />}
                {repairCount > 0 && (
                  <Pill label="수리" count={repairCount} highlight />
                )}
                {rentalCount > 0 && <Pill label="임대" count={rentalCount} />}
              </div>
            ) : (
              <span className="text-[12px] text-[var(--jm-text-subtle)]">
                진행중 없음
              </span>
            )}
            {activityLabel && (
              <span className="shrink-0 text-[11px] text-[var(--jm-text-subtle)] tabular-nums">
                {activityLabel}
              </span>
            )}
          </div>
        )}
      </button>

      {onClose && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-[var(--jm-text-disabled)] hover:bg-[var(--jm-surface-muted)] hover:text-[var(--jm-text)]"
          aria-label="닫기"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M3 3l8 8M11 3l-8 8"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

function Pill({
  label,
  count,
  highlight,
}: {
  label: string;
  count: number;
  highlight?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${
        highlight
          ? "bg-[var(--jm-warning-bg)] text-[var(--jm-warning-fg)]"
          : "bg-[var(--jm-surface-muted)] text-[var(--jm-text)]"
      }`}
    >
      {label}
      <span className="font-bold tabular-nums">{count}</span>
    </span>
  );
}
