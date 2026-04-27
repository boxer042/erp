"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/pos", label: "홈" },
  { href: "/pos/sales", label: "판매" },
  { href: "/pos/repair", label: "수리" },
  { href: "/pos/rental", label: "임대" },
  { href: "/pos/customers", label: "고객" },
  { href: "/pos/reports/daily", label: "정산" },
];

export function PosNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === "/pos"
            ? pathname === "/pos"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-brand-muted text-primary/80"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
