"use client";

import * as React from "react";
import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { cn } from "@/jm/lib/cn";

export interface JmSliderProps
  extends Omit<React.ComponentProps<typeof SliderPrimitive.Root>, "render"> {
  size?: "sm" | "md";
  /** 현재 값 표시 라벨 — 트랙 위에 띄움 */
  showValue?: boolean;
  /** 값 → 표시 문자열 변환 */
  formatValue?: (v: number) => string;
}

/**
 * 슬라이더 — 단일/범위 (range) 모두 지원.
 * - 단일: <JmSlider value={50} onValueChange={...} />
 * - 범위: <JmSlider value={[20, 80]} onValueChange={...} />
 */
export const JmSlider = React.forwardRef<HTMLDivElement, JmSliderProps>(
  (
    {
      className,
      size = "md",
      showValue = false,
      formatValue,
      value,
      ...props
    },
    ref,
  ) => {
    const trackHeight = size === "sm" ? "h-1" : "h-1.5";
    const thumbSize = size === "sm" ? "size-4" : "size-5";

    const values = Array.isArray(value)
      ? value
      : value !== undefined
        ? [value]
        : [];

    return (
      <SliderPrimitive.Root
        ref={ref}
        value={value}
        className={cn(
          "relative flex w-full touch-none select-none items-center",
          className,
        )}
        {...props}
      >
        <SliderPrimitive.Control className="relative w-full">
          <SliderPrimitive.Track
            className={cn(
              "relative w-full grow overflow-hidden rounded-full bg-[var(--jm-surface-muted)]",
              trackHeight,
            )}
          >
            <SliderPrimitive.Indicator className="absolute h-full bg-[var(--jm-action)]" />
          </SliderPrimitive.Track>
          {values.map((_, i) => (
            <SliderPrimitive.Thumb
              key={i}
              index={i}
              className={cn(
                "block rounded-full border-2 border-[var(--jm-action)] bg-[var(--jm-surface)] shadow-[var(--jm-shadow-sm)] outline-none transition-transform focus-visible:ring-4 focus-visible:ring-[var(--jm-ring)] hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50",
                thumbSize,
              )}
            />
          ))}
          {showValue &&
            values.map((v, i) => (
              <div
                key={`label-${i}`}
                className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-md bg-[var(--jm-text)] px-1.5 py-0.5 text-jm-2xs font-medium tabular-nums text-[var(--jm-action-fg)]"
                style={{
                  left: `calc(${
                    ((v - (props.min ?? 0)) /
                      ((props.max ?? 100) - (props.min ?? 0))) *
                    100
                  }%)`,
                }}
              >
                {formatValue ? formatValue(v) : v}
              </div>
            ))}
        </SliderPrimitive.Control>
      </SliderPrimitive.Root>
    );
  },
);
JmSlider.displayName = "JmSlider";
