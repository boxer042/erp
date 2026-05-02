"use client";

import { useCallback, useEffect, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { Loader2, RotateCw, Sparkles, Sun, Undo2, ZoomIn } from "lucide-react";
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

export function ImageEditDialog({ open, file, onConfirm, onCancel }: Props) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [brightness, setBrightness] = useState(1);
  const [bgPreviewBlob, setBgPreviewBlob] = useState<Blob | null>(null);
  const [bgPreviewUrl, setBgPreviewUrl] = useState<string | null>(null);
  const [bgProcessing, setBgProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const isPreview = bgPreviewUrl !== null;
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
    setBgPreviewBlob(null);
    setBgPreviewUrl(null);
    setCroppedAreaPixels(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // bgPreviewUrl 메모리 정리: 값이 바뀔 때 이전 URL revoke
  useEffect(() => {
    return () => {
      if (bgPreviewUrl) URL.revokeObjectURL(bgPreviewUrl);
    };
  }, [bgPreviewUrl]);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

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
      setBgPreviewBlob(removed);
      setBgPreviewUrl(URL.createObjectURL(removed));
    } catch (e) {
      console.error(e);
      toast.error("배경 제거에 실패했습니다");
    } finally {
      setBgProcessing(false);
    }
  };

  const handleRevertBg = () => {
    setBgPreviewBlob(null);
    setBgPreviewUrl(null);
  };

  const handleConfirm = async () => {
    if (!file || busy) return;

    // 미리보기에서 결과 확정 시: 이미 처리된 blob을 그대로 업로드
    if (bgPreviewBlob) {
      setUploading(true);
      try {
        onConfirm(bgPreviewBlob, file.name);
      } finally {
        setUploading(false);
      }
      return;
    }

    // 일반 편집(배경 제거 미적용)
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

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onCancel(); }}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden sm:max-w-2xl" showCloseButton={false}>
        <DialogTitle className="px-4 py-3 border-b border-border truncate">
          {fileLabel ? `이미지 편집 — ${fileLabel}` : "이미지 편집"}
        </DialogTitle>

        <div className="relative aspect-square w-full bg-black">
          {isPreview ? (
            <div className="absolute inset-0" style={CHECKER_BG}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={bgPreviewUrl}
                alt="배경 제거 미리보기"
                className="size-full object-contain"
              />
              <div className="absolute top-2 right-2 rounded-md bg-primary/90 px-2 py-1 text-[11px] text-primary-foreground">
                <Sparkles className="inline h-3 w-3 mr-1" />
                배경 제거 적용됨
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
            <Button
              variant="outline"
              size="sm"
              onClick={handleRevertBg}
              disabled={busy}
              className="w-full"
            >
              <Undo2 className="h-4 w-4 mr-1" />
              다시 편집 (원본으로 돌아가기)
            </Button>
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

              <Button
                variant="outline"
                size="sm"
                onClick={handleApplyBgRemoval}
                disabled={busy || !croppedAreaPixels}
                className="w-full"
              >
                {bgProcessing ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1" />
                )}
                {bgProcessing ? "분석 중..." : "AI 배경 제거 미리보기"}
              </Button>
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
