"use client";

import { extractYoutubeId } from "@/lib/utils";

export function YoutubeEmbed({ url, title }: { url: string; title?: string }) {
  const id = extractYoutubeId(url);
  if (!id) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
        유효하지 않은 YouTube URL
      </div>
    );
  }
  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
      <iframe
        className="h-full w-full"
        src={`https://www.youtube.com/embed/${id}`}
        title={title ?? "YouTube video"}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}
