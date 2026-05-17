import { Info, AlertTriangle, OctagonAlert, FileText } from "lucide-react";
import { type ManualBlock, toEmbedUrl } from "@/lib/manual-blocks";

// 매뉴얼 블록 배열 → 읽기 전용 렌더링. jm 토큰 기반 — JmScope 안에서 사용.
// 손님 시리얼 페이지 사용법 + 상품 에디터 미리보기 공용.
export function ManualRenderer({ blocks }: { blocks: ManualBlock[] }) {
  if (blocks.length === 0) {
    return (
      <p className="text-jm-sm text-[var(--jm-text-muted)]">
        등록된 사용법이 없습니다.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {blocks.map((b) => (
        <ManualBlockView key={b.id} block={b} />
      ))}
    </div>
  );
}

const CALLOUT_STYLE = {
  info: {
    icon: Info,
    cls: "border-[var(--jm-accent-solid)] bg-[var(--jm-accent-bg)]",
  },
  warning: {
    icon: AlertTriangle,
    cls: "border-[var(--jm-warning-solid)] bg-[var(--jm-warning-bg)]",
  },
  danger: {
    icon: OctagonAlert,
    cls: "border-[var(--jm-danger-solid)] bg-[var(--jm-danger-bg)]",
  },
} as const;

function ManualBlockView({ block }: { block: ManualBlock }) {
  switch (block.type) {
    case "heading":
      return block.level === 2 ? (
        <h2 className="text-jm-lg font-bold text-[var(--jm-text)]">{block.text}</h2>
      ) : (
        <h3 className="text-jm-base font-semibold text-[var(--jm-text)]">
          {block.text}
        </h3>
      );

    case "paragraph":
      return (
        <p className="whitespace-pre-wrap text-jm-sm leading-relaxed text-[var(--jm-text)]">
          {block.text}
        </p>
      );

    case "image":
      return (
        <figure className="flex flex-col gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={block.url}
            alt={block.caption ?? ""}
            className="w-full rounded-[var(--jm-radius-md)] object-cover"
          />
          {block.caption && (
            <figcaption className="text-jm-xs text-[var(--jm-text-muted)]">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );

    case "gallery":
      return (
        <div className="grid grid-cols-2 gap-2">
          {block.items.map((it, i) => (
            <figure key={i} className="flex flex-col gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={it.url}
                alt={it.caption ?? ""}
                className="aspect-square w-full rounded-[var(--jm-radius-md)] object-cover"
              />
              {it.caption && (
                <figcaption className="text-jm-xs text-[var(--jm-text-muted)]">
                  {it.caption}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      );

    case "video":
      return (
        <div className="aspect-video w-full overflow-hidden rounded-[var(--jm-radius-md)] bg-black">
          {block.provider === "self" ? (
            <video src={block.url} controls className="h-full w-full" />
          ) : (
            <iframe
              src={toEmbedUrl(block.provider, block.url)}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}
        </div>
      );

    case "steps":
      return (
        <ol className="flex flex-col gap-3">
          {block.items.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--jm-accent-bg)] text-jm-sm font-bold text-[var(--jm-accent-fg)]">
                {i + 1}
              </span>
              <div className="flex flex-col gap-1.5 pt-0.5">
                {s.title && (
                  <span className="text-jm-sm font-semibold text-[var(--jm-text)]">
                    {s.title}
                  </span>
                )}
                {s.body && (
                  <span className="whitespace-pre-wrap text-jm-sm text-[var(--jm-text-muted)]">
                    {s.body}
                  </span>
                )}
                {s.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.imageUrl}
                    alt=""
                    className="mt-1 w-full rounded-[var(--jm-radius-md)] object-cover"
                  />
                )}
              </div>
            </li>
          ))}
        </ol>
      );

    case "spec":
      return (
        <div className="overflow-hidden rounded-[var(--jm-radius-md)] border border-[var(--jm-border)]">
          {block.rows.map((r, i) => (
            <div
              key={i}
              className="flex border-b border-[var(--jm-border)] last:border-b-0"
            >
              <div className="w-1/3 shrink-0 bg-[var(--jm-surface-muted)] px-3 py-2 text-jm-xs font-medium text-[var(--jm-text-muted)]">
                {r.label}
              </div>
              <div className="px-3 py-2 text-jm-sm text-[var(--jm-text)]">
                {r.value}
              </div>
            </div>
          ))}
        </div>
      );

    case "callout": {
      const style = CALLOUT_STYLE[block.variant];
      const Icon = style.icon;
      return (
        <div
          className={`flex gap-2.5 rounded-[var(--jm-radius-md)] border-l-[3px] p-3 ${style.cls}`}
        >
          <Icon className="size-4 shrink-0 text-[var(--jm-text)]" />
          <div className="flex flex-col gap-1">
            {block.title && (
              <span className="text-jm-sm font-semibold text-[var(--jm-text)]">
                {block.title}
              </span>
            )}
            <span className="whitespace-pre-wrap text-jm-sm text-[var(--jm-text)]">
              {block.body}
            </span>
          </div>
        </div>
      );
    }

    case "faq":
      return (
        <div className="flex flex-col gap-2">
          {block.items.map((f, i) => (
            <details
              key={i}
              className="rounded-[var(--jm-radius-md)] border border-[var(--jm-border)] p-3"
            >
              <summary className="cursor-pointer text-jm-sm font-medium text-[var(--jm-text)]">
                {f.q}
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-jm-sm text-[var(--jm-text-muted)]">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      );

    case "pdf":
      return (
        <a
          href={block.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 rounded-[var(--jm-radius-md)] border border-[var(--jm-border)] p-3 transition-colors hover:bg-[var(--jm-surface-muted)]"
        >
          <FileText className="size-5 shrink-0 text-[var(--jm-accent-solid)]" />
          <span className="text-jm-sm font-medium text-[var(--jm-text)]">
            {block.label}
          </span>
          <span className="ml-auto text-jm-xs text-[var(--jm-text-muted)]">
            PDF 열기
          </span>
        </a>
      );
  }
}
