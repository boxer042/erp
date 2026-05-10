"use client";

import { useEffect, useRef, useState } from "react";
import { JmScope } from "@/jm";
import { cn } from "@/lib/utils";
import type {
  ScrollyHeroBlock,
  StickyFeatureBlock,
  ParallaxBlock,
} from "@/lib/validators/landing-block";

const HERO_HEIGHT: Record<ScrollyHeroBlock["height"], string> = {
  md: "h-[420px] md:h-[540px]",
  lg: "h-[560px] md:h-[720px]",
  screen: "h-[100svh]",
};

const PARALLAX_HEIGHT: Record<ParallaxBlock["height"], string> = {
  md: "h-[420px] md:h-[540px]",
  lg: "h-[560px] md:h-[720px]",
};

function useInView<T extends HTMLElement>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true);
      },
      { threshold: 0.2, ...options },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [options]);
  return { ref, inView };
}

export function ScrollyHeroBlockView({ block }: { block: ScrollyHeroBlock }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const color =
    block.textColor === "dark" ? "text-[var(--jm-text)]" : "text-white";
  const overlay =
    block.textColor === "light" && block.imageUrl ? "bg-black/35" : "";

  return (
    <JmScope theme="light" className="w-full">
      <section
        ref={ref}
        className={cn("relative w-full overflow-hidden", HERO_HEIGHT[block.height])}
      >
        {block.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={block.imageUrl}
            alt={block.headline || ""}
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] ease-out",
              inView ? "scale-100" : "scale-110",
            )}
          />
        ) : (
          <div className="absolute inset-0 bg-[var(--jm-surface-muted)]" />
        )}
        {overlay && <div className={cn("absolute inset-0", overlay)} />}
        <div
          className={cn(
            "relative z-10 flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center md:px-16",
            color,
          )}
        >
          {block.headline && (
            <h2
              className={cn(
                "text-3xl font-bold leading-tight tracking-tight transition-all duration-700 ease-out md:text-5xl lg:text-6xl",
                inView ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
              )}
            >
              {block.headline}
            </h2>
          )}
          {block.subheadline && (
            <p
              className={cn(
                "max-w-2xl text-jm-base leading-relaxed opacity-90 transition-all delay-150 duration-700 ease-out md:text-jm-md",
                inView ? "translate-y-0 opacity-90" : "translate-y-6 opacity-0",
              )}
            >
              {block.subheadline}
            </p>
          )}
        </div>
      </section>
    </JmScope>
  );
}

export function StickyFeatureBlockView({ block }: { block: StickyFeatureBlock }) {
  const panels = block.panels.filter((p) => p.imageUrl);
  if (panels.length === 0) {
    return (
      <JmScope theme="light" className="w-full">
        <div className="mx-auto flex h-48 w-full max-w-3xl items-center justify-center rounded-2xl bg-[var(--jm-surface-muted)] text-jm-sm text-[var(--jm-text-muted)]">
          패널 이미지를 추가하세요
        </div>
      </JmScope>
    );
  }
  const textOnLeft = block.textPosition === "left";

  return (
    <JmScope theme="light" className="w-full">
      <section className="relative w-full">
        <div
          className={cn(
            "mx-auto flex max-w-7xl flex-col gap-8 px-6 py-12 md:flex-row md:gap-16 md:px-12 md:py-20",
            !textOnLeft && "md:flex-row-reverse",
          )}
        >
          {/* sticky 텍스트 */}
          <div className="md:sticky md:top-16 md:h-fit md:w-1/3 md:self-start">
            <div className="space-y-4">
              {block.heading && (
                <h3 className="text-2xl font-bold tracking-tight text-[var(--jm-text)] md:text-3xl">
                  {block.heading}
                </h3>
              )}
              {block.body && (
                <p className="whitespace-pre-wrap text-jm-base leading-relaxed text-[var(--jm-text-muted)]">
                  {block.body}
                </p>
              )}
            </div>
          </div>
          {/* 스크롤 패널 */}
          <div className="flex flex-1 flex-col gap-6">
            {panels.map((p, i) => (
              <StickyPanel key={i} url={p.imageUrl} alt={p.alt} />
            ))}
          </div>
        </div>
      </section>
    </JmScope>
  );
}

function StickyPanel({ url, alt }: { url: string; alt: string }) {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.15 });
  return (
    <div
      ref={ref}
      className={cn(
        "overflow-hidden rounded-2xl bg-[var(--jm-surface-muted)] shadow-[var(--jm-shadow-sm)] transition-all duration-700 ease-out",
        inView ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className="block h-auto w-full" />
    </div>
  );
}

export function ParallaxBlockView({ block }: { block: ParallaxBlock }) {
  const color =
    block.textColor === "dark" ? "text-[var(--jm-text)]" : "text-white";
  const overlay =
    block.textColor === "light" && block.imageUrl ? "bg-black/40" : "";

  return (
    <JmScope theme="light" className="w-full">
      <section
        className={cn(
          "relative w-full overflow-hidden",
          PARALLAX_HEIGHT[block.height],
        )}
      >
        {block.imageUrl ? (
          <div
            className="absolute inset-0 bg-cover bg-fixed bg-center"
            style={{ backgroundImage: `url(${block.imageUrl})` }}
            aria-label={block.headline || ""}
          />
        ) : (
          <div className="absolute inset-0 bg-[var(--jm-surface-muted)]" />
        )}
        {overlay && <div className={cn("absolute inset-0", overlay)} />}
        <div
          className={cn(
            "relative z-10 flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center md:px-16",
            color,
          )}
        >
          {block.headline && (
            <h2 className="text-3xl font-bold leading-tight tracking-tight md:text-5xl lg:text-6xl">
              {block.headline}
            </h2>
          )}
          {block.subheadline && (
            <p className="max-w-2xl text-jm-base leading-relaxed opacity-90 md:text-jm-md">
              {block.subheadline}
            </p>
          )}
        </div>
      </section>
    </JmScope>
  );
}
