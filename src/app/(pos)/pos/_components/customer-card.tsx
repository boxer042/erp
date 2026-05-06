"use client";

import type { CartSession } from "@/components/pos/sessions-context";
import {
  deriveTempCode,
  deriveTempColor,
} from "@/components/pos/temp-customer";

interface Props {
  session: CartSession;
  onClick?: () => void;
  /** 추가 모드 — 우측 상단에 X 버튼 표시 */
  onClose?: () => void;
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
  return null; // 30일 넘으면 노이즈만 됨
}

/**
 * 손님 카드. 등록·미등록 모두 처리.
 * - 등록: 이름 + 전화 + 진행 카운트
 * - 미등록: #A2K + 컬러 아바타 + 진행 카운트
 */
export function CustomerCard({ session, onClick, onClose }: Props) {
  const isRegistered = !!session.customerId;
  const code = deriveTempCode(session.id);
  const palette = deriveTempColor(session.id);

  // 진행 카운트
  const productCount = session.items.filter((i) => i.itemType === "product").length;
  const repairCount = session.openRepairCount ?? 0;
  const rentalCount = session.items.filter((i) => i.itemType === "rental").length;
  const totalActive = productCount + repairCount + rentalCount;
  const activityLabel = relativeTime(session.updatedAt);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full flex-col gap-3 rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-4 text-left transition-all active:scale-[0.99] sm:hover:border-[var(--jm-border-strong)] sm:hover:shadow-sm"
      >
        <div className="flex items-start gap-3">
          {/* 아바타 — 기업이면 빌딩 아이콘, 개인이면 이름 첫글자, 미등록이면 컬러 코드 */}
          {isRegistered ? (
            session.customerType === "BUSINESS" ? (
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
                {(session.customerName ?? "?").charAt(0)}
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

          {/* 이름·전화 또는 임시 라벨 */}
          <div className="flex min-w-0 flex-1 flex-col">
            {isRegistered ? (
              <>
                <div className="flex items-center gap-1.5">
                  {session.customerType === "BUSINESS" && (
                    <span className="rounded-full bg-[var(--jm-warning-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--jm-warning-fg)]">
                      기업
                    </span>
                  )}
                  <span className="line-clamp-1 text-[16px] font-semibold text-[var(--jm-text)]">
                    {session.customerName}
                  </span>
                </div>
                {session.customerType === "BUSINESS" &&
                session.customerBusinessNumber ? (
                  <span className="font-mono text-[12px] text-[var(--jm-text-muted)]">
                    {session.customerBusinessNumber}
                  </span>
                ) : session.customerPhone ? (
                  <span className="font-mono text-[12px] text-[var(--jm-text-muted)]">
                    {session.customerPhone}
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

          {/* 진행 표시 */}
          {totalActive > 0 && (
            <div
              className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${palette.bg} text-white`}
            >
              {totalActive}
            </div>
          )}
        </div>

        {/* 카운트 라벨 — 빈/채워진 상태 모두 동일 높이 유지(카드 크기 일정) */}
        <div className="flex min-h-7 items-center justify-between gap-2">
          {totalActive > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {productCount > 0 && <Pill label="상품" count={productCount} />}
              {repairCount > 0 && <Pill label="수리" count={repairCount} highlight />}
              {rentalCount > 0 && <Pill label="임대" count={rentalCount} />}
            </div>
          ) : (
            <span className="text-[12px] text-[var(--jm-text-subtle)]">진행중 없음</span>
          )}
          {activityLabel && (
            <span className="shrink-0 text-[11px] text-[var(--jm-text-subtle)] tabular-nums">
              {activityLabel}
            </span>
          )}
        </div>
      </button>

      {/* X 버튼 — 카드 내 클릭 위로 */}
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
        highlight ? "bg-[var(--jm-warning-bg)] text-[var(--jm-warning-fg)]" : "bg-[var(--jm-surface-muted)] text-[var(--jm-text)]"
      }`}
    >
      {label}
      <span className="font-bold tabular-nums">{count}</span>
    </span>
  );
}
