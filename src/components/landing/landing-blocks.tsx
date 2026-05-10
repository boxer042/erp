import { JmScope } from "@/jm";
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
  CalloutBlockView,
  InfoGridBlockView,
  ProductHeroBlockView,
  ProductInfoBlockView,
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
  const color =
    block.textColor === "dark" ? "text-[var(--jm-text)]" : "text-white";
  const overlay =
    block.textColor === "light" && block.imageUrl ? "bg-black/35" : "";

  return (
    <JmScope theme="light" className="w-full">
      <section
        className={cn(
          "relative w-full overflow-hidden",
          HERO_HEIGHT[block.height],
        )}
      >
        {block.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={block.imageUrl}
            alt={block.headline || ""}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-[var(--jm-surface-muted)]" />
        )}
        {overlay && <div className={cn("absolute inset-0", overlay)} />}
        <div
          className={cn(
            "relative z-10 flex h-full w-full flex-col justify-center gap-4 px-6 md:px-16",
            align,
            color,
          )}
        >
          {block.eyebrow && (
            <div className="inline-flex w-fit items-center rounded-full bg-white/15 px-3 py-1 text-jm-xs font-semibold uppercase tracking-[0.18em] backdrop-blur-sm">
              {block.eyebrow}
            </div>
          )}
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

const IMG_MAXW: Record<NonNullable<ImageBlock["maxWidth"]>, string> = {
  full: "",
  lg: "max-w-[960px]",
  md: "max-w-3xl",
  sm: "max-w-xl",
};
const IMG_ROUNDED: Record<NonNullable<ImageBlock["rounded"]>, string> = {
  none: "rounded-none",
  sm: "rounded-md",
  md: "rounded-xl",
  lg: "rounded-2xl",
  xl: "rounded-3xl",
  full: "rounded-full",
};
const IMG_SHADOW: Record<NonNullable<ImageBlock["shadow"]>, string> = {
  none: "",
  sm: "shadow-[var(--jm-shadow-sm)]",
  md: "shadow-[var(--jm-shadow-md)]",
  lg: "shadow-[var(--jm-shadow-lg)]",
};
const IMG_PADDING: Record<NonNullable<ImageBlock["paddingY"]>, string> = {
  none: "",
  sm: "py-4 md:py-6",
  md: "py-8 md:py-12",
  lg: "py-12 md:py-20",
};
const IMG_BG: Record<NonNullable<ImageBlock["background"]>, string> = {
  none: "",
  muted: "bg-[var(--jm-surface-muted)]",
  dark: "bg-[var(--jm-text)]",
};

export function ImageBlockView({ block }: { block: ImageBlock }) {
  // 구버전 데이터 호환: maxWidth 가 'full' (default) 인데 fullWidth=false 면 md 로
  const effMaxWidth =
    block.maxWidth ?? (block.fullWidth === false ? "md" : "full");
  const isNarrow = effMaxWidth !== "full";

  if (!block.imageUrl) {
    return (
      <JmScope theme="light" className="w-full">
        <section
          className={cn(
            "w-full px-6 md:px-16",
            IMG_PADDING[block.paddingY ?? "none"],
            IMG_BG[block.background ?? "none"],
          )}
        >
          <div
            className={cn(
              "mx-auto flex h-48 items-center justify-center rounded-2xl bg-[var(--jm-surface-muted)] text-jm-sm text-[var(--jm-text-muted)]",
              isNarrow && IMG_MAXW[effMaxWidth],
            )}
          >
            이미지를 업로드하세요
          </div>
        </section>
      </JmScope>
    );
  }

  return (
    <JmScope theme="light" className="w-full">
      <section
        className={cn(
          "w-full px-6 md:px-16",
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
                "mt-3 px-4 text-center text-jm-sm",
                block.background === "dark"
                  ? "text-white/80"
                  : "text-[var(--jm-text-muted)]",
              )}
            >
              {block.caption}
            </figcaption>
          )}
        </figure>
      </section>
    </JmScope>
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
  lg: "text-3xl md:text-4xl lg:text-5xl",
  xl: "text-4xl md:text-5xl lg:text-6xl",
};

const HEADING_WEIGHT: Record<NonNullable<TextBlock["headingWeight"]>, string> = {
  normal: "font-normal",
  semibold: "font-semibold",
  bold: "font-bold",
};

const BODY_SIZE: Record<NonNullable<TextBlock["bodySize"]>, string> = {
  sm: "text-jm-sm md:text-jm-base",
  md: "text-jm-base md:text-jm-md",
  lg: "text-jm-md md:text-jm-lg",
};

const TEXT_BG: Record<NonNullable<TextBlock["background"]>, string> = {
  none: "",
  muted: "bg-[var(--jm-surface-muted)]",
  dark: "bg-[var(--jm-text)]",
};

