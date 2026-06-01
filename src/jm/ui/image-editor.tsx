"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import {
  Eraser,
  Loader2,
  RotateCcw,
  RotateCw,
  Sparkles,
  Sun,
  Undo2,
  ZoomIn,
} from "lucide-react";

import { JmButton } from "./button";
import { JmDialog, JmDialogContent, JmDialogTitle } from "./dialog";

// 출력 이미지의 긴 변 길이 (1024px 고정).
const LONG_SIDE = 1024;

function computeOutputSize(aspect: number) {
  if (aspect >= 1) {
    return { width: LONG_SIDE, height: Math.round(LONG_SIDE / aspect) };
  }
  return { width: Math.round(LONG_SIDE * aspect), height: LONG_SIDE };
}

interface AspectPreset {
  label: string;
  value: number;
}

const ASPECT_PRESETS: AspectPreset[] = [
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:4", value: 3 / 4 },
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
];

const CHECKER_BG: React.CSSProperties = {
  backgroundColor: "#fafafa",
  backgroundImage:
    "linear-gradient(45deg, #d4d4d8 25%, transparent 25%), linear-gradient(-45deg, #d4d4d8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d4d4d8 75%), linear-gradient(-45deg, transparent 75%, #d4d4d8 75%)",
  backgroundSize: "20px 20px",
  backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0",
};

export interface JmImageEditorProps {
  open: boolean;
  file: File | null;
  onConfirm: (edited: Blob, originalName: string) => void;
  onCancel: () => void;
  /** 기본 종횡비 (가로/세로). 미지정 시 1 (정사각형). */
  defaultAspect?: number;
  /** true면 비율 변경 UI를 숨겨 defaultAspect를 강제. 통일성이 중요한 영역(썸네일/카테고리)에서 사용. */
  lockAspect?: boolean;
  /**
   * AI 배경 제거 구현 주입 (선택). 제공 시 "AI 배경 제거" 버튼이 노출된다.
   * 미제공 시 버튼 숨김 — 무거운 ML 의존성(@imgly 등)을 jm 밖(호스트)에 둔다.
   */
  onRemoveBackground?: (input: Blob) => Promise<Blob>;
  /** 에러 메시지 핸들러 (선택) — 호스트의 toast 등에 연결. 미제공 시 무시. */
  onError?: (message: string) => void;
}

type PreviewSource = "bg-removal" | "manual";

/**
 * 이미지 편집 다이얼로그 — 크롭(react-easy-crop) + 회전·줌·밝기 + 지우개(canvas).
 *
 * 이식성을 위해 무거운/앱-특화 동작은 모두 prop 으로 주입한다:
 * - `onRemoveBackground` 제공 → "AI 배경 제거" 버튼 노출 (구현은 호스트)
 * - `onError` → 호스트 토스트에 연결
 * - 업로드/스토리지는 이 컴포넌트의 책임이 아님 — `onConfirm(blob, name)` 으로 결과만 넘긴다.
 *
 * react-easy-crop 은 optional peer dependency.
 */
