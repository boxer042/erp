import { cn } from "@/lib/utils";
import type {
  HeroBlock,
  ImageBlock,
  TextBlock,
  VideoBlock,
  GalleryBlock,
  LandingBlock,
} from "@/lib/validators/landing-block";
import {
  ScrollyHeroBlockView,
  StickyFeatureBlockView,
  ParallaxBlockView,
} from "./motion-blocks";
import {
  SpecTableBlockView,
  AmbientVideoBlockView,
  TableBlockView,
  ChartBlockView,
} from "./data-blocks";

const HERO_HEIGHT: Record<HeroBlock["height"], string> = {
  sm: "h-[280px] md:h-[360px]",
  md: "h-[420px] md:h-[540px]",
  lg: "h-[560px] md:h-[720px]",
  screen: "h-[100svh]",
};

export function HeroBlockView({ block }: { block: HeroBlock }) {
  const align =
    block.textAlign === "left"
      ? "items-start text-left"
      : block.textAlign === "right"
        ? "items-end text-right"
        : "items-center text-center";
  const color = block.textColor === "dark" ? "text-foreground" : "text-white";
  const overlay = block.textColor === "light" && block.imageUrl ? "bg-black/35" : "";

  return (
    <section className={cn("relative w-full overflow-hidden", HERO_HEIGHT[block.height])}>
      {block.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={block.imageUrl}
          alt={block.headline || ""}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-muted" />
      )}
      {overlay && <div className={cn("absolute inset-0", overlay)} />}
      <div
        className={cn(
          "relative z-10 flex h-full w-full flex-col justify-center gap-3 px-6 md:px-16",
          align,
          color,
        )}
      >
        {block.headline && (
          <h2 className="text-3xl font-semibold leading-tight md:text-5xl">{block.headline}</h2>
        )}
        {block.subheadline && (
          <p className="max-w-2xl text-base opacity-90 md:text-lg">{block.subheadline}</p>
        )}
      </div>
    </section>
  );
}

export function ImageBlockView({ block }: { block: ImageBlock }) {
  if (!block.imageUrl) {
    return (
      <div className="mx-auto flex h-48 w-full max-w-3xl items-center justify-center bg-muted text-muted-foreground">
        이미지를 업로드하세요
      </div>
    );
  }
  return (
    <figure className={cn("w-full", !block.fullWidth && "mx-auto max-w-3xl")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={block.imageUrl}
        alt={block.alt}
        className="block h-auto w-full"
      />
      {block.caption && (
        <figcaption className="mt-2 px-4 text-center text-sm text-muted-foreground">
          {block.caption}
        </figcaption>
      )}
    </figure>
  );
}

export function TextBlockView({ block }: { block: TextBlock }) {
  const align =
    block.align === "center" ? "text-center" : block.align === "right" ? "text-right" : "text-left";
  const bg = block.background === "muted" ? "bg-muted" : "";

  return (
    <section className={cn("w-full px-6 py-10 md:px-16 md:py-16", bg)}>
      <div className={cn("mx-auto max-w-3xl space-y-4", align)}>
        {block.heading && (
          <h3 className="text-2xl font-semibold md:text-3xl">{block.heading}</h3>
        )}
        {block.body && (
          <p className="whitespace-pre-wrap text-base leading-relaxed text-muted-foreground md:text-lg">
            {block.body}
          </p>
        )}
      </div>
    </section>
  );
}

function youtubeEmbedUrl(value: string, autoplay: boolean): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let videoId = trimmed;
  // URL 형태이면 ID 추출
  const ytMatch = trimmed.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{6,})/);
  if (ytMatch) videoId = ytMatch[1];
  const params = new URLSearchParams();
  if (autoplay) {
    params.set("autoplay", "1");
    params.set("mute", "1");
  }
  const qs = params.toString();
  return `https://www.youtube.com/embed/${videoId}${qs ? `?${qs}` : ""}`;
}

export function VideoBlockView({ block }: { block: VideoBlock }) {
  if (!block.value) {
    return (
      <div className="mx-auto flex h-72 w-full max-w-3xl items-center justify-center bg-muted text-muted-foreground">
        비디오 URL을 입력하세요
      </div>
    );
  }

  return (
    <figure className="mx-auto w-full max-w-4xl px-4">
      <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
        {block.source === "youtube" ? (
          <iframe
            src={youtubeEmbedUrl(block.value, block.autoplay) ?? ""}
            title="video"
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <video
            src={block.value}
            controls
            autoPlay={block.autoplay}
            muted={block.autoplay}
            loop={block.autoplay}
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </div>
      {block.caption && (
        <figcaption className="mt-2 text-center text-sm text-muted-foreground">
          {block.caption}
        </figcaption>
      )}
    </figure>
  );
}

export function GalleryBlockView({ block }: { block: GalleryBlock }) {
  const items = block.images.filter((img) => img.url);
  if (items.length === 0) {
    return (
      <div className="mx-auto flex h-40 w-full max-w-3xl items-center justify-center bg-muted text-muted-foreground">
        이미지를 추가하세요
      </div>
    );
  }
  const cols =
    block.columns === 2
      ? "grid-cols-2"
      : block.columns === 4
        ? "grid-cols-2 md:grid-cols-4"
        : "grid-cols-2 md:grid-cols-3";

  return (
    <section className="w-full px-4 py-6 md:px-8">
      <div className={cn("grid gap-2", cols)}>
        {items.map((img, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={img.url}
            alt={img.alt}
            className="aspect-square w-full rounded-md object-cover"
          />
        ))}
      </div>
    </section>
  );
}

export function BlockView({
  block,
  productId,
}: {
  block: LandingBlock;
  /** 일부 블록(spec-table 등)이 상품 데이터를 fetch 하기 위해 필요 */
  productId?: string;
}) {
  switch (block.type) {
    case "hero":
      return <HeroBlockView block={block} />;
    case "image":
      return <ImageBlockView block={block} />;
    case "text":
      return <TextBlockView block={block} />;
    case "video":
      return <VideoBlockView block={block} />;
    case "gallery":
      return <GalleryBlockView block={block} />;
    case "scrolly-hero":
      return <ScrollyHeroBlockView block={block} />;
    case "sticky-feature":
      return <StickyFeatureBlockView block={block} />;
    case "parallax":
      return <ParallaxBlockView block={block} />;
    case "spec-table":
      return <SpecTableBlockView block={block} productId={productId} />;
    case "ambient-video":
      return <AmbientVideoBlockView block={block} />;
    case "table":
      return <TableBlockView block={block} />;
    case "chart":
      return <ChartBlockView block={block} />;
  }
}
