"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { Eraser, Loader2, RotateCcw, RotateCw, Sparkles, Sun, Undo2, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const OUTPUT_SIZE = 1024;

const CHECKER_BG: React.CSSProperties = {
  backgroundColor: "#fafafa",
  backgroundImage:
    "linear-gradient(45deg, #d4d4d8 25%, transparent 25%), linear-gradient(-45deg, #d4d4d8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d4d4d8 75%), linear-gradient(-45deg, transparent 75%, #d4d4d8 75%)",
  backgroundSize: "20px 20px",
  backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0",
};

interface Props {
  open: boolean;
  file: File | null;
  onConfirm: (edited: Blob, originalName: string) => void;
  onCancel: () => void;
}

type PreviewSource = "bg-removal" | "manual";

export function ImageEditDialog({ open, file, onConfirm, onCancel }: Props) {
  // Phase 1 (cropper) state
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [brightness, setBrightness] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

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
    setPreviewUrl(null);
    setCroppedAreaPixels(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // previewUrl 메모리 정리
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  // 미리보기 이미지를 캔버스에 다시 렌더 (지우기 초기화 / 진입 시)
  const renderPreviewToCanvas = useCallback(async () => {
    if (!canvasRef.current || !previewUrl) return;
    const img = await loadImage(previewUrl);
    const canvas = canvasRef.current;
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
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
    if (!imageSrc || !croppedAreaPixels || busy) return;
    setBgProcessing(true);
    try {
      const cropped = await getCroppedBlob(
        imageSrc,
        croppedAreaPixels,
        rotation,
        brightness,
        "image/png",
      );
      const { removeBackground } = await import("@imgly/background-removal");
      const removed = await removeBackground(cropped);
      setPreviewSource("bg-removal");
      setPreviewUrl(URL.createObjectURL(removed));
    } catch (e) {
      console.error(e);
      toast.error("배경 제거에 실패했습니다");
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
      );
      setPreviewSource("manual");
      setPreviewUrl(URL.createObjectURL(cropped));
    } catch (e) {
      console.error(e);
      toast.error("이미지 처리에 실패했습니다");
    }
  };

  const handleRevertPreview = () => {
    setPreviewUrl(null);
  };

  // ── 지우개 드로잉 ─────────────────────────────────
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
    // 되돌리기 스택에 현재 상태 저장
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

    // 미리보기/지우개 단계에서 확정 → 캔버스 결과를 PNG로 출력
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
        toast.error("이미지 처리에 실패했습니다");
      } finally {
        setUploading(false);
      }
      return;
    }

    // 단순 크롭만 적용해 확정
    if (!imageSrc || !croppedAreaPixels) return;
    setUploading(true);
    try {
      const blob = await getCroppedBlob(
        imageSrc,
        croppedAreaPixels,
        rotation,
        brightness,
        "image/jpeg",
      );
      onConfirm(blob, file.name);
    } catch (e) {
      console.error(e);
      toast.error("이미지 처리에 실패했습니다");
    } finally {
      setUploading(false);
    }
  };

  const fileLabel = file ? file.name : "";

  // 표시용 브러시 지름(CSS px) — 캔버스 표시 크기에 비례
  const liveCanvas = canvasRef.current;
  const brushDiamCss = liveCanvas
    ? brushSize * (liveCanvas.getBoundingClientRect().width / liveCanvas.width || 0)
    : brushSize;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onCancel(); }}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden sm:max-w-2xl" showCloseButton={false}>
        <DialogTitle className="px-4 py-3 border-b border-border truncate">
          {fileLabel ? `이미지 편집 — ${fileLabel}` : "이미지 편집"}
        </DialogTitle>

        <div className="relative aspect-square w-full bg-black select-none">
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
                  className="pointer-events-none absolute rounded-full border-2 border-primary/80 bg-primary/10"
                  style={{
                    left: hoverPos.x - brushDiamCss / 2,
                    top: hoverPos.y - brushDiamCss / 2,
                    width: brushDiamCss,
                    height: brushDiamCss,
                  }}
                />
              )}
              {previewSource === "bg-removal" && (
                <div className="absolute top-2 right-2 rounded-md bg-primary/90 px-2 py-1 text-[11px] text-primary-foreground">
                  <Sparkles className="inline h-3 w-3 mr-1" />
                  배경 제거 적용됨
                </div>
              )}
              <div className="absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-1 text-[11px] text-white">
                <Eraser className="inline h-3 w-3 mr-1" />
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
                aspect={1}
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
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-sm">배경 분석 중...</p>
                <p className="text-[11px] text-white/70">첫 회는 모델 다운로드로 ~10초 소요</p>
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 space-y-3 border-t border-border">
          {isPreview ? (
            <>
              <div className="flex items-center gap-3">
                <Eraser className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground w-10">굵기</span>
                <input
                  type="range"
                  min={10}
                  max={200}
                  step={1}
                  value={brushSize}
                  onChange={(e) => setBrushSize(parseInt(e.target.value))}
                  className="flex-1 accent-primary"
                  disabled={busy}
                  aria-label="지우개 굵기"
                />
                <span className="text-xs tabular-nums w-12 text-right">{brushSize}px</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUndo}
                  disabled={busy || !canUndo}
                >
                  <Undo2 className="h-4 w-4 mr-1" /> 되돌리기
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetErase}
                  disabled={busy}
                >
                  <RotateCcw className="h-4 w-4 mr-1" /> 지우기 초기화
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRevertPreview}
                  disabled={busy}
                >
                  처음부터 다시
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  disabled={busy}
                >
                  <RotateCw className="h-4 w-4 mr-1" /> 90° 회전
                </Button>
                <ZoomIn className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground w-10">확대</span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="flex-1 accent-primary"
                  disabled={busy}
                  aria-label="확대/축소"
                />
                <span className="text-xs tabular-nums w-12 text-right">{zoom.toFixed(2)}x</span>
              </div>

              <div className="flex items-center gap-3">
                <Sun className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground w-10">밝기</span>
                <input
                  type="range"
                  min={0.5}
                  max={1.5}
                  step={0.01}
                  value={brightness}
                  onChange={(e) => setBrightness(parseFloat(e.target.value))}
                  className="flex-1 accent-primary"
                  disabled={busy}
                  aria-label="밝기"
                />
                <span className="text-xs tabular-nums w-12 text-right">{Math.round(brightness * 100)}%</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleApplyBgRemoval}
                  disabled={busy || !croppedAreaPixels}
                >
                  {bgProcessing ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-1" />
                  )}
                  AI 배경 제거
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEnterEraser}
                  disabled={busy || !croppedAreaPixels}
                >
                  <Eraser className="h-4 w-4 mr-1" />
                  지우개로 다듬기
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-muted/50">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            취소
          </Button>
          <Button onClick={handleConfirm} disabled={busy || (!isPreview && !croppedAreaPixels)}>
            {uploading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {uploading ? "업로드 중..." : "완료"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const rotRad = (rotation * Math.PI) / 180;

  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(image.width, image.height, rotation);

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
  cropped.width = OUTPUT_SIZE;
  cropped.height = OUTPUT_SIZE;
  const cctx = cropped.getContext("2d");
  if (!cctx) throw new Error("canvas 2d 컨텍스트 생성 실패");
  cctx.drawImage(
    rotated,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
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