export function JmImageEditor({
  open,
  file,
  onConfirm,
  onCancel,
  defaultAspect = 1,
  lockAspect = false,
  onRemoveBackground,
  onError,
}: JmImageEditorProps) {
  // Phase 1 (cropper) state
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [brightness, setBrightness] = useState(1);
  const [aspect, setAspect] = useState(defaultAspect);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const output = computeOutputSize(aspect);

  // Phase 2 (preview + erase) state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewSource, setPreviewSource] = useState<PreviewSource>("manual");
  const [bgProcessing, setBgProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [brushSize, setBrushSize] = useState(40);
  const [canUndo, setCanUndo] = useState(false);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const undoStackRef = useRef<ImageData[]>([]);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const isPreview = previewUrl !== null;
  const busy = bgProcessing || uploading;

  useEffect(() => {
    if (!file) {
      setImageSrc(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setBrightness(1);
    setAspect(defaultAspect);
    setPreviewUrl(null);
    setCroppedAreaPixels(null);
    return () => URL.revokeObjectURL(url);
  }, [file, defaultAspect]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const renderPreviewToCanvas = useCallback(async () => {
    if (!canvasRef.current || !previewUrl) return;
    const img = await loadImage(previewUrl);
    const canvas = canvasRef.current;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    undoStackRef.current = [];
    setCanUndo(false);
  }, [previewUrl]);

  useEffect(() => {
    if (previewUrl) renderPreviewToCanvas();
  }, [previewUrl, renderPreviewToCanvas]);

  const handleApplyBgRemoval = async () => {
    if (!imageSrc || !croppedAreaPixels || busy || !onRemoveBackground) return;
    setBgProcessing(true);
    try {
      const cropped = await getCroppedBlob(
        imageSrc,
        croppedAreaPixels,
        rotation,
        brightness,
        "image/png",
        output.width,
        output.height,
      );
      const removed = await onRemoveBackground(cropped);
      setPreviewSource("bg-removal");
      setPreviewUrl(URL.createObjectURL(removed));
    } catch (e) {
      console.error(e);
      onError?.("배경 제거에 실패했습니다");
    } finally {
      setBgProcessing(false);
    }
  };

  const handleEnterEraser = async () => {
    if (!imageSrc || !croppedAreaPixels || busy) return;
    try {
      const cropped = await getCroppedBlob(
        imageSrc,
        croppedAreaPixels,
        rotation,
        brightness,
        "image/png",
        output.width,
        output.height,
      );
      setPreviewSource("manual");
      setPreviewUrl(URL.createObjectURL(cropped));
    } catch (e) {
      console.error(e);
      onError?.("이미지 처리에 실패했습니다");
    }
  };

  const handleRevertPreview = () => {
    setPreviewUrl(null);
  };

  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (busy) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    undoStackRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
    setCanUndo(true);
    drawingRef.current = true;
    const { x, y } = getCanvasCoords(e);
    lastPointRef.current = { x, y };
    drawErase(ctx, x, y, x, y, brushSize);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setHoverPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (!drawingRef.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    const last = lastPointRef.current;
    drawErase(ctx, last?.x ?? x, last?.y ?? y, x, y, brushSize);
    lastPointRef.current = { x, y };
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    lastPointRef.current = null;
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
  };

  const handlePointerLeave = () => {
    setHoverPos(null);
  };

  const handleUndo = () => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const snapshot = stack.pop()!;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(snapshot, 0, 0);
    setCanUndo(stack.length > 0);
  };

  const handleResetErase = () => {
    renderPreviewToCanvas();
  };

  const handleConfirm = async () => {
    if (!file || busy) return;

    if (isPreview && canvasRef.current) {
      setUploading(true);
      try {
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvasRef.current!.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("toBlob 실패"))),
            "image/png",
          );
        });
        const baseName = file.name.replace(/\.[^.]+$/, "") || file.name;
        onConfirm(blob, `${baseName}.png`);
      } catch (e) {
        console.error(e);
        onError?.("이미지 처리에 실패했습니다");
      } finally {
        setUploading(false);
      }
      return;
    }

    if (!imageSrc || !croppedAreaPixels) return;
    setUploading(true);
    try {
      const blob = await getCroppedBlob(
        imageSrc,
        croppedAreaPixels,
        rotation,
        brightness,
        "image/jpeg",
        output.width,
        output.height,
      );
      onConfirm(blob, file.name);
    } catch (e) {
      console.error(e);
      onError?.("이미지 처리에 실패했습니다");
    } finally {
      setUploading(false);
    }
  };

  const fileLabel = file ? file.name : "";

  const liveCanvas = canvasRef.current;
  const brushDiamCss = liveCanvas
    ? brushSize * (liveCanvas.getBoundingClientRect().width / liveCanvas.width || 0)
    : brushSize;

  return (
    <JmDialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !busy) onCancel();
      }}
    >
      <JmDialogContent
        size="xl"
        className="p-0 gap-0 overflow-hidden"
        showCloseButton={false}
      >
        <JmDialogTitle className="px-4 py-3 border-b border-[var(--jm-border)] truncate text-jm-base">
          {fileLabel ? `이미지 편집 — ${fileLabel}` : "이미지 편집"}
        </JmDialogTitle>

        <div
          className="relative bg-black select-none mx-auto"
          style={{
            aspectRatio: aspect,
            width: aspect >= 1 ? "100%" : "auto",
            height: aspect >= 1 ? "auto" : "min(60vh, 600px)",
            maxHeight: "min(60vh, 600px)",
          }}
        >
          {isPreview ? (
            <div className="absolute inset-0" style={CHECKER_BG}>
              <canvas
                ref={canvasRef}
                className="size-full touch-none cursor-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={handlePointerLeave}
              />
              {hoverPos && brushDiamCss > 0 && (
                <div
                  className="pointer-events-none absolute rounded-full border-2 border-[var(--jm-info-fg)]/80 bg-[var(--jm-info-bg)]/40"
                  style={{
                    left: hoverPos.x - brushDiamCss / 2,
                    top: hoverPos.y - brushDiamCss / 2,
                    width: brushDiamCss,
                    height: brushDiamCss,
                  }}
                />
              )}
              {previewSource === "bg-removal" && (
                <div className="absolute top-2 right-2 rounded-md bg-[var(--jm-info-fg)]/90 px-2 py-1 text-jm-xs text-white">
                  <Sparkles className="inline size-3 mr-1" />
                  배경 제거 적용됨
                </div>
              )}
              <div className="absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-1 text-jm-xs text-white">
                <Eraser className="inline size-3 mr-1" />
                드래그로 지우기
              </div>
            </div>
          ) : (
            imageSrc && (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={aspect}
                minZoom={0.5}
                maxZoom={3}
                restrictPosition={false}
                showGrid
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                style={{ mediaStyle: { filter: `brightness(${brightness})` } }}
              />
            )
          )}
          {bgProcessing && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="size-8 animate-spin" />
                <p className="text-jm-sm">배경 분석 중...</p>
                <p className="text-jm-xs text-white/70">
                  첫 회는 모델 다운로드로 ~10초 소요
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 space-y-3 border-t border-[var(--jm-border)]">
          {isPreview ? (
            <>
              <div className="flex items-center gap-3">
                <Eraser className="size-4 text-[var(--jm-text-muted)]" />
                <span className="text-jm-xs text-[var(--jm-text-muted)] w-10">굵기</span>
                <input
                  type="range"
                  min={10}
                  max={200}
                  step={1}
                  value={brushSize}
                  onChange={(e) => setBrushSize(parseInt(e.target.value))}
                  className="flex-1 accent-[var(--jm-info-fg)]"
                  disabled={busy}
                  aria-label="지우개 굵기"
                />
                <span className="text-jm-xs tabular-nums w-12 text-right text-[var(--jm-text)]">
                  {brushSize}px
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <JmButton
                  variant="outline"
                  size="sm"
                  onClick={handleUndo}
                  disabled={busy || !canUndo}
                >
                  <Undo2 />
                  <span>되돌리기</span>
                </JmButton>
                <JmButton
                  variant="outline"
                  size="sm"
                  onClick={handleResetErase}
                  disabled={busy}
                >
                  <RotateCcw />
                  <span>지우기 초기화</span>
                </JmButton>
                <JmButton
                  variant="outline"
                  size="sm"
                  onClick={handleRevertPreview}
                  disabled={busy}
                >
                  처음부터 다시
                </JmButton>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-jm-xs text-[var(--jm-text-muted)] w-10">비율</span>
                {lockAspect ? (
                  <div className="text-jm-xs text-[var(--jm-text-muted)] bg-[var(--jm-surface-muted)] rounded px-2 py-1">
                    {ASPECT_PRESETS.find((p) => Math.abs(aspect - p.value) < 0.001)?.label
                      ?? aspect.toFixed(2)}{" "}
                    고정 (사용처 통일성 유지)
                  </div>
                ) : (
                  <div className="flex h-7 rounded-md border border-[var(--jm-border)] overflow-hidden text-jm-xs">
                    {ASPECT_PRESETS.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => {
                          setAspect(p.value);
                          setCrop({ x: 0, y: 0 });
                          setZoom(1);
                        }}
                        disabled={busy}
                        className={`px-2.5 transition-colors ${
                          Math.abs(aspect - p.value) < 0.001
                            ? "bg-[var(--jm-surface-muted)] text-[var(--jm-text)]"
                            : "text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface-muted)]/50"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
                <span className="text-jm-2xs text-[var(--jm-text-muted)] tabular-nums ml-auto">
                  {output.width} × {output.height}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <JmButton
                  variant="outline"
                  size="sm"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  disabled={busy}
                >
                  <RotateCw />
                  <span>90° 회전</span>
                </JmButton>
                <ZoomIn className="size-4 text-[var(--jm-text-muted)]" />
                <span className="text-jm-xs text-[var(--jm-text-muted)] w-10">크기</span>
                <input
                  type="range"
                  min={0.5}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="flex-1 accent-[var(--jm-info-fg)]"
                  disabled={busy}
                  aria-label="확대/축소"
                />
                <JmButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setZoom(1)}
                  disabled={busy}
                  title="100%로 복원"
                >
                  1:1
                </JmButton>
                <span className="text-jm-xs tabular-nums w-12 text-right text-[var(--jm-text)]">
                  {zoom.toFixed(2)}x
                </span>
              </div>

              <div className="flex items-center gap-3">
                <Sun className="size-4 text-[var(--jm-text-muted)]" />
                <span className="text-jm-xs text-[var(--jm-text-muted)] w-10">밝기</span>
                <input
                  type="range"
                  min={0.5}
                  max={1.5}
                  step={0.01}
                  value={brightness}
                  onChange={(e) => setBrightness(parseFloat(e.target.value))}
                  className="flex-1 accent-[var(--jm-info-fg)]"
                  disabled={busy}
                  aria-label="밝기"
                />
                <span className="text-jm-xs tabular-nums w-12 text-right text-[var(--jm-text)]">
                  {Math.round(brightness * 100)}%
                </span>
              </div>

              <div
                className={
                  onRemoveBackground ? "grid grid-cols-2 gap-2" : "grid grid-cols-1 gap-2"
                }
              >
                {onRemoveBackground && (
                  <JmButton
                    variant="outline"
                    size="sm"
                    onClick={handleApplyBgRemoval}
                    disabled={busy || !croppedAreaPixels}
                  >
                    {bgProcessing ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Sparkles />
                    )}
                    <span>AI 배경 제거</span>
                  </JmButton>
                )}
                <JmButton
                  variant="outline"
                  size="sm"
                  onClick={handleEnterEraser}
                  disabled={busy || !croppedAreaPixels}
                >
                  <Eraser />
                  <span>지우개로 다듬기</span>
                </JmButton>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--jm-border)] bg-[var(--jm-surface-muted)]/50">
          <JmButton variant="ghost" onClick={onCancel} disabled={busy}>
            취소
          </JmButton>
          <JmButton
            variant="cta"
            onClick={handleConfirm}
            disabled={busy || (!isPreview && !croppedAreaPixels)}
          >
            {uploading && <Loader2 className="size-4 animate-spin" />}
            <span>{uploading ? "업로드 중..." : "완료"}</span>
          </JmButton>
        </div>
      </JmDialogContent>
    </JmDialog>
  );
}

function drawErase(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  size: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = size;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.restore();
}

async function getCroppedBlob(
  imageSrc: string,
  pixelCrop: Area,
  rotation: number,
  brightness: number,
  outputType: "image/jpeg" | "image/png",
  outputWidth: number,
  outputHeight: number,
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const rotRad = (rotation * Math.PI) / 180;

  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(
    image.width,
    image.height,
    rotation,
  );

  const rotated = document.createElement("canvas");
  rotated.width = bBoxWidth;
  rotated.height = bBoxHeight;
  const rctx = rotated.getContext("2d");
  if (!rctx) throw new Error("canvas 2d 컨텍스트 생성 실패");
  rctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  rctx.rotate(rotRad);
  rctx.translate(-image.width / 2, -image.height / 2);
  rctx.filter = `brightness(${brightness})`;
  rctx.drawImage(image, 0, 0);

  const cropped = document.createElement("canvas");
  cropped.width = outputWidth;
  cropped.height = outputHeight;
  const cctx = cropped.getContext("2d");
  if (!cctx) throw new Error("canvas 2d 컨텍스트 생성 실패");
  if (outputType === "image/jpeg") {
    cctx.fillStyle = "#ffffff";
    cctx.fillRect(0, 0, outputWidth, outputHeight);
  }
  cctx.drawImage(
    rotated,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputWidth,
    outputHeight,
  );

  return await new Promise<Blob>((resolve, reject) => {
    cropped.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob 실패"))),
      outputType,
      outputType === "image/jpeg" ? 0.95 : undefined,
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function rotateSize(width: number, height: number, rotation: number) {
  const rotRad = (rotation * Math.PI) / 180;
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}
