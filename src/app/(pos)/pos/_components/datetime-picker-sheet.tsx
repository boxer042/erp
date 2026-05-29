"use client";

import { useState } from "react";
import { format } from "date-fns";
import { JmButton, JmCalendar } from "@/jm";
import { BottomSheet } from "./bottom-sheet";

/**
 * 날짜 + 시간 선택 시트 — pure UI, 저장 책임 없음.
 *
 * 사용처:
 *   - 수리 접수일시 편집 (ReceivedAtEditor 가 wrap)
 *   - POS 결제시간 편집
 *   - 그 외 "특정 시각을 손으로 잡고 싶다" 케이스
 *
 * Props:
 *   value      : 초기값 (필수)
 *   onConfirm  : [저장] 누름 — 새 Date 반환
 *   onClose    : 시트 닫힘 (백드롭/취소/저장 후 모두)
 *   title      : 시트 헤더 라벨 (예: "결제시간 변경")
 *   toDate     : 선택 가능 최대일 (기본: 오늘. POS 결제는 과거~오늘만 허용)
 *   pending    : 저장 진행 중 (외부 mutation 있을 때 — 버튼 disable 용)
 */
interface Props {
  value: Date;
  onConfirm: (next: Date) => void;
  onClose: () => void;
  title?: string;
  toDate?: Date;
  pending?: boolean;
}

export function DateTimePickerSheet({
  value,
  onConfirm,
  onClose,
  title = "일시 변경",
  toDate,
  pending,
}: Props) {
  const [date, setDate] = useState<Date>(value);
  const [time, setTime] = useState<string>(format(value, "HH:mm"));

  const handleConfirm = () => {
    const [h, m] = time.split(":").map((v) => parseInt(v, 10));
    const next = new Date(date);
    next.setHours(
      Number.isFinite(h) ? h : 0,
      Number.isFinite(m) ? m : 0,
      0,
      0,
    );
    onConfirm(next);
  };

  return (
    <BottomSheet
      open
      onOpenChange={(v) => !v && onClose()}
      title={title}
      footer={
        <div className="flex gap-2">
          <JmButton
            type="button"
            variant="outline"
            size="lg"
            onClick={onClose}
            className="flex-1"
            disabled={pending}
          >
            취소
          </JmButton>
          <JmButton
            type="button"
            variant="cta"
            size="lg"
            onClick={handleConfirm}
            className="flex-1"
            disabled={pending}
          >
            저장
          </JmButton>
        </div>
      }
    >
      <div className="flex flex-col gap-4 px-1 pt-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
            날짜
          </span>
          <JmCalendar
            value={date}
            onChange={(d) => d && setDate(d)}
            toDate={toDate ?? new Date()}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
            시간
          </span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="h-11 w-full rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface)] px-4 text-jm-base tabular-nums text-[var(--jm-text)] outline-none transition-colors hover:border-[var(--jm-border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--jm-ring)]"
          />
        </div>
      </div>
    </BottomSheet>
  );
}
