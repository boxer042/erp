"use client";

import * as React from "react";
import { Toaster, toast as sonnerToast } from "sonner";
import { cn } from "@/jm/lib/cn";

/**
 * Sonner 기반 토스트. jm 토큰/폰트 적용.
 * 페이지 루트에 한 번 두면 됨.
 *
 *   <JmToaster />
 *
 * 사용:
 *   import { jmToast } from "@/jm";
 *   jmToast.success("저장되었습니다");
 *   jmToast.error("저장 실패", { description: "..." });
 */
export type JmToasterProps = React.ComponentProps<typeof Toaster>;

export function JmToaster({
  position = "top-right",
  richColors = true,
  className,
  toastOptions,
  ...rest
}: JmToasterProps) {
  return (
    <Toaster
      position={position}
      richColors={richColors}
      className={cn(className)}
      toastOptions={{
        ...toastOptions,
        classNames: {
          toast:
            "!font-[family-name:var(--jm-font-sans)] !rounded-xl !bg-[var(--jm-surface)] !text-[var(--jm-text)] !ring-1 !ring-[var(--jm-border)] !shadow-[var(--jm-shadow-lg)]",
          title: "!text-jm-base !font-semibold",
          description: "!text-jm-sm !text-[var(--jm-text-muted)]",
          actionButton:
            "!bg-[var(--jm-action)] !text-[var(--jm-action-fg)] !rounded-lg !px-3 !py-1.5 !text-jm-xs !font-medium",
          cancelButton:
            "!bg-[var(--jm-surface-muted)] !text-[var(--jm-text)] !rounded-lg !px-3 !py-1.5 !text-jm-xs !font-medium",
          ...(toastOptions?.classNames ?? {}),
        },
      }}
      {...rest}
    />
  );
}

/**
 * Sonner toast API 그대로 re-export. 별칭으로 jmToast 라는 이름 부여.
 *
 *   jmToast("기본 알림")
 *   jmToast.success("성공")
 *   jmToast.error("에러", { description: "..." })
 *   jmToast.info("정보")
 *   jmToast.warning("경고")
 *   jmToast.promise(myPromise, { loading, success, error })
 */
export const jmToast = sonnerToast;
