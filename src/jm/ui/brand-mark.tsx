"use client";

import * as React from "react";
import { cn } from "@/jm/lib/cn";

/**
 * 브랜드/제품 모노그램 마크 — 사이드바 헤더, 빈 상태, 알림 source, 카드 헤더 등에 사용.
 * 사람 아바타가 아니라 **브랜드/제품/조직** 시그널 (square/squircle 가 기본 형태).
 *
 * 텍스트 모드:  <JmBrandMark text="jm" />          // 그대로 노출 (대소문자 보존)
 * 아이콘 모드:  <JmBrandMark icon={<Box />} />      // 텍스트 대신 아이콘
 *
 * shape:
 *   square    — rounded-md (기본). 모던/단정
 *   round     — rounded-full. 사람 아바타와 헷갈릴 수 있어 가급적 비추
 *   squircle  — rounded-2xl. Apple 스타일, 큰 size 에서 자연스러움
 *
 * variant:
 *   solid     — bg = tone solid 색, fg = 보색. 강한 시선 앵커 (헤더, 빈 상태)
 *   subtle    — bg = tone bg, fg = tone fg. 리스트에 항목별로 깔 때
 *   outline   — ring + tone fg. 페이퍼/카드 위에 가볍게
 *
 * tone:
 *   default — 모노톤 (--jm-action). 라이트=검정 면, 다크=흰 면 자동
 *   success/warning/danger/info/accent — 의미 색
 *
 * 다크 모드: 전부 `--jm-*` 토큰 기반이라 `<JmScope theme="dark">` 안에서 자동 변환.
 */

export type JmBrandMarkSize = "xs" | "sm" | "md" | "lg" | "xl";
export type JmBrandMarkVariant = "solid" | "subtle" | "outline";
export type JmBrandMarkTone =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "accent";
export type JmBrandMarkShape = "square" | "round" | "squircle";

export interface JmBrandMarkProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "children"> {
  /** 모노그램 텍스트 — 1~3자 권장. 대소문자 그대로 보존. */
  text?: string;
  /** 텍스트 대신 아이콘 (text 와 같이 주면 아이콘 우선). */
  icon?: React.ReactNode;
  size?: JmBrandMarkSize;
  variant?: JmBrandMarkVariant;
  tone?: JmBrandMarkTone;
  shape?: JmBrandMarkShape;
  /** href 주면 <a> 로 렌더, 없으면 <span>. 헤더 브랜드 → 홈 링크 패턴용. */
  href?: string;
  /** 접근성 라벨 — 미지정 시 text 그대로. */
  "aria-label"?: string;
}

// ─── size mapping ─────────────────────────────────────────────────────────
const sizeMap: Record<
  JmBrandMarkSize,
  { box: string; text: string; iconBox: string }
> = {
  xs: { box: "size-5", text: "text-[9px]", iconBox: "[&_svg]:size-3" },
  sm: { box: "size-7", text: "text-[11px]", iconBox: "[&_svg]:size-4" },
  md: { box: "size-10", text: "text-[14px]", iconBox: "[&_svg]:size-5" },
  lg: { box: "size-14", text: "text-[18px]", iconBox: "[&_svg]:size-7" },
  xl: { box: "size-20", text: "text-[26px]", iconBox: "[&_svg]:size-10" },
};

const shapeMap: Record<JmBrandMarkShape, string> = {
  square: "rounded-md",
  round: "rounded-full",
  squircle: "rounded-2xl",
};

// ─── tone × variant matrix ────────────────────────────────────────────────
function getToneClass(
  tone: JmBrandMarkTone,
  variant: JmBrandMarkVariant,
): string {
  if (tone === "default") {
    if (variant === "solid")
      return "bg-[var(--jm-action)] text-[var(--jm-action-fg)]";
    if (variant === "subtle")
      return "bg-[var(--jm-surface-muted)] text-[var(--jm-text)]";
    return "ring-1 ring-inset ring-[var(--jm-border-strong)] text-[var(--jm-text)]";
  }
  // semantic tones — bg/fg/solid 토큰 사용
  if (variant === "solid")
    return cn(
      tone === "success" && "bg-[var(--jm-success-solid)]",
      tone === "warning" && "bg-[var(--jm-warning-solid)]",
      tone === "danger" && "bg-[var(--jm-danger-solid)]",
      tone === "info" && "bg-[var(--jm-info-solid)]",
      tone === "accent" && "bg-[var(--jm-accent-solid)]",
      "text-white",
    );
  if (variant === "subtle")
    return cn(
      tone === "success" && "bg-[var(--jm-success-bg)] text-[var(--jm-success-fg)]",
      tone === "warning" && "bg-[var(--jm-warning-bg)] text-[var(--jm-warning-fg)]",
      tone === "danger" && "bg-[var(--jm-danger-bg)] text-[var(--jm-danger-fg)]",
      tone === "info" && "bg-[var(--jm-info-bg)] text-[var(--jm-info-fg)]",
      tone === "accent" && "bg-[var(--jm-accent-bg)] text-[var(--jm-accent-fg)]",
    );
  // outline
  return cn(
    "ring-1 ring-inset",
    tone === "success" && "ring-[var(--jm-success-fg)] text-[var(--jm-success-fg)]",
    tone === "warning" && "ring-[var(--jm-warning-fg)] text-[var(--jm-warning-fg)]",
    tone === "danger" && "ring-[var(--jm-danger-fg)] text-[var(--jm-danger-fg)]",
    tone === "info" && "ring-[var(--jm-info-fg)] text-[var(--jm-info-fg)]",
    tone === "accent" && "ring-[var(--jm-accent-fg)] text-[var(--jm-accent-fg)]",
  );
}

export const JmBrandMark = React.forwardRef<HTMLElement, JmBrandMarkProps>(
  (
    {
      text,
      icon,
      size = "sm",
      variant = "solid",
      tone = "default",
      shape = "square",
      href,
      className,
      "aria-label": ariaLabel,
      ...props
    },
    ref,
  ) => {
    const dims = sizeMap[size];
    const classes = cn(
      "inline-flex shrink-0 items-center justify-center font-bold leading-none select-none",
      "transition-colors",
      dims.box,
      icon ? dims.iconBox : dims.text,
      shapeMap[shape],
      getToneClass(tone, variant),
      href && "outline-none focus-visible:ring-2 focus-visible:ring-[var(--jm-ring)] hover:opacity-90",
      className,
    );

    const content = icon ? (
      <span aria-hidden className="flex items-center justify-center">
        {icon}
      </span>
    ) : (
      <span aria-hidden>{text}</span>
    );

    const computedAriaLabel =
      ariaLabel ?? (typeof text === "string" ? text : undefined);

    if (href) {
      return (
        <a
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={href}
          aria-label={computedAriaLabel}
          className={classes}
          {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
        >
          {content}
        </a>
      );
    }

    return (
      <span
        ref={ref as React.Ref<HTMLSpanElement>}
        role={icon ? "img" : undefined}
        aria-label={computedAriaLabel}
        className={classes}
        {...props}
      >
        {content}
      </span>
    );
  },
);
JmBrandMark.displayName = "JmBrandMark";
