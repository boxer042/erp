"use client";

import { useEffect, useRef, useState } from "react";
import { ScanLine, X } from "lucide-react";
import { toast } from "sonner";

// BarcodeDetector 타입 shim
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

export function BarcodeScannerButton({ onScan }: { onScan: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined" || !window.BarcodeDetector) {
        toast.error("이 브라우저는 바코드 스캔을 지원하지 않습니다");
        setOpen(false);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const detector = new window.BarcodeDetector!({
          formats: ["ean_13", "ean_8", "code_128", "code_39", "qr_code", "upc_a", "upc_e"],
        });
        const loop = async () => {
          if (!videoRef.current || !streamRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              onScan(codes[0].rawValue);
              setOpen(false);
              return;
            }
          } catch {}
          loopRef.current = window.setTimeout(loop, 300) as unknown as number;
        };
        loop();
      } catch {
        toast.error("카메라를 사용할 수 없습니다");
        setOpen(false);
      }
    })();
    return () => {
      cancelled = true;
      if (loopRef.current) window.clearTimeout(loopRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, onScan]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background hover:bg-muted/50"
        title="바코드 스캔"
      >
        <ScanLine className="h-5 w-5" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          <div className="relative w-full max-w-md overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} className="h-auto w-full" playsInline muted />
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-background/20 text-white hover:bg-background/30"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="p-3 text-center text-sm text-white">
              바코드를 화면 안쪽에 맞추세요
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
