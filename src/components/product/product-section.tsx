import { Card, CardContent } from "@/components/ui/card";

interface ProductSectionProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** 우측 액션 (편집·추가 버튼 등) */
  actions?: React.ReactNode;
  /** 카드 본문에 padding 없이 (테이블 등 가장자리까지 채우는 경우) */
  noPadding?: boolean;
  /** 카드 size */
  size?: "default" | "sm";
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
  size = "sm",
  bodyClassName,
  children,
}: ProductSectionProps) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <h4 className="text-[12px] font-semibold text-foreground">{title}</h4>
        {description && (
          <span className="text-[11px] text-muted-foreground truncate">
            {description}
          </span>
        )}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
      <Card size={size}>
        <CardContent className={`${noPadding ? "!p-0" : ""} ${bodyClassName ?? ""}`}>
          {children}
        </CardContent>
      </Card>
    </section>
  );
}
