import { JmCard, JmCardContent } from "@/jm";

interface ProductSectionProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** 우측 액션 (편집·추가 버튼 등) */
  actions?: React.ReactNode;
  /** 카드 본문에 padding 없이 (테이블 등 가장자리까지 채우는 경우) */
  noPadding?: boolean;
  /** Card content 추가 className */
  bodyClassName?: string;
  children: React.ReactNode;
}

/**
 * 상품 상세 등에서 사용하는 섹션 wrapper.
 *
 * /products/new 와 일관된 패턴 — 타이틀은 카드 밖에 작은 h4 로,
 * 카드는 콘텐츠만 담는다.
 */
export function ProductSection({
  title,
  description,
  actions,
  noPadding,
  bodyClassName,
  children,
}: ProductSectionProps) {
  return (
    <section>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 space-y-0.5">
          <h4 className="text-jm-xs font-semibold text-[var(--jm-text)]">{title}</h4>
          {description && (
            <p className="text-jm-2xs text-[var(--jm-text-muted)] leading-snug">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
      </div>
      <JmCard>
        <JmCardContent className={`${noPadding ? "!p-0" : ""} ${bodyClassName ?? ""}`}>
          {children}
        </JmCardContent>
      </JmCard>
    </section>
  );
}
