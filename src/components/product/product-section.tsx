import { JmCard } from "@/jm";

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
 * 대시보드 테이블 카드와 통일된 패턴 — 타이틀을 카드 안 상단 헤더에 두고
 * 구분선(border-b) 아래로 콘텐츠가 이어진다.
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
      <JmCard className="overflow-hidden p-0">
        <div className="flex items-start justify-between gap-2 border-b border-[var(--jm-border)] px-4 py-3">
          <div className="min-w-0 space-y-0.5">
            <h3 className="text-jm-sm font-semibold text-[var(--jm-text)]">
              {title}
            </h3>
            {description && (
              <p className="text-jm-2xs text-[var(--jm-text-muted)] leading-snug">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </div>
        <div className={`${noPadding ? "" : "p-4"} ${bodyClassName ?? ""}`}>
          {children}
        </div>
      </JmCard>
    </section>
  );
}
