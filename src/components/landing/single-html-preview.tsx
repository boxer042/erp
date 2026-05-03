"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 단일 HTML 모드 미리보기. 업로드된 HTML 안에 자동으로 주입된 postMessage
 * 스크립트로부터 콘텐츠 높이를 받아 iframe 을 동적으로 리사이즈.
 *
 * 짧은 HTML 이면 짧게, 긴 HTML 이면 길게 — 빈 공간 / 잘림 없음.
 */
interface Props {
  src: string;
  /** 측정 전 초기 최소 높이 (기본 100vh 와 동일하게 보이도록 큰 값) */
  initialHeight?: number;
  /** 측정 실패/지연 시 사용할 최소 높이 */
  minHeight?: number;
}

export function SingleHtmlPreview({
  src,
  initialHeight = 800,
  minHeight = 200,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      if (e.source !== iframe.contentWindow) return;
      const data = e.data as { type?: string; height?: number };
      if (data?.type !== "landing-html-resize") return;
      if (typeof data.height === "number" && data.height > 0) {
        setMeasuredHeight(Math.max(minHeight, Math.min(Math.ceil(data.height), 50000)));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [minHeight]);

  useEffect(() => {
    setMeasuredHeight(null);
  }, [src]);

  return (
    <iframe
      ref={iframeRef}
      src={src}
      sandbox="allow-scripts"
      loading="lazy"
      referrerPolicy="no-referrer"
      className="block w-full border-0"
      style={{ height: measuredHeight ?? initialHeight }}
      title="single-html-preview"
    />
  );
}
