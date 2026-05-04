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

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-left transition-all active:scale-[0.99] sm:hover:border-zinc-300 sm:hover:shadow-sm"
      >
        <div className="flex items-start gap-3">
          {/* 아바타 */}
          {isRegistered ? (
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[18px] font-bold text-zinc-700">
              {(session.customerName ?? "?").charAt(0)}
            </div>
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
                <span className="line-clamp-1 text-[16px] font-semibold text-zinc-900">
                  {session.customerName}
                </span>
                {session.customerPhone && (
                  <span className="font-mono text-[12px] text-zinc-500">
                    {session.customerPhone}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="text-[16px] font-semibold text-zinc-900">
                  미등록
                </span>
                <span className="font-mono text-[12px] text-zinc-500">
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

        {/* 카운트 라벨 */}
        {totalActive > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {productCount > 0 && <Pill label="상품" count={productCount} />}
            {repairCount > 0 && <Pill label="수리" count={repairCount} highlight />}
            {rentalCount > 0 && <Pill label="임대" count={rentalCount} />}
          </div>
        ) : (
          <div className="text-[12px] text-zinc-400">진행중 없음</div>
        )}
      </button>

      {/* X 버튼 — 카드 내 클릭 위로 */}
      {onClose && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-zinc-300 hover:bg-zinc-100 hover:text-zinc-700"
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
        highlight ? "bg-amber-100 text-amber-900" : "bg-zinc-100 text-zinc-700"
      }`}
    >
      {label}
      <span className="font-bold tabular-nums">{count}</span>
    </span>
  );
}
