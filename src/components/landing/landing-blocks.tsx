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
import { InlineMarkdown } from "./inline-md";
import {
  SpecTableBlockView,
  AmbientVideoBlockView,
  TableBlockView,
  ChartBlockView,
  StatsGridBlockView,
  HtmlEmbedBlockView,
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
        {block.eyebrow && (
          <div className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">
            {block.eyebrow}
          </div>
        )}
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

const IMG_MAXW: Record<NonNullable<ImageBlock["maxWidth"]>, string> = {
  full: "",
  lg: "max-w-[960px]",
  md: "max-w-3xl",
  sm: "max-w-xl",
};
const IMG_ROUNDED: Record<NonNullable<ImageBlock["rounded"]>, string> = {
  none: "rounded-none",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-2xl",
  full: "rounded-full",
};
const IMG_SHADOW: Record<NonNullable<ImageBlock["shadow"]>, string> = {
  none: "",
  sm: "shadow-sm",
  md: "shadow-md",
  lg: "shadow-xl",
};
const IMG_PADDING: Record<NonNullable<ImageBlock["paddingY"]>, string> = {
  none: "",
  sm: "py-4 md:py-6",
  md: "py-8 md:py-12",
  lg: "py-12 md:py-20",
};
const IMG_BG: Record<NonNullable<ImageBlock["background"]>, string> = {
  none: "",
  muted: "bg-muted",
  dark: "bg-foreground",
};

export function ImageBlockView({ block }: { block: ImageBlock }) {
  // 구버전 데이터 호환: maxWidth 가 'full' (default) 인데 fullWidth=false 면 md 로
  const effMaxWidth =
    block.maxWidth ?? (block.fullWidth === false ? "md" : "full");
  const isNarrow = effMaxWidth !== "full";

  if (!block.imageUrl) {
    return (
      <section
        className={cn(
          "w-full px-6 md:px-16",
          IMG_PADDING[block.paddingY ?? "none"],
          IMG_BG[block.background ?? "none"],
        )}
      >
        <div
          className={cn(
            "mx-auto flex h-48 items-center justify-center bg-muted text-muted-foreground",
            isNarrow && IMG_MAXW[effMaxWidth],
          )}
        >
          이미지를 업로드하세요
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn(
        "w-full",
        block.background !== "none" && "px-6 md:px-16",
        IMG_PADDING[block.paddingY ?? "none"],
        IMG_BG[block.background ?? "none"],
      )}
    >
      <figure
        className={cn(
          "w-full",
          isNarrow && cn("mx-auto", IMG_MAXW[effMaxWidth]),
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={block.imageUrl}
          alt={block.alt}
          className={cn(
            "block h-auto w-full",
            IMG_ROUNDED[block.rounded ?? "none"],
            IMG_SHADOW[block.shadow ?? "none"],
          )}
        />
        {block.caption && (
          <figcaption
            className={cn(
              "mt-2 px-4 text-center text-sm",
              block.background === "dark" ? "text-background/80" : "text-muted-foreground",
            )}
          >
            {block.caption}
          </figcaption>
        )}
      </figure>
    </section>
  );
}

const TEXT_PADDING: Record<NonNullable<TextBlock["paddingY"]>, string> = {
  sm: "py-4 md:py-6",
  md: "py-6 md:py-10",
  lg: "py-10 md:py-16",
  xl: "py-16 md:py-24",
};

const HEADING_SIZE: Record<NonNullable<TextBlock["headingSize"]>, string> = {
  sm: "text-lg md:text-xl",
  md: "text-2xl md:text-3xl",
  lg: "text-3xl md:text-5xl",
  xl: "text-4xl md:text-6xl",
};

const HEADING_WEIGHT: Record<NonNullable<TextBlock["headingWeight"]>, string> = {
  normal: "font-normal",
  semibold: "font-semibold",
  bold: "font-bold",
};

const BODY_SIZE: Record<NonNullable<TextBlock["bodySize"]>, string> = {
  sm: "text-sm md:text-base",
  md: "text-base md:text-lg",
  lg: "text-lg md:text-xl",
};

const TEXT_BG: Record<NonNullable<TextBlock["background"]>, string> = {
  none: "",
  muted: "bg-muted",
  dark: "bg-foreground text-background",
};

export function TextBlockView({ block }: { block: TextBlock }) {
  const align =
    block.align === "center" ? "text-center" : block.align === "right" ? "text-right" : "text-left";

  // color 별로 헤딩/본문/라벨 색 결정
  const isDarkBg = block.background === "dark";
  const headingColor =
    block.color === "muted"
      ? "text-muted-foreground"
      : block.color === "brand"
        ? "text-primary"
        : isDarkBg
          ? "text-background"
          : "text-foreground";
  const bodyColor =
    block.color === "brand"
      ? "text-primary/80"
      : isDarkBg
        ? "text-background/80"
        : "text-muted-foreground";
  const eyebrowColor =
    block.color === "brand"
      ? "text-primary"
      : isDarkBg
        ? "text-background/70"
        : "text-muted-foreground";

  return (
    <section
      className={cn(
        "w-full px-6 md:px-16",
        TEXT_PADDING[block.paddingY ?? "lg"],
        TEXT_BG[block.background ?? "none"],
      )}
    >
      <div className={cn("mx-auto max-w-3xl space-y-4", align)}>
        {block.eyebrow && (
          <div
            className={cn(
              "text-xs font-semibold uppercase tracking-[0.18em]",
              eyebrowColor,
            )}
          >
            {block.eyebrow}
          </div>
        )}
        {block.heading && (
          <h3
            className={cn(
              "leading-tight tracking-tight",
              HEADING_SIZE[block.headingSize ?? "md"],
              HEADING_WEIGHT[block.headingWeight ?? "semibold"],
              headingColor,
            )}
          >
            {block.heading}
          </h3>
        )}
        {block.body && (
          <p
            className={cn(
              "whitespace-pre-wrap leading-relaxed",
              BODY_SIZE[block.bodySize ?? "md"],
              bodyColor,
            )}
          >
            <InlineMarkdown text={block.body} />
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

const GALLERY_GAP: Record<NonNullable<GalleryBlock["gap"]>, string> = {
  none: "gap-0",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
};

const GALLERY_ROUNDED: Record<NonNullable<GalleryBlock["rounded"]>, string> = {
  none: "rounded-none",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-2xl",
  full: "rounded-full",
};

const GALLERY_SHADOW: Record<NonNullable<GalleryBlock["shadow"]>, string> = {
  none: "",
  sm: "shadow-sm",
  md: "shadow-md",
  lg: "shadow-xl",
};

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
      <div className={cn("grid", cols, GALLERY_GAP[block.gap ?? "sm"])}>
        {items.map((img, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={img.url}
            alt={img.alt}
            className={cn(
              "aspect-square w-full object-cover",
              GALLERY_ROUNDED[block.rounded ?? "md"],
              GALLERY_SHADOW[block.shadow ?? "none"],
            )}
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
    case "stats-grid":
      return <StatsGridBlockView block={block} productId={productId} />;
    case "html-embed":
      return <HtmlEmbedBlockView block={block} />;
  }
}