export function TextBlockView({ block }: { block: TextBlock }) {
  const align =
    block.align === "center"
      ? "text-center"
      : block.align === "right"
        ? "text-right"
        : "text-left";

  // color 별로 헤딩/본문/라벨 색 결정
  const isDarkBg = block.background === "dark";
  const headingColor =
    block.color === "muted"
      ? "text-[var(--jm-text-muted)]"
      : block.color === "brand"
        ? "text-[var(--jm-action)]"
        : isDarkBg
          ? "text-white"
          : "text-[var(--jm-text)]";
  const bodyColor =
    block.color === "brand"
      ? "text-[var(--jm-action)]/80"
      : isDarkBg
        ? "text-white/80"
        : "text-[var(--jm-text-muted)]";
  const eyebrowColor = isDarkBg
    ? "text-white/70"
    : "text-[var(--jm-text-muted)]";
  const eyebrowBg = isDarkBg
    ? "bg-white/15"
    : "bg-[var(--jm-surface-muted)]";

  return (
    <JmScope theme="light" className="w-full">
      <section
        className={cn(
          "w-full px-6 md:px-16",
          TEXT_PADDING[block.paddingY ?? "lg"],
          TEXT_BG[block.background ?? "none"],
        )}
      >
        <div
          className={cn(
            "mx-auto max-w-3xl space-y-5",
            align,
            block.align === "center" && "flex flex-col items-center",
            block.align === "right" && "flex flex-col items-end",
          )}
        >
          {block.eyebrow && (
            <div
              className={cn(
                "inline-flex w-fit items-center rounded-full px-3 py-1 text-jm-xs font-semibold uppercase tracking-[0.18em]",
                eyebrowBg,
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
    </JmScope>
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
      <JmScope theme="light" className="w-full">
        <section className="w-full px-6 md:px-16">
          <div className="mx-auto flex h-72 w-full max-w-4xl items-center justify-center rounded-2xl bg-[var(--jm-surface-muted)] text-jm-sm text-[var(--jm-text-muted)]">
            비디오 URL을 입력하세요
          </div>
        </section>
      </JmScope>
    );
  }

  return (
    <JmScope theme="light" className="w-full">
      <section className="w-full px-6 md:px-16">
        <figure className="mx-auto w-full max-w-4xl">
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-[var(--jm-shadow-md)]">
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
            <figcaption className="mt-3 text-center text-jm-sm text-[var(--jm-text-muted)]">
              {block.caption}
            </figcaption>
          )}
        </figure>
      </section>
    </JmScope>
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
  sm: "rounded-md",
  md: "rounded-xl",
  lg: "rounded-2xl",
  xl: "rounded-3xl",
  full: "rounded-full",
};

const GALLERY_SHADOW: Record<NonNullable<GalleryBlock["shadow"]>, string> = {
  none: "",
  sm: "shadow-[var(--jm-shadow-sm)]",
  md: "shadow-[var(--jm-shadow-md)]",
  lg: "shadow-[var(--jm-shadow-lg)]",
};

export function GalleryBlockView({ block }: { block: GalleryBlock }) {
  const items = block.images.filter((img) => img.url);
  if (items.length === 0) {
    return (
      <JmScope theme="light" className="w-full">
        <section className="w-full px-6 md:px-16">
          <div className="mx-auto flex h-40 w-full max-w-4xl items-center justify-center rounded-2xl bg-[var(--jm-surface-muted)] text-jm-sm text-[var(--jm-text-muted)]">
            이미지를 추가하세요
          </div>
        </section>
      </JmScope>
    );
  }
  const cols =
    block.columns === 2
      ? "grid-cols-2"
      : block.columns === 4
        ? "grid-cols-2 md:grid-cols-4"
        : "grid-cols-2 md:grid-cols-3";

  return (
    <JmScope theme="light" className="w-full">
      <section className="w-full px-6 py-8 md:px-16 md:py-10">
        <div className={cn("grid", cols, GALLERY_GAP[block.gap ?? "sm"])}>
          {items.map((img, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={img.url}
              alt={img.alt}
              className={cn(
                "aspect-square w-full bg-[var(--jm-surface-muted)] object-cover",
                GALLERY_ROUNDED[block.rounded ?? "md"],
                GALLERY_SHADOW[block.shadow ?? "none"],
              )}
            />
          ))}
        </div>
      </section>
    </JmScope>
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
    case "callout":
      return <CalloutBlockView block={block} />;
    case "info-grid":
      return <InfoGridBlockView block={block} />;
    case "product-hero":
      return <ProductHeroBlockView block={block} productId={productId} />;
    case "product-info":
      return <ProductInfoBlockView block={block} productId={productId} />;
    case "html-embed":
      return <HtmlEmbedBlockView block={block} />;
  }
}
