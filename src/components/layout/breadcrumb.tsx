"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

const routeLabels: Record<string, string> = {
  "": "대시보드",
  "products": "판매 상품",
  "mapping": "상품 매핑",
  "sets": "세트 상품",
  "suppliers": "거래처",
  "inventory": "재고 관리",
  "incoming": "입고 관리",
  "orders": "주문 관리",
  "channels": "판매 채널",
  "reports": "리포트",
  "margin": "마진 리포트",
  "settings": "설정",
};

export function DashboardBreadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-[13px]">
        <span className="text-foreground">대시보드</span>
      </div>
    );
  }

  const crumbs: { label: string; href: string }[] = [];
  let currentPath = "";

  for (const segment of segments) {
    currentPath += `/${segment}`;
    // UUID 세그먼트는 "상세"로 표시
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(segment);
    const label = isUuid ? "상세" : (routeLabels[segment] || segment);
    crumbs.push({ label, href: currentPath });
  }

  return (
    <div className="flex items-center gap-1.5 text-[13px]">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={crumb.href} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
            {isLast ? (
              <span className="text-foreground">{crumb.label}</span>
            ) : (
              <Link href={crumb.href} className="text-muted-foreground hover:text-foreground transition-colors">
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </div>
  );
}
