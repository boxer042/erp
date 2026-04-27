"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

export function CustomerSearchInput({ initial }: { initial: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            const q = value.trim();
            router.push(q ? `/pos/customers?q=${encodeURIComponent(q)}` : "/pos/customers");
          }
        }}
        placeholder="이름·전화·사업자번호"
        className="h-11 w-[280px] rounded-lg border border-border bg-background pl-10 pr-3 text-sm outline-none focus:border-primary"
      />
    </div>
  );
}
