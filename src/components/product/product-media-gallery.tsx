"use client";

import { useState } from "react";
import { extractYoutubeId } from "@/lib/utils";
import { ProductSection } from "./product-section";
import type { ProductCardVariant, ProductMediaItem } from "./types";

interface ProductMediaGalleryProps {
  imageUrl?: string | null;
  media?: ProductMediaItem[];
  variant?: ProductCardVariant;
  productName?: string;
  /** Section 카드 래핑 없이 갤러리만 렌더링 */
  bare?: boolean;
}

export function ProductMediaGallery({
  imageUrl,
  media = [],
  variant = "admin",
  productName,
  bare = false,
}: ProductMediaGalleryProps) {
  const images = media.filter((m) => m.type === "IMAGE");
  const videos = media.filter((m) => m.type === "YOUTUBE");

  // imageUrl 이 갤러리 첫번째 이미지와 중복일 때 한 번만 보여줌
  const allImages = (() => {
    if (!imageUrl) return images.map((m) => m.url);
    const urls = images.map((m) => m.url);
    if (urls.includes(imageUrl)) return urls;
    return [imageUrl, ...urls];
  })();

  const [active, setActive] = useState(0);

  const hasMedia = allImages.length > 0 || videos.length > 0;

  const compact = variant === "compact";

  const body = !hasMedia ? (
    <p className="text-sm text-muted-foreground">등록된 이미지·영상이 없습니다</p>
  ) : (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      {allImages.length > 0 && (
        <div className="space-y-2">
          <div
            className={`overflow-hidden rounded-lg bg-muted border border-border ${
              compact ? "aspect-square max-w-[280px]" : "aspect-[4/3] w-full max-w-2xl"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={allImages[active] ?? allImages[0]}
              alt={productName ?? "product"}
              className="h-full w-full object-cover"
            />
          </div>
          {allImages.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {allImages.map((url, i) => (
                <button
                  key={url + i}
                  type="button"
                  onClick={() => setActive(i)}
                  className={`h-12 w-12 overflow-hidden rounded-md border ${
                    i === active ? "border-primary" : "border-border"
                  }`}
                  aria-label={`이미지 ${i + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {videos.length > 0 && !compact && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">영상</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {videos.map((v) => {
              const id = extractYoutubeId(v.url);
              if (!id) return null;
              return (
                <div
                  key={v.id}
                  className="aspect-video overflow-hidden rounded-md bg-muted border border-border"
                >
                  <iframe
                    title={v.title ?? "youtube"}
                    src={`https://www.youtube.com/embed/${id}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="h-full w-full"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  if (bare) return body;
  return <ProductSection title="이미지 · 영상">{body}</ProductSection>;
}
