"use client";

import type { RepairTicketDetail } from "./_types";

const STEPPER_LABELS: Record<string, string> = {
  RECEIVED: "접수",
  DIAGNOSING: "진단",
  QUOTED: "견적",
  APPROVED: "승인",
  REPAIRING: "수리중",
  READY: "완료",
  PICKED_UP: "픽업",
};

/**
 * 진행 단계 stepper — 점+연결선 + 현재 단계 라벨 + n/m.
 * standalone 헤더 + customer 통일 헤더(가운데) 양쪽이 공유.
 */
export function StatusStepperBar({
  status,
  type,
}: {
  status: RepairTicketDetail["status"];
  type: RepairTicketDetail["type"];
}) {
  const steps: string[] =
    type === "ON_SITE"
      ? ["RECEIVED", "REPAIRING", "READY", "PICKED_UP"]
      : ["RECEIVED", "DIAGNOSING", "QUOTED", "APPROVED", "REPAIRING", "READY", "PICKED_UP"];

  const currentIndex = steps.indexOf(status);
  const activeIdx = Math.max(0, currentIndex);
  const currentLabel = STEPPER_LABELS[status] ?? status;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center">
        {steps.map((s, i) => {
          const done = i < activeIdx;
          const active = i === activeIdx;
          const isLast = i === steps.length - 1;
          return (
            <div
              key={s}
              className={isLast ? "flex shrink-0 items-center" : "flex flex-1 items-center"}
            >
              <span
                aria-label={s}
                className={`shrink-0 rounded-full transition-all ${
                  active
                    ? "size-2.5 bg-[var(--jm-action)] ring-2 ring-[var(--jm-action)]/30"
                    : done
                      ? "size-2 bg-[var(--jm-action)]"
                      : "size-2 bg-[var(--jm-border)]"
                }`}
              />
              {!isLast && (
                <span
                  className={`h-0.5 flex-1 transition-colors ${
                    done || active ? "bg-[var(--jm-action)]" : "bg-[var(--jm-border)]"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-baseline justify-between gap-2 text-jm-2xs">
        <span className="font-medium text-[var(--jm-action)]">{currentLabel}</span>
        <span className="text-[var(--jm-text-subtle)]">
          {activeIdx + 1}/{steps.length}
        </span>
      </div>
    </div>
  );
}
